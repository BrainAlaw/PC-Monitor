# Current state: mk-dashboard-theme

## Accepted checklist
- [x] Read repository and assignment instructions, README/docs, and runtime control state.
- [x] Add regression-first theme tests for MK tokens, local font URLs, remote resource absence, and embedded detection.
- [x] Implement MK theme, bundled local fonts, chart token colors, and responsive embedded mode in owned paths only.
- [x] Run required UI typecheck, Vitest, and .NET tests; record any unavailable checks honestly.
- [x] Review owned-path diff, write agent-kit result JSON, and commit completed work on this branch.

## Checkpoint
All requested implementation and checks are complete. `npm --prefix ui run typecheck` passed; `npm --prefix ui test` passed (101 tests); `dotnet test tests/PCMonitor.Tests -c Release` passed (79 tests) and invoked Vite production build, which bundled both local WOFF2 files in `wwwroot`. `git diff --check` passed. There is no project mock data mode, so no mock-data screenshot or visual browser check was performed. `THIRD_PARTY_NOTICES.md` is outside lane ownership; coordinator request includes the JetBrains Mono copyright/OFL notice and asks them to preserve the full OFL terms there.
