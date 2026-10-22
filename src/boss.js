// Sector Warden — the boss construct that guards every gate.
import * as THREE from 'three';
import { glowTexture } from './textures.js';
import { clamp, rand, TAU } from './util.js';
import { pathX, pathY, TUBE_RADIUS, angleDelta } from './path.js';

const _v = new THREE.Vector3();

export class Warden {
  constructor(scene, level, palette, audio) {
    this.scene = scene;
    this.level = level;
    this.audio = audio;
    this.maxHp = 90 + level * 45;
    this.hp = this.maxHp;
    this.x = 0;
    this.y = 0;
    this.a = 0;
    this.radius = 4.1;
    this.time = 0;
    this.attackTimer = 2.4;
    this.charging = 0;
    this.pendingAttack = null;
    this.attackIndex = 0;
    this.flash = 0;
    this.dying = false;
    this.deathTimer = 0;
    this.finished = false;
    this.alive = true;
    this.name = level === 1 ? 'WARDEN MK.I' : level === 2 ? 'WARDEN MK.II' : level === 3 ? 'GATEKEEPER' : `WARDEN MK.${level}`;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.armorMat = new THREE.MeshStandardMaterial({
      color: 0x2a2438,
      metalness: 0.96,
      roughness: 0.24,
      emissive: 0x421020,
      emissiveIntensity: 0.45,
      flatShading: true,
    });
    this.trimMat = new THREE.MeshStandardMaterial({
      color: 0xff4d6a,
      emissive: 0xff365e,
      emissiveIntensity: 3,
      metalness: 0.4,
      roughness: 0.3,
    });
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0xff5470,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const coreGeo = new THREE.IcosahedronGeometry(3.35, 1);
    const core = new THREE.Mesh(coreGeo, this.armorMat);
    core.scale.set(1.25, 0.92, 0.78);
    this.group.add(core);
    this.core = core;

    const cage = new THREE.LineSegments(
      new THREE.EdgesGeometry(coreGeo),
      new THREE.LineBasicMaterial({
        color: 0xff4d6a,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    cage.scale.set(1.27, 0.94, 0.8);
    this.group.add(cage);
    this.cage = cage;

    this.rings = [];
    for (const [r, tube, tilt, speed] of [
      [4.9, 0.11, 0.15, 0.45],
      [4.35, 0.07, 1.2, -0.7],
      [5.5, 0.04, 0.7, 0.3],
    ]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, tube, 6, 90),
        new THREE.MeshBasicMaterial({
          color: 0xff5470,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ring.rotation.x = tilt;
      ring.userData.speed = speed;
      this.group.add(ring);
      this.rings.push(ring);
    }

    // armoured side pods
    this.pods = [];
    for (const sx of [-1, 1]) {
      const pod = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.OctahedronGeometry(1.45, 0), this.armorMat);
      shell.scale.set(0.8, 0.7, 1.35);
      pod.add(shell);
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.06, 4, 40), this.glowMat);
      band.rotation.y = Math.PI / 2;
      pod.add(band);
      const eye = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture('#ff365e'),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.9,
        })
      );
      eye.scale.setScalar(2.1);
      eye.position.z = 1.1;
      pod.add(eye);
      pod.position.set(sx * 5.05, sx * 0.25, -0.2);
      this.group.add(pod);
      this.pods.push({ pod, eye, sx });
    }

    // central eye
    this.eyeMat = new THREE.SpriteMaterial({
      map: glowTexture('#ff365e'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0xffffff,
    });
    this.eye = new THREE.Sprite(this.eyeMat);
    this.eye.scale.setScalar(6.4);
    this.eye.position.set(0, 0, 2.1);
    this.group.add(this.eye);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14), this.glowMat);
    lens.scale.set(1, 1, 0.5);
    lens.position.z = 1.35;
    this.group.add(lens);
    this.lens = lens;

    // spikes
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.5, 5), this.trimMat);
      spike.position.set(Math.cos(a) * 3.9, Math.sin(a) * 2.85, rand(-0.4, 0.4));
      spike.rotation.z = a - Math.PI / 2;
      this.group.add(spike);
    }

    // ambient glow
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(`#${new THREE.Color(palette.glow).getHexString()}`),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.18,
      })
    );
    this.halo.scale.setScalar(10);
    this.group.add(this.halo);

    this.light = new THREE.PointLight(0xff365e, 5, 38, 2);
    this.group.add(this.light);
  }

  start() {
    this.audio.alarm();
  }

  update(dt, game) {
    this.time += dt;
    const t = this.time;
    this.hp = clamp(this.hp, 0, this.maxHp);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.armorMat.emissiveIntensity = 0.45 + this.flash * 2.4;

    if (this.dying) {
      this.deathTimer -= dt;
      this.x += Math.sin(t * 12) * dt * 0.6;
      this.y += Math.cos(t * 9) * dt * 0.8;
      this.group.rotation.z += dt * 0.8;
      this.group.rotation.x += dt * 0.3;
      this.eyeMat.opacity = 0.3 + Math.random() * 0.4;
      this.rings.forEach((r) => (r.rotation.z += dt * 4));
      if (Math.random() < dt * 5) {
        _v.set(
          pathX(this.a) + this.x + rand(-4, 4),
          pathY(this.a) + this.y + rand(-3, 3),
          -(this.a - game.traveled) + rand(-3, 3)
        );
        game.fx.explosion(_v, '#ff7b4d', rand(0.5, 1.1));
        game.engine.addShake(0.12);
        this.audio.explosion(0.5);
      }
      if (this.deathTimer <= 0 && !this.finished) {
        this.finished = true;
      }
      return;
    }

    // hover / strafe — the warden hangs against the wall like the runner, so
    // forward fire at wall height can actually reach it
    if (this.baseTheta === undefined || this.baseTheta === null) {
      this.baseTheta = (this.theta ?? game.theta ?? 0) + 0.55;
      // it holds a lane on the wall rather than hiding behind the runner
      this.theta = this.baseTheta;
    }
    const sweep = this.baseTheta + Math.sin(t * 0.36) * 0.62;
    const br = TUBE_RADIUS - 4.6 + Math.sin(t * 0.9) * 0.5;
    const targetX = Math.cos(sweep) * br;
    const targetY = Math.sin(sweep) * br;
    this.x += (targetX - this.x) * Math.min(1, dt * 2.2);
    this.y += (targetY - this.y) * Math.min(1, dt * 2.2);
    this.a = game.traveled + 40;
    this.group.rotation.z = Math.sin(t * 0.5) * 0.12;
    this.group.rotation.x = Math.sin(t * 0.73) * 0.06;
    this.group.rotation.y = Math.sin(t * 0.37) * 0.1;
    this.group.scale.setScalar(1.18 + Math.sin(t * 2) * 0.014);

    this.rings.forEach((r, i) => {
      r.rotation.z += dt * r.userData.speed;
      r.rotation.y = Math.sin(t * 0.4 + i) * 0.25;
    });
    this.cage.rotation.z -= dt * 0.12;
    this.pods.forEach((p, i) => {
      p.eye.scale.setScalar(1.9 + Math.sin(t * 4 + i * 2) * 0.35);
      p.pod.rotation.z = Math.sin(t * 0.8 + i) * 0.2;
    });
    this.lens.rotation.z += dt * 0.8;
    this.eye.scale.setScalar(7.4 + Math.sin(t * 3.2) * 0.55 + this.charging * 2.0);
    this.halo.scale.setScalar(11 + Math.sin(t * 1.4) * 0.9);
    this.light.intensity = 5 + Math.sin(t * 4) * 1.6 + this.charging * 9;

    if (this.charging > 0) {
      this.charging -= dt;
      this.eyeMat.color.setHex(0xffffff);
      if (this.charging <= 0) {
        this.executeAttack(game);
      }
      return;
    }

    this.eyeMat.color.setHex(0xffb3c0);
    this.attackTimer -= dt * game.difficulty;
    if (this.attackTimer <= 0) {
      this.chooseAttack();
    }
  }

  chooseAttack() {
    this.attackIndex = (this.attackIndex + 1) % 5;
    const patterns = ['volley', 'fan', 'sweep', 'volley', 'drones'];
    this.pendingAttack = patterns[this.attackIndex];
    this.charging = this.pendingAttack === 'fan' ? 0.95 : this.pendingAttack === 'sweep' ? 0.7 : 0.55;
    this.audio.teleportCharge(0);
  }

  executeAttack(game) {
    const p = this.pendingAttack;
    this.pendingAttack = null;
    this.attackTimer = rand(1.5, 2.4);
    if (p === 'volley') this.volley(game);
    else if (p === 'fan') this.fan(game);
    else if (p === 'sweep') this.sweep(game);
    else if (p === 'drones') {
      game.spawnBossDrones(this);
      this.audio.enemyShoot(0);
    }
  }

  targetPoint(game, lead = 0.25) {
    const ship = game.ship;
    const t = (this.a - game.traveled) / (game.speed + 40);
    return {
      x: ship.x + ship.vx * t * lead - this.x,
      y: ship.y + ship.vy * t * lead - this.y,
    };
  }

  fire(game, x, y, vx, vy) {
    game.bullets.fireEnemy(this.a, this.x + x, this.y + y, vx, vy, {
      va: -22 - this.level * 1.5,
      damage: 14,
      radius: 0.5,
    });
  }

  volley(game) {
    const target = this.targetPoint(game);
    const base = Math.atan2(target.y, target.x);
    for (let i = -2; i <= 2; i++) {
      const a = base + i * 0.16;
      this.fire(game, Math.cos(a) * 1.6, Math.sin(a) * 1.2, Math.cos(a) * 21, Math.sin(a) * 21);
    }
    this.audio.enemyShoot(0.2);
    game.fx.sparks({ x: this.x, y: this.y, z: -(this.a - game.traveled) }, '#ff6b8f', 12, { speed: 6 });
  }

  fan(game) {
    const target = this.targetPoint(game);
    const base = Math.atan2(target.y, target.x);
    for (let i = -4; i <= 4; i++) {
      const a = base + i * 0.19;
      this.fire(game, Math.cos(a) * 1.6, Math.sin(a) * 1.2, Math.cos(a) * 17, Math.sin(a) * 17);
    }
    this.audio.enemyShoot(-0.3);
    this.audio.enemyShoot(0.3);
  }

  sweep(game) {
    const count = 11;
    const openA = Math.floor(rand(1, count - 2));
    const openB = (openA + Math.floor(rand(1, 3))) % count;
    for (let i = 0; i < count; i++) {
      if (i === openA || i === openB) continue;
      const x = -7.4 + (i / (count - 1)) * 14.8;
      game.bullets.fireEnemy(this.a + 6, x, this.y * 0.2 + rand(-0.25, 0.25), 0, 0, {
        va: -19 - this.level,
        damage: 13,
        radius: 0.55,
      });
    }
    this.audio.enemyShoot(0);
    game.fx.sparks({ x: this.x, y: this.y, z: -(this.a - game.traveled) }, '#ff6b8f', 18, { speed: 8 });
  }

  damage(amount, game, at) {
    if (this.dying) return false;
    this.hp -= amount;
    this.flash = 1;
    game.fx.hitSpark(at, '#ffb3c0');
    if (this.hp <= 0) {
      this.hp = 0;
      this.dying = true;
      this.deathTimer = 2.4;
      game.onBossKilled(this);
      return true;
    }
    return false;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      }
      if (o.isSprite) o.material?.dispose?.();
    });
    this.armorMat.dispose();
    this.trimMat.dispose();
    this.glowMat.dispose();
    this.eyeMat.dispose();
    this.alive = false;
  }
}
