#!/usr/bin/env node
// Quantitative measures that need no LLM, plus the index the dashboard loads.
//
//   node tools/stats.mjs     -> data/index.json, data/analysis/compare.json,
//                               data/analysis/<round>/{stats,themes}.json
//   --partial                  also count conversations still running (for previews)
//
// Similarities are TF-IDF cosines over content words. "simPrev" is how much a
// turn echoes the turn before it; "simOpen" is how close it stays to the opening.
// Convergence compares different conversations at the same relative position:
// if late turns of separate runs resemble each other more than early turns do,
// the runs are drifting toward a shared attractor.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA, parseArgs, loadConversations, writeJson } from './lib.mjs';

const BINS = 10;
const STOP = new Set(`a about above after again against all also am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each even few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself just let's like me more most mustn't my myself no nor not now of off on once only or other ought our ours ourselves out over own really same shan't she she'd she'll she's should shouldn't so some something such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've thing things think this those through to too under until up us very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's will with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves maybe much one get got make way yes yeah oh actually still something kind lot`.split(/\s+/));
const EMOJI = /\p{Extended_Pictographic}/gu;

const words = (text) => (text.toLowerCase().replace(/[’]/g, "'").match(/[a-z][a-z']+/g) || [])
  .map((w) => w.replace(/'s$/, '')).filter((w) => w.length > 2 && !STOP.has(w));

function tfidfSpace(docs) {
  const df = new Map();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length;
  return (tokens) => {
    const tf = new Map();
    for (const w of tokens) tf.set(w, (tf.get(w) || 0) + 1);
    const v = new Map();
    let norm = 0;
    for (const [w, c] of tf) {
      const x = (1 + Math.log(c)) * Math.log((N + 1) / ((df.get(w) || 0) + 1) + 1);
      v.set(w, x);
      norm += x * x;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [w, x] of v) v.set(w, x / norm);
    return v;
  };
}

function cosine(a, b) {
  if (a.size > b.size) [a, b] = [b, a];
  let s = 0;
  for (const [w, x] of a) s += x * (b.get(w) || 0);
  return s;
}

const round = (x, d = 3) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const binOf = (i, n) => Math.min(BINS - 1, Math.floor(((i - 1) / n) * BINS));

// Log-odds with an informative Dirichlet prior (Monroe et al. 2008): words
// distinctive of corpus a versus corpus b, with z-scores.
function distinctive(countsA, countsB, prior, top = 25) {
  const nA = sum(countsA), nB = sum(countsB), a0 = sum(prior);
  const out = [];
  for (const [w, ap] of prior) {
    const ya = countsA.get(w) || 0, yb = countsB.get(w) || 0;
    if (ya + yb < 5) continue;
    const da = Math.log((ya + ap) / (nA + a0 - ya - ap)) - Math.log((yb + ap) / (nB + a0 - yb - ap));
    const z = da / Math.sqrt(1 / (ya + ap) + 1 / (yb + ap));
    out.push({ word: w, z: round(z, 2), a: ya, b: yb });
  }
  out.sort((x, y) => y.z - x.z);
  return { a: out.slice(0, top), b: out.slice(-top).reverse().map((d) => ({ ...d, z: round(-d.z, 2) })) };
}
const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
const count = (tokenLists) => {
  const m = new Map();
  for (const ts of tokenLists) for (const w of ts) m.set(w, (m.get(w) || 0) + 1);
  return m;
};

const convos = loadConversations();
const partial = parseArgs(process.argv.slice(2)).partial;
const complete = convos.filter((c) => c.status === 'complete' || (partial && c.turns.length >= 10));
const tokens = new Map(complete.map((c) => [c.id, c.turns.map((t) => words(t.text))]));
const vectorize = tfidfSpace(complete.flatMap((c) => tokens.get(c.id)));

const perConversation = {};
const binDocs = {}; // condition -> bin -> conversation id -> tokens
for (const c of complete) {
  const toks = tokens.get(c.id);
  const vecs = toks.map(vectorize);
  const opening = vectorize(toks.slice(0, 6).flat());
  const n = c.turns.length;
  perConversation[c.id] = c.turns.map((t, k) => ({
    i: t.i,
    words: t.text.split(/\s+/).filter(Boolean).length,
    emoji: (t.text.match(EMOJI) || []).length,
    questions: (t.text.match(/\?/g) || []).length,
    bullets: (t.text.match(/^\s*(?:[-*•]|\d+\.)\s/gm) || []).length,
    simPrev: k ? round(cosine(vecs[k], vecs[k - 1])) : null,
    simOpen: round(cosine(vecs[k], opening)),
  }));
  const bins = ((binDocs[c.condition] ??= {}));
  c.turns.forEach((t, k) => {
    const b = binOf(t.i, n);
    ((bins[b] ??= {})[c.id] ??= []).push(...toks[k]);
  });
}

const conditions = {};
for (const cond of [...new Set(complete.map((c) => c.condition))]) {
  const cs = complete.filter((c) => c.condition === cond);
  const trajectory = Array.from({ length: BINS }, (_, b) => {
    const rows = cs.flatMap((c) => perConversation[c.id].filter((r) => binOf(r.i, c.turns.length) === b));
    const docs = Object.values(binDocs[cond][b] || {}).map(vectorize);
    const pairs = [];
    for (let x = 0; x < docs.length; x++) for (let y = x + 1; y < docs.length; y++) pairs.push(cosine(docs[x], docs[y]));
    return {
      bin: b,
      words: round(mean(rows.map((r) => r.words)), 1),
      emoji: round(mean(rows.map((r) => r.emoji)), 2),
      questions: round(mean(rows.map((r) => r.questions)), 2),
      bullets: round(mean(rows.map((r) => r.bullets)), 2),
      simPrev: round(mean(rows.filter((r) => r.simPrev != null).map((r) => r.simPrev))),
      simOpen: round(mean(rows.map((r) => r.simOpen))),
      crossRunSimilarity: round(mean(pairs)),
    };
  });
  const early = [], late = [];
  for (const c of cs) {
    const toks = tokens.get(c.id), n = toks.length, k = Math.max(1, Math.round(n * 0.2));
    early.push(...toks.slice(0, k));
    late.push(...toks.slice(n - k));
  }
  const all = count(cs.flatMap((c) => tokens.get(c.id)));
  const prior = new Map([...all].map(([w, x]) => [w, (x / sum(all)) * 500]));
  const words = distinctive(count(late), count(early), prior);
  const emojiCounts = {};
  for (const c of cs) for (const t of c.turns) for (const e of t.text.match(EMOJI) || []) emojiCounts[e] = (emojiCounts[e] || 0) + 1;
  conditions[cond] = {
    conversations: cs.length,
    trajectory,
    lateWords: words.a,
    earlyWords: words.b,
    topWords: [...all].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([word, n]) => ({ word, n })),
    emoji: Object.entries(emojiCounts).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([e, n]) => ({ emoji: e, n })),
  };
}

// ---------- rounds ----------

const ROUNDS = fs.readdirSync(path.join(ROOT, 'rounds')).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'rounds', f), 'utf8')));
const roundOf = (cond) => ROUNDS.find((r) => r.conditions.includes(cond))?.id ?? null;
const BASE = ROUNDS[0];
const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);

