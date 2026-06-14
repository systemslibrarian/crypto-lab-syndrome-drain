/**
 * main.ts — all DOM/UI for Syndrome Drain.
 *
 * Rule of the house: every NUMBER comes from model.ts (pure, sourced). This file
 * only renders and wires events. No math beyond layout/scaling lives here.
 */
import './style.css';
import {
  SCHEMES,
  effectiveSecurityBits,
  marginToFloor,
  isBelowFloor,
  syndromeCount,
  crossoverD,
  maxSafeReuseLog2,
  maxLog2DForDisplay,
  type SchemeParams,
} from './model.ts';

/* ------------------------------------------------------------------ helpers */
const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};
const fmt = (n: number, d = 1) => n.toFixed(d);
/** Human-readable power-of-two count, e.g. 1,048,576 → "2^20 (≈1.0M)". */
const big = (n: number): string => {
  if (n < 1000) return n.toLocaleString();
  const units = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ] as const;
  for (const [v, u] of units) if (n >= v) return `${(n / v).toFixed(1)}${u}`;
  return n.toLocaleString();
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
/** A <title> child — native SVG tooltip, also read by assistive tech. */
const svgTitle = (text: string): SVGElement => {
  const t = document.createElementNS(SVG_NS, 'title');
  t.textContent = text;
  return t;
};

/** Resolve a scheme's chart color from CSS variables (keeps theme in CSS). */
function schemeColor(id: SchemeParams['id']): string {
  const css = getComputedStyle(document.documentElement);
  const map: Record<SchemeParams['id'], string> = {
    bike: '--c-bike',
    hqc: '--c-hqc',
    mceliece: '--c-mceliece',
  };
  return css.getPropertyValue(map[id]).trim() || '#888';
}

/* --------------------------------------------------- shared chart geometry */
const MAX_LOG2D = maxLog2DForDisplay(); // derived from the model, not hardcoded
const FLOOR = SCHEMES[0].targetSecurityBits; // 143; identical across schemes

// y-range: a little headroom above the highest single-instance value and below
// the floor, both derived from the model.
const Y_MAX = Math.ceil(Math.max(...SCHEMES.map((s) => s.singleInstanceBits)) + 4);
const Y_MIN = Math.floor(
  Math.min(FLOOR, ...SCHEMES.map((s) => effectiveSecurityBits(s, 2 ** MAX_LOG2D))) - 2,
);

