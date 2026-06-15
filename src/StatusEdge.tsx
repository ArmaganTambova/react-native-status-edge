import { useEffect } from 'react';
import { useWindowDimensions, StyleSheet } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  BlurMask,
  Group,
  FillType,
  type SkPath,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  useDerivedValue,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useStatusEdge } from './useStatusEdge';
import { buildPaths, type PathCommand } from './cutoutPaths';
import { computeSegments, COMET_LENGTH } from './comet';
import type { StatusEdgeProps } from './types';

const GLOW_SPREAD = 18;
const DEFAULT_TRAVEL_MS = 2000;
const DEFAULT_PULSE_MS = 2600;

function makePath(commands: PathCommand[], evenOdd = false): SkPath {
  const path = Skia.Path.Make();
  for (const c of commands) {
    switch (c.op) {
      case 'move':
        path.moveTo(c.x, c.y);
        break;
      case 'line':
        path.lineTo(c.x, c.y);
        break;
      case 'quad':
        path.quadTo(c.cx, c.cy, c.x, c.y);
        break;
      case 'arc':
        path.arcToOval(
          Skia.XYWHRect(c.oval.x, c.oval.y, c.oval.width, c.oval.height),
          c.start,
          c.sweep,
          false
        );
        break;
      case 'oval':
        path.addOval(
          Skia.XYWHRect(c.oval.x, c.oval.y, c.oval.width, c.oval.height)
        );
        break;
      case 'rrect':
        path.addRRect(
          Skia.RRectXY(
            Skia.XYWHRect(c.oval.x, c.oval.y, c.oval.width, c.oval.height),
            c.rx,
            c.ry
          )
        );
        break;
      case 'rect':
        path.addRect(
          Skia.XYWHRect(c.oval.x, c.oval.y, c.oval.width, c.oval.height)
        );
        break;
      case 'close':
        path.close();
        break;
    }
  }
  if (evenOdd) path.setFillType(FillType.EvenOdd);
  return path;
}

