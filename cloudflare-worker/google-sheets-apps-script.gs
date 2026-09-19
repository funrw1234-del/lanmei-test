/**
 * Apps Script для таблицы "Lanmei — Заявки".
 * Принимает POST от Cloudflare Worker'а сайта и дописывает строку.
 *
 * Установка:
 * 1. В Google-таблице: Расширения → Apps Script.
 * 2. Стереть содержимое Code.gs, вставить этот файл целиком, сохранить.
 * 3. Развернуть → Новое развёртывание → тип "Веб-приложение":
 *      Выполнять от имени: Я (свой аккаунт)
 *      У кого есть доступ: Все
 * 4. Разрешить доступ при первом запуске (предупреждение о непроверенном
 *    приложении — это нормально, это твой собственный скрипт).
 * 5. Скопировать URL веб-приложения (заканчивается на /exec) — это и есть
 *    значение для секрета GOOGLE_SHEETS_WEBHOOK_URL в Cloudflare Worker.
 */

var SHEET_NAME = 'Заявки';
var HEADERS = [
  '№', 'Дата', 'Тип заявки', 'Имя', 'Телефон/Telegram',
  'Категория товара', 'Ссылка на товар', 'Объём закупок',
  'Город доставки', 'Email', 'Прочее (JSON)', 'Количество'
];
// Колонка «Количество» (qty из квиза) добавлена последней, в L, — чтобы не
// сдвигать уже заполненные колонки старых заявок.
var QTY_HEADER_CELL = 'L1';
var KNOWN_FIELDS = ['formType', 'name', 'phone', 'sku', 'link', 'budget', 'city', 'email', 'qty'];

// Защита от дублей: та же форма с тем же телефоном/Telegram за последние
// DUPLICATE_WINDOW_MIN минут считается повтором (клиент нажал "отправить"
// ещё раз, вернулся кнопкой "назад" и т.п.). Строка не добавляется, а Worker
// по флагу duplicate не шлёт повторно в Telegram и на почту.
var DUPLICATE_WINDOW_MIN = 10;
var DUPLICATE_SCAN_ROWS = 30;

// Телефон в разных формах ("+7 (999)...", "8 999...", "7999...") приводим
// к одним цифрам; ник Telegram / ссылку — к нижнему регистру.
function normContact_(v) {
  var s = String(v || '').trim().toLowerCase();
  var digits = s.replace(/\D/g, '');
  if (digits.length >= 7) {
    if (digits.length === 11 && digits.charAt(0) === '8') digits = '7' + digits.slice(1);
    return digits;
  }
  return s;
}

// rows — последние строки листа (колонки A..E: №, Дата, Тип, Имя, Телефон).
// Возвращает номер уже записанной заявки-дубля или null.
function findDuplicate_(rows, formType, phone, now) {
  var contact = normContact_(phone);
  if (!contact) return null;
  var windowMs = DUPLICATE_WINDOW_MIN * 60 * 1000;
  for (var i = rows.length - 1; i >= 0; i--) {
    var r = rows[i];
    var when = r[1] instanceof Date ? r[1] : new Date(r[1]);
    if (isNaN(when.getTime())) continue;
    if (now.getTime() - when.getTime() > windowMs) continue;
    if (String(r[2]) === String(formType || '') && normContact_(r[4]) === contact) {
      return r[0];
    }
  }
  return null;
}

function getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else if (sheet.getRange('A1').getValue() !== '№') {
    // Лист уже существовал до добавления сквозной нумерации (в нём реальные
    // заявки) — сдвигаем все колонки вправо на одну и подписываем новую
    // первую колонку "№". У старых строк она останется пустой: задним числом
    // номер не присваиваем, чтобы не выдумывать историю. Выполняется один
    // раз — при следующем запуске A1 уже будет "№" и это условие не сработает.
    sheet.insertColumnBefore(1);
    sheet.getRange('A1').setValue('№');
  }
  // Лист создан до появления вопроса про количество — дописываем заголовок.
  if (sheet.getRange(QTY_HEADER_CELL).getValue() !== 'Количество') {
    sheet.getRange(QTY_HEADER_CELL).setValue('Количество');
  }
  // Телефон часто начинается с "+" — без текстового формата колонки
  // Google Sheets воспринимает такие значения как формулу и пишет #ERROR!
  // Ставим формат каждый раз (не только при создании листа), чтобы починить
  // и уже существующий лист, созданный до этого исправления.
  sheet.getRange('E2:E').setNumberFormat('@');
  return sheet;
}

function doPost(e) {
  // Лок на время чтения номера + записи строки — без него две заявки,
  // пришедшие почти одновременно, могли бы получить один и тот же номер.
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = getOrCreateSheet_();

    var extra = {};
    for (var key in data) {
      if (KNOWN_FIELDS.indexOf(key) === -1 && key !== 'formType' && key !== 'website' && key !== 'emailTemplateId') {
        extra[key] = data[key];
      }
    }

    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var from = Math.max(2, lastRow - DUPLICATE_SCAN_ROWS + 1);
      var recent = sheet.getRange(from, 1, lastRow - from + 1, 5).getValues();
      var dupNumber = findDuplicate_(recent, data.formType, data.phone, new Date());
      if (dupNumber !== null) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true, duplicate: true, number: dupNumber }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Номер заявки = порядковый номер строки данных (без учёта заголовка).
    var number = lastRow; // ещё без новой строки: последняя занятая = кол-во предыдущих заявок

    // Убираем ведущий "+" только для таблицы — Google Sheets воспринимает
    // "+79991234567" как начало формулы и пишет #ERROR!. В Telegram и письме
    // номер по-прежнему уходит с "+", это касается только этой колонки.
    var phoneForSheet = (data.phone || '').replace(/^\+/, '');

    sheet.appendRow([
      number,
      new Date(),
      data.formType || '',
      data.name || '',
      phoneForSheet,
      data.sku || '',
      data.link || '',
      data.budget || '',
      data.city || '',
      data.email || '',
      Object.keys(extra).length ? JSON.stringify(extra) : '',
      data.qty || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, number: number }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