/* ============================================================= the chart */
function renderChart(currentLog2D: number): void {
  const host = $('#chart');
  host.replaceChildren();

  // viewBox space; CSS scales it responsively while keeping the aspect ratio.
  const W = 720;
  const H = 420;
  const m = { top: 20, right: 18, bottom: 48, left: 52 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const xOf = (log2d: number) => m.left + (log2d / MAX_LOG2D) * iw;
  const yOf = (bits: number) =>
    m.top + ih - ((bits - Y_MIN) / (Y_MAX - Y_MIN)) * ih;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'presentation',
  });

  // --- y grid + labels (bits) ---
  const yStep = 5;
  for (let b = Math.ceil(Y_MIN / yStep) * yStep; b <= Y_MAX; b += yStep) {
    svg.appendChild(
      svgEl('line', { class: 'grid-line', x1: m.left, y1: yOf(b), x2: W - m.right, y2: yOf(b) }),
    );
    const lbl = svgEl('text', {
      class: 'axis-label',
      x: m.left - 8,
      y: yOf(b) + 4,
      'text-anchor': 'end',
    });
    lbl.textContent = String(b);
    svg.appendChild(lbl);
  }

  // --- x labels (log2 D) ---
  const xStep = 5;
  for (let k = 0; k <= MAX_LOG2D; k += xStep) {
    svg.appendChild(
      svgEl('line', { class: 'grid-line', x1: xOf(k), y1: m.top, x2: xOf(k), y2: m.top + ih }),
    );
    const lbl = svgEl('text', {
      class: 'axis-label',
      x: xOf(k),
      y: m.top + ih + 18,
      'text-anchor': 'middle',
    });
    lbl.textContent = `2^${k}`;
    svg.appendChild(lbl);
  }

  // --- axes ---
  svg.appendChild(svgEl('line', { class: 'axis-line', x1: m.left, y1: m.top, x2: m.left, y2: m.top + ih }));
  svg.appendChild(svgEl('line', { class: 'axis-line', x1: m.left, y1: m.top + ih, x2: W - m.right, y2: m.top + ih }));

  const xTitle = svgEl('text', { class: 'axis-title', x: m.left + iw / 2, y: H - 6, 'text-anchor': 'middle' });
  xTitle.textContent = 'D — session keys per public key (log₂ scale)';
  svg.appendChild(xTitle);

  const yTitle = svgEl('text', {
    class: 'axis-title',
    x: 14,
    y: m.top + ih / 2,
    'text-anchor': 'middle',
    transform: `rotate(-90 14 ${m.top + ih / 2})`,
  });
  yTitle.textContent = 'Effective security (bits)';
  svg.appendChild(yTitle);

  // --- floor line (143) ---
  svg.appendChild(
    svgEl('line', { class: 'floor-line', x1: m.left, y1: yOf(FLOOR), x2: W - m.right, y2: yOf(FLOOR) }),
  );
  const floorLbl = svgEl('text', { class: 'floor-label', x: W - m.right, y: yOf(FLOOR) - 6, 'text-anchor': 'end' });
  floorLbl.textContent = `Level-1 floor: ${FLOOR} bits`;
  svg.appendChild(floorLbl);

  // --- one polyline per scheme + its crossover markers ---
  const showPaper = ($('#show-paper') as HTMLInputElement).checked;
  const SAMPLES = 120;
  for (const s of SCHEMES) {
    const color = schemeColor(s.id);
    let d = '';
    for (let i = 0; i <= SAMPLES; i++) {
      const log2d = (i / SAMPLES) * MAX_LOG2D;
      const D = 2 ** log2d;
      const bits = effectiveSecurityBits(s, D);
      d += `${i === 0 ? 'M' : 'L'}${xOf(log2d).toFixed(2)} ${yOf(bits).toFixed(2)} `;
    }
    svg.appendChild(svgEl('path', { class: 'scheme-line', d, stroke: color }));

    const c = crossoverD(s);
    // MODELED crossover: filled circle where the idealized √D curve meets the floor.
    if (c.computedLog2Exact >= 0 && c.computedLog2Exact <= MAX_LOG2D) {
      const dot = svgEl('circle', {
        class: 'cross-dot',
        cx: xOf(c.computedLog2Exact),
        cy: yOf(FLOOR),
        r: 5,
        fill: color,
      });
      dot.appendChild(svgTitle(`${s.label}: modeled crossover ≈ 2^${c.computedLog2} (idealized √D law)`));
      svg.appendChild(dot);
    }
    // PAPER-STATED crossover: hollow diamond at the paper's full-ISD value.
    if (showPaper && c.paperStatedLog2 !== 'UNKNOWN' && c.paperStatedLog2 <= MAX_LOG2D) {
      const x = xOf(c.paperStatedLog2);
      const y = yOf(FLOOR);
      const r = 6;
      const diamond = svgEl('polygon', {
        class: 'paper-mark',
        points: `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`,
        stroke: color,
        fill: 'var(--bg-elev-2)',
      });
      diamond.appendChild(svgTitle(`${s.label}: paper-stated crossover 2^${c.paperStatedLog2} (full-ISD table)`));
      svg.appendChild(diamond);
    }
  }

  // --- "now" marker at the current D ---
  svg.appendChild(svgEl('line', { class: 'now-line', x1: xOf(currentLog2D), y1: m.top, x2: xOf(currentLog2D), y2: m.top + ih }));
  for (const s of SCHEMES) {
    const bits = effectiveSecurityBits(s, 2 ** currentLog2D);
    if (bits >= Y_MIN && bits <= Y_MAX) {
      svg.appendChild(
        svgEl('circle', { class: 'now-dot', cx: xOf(currentLog2D), cy: yOf(bits), r: 4.5, fill: schemeColor(s.id) }),
      );
    }
  }

  host.appendChild(svg);
}

/* ===================================================== live readout table */
function renderReadout(D: number): void {
  const body = $('#readout-body');
  body.replaceChildren();
  for (const s of SCHEMES) {
    const bits = effectiveSecurityBits(s, D);
    const margin = marginToFloor(s, D);
    const below = isBelowFloor(s, D);

    const tr = document.createElement('tr');
    if (below) tr.className = 'is-below';
    tr.innerHTML = `
      <td data-label="Scheme">
        <span class="scheme-cell">
          <span class="swatch" style="background:${schemeColor(s.id)}"></span>
          ${s.label} <span class="muted small">${s.paramSet}</span>
        </span>
      </td>
      <td data-label="Effective bits" class="num">${fmt(bits, 1)}</td>
      <td data-label="Margin to floor" class="num">${margin >= 0 ? '+' : ''}${fmt(margin, 1)}</td>
      <td data-label="Status">
        <span class="pill ${below ? 'danger' : 'safe'}">${below ? 'BELOW FLOOR' : 'SAFE'}</span>
      </td>`;
    body.appendChild(tr);
  }
}

