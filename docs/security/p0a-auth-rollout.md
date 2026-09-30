# P0-A: production auth containment and rollout runbook

**Status:** prepared on 2026-09-30. **Nothing here has been executed.** Every live step needs the owner's explicit go.

**Approved code:** `hotfix/auth-fail-closed` at `e7b4e72ca764e8b7c510a0cb1e346feb5170164d`, which contains:
- c49971ba: production auth fails closed;
- a8b20443: the CLI verifier can no longer be brute-forced;
- ec98b311: strict email validation;
- e359cc3f: server-side CLI challenges with attempts, expiry and caps;
- 97f5c280: `preview_urls: false`;
- b4e6dbbe: docs;
- e7b4e72c: a per-domain CLI cap.

**Live today:** `small-cp` version `e8af0661-67a7-4aa4-a930-2a3baec9620e`, deployed 2026-09-16.
- It has `TEST_BYPASS_SECRET` set and no `RESEND_API_KEY`.
- So web login shows the magic link, and CLI login returns `devCode`, for any email.
- Old version hosts are still public. On 2026-09-30, `e8af0661-`, `13344b17-` and `7e8ce0e3-small-cp.zeroshothq.workers.dev` all answered 302 to the login page.

**Hard rules:**
- Never set `RESEND_API_KEY` on the code running today. Its CLI challenge contains an unsalted `sha256` of the code, so once email really sends, the code can be recovered offline.
- MASTER_KEY rotation is not part of this rollout. It waits for P0-B: a separate dev control plane, so review clones no longer depend on production session signing.
- Run every command from `C:/Users/cyudhist/Desktop/workspace/auth-fail-closed/packages/control-plane` unless stated otherwise. `wrangler.jsonc` there names `small-cp` and binds D1 `small`.

---

## 0. Emergency containment (can run before the code deploy)

### 0a. Remove the test bypass secret from live
```sh
npx wrangler secret delete TEST_BYPASS_SECRET
```
- **Effect:** `secret delete` creates and immediately deploys a new version: the same old code without the secret.
  - Web login returns 503 "Email is not configured on this control plane."
  - CLI login returns 503 "email not configured on this control plane".
  - `/test/session` and `/test/watch` return 404.
  - No auth material is echoed on the production host.
- **Accepted cost:** review clones' `/test/session` (the dev workers bind `CONTROL_PLANE` to `small-cp`), e2e scripts that mint test sessions, and `tests/integration_tests` that use `/test/session` stop working until P0-B.
- **Record** the new version id this command prints. It is the safe rollback target (see Rollback).
- **Rollback:** `npx wrangler secret put TEST_BYPASS_SECRET`, re-entering the value from the owner's `.env`. **Do not** do this: it reopens the vulnerability.

### 0b. Turn off version (preview) URLs
Old versions keep their own code and their own secrets, so 0a does not close them.
1. In the Cloudflare dashboard, open **Workers & Pages**, then **small-cp**.
2. Go to **Settings**, then **Domains & Routes**.
3. Find **Version URLs** (older dashboards call it "Preview URLs") and select **Disable**.

Cloudflare's docs say this is a worker-level setting: disabling it stops routing to all Version URLs and their aliases. The hotfix's `"preview_urls": false` applies the same setting on the next `wrangler deploy`. Don't rely on it before then.

### 0c. Verify containment (reachability and non-disclosure only; never log in as anyone else)
```sh
for v in e8af0661 13344b17 7e8ce0e3; do curl -s -o /dev/null -w "$v %{http_code}\n" -A small-auth-audit https://$v-small-cp.zeroshothq.workers.dev/login; done
curl -s -A small-auth-audit -X POST https://small-cp.zeroshothq.workers.dev/api/cli/login -H 'content-type: application/json' -d '{"email":"probe@example.test"}'
curl -s -A small-auth-audit -X POST https://small-cp.zeroshothq.workers.dev/test/session -H 'content-type: application/json' -d '{"email":"probe@example.test","secret":"wrong"}'
npx wrangler secret list
```
- The version hosts should no longer return 200 or 302. Expect 404, or Cloudflare's "not enabled" page.
- The CLI call should return 503 with no `devCode`.
- `/test/session` should return 404 `not enabled`.
- The secret list should not include `TEST_BYPASS_SECRET`.

