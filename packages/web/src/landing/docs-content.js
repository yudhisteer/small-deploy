// Author-written documentation, checked against the CLI and handlers.
// Provenance and implementation discrepancies: docs/features/rabbit-hole-docs-source-map.md.
// v1 documents the canonical CLI surface only (login, init, capture, list); the legacy Small hosting
// commands are not Rabbit Hole and are never advertised here (docs/features/rabbit-hole-cli-production-infra.md).
import { CLI_PUBLISHED } from '../flags.js';

const text = value => ({ type: 'text', value });
const code = (label, value) => ({ type: 'code', label, value });
const note = (title, value) => ({ type: 'note', title, value });
const table = (headers, rows) => ({ type: 'table', headers, rows });
const section = (id, title, ...blocks) => ({ id, title, blocks });
// No page tells anyone to install a package that does not exist yet.
const install = CLI_PUBLISHED
  ? code('Terminal · Node 18+', 'npm i -g @rabbit-hole/cli\nrabbit-hole help')
  : note('Not published yet', 'The Rabbit Hole CLI is not on npm yet. These pages describe it ahead of the release.');
export const DOCS = {
  introduction: {
    group: 'Get started', title: 'Build with Rabbit Hole.', nav: 'Introduction', description: 'The rabbit-hole command connects a project on your machine to your Rabbit Hole workspace.',
    sections: [
      section('start', 'From your terminal to your workspace.', text('The CLI is the @rabbit-hole/cli npm package, which installs the rabbit-hole command. It signs in to https://digrabbithole.com, scaffolds a project and lists what you have in Rabbit Hole.'), install),
      section('choose', 'Choose your way in.', { type: 'links', items: [['quickstart', 'Get started', 'Install, sign in and start a project.'], ['cli', 'Command reference', 'login, init, capture and list.'], ['api', 'Work with the API', 'Authentication, workspaces and the REST endpoint.']] }),
    ],
  },
  quickstart: {
    group: 'Get started', title: 'Start from your terminal.', nav: 'Quickstart', description: 'Install the CLI, sign in with your email, and start a project.',
    sections: [
      section('install', '1. Install the CLI', text('Use Node.js 18 or newer. The CLI is published as @rabbit-hole/cli and installs the rabbit-hole command.'), install),
      section('signin', '2. Sign in', text('Sign-in sends a one-time code to your email.'), code('Terminal', 'rabbit-hole login'), note('Selecting an installation', 'Plain rabbit-hole login uses RABBIT_HOLE_API if set, then the saved login origin, then https://digrabbithole.com. For another installation, run rabbit-hole login --api <installation-url> with the bare origin, no /api.')),
      section('init', '3. Start a project', text('Run init from your project directory. It writes rabbit-hole.toml and prints what it detected.'), code('From your project directory', 'rabbit-hole init')),
      section('next', 'Keep going', { type: 'links', items: [['cli', 'Command reference', 'Every Rabbit Hole command.'], ['configuration', 'Project configuration', 'rabbit-hole.toml, and moving from small.toml.']] }),
    ],
  },
  cli: {
    group: 'CLI', title: 'Command reference.', nav: 'Command reference', description: 'The rabbit-hole command and its options.',
    sections: [
      section('commands', 'Commands', table(['Command', 'What it does'], [['rabbit-hole login', 'Sign in with a one-time code to your email.'], ['rabbit-hole init', 'Scaffold rabbit-hole.toml in this project.'], ['rabbit-hole init --migrate', 'Copy a legacy small.toml to rabbit-hole.toml; small.toml is kept.'], ['rabbit-hole capture', 'Knowledge Capture: sessions, questions and decisions. Not available yet; it says so and exits with an error.'], ['rabbit-hole list', 'List your canvases and repositories in the selected workspace.']])),
      section('workspace', 'Choose a workspace', text('List the workspaces you can access, then pass one of the returned slugs. Selecting a workspace in the browser does not select it in your terminal.'), code('Replace the placeholder with a returned slug', 'rabbit-hole workspaces\nrabbit-hole list --workspace <slug>'), text('The --workspace flag takes precedence over RABBIT_HOLE_WORKSPACE. The CLI checks that the server activated the requested workspace before reading anything.')),
      section('legacy', 'Older commands', note('Not part of Rabbit Hole', 'Commands from the older Small hosting product print a legacy notice and are not supported on Rabbit Hole. rabbit-hole help legacy lists them.')),
    ],
  },
  configuration: {
    group: 'CLI', title: 'Project configuration.', nav: 'Project configuration', description: 'rabbit-hole.toml lives beside your source.',
    sections: [
      section('file', 'rabbit-hole.toml', text('rabbit-hole init writes rabbit-hole.toml from what it detects in the project and never overwrites an existing one without --force. Do not commit credentials to it.')),
      section('migrate', 'Moving from small.toml', text('A project with a legacy small.toml keeps working, and the CLI prints a one-line notice. rabbit-hole init --migrate copies it to rabbit-hole.toml byte for byte and leaves small.toml untouched. When both files exist, rabbit-hole.toml wins.'), code('From your project directory', 'rabbit-hole init --migrate')),
    ],
  },
  api: {
    group: 'API', title: 'The API, directly.', nav: 'Overview & authentication', description: 'The HTTP API the CLI uses. Start with authentication and the workspace you intend to access.',
    sections: [
      section('base', 'Base URL', code('Rabbit Hole API', 'https://digrabbithole.com/api'), text('Endpoint paths below include /api; do not append that prefix twice.')),
      section('auth', 'Authenticate your requests', text('Run rabbit-hole login. API requests accept the CLI bearer token; the dashboard uses its session cookie. Keep tokens in your own terminal or secret store, never in browser code or a public repository.'), code('Example · token supplied through your environment', 'curl "https://digrabbithole.com/api/workspaces" \\\n  -H "Authorization: Bearer $RABBIT_HOLE_TOKEN"'), text('The CLI stores the token in ~/.rabbit-hole/config.json. RABBIT_HOLE_TOKEN can supply it for automation.')),
      section('workspace', 'Select the workspace', code('Example · replace the returned workspace slug', 'curl "https://digrabbithole.com/api/apps" \\\n  -H "Authorization: Bearer $RABBIT_HOLE_TOKEN" \\\n  -H "X-Small-Workspace: <slug>"'), text('GET /api/workspaces returns accessible workspaces and the active slug. A client should verify that the returned active slug matches the requested workspace.')),
      section('endpoints', 'Endpoints', table(['Method', 'Path', 'Purpose'], [['GET', '/api/workspaces', 'Accessible workspaces and active selection.'], ['GET', '/api/apps', 'Your canvases and repositories in the active workspace.']])),
      section('errors', 'Read the response', text('API errors use JSON with an error message. A 401 indicates missing or invalid authentication; a 403 indicates insufficient access or a workspace you are not a member of. Check the HTTP status before using the response.'), code('Example error', '{ "error": "You are not a member of the requested workspace" }'), note('No live requests from these docs', 'Examples are for your terminal. Copying a command does not execute it.')),
    ],
  },
};
export const docsPath = slug => `/docs${slug === 'introduction' ? '' : `/${slug}`}`;
export const DOCS_PATHS = Object.keys(DOCS).map(docsPath);
export function currentDoc(pathname) {
  const slug = pathname.replace(/^\/docs\/?/, '').replace(/\/$/, '') || 'introduction';
  return DOCS[slug] ? slug : null;
}
