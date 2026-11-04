export const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
export const envelope = (t: number, start: number, end: number, fade = 0.5) =>
  smooth((t - start) / fade) * smooth((end - t) / fade);
export function random(seed: number) {
  let s = seed;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; };
}
