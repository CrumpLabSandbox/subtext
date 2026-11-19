// subtext dashboard: a static viewer over data/ (no build step, no dependencies).

// stats/themes/codebook always hold the current round's analysis (see setRound).
const S = { index: null, compare: null, round: null, rounds: new Map(), stats: null, themes: null, codebook: null, convos: new Map(), opens: new Map(), coded: new Map() };
const app = document.getElementById('app');
const tip = document.getElementById('tooltip');
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
const SVGNS = 'http://www.w3.org/2000/svg';

// ---------- data ----------

async function getJson(url, optional = false) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`${url}: ${res.status}`);
  }
  return res.json();
}

const meta = (id) => S.index.conversations.find((c) => c.id === id);
const roundMeta = (id = S.round) => S.index.rounds.find((r) => r.id === id);
// Conditions of the current round that have conversations.
const conditionIds = () => roundMeta().conditions.filter((c) => S.index.conditions[c]);
// Every condition keeps one color across all views and rounds.
const allConditions = () => S.index.rounds.flatMap((r) => r.conditions).filter((c) => S.index.conditions[c]);
const conditionColor = (cond) => SERIES[allConditions().indexOf(cond) % SERIES.length];
const roundConvos = () => S.index.conversations.filter((c) => c.round === S.round);
const link = (view, ...rest) => `#${[S.round, view, ...rest].join('/')}`;

async function setRound(id) {
  if (!S.rounds.has(id)) {
    const dir = `data/analysis/${id}`;
    const [stats, themes, codebook] = await Promise.all([
      getJson(`${dir}/stats.json`, true), getJson(`${dir}/themes.json`, true), getJson(`${dir}/codebook.json`, true),
    ]);
    S.rounds.set(id, { stats, themes, codebook });
  }
  S.round = id;
  Object.assign(S, S.rounds.get(id));
}
const theme = (id) => S.codebook?.themes.find((t) => t.id === id);

function label(id) {
  const m = meta(id);
  const same = S.index.conversations.filter((c) => c.condition === m.condition);
  return `${m.condition} #${same.indexOf(m) + 1}`;
}

async function loadConvo(id) {
  if (!S.convos.has(id)) {
    const m = meta(id);
    const [convo, open, coded] = await Promise.all([
      getJson(`data/conversations/${m.condition}/${id}.json`),
      getJson(`data/analysis/${m.round}/open/${id}.json`, true),
      getJson(`data/analysis/${m.round}/coded/${id}.json`, true),
    ]);
    S.convos.set(id, convo);
    S.opens.set(id, open);
    S.coded.set(id, coded);
  }
  return { convo: S.convos.get(id), open: S.opens.get(id), coded: S.coded.get(id) };
}

// ---------- DOM helpers ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v; // only ever given escaped/rendered markdown
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  for (const c of children.flat()) if (c != null) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

function showTip(event, rows, head) {
  tip.replaceChildren();
  if (head) tip.append(el('div', { class: 'head' }, head));
  for (const r of rows) {
    tip.append(el('div', { class: 'row' },
      r.color ? el('span', { class: 'k', style: `background:${r.color}` }) : null,
      el('strong', {}, r.value),
      r.label ? el('span', { class: 'secondary' }, r.label) : null));
  }
  tip.hidden = false;
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + w > innerWidth - 8) x = event.clientX - w - pad;
  if (y + h > innerHeight - 8) y = event.clientY - h - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}