---

## Rollout (needs the owner's go)

### A. Confirm the bypass secret is gone
`npx wrangler secret list` must not list `TEST_BYPASS_SECRET`. If it is still there, run 0a first.

### B. Inspect pending D1 migrations
```sh
npx wrangler d1 migrations list small --remote
```
- Expected pending: exactly `0024-learn-courses.sql` and `0025-cli-login-challenges.sql`.
- Both use `CREATE … IF NOT EXISTS`. Nothing in the hotfix depends on 0024.
- If anything else is pending, or `0024`'s table already exists without a `d1_migrations` row, stop. `docs/v10_job_inputs_outputs.md:106-109` explains that migrations applied by hand get replayed and roll the apply back.
- The dev workers use the same `small` database. Tell the other sessions before step C.

### C. Apply the migrations
```sh
npx wrangler d1 migrations apply small --remote
npx wrangler d1 migrations list small --remote   # expect: nothing pending
```
The old code ignores the new table. If the code deployed before the table existed, CLI login would fail closed with a 503.

### D. Configure email (immediately before E, never earlier)
Prerequisite: `tryrabbithole.dev` is verified in Resend (next section).
```sh
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
```
- For `EMAIL_FROM`, paste `Rabbit Hole <login@tryrabbithole.dev>`.
- Enter both values only at the prompt; never on a command line, in a file or in chat.
- The code reads `env.EMAIL_FROM`. `wrangler.jsonc` documents it as an optional secret. Unset, it falls back to `small <onboarding@resend.dev>`, which Resend only delivers to the Resend account owner.
- Each `secret put` deploys a new version of the old code, which is still safe because the bypass secret is gone.
  - Once `RESEND_API_KEY` is set, that old CLI flow sends real codes with the old unsalted-hash challenge (F1).
  - So run E straight after D, with nothing in between.
  - Or skip D here: set both secrets right after E instead. The hotfix answers 503 until the key exists.
  - **Recommended order: E, then D.**

### E. Deploy the hotfix
```sh
cd C:/Users/cyudhist/Desktop/workspace/auth-fail-closed
git switch hotfix/auth-fail-closed && git fetch origin && git status && git rev-parse HEAD
#   HEAD must be e7b4e72ca764e8b7c510a0cb1e346feb5170164d and the tree must be clean
cd packages/web && env -u VITE_COACHING_DEV -u VITE_BYOC_DEV npm run build
#   the live build: no preview flags (wrangler.jsonc serves ../web/dist)
cd ../control-plane && npx wrangler deploy --dry-run && npx wrangler deploy
```
- Record the new version id.
- Freeze other `small-cp` deploys (`cp:deploy` from other worktrees or main) until this merges to main. Deploying main-based code brings the echo back.

### F. Verify (use the owner's own mailbox, and synthetic addresses for the negative checks)
- [ ] Web login for your own address: the page says "Check your inbox" and contains no link. The email arrives from `login@tryrabbithole.dev`, and its link signs you in.
- [ ] CLI: run `small login --api https://small-cp.zeroshothq.workers.dev --email <your address>`. It prints "code sent", an 8-digit code arrives, and verify succeeds.
- [ ] `POST /api/cli/login` for your address returns only `{"challenge": …}`. Decode the first dot-separated part: it holds only `t`, `id` and `exp`, with no code and no email.
- [ ] Five wrong codes, then the right one, gives 401. A replay of a used challenge gives 401.
- [ ] `POST /test/session` (synthetic email, any secret) returns 404 `not enabled`.
- [ ] Web and CLI login for `bad"x@example.test` return 400.
- [ ] The three version hosts from 0c no longer serve the app.
- [ ] `npx wrangler secret list` has no `TEST_BYPASS_SECRET` and does have `RESEND_API_KEY` and `EMAIL_FROM`.
- [ ] `npx wrangler tail small-cp` during the checks: no code, link or token appears in the logs; at most "email send failed: status N".

### G. Leave MASTER_KEY unchanged
Rotation is deferred (C1 below).

---

