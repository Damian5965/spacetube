// The transit tube centreline + sector palettes.
// IMPORTANT: keep PATH_GLSL in sync with pathX / pathY.

export const TUBE_RADIUS = 5.4;
export const PLAY_X = 6.9;
export const PLAY_Y = 4.8;

// The runner sticks to the inside of the tube: her feet touch the wall at
// radius TUBE_RADIUS and her body extends toward the axis.
export const WALL_RADIUS = TUBE_RADIUS;
export const RUNNER_CENTER_R = TUBE_RADIUS - 0.92;
export const BODY_HALF_ANGLE = 0.075;

/** Radial unit vector pointing from the tube axis to the wall at angle theta. */
export function radialAt(theta, out = { x: 0, y: 0 }) {
  out.x = Math.cos(theta);
  out.y = Math.sin(theta);
  return out;
}

/** Cross-section point on the wall (used for hazards and the camera). */
export function wallPoint(theta, radius) {
  return { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius };
}

/** Signed shortest angular distance a - b, wrapped into [-PI, PI]. */
export function angleDelta(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const AX1 = 1.25;
const AF1 = 0.0155;
const AX2 = 1.7;
const AF2 = 0.0063;
const AP2 = 1.2;
const AY1 = 1.0;
const BF1 = 0.0127;
const BP1 = 0.5;
const AY2 = 0.75;
const BF2 = 0.0073;
const BP2 = 2.2;

export function pathX(d) {
  return Math.sin(d * AF1) * AX1 + Math.sin(d * AF2 + AP2) * AX2;
}
export function pathY(d) {
  return Math.cos(d * BF1 + BP1) * AY1 + Math.sin(d * BF2 + BP2) * AY2;
}

export function pathTangent(d, out = { x: 0, y: 0, z: 0 }) {
  out.x = Math.cos(d * AF1) * AX1 * AF1 + Math.cos(d * AF2 + AP2) * AX2 * AF2;
  out.y = -Math.sin(d * BF1 + BP1) * AY1 * BF1 + Math.cos(d * BF2 + BP2) * AY2 * BF2;
  out.z = 1;
  return out;
}

export const PATH_GLSL = /* glsl */ `
  const float AX1 = ${AX1.toFixed(5)};
  const float AF1 = ${AF1.toFixed(6)};
  const float AX2 = ${AX2.toFixed(5)};
  const float AF2 = ${AF2.toFixed(6)};
  const float AP2 = ${AP2.toFixed(6)};
  const float AY1 = ${AY1.toFixed(5)};
  const float BF1 = ${BF1.toFixed(6)};
  const float BP1 = ${BP1.toFixed(6)};
  const float AY2 = ${AY2.toFixed(5)};
  const float BF2 = ${BF2.toFixed(6)};
  const float BP2 = ${BP2.toFixed(6)};
  vec2 pathCenter(float d) {
    return vec2(
      sin(d * AF1) * AX1 + sin(d * AF2 + AP2) * AX2,
      cos(d * BF1 + BP1) * AY1 + sin(d * BF2 + BP2) * AY2
    );
  }
`;

export const SECTORS = [
  {
    key: 'cargo',
    name: 'CARGO SPINE',
    bg: 0x07080a,
    fog: 0x2a2a18,
    fogDensity: 0.013,
    tubeA: 0x6a6f70,
    tubeB: 0xffc46a,
    lamp: 0xffd79a,
    haze: '#ffd06a',
    hazard: 0xffb32a,
    accentCss: '#ffc46a',
    glow: '#ffb545',
    nebula: ['#4a3a12', '#101410', '#ff9a3d'],
    planet: 'ember',
  },
  {
    key: 'foundry',
    name: 'FOUNDRY LINE',
    bg: 0x0a0605,
    fog: 0x341410,
    fogDensity: 0.014,
    tubeA: 0x7a5a4e,
    tubeB: 0xff7a4a,
    lamp: 0xffb183,
    haze: '#ff8a4a',
    hazard: 0xff5a2a,
    accentCss: '#ff8f5e',
    glow: '#ff6a3d',
    nebula: ['#6b2a10', '#170a0b', '#ffb36a'],
    planet: 'ember',
  },
  {
    key: 'coolant',
    name: 'COOLANT RING',
    bg: 0x04090a,
    fog: 0x14282a,
    fogDensity: 0.013,
    tubeA: 0x5e767a,
    tubeB: 0x8ff0d2,
    lamp: 0xc8fff0,
    haze: '#7dffd6',
    hazard: 0x5de0b0,
    accentCss: '#8ff0d2',
    glow: '#5affc8',
    nebula: ['#0c4a46', '#06131a', '#a8ff9a'],
    planet: 'teal',
  },
  {
    key: 'reactor',
    name: 'REACTOR DECK',
    bg: 0x090604,
    fog: 0x2c2108,
    fogDensity: 0.012,
    tubeA: 0x7c7458,
    tubeB: 0xffe08a,
    lamp: 0xfff4c8,
    haze: '#fff0a0',
    hazard: 0xffd93a,
    accentCss: '#ffe08a',
    glow: '#ffcf5a',
    nebula: ['#5a4412', '#141007', '#ffd86a'],
    planet: 'ember',
  },
  {
    key: 'deep',
    name: 'DEEP SHAFT',
    bg: 0x050408,
    fog: 0x1a1826,
    fogDensity: 0.015,
    tubeA: 0x5a5a6e,
    tubeB: 0x9fb4ff,
    lamp: 0xd8e0ff,
    haze: '#9fb4ff',
    hazard: 0x8fa4ff,
    accentCss: '#9fb4ff',
    glow: '#8fa4ff',
    nebula: ['#1a2050', '#08060f', '#b0c0ff'],
    planet: 'violet',
  },
];

export function sectorFor(level) {
  return SECTORS[(Math.max(1, level) - 1) % SECTORS.length];
}
