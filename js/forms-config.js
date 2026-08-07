/*
 * Настройки доставки заявок с сайта: EmailJS (почта) + Cloudflare Worker (Telegram).
 * Заполните значения ниже своими — инструкция по получению каждого в FORMS_SETUP.md.
 * Пока значения не заполнены (остались "ЗАМЕНИТЕ..."), форма продолжит работать
 * визуально (успех показывается), но заявки никуда не уйдут — это чтобы сайт
 * не ломался, пока настройка не завершена.
 */
window.LANMEI_FORMS_CONFIG = {
  emailjs: {
    publicKey: 'SQhMTxVRfRMbPODIb',
    serviceId: 'service_c8zqvjb',
    templateId: 'template_hvldedk', // шаблон формы брифа (#leadForm)
    templateIdCallback: 'template_cu9j7qh' // отдельный шаблон для формы обратного звонка
  },
  telegramWorkerUrl: 'https://lanmei-forms.leonidpadalko1996.workers.dev/'
};
