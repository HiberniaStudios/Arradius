# Vision

> **Working title:** **Arradius** — the Imperial name for the world its people
> call _Aridun_.
> **Logline:** An atmospheric, painterly exploration-platformer wrapped in a
> strategy/adventure meta-layer, set in an original desert world that wears
> Frank Herbert's thematic DNA — prophecy, ecology, water-as-life, and the slow
> turning of empire.

This is a living document. It is the north star we build every feature
against. Names marked _(working)_ are placeholders — swap them freely.

---

## North star

The 1992 Cryo / Virgin Interactive **Dune** (CD-ROM). What we are chasing is
its **soul**, not its assets:

- **Stéphane Picq's _Spice Opera_ soundtrack** — hypnotic, sacred, vast. The
  single most defining element. Mood over action.
- **Painterly atmosphere** — hand-painted-feel backdrops, deep purples and
  burnt oranges, stillness and scale.
- **Two interlocking layers** — a macro strategy/exploration game (map travel,
  recruiting tribes, ecology, politics) feeding a micro on-foot experience.
- **Prescience & dreams** — a mystical, prophetic register.

We are **influenced by, not copying.** Original universe, original names,
Herbert's _themes_ worn openly.

---

## Pillars

1. **Mood first.** Atmosphere, music, and scale lead; mechanics serve them.
2. **Two layers that feed each other.** Platforming missions change the
   strategic state of the world; the strategic state reshapes the missions.
3. **Water is life.** Scarcity, ecology, and slow transformation are the
   emotional and mechanical core.
4. **Prophecy has weight.** Vision sequences hint at futures; player choices
   bend them.
5. **An original world.** Thematically Dune, legally and creatively ours.

---

## The two layers

### Traversal layer — exploration-platformer (micro)

Moment-to-moment play. Descend into warrens, cross dune-seas, explore buried
ruins. **Metroidvania-lite:** abilities (stillsuit upgrades, prescient
"reads", tribe-taught skills) gate and reopen regions.

- Hand-crafted, interconnected regions rather than discrete levels.
- Environmental storytelling — ruins, murals, the dead and the living.
- Threats: the desert itself (heat, the deep-dwelling leviathans), patrols of
  the rival power.

### Strategy / adventure layer — the meta-game (macro)

A world-map hub between expeditions:

- **Recruit tribes** of the desert nomads — each a region, a culture, a
  resource, a set of abilities they can teach.
- **Manage the lifeblood** — your spice/water analogue. Harvest vs. hoard vs.
  invest in ecology.
- **Ecology** — slowly green (or further wither) the world; visible,
  consequential, irreversible-feeling change.
- **Politics** — your house vs. the rival power; loyalty, betrayal, leverage.
- **Dialogue & character** — portrait-led conversations that gate story and
  missions.

**The loop:** strategic decisions open/close platforming expeditions →
expeditions yield resources, allies, abilities, and story → those reshape the
strategic board.

---

## Aesthetic direction

**Painterly / atmospheric.** (Chosen.)

- Hand-painted-feel backdrops, layered for parallax depth and haze.
- Palette: deep purples, indigo night, burnt orange, bone, dust. Bloom and
  god-rays for the sacred register.
- Characters: stylized, expressive portraits for dialogue; readable silhouettes
  in-world. Glowing eyes for the spice-touched.
- Restraint and negative space — let the dunes breathe.

_Until real art exists, the scaffold uses generated placeholders; the painterly
target governs every asset decision from here._

---

## Audio direction

The anti-chiptune. Toward _Spice Opera_:

- Ambient, hypnotic pads; sparse, deliberate.
- Ethnic instrumentation — ney/duduk-style winds, frame drums, vocal drones.
- Diegetic desert: wind, distant leviathan subsonics, the hiss of sand.
- Dynamic layering tied to region and tension, not loops that wear out.

_The current procedural chiptune track is a stand-in and will be replaced._

---

## World & characters — naming palette _(locked)_

The shared vocabulary. Still editable, but these are our canon.

| Role | Dune analogue | Name |
| --- | --- | --- |
| The desert world | Arrakis | **Arradius** (Imperial name) · **Aridun** (the Shamen's name) |
| The precious substance | Spice / water | **Aurun** — the glowing bloom |
| The deep monsters | Sandworms | **the Sleepers** |
| Desert nomads | Fremen | **the Shamen** |
| Their refuges | Sietch | **Hollows / Warrens** |
| The protagonist's house | House Atreides | **House Calder** |
| The rival power | House Harkonnen | **House Vorrin** |
| The galactic ruler | House Corrino / the Emperor | **House Corinthians** — the Imperial throne |
| The protagonist | Paul | **Eren**, called **the Seir** by the Shamen |

### Naming as politics

The world has two names, and which you use says whose side you're on. The
**Imperium** and the great houses call it **Arradius** — a registry name, a
holding, a source of Aurun. The **Shamen** who were born to its dunes call it
**Aridun**. The game leans on this everywhere: signage, dialogue, and faction
framing use the name that fits the speaker. Our **title is _Arradius_** — the
official name — while the world beneath it is always _Aridun_.

### The houses

A three-house triangle, in Herbert's tradition:

- **House Corinthians** — the Imperial throne. Distant, decadent, and addicted
  to Aurun. Owns the registry name _Arradius_.
- **House Vorrin** — the cruel, industrial house working Aridun for Aurun.
  Quietly favoured by the throne.
- **House Calder** — Eren's house, newly handed Aridun and walking into a trap.
  The hero's house, caught between the throne and the Vorrin.

---

## Themes

- **Ecology** — the planet as a character that changes by your hand.
- **Prophecy & free will** — does seeing the future free you or trap you?
- **Power & its cost** — empire, loyalty, the price of becoming a messiah.
- **Scarcity** — water as the truest currency.

---

## Scope & first vertical slice

We build toward the vision in thin, playable slices. **Slice 1 (proposed):**

- One region of the traversal layer (a hollow/warren) with painterly parallax
  and the new audio mood.
- One ability gate (e.g. a stillsuit upgrade that opens a new path).
- One character encounter (portrait dialogue) that hooks into a stub of the
  strategic layer.
- A first ambient music bed replacing the chiptune.

Goal: prove the _feel_ before scaling content.

---

## Tech mapping

How the current scaffold supports this:

- **Phaser 3 + Vite + Cloudflare Pages** — already in place.
- **Responsive RESIZE scene** — keeps it playable on phone and desktop.
- **To add:** Tiled/handcrafted region maps, a parallax background system, a
  dialogue/portrait system, the world-map meta-scene, a save system for
  strategic state, and a real audio pipeline (streamed music + SFX).
