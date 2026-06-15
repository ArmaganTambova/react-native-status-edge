# Changelog

All notable changes to this project are documented here.

This project is a development preview (`0.3.x`); minor versions may include
breaking changes while the native geometry is being calibrated.

## [0.3.3] - 2026-06-15

### Fixed

- **Android release build no longer fails to compile.** `StatusEdgeModule.kt`
  called `abs(...)` in `validatePathBounds` without importing `kotlin.math.abs`,
  producing `Unresolved reference 'abs'` during `compileReleaseKotlin`. Added the
  missing import. (Debug builds could mask this via incremental compilation; a
  clean release build — e.g. `assembleRelease` — surfaced it.)

> ### ⚠️ `0.3.2` is broken — do not use
>
> `0.3.2` ships the `abs` import bug above and **fails to compile on Android**
> (`Unresolved reference 'abs'` in `compileReleaseKotlin`). Upgrade to `0.3.3`.
> The published `0.3.2` will be deprecated on npm.

## [0.3.2] - 2026-06-15

> ⚠️ Faulty release — see the 0.3.3 note above. Fails the Android release compile.

- Universal animation styles, cutout fixes, full iOS device table.

## [0.3.1] - 2026-06-15

- Auto-run setup on install, proprietary license, Samsung Dot fix.

## [0.3.0] - 2026-06-15

- Proprietary license, setup wizard, fixes (first development preview).
