# Repository Guide for Coding Agents

These instructions apply to the whole repository. Keep changes focused, preserve existing user changes, and verify behavior at the layer being changed.

## Product and Platform

PC Monitor is a Windows 10/11 x64 desktop application that collects hardware telemetry and displays it in a dashboard. The shipped product is a self-contained, single-file `PCMonitor.exe`; the dashboard is built from TypeScript and embedded in that executable. It uses LibreHardwareMonitor for sensor access, Kestrel for the local HTTP API, WinForms for the tray/window lifecycle, and WebView2 for the native dashboard window.

The app may require elevation for full sensor coverage. Without it, it is expected to run in a degraded state. Do not make the application depend at runtime on Node.js, a separately installed .NET runtime, a separate LibreHardwareMonitor process, or a remotely hosted dashboard.

## Repository Map

- `src/PCMonitor/` — .NET 10 Windows Forms application.
  - `Program.cs` — single-instance startup, settings, telemetry and server lifetime, WebView2/browser fallback.
  - `Telemetry/` — hardware-source adapter, polling collector, immutable snapshot model, sensor metadata, volume mapping, tray summary.
  - `Server/` — Kestrel host, API routes, embedded UI provider, access policy.
  - `Settings/` — persisted settings and validation/normalization.
  - `Infra/` — paths, logging, elevation, autostart, firewall, process and LAN helpers.
  - `Ui/` — WinForms dashboard window and tray application context.
  - `wwwroot/` — generated Vite output embedded at build time; ignored by Git. Edit the source in `ui/`, not generated files here.
- `ui/` — TypeScript dashboard, Vite configuration, and Vitest tests in `src/**/*.test.ts`.
  - `src/views/` — overview, CPU, GPU, network, power, storage, and raw-sensor views.
  - Other `src/` modules cover the API stream, model/history, settings/preferences, alerts, DOM helpers, formatting, and window chrome.
- `tests/PCMonitor.Tests/` — xUnit tests for backend behavior and HTTP integration.
- `tools/` — PowerShell smoke test and telemetry comparison helper.
- `installer/PCMonitor.iss` — Inno Setup installer definition; expects `publish/PCMonitor.exe`.
- `.github/workflows/` — Windows CI and tag-based release workflows.
- `README.md` — user-facing installation, settings, LAN access, API, development, and known limitations.

## Architecture and Data Flow

1. `Program` loads `SettingsStore`, determines elevation, and creates one `TelemetryCollector`.
2. `LhmHardwareSource` adapts LibreHardwareMonitor into the library-independent raw hardware model. Slow devices (including storage) are updated on a background slow lane so they do not hold up every fast polling tick.
3. `TelemetryCollector` owns the polling loop and publishes immutable, versioned snapshots plus health state. HTTP and tray consumers read the published data; they do not poll hardware themselves. Volume information is refreshed asynchronously and less frequently than sensors.
4. `SnapshotBuilder` filters non-finite values, sorts devices/sensors deterministically, assigns group/unit/precision metadata, and creates the API snapshot.
5. `DashboardHost` serves the embedded static UI and maps `/api/*`. The UI consumes snapshots and health over server-sent events; it does not access hardware directly.
6. `TrayContext` and `DashboardForm` manage the system tray and WebView2 window. The default browser is a supported fallback if WebView2 is unavailable.

Keep these ownership boundaries intact. Inject hardware/system side effects where the existing tests do so; prefer pure transformations for conversion and policy logic.

## Build, Test, and Development

Prerequisites: .NET 10 SDK, Node.js 22+, Windows for the application, Windows-specific integration behavior, installer, and smoke test. `dotnet build`/`publish` invokes the UI build unless `SkipUiBuild=true`; the build target runs `npm ci` when `ui/node_modules` is absent and then runs the Vite build.

From the repository root in PowerShell:

```powershell
Push-Location ui
npm ci
npm run typecheck
npm test
Pop-Location

dotnet test tests\PCMonitor.Tests -c Release
dotnet publish src\PCMonitor -c Release -o publish
```

For dashboard iteration, run `npm run dev` from `ui`; Vite proxies `/api` to a running app on `127.0.0.1:8096`. To test the built standalone app on hardware, run:

```powershell
.\tools\smoke-test.ps1 -ExePath .\publish\PCMonitor.exe
```

The smoke test starts the executable, checks health/snapshot/UI and process behavior, and expects elevation unless `-AllowNonElevated` is supplied. `tools\compare-telemetry.ps1` compares sensor identifiers/coverage and selected readings against a LibreHardwareMonitor endpoint; it is a diagnostic helper, not a unit test.

