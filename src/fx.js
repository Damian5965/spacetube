// Particles, shockwaves and light flashes.
import * as THREE from 'three';
import { glowTexture } from './textures.js';
import { rand, clamp, easeOutCubic } from './util.js';

const _c = new THREE.Color();
const _v = new THREE.Vector3();

class Particles {
  constructor(scene, capacity = 1600) {
    this.capacity = capacity;
    this.cursor = 0;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.active = new Uint8Array(capacity);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2000);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: glowTexture('#ffffff') },
        uScale: { value: 380 },
        uBoost: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 1.0, 220.0);
          gl_Position = projectionMatrix * mv;
          vColor = aColor;
          vAlpha = aAlpha;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this.geo = geo;
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, drag = 0.6, grav = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.active[i] = 1;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.size0[i] = size;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  burst(pos, color, count, { speed = 6, size = 0.6, life = 0.7, spread = 0.4, drag = 1.4, grav = 0, dir = null } = {}) {
    _c.set(color);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const zDir = rand(-1, 1);
      const r = Math.sqrt(1 - zDir * zDir);
      let vx = Math.cos(theta) * r;
      let vy = Math.sin(theta) * r;
      let vz = zDir;
      if (dir) {
        vx = vx * 0.7 + dir.x * 0.8;
        vy = vy * 0.7 + dir.y * 0.8;
        vz = vz * 0.7 + dir.z * 0.8;
      }
      const sp = speed * rand(0.35, 1.15);
      this.spawn(
        pos.x + rand(-spread, spread),
        pos.y + rand(-spread, spread),
        pos.z + rand(-spread, spread),
        vx * sp,
        vy * sp,
        vz * sp,
        _c,
        size * rand(0.6, 1.6),
        life * rand(0.6, 1.3),
        drag,
        grav
      );
    }
  }

  trail(pos, color, count = 1, { size = 0.42, life = 0.35, speed = 1.6, spreadX = 0.12, spreadY = 0.12, zJitter = 0.2 } = {}) {
    _c.set(color);
    for (let i = 0; i < count; i++) {
      this.spawn(
        pos.x + rand(-spreadX, spreadX),
        pos.y + rand(-spreadY, spreadY),
        pos.z + rand(-zJitter, zJitter),
        rand(-speed, speed) * 0.4,
        rand(-speed, speed) * 0.4,
        rand(1, 2.4),
        _c,
        size * rand(0.7, 1.3),
        life * rand(0.7, 1.2),
        2.2,
        0
      );
    }
  }

  update(dt) {
    const { pos, vel, life, maxLife, alpha, size, size0, active, drag, grav } = this;
    for (let i = 0; i < this.capacity; i++) {
      if (!active[i]) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        active[i] = 0;
        alpha[i] = 0;
        size[i] = 0;
        continue;
      }
      const d = Math.exp(-drag[i] * dt);
      vel[i * 3] *= d;
      vel[i * 3 + 1] *= d;
      vel[i * 3 + 2] *= d;
      vel[i * 3 + 1] -= grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const t = life[i] / maxLife[i];
      alpha[i] = t * t;
      size[i] = size0[i] * (0.55 + t * 0.75);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  setQuality(capacityScale) {
    // capacity stays fixed; emission density is controlled by callers
    this.material.uniforms.uScale.value = 380;
    void capacityScale;
  }
}

