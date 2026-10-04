'use strict';
const config = require('./config');
const cognito = require('./cognito');

// Production is the bare origin - every call appends /api itself, and login rejects
// a base with a path. RABBIT_HOLE_API (legacy SMALL_API) picks a dev/local
// installation explicitly; nothing falls back to localhost or small-* silently.
const DEFAULT_API = 'https://digrabbithole.com';
let workspace;

function apiBase() {
  return process.env.RABBIT_HOLE_API || process.env.SMALL_API || config.load().apiBase || DEFAULT_API;
}

// RABBIT_HOLE_TOKEN (legacy SMALL_TOKEN) lets CI/agents skip the interactive email
// login: copy the token from ~/.rabbit-hole/config.json after one `rabbit-hole login`.
function sessionToken() {
  return process.env.RABBIT_HOLE_TOKEN || process.env.SMALL_TOKEN || config.load().token;
}

async function sessionHeaders() {
  const current = config.load();
  const token = current.authType === 'cognito' ? await cognito.accessToken(apiBase(), current.cognito) : sessionToken();
  if (!token) throw new Error('not logged in - run: rabbit-hole login (or set RABBIT_HOLE_TOKEN)');
  return { Authorization: `Bearer ${token}`, ...(workspace ? { 'X-Small-Workspace': workspace } : {}) };
}

// Validate before any app request: the server falls back to the email workspace
// for unknown slugs, which must never silently redirect a CLI deployment.
async function selectWorkspace(slug) {
  workspace = undefined;
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error('--workspace needs a slug from: rabbit-hole workspaces');
  }
  const { workspaces } = await call('GET', '/api/workspaces');
  const selected = workspaces.find((item) => item.slug === slug);
  if (!selected) throw new Error(`No access to workspace "${slug}" - run: rabbit-hole workspaces`);
  workspace = selected.slug;
  const { active } = await call('GET', '/api/workspaces');
  if (active !== workspace) throw new Error(`Server did not select workspace "${slug}" - deployment stopped; the server needs the CLI workspace update`);
  return selected;
}

async function call(method, path, body, { auth = true } = {}) {
  const isForm = body instanceof FormData; // fetch sets the multipart boundary itself
  const headers = isForm ? {} : { 'Content-Type': 'application/json' };
  if (auth) Object.assign(headers, await sessionHeaders());
  const resp = await fetch(apiBase() + path, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    redirect: 'error',
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw Object.assign(new Error(data.error || `${path} failed (${resp.status})`), { status: resp.status });
  return data;
}

// Binary GET for run outputs - call() assumes JSON responses.
async function fetchRaw(path) {
  const resp = await fetch(apiBase() + path, { headers: await sessionHeaders(), redirect: 'error' });
  if (!resp.ok) throw new Error(`${path} failed (${resp.status})`);
  return Buffer.from(await resp.arrayBuffer());
}

module.exports = { call, apiBase, fetchRaw, selectWorkspace };
