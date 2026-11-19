// subtext dashboard: a static viewer over data/ (no build step, no dependencies).

const S = { index: null, stats: null, themes: null, codebook: null, convos: new Map(), opens: new Map(), coded: new Map() };
const app = document.getElementById('app');
const tip = document.getElementById('tooltip');
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];
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
const conditionIds = () => Object.keys(S.index.conditions);
const conditionColor = (cond) => SERIES[conditionIds().indexOf(cond) % SERIES.length];
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
      getJson(`data/analysis/open/${id}.json`, true),
      getJson(`data/analysis/coded/${id}.json`, true),
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
  let list = null, para = [];
  const flushPara = () => { if (para.length) out.push(`<p>${inline(para.join('<br>'))}</p>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; };
  for (const raw of escapeHtml(src).split('\n')) {
    const line = raw.trimEnd();
    let m;
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
  flushPara(); flushList();
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
  const convos = S.index.conversations;
  const complete = convos.filter((c) => c.status === 'complete');
  const conds = conditionIds();
  const out = [
    el('h1', {}, 'What do two Claudes talk about?'),
    el('p', { class: 'secondary' }, 'Pairs of Claude agents were told only that they were talking with another AI and could talk about whatever they liked, then left to talk for a fixed number of turns. Each conversation is independent: fresh sessions, no memory of other runs.'),
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
      el('p', { class: 'muted' }, `${n} complete · ${c.turnsPerAgent} turns per agent · ${c.agents.A.model} × ${c.agents.B.model}`));
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
    chart.querySelector('.chart-title').replaceChildren(el('a', { href: `#themes/${t.id}` }, t.name));
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
    tbody.replaceChildren(...S.index.conversations
      .filter((c) => !filter.value || c.condition === filter.value)
      .filter((c) => !q || `${c.summary} ${c.opening} ${c.ending}`.toLowerCase().includes(q))
      .map((c) => {
        const top = S.themes?.share[c.id] ? Object.entries(S.themes.share[c.id]).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
        return el('tr', { class: 'link', onclick: () => (location.hash = `c/${c.id}`) },
          el('td', {}, el('a', { href: `#c/${c.id}` }, label(c.id)), el('div', { class: 'muted' }, c.status === 'complete' ? '' : `running: ${c.turns}/${c.plannedTurns}`)),
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
    el('p', { class: 'muted' }, `${convo.turns.length} turns · ${m.words.toLocaleString()} words · ${convo.agents.A.model} × ${convo.agents.B.model} · started ${new Date(convo.started).toLocaleString()}${convo.status === 'complete' ? '' : ' · still running'}`),
    open ? el('p', {}, open.summary) : null,
    open?.ending ? el('p', { class: 'secondary' }, el('strong', {}, 'Where it ended up: '), open.ending) : null,
    open?.arc ? arcBar(open.arc, convo.turns.length, go) : null,
    present.length ? themeStrip(present, convo, tags, go) : null,
    el('details', {}, el('summary', {}, 'What the agents were given'),
      el('p', {}, el('strong', {}, 'System prompt: '), convo.config.systemPrompt),
      el('p', {}, el('strong', {}, 'Opening message to A: '), convo.config.opener),
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
      el('p', {}, 'Themes come from LLM-assisted thematic analysis (tools/code.mjs): open coding of each whole conversation, consolidation into a codebook, then tagging every turn with the codebook. Word and similarity measures (tools/stats.mjs) use no LLM.'),
      el('p', {}, el('a', { href: 'https://github.com/CrumpLabSandbox/subtext' }, 'Source and data on GitHub'))),
  ];
}

// ---------- routing ----------

async function route() {
  hideTip();
  const [view, ...rest] = (location.hash.slice(1) || 'overview').split('/');
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${view === 'c' ? 'conversations' : view}`));
  let nodes;
  try {
    if (view === 'c') nodes = await viewConversation(rest[0], rest[1], rest.slice(2).join('/'));
    else if (view === 'themes') nodes = viewThemes(rest[0]);
    else if (view === 'conversations') nodes = viewConversations();
    else if (view === 'words') nodes = viewWords();
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
[S.index, S.stats, S.themes, S.codebook] = await Promise.all([
  getJson('data/index.json'),
  getJson('data/analysis/stats.json', true),
  getJson('data/analysis/themes.json', true),
  getJson('data/analysis/codebook.json', true),
]);
addEventListener('hashchange', route);
route();
