// Procedural canvas textures — no external image assets.
import * as THREE from 'three';
import { TAU, rand } from './util.js';

const cache = new Map();

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, { repeat = false, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

/** Soft round glow — used by sprites, particles, engine flames. */
export function glowTexture(color = '#ffffff') {
  return cached(`glow:${color}`, () => {
    const c = canvas(128);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.14, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.32, color);
    g.addColorStop(0.72, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return finish(c);
  });
}

/** Four-point star sparkle. */
export function starTexture() {
  return cached('star', () => {
    const c = canvas(128);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(200,245,255,0.55)');
    g.addColorStop(0.6, 'rgba(120,200,255,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.globalCompositeOperation = 'lighter';
    const spike = (w, h) => {
      const grd = ctx.createLinearGradient(64 - w, 64, 64 + w, 64);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(64 - w, 64 - h, w * 2, h * 2);
    };
    spike(60, 1.5);
    ctx.translate(64, 64);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-64, -64);
    spike(44, 1.2);
    return finish(c);
  });
}

/** Hazard stripe panel for barriers. */
export function hazardTexture(accent = '#ff7a2f', base = '#170a10') {
  return cached(`hazard:${accent}:${base}`, () => {
    const c = canvas(256);
    const ctx = c.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(-Math.PI / 4);
    ctx.translate(-200, -200);
    for (let i = 0; i < 16; i++) {
      if (i % 2) continue;
      ctx.fillStyle = i % 4 === 0 ? accent : 'rgba(20,8,8,0.85)';
      ctx.fillRect(i * 32, 0, 20, 420);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, 244, 244);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 64);
      ctx.lineTo(256, i * 64);
      ctx.stroke();
    }
    // rivets
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    for (let x = 22; x < 256; x += 64) {
      for (let y = 22; y < 256; y += 64) {
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, TAU);
        ctx.fill();
      }
    }
    return finish(c);
  });
}

/** Hex energy field. */
export function hexTexture(color = '#ff3c8e') {
  return cached(`hex:${color}`, () => {
    const c = canvas(256);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.8;
    const r = 22;
    const h = Math.sqrt(3) * r;
    for (let row = -1; row < 8; row++) {
      for (let col = -1; col < 7; col++) {
        const cx = col * r * 1.5;
        const cy = row * h + (col % 2 ? h / 2 : 0);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    const tex = finish(c, { repeat: true });
    tex.repeat.set(2, 2);
    return tex;
  });
}

/** Nebula clouds built from stacked gradients + star specks. */
export function nebulaTexture(colors = ['#5b2bd9', '#1a6b8a', '#ff3fbf'], seed = 1) {
  return cached(`nebula:${colors.join()}:${seed}`, () => {
    const S = 512;
    const c = canvas(S);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, S, S);
    let s = seed * 9301 + 49297;
    const rnd = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = 40 + rnd() * 170;
      const col = colors[(rnd() * colors.length) | 0];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col);
      g.addColorStop(0.35, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.045 + rnd() * 0.1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // fade the edges so the sprite never shows a hard square border
    ctx.globalCompositeOperation = 'destination-in';
    const mask = ctx.createRadialGradient(S / 2, S / 2, S * 0.06, S / 2, S / 2, S * 0.5);
    mask.addColorStop(0, 'rgba(0,0,0,1)');
    mask.addColorStop(0.55, 'rgba(0,0,0,0.85)');
    mask.addColorStop(0.82, 'rgba(0,0,0,0.25)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.5})`;
      const x = rnd() * S;
      const y = rnd() * S;
      ctx.fillRect(x, y, rnd() * 1.6 + 0.4, rnd() * 1.6 + 0.4);
    }
    return finish(c);
  });
}

/** Banded gas giant map. */
export function planetTexture(palette = 'violet') {
  return cached(`planet:${palette}`, () => {
    const W = 1024;
    const H = 512;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const palettes = {
      violet: ['#1a0b3d', '#3b1a7a', '#7b45c9', '#c08bff', '#3b1a7a', '#1a0b3d'],
      ember: ['#1c0906', '#531a12', '#a53a1e', '#e8894a', '#531a12', '#1c0906'],
      teal: ['#031416', '#0b3b3f', '#1d7273', '#67c9bd', '#0b3b3f', '#031416'],
    };
    const cols = palettes[palette] || palettes.violet;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    const stops = 18;
    for (let i = 0; i <= stops; i++) {
      const t = i / stops;
      const wave = Math.sin(t * 18 + Math.sin(t * 5) * 2) * 0.5 + 0.5;
      const idx = Math.min(cols.length - 1, Math.floor(wave * cols.length));
      grad.addColorStop(t, cols[idx]);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // turbulent bands
    for (let i = 0; i < 70; i++) {
      const y = rand(0, H);
      const h = rand(2, 22);
      ctx.globalAlpha = rand(0.03, 0.18);
      ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
      ctx.beginPath();
      let x = -20;
      ctx.moveTo(x, y);
      while (x < W + 20) {
        x += rand(20, 70);
        ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * rand(2, 12));
      }
      ctx.lineTo(W + 20, y + h);
      x = W + 20;
      while (x > -20) {
        x -= rand(20, 70);
        ctx.lineTo(x, y + h + Math.sin(x * 0.02 + i) * rand(2, 12));
      }
      ctx.closePath();
      ctx.fill();
    }
    // storm
    ctx.globalAlpha = 0.55;
    const sx = W * 0.68;
    const sy = H * 0.55;
    const storm = ctx.createRadialGradient(sx, sy, 4, sx, sy, 110);
    storm.addColorStop(0, 'rgba(255,220,240,0.9)');
    storm.addColorStop(0.4, 'rgba(255,120,200,0.5)');
    storm.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = storm;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1.9, 0.8);
    ctx.beginPath();
    ctx.arc(0, 0, 110, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    return finish(c);
  });
}

/** Thin luminous scan-grid for energy walls. */
export function scanTexture(color = '#ff4d9f') {
  return cached(`scan:${color}`, () => {
    const c = canvas(128);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 36, 128, 8);
    ctx.globalAlpha = 0.35;
    for (let y = 0; y < 128; y += 8) ctx.fillRect(0, y, 128, 1);
    return finish(c, { repeat: true });
  });
}

/** Soft smoke puff. */
export function smokeTexture() {
  return cached('smoke', () => {
    const c = canvas(128);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return finish(c);
  });
}

export function disposeTextures() {
  cache.forEach((t) => t.dispose());
  cache.clear();
}
