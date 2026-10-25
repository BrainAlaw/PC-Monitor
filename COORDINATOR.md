<!-- agent-kit:start -->
# pc-monitor: coordinator procedure

Read `AGENTS.md`, `CURRENT_STATE.md` and `agents/kit/CLI.md`. You are the coordinator only when the user assigns that role.

## Bootstrap and preflight

1. Inspect project manifests, CI, architecture and existing rules. Fill `project.checks` and `project.realMachine` in the local configuration using actual commands and requirements. Ask only about facts that cannot be discovered.
2. Run `doctor --probe` for configured CLI workers. Treat missing authentication, unsupported flags and managed-policy refusals as explicit unavailable tools. Do not repeatedly repair launches or quietly do everyone's work yourself.
3. Keep the GUI coordinator separate from worker processes. Start the runner in the project root after bootstrap files have been reviewed and committed. Do not assume GUI permissions configure its child CLIs.

## Plan a substantial mission

1. Translate the accepted goal into coherent deliverables, acceptance criteria, TDD cases, integration order and real-machine requirements.
2. Prepare the main queue and a reserve queue within the same approved scope. Estimate 1-2 hours of useful work without padding.
3. Give Codex substantial analysis and implementation from the start. Configure two worker slots by default, in addition to this chat. Smaller tools receive several successive fully specified packages suited to their capabilities.
4. Write a version-2 JSON mission using the installed example as a shape reference. All required and reserve tasks are explicitly accepted. Every task has owned paths, checks and allowed tools, ordered by preference.
5. Give each ownership lane an exclusive set of paths for the mission. Same-lane dependencies run sequentially. Cross-lane dependencies require user-approved integration and remain `WAITING_INTEGRATION` meanwhile.
6. Include complete prompts, interfaces to preserve, edge cases, check arguments and stop conditions. Do not impose arbitrary line/file/checklist-size caps.
7. Present the mission and request acceptance once. On acceptance, start the runner; it publishes prompts, makes worktrees, dispatches and repairs autonomously. Tell the user the watcher command and log directory.

## Review and integration

- While work runs, inspect read-only status as needed. The runner may repair completed packages without waiting for the whole mission. Never merge an active lane.
- `VERIFIED` means declared checks passed, not that you reviewed the code. Review every package, acceptance report, attempts, changed paths, commits, dirty changes and unverified requirements.
- After two unsuccessful repair cycles, resolve the specific escalation. Reassign only to qualified tools allowed by the task; do not create an endless repair loop.
- Report what is ready, blocked, awaiting integration or awaiting a real-machine check. Ask for user acceptance before merging.
- After acceptance, merge lanes with `git merge --no-ff` in the planned order. Preserve both sides' intent. Run project integration checks and the app where applicable.
- Reproduce and repair integration regressions using TDD. Run real-device/display checks when available; otherwise record the exact missing evidence.
- Update `CURRENT_STATE.md`. Remove only reviewed, clean, merged worktrees. Never auto-delete partial work. Push only when explicitly requested.
- Background CLI work continues independently, but this chat cannot promise to wake up or report between turns. The runner stores a final report; return to this chat for review.
<!-- agent-kit:end -->
