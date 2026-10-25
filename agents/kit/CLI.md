# Runtime contract and troubleshooting

This branch uses Claude in the coordinator chat. Installed operational documentation lives in `agents/kit/`. All commands below run from the target project's root.

## Full-control execution

`setup.mjs --profile full-control` explicitly authorizes unattended workers for this project. Its local `project.json` records workers, pool names, executable paths, optional models and successful qualification. It never stores credentials. Worker commands use argument arrays, not interpolated shell prompts.

| Tool | Execution flags |
|---|---|
| Codex | `exec --dangerously-bypass-approvals-and-sandbox --json` |
| Claude, optional worker | `--print --dangerously-skip-permissions --output-format stream-json --verbose` |
| Copilot | `--autopilot --allow-all --no-ask-user --max-autopilot-continues 20 -p` |
| Cursor | `-p --force --trust --sandbox disabled --approve-mcps --output-format stream-json` |
| OpenCode | `run --auto --format json`, explicit model, invocation-local allow permissions |

Full control does not override authentication, explicit deny rules or organization policy. Doctor checks installed flags and performs a real bounded task; it never assumes a flag means success. Full access is not OS isolation. Worker behavior still forbids reading credentials, editing other worktrees, merging or pushing.

## Initialization and health

```bash
node /path/to/kit/scripts/setup.mjs --project /path/to/project --tools codex,copilot,opencode --profile full-control --install
node agents/kit/scripts/runner.mjs doctor
node agents/kit/scripts/runner.mjs doctor --probe
```

`doctor` reads tool versions, flags and local readiness. `--probe` also creates disposable repositories, asks each distinct worker profile to read/write/run/commit, stores evidence and qualifies only actual successes. Probes have a three-minute timeout and consume account limits. Changed CLI versions require requalification. Accounts remain in the tools' own credential stores.

`workers` entries have `id`, `tool`, `pool`, `command`, optional `model`, and doctor-managed `qualification`. Set the same `pool` for workers sharing the same quota, even across tool names. Two default Codex workers share `codex`. Choose only tools available on this machine. `prefixArgs` and `env` are local advanced adapter settings, never supplied by a task manifest.

`project.linkDirs` lists existing ignored dependency directories to expose through junctions/symlinks in worktrees. Setup detects an existing `node_modules`. Workers treat these links as read-only inputs. Lanes owning package/lockfile changes do not share them and need accepted installation instructions for isolated dependencies. Before removing a merged lane, unlink dependency junctions with `worktree-link.mjs remove <source> <link>`; never recursively remove a linked dependency source.

## Mission schema (version 2)

See `templates/MISSION.example.json`. Required fields: `version: 2`, safe `id`, `base` git ref and nonempty `tasks`. Defaults: `budgetMinutes: 120`, `attemptMinutes: 60`, `graceMinutes: 10`.

Each task has:

- Stable `id` and ownership `lane`, independent of tool identity.
- Complete `prompt` and nonempty measurable `acceptance` strings.
- `owned`: relative exact files or directory prefixes. No globs, absolute paths, traversal, `.git` or runtime ownership.
- `workers`: allowed tool names in preference order; only explicitly compatible replacements may run the task.
- Optional `dependsOn`: task ids. Same-lane packages are sequential; cross-lane dependencies remain `WAITING_INTEGRATION` after their prerequisite is verified.
- Nonempty `checks`: `{ "command": "node", "args": ["--test"], "timeoutMs": 300000 }`. The accepted manifest authorizes these exact executable checks. Commands run with full local access, so review them before accepting.

All required and reserve tasks are inside the accepted manifest. Ownership may repeat within a lane; it cannot overlap another lane. The base checkout must be clean and the bootstrap committed. The runner never auto-commits target changes or merges. Worktrees use `mission/<mission>/<lane>` branches.

## Commands and monitoring

```bash
node agents/kit/scripts/runner.mjs start agents/missions/feature.json
node agents/kit/scripts/runner.mjs status
node agents/kit/scripts/runner.mjs watch
bash agents/kit/scripts/watch-round.sh
node agents/kit/scripts/runner.mjs pause feature
node agents/kit/scripts/runner.mjs resume feature
node agents/kit/scripts/runner.mjs stop feature
```