/* ============================== chart legend (static) */
function renderLegend(): void {
  const host = $('#chart-legend');
  const schemes = SCHEMES.map(
    (s) => `<span class="lg-item"><span class="swatch" style="background:${schemeColor(s.id)}"></span>${s.label}</span>`,
  ).join('');
  host.innerHTML = `
    <div class="lg-row">${schemes}</div>
    <div class="lg-row lg-marks">
      <span class="lg-item"><span class="lg-dot"></span>modeled crossover <span class="muted">(idealized √D law)</span></span>
      <span class="lg-item"><span class="lg-diamond"></span>paper crossover <span class="muted">(full-ISD table)</span></span>
    </div>`;
}

/* ============================== live security-level meter (intuitive layer) */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Qualitative band for a margin (bits) above the floor — labels, not numbers. */
function levelBand(margin: number): { label: string; cls: string } {
  if (margin >= 8) return { label: 'Comfortable', cls: 'lm-safe' };
  if (margin >= 0) return { label: 'Thin margin', cls: 'lm-warn' };
  if (margin >= -8) return { label: 'Below floor', cls: 'lm-danger' };
  return { label: 'Dangerously low', cls: 'lm-crit' };
}

/**
 * A compact, intuitive meter that mirrors the chart in words: one bar per
 * scheme, colored by how far it sits from the 143-bit floor. The exact numbers
 * live in the readout table; this layer is the "is it OK?" glance.
 */
function renderLevelMeter(D: number, log2d: number): void {
  const host = $('#level-meter');
  const floorFrac = clamp01((FLOOR - Y_MIN) / (Y_MAX - Y_MIN));

  const belowCount = SCHEMES.filter((s) => isBelowFloor(s, D)).length;
  const headline =
    belowCount === 0
      ? `All three schemes stay above the ${FLOOR}-bit floor.`
      : `${belowCount} of 3 schemes ${belowCount === 1 ? 'has' : 'have'} dropped below the ${FLOOR}-bit floor.`;

  const rows = SCHEMES.map((s) => {
    const bits = effectiveSecurityBits(s, D);
    const margin = marginToFloor(s, D);
    const band = levelBand(margin);
    const fillFrac = clamp01((bits - Y_MIN) / (Y_MAX - Y_MIN));
    return `
      <li class="lm-item ${band.cls}">
        <span class="lm-name">
          <span class="swatch" style="background:${schemeColor(s.id)}"></span>${s.label}
        </span>
        <span class="lm-track" role="presentation">
          <span class="lm-fill" style="width:${(fillFrac * 100).toFixed(1)}%"></span>
          <span class="lm-floor" style="left:${(floorFrac * 100).toFixed(1)}%"></span>
        </span>
        <span class="lm-band">${band.label}</span>
      </li>`;
  }).join('');

  host.innerHTML = `
    <p class="lm-head">
      <span class="lm-live">● live</span>
      <span class="lm-head-text">
        At the slider's current setting —
        <strong class="lm-d">D = 2<sup>${log2d}</sup></strong>
        <span class="muted small">(${big(D)} session${D === 1 ? '' : 's'} per key)</span>
        — ${headline}
      </span>
    </p>
    <ul class="lm-list">${rows}</ul>`;
}

/* ============================== screen-reader chart description (live) */
function describeForSR(D: number, log2d: number): void {
  const parts = SCHEMES.map((s) => {
    const bits = effectiveSecurityBits(s, D);
    return `${s.label} ${fmt(bits, 1)} bits, ${isBelowFloor(s, D) ? 'below' : 'above'} floor`;
  });
  $('#chart-desc').textContent =
    `At D = 2 to the power ${log2d} session keys: ${parts.join('; ')}. Floor is ${FLOOR} bits.`;
}

