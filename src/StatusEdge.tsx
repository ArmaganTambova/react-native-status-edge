import { useEffect } from 'react';
import { useWindowDimensions, StyleSheet } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  BlurMask,
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
  const { width: screenWidth } = useWindowDimensions();
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
  const path = Skia.Path.Make();

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
  } else if (cutoutType === 'WaterDrop' || cutoutType === 'Dot' || cutoutType === 'Island') {
    if (cutoutRects && cutoutRects.length > 0) {
      cutoutRects.forEach((rect) => {
        const padding = 6;
        const inflatedW = rect.width + padding * 2;
        const inflatedH = rect.height + padding * 2;

        // Top-attached cutout (punch-hole at top edge or waterdrop notch):
        // Draw a U-shape from the left edge, around the bottom, to the right edge.
        // The top segment (return path) sits at y=0 and is hidden by the screen edge.
        //
        // safeAreaTop threshold: anything with rect.y < half of safe area is "top-attached"
        if (rect.y <= safeAreaTop * 0.5) {
          const leftX = rect.x - padding;
          const rightX = rect.x + rect.width + padding;
          // bottomY: the bottom of the inflated cutout bounding box (in dp)
          const bottomY = rect.y + rect.height + padding;
          // arcRadius: half of the inflated width for a smooth semicircle at the bottom
          const arcRadius = inflatedW / 2;
          // arcCenterY: center of the bottom semicircle
          const arcCenterY = bottomY - arcRadius;

          path.moveTo(leftX, 0);
          // Left side: go down to where the arc begins
          path.lineTo(leftX, Math.max(0, arcCenterY));

          // Bottom arc: arcToOval connects to the current path point (no new contour).
          // Start at 180° (leftmost), sweep +180° clockwise → passes through the bottom
          // → arrives at 0° (rightmost). This traces the bottom semicircle.
          const oval = Skia.XYWHRect(leftX, arcCenterY - arcRadius, inflatedW, inflatedW);
          path.arcToOval(oval, 180, 180, false);

          // Right side: go up to screen top edge
          path.lineTo(rightX, 0);
          // Return segment at y=0 (invisible, completes the closed loop for seamless animation)
          path.lineTo(leftX, 0);
          path.close();
        } else {
          // Floating cutout (Island or floating Dot):
          // Draw a closed pill/rounded-rect that orbits around it.
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
  }

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Glow Layer */}
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

      {/* Core Layer */}
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
    </Canvas>
  );
}
