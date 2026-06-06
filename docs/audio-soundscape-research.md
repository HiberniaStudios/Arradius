# Soundscape research — how to build Arradius's ambience properly

A synthesis of multi-source research into how to make a **fully-synthesized
(Web Audio, no sample files)** game soundscape that is *atmosphere felt at the
edge of attention* — not an intrusive, repetitive drone. This is the reference
for rebuilding `src/audio/AudioManager.js`.

> **Method & confidence.** Findings come from 5 parallel research passes
> (psychoacoustics, Web Audio implementation, acclaimed game soundscapes,
> adaptive audio, synthesis craft). Live page-fetching was blocked in the
> research environment, so claims rest on search-result summaries of
> authoritative pages. **Psychoacoustics claims are high-confidence** (peer
> reviewed: NCBI/PMC, PNAS, Frontiers). **Specific numbers** (loop seconds, dB
> offsets, cents) are practitioner heuristics — treat as starting points, tune
> by ear. Sources are listed at the end.

---

## Part 1 — Why our current engine feels intrusive & repetitive

Mapping the research to what `AudioManager.js` actually does today:

| Our engine does… | Why it backfires (research) |
|---|---|
| A **continuous** drone chord + pad + sub, always on | Constant, unchanging sound is *both* fatiguing and eventually tuned out; the ear relegates sound to "background" using **dynamic contrast and silence**, which we never give it. |
| **One** ~36 s sine LFO "breathing" the whole bus | A single periodic modulator *is* a loop. The brain's repetition detector locks onto regular cycles fast; "whoosh-whoosh" at a fixed rate reads as a machine, not a world. |
| Each drone note = **one oscillator** with a tiny gain wobble | Static spectrum + near-perfect periodicity = the classic "synthetic/fake" tell. No beating, no micro-variation. |
| **White** noise for wind/air (`Math.random()`) | White noise is harsh and hiss-forward; natural air/wind wants a downward spectral slope (**pink/brown**). |
| Drone + pad + sub stacked in the **low-mids**, wet | Overlapping 200–500 Hz energy is the prime source of "mud" and masking — it smothers and presses rather than recedes. |
| **Gongs/pings** ring out, fairly loud, semi-regular | Sharp onsets + spectrally-distinct events trip the **deviance detector** (an involuntary ~250–350 ms attention grab) and get segregated into the *foreground* stream. Recurring, they become "that sound again." |
| Levels sometimes set on `.value` directly | Risks zipper/click artifacts that foreground the bed. |

**The one-line diagnosis:** our bed is *continuous, single-period, static-spectrum,
white-noise, constant-loudness* — almost exactly the inverse of every principle
that makes ambience recede.

---

## Part 2 — The principles (the science)

**Repetition & habituation**
- The auditory system has dedicated repetition-detection machinery; it spots a
  repeating loop from its **periodicity alone**, regardless of content. Regular
  (even) repetition is detected *faster* than irregular — so jitter hides loops.
- **Stimulus-specific adaptation:** the brain suppresses response to frequent/
  steady sound but lets novel "deviants" through to grab attention. Steady bed →
  tuned out; any abrupt change → intrudes. Keep change **gradual and spectrally
  consistent**.
- The reconciliation: a background should be **statistically predictable** (so
  it's ignorable) but **not literally periodic** (or repetition-detection flags
  it). Achieve this with *asynchronous layering + slow modulation*.

**Co-prime / incommensurate cycles (the foundational trick)**
- Layer loops/modulators of mutually non-divisible lengths; the combination
  doesn't recur until the **least common multiple** of all lengths → effectively
  never. Eno's *Music for Airports* used ~7 tape loops of ~17.8–29 s.
- Applies at every level: whole loops, **and** the LFOs driving cutoff, detune,
  gain, pan. Multiple slow LFOs at unrelated rates = motion that never repeats.

**Dynamics, silence, spectral space**
- Preserve dynamic range; **silence and rests** are what make a bed read as
  background. Constant high RMS foregrounds it.
- Background sits roughly **15–25 dB under** foreground (broadcast heuristic).
- Carve the low-mids (~200–500 Hz, esp. 200–300 Hz) to kill mud; deliberately
  **don't fill the whole spectrum** — leave the ~2–6 kHz presence band for UI/
  key SFX.

**Auditory scene analysis (foreground vs background)**
- Sounds with **soft attacks, steady timbre, stable spatial position, and smooth
  evolution** fuse into the background stream. **Sharp onsets, level jumps, and
  spectral outliers** break into the foreground. Make events *emerge* (slow
  attack, fed to reverb) rather than *strike*.

**Making synthesis sound organic**
- **Detune-beating:** unison oscillator pairs detuned ±5–7 cents create slow
  beating — built-in "alive" movement.
