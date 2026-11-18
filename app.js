(() => {
  'use strict';

  // name, D, D1, D2, D3, H, H1, h, z, d(M)
  const MODELS = [
    ['K12 80', 80, 55, 66, 16, 66, 50, 3.5, 3, 6],
    ['K12 100', 100, 72, 84, 22, 74.5, 55, 3.5, 3, 8],
    ['K12 125', 125, 95, 108, 30, 85, 58, 4, 3, 8],
    ['K12 130', 130, 100, 115, 30, 85, 58, 4, 3, 8],
    ['K12 160', 160, 130, 142, 40, 95, 65, 5, 3, 8],
    ['K12 160A', 160, 130, 142, 40, 109, 65, 5, 3, 8],
    ['K12 165', 165, 130, 145, 40, 95, 65, 5, 3, 8],
    ['K12 165A', 165, 130, 145, 40, 109, 65, 5, 3, 8],
    ['K12 190', 190, 155, 172, 55, 109, 75, 5, 3, 10],
    ['K12 190A', 190, 155, 172, 55, 122, 75, 5, 3, 10],
    ['K12 200', 200, 165, 180, 65, 109, 75, 5, 3, 10],
    ['K12 200A', 200, 165, 180, 65, 122, 75, 5, 3, 10],
    ['K12 240', 240, 195, 215, 70, 120, 80, 8, 3, 12],
    ['K12 240A', 240, 195, 215, 70, 133, 80, 8, 3, 12],
    ['K12 250', 250, 206, 226, 80, 120, 80, 5, 3, 12],
    ['K12 250A', 250, 206, 226, 80, 133, 80, 5, 3, 12],
    ['K12 315', 315, 260, 285, 100, 142.5, 90, 6, 3, 16],
    ['K12 315A', 315, 260, 285, 100, 155.5, 90, 6, 3, 16],
    ['K12 320', 320, 270, 290, 100, 142.5, 90, 6, 3, 16],
    ['K12 320A', 320, 270, 290, 100, 155.5, 90, 6, 3, 16],
    ['K12 325', 325, 272, 296, 100, 142.5, 90, 6, 3, 16],
    ['K12 325A', 325, 272, 296, 100, 155.5, 90, 6, 3, 16],
    ['K12 380', 380, 325, 350, 130, 155.5, 100, 6, 3, 16],
    ['K12 380A', 380, 325, 350, 130, 170.5, 100, 6, 3, 16],
    ['K12 400', 400, 340, 368, 130, 155.5, 100, 6, 3, 16],
    ['K12 400A', 400, 340, 368, 130, 170.5, 100, 6, 3, 16],
    ['K12 500', 500, 440, 465, 200, 176, 115, 6, 6, 16],
    ['K12 500A', 500, 440, 465, 200, 203, 115, 6, 6, 16],
    ['K12 630', 630, 560, 595, 260, 192, 130, 7, 6, 16],
    ['K12 630A', 630, 560, 595, 260, 218, 130, 7, 6, 16],
    ['K12 800A', 800, 710, 760, 385, 249, 148, 8, 6, 20],
    ['K12 1000A', 1000, 910, 950, 460, 266, 165, 8, 6, 24],
  ];

  const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const fa = (n) => String(n).replace(/\d/g, (c) => FA_DIGITS[+c]);
  const half = (v) => Math.round(v * 2) / 2;
  const fmt = (v) => String(Math.round(v * 10) / 10);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pts = (a) => a.map((p) => p.map((n) => +n.toFixed(2)).join(',')).join(' ');
  const $ = (s) => document.querySelector(s);

  const state = { mi: 10, jaws: [], target: 'all', dims: true };

  // Jaw opening/closing screw (pinion), measured from the reference drawing:
  // it sits ~37.6° from the viewing direction of the exterior side view (towards jaw 1),
  // at 0.446·H1 from the back face, with a radius of 0.065·D.
  const PIN_THETA = (37.6 * Math.PI) / 180;
  const PIN_FRONT_DEG = 90 - 37.6; // same screw in the front view, clockwise from jaw 1
  const pinRadius = (g) => Math.min(0.065 * g.D, 0.3 * g.H1);
  // One full turn of the screw per 3% of D of jaw travel.
  const pinAngle = (g) => {
    const mean = state.jaws.reduce((a, j) => a + j.p, 0) / state.jaws.length;
    return ((mean / (0.03 * g.D)) * 360) % 360;
  };

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

  function geometry() {
    const [name, D, D1, D2, D3, H, H1, h, z, d] = MODELS[state.mi];
    const hp = H - H1;
    return {
      name, D, D1, D2, D3, H, H1, h, z, d, hp,
      w: 0.14 * D,
      slotDepth: 0.4 * H1,
      scrollT: 0.14 * H1,
      lMin: half(0.04 * D),
      lMax: half(0.2 * D),
      hMin: Math.max(2, half(0.1 * hp)),
      hMax: half(1.5 * hp),
    };
  }

  function defaultJaws(g) {
    return Array.from({ length: 4 }, () => ({
      p: half(0.15 * g.D),
      rev: false,
      steps: [
        { l: half(0.14 * g.D), h: half(g.hp) },
        { l: half(0.13 * g.D), h: half(g.hp * 0.66) },
        { l: half(0.13 * g.D), h: half(g.hp * 0.33) },
      ],
    }));
  }

  const jawLen = (j) => j.steps.reduce((s, x) => s + x.l, 0);
  const chamfer = (j, g) => Math.min(0.35 * g.w, 0.9 * j.steps[0].l);
  const pMin = (j, g) => (j.rev ? g.w / 2 : g.w / 2 - chamfer(j, g));
  const pMax = (j, g) => Math.max(pMin(j, g), g.D / 2 - 0.65 * jawLen(j));
  const segments = (j) => (j.rev ? [...j.steps].reverse() : j.steps);
  const targets = () => (state.target === 'all' ? state.jaws : [state.jaws[state.target]]);
  const lead = () => targets()[0];

  function shade(h, selected, g) {
    const t = clamp(h / g.hMax, 0, 1);
    return selected ? `hsl(22 85% ${50 + 32 * t}%)` : `hsl(210 16% ${54 + 36 * t}%)`;
  }

  function arrow(x, y, dx, dy, a) {
    const bx = x - dx * a;
    const by = y - dy * a;
    const px = -dy * a * 0.28;
    const py = dx * a * 0.28;
    return `<polygon class="dimfill" points="${pts([[x, y], [bx + px, by + py], [bx - px, by - py]])}"/>`;
  }

  function badge(x, y, k, g) {
    const sel = state.target === k;
    return `<g class="badge${sel ? ' sel' : ''}" data-jaw="${k}"><circle class="thin" cx="${x}" cy="${y}" r="${0.036 * g.D}"/>` +
      `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${0.044 * g.D}">${k + 1}</text></g>`;
  }

  function frontJaw(j, k, g) {
    const sel = state.target === k;
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
      out += `<polygon class="ln" fill="${shade(s.h, sel, g)}" points="${pts(P.map(([v, r]) => [v, -r]))}"/>`;
      if (s === j.steps[0]) {
        const uc = j.rev ? u1 - c : u0 + c;
        out += `<line class="cham" x1="${-w / 2}" y1="${-uc}" x2="${w / 2}" y2="${-uc}"/>`;
      }
    });
    return `<g class="jaw" data-jaw="${k}" tabindex="0" role="button" aria-label="انتخاب فک ${fa(k + 1)}" transform="rotate(${k * 90})">${out}</g>`;
  }

  function renderFront(g) {
    const D = g.D;
    const R = D / 2;
    const fs = 0.042 * D;
    const svg = $('#front');
    svg.setAttribute('viewBox', `${-0.82 * D} ${-0.95 * D} ${1.64 * D} ${1.79 * D}`);
    svg.style.aspectRatio = '1.64 / 1.79';

    let s = `<defs><clipPath id="bodyClip"><circle r="${R}"/></clipPath></defs>`;
    const pr = pinRadius(g);
    const prot = 0.014 * D;
    const phi = (pinAngle(g) * Math.PI) / 180;
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

    state.jaws.forEach((j, k) => { s += frontJaw(j, k, g); });

    const p0 = state.jaws[0].p;
    const symmetric = state.jaws.every((j) => Math.abs(j.p - p0) < 0.01);
    if (symmetric) {
      s += `<circle class="grip" r="${p0}"/>`;
      if (state.dims) {
        const q = p0 * Math.SQRT1_2 + 0.02 * D;
        s += `<text class="dt accent" stroke-width="${0.014 * D}" x="${-q}" y="${-q}" text-anchor="end" font-size="${fs}">Ø${fmt(2 * p0)}</text>`;
      }
    }

    state.jaws.forEach((j, k) => {
      const r = Math.max(j.p + jawLen(j), R) + 0.06 * D;
      const a = (k * Math.PI) / 2;
      s += badge(Math.sin(a) * r, -Math.cos(a) * r, k, g);
    });

    if (state.dims) {
      const q = Math.SQRT1_2;
      const r0 = g.D2 / 2;
      const r1 = R + 0.09 * D;
      s += `<line class="dim" x1="${q * r0}" y1="${q * r0}" x2="${q * r1}" y2="${q * r1}"/>`;
      s += `<text class="dt" stroke-width="${0.014 * D}" x="${q * r1 + 0.015 * D}" y="${q * r1 + 0.02 * D}" font-size="${fs}">${g.z}-M${g.d}</text>`;
    }
    svg.innerHTML = s;
  }

  function sideJaw(j, k, sign, g) {
    const sel = state.target === k;
    const x0 = g.H1 - g.slotDepth;
    const ss = segments(j);
    const P = [[x0, j.p], [g.H1 + ss[0].h, j.p]];
    let u = j.p;
    ss.forEach((seg, i) => {
      u += seg.l;
      P.push([g.H1 + seg.h, u]);
      if (ss[i + 1]) P.push([g.H1 + ss[i + 1].h, u]);
    });
    P.push([x0, u]);
    const fill = sel ? 'hsl(22 85% 64%)' : 'hsl(210 16% 74%)';
    const c = chamfer(j, g);
    const rc = sign * (j.rev ? u - c : j.p + c);
    return `<polygon class="ln" fill="${fill}" points="${pts(P.map(([x, r]) => [x, sign * r]))}"/>` +
      `<line class="cham" x1="${x0}" y1="${rc}" x2="${g.H1 + j.steps[0].h}" y2="${rc}"/>`;
  }

  function renderSide(g) {
    const { D, D1, D2, D3, H1, h, d } = g;
    const R = D / 2;
    const fs = 0.042 * D;
    const halo = 0.014 * D;
    const a = 0.024 * D;
    const e = 0.012 * D;
    const xMin = -0.34 * D;
    const width = 0.34 * D + H1 + g.hMax + 0.14 * D;
    const svg = $('#side');
    svg.setAttribute('viewBox', `${xMin} ${-0.95 * D} ${width} ${1.79 * D}`);
    svg.style.aspectRatio = `${width} / ${1.79 * D}`;

    const hs = 0.022 * D;
    let s = `<defs><pattern id="hatch" width="${hs}" height="${hs}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<line x1="0" y1="0" x2="0" y2="${hs}" stroke="#1b2430" stroke-opacity=".4" stroke-width="${0.003 * D}"/></pattern></defs>`;

    [-1, 1].forEach((sg) => {
      const P = pts([[h, D3 / 2], [h, D1 / 2], [0, D1 / 2], [0, R], [H1, R], [H1, D3 / 2]].map(([x, r]) => [x, sg * r]));
      s += `<polygon class="body" points="${P}"/><polygon class="ln hatch" points="${P}"/>`;
      const slotY = sg < 0 ? -R : D3 / 2;
      s += `<rect class="thin void" x="${H1 - g.slotDepth}" y="${slotY}" width="${g.slotDepth}" height="${R - D3 / 2}"/>`;
      const sc0 = D3 / 2 + 0.03 * D;
      const sc1 = R - 0.07 * D;
      s += `<rect class="thin scroll" x="${H1 - g.slotDepth - g.scrollT}" y="${sg < 0 ? -sc1 : sc0}" width="${g.scrollT}" height="${sc1 - sc0}"/>`;
    });

    const bd = Math.min(1.6 * d, 0.45 * H1);
    s += `<rect class="thin void" x="0" y="${D2 / 2 - d / 2}" width="${bd}" height="${d}"/>`;
    s += `<line class="ctr" x1="${-0.02 * D}" y1="${D2 / 2}" x2="${bd + 0.02 * D}" y2="${D2 / 2}"/>`;

    const freeX = H1 - g.slotDepth - g.scrollT;
    const pr = Math.min(0.035 * D, (freeX - h) * 0.35);
    const pcx = (h + freeX) / 2;
    const pcy = -(D3 / 2 + R) / 2;
    const sq = pr * 0.55;
    s += `<circle class="thin void" cx="${pcx}" cy="${pcy}" r="${pr}"/>`;
    s += `<rect class="thin nofill" x="${pcx - sq}" y="${pcy - sq}" width="${2 * sq}" height="${2 * sq}" transform="rotate(45 ${pcx} ${pcy})"/>`;

    s += sideJaw(state.jaws[0], 0, -1, g) + sideJaw(state.jaws[2], 2, 1, g);
    const hAct = H1 + Math.max(...state.jaws.flatMap((j) => j.steps.map((x) => x.h)));
    s += `<line class="ctr" x1="${-0.04 * D}" y1="0" x2="${hAct + 0.05 * D}" y2="0"/>`;

    [[0, -1], [2, 1]].forEach(([k, sg]) => {
      const j = state.jaws[k];
      const top = Math.max(...j.steps.map((x) => x.h));
      s += badge(H1 + top + 0.06 * D, sg * (j.p + jawLen(j) / 2), k, g);
    });

    if (state.dims) {
      const vdim = (xc, r, xf, label) =>
        `<line class="dim" x1="${xf}" y1="${-r}" x2="${xc - e}" y2="${-r}"/><line class="dim" x1="${xf}" y1="${r}" x2="${xc - e}" y2="${r}"/>` +
        `<line class="dim" x1="${xc}" y1="${-r}" x2="${xc}" y2="${r}"/>${arrow(xc, -r, 0, -1, a)}${arrow(xc, r, 0, 1, a)}` +
        `<text class="dt" stroke-width="${halo}" transform="translate(${xc - 0.028 * D} 0) rotate(-90)" text-anchor="middle" dominant-baseline="central" font-size="${fs}">${label}</text>`;
      s += vdim(-0.075 * D, D3 / 2, h, `D3=Ø${fmt(D3)}`);
      s += vdim(-0.14 * D, D1 / 2, 0, `D1=Ø${fmt(D1)}`);
      s += vdim(-0.205 * D, D2 / 2, 0, `D2=Ø${fmt(D2)}`);
      s += vdim(-0.27 * D, R, 0, `D=Ø${fmt(D)}`);

      const hdim = (x1, x2, y, label) =>
        `<line class="dim" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>${arrow(x1, y, -1, 0, a)}${arrow(x2, y, 1, 0, a)}` +
        `<text class="dt" stroke-width="${halo}" x="${(x1 + x2) / 2}" y="${y - 0.014 * D}" text-anchor="middle" font-size="${fs}">${label}</text>`;
      const y1 = -0.8 * D;
      const y2 = -0.88 * D;
      s += `<line class="dim" x1="0" y1="${-R - e}" x2="0" y2="${y2 - e}"/>`;
      s += `<line class="dim" x1="${H1}" y1="${-R - e}" x2="${H1}" y2="${y1 - e}"/>`;
      s += `<line class="dim" x1="${hAct}" y1="${-R - e}" x2="${hAct}" y2="${y2 - e}"/>`;
      s += hdim(0, H1, y1, `H1=${fmt(H1)}`) + hdim(0, hAct, y2, `H=${fmt(hAct)}`);

      const yb = R + 0.07 * D;
      s += `<line class="dim" x1="0" y1="${R + e}" x2="0" y2="${yb + e}"/><line class="dim" x1="${h}" y1="${R + e}" x2="${h}" y2="${yb + e}"/>`;
      s += `<line class="dim" x1="${-0.06 * D}" y1="${yb}" x2="${h + 0.06 * D}" y2="${yb}"/>${arrow(0, yb, 1, 0, a)}${arrow(h, yb, -1, 0, a)}`;
      s += `<text class="dt" stroke-width="${halo}" x="${-0.07 * D}" y="${yb}" text-anchor="end" dominant-baseline="central" font-size="${fs}">h=${fmt(h)}</text>`;
    }
    svg.innerHTML = s;
  }

  // Exterior side view, looking at the chuck from the side of jaw 2 (jaw 2 faces the viewer).
  function outsideJawSide(j, k, sign, g) {
    const sel = state.target === k;
    const sd = g.slotDepth;
    const x0 = g.H1 - sd;
    const xt = x0 + 0.15 * sd;
    const dt = 0.016 * g.D;
    const ss = segments(j);
    const P = [[x0, j.p], [g.H1 + ss[0].h, j.p]];
    let u = j.p;
    ss.forEach((seg, i) => {
      u += seg.l;
      P.push([g.H1 + seg.h, u]);
      if (ss[i + 1]) P.push([g.H1 + ss[i + 1].h, u]);
    });
    P.push([xt, u], [xt, u - dt], [x0, u - dt]);
    const fill = sel ? 'hsl(22 85% 64%)' : 'hsl(210 16% 74%)';
    const jaw = `<g class="jaw" data-jaw="${k}" tabindex="0" role="button" aria-label="انتخاب فک ${fa(k + 1)}">` +
      `<polygon class="ln" fill="${fill}" points="${pts(P.map(([x, r]) => [x, sign * r]))}"/></g>`;

    // Overlay drawn after the body: chamfer edge and the hidden guide-groove edges.
    const R = g.D / 2;
    const c = chamfer(j, g);
    const rc = sign * (j.rev ? u - c : j.p + c);
    let over = `<line class="cham" x1="${g.H1}" y1="${rc}" x2="${g.H1 + j.steps[0].h}" y2="${rc}"/>`;
    if (u > R) {
      [x0 + 0.34 * sd, x0 + 0.8 * sd].forEach((x) => {
        over += `<line class="hid np" x1="${x}" y1="${sign * R}" x2="${x}" y2="${sign * u}"/>`;
      });
    }
    return { jaw, over };
  }

  function outsideJawFront(j, k, g) {
    const sel = state.target === k;
    const sd = g.slotDepth;
    const x0 = g.H1 - sd;
    const xb = x0 - 0.07 * sd;
    const xn0 = x0 + 0.34 * sd;
    const xn1 = x0 + 0.8 * sd;
    const hw = g.w / 2;
    const nd = 0.17 * g.w;
    const hs = j.steps.map((x) => x.h);
    const hMax = Math.max(...hs);
    const xT = g.H1 + hMax;
    const P = [
      [xb, -hw], [xn0, -hw], [xn0, -hw + nd], [xn1, -hw + nd], [xn1, -hw], [xT, -hw],
      [xT, hw], [xn1, hw], [xn1, hw - nd], [xn0, hw - nd], [xn0, hw], [xb, hw],
    ];
    const fill = sel ? 'hsl(22 85% 64%)' : 'hsl(210 16% 74%)';
    let s = `<rect class="slotin" x="${xb}" y="${-hw}" width="${g.H1 - xb}" height="${g.w}"/>`;
    s += `<g class="jaw" data-jaw="${k}" tabindex="0" role="button" aria-label="انتخاب فک ${fa(k + 1)}">`;
    s += `<path class="ln" fill="${fill}" d="${roundedPath(P, [1, 2, 3, 4, 7, 8, 9, 10], 0.25 * nd)}"/>`;
    s += `<line class="ln" x1="${x0}" y1="${-hw}" x2="${x0}" y2="${hw}"/>`;
    s += `<line class="thin" stroke-opacity=".7" x1="${x0 + 0.17 * sd}" y1="${-hw}" x2="${x0 + 0.17 * sd}" y2="${hw}"/>`;
    const seen = new Set();
    hs.forEach((h) => {
      const x = g.H1 + h;
      if (h >= hMax - 1e-6 || seen.has(h)) return;
      seen.add(h);
      s += `<line class="ln" x1="${x}" y1="${-hw}" x2="${x}" y2="${hw}"/>`;
    });
    return `${s}</g>`;
  }

  function renderOutside(g) {
    const { D, H1 } = g;
    const R = D / 2;
    const xMin = -0.06 * D;
    const width = 0.06 * D + H1 + g.hMax + 0.06 * D;
    const svg = $('#outside');
    svg.setAttribute('viewBox', `${xMin} ${-0.95 * D} ${width} ${1.79 * D}`);
    svg.style.aspectRatio = `${width} / ${1.79 * D}`;

    const top = outsideJawSide(state.jaws[0], 0, -1, g);
    const bottom = outsideJawSide(state.jaws[2], 2, 1, g);
    let s = top.jaw + bottom.jaw;
    s += `<rect class="ln body" x="0" y="${-R}" width="${H1}" height="${D}"/>`;
    s += top.over + bottom.over;
    s += outsideJawFront(state.jaws[1], 1, g);

    // Jaw opening/closing screw on the cylindrical surface (foreshortened circle).
    const pr = pinRadius(g);
    const cx = 0.446 * H1;
    const cy = -R * Math.sin(PIN_THETA);
    const a = 0.55 * pr;
    const b = 0.45 * pr;
    s += `<g transform="translate(${cx} ${cy}) scale(1 ${Math.cos(PIN_THETA).toFixed(4)})">` +
      `<circle class="ln pin" r="${pr}"/>` +
      `<g transform="rotate(${pinAngle(g).toFixed(2)})">` +
      `<line class="ln" x1="${-pr}" y1="0" x2="${pr}" y2="0"/><line class="ln" x1="0" y1="${-pr}" x2="0" y2="${pr}"/>` +
      `<polygon class="ln nofill" points="${pts([[-a, 0], [0, -b], [a, 0], [0, b]])}"/></g></g>`;
    svg.innerHTML = s;
  }

  const SPEC_LABELS = [
    ['D', 'قطر بدنه'], ['D1', 'قطر نشیمنگاه پشت'], ['D2', 'قطر دایرهٔ پیچ‌ها'], ['D3', 'قطر سوراخ مرکزی'],
    ['H', 'ارتفاع کل با فک'], ['H1', 'ارتفاع بدنه'], ['h', 'عمق نشیمنگاه'], ['z-d', 'تعداد و سایز پیچ'],
  ];

  function syncControls(g) {
    $('#model').value = String(state.mi);
    const values = { D: g.D, D1: g.D1, D2: g.D2, D3: g.D3, H: g.H, H1: g.H1, h: g.h, 'z-d': `${g.z}-M${g.d}` };
    $('#specs').innerHTML = SPEC_LABELS.map(([k, label]) =>
      `<div><dt><span class="sym" dir="ltr">${k}</span> ${label}</dt><dd dir="ltr">${values[k]}</dd></div>`).join('');

    document.querySelectorAll('#targets button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.t === String(state.target)));
    });
    $('#targetHint').textContent = state.target === 'all'
      ? 'تغییرها روی هر چهار فک به‌صورت همزمان اعمال می‌شود.'
      : `تغییرها فقط روی فک ${fa(state.target + 1)} اعمال می‌شود.`;

    const ts = targets();
    const j = lead();
    const pos = $('#pos');
    pos.min = String(Math.min(...ts.map((t) => pMin(t, g))));
    pos.max = String(Math.max(...ts.map((t) => pMax(t, g))));
    pos.value = String(j.p);
    $('#posOut').textContent = `${fmt(j.p)} mm`;

    const rev = $('#rev');
    rev.setAttribute('aria-checked', String(j.rev));
    $('#revState').textContent = j.rev ? 'معکوس' : 'عادی';

    j.steps.forEach((st, i) => {
      const l = $(`#l${i}`);
      l.min = String(g.lMin); l.max = String(g.lMax); l.value = String(st.l);
      $(`#lo${i}`).textContent = `${fmt(st.l)} mm`;
      const hh = $(`#h${i}`);
      hh.min = String(g.hMin); hh.max = String(g.hMax); hh.value = String(st.h);
      $(`#ho${i}`).textContent = `${fmt(st.h)} mm`;
    });

    const p0 = state.jaws[0].p;
    const symmetric = state.jaws.every((t) => Math.abs(t.p - p0) < 0.01);
    $('#rdGrip').textContent = symmetric ? `Ø ${fmt(2 * p0)} mm` : 'نامتقارن';
    $('#rdLen').textContent = `${fmt(jawLen(j))} mm`;
    const hAct = g.H1 + Math.max(...state.jaws.flatMap((t) => t.steps.map((x) => x.h)));
    $('#rdH').textContent = `${fmt(hAct)} mm`;
    $('#dims').checked = state.dims;
  }

  function render() {
    const g = geometry();
    state.jaws.forEach((j) => { j.p = clamp(j.p, pMin(j, g), pMax(j, g)); });
    renderFront(g);
    renderSide(g);
    renderOutside(g);
    syncControls(g);
  }

  function setTarget(t) {
    state.target = t;
    render();
  }

  function init() {
    $('#model').innerHTML = MODELS.map((m, i) => `<option value="${i}">${m[0]}</option>`).join('');

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

    $('#model').addEventListener('change', (ev) => {
      state.mi = +ev.target.value;
      state.jaws = defaultJaws(geometry());
      render();
    });

    $('#targets').addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (b) setTarget(b.dataset.t === 'all' ? 'all' : +b.dataset.t);
    });

    const setPos = (v) => {
      targets().forEach((j) => { j.p = v; });
      render();
    };
    let anim = 0;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animateBy = (delta) => {
      cancelAnimationFrame(anim);
      const g = geometry();
      const ts = targets();
      const from = ts.map((j) => j.p);
      const to = ts.map((j) => clamp(j.p + delta, pMin(j, g), pMax(j, g)));
      if (reduceMotion.matches) { ts.forEach((j, i) => { j.p = to[i]; }); render(); return; }
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / 450);
        const e = 1 - (1 - t) ** 3;
        ts.forEach((j, i) => { j.p = from[i] + (to[i] - from[i]) * e; });
        render();
        if (t < 1) anim = requestAnimationFrame(tick);
      };
      anim = requestAnimationFrame(tick);
    };
    $('#pos').addEventListener('input', (ev) => { cancelAnimationFrame(anim); setPos(+ev.target.value); });
    $('#btnClose').addEventListener('click', () => animateBy(-0.02 * geometry().D));
    $('#btnOpen').addEventListener('click', () => animateBy(0.02 * geometry().D));

    $('#rev').addEventListener('click', () => {
      const next = !lead().rev;
      targets().forEach((j) => { j.rev = next; });
      render();
    });

    $('#steps').addEventListener('input', (ev) => {
      const el = ev.target;
      if (!el.dataset.k) return;
      targets().forEach((j) => { j.steps[+el.dataset.i][el.dataset.k] = +el.value; });
      render();
    });

    $('#dims').addEventListener('change', (ev) => {
      state.dims = ev.target.checked;
      render();
    });

    $('#reset').addEventListener('click', () => {
      state.jaws = defaultJaws(geometry());
      state.target = 'all';
      render();
    });

    document.querySelectorAll('.view svg').forEach((svg) => {
      svg.addEventListener('click', (ev) => {
        const el = ev.target.closest('[data-jaw]');
        if (el) setTarget(+el.dataset.jaw);
      });
      svg.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const el = ev.target.closest('.jaw');
        if (!el) return;
        ev.preventDefault();
        const k = +el.dataset.jaw;
        setTarget(k);
        const again = svg.querySelector(`.jaw[data-jaw="${k}"]`);
        if (again) again.focus();
      });
    });

    state.jaws = defaultJaws(geometry());
    render();
  }

  init();
})();
