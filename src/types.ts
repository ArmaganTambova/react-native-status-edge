export type CutoutType = 'Notch' | 'Dot' | 'Island' | 'None';

export interface CutoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StatusEdgeData {
  cutoutType: CutoutType;
  cutoutRects: CutoutRect[];
  cutoutPath?: string;
  safeAreaTop: number;
}

export interface StatusEdgeProps {
  isLoading?: boolean;
  color?: string;
  strokeWidth?: number;
  blurRadius?: number;
}
