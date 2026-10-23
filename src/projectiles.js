// Pooled plasma bolts for both sides.
import * as THREE from 'three';
import { glowTexture } from './textures.js';
import { pathX, pathY } from './path.js';
import { rand } from './util.js';

const MAX_PLAYER = 48;
const MAX_ENEMY = 80;

class BasePool {
  constructor(scene, factory) {
    this.scene = scene;
    this.factory = factory;
    this.free = [];
    this.active = [];
  }
  obtain() {
    const b = this.free.pop() || this.factory();
    b.alive = true;
    b.mesh.visible = true;
    if (b.mesh.parent !== this.scene) this.scene.add(b.mesh);
    this.active.push(b);
    return b;
  }
  updateAll(dt, traveled) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.a += b.va * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const ahead = b.a - traveled;
      b.ahead = ahead;
      b.mesh.position.set(pathX(b.a) + b.x, pathY(b.a) + b.y, -ahead);
      if (ahead > b.maxAhead || ahead < -8 || Math.abs(b.x) > 14 || Math.abs(b.y) > 10) {
        this.kill(b);
      }
    }
  }
  kill(b) {
    if (!b.alive) return;
    b.alive = false;
    b.mesh.visible = false;
    const idx = this.active.indexOf(b);
    if (idx >= 0) this.active.splice(idx, 1);
    this.free.push(b);
  }
  clear() {
    for (let i = this.active.length - 1; i >= 0; i--) this.kill(this.active[i]);
  }
}

export class Bullets {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;

    const coreGeo = new THREE.CylinderGeometry(0.065, 0.065, 1.7, 6, 1, true);
    coreGeo.rotateX(Math.PI / 2);
    const haloGeo = new THREE.CylinderGeometry(0.16, 0.16, 2.2, 6, 1, true);
    haloGeo.rotateX(Math.PI / 2);
    this.playerFactory = () => {
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        coreGeo,
        new THREE.MeshBasicMaterial({ color: 0xd8ffff, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      const halo = new THREE.Mesh(
        haloGeo,
        new THREE.MeshBasicMaterial({
          color: 0x4fe8ff,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture('#8ff4ff'),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.95,
        })
      );
      glow.scale.setScalar(1.5);
      g.add(core, halo, glow);
      g.visible = false;
      return { mesh: g, alive: false, a: 0, x: 0, y: 0, vx: 0, vy: 0, va: 0, ahead: 0, maxAhead: 240, radius: 0.34, damage: 1, kind: 'player' };
    };

    this.enemyFactory = () => {
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd0d8 })
      );
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture('#ff5470'),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.95,
        })
      );
      glow.scale.setScalar(1.9);
      g.add(core, glow);
      g.visible = false;
      return { mesh: g, alive: false, a: 0, x: 0, y: 0, vx: 0, vy: 0, va: 0, ahead: 0, maxAhead: 260, radius: 0.42, damage: 12, kind: 'enemy' };
    };

    this.playerPool = new BasePool(scene, this.playerFactory);
    this.enemyPool = new BasePool(scene, this.enemyFactory);
    this.player = this.playerPool.active;
    this.enemy = this.enemyPool.active;
    this.pendingLimit = true;
  }

  firePlayer(a, x, y, level = 1, ax = 0, ay = 0) {
    if (this.playerPool.active.length >= MAX_PLAYER) return;
    const shots =
      level >= 3
        ? [
            { x: 0, vx: 0 },
            { x: -0.62, vx: -1.4 },
            { x: 0.62, vx: 1.4 },
          ]
        : level === 2
        ? [
            { x: -0.4, vx: 0 },
            { x: 0.4, vx: 0 },
          ]
        : [{ x: 0, vx: 0 }];
    for (const s of shots) {
      const b = this.playerPool.obtain();
      b.a = a;
      b.x = x + s.x;
      b.y = y;
      b.vx = s.vx + ax + rand(-0.15, 0.15);
      b.vy = ay + rand(-0.1, 0.1);
      b.va = 168;
      b.damage = 1;
      b.maxAhead = 260;
      b.radius = 0.34;
    }
  }

  fireEnemy(a, x, y, vx, vy, { va = -30, damage = 12, radius = 0.42 } = {}) {
    if (this.enemyPool.active.length >= MAX_ENEMY) return null;
    const b = this.enemyPool.obtain();
    b.a = a;
    b.x = x;
    b.y = y;
    b.vx = vx;
    b.vy = vy;
    b.va = va;
    b.damage = damage;
    b.radius = radius;
    b.maxAhead = 300;
    return b;
  }

  update(dt, traveled) {
    this.playerPool.updateAll(dt, traveled);
    this.enemyPool.updateAll(dt, traveled);
    const fx = this.fx;
    if (!fx) return;
    for (const b of this.player) {
      if (Math.random() < 0.22) {
        fx.particles.trail(b.mesh.position, '#8ff4ff', 1, { size: 0.22, life: 0.18, speed: 0.6, spreadX: 0.06, spreadY: 0.06, zJitter: 0.3 });
      }
    }
    for (const b of this.enemy) {
      if (Math.random() < 0.12) {
        fx.particles.trail(b.mesh.position, '#ff5b7d', 1, { size: 0.2, life: 0.2, speed: 0.5, spreadX: 0.08, spreadY: 0.08, zJitter: 0.1 });
      }
    }
  }

  clear() {
    this.playerPool.clear();
    this.enemyPool.clear();
  }
}
