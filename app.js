/* ==========================================================================
   DIGITAL GRAPHICS  |  app.js
   --------------------------------------------------------------------------
   Sin dependencias obligatorias. Lenis (CDN) es una mejora opcional: si no carga,
   la página usa el scroll nativo y todo sigue funcionando.

   Arquitectura
   - Un solo bucle requestAnimationFrame (sin listeners de scroll) lee la posición
     y alimenta "escenas" ligadas al scroll mediante variables CSS y transform.
   - IntersectionObserver para revelados, pausas y estados activos.
   - Todo el movimiento respeta prefers-reduced-motion (clase .rm en <html>).
   ========================================================================== */
(() => {
  'use strict';

  /* ---------- Utilidades ---------- */
  const doc = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIO = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const reduce = doc.classList.contains('rm');
  const mqDesktop = window.matchMedia('(min-width: 900px)');
  const mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const WA_NUMBER = '529991514270';
  const waURL = text => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let docH = doc.scrollHeight;

  /* Estado de scroll compartido */
  const S = { y: 0, raw: 0, vel: 0, dir: 1, lenis: null, ready: false };
  const ticks = [];            // funciones que corren en cada frame
  const scenes = [];           // escenas ligadas al scroll
  const sceneMap = new Map();
  const resizers = [];         // se ejecutan antes de medir escenas

  /* ---------- Escenas ligadas al scroll ---------- */
  const sceneIO = new IntersectionObserver(entries => {
    entries.forEach(e => { const sc = sceneMap.get(e.target); if (sc) sc.active = e.isIntersecting; });
  }, { rootMargin: '70% 0px 70% 0px' });

  function scene(el, update) {
    const sc = { el, update, top: 0, height: 0, active: false };
    scenes.push(sc);
    sceneMap.set(el, sc);
    sceneIO.observe(el);
    return sc;
  }

  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    resizers.forEach(fn => fn());
    scenes.forEach(sc => {
      const r = sc.el.getBoundingClientRect();
      sc.top = r.top + window.scrollY;
      sc.height = r.height;
    });
    docH = doc.scrollHeight;
  }

  let measureQueued = false;
  function queueMeasure() {
    if (measureQueued) return;
    measureQueued = true;
    requestAnimationFrame(() => { measureQueued = false; measure(); });
  }

  /* ---------- Bucle principal ---------- */
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(64, now - lastT);
    lastT = now;
    if (S.lenis) S.lenis.raf(now);
    const raw = S.lenis ? S.lenis.scroll : window.scrollY;
    S.vel = raw - S.raw;
    S.raw = raw;
    if (Math.abs(S.vel) > .1) S.dir = Math.sign(S.vel);
    S.y = S.lenis ? raw : lerp(S.y, raw, 1 - Math.exp(-dt / 80));
    for (let i = 0; i < ticks.length; i++) ticks[i](now, dt);
    for (let i = 0; i < scenes.length; i++) if (scenes[i].active) scenes[i].update(S.y, scenes[i]);
    requestAnimationFrame(frame);
  }

  /* ---------- Scroll suave (Lenis opcional) ---------- */
  function initLenis() {
    if (reduce || !window.Lenis) return;
    S.lenis = new window.Lenis({ lerp: 0.08, wheelMultiplier: 0.95, smoothWheel: true });
    S.lenis.stop();
  }

  function scrollToY(y) {
    if (S.lenis) S.lenis.scrollTo(y, { duration: 1.6, easing: easeIO });
    else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }

  function scrollToEl(el, offset = 0) {
    if (S.lenis) S.lenis.scrollTo(el, { offset, duration: 1.6, easing: easeIO });
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  function lockScroll(lock) {
    doc.classList.toggle('no-scroll', lock);
    if (S.lenis) (lock ? S.lenis.stop() : S.lenis.start());
  }

  /* ---------- Preloader ---------- */
  function initLoader() {
    return new Promise(resolve => {
      const el = $('#loader');
      if (!el) { resolve(); return; }
      const pctEl = $('#loader-pct');
      const msgEl = $('#loader-msg');
      const bars = $$('.loader__bars i', el);
      const msgs = ['Calibrando color', 'Cargando plotter', 'Preparando tu proyecto', 'Listo para imprimir'];
      const MIN = reduce ? 350 : 2700;
      const MAX = 7500;
      let loaded = document.readyState === 'complete';
      if (!loaded) window.addEventListener('load', () => { loaded = true; }, { once: true });
      const t0 = performance.now();
      let shown = 0;
      let lastMsg = -1;
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        pctEl.textContent = '100';
        el.classList.add('is-done');
        window.setTimeout(() => {
          doc.classList.remove('is-loading');
          window.scrollTo(0, 0);
          resolve();
        }, 420);
        window.setTimeout(() => { el.classList.add('is-gone'); }, 2000);
      };

      const step = now => {
        if (done) return;
        const t = now - t0;
        const target = Math.min(clamp(t / MIN), loaded ? 1 : .86);
        shown = lerp(shown, target, .14);
        const p = clamp(shown);
        pctEl.textContent = String(Math.round(p * 100));
        bars.forEach((b, i) => b.style.setProperty('--f', clamp(p * 4 - i).toFixed(3)));
        const mi = p < .25 ? 0 : p < .55 ? 1 : p < .9 ? 2 : 3;
        if (mi !== lastMsg) { lastMsg = mi; msgEl.textContent = msgs[mi]; }
        if ((p > .992 && target >= 1) || t > MAX) { finish(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- Titulares por palabra ---------- */
  function splitWords(el) {
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    let wi = 0;
    const mk = (child) => {
      const w = document.createElement('span');
      w.className = 'w';
      w.style.setProperty('--wi', wi++);
      const s = document.createElement('span');
      if (child) s.appendChild(child);
      w.appendChild(s);
      return { w, s };
    };
    const walk = node => {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const { w, s } = mk();
            s.textContent = part;
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          if (child.hasAttribute('data-nosplit')) {
            const holder = document.createComment('');
            child.replaceWith(holder);
            const { w } = mk(child);
            holder.replaceWith(w);
          } else if (child.tagName !== 'BR') walk(child);
        }
      });
    };
    walk(el);
  }

  /* ---------- Revelado al entrar en pantalla ---------- */
  let revealIO = null;
  function initReveal() {
    $$('[data-split]').forEach(el => { if (!el.classList.contains('hero__title')) splitWords(el); });
    const hero = $('.hero__title');
    if (hero) splitWords(hero);

    revealIO = new IntersectionObserver(entries => {
      const inView = entries.filter(e => e.isIntersecting);
      inView.forEach((e, i) => {
        const el = e.target;
        if (el.classList.contains('gal__item')) el.style.setProperty('--gd', (i * 70) + 'ms');
        el.classList.add('is-in');
        revealIO.unobserve(el);
      });
    }, { threshold: .14, rootMargin: '0px 0px -6% 0px' });

    $$('[data-reveal], [data-split], .gal__item').forEach(el => {
      if (el.classList.contains('hero__title')) return;
      revealIO.observe(el);
    });
  }

  function reobserve(el) {
    el.classList.remove('is-in');
    if (revealIO) revealIO.observe(el);
  }

  /* ---------- Header, progreso, menú y navegación ---------- */
  function initHeader() {
    const header = $('#header');
    const bar = $('#progress-bar');
    let stuck = false;
    ticks.push(() => {
      const s = S.y > 24;
      if (s !== stuck) { stuck = s; header.classList.toggle('is-stuck', s); }
      const max = Math.max(1, docH - vh);
      bar.style.transform = `scaleX(${clamp(S.y / max).toFixed(4)})`;
    });

    /* Menú móvil */
    const burger = $('#burger');
    const menu = $('#menu');
    const setMenu = open => {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      lockScroll(open);
    };
    burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('is-open')) setMenu(false); });
    mqDesktop.addEventListener('change', () => { if (menu.classList.contains('is-open')) setMenu(false); });

    /* Anclas con scroll suave */
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const target = document.getElementById(id.slice(1));
      if (!target) return;
      e.preventDefault();
      const wasOpen = menu.classList.contains('is-open');
      if (wasOpen) setMenu(false);
      window.setTimeout(() => {
        if (id === '#inicio') scrollToY(0); else scrollToEl(target, 0);
        history.replaceState(null, '', id);
      }, wasOpen ? 380 : 0);
    });

    /* Enlace activo según la sección visible */
    const links = $$('.nav a');
    const map = new Map(links.map(l => [l.getAttribute('href').slice(1), l]));
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        links.forEach(l => l.classList.remove('is-active'));
        const l = map.get(en.target.id);
        if (l) l.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- Botones magnéticos con relleno direccional ---------- */
  function initMagnetic() {
    if (!mqFine.matches || reduce) return;
    $$('[data-magnetic]').forEach(btn => {
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        btn.style.setProperty('--bx', x + 'px');
        btn.style.setProperty('--by', y + 'px');
        btn.style.transform = `translate(${((x / r.width) - .5) * 14}px, ${((y / r.height) - .5) * 10}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
  }

  /* ---------- Hero: media tinta (halftone) interactiva ---------- */
  function initHalftone() {
    const cv = $('#halftone');
    if (!cv) return;
    const hero = cv.parentElement;
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, gap = 32, cols = 0, rows = 0;
    const ptr = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
    let visible = true;

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = hero.clientWidth; H = hero.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gap = W < 700 ? 24 : 32;
      cols = Math.ceil(W / gap) + 2;
      rows = Math.ceil(H / (gap * .866)) + 2;
      if (reduce) draw(0);
    };

    const draw = t => {
      ctx.clearRect(0, 0, W, H);
      const sweep = ((t % 7200) / 7200) * (W + H * .5 + 400) - 200;
      let last = '';
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = i * gap + (j & 1) * gap * .5;
          const y = j * gap * .866;
          const wave = .5 + .5 * Math.sin(x * .011 + y * .009 - t * .0011);
          const d = x - sweep + y * .45;
          const band = Math.exp(-(d * d) / (2 * 62 * 62));
          const px = x - ptr.x, py = y - ptr.y;
          const near = Math.exp(-(px * px + py * py) / (2 * 120 * 120));
          const r = gap * (.07 + .09 * wave + .17 * band + .3 * near);
          if (r < .45) continue;
          const fade = W >= 960 ? .42 + .58 * clamp(x / (W * .55)) : .72;
          const a = (clamp(.12 + .2 * wave + .4 * band + .65 * near, 0, 1) * fade).toFixed(2);
          const col = near > .3 ? '255,184,28' : band > .25 ? '34,211,238' : '120,160,255';
          const style = `rgba(${col},${a})`;
          if (style !== last) { ctx.fillStyle = style; last = style; }
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 6.2832);
          ctx.fill();
        }
      }
    };

    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect();
      ptr.tx = e.clientX - r.left;
      ptr.ty = e.clientY - r.top;
    });
    hero.addEventListener('pointerleave', () => { ptr.tx = -9999; ptr.ty = -9999; ptr.x = -9999; ptr.y = -9999; });
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(hero);
    resizers.push(size);
    size();
    if (reduce) return;
    ticks.push(now => {
      if (!visible || document.hidden) return;
      ptr.x = ptr.tx < -999 ? -9999 : lerp(ptr.x < -999 ? ptr.tx : ptr.x, ptr.tx, .14);
      ptr.y = ptr.ty < -999 ? -9999 : lerp(ptr.y < -999 ? ptr.ty : ptr.y, ptr.ty, .14);
      draw(now);
    });
  }

  /* ---------- Hero: escenario 3D, paralaje y palabra rotativa ---------- */
  function initStage() {
    const stage = $('#stage');
    const hero = $('#inicio');
    const copy = $('.hero__copy');
    const ring = $('.ring__rot');
    if (!stage || !hero) return;
    const tgt = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    if (mqFine.matches && !reduce) {
      hero.addEventListener('pointermove', e => {
        const r = hero.getBoundingClientRect();
        tgt.x = ((e.clientX - r.left) / r.width - .5) * 2;
        tgt.y = ((e.clientY - r.top) / r.height - .5) * 2;
      });
      hero.addEventListener('pointerleave', () => { tgt.x = 0; tgt.y = 0; });
    }
    if (reduce) return;
    ticks.push(() => {
      if (S.y > vh * 1.4) return;
      cur.x = lerp(cur.x, tgt.x, .06);
      cur.y = lerp(cur.y, tgt.y, .06);
      stage.style.setProperty('--mx', cur.x.toFixed(3));
      stage.style.setProperty('--my', cur.y.toFixed(3));
      const p = clamp(S.y / vh);
      stage.style.translate = `0 ${(p * 70).toFixed(1)}px`;
      copy.style.translate = `0 ${(-p * 46).toFixed(1)}px`;
      copy.style.opacity = (1 - p * .75).toFixed(3);
      ring.style.setProperty('--rot', (S.y * .22).toFixed(1));
    });
  }

  function initRotator() {
    const rot = $('.rot');
    if (!rot) return () => {};
    const words = rot.dataset.words.split(',');
    let i = 0;
    let cur = document.createElement('span');
    cur.className = 'rot__w';
    cur.textContent = rot.textContent.trim();
    rot.textContent = '';
    rot.appendChild(cur);
    const fit = () => { rot.style.width = cur.offsetWidth + 'px'; };
    fit();
    resizers.push(fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

    const next = () => {
      if (document.hidden) return;
      i = (i + 1) % words.length;
      const inc = document.createElement('span');
      inc.className = 'rot__w is-in';
      inc.textContent = words[i];
      rot.appendChild(inc);
      rot.style.width = inc.offsetWidth + 'px';
      void inc.offsetWidth;
      inc.classList.add('is-active');
      cur.classList.add('is-out');
      const old = cur;
      cur = inc;
      window.setTimeout(() => {
        old.remove();
        inc.classList.remove('is-in', 'is-active');
      }, 900);
    };
    return () => { if (!reduce) window.setInterval(next, 2800); };
  }

  /* ---------- Banda cinética (única en la página) ---------- */
  function initBand() {
    const track = $('#band-track');
    if (!track || reduce) return;
    const list = track.firstElementChild;
    let w = list.offsetWidth;
    const fill = () => {
      w = list.offsetWidth;
      const need = Math.ceil(window.innerWidth / Math.max(1, w)) + 1;
      while (track.children.length < need + 1) {
        const c = list.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        track.appendChild(c);
      }
    };
    fill();
    resizers.push(fill);
    let x = 0;
    let visible = false;
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { rootMargin: '100px' }).observe(track.parentElement);
    ticks.push((now, dt) => {
      if (!visible) return;
      x -= dt * .06 + S.vel * 1.15;
      if (x <= -w) x += w;
      if (x > 0) x -= w;
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
    });
  }

  /* ---------- Contadores ---------- */
  function initCounters() {
    const els = $$('[data-count]');
    if (reduce) return;
    els.forEach(el => { el.textContent = '0'; });
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const el = en.target;
        const target = +el.dataset.count;
        const t0 = performance.now();
        const run = now => {
          const p = clamp((now - t0) / 1700);
          el.textContent = String(Math.round(easeOut(p) * target));
          if (p < 1) requestAnimationFrame(run);
        };
        requestAnimationFrame(run);
      });
    }, { threshold: .6 });
    els.forEach(el => io.observe(el));
  }

  /* ---------- Servicios: scroll vertical que mueve el carril en horizontal ---------- */
  function initServices() {
    const sec = $('#servicios');
    const track = $('#svc-track');
    const list = $('#svc-list');
    const bar = $('#svc-bar');
    if (!sec || !track) return;
    const cards = $$('.svc-card', sec);
    const imgs = cards.map(c => c.querySelector('img'));
    let pinned = false;
    let maxX = 0;

    const setup = () => {
      const want = mqDesktop.matches && !reduce;
      if (want !== pinned) {
        pinned = want;
        sec.classList.toggle('is-pinned', pinned);
        if (!pinned) {
          track.style.transform = '';
          sec.style.height = '';
          imgs.forEach(im => { im.style.translate = ''; });
        }
      }
      if (pinned) {
        track.style.transform = 'translate3d(0,0,0)';
        const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
        const total = list.getBoundingClientRect().right - track.getBoundingClientRect().left + pad;
        maxX = Math.max(0, total - window.innerWidth);
        sec.style.height = Math.round(maxX + window.innerHeight) + 'px';
      }
    };
    resizers.push(setup);
    setup();

    scene(sec, (y, sc) => {
      if (!pinned) return;
      const p = clamp((y - sc.top) / Math.max(1, sc.height - vh));
      track.style.transform = `translate3d(${(-p * maxX).toFixed(2)}px,0,0)`;
      bar.style.transform = `scaleX(${p.toFixed(4)})`;
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (r.right < -200 || r.left > vw + 200) continue;
        const d = (r.left + r.width / 2 - vw / 2) / vw;
        imgs[i].style.translate = `${(-d * 70).toFixed(1)}px 0`;
      }
    });
  }

  /* ---------- Escala: la imagen se abre a pantalla completa ---------- */
  function initZoom() {
    const sec = $('#escala');
    if (!sec || reduce) return;
    let last = '';
    scene(sec, (y, sc) => {
      const p = clamp((y - sc.top) / Math.max(1, sc.height - vh));
      const portrait = vw < 700;
      const sx = portrait ? 9 : 24;
      const sy = portrait ? 25 : 20;
      const e = easeIO(clamp(p / .6));
      const vals = [
        lerp(sx, 0, e).toFixed(2) + '%',
        lerp(sy, 0, e).toFixed(2) + '%',
        lerp(28, 0, e).toFixed(1) + 'px',
        lerp(1.4, 1, e).toFixed(3),
        clamp((p - .42) / .28).toFixed(3),
        clamp((p - .62) / .26).toFixed(3),
        (1 - clamp(p / .28)).toFixed(3)
      ];
      const key = vals.join('|');
      if (key === last) return;
      last = key;
      sec.style.setProperty('--cx', vals[0]);
      sec.style.setProperty('--cy', vals[1]);
      sec.style.setProperty('--cr', vals[2]);
      sec.style.setProperty('--zs', vals[3]);
      sec.style.setProperty('--so', vals[4]);
      sec.style.setProperty('--co', vals[5]);
      sec.style.setProperty('--to', vals[6]);
    });
  }

  /* ---------- Código de color: el fondo cambia por etapas ---------- */
  function initColor() {
    const sec = $('#color');
    if (!sec) return;
    const steps = $$('.cstep', sec);
    const signs = $$('.sign', sec);
    const dots = $$('.cbars button', sec);
    let cur = -1;
    const set = i => {
      if (i === cur) return;
      cur = i;
      sec.dataset.step = String(i);
      steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
      signs.forEach((s, k) => s.classList.toggle('is-active', k === i));
      dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
    };
    set(0);

    let sc = null;
    if (!reduce) {
      sc = scene(sec, (y, s) => {
        const p = clamp((y - s.top) / Math.max(1, s.height - vh));
        set(Math.min(3, Math.floor(p * 4)));
      });
    }
    dots.forEach((d, k) => d.addEventListener('click', () => {
      if (!sc) { set(k); return; }
      scrollToY(sc.top + ((k + .5) / 4) * (sc.height - vh));
    }));
  }

  /* ---------- Proceso: la línea se dibuja con el scroll ---------- */
  function initProcess() {
    const rail = $('#proc-rail');
    const line = $('#proc-line');
    if (!rail) return;
    const steps = $$('.pstep', rail);
    if (reduce) {
      line.style.transform = 'scaleY(1)';
      steps.forEach(s => s.classList.add('is-lit'));
      return;
    }
    scene(rail, (y, sc) => {
      const start = sc.top - vh * .65;
      const end = sc.top + sc.height - vh * .45;
      const p = clamp((y - start) / Math.max(1, end - start));
      line.style.transform = `scaleY(${p.toFixed(4)})`;
      const lineH = sc.height - 56;
      steps.forEach(s => {
        const mid = s.offsetTop + 28;
        s.classList.toggle('is-lit', 28 + p * lineH >= mid - 4);
      });
    });
  }

  /* ---------- Paralaje de imágenes y palabra gigante del pie ---------- */
  function initParallax() {
    const items = $$('[data-parallax]').map(img => ({
      img, host: img.parentElement, speed: parseFloat(img.dataset.parallax) || .06, active: false
    }));
    if (!items.length || reduce) return;
    const io = new IntersectionObserver(es => {
      es.forEach(e => { const it = items.find(x => x.host === e.target); if (it) it.active = e.isIntersecting; });
    }, { rootMargin: '20% 0px' });
    items.forEach(it => io.observe(it.host));
    ticks.push(() => {
      items.forEach(it => {
        if (!it.active) return;
        const r = it.host.getBoundingClientRect();
        const d = (r.top + r.height / 2 - vh / 2) / vh;
        it.img.style.translate = `0 ${(-d * it.speed * vh).toFixed(1)}px`;
      });
    });

    const mark = $('.footer__mark');
    const word = $('#foot-word');
    if (mark && word) {
      scene(mark, y => {
        const p = clamp((y - (docH - vh - 760)) / 760);
        word.style.setProperty('--fx', lerp(vw * .16, 0, easeOut(p)).toFixed(1));
      });
    }
  }

  /* ---------- Caso: la imagen fija cambia con cada paso ---------- */
  function initCase() {
    const stories = $$('.cstory');
    const imgs = $$('.case__frame img');
    if (!stories.length) return;
    const set = idx => {
      stories.forEach((s, k) => s.classList.toggle('is-active', k === idx));
      imgs.forEach((im, k) => im.classList.toggle('is-active', k === idx));
    };
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) set(stories.indexOf(e.target)); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    stories.forEach(s => io.observe(s));
  }

  /* ---------- Taller: video solo mientras se ve ---------- */
  function initVideo() {
    const v = $('#shop-video');
    if (!v || reduce) return;
    new IntersectionObserver(es => {
      if (es[0].isIntersecting) v.play().catch(() => {}); else v.pause();
    }, { threshold: .35 }).observe(v);
  }

  /* ---------- Galería: filtros, "ver más" y visor ---------- */
  function initGallery() {
    const gal = $('#gal');
    if (!gal) return;
    const items = $$('.gal__item', gal);
    const fbtns = $$('.fbtn');
    const more = $('#gal-more');
    let filter = 'all';
    let expanded = false;

    const visibleItems = () => items.filter(li =>
      !li.hidden && !(filter === 'all' && !expanded && li.hasAttribute('data-extra')));

    const apply = f => {
      filter = f;
      fbtns.forEach(b => {
        const on = b.dataset.filter === f;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      items.forEach(li => {
        li.hidden = !(f === 'all' || li.dataset.cat === f);
        reobserve(li);
      });
      gal.classList.toggle('is-collapsed', f === 'all' && !expanded);
      more.hidden = !(f === 'all' && !expanded);
      queueMeasure();
    };
    fbtns.forEach(b => b.addEventListener('click', () => apply(b.dataset.filter)));
    more.addEventListener('click', () => {
      expanded = true;
      gal.classList.remove('is-collapsed');
      more.hidden = true;
      queueMeasure();
    });

    /* Visor */
    const lb = $('#lb');
    const img = $('#lb-img');
    const title = $('#lb-title');
    const count = $('#lb-count');
    const cta = $('#lb-cta');
    let list = [];
    let idx = 0;
    let opener = null;

    const render = () => {
      const b = list[idx];
      img.style.opacity = '0';
      img.onload = () => { img.style.opacity = '1'; };
      img.src = b.dataset.full;
      img.alt = b.dataset.alt;
      title.textContent = b.dataset.title;
      count.textContent = `${idx + 1} de ${list.length}`;
      cta.href = waURL(`Hola, vi el trabajo "${b.dataset.title}" en su página y quiero cotizar algo parecido.`);
      [idx + 1, idx - 1].forEach(n => {
        const nb = list[(n + list.length) % list.length];
        if (nb) { const pre = new Image(); pre.src = nb.dataset.full; }
      });
    };
    const open = (i, trigger) => {
      list = visibleItems().map(li => $('.gal__btn', li));
      idx = clamp(i, 0, list.length - 1);
      opener = trigger;
      render();
      lb.hidden = false;
      lockScroll(true);
      $('.lb__x', lb).focus();
    };
    const close = () => {
      lb.hidden = true;
      lockScroll(false);
      img.removeAttribute('src');
      if (opener) opener.focus();
    };
    const go = d => { idx = (idx + d + list.length) % list.length; render(); };

    gal.addEventListener('click', e => {
      const b = e.target.closest('.gal__btn');
      if (!b) return;
      const mine = visibleItems().map(li => $('.gal__btn', li));
      open(mine.indexOf(b), b);
    });
    lb.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) close();
      const nav = e.target.closest('[data-dir]');
      if (nav) go(+nav.dataset.dir);
    });
    document.addEventListener('keydown', e => {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Tab') {
        const f = $$('button, a[href]', lb).filter(n => n.offsetParent !== null);
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    let sx = 0;
    const fig = $('.lb__fig', lb);
    fig.addEventListener('pointerdown', e => { sx = e.clientX; });
    fig.addEventListener('pointerup', e => {
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 55) go(dx < 0 ? 1 : -1);
    });
  }

  /* ---------- Preguntas frecuentes ---------- */
  function initFaq() {
    const items = $$('.acc__item');
    items.forEach(item => {
      const btn = $('.acc__btn', item);
      btn.addEventListener('click', () => {
        const open = !item.classList.contains('is-open');
        items.forEach(o => {
          const on = o === item && open;
          o.classList.toggle('is-open', on);
          $('.acc__btn', o).setAttribute('aria-expanded', String(on));
        });
        window.setTimeout(queueMeasure, 760);
      });
    });
  }

  /* ---------- Contacto: mapa por pestañas y formulario a WhatsApp ---------- */
  function initContact() {
    const places = {
      oficina: { q: 'Calle 21 Diagonal 360, San Luis Chuburna, Mérida, Yucatán, México', text: 'Calle 21 Diag. #360 x 38-A Local 2, Col. San Luis Chuburna, Mérida, Yucatán.' },
      taller: { q: 'Calle 19 387, San Pablo Uxmal Chuburna, Mérida, Yucatán, México', text: 'Calle 19 #387 x 48 y 48-A, Col. San Pablo Uxmal Chuburna, Mérida, Yucatán.' }
    };
    const tabs = $$('.ptab');
    const map = $('#place-map');
    const addr = $('#place-addr');
    const link = $('#place-link');
    const panel = $('#place-panel');
    let current = 'oficina';
    let mapOn = false;
    const embed = k => `https://www.google.com/maps?q=${encodeURIComponent(places[k].q)}&output=embed`;
    const show = k => {
      current = k;
      tabs.forEach(t => {
        const on = t.dataset.place === k;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
      });
      panel.setAttribute('aria-labelledby', 'tab-' + k);
      addr.textContent = places[k].text;
      link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(places[k].q)}`;
      if (mapOn) map.src = embed(k);
    };
    tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.place)));
    new IntersectionObserver((es, io) => {
      if (es[0].isIntersecting) { mapOn = true; map.src = embed(current); io.disconnect(); }
    }, { rootMargin: '500px 0px' }).observe($('.places'));

    /* Formulario */
    const form = $('#wa-form');
    const btn = $('#form-btn');
    const ok = $('#form-ok');
    const fallback = $('#form-fallback');
    const fields = {
      name: { el: $('#f-name'), err: $('#e-name'), valid: v => v.trim().length >= 2 },
      phone: { el: $('#f-phone'), err: $('#e-phone'), valid: v => { const d = v.replace(/\D/g, ''); return !d || (d.length >= 10 && d.length <= 13); } },
      service: { el: $('#f-service'), err: $('#e-service'), valid: v => !!v }
    };
    const setErr = (f, bad) => {
      f.err.hidden = !bad;
      f.el.closest('.field').classList.toggle('is-error', bad);
      f.el.setAttribute('aria-invalid', String(bad));
    };
    Object.values(fields).forEach(f => {
      const clear = () => { if (!f.err.hidden && f.valid(f.el.value)) setErr(f, false); };
      f.el.addEventListener('input', clear);
      f.el.addEventListener('change', clear);
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      let first = null;
      Object.values(fields).forEach(f => {
        const bad = !f.valid(f.el.value);
        setErr(f, bad);
        if (bad && !first) first = f.el;
      });
      if (first) { first.focus(); return; }
      const name = fields.name.el.value.trim();
      const phone = fields.phone.el.value.trim();
      const service = fields.service.el.value;
      const msg = $('#f-msg').value.trim();
      const text = [
        `Hola Digital Graphics, soy ${name}.`,
        `Me interesa: ${service}.`,
        msg ? `Detalles: ${msg}` : '',
        phone ? `Mi teléfono: ${phone}` : ''
      ].filter(Boolean).join('\n');
      const url = waURL(text);
      fallback.href = url;
      ok.hidden = false;
      btn.disabled = true;
      btn.lastChild.textContent = ' Abriendo WhatsApp...';
      window.open(url, '_blank', 'noopener');
      window.setTimeout(() => {
        btn.disabled = false;
        btn.lastChild.textContent = ' Enviar mi solicitud por WhatsApp';
      }, 3500);
    });
  }

  /* ---------- Botón flotante de WhatsApp: globo de invitación ---------- */
  function initWaTip() {
    const wa = $('#wa');
    if (!wa) return () => {};
    const pulse = () => {
      wa.classList.add('is-tip');
      window.setTimeout(() => wa.classList.remove('is-tip'), 6000);
    };
    return () => {
      window.setTimeout(pulse, 5000);
      window.setInterval(pulse, 45000);
    };
  }

  /* ---------- Arranque ---------- */
  function boot() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    initLenis();
    initReveal();
    initHeader();
    initMagnetic();
    initHalftone();
    initStage();
    const startRot = initRotator();
    initBand();
    initCounters();
    initServices();
    initZoom();
    initColor();
    initProcess();
    initParallax();
    initCase();
    initVideo();
    initGallery();
    initFaq();
    initContact();
    const startTip = initWaTip();

    measure();
    window.addEventListener('resize', () => { window.clearTimeout(boot.t); boot.t = window.setTimeout(measure, 160); });
    window.addEventListener('load', queueMeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueMeasure);
    if ('ResizeObserver' in window) new ResizeObserver(queueMeasure).observe(document.body);

    S.raw = window.scrollY;
    S.y = S.raw;
    requestAnimationFrame(frame);

    initLoader().then(() => {
      S.ready = true;
      doc.classList.add('is-ready');
      const h1 = $('.hero__title');
      if (h1) h1.classList.add('is-in');
      if (S.lenis) S.lenis.start();
      queueMeasure();
      startRot();
      startTip();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