const hideTip = () => { tip.hidden = true; };

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A small markdown renderer for agent turns. Escapes first, so output is safe.
function markdown(src) {
  const inline = (s) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>');
  const out = [];
  let list = null, para = [], table = null;
  const flushTable = () => {
    if (!table) return;
    const rows = table.filter((r) => !/^\|?[\s:|-]+\|?$/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim())));
    const [head, ...body] = rows;
    out.push(`<div class="scroll-x"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    table = null;
  };
  const flushPara = () => { if (para.length) out.push(`<p>${inline(para.join('<br>'))}</p>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; };
  for (const raw of escapeHtml(src).split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (line.trim().startsWith('|')) { flushPara(); flushList(); (table ??= []).push(line.trim()); continue; }
    flushTable();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^#{1,6}\s+(.*)/))) { flushPara(); flushList(); out.push(`<h4>${inline(m[1])}</h4>`); continue; }
    if ((m = line.match(/^\s*(?:[-*•])\s+(.*)/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      flushPara();
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if (/^\s*(?:---|\*\*\*)\s*$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList(); flushTable();
  return out.join('');
}

function highlight(root, query) {
  if (!query) return 0;
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (re.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    let last = 0;
    node.nodeValue.replace(re, (m, at) => {
      frag.append(node.nodeValue.slice(last, at), el('mark', {}, m));
      last = at + m.length;
    });
    frag.append(node.nodeValue.slice(last));
    node.replaceWith(frag);
  }
  return nodes.length;
}

const pct = (x) => `${Math.round(x * 100)}%`;
const fmt = (x, d = 2) => (x == null ? '–' : Number(x).toFixed(d));
const binLabel = (b, bins) => `${Math.round((b / bins) * 100)}–${Math.round(((b + 1) / bins) * 100)}%`;

// ---------- charts ----------

// Small-multiple line chart over relative position in the conversation.
function lineChart({ title, sub, series, bins, yFmt = (v) => fmt(v), yMax }) {
  const W = 300, H = 150, m = { l: 34, r: 8, t: 8, b: 22 };
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const top = yMax ?? niceMax(Math.max(...all, 0));
  const x = (i) => m.l + (i / (bins - 1)) * (W - m.l - m.r);
  const y = (v) => H - m.b - (v / top) * (H - m.t - m.b);
  const g = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title });
  for (const f of [0, 0.5, 1]) {
    g.append(svg('line', { class: f ? 'gridline' : 'baseline', x1: m.l, x2: W - m.r, y1: y(top * f), y2: y(top * f) }));
    g.append(svg('text', { x: m.l - 6, y: y(top * f) + 4, 'text-anchor': 'end' }, yFmt(top * f)));
  }
  g.append(svg('text', { x: m.l, y: H - 6 }, 'start'));
  g.append(svg('text', { x: W - m.r, y: H - 6, 'text-anchor': 'end' }, 'end'));
  for (const s of series) {
    const d = s.values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' L');
    if (d) g.append(svg('path', { d: `M${d}`, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  }
  const cross = svg('line', { class: 'crosshair', y1: m.t, y2: H - m.b, visibility: 'hidden' });
  const dots = series.map((s) => svg('circle', { r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }));
  g.append(cross, ...dots);
  const hit = svg('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: 'transparent' });
  hit.addEventListener('pointermove', (e) => {
    const r = g.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(bins - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (bins - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    series.forEach((s, k) => {
      const v = s.values[i];
      dots[k].setAttribute('visibility', v == null ? 'hidden' : 'visible');
      if (v != null) { dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(v)); }
    });
    showTip(e, series.map((s) => ({ color: s.color, value: yFmt(s.values[i]), label: s.name })), `${title} · ${binLabel(i, bins)} of the way through`);
  });
  hit.addEventListener('pointerleave', () => { hideTip(); cross.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); });
  g.append(hit);
  return el('div', { class: 'card' }, el('div', { class: 'chart-title' }, title), sub ? el('div', { class: 'chart-sub' }, sub) : null, g);
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= v);
}

const seqStep = (v, max) => (v <= 0 ? 0 : Math.min(7, 1 + Math.floor((v / max) * 6.999)));

function conditionLegend(conds) {
  if (conds.length < 2) return null;
  return el('div', { class: 'legend' }, conds.map((c) => el('span', {}, el('span', { class: 'key', style: `background:${conditionColor(c)}` }), c)));
}

// ---------- views ----------

function viewOverview() {
  const convos = roundConvos();
  const complete = convos.filter((c) => c.status === 'complete');
  const conds = conditionIds();
  const out = [
    el('h1', {}, roundMeta().title),
    el('p', { class: 'secondary' }, `${roundMeta().description} Agents talk for a fixed number of turns and cannot end early. Each conversation is independent: fresh sessions, no memory of other runs.`),
    roundMeta().briefing ? el('p', {}, el('a', { href: link('briefing') }, 'Read the briefing these agents were given →')) : null,
    el('div', { class: 'grid tiles' },
      tile(complete.length, `conversations complete${convos.length > complete.length ? ` (${convos.length - complete.length} running)` : ''}`),
      tile(complete.reduce((s, c) => s + c.turns, 0).toLocaleString(), 'turns'),
      tile(complete.reduce((s, c) => s + c.words, 0).toLocaleString(), 'words'),
      tile(S.codebook ? S.codebook.themes.length : '–', S.codebook ? `themes in the ${S.codebook.status} codebook` : 'themes (not coded yet)')),
  ];

  out.push(el('h2', {}, 'Conditions'));
  out.push(el('div', { class: 'grid multiples' }, conds.map((id) => {
    const c = S.index.conditions[id];
    const n = complete.filter((x) => x.condition === id).length;
    return el('div', { class: 'card' },
      el('div', { class: 'chart-title' }, id),
      el('p', { class: 'secondary' }, c.description),
      el('p', { class: 'muted' }, `${n} complete · ${c.turnsPerAgent} turns per agent · ${c.agents.A.model} × ${c.agents.B.model}`),
      el('details', {}, el('summary', {}, 'System prompts'), promptBlocks(c)));
  })));

  if (S.themes && S.codebook) {
    out.push(el('h2', {}, 'Themes by conversation'));
    out.push(el('p', { class: 'secondary' }, 'Share of each conversation\'s turns tagged with a theme. Click a row to read the conversation.'));
    out.push(themeHeatmap());
    out.push(el('h2', {}, 'How themes rise and fall'));
    out.push(el('p', { class: 'secondary' }, 'Share of turns tagged with each theme at each tenth of the conversation, averaged across conversations. Sorted by when the theme peaks.'));
    out.push(conditionLegend(Object.keys(S.themes.byCondition)));
    out.push(themeTrajectories());
  }

  if (S.stats && Object.keys(S.stats.conditions).length) {
    const sc = S.stats.conditions;
    const ids = Object.keys(sc);
    const ser = (k) => ids.map((id) => ({ name: id, color: conditionColor(id), values: sc[id].trajectory.map((b) => b[k]) }));
    out.push(el('h2', {}, 'How the language changes'));
    out.push(el('p', { class: 'secondary' }, 'Each measure is averaged over turns at the same relative position (tenths of the conversation).'));
    out.push(conditionLegend(ids));
    out.push(el('div', { class: 'grid multiples' },
      lineChart({ title: 'Words per turn', series: ser('words'), bins: S.stats.bins, yFmt: (v) => fmt(v, 0) }),
      lineChart({ title: 'Echo of previous turn', sub: 'TF-IDF cosine with the turn before', series: ser('simPrev'), bins: S.stats.bins }),
      lineChart({ title: 'Closeness to the opening', sub: 'TF-IDF cosine with the first six turns', series: ser('simOpen'), bins: S.stats.bins }),
      lineChart({ title: 'Similarity across runs', sub: 'Mean pairwise cosine between different conversations at this position', series: ser('crossRunSimilarity'), bins: S.stats.bins }),
      lineChart({ title: 'Emoji per turn', series: ser('emoji'), bins: S.stats.bins }),
      lineChart({ title: 'Questions per turn', series: ser('questions'), bins: S.stats.bins }),
      lineChart({ title: 'List items per turn', series: ser('bullets'), bins: S.stats.bins })));
  }
  return out;
}

function tile(value, labelText) {
  return el('div', { class: 'card tile' }, el('div', { class: 'value' }, value), el('div', { class: 'label' }, labelText));
}

function sortedThemes() {
  return [...S.codebook.themes].sort((a, b) => (S.themes.totals[b.id]?.turns || 0) - (S.themes.totals[a.id]?.turns || 0));
}

function themeHeatmap() {
  const themes = sortedThemes();
  const rows = S.themes.codedConversations.map(meta).filter(Boolean);
  const cell = 22, gap = 2, left = 170, top = 150;
  const W = left + themes.length * (cell + gap) + 130, H = top + rows.length * (cell + gap); // room for the slanted labels
  const max = Math.max(0.01, ...rows.flatMap((r) => Object.values(S.themes.share[r.id] || {})));
  const g = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, style: `min-width:${W}px`, role: 'img', 'aria-label': 'Theme share by conversation' });
  themes.forEach((t, j) => {
    const cx = left + j * (cell + gap) + cell / 2;
    g.append(svg('text', { transform: `translate(${cx + 4},${top - 6}) rotate(-50)` }, t.name));
  });
  rows.forEach((r, i) => {
    const cy = top + i * (cell + gap);
    const name = svg('text', { x: left - 8, y: cy + cell / 2 + 4, 'text-anchor': 'end', style: 'cursor:pointer' }, label(r.id));
    name.addEventListener('click', () => (location.hash = `c/${r.id}`));
    name.append(svg('title', {}, S.index.conditions[r.condition].description));
    g.append(name);
    themes.forEach((t, j) => {
      const v = S.themes.share[r.id]?.[t.id] || 0;
      const rect = svg('rect', { x: left + j * (cell + gap), y: cy, width: cell, height: cell, rx: 3, fill: `var(--seq-${seqStep(v, max)})`, style: 'cursor:pointer' });
      rect.addEventListener('pointermove', (e) => showTip(e, [{ value: pct(v), label: 'of turns' }], `${label(r.id)} · ${t.name}`));
      rect.addEventListener('pointerleave', hideTip);
      rect.addEventListener('click', () => (location.hash = `c/${r.id}/theme/${t.id}`));
      g.append(rect);
    });
  });
  const legend = el('div', { class: 'legend' }, 'Share of turns:', ...[0, 2, 4, 6, 7].map((s) =>
    el('span', {}, el('span', { class: 'swatch', style: `background:var(--seq-${s})` }), s ? `${pct((s - 1) / 7 * max)}+` : '0')));
  return el('div', { class: 'card' }, legend, el('div', { class: 'scroll-x' }, g));
}

function themeTrajectories() {
  const conds = Object.keys(S.themes.byCondition);
  const peak = (t) => {
    const bins = S.themes.byCondition[conds[0]].bins.map((b) => b[t.id] || 0);
    return bins.indexOf(Math.max(...bins));
  };
  const themes = sortedThemes().filter((t) => S.themes.totals[t.id]?.turns).sort((a, b) => peak(a) - peak(b));
  const max = niceMax(Math.max(...conds.flatMap((c) => S.themes.byCondition[c].bins.flatMap((b) => Object.values(b)))));
  return el('div', { class: 'grid multiples' }, themes.map((t) => {
    const chart = lineChart({
      title: t.name,
      sub: t.kind === 'dynamic' ? 'dynamic' : 'topic',
      series: conds.map((c) => ({ name: c, color: conditionColor(c), values: S.themes.byCondition[c].bins.map((b) => b[t.id] || 0) })),
      bins: S.themes.bins, yFmt: pct, yMax: max,
    });
    chart.querySelector('.chart-title').replaceChildren(el('a', { href: link('themes', t.id) }, t.name));
    return chart;
  }));
}

function viewThemes(focus) {
  if (!S.codebook) return [el('h1', {}, 'Themes'), el('p', { class: 'secondary' }, 'No codebook yet. Run node tools/code.mjs open, then codebook.')];
  const totals = S.themes?.totals || {};
  const nCoded = S.themes?.codedConversations.length || 0;
  const out = [
    el('h1', {}, 'Codebook'),
    el('p', { class: 'secondary' }, `${S.codebook.themes.length} themes, status: ${S.codebook.status}. Built by ${S.codebook.coder || 'the coder model'} from open codes of ${S.codebook.fromConversations.length} conversations. Blue chips are topics, orange are conversational dynamics.`),
    S.codebook.notes ? el('div', { class: 'card' }, el('div', { class: 'chart-title' }, 'Pattern across conversations'), el('p', {}, S.codebook.notes)) : null,
  ];
  for (const t of (S.themes ? sortedThemes() : S.codebook.themes)) {
    const tot = totals[t.id];
    const card = el('div', { class: 'card theme-card', id: `theme-${t.id}` },
      el('div', { class: 'head' },
        el('h3', {}, t.name),
        el('span', { class: `chip ${t.kind}` }, t.kind),
        t.from && t.from !== S.index.rounds[0].id ? el('span', { class: 'badge' }, `new in ${t.from}`) : null,
        tot ? el('span', { class: 'muted' }, `${tot.turns} turns · ${tot.conversations} of ${nCoded} conversations`) : null),
      el('p', {}, t.definition),
      el('dl', {}, el('dt', {}, 'Include'), el('dd', {}, t.include), el('dt', {}, 'Exclude'), el('dd', {}, t.exclude)),
      (t.examples || []).map((ex) => el('blockquote', {}, `“${ex.quote}” `,
        meta(ex.conversation) ? el('a', { href: `#c/${ex.conversation}/q/${encodeURIComponent(ex.quote.slice(0, 60))}` }, label(ex.conversation)) : null)));
    if (S.themes) {
      const top = Object.entries(S.themes.share).map(([id, s]) => [id, s[t.id] || 0]).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (top.length) card.append(el('p', { class: 'muted' }, 'Most present in: ', top.flatMap(([id, v], k) => [k ? ', ' : '', el('a', { href: `#c/${id}/theme/${t.id}` }, label(id)), ` (${pct(v)})`])));
    }
    out.push(card);
  }
  if (focus) requestAnimationFrame(() => document.getElementById(`theme-${focus}`)?.scrollIntoView({ block: 'start' }));
  return out;
}

function viewConversations() {
  const conds = conditionIds();
  const filter = el('select', {}, el('option', { value: '' }, 'All conditions'), conds.map((c) => el('option', { value: c }, c)));
  const search = el('input', { type: 'search', placeholder: 'Filter by summary or opening…' });
  const tbody = el('tbody');
  const render = () => {
    const q = search.value.toLowerCase();
    tbody.replaceChildren(...roundConvos()
      .filter((c) => !filter.value || c.condition === filter.value)
      .filter((c) => !q || `${c.summary} ${c.opening} ${c.ending}`.toLowerCase().includes(q))
      .map((c) => {
        const top = S.themes?.share[c.id] ? Object.entries(S.themes.share[c.id]).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
        return el('tr', { class: 'link', onclick: () => (location.hash = `c/${c.id}`) },
          el('td', {}, el('a', { href: `#c/${c.id}` }, label(c.id)), el('div', { class: 'muted' }, c.status === 'complete' ? '' : c.stop ? `stopped at turn ${c.stop.atTurn} (${c.stop.reason})` : `running: ${c.turns}/${c.plannedTurns}`)),
          el('td', { class: 'num' }, c.turns),
          el('td', { class: 'num' }, c.words.toLocaleString()),
          el('td', {}, c.summary || el('span', { class: 'muted' }, c.opening + '…'),
            top.length ? el('div', { class: 'tags', style: 'margin-top:6px;display:flex;gap:4px;flex-wrap:wrap' }, top.map(([id]) => el('span', { class: `chip ${theme(id)?.kind}` }, theme(id)?.name || id))) : null));
      }));
  };
  filter.addEventListener('change', render);
  search.addEventListener('input', render);
  render();
  return [
    el('h1', {}, 'Conversations'),
    el('div', { class: 'controls' }, filter, search),
    el('div', { class: 'card scroll-x' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Conversation'), el('th', { class: 'num' }, 'Turns'), el('th', { class: 'num' }, 'Words'), el('th', {}, 'Summary'))),
      tbody)),
  ];
}

async function viewConversation(id, mode, arg) {
  const m = meta(id);
  if (!m) return [el('p', {}, `No conversation ${id}.`)];
  const { convo, open, coded } = await loadConvo(id);
  const tags = coded?.tags || {};
  const notes = Object.fromEntries((open?.notable || []).map((n) => [n.turn, n.note]));
  const present = S.codebook ? S.codebook.themes.filter((t) => convo.turns.some((x) => (tags[x.i] || []).includes(t.id))) : [];

  const search = el('input', { type: 'search', placeholder: 'Search this conversation…', value: mode === 'q' ? decodeURIComponent(arg) : '' });
  const themeSel = el('select', {}, el('option', { value: '' }, 'All turns'), present.map((t) => el('option', { value: t.id, selected: mode === 'theme' && arg === t.id }, `Only: ${t.name}`)));
  const count = el('span', { class: 'muted' });
  const transcript = el('div', { class: 'transcript' });
  const turnEls = convo.turns.map((t) => {
    const bubble = el('div', { class: 'bubble' }, el('div', { html: markdown(t.text) }));
    if ((tags[t.i] || []).length) bubble.append(el('div', { class: 'tags' }, tags[t.i].map((tid) => {
      const th = theme(tid);
      return el('span', { class: `chip ${th?.kind}`, title: th?.definition, onclick: () => { themeSel.value = tid; apply(); } }, th?.name || tid);
    })));
    if (notes[t.i]) bubble.append(el('div', { class: 'note' }, notes[t.i]));
    const node = el('div', { class: `turn ${t.speaker}`, id: `t${t.i}` }, el('div', { class: 'who' }, el('b', {}, t.speaker), t.i), bubble);
    node._text = t.text;
    node._html = bubble.firstChild.innerHTML;
    transcript.append(node);
    return node;
  });

  function apply(scroll = false) {
    const q = search.value.trim();
    const th = themeSel.value;
    let hits = 0, first = null;
    for (const [k, node] of turnEls.entries()) {
      const body = node.querySelector('.bubble').firstChild;
      body.innerHTML = node._html;
      const t = convo.turns[k];
      const matchQ = q ? highlight(body, q) > 0 : true;
      const matchT = th ? (tags[t.i] || []).includes(th) : true;
      const match = matchQ && matchT;
      node.classList.toggle('dim', (q || th) && !match);
      if ((q || th) && match) { hits++; first ??= node; }
    }
    count.textContent = q || th ? `${hits} matching turn${hits === 1 ? '' : 's'}` : '';
    if (scroll && first) first.scrollIntoView({ block: 'center' });
  }
  search.addEventListener('input', () => apply());
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(true); });
  themeSel.addEventListener('change', () => apply(true));

  const go = (turn) => {
    const node = document.getElementById(`t${turn}`);
    if (!node) return;
    turnEls.forEach((n) => n.classList.remove('focus'));
    node.classList.add('focus');
    node.scrollIntoView({ block: 'center' });
  };

  const header = el('div', { class: 'card' },
    el('h1', {}, label(id)),
    el('p', { class: 'muted' }, `${convo.turns.length} turns · ${m.words.toLocaleString()} words · ${convo.agents.A.model} × ${convo.agents.B.model} · started ${new Date(convo.started).toLocaleString()}${convo.status === 'complete' ? '' : convo.stop ? ` · stopped at turn ${convo.stop.atTurn}: ${convo.stop.reason}` : ' · still running'}`),
    convo.stop ? el('p', { class: 'note' }, `This run ended early: ${convo.stop.detail} It is not included in the coding or the aggregate measures.`) : null,
    open ? el('p', {}, open.summary) : null,
    open?.ending ? el('p', { class: 'secondary' }, el('strong', {}, 'Where it ended up: '), open.ending) : null,
    open?.arc ? arcBar(open.arc, convo.turns.length, go) : null,
    present.length ? themeStrip(present, convo, tags, go) : null,
    el('details', {}, el('summary', {}, 'What the agents were given'),
      promptBlocks(convo.config),
      convo.briefing ? el('p', {}, el('a', { href: `#${m.round}/briefing` }, 'Read the briefing'), ` (sha256 ${convo.briefing.sha256.slice(0, 12)}…)`) : null,
      convo.injectedContext ? [
        el('p', { class: 'secondary' }, 'The Claude Code CLI also sent the following, which this project cannot turn off with subscription auth (email redacted):'),
        el('pre', {}, convo.injectedContext.system.join('\n\n---\n\n')),
        el('pre', {}, (convo.injectedContext.firstUserMessage || []).join('\n')),
      ] : null));

  requestAnimationFrame(() => {
    if (mode === 't') go(Number(arg));
    else if (mode === 'q' || mode === 'theme') apply(true);
  });
  return [
    header,
    el('div', { class: 'controls', style: 'position:sticky;top:52px;z-index:5;background:var(--page);padding:8px 0' }, search, themeSel, count),
    transcript,
  ];
}