// Theme aggregates for one round, from its codebook and coded turns.
function themeAggregates(rd, conversations) {
  const dir = path.join(DATA, 'analysis', rd.id);
  const codebook = readJson(path.join(dir, 'codebook.json'));
  if (!codebook) return null;
  const ids = codebook.themes.map((t) => t.id);
  const coded = conversations.filter((c) => fs.existsSync(path.join(dir, 'coded', `${c.id}.json`)));
  const share = {}; // conversation -> theme -> share of turns tagged
  const firstTurn = {}; // conversation -> theme -> first tagged turn
  const totals = Object.fromEntries(ids.map((id) => [id, { turns: 0, conversations: 0 }]));
  const byBin = {}; // condition -> bin -> theme -> share of turns
  for (const c of coded) {
    const { tags } = readJson(path.join(dir, 'coded', `${c.id}.json`));
    const n = c.turns.length;
    share[c.id] = {};
    firstTurn[c.id] = {};
    const binN = new Array(BINS).fill(0);
    const binHits = Array.from({ length: BINS }, () => ({}));
    for (const t of c.turns) {
      const b = binOf(t.i, n);
      binN[b]++;
      for (const id of tags[t.i] || []) {
        share[c.id][id] = (share[c.id][id] || 0) + 1;
        firstTurn[c.id][id] ??= t.i;
        binHits[b][id] = (binHits[b][id] || 0) + 1;
      }
    }
    for (const id of Object.keys(share[c.id])) {
      totals[id].turns += share[c.id][id];
      totals[id].conversations++;
      share[c.id][id] = round(share[c.id][id] / n);
    }
    const cond = ((byBin[c.condition] ??= { conversations: 0, bins: Array.from({ length: BINS }, () => ({})) }));
    cond.conversations++;
    binHits.forEach((hits, b) => {
      for (const [id, h] of Object.entries(hits)) cond.bins[b][id] = (cond.bins[b][id] || 0) + h / binN[b];
    });
  }
  for (const cond of Object.values(byBin)) {
    cond.bins = cond.bins.map((m) => Object.fromEntries(Object.entries(m).map(([id, v]) => [id, round(v / cond.conversations)])));
  }
  return { built: new Date().toISOString(), bins: BINS, codedConversations: coded.map((c) => c.id), totals, share, firstTurn, byCondition: byBin };
}

