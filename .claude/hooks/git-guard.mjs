// PreToolUse guard: blocks destructive git/gh commands, asks for protected actions.
let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let cmd = '';
  try { cmd = JSON.parse(raw).tool_input?.command || ''; } catch { process.exit(0); }
  const deny = [
    [/\bgit\s+push\b[^\n;|&]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/, 'Force-Push ist verboten.'],
    [/\bgit\s+push\b[^\n;|&]*(\s--delete\b|\s-d\b|\s:\S)/, 'Remote-Branch/Tag löschen nur manuell durch den Nutzer.'],
    [/\bgit\s+reset\s+--hard\b/, 'git reset --hard ist ohne Freigabe verboten.'],
    [/\bgit\s+clean\s+-\w*f/, 'git clean -f ist ohne Freigabe verboten.'],
    [/\bgh\s+repo\s+delete\b/, 'Repo löschen ist verboten.'],
    [/\bgh\s+release\s+delete\b/, 'Release löschen nur manuell durch den Nutzer.'],
  ];
  const ask = [
    [/\bgit\s+push\b[^\n;|&]*\b(main|master)\b/, 'Push auf geschützten Branch main.'],
    [/\bgit\s+push\b[^\n;|&]*(--tags\b|\brefs\/tags\/|\s(windows-)?v\d+\.\d+)/, 'Tag-Push.'],
    [/\bgh\s+release\s+(create|edit)\b/, 'GitHub-Release.'],
    [/\bgh\s+repo\s+(edit|create)\b/, 'Repo-Einstellungen/Sichtbarkeit.'],
    [/\bgh\s+pr\s+merge\b/, 'PR-Merge.'],
    [/\bnpm\s+run\s+release\b/, 'Release-Upload.'],
  ];
  const out = (decision, reason) => {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } }));
    process.exit(0);
  };
  for (const [re, why] of deny) if (re.test(cmd)) out('deny', why);
  for (const [re, why] of ask) if (re.test(cmd)) out('ask', why);
  process.exit(0);
});
