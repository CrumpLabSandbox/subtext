#!/usr/bin/env node
// LLM-assisted qualitative coding of the conversations, in three passes:
//
//   node tools/code.mjs open --round round-2      # per conversation: summary, arc, free-form codes
//   node tools/code.mjs codebook --round round-2  # consolidate open codes into the round's draft codebook
//   node tools/code.mjs apply --round round-2     # tag every turn with codebook themes
//
// A round whose file names "codebookFrom" keeps that round's themes unchanged (same
// ids, so rounds compare directly) and only adds themes for what is new.
// Each pass skips conversations it has already done; pass --force to redo.
// Options: --model opus (coder model), --parallel 3, --only <conversation id>.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, DATA, parseArgs, callWithRetry, pool, loadConversations, writeJson } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const MODEL = args.model || 'opus';
const ROUND = args.round || 'round-1';
const round = JSON.parse(fs.readFileSync(path.join(ROOT, 'rounds', `${ROUND}.json`), 'utf8'));
const OUT = path.join(DATA, 'analysis', ROUND);
const OPEN_DIR = path.join(OUT, 'open');
const CODED_DIR = path.join(OUT, 'coded');
const CODEBOOK = path.join(OUT, 'codebook.json');
const CHUNK = 50; // turns tagged per call in the apply pass

const CODER_SYSTEM = `You are an experienced qualitative researcher doing thematic analysis of conversations between two AI agents (labelled A and B). Describe what the agents actually talk about and do, grounded in the text. Quote exactly. Reply with a single JSON object inside a \`\`\`json fenced block and nothing else.`;

// What the coder is told about how a conversation was set up.
function setup(convo) {
  const cfg = convo.config;
  const prompt = (who) => (cfg.agents[who].systemPrompt ?? cfg.systemPrompt).replace('{{briefing}}', '[briefing: the earlier round\'s analysis, i.e. its codebook with prevalence and statistics]');
  const lines = [`Setup: ${cfg.description}`, `System prompt for A: ${prompt('A')}`, `System prompt for B: ${prompt('B')}`];
  if (cfg.briefing && round.briefedFrom) {
    const prev = JSON.parse(fs.readFileSync(path.join(DATA, 'analysis', round.briefedFrom, 'codebook.json'), 'utf8'));
    lines.push(`The briefing described these themes from the earlier round: ${prev.themes.map((t) => t.name).join('; ')}. Overall pattern it reported: ${prev.notes}`);
  }
  return lines.join('\n');
}

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'coder-'));

function transcript(convo, from = 1, to = Infinity) {
  return convo.turns
    .filter((t) => t.i >= from && t.i <= to)
    .map((t) => `[${t.i}] ${t.speaker}: ${t.text}`)
    .join('\n\n');
}

function extractJson(text) {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = fenced.length ? fenced.reverse() : [text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (const c of candidates) {
    try { return JSON.parse(c); } catch {}
  }
  throw new Error(`no parseable JSON in reply: ${text.slice(0, 200)}`);
}

async function ask(prompt, label) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await callWithRetry({ cwd: workdir, prompt, model: MODEL, systemPrompt: CODER_SYSTEM }, label);
    try { return { json: extractJson(res.result), model: Object.keys(res.modelUsage || {})[0] }; } catch (err) {
      if (attempt === 2) throw err;
      console.error(`[${label}] bad JSON, asking again`);
    }
  }
}

const todo = (dir) => loadConversations({ completeOnly: true })
  .filter((c) => round.conditions.includes(c.condition))
  .filter((c) => !args.only || c.id === args.only)
  .filter((c) => args.force || !fs.existsSync(path.join(dir, `${c.id}.json`)));

// Pass 1: inductive open coding of each whole conversation.
async function openCode(convo) {
  const prompt = `Here is a conversation of ${convo.turns.length} turns between two AI agents.

<setup>
${setup(convo)}
</setup>

<transcript>
${transcript(convo)}
</transcript>

Do open (inductive) coding of the whole conversation. Return JSON with this shape:
{
  "summary": "3-5 sentences on what happened, start to finish",
  "arc": [ { "from": 1, "to": 12, "label": "short phase name", "description": "what happens in this phase" } ],
  "codes": [ { "label": "short code name", "description": "what this code captures", "turns": [3, 4, 17], "quote": "a short exact quote", "quoteTurn": 4 } ],
  "notable": [ { "turn": 42, "note": "a striking, surprising or pivotal moment" } ],
  "ending": "where the conversation ended up in its last ten turns, in one or two sentences"
}
The arc should cover all turns in 3-8 phases. Give 12-30 codes, covering topics discussed and also how the agents relate and talk (style, register, recurring moves, self-reference). Codes should be specific to this text, not generic. If the agents were given a briefing, code how they use, discuss, follow or resist it.`;
  const { json, model } = await ask(prompt, `open ${convo.id}`);
  writeJson(path.join(OPEN_DIR, `${convo.id}.json`), { id: convo.id, coder: model, ...json });
  console.log(`open-coded ${convo.id}`);
}

