# PC Monitor — Claude Code Instructions

Apply this guide to work in this repository. `AGENTS.md` is the companion project guide with the full component map, commands, conventions, API contracts, and security invariants; follow both and keep them consistent when project-wide practices change.

## Project at a Glance

PC Monitor is a Windows 10/11 x64 hardware-monitoring desktop app. The release is a self-contained single-file executable. It combines:

- A .NET 10 Windows Forms host and tray app under `src/PCMonitor/`.
- A Kestrel server that serves an embedded dashboard and local telemetry/settings API.
- A TypeScript/Vite dashboard sourced from `ui/`; Vite builds it into ignored `src/PCMonitor/wwwroot/`, then MSBuild embeds it into the executable.
- LibreHardwareMonitor for hardware access; WebView2 for the native dashboard window, with default-browser fallback.

Do not introduce runtime dependencies on Node.js, a separately installed .NET runtime, a separate LibreHardwareMonitor process, or a remote dashboard. Full sensor coverage may require Administrator privileges; non-elevated operation is expected to be degraded, not necessarily fatal.

## Where to Work

- Backend startup/lifecycle: `src/PCMonitor/Program.cs`.
- Hardware adapter and telemetry pipeline: `src/PCMonitor/Telemetry/`.
- HTTP server, API, LAN policy: `src/PCMonitor/Server/`.
- Settings: `src/PCMonitor/Settings/`.
- Windows integration: `src/PCMonitor/Infra/`.
- Tray/window: `src/PCMonitor/Ui/`.
- UI entry point and feature modules: `ui/src/`; individual views are in `ui/src/views/`.
- xUnit backend/unit/integration tests: `tests/PCMonitor.Tests/`.
- Vitest UI tests: `ui/src/**/*.test.ts`.
- User-facing behavior and commands: `README.md`.
- Build/release definitions: `.github/workflows/`, `installer/PCMonitor.iss`.
- Hardware smoke/coverage tools: `tools/`.

`wwwroot/`, `publish/`, `bin/`, `obj/`, and `ui/node_modules/` are generated or ignored. Edit their source inputs, not generated output. Preserve pre-existing worktree edits; do not reset, overwrite, or reformat unrelated files.

## Data Flow and Boundaries

`Program` loads settings and creates a single `TelemetryCollector`. The collector polls its `IHardwareSource` on one background loop and publishes immutable/versioned snapshots and health. `LhmHardwareSource` contains LibreHardwareMonitor coupling and keeps slow devices on a background slow lane. `SnapshotBuilder` converts raw hardware to stable, sorted API records with finite values and sensor metadata. The server and tray consume those published records rather than accessing hardware themselves. The browser UI consumes SSE and renders existing model/view modules.

Keep OS side effects (autostart and firewall) explicit and behind the existing `SystemActions` seam. Preserve separations between hardware access, snapshot conversion, HTTP policy, and UI rendering. Prefer pure helpers and existing dependency seams so logic remains testable without actual hardware or machine configuration.

## Commands

Use PowerShell from the repository root unless noted. Prerequisites are .NET 10 SDK, Node.js 22+, and Windows for the app, Windows-specific integration tests, installer, and smoke test.

```powershell
Push-Location ui
npm ci
npm run typecheck
npm test
Pop-Location

dotnet test tests\PCMonitor.Tests -c Release
dotnet publish src\PCMonitor -c Release -o publish
.\tools\smoke-test.ps1 -ExePath .\publish\PCMonitor.exe
```

The .NET build runs the UI build, calling `npm ci` if `ui/node_modules/` is missing. For dashboard development, run `npm run dev` in `ui`; Vite proxies API calls to `127.0.0.1:8096`. The smoke test expects elevation by default (`-AllowNonElevated` opts out of that assertion). The telemetry comparison script requires reference and candidate endpoint URLs; see its help/README example.

CI runs UI typecheck, UI tests, and .NET tests on Windows. Release packaging is tag-driven (`v*`) and creates an installer, portable ZIP, and `SHA256SUMS.txt`. Do not claim validation passed unless the command was actually run. When hardware or elevation is unavailable, run applicable unit/integration tests and call out the limitation.

## Implementation Rules

### Backend

- Preserve `net10.0-windows`, nullable annotations, implicit usings, and strict compiler behavior.
- Keep LibreHardwareMonitor types in its adapter. The rest of telemetry should use `IHardwareSource` and the raw model.
- Maintain immutable snapshots, deterministic ordering, finite-value filtering, unit/precision rules, collector retry/reset semantics, and non-blocking slow-device/volume refresh.
- Test conversion, settings, access policy, server routes, and collector behavior using existing test seams and isolated settings files. Do not make routine tests depend on real hardware, firewall changes, or scheduled tasks.

### Dashboard

- Keep TypeScript strictness intact (`noUncheckedIndexedAccess`, no unused locals/parameters); do not suppress problems with `any` or weaker `tsconfig` settings.
- Follow the existing API/model/view organization, DOM safety helpers, scoring/formatting utilities, and colocated Vitest test patterns.
- Preserve Vite's stable asset naming and output path. A change to generated asset layout must also account for MSBuild embedding and server/static-file behavior.
- For an API change, update the backend DTO/route, UI types and consumer, relevant tests, and README together.

### Security and user-visible behavior

- Default server access is loopback-only. Preserve Host/port validation against DNS rebinding.
- LAN access is opt-in and constrained to private clients and LAN hosts; it requires a token and stays plain HTTP. Keep fixed-time token comparison, token-to-HttpOnly-cookie flow, local-only settings access, same-origin JSON writes, request-size/range checks, and firewall behavior. Do not expose or log access tokens.
- Keep failure behavior explicit and consistent with existing logging or user notifications; avoid broad catches, silent failure, and success-shaped fallbacks.
- Update README when a change alters user-visible setup, settings, API, LAN behavior, known limitations, or development workflow.

## API Facts to Preserve

- `GET /api/snapshot`: latest telemetry JSON, or `503` while initial sampling has not completed.
- `GET /api/health`: status, elevation, hardware/sensor counts, last error/update, port, version.
- `GET /api/stream`: server-sent `snapshot` and changed `health` events with heartbeat comments.
- `GET/PUT /api/settings`: local settings; remote LAN viewers are not administrators.
- Numeric sensor values are expressed in their `unit`; throughput is `B/s`.
- Default listen port is `8096`, with forward fallback when occupied. `PORT` is a per-run override and is not saved. Port and LAN bind changes can require restart.

## Working Loop

1. Read the relevant implementation, tests, and README section before making changes.
2. Make the narrowest complete change; keep unrelated user edits untouched.
3. Add or update focused tests and directly related documentation.
4. Run UI typecheck/tests, xUnit tests, or both according to the affected behavior. For changes to the API or cross-layer behavior, validate both sides.
5. Review the diff for unintended changes and generated files. Report commands run, results, and any environment-dependent checks not performed.

<!-- agent-kit:start -->
@AGENTS.md
@COORDINATOR.md
<!-- agent-kit:end -->
