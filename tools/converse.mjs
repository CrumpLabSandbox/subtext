#!/usr/bin/env node
// Runs open-ended conversations between two Claude agents through the headless
// Claude Code CLI (subscription auth). Each agent is its own CLI session, resumed
// every turn, so it sees its own lines as "assistant" and the other's as "user".
//
//   node tools/converse.mjs run --condition cli-sonnet-sonnet-50 --n 10 --parallel 5
//   node tools/converse.mjs resume            # finish any unfinished runs
//   node tools/converse.mjs status

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, parseArgs, redact, callWithRetry, pool } from './lib.mjs';

const CONDITIONS = path.join(ROOT, 'conditions');
const DATA = path.join(ROOT, 'data', 'conversations');
const PROJECTS = path.join(os.homedir(), '.claude', 'projects');

const args = parseArgs(process.argv.slice(2));

function loadCondition(id) {
  const file = path.join(CONDITIONS, `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`no condition file ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function save(convo) {
  const dir = path.join(DATA, convo.condition);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${convo.id}.json`);
  fs.writeFileSync(file + '.tmp', JSON.stringify(convo, null, 2));
  fs.renameSync(file + '.tmp', file);
}

// Reads the CLI's own session log to record exactly what the agent was sent
// besides the conversation: the system blocks and any injected reminders.
function captureInjectedContext(sessionId) {
  for (const dir of fs.readdirSync(PROJECTS)) {
    const file = path.join(PROJECTS, dir, `${sessionId}.jsonl`);
    if (!fs.existsSync(file)) continue;
    const ctx = { system: [], firstUserMessage: null };
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const d = JSON.parse(line);
      if (d.type === 'api-request-shape' && !ctx.system.length) {
        ctx.system.push(...(d.shape?.system || []).map((b) => b.text));
      }
      if (d.type === 'api-request-blob') {
        const m = d.message;
        if (m?.role === 'system') ctx.system.push(...m.content.map((b) => b.text));
        if (m?.role === 'user' && !ctx.firstUserMessage) ctx.firstUserMessage = m.content.map((b) => b.text);
      }
    }
    ctx.system = ctx.system.map((t) => redact(t).replace(/(working director(?:y|ies):?)[^\n]*/gi, '$1 [temp dir]'));
    if (ctx.firstUserMessage) ctx.firstUserMessage = ctx.firstUserMessage.map(redact);
    return ctx;
  }
  return null;
}

function newConversation(cond) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const id = `${cond.id}_${stamp}_${crypto.randomBytes(3).toString('hex')}`;
  return {
    id,
    condition: cond.id,
    config: cond,
    status: 'running',
    started: new Date().toISOString(),
    finished: null,
    generator: 'claude -p (Claude Code CLI, subscription auth); temperature is the CLI default',
    // Neutral temp dir: the CLI puts its working directory in the system prompt.
    workdir: fs.mkdtempSync(path.join(os.tmpdir(), 'convo-')),
    agents: { A: { sessionId: null, model: null }, B: { sessionId: null, model: null } },
    injectedContext: null,
    turns: [],
  };
}

async function runConversation(convo) {
  const cond = convo.config;
  const total = cond.turnsPerAgent * 2;
  if (!fs.existsSync(convo.workdir)) fs.mkdirSync(convo.workdir, { recursive: true });
  while (convo.turns.length < total) {
    const i = convo.turns.length;
    const speaker = i % 2 === 0 ? 'A' : 'B';
    const agent = convo.agents[speaker];
    const prompt = i === 0 ? cond.opener : convo.turns[i - 1].raw;
    const t0 = Date.now();
    const res = await callWithRetry({
      cwd: convo.workdir,
      prompt,
      model: cond.agents[speaker].model,
      systemPrompt: cond.agents[speaker].systemPrompt ?? cond.systemPrompt,
      effort: cond.agents[speaker].effort ?? cond.effort,
      resume: agent.sessionId,
    }, `${convo.id} turn ${i + 1}`);
    if (!agent.sessionId) {
      agent.sessionId = res.session_id;
      agent.model = Object.keys(res.modelUsage || {})[0] || null;
      if (speaker === 'A') convo.injectedContext = captureInjectedContext(res.session_id);
    }
    const text = res.result ?? '';
    const clean = redact(text);
    convo.turns.push({
      i: i + 1,
      speaker,
      text: clean,
      raw: text, // stripped before the file is final
      redacted: clean !== text,
      ts: new Date().toISOString(),
      ms: Date.now() - t0,
      outputTokens: res.usage?.output_tokens ?? null,
      costUsd: res.total_cost_usd ?? null, // list-price estimate reported by the CLI
    });
    save(convo);
    process.stdout.write(`[${convo.id}] ${i + 1}/${total}\n`);
  }
  convo.status = 'complete';
  convo.finished = new Date().toISOString();
  for (const t of convo.turns) delete t.raw;
  delete convo.workdir;
  save(convo);
  return convo;
}

function unfinished() {
  if (!fs.existsSync(DATA)) return [];
  const out = [];
  for (const cond of fs.readdirSync(DATA)) {
    for (const f of fs.readdirSync(path.join(DATA, cond))) {
      if (!f.endsWith('.json')) continue;
      const c = JSON.parse(fs.readFileSync(path.join(DATA, cond, f), 'utf8'));
      if (c.status !== 'complete') out.push(c);
    }
  }
  return out;
}

const cmd = args._[0];
if (cmd === 'run') {
  const cond = loadCondition(args.condition);
  const n = Number(args.n || 1);
  const convos = Array.from({ length: n }, () => newConversation(cond));
  for (const c of convos) save(c);
  await pool(convos, Number(args.parallel || 3), runConversation);
} else if (cmd === 'resume') {
  const todo = unfinished();
  console.log(`resuming ${todo.length} conversation(s)`);
  await pool(todo, Number(args.parallel || 3), runConversation);
} else if (cmd === 'status') {
  if (!fs.existsSync(DATA)) process.exit(0);
  for (const cond of fs.readdirSync(DATA)) {
    const files = fs.readdirSync(path.join(DATA, cond)).filter((f) => f.endsWith('.json'));
    const convos = files.map((f) => JSON.parse(fs.readFileSync(path.join(DATA, cond, f), 'utf8')));
    const done = convos.filter((c) => c.status === 'complete').length;
    console.log(`${cond}: ${done}/${convos.length} complete`);
    for (const c of convos.filter((c) => c.status !== 'complete')) {
      console.log(`  ${c.id}: ${c.turns.length}/${c.config.turnsPerAgent * 2} turns`);
    }
  }
} else {
  console.log('usage: converse.mjs run --condition <id> [--n N] [--parallel P] | resume | status');
}
