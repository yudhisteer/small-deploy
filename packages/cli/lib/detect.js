'use strict';
const fs = require('fs');
const path = require('path');
const { parse } = require('./toml');

const HINTS = [
  ['Flask(', 'flask'],
  ['FastAPI(', 'fastapi'],
  ['import streamlit', 'streamlit'],
  ['import gradio', 'gradio'],
];

function frameworkOf(source) {
  for (const [hint, fw] of HINTS) if (source.includes(hint)) return fw;
  return 'script';
}

const CONFIG = 'rabbit-hole.toml';
const LEGACY_CONFIG = 'small.toml';
const noticed = new Set();

// The project config path, or null. rabbit-hole.toml wins; a legacy small.toml
// still loads and is never rewritten - `rabbit-hole init --migrate` copies it.
function configFile(dir) {
  const current = path.join(dir, CONFIG);
  const legacy = path.join(dir, LEGACY_CONFIG);
  const hasCurrent = fs.existsSync(current);
  if (!fs.existsSync(legacy)) return hasCurrent ? current : null;
  if (!noticed.has(dir)) {
    noticed.add(dir);
    console.log(hasCurrent
      ? `⚠ ${CONFIG} and ${LEGACY_CONFIG} both exist - using ${CONFIG}; delete ${LEGACY_CONFIG} when ready`
      : `⚠ using legacy ${LEGACY_CONFIG} - copy it to ${CONFIG} with: rabbit-hole init --migrate`);
  }
  return hasCurrent ? current : legacy;
}

// Detection order per SCOPE.md: rabbit-hole.toml (or legacy small.toml) -> --entry ->
// framework hint -> filename convention -> only .py file -> fail with the one-line fix.
function detect(dir, flags = {}) {
  const tomlPath = configFile(dir);
  const config = tomlPath ? parse(fs.readFileSync(tomlPath, 'utf8'), path.basename(tomlPath)) : {};
  // `kind` was renamed to `type`; old tomls keep working, new ones write `type`
  if (config.kind != null && config.type == null) config.type = config.kind;
  const name = config.name || path.basename(dir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const pick = (entry, via) => {
    const full = path.join(dir, entry);
    if (!fs.existsSync(full)) throw new Error(`entry ${entry} (via ${via}) does not exist`);
    const source = fs.readFileSync(full, 'utf8');
    return { name, entry, framework: config.framework || frameworkOf(source), via, config };
  };
  if (config.entry) return pick(config.entry, path.basename(tomlPath));
  if (flags.entry) return pick(flags.entry, '--entry');
  const pys = fs.readdirSync(dir).filter((f) => f.endsWith('.py'));
  for (const f of pys) {
    if (frameworkOf(fs.readFileSync(path.join(dir, f), 'utf8')) !== 'script') return pick(f, 'framework hint');
  }
  for (const f of ['app.py', 'main.py', 'server.py']) {
    if (pys.includes(f)) return pick(f, 'filename convention');
  }
  if (pys.length === 1) return pick(pys[0], 'only .py file');
  throw new Error('cannot find the app entry - add entry = "app.py" to rabbit-hole.toml');
}

module.exports = { detect, frameworkOf, configFile, CONFIG, LEGACY_CONFIG };
