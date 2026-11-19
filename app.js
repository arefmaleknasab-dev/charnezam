(() => {
  'use strict';

  const MODEL = { D: 125, D1: 95, D2: 108, D3: 30, H: 85, H1: 58, h: 4, z: 3, d: 8 };
  const BODY_LIMITS = {
    D: { min: 80, max: 160 },
    H1: { min: 30, max: 90 },
  };
  const BODY_INCREMENT = 0.5;
  const MIN_MOUNTING_RIM = 2;

  // Match the unedited jaw profile shown at a 160 mm body diameter.
  const JAW_REFERENCE = {
    D: 160,
    p: 19,
    steps: [{ l: 17.5, h: 27 }, { l: 16.5, h: 18 }, { l: 16.5, h: 9 }],
  };
  const JAW_STEP_INCREMENT = 0.5;
  const POS_INCREMENT = 0.1;
  const JAW_STEP_LIMITS = {
    l: { min: 6.5, max: 32 },
    h: { min: 2.5, max: 40.5 },
  };
  const jawWidth = (D) => 0.14 * D;
  const tipChamfer = (w) => 0.35 * w;
  // Keep a straight section on step 1 even at its shortest allowed length.
  const MIN_TIP_STEP_LENGTH = (Math.floor(tipChamfer(jawWidth(JAW_REFERENCE.D)) / JAW_STEP_INCREMENT) + 1) * JAW_STEP_INCREMENT;

  function jawStepLimits(key, index) {
    const limits = JAW_STEP_LIMITS[key];
    return key === 'l' && index === 0 ? { ...limits, min: Math.max(limits.min, MIN_TIP_STEP_LENGTH) } : limits;
  }
  const JAW_COUNT = 4;
  const MIN_JAW_ENGAGEMENT = 0.5;
  const JAW_BADGE_OFFSET = 0.06;
  const JAW_BADGE_RADIUS = 0.036;
  const SIDE_JAW_FILL = 'hsl(210 16% 74%)';
  const SIDE_BODY_SHADOW = 58;
  const SIDE_BODY_HIGHLIGHT = 90;

  const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const fa = (n) => String(n).replace(/\d/g, (c) => FA_DIGITS[+c]);
  const fmt = (v) => String(Math.round(v * 100) / 100);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pts = (a) => a.map((p) => p.map((n) => +n.toFixed(2)).join(',')).join(' ');
  const $ = (s) => document.querySelector(s);

  // The near pinion is halfway from the side viewing direction (jaw 4) to jaw 1.
  const PIN_OFFSET_DEG = 45;
  const PIN_THETA = (PIN_OFFSET_DEG * Math.PI) / 180;
  // Front-view angles are clockwise from jaw 1; the second pinion is opposite the first.
  const PIN_FRONT_DEG = PIN_OFFSET_DEG - 90;
  const PIN_FRONT_ANGLES = [PIN_FRONT_DEG, PIN_FRONT_DEG + 180];
  const frontPinions = (markup) => PIN_FRONT_ANGLES.map((angle) => `<g transform="rotate(${angle})">${markup}</g>`).join('');
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
    const w = jawWidth(D);
    // Move the mounting seat and bolt circle inward together only when the rim needs clearance.
    const mountingReduction = Math.max(0, MODEL.D2 + MODEL.d + 2 * MIN_MOUNTING_RIM - D);
    return {
      ...MODEL, D, H1, jawScale,
      D1: MODEL.D1 - mountingReduction,
      D2: MODEL.D2 - mountingReduction,
      w, tipChamfer: tipChamfer(w),
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
  const state = { body: defaultBody(), jawAtRef: defaultReferenceJaw(), gripStep: null, dims: true };
  let diagramDrag = null;

  const jawLen = (j) => j.steps.reduce((s, x) => s + x.l, 0);
  const pMin = (j, g) => (j.rev ? g.w / 2 : g.w / 2 - g.tipChamfer);
  // Keep half of each jaw's radial length within the body at maximum opening.
  const pMax = (j, g) => Math.max(pMin(j, g), g.D / 2 - MIN_JAW_ENGAGEMENT * jawLen(j));
  const segments = (j) => (j.rev ? [...j.steps].reverse() : j.steps);

  function maxJawReach(g) {
    const maxJawLength = JAW_REFERENCE.steps.length * JAW_STEP_LIMITS.l.max * g.jawScale;
    return g.D / 2 + (1 - MIN_JAW_ENGAGEMENT) * maxJawLength;
  }

  function gripRadius(j) {
    let r = j.p;
    if (state.gripStep === null) return r;
    // Walk out from the center to the selected step's inner opening.
    const selected = j.steps[state.gripStep];
    for (const step of segments(j)) {
      if (step === selected) break;
      r += step.l;
    }
    return r;
  }

  const steelShade = (lightness) => `hsl(210 16% ${lightness}%)`;
  const shade = (h, g) => steelShade(54 + 36 * clamp(h / g.hMax, 0, 1));

  function endOnStepShade(stepIndex, radius, g) {
    const reach = clamp(radius / maxJawReach(g), 0, 1);
    // Keep the step contrast independent of height; outward motion lightens each face.
    return steelShade(59 + 5 * stepIndex + 24 * reach);
  }

  function reversedEndOnLightness(radius, g) {
    const R = g.D / 2;
    const offset = radius - R;
    // The face is flush with the brightest part of the cylinder at radius R.
    // Keep a smaller lightening range below the surface, so it still looks like steel.
    if (offset <= 0) return SIDE_BODY_HIGHLIGHT + 5 * clamp(-offset / R, 0, 1);
    const protrusion = clamp(offset / (maxJawReach(g) - R), 0, 1);
    return SIDE_BODY_HIGHLIGHT - 24 * protrusion;
  }

  function badge(x, y, k, g) {
    return `<g class="badge"><circle class="thin" cx="${x}" cy="${y}" r="${JAW_BADGE_RADIUS * g.D}"/>` +
      `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${0.044 * g.D}">${k + 1}</text></g>`;
  }

  function dimensionEdge(id, key, axis, factor, shape, attrs, index) {
    const active = diagramDrag?.id === id ? ' is-active' : '';
    const step = index === undefined ? '' : ` data-i="${index}"`;
    return `<g class="dimension-edge${active}" data-edge="${id}" data-k="${key}" data-axis="${axis}" data-factor="${factor}"${step} aria-hidden="true">` +
      `<${shape} class="dimension-highlight" ${attrs}/><${shape} class="dimension-hit" ${attrs}/></g>`;
  }

  function dimensionLine(id, key, axis, factor, [x1, y1], [x2, y2], index) {
    if (x1 === x2 && y1 === y2) return '';
    const attrs = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
    return dimensionEdge(id, key, axis, factor, 'line', attrs, index);
  }

  function stepEdge(scope, index, key, axis, direction, a, b) {
    return dimensionLine(`${scope}-${key}${index}`, key, axis, direction, a, b, index);
  }

  function frontJawShape(j, g) {
    const w = g.w;
    const c = g.tipChamfer;
    const th = w / 2 - c;
    let u = j.p;
    let outline = '';
    const edges = [];
    segments(j).forEach((s) => {
      const u0 = u;
      const u1 = u + s.l;
      u = u1;
      const tip = s === j.steps[0];
      let P;
      if (tip && !j.rev) {
        P = [[-w / 2, u1], [w / 2, u1], [w / 2, u0 + c], [th, u0], [-th, u0], [-w / 2, u0 + c]];
      } else if (tip) {
        P = [[-w / 2, u0], [w / 2, u0], [w / 2, u1 - c], [th, u1], [-th, u1], [-w / 2, u1 - c]];
      } else {
        P = [[-w / 2, u0], [w / 2, u0], [w / 2, u1], [-w / 2, u1]];
      }
      outline += `<polygon class="ln" fill="${shade(s.h, g)}" points="${pts(P.map(([v, r]) => [v, -r]))}"/>`;
      if (tip) {
        const uc = j.rev ? u1 - c : u0 + c;
        outline += `<line class="cham" x1="${-w / 2}" y1="${-uc}" x2="${w / 2}" y2="${-uc}"/>`;
      }
      edges.push({ index: j.steps.indexOf(s), y: -u1, half: tip && j.rev ? th : w / 2 });
    });
    return { outline, edges };
  }

  function initDrawingFrames() {
    // Fit the largest supported dimensions once so resizing changes the visible size, not the zoom.
    const g = geometry({ D: BODY_LIMITS.D.max, H1: BODY_LIMITS.H1.max });
    const maxReach = maxJawReach(g);
    const frame = (svg, x, y, width, height) => {
      svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
      svg.style.aspectRatio = `${width} / ${height}`;
    };
    // Leave room for the badges even with the longest jaws opened to the limit.
    const badgeReach = maxReach + (JAW_BADGE_OFFSET + JAW_BADGE_RADIUS) * g.D;
    const frontX = badgeReach + 0.02 * g.D;
    const frontY = badgeReach + 0.04 * g.D;
    frame($('#front'), -frontX, -frontY, 2 * frontX, 2 * frontY);
    const pad = 0.06 * g.D;
    const sideY = maxReach + 0.04 * g.D;
    frame($('#outside'), -g.H1 - pad, -sideY, g.H1 + g.hMax + 2 * pad, 2 * sideY);
  }

  function renderFront(j, g, grip) {
    const D = g.D;
    const R = D / 2;
    const fs = 0.042 * D;
    const svg = $('#front');

    let s = `<defs><clipPath id="bodyClip"><circle r="${R}"/></clipPath></defs>`;
    const pr = pinRadius(g);
    const prot = 0.014 * D;
    const phi = (pinAngle(j, g) * Math.PI) / 180;
    const sock = pr * Math.max(Math.abs(0.55 * Math.sin(phi)), Math.abs(0.45 * Math.cos(phi)));
    s += frontPinions(`<rect class="ln pin" x="${-pr}" y="${-R - prot}" width="${2 * pr}" height="${prot + 0.01 * D}"/>`);
    s += `<circle class="ln body" r="${R}"/><circle class="thin nofill" r="${R - 0.02 * D}"/>`;
    s += `<g clip-path="url(#bodyClip)">` + [0, 90].map((a) =>
      `<rect class="thin slot" x="${-g.w / 2}" y="${-R * 1.05}" width="${g.w}" height="${R * 2.1}" transform="rotate(${a})"/>`).join('') + `</g>`;
    s += `<circle class="ln void" r="${g.D3 / 2}"/>`;
    s += frontPinions([-1, 1].map((sg) =>
      `<line class="hid np" x1="${sg * sock}" y1="${-R - prot}" x2="${sg * sock}" y2="${-R + 0.03 * D}"/>`).join(''));
    s += `<line class="ctr" x1="${-0.56 * D}" y1="0" x2="${0.56 * D}" y2="0"/><line class="ctr" x1="0" y1="${-0.56 * D}" x2="0" y2="${0.56 * D}"/>`;

    // The rim is editable only where it is visible behind the jaws.
    s += dimensionEdge('front-body-D', 'D', 'radius', 2, 'circle', `r="${R}"`);
    const { outline, edges } = frontJawShape(j, g);
    for (let k = 0; k < JAW_COUNT; k++) {
      const rotation = `rotate(${k * 360 / JAW_COUNT})`;
      const axis = k % 2 === 0 ? 'y' : 'x';
      const direction = k === 1 || k === 2 ? 1 : -1;
      const edits = edges.map(({ index, y, half }) =>
        stepEdge(`front-${k}`, index, 'l', axis, direction, [-half, y], [half, y])).join('');
      s += `<g class="jaw" transform="${rotation}" data-axis="${axis}" data-factor="${direction}">${outline}</g>`;
      s += `<g class="step-edges" transform="${rotation}">${edits}</g>`;
    }

    s += `<circle class="grip" r="${grip}"/>`;
    if (state.dims) {
      const q = grip * Math.SQRT1_2 + 0.02 * D;
      // Keep the opening label clear of the upper-left pinion at maximum travel.
      s += `<text class="dt accent" stroke-width="${0.014 * D}" x="${q}" y="${-q}" text-anchor="start" font-size="${fs}">Ø${fmt(2 * grip)}</text>`;
    }

    const r = Math.max(j.p + jawLen(j), R) + JAW_BADGE_OFFSET * D;
    for (let k = 0; k < JAW_COUNT; k++) {
      const a = (k * 2 * Math.PI) / JAW_COUNT;
      s += badge(Math.sin(a) * r, -Math.cos(a) * r, k, g);
    }
    svg.innerHTML = s;
  }

  // Shade the bevel along the full axial length, including the visible shank.
  function tipChamferBand(xStart, xEnd, innerY, outerY) {
    return `<rect class="jaw-bevel" x="${xStart}" y="${Math.min(innerY, outerY)}" width="${xEnd - xStart}" height="${Math.abs(outerY - innerY)}"/>`;
  }

  function outsideJawSurface(tag, shape, bevels, clipId, fill = bevels ? 'url(#outsideJawShade)' : SIDE_JAW_FILL) {
    if (!bevels) return `<${tag} class="ln" fill="${fill}" ${shape}/>`;
    // Keep the bands inside the notches and paint the silhouette stroke last.
    return `<${tag} fill="${fill}" ${shape}/>` +
      `<defs><clipPath id="${clipId}"><${tag} ${shape}/></clipPath></defs>` +
      `<g clip-path="url(#${clipId})">${bevels}</g><${tag} class="ln nofill" ${shape}/>`;
  }

  // Exterior side view from jaw 4: x = 0 is the fixed front face; the rear is at -H1.
  function outsideJawSide(j, sign, g) {
    const sd = g.slotDepth;
    const x0 = -sd;
    const xt = x0 + 0.15 * sd;
    const dt = 0.016 * g.D;
    const ss = segments(j);
    const P = [[x0, j.p], [ss[0].h, j.p]];
    const R = g.D / 2;
    const scope = sign < 0 ? 'outside-top' : 'outside-bottom';
    let u = j.p;
    let edits = '';
    ss.forEach((seg, i) => {
      const stepIndex = j.steps.indexOf(seg);
      const start = sign * u;
      u += seg.l;
      const end = sign * u;
      const next = ss[i + 1];
      P.push([seg.h, u]);
      if (next) P.push([next.h, u]);
      // Drag the face axially for height, or its outer radial edge for length.
      edits += stepEdge(scope, stepIndex, 'h', 'x', 1, [seg.h, start], [seg.h, end]);
      edits += stepEdge(scope, stepIndex, 'l', 'y', sign, [seg.h, end], [next?.h ?? (u > R ? xt : 0), end]);
    });
    P.push([xt, u], [xt, u - dt], [x0, u - dt]);
    const shape = `points="${pts(P.map(([x, r]) => [x, sign * r]))}"`;
    const h = j.steps[0].h;
    const c = g.tipChamfer;
    const rc = sign * (j.rev ? u - c : j.p + c);
    const bevelEdge = sign * (j.rev ? u : j.p);
    const bevel = tipChamferBand(x0, h, rc, bevelEdge) +
      `<line class="thin" x1="${x0}" y1="${rc}" x2="${h}" y2="${rc}"/>`;
    const clipId = sign < 0 ? 'outsideTopClip' : 'outsideBottomClip';
    const jaw = `<g class="jaw" data-axis="y" data-factor="${sign}">${outsideJawSurface('polygon', shape, bevel, clipId)}</g>${edits}`;

    // Draw hidden guide grooves over the body only where the jaws protrude.
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
    const nearToFar = [...segments(j)].reverse(); // Outermost step faces the viewer.
    const xT = Math.max(...nearToFar.map((step) => step.h));
    const P = [
      [xb, -hw], [xn0, -hw], [xn0, -hw + nd], [xn1, -hw + nd], [xn1, -hw], [xT, -hw],
      [xT, hw], [xn1, hw], [xn1, hw - nd], [xn0, hw - nd], [xn0, hw], [xb, hw],
    ];
    const shape = `d="${roundedPath(P, [1, 2, 3, 4, 7, 8, 9, 10], 0.25 * nd)}"`;
    const c = g.tipChamfer;
    const outerRadius = j.p + jawLen(j);
    const bevels = j.rev ? [-1, 1].map((sign) => tipChamferBand(xb, j.steps[0].h, sign * (hw - c), sign * hw)).join('') : '';
    const bevelStyle = j.rev ? ` style="--jaw-bevel-fill:${steelShade(reversedEndOnLightness(outerRadius, g) - 16)}"` : '';
    let lines = `<line class="thin" stroke-opacity=".7" x1="${x0 + 0.17 * sd}" y1="${-hw}" x2="${x0 + 0.17 * sd}" y2="${hw}"/>`;
    let visibleExtent = xb;
    let faceRadius = outerRadius;
    let stops = '';
    let edits = '';
    const offset = (x) => (x - xb) / (xT - xb);
    // A farther face is visible only beyond the nearer face's extent.
    for (const step of nearToFar) {
      const { h, l } = step;
      const radius = faceRadius;
      faceRadius -= l; // Hidden steps still contribute to the radial profile.
      if (h <= visibleExtent) continue;
      const index = j.steps.indexOf(step);
      // Hard stops follow the existing edges in either orientation.
      const color = j.rev ? steelShade(reversedEndOnLightness(radius, g)) : endOnStepShade(index, radius, g);
      stops += `<stop offset="${offset(visibleExtent)}" stop-color="${color}"/><stop offset="${offset(h)}" stop-color="${color}"/>`;
      edits += stepEdge('outside-center', index, 'h', 'x', 1, [h, -hw], [h, hw]);
      if (h >= xT) break; // The silhouette already draws this edge.
      visibleExtent = h;
      lines += `<line class="ln" x1="${h}" y1="${-hw}" x2="${h}" y2="${hw}"/>`;
    }
    const gradient = `<defs><linearGradient id="outsideCenterStepShade" gradientUnits="userSpaceOnUse" x1="${xb}" y1="0" x2="${xT}" y2="0">${stops}</linearGradient></defs>`;
    const surface = outsideJawSurface('path', shape, bevels, 'outsideCenterClip', 'url(#outsideCenterStepShade)');
    // The end-on jaw has no visible radial travel here; an upward drag opens it.
    return `<rect class="slotin" x="${xb}" y="${-hw}" width="${-xb}" height="${g.w}"/>${gradient}` +
      `<g class="jaw" data-axis="y" data-factor="-1" data-end-on${bevelStyle}>${surface}${lines}</g>${edits}`;
  }

  function outsideBodyGradient(R) {
    const intervals = 24;
    const stops = Array.from({ length: intervals + 1 }, (_, i) => {
      const offset = i / intervals;
      const y = 2 * offset - 1;
      // The projected cylinder is closest at its center and recedes toward both rims.
      const depth = Math.sqrt(1 - y * y);
      const lightness = SIDE_BODY_SHADOW + (SIDE_BODY_HIGHLIGHT - SIDE_BODY_SHADOW) * depth;
      return `<stop offset="${offset}" stop-color="${steelShade(lightness)}"/>`;
    });
    // Share one coordinate system so the body and jaw recesses match at every height.
    return `<linearGradient id="outsideBodyShade" gradientUnits="userSpaceOnUse" x1="0" y1="${-R}" x2="0" y2="${R}">${stops.join('')}</linearGradient>`;
  }

  function renderOutside(j, g) {
    const { D, H1 } = g;
    const R = D / 2;
    const rearX = -H1;
    const svg = $('#outside');

    const top = outsideJawSide(j, -1, g);
    const bottom = outsideJawSide(j, 1, g);
    let s = `<defs>${outsideBodyGradient(R)}<linearGradient id="outsideJawShade" x1="0%" y1="0%" x2="100%" y2="100%">` +
      `<stop offset="0" stop-color="#c5cfd8"/><stop offset="1" stop-color="#a2b0be"/></linearGradient></defs>`;
    s += top.jaw + bottom.jaw;
    s += `<rect class="ln body" x="${rearX}" y="${-R}" width="${H1}" height="${D}"/>`;
    // The silhouette follows half the diameter; only the rear face moves with H1.
    s += dimensionLine('outside-body-D-top', 'D', 'y', -2, [rearX, -R], [0, -R]);
    s += dimensionLine('outside-body-D-bottom', 'D', 'y', 2, [rearX, R], [0, R]);
    s += dimensionLine('outside-body-H1', 'H1', 'x', -1, [rearX, -R], [rearX, R]);
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

  function syncControls(j, g, grip) {
    const pos = $('#pos');
    pos.min = String(pMin(j, g));
    pos.max = String(pMax(j, g));
    pos.step = String(POS_INCREMENT * g.jawScale);
    pos.value = String(j.p);
    $('#posOut').textContent = `${fmt(j.p)} mm`;

    const rev = $('#rev');
    rev.setAttribute('aria-checked', String(j.rev));
    $('#revState').textContent = j.rev ? 'معکوس' : 'عادی';

    j.steps.forEach((st, i) => {
      for (const key of Object.keys(JAW_STEP_LIMITS)) {
        const { min, max } = jawStepLimits(key, i);
        const input = $(`#${key}${i}`);
        input.min = String(min * g.jawScale);
        input.max = String(max * g.jawScale);
        input.step = String(JAW_STEP_INCREMENT * g.jawScale);
        input.value = String(st[key]);
        $(`#${key}o${i}`).textContent = `${fmt(st[key])} mm`;
      }
    });

    const gripStep = $('#gripStep');
    const firstStep = gripStep.querySelector('option[value="0"]');
    firstStep.disabled = firstStep.hidden = !j.rev;
    gripStep.value = state.gripStep ?? '';
    $('#rdGrip').textContent = `Ø ${fmt(2 * grip)} mm`;
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
    const grip = gripRadius(j);
    renderFront(j, g, grip);
    renderOutside(j, g);
    syncControls(j, g, grip);
  }

  function renderBody() {
    const g = geometry(state.body);
    syncBodyControls(g);
    render(g);
  }

  function setBodyDimension(key, value) {
    if (!Number.isFinite(value)) return;
    const { min, max } = BODY_LIMITS[key];
    const next = clamp(value, min, max);
    if (next === state.body[key]) return;
    state.body[key] = next;
    renderBody();
  }

  function setPos(v, g = geometry(state.body)) {
    if (!Number.isFinite(v) || v === state.jawAtRef.p * g.jawScale) return;
    state.jawAtRef.p = v / g.jawScale;
    render(g);
  }

  function setJawStep(index, key, value, g) {
    const step = state.jawAtRef.steps[index];
    const limits = jawStepLimits(key, index);
    if (!step || !limits || !Number.isFinite(value)) return;
    const next = clamp(value, limits.min, limits.max);
    if (next === step[key]) return;
    step[key] = next;
    render(g);
  }

  function normalizeGripStep(index) {
    const { rev, steps } = state.jawAtRef;
    return Number.isInteger(index) && index >= (rev ? 0 : 1) && index < steps.length ? index : null;
  }

  function setGripStep(index) {
    const next = normalizeGripStep(index);
    if (state.gripStep === next) return;
    state.gripStep = next;
    render();
  }

  function diagramPoint(element, event) {
    const transform = element.getScreenCTM();
    return transform ? new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse()) : null;
  }

  function stepAtPoint(target, event, jaw) {
    const p = diagramPoint(target, event);
    if (!p) return null;
    const ordered = segments(jaw);
    if (target.hasAttribute('data-end-on')) {
      if (p.x < 0) return null; // A click on the shank does not select a step.
      const visible = [...ordered].reverse().find((step) => p.x <= step.h);
      return visible ? jaw.steps.indexOf(visible) : null;
    }
    let edge = jaw.p;
    const radial = Math.abs(p.y);
    for (const step of ordered) {
      edge += step.l;
      if (radial <= edge) return jaw.steps.indexOf(step);
    }
    return jaw.steps.indexOf(ordered[ordered.length - 1]);
  }

  function diagramTarget(svg, event, top = event.target) {
    if (!top || !svg.contains(top)) return null;
    if (!top.classList.contains('dimension-hit')) return top.closest('.jaw');

    let edge = null;
    let face = null;
    let nearest = Infinity;
    for (const hit of document.elementsFromPoint(event.clientX, event.clientY)) {
      // Only consider edit strokes in front of the first visible surface.
      if (!svg.contains(hit)) break;
      if (!hit.classList.contains('dimension-hit')) {
        face = hit.closest('.jaw');
        break;
      }
      const transform = hit.getScreenCTM();
      if (!transform) continue;
      const candidate = hit.parentElement;
      const axis = candidate.dataset.axis;
      let distance;
      if (axis === 'radius') {
        const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
        distance = Math.abs(Math.hypot(p.x, p.y) - hit.r.baseVal.value) * Math.hypot(transform.a, transform.b);
      } else {
        const start = new DOMPoint(hit.x1.baseVal.value, hit.y1.baseVal.value).matrixTransform(transform);
        distance = Math.abs(axis === 'x' ? event.clientX - start.x : event.clientY - start.y);
      }
      if (distance < nearest) {
        nearest = distance;
        edge = candidate;
      }
    }
    if (face) {
      // Keep a usable face between handles even on a small or shortened jaw.
      const m = svg.getScreenCTM();
      const stepPixels = m ? Math.hypot(m.a, m.b) * JAW_STEP_LIMITS.l.min * state.body.D / JAW_REFERENCE.D : 0;
      if (nearest > Math.min(4, stepPixels / 3)) return face;
    }
    return edge;
  }

  function dragSettings(target, event) {
    const { edge: id, i, k: key, axis, factor } = target.dataset;
    const g = geometry(state.body);
    if (target.classList.contains('jaw')) {
      const jaw = scaleJaw(state.jawAtRef, g.jawScale);
      const min = pMin(jaw, g);
      const max = pMax(jaw, g);
      return {
        axis, factor: +factor, min, initial: jaw.p, increment: POS_INCREMENT * g.jawScale,
        tapStep: stepAtPoint(target, event, jaw),
        apply: (value) => setPos(clamp(value, min, max), g),
      };
    }
    const isBody = i === undefined;
    const index = +i;
    const { min } = isBody ? BODY_LIMITS[key] : jawStepLimits(key, index);
    return {
      id, axis, min, factor: isBody ? +factor : +factor / g.jawScale,
      initial: isBody ? state.body[key] : state.jawAtRef.steps[index][key],
      increment: isBody ? BODY_INCREMENT : JAW_STEP_INCREMENT,
      apply: isBody ? (value) => setBodyDimension(key, value) : (value) => setJawStep(index, key, value, g),
    };
  }

  function endDiagramDrag() {
    if (!diagramDrag) return;
    const { svg, pointerId } = diagramDrag;
    diagramDrag = null;
    svg.querySelector('.dimension-edge.is-active')?.classList.remove('is-active');
    svg.style.cursor = '';
    if (svg.hasPointerCapture(pointerId)) svg.releasePointerCapture(pointerId);
  }

  function bindDiagramEditing(svg, stopAnimation) {
    const coordinate = (event, axis) => {
      const p = diagramPoint(svg, event);
      if (!p) return NaN;
      return axis === 'radius' ? Math.hypot(p.x, p.y) : p[axis];
    };
    const cursor = (target, active = false) => {
      const { axis } = target.dataset;
      if (axis === 'radius' || target.classList.contains('jaw')) return active ? 'grabbing' : 'grab';
      return axis === 'x' ? 'ew-resize' : 'ns-resize';
    };
    const ownsDrag = (event) => diagramDrag?.svg === svg && diagramDrag.pointerId === event.pointerId;
    let hovered = null;
    const setHover = (target) => {
      if (hovered === target) return;
      hovered?.classList.remove('is-hovered');
      hovered = target;
      if (target?.classList.contains('dimension-edge')) target.classList.add('is-hovered');
      svg.style.cursor = target ? cursor(target) : '';
    };
    const moveDrag = (event) => {
      const { axis, factor, start, initial, min, increment, apply, tapStep, pressX, pressY } = diagramDrag;
      if (tapStep !== undefined && !diagramDrag.moved) {
        const slop = event.pointerType === 'touch' ? 6 : 4;
        if (Math.hypot(event.clientX - pressX, event.clientY - pressY) < slop) return;
        diagramDrag.moved = true;
      }
      const delta = (coordinate(event, axis) - start) * factor;
      const ticks = Math.round((initial + delta - min) / increment);
      apply(Math.abs(delta) < increment / 2 ? initial : min + ticks * increment);
    };

    svg.addEventListener('pointermove', (event) => {
      if (ownsDrag(event)) moveDrag(event);
      else if (!diagramDrag && event.pointerType !== 'touch') {
        setHover(diagramTarget(svg, event));
      }
    });
    svg.addEventListener('pointerleave', () => { if (!diagramDrag) setHover(null); });
    svg.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0 || diagramDrag) return;
      const target = diagramTarget(svg, event);
      if (!target) return;
      const settings = dragSettings(target, event);
      const start = coordinate(event, settings.axis);
      if (!Number.isFinite(start)) return;
      stopAnimation();
      setHover(null);
      // Capture on the mounted SVG, not on the face or edge replaced by rendering.
      svg.setPointerCapture(event.pointerId);
      diagramDrag = {
        ...settings, svg, pointerId: event.pointerId, start,
        pressX: event.clientX, pressY: event.clientY, moved: false,
      };
      if (settings.id) target.classList.add('is-active');
      svg.style.cursor = cursor(target, true);
      event.preventDefault();
    });
    // Some browsers ignore touch-action on SVG strokes; keep panning off only during a drag.
    svg.addEventListener('touchstart', (event) => {
      if (diagramDrag?.svg === svg && event.cancelable) event.preventDefault();
    }, { passive: false });
    svg.addEventListener('pointerup', (event) => {
      if (!ownsDrag(event)) return;
      moveDrag(event);
      const { tapStep, moved } = diagramDrag;
      endDiagramDrag();
      if (tapStep != null && !moved) setGripStep(tapStep);
      if (event.pointerType !== 'touch') setHover(diagramTarget(svg, event, document.elementFromPoint(event.clientX, event.clientY)));
    });
    const cancelDrag = (event) => { if (ownsDrag(event)) endDiagramDrag(); };
    svg.addEventListener('pointercancel', cancelDrag);
    svg.addEventListener('lostpointercapture', cancelDrag);
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
          <input type="range" id="l${i}" data-i="${i}" data-k="l" step="${JAW_STEP_INCREMENT}">
          <output id="lo${i}" for="l${i}" dir="ltr"></output>
        </div>
        <div class="row">
          <label for="h${i}">ارتفاع</label>
          <input type="range" id="h${i}" data-i="${i}" data-k="h" step="${JAW_STEP_INCREMENT}">
          <output id="ho${i}" for="h${i}" dir="ltr"></output>
        </div>
      </div>`).join('');

    let anim = 0;
    const stopAnimation = () => cancelAnimationFrame(anim);
    const interruptMotion = () => {
      stopAnimation();
      endDiagramDrag();
    };
    bindDiagramEditing($('#front'), stopAnimation);
    bindDiagramEditing($('#outside'), stopAnimation);

    for (const [key, { min, max }] of Object.entries(BODY_LIMITS)) {
      const input = $(`#body${key}`);
      input.min = String(min);
      input.max = String(max);
      input.step = String(BODY_INCREMENT);
      input.addEventListener('input', () => {
        interruptMotion();
        setBodyDimension(key, input.valueAsNumber);
      });
    }
    $('#resetBody').addEventListener('click', () => {
      interruptMotion();
      state.body = defaultBody();
      renderBody();
    });

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animateMove = (direction) => {
      interruptMotion();
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
    $('#pos').addEventListener('input', (ev) => { interruptMotion(); setPos(+ev.target.value); });
    $('#btnClose').addEventListener('click', () => animateMove(-1));
    $('#btnOpen').addEventListener('click', () => animateMove(1));

    $('#rev').addEventListener('click', () => {
      interruptMotion();
      state.jawAtRef.rev = !state.jawAtRef.rev;
      if (state.gripStep !== null) {
        // The other step now faces inward at the same joint after reversal.
        const offset = state.jawAtRef.rev ? -1 : 1;
        state.gripStep = normalizeGripStep(state.gripStep + offset);
      }
      render();
    });

    $('#steps').addEventListener('input', (ev) => {
      const el = ev.target;
      const { k, i } = el.dataset;
      if (!Number.isFinite(el.valueAsNumber)) return;
      interruptMotion();
      const g = geometry(state.body);
      setJawStep(+i, k, el.valueAsNumber / g.jawScale, g);
    });

    $('#gripStep').addEventListener('change', (ev) => {
      interruptMotion();
      setGripStep(ev.target.value === '' ? null : Number(ev.target.value));
    });

    $('#dims').addEventListener('change', (ev) => {
      state.dims = ev.target.checked;
      render();
    });

    $('#reset').addEventListener('click', () => {
      interruptMotion();
      state.jawAtRef = defaultReferenceJaw();
      state.gripStep = null;
      render();
    });

    renderBody();
  }

  init();
})();
