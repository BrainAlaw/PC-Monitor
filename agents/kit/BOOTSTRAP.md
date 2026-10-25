# Bootstrap and upgrade protocol

This checkout uses Claude as coordinator. Read `README.md` and `CLI.md` before changing a target project. The runner is separate from the VS Code chat and uses the explicit `full-control` profile.

1. Confirm the intended project root, git repository, base branch, Git Bash, Node.js 22+, npm and Git identity. Inspect existing rules, manifests, CI and history without reading credentials.
2. Select only tools the user actually wants. Follow README prerequisite, CLI installation and login steps. A GUI extension does not imply a working authenticated CLI. Do not silently install every optional provider.
3. Run `node <kit>/scripts/setup.mjs --project <project> --tools codex,copilot,opencode --profile full-control --install` after the user selects this profile. Add other tools explicitly. Setup preserves custom instruction sections, local account configuration and historical rounds.
4. Inspect installed `AGENTS.md`, `COORDINATOR.md`, `CURRENT_STATE.md`, operational docs and `.gitignore`. Remove contradictory old workflow rules only after reviewing them; never replace unrelated project instructions.
5. Fill actual project checks and real-machine requirements in local `agents/kit/project.json`. Choose an available OpenCode model when selected. Do not invent commands or availability.
6. Run `node agents/kit/scripts/runner.mjs doctor --probe`. This consumes a small real task per distinct worker profile. Require successful read/write/check/commit evidence before qualification. Fix or explicitly remove unavailable tools, not repeated speculative flags.
7. Confirm the GUI coordinator can start a detached local process; managed policy may require a user action in the extension. Do not edit global permissions or report a successful GUI launch without observation.
8. Report changed files and actual preflight results. Let the user review and commit bootstrap files. Setup never commits, merges or pushes automatically.
9. Plan a substantial accepted mission with TDD, ownership lanes, required/reserve packages, checks and integration order. Do not start during bootstrap. After acceptance and a clean checkout, use `runner.mjs start <manifest>`.
10. Show `node agents/kit/scripts/runner.mjs watch` and `bash agents/kit/scripts/watch-round.sh`, explain that Ctrl+C stops the watcher only, and point to `.worktrees/agent-kit/<mission>/REPORT.md` and logs.

Upgrades use the same setup command. The project-local configuration is versioned by format but ignored by Git. Unsupported coordinator/format transitions stop for deliberate migration. Do not remove unfinished worktrees or old state files.