- **Micro-variation:** randomize control params by only a *few percent*; combine
  slow drift (0.01–0.05 Hz) with subtle faster flutter; smooth the randomness
  (**Perlin/value noise**, not white) or it "steps" audibly.
- **Reverb is an instrument:** long, dark tails (2–4 s "big space", 5 s+
  "cathedral", damped ~4.5–6 kHz) blur sparse events into a continuous wash.
- **Constrained randomness:** snap random pitches to one mode/drone root so any
  overlap is consonant; weight choices (or Markov) so it implies a key.

---

## Part 3 — Concrete redesign plan for `AudioManager.js`

Ordered by impact. Each maps to the principles above.

1. **Kill the single 36 s breath; drive loudness/character from 3–4 co-prime
   slow LFOs** (e.g. periods 17 s, 23 s, 31 s, 41 s) summed via `ConstantSource`
   + gains into the music-bus gain and into filter cutoffs. Nothing lines up →
   no audible cycle. *(co-prime, anti-repetition)*

2. **Make the bed genuinely sparse.** Let the music bed recede to true silence
   for stretches (long, irregular rests) with the reverb tail carrying — don't
   just dip to 0.02. Atmosphere from the space *between* sounds. *(silence,
   habituation)*

3. **Unison-detune every drone/pad voice** (±5–7 cents pairs) for slow beating;
   give each voice its **own** slow gain/detune LFO at an incommensurate rate.
   *(organic beating, micro-variation)*

4. **Switch noise to pink/brown.** Generate pink (Paul Kellet filter) or brown
   (leaky integrator) noise once into the shared buffer; use it for all air/wind/
   room-tone. Calmer, less hiss. *(noise color)*

5. **Soften and rarefy events.** Gongs/pings: longer attacks (emerge, not
   strike), lower level, rarer, and routed **mostly to the reverb send** so they
   sit distant and spectrally continuous with the bed — or drop them where they
   only ever popped (the hall). *(anti-deviance, scene analysis)*

6. **Carve the spectrum.** Keep the bed dark (done) but add a gentle dip ~200–
   400 Hz to de-mud, and keep the bed out of 2–6 kHz. *(masking)*

7. **Always ramp AudioParams** — `setTargetAtTime(…, ~0.015)` or
   `linearRampToValueAtTime`; never assign `.value` mid-playback. *(no zipper)*

8. **Modulate with smooth (Perlin/value) noise, not white,** for cutoff/detune/
   pan drift; combine a slow octave + a faint fast octave. *(organic drift)*

9. **Reverb as the instrument:** keep long dark tails; bias sparse events wet so
   they blur into a wash rather than reading as discrete hits. *(space)*

---

## Part 4 — Adaptive layer (room / tension), kept subliminal

- **One smoothed `intensity` scalar (0–1)** as a homegrown RTPC: every frame,
  `smoothed += (target − smoothed) * k`; audio reads the *smoothed* value, never
  raw game state.
- **Vertical layering:** keep parallel synth voices always running, change only
  their **gains** (preserves phase/continuity). Give each layer a shaped
  entry/exit window on the intensity axis.
- **Equal-power crossfades** (`cos`/`sin`, cross at ~0.707), not linear, to avoid
  the mid-fade dip. Fade times by purpose: **0.2–1 s** reactive, **2–3 s** room/
  zone, **5–30 s** mood.
- **Room = a "snapshot"** of target params (master cutoff, reverb mix, bed-layer
  gains); interpolate all toward the new set over ~1–3 s so rooms feel like one
  continuous world, not a switch.
- **Hysteresis + decay** to stop chatter: separate enter/exit thresholds per
  layer, a minimum hold time, and let `intensity` decay slowly after spikes.
- **Quantize musical changes** to a beat/bar via a **lookahead scheduler**
  (`currentTime` + ~25 ms tick, ~0.1 s window); ambience (no beat) can free-fade.

---

## Part 5 — Honest limits & tradeoffs

- **Most celebrated "generative" game audio isn't real-time synthesis** — No
  Man's Sky and RDR2 *recombine authored material* under runtime logic. Pure
  synthesis is actually our advantage (we can generate live), but the realistic
  target is **Eno-style co-prime layering + room-driven layering of small
  synth voices + sparseness** — that captures ~80% of the effect cheaply.
- **Voice, real instruments, and recognizable real-world textures are very hard
  to synthesize** convincingly; that's where samples normally win. We've chosen
  pure synthesis, so spend the "saved sample budget" on **more layers + more
  independent slow modulation** — which is exactly what buys "organic."
