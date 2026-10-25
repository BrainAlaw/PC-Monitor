# Review: mission mk-theme (MK dashboard theme, release 2.0.5)

Reviewer: read-only review agent. No product code edited, nothing committed, pushed or deployed. The 2.0.6 layout-fill work (`mission/layout-fill/ui`) was checked only where it touches the same CSS.

Scope commits: base `043d309`, theme commits `9ac8ca0` and merge `06adcb1`, release `4a572a5` (2.0.5). Later: `76b099d` (2.0.6).

## Overall verdict: APPROVE-WITH-NOTES

Required checks all pass. Local font loading, the embedded class and the 360px fit are verified. Remaining gaps are visual or native-window items that need a device check (DEVICE-ONLY), plus a few spec deviations listed below. None blocks the shipped 2.0.5 release.

## Acceptance criteria

| # | Criterion | Verdict |
|---|-----------|---------|
| 1 | Palette, typography and components follow the MK spec, local bundled JetBrains Mono, no remote resources | PARTIAL |
| 2 | Charts/gauges readable with token colors; embedded mode fits 360px | PARTIAL (360px MET; visual readability DEVICE-ONLY) |
| 3 | `theme.test.ts` plus typecheck, vitest and dotnet tests pass | MET |

### Criterion 1 evidence

MET parts:
- Token block matches the spec exactly: `ui/src/styles.css` lines 52-78 (`--void #0a0506`, `--panel rgba(18,8,10,.82)`, `--red #ff2a3d`, `--cyan #00f0ff`, `--ok #19f0c4`, `--warn #ffb020`, `--cut 12px`, `--cut-sm 8px`, `--radius 2px`, `--mono` stack). Legacy names are kept as aliases (`--page`, `--green`, `--yellow`, `--font`, ...), so components needed no edits.
- Font: two `@font-face` rules with `url("./fonts/jb-mono-400.woff2")` and `jb-mono-700.woff2` (lines 13-32). The build emits both files into `wwwroot/assets/`. Fallback stack is the spec stack.
- No remote resources: grep for `https?://`, `@import`, `fonts.googleapis`, `fonts.gstatic` over `ui/src` and `ui/index.html` finds nothing in CSS or TS. The only remote URL in `index.html` is a user-clicked `<a href="https://pawnio.eu">` link, not a resource load.
- Licence: `ui/src/fonts/OFL.txt` is shipped; `THIRD_PARTY_NOTICES.md` got a 2-line entry in `76b099d`.
- Page background, CRT overlay (`body::after`, multiply, pointer-events none), panel chamfer `clip-path`, red uppercase headings, chamfered buttons with the cyan secondary variant, input focus ring, cyan table headers, `::selection`, and `prefers-reduced-motion` are all present (lines ~938-1000 and ~1180-1215).
- No hard-coded hex or rgb in TS source outside tests. `charts.ts` takes colors as parameters; views pass `var(--cyan|--magenta|--green)`. The pre-theme code already did this, so it is not a regression.

PARTIAL parts (spec deviations, all minor):
- P1-a Native window background not themed. `src/PCMonitor/Ui/DashboardForm.cs:33` still sets `webView.DefaultBackgroundColor = Color.FromArgb(15, 17, 21)` (the old `#0f1115`). The spec `--void` is `#0a0506`. The theme commits did not touch C#. The colour shows before first paint and in overscroll. Coordinator request: change to `Color.FromArgb(10, 5, 6)` in a separate native change. DEVICE-ONLY to confirm the visible effect.
- P1-b Radii not all 2px. `.toast` (line 845) keeps `border-radius: 10px` and is not in the skin override list. `.switch i`, `.bar`, `.chip` (lines 191, 655, 787, 1056, 1209) keep `999px` pills. `.risk-count` is 8px on a 16px square (effectively a circle). Spec says radius 2px for cards and components.
- P1-c Settings popover (`.settings-popover`, line 720) and toasts have no chamfer `clip-path`. Panels, cards and buttons do have it.
- P1-d Scrollbars: effective width is 10px (line 1202); spec says "thin". A dead duplicate `::-webkit-scrollbar { width: 6px }` at line 1008 is overridden by line 1202. Cleanup only.
- P1-e Section label prefixes (`> ` / `$ `, spec "may") are not implemented. Optional.
- P1-f `--blue: #00b8cc` is an extra token outside the spec set. The spec allows a cyan-shifted tone for `--blue`, so this is acceptable.

### Criterion 2 evidence

