# Faking 3D in a 2D Painted Hall — Perspective & Lighting Guide

A field guide for building convincing depth in Arradius's procedurally-drawn
scenes (Phaser `Graphics`, no sprites). Distilled from the Residency hall build
and cross-referenced against classic point-and-click adventure pipelines (Monkey
Island, Grim Fandango, Broken Sword, Riven, Cryo's Dune).

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
      │  \ │     BACK WALL     │ /  │   ← door/focal feature sits flat on THIS
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

### Choosing back-wall width

Back-wall width is a **creative choice** that sets implied depth (field of view):

| Back-wall width (% of canvas) | Effect |
|-------------------------------|--------|
| 20–30 % | Deep room / wide FOV, dramatic compression, strong convergence |
| 40–55 % | **Sweet spot** — comfortable spatial read, classic adventure game look |
| 60–70 % | Shallow room, mild perspective, almost isometric feel |

Most point-and-click adventure game rooms (LucasArts, Sierra, Broken Sword)
fall in the **40–55 % range**. The Arradius hall uses ~20 % for a cathedral
depth — intentionally more dramatic. Intimate rooms (quarters, infirmary) may
suit 45–55 %; grand civic rooms (court) suit 25–35 %.

**Off-centre VP** for more dynamic, asymmetric rooms — place the VP slightly
left or right of `cx`. Classic adventure games did this often.

- **Smaller `bwW` → deeper-looking hall** (more aggressive convergence).
- Keep the back wall centred (`bwL`/`bwR` symmetric about `cx`) for a head-on view.
- The four planes are then just `fillPoints([...4 corners], true)` trapezoids.
  See §1 ASCII for which front corner maps to which back corner.

### Phaser trapezoid code pattern

```js
// Floor trapezoid
g.fillPoints([
  { x: bwL, y: bwBot },  // back-wall bottom-left
  { x: bwR, y: bwBot },  // back-wall bottom-right
  { x: W,   y: H     },  // canvas bottom-right (nearest viewer)
  { x: 0,   y: H     },  // canvas bottom-left
], true);

// Ceiling
g.fillPoints([
  { x: 0,   y: 0      },
  { x: W,   y: 0      },
  { x: bwR, y: bwTop  },
  { x: bwL, y: bwTop  },
], true);

// Left wall
g.fillPoints([
  { x: 0,   y: 0      },
  { x: bwL, y: bwTop  },
  { x: bwL, y: bwBot  },
  { x: 0,   y: H      },
], true);

// Right wall
g.fillPoints([
  { x: W,   y: 0      },
  { x: W,   y: H      },
  { x: bwR, y: bwBot  },
  { x: bwR, y: bwTop  },
], true);
```

Apply `fillGradientStyle(tl, tr, bl, br)` **before** each `fillPoints` for
per-surface gradient (WebGL only).

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

### Depth-based object scaling (characters/props)

For characters or props that move through the room, scale linearly by y-position
(AGS continuous scaling approach — the industry standard since SCUMM):

```js
function getDepthScale(screenY, nearY, farY, minScale = 0.4, maxScale = 1.0) {
  const t = Phaser.Math.Clamp((screenY - farY) / (nearY - farY), 0, 1);
  return minScale + (maxScale - minScale) * t;
}
```

Typical ranges: `minScale` 0.35–0.55 at the back wall, `maxScale` 1.0 at the
viewer's feet. The same `t` value can drive a depth tint (see §6).

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

Flat fills + alternating high-contrast stripes read as 2D planks. A cylinder
lit from one side has seven distinct zones across its visible surface:

| Zone | Description |
|------|-------------|
| **Highlight** | Brightest, offset toward the light side from centre |
| **Direct light** | Broad lit zone, ~45–60 % of visible surface |
| **Half-light** | Transition as the surface curves away from light |
| **Terminator** | The tangent where light ends and shadow begins (soft on curved forms) |
| **Core shadow** | Darkest, just inside the shadow side — darker than both lit and reflected |
| **Reflected light** | Faint lighter band at the deep shadow edge (cool/blue bounce fill) |
| **Cast shadow** | Falls on floor/adjacent wall, harder-edged than form shadow |

To make a column look cylindrical, shade it as a **barrel** with vertical bands:

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
- Add a faint **reflected light band** at the far shadow edge (slightly lighter,
  cooler than core shadow) — this single addition makes a cylinder look
  fully rounded rather than half-lit.

---

## 5. One light source, lit consistently

- Pick a single in-scene light (for the hall: the **glowing doorway** at centre-back).
- Objects are lit **toward** that source. Left-of-centre columns are bright on
  their right face; right-of-centre columns bright on their left. Pass a
  `litDir` and flip `pPeak`.
- **Never let décor out-shine the light source.** An early bug had the sandstone
  arch surround brighter than the glow it framed, killing the focal point. The
  hero (the lit opening) must be the brightest thing in the composition.

### Cast shadows in perspective (LSVP / ShVP method)

For significant objects, cast a proper floor shadow:

1. Identify the **Light Source Vanishing Point (LSVP)** — for a window/torch,
   place this high in the scene at the light's screen position.
2. The **Shadow Vanishing Point (ShVP)** is directly below LSVP on the horizon
   line (drop a vertical from LSVP to horizon).
3. For a vertical edge: draw a line from LSVP through the top of the edge (gives
   the shadow's outer angle). Draw a line from ShVP through its base (gives the
   floor direction). Shadow falls at their intersection.

For quick approximation: a **soft dark ellipse** at the object's base
(width ≈ 0.8× base, height ≈ 0.2× width, alpha 0.45–0.6) grounds any prop
without full shadow math. This is the single most effective trick for preventing
objects from appearing to float.

---

## 6. Atmospheric depth (value, not just size)

Painters fake distance with **falling contrast + temperature shift**, not only
smaller size. Interior rooms still need this, just subtly:

| Zone | Value | Saturation | Temperature |
|------|-------|------------|-------------|
| Foreground (nearest viewer) | Darkest, high contrast | Most saturated | Warmest |
| Midground (walkable, focus zone) | Mid values | Rich saturation | Neutral-warm |
| Background (back wall, far corners) | Lightest shadows, low contrast | Least saturated | Coolest, blue-shifted |

```js
// dim everything by depth:
const dim = 1 - depth * 0.30;  // applied as fill alpha
// near-corner shadow vignette on side walls (darkest closest to viewer)
```

### Applying depth tint in Phaser

```js
const t = getDepthT(obj.y);  // 0=near, 1=far
const fog = Phaser.Display.Color.Interpolate.ColorWithColor(
  { r: 0xFF, g: 0xF0, b: 0xD0 },  // near: warm
  { r: 0x80, g: 0x90, b: 0xC0 },  // far:  cool blue-grey
  100, t * 100
);
obj.setTint(Phaser.Display.Color.GetColor(fog.r, fog.g, fog.b));
```

Add a soft full-screen `vignette` overlay for overall mood.

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

### Colour temperature reference (for light sources)

| Source | Approx K | Hex range |
|--------|----------|-----------|
| Candle / torch | 2000–2500 K | `#FF9040` – `#FFAE60` |
| Warm interior lamp | 3000 K | `#FFD080` |
| Overcast daylight fill | 6000–7000 K | `#C8D8FF` |
| Deep shadow / ambient | — | `#404060` – `#303050` |
| Reflected sky light | — | `#8090C0` |

For Arradius: torch/lamplight dominates interiors (warm); the Veil's ambient
glow is the one exception (cool violet).

---

## 8. Anchor every prop to a surface

Floating décor breaks the illusion. Banners now mount on the **back wall**,
centred in the gap between each door edge and the wall edge
(`(bwL + archL) / 2`), with a visible hanging rod + finials. Anything on a wall
should scale with that wall's depth and show its attachment (rod, bracket, ring).

**The floor is the dominant depth read.** Floor perspective (converging tile
lines, a runner/carpet runner with correct foreshortening) does enormous work
establishing depth. Always design it first.

---

## 9. Common mistakes that break the illusion

1. **Inconsistent vanishing points.** Every furniture piece, door, floor tile,
   and window must share the same VP. Even one stray line going to the wrong
   point destroys the read.
2. **Floating objects.** No contact shadow = floating. Always add at minimum a
   soft dark ellipse at the base.
3. **Uniform scale across depth.** Objects the same size near and far. They must
   shrink correctly — use `getDepthScale()`.
4. **Equal detail everywhere.** Back-wall elements with the same detail density
   as foreground. Far objects must be simplified and lower-contrast.
5. **Ignored atmospheric value shift.** Back wall painted the same darkness as
   foreground. Even a subtle lightening + cool shift reads as distance.
6. **Décor out-shining the light source.** The focal glow (doorway, torch, window)
   must always be the brightest point. Secondary elements must be subordinate.
7. **Mismatched character scale to background.** Maintain a consistent reference
   "scale figure" during background construction.

---

## 10. Advanced techniques

### Fake ambient occlusion (contact shadows)

The single highest-value trick: a soft dark semi-transparent ellipse at every
object's base:

```js
g.fillStyle(0x000000, 0.45);
g.fillEllipse(obj.x, obj.baseY, obj.width * 0.8, obj.width * 0.18);
```

Draw this **before** the object. Objects immediately ground themselves to the
floor without any dynamic shadow system.

### Parallax (mouse-reactive depth)

For static rooms: subtle mouse-reactive parallax (background drifts opposite to
cursor direction at 5–15 % speed) creates "breathing" depth without scrolling.

```js
// In update():
const px = (this.input.x - cx) / cx;  // -1 to 1
this.bgLayer.x = cx + px * -12;        // drifts slightly opposite mouse
this.fgLayer.x = cx + px * 12;         // foreground drifts with mouse
```

### Depth-based blur (Phaser PostFX)

```js
backWallSprite.postFX.addBlur(0, 1, 1, 0.4);  // subtle far-plane blur
```

Use sparingly — over-blur makes scenes look out-of-focus, not deep.

### Mark Ferrari colour cycling (palette animation)

For animated ambient elements (fire glow, window light pulse) without animation
frames: tween the tint of an ADD-blend glow sprite between two warm colours on a
slow co-prime timer. Same visual effect as palette cycling at near-zero cost.

---

## 11. Interior vs exterior — different rules

| Feature | Interior | Exterior |
|---------|----------|----------|
| Perspective type | 1-point dominant | Multi-point |
| Aerial perspective | Subtle | Strong |
| Dominant depth cue | Occlusion + scale | Aerial perspective + layering |
| Parallax | Subtle / mouse-reactive | Strong |
| Light character | Bounded, warm | Broad, cool/neutral |
| Horizon visible | No (above ceiling) | Yes |
| Floor treatment | Converging pattern | Receding plane to horizon |
| Detail falloff | Modest | Steep |

For Arradius interiors: occlusion and scale carry depth. For the World Map
(exterior) and ExpeditionScene: aerial perspective, silhouette layering, and
parallax dunes carry depth.

---

## 12. Gotchas / non-obvious

- **Don't apply the Kuwahara post-FX to the whole camera** — it blurs UI text and
  buttons too. It's a per-object/background effect, kept behind the `K` toggle.
- `pixelArt: true` + serif UI fonts is intentional but means draw at integer
  coords (`Math.round`) to avoid shimmer on the `RESIZE` canvas.
- Everything is redrawn on `resize`, so all geometry must be expressed as
  fractions of `width`/`height` (or of the box), never hard pixels.
- `fillGradientStyle` is **WebGL only** — it silently no-ops on the canvas
  renderer. Always test with the WebGL path active.
- `fillPoints` triangulates its polygon — concave polygons may render incorrectly.
  For complex shapes (L-shaped walls, arched recesses) break into convex pieces.

---

## 13. Iterating visually (important workflow)

The Chrome automation can't screenshot a running WebGL/Vite page (the HMR socket
keeps it from going idle). Use the **`Claude_Preview` MCP** instead:

