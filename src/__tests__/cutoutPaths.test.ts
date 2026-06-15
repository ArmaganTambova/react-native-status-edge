import { buildPaths, type PathCommand, type Oval } from '../cutoutPaths';
import type { CutoutGeometryInput } from '../cutoutPaths';

const base: Omit<CutoutGeometryInput, 'cutoutType' | 'cutoutRects'> = {
  cameraCircles: [],
  safeAreaTop: 40,
  mainRectIndex: 0,
  screenWidth: 400,
  screenHeight: 800,
  strokeWidth: 3,
};

function arcs(cmds: PathCommand[]) {
  return cmds.filter(
    (c): c is Extract<PathCommand, { op: 'arc' }> => c.op === 'arc'
  );
}
function ovalBottom(o: Oval) {
  return o.y + o.height;
}

describe('buildPaths', () => {
  it('None: flat top sweep, no clip, single inset border', () => {
    const b = buildPaths({ ...base, cutoutType: 'None', cutoutRects: [] });
    expect(b.closed).toBe(false);
    expect(b.clipCommands).toBeNull();
    expect(b.cometCommands).toEqual([
      { op: 'move', x: 0, y: 1.5 },
      { op: 'line', x: 400, y: 1.5 },
    ]);
    expect(b.outlineCommands).toHaveLength(1);
    expect(b.outlineCommands[0]).toEqual({
      op: 'rect',
      oval: { x: 1.5, y: 1.5, width: 397, height: 797 },
    });
  });

  describe('WaterDrop', () => {
    const rect = { x: 180, y: 0, width: 40, height: 18 };
    const g: CutoutGeometryInput = {
      ...base,
      cutoutType: 'WaterDrop',
      cutoutRects: [rect],
    };

    it('dips DOWN: the arc sweeps -180 (regression guard against the +180 bug)', () => {
      const b = buildPaths(g);
      const a = arcs(b.cometCommands);
      expect(a).toHaveLength(1);
      expect(a[0]!.start).toBe(180);
      expect(a[0]!.sweep).toBe(-180); // NEGATIVE → passes through the bottom (90°)
    });

    it('arc bottom reaches the real drop bottom (depth-aware ellipse)', () => {
      const b = buildPaths(g);
      const a = arcs(b.cometCommands)[0]!;
      const ty = 1.5;
      const bottomY = rect.y + rect.height + 6; // + WATERDROP_PADDING
      expect(ovalBottom(a.oval)).toBeCloseTo(bottomY, 5);
      // Vertical semi-axis tracks the real drop depth, not a forced circle.
      expect(a.oval.height).toBeCloseTo((bottomY - ty) * 2, 5);
      expect(a.oval.height).not.toBeCloseTo(a.oval.width, 5);
    });

    it('a tall drop produces an ellipse deeper than it is wide', () => {
      const tall = { x: 190, y: 0, width: 20, height: 26 };
      const a = arcs(
        buildPaths({ ...g, cutoutRects: [tall] }).cometCommands
      )[0]!;
      expect(a.oval.height).toBeGreaterThan(a.oval.width);
    });

    it('clip carves the drop interior with the same downward arc', () => {
      const b = buildPaths(g);
      expect(b.clipCommands).not.toBeNull();
      const a = arcs(b.clipCommands!)[0]!;
      expect(a.sweep).toBe(-180);
    });

    it('falls back to a flat edge when the drop is not top-attached', () => {
      const b = buildPaths({
        ...g,
        cutoutRects: [{ ...rect, y: 200 }],
        safeAreaTop: 40,
      });
      expect(arcs(b.cometCommands)).toHaveLength(0);
      expect(b.clipCommands).toBeNull();
    });
  });

  describe('Notch corner radius clamp', () => {
    it('clamps r so left/right verticals never reverse on a shallow notch', () => {
      const rect = { x: 150, y: 0, width: 120, height: 18 };
      const b = buildPaths({
        ...base,
        cutoutType: 'Notch',
        cutoutRects: [rect],
      });
      const ty = 1.5;
      const bottomY = rect.y + rect.height;
      // The left vertical runs from ty+r down to bottomY-r; it must not reverse.
      const quadDown = b.cometCommands.find(
        (c) => c.op === 'quad' && c.y === ty + clampedR(rect, ty)
      );
      expect(quadDown).toBeDefined();
      const r = clampedR(rect, ty);
      expect(r).toBeLessThan(10); // unclamped would have been 10 and reversed
      expect(bottomY - r).toBeGreaterThanOrEqual(ty + r);
    });

    it('keeps r=10 for a normal tall notch', () => {
      const rect = { x: 100, y: 0, width: 200, height: 34 };
      const r = clampedR(rect, 1.5);
      expect(r).toBe(10);
    });
  });

  describe('Dot / Island orbits are closed loops', () => {
    it('Dot uses the exact camera circle from cameraCircles', () => {
      const b = buildPaths({
        ...base,
        cutoutType: 'Dot',
        cutoutRects: [{ x: 190, y: 12, width: 20, height: 20 }],
        cameraCircles: [{ cx: 200, cy: 22, r: 9 }],
      });
      expect(b.closed).toBe(true);
      expect(b.cometCommands).toEqual([
        { op: 'oval', oval: { x: 191, y: 13, width: 18, height: 18 } },
      ]);
      expect(b.clipCommands).not.toBeNull();
    });

    it('Island is a pill (rrect with radius = height/2)', () => {
      const rect = { x: 130, y: 11, width: 126, height: 37 };
      const b = buildPaths({
        ...base,
        cutoutType: 'Island',
        cutoutRects: [rect],
      });
      expect(b.closed).toBe(true);
      expect(b.cometCommands).toEqual([
        { op: 'rrect', oval: rect, rx: 18.5, ry: 18.5 },
      ]);
    });

    it('Dot maps each rect to its OWN cameraCircle (dual camera)', () => {
      const b = buildPaths({
        ...base,
        cutoutType: 'Dot',
        cutoutRects: [
          { x: 40, y: 12, width: 20, height: 20 },
          { x: 340, y: 12, width: 20, height: 20 },
        ],
        cameraCircles: [
          { cx: 50, cy: 22, r: 9 },
          { cx: 350, cy: 22, r: 9 },
        ],
      });
      // Two distinct ovals at distinct centres — not two stamped on circle 0.
      expect(b.cometCommands).toEqual([
        { op: 'oval', oval: { x: 41, y: 13, width: 18, height: 18 } },
        { op: 'oval', oval: { x: 341, y: 13, width: 18, height: 18 } },
      ]);
    });

    it('Dot with fewer cameraCircles than rects falls back per-rect, not to circle 0', () => {
      const b = buildPaths({
        ...base,
        cutoutType: 'Dot',
        cutoutRects: [
          { x: 40, y: 12, width: 20, height: 20 },
          { x: 340, y: 12, width: 20, height: 20 },
        ],
        cameraCircles: [{ cx: 50, cy: 22, r: 9 }],
      });
      expect(b.cometCommands).toEqual([
        { op: 'oval', oval: { x: 41, y: 13, width: 18, height: 18 } }, // from circle 0
        { op: 'oval', oval: { x: 340, y: 12, width: 20, height: 20 } }, // from its OWN rect
      ]);
    });

    it('Dot with no rects yields an empty orbit but keeps the border', () => {
      const b = buildPaths({ ...base, cutoutType: 'Dot', cutoutRects: [] });
      expect(b.cometCommands).toEqual([]);
      expect(b.clipCommands).toBeNull();
      expect(b.closed).toBe(true);
      expect(b.outlineCommands).toEqual([
        { op: 'rect', oval: { x: 1.5, y: 1.5, width: 397, height: 797 } },
      ]);
    });
  });

  it('Notch/WaterDrop render around mainRectIndex, not always rect 0', () => {
    const decoy = { x: 0, y: 0, width: 4, height: 4 };
    const real = { x: 150, y: 0, width: 120, height: 30 };
    const b = buildPaths({
      ...base,
      cutoutType: 'Notch',
      cutoutRects: [decoy, real],
      mainRectIndex: 1,
    });
    // The dip's first quad control point sits at the real rect's left edge.
    const firstQuad = b.cometCommands.find((c) => c.op === 'quad');
    expect(firstQuad && firstQuad.op === 'quad' && firstQuad.cx).toBe(real.x);
  });

  it('out-of-range mainRectIndex clamps to rect 0', () => {
    const real = { x: 150, y: 0, width: 120, height: 30 };
    const decoy = { x: 0, y: 0, width: 4, height: 4 };
    const b = buildPaths({
      ...base,
      cutoutType: 'Notch',
      cutoutRects: [real, decoy],
      mainRectIndex: 99,
    });
    const firstQuad = b.cometCommands.find((c) => c.op === 'quad');
    expect(firstQuad && firstQuad.op === 'quad' && firstQuad.cx).toBe(real.x);
  });

  it('Notch with no rects falls back to a flat edge', () => {
    const b = buildPaths({ ...base, cutoutType: 'Notch', cutoutRects: [] });
    expect(b.cometCommands).toEqual([
      { op: 'move', x: 0, y: 1.5 },
      { op: 'line', x: 400, y: 1.5 },
    ]);
    expect(b.clipCommands).toBeNull();
    expect(b.closed).toBe(false);
  });

  it('WaterDrop clip interior is a well-formed closed polygon', () => {
    const rect = { x: 180, y: 0, width: 40, height: 18 };
    const b = buildPaths({
      ...base,
      cutoutType: 'WaterDrop',
      cutoutRects: [rect],
    });
    const c = b.clipCommands!;
    const leftX = rect.x - 6;
    const rightX = rect.x + rect.width + 6;
    expect(c[0]).toEqual({
      op: 'rect',
      oval: { x: 0, y: 0, width: 400, height: 800 },
    });
    expect(c[1]).toEqual({ op: 'move', x: leftX, y: 0 });
    expect(c[2]).toEqual({ op: 'line', x: leftX, y: 1.5 });
    const arc = c[3] as Extract<PathCommand, { op: 'arc' }>;
    expect(arc.op).toBe('arc');
    expect(arc.oval.x).toBe(leftX); // arc start (θ=180) == previous line endpoint
    expect(c[c.length - 2]).toEqual({ op: 'line', x: rightX, y: 0 });
    expect(c[c.length - 1]).toEqual({ op: 'close' });
  });

  it('Notch outline is a closed screen-border loop', () => {
    const rect = { x: 100, y: 0, width: 200, height: 34 };
    const b = buildPaths({ ...base, cutoutType: 'Notch', cutoutRects: [rect] });
    const o = b.outlineCommands;
    expect(o[0]).toEqual({ op: 'move', x: 1.5, y: 1.5 });
    expect(o[o.length - 3]).toEqual({ op: 'line', x: 398.5, y: 798.5 });
    expect(o[o.length - 2]).toEqual({ op: 'line', x: 1.5, y: 798.5 });
    expect(o[o.length - 1]).toEqual({ op: 'close' });
  });
});

function clampedR(
  rect: { width: number; height: number; y: number },
  ty: number
) {
  const bottomY = rect.y + rect.height;
  return Math.max(0, Math.min(10, rect.width / 2, (bottomY - ty) / 2));
}
