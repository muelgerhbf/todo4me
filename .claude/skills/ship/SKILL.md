---
name: ship
description: Ship a finished change - review the full diff, run the test suites, then let the github-manager commit and push to the working branch.
---
1. Read `git status` + `git diff` (complete). Check quality, security, architecture; search for secrets. Findings → back to `coder`, abort.
2. Run the relevant test suites from CLAUDE.md (all 4 before merge/release). Failures → back to `coder`, abort.
3. User-visible change? → README section + `/readme-screenshots` if needed.
4. Commission `github-manager`: targeted staging, commit, push to the working branch (not `main`). Report back hashes + URL.
5. Briefly report the result: what changed, tests, commit, push.
