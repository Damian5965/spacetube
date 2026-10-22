// Small shared helpers — no dependencies.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;
export const sign = (v) => (v < 0 ? -1 : 1);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const dist2 = (x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
};

const nf = new Intl.NumberFormat('en-US');
export const fmtScore = (n) => nf.format(Math.max(0, Math.round(n)));
export const fmtDistance = (meters) => {
  const m = Math.max(0, meters);
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
};
export const fmtMultiplier = (m) => `×${m.toFixed(m % 1 === 0 ? 1 : 2)}`;

/** Tiny fixed-capacity ring buffer pool. */
export class Pool {
  constructor(factory, reset, size = 0) {
    this.factory = factory;
    this.reset = reset;
    this.items = [];
    for (let i = 0; i < size; i++) this.items.push(factory());
  }
  get() {
    const item = this.items.pop() || this.factory();
    if (this.reset) this.reset(item);
    return item;
  }
  release(item) {
    this.items.push(item);
  }
}

/** Convert a world position to viewport pixels. */
export function toScreen(position, camera, width, height) {
  const p = position.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * width,
    y: (-p.y * 0.5 + 0.5) * height,
    visible: p.z < 1 && p.z > -1,
  };
}

export const isTouch = () =>
  (typeof window !== 'undefined' && 'ontouchstart' in window) ||
  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);


const TIPS = [
  'TIP // near-misses charge overdrive',
  'TIP // chain kills without taking damage for a bigger multiplier',
  'TIP // green cells patch your hull, violet cells grant a shield',
  'TIP // shoot the Warden\'s core, not its armour',
  'TIP // the gate ring is always friendly',
  'TIP // overdrive makes your score climb faster than your hull drops',
  'TIP // hold SHIFT to burn the reactor',
  'TIP // drones glow red before they fire — move',
];

export const randomTip = () => TIPS[(Math.random() * TIPS.length) | 0];
