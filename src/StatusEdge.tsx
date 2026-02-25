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
  // If not loading, we can return null or render nothing.
  // Returning null unmounts the Canvas which is fine.
  if (!isLoading) return null;

  const { cutoutType, cutoutRects } = data;
  const path = Skia.Path.Make();

  if (cutoutType === 'None') {
    path.moveTo(0, strokeWidth / 2);
    path.lineTo(screenWidth, strokeWidth / 2);
  } else if (cutoutType === 'Notch') {
    // For Notch, we usually follow the main cutout
    const rect = cutoutRects[0];
    if (rect) {
      const r = 10;
      const bottomY = rect.height; // Using rect height directly.

      path.moveTo(0, strokeWidth / 2);

      // Ensure we don't draw past notch if r is too big, but simplified:
      // If notch is at 0, rect.x is 0.
      path.lineTo(rect.x - r, strokeWidth / 2);

      // Top-left corner of notch
      path.quadTo(rect.x, strokeWidth / 2, rect.x, strokeWidth / 2 + r);

      // Down left side
      path.lineTo(rect.x, bottomY - r);

      // Bottom-left corner
      path.quadTo(rect.x, bottomY, rect.x + r, bottomY);

      // Bottom
      path.lineTo(rect.x + rect.width - r, bottomY);

      // Bottom-right corner
      path.quadTo(rect.x + rect.width, bottomY, rect.x + rect.width, bottomY - r);

      // Up right side
      path.lineTo(rect.x + rect.width, strokeWidth / 2 + r);

      // Top-right corner
      path.quadTo(rect.x + rect.width, strokeWidth / 2, rect.x + rect.width + r, strokeWidth / 2);

      path.lineTo(screenWidth, strokeWidth / 2);
    } else {
        // Fallback if no rect
        path.moveTo(0, strokeWidth / 2);
        path.lineTo(screenWidth, strokeWidth / 2);
    }
  } else if (cutoutType === 'Island' || cutoutType === 'Dot') {
    // For Island/Dot, we might have multiple cutouts (e.g. pill + hole)
    // We should draw around all of them.
    if (cutoutRects && cutoutRects.length > 0) {
        cutoutRects.forEach((rect: any) => {
             // RRect
             // Use smaller of width/height for radius to ensure it is fully rounded
             // For a circle, width=height, r=height/2.
             // For a pill, r=height/2.
             const r = Math.min(rect.width, rect.height) / 2;

             path.addRRect(Skia.RRectXY(
               Skia.XYWHRect(rect.x, rect.y, rect.width, rect.height),
               r, r
             ));
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