class Shockwaves {
  constructor(scene, count = 14) {
    this.items = [];
    this.scene = scene;
    const geo = new THREE.RingGeometry(0.82, 1.0, 96);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      scene.add(mesh);
      this.items.push({ mesh, mat, life: 0, maxLife: 1, size: 1, tilt: 0 });
    }
    this.cursor = 0;
  }

  spawn(pos, color, size = 6, life = 0.55, facing = 'camera') {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.mesh.position.copy(pos);
    it.mesh.scale.setScalar(0.4);
    it.mat.color.set(color);
    it.mat.opacity = 0.85;
    it.life = life;
    it.maxLife = life;
    it.size = size;
    it.mesh.visible = true;
    it.mesh.rotation.set(0, 0, 0);
    it.mesh.quaternion.identity();
    it.facing = facing;
  }

  update(dt, camera) {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.life -= dt;
      if (it.life <= 0) {
        it.mesh.visible = false;
        it.mat.opacity = 0;
        continue;
      }
      const t = 1 - it.life / it.maxLife;
      const e = easeOutCubic(t);
      it.mesh.scale.setScalar(0.4 + e * it.size);
      it.mat.opacity = (1 - t) * 0.9;
      if (it.facing === 'camera') it.mesh.quaternion.copy(camera.quaternion);
    }
  }
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.particles = new Particles(scene, 1800);
    this.shockwaves = new Shockwaves(scene, 16);
    this.flash = new THREE.PointLight(0x66f3ff, 0, 60, 2);
    this.flash.position.set(0, 0, -6);
    scene.add(this.flash);
    this.flashDecay = 0;
    this.quality = 1;
  }

  setQuality(q) {
    this.quality = q === 'high' ? 1 : q === 'medium' ? 0.7 : 0.45;
  }

  sparks(pos, color = '#ffd28a', count = 10, opts = {}) {
    this.particles.burst(pos, color, Math.max(1, Math.round(count * this.quality)), {
      speed: 7,
      size: 0.42,
      life: 0.55,
      spread: 0.25,
      drag: 1.6,
      ...opts,
    });
  }

  explosion(pos, color = '#ffb03a', scale = 1) {
    const n = Math.round(28 * scale * this.quality);
    this.particles.burst(pos, color, n, {
      speed: 11 * scale,
      size: 0.9 * scale,
      life: 0.9,
      spread: 0.7 * scale,
      drag: 1.2,
    });
    this.particles.burst(pos, '#ffffff', Math.round(10 * scale * this.quality), {
      speed: 6 * scale,
      size: 1.4 * scale,
      life: 0.35,
      spread: 0.4,
      drag: 2.4,
    });
    this.shockwaves.spawn(pos, color, 10 * scale, 0.55);
    this.shockwaves.spawn(pos, '#ffffff', 5 * scale, 0.3);
    this.flash.position.copy(pos);
    this.flash.color.set(color);
    this.flash.intensity = Math.min(60, 18 * scale);
    this.flashDecay = 1.4;
  }

  pickup(pos, color = '#b6ff5e', big = false) {
    this.particles.burst(pos, color, big ? 20 : 10, {
      speed: big ? 8 : 5,
      size: big ? 0.6 : 0.38,
      life: 0.7,
      spread: 0.3,
      drag: 1.8,
    });
    this.shockwaves.spawn(pos, color, big ? 5 : 2.6, 0.38);
  }

  hitSpark(pos, color = '#ffcf8a') {
    this.particles.burst(pos, color, 6, { speed: 5, size: 0.32, life: 0.35, spread: 0.1, drag: 2.4 });
  }

  nearMiss(pos) {
    this.particles.burst(pos, '#9ff0ff', 5, { speed: 3.4, size: 0.24, life: 0.45, spread: 0.6, drag: 2.8 });
  }

  engineTrail(pos, color, boosting) {
    this.particles.trail(pos, color, boosting ? 2 : 1, {
      size: boosting ? 0.4 : 0.24,
      life: boosting ? 0.28 : 0.22,
      speed: boosting ? 2.6 : 1.4,
      spreadX: 0.1,
      spreadY: 0.1,
      zJitter: 0.25,
    });
    if (boosting && Math.random() < 0.4) {
      this.particles.trail(pos, '#ffffff', 1, { size: 0.25, life: 0.16, speed: 1.2 });
    }
  }

  update(dt) {
    this.particles.update(dt);
    this.shockwaves.update(dt, this.camera);
    if (this.flash.intensity > 0.01) {
      this.flash.intensity *= Math.exp(-this.flashDecay * 9 * dt);
      if (this.flash.intensity < 0.05) this.flash.intensity = 0;
    }
  }

  setBoost(v) {
    this.particles.material.uniforms.uBoost.value = v;
  }
}
