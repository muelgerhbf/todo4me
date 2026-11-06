# Agenten-System – Anleitung

Dieses Projekt nutzt in Claude Code vier Rollen. Du sprichst immer nur mit der Hauptsitzung; sie verteilt die Arbeit.

| Rolle | Wo definiert | Modell | Darf |
|---|---|---|---|
| **Main Agent – Technical Lead** | `CLAUDE.md` (die Hauptsitzung selbst) | dein eingestelltes Modell (`/model`) | planen, delegieren, Diff reviewen, freigeben |
| **Researcher** | `.claude/agents/researcher.md` | Haiku | nur lesen + Web-Recherche |
| **Coder** | `.claude/agents/coder.md` | Sonnet | Code ändern, Tests ausführen – **kein** Commit/Push |
| **GitHub Manager** | `.claude/agents/github-manager.md` | Sonnet | Commit, Push, PR, Tags, Releases, CHANGELOG, README, Screenshots |

> Neue oder geänderte Agentendateien werden erst nach einem **Neustart von Claude Code** geladen. Mit `/agents` siehst du, welche aktiv sind.

## So gibst du Aufträge

Einfach normal beschreiben, was du willst – die Hauptsitzung entscheidet, wen sie einsetzt:

- *„Baue eine Export-Funktion als CSV.“* → Researcher (falls nötig) → Plan → Coder → Review + Tests → GitHub Manager pusht auf `feature/…`.
- *„Warum stürzt der Kalender beim Import ab? Recherchiere.“* → Researcher, Ergebnis mit Quellen und Feature-Vorschlägen.
- *„Aktualisiere die Screenshots in der README.“* → GitHub Manager (`/readme-screenshots`).
- *„Mach ein Release von 2.2.0.“* → GitHub Manager, **nur** auf deinen ausdrücklichen Auftrag.

Einen bestimmten Agenten direkt ansprechen: *„Lass den Researcher … prüfen“* oder `@researcher …`.

## Ablauf bei jeder Entwicklungsaufgabe

1. Analyse → 2. Recherche (bei Bedarf) → 3. Plan → 4. Coder implementiert auf eigenem Branch
5. Main Agent prüft den kompletten Diff → 6. Tests (4 Suiten, siehe `CLAUDE.md`) → 7. Fehler zurück an den Coder
8. GitHub Manager: Commit + **automatischer Push auf den Feature-Branch** → 9. README/Screenshots bei sichtbaren Änderungen → 10. Bericht an dich

## Skills (Kurzbefehle)

- `/ship` – Review → Tests → Commit/Push des aktuellen Stands.
- `/readme-screenshots` – echte Screenshots der laufenden App (Beispieldaten) nach `docs/screenshots/` und in die README.

## Sicherheitsregeln (technisch erzwungen)

`.claude/hooks/git-guard.mjs` prüft jeden Shell-Befehl:

| Aktion | Verhalten |
|---|---|
| Force-Push, `reset --hard`, `git clean -f`, Remote-Branch/Tag/Repo/Release löschen | **blockiert** |
| Push auf `main`, Tag-Push, `gh release create/edit`, `gh repo edit/create`, PR-Merge, `npm run release` | **Rückfrage an dich** |
| Push auf `feature/*`, `fix/*`, `chore/*`, `test/*` | erlaubt |

`.claude/settings.json` sperrt außerdem `.env`, Schlüsseldateien und den echten Datenordner `%APPDATA%\Todo4Me`.

## Einmalige Einrichtung

- GitHub CLI: installiert (`gh`). Anmelden: `gh auth login` (GitHub.com → HTTPS → Browser).
- Prüfen: `gh auth status`.

## Tipps zum Token-Sparen

- Kleine Änderungen direkt beauftragen („ändere Text X in Y“) – dafür wird kein Agent gestartet.
- Für Recherche Haiku; bei schwierigen Fragen „gründlich recherchieren“ sagen (dann Sonnet).
- `CLAUDE.md` kurz halten; Details gehören in die Agentendateien oder Skills.
