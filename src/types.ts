export type CutoutType = 'Notch' | 'WaterDrop' | 'Dot' | 'Island' | 'None';

export interface CutoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Exact camera circle derived from DisplayCutout.getCutoutPath() on the native side. */
export interface CameraCircle {
  /** Center X in dp */
  cx: number;
  /** Center Y in dp */
  cy: number;
  /** Radius in dp */
  r: number;
}

export interface StatusEdgeData {
  cutoutType: CutoutType;
  cutoutRects: CutoutRect[];
  /**
   * Precise camera circle geometry extracted via getCutoutPath().computeBounds().
   * Present for Dot and Island types when the hidden API is accessible (API 31+).
   * Falls back to an empty array if reflection fails.
   */
  cameraCircles: CameraCircle[];
  safeAreaTop: number;
}

export interface StatusEdgeProps {
  isLoading?: boolean;
  color?: string;
  strokeWidth?: number;
  blurRadius?: number;
}
