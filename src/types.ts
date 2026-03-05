export type CutoutType = 'Notch' | 'WaterDrop' | 'Dot' | 'Island' | 'None';

export interface CutoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Exact camera circle geometry derived from DisplayCutout.getCutoutPath()
 * (Android 12 / API 31+) or from the bounding rect as a fallback.
 * All values are in dp (density-independent pixels).
 */
export interface CameraCircle {
  /** Horizontal centre of the camera hole, in dp from the left edge of the screen. */
  cx: number;
  /** Vertical centre of the camera hole, in dp from the top of the screen. */
  cy: number;
  /** Radius of the camera hole in dp. */
  r: number;
}

export interface StatusEdgeData {
  cutoutType: CutoutType;
  /** Bounding rectangles of all cutout areas (dp). */
  cutoutRects: CutoutRect[];
  /**
   * Precise camera circle(s) in dp.
   * Populated for Dot and Island cutout types.
   * Source priority:
   *   1. getCutoutPath().computeBounds() when the path is circular (AOSP / Pixel / OnePlus).
   *   2. boundingRects geometry when the path is a safe-area slab (Samsung One UI).
   */
  cameraCircles: CameraCircle[];
  /** Top safe-area inset in dp (height of the status bar / cutout region). */
  safeAreaTop: number;
  /**
   * SVG-like polyline approximation of getCutoutPath() in physical pixels (px).
   * Coordinates use Android screen space: origin at top-left, positive Y downward.
   * Divide each coordinate by the screen pixel ratio to convert to dp.
   * Empty string on devices without a cutout or below Android 12.
   */
  cutoutPathSvg?: string;
  /**
   * Bounding box of the full cutout path in dp.
   * Useful as a lightweight alternative to parsing cutoutPathSvg.
   * null when no cutout path is available.
   */
  cutoutPathBounds?: CutoutRect | null;
}

export interface StatusEdgeProps {
  isLoading?: boolean;
  color?: string;
  strokeWidth?: number;
}
