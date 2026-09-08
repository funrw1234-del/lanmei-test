/*
 * Cloudflare Worker: принимает JSON с любой формы сайта Lanmei и пересылает
 * его сообщением в Telegram-канал/группу через Bot API. Токен бота хранится
 * только здесь, в секретах Worker'а — в браузере он никогда не появляется.
 * Дополнительно, если в присланных данных есть поле, похожее на реальный
 * российский номер телефона, — шлёт клиенту SMS-подтверждение через SMS.ru.
 *
 * Универсальный: подходит для любой формы на сайте — просто передайте
 * в body любые поля + "formType" (название формы для заголовка сообщения).
 * Новые поля не нужно нигде регистрировать — Worker распечатает всё, что придёт.
 *
 * Деплой и секреты — см. FORMS_SETUP.md и SMS_SETUP.md в корне проекта.
 */

// Человекочитаемые подписи для известных полей (необязательно — незнакомые
// поля просто напечатаются под своим ключом).
const FIELD_LABELS = {
  name: 'Имя',
  phone: 'Телефон/Telegram',
  sku: 'Категория товара',
  budget: 'Объём закупок',
  scheme: 'Текущая схема',
  msg: 'Комментарий',
  email: 'Email'
};

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
// исключение при неудаче — SMS вторична, отправка в Telegram важнее и не
// должна ломаться из-за проблем с SMS-шлюзом.
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
    const json = await resp.json();
    return json;
  } catch (err) {
    return { error: String(err) };
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
      if (key === 'formType' || key === 'website') continue;
      if (!value) continue;
      const label = FIELD_LABELS[key] || key;
      lines.push(`*${escapeMarkdown(label)}:* ${escapeMarkdown(value)}`);
    }

    const text = lines.join('\n');

    // Telegram и SMS — параллельно; SMS не должна блокировать/ронять ответ,
    // если у клиента в поле оказался Telegram-ник, а не номер, — extractRuPhone
    // вернёт null, и sendConfirmationSms просто не будет вызвана.
    const phone = extractRuPhone(data);
    const [tgResp, smsResult] = await Promise.all([
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'Markdown'
        })
      }),
      phone ? sendConfirmationSms(phone, env) : Promise.resolve({ skipped: 'номер не распознан' })
    ]);

    if (!tgResp.ok) {
      const errText = await tgResp.text();
      return new Response(JSON.stringify({ ok: false, error: errText, sms: smsResult }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true, sms: smsResult }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
};
