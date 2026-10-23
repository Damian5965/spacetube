// Renderer, camera, post-processing stack, screen shake.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp } from './util.js';

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDamage: { value: 0 },
    uBoost: { value: 0 },
    uAberration: { value: 0.55 },
    uVignette: { value: 1 },
    uGrain: { value: 0.035 },
    uScan: { value: 0.12 },
    uResY: { value: 1080 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDamage;
    uniform float uBoost;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uScan;
    uniform float uResY;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float r2 = dot(centered, centered);
      vec2 dir = normalize(centered + vec2(0.000001));

      float ab = uAberration * (0.0004 + r2 * 0.0042) + uBoost * r2 * 0.006;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ab).b;

      // speed blur when boosting
      if (uBoost > 0.004) {
        vec3 blur = vec3(0.0);
        const int TAPS = 6;
        for (int i = 1; i <= TAPS; i++) {
          float s = float(i) / float(TAPS) * 0.055 * uBoost * r2 * 6.0;
          blur += texture2D(tDiffuse, uv - dir * s).rgb;
        }
        blur /= float(TAPS);
        col = mix(col, blur, uBoost * 0.42);
        // electric edge tint
        col += vec3(0.05, 0.16, 0.28) * uBoost * r2 * 1.6;
      }

      // damage bleed
      col = mix(col, vec3(0.9, 0.04, 0.14), uDamage * (0.08 + r2 * 0.6));

      // vignette
      float vig = smoothstep(0.92, 0.18, r2 * 1.7);
      col *= mix(1.0, vig, uVignette);

      // faint horizontal scanlines
      float scan = 0.5 + 0.5 * sin(uv.y * uResY * 1.35 + uTime * 12.0);
      col *= 1.0 - uScan * 0.055 * scan;

      // film grain
      float g = hash(uv * vec2(1024.0, 768.0) + fract(uTime) * 91.0);
      col += (g - 0.5) * uGrain;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.setClearColor(0x030211, 1);
    this.renderer.info.autoReset = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030217);
    this.scene.fog = new THREE.FogExp2(0x030217, 0.011);

    // soft IBL so the metal of ships and debris reads well
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    pmrem.dispose();

    // lights: cool key from above, warm rim from behind so metal reads
    this.keyLight = new THREE.DirectionalLight(0xffe6c0, 2.1);
    this.keyLight.position.set(6, 9, 7);
    this.scene.add(this.keyLight);
    this.rimLight = new THREE.DirectionalLight(0xff6a3a, 1.5);
    this.rimLight.position.set(-7, -3, -8);
    this.scene.add(this.rimLight);
    this.fillLight = new THREE.DirectionalLight(0x8fa6c8, 0.8);
    this.fillLight.position.set(-4, 5, -2);
    this.scene.add(this.fillLight);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
    this.camera.position.set(0, 2, 9);

    this.width = 0;
    this.height = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.quality = 'medium';
    this.useComposer = true;
    this.composer = null;
    this.bloom = null;
    this.finish = null;
    this.time = 0;
    this.trauma = 0;
    this.shake = { x: 0, y: 0, roll: 0 };
    this.shakeEnabled = true;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    if (window.matchMedia) {
      const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mq.addEventListener?.('change', this._onResize);
    }

    this.buildComposer();
    this.resize();
    this.setQuality('medium');
  }

  pixelRatioFor(quality) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (quality === 'high') return Math.min(dpr, 1.6);
    if (quality === 'medium') return Math.min(dpr, 1.25);
    return 1;
  }

  buildComposer() {
    if (!this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.34, 1.05);
      this.composer.addPass(this.bloom);
      this.finish = new ShaderPass(FinishShader);
      this.composer.addPass(this.finish);
      this.composer.addPass(new OutputPass());
    }
  }

  setQuality(quality) {
    this.quality = quality;
    this.useComposer = quality !== 'low';
    if (this.useComposer) this.buildComposer();
    const pr = this.pixelRatioFor(quality);
    this.renderer.setPixelRatio(pr);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(this.width, this.height);
    }
    if (this.bloom) {
      this.bloom.strength = quality === 'high' ? 0.5 : 0.42;
      this.bloom.radius = quality === 'high' ? 0.4 : 0.34;
      this.bloom.threshold = 1.0;
    }
    if (this.finish) {
      this.finish.uniforms.uGrain.value = quality === 'low' ? 0.012 : 0.02;
      this.finish.uniforms.uScan.value = quality === 'low' ? 0 : 0.1;
    }
    this.renderer.setSize(this.width, this.height, false);
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = this.pixelRatioFor(this.quality);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / Math.max(1, this.height);
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.dpr);
      this.composer.setSize(this.width, this.height);
    }
    if (this.finish) this.finish.uniforms.uResY.value = this.height * this.dpr;
  }

  addShake(amount) {
    if (!this.shakeEnabled) return;
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  updateShake(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const power = this.trauma * this.trauma;
    const t = this.time;
    this.shake.x = power * 0.5 * (Math.sin(t * 91.3) + Math.sin(t * 47.7) * 0.5);
    this.shake.y = power * 0.42 * (Math.sin(t * 83.1 + 2.1) + Math.sin(t * 61.3) * 0.4);
    this.shake.roll = power * 0.035 * Math.sin(t * 73.0 + 1.4);
  }

  setDamage(v) {
    if (this.finish) this.finish.uniforms.uDamage.value = v;
  }

  setBoost(v) {
    if (this.finish) this.finish.uniforms.uBoost.value = v;
  }

  setPalette(palette) {
    if (!palette) return;
    this.scene.background.setHex(palette.bg);
    if (this.scene.fog) {
      this.scene.fog.color.setHex(palette.fog ?? palette.bg);
      if (palette.fogDensity && this.scene.fog.density !== undefined) {
        this.scene.fog.density = palette.fogDensity;
      }
    }
    // industrial lighting rig: warm key, red-orange rim, cold fill
    if (this.keyLight) this.keyLight.color.setHex(palette.lamp ?? 0xffe6c0);
    if (this.rimLight) this.rimLight.color.setHex(0xff6a3a);
    if (this.fillLight) this.fillLight.color.setHex(0x8fa6c8);
  }

  update(dt) {
    this.time += dt;
    this.updateShake(dt);
    if (this.finish) {
      this.finish.uniforms.uTime.value = this.time;
      this.finish.uniforms.uResY.value = this.height * this.dpr;
    }
  }

  render(dt) {
    if (this.useComposer && this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
