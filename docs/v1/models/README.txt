Drop-in character model
=======================

Put a GLB here named exactly:

    runner.glb

It is picked up automatically on start — no code changes needed.

What happens:
  * the model is scaled to 1.75 world units tall
  * its feet are aligned to the origin (the point that touches the tube wall)
  * it is expected to face -Z (in Blender: -Y forward, +Z up, exported with
    the usual glTF axis conversion)
  * if the file contains animations, the clip whose name matches
    run / sprint / jog / walk is played in a loop, otherwise the first clip

Until then the game uses its built-in procedural runner, which is also the
fallback if the file fails to load (check the browser console).
