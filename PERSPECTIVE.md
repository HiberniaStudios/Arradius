# Faking 3D in a 2D Painted Hall — Perspective & Lighting Guide

A field guide for building convincing depth in Arradius's procedurally-drawn
scenes (Phaser `Graphics`, no sprites). Distilled from the Residency hall build.
Read this before adding a new room so every interior shares one coherent space.

Reference implementation: `sceneHall()` and `column()` in
[`src/scenes/ResidencyScene.js`](src/scenes/ResidencyScene.js).

---

## 1. The one rule: build a BOX, not a tunnel to a point

The biggest early mistake was converging **every** plane (floor, ceiling, walls)
to a single vanishing point with `fillTriangle(edge, edge, vp)`. That makes a
tunnel collapsing to infinity — there is no surface at the far end, so the floor
appears to "wrap" into the point and anything placed deep (a door) floats.

**Correct model — a one-point perspective _box_:**

- A small **back-wall rectangle** sits at the far end. This is a real surface.
- Floor, ceiling and the two side walls are **trapezoids** connecting the
  full-size front frame to the four edges of that back wall. They **stop at the
  wall**; they never collapse to a point.
- Together the four trapezoids + back-wall rectangle tile the whole scene with
  no gaps and no overlaps.

```
(0,0) ┌─────────────────────────────┐ (W,0)
      │\          CEILING          /│
      │ \  ┌───────────────────┐  / │
      │  \ │     BACK WALL     │ /  │   ← door sits flat on THIS
      │ L │ │  (the far end)   │ │ R │
      │ W  \└───────────────────┘/  W │
      │ A   \      FLOOR        /   A │
      │ L    \                 /    L │
(0,B) └───────────────────────────────┘ (W,B)
```

Everything else (door, columns, banners) is positioned **relative to the back
wall**, so the whole scene scales together.

---

## 2. Define the box from a few constants

```js
const cx       = width / 2;
const sceneBot = Math.round(height * 0.72);   // bottom of the painted area (nearest the viewer)

// Back wall (far end). Pick width as a fraction of screen; derive the rest.
const bwW   = Math.round(width * 0.20);        // back-wall width  → controls apparent depth
const bwL   = cx - bwW / 2;
const bwR   = cx + bwW / 2;
const bwBot = Math.round(floorY * 0.66);       // where the FAR floor meets the back wall
const bwTop = Math.round(floorY * 0.10);       // top of the back wall (near the ceiling)
```

- **Smaller `bwW` → deeper-looking hall** (more aggressive convergence).
- Keep the back wall centred (`bwL`/`bwR` symmetric about `cx`) for a head-on view.
- The four planes are then just `fillPoints([...4 corners], true)` trapezoids.
  See §1 ASCII for which front corner maps to which back corner.

### Depth math (memorise these two lines)

For a point at depth fraction `d` (0 = nearest/front frame, 1 = at the back wall):

```js
const floorAtD = sceneBot + (bwBot - sceneBot) * d;   // floor line at depth d
const ceilAtD  = bwTop * d;                            // ceiling line at depth d (front ceiling = 0)
const hScale   = 1 - d * (1 - bwW / width);            // horizontal shrink at depth d
```

`floorAtD`/`ceilAtD` are **horizontal lines** at each depth because the box is
axis-aligned. That is what lets objects "sit" at a believable depth.

---

## 3. Placing objects so they share the perspective

An object at depth `d` must derive **all** of its geometry from the box, or it
will look pasted on (this was the "pillars don't match" bug).

```js
const d      = 0.5;                       // chosen depth
const hScale = 1 - d * (1 - bwW / width); // horizontal scale at this depth
const offX   = FRONT_OFF * hScale;        // horizontal offset shrinks with depth
const baseY  = sceneBot + (bwBot - sceneBot) * d; // stands on the floor at depth d
```

Rules that made columns finally read as 3D:

1. **Both horizontal offset AND width scale by `hScale`.** A column's distance
   from centre and its thickness shrink by the same factor → the row converges
   with the walls.
2. **Tall objects span floor→ceiling AT THEIR DEPTH.** A column's base is
   `floorAtD`, its capital touches `ceilAtD`. Don't invent a height — read it off
   the box. This is what "touching the ceiling and receding along the ceiling
   axis" means in code.
3. **The hall is intentionally taller than a uniform scale would give** (the
   ceiling rises from `0` to `bwTop` faster than the width shrinks). That
   vertical exaggeration reads as grand/cathedral-like — keep it, but it means
   height and width use *different* scale factors (vertical from the ceiling
   line, horizontal from `hScale`).

### Avoid the colonnade-bunching overlap

Evenly-spaced columns naturally crowd toward the vanishing point, so with wide
capitals the near + middle ones overlap. Fixes:

- **Spread the depth values** (`[0.04, 0.50, 0.78]` worked better than
  `[0.05, 0.38, 0.68]`) so the middle pair sits clearly inboard of the near pair.
