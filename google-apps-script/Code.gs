/**
 * AVELINE PICTURE – system rezerwacji (Google Apps Script)
 * ---------------------------------------------------------
 * Strona pyta ten skrypt o wolne terminy, a rezerwację zapisuje jako
 * wydarzenie w Kalendarzu Google fotografki. Zajęty termin (także prywatny
 * wpis w kalendarzu) automatycznie znika z kalendarza na stronie.
 *
 * Instalacja: patrz INSTRUKCJA.txt, punkt 1.
 */

const CONFIG = {
  CALENDAR_ID: 'primary',            // 'primary' = główny kalendarz konta; albo ID innego kalendarza
  NOTIFY_EMAIL: '',                  // gdzie wysyłać powiadomienia o rezerwacji ('' = właściciel konta)
  TIMEZONE: 'Europe/Warsaw',

  SESSION_MINUTES: 90,               // długość sesji widoczna dla klienta
  BUFFER_MINUTES: 60,                // czas na dojazd / przerwę przed i po sesji (klient go nie widzi)
  MIN_NOTICE_HOURS: 48,              // najwcześniej można zarezerwować za tyle godzin
  DAYS_AHEAD: 90,                    // jak daleko w przód pokazywać terminy
  MAX_PER_DAY: 2,                    // maks. liczba sesji jednego dnia

  // Godziny rozpoczęcia sesji w poszczególne dni (1 = poniedziałek … 7 = niedziela).
  // Pusta lista = dzień wolny.
  START_TIMES: {
    1: [],
    2: ['10:00', '16:00'],
    3: ['10:00', '16:00'],
    4: ['10:00', '16:00'],
    5: ['10:00', '16:00'],
    6: ['09:00', '12:30', '16:00'],
    7: ['10:00', '15:00']
  },

  // Dni zablokowane na stałe (urlop, święta), format RRRR-MM-DD
  BLOCKED_DATES: ['2026-12-24', '2026-12-25', '2026-12-26', '2027-01-01'],

  EVENT_PREFIX: 'Sesja',             // tytuł wydarzenia w kalendarzu: "Sesja: rodzaj – imię"
  BOOKING_TAG: '#aveline-rezerwacja' // znacznik w opisie – po nim liczymy sesje w danym dniu
};

/* ---------- API ---------- */

