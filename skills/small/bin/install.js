#!/usr/bin/env node
'use strict';
// npx small-skill [--global] — legacy standalone installer (the CLI's `rabbit-hole skill`
// replaces it): install the skill into ./.claude/skills/rabbit-hole
// (or ~/.claude/skills/rabbit-hole with --global). Copies only the skill payload;
// this installer and package.json never land in the target.
const fs = require('fs');
const os = require('os');
const path = require('path');

try {
  const args = process.argv.slice(2);
  const unsupported = args.find((arg) => arg !== '--global');
  if (unsupported) throw new Error(`unsupported argument ${unsupported}`);

  const src = path.join(__dirname, '..');
  const base = args.includes('--global') ? os.homedir() : process.cwd();
  const dst = path.join(base, '.claude', 'skills', 'rabbit-hole');

  fs.mkdirSync(path.join(dst, 'references'), { recursive: true });
  fs.copyFileSync(path.join(src, 'SKILL.md'), path.join(dst, 'SKILL.md'));
  for (const f of fs.readdirSync(path.join(src, 'references'))) {
    if (f.endsWith('.md')) fs.copyFileSync(path.join(src, 'references', f), path.join(dst, 'references', f));
  }
  console.log(`✓ rabbit-hole skill installed → ${dst}`);
  console.log('agents now know how to deploy Python tools with rabbit-hole — try: "share this with my team"');
} catch (error) {
  console.error(`small-skill: ${error.message}`);
  process.exitCode = 1;
}
