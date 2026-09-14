/*
 * Cloudflare Worker: принимает JSON с любой формы сайта Lanmei и рассылает
 * заявку сразу в три канала — Telegram (Bot API), почту (EmailJS REST API)
 * и строку в Google Sheets (через Apps Script Web App).
 * Раньше письмо уходило прямо из браузера через EmailJS SDK, а сюда шёл
 * отдельный запрос только для Telegram — из-за этого блокировщик рекламы,
 * ловящий домен *.workers.dev как «трекер», мог зарубить именно Telegram,
 * а письмо через emailjs.com уходило — заявка терялась только в одном
 * канале незаметно. Теперь оба канала дергаются отсюда одним запросом:
 * либо блокировщик рубит его целиком (и тогда клиент это видит), либо
 * пропускает — и оба канала отрабатывают вместе.
 *
 * Токен бота, приватный ключ EmailJS и адрес Google-таблицы хранятся только
 * здесь, в секретах Worker'а — в браузере они не появляются.
 * Дополнительно, если в присланных данных есть поле, похожее на реальный
 * российский номер телефона, — шлёт клиенту SMS-подтверждение через SMS.ru.
 *
 * Универсальный: подходит для любой формы на сайте — просто передайте
 * в body любые поля + "formType" (название формы для заголовка сообщения)
 * и "emailTemplateId" (какой шаблон EmailJS использовать для этой формы).
 * Новые поля не нужно нигде регистрировать — Worker распечатает всё, что придёт.
 *
 * Деплой и секреты — см. FORMS_SETUP.md и SMS_SETUP.md в корне проекта.
 * Нужные секреты Worker'а: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
 * EMAILJS_PRIVATE_KEY (Account → API Keys в дашборде EmailJS), опционально
 * SMS_RU_API_ID и GOOGLE_SHEETS_WEBHOOK_URL (см. FORMS_SETUP.md).
 */

// service_id и public key EmailJS не секретны (уже были видны в браузере
// в исходниках сайта) — можно хранить прямо в коде.
const EMAILJS_SERVICE_ID = 'service_c8zqvjb';
const EMAILJS_PUBLIC_KEY = 'SQhMTxVRfRMbPODIb';

// Человекочитаемые подписи для известных полей (необязательно — незнакомые
// поля просто напечатаются под своим ключом).
const FIELD_LABELS = {
  name: 'Имя',
  phone: 'Телефон/Telegram',
  sku: 'Категория товара',
  link: 'Ссылка на товар',
  budget: 'Объём закупок',
  city: 'Город доставки',
  email: 'Email'
};

// Служебные поля запроса — не показываем в тексте Telegram-сообщения и не
// шлём в EmailJS как есть (emailTemplateId вообще не нужен в письме).
const SERVICE_FIELDS = ['formType', 'website', 'emailTemplateId'];

// Домены, которым разрешено слать запросы сюда.
const ALLOWED_ORIGINS = [
  'https://lanmei.ru',
  'https://www.lanmei.ru',
  'https://funrw1234-del.github.io',
  'http://localhost:5173'
];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function escapeMarkdown(text) {
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// Поле "phone" шлют все формы сайта, но в брифе оно называется "Телефон или
// Telegram" — там может лежать и ник. Проверяем именно его и приводим к
// формату 7XXXXXXXXXX для SMS.ru; если это не похоже на номер — возвращаем
// null, и SMS просто не отправляется (Telegram/почта работают как обычно).
function extractRuPhone(data) {
  const value = data.phone;
  if (typeof value !== 'string') return null;
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    return '7' + digits.slice(1);
  }
  if (digits.length === 10) {
    return '7' + digits;
  }
  return null;
}