function doGet() {
  try {
    return json_({ ok: true, session: CONFIG.SESSION_MINUTES, days: getAvailability_() });
  } catch (err) {
    return json_({ ok: false, message: 'Nie udało się pobrać terminów.' });
  }
}

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, message: 'Nieprawidłowe dane.' }); }

  if (data.website) return json_({ ok: true }); // pułapka na boty

  const name = clean_(data.name, 80), email = clean_(data.email, 120), phone = clean_(data.phone, 30);
  const type = clean_(data.type, 60), place = clean_(data.place, 160), message = clean_(data.message, 2000);
  const date = clean_(data.date, 10), time = clean_(data.time, 5);

  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json_({ ok: false, message: 'Podaj imię i poprawny e-mail.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return json_({ ok: false, message: 'Wybierz termin.' });
  if (!data.consent) return json_({ ok: false, message: 'Zaznacz zgodę na przetwarzanie danych.' });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return json_({ ok: false, message: 'Spróbuj ponownie za chwilę.' });
  try {
    // ponowne sprawdzenie – termin mógł zostać zajęty przed chwilą
    const free = getAvailability_()[date] || [];
    if (free.indexOf(time) === -1) {
      return json_({ ok: false, taken: true, message: 'Ten termin został przed chwilą zajęty. Wybierz inny.' });
    }
    const start = toDate_(date, time);
    const end = new Date(start.getTime() + CONFIG.SESSION_MINUTES * 60000);
    const cal = calendar_();
    const description = [
      'Klient: ' + name, 'E-mail: ' + email, 'Telefon: ' + (phone || '—'),
      'Rodzaj: ' + (type || '—'), 'Miejsce: ' + (place || '—'), '', message, '', CONFIG.BOOKING_TAG
    ].join('\n');
    const ev = cal.createEvent(CONFIG.EVENT_PREFIX + ': ' + (type || 'sesja') + ' – ' + name, start, end, {
      description: description, location: place, guests: email, sendInvites: true
    });
    ev.addPopupReminder(24 * 60);

    MailApp.sendEmail({
      to: CONFIG.NOTIFY_EMAIL || Session.getEffectiveUser().getEmail(),
      replyTo: email,
      subject: 'Nowa rezerwacja: ' + date + ' ' + time + ' – ' + name,
      body: 'Nowa rezerwacja ze strony Aveline Picture\n\nTermin: ' + date + ' ' + time + '\n' + description
    });
    return json_({ ok: true, message: 'Termin zarezerwowany! Zaproszenie z kalendarza wysłaliśmy na ' + email + '.' });
  } catch (err) {
    return json_({ ok: false, message: 'Nie udało się zapisać rezerwacji. Napisz przez formularz kontaktowy.' });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- logika wolnych terminów ---------- */

function getAvailability_() {
  const cal = calendar_();
  const now = new Date();
  const earliest = new Date(now.getTime() + CONFIG.MIN_NOTICE_HOURS * 3600000);
  const rangeEnd = new Date(now.getTime() + (CONFIG.DAYS_AHEAD + 1) * 86400000);
  const events = cal.getEvents(now, rangeEnd); // każde wydarzenie blokuje czas, także całodniowe (urlop)
  const busy = events.map(function (ev) {
    return { s: ev.getStartTime().getTime(), e: ev.getEndTime().getTime(), booking: (ev.getDescription() || '').indexOf(CONFIG.BOOKING_TAG) !== -1 };
  });
  const bufferMs = CONFIG.BUFFER_MINUTES * 60000, sessionMs = CONFIG.SESSION_MINUTES * 60000;
  const days = {};

  for (let i = 0; i <= CONFIG.DAYS_AHEAD; i++) {
    const day = new Date(now.getTime() + i * 86400000);
    const key = Utilities.formatDate(day, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    if (days[key] !== undefined || CONFIG.BLOCKED_DATES.indexOf(key) !== -1) continue;
    const weekday = Number(Utilities.formatDate(day, CONFIG.TIMEZONE, 'u'));
    const times = CONFIG.START_TIMES[weekday] || [];
    const dayStart = toDate_(key, '00:00').getTime(), dayEnd = dayStart + 86400000;
    const bookedToday = busy.filter(function (b) { return b.booking && b.s >= dayStart && b.s < dayEnd; }).length;
    if (bookedToday >= CONFIG.MAX_PER_DAY) continue;

    const free = times.filter(function (t) {
      const s = toDate_(key, t).getTime(), e = s + sessionMs;
      if (s < earliest.getTime()) return false;
      return !busy.some(function (b) { return b.s < e + bufferMs && b.e > s - bufferMs; });
    });
    if (free.length) days[key] = free;
  }
  return days;
}

/* ---------- pomocnicze ---------- */

function calendar_() {
  const cal = CONFIG.CALENDAR_ID === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!cal) throw new Error('Brak kalendarza');
  return cal;
}

function toDate_(ymd, hm) {
  // tworzy datę w strefie czasowej z CONFIG (działa poprawnie przy zmianie czasu letni/zimowy)
  const probe = new Date(ymd + 'T12:00:00Z');
  const offset = Utilities.formatDate(probe, CONFIG.TIMEZONE, 'XXX'); // np. +01:00
  return new Date(ymd + 'T' + hm + ':00' + offset);
}

function clean_(v, max) { return String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* Uruchom raz ręcznie (przycisk ▶ Uruchom), żeby nadać uprawnienia i sprawdzić terminy w dzienniku. */
function test() {
  Logger.log(JSON.stringify(getAvailability_(), null, 2));
}