/* ============================== mechanism: syndrome-count cards (live) */
function renderSyndromeCards(D: number): void {
  const ul = $('#syndrome-cards');
  ul.replaceChildren();
  for (const s of SCHEMES) {
    const li = document.createElement('li');
    li.style.borderLeftColor = schemeColor(s.id);
    const expr = s.syndromeGrowth === 'nD' ? `≈ n · D` : `≈ D`;
    const note =
      s.syndromeGrowth === 'nD'
        ? `ring shifts donate n = ${s.codeLengthN.toLocaleString()} per session`
        : s.id === 'hqc'
          ? `ring blocked by the reduction — one per session`
          : `no ring — one syndrome per session`;
    const count = syndromeCount(s, D);
    li.innerHTML = `
      <p class="sc-name">${s.label} <span class="muted small">${s.paramSet}</span></p>
      <p class="sc-expr mono" style="color:${schemeColor(s.id)}">${expr}</p>
      <p class="sc-note">${note}</p>
      <p class="sc-note">at current D: <strong>${big(count)}</strong> syndromes
        <span class="muted">(2<sup>${fmt(Math.log2(count), 1)}</sup>)</span></p>`;
    ul.appendChild(li);
  }
}

/** Render a duration in days as a human cadence ("every ~18 hours"). */
function cadence(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return 'immediately';
  if (days < 1 / 24) return `every ~${Math.max(1, Math.round(days * 24 * 60))} min`;
  if (days < 1) return `every ~${Math.round(days * 24)} h`;
  if (days < 60) return `every ~${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
  if (days < 730) return `every ~${Math.round(days / 30)} months`;
  return `every ~${Math.round(days / 365)} years`;
}

/* ============================== rotation policy calculator */
function renderOps(): void {
  const target = Math.max(1, Number(($('#target-input') as HTMLInputElement).value) || FLOOR);
  const safetyMargin = Math.max(0, Number(($('#margin-input') as HTMLInputElement).value) || 0);
  const budget = Math.max(1, Math.floor(Number(($('#budget-input') as HTMLInputElement).value) || 1));
  const rate = Math.max(1, Number(($('#rate-input') as HTMLInputElement).value) || 1);
  const effectiveTarget = target + safetyMargin; // require target PLUS the buffer

  $('#budget-pow').innerHTML = `≈ 2<sup>${fmt(Math.log2(budget), 1)}</sup> sessions.`;

  const body = $('#ops-body');
  body.replaceChildren();
  for (const s of SCHEMES) {
    const maxSafeLog2 = maxSafeReuseLog2(s, effectiveTarget); // model-sourced
    const maxSafeD = maxSafeLog2 < 0 ? 0 : 2 ** maxSafeLog2;
    const safe = budget <= maxSafeD;
    const rotateDays = maxSafeD / rate; // sessions-limit ÷ sessions-per-day

    const tr = document.createElement('tr');
    if (!safe) tr.className = 'is-below';
    const limitText =
      maxSafeLog2 < 0 ? `already below at D = 1` : `2^${maxSafeLog2} (≈ ${big(maxSafeD)})`;
    const cadenceText = maxSafeLog2 < 0 ? 'n/a' : cadence(rotateDays);
    tr.innerHTML = `
      <td data-label="Scheme">
        <span class="scheme-cell">
          <span class="swatch" style="background:${schemeColor(s.id)}"></span>
          ${s.label} <span class="muted small">${s.paramSet}</span>
        </span>
      </td>
      <td data-label="Max safe D" class="num">${limitText}</td>
      <td data-label="Rotate every" class="num">${cadenceText}</td>
      <td data-label="Your budget">
        <span class="pill ${safe ? 'safe' : 'danger'}">${safe ? 'WITHIN LIMIT' : 'ROTATE SOONER'}</span>
      </td>`;
    body.appendChild(tr);
  }
}

/* ============================== parameters & sources table (static) */
function renderSources(): void {
  const body = $('#src-body');
  body.replaceChildren();
  for (const s of SCHEMES) {
    const c = crossoverD(s);
    const growth = s.syndromeGrowth === 'nD' ? '≈ n · D' : '≈ D';
    const paper = c.paperStatedLog2 === 'UNKNOWN' ? 'UNKNOWN' : `2^${c.paperStatedLog2}`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Scheme">
        <span class="scheme-cell">
          <span class="swatch" style="background:${schemeColor(s.id)}"></span>
          ${s.label} <span class="muted small">${s.paramSet}</span>
        </span>
      </td>
      <td data-label="T₁ (MMT)" class="num">${fmt(s.singleInstanceBits, 2)} bits</td>
      <td data-label="Code length n" class="num">${s.codeLengthN.toLocaleString()}</td>
      <td data-label="Syndromes / D" class="mono">${growth}</td>
      <td data-label="Paper crossover" class="num">${paper}</td>
      <td data-label="Source" class="small muted">${s.source}</td>`;
    body.appendChild(tr);
  }
}

