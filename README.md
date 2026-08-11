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
- Opens with a 0.75s hold-to-bloom `For Hà Chang` button, then smoothly blooms into the heart.
- Stripe-inspired theme menu with icon-only toggle and compact theme options.
- Refined heartbeat idle motion with a subtle glow pulse.
- Softer root fade keeps the heart center from becoming too dense.

## Run
Open `index.html`, or use VS Code Live Server.

## Vercel
Deploy the folder as a static site. No build command or environment variables are required.

## String-motion update
- Heart rays are split into multiple GPU segments instead of one rigid line.
- Pointer interaction detects where the cursor touches each ray and bends the downstream part, so the free tip moves more strongly like a shaken string.
- Pointer velocity launches a damped travelling wave toward the tip.
- Heart colors are darker/more saturated while backgrounds are lighter/milkier for stronger separation.
