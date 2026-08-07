/*
 * Cloudflare Worker: принимает JSON с любой формы сайта Lanmei и пересылает
 * его сообщением в Telegram-канал/группу через Bot API. Токен бота хранится
 * только здесь, в секретах Worker'а — в браузере он никогда не появляется.
 *
 * Универсальный: подходит для любой формы на сайте — просто передайте
 * в body любые поля + "formType" (название формы для заголовка сообщения).
 * Новые поля не нужно нигде регистрировать — Worker распечатает всё, что придёт.
 *
 * Деплой и секреты — см. FORMS_SETUP.md в корне проекта.
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

// Домены, которым разрешено слать запросы сюда. Добавьте свой домен
// после подключения (и можно будет убрать GitHub Pages адрес).
const ALLOWED_ORIGINS = [
  'https://funrw1234-del.github.io'
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

    const tgResp = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown'
      })
    });

    if (!tgResp.ok) {
      const errText = await tgResp.text();
      return new Response(JSON.stringify({ ok: false, error: errText }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
};