Start detaches the runner and checks its launch. One scheduler per project serializes shared pool/worker allocation; place independent packages in one mission. Watch is read-only, includes final states and does not generate prompts, probes or provider calls. It renders a live tracker (in-place redraw by default, `--plain` appends one view per state change, `NO_COLOR` honoured); `watch --json` and `status` print the JSON rows from `scripts/lib/rows.mjs`. A package that passed its checks but reports `unverified` items is `NEEDS_REVIEW` with feedback `UNVERIFIED: ...`. Ctrl+C only closes watch. `status` reports if the runner PID is still alive.

OpenCode workers run `opencode run --standalone`: without it the CLI attaches to its shared background service, which keeps the directory it was first started in, and a worker edits that checkout instead of its worktree. Every worker also receives `PWD` equal to its worktree.

Pause stops new assignments, gives checkpoint grace, then preserves unfinished work. Stop terminates active process trees. Resume grants a new budget for the unchanged manifest; use a new id for changed scope. Attempt supervisors survive chat/runner exit and persist their own result. The restarted runner observes them before reassigning a lane.

Logs: `.worktrees/agent-kit/<mission>/runner.log`, `state.json`, `mission.json`, `REPORT.md`, and `attempts/<task>/<attempt>/agent.log`, check logs and exit metadata. Per-worktree `.agent-kit-runtime/TASK.md` contains the published assignment and repair feedback. Never delete these files to hide an error.

## Results, repairs and quota

- `READY`, `RUNNING`, `VERIFYING`: active package lifecycle.
- `VERIFIED`: report and declared checks passed; coordinator review is still required.
- `WAITING_DEPENDENCY`, `WAITING_INTEGRATION`, `WAITING_CAPACITY`: distinct reasons dispatch cannot proceed.
- `NEEDS_REVIEW`, `BLOCKED`: escalation, unverified evidence or ownership/scope issue.
- `PAUSED`, mission `STOPPED` or `BUDGET_EXHAUSTED`: preserved incomplete work.

The assignment specifies a JSON result with `status`, `summary`, per-criterion evidence, `unverified` and `resumeNotes`. Missing reports, missing evidence and failed checks generate repair feedback. Two unsuccessful repair cycles escalate; ownership violations stop immediately. Checks run again after repairs. Workers follow TDD; the coordinator reviews the evidence rather than trusting a status string.

Quota failures disable the shared pool. Suitable free tools inherit the same branch and dirty changes after the old process exits. Unknown reset times use a one-hour cooldown and at most one recovery attempt in a mission; a second limit disables that pool for the rest of the mission. For a known reset, the coordinator may update `until` (Unix milliseconds) in `.worktrees/agent-kit/pools.json` only while the runner is stopped. Scheduled `limit-probe.sh` is now a no-op and never sends PONG. Remove old scheduler entries if installed.

Freebuff has no automated launcher. When no suitable tools remain, the report exposes capacity failure; manually paste the current task in that worktree and record it with `manual-run.sh`. Stop/pause automated execution before a manual takeover. Existing numeric-round manual records remain visible in the combined watcher.

## Integration and recovery

After user acceptance the coordinator reviews lane diffs, commits, dirty files, ownership and actual check results, merges in the planned order with `--no-ff`, runs project integration checks and repairs regressions using TDD. It records missing GUI/hardware evidence. Push requires an explicit instruction. Never remove dirty or unmerged worktrees.

For `AUTH`, log in to the reported CLI. For `CONFIG`, check executable/version/model. For `PERMISSION`, inspect the actual deny or managed policy; do not endlessly change flags. Network errors get one retry; other failures use compatible replacement or review. A quiet agent is not automatically hung. An exit code of zero is not proof of completion.

Legacy `run-agent.sh <NN> <agent>` uses the same full-control adapter after preflight and preserves appended attempt logs; new queueing and automatic repairs require a v2 mission. Legacy `status.sh <NN> <agent...>`, worktree commands and manual-run records remain supported. Legacy token collection remains available through `token-usage.sh`; unknown measurements are never presented as zero.