- **CPU scales with voice/node count.** Oscillators are cheap; huge graphs and
  the deprecated `ScriptProcessorNode` are where the browser stalls. Use
  `AudioWorklet` for any per-sample DSP (custom noise, granular).
- **Numbers are starting points.** The dB/seconds/cents figures are heuristics
  from mixed contexts — tune by ear in-game, with gameplay audio present.

---

## Part 6 — The Spice Opera (Dune '92): the *specific* target

Generic ambient principles (Parts 1–4) make the bed *recede*; the Spice Opera is
what makes it *Arradius*. This is the identity to synthesize.

### What it actually was (three different things — don't conflate them)
- **In-game PC audio:** Stéphane Picq's sequences realised live on the **AdLib/
  Sound Blaster OPL2 (YM3812) FM chip** by **HERAD** ("Herbulot AdLib"), a custom
  driver by Cryo's Rémi Herbulot. Also MT-32 / AdLib Gold.
- **Amiga audio:** sample-based **tracker modules** (Paula playback), *not* FM.
- **"Dune: Spice Opera" CD (Exxos, 1992):** a **separate studio re-recording**
  (Picq + Ulrich) — lush synths/samplers. This polished version is the *aesthetic*
  north star; HERAD is the *expressivity* lesson. **For our pure-synth engine we
  fuse both:** album-style lush subtractive pads + HERAD-style per-note-expressive
  FM voices.

### The HERAD lesson — expressive FM (the thing that made it sound alive)
HERAD's standout trick (confirmed from the reverse-engineered driver source):
it modulated **individual FM patch parameters per note in real time** —
*carrier output level* (← velocity = loudness), *modulator output level* (←
velocity = brightness/index), and *feedback* (← aftertouch = harmonic grit) —
instead of playing static presets. That per-note movement is *why* a primitive
2-operator chip sounded expressive. **The transferable rule: every note should
move — brightness/amplitude/pitch shaped per-note, not fixed.**