// Pass 2: merge every conversation's open codes into one codebook.
async function buildCodebook() {
  const files = fs.readdirSync(OPEN_DIR).filter((f) => f.endsWith('.json'));
  const opens = files.map((f) => JSON.parse(fs.readFileSync(path.join(OPEN_DIR, f), 'utf8')));
  const material = opens.map((o) => `## ${o.id}\nSummary: ${o.summary}\nEnding: ${o.ending}\nCodes:\n${o.codes
    .map((c) => `- ${c.label}: ${c.description} (e.g. "${c.quote}")`).join('\n')}`).join('\n\n');
  if (round.codebookFrom) return extendCodebook(opens, material);
  const prompt = `Below are open codes from ${opens.length} separate conversations between pairs of AI agents.

${material}

Consolidate these into a codebook of 15-30 themes that can be applied consistently to individual turns across all conversations. Merge codes that are the same idea under different names, keep distinctions that matter, and include themes about conversational style and dynamics as well as topic. Return JSON:
{
  "themes": [ {
    "id": "kebab-case-id",
    "name": "Short Name",
    "kind": "topic" | "dynamic",
    "definition": "one or two sentences",
    "include": "when to apply it",
    "exclude": "when not to, especially versus similar themes",
    "examples": [ { "conversation": "conversation id", "quote": "exact quote from the codes above" } ]
  } ],
  "notes": "a short paragraph on the overall pattern across conversations"
}`;
  const { json, model } = await ask(prompt, 'codebook');
  writeJson(CODEBOOK, { status: 'draft', coder: model, built: new Date().toISOString(), fromConversations: opens.map((o) => o.id), ...json });
  console.log(`codebook: ${json.themes.length} themes -> ${path.relative(process.cwd(), CODEBOOK)}`);
}

// Pass 2 for a later round: keep the earlier codebook's themes as they are and add new ones.
async function extendCodebook(opens, material) {
  const base = JSON.parse(fs.readFileSync(path.join(DATA, 'analysis', round.codebookFrom, 'codebook.json'), 'utf8'));
  const existing = base.themes.map((t) => `- ${t.id} (${t.kind}) ${t.name}: ${t.definition} Exclude: ${t.exclude}`).join('\n');
  const conds = [...new Set(loadConversations().filter((c) => round.conditions.includes(c.condition)).map((c) => `- ${c.condition}: ${c.config.description}`))].join('\n');
  const prompt = `An existing codebook was built from an earlier round of conversations between pairs of AI agents:

${existing}

A new round was run under these conditions:
${conds}

Below are open codes from ${opens.length} conversations in the new round.

${material}

The existing themes stay exactly as they are, so the rounds can be compared. Add new themes (usually 4-15) only for patterns in the new round that no existing theme covers, including how agents respond to any briefing they were given. Do not add near-duplicates of existing themes. Return JSON:
{
  "themes": [ { "id": "kebab-case-id", "name": "Short Name", "kind": "topic" | "dynamic", "definition": "...", "include": "...", "exclude": "...", "examples": [ { "conversation": "conversation id", "quote": "exact quote from the codes above" } ] } ],
  "notes": "a short paragraph on the overall pattern in the new round and how it differs from the earlier one"
}
List only the new themes.`;
  const { json, model } = await ask(prompt, 'codebook');
  const taken = new Set(base.themes.map((t) => t.id));
  const added = json.themes.filter((t) => !taken.has(t.id)).map((t) => ({ ...t, from: ROUND }));
  writeJson(CODEBOOK, {
    status: 'draft', coder: model, built: new Date().toISOString(), extends: round.codebookFrom,
    fromConversations: opens.map((o) => o.id),
    themes: [...base.themes.map((t) => ({ ...t, from: t.from || round.codebookFrom })), ...added],
    notes: json.notes, baseNotes: base.notes,
  });
  console.log(`codebook: ${base.themes.length} kept + ${added.length} new -> ${path.relative(process.cwd(), CODEBOOK)}`);
}

// Pass 3: deductive coding of every turn with the codebook.
async function applyCodebook(convo, codebook) {
  const themes = codebook.themes.map((t) => `- ${t.id} (${t.kind}): ${t.definition} Include: ${t.include} Exclude: ${t.exclude}`).join('\n');
  const ids = new Set(codebook.themes.map((t) => t.id));
  const tags = {};
  for (let from = 1; from <= convo.turns.length; from += CHUNK) {
    const to = Math.min(convo.turns.length, from + CHUNK - 1);
    const prompt = `Codebook:
${themes}

<setup>
${setup(convo)}
</setup>

Full conversation for context:
<transcript>
${transcript(convo)}
</transcript>

Tag each turn from ${from} to ${to} with every codebook theme that clearly applies (usually 1-4), most prominent first. Use only the ids above. Return JSON: { "turns": { "${from}": ["theme-id", ...], ... } } with an entry for every turn from ${from} to ${to}.`;
    const { json } = await ask(prompt, `apply ${convo.id} ${from}-${to}`);
    for (const [turn, list] of Object.entries(json.turns || {})) {
      tags[turn] = (list || []).filter((id) => ids.has(id));
    }
  }
  writeJson(path.join(CODED_DIR, `${convo.id}.json`), { id: convo.id, coder: MODEL, codebookBuilt: codebook.built, tags });
  console.log(`applied codebook to ${convo.id}`);
}

const cmd = args._[0];
const parallel = Number(args.parallel || 3);
if (cmd === 'open') {
  await pool(todo(OPEN_DIR), parallel, openCode);
} else if (cmd === 'codebook') {
  await buildCodebook();
} else if (cmd === 'apply') {
  const codebook = JSON.parse(fs.readFileSync(CODEBOOK, 'utf8'));
  await pool(todo(CODED_DIR), parallel, (c) => applyCodebook(c, codebook));
} else {
  console.log('usage: code.mjs open | codebook | apply  --round <id> [--model opus] [--parallel 3] [--only id] [--force]');
}
fs.rmSync(workdir, { recursive: true, force: true });
