'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE = path.join(os.homedir(), '.rabbit-hole', 'config.json');
// Read-only fallback so a `small login` keeps working after the rename. Never written.
const LEGACY_FILE = path.join(os.homedir(), '.small', 'config.json');
// Retired small-* control planes: a legacy login saved for one is never reused
// silently, only when RABBIT_HOLE_API/SMALL_API names that same host. A legacy
// file without apiBase dates from when small-cp was the default.
const LEGACY_DEFAULT = 'https://small-cp.zeroshothq.workers.dev';
const isLegacyHost = (base) => /\/\/small-cp[\w-]*\.|zeroshothq\./i.test(String(base || ''));
let warned = false;

function read(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function load() {
  const current = read(FILE);
  if (current) return current;
  const legacy = read(LEGACY_FILE);
  if (!legacy) return {};
  const saved = (legacy.apiBase || LEGACY_DEFAULT).replace(/\/$/, '');
  const explicit = (process.env.RABBIT_HOLE_API || process.env.SMALL_API || '').replace(/\/$/, '');
  if (isLegacyHost(saved) && explicit !== saved) {
    if (!warned) console.error(`⚠ not using the small login for ${saved} (${LEGACY_FILE}) - run: rabbit-hole login`);
    warned = true;
    return {};
  }
  return legacy;
}

function save(obj) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(FILE, 0o600);
}

module.exports = { load, save, FILE, LEGACY_FILE, isLegacyHost };
