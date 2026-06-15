export type CutoutType = 'Notch' | 'WaterDrop' | 'Dot' | 'Island' | 'None';

/**
 * Animation style. Every style is supported on every {@link CutoutType}.
 *
 * - `trace` — the default per-type "comet": a single beam enters from the
 *   top-left, traces the cutout outline, and exits top-right (one-shot, looping).
 * - `clockwise` — the beam continuously travels the top edge + cutout in the
 *   clockwise direction (for Dot/Island it orbits the shape clockwise).
 * - `counterclockwise` — same path travelled in the opposite direction.
 * - `breathing` — no travel; the full screen border + cutout outline glow
 *   smoothly fades in and out (a slow, even pulse).
 * - `pulse` — no travel; the full screen border + cutout outline emit a quick
 *   double "heartbeat" flash followed by a rest.
 */
export type AnimationStyle =
  | 'trace'
  | 'clockwise'
  | 'counterclockwise'
  | 'breathing'
  | 'pulse';

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
   * Index into {@link cutoutRects} of the rect the native side classified as
   * the primary cutout. The Notch/WaterDrop renderers use this so they draw
   * around the same rect classification was based on. Defaults to 0.
   */
  mainRectIndex?: number;
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
  /**
   * Animation style. Defaults to `'trace'` (the original per-cutout comet),
   * so existing usage is unchanged. See {@link AnimationStyle}.
   */
  animation?: AnimationStyle;
  /**
   * Duration of one full animation cycle in milliseconds.
   * Defaults to 2000 for travelling styles and 2600 for breathing/pulse.
   * For `pulse`, the heartbeat keeps a fixed ~600ms shape and `durationMs`
   * only stretches the idle rest, so the effective cycle never drops below
   * ~800ms.
   */
  durationMs?: number;
}
