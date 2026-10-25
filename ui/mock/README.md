# UI mock harness

These dependency-free Node 22+ tools run the built dashboard against a sanitized telemetry fixture. They need no PC Monitor process or hardware.

## Build and serve

From the repository root:

    npm --prefix ui run build
    node ui/mock/server.mjs

Open http://127.0.0.1:5199. Use --port 5200 to choose another local port. The server binds only to 127.0.0.1, reads snapshot.sample.json, serves src/PCMonitor/wwwroot, and exposes the snapshot, health, SSE stream, settings and diagnostics routes used by the dashboard. SSE sends an initial snapshot and health event, then updates values once per second. Settings updates are kept in memory.

The fixture follows the /api/snapshot wire shape with generic device names and identifiers. It has 8 CPU cores, an NVIDIA GPU, memory, two drives, two network adapters and five fans.

## Screenshots

With Edge or Chrome installed, or BROWSER set to its executable path:

    node ui/mock/shots.mjs --out .\mock-shots

The tool starts and stops its own mock server and writes PNGs at 1920x1080, 2560x1440, 1366x768, 1024x768 and 390x844. Each browser uses headless mode, a fresh temporary profile and a 9-second capture timeout. It does not use a virtual-time budget, so the live SSE connection stays active during capture.

## Layout measurements

    node ui/mock/measure.mjs
    node ui/mock/measure.mjs --assert

The command prints JSON metrics and a compact viewport table. It checks every row in the layout, signal, GPU card, cooling, storage and network tile grids for at least 97% width coverage; the final CPU core row is exempt because non-divisible core counts can leave a deliberate short row. It also checks equal panel heights within each shared row (2 px tolerance) and horizontal overflow. --assert exits non-zero when any check fails.

The measurement tool uses Edge/Chrome --dump-dom with an injected same-origin wrapper and no remote debugging. Its wrapper removes the iframe-only embedded presentation class before measuring the normal dashboard layout. It starts and stops the mock server automatically. Pass --port 5200 if that port is preferred.

To measure the iframe presentation itself, keep the embedded class and run:

    node ui/mock/measure.mjs --embedded --assert

Generated screenshots can be kept outside the repository by setting --out to a temporary directory. No npm dependencies or package manifests are changed.
