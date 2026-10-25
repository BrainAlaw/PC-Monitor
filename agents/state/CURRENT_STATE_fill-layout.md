# fill-layout checkpoint

## Accepted checklist
- [x] Tighten layout measurement assertions and capture failing RED baseline.
- [x] Inspect mock screenshots and identify all underfilled layout groups at required viewports.
- [x] Implement responsive CSS/template layout fixes, preserving theme, embedded mode, reduced motion, content, and mobile behavior.
- [x] Add Vitest structural regression coverage for shared tile grid/breakpoint assumptions.
- [x] Capture and inspect after screenshots at all required viewports.
- [x] Run required UI typecheck, Vitest, build, measurement assertions, and .NET tests.
- [x] Review scoped diff, commit completed checkpoint(s), and write result.json.

## Evidence / checkpoints
- RED: new `layout.test.ts` failed on missing shared classes and wide breakpoint before implementation.
- RED: baseline `measure.mjs --assert` showed underfilled signal/cooling/storage rows and an incorrect 390px measurement caused by the wrapper iframe stretching to 492px.
- GREEN: wrapper now applies requested iframe dimensions and asserts measured viewport width; layout fills tile rows with flex growth, uses a 12-column wide layout with 3-panel rows and two half-width final panels, and clamps the page flex width for mobile.
- Normal mode measurement passed all five viewports: >=97% row coverage, 0px shared-row panel height delta, and no horizontal overflow.
- Embedded mode measurement passed all five viewports with the embedded class retained in the iframe; measured viewport widths matched targets and no horizontal overflow was present.
- Final checks passed: `npm --prefix ui run typecheck`; `npm --prefix ui test` (17 files, 105 tests); `npm --prefix ui run build`; `node ui/mock/measure.mjs --assert`; `node ui/mock/measure.mjs --embedded --assert`; `dotnet test tests/PCMonitor.Tests -c Release` (79 passed).
- Screenshot sets captured and inspected: baseline `C:\Users\Maciej\AppData\Local\Temp\pcmonitor-mock-shots`; after `C:\Users\Maciej\AppData\Local\Temp\pcmonitor-layout-fill-after`.
- Visual findings: 1920px uses three dashboard columns and fills the last panel row; 2560x1440 shows all eight panels within one screen; mobile remains one panel column without horizontal overflow. MK styling and panel/content order remain intact.
- `git diff --check` passed. Build output under ignored `wwwroot` was not staged.

## Resume notes
- None.
