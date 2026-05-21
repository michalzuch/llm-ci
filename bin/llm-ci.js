#!/usr/bin/env node
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

function arg(flag, envVar, defaultVal) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1) return process.argv[idx + 1];
  return process.env[envVar] || defaultVal;
}

function required(val, name) {
  if (!val) { console.error(`Error: ${name} is required`); process.exit(1); }
  return val;
}

const contentDir = required(arg('--content-dir', 'CONTENT_DIR'), '--content-dir / CONTENT_DIR');
const siteUrl    = required(arg('--site-url',    'SITE_URL'),    '--site-url / SITE_URL');
const siteName   = required(arg('--site-name',   'SITE_NAME'),   '--site-name / SITE_NAME');
const distDir    = arg('--dist-dir',    'DIST_DIR',    '');
const llmBaseUrl = arg('--llm-base-url','LLM_BASE_URL','http://localhost:11434/v1');
const llmModel   = arg('--llm-model',   'LLM_MODEL',   'qwen2.5:3b');
const llmApiKey  = arg('--llm-api-key', 'LLM_API_KEY', 'ollama');

const env = {
  ...process.env,
  CONTENT_DIR: resolve(contentDir),
  SITE_URL: siteUrl,
  SITE_NAME: siteName,
  LLM_BASE_URL: llmBaseUrl,
  LLM_MODEL: llmModel,
  LLM_API_KEY: llmApiKey,
  ...(distDir ? { DIST_DIR: resolve(distDir) } : {}),
};

function run(script) {
  const path = join(__dir, '..', 'scripts', script);
  console.log(`\n--- ${script} ---`);
  const result = spawnSync(process.execPath, [path], { env, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\n${script} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

run('generate-llms.js');

if (distDir && existsSync(resolve(distDir))) {
  run('inject-schema.js');
} else if (distDir) {
  console.warn(`\nSkipping inject-schema.js: dist-dir "${distDir}" does not exist.`);
} else {
  console.log('\nNo --dist-dir provided; skipping JSON-LD injection.');
}
