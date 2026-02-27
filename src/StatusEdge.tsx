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

const GLOW_SPREAD = 18;

export default function StatusEdge({
  isLoading = false,
  color = '#00FF00',
  strokeWidth = 3,
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

  // mainPath: the comet travel path for all cutout types
  const mainPath = Skia.Path.Make();
  // clipPath: EvenOdd mask to prevent glow from bleeding into the cutout interior.
  // null for None (no cutout — canvas edge handles clipping naturally).
  let clipPath: ReturnType<typeof Skia.Path.Make> | null = null;

  if (cutoutType === 'None') {
    // Simple horizontal sweep across the top of the screen
    mainPath.moveTo(0, strokeWidth / 2);
    mainPath.lineTo(screenWidth, strokeWidth / 2);

  } else if (cutoutType === 'Notch') {
    const rect = cutoutRects[0];
    if (rect) {
      const r = 10;
      const bottomY = rect.y + rect.height;

      // Travel from left edge, dip around the notch, continue to right edge
      mainPath.moveTo(0, strokeWidth / 2);
      mainPath.lineTo(rect.x - r, strokeWidth / 2);
      mainPath.quadTo(rect.x, strokeWidth / 2, rect.x, strokeWidth / 2 + r);
      mainPath.lineTo(rect.x, bottomY - r);
      mainPath.quadTo(rect.x, bottomY, rect.x + r, bottomY);
      mainPath.lineTo(rect.x + rect.width - r, bottomY);
      mainPath.quadTo(rect.x + rect.width, bottomY, rect.x + rect.width, bottomY - r);
      mainPath.lineTo(rect.x + rect.width, strokeWidth / 2 + r);
      mainPath.quadTo(rect.x + rect.width, strokeWidth / 2, rect.x + rect.width + r, strokeWidth / 2);
      mainPath.lineTo(screenWidth, strokeWidth / 2);

      // EvenOdd clip: screen rect XOR notch rect → glow only radiates outward
      clipPath = Skia.Path.Make();
      clipPath.addRect(Skia.XYWHRect(0, 0, screenWidth, screenHeight));
      clipPath.addRect(Skia.XYWHRect(rect.x, 0, rect.width, rect.y + rect.height));
      clipPath.setFillType(1);
    } else {
      mainPath.moveTo(0, strokeWidth / 2);
      mainPath.lineTo(screenWidth, strokeWidth / 2);
    }

  } else if (cutoutType === 'WaterDrop') {
    const rect = cutoutRects[0];
    if (rect && rect.y <= safeAreaTop * 0.5) {
      // Waterdrop attached to the top edge:
      // Travel from left → down the left side → around the semicircular bottom → up the right side → right edge
      const padding = 6;
      const inflatedW = rect.width + padding * 2;
      const leftX = rect.x - padding;
      const rightX = rect.x + rect.width + padding;
      const bottomY = rect.y + rect.height + padding;
      const arcRadius = inflatedW / 2;
      const arcCenterY = bottomY - arcRadius;
      const oval = Skia.XYWHRect(leftX, arcCenterY - arcRadius, inflatedW, inflatedW);

      mainPath.moveTo(0, strokeWidth / 2);
      mainPath.lineTo(leftX, strokeWidth / 2);
      mainPath.lineTo(leftX, Math.max(strokeWidth / 2, arcCenterY));
      // Arc from left (180°) sweeping 180° clockwise → arrives at right (0°)
      mainPath.arcToOval(oval, 180, 180, false);
      mainPath.lineTo(rightX, strokeWidth / 2);
      mainPath.lineTo(screenWidth, strokeWidth / 2);

      // EvenOdd clip: screen rect XOR waterdrop interior → glow only radiates outward
      const dropInterior = Skia.Path.Make();
      dropInterior.moveTo(leftX, 0);
      dropInterior.lineTo(leftX, arcCenterY);
      dropInterior.arcToOval(oval, 180, 180, false);
      dropInterior.lineTo(rightX, 0);
      dropInterior.close();

      clipPath = Skia.Path.Make();
      clipPath.addRect(Skia.XYWHRect(0, 0, screenWidth, screenHeight));
      clipPath.addPath(dropInterior);
      clipPath.setFillType(1);
    } else {
      // Non-top waterdrop or no rect — fall back to simple horizontal sweep
      mainPath.moveTo(0, strokeWidth / 2);
      mainPath.lineTo(screenWidth, strokeWidth / 2);
    }

  } else if (cutoutType === 'Dot' || cutoutType === 'Island') {
    // Dot / Island: orbit path sits exactly on the cutout boundary.
    // Clip path (EvenOdd) ensures glow radiates outward only.
    clipPath = Skia.Path.Make();
    clipPath.addRect(Skia.XYWHRect(0, 0, screenWidth, screenHeight));

    const cameraCircles = data?.cameraCircles ?? [];

    cutoutRects.forEach((rect, idx) => {
      if (cutoutType === 'Dot') {
        // Prefer exact circle from getCutoutPath() (native, API 31+).
        // Native returns null when the path is an OEM safe-area column so that
        // we always fall through to the cutoutRect-based calculation below.
        const exact = cameraCircles[idx] ?? cameraCircles[0];
        // Use the minimum dimension as radius so we always get a circle that
        // fits inside the bounding rect regardless of its aspect ratio.
        const r  = exact ? exact.r  : Math.min(rect.width, rect.height) / 2;
        const cx = exact ? exact.cx : rect.x + rect.width / 2;
        // Fallback positioning for when exact camera data is unavailable (e.g. Android 11,
        // or devices where the OS provides a tall safe-area column instead of a cutout path).
        //
        // If the reported rect is a tall column (h > w), the physical camera is rarely at the
        // mathematical center (too high on Samsung) or at the bottom (too low).
        // We use a weighted average (75% down) to approximate the visual center.
        // For square/wide rects, we stick to the mathematical center.
        let cy = 0;
        if (exact) {
          cy = exact.cy;
        } else if (rect.height > rect.width * 1.2) {
          // Significantly tall column (aspect ratio > 1.2):
          // Likely a safe-area column (Samsung style) rather than a physical hole.
          // Camera is lower than the middle.
          // rect.y + rect.height is the bottom of the status bar.
          // (rect.y + rect.height/2) is the middle.
          // Averaging them places it at 75% height, which aligns better with actual hardware.
          cy = rect.y + (rect.height * 0.75);
        } else {
          // Standard tight cutout (circular or slightly oval): Center is correct.
          cy = rect.y + rect.height / 2;
        }
        const cameraOval = Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2);

        mainPath.addOval(cameraOval);
        clipPath!.addOval(cameraOval);
      } else {
        // Island: pill-shaped floating cutout
        const r = rect.height / 2;
        mainPath.addRRect(Skia.RRectXY(
          Skia.XYWHRect(rect.x, rect.y, rect.width, rect.height),
          r, r
        ));
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
      {/* All types share the same 3-layer outward glow beam */}
      <Group clip={clipPath ?? undefined}>
        {/* Outer halo – widest, softest */}
        <Path
          path={mainPath}
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
          path={mainPath}
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
          path={mainPath}
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
    </Canvas>
  );
}
