# SPACETUBE

A neon hyperspace tunnel runner built with **Three.js** and **Vite**. No external art:
the tunnel, ships, drones, Warden bosses, planets, nebulae, textures and the whole
soundtrack are generated procedurally in the browser.

```
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

## How to fly

| Action | Keyboard | Mouse | Touch |
| --- | --- | --- | --- |
| Steer | `WASD` / arrows | move the pointer | left stick |
| Fire | `Space` / `Enter` | left click | FIRE |
| Overdrive | `Shift` | right click | BOOST |
| Pause | `P` / `Esc` | — | — |
| Mute | `M` | — | — |
| Retry | `R` | — | — |

Arrow keys and the mouse use analog fly-to steering; `WASD` is direct thrust.

## What's in the box

- **Shader tunnel** — a helical, panelled transit tube (2 stacked meshes: an opaque
  hull shell and an additive neon grid) with travelling energy pulses, running
  lights and per-sector palettes that cross-fade.
- **Post-processing** — Unreal bloom, ACES tone mapping, chromatic aberration,
  radial boost blur, damage bleed, scanlines, grain and vignette.
- **Combat** — plasma bolts, 3 weapon tiers, kamikaze drones with telegraphed
  shots, mines, asteroids, armoured barriers and energy walls.
- **Wardens** — a boss construct per sector with 4 attack patterns (volley, fan,
  sweeping wall, drone deployment), armour flashes and a death sequence that
  opens the gate ring into the next sector.
- **Systems** — hull, shields, overdrive (boost), quantum time dilation,
  combo/multiplier up to ×8, near-miss rewards, pickups for every system.
- **HUD & flow** — boot sequence, live-attract menu, flight manual, records
  archive (localStorage), pause menu, game-over stats, toasts, floating score
  callouts, screen shake and reduced-flash accessibility option.
- **Audio** — procedural synth score (pads, bass, arpeggios, drums) that opens up
  during boss fights, plus synthesised weapons, explosions, pickups and gates.
- **Quality presets** — Ultra / High / Performance. Performance skips the
  post-processing stack and lowers the pixel ratio.

## Structure

```
src/
  main.js       bootstrap, input, screen flow, render loop
  game.js       run state, spawner, collisions, scoring, camera
  tunnel.js     shader tube
  backdrop.js   stars, nebulae, gas giant, dust
  ship.js       player interceptor + shield shader
  hazards.js    barriers, asteroids, drones, mines, pickups, gate
  boss.js       Warden boss + attack patterns
  projectiles.js pooled bolts
  fx.js         particles, shockwaves, flashes
  audio.js      procedural music + SFX
  ui.js         HUD and menus
  path.js       tube centreline shared with GLSL + sector palettes
  textures.js   canvas-generated textures
  storage.js    settings and run archive
  util.js       math / helpers
```
