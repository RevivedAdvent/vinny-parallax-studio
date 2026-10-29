import type { Easing } from './types.ts';

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
export function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}
/** A random-access integer hash: evaluation order cannot consume or alter its state. */
export function seededValue(seed: number, index: number) {
  let n = (seed ^ Math.imul(index, 0x9e3779b9)) | 0;
  n ^= n >>> 16; n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15; n = Math.imul(n, 0x846ca68b); n ^= n >>> 16;
  return (n >>> 0) / 4294967295 * 2 - 1;
}
export function drift(position: number, seed: number) {
  const index = Math.floor(position), t = position - index;
  const s = t * t * (3 - 2 * t);
  return seededValue(seed, index) * (1 - s) + seededValue(seed, index + 1) * s;
}
export function ease(name: Easing, progress: number): number {
  const t = clamp(progress, 0, 1);
  if (t === 0 || t === 1) return t;
  switch (name) {
    case 'linear': case 'seeded_noise': return t;
    case 'ease_in': return t * t;
    case 'ease_out': return 1 - (1 - t) * (1 - t);
    case 'ease_in_out': return t * t * (3 - 2 * t);
    case 'hold': return 0;
    case 'overshoot_settle': {
      const s = t - 1, c = 1.70158;
      return 1 + (c + 1) * s * s * s + c * s * s;
    }
    default: throw new Error(`Unknown easing: ${String(name)}`);
  }
}
