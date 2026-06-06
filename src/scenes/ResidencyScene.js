import Phaser from 'phaser';
import AudioManager from '../audio/AudioManager.js';
import { enablePainterly, togglePainterly } from '../shaders/KuwaharaPostFX.js';

// The Residency — House Calder's seat, presented as static painted screens in
// the spirit of Cryo's Dune: a hub hall you navigate point-and-click, each room
// a painted scene with portrait-led dialogue. Side-scrolling is reserved for
// expeditions (the Corsair Deck) and the World Map handles strategy.

const GOLD = 0xc9a24a;
const GOLD_S = '#c9a24a';
const CREAM = '#e8d8c0';

// Experiment: use the painted PNG backdrop for the hall instead of the
// procedural art. Set false to fall back to the fully procedural hall (which
// is left completely intact). Auto-falls back if the texture failed to load.
const USE_HALL_BG = true;

const LOCATIONS = {
  hall: {
    name: 'The Residency',
    flavor:
      'The great hall of House Calder at Saltspire. Lamplight and slow dust, and the weight of a world just handed to your house.',
    feature: 'hall',
  },
  court: {
    name: 'The Court',
    who: 'Lord Aldric',
    accent: 0xffd27a,
    feature: 'court',
    say: [
      '“Arradius will test us, Eren. Hold to its people and we hold to the world.”',
      '“Korinth did not gift us this fief out of love. Watch the dunes — and watch our own halls.”',
    ],
    // The throne hall is the deeper hub; the private/sacred rooms lie past it.
    exits: ['veil', 'quarters'],
  },
  comms: {
    name: 'The Communications Room',
    accent: 0x6aa0ff,
    feature: 'comms',
    flavor: 'The long-range array hums — a window onto all of Arradius, and the houses beyond.',
    actions: [{ label: 'Open the channel', scene: 'WorldMapScene' }],
  },
  veil: {
    name: "The Veil's Sanctum",
    who: 'Mother Ysolde',
    accent: 0xb98cff,
    feature: 'veil',
    say: [
      '“The threads tangle around you, child. I cannot yet see the knot.”',
      '“When the Aurun takes you, do not look away. The Seir is born in that seeing.”',
    ],
  },
  infirmary: {
    name: 'The Infirmary',
    who: 'Master Orlin',
    accent: 0x7fd0a0,
    feature: 'infirmary',
    say: [
      '“All is well, my lord. The house is in good health.”',
      'He smiles, and bows, and holds the smile a moment too long.',
    ],
  },
  yard: {
    name: "The Bladewarden's Yard",
    who: 'Brannic',
    accent: 0xd0a070,
    feature: 'yard',
    say: [
      '“Steel won’t win Arradius alone — but it’ll keep you breathing till the Shamen do.”',
      '“Say the word and the Saltguard musters. We are yours.”',
    ],
  },
  quarters: {
    name: "Eren's Quarters",
    accent: 0x6fb0ff,
    feature: 'quarters',
    flavor: 'Your own rooms. The Aurun-dreams come here, when they come.',
  },
  deck: {
    name: 'The Corsair Deck',
    accent: 0xffce86,
    feature: 'deck',
    flavor: 'A corsair waits, wings folded against the dusk.',
    actions: [{ label: 'Ride out into Arradius', scene: 'ExpeditionScene' }],
  },
};

// Spatial adjacency — which door (direction) of each room leads where. The
// player walks the palace by clicking doors, not picking from a menu. Edit this
// to re-route the map; `forward` is the central arch, `left`/`right` the side
// doors, `back` the way you came.
const EXITS = {
  // Four wings open off the entrance hall; the throne (Court) lies beyond the arch.
  hall: { left: 'yard', right: 'infirmary', forward: 'court' }, // procedural fallback (2 doors)
  court: { back: 'hall' },
  yard: { back: 'hall' },
  infirmary: { back: 'hall' },
  comms: { back: 'hall' },
  deck: { back: 'hall' },
  veil: { back: 'court' },       // the sacred sanctum — past the throne
  quarters: { back: 'court' },   // private apartments — past the throne
};

export default class ResidencyScene extends Phaser.Scene {
  constructor() {
    super('ResidencyScene');
  }

  create() {
    this.current = 'hall';
    this.sayIndex = 0;
    this.dynamic = [];

    // Persistent layers.
    this.wall = this.add
      .image(0, 0, 'interiorWall')
      .setOrigin(0, 0)
      .setDepth(-100);
    this.bd = this.add.graphics().setDepth(-90);
    this.bar = this.add.graphics().setDepth(100);
    this.frame = this.add.graphics().setDepth(900);
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0, 0).setDepth(940);

    this.dust = this.add
      .particles(0, 0, 'glow', {
        x: { min: 0, max: this.scale.width },
        y: { min: 40, max: this.scale.height * 0.6 },
        lifespan: 9000,
        speedX: { min: -5, max: 5 },
        speedY: { min: -6, max: 4 },
        scale: { start: 0.05, end: 0 },
        alpha: { start: 0.18, end: 0 },
        tint: 0xffe0b0,
        blendMode: Phaser.BlendModes.ADD,
        frequency: 320,
        quantity: 1,
      })
      .setDepth(50);

