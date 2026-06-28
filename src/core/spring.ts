// spring() — Remotion-compatible. A damped-harmonic curve from `from` to `to`.
export interface SpringConfig {
  damping?: number;
  mass?: number;
  stiffness?: number;
}

export function spring({
  frame,
  fps,
  config = {},
  from = 0,
  to = 1,
}: {
  frame: number;
  fps: number;
  config?: SpringConfig;
  from?: number;
  to?: number;
}): number {
  const { damping = 10, mass = 1, stiffness = 100 } = config;
  const t = Math.max(0, frame) / fps;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  let progress: number;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    progress = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  } else {
    progress = 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  }
  return from + (to - from) * progress;
}