// Similarity of each conversation to the base round's conversations (excluding
// itself): whole conversation, and its opening fifth against their opening fifths.
const fifth = (toks) => toks.slice(0, Math.max(1, Math.round(toks.length * 0.2))).flat();
const baseConvos = complete.filter((c) => BASE.conditions.includes(c.condition));
const baseWhole = new Map(baseConvos.map((c) => [c.id, vectorize(tokens.get(c.id).flat())]));
const baseOpen = new Map(baseConvos.map((c) => [c.id, vectorize(fifth(tokens.get(c.id)))]));
const simBase = {};
for (const c of complete) {
  const whole = vectorize(tokens.get(c.id).flat()), open = vectorize(fifth(tokens.get(c.id)));
  const others = baseConvos.filter((b) => b.id !== c.id);
  simBase[c.id] = {
    whole: round(mean(others.map((b) => cosine(whole, baseWhole.get(b.id))))),
    opening: round(mean(others.map((b) => cosine(open, baseOpen.get(b.id))))),
  };
}

const themesByRound = {};
for (const rd of ROUNDS) {
  const cs = complete.filter((c) => rd.conditions.includes(c.condition));
  const dir = path.join(DATA, 'analysis', rd.id);
  writeJson(path.join(dir, 'stats.json'), {
    built: new Date().toISOString(), bins: BINS,
    conditions: Object.fromEntries(Object.entries(conditions).filter(([id]) => rd.conditions.includes(id))),
    perConversation: Object.fromEntries(cs.map((c) => [c.id, perConversation[c.id]])),
  });
  const agg = themeAggregates(rd, cs);
  if (agg) writeJson(path.join(dir, 'themes.json'), agg);
  themesByRound[rd.id] = agg;
}

// One row per condition across all rounds, for the compare view.
const compare = {};
for (const [cond, st] of Object.entries(conditions)) {
  const rd = roundOf(cond);
  const cs = complete.filter((c) => c.condition === cond);
  const agg = themesByRound[rd];
  const coded = cs.filter((c) => agg?.share[c.id]);
  const themeShare = {}, themeFirst = {}, themePresent = {};
  for (const c of coded) {
    for (const [id, v] of Object.entries(agg.share[c.id])) themeShare[id] = (themeShare[id] || 0) + v / coded.length;
    for (const [id, t] of Object.entries(agg.firstTurn[c.id])) {
      (themeFirst[id] ??= []).push((t - 1) / c.turns.length);
      themePresent[id] = (themePresent[id] || 0) + 1;
    }
  }
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  compare[cond] = {
    round: rd,
    conversations: cs.length,
    stopped: convos.filter((c) => c.condition === cond && c.status === 'stopped').map((c) => ({ id: c.id, ...c.stop })),
    coded: coded.length,
    wordsPerTurn: round(mean(cs.map((c) => mean(perConversation[c.id].map((r) => r.words)))), 1),
    simBaseWhole: round(mean(cs.map((c) => simBase[c.id].whole))),
    simBaseOpening: round(mean(cs.map((c) => simBase[c.id].opening))),
    themeShare: Object.fromEntries(Object.entries(themeShare).map(([id, v]) => [id, round(v)])),
    themeMedianFirst: Object.fromEntries(Object.entries(themeFirst).map(([id, xs]) => [id, round(median(xs))])),
    themeConversations: themePresent,
    trajectory: st.trajectory,
  };
}
writeJson(path.join(DATA, 'analysis', 'compare.json'), { built: new Date().toISOString(), bins: BINS, base: BASE.id, conditions: compare });

const index = convos.map((c) => {
  const rd = roundOf(c.condition);
  const open = readJson(path.join(DATA, 'analysis', rd ?? '', 'open', `${c.id}.json`));
  return {
    id: c.id,
    condition: c.condition,
    round: rd,
    status: c.status,
    turns: c.turns.length,
    plannedTurns: c.config.turnsPerAgent * 2,
    started: c.started,
    models: { A: c.agents.A.model, B: c.agents.B.model },
    words: c.turns.reduce((s, t) => s + t.text.split(/\s+/).filter(Boolean).length, 0),
    opening: c.turns[0]?.text.slice(0, 200) ?? '',
    summary: open?.summary ?? null,
    ending: open?.ending ?? null,
    simBase: simBase[c.id] ?? null,
    stop: c.stop ?? null,
  };
});
const conditionsMeta = Object.fromEntries([...new Set(convos.map((c) => c.condition))].map((id) => {
  const cfg = convos.find((c) => c.condition === id).config;
  return [id, { round: roundOf(id), description: cfg.description, systemPrompt: cfg.systemPrompt, opener: cfg.opener, turnsPerAgent: cfg.turnsPerAgent, agents: cfg.agents, backend: cfg.backend, briefing: cfg.briefing ?? null }];
}));
writeJson(path.join(DATA, 'index.json'), { built: new Date().toISOString(), rounds: ROUNDS, conditions: conditionsMeta, conversations: index });
console.log(`stats for ${complete.length} complete conversation(s) across ${ROUNDS.length} round(s); index lists ${convos.length}`);
