## Validation Policy (Persistent)

After every code modification, always run:

1. `npm run build`
2. `npm run test`
3. CLI smoke test:
   `printf 'status\nd\ntick 500 wait\nquit\n' | npm run play:cli`

Rules:
- Do not consider the task complete until all three steps have been executed.
- Always report pass/fail status.
- If a step fails, report which command failed.

## Language Policy (Persistent)

- All user-facing text in the game and editor must be in English.