// SMS-подтверждение клиенту через SMS.ru (https://sms.ru/api). Не бросает
// исключение при неудаче — SMS вторична и не должна ронять остальное.
async function sendConfirmationSms(phone, env) {
  if (!env.SMS_RU_API_ID) return { skipped: 'SMS.ru не настроен' };
  const text = 'Lanmei: заявка принята. Менеджер свяжется с вами в течение 2 часов.';
  const url = new URL('https://sms.ru/sms/send');
  url.searchParams.set('api_id', env.SMS_RU_API_ID);
  url.searchParams.set('to', phone);
  url.searchParams.set('msg', text);
  url.searchParams.set('json', '1');
  try {
    const resp = await fetch(url.toString(), { method: 'GET' });
    return await resp.json();
  } catch (err) {
    return { error: String(err) };
  }
}

// Telegram — обёрнуто в try/catch: раньше сетевой сбой при вызове
// api.telegram.org валил весь Promise.all и обрывал обработчик необработанным
// исключением (Worker отвечал общей 500-кой без деталей).
async function sendTelegram(text, env) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'MarkdownV2'
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: errText };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Письмо — через REST API EmailJS (https://www.emailjs.com/docs/rest-api/send/),
// а не через их браузерный SDK: раньше это был отдельный запрос из браузера
// напрямую на emailjs.com, теперь дергаем отсюда вместе с Telegram одним
// запросом от клиента. Требует приватный ключ (EmailJS → Account → API Keys)
// в секрете EMAILJS_PRIVATE_KEY — без него письмо просто не уходит, ошибки
// это не считается (сайт продолжит работать через Telegram).
async function sendEmail(data, templateId, env) {
  if (!env.EMAILJS_PRIVATE_KEY) return { ok: false, skipped: 'EMAILJS_PRIVATE_KEY не задан' };
  if (!templateId) return { ok: false, skipped: 'шаблон не передан' };
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: templateId,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: env.EMAILJS_PRIVATE_KEY,
        template_params: data
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: errText };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Google Sheets — через Apps Script Web App, привязанный к таблице (см.
// FORMS_SETUP.md, как его создать и задеплоить). Не критичный канал: если
// GOOGLE_SHEETS_WEBHOOK_URL не задан или запрос упал, остальное продолжает
// работать как обычно.
async function sendToSheet(data, env) {
  if (!env.GOOGLE_SHEETS_WEBHOOK_URL) return { ok: false, skipped: 'GOOGLE_SHEETS_WEBHOOK_URL не задан' };
  try {
    const res = await fetch(env.GOOGLE_SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      redirect: 'follow'
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: errText };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Bad JSON' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // honeypot-поле "website": если заполнено — это бот, отвечаем "успехом",
    // но никуда не отправляем
    if (data.website) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const formType = data.formType || 'Заявка с сайта';
    const lines = [`*${escapeMarkdown(formType)}*`, ''];

    for (const [key, value] of Object.entries(data)) {
      if (SERVICE_FIELDS.includes(key)) continue;
      if (!value) continue;
      const label = FIELD_LABELS[key] || key;
      lines.push(`*${escapeMarkdown(label)}:* ${escapeMarkdown(value)}`);
    }

    const text = lines.join('\n');

    // Telegram, письмо, SMS и строка в Google Sheets — параллельно, каждый
    // сам ловит свои ошибки и не роняет остальные.
    const phone = extractRuPhone(data);
    const [tgResult, emailResult, smsResult, sheetResult] = await Promise.all([
      sendTelegram(text, env),
      sendEmail(data, data.emailTemplateId, env),
      phone ? sendConfirmationSms(phone, env) : Promise.resolve({ skipped: 'номер не распознан' }),
      sendToSheet(data, env)
    ]);

    // Таблица — вспомогательный канал, не влияет на anyOk: если она недоступна,
    // заявка всё равно должна дойти по основным каналам и клиент увидит успех.
    const anyOk = tgResult.ok || emailResult.ok;

    return new Response(JSON.stringify({ ok: anyOk, telegram: tgResult, email: emailResult, sms: smsResult, sheet: sheetResult }), {
      status: anyOk ? 200 : 502,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
};
