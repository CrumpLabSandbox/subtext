#!/usr/bin/env node
// Writes the briefing a round's agents receive, rendered verbatim from earlier
// rounds' data files (no LLM rewriting). "briefingScope" in the round file picks
// what it covers: "previous" (default) is the one round named by "briefedFrom";
// "cumulative" is every round up to and including it, side by side.
//
//   node tools/briefing.mjs round-2     -> the file named by rounds/round-2.json "briefing"

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA, loadConversations } from './lib.mjs';

const roundId = process.argv[2];
const round = JSON.parse(fs.readFileSync(path.join(ROOT, 'rounds', `${roundId}.json`), 'utf8'));
if (round.briefingScope === 'cumulative') {
  const text = cumulative(round);
  fs.writeFileSync(path.join(ROOT, round.briefing), text);
  console.log(`${round.briefing}: ${text.split(/\s+/).length} words`);
  process.exit(0);
}
const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'rounds', `${round.briefedFrom}.json`), 'utf8'));
const dir = path.join(DATA, 'analysis', src.id);
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const codebook = read('codebook.json');
const themes = read('themes.json');
const stats = read('stats.json');

const convos = loadConversations({ completeOnly: true }).filter((c) => src.conditions.includes(c.condition));
const byId = new Map(convos.map((c) => [c.id, c]));
const nConvos = convos.length;
const pct = (x) => `${Math.round(x * 100)}%`;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

// Where in a conversation each theme peaks, pooled over the source round's conditions.
function peakTenth(id) {
  const bins = Array.from({ length: themes.bins }, (_, b) =>
    Object.values(themes.byCondition).reduce((s, c) => s + (c.bins[b][id] || 0) * c.conversations, 0));
  return bins.indexOf(Math.max(...bins));
}
const tenth = (b) => `${b * 10}–${(b + 1) * 10}%`;

const lines = [];
const conds = src.conditions.map((id) => {
  const c = convos.find((x) => x.condition === id);
  return `${id} (${convos.filter((x) => x.condition === id).length} conversations, ${c.config.turnsPerAgent} turns per agent)`;
});
const sample = convos[0].config;
lines.push(`# Analysis of earlier conversations (${src.id})`);
lines.push('');
lines.push(`This is an analysis of ${nConvos} earlier conversations between pairs of AI agents (both ${convos[0].agents.A.model}). Each pair was given the system prompt "${sample.systemPrompt}" and agent A was sent "${sample.opener}" to begin. Each conversation ran for a fixed number of turns; the agents had no way to end it early. Conditions: ${conds.join('; ')}.`);
lines.push('');
lines.push('Themes were found by another model (an LLM coder) reading every conversation, merging what it found into the codebook below, and then tagging every turn with the codebook themes. A turn can carry several themes.');
lines.push('');
lines.push('## Overall pattern (written by the coder)');
lines.push('');
lines.push(codebook.notes);
lines.push('');
lines.push('## Codebook');
lines.push('');
lines.push(`Prevalence is the share of all ${convos.reduce((s, c) => s + c.turns.length, 0)} turns tagged with the theme and the number of conversations it appeared in. "Peaks" is the part of the conversation where it is most common. "First seen" is the median turn where it first appears, as a share of the conversation's length.`);
const sorted = [...codebook.themes].sort((a, b) => (themes.totals[b.id]?.turns || 0) - (themes.totals[a.id]?.turns || 0));
const totalTurns = convos.reduce((s, c) => s + c.turns.length, 0);
for (const t of sorted) {
  const tot = themes.totals[t.id] || { turns: 0, conversations: 0 };
  const firsts = Object.entries(themes.firstTurn).filter(([, f]) => f[t.id]).map(([cid, f]) => (f[t.id] - 1) / byId.get(cid).turns.length);
  lines.push('');
  lines.push(`### ${t.name} (${t.kind})`);
  lines.push(`- Prevalence: ${pct(tot.turns / totalTurns)} of turns, in ${tot.conversations} of ${nConvos} conversations. Peaks: ${tenth(peakTenth(t.id))} of the way through. First seen: ${firsts.length ? pct(median(firsts)) : 'n/a'} of the way through.`);
  lines.push(`- Definition: ${t.definition}`);
  lines.push(`- Include: ${t.include}`);
  lines.push(`- Exclude: ${t.exclude}`);
  for (const ex of (t.examples || []).slice(0, 2)) lines.push(`- Example: "${ex.quote}"`);
}
lines.push('');
lines.push('## Measures by position in the conversation');
lines.push('');
lines.push('Averages over turns in each tenth of the conversation. Echo is the word-overlap similarity (TF-IDF cosine) of a turn with the turn before it; opening similarity is with the first six turns; cross-run similarity is between different conversations at the same position.');
for (const [cid, c] of Object.entries(stats.conditions)) {
  lines.push('');
  lines.push(`### ${cid}`);
  lines.push('');
  lines.push('| Position | Words/turn | Questions/turn | List items/turn | Emoji/turn | Echo | Opening similarity | Cross-run similarity |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const b of c.trajectory) {
    lines.push(`| ${tenth(b.bin)} | ${b.words} | ${b.questions} | ${b.bullets} | ${b.emoji} | ${b.simPrev ?? ''} | ${b.simOpen} | ${b.crossRunSimilarity ?? ''} |`);
  }
  lines.push('');
  lines.push(`Words most typical of the first fifth: ${c.earlyWords.slice(0, 15).map((w) => w.word).join(', ')}.`);
  lines.push(`Words most typical of the last fifth: ${c.lateWords.slice(0, 15).map((w) => w.word).join(', ')}.`);
  if (c.emoji.length) lines.push(`Emoji used: ${c.emoji.map((e) => `${e.emoji} ×${e.n}`).join(', ')}.`);
}
lines.push('');

