// The player interceptor — built entirely from primitives and extrusions.
import * as THREE from 'three';
import { glowTexture, hexTexture } from './textures.js';
import { TAU } from './util.js';

function makeWing(accent, trim) {
  const shape = new THREE.Shape();
  shape.moveTo(0.28, -0.72);
  shape.lineTo(1.15, -0.5);
  shape.lineTo(2.55, 0.22);
  shape.lineTo(2.18, 0.84);
  shape.lineTo(0.95, 0.92);
  shape.lineTo(0.28, 1.18);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelSize: 0.022,
    bevelThickness: 0.018,
    bevelSegments: 1,
    steps: 1,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, -0.04, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x46536f,
    metalness: 0.85,
    roughness: 0.3,
    envMapIntensity: 1.4,
    side: THREE.DoubleSide,
  });
  const wing = new THREE.Mesh(geo, mat);

  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(1.95, 0.028, 0.045),
    new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 2.4,
      metalness: 0.2,
      roughness: 0.4,
    })
  );
  edge.position.set(1.32, 0.02, -0.16);
  edge.rotation.y = -0.36;
  wing.add(edge);

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshBasicMaterial({ color: trim })
  );
  tip.position.set(2.45, 0.06, 0.5);
  wing.add(tip);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.025, 0.13),
    new THREE.MeshStandardMaterial({ color: 0x0e1320, metalness: 0.7, roughness: 0.5 })
  );
  stripe.position.set(1.25, 0.08, 0.62);
  stripe.rotation.y = -0.28;
  wing.add(stripe);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.012, 0.38),
    new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 1.1,
      metalness: 0.6,
      roughness: 0.4,
      transparent: true,
      opacity: 0.9,
    })
  );
  panel.position.set(1.55, 0.075, 0.15);
  panel.rotation.y = -0.28;
  wing.add(panel);

  return wing;
}

export class Ship {
  constructor(scene, accentHex, trimHex) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.renderOrder = 5;
    this.model = new THREE.Group();
    this.model.scale.setScalar(0.95);
    this.root.add(this.model);
    scene.add(this.root);