Run the focused UI test file(s) for UI behavior changes and the relevant xUnit tests for backend changes; run both suites when changing the API contract or end-to-end behavior. CI runs UI typecheck/tests and `dotnet test` on Windows. Tests and builds may create ignored generated output under `ui/node_modules/`, `src/PCMonitor/wwwroot/`, `bin/`, and `obj/`; do not commit generated artifacts.

## Engineering Conventions

### .NET

- Target `net10.0-windows`, WinForms, nullable reference types, and implicit usings are enabled. Preserve nullability and use the established C# types and records rather than weakening checks.
- Keep hardware-library types inside the hardware adapter (`Telemetry/LhmHardwareSource.cs`); use the `IHardwareSource`, `RawHardware`, and `RawSensor` boundary elsewhere.
- Keep published telemetry immutable and deterministic. Update sensor metadata and snapshot tests when changing units, precision, filtering, sorting, or payload fields.
- Keep slow or blocking hardware/WMI work off the sampling/UI request path. Preserve collector reset/retry and shutdown behavior.
- Use injected `SystemActions`/source factories and temporary settings paths in tests rather than invoking real machine configuration side effects.

### TypeScript and UI

- `ui/tsconfig.json` enables strict checking, `noUncheckedIndexedAccess`, and unused-local/parameter checks. Do not add `any` or weaken compiler options to silence errors.
- Keep rendering and UI state in the existing modules/views; preserve accessible, escaped/safe DOM construction patterns and existing formatting/scoring helpers.
- The UI is a static build. Vite writes to `src/PCMonitor/wwwroot/`, with stable asset names because the app embeds and serves those files. Change the Vite output contract only together with the embedding/server and smoke-test expectations.
- Add or update colocated `*.test.ts` tests using the existing Vitest conventions (`npm test`).

### Cross-cutting behavior

- Treat `README.md` as the user-facing source for runtime behavior and update it when a code change affects installation, settings, API, LAN access, limitations, or development workflows.
- Preserve existing defaults and compatibility unless the requested change explicitly alters them. For an API/schema change, update backend tests and the UI types/consumer/tests together.
- Surface failures through the repository's established logging or user-visible error behavior. Do not hide new errors behind broad catches or silent success-shaped fallbacks.
- Keep changes surgical. Do not reformat unrelated code or overwrite generated/ignored output as a substitute for editing source.

## Security-Sensitive Invariants

- The HTTP server binds to loopback by default. The access middleware validates the `Host` and port to mitigate DNS rebinding.
- LAN mode is opt-in, binds beyond loopback, is restricted to private-network clients and LAN hostnames/addresses, and requires a random access token. Token comparisons use fixed-time comparison. Settings routes are local-only; settings writes require same-origin JSON and validate input size/ranges.
- LAN traffic is HTTP, not TLS. Do not describe it as secure on untrusted networks or silently broaden access. Preserve token handling, cookie protections, firewall behavior, and default-deny decisions.
- Do not log access tokens, embed secrets, or expose the LAN token to remote dashboard viewers.
- The application invokes Windows-level operations for elevation-sensitive hardware, firewall rules, and scheduled-task autostart. Keep those operations explicit and test through injected actions instead of executing them during ordinary tests.

## API and Build Contracts

- `GET /api/snapshot` returns the latest snapshot (or `503` while startup has not produced one).
- `GET /api/health` reports health/elevation/count/error/update/port/version state.
- `GET /api/stream` emits `snapshot` and changed `health` SSE events, plus heartbeat comments.
- `GET/PUT /api/settings` serves and updates supported local settings; LAN viewers cannot administer settings.
- Sensor values are numeric values in the declared `unit`; throughput stays in bytes per second (`B/s`). Keep backend records, JSON casing, UI types, README, and tests aligned.
- The default port is `8096`; a busy port falls forward to another available port. `PORT` overrides the port for the current run and is not persisted. Changing the port or LAN binding may require restart.
- The release workflow is triggered by pushing a `v*` tag. It tests, publishes the self-contained executable, builds the Inno Setup installer and portable ZIP, and generates SHA-256 checksums. Keep the app version, installer inputs, and release packaging coherent.

## Before Finishing a Change

1. Inspect the affected implementation, tests, and relevant README section before editing.
2. Update the narrowest relevant tests and documentation alongside behavior changes.
3. Run the smallest meaningful validation command(s); report clearly if a Windows-only or hardware-dependent check could not run.
4. Review the final diff and ensure unrelated working-tree changes and generated files remain untouched.

<!-- agent-kit:start -->
# pc-monitor: agent workflow

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
<!-- agent-kit:end -->
