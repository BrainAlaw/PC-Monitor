# agent-kit 2

The `main` variant uses Claude in VS Code as coordinator, with Codex as the primary worker and optional Copilot, Cursor and OpenCode workers. The `codex-coordinator` branch provides the other coordinator variant.

An accepted mission contains a main and reserve queue for roughly 1–2 hours. A detached Node.js runner dispatches substantial packages, hands over quota-limited work and requests repairs independently of the chat turn. Two Codex worker slots are configured by default, in addition to the coordinator chat. There are no arbitrary changed-line or checklist-size limits.

## Full autopilot

Initialization explicitly authorizes the local `full-control` profile. Worker CLIs run with full unattended permissions and no routine questions. Prompts define ownership and behavior; full control is not an OS isolation boundary. `doctor --probe` verifies actual read, write, command execution and commit permissions in disposable repositories.

The GUI coordinator and CLI workers are separate processes with separate permissions. Optional Claude CLI workers must pass preflight like other tools. Authentication and managed policies cannot be bypassed by a prompt.

## First start on Windows

Install Git for Windows including Git Bash, Node.js 22+ with npm, VS Code and the coordinator extension. Reopen the terminal after prerequisite installation:

```powershell
winget install --exact --id Git.Git
winget install --exact --id OpenJS.NodeJS.LTS
git --version
bash --version
node --version
npm --version
git clone --branch main --single-branch https://github.com/BrainAlaw/agent-kit.git "$env:LOCALAPPDATA\agent-kit-main"
$kitSource = Join-Path $env:LOCALAPPDATA 'agent-kit-main'
Set-Location 'D:\path\to\your-project'
& "$kitSource\scripts\setup.ps1" -Project (Get-Location).Path -Tools 'codex,copilot,opencode' -Install
```

Keep the kit checkout outside the target project; do not copy its `.git` directory. `-Install` installs the selected npm CLIs. Cursor Agent requires the [vendor installer](https://cursor.com/docs/cli/installation); add `cursor` to `-Tools` afterwards and set its actual executable in local `agents/kit/project.json`. Optional tools are not mandatory dependencies.

Log in interactively once:

```powershell
codex login
copilot login
opencode auth login
opencode models
```

Set an available `provider/model` in the OpenCode worker's `model` field, or pass `-OpenCodeModel 'provider/model'` to setup. No free model is assumed available. Sign in to the coordinator extension separately. To use an optional Claude CLI worker, include `claude` in `-Tools` and run `claude auth login`.

Check `git config user.name` and `git config user.email`, then run:

```powershell
node agents/kit/scripts/runner.mjs doctor --probe
```

Probes use the selected accounts' limits and have a three-minute timeout per tool. Doctor reports versions, unsupported flags, authentication failures and actual qualification. Repair failures or remove unavailable workers from local configuration before starting.

Open the target project in VS Code and give the coordinator this instruction:

Select the coordinator extension's bypass-permissions mode before initialization and launch. A worker's full-control flags do not remove restrictions inherited from its parent process; report managed-policy blocks explicitly.

> Read AGENTS.md, COORDINATOR.md and agents/kit/CLI.md. Inspect this project, fill its actual checks and real-machine requirements in agents/kit/project.json, then plan a substantial mission with TDD, ownership lanes and a reserve queue. Do not start until I accept the mission.

Review and commit the installed workflow before starting. Setup does not commit or push. Local account configuration and runtime files are ignored; installed instructions and scripts are versioned.

Install project dependencies using the actual lockfile/documented command. Setup detects existing `node_modules` as a shared dependency input. Lanes changing dependency manifests need an isolated installation in their own worktree.

## Mission and watcher

The coordinator writes a complete manifest using `agents/kit/templates/MISSION.example.json` as the contract example. The example is a small documentation smoke task, not the target mission size. Accept and commit the actual mission so the checkout is clean.

```powershell
node agents/kit/scripts/runner.mjs start agents/missions/feature.json
node agents/kit/scripts/runner.mjs watch
```

The combined read-only watcher also shows historical numeric rounds:

```bash
bash agents/kit/scripts/watch-round.sh
```

Watch is a live tracker: one table per mission with status, runner liveness, elapsed budget, verified count, and per package the lane, status, worker, attempt, repairs, checklist progress and last activity, plus the reason for `NEEDS_REVIEW`/`BLOCKED` and limited pools. It redraws in place every 2 s (also under Git Bash/Cygwin, where the console looks like a pipe); `--plain` appends one view per state change for log files. `--json` restores the raw stream; `status` always prints JSON. Ctrl+C closes monitoring, not the mission. Logs and the final report live under `.worktrees/agent-kit/<mission>/`. Legacy `status.sh <NN> <agent...>` and `run-agent.sh <NN> <agent>` remain available after upgrading configuration.

```powershell
node agents/kit/scripts/runner.mjs status
node agents/kit/scripts/runner.mjs pause feature
node agents/kit/scripts/runner.mjs resume feature
node agents/kit/scripts/runner.mjs stop feature
```

Pause stops new dispatch and allows checkpoint time. Stop terminates processes while preserving files. Resume explicitly grants another time window for the same accepted scope. After a runner crash, existing attempt supervisors are observed rather than duplicated.

## Validation, limits and integration

- Behavior changes follow RED → GREEN → REFACTOR. Regression fixes begin with a reproducing test. Documentation/configuration use appropriate validation.
- A successful process and `DONE` report are insufficient: the runner checks evidence, ownership and declared commands. Failed checks trigger repairs; two unsuccessful repair cycles escalate to coordinator review.
- Limits disable the shared account pool, including both Codex slots. A suitable available worker resumes the same branch and dirty files. No periodic paid PONG probes run; unknown reset times use a one-hour cooldown and at most one recovery attempt per mission.
- `WAITING_INTEGRATION` requires cross-branch integration; `WAITING_CAPACITY` requires an available worker; `NEEDS_REVIEW` requires review. `VERIFIED` means declared checks passed, not human acceptance.
- Freebuff is a manual last resort. After user acceptance the coordinator merges, validates integration and repairs regressions. Push requires an explicit instruction. Real-machine evidence remains unverified until actually observed.

## Upgrade and Linux/macOS

Update the kit checkout and rerun setup with the same coordinator, tools and `full-control` profile. Managed instruction sections are replaced; local rules outside them, account settings, project state and round history are preserved. Review conflicting pre-v2 instructions manually. Changing coordinator requires a deliberate migration.

On Linux/macOS install Git, Bash and Node.js 22+ using the platform package manager, then run:

```bash
node /path/to/agent-kit/scripts/setup.mjs --project /path/to/project --tools codex,copilot,opencode --profile full-control --install
node agents/kit/scripts/runner.mjs doctor --probe
node agents/kit/scripts/runner.mjs watch
```

See [CLI.md](CLI.md) for the contract and troubleshooting, and [BOOTSTRAP.md](BOOTSTRAP.md) for coordinator setup. Run `npm test` and `npm run check` to validate the kit. Fake-CLI tests do not establish real provider, IDE or platform acceptance.
