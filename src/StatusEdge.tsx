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

  // Comet length
  const length = 0.3;
  const totalDuration = 2000;

  useEffect(() => {
    if (isLoading) {
      // Animate from 0 to 1 + length so the tail disappears
      progress.value = withRepeat(
        withTiming(1 + length, { duration: totalDuration, easing: Easing.linear }),
        -1, // Infinite
        false // Do not reverse
      );
    } else {
      cancelAnimation(progress);
      progress.value = 0;
    }
  }, [isLoading, length, totalDuration, progress]);

  const start = useDerivedValue(() => {
    // Clamp between 0 and 1
    const val = progress.value - length;
    return Math.max(0, Math.min(1, val));
  });

  const end = useDerivedValue(() => {
    // Clamp between 0 and 1
    return Math.min(1, Math.max(0, progress.value));
  });

  if (!data) return null;
  if (!isLoading) return null;

  const { cutoutType, cutoutRects } = data;
  const path = Skia.Path.Make();

  if (cutoutType === 'None') {
    path.moveTo(0, strokeWidth / 2);
    path.lineTo(screenWidth, strokeWidth / 2);
  } else if (cutoutType === 'Notch') {
    const rect = cutoutRects[0];
    if (rect) {
      const r = 10;
      const bottomY = rect.height; // Using rect height directly.

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
  } else if (cutoutType === 'Island' || cutoutType === 'Dot') {
    if (cutoutRects && cutoutRects.length > 0) {
        cutoutRects.forEach((rect: any) => {
             // Inflate rect to draw around the cutout
             const padding = 6;
             const inflatedX = rect.x - padding;
             const inflatedY = rect.y - padding;
             const inflatedW = rect.width + (padding * 2);
             const inflatedH = rect.height + (padding * 2);

             // Use the smaller dimension for full rounded corners (pill/circle)
             const r = Math.min(inflatedW, inflatedH) / 2;

             // Create a temporary path for this rect
             const tempPath = Skia.Path.Make();
             tempPath.addRRect(Skia.RRectXY(
               Skia.XYWHRect(inflatedX, inflatedY, inflatedW, inflatedH),
               r, r
             ));

             // Add it to the main path
             path.addPath(tempPath);
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
