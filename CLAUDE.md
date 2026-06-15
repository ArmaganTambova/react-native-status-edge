# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Yarn 4 monorepo (`packageManager: yarn@4.11.0`, Node per `.nvmrc` = 22.20.0). npm is not supported — the root and `example/` workspace share dependencies. The library package is the repo root; `example/` is a full React Native app wired to the local library source (so JS edits hot-reload, native edits require an app rebuild).

Scaffolded by `create-react-native-library` as a **TurboModule** (`kotlin-objc`, new architecture). Codegen spec name is `StatusEdgeSpec`; Android Java package is `com.statusedge` (see `codegenConfig` in `package.json`).

## Commands

All commands run from the repo root.

- `yarn` — install
- `yarn typecheck` — `tsc` (no emit, uses `tsconfig.json`)
- `yarn lint` / `yarn lint --fix`
- `yarn test` — Jest, `react-native` preset. A single test file: `yarn test path/to/file.test.tsx`. Filter by name: `yarn test -t "pattern"`.
- `yarn prepare` — build the publishable lib with `react-native-builder-bob` (ESM module + TypeScript declarations into `lib/`, using `tsconfig.build.json`).
- `yarn clean` — remove `lib/` and all example build dirs.
- `yarn example start` / `yarn example android` / `yarn example ios` — Metro and native run via the example workspace. **iOS requires `cd example/ios && pod install` after changes to native deps.**
- `yarn release` — release-it + conventional-changelog, publishes to npm and creates a GitHub release.

Pre-commit (via lefthook): eslint + `tsc` on staged files, and commitlint (conventional commits required) on the commit message.

## Architecture

### JS/TS layer (`src/`)

- `NativeStatusEdge.ts` — TurboModule spec (`getCutoutData(): Promise<string>`). The native side returns a JSON **string** that the JS hook `JSON.parse`s — so the bridge surface is deliberately one call with one scalar.
- `useStatusEdge.ts` — fetches and parses the JSON once on mount. Falls back to `NativeModules.StatusEdge` for the old arch (via the `global.__turboModuleProxy` check).
- `StatusEdge.tsx` — the visual component. For each `cutoutType` it builds a Skia `mainPath` (comet travel path) and, where relevant, an **EvenOdd `clipPath`** (outer screen rect XOR cutout interior) that prevents the glow from bleeding into the cutout. Animation is driven by a single Reanimated `progress` shared value (`withRepeat(withTiming(1 + length))`) that feeds derived `start`/`end` props of three stacked `<Path>` layers (outer halo / mid / inner), each with a `BlurMask`.
- `types.ts` — the `StatusEdgeData` shape returned by the hook (the parsed JSON). `cameraCircles`, `cutoutPathSvg`, and `cutoutPathBounds` are Android-only extensions to the base rect data.

### Android (`android/src/main/java/com/statusedge/`, min SDK 31)

`StatusEdgeModule.kt` is the full implementation. Flow:
1. `WindowMetrics.getWindowInsets().displayCutout` on the UI thread (activity is a UI context, so this works without view attachment).
2. `DisplayCutout.getCutoutPath()` gives the **exact geometric path** — but it's ambiguous across OEMs: AOSP/Pixel/OnePlus return the camera circle, Samsung One UI sometimes returns the full status-bar safe-area slab.
3. `classifyCutout` disambiguates using two signals: primary = bounding-rect aspect ratio; secondary = path-bounds aspect ratio (via `Path.computeBounds(exact=true)`, which is more accurate than `PathMeasure` for the cubic beziers Android uses to encode circles). Signal 2 is ignored if the path is non-circular (the Samsung slab case) and we fall back to signal 1 alone.
4. For `Dot`/`Island`, `extractCameraCircles` builds one circle per cutout via `circleFromBounds`: `r = min(w,h)/2`, `cx = bounds.centerX`, **`cy = bounds.centerY`**. The radius uses `min(w,h)` because Samsung One UI reports a center punch-hole as a vertical safe-area *stripe* the width of the hole running from `y=0` down to `safeInsetTop` — the height is inflated, the width is the true lens diameter. Android does **not** encode where the lens sits inside that stripe (the cutout path is a featureless rectangle), so the geometric **centre** of the box is the best estimate — top-anchoring rendered ~8dp too high and bottom-anchoring ~8dp too low on a real Samsung device. For AOSP/Pixel the box IS the circle, so centre/half-width are exact. Prefers the precise path bounds for a single cutout, else one circle per bounding rect.
5. `buildPathSvg` emits an SVG-like polyline in **physical px** (divide by the `density` field to get dp). `cutoutPathBounds` is a lighter-weight alternative.

Density: on API 34+ we use `windowMetrics.density` (window-accurate, handles multi-display + accessibility scaling); below 34, fall back to `activity.resources.displayMetrics.density`.

### iOS (`ios/StatusEdge.mm`)

Intentionally simple: detect the device via the `utsname` machine string (`iPhoneX,Y`) and hardcode-map the major version to `None` / `Notch` / `Island`. No runtime cutout detection — dimensions are **hardcoded approximations** (Notch 209×34, Island 126×37, centered). The `cameraCircles` array is always empty on iOS; consumers that rely on exact camera geometry only work on Android.

### Coordinate systems

All JS-visible coordinates are **dp** (density-independent pixels), top-left origin. The one exception is `cutoutPathSvg`, which is in **physical px** for fidelity — divide by `density` if you need dp. iOS values come directly from `UIKit` points (already the RN standard unit).

## CI

`.github/workflows/ci.yml` runs: lint+typecheck, test (coverage), `yarn prepare` build, and `yarn turbo run build:android` / `build:ios` against the example app. Turbo caches the native builds; inputs are declared in `turbo.json` — if you add source files consumed by the native builds outside `src/**/*.ts(x)`, update the `inputs` globs or CI caching will over-hit.
