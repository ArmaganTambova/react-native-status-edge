# react-native-status-edge

> 🚧 **Development preview — not a production release.**
> This is a work-in-progress (`v0.3.0`). APIs, behavior, and native geometry may
> change without notice, and some platforms/devices are still being calibrated.
> Use at your own risk. See [License](#license) — this is **proprietary**,
> source-available software, not open source.

A high-performance, Skia-powered fluid status indicator and dynamic notch
animation library for React Native.

It detects your device's screen cutout (Notch, WaterDrop, Dot/punch-hole,
Dynamic Island, or None) and renders a glowing comet that follows the cutout
boundary — perfect as a "loading" indicator that wraps the camera.

## Requirements

- React Native >= 0.71 (New Architecture / TurboModules)
- Android API 31+ (Android 12+) for runtime cutout detection
- iOS 13+ / iPhone 11+ for notch/island detection
- **Edge-to-edge rendering must be enabled** so the overlay can draw over the
  status bar / cutout (the setup wizard configures this for you — see below)

## Installation

```sh
npm install react-native-status-edge
```

### Peer dependencies

The library renders with Skia and animates with Reanimated. Install:

```sh
npm install @shopify/react-native-skia react-native-reanimated
```

If you use **Reanimated 4**, also install its worklets runtime:

```sh
npm install react-native-worklets
```

> Reanimated requires its Babel plugin (`react-native-worklets/plugin` for v4,
> or `react-native-reanimated/plugin` for v3) to be the **last** entry in your
> `babel.config.js`.

### Setup (runs automatically)

When you install the package, a setup step runs **automatically** (via
`postinstall`): it checks your peer dependencies and enables Android
edge-to-edge (the transparent top area the overlay needs). You don't need to
run any command.

To re-run it manually (e.g. after adding native folders or on Expo prebuild):

```sh
npx react-native-status-edge setup    # interactive setup
npx react-native-status-edge doctor   # just check peer dependencies
```

### iOS

```sh
cd ios && pod install
```

## Why edge-to-edge?

`StatusEdge` draws the glow over the status-bar / cutout area. If your app is
**not** edge-to-edge (i.e. the top of the screen is opaque), the overlay is
clipped and the animation breaks — most visibly on `WaterDrop` and other
top-attached cutouts. The wizard sets `edgeToEdgeEnabled=true` in
`android/gradle.properties` (React Native 0.81+). iOS already extends views
under the notch/island, so no change is needed there.

## Usage

### Basic — show a loading animation

```tsx
import { StatusEdge } from 'react-native-status-edge';

export default function App() {
  return (
    <>
      {/* Your app content */}
      <StatusEdge isLoading color="#00FF00" strokeWidth={3} />
    </>
  );
}
```

### Control the loading state

```tsx
import { useState } from 'react';
import { Button, View } from 'react-native';
import { StatusEdge } from 'react-native-status-edge';

export default function App() {
  const [isLoading, setIsLoading] = useState(false);

  const handleFetch = async () => {
    setIsLoading(true);
    await fetchData();
    setIsLoading(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <Button title="Fetch" onPress={handleFetch} />
      <StatusEdge isLoading={isLoading} color="#6366F1" strokeWidth={4} />
    </View>
  );
}
```

### `useStatusEdge` — access raw cutout data

```tsx
import { useStatusEdge } from 'react-native-status-edge';

export default function DebugScreen() {
  const data = useStatusEdge();
  if (!data) return null;

  console.log(data.cutoutType);  // 'Notch' | 'WaterDrop' | 'Dot' | 'Island' | 'None'
  console.log(data.cutoutRects); // [{ x, y, width, height }] in dp
  console.log(data.cameraCircles); // [{ cx, cy, r }] in dp (Android, Dot)
  return null;
}
```

## API

### `<StatusEdge />` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isLoading` | `boolean` | `false` | Show/hide the comet animation |
| `color` | `string` | `'#00FF00'` | Color of the glow/comet (any CSS color) |
| `strokeWidth` | `number` | `3` | Comet stroke thickness in dp |

### `useStatusEdge()`

Returns `StatusEdgeData | null`. It is `null` while the native module is loading
**and** if detection fails (see [Known limitations](#known-limitations)).

```ts
interface StatusEdgeData {
  cutoutType: 'Notch' | 'WaterDrop' | 'Dot' | 'Island' | 'None';
  /** Bounding rectangles of all cutouts, in dp. */
  cutoutRects: Array<{ x: number; y: number; width: number; height: number }>;
  /** Exact camera circle(s), in dp. Android only; populated for Dot/Island. */
  cameraCircles: Array<{ cx: number; cy: number; r: number }>;
  /** Top safe-area inset, in dp. */
  safeAreaTop: number;
  /** SVG-like polyline of the cutout path, in physical px. Android only. */
  cutoutPathSvg?: string;
  /** Bounding box of the cutout path, in dp. Android only. */
  cutoutPathBounds?: { x: number; y: number; width: number; height: number } | null;
}
```

Exported types: `StatusEdgeData`, `CutoutType`, `CutoutRect`, `CameraCircle`,
`StatusEdgeProps`. `src/types.ts` is the source of truth.

### Cutout types

| Type | Description |
|------|-------------|
| `Notch` | Wide notch attached to the top edge |
| `WaterDrop` | Narrow teardrop notch attached to the top edge |
| `Dot` | Small punch-hole camera |
| `Island` | Dynamic Island / wide floating pill |
| `None` | No cutout detected |

## How it works

1. **Native detection** — On Android, `DisplayCutout` (API 31+) provides the
   bounding rects, safe inset, and cutout path. For a center punch-hole on
   Samsung One UI the OS reports a tall safe-area *stripe* (not the bare circle),
   so the camera circle is taken from the **center** of that box. On iOS the
   device model identifier is mapped to a cutout type with approximate
   dimensions.
2. **Path construction** — A Skia path traces the cutout boundary; an EvenOdd
   clip keeps the glow outside the cutout interior.
3. **Animation** — A Reanimated `withRepeat`/`withTiming` loop drives a
   `start`/`end` offset along the path, layered with three `BlurMask` passes.

## Known limitations

This is a development preview. Current known gaps:

- **Orientation:** cutout geometry is read once on mount; rotating the device
  may misalign the overlay until remount. Designed for portrait.
- **iOS** dimensions are hardcoded approximations per device family; the
  simulator always reports `None`. `cameraCircles` is Android-only.
- **Samsung Dot** vertical centering is calibrated to the geometric center of
  the reported cutout stripe; a few-dp per-device offset may remain.
- Detection failures currently surface as `null` (no error channel yet).

## License

**Proprietary — © 2026 Armağan Tambova. All rights reserved.**

You may use this library, unmodified, as a dependency inside your own
application (including commercial apps). You may **not** redistribute it, create
derivative works or new versions, use it in tutorials/educational material, or
monetize the library itself. All development and distribution rights are
reserved by the author. See [LICENSE](LICENSE) for the full terms.

This is **not** open source and external contributions, forks, and derivatives
are not accepted. For any use beyond the granted permissions, contact
**armagantambova@gmail.com**.