**2-operator FM in Web Audio** (the universal idiom — modulator's output is
*added* to the carrier's frequency AudioParam):
```js
// modulator → modGain(index, in Hz) → carrier.frequency ; carrier → out
modulator.connect(modGain); modGain.connect(carrier.frequency);
// HERAD character = automate the index, don't leave it static:
modGain.gain.setValueAtTime(index * velocity, now);          // bright on attack
modGain.gain.exponentialRampToValueAtTime(index * 0.25, now + 0.6); // mellow tail
```
- **FM ratio cheat-sheet:** integer ratios (1:1, 2:1) → harmonic (pads, reedy
  leads); inharmonic (3.5:1, 1:3.5) → metallic **bells/chimes** (very Dune). The
  **index envelope** (bright attack → mellow sustain) is the single most
  important HERAD move. Up to **9 voices** mirrors the OPL2's 9 channels.
- Approximate OPL2 feedback/“grit” with a small `WaveShaper`/`AudioWorklet`
  self-feedback term; emulate its half/abs/quarter-sine waves via `PeriodicWave`.

### The aesthetic signatures (rank-ordered, with synthesis recipes)
1. **Drone-anchored modal harmony, no functional cadences** — hold a tonic+fifth
   pedal; draw melody from **Phrygian / Phrygian-dominant (Hijaz)** for the desert
   color (the b2 and the 2↔3 augmented-2nd gap). *(mode-feel: medium conf; exact
   per-track mode: unverified — treat as artistic choice.)*
2. **The "crying flute" lead** (the defining foreground voice) — sine/triangle +
   a low-mixed **bandpass-noise "breath"** layer (~1.5–3 kHz) louder on attack +
   ~5 Hz vibrato + **portamento** glides between notes. Used sparingly, solo.
3. **Warm, yearning detuned-saw pads** — 2–3 saws ±5–12 cents → gentle resonant
   lowpass, slow attack, big reverb; **open/suspended voicings** (4ths/2nds,
   avoid bright major 3rds).
4. **Tangerine-Dream sequencer bass** — steady 16th-note arpeggio (saw → resonant
   LP, short decay) over a sine sub-drone. The engine of the "rhythmic" state.
5. **Inharmonic FM bells/chimes** — sparse single notes, long decay, the FM-ratio
   trick above. The "chiming fragments" sparkle.
6. **Loose ritual hand percussion** — bandpass-noise bursts (varied centers) +
   pitch-drop sine "membrane"; swung, sparse, never a rock kit.
7. **An "organic" non-pitched layer under everything** — breaths, sighs, water
   (filtered noise + slow random AM/envelopes), per Picq's own "organic" descriptor.
8. **"Sandy/crispy/grainy" grit** — a little noise/detune/bitcrush in pad attacks
   so nothing sounds clean or GM-generic.
9. **Per-note expressivity (the HERAD lesson)** — modulate filter/index/amp/pitch
   per note from "velocity"; attack pitch-bends; drum pitch-drops.
10. **Two states, crossfaded by location, tonic held constant** — *Ambient*
    (drone + lonely flute + tiny ostinato → desert/sietch) vs *Rhythmic* (bass
    sequence + percussion + lead → palace/flight). The score was **location-tied**,
    built/broken by **layer accretion**.

### How this maps onto Arradius
- **Residency (palace):** fuller yearning pads + the lonely crying-flute lead +
  sparse FM bells. **Expedition (desert):** sparse ambient drone + sub + a tiny
  4-note Phrygian-dominant ostinato; flute only rarely. Per-room recipes gain a
  **modal melodic layer** instead of just wind/gongs.
- The Part 1–4 engine (co-prime modulation, sparseness, pink noise, soft events,
  smoothed room crossfades) becomes the *delivery system*; these signatures are
  the *content* it delivers — keeping the tonic constant across rooms for one
  continuous world.

> **Honesty:** exact scales/tempos per track and the precise in-game switching
> mechanism are **not verified** (inferred from influences + the location-cue
> structure). "Floppy Dune" could not be confirmed as a real track. HERAD itself
> was FM/OPL2; the album's lushness came from studio synths/samplers — our
> pure-synth engine deliberately blends both characters.

---

## Sources (primary)

**Psychoacoustics:** ncbi.nlm.nih.gov/pmc/articles/PMC10637696, PMC4731741,
PMC3293709 (repetition detection); PMC9829473, physiology.org
10.1152/physrev.00011.2022 (stimulus-specific adaptation); PMC12301874,
pnas.org/doi/10.1073/pnas.0303760101 (deviance/orienting); frontiersin.org
10.3389/fnins.2014.00060 (predictable background); en.wikipedia.org/wiki/
Auditory_scene_analysis (Bregman).

**Web Audio:** web.dev/articles/audio-scheduling ("Two Clocks"); MDN
Web_Audio_API/Advanced_techniques, AudioParam/setTargetAtTime; firstpr.com.au/
dsp/pink-noise (Kellet); noisehack.com/generate-noise-web-audio-api (pink/brown/
white); alemangui.github.io/ramp-to-value (zipper); developer.chrome.com/blog/
audio-worklet.

**Case studies:** vgmpf.com HERAD (Dune); gdcvault.com/play/1015986 (Journey);
gamedeveloper.com … human-skull / killscreen.com (INSIDE); en.wikipedia.org/
wiki/Music_of_Red_Dead_Redemption_2; asoundeffect.com/no-mans-sky-sound-
procedural-audio + gdcvault.com/play/1024067 (No Man's Sky "Pulse");
reverbmachine.com … music-for-airports, teropa.info/loop (Eno); en.wikipedia.org/
wiki/Proteus_(video_game); designingsound.org … mini-metro.

**Adaptive:** oreilly.com … writing-interactive-music ch09 (vertical remixing);
audiokinetic.com … mapping_values_in_rtpc_graph, courses/wwise201 (RTPC,
transitions); fmod.com … mixing.html (snapshots); thegameaudioco.com … vertical-
layering-vs-horizontal-resequencing; teedteed.wordpress.com / signalsmith-audio.
co.uk (equal-power crossfade).

**Synthesis craft:** designingsound.org … andy-farnell interview; mitpress.mit.
edu/9780262014410 (Designing Sound); thinkingsound.wordpress.com … pure-data-
wind-generator; lac.linuxaudio.org/2018/pdf/14-paper.pdf (Perlin noise in
synthesis); soundonsound.com … synth-secrets; soundbridge.io … deep-drone
(detune); splice.com/blog/procedural-audio-video-games (limits).

**Spice Opera (Dune '92):** gameloadedmuseum.wordpress.com … stephane-picq-
interview (primary, 2025); greatestgamemusic.com/soundtracks/dune-soundtrack;
filfre.net … cryos-dune (Digital Antiquarian); en.wikipedia.org/wiki/
St%C3%A9phane_Picq; dune.fandom.com/wiki/Dune:_Spice_Opera; fr.wikipedia.org/
wiki/Dune:_Spice_Opera (version breakdown). **HERAD/FM tech:** github.com/
synamaxmusic/herad (reverse-engineered driver source); vgmpf.com/Wiki/index.php/
HERAD; github.com/adplug/adplug/issues/39; en.wikipedia.org/wiki/Yamaha_YM3812;
moddingwiki.shikadi.net/wiki/OPL_chip; greweb.me/2013/08/FM-audio-api +
tonejs.github.io (FMOscillator) + MDN AudioParam (Web Audio FM idiom).