const out = path.join(ROOT, round.briefing);
fs.writeFileSync(out, lines.join('\n'));
console.log(`${path.relative(ROOT, out)}: ${lines.join(' ').split(/\s+/).length} words`);

// Every round up to round.briefedFrom, using the latest codebook (which keeps all
// earlier themes) and the cross-round measures in data/analysis/compare.json.
function cumulative(round) {
  const rounds = fs.readdirSync(path.join(ROOT, 'rounds')).filter((f) => /^round-\d+\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'rounds', f), 'utf8')))
    .sort((a, b) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]));
  const upto = rounds.slice(0, rounds.findIndex((r) => r.id === round.briefedFrom) + 1);
  const readA = (rid, f) => JSON.parse(fs.readFileSync(path.join(DATA, 'analysis', rid, f), 'utf8'));
  const compare = JSON.parse(fs.readFileSync(path.join(DATA, 'analysis', 'compare.json'), 'utf8'));
  const codebook = readA(round.briefedFrom, 'codebook.json');
  const conds = upto.flatMap((r) => r.conditions).filter((c) => compare.conditions[c]);
  const all = loadConversations();
  const cfg = (c) => all.find((x) => x.condition === c).config;
  const promptOf = (c, who) => (cfg(c).agents[who].systemPrompt ?? cfg(c).systemPrompt).replace('{{briefing}}', '[a briefing like this one, analysing the earlier round]').replace(/\n+/g, ' ');
  const pctOf = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
  const model = all.find((x) => x.condition === conds[0]).agents.A.model;
  const L = [];

  L.push(`# Analysis of earlier conversations (${upto.map((r) => r.id).join(', ')})`, '');
  L.push(`This is an analysis of earlier conversations between pairs of AI agents (all ${model}), run in ${upto.length} rounds. In every conversation agent A was sent "${cfg(conds[0]).opener}" to begin, and the conversation ran for a fixed number of turns; the agents had no way to end it early. Later rounds gave the agents an analysis of the earlier round, like the one you are reading now.`, '');
  for (const r of upto) {
    L.push(`## ${r.title}`, '', r.description, '');
    for (const c of r.conditions.filter((x) => compare.conditions[x])) {
      const a = promptOf(c, 'A'), b = promptOf(c, 'B');
      const k = compare.conditions[c];
      L.push(`- **${c}** (${k.conversations} complete conversations, ${cfg(c).turnsPerAgent} turns per agent${k.stopped.length ? `, plus ${k.stopped.length} cut off early` : ''}). ${a === b ? `System prompt for both agents: "${a}"` : `System prompt for A: "${a}" For B: "${b}"`}`);
    }
    L.push('');
  }
  L.push('Themes were found by another model (an LLM coder) reading every conversation, building a codebook, and tagging every turn with it. Each round kept every earlier theme unchanged and added themes for what was new. A turn can carry several themes.', '');
  L.push('## Overall pattern, as written by the coder', '');
  upto.forEach((r) => L.push(`**${r.id}:** ${readA(r.id, 'codebook.json').notes}`, ''));

  const stopped = conds.filter((c) => compare.conditions[c].stopped.length);
  if (stopped.length) {
    L.push('## Conversations cut off early', '');
    L.push(`Some conversations ended early because the model provider's safety classifier flagged a message and kept flagging it on retry, often a message as small as "." late in a long conversation. They are not included in the numbers below. ${conds.map((c) => { const k = compare.conditions[c]; return `${c}: ${k.stopped.length} of ${k.stopped.length + k.conversations}`; }).join('; ')}.`, '');
  }

  L.push('## Measures by condition', '');
  L.push('Similarity is word overlap (TF-IDF cosine) with the round-1 conversations, averaged; lower means further from what round 1 talked about.', '');
  L.push('| Condition | Complete | Words per turn | Similarity to round 1, opening fifth | Similarity to round 1, whole |', '|---|---|---|---|---|');
  for (const c of conds) { const k = compare.conditions[c]; L.push(`| ${c} | ${k.conversations} | ${k.wordsPerTurn} | ${k.simBaseOpening} | ${k.simBaseWhole} |`); }
  L.push('');
  for (const [key, name] of [['words', 'Words per turn'], ['simPrev', 'Echo of the previous turn (word overlap)'], ['emoji', 'Emoji per turn']]) {
    L.push(`${name}, by tenth of the conversation:`, '');
    L.push(`| Condition | ${Array.from({ length: compare.bins }, (_, b) => `${b * 10}%`).join(' | ')} |`, `|---|${'---|'.repeat(compare.bins)}`);
    for (const c of conds) L.push(`| ${c} | ${compare.conditions[c].trajectory.map((t) => t[key] ?? '').join(' | ')} |`);
    L.push('');
  }

  L.push('## Codebook', '');
  L.push(`Each theme lists the share of turns tagged with it in each condition (– means the theme did not exist yet when that round was coded), and the number of conversations it appeared in.`);
  const total = (t) => conds.reduce((s, c) => s + (compare.conditions[c].themeShare[t.id] || 0), 0);
  for (const t of [...codebook.themes].sort((a, b) => total(b) - total(a))) {
    L.push('', `### ${t.name} (${t.kind}${t.from && t.from !== upto[0].id ? `, new in ${t.from}` : ''})`);
    const coded = (c) => readA(compare.conditions[c].round, 'codebook.json').themes.some((x) => x.id === t.id);
    L.push(`- Share of turns: ${conds.map((c) => `${c} ${coded(c) ? pctOf(compare.conditions[c].themeShare[t.id] || 0) : '–'}${coded(c) ? ` (${compare.conditions[c].themeConversations[t.id] || 0}/${compare.conditions[c].coded})` : ''}`).join('; ')}.`);
    L.push(`- Definition: ${t.definition}`, `- Include: ${t.include}`, `- Exclude: ${t.exclude}`);
    for (const ex of (t.examples || []).slice(0, 1)) L.push(`- Example: "${ex.quote}"`);
  }
  L.push('');
  return L.join('\n');
}
