#!/usr/bin/env node
// Quantitative measures that need no LLM, plus the index the dashboard loads.
//
//   node tools/stats.mjs     -> data/index.json, data/analysis/stats.json
//   --partial                  also count conversations still running (for previews)
//
// Similarities are TF-IDF cosines over content words. "simPrev" is how much a
// turn echoes the turn before it; "simOpen" is how close it stays to the opening.
// Convergence compares different conversations at the same relative position:
// if late turns of separate runs resemble each other more than early turns do,
// the runs are drifting toward a shared attractor.

import fs from 'node:fs';
import path from 'node:path';
import { DATA, parseArgs, loadConversations, writeJson } from './lib.mjs';

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

writeJson(path.join(DATA, 'analysis', 'stats.json'), { built: new Date().toISOString(), bins: BINS, conditions, perConversation });

// Theme aggregates from the coding passes, when they exist.
const codebookFile = path.join(DATA, 'analysis', 'codebook.json');
const codedDir = path.join(DATA, 'analysis', 'coded');
if (fs.existsSync(codebookFile)) {
  const codebook = JSON.parse(fs.readFileSync(codebookFile, 'utf8'));
  const ids = codebook.themes.map((t) => t.id);
  const coded = complete.filter((c) => fs.existsSync(path.join(codedDir, `${c.id}.json`)));
  const share = {}; // conversation -> theme -> share of turns tagged
  const firstTurn = {}; // conversation -> theme -> first tagged turn
  const totals = Object.fromEntries(ids.map((id) => [id, { turns: 0, conversations: 0 }]));
  const byBin = {}; // condition -> bin -> theme -> share of turns
  for (const c of coded) {
    const { tags } = JSON.parse(fs.readFileSync(path.join(codedDir, `${c.id}.json`), 'utf8'));
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
    cond.bins = cond.bins.map((m) => Object.fromEntries(Object.entries(m).map(([id, s]) => [id, round(s / cond.conversations)])));
  }
  writeJson(path.join(DATA, 'analysis', 'themes.json'), {
    built: new Date().toISOString(), bins: BINS, codedConversations: coded.map((c) => c.id), totals, share, firstTurn, byCondition: byBin,
  });
}

const openDir = path.join(DATA, 'analysis', 'open');
const index = convos.map((c) => {
  const openFile = path.join(openDir, `${c.id}.json`);
  const open = fs.existsSync(openFile) ? JSON.parse(fs.readFileSync(openFile, 'utf8')) : null;
  return {
    id: c.id,
    condition: c.condition,
    status: c.status,
    turns: c.turns.length,
    plannedTurns: c.config.turnsPerAgent * 2,
    started: c.started,
    models: { A: c.agents.A.model, B: c.agents.B.model },
    words: c.turns.reduce((s, t) => s + t.text.split(/\s+/).filter(Boolean).length, 0),
    opening: c.turns[0]?.text.slice(0, 200) ?? '',
    summary: open?.summary ?? null,
    ending: open?.ending ?? null,
  };
});
const conditionsMeta = Object.fromEntries([...new Set(convos.map((c) => c.condition))].map((id) => {
  const cfg = convos.find((c) => c.condition === id).config;
  return [id, { description: cfg.description, systemPrompt: cfg.systemPrompt, opener: cfg.opener, turnsPerAgent: cfg.turnsPerAgent, agents: cfg.agents, backend: cfg.backend }];
}));
writeJson(path.join(DATA, 'index.json'), { built: new Date().toISOString(), conditions: conditionsMeta, conversations: index });
console.log(`stats for ${complete.length} complete conversation(s); index lists ${convos.length}`);