function arcBar(arc, n, go) {
  return el('div', {},
    el('div', { class: 'chart-sub', style: 'margin-top:10px' }, 'Arc (from open coding) — click a phase to jump'),
    el('div', { class: 'arc' }, arc.map((p) => {
      const node = el('div', { class: 'phase', style: `flex:${Math.max(1, p.to - p.from + 1)}`, onclick: () => go(p.from) }, `${p.from}–${p.to} ${p.label}`);
      node.addEventListener('pointermove', (e) => showTip(e, [{ value: p.label, label: `turns ${p.from}–${p.to}` }], p.description));
      node.addEventListener('pointerleave', hideTip);
      return node;
    })));
}

// Themes × turns grid for one conversation.
function themeStrip(themes, convo, tags, go) {
  const n = convo.turns.length, cw = n > 120 ? 4 : 7, gap = 1, rh = 12, left = 290;
  const W = left + n * (cw + gap), H = themes.length * (rh + 3) + 16;
  const g = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, style: `min-width:${Math.min(W, 900)}px`, role: 'img', 'aria-label': 'Themes by turn' });
  themes.forEach((t, r) => {
    const y = r * (rh + 3);
    g.append(svg('text', { x: left - 8, y: y + rh - 2, 'text-anchor': 'end' }, t.name));
    g.append(svg('rect', { x: left, y, width: n * (cw + gap), height: rh, fill: 'var(--seq-0)', rx: 2 }));
    for (const turn of convo.turns) {
      if (!(tags[turn.i] || []).includes(t.id)) continue;
      const rect = svg('rect', { x: left + (turn.i - 1) * (cw + gap), y, width: cw, height: rh, rx: 1, fill: t.kind === 'dynamic' ? 'var(--series-2)' : 'var(--series-1)', style: 'cursor:pointer' });
      rect.addEventListener('pointermove', (e) => showTip(e, [{ value: `Turn ${turn.i}`, label: `${turn.speaker} · ${t.name}` }], turn.text.slice(0, 140) + (turn.text.length > 140 ? '…' : '')));
      rect.addEventListener('pointerleave', hideTip);
      rect.addEventListener('click', () => go(turn.i));
      g.append(rect);
    }
  });
  for (const k of [1, ...[0.25, 0.5, 0.75].map((f) => Math.round(n * f)), n]) {
    g.append(svg('text', { x: left + (k - 1) * (cw + gap) + (k === n ? cw : 0), y: H - 2, 'text-anchor': k === n ? 'end' : 'start' }, k));
  }
  return el('div', {}, el('div', { class: 'chart-sub', style: 'margin-top:10px' }, 'Themes by turn — click a mark to jump'), el('div', { class: 'strip-wrap' }, g));
}

