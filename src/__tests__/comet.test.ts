import { computeSegments } from '../comet';

const L = 0.3;

describe('computeSegments', () => {
  describe('open-path sweep', () => {
    it('forward: comet travels start→end as p grows', () => {
      const early = computeSegments(0.2, false, true, L);
      const late = computeSegments(0.7, false, true, L);
      expect(early.aEnd).toBeLessThan(late.aEnd);
      expect(early.bStart).toBe(0);
      expect(early.bEnd).toBe(0); // open paths never use the wrap segment
    });

    it('forward: fully entered/exited and clamped to [0,1]', () => {
      const s = computeSegments(0.5, false, true, L);
      expect(s.aStart).toBeCloseTo(0.35, 6);
      expect(s.aEnd).toBeCloseTo(0.65, 6);
      const end = computeSegments(1, false, true, L);
      expect(end.aStart).toBe(1);
      expect(end.aEnd).toBe(1); // comet has exited the right edge
    });

    it('backward mirrors the forward segment to the opposite side', () => {
      const f = computeSegments(0.2, false, true, L);
      const b = computeSegments(0.2, false, false, L);
      expect(b.aStart).toBeCloseTo(1 - f.aEnd, 6);
      expect(b.aEnd).toBeCloseTo(1 - f.aStart, 6);
    });
  });

  describe('closed-path orbit', () => {
    it('forward, no wrap: single segment trailing the head', () => {
      const s = computeSegments(0.5, true, true, L);
      expect(s.aStart).toBeCloseTo(0.2, 6);
      expect(s.aEnd).toBeCloseTo(0.5, 6);
      expect(s.bEnd).toBe(0);
    });

    it('forward, wrapping the seam: two segments cover the comet', () => {
      const s = computeSegments(0.1, true, true, L);
      expect(s.aStart).toBeCloseTo(0.8, 6);
      expect(s.aEnd).toBe(1);
      expect(s.bStart).toBe(0);
      expect(s.bEnd).toBeCloseTo(0.1, 6);
      // The two pieces sum to the full comet length.
      expect(s.aEnd - s.aStart + (s.bEnd - s.bStart)).toBeCloseTo(L, 6);
    });

    it('backward: head moves the opposite way around the loop', () => {
      const s = computeSegments(0.1, true, false, L);
      expect(s.aStart).toBeCloseTo(0.6, 6);
      expect(s.aEnd).toBeCloseTo(0.9, 6);
    });

    it('backward wrapping the seam', () => {
      const s = computeSegments(0.95, true, false, L);
      expect(s.aStart).toBeCloseTo(0.75, 6);
      expect(s.aEnd).toBe(1);
      expect(s.bEnd).toBeCloseTo(0.05, 6);
    });
  });
});
