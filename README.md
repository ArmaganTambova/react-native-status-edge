# react-native-status-edge

A high-performance, Skia-powered fluid status indicator and dynamic notch animation library for React Native.

Detects your device's screen cutout type (Notch, WaterDrop, Dot/punch-hole, Dynamic Island, or None) and renders a glowing comet animation that perfectly follows the cutout boundary.

## Preview

| Notch | WaterDrop | Dot | Island (Dynamic Island) |
|-------|-----------|-----|------------------------|
| Comet sweeps along the notch edges | Comet dips around the teardrop shape | Comet orbits the punch-hole camera | Comet orbits the Dynamic Island pill |

## Requirements

- React Native >= 0.71 (New Architecture / TurboModules supported)
- Android API 31+ (Android 12+) for cutout detection
- iOS 13+ / iPhone 11+ for notch/island detection

## Installation

```sh
npm install react-native-status-edge
```

### Peer Dependencies

This library requires the following peer dependencies to be installed:

```sh
npm install @shopify/react-native-skia react-native-reanimated react-native-gesture-handler react-native-safe-area-context
```

### iOS

```sh
cd ios && pod install
```

## Usage

### Basic — Show a loading animation

```tsx
import { StatusEdge } from 'react-native-status-edge';

export default function App() {
  return (
    <>
      {/* Your app content */}
      <StatusEdge isLoading={true} color="#00FF00" strokeWidth={3} />
    </>
  );
}
```

### Advanced — Control loading state

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

### useStatusEdge — Access raw cutout data

```tsx
import { useStatusEdge } from 'react-native-status-edge';

export default function DebugScreen() {
  const data = useStatusEdge();

  if (!data) return null;

  console.log(data.cutoutType);   // 'Notch' | 'WaterDrop' | 'Dot' | 'Island' | 'None'
  console.log(data.cutoutRects);  // Array of { x, y, width, height } in dp
  console.log(data.safeAreaTop);  // Safe area top inset in dp

  return null;
}
```

## API

### `<StatusEdge />` Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isLoading` | `boolean` | `false` | Show/hide the comet animation |
| `color` | `string` | `'#00FF00'` | Color of the glow and comet (any CSS color) |
| `strokeWidth` | `number` | `3` | Thickness of the comet stroke in dp |

### `useStatusEdge()` Hook

Returns `StatusEdgeData | null` (null while the native module is loading).

```ts
interface StatusEdgeData {
  cutoutType: 'Notch' | 'WaterDrop' | 'Dot' | 'Island' | 'None';
  cutoutRects: Array<{ x: number; y: number; width: number; height: number }>;
  cameraCircles: Array<{ cx: number; cy: number; r: number }>;
  safeAreaTop: number;
}
```

| Field | Description |
|-------|-------------|
| `cutoutType` | Detected cutout shape type |
| `cutoutRects` | Bounding rectangles of all cutouts in density-independent pixels |
| `cameraCircles` | Exact camera circle geometry (Android API 31+, Dot/Island types only) |
| `safeAreaTop` | Top safe area inset in dp |

### Cutout Types

| Type | Description |
|------|-------------|
| `Notch` | Wide notch attached to the top edge (e.g. iPhone 11–14, many Androids) |
| `WaterDrop` | Narrow teardrop-shaped notch attached to the top edge |
| `Dot` | Small punch-hole camera (attached or floating) |
| `Island` | Dynamic Island or wide floating pill cutout |
| `None` | No cutout detected (full-screen, home button devices) |

## How it Works

1. **Native detection**: On Android, `DisplayCutout` API (API 31+) provides the exact bounding rects and safe inset. On iOS, the device model identifier is matched against a known list to determine the cutout type.
2. **Path construction**: A Skia path is built to trace the cutout boundary (or screen top edge for `None`). An EvenOdd clip path prevents the glow from bleeding into the cutout interior.
3. **Animation**: A `withRepeat`/`withTiming` loop drives a `start`/`end` offset on the path, creating a comet-tail effect using three layered `BlurMask` passes for the glow.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