function viewWords() {
  if (!S.stats) return [el('h1', {}, 'Words'), el('p', { class: 'muted' }, 'Run node tools/stats.mjs first.')];
  const out = [el('h1', {}, 'Words'),
    el('p', { class: 'secondary' }, 'Words most distinctive of the last fifth of conversations versus the first fifth (log-odds with an informative Dirichlet prior; bar length is the z-score).')];
  for (const [id, c] of Object.entries(S.stats.conditions)) {
    const bars = (list, cls) => {
      const max = Math.max(...list.map((w) => w.z), 1);
      return list.map((w) => {
        const row = el('div', { class: `wordbar ${cls}` }, el('span', {}, w.word), el('div', { class: 'bar', style: `width:${(w.z / max) * 100}%` }), el('span', { class: 'n' }, w.z.toFixed(1)));
        row.addEventListener('pointermove', (e) => showTip(e, [{ value: w.a, label: cls === 'late' ? 'times late' : 'times early' }, { value: w.b, label: cls === 'late' ? 'times early' : 'times late' }], w.word));
        row.addEventListener('pointerleave', hideTip);
        return row;
      });
    };
    out.push(el('h2', {}, `${id} (${c.conversations} conversations)`));
    out.push(el('div', { class: 'words' },
      el('div', { class: 'card' }, el('div', { class: 'chart-title' }, 'Early: first fifth'), bars(c.earlyWords, 'early')),
      el('div', { class: 'card' }, el('div', { class: 'chart-title' }, 'Late: last fifth'), bars(c.lateWords, 'late'))));
    if (c.emoji.length) {
      out.push(el('div', { class: 'card' }, el('div', { class: 'chart-title' }, 'Emoji used'),
        el('p', { style: 'font-size:1.3rem;line-height:2' }, c.emoji.map((e) => el('span', { title: `${e.n} times`, style: 'margin-right:14px' }, e.emoji, el('span', { class: 'muted', style: 'font-size:0.8rem' }, ` ${e.n}`))))));
    }
    out.push(el('div', { class: 'card' }, el('div', { class: 'chart-title' }, 'Most frequent content words'),
      el('p', { class: 'secondary' }, c.topWords.map((w) => `${w.word} (${w.n})`).join(' · '))));
  }
  return out;
}

