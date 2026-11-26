/* Aveline Picture – skrypty strony */
(function () {
  'use strict';

  // Menu mobilne
  var btn = document.getElementById('menu-btn');
  var menu = document.getElementById('mobile-menu');
  if (btn && menu) {
    btn.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); });
    });
  }

  // Rok w stopce
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // Animacja wejścia sekcji
  var rev = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -60px 0px' });
    rev.forEach(function (el) { io.observe(el); });
  } else { rev.forEach(function (el) { el.classList.add('in'); }); }

  // Pokaz slajdów w hero (zmiana co 6 s, zatrzymany przy „ogranicz ruch”)
  var slides = document.querySelectorAll('#hero-slides .slide');
  var slideNo = document.getElementById('slide-no');
  if (slides.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var cur = 0;
    setInterval(function () {
      slides[cur].classList.remove('active');
      cur = (cur + 1) % slides.length;
      slides[cur].classList.add('active');
      if (slideNo) slideNo.textContent = ('0' + (cur + 1)).slice(-2);
    }, 6000);
  }

  // ===== Własny kalendarz rezerwacji (dane z Google Apps Script) =====
  var bk = document.getElementById('booker');
  if (bk) (function () {
    var api = (bk.getAttribute('data-api-url') || '').trim();
    var demo = !/^https:\/\/script\.google\.com\//.test(api);
    var $ = function (id) { return document.getElementById(id); };
    var grid = $('bk-grid'), monthEl = $('bk-month'), slotsEl = $('bk-slots'), form = $('bk-form'), done = $('bk-done');
    var days = {}, session = 90, view = null, selDay = null, selTime = null, firstMonth = null, lastMonth = null;
    var MONTHS = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function parse(k) { var p = k.split('-'); return new Date(+p[0], p[1] - 1, +p[2]); }
    function human(k) { return parse(k).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }); }
    function endTime(t) { var p = t.split(':'), m = +p[0] * 60 + +p[1] + session; return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); }

    function demoData() {
      var out = {}, plan = { 2: ['10:00', '16:00'], 3: ['10:00', '16:00'], 4: ['10:00', '16:00'], 5: ['10:00', '16:00'], 6: ['09:00', '12:30', '16:00'], 0: ['10:00', '15:00'] };
      var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 2);
      for (var i = 0; i < 75; i++, d.setDate(d.getDate() + 1)) {
        var t = (plan[d.getDay()] || []).filter(function (_, j) { return (d.getDate() * 7 + j * 3) % 5 !== 0; });
        if (t.length && d.getDate() % 6 !== 0) out[key(d)] = t;
      }
      return out;
    }

    function load() {
      grid.innerHTML = '<p class="bk-loading">Wczytuję wolne terminy…</p>';
      if (demo) { $('bk-demo').hidden = false; setData(demoData()); return; }
      fetch(api).then(function (r) { return r.json(); }).then(function (d) {
        if (!d.ok) throw 0; session = d.session || 90; setData(d.days || {});
      }).catch(function () {
        grid.innerHTML = '<p class="bk-loading">Nie udało się wczytać kalendarza. <a href="#kontakt" style="color:#fff">Napisz do mnie</a> – podam wolne terminy.</p>';
      });
    }
    function setData(d) {
      days = d; var keys = Object.keys(days).sort();
      var now = new Date(); firstMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      lastMonth = keys.length ? parse(keys[keys.length - 1]) : firstMonth; lastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
      view = keys.length ? parse(keys[0]) : new Date(firstMonth); view.setDate(1);
      if (selDay && !days[selDay]) { selDay = null; showIntro(); }
      render();
    }
    function render() {
      monthEl.textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();
      $('bk-prev').disabled = view <= firstMonth; $('bk-next').disabled = view >= lastMonth;
      var html = '', first = new Date(view), lead = (first.getDay() + 6) % 7, today = key(new Date());
      for (var i = 0; i < lead; i++) html += '<span></span>';
      var dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      for (var n = 1; n <= dim; n++) {
        var k = key(new Date(view.getFullYear(), view.getMonth(), n)), cls = 'bk-day' + (k === today ? ' today' : '');
        if (days[k]) html += '<button type="button" class="' + cls + ' free' + (k === selDay ? ' selected' : '') + '" data-day="' + k + '" aria-label="' + human(k) + ', wolne terminy: ' + days[k].length + '">' + n + '</button>';
        else html += '<span class="' + cls + '" aria-hidden="true">' + n + '</span>';
      }
      grid.innerHTML = html;
    }
    function showIntro() { form.hidden = true; done.hidden = true; slotsEl.hidden = false;
      slotsEl.innerHTML = '<p class="eyebrow">Krok 1</p><h3>Wybierz dzień</h3><p class="muted small">Dni z wolnymi terminami są podświetlone. Po wybraniu dnia zobaczysz dostępne godziny.</p>'; }
    function showSlots() {
      form.hidden = true; done.hidden = true; slotsEl.hidden = false;
      slotsEl.innerHTML = '<p class="eyebrow">Krok 2</p><h3>' + human(selDay) + '</h3><p class="muted small">Wybierz godzinę rozpoczęcia. Sesja trwa do ' + (session / 60).toString().replace('.', ',') + ' h.</p><div class="bk-times">' +
        days[selDay].map(function (t) { return '<button type="button" class="bk-time" data-time="' + t + '">' + t + '<small>do ' + endTime(t) + '</small></button>'; }).join('') + '</div>';
    }
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('[data-day]'); if (!b) return;
      selDay = b.getAttribute('data-day'); render(); showSlots();
      if (window.innerWidth < 760) slotsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    slotsEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-time]'); if (!b) return;
      selTime = b.getAttribute('data-time');
      $('bk-chosen-text').textContent = human(selDay) + ', ' + selTime + '–' + endTime(selTime);
      slotsEl.hidden = true; form.hidden = false; $('bk-msg-out').className = 'form-msg'; $('bk-name').focus();
    });
    $('bk-change').addEventListener('click', showSlots);
    $('bk-prev').addEventListener('click', function () { view.setMonth(view.getMonth() - 1); render(); });
    $('bk-next').addEventListener('click', function () { view.setMonth(view.getMonth() + 1); render(); });
    $('bk-again').addEventListener('click', function () { selDay = null; render(); showIntro(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var out = $('bk-msg-out'), btn = form.querySelector('[type=submit]'), fd = new FormData(form);
      var data = { date: selDay, time: selTime, consent: !!fd.get('consent') };
      ['name', 'email', 'phone', 'type', 'place', 'message', 'website'].forEach(function (f) { data[f] = fd.get(f) || ''; });
      if (!data.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) { out.className = 'form-msg err'; out.textContent = 'Podaj imię i poprawny e-mail.'; return; }
      if (!data.consent) { out.className = 'form-msg err'; out.textContent = 'Zaznacz zgodę na przetwarzanie danych.'; return; }
      btn.disabled = true; btn.textContent = 'Rezerwuję…';
      var finish = function (d) {
        btn.disabled = false; btn.textContent = 'Rezerwuję termin';
        if (d.ok) {
          form.hidden = true; done.hidden = false; form.reset();
          $('bk-done-text').textContent = human(selDay) + ', ' + selTime + '. ' + (d.message || '');
          days[selDay] = (days[selDay] || []).filter(function (t) { return t !== selTime; }); if (!days[selDay].length) delete days[selDay];
          render();
        } else {
          out.className = 'form-msg err'; out.textContent = d.message || 'Nie udało się zarezerwować.';
          if (d.taken) { load(); setTimeout(showSlots, 600); }
        }
      };
      if (demo) { setTimeout(function () { finish({ ok: true, message: 'To tylko podgląd – nic nie zostało zapisane.' }); }, 600); return; }
      // text/plain = bez zapytania wstępnego CORS, które Google Apps Script odrzuca
      fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json(); }).then(finish)
        .catch(function () { finish({ ok: false, message: 'Brak połączenia. Spróbuj ponownie albo napisz przez formularz.' }); });
    });
    load();
  })();

  // Wybór pakietu z cennika → wpisuje temat w formularzu
  document.querySelectorAll('[data-package]').forEach(function (b) {
    b.addEventListener('click', function () {
      var sel = document.getElementById('f-type');
      if (sel) { sel.value = b.getAttribute('data-package'); }
    });
  });

  // Formularz kontaktowy (wysyłka do send.php bez przeładowania strony)
  var form = document.getElementById('contact-form');
  if (form && window.fetch) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = document.getElementById('form-msg');
      var submit = form.querySelector('[type="submit"]');
      submit.disabled = true; submit.textContent = 'Wysyłanie…';
      fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          msg.className = 'form-msg ' + (d.ok ? 'ok' : 'err');
          msg.textContent = d.message;
          if (d.ok) form.reset();
        })
        .catch(function () {
          msg.className = 'form-msg err';
          msg.textContent = 'Nie udało się wysłać wiadomości. Napisz bezpośrednio na adres e-mail obok.';
        })
        .finally(function () { submit.disabled = false; submit.textContent = 'Wyślij wiadomość'; });
    });
  }

  // Portfolio – filtry kategorii
  document.querySelectorAll('[data-filter-group]').forEach(function (group) {
    var gallery = document.getElementById(group.getAttribute('data-filter-group'));
    group.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        group.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
        chip.classList.add('active'); chip.setAttribute('aria-pressed', 'true');
        var f = chip.getAttribute('data-filter');
        gallery.querySelectorAll('figure').forEach(function (fig) {
          fig.classList.toggle('hide', f !== 'all' && fig.getAttribute('data-cat') !== f);
        });
      });
    });
  });

  // Lightbox (powiększanie zdjęć)
  var lb = document.getElementById('lightbox');
  if (lb) {
    var lbImg = lb.querySelector('img'), lbCap = lb.querySelector('.cap'), list = [], idx = 0;
    function visible(gal) { return Array.prototype.filter.call(gal.querySelectorAll('figure'), function (f) { return !f.classList.contains('hide'); }); }
    function show(i) {
      idx = (i + list.length) % list.length;
      var im = list[idx].querySelector('img');
      lbImg.src = im.getAttribute('data-full') || im.src; lbImg.alt = im.alt;
      lbCap.textContent = (idx + 1) + ' / ' + list.length + (im.alt ? ' · ' + im.alt : '');
    }
    function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
    document.querySelectorAll('.gallery').forEach(function (gal) {
      gal.addEventListener('click', function (e) {
        var fig = e.target.closest('figure'); if (!fig) return;
        list = visible(gal); show(list.indexOf(fig));
        lb.classList.add('open'); document.body.style.overflow = 'hidden';
        lb.querySelector('.lb-close').focus();
      });
    });
    lb.querySelector('.lb-close').addEventListener('click', close);
    lb.querySelector('.lb-prev').addEventListener('click', function () { show(idx - 1); });
    lb.querySelector('.lb-next').addEventListener('click', function () { show(idx + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'ArrowRight') show(idx + 1);
    });
  }

  // Pełny cennik – zakładki
  var tabs = document.querySelectorAll('[role="tab"]');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.setAttribute('aria-selected', 'false'); document.getElementById(x.getAttribute('aria-controls')).hidden = true; });
      t.setAttribute('aria-selected', 'true');
      document.getElementById(t.getAttribute('aria-controls')).hidden = false;
      history.replaceState(null, '', '#' + t.getAttribute('aria-controls'));
    });
  });
  if (tabs.length && location.hash) {
    var t0 = document.querySelector('[aria-controls="' + location.hash.slice(1) + '"]');
    if (t0) t0.click();
  }
})();