    this.hud = this.add.text(14, 12, '', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: GOLD_S,
    });
    this.hud.setDepth(905);

    this.createAudio();
    this.createFilterToggle();
    // ESC walks back one room (toward the hall).
    this.input.keyboard.on('keydown-ESC', () => {
      const back = EXITS[this.current] && EXITS[this.current].back;
      if (back) this.travelTo(back);
    });
    this.input.keyboard.on('keydown-K', () => {
      const on = togglePainterly(this);
      if (this.filterCircle) this.filterCircle.setAlpha(on ? 1 : 0.45);
    });

    this.layout(this.scale.width, this.scale.height);
    this.cameras.main.fadeIn(600, 6, 4, 12);
    this.inputReadyAt = this.time.now + 350;
    this.showEntryTitle();

    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
      this.destroyCommsAnim();
    });
  }

  createAudio() {
    if (!this.game.audio) this.game.audio = new AudioManager();
    this.ambient = this.game.audio;
    // Inside the Residency the score is contained and courtly.
    this.ambient.setMusicState('residency');
    this.ambient.setAmbience(this.current);
    const startOnce = () => this.ambient.start();
    this.input.once('pointerdown', startOnce);
    this.input.keyboard.once('keydown', startOnce);

    const on0 = this.ambient.enabled;
    this.musicCircle = this.add
      .circle(0, 0, 20, 0xffffff, 0.14)
      .setStrokeStyle(2, GOLD, 0.5)
      .setDepth(910)
      .setAlpha(on0 ? 1 : 0.5)
      .setInteractive({ useHandCursor: true });
    this.musicLabel = this.add
      .text(0, 0, on0 ? '♪' : '♪̷', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: CREAM,
      })
      .setOrigin(0.5)
      .setDepth(911);
    this.musicCircle.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      this.ambient.start();
      const on = this.ambient.toggle();
      this.musicCircle.setAlpha(on ? 1 : 0.5);
      this.musicLabel.setText(on ? '♪' : '♪̷');
    });
  }

  createFilterToggle() {
    this.filterCircle = this.add
      .circle(0, 0, 20, 0xffffff, 0.14)
      .setStrokeStyle(2, GOLD, 0.5)
      .setDepth(910)
      .setInteractive({ useHandCursor: true });
    this.filterLabel = this.add
      .text(0, 0, '✦', { fontFamily: 'monospace', fontSize: '17px', color: CREAM })
      .setOrigin(0.5)
      .setDepth(911);
    this.filterCircle.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      const on = togglePainterly(this);
      this.filterCircle.setAlpha(on ? 1 : 0.45);
    });
  }

  // --- Navigation -----------------------------------------------------------

  goTo(scene) {
    if (this.time.now < this.inputReadyAt) return;
    this.cameras.main.fadeOut(500, 6, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  // --- Rendering ------------------------------------------------------------

  layout(width, height) {
    this.wall.setDisplaySize(width, height);
    this.vignette.setDisplaySize(width, height);

    // Ornate frame.
    this.frame.clear();
    this.frame.lineStyle(3, GOLD, 0.5);
    this.frame.strokeRect(6, 6, width - 12, height - 12);
    this.frame.lineStyle(1, GOLD, 0.3);
    this.frame.strokeRect(11, 11, width - 22, height - 22);

    this.hud.setText(
      `Aurun  ${this.registry.get('aurun') || 0}     Water  ${this.registry.get('water') ?? 100}`
    );
    if (this.musicCircle) {
      this.musicCircle.setPosition(width - 32, 30);
      this.musicLabel.setPosition(width - 32, 30);
    }
    if (this.filterCircle) {
      this.filterCircle.setPosition(width - 74, 30);
      this.filterLabel.setPosition(width - 74, 30);
    }

    this.renderLocation();
  }

  onResize(gameSize) {
    this.layout(gameSize.width, gameSize.height);
  }

  clearDynamic() {
    this.dynamic.forEach((o) => o.destroy());
    this.dynamic = [];
  }

  renderLocation() {
    if (!this.bd) return;
    // Crossfade the room's atmosphere as you move through the Residency.
    this.ambient?.setAmbience(this.current);
    this.clearDynamic();
    this.destroyCommsAnim();           // live comms objects are rebuilt below if needed
    this.doorHotspots = {};            // populated by sceneHall / sceneShell
    this.captionText = null;           // recreated by renderHallCaption (hall only)
    const { width, height } = this.scale;
    const loc = LOCATIONS[this.current];
    const floorY = Math.round(height * 0.60); // full-canvas floor line (procedural rooms)

    // Painted scene — EVERY room fills the full canvas, for one consistent frame.
    this.bd.clear();
    const useBg = USE_HALL_BG && loc.feature === 'hall' && this.textures.exists('hallBg');
    if (useBg) {
      this.showHallBackground(width, height);
    } else if (loc.feature === 'comms') {
      if (this.hallBgImg) this.hallBgImg.setVisible(false);
      this.sceneComms(this.bd, width, height);
      this.createCommsAnim();
    } else {
      if (this.hallBgImg) this.hallBgImg.setVisible(false);
      this.drawScene(loc, width, floorY);
    }

    // One shared translucent panel everywhere: a slim caption strip for the hall
    // (door navigation), a taller panel elsewhere for portrait/dialogue/actions.
    const slim = loc.feature === 'hall';
    const bt = Math.round(height * (slim ? 0.86 : 0.74));
    this.drawPanel(width, height, bt);
    this.createDoorZones();
    if (slim) this.renderHallCaption(loc, width, height, bt);
    else this.renderRoomBar(loc, width, height, bt);
  }

  /** The shared translucent UI panel — identical style on every screen. */
  drawPanel(width, height, bt) {
    const b = this.bar;
    b.clear();
    const grad = 6;
    for (let i = 0; i < grad; i += 1) {
      b.fillStyle(0x0a0610, 0.58 * ((i + 1) / grad));
      b.fillRect(0, bt + ((height - bt) * i) / grad, width, (height - bt) / grad + 1);
    }
    // Sandstone + gold top trim.
    b.fillStyle(0xb07d4a, 0.5);
    b.fillRect(0, bt, width, 2);
    b.fillStyle(GOLD, 0.35);
    b.fillRect(0, bt + 2, width, 1);
    // Subtle gold corner brackets (echo of the old ornate bar, kept light).
    const cs = 22;
    b.fillStyle(GOLD, 0.55);
    b.fillRect(0, bt, cs, 2);
    b.fillRect(0, bt, 2, cs);
    b.fillRect(width - cs, bt, cs, 2);
    b.fillRect(width - 2, bt, 2, cs);
  }

  // --- Painted backdrop (experimental) --------------------------------------

  /** Draw the full-canvas PNG backdrop and place door hotspots over its doorways. */
  showHallBackground(width, height) {
    if (!this.hallBgImg) {
      this.hallBgImg = this.add.image(0, 0, 'hallBg').setOrigin(0, 0).setDepth(-60);
    }
    this.hallBgImg.setVisible(true).setDisplaySize(width, height); // 16:9 → 16:9, no stretch

    // Four side archways + the throne arch, as fractions of the full canvas.
    // Outer arches → everyday wings; inner arches (by the statues) → action rooms.
    const door = (x, y, w, h, key) => ({
      x: width * x, y: height * y, w: width * w, h: height * h,
      key, label: LOCATIONS[key].name,
    });
    this.doorHotspots = {
      forward:    door(0.43, 0.28, 0.14, 0.34, 'court'),
      leftInner:  door(0.275, 0.42, 0.085, 0.26, 'comms'),
      leftOuter:  door(0.135, 0.42, 0.075, 0.24, 'yard'),
      rightInner: door(0.64, 0.42, 0.085, 0.26, 'deck'),
      rightOuter: door(0.79, 0.42, 0.075, 0.24, 'infirmary'),
    };
  }

  // --- Spatial navigation (doors) -------------------------------------------

  /** Invisible interactive zones over each painted doorway. */
  createDoorZones() {
    Object.values(this.doorHotspots || {}).forEach((hs) => {
      const z = this.add
        .zone(hs.x + hs.w / 2, hs.y + hs.h / 2, hs.w, hs.h)
        .setInteractive({ useHandCursor: true })
        .setDepth(60);
      z.on('pointerover', () => this.setCaption(`${hs.label}  ›`));
      z.on('pointerout', () => this.setCaption(this.defaultCaption));
      z.on('pointerdown', (p, x, y, e) => {
        e?.stopPropagation();
        this.travelTo(hs.key);
      });
      this.dynamic.push(z);
    });
  }

  setCaption(text) {
    if (this.captionText) this.captionText.setText(text);
  }

  /** Walk through a door — a brief fade for a sense of moving rooms. */
  travelTo(key) {
    if (this.time.now < this.inputReadyAt || this.travelling) return;
    this.travelling = true;
    this.cameras.main.fadeOut(200, 6, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.current = key;
      this.sayIndex = 0;
      this.renderLocation();
      this.cameras.main.fadeIn(220, 6, 4, 12);
      this.travelling = false;
      this.inputReadyAt = this.time.now + 250;
    });
  }

  // --- Hall caption ---------------------------------------------------------

  renderHallCaption(loc, width, height, barTop) {
    this.defaultCaption = 'Four halls open off the entrance — and the throne lies beyond the arch.';
    this.captionText = this.add
      .text(width / 2, barTop + (height - barTop) / 2, this.defaultCaption, {
        fontFamily: 'Georgia, serif',
        fontSize: '17px',
        color: CREAM,
        align: 'center',
        wordWrap: { width: width * 0.7 },
      })
      .setOrigin(0.5)
      .setDepth(102);
    this.dynamic.push(this.captionText);
  }


  // --- Room bar (portrait + dialogue + actions) -----------------------------

  renderRoomBar(loc, width, height, barTop) {
    const padY = barTop + 16;
    let textLeft = 24;

    // Portrait, if the room has a character.
    if (loc.who) {
      const px = 60;
      const py = barTop + (height - barTop) / 2;
      this.drawPortrait(px, py, loc.accent, loc.who);
      textLeft = 116;
    }

    // Name.
    const nameText = this.add
      .text(textLeft, padY, loc.name, {
        fontFamily: 'Georgia, serif',
        fontSize: '20px',
        color: Phaser.Display.Color.IntegerToColor(loc.accent || 0xf0e3d0).rgba,
      })
      .setDepth(102);
    this.dynamic.push(nameText);

    // Choices: speak, scene-actions (World Map / Expedition), onward doors, back.
    const choices = [];
    if (loc.who && loc.say && loc.say.length > 1) {
      choices.push({
        label: `Speak with ${loc.who}`,
        onClick: () => {
          this.sayIndex = (this.sayIndex + 1) % loc.say.length;
          this.renderLocation();
        },
      });
    }
    (loc.actions || []).forEach((a) =>
      choices.push({ label: a.label, onClick: () => this.goTo(a.scene) })
    );
    (loc.exits || []).forEach((key) =>
      choices.push({ label: `${LOCATIONS[key].name}  ›`, onClick: () => this.travelTo(key) })
    );
    const back = (EXITS[this.current] && EXITS[this.current].back) || 'hall';
    choices.push({ label: `‹ ${LOCATIONS[back].name}`, onClick: () => this.travelTo(back) });

    // Lay the choices out in a 1- or 2-column grid in the bar's right area.
    const ncols = choices.length > 3 ? 2 : 1;
    const bh = 34;
    const gapX = 10;
    const gapY = 7;
    const bw = Math.min(168, (width * 0.5) / ncols - gapX);
    const nrows = Math.ceil(choices.length / ncols);
    const gridW = ncols * bw + (ncols - 1) * gapX;
    const gridH = nrows * bh + (nrows - 1) * gapY;
    const gridLeft = width - 16 - gridW;
    const gridTop = barTop + (height - barTop - gridH) / 2;

    // Line / flavour — wrap up to where the choice grid begins.
    const line = loc.who ? (loc.say ? loc.say[this.sayIndex] : '') : loc.flavor || '';
    const lineText = this.add
      .text(textLeft, padY + 30, line, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: '#d8c8e0',
        wordWrap: { width: gridLeft - textLeft - 16 },
      })
      .setDepth(102);
    this.dynamic.push(lineText);

    choices.forEach((c, i) => {
      const col = i % ncols;
      const row = Math.floor(i / ncols);
      const x = gridLeft + col * (bw + gapX) + bw / 2;
      const y = gridTop + row * (bh + gapY) + bh / 2;
      this.makeButton(x, y, bw, bh, c.label, c.onClick);
    });
  }

  makeButton(cx, cy, w, h, label, onClick) {
    const bg = this.add
      .rectangle(cx, cy, w, h, 0x2a1c40, 1)
      .setStrokeStyle(2, GOLD, 0.55)
      .setDepth(103)
      .setInteractive({ useHandCursor: true });
    const txt = this.add
      .text(cx, cy, label, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: CREAM,
        align: 'center',
        wordWrap: { width: w - 14 },
      })
      .setOrigin(0.5)
      .setDepth(104);
    bg.on('pointerover', () => bg.setFillStyle(0x3a2858, 1));
    bg.on('pointerout', () => bg.setFillStyle(0x2a1c40, 1));
    bg.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      onClick();
    });
    this.dynamic.push(bg, txt);
  }

  // --- Portraits ------------------------------------------------------------

  drawPortrait(cx, cy, accent, name) {
    const g = this.add.graphics().setDepth(102);
    const w = 84;
    const h = 96;
    // Frame.
    g.fillStyle(0x0e0a18, 1);
    g.fillRect(cx - w / 2, cy - h / 2, w, h);
    g.lineStyle(2, GOLD, 0.7);
    g.strokeRect(cx - w / 2, cy - h / 2, w, h);
    // Backing glow.
    g.fillStyle(accent, 0.18);
    g.fillRect(cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6);
    // Bust.
    const by = cy + 18;
    g.fillStyle(0x1b1228, 1);
    g.fillRoundedRect(cx - 26, by - 6, 52, 40, { tl: 16, tr: 16, bl: 0, br: 0 });
    g.fillStyle(Phaser.Display.Color.IntegerToColor(accent).darken(40).color, 1);
    g.fillCircle(cx, by - 18, 17);
    g.fillStyle(0x140d20, 1); // hood/hair
    g.fillRoundedRect(cx - 18, cy - 26, 36, 22, 10);
    // Eyes.
    g.fillStyle(0xffce86, 0.9);
    g.fillCircle(cx - 6, by - 18, 1.7);
    g.fillCircle(cx + 6, by - 18, 1.7);
    this.dynamic.push(g);

    const nm = this.add
      .text(cx, cy + h / 2 + 4, name, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#c8a98f',
      })
      .setOrigin(0.5, 0)
      .setDepth(102);
    this.dynamic.push(nm);
  }

  // --- Painted scenes -------------------------------------------------------

  drawScene(loc, width, floorY) {
    const g = this.bd;
    if (loc.feature === 'hall') {
      this.sceneHall(g, width, floorY);
      return;
    }
    this.sceneShell(g, width, floorY);
    const cx = width / 2;
    const s = Phaser.Math.Clamp(floorY / 360, 0.8, 1.7);
    const fns = {
      court: this.featureCourt,
      war: this.featureWar,
      veil: this.featureVeil,
      infirmary: this.featureInfirmary,
      yard: this.featureYard,
      quarters: this.featureQuarters,
      deck: this.featureDeck,
    };
    fns[loc.feature]?.call(this, g, cx, floorY, s);
    // A warm hanging light over the room.
    this.addGlow(cx, floorY * 0.2, width * 0.5, 0xffd9a0, 0.4);
    this.addGlow(cx, floorY + 6, width * 0.5, 0xffcaa0, 0.12);
  }

  addGlow(x, y, size, tint, alpha) {
    const img = this.add
      .image(x, y, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint)
      .setAlpha(alpha)
      .setDisplaySize(size, size)
      .setDepth(-80);
    this.dynamic.push(img);
  }

  addStoneNoise(x, y, w, h, tint = 0xc4956a, alpha = 0.09) {
    if (!this.textures.exists('noise')) return;
    const img = this.add
      .image(x, y, 'noise')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint)
      .setAlpha(alpha)
      .setDisplaySize(w, h)
      .setDepth(-89);
    this.dynamic.push(img);
  }

  /** A generic painted room: floor, flanking columns, a central arch, banners. */
  sceneShell(g, width, floorY) {
    // Floor — warm copper/terracotta.
    g.fillStyle(0x2a1408, 1);
    g.fillRect(0, floorY, width, this.scale.height - floorY);
    g.fillStyle(0x4a2810, 1);
    g.fillRect(0, floorY, width, 4);
    g.fillStyle(0x7a3818, 0.8); // runner
    g.fillRect(width * 0.18, floorY + 10, width * 0.64, 14);
    g.fillStyle(GOLD, 0.6);
    g.fillRect(width * 0.18, floorY + 10, width * 0.64, 2);

    // Central arch alcove — sandstone surround, dark interior.
    const aw = width * 0.5;
    const ar = aw / 2;
    const at = floorY * 0.16;
    // Shadow base surround.
    g.fillStyle(0x7a4e28, 1);
    g.fillRoundedRect(width / 2 - ar - 6, at - 4, aw + 12, floorY - at + 5, {
      tl: ar + 4, tr: ar + 4, bl: 0, br: 0,
    });
    // Sandstone face.
    g.fillStyle(0xb07d4a, 1);
    g.fillRoundedRect(width / 2 - ar, at, aw, floorY - at, {
      tl: ar, tr: ar, bl: 0, br: 0,
    });
    // Ochre highlight on the lit side.
    g.fillStyle(0xc4956a, 0.4);
    g.fillRoundedRect(width / 2 - ar, at, aw * 0.42, floorY - at, {
      tl: ar, tr: 0, bl: 0, br: 0,
    });
    // Stone joints below the semicircle.
    g.fillStyle(0x6a3e1a, 0.5);
    for (let jy = at + ar + 8; jy < floorY; jy += 16) {
      g.fillRect(width / 2 - ar + 4, jy, aw - 8, 1.5);
    }
    // Dark interior.
    g.fillStyle(0x130c08, 1);
    g.fillRoundedRect(width / 2 - ar + 9, at + 9, aw - 18, floorY - at - 9, {
      tl: ar - 9, tr: ar - 9, bl: 0, br: 0,
    });
    // Stone noise on arch surround.
    this.addStoneNoise(width / 2, at + (floorY - at) * 0.5, aw + 14, floorY - at + 6);

    // Flanking columns.
    [width * 0.16, width * 0.84].forEach((x) => this.column(g, x, at - 6, floorY));

    // Frieze.
    g.fillStyle(GOLD, 0.7);
    g.fillRect(0, at - 8, width, 3);
  }

  // --- Communications Room (bespoke) ----------------------------------------

  /** Comms chamber: sandstone walls, a power-crystal + Calder banner at left,
   *  and a great circular star-map screen with a control console at right.
   *  Procedural shape reference for the painted art to come. */
  sceneComms(g, width, height) {
    const floorY = Math.round(height * 0.60);
    const cx = width / 2;

    // Back wall — warm sandstone, washed warmer toward the crystal (left).
    g.fillStyle(0x4a3826, 1);
    g.fillRect(0, 0, width, floorY);
    g.fillStyle(0x6a4e2c, 0.5);
    g.fillRect(0, 0, Math.round(width * 0.44), floorY);
    // Ceiling beam band + beams.
    g.fillStyle(0x2a1e12, 1);
    g.fillRect(0, 0, width, Math.round(floorY * 0.11));
    g.fillStyle(0x36281a, 1);
    [0.2, 0.5, 0.8].forEach((f) =>
      g.fillRect(Math.round(width * f) - 12, 0, 24, Math.round(floorY * 0.11)));
    // Faint stone-course banding.
    g.lineStyle(1, 0x2a1e12, 0.25);
    for (let i = 1; i < 6; i++) {
      const y = Math.round((floorY * i) / 6);
      g.lineBetween(0, y, width, y);
    }

    // Floor — stone tiles with light perspective, to the bottom of the canvas.
    g.fillStyle(0x33271a, 1);
    g.fillRect(0, floorY, width, height - floorY);
    g.fillStyle(0x4a3826, 1);
    g.fillRect(0, floorY, width, 3);
    g.lineStyle(1, 0x8a6a3a, 0.12);
    for (let r = 1; r <= 4; r++) {
      const y = floorY + (height - floorY) * (r / 5);
      g.lineBetween(0, y, width, y);
    }
    for (let k = -5; k <= 5; k++) {
      g.lineBetween(cx + k * width * 0.10, floorY, cx + k * width * 0.20, height);
    }

    // LEFT — pilasters framing the banner, with the power-crystal.
    this.commsPilaster(g, width * 0.05, floorY);
    this.commsPilaster(g, width * 0.28, floorY);
    this.banner(g, Math.round(width * 0.165), Math.round(height * 0.10), Math.round(height * 0.34), 1.05);
    this.commsCrystal(g, width * 0.05, height * 0.36, height * 0.36);

    // RIGHT — the great circular star-map screen + console.
    const sx = Math.round(width * 0.70);
    const sy = Math.round(height * 0.34);
    const R = Math.round(height * 0.27);
    this.commsConsole(g, sx, floorY, R);
    this.commsScreen(g, sx, sy, R);
  }

  commsPilaster(g, x, floorY) {
    const w = Math.round(floorY * 0.11);
    g.fillStyle(0x5a4632, 1);
    g.fillRect(x - w / 2, 0, w, floorY);
    g.fillStyle(0x6e573a, 1);                              // lit edge
    g.fillRect(x - w / 2, 0, Math.round(w * 0.28), floorY);
    g.fillStyle(0x2a1e12, 1);                              // shadow edge
    g.fillRect(x + w / 2 - Math.round(w * 0.2), 0, Math.round(w * 0.2), floorY);
    g.fillStyle(0x4a3826, 1);                              // base + capital
    g.fillRect(x - w * 0.7, floorY - w * 0.55, w * 1.4, w * 0.55);
    g.fillRect(x - w * 0.7, 0, w * 1.4, w * 0.4);
    g.fillStyle(0x6e573a, 0.6);
    g.fillRect(x - w * 0.7, 0, w * 1.4, 2);
  }

  commsCrystal(g, x, cy, h) {
    const w = h * 0.26;
    this.addGlow(x, cy, w * 7, 0xffaa33, 0.6);
    g.fillStyle(0x2a1e12, 1);                              // brackets
    g.fillRect(x - w * 0.6, cy - h / 2 - 4, w * 1.2, 5);
    g.fillRect(x - w * 0.6, cy + h / 2 - 1, w * 1.2, 5);
    const hex = (ww, hh) => [
      { x, y: cy - hh / 2 }, { x: x + ww / 2, y: cy - hh * 0.26 },
      { x: x + ww / 2, y: cy + hh * 0.26 }, { x, y: cy + hh / 2 },
      { x: x - ww / 2, y: cy + hh * 0.26 }, { x: x - ww / 2, y: cy - hh * 0.26 },
    ];
    g.fillStyle(0xc8821a, 1); g.fillPoints(hex(w, h), true);
    g.fillStyle(0xffc24a, 1); g.fillPoints(hex(w * 0.62, h * 0.86), true);
    g.fillStyle(0xfff0c0, 0.95); g.fillPoints(hex(w * 0.22, h * 0.7), true);
  }

  commsScreen(g, x, y, R) {
    const fr = Math.round(R * 0.14);
    g.fillStyle(0x3a2c1c, 1); g.fillCircle(x, y, R + fr + 3);   // frame ring
    g.fillStyle(0x5a4632, 1); g.fillCircle(x, y, R + fr);
    g.fillStyle(0x6e573a, 0.5); g.fillCircle(x - fr * 0.4, y - fr * 0.4, R + fr * 0.5);
    const bf = Math.round(R * 0.16);                            // cardinal bolts
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => {
      const bx = x + dx * (R + fr * 0.5), by = y + dy * (R + fr * 0.5);
      g.fillStyle(0x2a1e12, 1); g.fillRect(bx - bf / 2, by - bf / 2, bf, bf);
      g.fillStyle(0xc8a24a, 0.9); g.fillCircle(bx, by, bf * 0.22);
    });
    g.fillStyle(0x0e1230, 1); g.fillCircle(x, y, R);            // screen
    g.fillStyle(0x1c2450, 0.55); g.fillCircle(x, y, R * 0.66);
    if (!this.commsStars) {
      this.commsStars = Array.from({ length: 90 }, () => ({
        a: Math.random() * Math.PI * 2,
        r: Math.sqrt(Math.random()) * 0.9,
        sz: Math.random() * 1.3 + 0.4,
        b: Math.random() * 0.6 + 0.3,
      }));
    }
    this.commsStars.forEach((s) => {
      g.fillStyle(0xdfe6ff, s.b);
      g.fillCircle(x + Math.cos(s.a) * s.r * R, y + Math.sin(s.a) * s.r * R, s.sz);
    });
    g.lineStyle(1.5, 0xc8922a, 0.4);                           // radar rings + crosshair
    [0.28, 0.52, 0.76, 0.97].forEach((f) => g.strokeCircle(x, y, R * f));
    g.lineBetween(x - R * 0.97, y, x + R * 0.97, y);
    g.lineBetween(x, y - R * 0.97, x, y + R * 0.97);
    this.addGlow(x, y, R * 2.4, 0x3a5fae, 0.16);            // screen ambiance
    // The planet (Arradius) + radar sweep are live objects, built in renderLocation.
    this.commsScreenInfo = { x, y, R };
  }

  /** Build the animated comms planet (scrolling desert sphere) + radar sweep. */
  createCommsAnim() {
    const info = this.commsScreenInfo;
    if (!info || !this.textures.exists('planetSurface')) return;
    const { x, y, R } = info;
    const pr = Math.round(R * 0.26);

    // Scrolling surface, masked to a circle → a rotating sphere.
    const mask = this.add.graphics().setVisible(false);
    mask.fillStyle(0xffffff, 1).fillCircle(x, y, pr);
    const planet = this.add
      .tileSprite(x, y, pr * 2, pr * 2, 'planetSurface')
      .setDepth(-86);
    planet.tilePositionY = 14;
    planet.setMask(mask.createGeometryMask());

    // Fixed lighting/relief overlay (poles, terminator, lit limb) over the surface.
    const ov = this.add.graphics().setDepth(-85);
    ov.fillStyle(0xd9ab68, 0.36); ov.fillCircle(x - pr * 0.28, y - pr * 0.26, pr * 0.5);  // lit side
    ov.fillStyle(0x241606, 0.34); ov.fillCircle(x + pr * 0.36, y + pr * 0.30, pr * 0.62); // terminator
    ov.fillStyle(0xe8d8b0, 0.32); ov.fillEllipse(x, y - pr * 0.8, pr * 0.62, pr * 0.2);   // N polar cap
    ov.fillStyle(0xe8d8b0, 0.2); ov.fillEllipse(x, y + pr * 0.82, pr * 0.5, pr * 0.16);   // S polar cap
    ov.lineStyle(2, 0xe6bc7e, 0.5); ov.strokeCircle(x, y, pr * 0.95);                     // lit limb
    ov.lineStyle(2.5, 0x2e1d0c, 0.55); ov.strokeCircle(x, y, pr - 1);                     // dark rim
    this.addGlow(x, y, pr * 3.2, 0xffb24a, 0.22);                                         // atmosphere

    const sweep = this.add.graphics().setDepth(-84);
    this.commsAnim = { planet, mask, ov, sweep, x, y, R, pr, angle: -Math.PI / 2 };
  }

  destroyCommsAnim() {
    const a = this.commsAnim;
    if (!a) return;
    [a.planet, a.mask, a.ov, a.sweep].forEach((o) => o && o.destroy());
    this.commsAnim = null;
  }

  update(time, delta) {
    const a = this.commsAnim;
    if (!a) return;
    a.planet.tilePositionX += delta * 0.01;                 // rotate the surface
    a.angle = (a.angle + delta * 0.0009) % (Math.PI * 2);   // sweep the radar
    const r = a.R * 0.96;
    const g = a.sweep;
    g.clear();
    g.fillStyle(0x7ad0ff, 0.08);                            // trailing wedge
    g.slice(a.x, a.y, r, a.angle - 0.5, a.angle, false);
    g.fillPath();
    g.lineStyle(2, 0xaee4ff, 0.5);                          // leading line
    g.lineBetween(a.x, a.y, a.x + Math.cos(a.angle) * r, a.y + Math.sin(a.angle) * r);
  }

  commsConsole(g, x, floorY, R) {
    const pw = R * 1.5;
    const ch = Math.round(R * 0.42);
    const top = floorY - ch;
    g.fillStyle(0x3a2c1c, 1);                                  // angled console body
    g.fillPoints([
      { x: x - pw * 0.36, y: top }, { x: x + pw * 0.36, y: top },
      { x: x + pw * 0.5, y: floorY }, { x: x - pw * 0.5, y: floorY },
    ], true);
    g.fillStyle(0x5a4632, 1);                                  // lit top lip
    g.fillRect(x - pw * 0.36, top, pw * 0.72, 4);
    [-1, 0, 1].forEach((i) => {                                // three amber panels
      const px = x + i * pw * 0.24;
      const w = pw * 0.2, hh = ch * 0.5;
      g.fillStyle(0x14100a, 1); g.fillRect(px - w / 2, top + 6, w, hh);
      g.fillStyle(0xc8922a, 0.8);
      for (let r = 0; r < 3; r++) g.fillRect(px - w / 2 + 3, top + 9 + r * (hh / 3), w - 6, 1.5);
      g.fillStyle(0xffd24a, 0.9); g.fillCircle(px + w / 2 - 4, top + 9, 1.6);
    });
  }

  column(g, x, top, floorY, depth = 0, scale = 1, litDir = 1) {
    const botHW  = Math.round(46 * scale);
    const topHW  = Math.round(botHW * 0.84);
    const plinthH = Math.round(22 * scale);
    const capH   = Math.round(26 * scale);
    const capHW  = Math.round(botHW * 1.32);
    const colBot = floorY - plinthH;
    const dim    = 1 - depth * 0.30;               // distance haze

    // RGB lerp helper.
    const lerpC = (c1, c2, t) => {
      const r = ((c1 >> 16) & 255) + (((c2 >> 16) & 255) - ((c1 >> 16) & 255)) * t;
      const gg = ((c1 >> 8) & 255) + (((c2 >> 8) & 255) - ((c1 >> 8) & 255)) * t;
      const b = (c1 & 255) + ((c2 & 255) - (c1 & 255)) * t;
      return (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(b);
    };
    const SHADOW = 0x140a04;
    const MID    = 0x6e3414;
    const LIGHT  = 0xd0883c;

    // Barrel shading — vertical bands across the tapered shaft. Bright toward the
    // lit side (the central doorway), falling to near-black at the far edge.
    const pPeak = litDir > 0 ? 0.74 : 0.26;        // brightest band position [0..1]
    const nb = 14;
    for (let i = 0; i < nb; i++) {
      const p0 = i / nb, p1 = (i + 1) / nb, pm = (p0 + p1) / 2;
      // Brightness: peak at pPeak, fall off to each edge (rounded cylinder).
      let f = 1 - Math.abs(pm - pPeak) / 0.78;
      f = Math.max(0, Math.min(1, f));
      f = f * f;                                   // tighten the highlight
      const col = f < 0.5
        ? lerpC(SHADOW, MID, f * 2)
        : lerpC(MID, LIGHT, (f - 0.5) * 2);
      g.fillStyle(col, dim);
      g.fillPoints([
        { x: x + topHW * (2 * p0 - 1), y: top },
        { x: x + topHW * (2 * p1 - 1), y: top },
        { x: x + botHW * (2 * p1 - 1), y: colBot },
        { x: x + botHW * (2 * p0 - 1), y: colBot },
      ], true);
    }
    // Subtle fluting grooves.
    g.fillStyle(0x100804, 0.22 * dim);
    [0.30, 0.5, 0.70].forEach((p) => {
      g.fillRect(Math.round(x + botHW * (2 * p - 1)) - 1, top + 2, 2, colBot - top - 4);
    });

    // Capital — abacus slab + tapered echinus bell, shaded lit-side-up.
    const abacusH = Math.round(capH * 0.42);
    const echinHW = Math.round(capHW * 0.78);
    g.fillStyle(lerpC(MID, LIGHT, 0.35), dim);
    g.fillRect(x - capHW, top - capH, capHW * 2, abacusH);
    g.fillStyle(lerpC(SHADOW, LIGHT, 0.7), dim);
    g.fillRect(x - capHW, top - capH, capHW * 2, Math.max(2, Math.round(3 * scale)));
    g.fillStyle(lerpC(SHADOW, MID, 0.8), dim);
    g.fillPoints([
      { x: x - echinHW, y: top - capH + abacusH },
      { x: x + echinHW, y: top - capH + abacusH },
      { x: x + topHW,   y: top },
      { x: x - topHW,   y: top },
    ], true);

    // Plinth — wide base block.
    const plinthHW = Math.round(capHW * 0.92);
    g.fillStyle(lerpC(SHADOW, MID, 0.55), dim);
    g.fillRect(x - plinthHW, colBot, plinthHW * 2, plinthH);
    g.fillStyle(lerpC(MID, LIGHT, 0.4), dim);
    g.fillRect(x - plinthHW, colBot, plinthHW * 2, Math.max(1, Math.round(2 * scale)));
    g.fillStyle(0x0a0502, 0.5 * dim);
    g.fillRect(x - plinthHW, colBot + plinthH - Math.max(2, Math.round(3 * scale)), plinthHW * 2, Math.max(2, Math.round(3 * scale)));

    // Ground contact shadow.
    g.fillStyle(0x0a0602, 0.32 * dim);
    g.fillEllipse(x, floorY + 2, botHW * 2.6, Math.max(4, Math.round(botHW * 0.36)));
  }

  sceneHall(g, width, floorY) {
    const cx = width / 2;
    const height = this.scale.height;
    g._cx = cx;

    // ── Single vanishing point — cathedral nave geometry ───────────────────────
    // Everything derived from one point: near columns tower, arch is small+distant.
    // ── One-point perspective BOX (not a tunnel to a single point) ────────────
    // A small back-wall rectangle sits at the far end. Floor, ceiling and side
    // walls are TRAPEZOIDS connecting the full-size front frame to that back
    // wall — they stop AT the wall, they don't collapse to a point. The door
    // sits flat on the back wall. Mental model: a cathedral nave from the door.
    const sceneBot = Math.round(height * 0.72);  // bottom of painted area (nearest)

    // Back wall (far end of the hall).
    const bwW   = Math.round(width * 0.20);
    const bwL   = cx - bwW / 2;
    const bwR   = cx + bwW / 2;
    const bwBot = Math.round(floorY * 0.66);     // far floor meets back wall here
    const bwTop = Math.round(floorY * 0.10);     // top of the back wall

    // Map a point onto a side wall — shared by panels, banding, sconces, doors.
    // sign<0 = left wall, >0 = right. d: depth 0(near)→1(back wall). v: 0 top→1 floor.
    const wallMap = (sign, d, v) => {
      const fx = sign < 0 ? 0 : width;
      const bx = sign < 0 ? bwL : bwR;
      const x = fx + (bx - fx) * d;
      const ty = bwTop * d;                          // ceiling line at depth d
      const by = sceneBot + (bwBot - sceneBot) * d;  // floor line at depth d
      return { x, y: ty + (by - ty) * v };
    };

    // CEILING trapezoid — full-width top edge → back-wall top edge.
    g.fillStyle(0x2e1608, 1);
    g.fillPoints([
      { x: 0, y: 0 }, { x: width, y: 0 },
      { x: bwR, y: bwTop }, { x: bwL, y: bwTop },
    ], true);
    // Coffer ribs converging toward the back wall.
    g.fillStyle(0x140a04, 0.6);
    for (let k = 1; k <= 5; k++) {
      const fx = k * width / 6;
      const bx = bwL + (bwR - bwL) * (k / 6);
      g.fillPoints([
        { x: fx - 2, y: 0 }, { x: fx + 2, y: 0 },
        { x: bx + 1, y: bwTop }, { x: bx - 1, y: bwTop },
      ], true);
    }

    // SIDE WALLS — front side edges → back-wall side edges.
    g.fillStyle(0x6e3416, 1);
    g.fillPoints([
      { x: 0, y: 0 }, { x: 0, y: sceneBot },
      { x: bwL, y: bwBot }, { x: bwL, y: bwTop },
    ], true);
    g.fillStyle(0x5a2a12, 1);
    g.fillPoints([
      { x: width, y: 0 }, { x: width, y: sceneBot },
      { x: bwR, y: bwBot }, { x: bwR, y: bwTop },
    ], true);
    // Near-corner shadow vignette.
    g.fillStyle(0x0e0804, 0.4);
    g.fillTriangle(0, 0, 0, sceneBot, Math.round(width * 0.05), Math.round(sceneBot * 0.5));
    g.fillTriangle(width, 0, width, sceneBot, Math.round(width * 0.95), Math.round(sceneBot * 0.5));

    // ── Wall detailing: stone banding, recessed panels, sconces ──────────────
    // Drawn on the wall face before the columns, so columns stand in front.
    [-1, 1].forEach((sign) => {
      // Faint horizontal stone-course lines, full wall, in perspective.
      g.lineStyle(1, 0x0e0804, 0.2);
      [0.16, 0.34, 0.52, 0.70, 0.86].forEach((v) => {
        const a = wallMap(sign, 0.02, v);
        const b = wallMap(sign, 0.98, v);
        g.lineBetween(a.x, a.y, b.x, b.y);
      });

      // Shallow recessed panel in the front bay (the deeper bay holds the door).
      [[0.16, 0.40]].forEach(([d0, d1]) => {
        const quad = [
          wallMap(sign, d0, 0.22), wallMap(sign, d1, 0.22),
          wallMap(sign, d1, 0.74), wallMap(sign, d0, 0.74),
        ];
        g.fillStyle(0x1a1008, 0.4);                 // recessed depth
        g.fillPoints(quad, true);
        g.lineStyle(1.5, GOLD, 0.3);                // outer border
        g.strokePoints(quad, true, true);
        g.lineStyle(1, 0xc8822a, 0.2);              // top + near-edge rim highlight
        g.lineBetween(quad[0].x, quad[0].y, quad[1].x, quad[1].y);
        g.lineBetween(quad[0].x, quad[0].y, quad[3].x, quad[3].y);
      });

      // Wall torches — iron bracket, layered flame, warm glow + cast light.
      [0.10, 0.42].forEach((d) => {
        const p = wallMap(sign, d, 0.34);
        const s = 1 - d * 0.55;                     // shrink with depth
        // Warm light washing down the wall below the torch.
        const cl = wallMap(sign, d - 0.05, 0.74), cr = wallMap(sign, d + 0.05, 0.74);
        g.fillStyle(0xffcc66, 0.07);
        g.fillTriangle(p.x, p.y + 4 * s, cl.x, cl.y, cr.x, cr.y);
        // Iron bracket + cup.
        g.fillStyle(0x241e18, 1);
        g.fillRect(p.x - 1.5 * s, p.y - 2 * s, 3 * s, 14 * s);
        g.fillStyle(0x3a3028, 1);
        g.fillEllipse(p.x, p.y - 2 * s, 11 * s, 5 * s);
        // Flame, outer → core.
        const fy = p.y - 5 * s;
        g.fillStyle(0xe2541a, 0.95); g.fillEllipse(p.x, fy - 9 * s, 11 * s, 24 * s);
        g.fillStyle(0xff9a2a, 1);    g.fillEllipse(p.x, fy - 10 * s, 7 * s, 17 * s);
        g.fillStyle(0xffd24a, 1);    g.fillEllipse(p.x, fy - 10 * s, 4 * s, 11 * s);
        g.fillStyle(0xfff0c0, 1);    g.fillEllipse(p.x, fy - 8 * s, 2 * s, 6 * s);
        this.addGlow(p.x, fy - 8 * s, 82 * s, 0xffaa44, 0.5);
      });
    });

    // FLOOR — three depth-graded brightness zones (dark near → warm by the arch).
    const floorHW = (t) => width / 2 + (bwW / 2 - width / 2) * t;   // half-width at depth t
    const floorYt = (t) => sceneBot + (bwBot - sceneBot) * t;       // t: 0 front → 1 back
    const floorBand = (t0, t1, col) => {
      g.fillStyle(col, 1);
      g.fillPoints([
        { x: cx - floorHW(t0), y: floorYt(t0) }, { x: cx + floorHW(t0), y: floorYt(t0) },
        { x: cx + floorHW(t1), y: floorYt(t1) }, { x: cx - floorHW(t1), y: floorYt(t1) },
      ], true);
    };
    floorBand(0.0, 0.20, 0x3d2510);   // far: warmest, lit by the arch
    floorBand(0.20, 0.55, 0x2a1a0c);  // mid: neutral warm stone
    floorBand(0.55, 1.0, 0x1a1008);   // near: darkest, in shadow
    g.fillStyle(0x5a3020, 1);
    g.fillRect(0, sceneBot - 2, width, 2);
    // Arch light pooling on the floor (radial, at the back-wall threshold).
    this.addGlow(cx, bwBot + 18, width * 0.55, 0xc8822a, 0.16);
    // Receding floor courses (parallel to the front edge, narrowing with depth).
    for (let r = 1; r <= 6; r++) {
      const t  = r / 7;
      const y  = Math.round(sceneBot + (bwBot - sceneBot) * t);
      const hw = Math.round((width / 2) + (bwW / 2 - width / 2) * t);
      g.fillStyle(0xc8922a, 0.24 * (1 - t * 0.4));
      g.fillRect(cx - hw, y, hw * 2, Math.max(1, Math.round((1 - t) * 3 + 1)));
    }
    // Floorboards converging toward the back wall.
    g.lineStyle(1, 0xc8922a, 0.1);
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      g.beginPath();
      g.moveTo(cx + k * (width / 7), sceneBot);
      g.lineTo(cx + k * (bwW / 7), bwBot);
      g.strokePath();
    }

    // ── Carpet runner — crimson, bottom-centre to the arch threshold ──────────
    const runBotHW = width * 0.11;   // ~22% wide at the viewer
    const runTopHW = width * 0.025;  // ~5% near the arch
    const runTopY = bwBot;
    const runPts = (sh) => [
      { x: cx - runBotHW - sh, y: sceneBot }, { x: cx + runBotHW + sh, y: sceneBot },
      { x: cx + runTopHW + sh * 0.25, y: runTopY }, { x: cx - runTopHW - sh * 0.25, y: runTopY },
    ];
    g.fillStyle(0x2a0810, 1);                       // worn-edge underlay (offset, darker)
    g.fillPoints(runPts(2), true);
    g.fillStyle(0x5a1020, 1);                       // deep crimson base
    g.fillPoints(runPts(0), true);
    g.fillStyle(0x3a0a14, 0.55);                    // shadowed near end
    g.fillPoints([
      { x: cx - runBotHW, y: sceneBot }, { x: cx + runBotHW, y: sceneBot },
      { x: cx + (runBotHW * 0.55 + runTopHW * 0.45), y: floorYt(0.45) },
      { x: cx - (runBotHW * 0.55 + runTopHW * 0.45), y: floorYt(0.45) },
    ], true);
    g.fillStyle(GOLD, 0.5);                         // gold border trim, both edges
    const trim = 4;
    g.fillPoints([
      { x: cx - runBotHW, y: sceneBot }, { x: cx - runBotHW + trim, y: sceneBot },
      { x: cx - runTopHW + trim * 0.3, y: runTopY }, { x: cx - runTopHW, y: runTopY },
    ], true);
    g.fillPoints([
      { x: cx + runBotHW - trim, y: sceneBot }, { x: cx + runBotHW, y: sceneBot },
      { x: cx + runTopHW, y: runTopY }, { x: cx + runTopHW - trim * 0.3, y: runTopY },
    ], true);
    this.addGlow(cx, runTopY + 6, width * 0.16, 0xc8822a, 0.15); // brighter at the arch end
    // Woven House sigil — gold diamond, foreshortened on the floor.
    const emY = floorYt(0.62);
    const emW = (runBotHW * 0.34) * 0.85;
    const emH = emW * 0.62;                          // squashed for floor perspective
    g.fillStyle(GOLD, 0.92);
    g.fillTriangle(cx, emY - emH, cx + emW, emY, cx, emY + emH);
    g.fillTriangle(cx, emY - emH, cx - emW, emY, cx, emY + emH);
    g.fillStyle(0x5a1020, 1);                        // crimson cut-out
    g.fillTriangle(cx, emY - emH * 0.6, cx + emW * 0.62, emY, cx, emY + emH * 0.6);
    g.fillTriangle(cx, emY - emH * 0.6, cx - emW * 0.62, emY, cx, emY + emH * 0.6);
    g.fillStyle(GOLD, 1);                            // cross-bar + centre jewel
    g.fillRect(cx - emW * 0.78, emY - emH * 0.12, emW * 1.56, emH * 0.24);
    g.fillCircle(cx, emY, emH * 0.34);

    // BACK WALL face.
    g.fillStyle(0x46260f, 1);
    g.fillRect(bwL, bwTop, bwW, bwBot - bwTop);
    g.fillStyle(0xb07d4a, 0.7);   // cornice
    g.fillRect(bwL, bwTop, bwW, 2);

    // ── Door — tall arch sitting flat on the back wall, on the floor ──────────
    const archW   = Math.round(bwW * 0.52);
    const archRad = archW / 2;
    const archBot = bwBot - 2;                                   // stands on floor
    const archTop = Math.round(bwTop + (bwBot - bwTop) * 0.12);
    const archH   = archBot - archTop;
    const archL   = cx - archRad;
    const archR   = cx + archRad;

    g.fillStyle(0x5a3a18, 1);                                    // stone surround
    g.fillRoundedRect(archL - 4, archTop - 3, archW + 8, archH + 3, {
      tl: archRad + 3, tr: archRad + 3, bl: 0, br: 0,
    });
    g.fillStyle(0x2a1a08, 1);                                    // soffit
    g.fillRoundedRect(archL, archTop, archW, archH, {
      tl: archRad, tr: archRad, bl: 0, br: 0,
    });
    const inset = Math.max(2, Math.round(archW * 0.13));
    g.fillStyle(0x100c08, 1);                                    // dark opening
    g.fillRoundedRect(archL + inset, archTop + inset, archW - inset * 2, archH - inset, {
      tl: archRad - inset, tr: archRad - inset, bl: 0, br: 0,
    });
    this.addGlow(cx, archBot - archH * 0.4, archW * 2.6, 0xffce86, 0.5);

    // Warm light spilling from the doorway across the near floor.
    g.fillStyle(0xc8922a, 0.06);
    g.fillTriangle(archL, archBot, archR, archBot, cx + width * 0.22, sceneBot);
    g.fillTriangle(archL, archBot, archR, archBot, cx - width * 0.22, sceneBot);

    // ── Side doors — modest arched openings cut FLUSH into each wall ──────────
    // Built in (depth, height) wall coordinates and mapped onto the wall plane,
    // so they lie in the wall rather than sitting out from it. Set deeper, in the
    // bay by the second pair of columns. Drawn before the columns so a column can
    // stand in front of a doorway (as in a real colonnade).
    const sideDoor = (sign) => {
      const map = (d, v) => wallMap(sign, d, v);        // share the wall mapping
      const dA = 0.68, dB = 0.80;                       // deeper bay, clear of columns
      const vFloor = 0.99, vSpring = 0.60, vPeak = 0.46; // a modest, shallow arch
      // Closed door outline: floor edge then arched top; ed/ev expand for frames.
      const outline = (ed, ev) => {
        const a = dA - ed, b = dB + ed;
        const sp = vSpring - ev, pk = vPeak - ev;
        const pts = [map(a, vFloor), map(b, vFloor)];
        const N = 9;
        for (let i = 0; i <= N; i++) {
          const t = i / N;                              // far spring → crown → near spring
          pts.push(map(b + (a - b) * t, sp - (sp - pk) * Math.sin(Math.PI * t)));
        }
        return pts;
      };
      g.fillStyle(0x6a4626, 1);                         // sandstone frame
      g.fillPoints(outline(0.018, 0.035), true);
      g.fillStyle(0x3a2614, 1);                         // inner reveal (wall thickness)
      g.fillPoints(outline(0.006, 0.012), true);
      g.fillStyle(0x130d08, 1);                         // dark opening
      g.fillPoints(outline(-0.004, -0.004), true);
      // Faint warm spill from within (modest, not grand).
      const c = map((dA + dB) / 2, (vFloor + vPeak) / 2);
      const wpx = Math.abs(map(dA, vFloor).x - map(dB, vFloor).x);
      this.addGlow(c.x, c.y, wpx * 3.0, 0xffce86, 0.16);
      // Hotspot bounding box (sampled corners + crown).
      const corners = [
        map(dA, vFloor), map(dB, vFloor),
        map(dA, vSpring), map(dB, vSpring), map((dA + dB) / 2, vPeak),
      ];
      const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    };

    this.doorHotspots = {
      left:    { ...sideDoor(-1), key: EXITS.hall.left,  label: LOCATIONS[EXITS.hall.left].name },
      right:   { ...sideDoor(+1), key: EXITS.hall.right, label: LOCATIONS[EXITS.hall.right].name },
      forward: { x: archL, y: archTop, w: archW, h: archH, key: EXITS.hall.forward, label: LOCATIONS[EXITS.hall.forward].name },
    };

    // ── Columns — colonnade receding with the SAME box mapping as the walls ───
    // Each column spans floor→ceiling AT ITS DEPTH: the floor line is
    // sceneBot→bwBot, the ceiling line is 0→bwTop. Horizontal offset + width
    // shrink by the wall's horizontal scale, so the row converges with the room.
    const hBack = bwW / width;                    // horizontal scale at back wall
    const FRONT_OFF = width * 0.42;
    const colData = [0.04, 0.50, 0.78].map((d) => {
      const wScale = 1 - d * (1 - hBack);
      const offX   = Math.round(FRONT_OFF * wScale);
      const baseY  = Math.round(sceneBot + (bwBot - sceneBot) * d);  // floor at depth d
      const topY   = Math.round(bwTop * d) + Math.round(26 * wScale); // capital meets ceiling
      return { d, wScale, offX, baseY, topY };
    });
    // Floor reflections — faint, fading mirror of each column on the polished floor.
    colData.forEach(({ offX, baseY, wScale, d }) => {
      const hw = Math.round(46 * wScale * 0.55);
      const reflLen = Math.round((sceneBot - baseY) * 0.85 + 8);
      [cx - offX, cx + offX].forEach((x) => {
        for (let i = 0; i < 5; i++) {
          g.fillStyle(0xc8884a, 0.12 * (1 - i / 5) * (1 - d * 0.4));
          g.fillRect(x - hw, Math.round(baseY + (reflLen * i) / 5), hw * 2, Math.ceil(reflLen / 5) + 1);
        }
      });
    });
    // Columns (drawn over their reflections).
    colData.forEach(({ d, wScale, offX, baseY, topY }) => {
      this.column(g, cx - offX, topY, baseY, d, wScale, +1); // left lit toward centre
      this.column(g, cx + offX, topY, baseY, d, wScale, -1); // right lit toward centre
    });

    // ── Foreground urns — dark glazed vases flanking the entrance ─────────────
    const urn = (ux, uy, us) => {
      // Floor reflection (faint, flipped sheen below).
      g.fillStyle(0x000000, 0.22);
      g.fillEllipse(ux, uy + 4 * us, 56 * us, 10 * us);
      // Body, foot, neck, rim.
      g.fillStyle(0x171210, 1); g.fillEllipse(ux, uy - 30 * us, 42 * us, 52 * us);
      g.fillStyle(0x241c16, 1); g.fillEllipse(ux - 9 * us, uy - 36 * us, 16 * us, 28 * us); // sheen
      g.fillStyle(0x100c0a, 1); g.fillEllipse(ux, uy - 2 * us, 30 * us, 9 * us);            // foot shadow
      g.fillStyle(0x1b1512, 1); g.fillRect(ux - 13 * us, uy - 62 * us, 26 * us, 18 * us);   // neck
      g.fillStyle(0x342820, 1); g.fillEllipse(ux, uy - 62 * us, 32 * us, 9 * us);           // rim
      g.fillStyle(0x5a4632, 0.8); g.fillEllipse(ux, uy - 63 * us, 30 * us, 5 * us);         // rim light
      g.fillStyle(0xc8884a, 0.25); g.fillEllipse(ux - 11 * us, uy - 40 * us, 5 * us, 16 * us); // torch glint
    };
    urn(cx - width * 0.32, sceneBot - 2, 1.15);
    urn(cx + width * 0.32, sceneBot - 2, 1.15);

    // ── Banners — mounted on the back wall, neatly flanking the door ──────────
    const bScale = 0.7;
    const bGapL  = Math.round((bwL + archL) / 2);
    const bGapR  = Math.round((bwR + archR) / 2);
    const bTopY  = bwTop + Math.round(10 * bScale);
    const bLen   = Math.round((bwBot - bwTop) * 0.46);
    this.banner(g, bGapL, bTopY, bLen, bScale);
    this.banner(g, bGapR, bTopY, bLen, bScale);
  }

  banner(g, x, topY, len, s = 1) {
    const w = 40 * s;
    // Hanging rod with finial ends.
    g.fillStyle(0xc8922a, 1);
    g.fillRect(x - w / 2 - 10 * s, topY - 7 * s, w + 20 * s, 5 * s);
    g.fillCircle(x - w / 2 - 10 * s, topY - 5 * s, 5 * s);
    g.fillCircle(x + w / 2 + 10 * s, topY - 5 * s, 5 * s);
    g.fillStyle(0x8a5a18, 0.8);
    g.fillRect(x - w / 2 - 2 * s, topY - 7 * s, w + 4 * s, 2 * s);
    // House Calder — deep crimson/wine (warm, sits in the palette).
    g.fillStyle(0x6e0c1a, 1);
    g.fillRect(x - w / 2, topY, w, len);
    g.fillTriangle(x - w / 2, topY + len, x + w / 2, topY + len, x, topY + len + 18 * s);
    // Edge highlights.
    g.fillStyle(0xa03050, 0.9);
    g.fillRect(x - w / 2, topY, 3 * s, len + 18 * s);
    g.fillRect(x + w / 2 - 3 * s, topY, 3 * s, len);
    // Gold top bar.
    g.fillStyle(GOLD, 1);
    g.fillRect(x - w / 2 - 5 * s, topY - 3 * s, w + 10 * s, 5 * s);
    // Sigil — diamond with cross and centre jewel.
    const sy = topY + len * 0.38;
    g.fillStyle(GOLD, 0.95);
    g.fillTriangle(x, sy - 14 * s, x + 11 * s, sy, x, sy + 14 * s);
    g.fillTriangle(x, sy - 14 * s, x - 11 * s, sy, x, sy + 14 * s);
    g.fillStyle(0x6e0c1a, 1);
    g.fillTriangle(x, sy - 8 * s, x + 6 * s, sy, x, sy + 8 * s);
    g.fillTriangle(x, sy - 8 * s, x - 6 * s, sy, x, sy + 8 * s);
    g.fillStyle(GOLD, 1);
    g.fillCircle(x, sy, 3 * s);
    g.fillRect(x - 10 * s, sy - 1.5 * s, 20 * s, 3 * s);
    // Wave marks — salt-and-sea for House Calder.
    const wy = topY + len * 0.7;
    g.fillStyle(0xd04060, 0.8);
    g.fillRect(x - 9 * s, wy, 18 * s, 2 * s);
    g.fillStyle(0xd04060, 0.55);
    g.fillRect(x - 7 * s, wy + 5 * s, 14 * s, 2 * s);
    g.fillStyle(0xd04060, 0.35);
    g.fillRect(x - 5 * s, wy + 10 * s, 10 * s, 2 * s);
  }

  // Feature props (centred on the floor) ------------------------------------

  featureCourt(g, x, floorY, s) {
    g.fillStyle(0x2a1d40, 1);
    g.fillRect(x - 80 * s, floorY - 12 * s, 160 * s, 12 * s);
    g.fillStyle(0x33244e, 1);
    g.fillRect(x - 58 * s, floorY - 24 * s, 116 * s, 12 * s);
    g.fillStyle(0x3a2858, 1);
    g.fillRect(x - 22 * s, floorY - 86 * s, 44 * s, 62 * s);
    g.fillStyle(0x243a64, 1);
    g.fillRect(x - 20 * s, floorY - 54 * s, 40 * s, 8 * s);
    g.fillStyle(GOLD, 1);
    g.fillCircle(x - 22 * s, floorY - 88 * s, 4 * s);
    g.fillCircle(x + 22 * s, floorY - 88 * s, 4 * s);
  }

  featureWar(g, x, floorY, s) {
    g.fillStyle(0x2e2142, 1);
    g.fillRect(x - 70 * s, floorY - 40 * s, 140 * s, 10 * s);
    g.fillStyle(0x241a36, 1);
    g.fillRect(x - 64 * s, floorY - 30 * s, 10 * s, 30 * s);
    g.fillRect(x + 54 * s, floorY - 30 * s, 10 * s, 30 * s);
    g.fillStyle(0xb89a6a, 0.95);
    g.fillRect(x - 56 * s, floorY - 47 * s, 112 * s, 8 * s);
    g.fillStyle(0xe0503c, 1);
    g.fillCircle(x - 28 * s, floorY - 43 * s, 3 * s);
    g.fillStyle(0x6fb0ff, 1);
    g.fillCircle(x + 8 * s, floorY - 43 * s, 3 * s);
    g.fillStyle(0xffce86, 1);
    g.fillCircle(x + 32 * s, floorY - 43 * s, 3 * s);
  }

  featureVeil(g, x, floorY, s) {
    g.fillStyle(0x3a2a6a, 0.8);
    for (let k = -1; k <= 1; k += 1)
      g.fillRect(x - 70 * s + k * 52 * s, floorY - 150 * s, 18 * s, 150 * s);
    g.fillStyle(0xb98cff, 0.5);
    g.fillCircle(x, floorY - 120 * s, 22 * s);
    g.fillStyle(0x231541, 1);
    g.fillCircle(x, floorY - 120 * s, 16 * s);
    g.fillStyle(0xb98cff, 0.85);
    g.fillCircle(x, floorY - 120 * s, 4 * s);
    this.drawFlame(g, x - 78 * s, floorY, s);
    this.drawFlame(g, x + 78 * s, floorY, s);
  }

  featureInfirmary(g, x, floorY, s) {
    const cols = [0x7fd0a0, 0xff8a5a, 0x6fb0ff, 0xffd27a];
    g.fillStyle(0x3a2850, 1);
    g.fillRect(x - 80 * s, floorY - 96 * s, 60 * s, 7 * s);
    g.fillRect(x - 80 * s, floorY - 66 * s, 60 * s, 7 * s);
    for (let i = 0; i < 4; i += 1) {
      g.fillStyle(cols[i], 0.9);
      g.fillRect(x - 78 * s + i * 14 * s, floorY - 108 * s, 8 * s, 12 * s);
    }
    g.fillStyle(0x2e2142, 1);
    g.fillRect(x + 8 * s, floorY - 16 * s, 70 * s, 16 * s);
    g.fillStyle(0x4a3a5e, 1);
    g.fillRect(x + 8 * s, floorY - 20 * s, 70 * s, 6 * s);
  }

  featureYard(g, x, floorY, s) {
    g.fillStyle(0x3a2850, 1);
    g.fillRect(x - 80 * s, floorY - 80 * s, 7 * s, 80 * s);
    g.fillRect(x - 30 * s, floorY - 80 * s, 7 * s, 80 * s);
    g.fillRect(x - 80 * s, floorY - 80 * s, 57 * s, 6 * s);
    g.fillStyle(0xcfd0d8, 1);
    g.fillRect(x - 70 * s, floorY - 74 * s, 4 * s, 64 * s);
    g.fillRect(x - 58 * s, floorY - 74 * s, 4 * s, 64 * s);
    g.fillStyle(0x5a4632, 1);
    g.fillRect(x + 36 * s, floorY - 50 * s, 12 * s, 50 * s);
    g.fillStyle(0x7a5a3a, 1);
    g.fillCircle(x + 42 * s, floorY - 56 * s, 11 * s);
    g.fillStyle(0x6a4a2a, 1);
    g.fillRect(x + 20 * s, floorY - 46 * s, 40 * s, 9 * s);
  }

  featureQuarters(g, x, floorY, s) {
    g.fillStyle(0x3a2850, 1);
    g.fillRect(x - 90 * s, floorY - 24 * s, 80 * s, 24 * s);
    g.fillStyle(0x5a466e, 1);
    g.fillRect(x - 90 * s, floorY - 30 * s, 80 * s, 9 * s);
    g.fillStyle(0xcfc0d8, 1);
    g.fillRect(x - 86 * s, floorY - 32 * s, 22 * s, 9 * s);
    g.fillStyle(0x0c1430, 1);
    g.fillRoundedRect(x + 24 * s, floorY - 150 * s, 56 * s, 120 * s, {
      tl: 28 * s,
      tr: 28 * s,
      bl: 0,
      br: 0,
    });
    g.fillStyle(0x6fa0d0, 0.5);
    g.fillCircle(x + 52 * s, floorY - 116 * s, 9 * s);
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(x + 36 * s, floorY - 130 * s, 1.4);
    g.fillCircle(x + 66 * s, floorY - 138 * s, 1.4);
  }

  featureDeck(g, x, floorY, s) {
    g.fillStyle(0x4a2858, 1);
    g.fillRoundedRect(x - 110 * s, floorY - 190 * s, 220 * s, 178 * s, {
      tl: 110 * s,
      tr: 110 * s,
      bl: 0,
      br: 0,
    });
    g.fillStyle(0x7a4a3a, 1);
    g.fillRoundedRect(x - 98 * s, floorY - 178 * s, 196 * s, 166 * s, {
      tl: 98 * s,
      tr: 98 * s,
      bl: 0,
      br: 0,
    });
    g.fillStyle(0xffce86, 0.5);
    g.fillCircle(x + 44 * s, floorY - 120 * s, 26 * s);
    g.fillStyle(0x1a1224, 1);
    g.fillEllipse(x, floorY - 30 * s, 90 * s, 18 * s);
    g.fillTriangle(x - 66 * s, floorY - 38 * s, x - 10 * s, floorY - 46 * s, x - 10 * s, floorY - 28 * s);
    g.fillTriangle(x + 66 * s, floorY - 38 * s, x + 10 * s, floorY - 46 * s, x + 10 * s, floorY - 28 * s);
  }

  drawFlame(g, fx, fy, s) {
    g.fillStyle(0xddd0c0, 1);
    g.fillRect(fx - 2 * s, fy - 16 * s, 4 * s, 16 * s);
    g.fillStyle(0xff8a3a, 0.9);
    g.fillEllipse(fx, fy - 20 * s, 7 * s, 13 * s);
    g.fillStyle(0xffe0a0, 1);
    g.fillEllipse(fx, fy - 20 * s, 3 * s, 7 * s);
  }

  // --- Title ----------------------------------------------------------------

  showEntryTitle() {
    const { width, height } = this.scale;
    const first = !this.registry.get('enteredResidency');
    this.registry.set('enteredResidency', true);
    this.registry.set('water', this.registry.get('water') ?? 100);

    const main = first ? 'ARRADIUS' : 'The Residency';
    const sub = first ? 'House Calder · Saltspire' : 'Saltspire';
    const t1 = this.add
      .text(width / 2, height * 0.3, main, {
        fontFamily: 'Georgia, serif',
        fontSize: first ? '46px' : '28px',
        color: '#f0e3d0',
      })
      .setOrigin(0.5)
      .setDepth(2000)
      .setAlpha(0);
    const t2 = this.add
      .text(width / 2, height * 0.3 + 38, sub, {
        fontFamily: 'Georgia, serif',
        fontSize: '15px',
        color: '#c8a98f',
      })
      .setOrigin(0.5)
      .setDepth(2000)
      .setAlpha(0);
    this.tweens.add({
      targets: [t1, t2],
      alpha: 1,
      duration: 1300,
      hold: 1600,
      yoyo: true,
      onComplete: () => {
        t1.destroy();
        t2.destroy();
      },
    });
  }
}
