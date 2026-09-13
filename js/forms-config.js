/*
 * Настройки доставки заявок с сайта: и почта (EmailJS), и Telegram уходят
 * ОДНИМ запросом через Cloudflare Worker (см. cloudflare-worker/telegram-relay.js) —
 * ключи EmailJS и токен бота хранятся в секретах Worker'а, здесь их нет.
 * Отсюда нужно только знать URL Worker'а и id шаблона EmailJS под каждую форму.
 */
window.LANMEI_FORMS_CONFIG = {
  emailTemplateId: 'template_hvldedk', // шаблон квиза (#leadForm)
  emailTemplateIdCallback: 'template_cu9j7qh', // обратный звонок + форма в подвале
  telegramWorkerUrl: 'https://lanmei-forms.leonidpadalko1996.workers.dev/'
};