/* ============================== known-gaps crossover discrepancy line */
function renderCrossoverGap(): void {
  const li = $('#gap-crossover');
  const rows = SCHEMES.map((s) => {
    const c = crossoverD(s);
    const paper = c.paperStatedLog2 === 'UNKNOWN' ? 'UNKNOWN' : `2^${c.paperStatedLog2}`;
    const flag = c.agree ? '' : ' <span class="flag">— differs, both shown</span>';
    return `<li><strong>${s.label}:</strong> modeled crossover 2^${c.computedLog2}
      (curve hits floor at 2^${fmt(c.computedLog2Exact, 1)}), paper-stated ${paper}${flag}</li>`;
  }).join('');
  li.innerHTML = `
    Computed-vs-paper crossover check (the idealized ½-slope law vs. the paper's
    full-ISD tables):
    <ul style="margin:.5rem 0 0">${rows}</ul>
    <span class="small muted">For mceliece3488-64 the modeled value is lower than
    the paper's because its real ISD slope (≈0.39) is shallower than the ½ the law
    assumes — the demo shows both rather than trusting either.</span>`;
}

/* ============================================================ theme toggle */
function initThemeToggle(): void {
  const btn = $('#theme-toggle') as HTMLButtonElement;
  const icon = $('#theme-icon');
  const apply = (theme: string) => {
    document.documentElement.setAttribute('data-theme', theme);
    const dark = theme === 'dark';
    icon.textContent = dark ? '🌙' : '☀️';
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  };
  apply(document.documentElement.getAttribute('data-theme') ?? 'dark');
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    apply(next);
    update(); // re-resolve CSS-variable colors for the new theme
  });
}

/* ============================================================ slider state */
const slider = $('#d-slider') as HTMLInputElement;

function update(): void {
  const log2d = Number(slider.value);
  const D = 2 ** log2d;

  $('#d-value').textContent = big(D);
  $('#d-exp').textContent = String(log2d);
  slider.setAttribute(
    'aria-valuetext',
    `2 to the power ${log2d} = ${big(D)} session keys`,
  );

  renderChart(log2d);
  renderLevelMeter(D, log2d);
  renderReadout(D);
  renderSyndromeCards(D);
  describeForSR(D, log2d);

  // keep a shareable ?d= in the URL (no history spam) so a chosen D can be linked
  const url = new URL(window.location.href);
  url.searchParams.set('d', String(log2d));
  window.history.replaceState(null, '', url);
}

/** Read an initial log2(D) from ?d=, clamped to the slider's range. */
function initialLog2D(): number {
  const raw = new URL(window.location.href).searchParams.get('d');
  const v = raw === null ? 0 : Number(raw);
  if (!Number.isFinite(v)) return 0;
  return Math.min(MAX_LOG2D, Math.max(0, Math.round(v)));
}

/* ================================================================== init */
function init(): void {
  slider.max = String(MAX_LOG2D);
  slider.value = String(initialLog2D());
  initThemeToggle();
  renderLegend();
  renderSources();
  renderOps();
  renderCrossoverGap();
  update();

  slider.addEventListener('input', update);
  $('#show-paper').addEventListener('change', () => renderChart(Number(slider.value)));
  for (const id of ['#target-input', '#margin-input', '#budget-input', '#rate-input']) {
    $(id).addEventListener('input', renderOps);
  }
  // preset "jump to" buttons set the slider to a crossover and refresh
  document.querySelectorAll<HTMLButtonElement>('.preset[data-log2]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = Math.min(MAX_LOG2D, Math.max(0, Number(btn.dataset.log2)));
      slider.value = String(target);
      update();
    });
  });

  // rotation scenario buttons: set a realistic session rate (and a one-year
  // budget at that rate) so the calculator answers a concrete "what if".
  document.querySelectorAll<HTMLButtonElement>('.scenario[data-rate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rate = Math.max(1, Number(btn.dataset.rate) || 1);
      ($('#rate-input') as HTMLInputElement).value = String(rate);
      ($('#budget-input') as HTMLInputElement).value = String(rate * 365);
      renderOps();
    });
  });

  // keep the SVG crisp if the user resizes / rotates the device
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => renderChart(Number(slider.value)));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
