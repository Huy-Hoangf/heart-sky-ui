# Motion Heart

Static HTML/CSS/JavaScript project. No backend required.

## What changed
- WebGL full-screen liquid gradient inspired by the visible Stripe homepage palette.
- Heart ray motion moved to GPU vertex shader.
- No per-frame typed-array allocation, reducing garbage-collection stutter.
- Delta-time movement, low-frequency coherent flow, soft pointer spring.
- Responsive heart bounding box for mobile portrait and landscape.
- No outline around the heart.
- Theme menu remains compact.
- Opens with a 0.2s hold-to-bloom polaroid slip, then smoothly blooms into the heart.
- Stripe-inspired theme menu with icon-only toggle and compact theme options.
- Refined heartbeat idle motion with a subtle glow pulse.
- Softer root fade keeps the heart center from becoming too dense.
- Centerline ray density is reduced for a softer heart core.
- Magnetic pointer field makes the rays follow touch with smoother inertia.
- Background colors are more saturated and react softly to pointer movement.
- Heart palettes now use contrasting warm/cool pairs so every theme separates the heart from the background.
- Added true layered ray groups, a soft inner glow, a heartbeat wave, tiny edge sparkles, and slow color drift.
- Theme colors are matched to the approved six-theme palette demo in `theme-demos/theme-palette-demo.svg`.
- Heart silhouette is rounder, with a shorter bottom point and fuller body.
- Backgrounds keep saturated color at the edges while a softer center stage helps the heart stand forward.
- Pointer/touch interaction now uses a wider swept brush trail, so rays bend like fibers under a fingertip instead of reacting to a single point.
- A subtle lift shadow pass is drawn behind the heart to separate it from the background without a hard outline.
- Pointer shaping is softened to avoid a sharp pulled tip, and palettes are tuned toward cinematic rose, pearl, champagne, and muted cobalt tones.
- Theme art direction is split into six distinct moods while the heart keeps the prior silhouette.
- The lower tip uses a rounded pointed V so the center stays lowest while the point is softened.
- Heart rendering now uses a puffy silhouette mask so stray rays are clipped inside the intended heart shape.

## Run
Open `index.html`, or use VS Code Live Server.

## Vercel
Deploy the folder as a static site. No build command or environment variables are required.

## String-motion update
- Heart rays are split into multiple GPU segments instead of one rigid line.
- Pointer interaction detects where the cursor touches each ray and bends the downstream part, so the free tip moves more strongly like a shaken string.
- Pointer velocity launches a damped travelling wave toward the tip.
- Heart colors drift between two harmonious tones while backgrounds stay visually separate.
