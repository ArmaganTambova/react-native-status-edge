/**
 * Comet trim maths for {@link StatusEdge}, kept Skia-free so it can be unit
 * tested directly. The single linear 0→1 driver is mapped to one or two trimmed
 * path segments depending on whether the path is an open sweep or a closed orbit.
 */

/** Length of the travelling comet as a fraction of the total path length. */
export const COMET_LENGTH = 0.3;

export interface Segments {
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
}

/**
 * @param p        linear driver in [0,1]
 * @param isOrbit  true for closed Dot/Island paths (wraps across the seam)
 * @param forward  false reverses the travel direction (counter-clockwise)
 * @param length   comet length as a fraction of path length
 */
export function computeSegments(
  p: number,
  isOrbit: boolean,
  forward: boolean,
  length: number
): Segments {
  'worklet';
  if (isOrbit) {
    let head = forward ? p : 1 - p;
    head = head - Math.floor(head); // wrap into [0,1)
    const tail = head - length;
    if (tail >= 0) {
      return { aStart: tail, aEnd: head, bStart: 0, bEnd: 0 };
    }
    // Comet straddles the seam: [tail+1, 1] continues into [0, head].
    return { aStart: tail + 1, aEnd: 1, bStart: 0, bEnd: head };
  }
  const t = p * (1 + length);
  const s = Math.min(1, Math.max(0, t - length));
  const e = Math.min(1, Math.max(0, t));
  if (forward) return { aStart: s, aEnd: e, bStart: 0, bEnd: 0 };
  return { aStart: 1 - e, aEnd: 1 - s, bStart: 0, bEnd: 0 };
}
