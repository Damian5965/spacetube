// The transit tube centreline + sector palettes.
// IMPORTANT: keep PATH_GLSL in sync with pathX / pathY.

export const TUBE_RADIUS = 10;
export const PLAY_X = 6.9;
export const PLAY_Y = 4.8;

const AX1 = 3.4;
const AF1 = 0.0155;
const AX2 = 4.6;
const AF2 = 0.0063;
const AP2 = 1.2;
const AY1 = 2.6;
const BF1 = 0.0127;
const BP1 = 0.5;
const AY2 = 1.9;
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
    key: 'ion',
    name: 'ION THREAD',
    bg: 0x030217,
    tubeA: 0x0a1d5c,
    tubeB: 0x27c8ff,
    accentCss: '#6ef3ff',
    glow: '#3bd6ff',
    nebula: ['#2b1a6e', '#0a4a66', '#ff2f9a'],
    planet: 'violet',
  },
  {
    key: 'rift',
    name: 'MAGENTA RIFT',
    bg: 0x0b0216,
    tubeA: 0x4a0a4c,
    tubeB: 0xff3fbf,
    accentCss: '#ff7ade',
    glow: '#ff45d4',
    nebula: ['#6b1a5e', '#2a0b47', '#ff7a3d'],
    planet: 'ember',
  },
  {
    key: 'coil',
    name: 'EMERALD COIL',
    bg: 0x01100d,
    tubeA: 0x053a2e,
    tubeB: 0x63ffb8,
    accentCss: '#9dffcf',
    glow: '#4dffb0',
    nebula: ['#0c5e46', '#062638', '#d4ff5e'],
    planet: 'teal',
  },
  {
    key: 'flare',
    name: 'SOLAR FLARE',
    bg: 0x120601,
    tubeA: 0x5e1b05,
    tubeB: 0xffb03d,
    accentCss: '#ffd28a',
    glow: '#ffa53d',
    nebula: ['#8a3410', '#3d0f08', '#ffd05e'],
    planet: 'ember',
  },
  {
    key: 'void',
    name: 'VOID BLOOM',
    bg: 0x08031a,
    tubeA: 0x331a66,
    tubeB: 0xd9c8ff,
    accentCss: '#e2d4ff',
    glow: '#b18cff',
    nebula: ['#4a2a8f', '#8f2a6e', '#d9c8ff'],
    planet: 'violet',
  },
];

export function sectorFor(level) {
  return SECTORS[(Math.max(1, level) - 1) % SECTORS.length];
}