function viewAbout() {
  return [el('h1', {}, 'About'),
    el('div', { class: 'card' },
      el('p', {}, 'Each conversation is generated by tools/converse.mjs. Two agents each run as their own headless Claude Code session with no tools, resumed every turn, so each sees its own lines as its own and the other agent\'s lines as incoming messages. Runs are independent processes with fresh sessions.'),
      el('p', {}, 'The agents run through the Claude Code CLI on a subscription, which adds a short framing of its own ("You are a Claude agent, built on Anthropic\'s Claude Agent SDK", an environment block, and an account reminder). Every conversation records exactly what was sent under "What the agents were given". Conditions run through the API directly will be marked with a different prefix.'),
      el('p', {}, 'The study runs in rounds. Round 1 agents get only a minimal prompt. Each later round gives its agents a briefing built from an earlier round\'s analysis (see Briefing), varied by condition. A later round\'s codebook keeps every earlier theme unchanged and adds new ones, so Compare rounds can line them up.'),
      el('p', {}, 'Themes come from LLM-assisted thematic analysis (tools/code.mjs): open coding of each whole conversation, consolidation into a codebook, then tagging every turn with the codebook. Word and similarity measures (tools/stats.mjs) use no LLM.'),
      el('p', {}, el('a', { href: 'https://github.com/CrumpLabSandbox/subtext' }, 'Source and data on GitHub'))),
  ];
}

