# mock-harness checkpoint

## Accepted checklist
- [x] Add sanitized realistic ui/mock/snapshot.sample.json and a fixture regression test.
- [x] Add dependency-free mock API/static/SSE server based on UI and backend contracts.
- [x] Add headless screenshot tool for five required viewports.
- [x] Add layout measurement tool, JSON/table output, and --assert criteria.
- [x] Add concise mock tooling README.
- [x] Run baseline measurements on the current layout and record results.
- [x] Run required typecheck and Vitest checks; review scoped diff and commit completed checkpoints.

## Evidence and baseline
- Initial fixture test failed because the fixture file did not exist; after adding the sanitized fixture, both focused checks passed.
- Dashboard build completed with npm --prefix ui run build.
- Final required checks: npm --prefix ui run typecheck passed; npm --prefix ui test passed (16 files, 103 tests).
- Mock endpoint smoke checks passed for static UI, snapshot, health, settings GET/PUT and origin rejection, diagnostics exclusions, and initial SSE snapshot/health events.
- Screenshot tool wrote and image inspection confirmed PNGs (exact pixel dimensions): 1920x1080, 2560x1440, 1366x768, 1024x768, 390x844. Files are in C:\Users\Maciej\AppData\Local\Temp\pcmonitor-mock-shots.

| Viewport | Baseline rows below 97% coverage | Shared panel height delta | Horizontal overflow |
| --- | --- | ---: | --- |
| 1920x1080 | signal 19.5%, 49.3%, 32.4%; cooling 66.2%; drives 39.7% | 0 px | no |
| 2560x1440 | GPU cards 66.3%; cooling 24.2%; drives 33.1% | 0 px | no |
| 1366x768 | signal 49.5%, 49.3%; cooling 62.3%; drives 66.5% | 0 px | no |
| 1024x768 | signal 49.6%; GPU cards 66.4% | 0 px | no |
| 390x844 | signal 49.1%; cooling 49.1% | 0 px | yes, 492 px document / 390 px viewport |

- Baseline node ui/mock/measure.mjs --assert exited 1 with 17 layout assertion failures, as expected because this assignment records the existing layout and forbids CSS changes. It found no shared-row panel-height failures; the mobile overflow and low row coverage are baseline findings for the layout work.
- No CSS, package manifests, or generated wwwroot files were changed.

## Commits
- b42ab1a test(ui): add sanitized mock telemetry fixture
- Tooling checkpoint pending commit.

## Resume notes
- None.
