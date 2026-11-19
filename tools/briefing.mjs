#!/usr/bin/env node
// Writes the briefing a round's agents receive: the previous round's analysis,
// rendered verbatim from its data files (no LLM rewriting).
//
//   node tools/briefing.mjs round-2     -> the file named by rounds/round-2.json "briefing"

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA, loadConversations } from './lib.mjs';

const roundId = process.argv[2];
const round = JSON.parse(fs.readFileSync(path.join(ROOT, 'rounds', `${roundId}.json`), 'utf8'));
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
