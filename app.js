(() => {
  'use strict';

  const MODEL = { D: 125, D1: 95, D2: 108, D3: 30, H: 85, H1: 58, h: 4, z: 3, d: 8 };
  const BODY_LIMITS = {
    D: { min: 80, max: 160 },
    H1: { min: 30, max: 90 },
  };
  const MIN_MOUNTING_RIM = 2;

  // Match the unedited jaw profile shown at a 160 mm body diameter.
  const JAW_REFERENCE = {
    D: 160,
    p: 19,
    steps: [{ l: 17.5, h: 27 }, { l: 16.5, h: 18 }, { l: 16.5, h: 9 }],
  };
  const JAW_STEP_LIMITS = {
    l: { min: 6.5, max: 32 },
    h: { min: 2.5, max: 40.5 },
  };
  const JAW_COUNT = 4;
  const SIDE_JAW_FILL = 'hsl(210 16% 74%)';

  const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const fa = (n) => String(n).replace(/\d/g, (c) => FA_DIGITS[+c]);
  const fmt = (v) => String(Math.round(v * 100) / 100);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pts = (a) => a.map((p) => p.map((n) => +n.toFixed(2)).join(',')).join(' ');
  const $ = (s) => document.querySelector(s);

  // Pinion angle around the body, measured from the exterior viewing direction towards jaw 1.
  const PIN_THETA = (37.6 * Math.PI) / 180;
  const PIN_FRONT_DEG = 90 - 37.6; // same screw in the front view, clockwise from jaw 1
  const pinRadius = (g) => 0.065 * g.D;
  // One full turn of the screw per 3% of D of jaw travel.
  const pinAngle = (j, g) => ((j.p / (0.03 * g.D)) * 360) % 360;

  // Polygon path with small rounded corners at the given vertex indexes.
  function roundedPath(P, idx, rr) {
    const n = P.length;
    let d = '';
    P.forEach((p, i) => {
      if (!idx.includes(i)) { d += `${d ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`; return; }
      const a = P[(i - 1 + n) % n];
      const b = P[(i + 1) % n];
      const toward = (q) => {
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const L = Math.hypot(dx, dy) || 1;
        const k = Math.min(rr, L / 2) / L;
        return [p[0] + dx * k, p[1] + dy * k];
      };
      const p1 = toward(a);
      const p2 = toward(b);
      d += `${d ? 'L' : 'M'}${p1[0].toFixed(2)},${p1[1].toFixed(2)}Q${p[0].toFixed(2)},${p[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    });
    return `${d}Z`;
  }

  const defaultBody = () => ({ D: MODEL.D, H1: MODEL.H1 });

  function geometry({ D, H1 }) {
    const jawScale = D / JAW_REFERENCE.D;
    // Move the mounting seat and bolt circle inward together only when the rim needs clearance.
    const mountingReduction = Math.max(0, MODEL.D2 + MODEL.d + 2 * MIN_MOUNTING_RIM - D);
    return {
      ...MODEL, D, H1, jawScale,
      D1: MODEL.D1 - mountingReduction,
      D2: MODEL.D2 - mountingReduction,
      w: 0.14 * D,
      slotDepth: 0.4 * MODEL.H1 * jawScale,
      hMax: JAW_STEP_LIMITS.h.max * jawScale,
    };
  }

  function defaultReferenceJaw() {
    return {
      p: JAW_REFERENCE.p,
      rev: false,
      steps: JAW_REFERENCE.steps.map((step) => ({ ...step })),
    };
  }

  function scaleJaw(j, scale) {
    return {
      p: j.p * scale,
      rev: j.rev,
      steps: j.steps.map(({ l, h }) => ({ l: l * scale, h: h * scale })),
    };
  }

  // All four jaws share one profile in reference units so resizing never rounds away edits.
  const state = { body: defaultBody(), jawAtRef: defaultReferenceJaw(), dims: true };

  const jawLen = (j) => j.steps.reduce((s, x) => s + x.l, 0);
  const chamfer = (j, g) => Math.min(0.35 * g.w, 0.9 * j.steps[0].l);
  const pMin = (j, g) => (j.rev ? g.w / 2 : g.w / 2 - chamfer(j, g));
  const pMax = (j, g) => Math.max(pMin(j, g), g.D / 2 - 0.65 * jawLen(j));
  const segments = (j) => (j.rev ? [...j.steps].reverse() : j.steps);

  function shade(h, g) {
    const t = clamp(h / g.hMax, 0, 1);
    return `hsl(210 16% ${54 + 36 * t}%)`;
  }

  function badge(x, y, k, g) {
    return `<g class="badge"><circle class="thin" cx="${x}" cy="${y}" r="${0.036 * g.D}"/>` +
      `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${0.044 * g.D}">${k + 1}</text></g>`;
  }

  function frontJawShape(j, g) {
    const w = g.w;
    const c = chamfer(j, g);
    const th = w / 2 - c;
    let u = j.p;
    let out = '';
    segments(j).forEach((s) => {
      const u0 = u;
      const u1 = u + s.l;
      u = u1;
      let P;
      if (s === j.steps[0] && !j.rev) {
        P = [[-w / 2, u1], [w / 2, u1], [w / 2, u0 + c], [th, u0], [-th, u0], [-w / 2, u0 + c]];
      } else if (s === j.steps[0]) {
        P = [[-w / 2, u0], [w / 2, u0], [w / 2, u1 - c], [th, u1], [-th, u1], [-w / 2, u1 - c]];
      } else {
        P = [[-w / 2, u0], [w / 2, u0], [w / 2, u1], [-w / 2, u1]];
      }
      out += `<polygon class="ln" fill="${shade(s.h, g)}" points="${pts(P.map(([v, r]) => [v, -r]))}"/>`;
      if (s === j.steps[0]) {
        const uc = j.rev ? u1 - c : u0 + c;
        out += `<line class="cham" x1="${-w / 2}" y1="${-uc}" x2="${w / 2}" y2="${-uc}"/>`;
      }
    });
    return out;
  }

  function initDrawingFrames() {
    // Fit the largest supported dimensions once so resizing changes the visible size, not the zoom.
    const g = geometry({ D: BODY_LIMITS.D.max, H1: BODY_LIMITS.H1.max });
    const y = -0.84 * g.D;
    const height = 1.68 * g.D;
    const frame = (svg, x, width) => {
      svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
      svg.style.aspectRatio = `${width} / ${height}`;
    };
    frame($('#front'), -0.82 * g.D, 1.64 * g.D);
    const pad = 0.06 * g.D;
    frame($('#outside'), -g.H1 - pad, g.H1 + g.hMax + 2 * pad);
  }

  function renderFront(j, g) {
    const D = g.D;
    const R = D / 2;
    const fs = 0.042 * D;
    const svg = $('#front');

    let s = `<defs><clipPath id="bodyClip"><circle r="${R}"/></clipPath></defs>`;
    const pr = pinRadius(g);
    const prot = 0.014 * D;
    const phi = (pinAngle(j, g) * Math.PI) / 180;
    const sock = pr * Math.max(Math.abs(0.55 * Math.sin(phi)), Math.abs(0.45 * Math.cos(phi)));
    s += `<g transform="rotate(${PIN_FRONT_DEG})"><rect class="ln pin" x="${-pr}" y="${-R - prot}" width="${2 * pr}" height="${prot + 0.01 * D}"/></g>`;
    s += `<circle class="ln body" r="${R}"/><circle class="thin nofill" r="${R - 0.02 * D}"/>`;
    s += `<g clip-path="url(#bodyClip)">` + [0, 90].map((a) =>
      `<rect class="thin slot" x="${-g.w / 2}" y="${-R * 1.05}" width="${g.w}" height="${R * 2.1}" transform="rotate(${a})"/>`).join('') + `</g>`;
    s += `<circle class="hid nofill" r="${g.D1 / 2}"/><circle class="ctr nofill" r="${g.D2 / 2}"/>`;
    for (let i = 0; i < g.z; i++) {
      const a = ((15 + (i * 360) / g.z) * Math.PI) / 180;
      s += `<circle class="hid nofill" cx="${Math.sin(a) * g.D2 / 2}" cy="${-Math.cos(a) * g.D2 / 2}" r="${g.d / 2}"/>`;
    }
    s += `<circle class="ln void" r="${g.D3 / 2}"/>`;
    s += `<g transform="rotate(${PIN_FRONT_DEG})">` + [-1, 1].map((sg) =>
      `<line class="hid np" x1="${sg * sock}" y1="${-R - prot}" x2="${sg * sock}" y2="${-R + 0.03 * D}"/>`).join('') + `</g>`;
    s += `<line class="ctr" x1="${-0.56 * D}" y1="0" x2="${0.56 * D}" y2="0"/><line class="ctr" x1="0" y1="${-0.56 * D}" x2="0" y2="${0.56 * D}"/>`;

    const jaw = frontJawShape(j, g);
    for (let k = 0; k < JAW_COUNT; k++) {
      s += `<g class="jaw" transform="rotate(${k * 360 / JAW_COUNT})">${jaw}</g>`;
    }

    s += `<circle class="grip" r="${j.p}"/>`;
    if (state.dims) {
      const q = j.p * Math.SQRT1_2 + 0.02 * D;
      s += `<text class="dt accent" stroke-width="${0.014 * D}" x="${-q}" y="${-q}" text-anchor="end" font-size="${fs}">Ø${fmt(2 * j.p)}</text>`;
    }

    const r = Math.max(j.p + jawLen(j), R) + 0.06 * D;
    for (let k = 0; k < JAW_COUNT; k++) {
      const a = (k * 2 * Math.PI) / JAW_COUNT;
      s += badge(Math.sin(a) * r, -Math.cos(a) * r, k, g);
    }

    if (state.dims) {
      const q = Math.SQRT1_2;
      const r0 = g.D2 / 2;
      const r1 = R + 0.09 * D;
      s += `<line class="dim" x1="${q * r0}" y1="${q * r0}" x2="${q * r1}" y2="${q * r1}"/>`;
      s += `<text class="dt" stroke-width="${0.014 * D}" x="${q * r1 + 0.015 * D}" y="${q * r1 + 0.02 * D}" font-size="${fs}">${g.z}-M${g.d}</text>`;
    }
    svg.innerHTML = s;
  }

  // Shade the bevel along the full axial length, including the visible shank.
  function tipChamferBand(xStart, xEnd, innerY, outerY) {
    return `<rect class="jaw-bevel" x="${xStart}" y="${Math.min(innerY, outerY)}" width="${xEnd - xStart}" height="${Math.abs(outerY - innerY)}"/>`;
  }

  function outsideJawSurface(tag, shape, bevels, clipId) {
    if (!bevels) return `<${tag} class="ln" fill="${SIDE_JAW_FILL}" ${shape}/>`;
    // Keep the bands inside the notches and paint the silhouette stroke last.
    return `<${tag} fill="url(#outsideJawShade)" ${shape}/>` +
      `<defs><clipPath id="${clipId}"><${tag} ${shape}/></clipPath></defs>` +
      `<g clip-path="url(#${clipId})">${bevels}</g><${tag} class="ln nofill" ${shape}/>`;
  }

  // Exterior side view from jaw 2: x = 0 is the fixed front face; the rear is at -H1.
  function outsideJawSide(j, sign, g) {
    const sd = g.slotDepth;
    const x0 = -sd;
    const xt = x0 + 0.15 * sd;
    const dt = 0.016 * g.D;
    const ss = segments(j);
    const P = [[x0, j.p], [ss[0].h, j.p]];
    let u = j.p;
    ss.forEach((seg, i) => {
      u += seg.l;
      P.push([seg.h, u]);
      if (ss[i + 1]) P.push([ss[i + 1].h, u]);
    });
    P.push([xt, u], [xt, u - dt], [x0, u - dt]);
    const shape = `points="${pts(P.map(([x, r]) => [x, sign * r]))}"`;
    const h = j.steps[0].h;
    const c = chamfer(j, g);
    const rc = sign * (j.rev ? u - c : j.p + c);
    const bevelEdge = sign * (j.rev ? u : j.p);
    const bevel = tipChamferBand(x0, h, rc, bevelEdge) +
      `<line class="thin" x1="${x0}" y1="${rc}" x2="${h}" y2="${rc}"/>`;
    const clipId = sign < 0 ? 'outsideTopClip' : 'outsideBottomClip';
    const jaw = `<g class="jaw">${outsideJawSurface('polygon', shape, bevel, clipId)}</g>`;

    // Draw hidden guide grooves over the body only where the jaws protrude.
    const R = g.D / 2;
    let over = '';
    if (u > R) {
      [x0 + 0.34 * sd, x0 + 0.8 * sd].forEach((x) => {
        over += `<line class="hid np" x1="${x}" y1="${sign * R}" x2="${x}" y2="${sign * u}"/>`;
      });
    }
    return { jaw, over };
  }

  function outsideJawFront(j, g) {
    const sd = g.slotDepth;
    const x0 = -sd;
    const xb = x0 - 0.07 * sd;
    const xn0 = x0 + 0.34 * sd;
    const xn1 = x0 + 0.8 * sd;
    const hw = g.w / 2;
    const nd = 0.17 * g.w;
    const hs = segments(j).map((step) => step.h).reverse(); // Outermost step faces the viewer.
    const xT = Math.max(...hs);
    const P = [
      [xb, -hw], [xn0, -hw], [xn0, -hw + nd], [xn1, -hw + nd], [xn1, -hw], [xT, -hw],
      [xT, hw], [xn1, hw], [xn1, hw - nd], [xn0, hw - nd], [xn0, hw], [xb, hw],
    ];
    const shape = `d="${roundedPath(P, [1, 2, 3, 4, 7, 8, 9, 10], 0.25 * nd)}"`;
    const c = chamfer(j, g);
    const bevels = j.rev ? [-1, 1].map((sign) => tipChamferBand(xb, j.steps[0].h, sign * (hw - c), sign * hw)).join('') : '';
    let s = `<rect class="slotin" x="${xb}" y="${-hw}" width="${-xb}" height="${g.w}"/>`;
    s += `<g class="jaw">${outsideJawSurface('path', shape, bevels, 'outsideCenterClip')}`;
    s += `<line class="thin" stroke-opacity=".7" x1="${x0 + 0.17 * sd}" y1="${-hw}" x2="${x0 + 0.17 * sd}" y2="${hw}"/>`;
    // A step edge behind another step is visible only beyond the nearer step's extent.
    let visibleExtent = 0;
    for (const h of hs) {
      if (h >= xT) break;
      if (h <= visibleExtent) continue;
      visibleExtent = h;
      s += `<line class="ln" x1="${h}" y1="${-hw}" x2="${h}" y2="${hw}"/>`;
    }
    return `${s}</g>`;
  }

  function renderOutside(j, g) {
    const { D, H1 } = g;
    const R = D / 2;
    const rearX = -H1;
    const svg = $('#outside');

    const top = outsideJawSide(j, -1, g);
    const bottom = outsideJawSide(j, 1, g);
    let s = `<defs><linearGradient id="outsideJawShade" x1="0%" y1="0%" x2="100%" y2="100%">` +
      `<stop offset="0" stop-color="#c5cfd8"/><stop offset="1" stop-color="#a2b0be"/></linearGradient></defs>`;
    s += top.jaw + bottom.jaw;
    s += `<rect class="ln body" x="${rearX}" y="${-R}" width="${H1}" height="${D}"/>`;
    s += top.over + bottom.over;
    s += outsideJawFront(j, g);

    // Jaw opening/closing screw on the cylindrical surface (foreshortened circle).
    const pr = pinRadius(g);
    // Center the pinion between the rear face and the fixed front face.
    const cx = rearX + H1 / 2;
    const cy = -R * Math.sin(PIN_THETA);
    const a = 0.55 * pr;
    const b = 0.45 * pr;
    s += `<g transform="translate(${cx} ${cy}) scale(1 ${Math.cos(PIN_THETA).toFixed(4)})">` +
      `<circle class="ln pin" r="${pr}"/>` +
      `<g transform="rotate(${pinAngle(j, g).toFixed(2)})">` +
      `<line class="ln" x1="${-pr}" y1="0" x2="${pr}" y2="0"/><line class="ln" x1="0" y1="${-pr}" x2="0" y2="${pr}"/>` +
      `<polygon class="ln nofill" points="${pts([[-a, 0], [0, -b], [a, 0], [0, b]])}"/></g></g>`;
    svg.innerHTML = s;
  }

  const SPEC_LABELS = [
    ['D', 'قطر بدنه'], ['D1', 'قطر نشیمنگاه پشت'], ['D2', 'قطر دایرهٔ پیچ‌ها'], ['D3', 'قطر سوراخ مرکزی'],
    ['H', 'ارتفاع کل با فک'], ['H1', 'ارتفاع بدنه'], ['h', 'عمق نشیمنگاه'], ['z-d', 'تعداد و سایز پیچ'],
  ];

  function renderSpecs() {
    const values = { ...MODEL, 'z-d': `${MODEL.z}-M${MODEL.d}` };
    $('#specs').innerHTML = SPEC_LABELS.map(([k, label]) =>
      `<div><dt><span class="sym" dir="ltr">${k}</span> ${label}</dt><dd id="spec-${k}" dir="ltr">${values[k]}</dd></div>`).join('');
  }

  function syncBodyControls(g) {
    for (const key of Object.keys(BODY_LIMITS)) {
      const value = fmt(g[key]);
      $(`#body${key}`).value = value;
      $(`#body${key}Out`).textContent = `${value} mm`;
      $(`#spec-${key}`).textContent = value;
    }
    $('#spec-D1').textContent = fmt(g.D1);
    $('#spec-D2').textContent = fmt(g.D2);
  }

  function syncControls(j, g) {
    const pos = $('#pos');
    pos.min = String(pMin(j, g));
    pos.max = String(pMax(j, g));
    pos.step = String(0.1 * g.jawScale);
    pos.value = String(j.p);
    $('#posOut').textContent = `${fmt(j.p)} mm`;

    const rev = $('#rev');
    rev.setAttribute('aria-checked', String(j.rev));
    $('#revState').textContent = j.rev ? 'معکوس' : 'عادی';

    j.steps.forEach((st, i) => {
      for (const [key, { min, max }] of Object.entries(JAW_STEP_LIMITS)) {
        const input = $(`#${key}${i}`);
        input.min = String(min * g.jawScale);
        input.max = String(max * g.jawScale);
        input.step = String(0.5 * g.jawScale);
        input.value = String(st[key]);
        $(`#${key}o${i}`).textContent = `${fmt(st[key])} mm`;
      }
    });

    $('#rdGrip').textContent = `Ø ${fmt(2 * j.p)} mm`;
    $('#rdLen').textContent = `${fmt(jawLen(j))} mm`;
    const hAct = g.H1 + Math.max(...j.steps.map((x) => x.h));
    $('#spec-H').textContent = fmt(hAct);
    $('#rdH').textContent = `${fmt(hAct)} mm`;
    $('#dims').checked = state.dims;
  }

  function render(g = geometry(state.body)) {
    const j = scaleJaw(state.jawAtRef, g.jawScale);
    const p = clamp(j.p, pMin(j, g), pMax(j, g));
    if (p !== j.p) state.jawAtRef.p = p / g.jawScale;
    j.p = p;
    renderFront(j, g);
    renderOutside(j, g);
    syncControls(j, g);
  }

  function init() {
    renderSpecs();
    initDrawingFrames();

    const stepNotes = ['نوک فک', 'میانی', 'انتهایی'];
    $('#steps').innerHTML = [0, 1, 2].map((i) => `
      <div class="step" role="group" aria-label="پله ${fa(i + 1)}">
        <h3>پله ${fa(i + 1)} <span>${stepNotes[i]}</span></h3>
        <div class="row">
          <label for="l${i}">طول شعاعی</label>
          <input type="range" id="l${i}" data-i="${i}" data-k="l" step="0.5">
          <output id="lo${i}" for="l${i}" dir="ltr"></output>
        </div>
        <div class="row">
          <label for="h${i}">ارتفاع</label>
          <input type="range" id="h${i}" data-i="${i}" data-k="h" step="0.5">
          <output id="ho${i}" for="h${i}" dir="ltr"></output>
        </div>
      </div>`).join('');

    const setPos = (v, g = geometry(state.body)) => {
      state.jawAtRef.p = v / g.jawScale;
      render(g);
    };
    let anim = 0;
    const updateBody = () => {
      cancelAnimationFrame(anim);
      const g = geometry(state.body);
      syncBodyControls(g);
      render(g);
    };
    for (const [key, { min, max }] of Object.entries(BODY_LIMITS)) {
      const input = $(`#body${key}`);
      input.min = String(min);
      input.max = String(max);
      input.addEventListener('input', () => {
        const value = input.valueAsNumber;
        if (!Number.isFinite(value)) return;
        state.body[key] = clamp(value, min, max);
        updateBody();
      });
    }
    $('#resetBody').addEventListener('click', () => {
      state.body = defaultBody();
      updateBody();
    });

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animateMove = (direction) => {
      cancelAnimationFrame(anim);
      const g = geometry(state.body);
      const j = scaleJaw(state.jawAtRef, g.jawScale);
      const from = j.p;
      const to = clamp(from + direction * 0.02 * g.D, pMin(j, g), pMax(j, g));
      if (reduceMotion.matches) { setPos(to, g); return; }
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / 450);
        const e = 1 - (1 - t) ** 3;
        setPos(from + (to - from) * e, g);
        if (t < 1) anim = requestAnimationFrame(tick);
      };
      anim = requestAnimationFrame(tick);
    };
    $('#pos').addEventListener('input', (ev) => { cancelAnimationFrame(anim); setPos(+ev.target.value); });
    $('#btnClose').addEventListener('click', () => animateMove(-1));
    $('#btnOpen').addEventListener('click', () => animateMove(1));

    $('#rev').addEventListener('click', () => {
      cancelAnimationFrame(anim);
      state.jawAtRef.rev = !state.jawAtRef.rev;
      render();
    });

    $('#steps').addEventListener('input', (ev) => {
      const el = ev.target;
      const limits = JAW_STEP_LIMITS[el.dataset.k];
      if (!limits || !Number.isFinite(el.valueAsNumber)) return;
      cancelAnimationFrame(anim);
      const g = geometry(state.body);
      const value = clamp(el.valueAsNumber / g.jawScale, limits.min, limits.max);
      state.jawAtRef.steps[+el.dataset.i][el.dataset.k] = value;
      render(g);
    });

    $('#dims').addEventListener('change', (ev) => {
      state.dims = ev.target.checked;
      render();
    });

    $('#reset').addEventListener('click', () => {
      cancelAnimationFrame(anim);
      state.jawAtRef = defaultReferenceJaw();
      render();
    });

    updateBody();
  }

  init();
})();