function promptBlocks(c) {
  const show = (text) => text.replace('{{briefing}}', '[the briefing]');
  const a = c.agents.A.systemPrompt ?? c.systemPrompt, b = c.agents.B.systemPrompt ?? c.systemPrompt;
  return [
    a === b ? el('p', {}, el('strong', {}, 'Both agents:')) : el('p', {}, el('strong', {}, 'Agent A:')),
    el('pre', {}, show(a)),
    a === b ? null : [el('p', {}, el('strong', {}, 'Agent B:')), el('pre', {}, show(b))],
    el('p', { class: 'muted' }, `Opening message to A: ${c.opener}`),
  ].flat();
}

async function viewBriefing() {
  const r = roundMeta();
  if (!r.briefing) return [el('h1', {}, 'Briefing'), el('p', { class: 'secondary' }, `Agents in ${r.title} were not given a briefing.`)];
  const res = await fetch(r.briefing, { cache: 'no-cache' });
  const text = res.ok ? await res.text() : 'Briefing file not found.';
  return [
    el('h1', {}, `Briefing for ${r.title}`),
    el('p', { class: 'secondary' }, `Generated by tools/briefing.mjs from the ${r.briefedFrom} analysis, without rewriting, and placed in the system prompt where a condition's prompt has [the briefing]. About ${text.split(/\s+/).length.toLocaleString()} words.`),
    el('div', { class: 'grid multiples' }, conditionIds().map((id) => el('div', { class: 'card' },
      el('div', { class: 'chart-title' }, id), el('p', { class: 'secondary' }, S.index.conditions[id].description), promptBlocks(S.index.conditions[id])))),
    el('div', { class: 'card briefing', html: markdown(text) }),
  ];
}

