# <PROJECT_NAME>: agent workflow

These rules apply when working on an accepted agent-kit assignment. Existing project rules outside the managed section remain in force.

## Roles and accepted scope

- A worker reads `AGENTS.md` and `.agent-kit-runtime/TASK.md` in its assigned worktree. It does not become the coordinator.
- The coordinator explicitly reads `COORDINATOR.md`. Its interactive chat is separate from worker CLI processes.
- The local `agents/kit/project.json` records tool availability, shared quota pools and the authorized `full-control` profile. It contains no credentials and is not committed.
- Workers have unattended execution permissions. Prompts define behavioral scope; full control is not an operating-system isolation boundary.
- Complete every accepted item, including checks and repairs. Do not stop after a small subtask or ask for routine approval.
- Do not invent additional product goals. Report scope changes, human decisions and unavailable real-machine checks.

## Implementation and TDD

- Use technical English for code, comments, identifiers and commit messages; preserve the project's documentation language.
- Use RED -> GREEN -> REFACTOR for behavior changes. First reproduce a regression with a failing test; then implement and refactor with tests passing.
- Use relevant validation for configuration and documentation. Never invent test or hardware evidence.
- Follow the project's existing stack and conventions. Do not add dependencies unless the accepted task allows them.
- Create `agents/state/CURRENT_STATE_<task-id>.md` first with the accepted checklist. Update it after meaningful checkpoints and commit completed stages.
- Preserve existing changes on handover. Read prior state, commits, diff and repair feedback before editing.

## Ownership and boundaries

- Work only in the assigned worktree and owned paths, plus your task state file. An unowned change becomes a coordinator request.
- Do not merge, push, rebase another branch, edit the main checkout, or discard changes using reset/clean/checkout.
- Do not read, print, copy or commit credential files, `.env` files, access tokens or keys.
- Avoid scanning dependency trees, build output, `.git` internals and binary assets.
- On stop, limit or blockage: leave a checkpoint and precise resume notes. Do not claim completion.
- Finish with the JSON report required by your assignment. `DONE` is subject to runner checks and coordinator review.

## Operating commands

Read `agents/kit/CLI.md`. Start only accepted manifests; use `runner.mjs status` or `watch` for read-only monitoring. Existing legacy round records remain valid historical evidence.
