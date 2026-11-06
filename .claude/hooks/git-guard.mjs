// PreToolUse guard: blocks destructive git/gh commands, asks for protected actions.
let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let cmd = '';
  try { cmd = JSON.parse(raw).tool_input?.command || ''; } catch { process.exit(0); }
  const deny = [
    [/\bgit\s+push\b[^\n;|&]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/, 'Force push is forbidden.'],
    [/\bgit\s+push\b[^\n;|&]*(\s--delete\b|\s-d\b|\s:\S)/, 'Deleting remote branches/tags is only allowed manually by the user.'],
    [/\bgit\s+reset\s+--hard\b/, 'git reset --hard is forbidden without approval.'],
    [/\bgit\s+clean\s+-\w*f/, 'git clean -f is forbidden without approval.'],
    [/\bgh\s+repo\s+delete\b/, 'Deleting the repo is forbidden.'],
    [/\bgh\s+release\s+delete\b/, 'Deleting a release is only allowed manually by the user.'],
  ];
  const ask = [
    [/\bgit\s+push\b[^\n;|&]*\b(main|master)\b/, 'Push to protected branch main.'],
    [/\bgit\s+push\b[^\n;|&]*(--tags\b|\brefs\/tags\/|\s(windows-)?v\d+\.\d+)/, 'Tag push.'],
    [/\bgh\s+release\s+(create|edit)\b/, 'GitHub release.'],
    [/\bgh\s+repo\s+(edit|create)\b/, 'Repo settings/visibility.'],
    [/\bgh\s+pr\s+merge\b/, 'PR merge.'],
    [/\bnpm\s+run\s+release\b/, 'Release upload.'],
  ];
  const out = (decision, reason) => {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } }));
    process.exit(0);
  };
  for (const [re, why] of deny) if (re.test(cmd)) out('deny', why);
  for (const [re, why] of ask) if (re.test(cmd)) out('ask', why);
  process.exit(0);
});
