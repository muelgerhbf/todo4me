---
name: ship
description: Ship a finished change - review the full diff, run the test suites, then let the github-manager commit and push to the working branch.
---
1. `git status` + `git diff` (komplett) lesen. Qualität, Sicherheit, Architektur prüfen; Secrets suchen. Befunde → zurück an `coder`, Abbruch.
2. Relevante Test-Suiten aus CLAUDE.md ausführen (vor Merge/Release alle 4). Fehler → zurück an `coder`, Abbruch.
3. Nutzersichtbare Änderung? → README-Abschnitt + ggf. `/readme-screenshots`.
4. `github-manager` beauftragen: gezielt stagen, Commit, Push auf den Arbeitsbranch (nicht `main`). Hashes + URL zurückmelden.
5. Ergebnis kurz berichten: was geändert, Tests, Commit, Push.
