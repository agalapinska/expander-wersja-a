/* ============================================================
   EXPANDER — warstwa animacji i interakcji (Pencil export hydrator)
   Nakłada zachowania na statyczny eksport: reveale, hover, przyklejony
   nagłówek, działający kalkulator, akordeony, realne pola formularza.
   Nie modyfikuje struktury dokumentu poza dodaniem sterowania.
   ============================================================ */
(function () {
  'use strict';

  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.querySelector('[data-pencil-name="localhost"]') || document.body;

  /* ---------------- narzędzia ---------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var name = function (el) { return el.getAttribute('data-pencil-name') || ''; };
  var txt = function (el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); };
  var isLeaf = function (el) { return el.children.length === 0; };
  var css = function (el, p) { return el.style[p] || ''; };

  var ALL = $$('div', root);
  var LEAVES = ALL.filter(function (el) { return isLeaf(el) && txt(el); });

  /** pierwszy liść, którego tekst pasuje do wzorca */
  function leafOf(pattern, scope) {
    var pool = scope ? $$('div', scope).filter(function (e) { return isLeaf(e) && txt(e); }) : LEAVES;
    for (var i = 0; i < pool.length; i++) {
      var t = txt(pool[i]);
      if (pattern instanceof RegExp ? pattern.test(t) : t === pattern) return pool[i];
    }
    return null;
  }
  function leavesOf(pattern, scope) {
    var pool = scope ? $$('div', scope).filter(function (e) { return isLeaf(e) && txt(e); }) : LEAVES;
    return pool.filter(function (e) {
      var t = txt(e);
      return pattern instanceof RegExp ? pattern.test(t) : t === pattern;
    });
  }
  /** najbliższy przodek zawierający dany tekst */
  function upTo(el, pattern, max) {
    var n = el, i = 0;
    while (n && n !== root && i++ < (max || 12)) {
      n = n.parentElement;
      if (n && pattern.test(txt(n))) return n;
    }
    return null;
  }

  /* --------- liczby w polskim formacie --------- */
  var SEP = '[\\u00a0\\u202f ]';
  var NUM_RE = new RegExp('-?\\d+(?:' + SEP + '\\d{3})+(?:,\\d+)?|-?\\d+(?:,\\d+)?');
  var SEP_RE = /[\u00a0\u202f ]/g;
  function parsePL(s) {
    var m = String(s).match(NUM_RE);
    if (!m) return null;
    var v = parseFloat(m[0].replace(SEP_RE, '').replace(',', '.'));
    return isNaN(v) ? null : v;
  }
  function fmtPL(v, decimals, grouped) {
    var s = Math.abs(v).toLocaleString('pl-PL', {
      minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0,
      useGrouping: grouped !== false
    }).replace(SEP_RE, ' ');
    return (v < 0 ? '-' : '') + s;
  }
  /** podmienia liczbe w tekscie zachowujac jego oryginalny format */
  function mimic(orig, val) {
    var m = String(orig).match(NUM_RE);
    if (!m) return String(orig);
    var tok = m[0];
    var grouped = /[\u00a0\u202f ]/.test(tok);
    var dec = (tok.split(',')[1] || '').length;
    return orig.replace(NUM_RE, fmtPL(val, dec, grouped));
  }
  /** animowana podmiana liczby */
  function tweenText(el, toVal, template) {
    var tpl = template || el.getAttribute('data-fx-tpl') || el.textContent;
    if (!el.getAttribute('data-fx-tpl')) el.setAttribute('data-fx-tpl', tpl);
    var from = el.__fxVal != null ? el.__fxVal : (parsePL(el.textContent) || 0);
    el.__fxVal = toVal;
    if (RM || document.hidden) { el.textContent = mimic(tpl, toVal); return; }
    cancelAnimationFrame(el.__fxRaf);
    var t0 = performance.now(), dur = 420;
    (function step(t) {
      var p = Math.min((t - t0) / dur, 1);
      p = 1 - Math.pow(1 - p, 3);
      el.textContent = mimic(tpl, from + (toVal - from) * p);
      if (p < 1) el.__fxRaf = requestAnimationFrame(step);
    })(t0);
  }

  /* ============================================================
     1. REVEAL PRZY SCROLLU
     ============================================================ */
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('fx-in');
      io.unobserve(e.target);
      if (e.target.__fxOnShow) e.target.__fxOnShow();
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

  function reveal(el, delay, dist) {
    if (!el || el.classList.contains('fx-rv')) return;
    el.classList.add('fx-rv');
    if (delay) el.style.setProperty('--fx-d', delay + 'ms');
    if (dist != null) el.style.setProperty('--fx-rv-y', dist + 'px');
    io.observe(el);
  }

  function setupReveals() {
    var sections = $$('[data-pencil-name="section"], [data-pencil-name="aside"]', root);
    sections.forEach(function (sec, si) {
      // pierwszy ekran pokazujemy od razu — bez migotania nad zakładką
      if (sec.getBoundingClientRect().top < innerHeight * 0.9) {
        // hero: delikatne wejście z opóźnieniem, ale bez czekania na scroll
        var kids0 = revealUnits(sec);
        kids0.forEach(function (k, i) {
          k.classList.add('fx-rv');
          k.style.setProperty('--fx-d', (80 + i * 90) + 'ms');
          // setTimeout, nie rAF — w karcie w tle rAF nie chodzi i treść zostałaby ukryta
          setTimeout(function () { k.classList.add('fx-in'); }, 20);
        });
        return;
      }
      var kids = revealUnits(sec);
      if (kids.length > 1) kids.forEach(function (k, i) { reveal(k, i * 85); });
      else reveal(sec, 0);
    });
    // karty i artykuły — własny, drobniejszy rytm
    $$('[data-pencil-name="article"]', root).forEach(function (a, i) { reveal(a, (i % 3) * 90, 26); });
  }

  /** rozbija sekcję na sensowne jednostki animacji */
  function revealUnits(sec) {
    var node = sec, guard = 0;
    while (node && guard++ < 4) {
      var kids = Array.prototype.filter.call(node.children, function (c) {
        return name(c) !== 'spacer' && c.getBoundingClientRect().height > 6;
      });
      if (kids.length >= 2) return kids;
      if (kids.length === 1) { node = kids[0]; continue; }
      break;
    }
    return [sec];
  }

  /* ============================================================
     2. NAGŁÓWEK + PASEK POSTĘPU
     ============================================================ */
  function setupHeader() {
    var header = $('[data-pencil-name="header"]', root);
    if (header) header.classList.add('fx-sticky');

    var bar = document.createElement('div');
    bar.id = 'fx-progress';
    document.body.appendChild(bar);

    var last = 0, ticking = false;
    function onScroll() {
      var y = scrollY;
      var max = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
      if (header) {
        header.classList.toggle('fx-scrolled', y > 8);
        // chowamy przy scrollu w dół, pokazujemy przy powrocie
        if (y > 420 && y > last + 6) header.classList.add('fx-hidden');
        else if (y < last - 6 || y < 200) header.classList.remove('fx-hidden');
      }
      last = y;
      ticking = false;
    }
    addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();
  }

  /* ============================================================
     3. PRZYCISKI, KARTY, LINKI
     ============================================================ */
  var CTA = /^(Zadzwoń|Szukaj|Porównaj oferty banków|Oblicz swoją zdolność kredytową|Porównaj aktualne oferty|Zapytaj o kontakt|Znajdź nieruchomość|Oferta dla firm|Dobierz ochronę|Poznaj inwestycje|Sprawdź finansowanie|Pokaż oferty|Znajdź najbliżej mnie|Policz swoją ratę|Sprawdź moje przyszłe dochody|Sprawdź swój rachunek|Umów rozmowę|Wyślij)/i;
  var ARROW_LINK = /(→|↗|›)\s*$|^(Czytaj|Przeczytaj poradnik|Wszystkie poradniki|Wszystkie oddziały|Sprawdź korzyści)/i;
  var NAV = ['Klient indywidualny', 'Dla firm', 'Oddziały', 'Kontakt', 'Dołącz do nas', 'Kredyty',
    'Nieruchomości', 'Ubezpieczenia', 'Poradniki', 'Kalkulatory', 'Porównywarki ofert', 'Rabaty i promocje'];

  function isRedish(c) { return /^#(e2212|de1f2|c41a1|b4141|8f0f1|f2373)/i.test((c || '').replace(/\s/g, '')); }

  function tagButton(el) {
    if (!el || el.classList.contains('fx-btn')) return;
    el.classList.add('fx-btn');
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.addEventListener('pointerdown', function (e) {
      if (RM) return;
      var r = el.getBoundingClientRect();
      var d = Math.max(r.width, r.height) * 2.2;
      var s = document.createElement('span');
      s.className = 'fx-ripple';
      s.style.width = s.style.height = d + 'px';
      s.style.left = (e.clientX - r.left) + 'px';
      s.style.top = (e.clientY - r.top) + 'px';
      el.appendChild(s);
      setTimeout(function () { s.remove(); }, 620);
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });
  }

  function setupInteractive() {
    // przyciski nazwane wprost przez Pencil
    $$('[data-pencil-name^="Button"]', root).forEach(tagButton);

    // kontenery z czerwonym tłem / obramowaniem i krótkim tekstem CTA
    LEAVES.forEach(function (leaf) {
      var t = txt(leaf);
      if (!CTA.test(t) || t.length > 46) return;
      var host = leaf, up = 0;
      while (host && up++ < 4) {
        var st = host.style;
        if (st.borderRadius && (st.backgroundColor || st.border || st.borderWidth) && host.getBoundingClientRect().height < 90) {
          tagButton(host); return;
        }
        host = host.parentElement;
      }
      tagButton(leaf);
    });

    // linki ze strzałką
    LEAVES.forEach(function (leaf) {
      var t = txt(leaf);
      if (!ARROW_LINK.test(t) || t.length > 60 || leaf.classList.contains('fx-btn')) return;
      if (upTo(leaf, /^$/, 1)) { /* no-op */ }
      leaf.classList.add('fx-link');
      leaf.setAttribute('tabindex', '0');
    });

    // nawigacja + stopka
    LEAVES.forEach(function (leaf) {
      var t = txt(leaf);
      if (NAV.indexOf(t) === -1) return;
      if (leaf.closest('.fx-btn')) return;
      leaf.classList.add('fx-link');
      leaf.setAttribute('tabindex', '0');
      leaf.addEventListener('click', function () { navGo(t); });
    });
    $$('[data-pencil-name="li"]', root).forEach(function (li) {
      li.classList.add('fx-link');
      li.setAttribute('tabindex', '0');
    });

    // karty
    $$('[data-pencil-name="article"]', root).forEach(function (a) { a.classList.add('fx-card'); });
    ALL.forEach(function (el) {
      if (el.classList.contains('fx-card') || el.classList.contains('fx-btn')) return;
      var st = el.style;
      var rr = parseFloat(st.borderRadius) || 0;
      if (rr < 8) return;
      if (!(st.border || st.borderWidth || st.boxShadow)) return;
      if (name(el) === 'form') return; // pasek wyszukiwania nie unosi sie pod kursorem
      if (el.querySelector('[data-pencil-name="input"], [data-pencil-name="form"], [data-pencil-name="select"], .fx-input')) return;
      if (el.querySelector('.fx-card')) return;
      var r = el.getBoundingClientRect();
      if (r.width > 560 || r.height > 460 || r.height < 40) return;
      var t = txt(el);
      if (t.length < 12 || t.length > 420) return;
      el.classList.add('fx-card');
      el.setAttribute('tabindex', '0');
    });

    // zdjęcia — powiększenie w karcie
    ALL.forEach(function (el) {
      if (!/url\(/.test(el.style.backgroundImage || '')) return;
      var card = el.closest('.fx-card');
      if (card) { el.classList.add('fx-photo-inner'); card.classList.add('fx-photo'); }
      else if (el.getBoundingClientRect().width > 120) el.classList.add('fx-photo', 'fx-photo-self');
    });
  }

  /* ---- przewijanie do sekcji z nawigacji ---- */
  var NAV_TARGETS = {
    'Kalkulatory': /Kalkulator raty|Policz ratę w dziesięć/i,
    'Nieruchomości': /Znajdź miejsce, które pasuje|Wybierz swój wymarzony dom/i,
    'Kontakt': /Zostaw do siebie kontakt|Zacznijmy od Twoich liczb/i,
    'Oddziały': /Mamy oddziały w całej Polsce/i,
    'Poradniki': /Wiedza przed ważną decyzją/i,
    'Porównywarki ofert': /Porównujemy oferty|Ta sama kwota|Rozpiętość rat/i,
    'Kredyty': /Kalkulator raty|Trzy kroki zamiast/i,
    'Ubezpieczenia': /zabezpieczyć bliskich|Ubezpieczenia/i,
    'Dołącz do nas': /Porozmawiajmy o Twojej sytuacji|Zacznijmy od Twoich liczb/i,
    'Dla firm': /Rozwijam firmę|Oferta dla firm/i
  };
  function navGo(label) {
    var re = NAV_TARGETS[label];
    if (!re) return;
    var hit = leafOf(re);
    if (!hit) return;
    var sec = hit.closest('[data-pencil-name="section"]') || hit;
    var y = sec.getBoundingClientRect().top + scrollY - 76;
    scrollTo({ top: y, behavior: RM ? 'auto' : 'smooth' });
  }

  /* ============================================================
     4. KALKULATOR — realne suwaki i przeliczanie
     ============================================================ */
  var sliders = [];

  /** liczba z jednostka: "150 tys." -> 150000, "1,2 mln" -> 1200000 */
  function parseUnit(str) {
    var v = parsePL(str);
    if (v == null) return null;
    if (/mln|milion/i.test(str)) v *= 1e6;
    else if (/tys/i.test(str)) v *= 1e3;
    return v;
  }

  function setupSliders() {
    var tracks = $$('[data-pencil-name="input"]', root).filter(function (el) {
      var h = parseFloat(el.style.height) || 0;
      return h >= 2 && h <= 12 && isLeaf(el);
    });

    tracks.forEach(function (track) {
      var host = track.parentElement;
      if (!host) return;
      var labelRow = host.querySelector('[data-pencil-name="label"]');
      if (!labelRow) return;
      var labelLeaves = $$('div', labelRow).filter(function (e) { return isLeaf(e) && txt(e); });
      if (labelLeaves.length < 2) return;
      var nameEl = labelLeaves[0], valEl = labelLeaves[labelLeaves.length - 1];

      // rzad z wartoscia minimalna i maksymalna tuz pod suwakiem
      var bounds = track.nextElementSibling;
      while (bounds && !$$('div', bounds).filter(function (e) { return isLeaf(e) && txt(e); }).length) bounds = bounds.nextElementSibling;
      var bl = bounds ? $$('div', bounds).filter(function (e) { return isLeaf(e) && txt(e); }) : [];
      if (bl.length < 2) return;
      var min = parseUnit(txt(bl[0])), max = parseUnit(txt(bl[bl.length - 1]));
      var val = parseUnit(txt(valEl));
      if (min == null || max == null || val == null || max <= min) return;
      if (val < min || val > max) val = (min + max) / 2;

      var dec = (txt(valEl).split(',')[1] || '').replace(/\D+$/, '').length;
      var range = max - min;
      var step = dec > 0 ? 0.05 : range > 100000 ? 5000 : range > 5000 ? 1000 : range > 100 ? 10 : 1;

      // wypelnienie: albo gotowy gradient z Pencil, albo dokladany pasek
      var grad = (track.style.backgroundImage || '').match(/linear-gradient\(90deg,\s*([^\s]+)[^,]*,\s*([^\s]+)/);
      var cFill = grad ? grad[1].replace(/,$/, '') : '#e22128';
      var cRest = grad ? grad[2].replace(/,$/, '') : (track.style.backgroundColor || '#e4e7eb');
      var fillEl = null;
      if (!grad) {
        if (!track.style.position) track.style.position = 'relative';
        track.style.overflow = 'hidden';
        fillEl = document.createElement('span');
        fillEl.className = 'fx-fill';
        fillEl.style.cssText = 'position:absolute;left:0;top:0;bottom:0;border-radius:inherit;background:' + cFill;
        track.appendChild(fillEl);
      }

      // uchwyt: istniejacy z makiety albo dorobiony
      var thumb = $$('[data-pencil-name="Icon"]', host).filter(function (e) {
        return e.style.position === 'absolute' && /50%/.test(e.style.borderRadius || '');
      })[0];
      var thumbMade = false;
      if (!thumb) {
        thumb = document.createElement('span');
        thumb.className = 'fx-thumb-made';
        thumb.style.cssText = 'position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid ' +
          cFill + ';box-shadow:0 2px 6px rgba(14,20,32,.25);z-index:4';
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.appendChild(thumb);
        thumbMade = true;
      }

      host.classList.add('fx-slider-host');
      track.classList.add('fx-track');
      thumb.classList.add('fx-thumb');

      var input = document.createElement('input');
      input.type = 'range';
      input.className = 'fx-range';
      input.min = min; input.max = max; input.step = step; input.value = val;
      input.setAttribute('aria-label', txt(nameEl));
      host.appendChild(input);

      var S = {
        key: txt(nameEl), input: input, track: track, thumb: thumb, valEl: valEl,
        min: min, max: max, tpl: txt(valEl),
        value: function () { return parseFloat(input.value); }
      };
      sliders.push(S);

      function paint(animateText) {
        var v = parseFloat(input.value);
        var p = (v - min) / range;
        var pct = (p * 100).toFixed(2) + '%';
        if (fillEl) fillEl.style.width = pct;
        else track.style.backgroundImage = 'linear-gradient(90deg, ' + cFill + ' ' + pct + ', ' + cRest + ' ' + pct + ')';
        var tw = thumb.offsetWidth || 16;
        var left = p * (track.offsetWidth - tw);
        thumb.style.left = left + 'px';
        if (thumbMade) thumb.style.top = (track.offsetTop + track.offsetHeight / 2 - tw / 2) + 'px';
        input.style.top = (track.offsetTop - 13) + 'px';
        if (animateText) tweenText(valEl, v, S.tpl);
        else valEl.textContent = mimic(S.tpl, v);
      }
      S.paint = paint;

      input.addEventListener('input', function () { paint(false); recalc(); });
      input.addEventListener('pointerdown', function () { host.classList.add('fx-drag'); });
      addEventListener('pointerup', function () { host.classList.remove('fx-drag'); });
      paint(false);
      addEventListener('resize', function () { paint(false); }, { passive: true });
    });

    if (sliders.length) setupOutputs();
  }

  /* --- wyjścia kalkulatora --- */
  var OUT = {};
  function setupOutputs() {
    var scope = sliders[0].track.closest('[data-pencil-name="section"]') || root;

    function outAfter(re) {
      var lab = leafOf(re, scope);
      if (!lab) return null;
      var sib = lab.nextElementSibling;
      while (sib) {
        var cand = isLeaf(sib) && parsePL(txt(sib)) != null ? sib
          : $$('div', sib).filter(function (e) { return isLeaf(e) && parsePL(txt(e)) != null; })[0];
        if (cand) return cand;
        sib = sib.nextElementSibling;
      }
      // wartość może stać nad etykietą (układ kolumnowy)
      var prev = lab.previousElementSibling;
      if (prev && isLeaf(prev) && parsePL(txt(prev)) != null) return prev;
      return null;
    }

    OUT.rata = outAfter(/^(Orientacyjna rata miesięczna|SZACOWANA RATA MIESIĘCZNA|Szacowana rata miesięczna)$/i);
    OUT.total = outAfter(/^(CAŁKOWITY KOSZT|Całkowity koszt)$/i);
    OUT.interest = outAfter(/^(ODSETKI|Odsetki)$/i);

    var low = leafOf(/^najniższy bank$/i, scope);
    var high = leafOf(/^najdroższy bank$/i, scope);
    OUT.low = low ? low.previousElementSibling : null;
    OUT.high = high ? high.previousElementSibling : null;
    OUT.spread = leafOf(/^Różnica .* w całym okresie$/i, scope);
    if (OUT.spread) OUT.spreadTpl = txt(OUT.spread);

    Object.keys(OUT).forEach(function (k) {
      var el = OUT[k];
      if (el && el.nodeType === 1) el.setAttribute('data-fx-tpl', txt(el));
    });
    recalc(true);
  }

  function sliderVal(re, dflt) {
    for (var i = 0; i < sliders.length; i++) if (re.test(sliders[i].key)) return sliders[i].value();
    return dflt;
  }

  function pmt(K, annualRate, years) {
    var r = annualRate / 100 / 12, n = years * 12;
    if (r <= 0) return K / n;
    return K * r / (1 - Math.pow(1 + r, -n));
  }

  function recalc(initial) {
    var K = sliderVal(/Kwota kredytu/i, 450000);
    var years = sliderVal(/Okres spłaty/i, 25);
    var rate = sliderVal(/Oprocentowanie/i, 7.19);
    var m = pmt(K, rate, years), n = years * 12;

    if (OUT.rata) tweenText(OUT.rata, m);
    if (OUT.total) tweenText(OUT.total, m * n);
    if (OUT.interest) tweenText(OUT.interest, m * n - K);

    // rozpiętość ofert w 16 bankach — odchylenia od stawki bazowej
    if (OUT.low && OUT.high) {
      var lo = pmt(K, rate - 0.11, years), hi = pmt(K, rate + 0.18, years);
      tweenText(OUT.low, lo);
      tweenText(OUT.high, hi);
      if (OUT.spread && OUT.spreadTpl) {
        var d = hi - lo;
        var parts = OUT.spreadTpl.split('·');
        var a = mimic(parts[0], d);
        var b = parts[1] ? mimic(parts[1], d * n) : '';
        OUT.spread.textContent = b ? a + '·' + b : a;
        if (!initial && !RM) { OUT.spread.classList.remove('fx-num-flash'); void OUT.spread.offsetWidth; OUT.spread.classList.add('fx-num-flash'); }
      }
    }
  }

  /* ============================================================
     5. AKORDEONY
     ============================================================ */
  function setupAccordions() {
    var CARET = /^[\u203a\u25b8\u25be\u25b6]/;
    var found = [];

    // wariant A: strzalka jest czescia tekstu ("\u203a Zalozenia wyliczenia")
    LEAVES.forEach(function (el) {
      if (CARET.test(txt(el)) && el.parentElement) found.push({ sum: el, container: el.parentElement, inText: true });
    });
    // wariant B: strzalka siedzi w nazwie warstwy z Pencil
    ALL.forEach(function (c) {
      if (!CARET.test(name(c))) return;
      var first = Array.prototype.slice.call(c.children).filter(function (x) { return txt(x); })[0];
      if (first && !CARET.test(txt(first))) found.push({ sum: first, container: c, inText: false });
    });

    found.forEach(function (a) {
      var sum = a.sum, container = a.container;
      if (sum.classList.contains('fx-acc-sum')) return;
      var sibs = Array.prototype.slice.call(container.children);
      var body = sibs.slice(sibs.indexOf(sum) + 1).filter(function (c) { return name(c) !== 'spacer'; });
      if (!body.length) return;

      var holder = document.createElement('div');
      holder.className = 'fx-acc-body';
      holder.setAttribute('data-open', '0');
      container.insertBefore(holder, body[0]);
      body.forEach(function (b) { holder.appendChild(b); });
      holder.style.height = '0px';

      var caret = a.inText ? txt(sum).charAt(0) : '\u25b8';
      var label = txt(sum).replace(CARET, '').trim();
      var open = false;
      sum.classList.add('fx-acc-sum');
      sum.setAttribute('tabindex', '0');
      sum.setAttribute('role', 'button');
      sum.setAttribute('aria-expanded', 'false');
      sum.textContent = caret + ' ' + label;

      function toggle() {
        open = !open;
        holder.setAttribute('data-open', open ? '1' : '0');
        holder.style.height = open ? holder.scrollHeight + 'px' : holder.scrollHeight + 'px';
        requestAnimationFrame(function () { holder.style.height = open ? holder.scrollHeight + 'px' : '0px'; });
        sum.setAttribute('aria-expanded', open ? 'true' : 'false');
        sum.textContent = (open ? '\u25be' : caret) + ' ' + label;
      }
      sum.addEventListener('click', toggle);
      sum.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  }

  /* ============================================================
     6. REALNE POLA I FORMULARZE
     ============================================================ */
  function setupForms() {
    var PH = /^np\.|^Wpisz |^Napisz |^Podaj /i;
    var GREY = /^rgb\((1[0-9][0-9]|[6-9][0-9]),/;

    // pole tekstowe = kontener z jednym, szarym napisem-podpowiedzia
    ALL.forEach(function (el) {
      var st = el.style;
      if (!(st.borderRadius || st.border || st.borderWidth || st.backgroundColor)) return;
      if (el.classList.contains('fx-btn') || el.closest('.fx-btn')) return;
      var kids = Array.prototype.filter.call(el.children, function (c) { return isLeaf(c) && txt(c); });
      if (kids.length !== 1) return;
      var ph = kids[0], t = txt(ph);
      if (t.length > 40 || CTA.test(t)) return;
      var grey = GREY.test(getComputedStyle(ph).color);
      if (!PH.test(t) && !(grey && el.closest('[data-pencil-name="form"]'))) return;
      var r = el.getBoundingClientRect();
      if (r.height > 90 || r.height < 26 || r.width < 90) return;

      var input = document.createElement('input');
      input.type = /telefon|numer|600 000/i.test(t) ? 'tel' : 'text';
      input.className = 'fx-input';
      input.placeholder = t;
      input.style.fontSize = ph.style.fontSize || '';
      input.style.fontFamily = ph.style.fontFamily || '';
      ph.replaceWith(input);
      el.classList.add('fx-field');
      input.addEventListener('focus', function () { el.classList.add('fx-focus'); el.classList.remove('fx-invalid'); });
      input.addEventListener('blur', function () { el.classList.remove('fx-focus'); });
      el.addEventListener('click', function (e) { if (e.target !== input) input.focus(); });

      // pole obok przycisku-pigulki dostaje ten sam ksztalt, zeby rzad byl rowny
      var row = el.parentElement;
      if (row && row.style.flexDirection === 'row') {
        var pill = Array.prototype.filter.call(row.children, function (c) {
          return c !== el && parseFloat(getComputedStyle(c).borderTopLeftRadius) > 40;
        })[0];
        if (pill) {
          var h = el.getBoundingClientRect().height || 46;
          el.style.borderRadius = Math.round(h / 2) + 'px';
          var pl = parseFloat(getComputedStyle(el).paddingLeft) || 0;
          if (pl < 20) el.style.paddingLeft = '20px';
          el.classList.add('fx-field-pill');
        }
      }
    });

    // puste ramki nazwane "select" -> prawdziwa lista wyboru
    var TOPICS = ['Kredyt hipoteczny', 'Kredyt got\u00f3wkowy', 'Refinansowanie kredytu', 'Ubezpieczenie',
      'Zakup nieruchomo\u015bci', 'Finanse dla firm', 'Co\u015b innego'];
    $$('[data-pencil-name="select"]', root).forEach(function (box) {
      if (!isLeaf(box)) return;
      var sel = document.createElement('select');
      sel.className = 'fx-input fx-select';
      sel.style.cssText = 'height:100%;width:100%;padding:0 12px;font-size:14.5px;cursor:pointer';
      var first = document.createElement('option');
      first.value = ''; first.textContent = 'Wybierz temat'; first.disabled = true; first.selected = true;
      sel.appendChild(first);
      TOPICS.forEach(function (o) {
        var op = document.createElement('option');
        op.value = o; op.textContent = o; sel.appendChild(op);
      });
      box.appendChild(sel);
      box.classList.add('fx-field');
      sel.addEventListener('focus', function () { box.classList.add('fx-focus'); });
      sel.addEventListener('blur', function () { box.classList.remove('fx-focus'); });
    });

    // wysyłka formularzy kontaktowych
    $$('[data-pencil-name="form"]', root).forEach(function (form) {
      var inputs = $$('.fx-input', form).filter(function (i) { return i.tagName === 'INPUT'; });
      var submit = $$('.fx-btn', form).filter(function (b) { return /Zapytaj o kontakt|Wyślij|Umów/i.test(txt(b)); })[0]
        || $$('.fx-btn', form).pop();
      if (!submit) return;
      submit.addEventListener('click', function () {
        var bad = inputs.filter(function (i) { return !i.value.trim(); });
        var phone = inputs.filter(function (i) { return i.type === 'tel'; })[0];
        if (phone && phone.value.trim() && phone.value.replace(/\D/g, '').length < 9) bad.push(phone);
        // temat jest opcjonalny
        bad = bad.filter(function (i) { return !/opcjonalnie|Temat/i.test(i.placeholder); });
        if (bad.length) {
          bad.forEach(function (i) { i.closest('.fx-field').classList.add('fx-invalid'); });
          bad[0].focus();
          toast('Uzupełnij imię i numer telefonu.');
          return;
        }
        var label = txt(submit);
        submit.textContent = '';
        var done = document.createElement('div');
        done.textContent = '✓ Dziękujemy — oddzwonimy';
        done.style.cssText = 'font:600 15px Inter,system-ui,sans-serif;color:#fff';
        submit.appendChild(done);
        toast('Zgłoszenie przyjęte. Makieta — nic nie zostało wysłane.');
        inputs.forEach(function (i) { i.value = ''; });
        setTimeout(function () { submit.textContent = label; }, 3200);
      });
    });

    // pola wyszukiwarki oddziałów / miast
    $$('.fx-input', root).forEach(function (i) {
      i.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (!i.value.trim()) return;
        toast('Szukam: „' + i.value.trim() + '” — makieta, brak wyników.');
      });
    });
  }

  /* ---- chipy miast ---- */
  function setupChips() {
    var CITIES = ['Warszawa', 'Kraków', 'Wrocław', 'Poznań', 'Gdańsk', 'Katowice', 'Łódź', 'Lublin', 'Szczecin', 'Bydgoszcz', 'Białystok'];
    var found = [];
    CITIES.forEach(function (c) {
      leavesOf(c).forEach(function (el) {
        if (el.closest('.fx-btn') || el.closest('.fx-card')) return;
        var host = el.parentElement && el.parentElement.style.borderRadius ? el.parentElement : el;
        if (found.indexOf(host) > -1) return;
        found.push(host);
        host.classList.add('fx-chip');
        host.setAttribute('tabindex', '0');
        host.addEventListener('click', function () {
          found.forEach(function (f) { f.classList.remove('fx-on'); });
          host.classList.add('fx-on');
          toast('Oddziały: ' + c + ' — makieta, brak listy.');
        });
      });
    });
  }

  /* ---- rzedy, ktore odrobine nie mieszcza sie w kolumnie ----
     Eksport z Pencila ma sztywne szerokosci i flex-shrink:0, wiec uklad
     dwukolumnowy potrafi wystawac o kilkadziesiat pikseli. Pozwalamy
     najszerszemu dziecku sie skurczyc, zamiast pozwolic mu wystawac. */
  function fitRows() {
    ALL.forEach(function (row) {
      if (row.style.flexDirection !== 'row') return;
      var over = row.scrollWidth - row.clientWidth;
      if (over <= 0 || !row.clientWidth) return;
      if (over > row.clientWidth * 0.4) return; // to juz nie uklad, tylko rzad kart
      var kids = Array.prototype.filter.call(row.children, function (k) {
        return k.getBoundingClientRect().width > 40;
      }).sort(function (a, b) {
        return b.getBoundingClientRect().width - a.getBoundingClientRect().width;
      });
      for (var i = 0; i < kids.length && row.scrollWidth - row.clientWidth > 1; i++) {
        kids[i].style.flexShrink = '1';
        kids[i].style.minWidth = '0';
      }
    });
  }

  /* ---- sztywny canvas dopasowany do szerokosci okna ----
     Makieta ma stala szerokosc (A: 924 px, C: 1442 px). Zamiast ucinac
     zawartosc na weszym ekranie, skalujemy cala kompozycje przez zoom
     (w odroznieniu od transform zachowuje uklad, wysokosc i sticky). */
  function fitCanvas() {
    var canvasW = parseFloat(root.style.width);
    if (!canvasW || !window.CSS || !CSS.supports || !CSS.supports('zoom', '1')) return;
    function apply() {
      var vw = document.documentElement.clientWidth;
      var z = Math.min(1, vw / canvasW);
      // ponizej ~60% makieta robi sie nieczytelna — wtedy lepsze jest przewijanie
      root.style.zoom = z < 0.6 ? '' : z;
    }
    apply();
    addEventListener('resize', apply, { passive: true });
  }

  /* ---- poziome przewijanie przeciąganiem ----
     Tylko prawdziwe karuzele: rzad co najmniej trzech kart o zblizonej
     szerokosci. Zwykly uklad dwukolumnowy NIE moze dostac overflow-x,
     bo kontener przewijania przycina cienie i wystajace przyciski. */
  function setupScrollers() {
    ALL.forEach(function (el) {
      if (el.style.flexDirection !== 'row') return;
      if (el.closest('.fx-scroller')) return;
      var over = el.scrollWidth - el.clientWidth;
      if (over < 80) return;
      var kids = Array.prototype.filter.call(el.children, function (c) {
        return c.getBoundingClientRect().width > 40;
      });
      if (kids.length < 3) return;
      var ws = kids.map(function (k) { return k.getBoundingClientRect().width; });
      var wMin = Math.min.apply(null, ws), wMax = Math.max.apply(null, ws);
      if (wMax - wMin > wMax * 0.3) return;   // rozne szerokosci = uklad, nie karuzela
      if (el.getBoundingClientRect().width < 300) return;

      // miejsce na cienie kart w srodku kontenera przewijania
      var cs = getComputedStyle(el);
      var padY = parseFloat(cs.paddingTop) || 0;
      el.style.paddingTop = (padY + 18) + 'px';
      el.style.paddingBottom = ((parseFloat(cs.paddingBottom) || 0) + 24) + 'px';
      el.style.marginTop = ((parseFloat(cs.marginTop) || 0) - 18) + 'px';
      el.style.marginBottom = ((parseFloat(cs.marginBottom) || 0) - 24) + 'px';

      el.classList.add('fx-scroller');
      var down = false, x0 = 0, s0 = 0, moved = 0;
      el.addEventListener('pointerdown', function (e) {
        down = true; moved = 0; x0 = e.clientX; s0 = el.scrollLeft;
        el.classList.add('fx-dragging');
      });
      addEventListener('pointermove', function (e) {
        if (!down) return;
        var d = e.clientX - x0;
        moved = Math.max(moved, Math.abs(d));
        el.scrollLeft = s0 - d;
      });
      addEventListener('pointerup', function () {
        if (!down) return;
        down = false; el.classList.remove('fx-dragging');
      });
      el.addEventListener('click', function (e) { if (moved > 6) { e.stopPropagation(); e.preventDefault(); } }, true);
    });
  }

  /* ---- karty nieruchomosci: panel wyjezdzajacy od dolu ----
     Dane czytamy z podpisu na karcie ("Wroclaw . 68 m2 . 749 000 zl"),
     dokladamy typ i cene za metr. Panel jest czysto CSS-owy, wiec
     dziala takze na klonach kart w plynacych kolumnach. */
  function setupPropertyCards() {
    $$('[data-pencil-name="article"]', root).forEach(function (card) {
      if (card.querySelector('.fx-prop')) return;
      var leaves = $$('div', card).filter(function (e) { return isLeaf(e) && txt(e); });
      var metaEl = leaves.filter(function (e) { return /\d+\s*m²/.test(txt(e)); })[0];
      if (!metaEl) return;

      var parts = txt(metaEl).split('·').map(function (x) { return x.trim(); });
      if (parts.length < 3) return;
      var place = parts[0], area = parsePL(parts[1]), price = parsePL(parts[2]);
      if (!area || !price) return;

      var idx = leaves.indexOf(metaEl);
      var titleEl = idx > 0 ? leaves[idx - 1] : null;
      var title = titleEl ? txt(titleEl) : '';
      var kind = (/^dom\b/i.test(title) || area >= 110) ? 'Dom' : 'Mieszkanie';

      var caption = metaEl.parentElement;
      if (caption) caption.classList.add('fx-prop-orig');

      var panel = document.createElement('div');
      panel.className = 'fx-prop';
      panel.innerHTML =
        '<span class="fx-prop-kind">' + kind + '</span>' +
        '<div class="fx-prop-title">' + title + '</div>' +
        '<div class="fx-prop-place">' + place + '</div>' +
        '<div class="fx-prop-grid">' +
          '<div><b>' + fmtPL(area) + ' m²</b><span>metraż</span></div>' +
          '<div><b>' + fmtPL(price / area) + ' zł</b><span>za m²</span></div>' +
          '<div><b>' + fmtPL(price) + ' zł</b><span>cena</span></div>' +
        '</div>';
      card.appendChild(panel);
      card.classList.add('fx-prop-host');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', kind + ' ' + title + ', ' + place + ', ' + area + ' m², ' + fmtPL(price) + ' zł');
    });

    if (!$('.fx-prop-host')) return;

    // etykieta chodzaca za kursorem — delegacja, wiec obejmuje tez klony
    var chip = document.createElement('div');
    chip.id = 'fx-cursor';
    chip.textContent = 'Kliknij, żeby zobaczyć →';
    document.body.appendChild(chip);

    document.addEventListener('pointermove', function (e) {
      var host = e.target.closest && e.target.closest('.fx-prop-host');
      if (!host) { chip.classList.remove('fx-on'); return; }
      chip.style.left = e.clientX + 'px';
      chip.style.top = (e.clientY - 34) + 'px';
      chip.classList.add('fx-on');
    }, { passive: true });
    addEventListener('scroll', function () { chip.classList.remove('fx-on'); }, { passive: true });

    document.addEventListener('click', function (e) {
      var host = e.target.closest && e.target.closest('.fx-prop-host');
      if (!host) return;
      var t = host.querySelector('.fx-prop-title');
      toast('Oferta „' + (t ? t.textContent : 'nieruchomość') + '” — makieta, karta oferty nie jest podpięta.');
    });
  }

  /* ---- kolumny kafli, ktore powoli plyna w dol ----
     Kolumna z overflow:hidden i trescia wyzsza niz ramka dostaje
     bezszwowa petle. Zatrzymuje sie pod kursorem i na czas scrollowania. */
  var marquees = [];
  function setupMarquee() {
    if (RM) return;
    ALL.forEach(function (row) {
      if (row.style.flexDirection !== 'row') return;
      var cols = Array.prototype.filter.call(row.children, function (c) {
        return c.style.flexDirection === 'column' &&
               /hidden/.test(c.style.overflow || '') &&
               c.scrollHeight >= c.clientHeight - 2 &&
               c.children.length > 1;
      });
      if (cols.length < 2) return;

      cols.forEach(function (col, ci) {
        var gap = parseFloat(getComputedStyle(col).rowGap) || 12;
        var colH = col.clientHeight;

        var track = document.createElement('div');
        track.style.cssText = 'display:flex;flex-direction:column;flex-shrink:0;gap:' + gap + 'px';
        var originals = Array.prototype.slice.call(col.children);
        // kafle rozciagane przez flex-grow trzeba zamrozic na ich obecnej wysokosci,
        // bo w nieograniczonej sciezce zapadlyby sie do zera
        var heights = originals.map(function (c) { return c.offsetHeight; });
        originals.forEach(function (c, i) {
          if (parseFloat(getComputedStyle(c).flexGrow) > 0 && heights[i] > 0) {
            c.style.height = heights[i] + 'px';
            c.style.flex = '0 0 auto';
          }
          track.appendChild(c);
        });

        var outer = document.createElement('div');
        outer.className = 'fx-marquee';
        outer.style.cssText = 'display:flex;flex-direction:column;flex-shrink:0;gap:' + gap + 'px;will-change:transform';
        outer.appendChild(track);
        col.appendChild(outer);   // najpierw do DOM, inaczej pomiar wysokosci zwraca zero

        // krotka kolumna dostaje powtorzone kafle, zeby petla nigdy nie odslonila dziury
        var guard = 0;
        while (track.offsetHeight < colH + 8 && guard++ < 6) {
          originals.forEach(function (c) {
            var cp = c.cloneNode(true);
            cp.setAttribute('aria-hidden', 'true');
            track.appendChild(cp);
          });
        }

        var clone = track.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        outer.appendChild(clone);

        // offsetHeight, nie getBoundingClientRect: pod CSS zoom rect zwraca
        // przeskalowane piksele, a przesuwamy w nieprzeskalowanej przestrzeni elementu
        var span = track.offsetHeight + gap;
        if (span < 40) return;

        var dir = (ci === 1) ? -1 : 1;    // srodkowa kolumna plynie pod prad
        var m = {
          outer: outer, span: span, dir: dir,
          y: dir > 0 ? -span : 0,
          speed: 18,                      // ta sama predkosc w kazdej kolumnie
          hover: false, visible: true, scrolling: 0  // obserwator moze tylko wylaczyc ruch poza ekranem
        };
        marquees.push(m);

        col.addEventListener('pointerenter', function () { m.hover = true; });
        col.addEventListener('pointerleave', function () { m.hover = false; });
        col.addEventListener('focusin', function () { m.hover = true; });
        col.addEventListener('focusout', function () { m.hover = false; });

        var vis = new IntersectionObserver(function (es) {
          es.forEach(function (e) { m.visible = e.isIntersecting; });
        }, { threshold: 0 });
        vis.observe(col);

        addEventListener('resize', function () {
          m.span = track.offsetHeight + gap;
        }, { passive: true });
      });
    });

    if (!marquees.length) return;

    // scrollowanie strony wstrzymuje ruch, zeby nic nie konkurowalo z czytaniem
    var stopTimer;
    addEventListener('scroll', function () {
      marquees.forEach(function (m) { m.scrolling = 1; });
      clearTimeout(stopTimer);
      stopTimer = setTimeout(function () {
        marquees.forEach(function (m) { m.scrolling = 0; });
      }, 900);
    }, { passive: true });

    var prev = null;
    (function tick(t) {
      var dt = prev == null ? 0 : Math.min((t - prev) / 1000, 0.05);
      prev = t;
      marquees.forEach(function (m) {
        if (m.hover || m.scrolling || !m.visible) return;
        m.y += m.dir * m.speed * dt;
        // zawijamy tylko po stronie zgodnej z kierunkiem — inaczej oba warunki
        // wyzwalaja sie na przemian i kolumna stoi w miejscu
        if (m.dir > 0) { if (m.y >= 0) m.y -= m.span; }
        else if (m.y <= -m.span) { m.y += m.span; }
        m.outer.style.transform = 'translate3d(0,' + m.y.toFixed(2) + 'px,0)';
      });
      requestAnimationFrame(tick);
    })(0);
  }

  /* ---- animacja pasków porównania ---- */
  var pendingBars = [];
  function setupBars() {
    ALL.forEach(function (el) {
      if (!isLeaf(el)) return;
      if (el.closest('svg, [data-pencil-name="svg"], [data-pencil-name="Icon"]')) return; // ikony zostawiamy w spokoju
      var st = el.style;
      var h = parseFloat(st.height) || 0;
      if (!(h >= 4 && h <= 18)) return;
      if (!/px$/.test(st.width || '')) return;
      var w = parseFloat(st.width) || 0;
      if (w < 12) return;
      // uwaga: el.style.backgroundColor zwraca rgb(), wiec porownujemy surowy atrybut
      var raw = el.getAttribute('style') || '';
      if (!/#(e2212|de1f2|c41a1|b4141|f2373|e6c79a|8fb4c9)/i.test(raw)) return;
      el.style.width = '0px';
      void el.offsetWidth; // wymuszamy przeliczenie, zeby zwiniecie nie bylo animowane
      el.style.transition = 'width .9s cubic-bezier(.16,1,.3,1)';
      el.__fxOnShow = function () { el.style.width = w + 'px'; };
      var host = el.parentElement || el;
      host.__fxOnShow = el.__fxOnShow;
      io.observe(host);
      pendingBars.push(el);
    });
  }

  /* ============================================================
     7. DROBIAZGI: toast, powrót na górę
     ============================================================ */
  var toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'fx-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('fx-on');
    clearTimeout(toastEl.__t);
    toastEl.__t = setTimeout(function () { toastEl.classList.remove('fx-on'); }, 3400);
  }
  window.fxToast = toast;

  function setupTop() {
    var b = document.createElement('button');
    b.id = 'fx-top';
    b.setAttribute('aria-label', 'Wróć na górę strony');
    b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    document.body.appendChild(b);
    b.addEventListener('click', function () { scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' }); });
    addEventListener('scroll', function () { b.classList.toggle('fx-on', scrollY > 700); }, { passive: true });
  }

  /* ---- kliknięcia CTA bez celu: informacja zamiast ciszy ---- */
  function setupCtaFeedback() {
    $$('.fx-btn', root).forEach(function (b) {
      if (b.closest('[data-pencil-name="form"]')) return;
      b.addEventListener('click', function () {
        var t = txt(b);
        if (/Oblicz swoją zdolność|Policz swoją ratę|Porównaj oferty|Porównaj aktualne/i.test(t)) {
          var target = leafOf(/Kalkulator raty|Policz ratę w dziesięć/i);
          if (target) {
            var sec = target.closest('[data-pencil-name="section"]') || target;
            scrollTo({ top: sec.getBoundingClientRect().top + scrollY - 76, behavior: RM ? 'auto' : 'smooth' });
            return;
          }
        }
        if (/Zadzwoń|22 295/i.test(t)) { toast('22 295 44 44 — makieta, połączenie nie jest wykonywane.'); return; }
        if (/Szukaj|Znajdź/i.test(t)) return;
        toast('„' + t.slice(0, 40) + '” — makieta koncepcyjna.');
      });
    });
  }

  /* ============================================================
     START
     ============================================================ */
  function init() {
    try { setupHeader(); } catch (e) { console.warn('fx header', e); }
    try { setupInteractive(); } catch (e) { console.warn('fx interactive', e); }
    try { setupSliders(); } catch (e) { console.warn('fx sliders', e); }
    try { setupAccordions(); } catch (e) { console.warn('fx accordions', e); }
    try { setupForms(); } catch (e) { console.warn('fx forms', e); }
    try { setupChips(); } catch (e) { console.warn('fx chips', e); }
    try { fitRows(); } catch (e) { console.warn('fx fitRows', e); }
    try { setupScrollers(); } catch (e) { console.warn('fx scrollers', e); }
    try { setupBars(); } catch (e) { console.warn('fx bars', e); }
    try { setupReveals(); } catch (e) { console.warn('fx reveals', e); }
    try { setupPropertyCards(); } catch (e) { console.warn('fx property', e); }
    try { setupMarquee(); } catch (e) { console.warn('fx marquee', e); }
    try { setupTop(); } catch (e) { console.warn('fx top', e); }
    // gdyby IntersectionObserver nie zadziałał (karta w tle, stara przeglądarka),
    // paski porównania i tak muszą się pojawić — inaczej kolumna zostaje pusta
    setTimeout(function () {
      pendingBars.forEach(function (el) { if (el.style.width === '0px' && el.__fxOnShow) el.__fxOnShow(); });
    }, 5000);
    try { setupCtaFeedback(); } catch (e) { console.warn('fx cta', e); }
    try { fitCanvas(); } catch (e) { console.warn('fx fitCanvas', e); }
    document.body.classList.add('fx-ready');
    document.dispatchEvent(new CustomEvent('fx:ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