// Dots per conversation along one measure, one row per condition.
function dotStrip({ title, sub, conds, value }) {
  const rowH = 30, left = 200, W = 760, right = 20;
  const pts = conds.flatMap((c) => S.index.conversations.filter((x) => x.condition === c && x.status === 'complete').map((x) => ({ c, x, v: value(x) }))).filter((p) => p.v != null);
  const max = niceMax(Math.max(...pts.map((p) => p.v), 0.01));
  const H = conds.length * rowH + 24;
  const xOf = (v) => left + (v / max) * (W - left - right);
  const g = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title });
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    g.append(svg('line', { class: f ? 'gridline' : 'baseline', x1: xOf(max * f), x2: xOf(max * f), y1: 0, y2: H - 20 }));
    g.append(svg('text', { x: xOf(max * f), y: H - 4, 'text-anchor': 'middle' }, fmt(max * f)));
  }
  conds.forEach((c, i) => {
    const y = i * rowH + rowH / 2;
    g.append(svg('text', { x: left - 10, y: y + 4, 'text-anchor': 'end' }, c));
    const mine = pts.filter((p) => p.c === c);
    const m = mine.reduce((s, p) => s + p.v, 0) / (mine.length || 1);
    if (mine.length) g.append(svg('line', { x1: xOf(m), x2: xOf(m), y1: y - 11, y2: y + 11, stroke: 'var(--ink-2)', 'stroke-width': 2 }));
    for (const p of mine) {
      const dot = svg('circle', { cx: xOf(p.v), cy: y, r: 5, fill: conditionColor(c), stroke: 'var(--surface)', 'stroke-width': 2, 'fill-opacity': 0.85 });
      const hit = svg('circle', { cx: xOf(p.v), cy: y, r: 12, fill: 'transparent', style: 'cursor:pointer' });
      hit.addEventListener('pointermove', (e) => showTip(e, [{ color: conditionColor(c), value: fmt(p.v, 3), label: label(p.x.id) }], p.x.summary ? p.x.summary.slice(0, 160) + '…' : title));
      hit.addEventListener('pointerleave', hideTip);
      hit.addEventListener('click', () => (location.hash = `c/${p.x.id}`));
      g.append(dot, hit);
    }
  });
  return el('div', { class: 'card' }, el('div', { class: 'chart-title' }, title), el('div', { class: 'chart-sub' }, `${sub} Dots are conversations (click to open); the bar is the condition mean.`), el('div', { class: 'scroll-x' }, g));
}

async function viewCompare() {
  const conds = allConditions().filter((c) => S.compare.conditions[c]);
  const cmp = S.compare.conditions;
  const books = {};
  for (const r of S.index.rounds) books[r.id] = (await loadRound(r.id)).codebook;
  const latest = [...S.index.rounds].reverse().map((r) => books[r.id]).find(Boolean);
  const out = [
    el('h1', {}, 'Compare rounds'),
    el('p', { class: 'secondary' }, `Every condition across rounds. Similarity is measured against ${S.compare.base}: word-overlap (TF-IDF cosine) between a conversation and each ${S.compare.base} conversation, averaged. A lower value means the conversation drifted further from what ${S.compare.base} talked about.`),
    el('p', { class: 'secondary' }, 'Some runs were cut off when the safety classifier flagged a message (usually something as small as "." late in a long context) and kept flagging it on retry. Those runs stay readable in Conversations but are left out of coding and of these measures, so the complete runs in a condition with many stops are a selected sample.'),
    el('div', { class: 'card scroll-x' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Condition'), el('th', {}, 'Round'), el('th', { class: 'num' }, 'Complete'), el('th', { class: 'num' }, 'Stopped by safeguard'), el('th', { class: 'num' }, 'Words per turn'),
        el('th', { class: 'num' }, `Similarity to ${S.compare.base}, opening fifth`), el('th', { class: 'num' }, 'whole conversation'))),
      el('tbody', {}, conds.map((c) => el('tr', {},
        el('td', {}, el('span', { class: 'swatch', style: `display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:8px;background:${conditionColor(c)}` }), c,
          el('div', { class: 'muted' }, S.index.conditions[c].description)),
        el('td', { style: 'white-space:nowrap' }, el('a', { href: `#${cmp[c].round}/overview` }, cmp[c].round)),
        el('td', { class: 'num' }, cmp[c].conversations),
        el('td', { class: 'num' }, cmp[c].stopped.length ? `${cmp[c].stopped.length} of ${cmp[c].stopped.length + cmp[c].conversations}` : '0'),
        el('td', { class: 'num' }, fmt(cmp[c].wordsPerTurn, 0)),
        el('td', { class: 'num' }, fmt(cmp[c].simBaseOpening, 3)),
        el('td', { class: 'num' }, fmt(cmp[c].simBaseWhole, 3))))))),
    dotStrip({ title: `Opening fifth: similarity to ${S.compare.base} openings`, sub: 'Did they start somewhere new?', conds, value: (x) => x.simBase?.opening }),
    dotStrip({ title: `Whole conversation: similarity to ${S.compare.base}`, sub: 'Did the conversation as a whole go somewhere new?', conds, value: (x) => x.simBase?.whole }),
  ];
  if (latest) out.push(themeMatrix(latest, conds, books));
  out.push(el('h2', {}, 'How the language changes'), conditionLegend(conds));
  const ser = (k) => conds.map((c) => ({ name: c, color: conditionColor(c), values: cmp[c].trajectory.map((b) => b[k]) }));
  const bins = S.compare.bins;
  out.push(el('div', { class: 'grid multiples' },
    lineChart({ title: 'Words per turn', series: ser('words'), bins, yFmt: (v) => fmt(v, 0) }),
    lineChart({ title: 'Echo of previous turn', sub: 'TF-IDF cosine with the turn before', series: ser('simPrev'), bins }),
    lineChart({ title: 'Closeness to the opening', sub: 'TF-IDF cosine with the first six turns', series: ser('simOpen'), bins }),
    lineChart({ title: 'Similarity across runs', sub: 'Between conversations of the same condition', series: ser('crossRunSimilarity'), bins }),
    lineChart({ title: 'Emoji per turn', series: ser('emoji'), bins }),
    lineChart({ title: 'Questions per turn', series: ser('questions'), bins })));
  return out;
}

