// Shared helpers: argument parsing, redaction, and headless Claude CLI calls.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const DATA = path.join(ROOT, 'data');
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(argv[i]);
  }
  return out;
}

export function redact(text) {
  return text.replace(EMAIL_RE, '[email redacted]');
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One CLI call. Returns the parsed JSON result.
export function callClaude({ cwd, prompt, model, systemPrompt, effort, resume }) {
  const cliArgs = [
    '-p', '--output-format', 'json',
    '--model', model,
    '--system-prompt', systemPrompt,
    '--tools', '',
    '--strict-mcp-config',
    '--setting-sources', '',
    '--disable-slash-commands',
  ];
  if (effort) cliArgs.push('--effort', effort);
  if (resume) cliArgs.push('--resume', resume);
  const env = { ...process.env, CLAUDE_CODE_DISABLE_ATTACHMENTS: '1' };
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  delete env.CLAUDECODE;
  return new Promise((resolve, reject) => {
    const child = spawn('claude', cliArgs, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      let parsed;
      try { parsed = JSON.parse(stdout); } catch {
        return reject(new Error(`claude exited ${code}: ${(stderr || stdout).slice(0, 500)}`));
      }
      if (parsed.is_error || parsed.subtype !== 'success') {
        return reject(new Error(`claude error: ${String(parsed.result || parsed.subtype).slice(0, 500)}`));
      }
      resolve(parsed);
    });
    // Prompt goes over stdin so long messages never hit argv limits.
    child.stdin.end(prompt);
  });
}

export async function callWithRetry(opts, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await callClaude(opts);
    } catch (err) {
      const msg = String(err.message);
      if (/usage limit|limit reached|Not logged in/i.test(msg) || attempt >= 6) throw err;
      // A safety-classifier flag judges the whole context, so retries rarely clear it.
      if (/safeguards flagged/i.test(msg) && attempt >= 3) throw err;
      const wait = Math.min(120000, 5000 * 2 ** (attempt - 1));
      console.error(`[${label}] attempt ${attempt} failed (${msg.slice(0, 120)}); retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

export async function pool(items, size, fn) {
  const queue = [...items];
  const results = [];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try { results.push(await fn(item)); } catch (err) {
        console.error(`FAILED: ${err.message}`);
        results.push(null);
      }
    }
  }));
  return results;
}

// Every saved conversation, optionally only complete ones.
export function loadConversations({ completeOnly = false } = {}) {
  const dir = path.join(DATA, 'conversations');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const cond of fs.readdirSync(dir).sort()) {
    for (const f of fs.readdirSync(path.join(dir, cond)).sort()) {
      if (!f.endsWith('.json')) continue;
      const c = JSON.parse(fs.readFileSync(path.join(dir, cond, f), 'utf8'));
      if (!completeOnly || c.status === 'complete') out.push(c);
    }
  }
  return out;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
