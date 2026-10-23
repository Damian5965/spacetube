// Deep-space backdrop: stars, nebula sheets, a gas giant, and dust motes
// streaming through the tube.
import * as THREE from 'three';
import { PATH_GLSL, TUBE_RADIUS } from './path.js';
import { glowTexture, nebulaTexture, planetTexture, smokeTexture } from './textures.js';
import { rand } from './util.js';

export class Backdrop {
  constructor(scene, palette) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    scene.add(this.group);

    this.stars = this.makeStars(palette);
    this.group.add(this.stars);

    this.nebulas = this.makeNebulas(palette);
    this.nebulas.forEach((s) => this.group.add(s));

    this.planetGroup = this.makePlanet(palette);
    this.group.add(this.planetGroup);

    this.fleet = this.makeFleet(palette);
    this.group.add(this.fleet);

    this.dust = this.makeDust(palette);
    scene.add(this.dust.points);

    this._v = new THREE.Vector3();
    this.rotation = 0;
  }

  makeStars(palette) {
    const COUNT = 1700;
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const size = new Float32Array(COUNT);
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const r = rand(260, 760);
      const theta = rand(0, Math.PI * 2);
      const phi = Math.acos(rand(-1, 1));
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.cos(phi) * r;
      pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
      const warmth = Math.random();
      if (warmth > 0.86) c.setHex(0xffd8a8);
      else if (warmth > 0.7) c.setHex(0xa8d8ff);
      else c.setHex(0xffffff);
      c.multiplyScalar(rand(0.6, 1.2));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      size[i] = rand(1.2, 5.2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 2.2,
      map: glowTexture('#ffffff'),
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }

  makeNebulas(palette) {
    const list = [];
    const specs = [
      { pos: [-380, 120, -720], scale: 900, colors: [palette.nebula[0], palette.nebula[1]], seed: 1, opacity: 0.42 },
      { pos: [430, -90, -620], scale: 780, colors: [palette.nebula[2], palette.nebula[1]], seed: 2, opacity: 0.3 },
      { pos: [80, 360, -800], scale: 1000, colors: [palette.nebula[1], palette.nebula[0]], seed: 3, opacity: 0.26 },
    ];
    specs.forEach((s) => {
      const mat = new THREE.SpriteMaterial({
        map: nebulaTexture(s.colors, s.seed),
        transparent: true,
        opacity: s.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
        color: 0xffffff,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(...s.pos);
      sp.scale.setScalar(s.scale);
      sp.renderOrder = -10;
      list.push(sp);
    });
    return list;
  }

  makePlanet(palette) {
    const g = new THREE.Group();
    const tex = planetTexture(palette.planet);
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(64, 48, 32),
      new THREE.MeshBasicMaterial({ map: tex, fog: false, color: 0xffffff })
    );
    g.add(body);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(palette.glow),
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        fog: false,
      })
    );
    glow.scale.setScalar(190);
    glow.position.z = -6;
    g.add(glow);

    const ringGeo = new THREE.RingGeometry(82, 138, 96);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(palette.tubeB),
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      map: smokeTexture(),
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI * 0.42;
    ring.rotation.z = -0.3;
    g.add(ring);

    g.position.set(-420, 250, -700);
    g.rotation.z = 0.18;
    g.userData.body = body;
    g.userData.glow = glow;
    g.userData.ring = ring;
    return g;
  }

  makeDust(palette) {
    const COUNT = 340;
    const pos = new Float32Array(COUNT * 3);
    const size = new Float32Array(COUNT);
    const alpha = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * (TUBE_RADIUS - 1.2);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(a) * r;
      pos[i * 3 + 2] = rand(-130, 5);
      size[i] = rand(1.2, 4.2);
      alpha[i] = rand(0.12, 0.6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: smokeTexture() },
        uColor: { value: new THREE.Color(palette.glow) },
        uScale: { value: 200 },
        uOpacity: { value: 1 },
        uBoost: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = max(1.0, -mv.z);
          gl_PointSize = clamp(aSize * uScale / d, 1.0, 42.0);
          gl_Position = projectionMatrix * mv;
          vAlpha = aAlpha * smoothstep(3.0, 14.0, d) * (1.0 - smoothstep(70.0, 130.0, d));
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uBoost;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          vec3 col = mix(uColor, vec3(1.0), 0.25 + uBoost * 0.4);
          gl_FragColor = vec4(col, t.a * vAlpha * uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 2;
    return { points, geo, mat, count: COUNT, palette };
  }

  // ------------------------------------------------------------ cargo fleet
  /** Distant haulers and station hulks drifting outside the tube. */
  makeFleet(palette) {
    const fleet = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x4a4d55,
      metalness: 0.75,
      roughness: 0.62,
      flatShading: true,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22242b, metalness: 0.6, roughness: 0.7, flatShading: true });
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xffc47a });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xff5030 });

    const makeShip = (scale, seed) => {
      const g = new THREE.Group();
      const rnd = (a, b) => a + ((Math.sin(seed * 12.9898 + a * 78.233) * 43758.5453) % 1 + 1) * 0.5 * (b - a);
      // spine
      const spine = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 9), hullMat);
      g.add(spine);
      // container blocks
      const blocks = 4 + Math.round(rnd(0, 3));
      for (let i = 0; i < blocks; i++) {
        const w = rnd(1.0, 2.4);
        const h = rnd(1.0, 2.2);
        const d = rnd(1.2, 3.2);
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), i % 2 ? hullMat : darkMat);
        box.position.set(rnd(-2.2, 2.2), rnd(-1.6, 1.6), rnd(-4.2, 4.2));
        box.rotation.set(rnd(-0.1, 0.1), rnd(-0.2, 0.2), rnd(-0.1, 0.1));
        g.add(box);
      }
      // bridge tower with lit windows
      const tower = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 1.8), hullMat);
      tower.position.set(0, 1.3, -3.4);
      g.add(tower);
      for (let i = 0; i < 6; i++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), windowMat);
        win.position.set(-0.6 + i * 0.24, 1.42, -4.32);
        g.add(win);
      }
      // engine bells
      for (const x of [-0.6, 0.6]) {
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 1.1, 8), darkMat);
        bell.rotation.x = Math.PI / 2;
        bell.position.set(x, 0, 5.1);
        g.add(bell);
      }
      const blink = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), lampMat);
      blink.position.set(0, 2.05, -3.4);
      g.add(blink);
      g.scale.setScalar(scale);
      return g;
    };

    // close enough to be seen through the tube windows
    const spots = [
      [-46, 12, -58, 1.5],
      [40, -16, -88, 1.9],
      [-26, -22, -34, 1.1],
      [58, 26, -120, 2.3],
      [-74, 6, -150, 2.6],
      [18, 34, -46, 1.2],
      [-58, -30, -186, 3.0],
      [96, -8, -210, 3.2],
    ];
    spots.forEach(([x, y, z, sc], i) => {
      const ship = makeShip(sc, i + 1);
      ship.position.set(x, y, z);
      ship.rotation.set((i % 3) * 0.06, i * 0.9, (i % 2 ? 1 : -1) * 0.12);
      fleet.add(ship);
    });

    // slow tumble of a few loose containers
    this.debris = [];
    for (let i = 0; i < 8; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(rand(0.8, 2.4), rand(0.8, 2), rand(1.2, 3)), darkMat);
      const a = rand(0, Math.PI * 2);
      const r = rand(18, 70);
      box.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.7, rand(-240, -30));
      box.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      fleet.add(box);
      this.debris.push({ mesh: box, spin: rand(-0.12, 0.12) });
    }
    fleet.userData.blink = lampMat;
    void palette;
    return fleet;
  }

  setSector(palette) {
    this.nebulas[0].material.map = nebulaTexture([palette.nebula[0], palette.nebula[1]], 1);
    this.nebulas[1].material.map = nebulaTexture([palette.nebula[2], palette.nebula[1]], 2);
    this.nebulas[2].material.map = nebulaTexture([palette.nebula[1], palette.nebula[0]], 3);
    this.nebulas.forEach((n) => {
      n.material.needsUpdate = true;
    });
    this.planetGroup.userData.glow.material.map = glowTexture(palette.glow);
    this.planetGroup.userData.ring.material.color.setHex(palette.tubeB);
    this.dust.mat.uniforms.uColor.value.set(palette.glow);
    this.dust.palette = palette;
  }

  update(dt, camera, speed, boost) {
    this.rotation += dt * 0.006;
    this.group.position.copy(camera.position);
    this.group.rotation.y = this.rotation * 0.35;
    this.nebulas.forEach((n, i) => {
      n.material.rotation += dt * (0.004 + i * 0.002);
    });

    if (this.debris) {
      for (const d of this.debris) {
        d.mesh.rotation.y += dt * d.spin;
        d.mesh.rotation.x += dt * d.spin * 0.4;
      }
    }
    if (this.fleet?.userData.blink) {
      const blink = 0.5 + 0.5 * Math.sin(this.rotation * 40);
      this.fleet.userData.blink.color.setRGB(1, 0.25 + blink * 0.2, 0.15);
    }

    const pg = this.planetGroup;
    pg.userData.body.rotation.y += dt * 0.008;
    pg.userData.ring.rotation.z += dt * 0.005;

    // dust streams toward the viewer
    const dust = this.dust;
    dust.points.position.copy(camera.position);
    const arr = dust.geo.attributes.position.array;
    const sizeArr = dust.geo.attributes.aSize.array;
    const speedMul = (1 + boost * 0.9) * (1 + speed / 140);
    const dz = speed * dt * 1.15 * speedMul;
    for (let i = 0; i < dust.count; i++) {
      arr[i * 3 + 2] += dz * (0.5 + sizeArr[i] * 0.08);
      if (arr[i * 3 + 2] > 6) {
        const a = rand(0, Math.PI * 2);
        const r = Math.sqrt(Math.random()) * (TUBE_RADIUS - 1.2);
        arr[i * 3] = Math.cos(a) * r;
        arr[i * 3 + 1] = Math.sin(a) * r;
        arr[i * 3 + 2] = rand(-130, -70);
      }
    }
    dust.geo.attributes.position.needsUpdate = true;
    dust.mat.uniforms.uBoost.value += (boost - dust.mat.uniforms.uBoost.value) * Math.min(1, dt * 3);
  }
}