export default function StatusEdge({
  isLoading = false,
  color = '#00FF00',
  strokeWidth = 3,
  animation = 'trace',
  durationMs,
}: StatusEdgeProps) {
  const data = useStatusEdge();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const progress = useSharedValue(0); // comet driver (0→1)
  const glow = useSharedValue(0); // breathing/pulse intensity (0→1)

  const cutoutType = data?.cutoutType ?? 'None';
  const isPulse = animation === 'breathing' || animation === 'pulse';
  const isClosed = cutoutType === 'Dot' || cutoutType === 'Island';
  const isOrbit =
    isClosed && (animation === 'clockwise' || animation === 'counterclockwise');
  // `trace` and `clockwise` travel the path's natural direction; only
  // `counterclockwise` reverses it.
  const forward = animation !== 'counterclockwise';
  const duration =
    durationMs ?? (isPulse ? DEFAULT_PULSE_MS : DEFAULT_TRAVEL_MS);

  useEffect(() => {
    cancelAnimation(progress);
    cancelAnimation(glow);
    if (!isLoading) {
      progress.value = 0;
      glow.value = 0;
      return;
    }

    if (isPulse) {
      progress.value = 0;
      glow.value = 0;
      if (animation === 'breathing') {
        // Smooth, even in/out fade.
        glow.value = withRepeat(
          withTiming(1, {
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
          }),
          -1,
          true
        );
      } else {
        // Heartbeat: a fixed ~600ms lub-dub, then an idle rest that fills the
        // remainder of `duration`. The beat keeps a constant, recognisable
        // shape, so `durationMs` only stretches the rest — the cycle never
        // drops below ~800ms even for smaller `durationMs`.
        const rest = Math.max(200, duration - 600);
        glow.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }),
            withTiming(0.18, { duration: 150, easing: Easing.in(Easing.quad) }),
            withTiming(0.85, {
              duration: 110,
              easing: Easing.out(Easing.quad),
            }),
            withTiming(0, { duration: 230, easing: Easing.in(Easing.quad) }),
            withTiming(0, { duration: rest })
          ),
          -1,
          false
        );
      }
    } else {
      glow.value = 0;
      progress.value = withRepeat(
        withTiming(1, { duration, easing: Easing.linear }),
        -1,
        false
      );
    }
  }, [isLoading, isPulse, animation, duration, progress, glow]);

  const seg = useDerivedValue(
    () => computeSegments(progress.value, isOrbit, forward, COMET_LENGTH),
    [isOrbit, forward]
  );
  const aStart = useDerivedValue(() => seg.value.aStart);
  const aEnd = useDerivedValue(() => seg.value.aEnd);
  const bStart = useDerivedValue(() => seg.value.bStart);
  const bEnd = useDerivedValue(() => seg.value.bEnd);

  if (!data) return null;
  if (!isLoading) return null;

  const built = buildPaths({
    cutoutType,
    cutoutRects: data.cutoutRects,
    cameraCircles: data.cameraCircles ?? [],
    safeAreaTop: data.safeAreaTop,
    mainRectIndex: data.mainRectIndex ?? 0,
    screenWidth,
    screenHeight,
    strokeWidth,
  });

  // Three stacked glow layers: outer halo → mid → bright inner core.
  const LAYERS = [
    { width: GLOW_SPREAD, blur: GLOW_SPREAD, opacity: 0.2 },
    { width: GLOW_SPREAD * 0.6, blur: GLOW_SPREAD * 0.5, opacity: 0.45 },
    { width: GLOW_SPREAD * 0.25, blur: GLOW_SPREAD * 0.25, opacity: 0.7 },
  ];

  if (isPulse) {
    const outlinePath = makePath(built.outlineCommands);
    const clipPath = built.outlineClipCommands
      ? makePath(built.outlineClipCommands, true)
      : undefined;
    return (
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Group clip={clipPath} opacity={glow}>
          {LAYERS.map((l, i) => (
            <Path
              key={i}
              path={outlinePath}
              style="stroke"
              strokeWidth={l.width}
              color={color}
              strokeCap="round"
              strokeJoin="round"
              opacity={l.opacity}
            >
              <BlurMask blur={l.blur} style="normal" />
            </Path>
          ))}
        </Group>
      </Canvas>
    );
  }

  const clipPath = built.clipCommands
    ? makePath(built.clipCommands, true)
    : undefined;
  // Closed orbits get one path per shape so Skia's per-path trim orbits each
  // cutout independently (a single combined path would trim across the
  // concatenated contours and tear the comet between shapes). Open sweeps use
  // a single path.
  const cometPaths = isOrbit
    ? built.cometCommands.map((cmd) => makePath([cmd]))
    : [makePath(built.cometCommands)];

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group clip={clipPath}>
        {cometPaths.map((cometPath, pi) => (
          <Group key={pi}>
            {LAYERS.map((l, i) => (
              <Path
                key={`a${i}`}
                path={cometPath}
                style="stroke"
                strokeWidth={l.width}
                color={color}
                start={aStart}
                end={aEnd}
                strokeCap="round"
                opacity={l.opacity}
              >
                <BlurMask blur={l.blur} style="normal" />
              </Path>
            ))}
            {/* Second segment carries the wrapped portion of a seamless orbit. */}
            {isOrbit &&
              LAYERS.map((l, i) => (
                <Path
                  key={`b${i}`}
                  path={cometPath}
                  style="stroke"
                  strokeWidth={l.width}
                  color={color}
                  start={bStart}
                  end={bEnd}
                  strokeCap="round"
                  opacity={l.opacity}
                >
                  <BlurMask blur={l.blur} style="normal" />
                </Path>
              ))}
          </Group>
        ))}
      </Group>
    </Canvas>
  );
}
