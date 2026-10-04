// Rabbit Hole is on in the production build (VITE_RABBIT_HOLE) and in the dev/review build (VITE_COACHING_DEV,
// which alone also turns on the dev-only tools); private BYOC never gets it (T02 D2).
// `?.` keeps this importable by node tests, as private-auth.js:3 already does.
export const learnPreview = (import.meta.env?.VITE_RABBIT_HOLE === 'true' || import.meta.env?.VITE_COACHING_DEV === 'true') && import.meta.env?.VITE_PRIVATE_BYOC !== 'true';
// Review tooling (?fixtures=1 cards, ?board= review boards) is dev/review only: never in the production build,
// which turns learnPreview on with VITE_RABBIT_HOLE alone.
export const reviewTools = learnPreview && import.meta.env?.VITE_COACHING_DEV === 'true';
// The supplied NanoGPT course's editor (Edit course, Edit in chat, curriculum approval) is review tooling too:
// ownership alone never opens it in production. Generated courses keep their owner editor.
export const canEditCourse = (canAuthor, supplied) => !!canAuthor && (reviewTools || !supplied);

// First-party product name: document title and first-party copy, in every build (the small name is
// retired with the CLI rename). Workspace names never change (T02 §2).
export const PRODUCT = 'Rabbit Hole';

// The @rabbit-hole/cli npm package is not published yet. Until the publish flips this, no dashboard UI
// tells anyone to install it (docs/features/rabbit-hole-cli-production-infra.md, Publish prerequisites).
export const CLI_PUBLISHED = false;

// Dashboard CLI help: Settings > Developer and the New > App dialog. Null hides both. Rabbit Hole shows
// only its canonical commands. A private AWS installation is unchanged: its release ships the legacy
// CLI as small-deploy.tgz (packages/byoc/package-private.mjs) until that line retires.
export function cliGuide({ privateByoc = false, origin, published = CLI_PUBLISHED } = {}) {
  if (privateByoc) return {
    intro: 'Deploy from your terminal',
    heading: 'New app',
    dialog: 'Use the CLI package supplied with this installation to deploy CPU jobs into your AWS account.',
    steps: [
      { title: '1. Install the CLI', desc: 'Node 18+', cmd: 'npm i -g ./small-deploy.tgz' },
      { title: '2. Sign in', desc: 'Cognito opens in your browser', cmd: `small login --api ${origin}` },
      { title: '3. Ship', label: '3. Ship from your project directory', desc: 'From your project directory. It appears here the moment it deploys.', cmd: 'small deploy' },
    ],
    commands: [
      ['Start a job', 'Prompts for its inputs', 'small run <app>'],
      ['Recent runs', 'Status, duration, who started them', 'small runs <app>'],
      ['Logs', 'Tail what an app printed', 'small logs <app>'],
      ['Share', 'Give a teammate access', 'small share <email>'],
      ['Schedule', 'Pause or resume a cron', 'small schedule pause <app>'],
      ['Everything you own', 'Apps and their URLs', 'small list'],
      ['Watch', 'What the nightly pass found', 'small watch'],
      ['Start a new project', 'Scaffolds small.toml and a runbook', 'small init'],
    ],
    api: { desc: 'The same-origin API this dashboard uses', url: `${origin}/api` },
  };
  if (!published) return null;
  return {
    intro: 'Work with Rabbit Hole from your terminal',
    heading: 'Get started',
    dialog: null, // Rabbit Hole does not host apps, so there is no New > App
    steps: [
      { title: '1. Install the CLI', desc: 'Node 18+', cmd: 'npm i -g @rabbit-hole/cli' },
      { title: '2. Sign in', desc: 'A one-time code to your email', cmd: 'rabbit-hole login' },
      { title: '3. Start a project', desc: 'Scaffolds rabbit-hole.toml in your project directory', cmd: 'rabbit-hole init' },
    ],
    commands: [
      ['Capture knowledge', 'Sessions, questions and decisions (coming soon)', 'rabbit-hole capture'],
      ['Everything you own', 'Your canvases and repositories', 'rabbit-hole list'],
    ],
    api: { desc: 'The Rabbit Hole REST endpoint', url: 'https://digrabbithole.com/api' },
  };
}

// T02 §9: false until the Learn handoff (feature/parallel-work cc0cbf8) reaches main. The PR
// that merges it flips this; it is never detected at runtime, because a missing hook and a
// slow hook look the same.
export const learnHandoff = false;

// Gate C G1 (2026-09-24), decided OFF: the dev clone binds the live D1 'small'
// (wrangler.dev.jsonc d1_databases DB), and /api/ask writes live chat history, so the preview's
// workspace and app asks stay unavailable. Project and canvas asks keep their threads and moment
// log in LEARN_DB and stay on; that is enforced by the dev worker's handlers (C1 in
// docs/features/learn-cleanup.md), not by this flag or the browser's api() check.
export const askLiveOnPreview = false;

// G5 (Gate C, 2026-09-24): /api/apps/find and /api/runs/find each run a model on the live control
// plane (control-plane/src/index.js:595-638). Read-only is not isolated, so the preview never calls
// them until the user approves live model-backed reads. The live build is unchanged.
export const aiReadsOnPreview = false;
export const aiFindAllowed = (preview = learnPreview) => !preview || aiReadsOnPreview;