1. `.claude/launch.json` defines the `arradius` dev server (`npm run dev`, 5173).
2. `preview_start` → `preview_screenshot` captures the canvas directly.
3. Edit → Vite HMR updates live → screenshot → judge → repeat.

Art changes are guesswork without this loop; always verify visually.

---

## Reusable checklist for a new room

- [ ] Define `sceneBot`, back-wall rect (`bwW`, `bwL/R`, `bwTop/Bot`). Choose `bwW` for intended depth (25–35 % grand civic, 40–55 % intimate).
- [ ] Choose horizon line placement (typically 45–55 % of canvas height from top).
- [ ] Off-centre VP? More dynamic than centred — deliberate choice.
- [ ] Draw 4 plane trapezoids (ceiling, floor, L wall, R wall) + back-wall face with `fillPoints`.
- [ ] Apply `fillGradientStyle` per surface: floor dark-near/light-far, ceiling light-centre/dark-edges, walls lit-side/shadow-side.
- [ ] Place the focal feature (door/throne/altar/glow) flat on the back wall.
- [ ] Add props at chosen depths using `hScale`, `floorAtD`, `ceilAtD` — never arbitrary coords.
- [ ] Barrel-shade round forms (7-zone light-to-shadow-to-reflected-light).
- [ ] Light everything from one consistent source direction.
- [ ] Fake AO ellipse at the base of every prop.
- [ ] Dim + reduce contrast with depth; vignette the near corners.
- [ ] Depth tint: lerp toward cool blue-grey at the back wall.
- [ ] Stay in the warm palette; don't out-bright the light source.
- [ ] Verify with `preview_screenshot`, not by eyeballing the code.