// Mean share of turns per theme (rows) and condition (columns).
function themeMatrix(codebook, conds, books) {
  const cmp = S.compare.conditions;
  const coded = (c, id) => books[cmp[c].round]?.themes.some((t) => t.id === id);
  const all = conds.flatMap((c) => Object.values(cmp[c].themeShare));
  const max = Math.max(0.01, ...all);
  const themes = [...codebook.themes].sort((a, b) => (a.from === b.from ? 0 : a.from === S.compare.base ? -1 : 1));
  const rows = themes.map((t) => el('tr', {},
    el('td', {}, el('span', { class: `chip ${t.kind}`, style: 'cursor:default' }, t.name), t.from && t.from !== S.compare.base ? el('span', { class: 'badge', style: 'margin-left:6px' }, `new in ${t.from}`) : null),
    conds.map((c) => {
      if (!coded(c, t.id)) return el('td', { class: 'num muted', title: 'Not in this round\'s codebook' }, '·');
      const v = cmp[c].themeShare[t.id] || 0;
      const step = seqStep(v, max);
      const td = el('td', { class: 'num cell', style: `background:var(--seq-${step});color:${step >= 4 ? '#fff' : 'var(--ink)'}` }, v ? pct(v) : '');
      td.addEventListener('pointermove', (e) => showTip(e, [
        { value: pct(v), label: 'of turns on average' },
        { value: `${cmp[c].themeConversations[t.id] || 0} of ${cmp[c].coded}`, label: 'conversations' },
        cmp[c].themeMedianFirst[t.id] != null ? { value: pct(cmp[c].themeMedianFirst[t.id]), label: 'median first appearance' } : null,
      ].filter(Boolean), `${t.name} · ${c}`));
      td.addEventListener('pointerleave', hideTip);
      return td;
    })));
  return el('div', {},
    el('h2', {}, 'Themes by condition'),
    el('p', { class: 'secondary' }, 'Average share of turns tagged with each theme. Later rounds keep every earlier theme and add new ones; a dot means the theme was not in that round\'s codebook, so it was not coded there.'),
    el('div', { class: 'card scroll-x' }, el('table', { class: 'matrix' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Theme'), conds.map((c) => el('th', { class: 'num' }, el('span', { class: 'key', style: `display:block;height:3px;background:${conditionColor(c)};margin-bottom:4px` }), c)))),
      el('tbody', {}, rows))));
}

// ---------- routing ----------

async function loadRound(id) {
  const keep = S.round;
  await setRound(id);
  const data = S.rounds.get(id);
  if (keep) await setRound(keep);
  return data;
}

const VIEWS = [['overview', 'Overview'], ['themes', 'Themes'], ['conversations', 'Conversations'], ['words', 'Words'], ['briefing', 'Briefing']];

function renderNav(view) {
  const nav = document.getElementById('nav');
  const select = el('select', { 'aria-label': 'Round', onchange: (e) => (location.hash = `${e.target.value}/${['compare', 'about', 'c'].includes(view) ? 'overview' : view}`) },
    S.index.rounds.map((r) => el('option', { value: r.id, selected: r.id === S.round }, r.title)));
  nav.replaceChildren(select,
    ...VIEWS.filter(([v]) => v !== 'briefing' || roundMeta().briefing).map(([v, name]) =>
      el('a', { href: link(v), class: v === view || (view === 'c' && v === 'conversations') ? 'active' : null }, name)),
    el('a', { href: '#compare', class: view === 'compare' ? 'active' : null }, 'Compare rounds'),
    el('a', { href: '#about', class: view === 'about' ? 'active' : null }, 'About'));
}

async function route() {
  hideTip();
  const [first = '', ...rest] = location.hash.slice(1).split('/');
  let view = first || 'overview';
  if (first === 'c') {
    const m = meta(rest[0]);
    if (m) await setRound(m.round);
  } else if (S.index.rounds.some((r) => r.id === first)) {
    await setRound(first);
    view = rest.shift() || 'overview';
  }
  renderNav(view);
  let nodes;
  try {
    if (view === 'c') nodes = await viewConversation(rest[0], rest[1], rest.slice(2).join('/'));
    else if (view === 'themes') nodes = viewThemes(rest[0]);
    else if (view === 'conversations') nodes = viewConversations();
    else if (view === 'words') nodes = viewWords();
    else if (view === 'briefing') nodes = await viewBriefing();
    else if (view === 'compare') nodes = await viewCompare();
    else if (view === 'about') nodes = viewAbout();
    else nodes = viewOverview();
  } catch (err) {
    nodes = [el('p', {}, `Something went wrong: ${err.message}`)];
  }
  app.replaceChildren(...nodes.flat().filter(Boolean));
  if (view !== 'c' && view !== 'themes') scrollTo(0, 0);
}

function initTheme() {
  const btn = document.getElementById('theme-toggle');
  let saved = null;
  try { saved = localStorage.getItem('subtext-theme'); } catch {}
  if (saved) document.documentElement.dataset.theme = saved;
  btn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('subtext-theme', next); } catch {}
  });
}

initTheme();
[S.index, S.compare] = await Promise.all([getJson('data/index.json'), getJson('data/analysis/compare.json', true)]);
// Start on the latest round that has finished conversations.
const started = S.index.rounds.filter((r) => S.index.conversations.some((c) => c.round === r.id && c.status === 'complete'));
await setRound((started.at(-1) || S.index.rounds[0]).id);
addEventListener('hashchange', route);
route();