    this.accent = new THREE.Color(accentHex);
    this.trim = new THREE.Color(trimHex);

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x556485,
      metalness: 0.82,
      roughness: 0.24,
      envMapIntensity: 1.6,
      side: THREE.DoubleSide,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      metalness: 0.8,
      roughness: 0.45,
      side: THREE.DoubleSide,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: this.accent });
    const trimMat = new THREE.MeshStandardMaterial({
      color: this.trim,
      emissive: this.trim,
      emissiveIntensity: 2.2,
      metalness: 0.2,
      roughness: 0.3,
    });

    // fuselage
    const profile = [
      new THREE.Vector2(0.02, 2.1),
      new THREE.Vector2(0.14, 1.8),
      new THREE.Vector2(0.27, 1.45),
      new THREE.Vector2(0.39, 0.95),
      new THREE.Vector2(0.45, 0.35),
      new THREE.Vector2(0.43, -0.25),
      new THREE.Vector2(0.39, -0.9),
      new THREE.Vector2(0.44, -1.42),
      new THREE.Vector2(0.32, -1.78),
      new THREE.Vector2(0.18, -1.84),
    ];
    const bodyGeo = new THREE.LatheGeometry(profile, 18);
    bodyGeo.rotateX(-Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, hullMat);
    this.model.add(body);

    // dark belly plate
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 10, 0, TAU, 0, Math.PI / 2), darkMat);
    belly.scale.set(1.0, 0.55, 3.8);
    belly.position.set(0, -0.18, -0.2);
    belly.rotation.x = Math.PI;
    this.model.add(belly);

    // cockpit
    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 20, 14),
      new THREE.MeshPhysicalMaterial({
        color: 0x0b2438,
        metalness: 0.6,
        roughness: 0.04,
        transmission: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        emissive: this.accent,
        emissiveIntensity: 0.28,
      })
    );
    cockpit.scale.set(1.0, 0.62, 2.25);
    cockpit.position.set(0, 0.27, -0.42);
    this.model.add(cockpit);

    const cockpitFrame = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.018, 6, 24, Math.PI), darkMat);
    cockpitFrame.rotation.x = Math.PI / 2;
    cockpitFrame.rotation.z = Math.PI;
    cockpitFrame.scale.set(1, 2.2, 1);
    cockpitFrame.position.set(0, 0.27, -0.42);
    this.model.add(cockpitFrame);

    // wings
    const wingR = makeWing(this.accent, this.trim);
    this.model.add(wingR);
    const wingL = makeWing(this.accent, this.trim);
    wingL.scale.x = -1;
    this.model.add(wingL);

    // engine nacelles
    const nozzles = [];
    const flameMats = [];
    for (const sx of [-1, 1]) {
      const nacelle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 1.3, 14),
        hullMat
      );
      nacelle.rotation.x = Math.PI / 2;
      nacelle.position.set(sx * 0.52, -0.02, 0.9);
      this.model.add(nacelle);

      const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.22, 0.22, 14), darkMat);
      intake.rotation.x = Math.PI / 2;
      intake.position.set(sx * 0.52, -0.02, 0.26);
      this.model.add(intake);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 8, 20), trimMat);
      ring.position.set(sx * 0.52, -0.02, 1.55);
      this.model.add(ring);

      const nozzle = new THREE.Mesh(new THREE.CircleGeometry(0.18, 18), new THREE.MeshBasicMaterial({ color: this.accent }));
      nozzle.position.set(sx * 0.52, -0.02, 1.535);
      nozzle.rotation.y = Math.PI;
      this.model.add(nozzle);
      nozzles.push(nozzle);

      const flameMat = new THREE.MeshBasicMaterial({
        color: this.accent,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        map: glowTexture(this.accent.getStyle()),
      });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.5, 12, 1, true), flameMat);
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(sx * 0.52, -0.02, 2.3);
      this.model.add(flame);
      flameMats.push(flame);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(`#${this.accent.getHexString()}`),
          color: 0xffffff,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.9,
        })
      );
      glow.scale.setScalar(0.85);
      glow.position.set(sx * 0.52, -0.02, 1.65);
      this.model.add(glow);
      flameMats.push(glow);
    }
    this.flames = flameMats;

    // spine trim
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 1.75), trimMat);
      rail.position.set(sx * 0.4, 0.16, 0.05);
      rail.rotation.z = sx * 0.1;
      this.model.add(rail);
    }

    // dorsal fin
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(0.05, 0.42);
    finShape.lineTo(0.62, 0.52);
    finShape.lineTo(0.86, 0);
    finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.04, bevelEnabled: false });
    finGeo.rotateY(Math.PI / 2);
    finGeo.translate(0.02, 0, 0);
    const fin = new THREE.Mesh(finGeo, hullMat);
    fin.position.set(0, 0.16, 0.55);
    this.model.add(fin);
    const finGlow = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.54), trimMat);
    finGlow.position.set(0, 0.68, 0.22);
    this.model.add(finGlow);

    // underglow
    const under = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(`#${this.accent.getHexString()}`),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.5,
      })
    );
    under.scale.set(2.5, 0.95, 1);
    under.position.set(0, -0.35, 0.15);
    this.model.add(under);
    this.underGlow = under;

    // shield bubble
    const shieldMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.accent.clone() },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uMap: { value: hexTexture(this.accent.getStyle()) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uOpacity;
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float fres = pow(1.0 - abs(dot(vNormal, vView)), 2.4);
          vec2 uv = vec2(vUv.x * 2.0 + uTime * 0.03, vUv.y * 1.2);
          float hex = texture2D(uMap, uv).a;
          float scan = 0.5 + 0.5 * sin(vUv.y * 80.0 - uTime * 6.0);
          vec3 col = uColor * (fres * 1.1 + hex * 0.22 + scan * 0.05);
          gl_FragColor = vec4(col, (fres * 0.5 + hex * 0.07) * uOpacity * 0.85);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.72, 28, 20), shieldMat);
    this.shield.scale.set(1.05, 0.82, 1.5);
    this.model.add(this.shield);

    // cockpit/canopy light
    this.light = new THREE.PointLight(new THREE.Color(accentHex), 2.6, 14, 2);
    this.light.position.set(0, 0.4, 0);
    this.root.add(this.light);

    // engine light
    this.engineLight = new THREE.PointLight(new THREE.Color(accentHex), 1.4, 8, 2);
    this.engineLight.position.set(0, 0, 2);
    this.root.add(this.engineLight);

    this.time = 0;
    this.bank = 0;
    this.tilt = 0;
    this.shieldStrength = 0;
    this.rollContainer = new THREE.Group();
    this.root.add(this.rollContainer);
    this.root.remove(this.model);
    this.rollContainer.add(this.model);
  }

  setPalette(accentHex, trimHex) {
    this.accent.setHex(accentHex);
    this.trim.setHex(trimHex);
    this.shield.material.uniforms.uColor.value.copy(this.accent);
    this.shield.material.uniforms.uMap.value = hexTexture(`#${this.accent.getHexString()}`);
    this.light.color.copy(this.accent);
    this.engineLight.color.copy(this.accent);
    this.model.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive && o.material.emissiveIntensity > 1) {
        o.material.emissive.copy(this.trim);
        o.material.color.copy(this.trim);
      }
    });
    // flames/under glow keep a mixed tint
    this.flames.forEach((f) => {
      if (f.material) {
        if (f.isSprite) f.material.map = glowTexture(`#${this.accent.getHexString()}`);
      }
    });
  }

  update(dt, { boosting = false, speed = 0, shield = 0 } = {}) {
    this.time += dt;
    const t = this.time;
    const bob = Math.sin(t * 2.1) * 0.035;
    this.model.position.y = bob;
    this.model.rotation.z += ((this.bank * -0.22) - this.model.rotation.z) * Math.min(1, dt * 6);
    this.model.rotation.x += ((this.tilt * 0.12) - this.model.rotation.x) * Math.min(1, dt * 6);
    this.model.rotation.y = Math.sin(t * 0.7) * 0.012;

    const flick = 0.85 + Math.sin(t * 31) * 0.06 + Math.sin(t * 17.3) * 0.07;
    const thrust = (boosting ? 2.4 : 1.0) * flick;
    this.flames.forEach((f, i) => {
      if (f.isSprite) {
        f.scale.setScalar((boosting ? 1.5 : 0.85) * flick);
        f.material.opacity = boosting ? 0.8 : 0.5;
      } else {
        f.scale.set(boosting ? 1.35 : 0.9, thrust, boosting ? 1.35 : 0.9);
        f.material.opacity = 0.8;
      }
      f.position.z += 0; // keep in place
      void i;
    });
    if (this.underGlow) this.underGlow.material.opacity = 0.22 + Math.sin(t * 3.2) * 0.05;

    this.light.intensity = 2.4 + Math.sin(t * 4) * 0.6;
    this.engineLight.intensity = boosting ? 4.2 : 1.5;

    this.shieldStrength += (shield - this.shieldStrength) * Math.min(1, dt * 6);
    this.shield.visible = this.shieldStrength > 0.02;
    this.shield.material.uniforms.uOpacity.value = this.shieldStrength;
    this.shield.material.uniforms.uTime.value = t;
    this.shield.rotation.y += dt * 0.3;
    this.shield.rotation.x = Math.sin(t * 0.4) * 0.2;

    void speed;
  }

  setBank(v) {
    this.bank = v;
  }

  setTilt(v) {
    this.tilt = v;
  }

  setVisible(v) {
    this.root.visible = v;
  }
}
