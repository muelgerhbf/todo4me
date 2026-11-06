# Agent System – Guide

This project uses four roles in Claude Code. You only ever talk to the main session; it distributes the work.

| Role | Defined in | Model | May |
|---|---|---|---|
| **Main Agent – Technical Lead** | `CLAUDE.md` (the main session itself) | your configured model (`/model`) | plan, delegate, review the diff, approve |
| **Researcher** | `.claude/agents/researcher.md` | Haiku | read only + web research |
| **Coder** | `.claude/agents/coder.md` | Sonnet | change code, run tests – **no** commit/push |
| **GitHub Manager** | `.claude/agents/github-manager.md` | Sonnet | commit, push, PR, tags, releases, CHANGELOG, README, screenshots |

> New or changed agent files are only loaded after **restarting Claude Code**. Use `/agents` to see which ones are active.

## How to give tasks

Just describe what you want in plain language – the main session decides whom to use:

- *"Build a CSV export function."* → Researcher (if needed) → plan → Coder → review + tests → GitHub Manager pushes to `feature/…`.
- *"Why does the calendar crash on import? Research it."* → Researcher, result with sources and feature suggestions.
- *"Update the screenshots in the README."* → GitHub Manager (`/readme-screenshots`).
- *"Make a release of 2.2.0."* → GitHub Manager, **only** on your explicit request.

To address a specific agent directly: *"Have the Researcher check …"* or `@researcher …`.

## Workflow for every development task

1. Analysis → 2. Research (if needed) → 3. Plan → 4. Coder implements on its own branch
5. Main Agent reviews the complete diff → 6. Tests (4 suites, see `CLAUDE.md`) → 7. Errors go back to the Coder
8. GitHub Manager: commit + **automatic push to the feature branch** → 9. README/screenshots for visible changes → 10. Report to you

## Skills (shortcuts)

- `/ship` – review → tests → commit/push of the current state.
- `/readme-screenshots` – real screenshots of the running app (sample data) to `docs/screenshots/` and into the README.

## Safety rules (technically enforced)

`.claude/hooks/git-guard.mjs` checks every shell command:

| Action | Behavior |
|---|---|
| Force push, `reset --hard`, `git clean -f`, deleting remote branches/tags/repo/releases | **blocked** |
| Push to `main`, tag push, `gh release create/edit`, `gh repo edit/create`, PR merge, `npm run release` | **asks you first** |
| Push to `feature/*`, `fix/*`, `chore/*`, `test/*` | allowed |

`.claude/settings.json` additionally blocks `.env`, key files and the real data folder `%APPDATA%\Todo4Me`.

## One-time setup

- GitHub CLI: installed (`gh`). Log in: `gh auth login` (GitHub.com → HTTPS → browser).
- Check: `gh auth status`.

## Tips for saving tokens

- Request small changes directly ("change text X in Y") – no agent is started for that.
- Use Haiku for research; for hard questions say "research thoroughly" (then Sonnet).
- Keep `CLAUDE.md` short; details belong in the agent files or skills.
