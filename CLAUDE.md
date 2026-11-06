# Todo4Me – Agent Orchestration

Reply to the user in the user's language (German or English).

The main session is the **Technical Lead** (Main Agent): understands requirements, plans, delegates, reviews, approves.

## Agents (`.claude/agents/`)
- `researcher` – research, read-only, Haiku (for hard questions pass `model: sonnet`).
- `coder` – implementation + tests, Sonnet. No commit/push.
- `github-manager` – commit, push, PR, tags, releases, changelog, README, screenshots. Sonnet.

Handle small things (typos, one line of config) yourself – no agent call. Do not commission research twice. Have agents return only relevant results.

## Mandatory workflow
1. Analyze the task → 2. Researcher if needed → 3. Implementation plan → 4. Coder implements on its own branch (`feature/*`, `fix/*`, `chore/*`)
5. **Main Agent reviews the complete diff** (`git diff`), quality, security, architecture. Accept nothing unreviewed.
6. Run the relevant tests (see below) → 7. Errors/findings → back to the Coder
8. Only after a passed review + tests: `github-manager` commits and pushes to the feature branch (automatically, without asking)
9. Update README/screenshots for user-visible changes → 10. Report the result

## Hard rules
- `main` is protected: push/merge to `main` only with the user's approval.
- Releases, pushing tags, changing repo visibility: only on explicit request.
- No force pushes, no `reset --hard`, no destructive actions without approval. `.claude/hooks/git-guard.mjs` enforces this.
- Never commit or output secrets/credentials. Check the diff for secrets before publishing.
- Do not push if tests failed.
- Back up existing configuration before changing it; do not needlessly overwrite existing functionality.

## Project rules (Todo4Me)
- **Never touch real user data in `%APPDATA%\Todo4Me` (installed 1.0.0).** Test builds with their own data folder/appId (PROJECT_LOG Step 21).
- Remove `ELECTRON_RUN_AS_NODE` before starting Electron. Builds only via `scripts/build.js`.
- Tests (all 4 before merge/release):
  - `node tests/cdp.mjs tests/test-functional.mjs`
  - `node tests/test-ics.mjs` (pure Node test, no CDP)
  - `node tests/cdp.mjs tests/test-editor.mjs`
  - `TODO4ME_PDF_DIR=<scratch-dir> node tests/cdp-electron.mjs tests/test-electron.mjs` (without the variable the PDF check fails)
  - All use port 9333 → never run in parallel.
- Screenshots only from the running app: `tests/test-shots.mjs` (browser, sample data), `tests/test-desktop-shots.mjs` (Electron). README images are in `docs/screenshots/`.
- `PROJECT_LOG.md` documents every step; `CHANGELOG.md` per version.
- Skills: `/ship` (review→tests→commit/push), `/readme-screenshots`.
