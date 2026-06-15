import type { CutoutType, CutoutRect, CameraCircle } from './types';

/**
 * Pure geometry layer for {@link StatusEdge}.
 *
 * Path shapes are emitted as plain-data {@link PathCommand} arrays rather than
 * Skia paths so the geometry can be unit-tested without a Skia runtime (the
 * historical bugs in this file were all geometric — e.g. a wrong arc sweep
 * direction — so the maths is the part worth pinning down with tests).
 *
 * All coordinates are in dp, top-left origin, +y pointing DOWN — the same space
 * the native side reports cutout geometry in.
 */

export interface Oval {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PathCommand =
  | { op: 'move'; x: number; y: number }
  | { op: 'line'; x: number; y: number }
  | { op: 'quad'; cx: number; cy: number; x: number; y: number }
  /**
   * Elliptical arc over `oval`, swept from `start` degrees by `sweep` degrees.
   * Skia convention: angle 0 is the oval's right, measured CLOCKWISE with +y
   * down, so a point is `(cx + rx·cosθ, cy + ry·sinθ)`. A NEGATIVE sweep from
   * 180° passes through 90° (the bottom) — this is what makes a cutout dip
   * DOWN into the screen instead of bulging off the top edge.
   */
  | { op: 'arc'; oval: Oval; start: number; sweep: number }
  | { op: 'oval'; oval: Oval }
  | { op: 'rrect'; oval: Oval; rx: number; ry: number }
  | { op: 'rect'; oval: Oval }
  | { op: 'close' };

export interface CutoutGeometryInput {
  cutoutType: CutoutType;
  cutoutRects: CutoutRect[];
  cameraCircles: CameraCircle[];
  safeAreaTop: number;
  /** Index of the rect the native side actually classified (see mainRectIndex). */
  mainRectIndex: number;
  screenWidth: number;
  screenHeight: number;
  strokeWidth: number;
}

export interface BuiltPaths {
  /**
   * Comet travel path(s). For Dot/Island each entry is one closed shape (so a
   * seamless orbit can trim per-shape); for open types it is the top-edge path.
   */
  cometCommands: PathCommand[];
  /** True when the comet shapes are closed loops (Dot/Island) → can orbit seamlessly. */
  closed: boolean;
  /** Full screen border + cutout outline, for breathing/pulse styles. */
  outlineCommands: PathCommand[];
  /** EvenOdd clip mask for the comet (outer screen rect XOR cutout interior), or null. */
  clipCommands: PathCommand[] | null;
  /**
   * EvenOdd clip mask for the breathing/pulse outline. Tracks the outline's own
   * dip rather than the comet's, so the two stay consistent even if the outline
   * inset and comet top line ever diverge.
   */
  outlineClipCommands: PathCommand[] | null;
}

const WATERDROP_PADDING = 6;
const NOTCH_MAX_RADIUS = 10;

function oval(x: number, y: number, width: number, height: number): Oval {
  return { x, y, width, height };
}

function mainRect(g: CutoutGeometryInput): CutoutRect | undefined {
  const i =
    g.mainRectIndex >= 0 && g.mainRectIndex < g.cutoutRects.length
      ? g.mainRectIndex
      : 0;
  return g.cutoutRects[i];
}

// ---------------------------------------------------------------------------
// Cutout "dip" sub-paths (the part of the top edge that detours around a
// top-attached cutout). Each returns the x at which the dip is entered/exited
// at height `ty`, plus the commands assuming the pen is already at (enterX, ty).
// ---------------------------------------------------------------------------

interface Dip {
  enterX: number;
  exitX: number;
  commands: PathCommand[];
  /** Polygon enclosing the cutout interior (for the EvenOdd clip). */
  interior: PathCommand[];
}

function notchDip(rect: CutoutRect, ty: number): Dip {
  const bottomY = rect.y + rect.height;
  const x0 = rect.x;
  const x1 = rect.x + rect.width;
  // Clamp the corner radius to half of each straight segment's available
  // length so the rounded-rectangle outline never self-crosses on a shallow or
  // narrow notch. The left/right verticals are anchored at `ty`, so their span
  // is (bottomY - ty), not the full rect height.
  const r = Math.max(
    0,
    Math.min(NOTCH_MAX_RADIUS, rect.width / 2, (bottomY - ty) / 2)
  );

  return {
    enterX: x0 - r,
    exitX: x1 + r,
    commands: [
      { op: 'quad', cx: x0, cy: ty, x: x0, y: ty + r },
      { op: 'line', x: x0, y: bottomY - r },
      { op: 'quad', cx: x0, cy: bottomY, x: x0 + r, y: bottomY },
      { op: 'line', x: x1 - r, y: bottomY },
      { op: 'quad', cx: x1, cy: bottomY, x: x1, y: bottomY - r },
      { op: 'line', x: x1, y: ty + r },
      { op: 'quad', cx: x1, cy: ty, x: x1 + r, y: ty },
    ],
    interior: [{ op: 'rect', oval: oval(rect.x, 0, rect.width, bottomY) }],
  };
}

function waterDropDip(rect: CutoutRect, ty: number): Dip {
  const leftX = rect.x - WATERDROP_PADDING;
  const rightX = rect.x + rect.width + WATERDROP_PADDING;
  const inflatedW = rect.width + WATERDROP_PADDING * 2;
  const bottomY = rect.y + rect.height + WATERDROP_PADDING;
  // Ellipse centred on the top line (ty): horizontal semi-axis hugs the width,
  // vertical semi-axis equals the real drop depth, so the curve matches the
  // cutout for any aspect ratio (not forced to a half-circle) and its shoulders
  // stay on-screen. The lower half (swept -180° from 180°) is what we trace.
  const ry = Math.max(1, bottomY - ty);
  const ell = oval(leftX, ty - ry, inflatedW, ry * 2);

  return {
    enterX: leftX,
    exitX: rightX,
    // 180° (leftX,ty) → 90° (centre,bottomY) → 0° (rightX,ty): dips DOWN.
    commands: [{ op: 'arc', oval: ell, start: 180, sweep: -180 }],
    interior: [
      { op: 'move', x: leftX, y: 0 },
      { op: 'line', x: leftX, y: ty },
      { op: 'arc', oval: ell, start: 180, sweep: -180 },
      { op: 'line', x: rightX, y: 0 },
      { op: 'close' },
    ],
  };
}

/** The dip for a top-attached cutout, or null when it should fall back to a flat edge. */
function topDip(
  g: CutoutGeometryInput,
  rect: CutoutRect | undefined,
  ty: number
): Dip | null {
  if (!rect) return null;
  if (g.cutoutType === 'Notch') return notchDip(rect, ty);
  if (g.cutoutType === 'WaterDrop') {
    // Only dip when the drop is genuinely attached to the top edge.
    if (rect.y > g.safeAreaTop) return null;
    return waterDropDip(rect, ty);
  }
  return null;
}

/** A top edge from (startX,ty) to (endX,ty), detouring around a cutout if present. */
function topEdge(
  dip: Dip | null,
  ty: number,
  startX: number,
  endX: number
): PathCommand[] {
  if (!dip) {
    return [
      { op: 'move', x: startX, y: ty },
      { op: 'line', x: endX, y: ty },
    ];
  }
  return [
    { op: 'move', x: startX, y: ty },
    { op: 'line', x: dip.enterX, y: ty },
    ...dip.commands,
    { op: 'line', x: endX, y: ty },
  ];
}

// ---------------------------------------------------------------------------
// Closed cutout shapes (Dot circles / Island pills).
// ---------------------------------------------------------------------------

function dotShapes(g: CutoutGeometryInput): PathCommand[] {
  const cmds: PathCommand[] = [];
  g.cutoutRects.forEach((rect, idx) => {
    // Strictly per-index: a missing circle falls through to this rect's own
    // geometry, never to circle 0 (which would stamp every later dot onto the
    // first one's position).
    const exact = g.cameraCircles[idx];
    const r = exact ? exact.r : Math.min(rect.width, rect.height) / 2;
    const cx = exact ? exact.cx : rect.x + rect.width / 2;
    const cy = exact ? exact.cy : rect.y + rect.height / 2;
    cmds.push({ op: 'oval', oval: oval(cx - r, cy - r, r * 2, r * 2) });
  });
  return cmds;
}

function islandShapes(g: CutoutGeometryInput): PathCommand[] {
  return g.cutoutRects.map((rect) => {
    const r = rect.height / 2;
    return {
      op: 'rrect' as const,
      oval: oval(rect.x, rect.y, rect.width, rect.height),
      rx: r,
      ry: r,
    };
  });
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

export function buildPaths(g: CutoutGeometryInput): BuiltPaths {
  const { screenWidth: w, screenHeight: h, strokeWidth, cutoutType } = g;
  const ty = strokeWidth / 2; // top line, kept fully on-screen
  const inset = strokeWidth / 2; // border inset for breathing/pulse
  const screenRect: PathCommand = { op: 'rect', oval: oval(0, 0, w, h) };

  // Dot / Island: closed orbit around the cutout shape(s).
  if (cutoutType === 'Dot' || cutoutType === 'Island') {
    const shapes = cutoutType === 'Dot' ? dotShapes(g) : islandShapes(g);
    const borderRect: PathCommand = {
      op: 'rect',
      oval: oval(inset, inset, w - inset * 2, h - inset * 2),
    };
    const clip = shapes.length ? [screenRect, ...shapes] : null;
    return {
      cometCommands: shapes,
      closed: true,
      outlineCommands: [borderRect, ...shapes],
      clipCommands: clip,
      outlineClipCommands: clip,
    };
  }

  // None: flat top sweep / plain border.
  if (cutoutType === 'None') {
    return {
      cometCommands: [
        { op: 'move', x: 0, y: ty },
        { op: 'line', x: w, y: ty },
      ],
      closed: false,
      outlineCommands: [
        { op: 'rect', oval: oval(inset, inset, w - inset * 2, h - inset * 2) },
      ],
      clipCommands: null,
      outlineClipCommands: null,
    };
  }

  // Notch / WaterDrop assume the cutout is top-CENTER (every shipping device
  // reports its boundingRects there). A cutout hugging the left/right edge
  // (rect.x near 0 or w) is not specially handled; the inset outline border
  // would briefly backtrack, which no real device triggers.

  // Notch / WaterDrop: top edge that detours around the cutout.
  const rect = mainRect(g);
  const cometDip = topDip(g, rect, ty);
  const outlineDip = topDip(g, rect, inset);

  const cometCommands = topEdge(cometDip, ty, 0, w);

  const outlineCommands: PathCommand[] = [
    ...topEdge(outlineDip, inset, inset, w - inset),
    { op: 'line', x: w - inset, y: h - inset },
    { op: 'line', x: inset, y: h - inset },
    { op: 'close' },
  ];

  const clipCommands = cometDip ? [screenRect, ...cometDip.interior] : null;
  const outlineClipCommands = outlineDip
    ? [screenRect, ...outlineDip.interior]
    : null;

  return {
    cometCommands,
    closed: false,
    outlineCommands,
    clipCommands,
    outlineClipCommands,
  };
}