- 360px MET. The repo's `measure.mjs` uses 390px as its narrowest viewport. I ran a scratch copy of the same harness at 360x780 (`$TEMP/mk-review/measure360.mjs`; repo untouched):
  - `--embedded --assert`: exit 0, horizontal overflow `no` at 360x780, 0.00px delta.
  - standalone `--assert`: exit 0, horizontal overflow `no` at 360x780, 0.00px delta.
- Embedded mode: `setEmbeddedMode` in `ui/src/header.ts` toggles `embedded` on `<html>` when `window.top !== window.self`, with a catch fallback that adds the class. It is called once from `ui/src/main.ts` line 21. `html.embedded` rules (styles.css ~lines 1024-1040) hide window controls, reduce topbar and content padding and collapse to one column below 1800px. Both measure runs pass with `embedded=1`.
- Chart and gauge readability: colours come from tokens and are distinct (cyan RAM, magenta GPU, green CPU, warn/crit states). No headless visual screenshot was taken, because the theme mission has no mock-data visual check. DEVICE-ONLY for final visual sign-off.

### Criterion 3 evidence

MET. Real output tails, run from `D:/Github Repos/pc-monitor`:

- `npm --prefix ui run typecheck`: exit 0 (`tsc --noEmit`, no errors).
- `npm --prefix ui test`: exit 0. `Test Files 17 passed (17)`, `Tests 106 passed (106)`. Includes `ui/src/theme.test.ts` (2 tests: token values, local `@font-face`, no remote `url()` or `@import`, and `setEmbeddedMode` toggling).
- `npm --prefix ui run build`: exit 0. Output includes `wwwroot/assets/jb-mono-400.woff2 21.08 kB`, `jb-mono-700.woff2 21.95 kB`, `index.css 27.56 kB`, `app.js 36.57 kB`, `built in 148ms`.
- `node ui/mock/measure.mjs --assert`: exit 0. All 5 viewports (1920, 2560, 1366, 1024, 390) pass with `assertionFailures: []` and no horizontal overflow.
- `node ui/mock/measure.mjs --embedded --assert`: exit 0, same result.
- `dotnet test tests/PCMonitor.Tests -c Debug`: exit 0. `Passed! - Failed: 0, Passed: 79, Skipped: 0, Total: 79`. The mission named `-c Release`; Debug was used as allowed, Release was not run.
- `git status --short` after the builds: clean (`wwwroot/` is gitignored).

## Findings

1. Medium-low (native): `DashboardForm.cs:33` background is still the pre-MK colour. Needs a one-line native change plus a device check. Coordinator request, outside this mission's owned paths.
2. Low (spec): toasts keep a 10px radius and have no chamfer; switch, bar and chip pills use 999px; settings popover has no chamfer. Fix in the `styles.css` skin section.
3. Low (spec): scrollbar is 10px, not thin; the duplicate 6px rule at line 1008 is dead code.
4. Low (test coverage): `theme.test.ts` checks the `setEmbeddedMode` helper but not its call in `main.ts`. `measure.mjs` runs only 390px as its narrowest viewport, so the 360px fit was checked only by my scratch run. Consider adding 360 to `ui/mock/measure.mjs` viewports.
5. Info (font provenance): the `.woff2` files are present, bundled and referenced locally, and `OFL.txt` is shipped. The font binary identity (JetBrains Mono name table) could not be checked with a tool here (fontTools not installed; nothing was installed). Confirm once on a device or with a font inspector.
6. Info (2.0.6 layout-fill): `76b099d` changed the same CSS (flex-wrap grids, `@media (min-width: 1800px)` block, embedded layout rules). It introduced no conflict with the MK skin block and changed no colour or font token. The removed `.device-grid > :nth-child(3):last-child` rule was replaced by flex-basis rules; both measure runs still fill the GPU card row.

## DEVICE-ONLY checks (cannot be verified headless)

- Native WebView2 window: background colour before first paint and during overscroll (finding 1).
- Visual look of the MK skin in WebView2 (CRT overlay, chamfers, glow) and chart/gauge readability on real sensor data.
- Embedded overlay inside the MK-PI Homer iframe through the Pi proxy `:8082`: font loads from the same origin, layout at the real overlay width.

## Non-blocking coordinator follow-ups

- Optionally schedule P1-a (native background) and the radius/scrollbar cleanup as a small follow-up commit on `master`.
- Keep `THIRD_PARTY_NOTICES.md` and `OFL.txt` together when fonts are updated.

No secrets, credentials or device addresses appear in this review.
