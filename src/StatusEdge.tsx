import { useEffect } from 'react';
import { useWindowDimensions, StyleSheet } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  BlurMask,
  Group,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  useDerivedValue,
  Easing,
  cancelAnimation
} from 'react-native-reanimated';
import { useStatusEdge } from './useStatusEdge';
import type { StatusEdgeProps } from './types';

export default function StatusEdge({
  isLoading = false,
  color = '#00FF00',
  strokeWidth = 3,
  blurRadius = 8,
}: StatusEdgeProps) {
  const data = useStatusEdge();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const progress = useSharedValue(0);

  // Comet length as a fraction of the total path length
  const length = 0.3;
  const totalDuration = 2000;

  useEffect(() => {
    if (isLoading) {
      // Animate from 0 to 1+length so the tail fully exits before reset
      progress.value = withRepeat(
        withTiming(1 + length, { duration: totalDuration, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(progress);
      progress.value = 0;
    }
  }, [isLoading, length, totalDuration, progress]);

  const start = useDerivedValue(() => {
    const val = progress.value - length;
    return Math.max(0, Math.min(1, val));
  });

  const end = useDerivedValue(() => {
    return Math.min(1, Math.max(0, progress.value));
  });

  if (!data) return null;
  if (!isLoading) return null;

  const { cutoutType, cutoutRects, safeAreaTop } = data;
  const isDotOrIsland = cutoutType === 'Dot' || cutoutType === 'Island';

  // Standard path for None / Notch / WaterDrop
  const path = Skia.Path.Make();
  // Glow path + clip for Dot / Island
  let glowPath: ReturnType<typeof Skia.Path.Make> | null = null;
  let clipPath: ReturnType<typeof Skia.Path.Make> | null = null;
  const GLOW_SPREAD = 18;

  if (cutoutType === 'None') {
    path.moveTo(0, strokeWidth / 2);
    path.lineTo(screenWidth, strokeWidth / 2);
  } else if (cutoutType === 'Notch') {
    const rect = cutoutRects[0];
    if (rect) {
      const r = 10;
      const bottomY = rect.y + rect.height;

      path.moveTo(0, strokeWidth / 2);
      path.lineTo(rect.x - r, strokeWidth / 2);
      path.quadTo(rect.x, strokeWidth / 2, rect.x, strokeWidth / 2 + r);
      path.lineTo(rect.x, bottomY - r);
      path.quadTo(rect.x, bottomY, rect.x + r, bottomY);
      path.lineTo(rect.x + rect.width - r, bottomY);
      path.quadTo(rect.x + rect.width, bottomY, rect.x + rect.width, bottomY - r);
      path.lineTo(rect.x + rect.width, strokeWidth / 2 + r);
      path.quadTo(rect.x + rect.width, strokeWidth / 2, rect.x + rect.width + r, strokeWidth / 2);
      path.lineTo(screenWidth, strokeWidth / 2);
    } else {
      path.moveTo(0, strokeWidth / 2);
      path.lineTo(screenWidth, strokeWidth / 2);
    }
  } else if (cutoutType === 'WaterDrop') {
    if (cutoutRects && cutoutRects.length > 0) {
      cutoutRects.forEach((rect) => {
        const padding = 6;
        const inflatedW = rect.width + padding * 2;

        if (rect.y <= safeAreaTop * 0.5) {
          const leftX = rect.x - padding;
          const rightX = rect.x + rect.width + padding;
          const bottomY = rect.y + rect.height + padding;
          const arcRadius = inflatedW / 2;
          const arcCenterY = bottomY - arcRadius;

          path.moveTo(leftX, 0);
          path.lineTo(leftX, Math.max(0, arcCenterY));
          const oval = Skia.XYWHRect(leftX, arcCenterY - arcRadius, inflatedW, inflatedW);
          path.arcToOval(oval, 180, 180, false);
          path.lineTo(rightX, 0);
          path.lineTo(leftX, 0);
          path.close();
        } else {
          const inflatedH = rect.height + padding * 2;
          const inflatedX = rect.x - padding;
          const inflatedY = rect.y - padding;
          const r = Math.min(inflatedW, inflatedH) / 2;
          const tempPath = Skia.Path.Make();
          tempPath.addRRect(Skia.RRectXY(
            Skia.XYWHRect(inflatedX, inflatedY, inflatedW, inflatedH),
            r, r
          ));
          path.addPath(tempPath);
        }
      });
    }
  } else if (isDotOrIsland && cutoutRects && cutoutRects.length > 0) {
    // Dot / Island: orbit path sits exactly on the cutout boundary.
    // A clip path (EvenOdd) masks the interior so glow only radiates outward.
    glowPath = Skia.Path.Make();
    clipPath = Skia.Path.Make();
    clipPath.addRect(Skia.XYWHRect(0, 0, screenWidth, screenHeight));

    cutoutRects.forEach((rect) => {
      const cutoutR = Math.min(rect.width, rect.height) / 2;

      if (rect.y <= safeAreaTop * 0.5) {
        // Top-attached: U-shape hugging exact cutout boundary
        const leftX = rect.x;
        const rightX = rect.x + rect.width;
        const bottomY = rect.y + rect.height;
        const arcCenterY = bottomY - cutoutR;

        glowPath!.moveTo(leftX, 0);
        glowPath!.lineTo(leftX, Math.max(0, arcCenterY));
        const oval = Skia.XYWHRect(leftX, arcCenterY - cutoutR, rect.width, rect.width);
        glowPath!.arcToOval(oval, 180, 180, false);
        glowPath!.lineTo(rightX, 0);
        glowPath!.lineTo(leftX, 0);
        glowPath!.close();

        // Exclude cutout interior from clip
        clipPath!.addRect(Skia.XYWHRect(rect.x, 0, rect.width, bottomY));
      } else {
        // Floating: closed pill/rounded-rect on exact boundary
        const r = cutoutType === 'Island' ? rect.height / 2 : cutoutR;
        const orbitPath = Skia.Path.Make();
        orbitPath.addRRect(Skia.RRectXY(
          Skia.XYWHRect(rect.x, rect.y, rect.width, rect.height),
          r, r
        ));
        glowPath!.addPath(orbitPath);

        // Exclude cutout interior from clip
        clipPath!.addRRect(Skia.RRectXY(
          Skia.XYWHRect(rect.x, rect.y, rect.width, rect.height),
          r, r
        ));
      }
    });

    // EvenOdd: outer screen rect XOR inner cutout shapes → only exterior visible
    clipPath.setFillType(1);
  }

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Standard rendering for None / Notch / WaterDrop */}
      {!isDotOrIsland && (
        <>
          <Path
            path={path}
            style="stroke"
            strokeWidth={strokeWidth}
            color={color}
            start={start}
            end={end}
            strokeCap="round"
          >
            <BlurMask blur={blurRadius} style="normal" />
          </Path>
          <Path
            path={path}
            style="stroke"
            strokeWidth={strokeWidth / 2}
            color={color}
            start={start}
            end={end}
            strokeCap="round"
            opacity={0.8}
          />
        </>
      )}

      {/* Dot / Island: multi-layer outward glow beam */}
      {isDotOrIsland && glowPath && clipPath && (
        <Group clip={clipPath}>
          {/* Outer halo – widest, softest */}
          <Path
            path={glowPath}
            style="stroke"
            strokeWidth={GLOW_SPREAD}
            color={color}
            start={start}
            end={end}
            strokeCap="round"
            opacity={0.2}
          >
            <BlurMask blur={GLOW_SPREAD} style="normal" />
          </Path>
          {/* Mid glow */}
          <Path
            path={glowPath}
            style="stroke"
            strokeWidth={GLOW_SPREAD * 0.6}
            color={color}
            start={start}
            end={end}
            strokeCap="round"
            opacity={0.45}
          >
            <BlurMask blur={GLOW_SPREAD * 0.5} style="normal" />
          </Path>
          {/* Inner glow – brightest, closest to boundary */}
          <Path
            path={glowPath}
            style="stroke"
            strokeWidth={GLOW_SPREAD * 0.25}
            color={color}
            start={start}
            end={end}
            strokeCap="round"
            opacity={0.7}
          >
            <BlurMask blur={GLOW_SPREAD * 0.25} style="normal" />
          </Path>
        </Group>
      )}
    </Canvas>
  );
}
