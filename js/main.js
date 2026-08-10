/* =========================================================
   LANMEI — интерактив и анимации
   Тайминги и easing взяты из motion.csv (ui-ux-pro-max):
   Scroll Reveal / Standard — 400–600мс, power2.out, start 'top 85%'
   Stagger List — 60–80мс между элементами, back.out(1.4)
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Прелоадер ---------- */
  window.addEventListener('load', () => {
    setTimeout(() => {
      $('#preloader').classList.add('is-hidden');
      document.body.classList.add('is-loaded');
    }, reduced ? 0 : 800);
  });

  /* ---------- Cookie-уведомление ----------
     Показываем один раз при первом визите (localStorage), не мешая
     прелоадеру — с небольшой задержкой после загрузки страницы. */
  const cookieBanner = $('#cookieBanner');
  if (cookieBanner) {
    const CONSENT_KEY = 'lanmei_cookie_consent';
    if (!localStorage.getItem(CONSENT_KEY)) {
      cookieBanner.hidden = false;
      setTimeout(() => cookieBanner.classList.add('is-visible'), reduced ? 0 : 1400);
    }
    $('#cookieAccept').addEventListener('click', () => {
      localStorage.setItem(CONSENT_KEY, '1');
      cookieBanner.classList.remove('is-visible');
      setTimeout(() => { cookieBanner.hidden = true; }, reduced ? 0 : 500);
    });
  }

  /* ---------- Плавный скролл ---------- */
  $$('[data-scroll-to]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = $(link.dataset.scrollTo);
      if (!target) return;
      e.preventDefault();
      closeNav();
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - 66,
        behavior: reduced ? 'auto' : 'smooth'
      });
    });
  });

  /* ---------- Шапка ---------- */
  const header = $('#header');
  const fab = $('#fab');
  const bar = $('#scrollbar');
  const navLinks = $$('.nav a');
  const sections = navLinks.map((a) => $(a.dataset.scrollTo)).filter(Boolean);
  let lastY = 0;

  function onScroll() {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;

    header.classList.toggle('is-stuck', y > 40);
    header.classList.toggle('is-hidden', y > 500 && y > lastY && !header.classList.contains('is-nav-open'));
    lastY = y;

    fab.classList.toggle('is-visible', y > 800);
    bar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';

    let current = null;
    sections.forEach((sec) => {
      if (sec.getBoundingClientRect().top <= 140) current = sec.id;
    });
    navLinks.forEach((a) => a.classList.toggle('is-active', a.dataset.scrollTo === '#' + current));
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Мобильное меню ---------- */
  const burger = $('#burger');
  const nav = $('#nav');

  function closeNav() {
    nav.classList.remove('is-open');
    burger.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    header.classList.remove('is-nav-open');
    document.body.style.overflow = '';
  }
  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    header.classList.toggle('is-nav-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });
  window.addEventListener('keydown', (e) => e.key === 'Escape' && closeNav());

  /* ---------- Появление блоков ---------- */
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.style.transitionDelay = (el.dataset.delay || 0) + 'ms';
        el.classList.add('is-in');
        io.unobserve(el);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -15% 0px' }
  );

  // стаггер по сеткам: 70мс шаг, не длиннее 8 элементов подряд
  $$('.bento, .cards, .problem__grid, .docs__grid, .seg__grid, .grt__grid, .case__nums, .magnets, .process__meta, .facts__grid, .team__grid')
    .forEach((grid) => {
      $$('.reveal', grid).forEach((el, i) => {
        if (!el.dataset.delay) el.dataset.delay = Math.min(i, 7) * 70;
      });
    });

  $$('.reveal').forEach((el) => io.observe(el));

  /* ---------- Заголовки в одну строку ----------
     Уменьшаем кегль ровно настолько, чтобы строка легла в контейнер. */
  const lineTitles = $$('.section__title--line');

  function fitLineTitles() {
    lineTitles.forEach((t) => {
      t.style.fontSize = '';                       // сбрасываем к значению из CSS
      if (window.innerWidth < 900) return;         // ниже — обычный перенос

      // мерим по .section__head, если он есть — именно он реально ограничивает
      // ширину заголовка (у --full он равен .container, у обычного — уже,
      // 56ch); мерить всегда по .container — баг: для узких head JS решал,
      // что место есть, и не сжимал шрифт, хотя текст реально не помещался
      const box = t.closest('.section__head') || t.closest('.container');
      const cs = getComputedStyle(box);
      const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const base = parseFloat(getComputedStyle(t).fontSize);
      const scale = avail / t.scrollWidth;

      if (scale < 1) t.style.fontSize = Math.floor(base * scale * 0.995) + 'px';
    });
  }

  if (lineTitles.length) {
    fitLineTitles();

    // До загрузки Rubik строка меряется запасным шрифтом и выходит короче,
    // поэтому ждём именно это начертание. fonts.ready тут ненадёжен:
    // он успевает разрешиться раньше, чем стили закажут шрифт.
    if (document.fonts && document.fonts.load) {
      document.fonts.load('600 56px Rubik').then(fitLineTitles).catch(() => {});
    }
    // подстраховка на случай медленной сети или отсутствия Font Loading API
    [300, 1000, 2500].forEach((ms) => setTimeout(fitLineTitles, ms));

    let fitTimer;
    window.addEventListener('resize', () => {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(fitLineTitles, 120);
    });
  }

  /* ---------- Счётчики ---------- */
  const countIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        countIO.unobserve(entry.target);
      });
    },
    { threshold: 0.6 }
  );
  $$('.count').forEach((c) => countIO.observe(c));

  function animateCount(el) {
    const to = parseFloat(el.dataset.to);
    const dur = reduced ? 0 : 1200;
    const start = performance.now();
    if (!dur) { el.textContent = to; return; }
    (function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }

  /* ---------- Полосы в смете ---------- */
  const barIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const row = entry.target;
        const fill = $('.irow__bar i', row);
        // 100% ширины отдаём самой крупной статье, остальные пропорционально
        setTimeout(() => { fill.style.width = row.dataset.share / 58 * 100 + '%'; },
          [...row.parentElement.children].indexOf(row) * 70);
        barIO.unobserve(row);
      });
    },
    { threshold: 0.5 }
  );
  $$('.irow').forEach((r) => barIO.observe(r));

  /* ---------- Лёгкий параллакс карты ----------
     Только декоративный слой: подписи и маршруты не двигаем (motion.csv, Parallax/Subtle) */
  const map = $('.hero__map');
  if (map && !reduced && window.matchMedia('(pointer:fine)').matches) {
    $('.hero').addEventListener('mousemove', (e) => {
      const dx = (e.clientX - window.innerWidth / 2) / window.innerWidth;
      const dy = (e.clientY - window.innerHeight / 2) / window.innerHeight;
      map.style.transform = `translate3d(${dx * -14}px, ${dy * -10}px, 0)`;
    });
    $('.hero').addEventListener('mouseleave', () => { map.style.transform = ''; });
  }

  /* ---------- Блик у подсвеченных кнопок и стрелка-бокс ---------- */
  $$('.btn--glow').forEach((btn) => {
    const shine = document.createElement('span');
    shine.className = 'shine';
    shine.setAttribute('aria-hidden', 'true');
    btn.appendChild(shine);
  });
  $$('.btn--arrow').forEach((btn) => {
    const box = document.createElement('span');
    box.className = 'box';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<svg viewBox="0 0 14 14" fill="none" width="11" height="11"><path d="M2 12 12 2M5 2h7v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.appendChild(box);
  });

  /* ---------- Индикатор секций справа ---------- */
  const dotsWrap = $('#dots');
  if (dotsWrap) {
    const blocks = $$('section[id]');
    const darkBlocks = ['brief'];   // первый экран теперь светлый, calc удалён

    blocks.forEach((sec) => {
      const b = document.createElement('button');
      b.type = 'button';
      const title = sec.querySelector('.section__title, .hero__title, .brief__title');
      b.setAttribute('aria-label', 'К блоку: ' + (title ? title.textContent.trim().slice(0, 40) : sec.id));
      b.addEventListener('click', () => {
        window.scrollTo({
          top: sec.getBoundingClientRect().top + window.scrollY - 66,
          behavior: reduced ? 'auto' : 'smooth'
        });
      });
      dotsWrap.appendChild(b);
    });

    const dotBtns = $$('button', dotsWrap);
    const syncDots = () => {
      let idx = 0;
      blocks.forEach((sec, i) => {
        if (sec.getBoundingClientRect().top <= window.innerHeight * 0.4) idx = i;
      });
      dotBtns.forEach((b, i) => b.classList.toggle('is-active', i === idx));
      // на тёмных секциях индикатор перекрашивается в белый
      dotsWrap.classList.toggle('on-dark', darkBlocks.includes(blocks[idx].id));
    };
    window.addEventListener('scroll', syncDots, { passive: true });
    syncDots();
  }

  /* ---------- Магнитные кнопки ---------- */
  $$('.btn').forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty('--mx', e.clientX - r.left + 'px');
      btn.style.setProperty('--my', e.clientY - r.top + 'px');
      if (!btn.classList.contains('magnetic') || reduced) return;
      btn.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.16}px, ${(e.clientY - r.top - r.height / 2) * 0.26 - 3}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });

  /* ---------- Карусель кейсов ---------- */
  const caseStage = $('#caseStage');
  if (caseStage) {
    const slides = $$('.case__slide', caseStage);
    const tabs = $$('.case__tab');
    const prevBtn = $('#casePrev');
    const nextBtn = $('#caseNext');
    const counter = $('#caseCurrent');
    let current = 0;

    function goTo(index) {
      current = (index + slides.length) % slides.length; // закольцовано в обе стороны

      slides.forEach((s, i) => s.classList.toggle('is-current', i === current));
      tabs.forEach((t, i) => {
        const active = i === current;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
        t.tabIndex = active ? 0 : -1;
      });
      counter.textContent = String(current + 1).padStart(2, '0');
    }

    prevBtn.addEventListener('click', () => goTo(current - 1));
    nextBtn.addEventListener('click', () => goTo(current + 1));
    tabs.forEach((tab) => tab.addEventListener('click', () => goTo(Number(tab.dataset.index))));

    // стрелки влево/вправо переключают вкладки, как в стандартном ARIA tabs-паттерне
    $$('.case__tabs')[0].addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); tabs[current].focus(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); tabs[current].focus(); }
    });
  }

  /* ---------- Мини-галерея фото/видео внутри кейса ----------
     Слайды ищутся по имени 1.jpg, 2.jpg, 3.jpg... в папке кейса —
     подряд, без пропусков. На каждом месте вместо фото можно положить
     N.mp4 (вертикальное видео, по клику, со звуком и контролами) —
     галерея сама определит тип. Пока файлов нет, виден плейсхолдер. */
  $$('[data-gallery]').forEach((figure) => {
    const caseSlug = figure.dataset.case;
    const altBase = figure.dataset.alt || '';
    const slidesWrap = $('.gallery__slides', figure);
    const placeholderSlide = $('.gallery__slide', slidesWrap);
    const prevBtn = $('.gallery__arrow--prev', figure);
    const nextBtn = $('.gallery__arrow--next', figure);
    const dotsWrap = $('.gallery__dots', figure);
    const MAX_PROBE = 12;
    const found = [];

    function probe(n) {
      if (n > MAX_PROBE) return finish();
      const img = new Image();
      img.onload = () => { found.push({ n, type: 'image' }); probe(n + 1); };
      img.onerror = () => {
        // фото под этим номером нет — пробуем видео на том же месте
        fetch(`photos/cases/${caseSlug}/${n}.mp4`, { method: 'HEAD' })
          .then((res) => {
            if (res.ok) { found.push({ n, type: 'video' }); probe(n + 1); }
            else finish();
          })
          .catch(finish);
      };
      img.src = `photos/cases/${caseSlug}/${n}.jpg`;
    }

    function finish() {
      if (!found.length) return; // файлов ещё не добавлено — оставляем плейсхолдер
      buildGallery();
    }

    function buildGallery() {
      placeholderSlide.remove();
      let current = 0;
      const dots = [];

      const slides = found.map((item, i) => {
        const slide = document.createElement('div');
        slide.className = 'gallery__slide' + (i === 0 ? ' is-current' : '');
        if (item.type === 'video') {
          const video = document.createElement('video');
          video.className = 'gallery__video';
          video.src = `photos/cases/${caseSlug}/${item.n}.mp4`;
          video.controls = true;
          video.playsInline = true;
          video.preload = 'metadata';
          slide.appendChild(video);
        } else {
          const img = document.createElement('img');
          img.src = `photos/cases/${caseSlug}/${item.n}.jpg`;
          img.alt = altBase;
          img.loading = i === 0 ? 'eager' : 'lazy';
          img.decoding = 'async';
          slide.appendChild(img);
        }
        slidesWrap.appendChild(slide);
        return slide;
      });

      function goTo(index) {
        current = (index + slides.length) % slides.length;
        slides.forEach((s, i) => {
          s.classList.toggle('is-current', i === current);
          // переключили слайд — останавливаем видео, которое осталось за кадром
          if (i !== current) { const v = s.querySelector('video'); if (v) v.pause(); }
        });
        dots.forEach((d, i) => d.classList.toggle('is-current', i === current));
      }

      if (slides.length > 1) {
        prevBtn.hidden = false;
        nextBtn.hidden = false;
        dotsWrap.hidden = false;

        slides.forEach((_, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          const label = found[i].type === 'video' ? 'Видео' : 'Фото';
          b.setAttribute('aria-label', `${label} ${i + 1} из ${slides.length}`);
          if (i === 0) b.classList.add('is-current');
          b.addEventListener('click', () => goTo(i));
          dotsWrap.appendChild(b);
          dots.push(b);
        });

        prevBtn.addEventListener('click', () => goTo(current - 1));
        nextBtn.addEventListener('click', () => goTo(current + 1));

        // свайп на тач-устройствах
        let touchX = null;
        figure.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
        figure.addEventListener('touchend', (e) => {
          if (touchX === null) return;
          const dx = e.changedTouches[0].clientX - touchX;
          if (Math.abs(dx) > 40) goTo(current + (dx < 0 ? 1 : -1));
          touchX = null;
        });

        // стрелки клавиатуры, когда в фокусе сама галерея
        figure.tabIndex = 0;
        figure.setAttribute('role', 'group');
        figure.setAttribute('aria-label', 'Фотогалерея кейса');
        figure.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
        });
      }
    }

    probe(1);
  });

  /* ---------- Аккордеон ---------- */
  $$('#acc .acc__item').forEach((item) => {
    const q = $('.acc__q', item);
    const a = $('.acc__a', item);
    q.addEventListener('click', () => {
      const open = item.classList.contains('is-open');
      $$('#acc .acc__item.is-open').forEach((other) => {
        other.classList.remove('is-open');
        $('.acc__q', other).setAttribute('aria-expanded', 'false');
        $('.acc__a', other).style.height = '0px';
      });
      if (!open) {
        item.classList.add('is-open');
        q.setAttribute('aria-expanded', 'true');
        a.style.height = a.scrollHeight + 'px';
      }
    });
  });
  window.addEventListener('resize', () => {
    const open = $('#acc .acc__item.is-open');
    if (open) $('.acc__a', open).style.height = $('.acc__a', open).scrollHeight + 'px';
  });

  /* ---------- Маска телефона (общая для всех форм) ---------- */
  function applyPhoneMask(input, { allowText = false } = {}) {
    if (!input) return;
    input.addEventListener('input', () => {
      const v = input.value;
      if (allowText && (v.startsWith('@') || /[a-zA-Zа-яА-Я]/.test(v))) return; // Telegram-ник не трогаем
      let d = v.replace(/\D/g, '');
      if (!d) { input.value = ''; return; }
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d[0] !== '7') d = '7' + d;
      d = d.slice(0, 11);
      let out = '+7';
      if (d.length > 1) out += ' (' + d.slice(1, 4);
      if (d.length >= 5) out += ') ' + d.slice(4, 7);
      if (d.length >= 8) out += '-' + d.slice(7, 9);
      if (d.length >= 10) out += '-' + d.slice(9, 11);
      input.value = out;
    });
  }
  applyPhoneMask($('#phone'), { allowText: true }); // «Телефон или Telegram» — буквы/@ не трогаем

  /* ---------- Отправка форм: почта (EmailJS) + Telegram (Cloudflare Worker) — общее для всех форм ---------- */
  const FORMS_CFG = window.LANMEI_FORMS_CONFIG || {};
  if (window.emailjs && FORMS_CFG.emailjs && !FORMS_CFG.emailjs.publicKey.startsWith('ЗАМЕНИТЕ')) {
    emailjs.init({ publicKey: FORMS_CFG.emailjs.publicKey });
  }

  // templateId по умолчанию — шаблон брифа; для других форм передаётм свой,
  // чтобы в письме не оставалось пустых строк от чужих полей
  async function sendToEmail(data, templateId) {
    const tid = templateId || (FORMS_CFG.emailjs && FORMS_CFG.emailjs.templateId);
    if (!window.emailjs || !FORMS_CFG.emailjs || !tid || tid.startsWith('ЗАМЕНИТЕ')) {
      throw new Error('EmailJS не настроен');
    }
    return emailjs.send(FORMS_CFG.emailjs.serviceId, tid, data);
  }

  async function sendToTelegram(data) {
    if (!FORMS_CFG.telegramWorkerUrl || FORMS_CFG.telegramWorkerUrl.startsWith('ЗАМЕНИТЕ')) {
      throw new Error('Telegram-релей не настроен');
    }
    const res = await fetch(FORMS_CFG.telegramWorkerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Telegram relay ответил ошибкой: ' + res.status);
    return res;
  }

  // box — элемент .briefform__ok с <b> заголовком и <span> текстом внутри
  function showFormResult(box, ok, title, text) {
    $('b', box).textContent = title;
    $('span', box).textContent = text;
    box.classList.toggle('is-error', !ok);
    box.classList.add('is-visible');
    setTimeout(() => box.classList.remove('is-visible'), 7000);
  }

  /* ---------- Подсказка о пороге $5 000 ---------- */
  const budget = $('#budget');
  const hint = $('#briefHint');
  if (budget && hint) {
    budget.addEventListener('change', () => {
      hint.hidden = budget.value !== 'до $5 000';
    });
  }

  /* ---------- Бриф: отправка на почту (EmailJS) + в Telegram (Cloudflare Worker) ---------- */
  const leadForm = $('#leadForm');
  if (leadForm) {
    const submitBtn = $('button[type="submit"]', leadForm);
    const required = [
      { sel: '#name', min: 2 },
      { sel: '#phone', min: 6 },
      { sel: '#sku', min: 2 }
    ];

    function validate(input, min) {
      const valid = input.value.trim().length >= min;
      input.closest('.field').classList.toggle('is-error', !valid);
      input.setAttribute('aria-invalid', String(!valid));
      return valid;
    }

    // проверяем по blur, а не только на сабмите: ошибка видна сразу после поля
    required.forEach(({ sel, min }) => {
      const input = $(sel);
      input.addEventListener('blur', () => {
        if (input.value.trim()) validate(input, min);
      });
    });

    leadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      let firstBad = null;

      required.forEach(({ sel, min }) => {
        const input = $(sel);
        if (!validate(input, min) && !firstBad) firstBad = input;
      });

      if (firstBad) { firstBad.focus(); return; }

      // honeypot: если скрытое поле заполнено — это бот, тихо "успешно" выходим
      const hp = $('#website');
      if (hp && hp.value.trim()) {
        leadForm.reset();
        return;
      }

      submitBtn.classList.add('is-loading');

      const data = {
        formType: 'Бриф с сайта Lanmei',
        name: $('#name').value,
        phone: $('#phone').value,
        sku: $('#sku').value,
        budget: budget.value,
        scheme: $('#scheme').value,
        msg: $('#msg').value
      };

      const results = await Promise.allSettled([sendToEmail(data), sendToTelegram(data)]);
      const anyOk = results.some((r) => r.status === 'fulfilled');
      results.forEach((r) => { if (r.status === 'rejected') console.warn('Отправка брифа:', r.reason); });

      submitBtn.classList.remove('is-loading');

      if (anyOk) {
        showFormResult($('#leadOk'), true, 'Бриф отправлен', 'Ответим в течение 2 часов, смету пришлём за 48 часов.');
        leadForm.reset();
        hint.hidden = true;
      } else {
        showFormResult($('#leadOk'), false, 'Не получилось отправить', 'Напишите нам напрямую в Telegram или на lanmeiltd_sale2@163.com.');
      }
    });

    $$('.field input, .field textarea', leadForm).forEach((el) => {
      el.addEventListener('input', () => el.closest('.field').classList.remove('is-error'));
    });
  }

  /* ---------- Модалка: обратный звонок ---------- */
  const callbackModal = $('#callbackModal');
  const openCallbackBtn = $('#openCallback');
  if (callbackModal && openCallbackBtn) {
    const closeBtns = $$('[data-modal-close]', callbackModal);
    const cbForm = $('#callbackForm');
    const cbPhone = $('#cbPhone');
    const cbName = $('#cbName');
    let lastFocused = null;

    applyPhoneMask(cbPhone); // строго телефон, без исключения под Telegram-ник

    function onKeydown(e) {
      if (e.key === 'Escape') closeCallback();
    }

    function openCallback() {
      lastFocused = document.activeElement;
      callbackModal.hidden = false;
      setTimeout(() => callbackModal.classList.add('is-open'), 10);
      document.body.classList.add('modal-open');
      cbName.focus();
      document.addEventListener('keydown', onKeydown);
    }

    function closeCallback() {
      callbackModal.classList.remove('is-open');
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKeydown);
      setTimeout(() => { callbackModal.hidden = true; }, 350);
      if (lastFocused) lastFocused.focus();
    }

    openCallbackBtn.addEventListener('click', openCallback);
    closeBtns.forEach((b) => b.addEventListener('click', closeCallback));

    function phoneValid() {
      const digits = cbPhone.value.replace(/\D/g, '');
      return digits.length === 11 && digits[0] === '7';
    }

    function validateCbPhone() {
      const valid = phoneValid();
      cbPhone.closest('.field').classList.toggle('is-error', !valid);
      cbPhone.setAttribute('aria-invalid', String(!valid));
      return valid;
    }

    cbPhone.addEventListener('blur', () => { if (cbPhone.value.trim()) validateCbPhone(); });
    cbPhone.addEventListener('input', () => cbPhone.closest('.field').classList.remove('is-error'));

    cbForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateCbPhone()) { cbPhone.focus(); return; }

      // honeypot
      const hp = $('#cbWebsite');
      if (hp && hp.value.trim()) { cbForm.reset(); closeCallback(); return; }

      const submitBtn = $('button[type="submit"]', cbForm);
      submitBtn.classList.add('is-loading');

      const data = {
        formType: 'Обратный звонок с сайта Lanmei',
        name: cbName.value.trim() || 'Не указано',
        phone: cbPhone.value
      };

      const cbTemplateId = FORMS_CFG.emailjs && FORMS_CFG.emailjs.templateIdCallback;
      const results = await Promise.allSettled([sendToEmail(data, cbTemplateId), sendToTelegram(data)]);
      const anyOk = results.some((r) => r.status === 'fulfilled');
      results.forEach((r) => { if (r.status === 'rejected') console.warn('Обратный звонок:', r.reason); });

      submitBtn.classList.remove('is-loading');

      if (anyOk) {
        showFormResult($('#callbackOk'), true, 'Заявка принята', 'Перезвоним в течение 15 минут в рабочее время.');
        cbForm.reset();
      } else {
        showFormResult($('#callbackOk'), false, 'Не получилось отправить', 'Напишите нам напрямую в Telegram: t.me/lanmei_logistics.');
      }
    });
  }
})();
