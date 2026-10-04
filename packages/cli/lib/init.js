'use strict';
const fs = require('fs');
const path = require('path');
const { detect, configFile, CONFIG, LEGACY_CONFIG } = require('./detect');
const { checkSchema } = require('./inputs');
const { parse } = require('./toml');

// os.environ["X"], os.environ.get("X"), os.getenv("X")
const ENV_RE = /os\.environ\[\s*["']([A-Za-z_]\w*)["']\s*\]|os\.(?:getenv|environ\.get)\(\s*["']([A-Za-z_]\w*)["']/g;

// `rabbit-hole init --migrate`: copy a legacy small.toml to rabbit-hole.toml byte for
// byte. small.toml is never modified or deleted.
function migrate(dir, { force = false } = {}) {
  const legacy = path.join(dir, LEGACY_CONFIG);
  const tomlPath = path.join(dir, CONFIG);
  if (!fs.existsSync(legacy)) {
    console.log(`no ${LEGACY_CONFIG} here - nothing to migrate`);
    return false;
  }
  if (fs.existsSync(tomlPath) && !force) {
    console.log(`${CONFIG} already exists - nothing migrated (--force replaces it with a copy of ${LEGACY_CONFIG})`);
    return true;
  }
  checkSchema(parse(fs.readFileSync(legacy, 'utf8'), LEGACY_CONFIG)); // a broken file stops here, not at deploy
  fs.copyFileSync(legacy, tomlPath);
  console.log(`✓ copied ${LEGACY_CONFIG} to ${CONFIG} - ${LEGACY_CONFIG} is untouched; delete it when ready`);
  return true;
}

// Write rabbit-hole.toml from detection. Returns false when the entry could not be determined.
function init(dir, { force = false } = {}) {
  const tomlPath = path.join(dir, CONFIG);
  const existing = configFile(dir); // a legacy small.toml counts, with its migrate notice
  if (existing && !force) {
    checkSchema(parse(fs.readFileSync(existing, 'utf8'), path.basename(existing))); // bad [inputs] type stops init in one line
    if (existing === tomlPath) console.log(`${CONFIG} already exists - use --force to overwrite`);
    return true;
  }

  let app = null;
  try {
    app = detect(dir);
  } catch {}
  const name = (app && app.name) || path.basename(dir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const required = [];
  const inputs = []; // SMALL_INPUT_<NAME> reads = the run form, not secrets
  let source = '';
  if (app) {
    source = fs.readFileSync(path.join(dir, app.entry), 'utf8');
    for (const m of source.matchAll(ENV_RE)) {
      const v = m[1] || m[2];
      if (v.startsWith('SMALL_INPUT_')) {
        const n = v.slice('SMALL_INPUT_'.length).toLowerCase();
        if (n && !inputs.includes(n)) inputs.push(n);
        continue;
      }
      if (v.startsWith('SMALL_')) continue; // platform-injected (SMALL_DATA etc.), never a secret
      if (!required.includes(v)) required.push(v);
    }
  }
  // a plain script is an on-demand job; the deploy path branches on kind, so
  // init must say it or the script ships wrapped as a web server
  const isJob = app && app.framework === 'script';
  const wantsStorage = /^\s*(?:import|from)\s+sqlite3\b/m.test(source) || source.includes('SMALL_DATA');
  const wantsOutputs = source.includes('SMALL_OUTPUTS');
  const reqsPath = path.join(dir, 'requirements.txt');
  const hasReqs = fs.existsSync(reqsPath);
  const wantsAws = /^\s*(?:import|from)\s+boto3\b/m.test(source)
    || (hasReqs && /^boto3\b/m.test(fs.readFileSync(reqsPath, 'utf8')));

  const lines = [`name = "${name}"`];
  lines.push(app ? `entry = "${app.entry}"` : 'entry = ""                     # fill in: your app\'s main .py file');
  lines.push(`framework = "${app ? app.framework : ''}"`);
  if (isJob) lines.push('type = "job"');
  if (hasReqs) lines.push('', '[deps]', 'file = "requirements.txt"');
  if (inputs.length) {
    lines.push('', '[inputs]');
    for (const n of inputs) lines.push(`${n} = { type = "text" }        # fill in: type (text|number|file|select|date|bool), help`);
  }
  if (wantsOutputs) lines.push('', '[outputs]', '# fill in: label the files the script saves, e.g.', '# result = { path = "result.csv", label = "Results" }');
  lines.push('', '[secrets]');
  // say whether the scan RAN and found nothing, or never ran - "fill in" on a
  // scanned-clean file reads as "the tool didn't look"
  lines.push(required.length ? `required = [${required.map((n) => `"${n}"`).join(', ')}]`
    : app ? `required = []                  # scanned ${app.entry}: no secret env reads found`
    : 'required = []                  # env vars this app reads - fill in');
  if (wantsAws) lines.push('', '[aws]', 'role_arn = ""                  # fill in: IAM role the runs assume - never AWS keys in .env');
  if (wantsStorage) lines.push('', '[storage]', 'path = "/data"', 'size = "1GB"');
  lines.push('', '[access]', 'visibility = "domain"', '');
  fs.writeFileSync(tomlPath, lines.join('\n'));

  console.log(`✓ name: ${name}`);
  if (['app', 'src', 'main', 'tmp', 'test', 'code', 'scripts'].includes(name)) {
    console.log(`⚠ name "${name}" comes from the directory - set name = "something-descriptive" in rabbit-hole.toml before deploying`);
  }
  if (app) console.log(`✓ entry: ${app.entry} (${app.framework})`);
  if (isJob) console.log('✓ type: job (plain script, runs on demand)');
  if (hasReqs) console.log('✓ deps: requirements.txt');
  if (inputs.length) console.log(`✓ inputs: ${inputs.join(', ')} (SMALL_INPUT_* reads in ${app.entry} - set types in rabbit-hole.toml)`);
  if (wantsOutputs) console.log('✓ outputs: script writes to the run outputs folder - label them in [outputs]');
  if (required.length) console.log(`✓ secrets: ${required.join(', ')} (read by ${app.entry})`);
  if (wantsAws) console.log('✗ aws: boto3 detected - fill in role_arn under [aws] (see the skill\'s aws-role notes)');
  if (wantsStorage) console.log('✓ storage: /data (1GB)');
  console.log('✓ visibility: domain');
  console.log('✓ wrote rabbit-hole.toml');
  // AGENT.md feeds the dashboard's Ask agent at app scope, verbatim, on every deploy.
  const agentPath = path.join(dir, 'AGENT.md');
  if (!fs.existsSync(agentPath)) {
    fs.writeFileSync(agentPath, [
      '<!-- Things the agent should know that the code doesn\'t say.',
      '     Two paragraphs, plain English. Uploaded with every deploy. -->',
      '',
    ].join('\n'));
    console.log('✓ wrote AGENT.md (notes for the Ask agent - optional)');
  }
  if (!app) console.log('✗ could not find the entry file - fill in entry = "your-app.py" in rabbit-hole.toml');
  return !!app;
}

module.exports = { init, migrate };