## Rollback
- **Versions carry their own secrets.** Rolling back to any version from before 0a (e.g. `e8af0661…`) brings back `TEST_BYPASS_SECRET` and the echo. **Never roll back to a version from before containment.**
- **Safe target:** the version id recorded in 0a (the old code without the bypass secret), or a later hotfix version.
- **Steps:**
  1. If `RESEND_API_KEY` is set and the target is old code, first run `npx wrangler secret delete RESEND_API_KEY`. Old code with working email is F1.
  2. Then run `npx wrangler rollback <safe-version-id>`, or use the dashboard: Deployments → ⋯ → Rollback.
  3. Leave the D1 migrations in place: old code ignores `cli_login_challenges` and `learn_courses`.
- **Re-verify** with 0c.

---

## Resend on tryrabbithole.dev
- **Current DNS:** `tryrabbithole.dev` is on Cloudflare DNS (`macy`/`rene.ns.cloudflare.com`). As of 2026-09-30 it has no MX, SPF or `_dmarc` records, so nothing conflicts.
- **Records Resend requires** (from Resend's Cloudflare guide; copy the exact values from the Resend dashboard after adding the domain, because they depend on the chosen region):
  - MX `send` → `feedback-smtp.<region>.amazonses.com`, priority 10 (the return path);
  - TXT `send` → `v=spf1 include:amazonses.com ~all`;
  - TXT `resend._domainkey` → the DKIM public key Resend generates, set to DNS only (not proxied);
  - optional MX `inbound` → only if you want to receive mail through Resend. Not needed.
  - Resend offers Domain Connect auto-configuration for Cloudflare DNS, which is the easiest path.
- **Recommended addition:** DMARC, TXT `_dmarc` → `v=DMARC1; p=none;`. Tighten it later.
- **Root versus subdomain:** verifying the root domain `tryrabbithole.dev` is enough. Once verified, any address at that domain can send, including `login@tryrabbithole.dev`, with no mailbox needed. Resend recommends a sending subdomain for reputation isolation, but that is optional. Its records sit on `send.` and `resend._domainkey.`, so they won't clash with a future root MX, e.g. Google Workspace.
- **`EMAIL_FROM`:** `Rabbit Hole <login@tryrabbithole.dev>`.
- **Cosmetic, later:** email subjects and bodies still say "small deploy". Rebrand them with the landing/auth work, not in this hotfix.

---

## Security / pre-main ledger (deferred; not fixed in this hotfix)

**C1 (critical):**
- Historical CLI tokens don't expire. Tokens minted through the pre-fix echo stay valid after deploy.
- The fix is MASTER_KEY rotation after P0-B, in a maintenance window. It logs everyone out and voids in-flight run tokens.

**P1:**
- **`orgOf` collision.** `a-b.com` and `a.b.com` both map to org `a-b-com`, so someone who owns a lookalike domain joins another company's org.
- **Open redirect on login.** The `next` value flows into the magic token, and `/auth` redirects there. It enables phishing but discloses no token.
- **Fly deploy token.** `/api/logs` returns the app's stored Fly deploy token to view-only members.

**Follow-ups:**
- Gmail throttling: all Gmail users share the gmail.com per-domain CLI cap (30 per hour, 100 per day). Heavy use, or an attacker, can throttle Gmail CLI logins. A public-mail-domain exemption would fix it.
- 429 side channel: the 429 reveals that codes were recently requested for an address.
- Reusable magic links: web magic links work repeatedly for 15 minutes and appear in Cloudflare request logs.
- Login CSRF: the login form has no CSRF protection.
- Raw 500 errors: the 500 handler returns `internal: <message>` to anyone.
- Stale challenges: `cli_login_challenges` rows are never purged.

## Auth product direction (locked; not part of this hotfix)
- **Web:** Continue with Google, Continue with GitHub, or Continue with email. Email is passwordless: send the link or code, then show "Check your email". Never show the credential.
- **No passwords in Rabbit Hole v1.** The landing branch's email/password fields must be replaced.
- **The legacy login page** is replaced during the landing and OAuth integration; the underlying passwordless email auth stays.
- **The CLI** keeps its own secure code flow (`rabbit-hole login`), with no shared credential-return shortcuts.
- **Not now:** OAuth, account linking, a users table and `tryrabbithole.dev` callbacks all come after P0-A and P0-B.