- **Trim capital/abacus overhang** (we used `1.32×` shaft width, not `1.5×`).
- Check the math: near object's inner edge offset must exceed the next object's
  outer edge offset.

---

## 4. Round forms: barrel shading, not flat stripes

Flat fills + alternating high-contrast stripes read as 2D planks. To make a
column look cylindrical, shade it as a **barrel** with vertical bands:

```js
// p in [0,1] across the width. Brightness peaks toward the lit side, falls to
// near-black at both edges → a rounded cylinder.
let f = 1 - Math.abs(pm - pPeak) / 0.78;   // pPeak ≈ 0.74 if lit from the right
f = Math.max(0, Math.min(1, f));
f = f * f;                                 // tighten the highlight
const col = f < 0.5 ? lerpC(SHADOW, MID, f * 2)
                    : lerpC(MID, LIGHT, (f - 0.5) * 2);
```

- ~12–14 bands is plenty; draw each as a thin tapered trapezoid slice.
- Add **subtle** fluting grooves (1–2px dark lines at low alpha) *over* the
  barrel shading — never as the primary form.
- Three-stop ramp (`SHADOW → MID → LIGHT`) with an RGB `lerp` helper gives smooth
  rounding. Keep the helper local; Phaser fills want integer colours.

---

## 5. One light source, lit consistently

- Pick a single in-scene light (here: the **glowing doorway** at centre-back).
- Objects are lit **toward** that source. Left-of-centre columns are bright on
  their right face; right-of-centre columns bright on their left. Pass a
  `litDir` and flip `pPeak`.
- **Never let décor out-shine the light source.** An early bug had the sandstone
  arch surround brighter than the glow it framed, killing the focal point. The
  hero (the lit opening) must be the brightest thing in the composition.

---

## 6. Atmospheric depth (value, not just size)

Painters fake distance with **falling contrast**, not only smaller size:

- Dim everything by depth: `const dim = 1 - depth * 0.30;` applied as fill alpha.
- Far objects → lower contrast, muted/cooler. Near objects → warm, high contrast
  (bright highlight + near-black shadow).
- Add a **near-corner shadow vignette** on the side walls (darkest closest to the
  viewer) and a soft full-screen `vignette` overlay for mood.

---

## 7. Palette lessons

- **Stay in one temperature family.** The hall is warm copper/terracotta
  (`#2a1408` shadow → `#c06028` lit). A cold cobalt banner clashed badly; deep
  wine/crimson (`#6e0c1a`) sits inside the warm palette while still reading as a
  distinct house colour.
- Complementary accents are fine **if desaturated/warm-leaning** — think Dune '92
  (terracotta walls, muted house banners), not modern UI primaries.
- Gold (`#c9a24a`) is the unifying trim/highlight throughout (frames, cornices,
  sigils, light lines).

---

## 8. Anchor every prop to a surface

Floating décor breaks the illusion. Banners now mount on the **back wall**,
centred in the gap between each door edge and the wall edge
(`(bwL + archL) / 2`), with a visible hanging rod + finials. Anything on a wall
should scale with that wall's depth and show its attachment (rod, bracket, ring).

---

## 9. Gotchas / non-obvious

- **Don't apply the Kuwahara post-FX to the whole camera** — it blurs UI text and
  buttons too. It's a per-object/background effect, kept behind the `K` toggle.
- `pixelArt: true` + serif UI fonts is intentional but means draw at integer
  coords (`Math.round`) to avoid shimmer on the `RESIZE` canvas.
- Everything is redrawn on `resize`, so all geometry must be expressed as
  fractions of `width`/`height` (or of the box), never hard pixels.

---

## 10. Iterating visually (important workflow)

The Chrome automation can't screenshot a running WebGL/Vite page (the HMR socket
keeps it from going idle). Use the **`Claude_Preview` MCP** instead:

1. `.claude/launch.json` defines the `arradius` dev server (`npm run dev`, 5173).
2. `preview_start` → `preview_screenshot` captures the canvas directly.
3. Edit → Vite HMR updates live → screenshot → judge → repeat.

Art changes are guesswork without this loop; always verify visually.

---

## Reusable checklist for a new room

- [ ] Define `sceneBot`, back-wall rect (`bwW`, `bwL/R`, `bwTop/Bot`).
- [ ] Draw 4 plane trapezoids (ceiling, floor, L wall, R wall) + back-wall face.
- [ ] Place the focal feature (door/throne/altar) flat on the back wall.
- [ ] Add props at chosen depths using `hScale`, `floorAtD`, `ceilAtD`.
- [ ] Barrel-shade round forms; light everything toward the focal source.
- [ ] Dim + reduce contrast with depth; vignette the near corners.
- [ ] Stay in the warm palette; don't out-bright the light source.
- [ ] Verify with `preview_screenshot`, not by eyeballing the code.
