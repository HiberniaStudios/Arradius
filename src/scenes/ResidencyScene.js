import Phaser from 'phaser';
import Ambient from '../audio/Ambient.js';
import { enablePainterly, togglePainterly } from '../shaders/KuwaharaPostFX.js';

// The Residency — House Calder's seat, presented as static painted screens in
// the spirit of Cryo's Dune: a hub hall you navigate point-and-click, each room
// a painted scene with portrait-led dialogue. Side-scrolling is reserved for
// expeditions (the Corsair Deck) and the World Map handles strategy.

const GOLD = 0xc9a24a;
const GOLD_S = '#c9a24a';
const CREAM = '#e8d8c0';

const LOCATIONS = {
  hall: {
    name: 'The Residency',
    flavor:
      'The great hall of House Calder at Saltspire. Lamplight and slow dust, and the weight of a world just handed to your house.',
    feature: 'hall',
    exits: ['court', 'war', 'veil', 'infirmary', 'yard', 'quarters', 'deck'],
  },
  court: {
    name: 'The Court',
    who: 'Lord Aldric',
    accent: 0xffd27a,
    feature: 'court',
    say: [
      '“Aridun will test us, Eren. Hold to its people and we hold to the world.”',
      '“Korinth did not gift us this fief out of love. Watch the dunes — and watch our own halls.”',
    ],
  },
  war: {
    name: 'The War Room',
    accent: 0xff8a5a,
    feature: 'war',
    flavor: 'The map of Aridun waits, House Vorrin’s forts marked in red.',
    actions: [{ label: 'Study the map', scene: 'WorldMapScene' }],
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
      '“Steel won’t win Aridun alone — but it’ll keep you breathing till the Shamen do.”',
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
    actions: [{ label: 'Ride out into Aridun', scene: 'ExpeditionScene' }],
  },
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
    this.input.keyboard.on('keydown-ESC', () => this.showLocation('hall'));
    this.input.keyboard.on('keydown-K', () => {
      const on = togglePainterly(this);
      if (this.filterCircle) this.filterCircle.setAlpha(on ? 1 : 0.45);
    });

    this.layout(this.scale.width, this.scale.height);
    this.cameras.main.fadeIn(600, 6, 4, 12);
    this.inputReadyAt = this.time.now + 350;
    enablePainterly(this);
    this.showEntryTitle();

    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off('resize', this.onResize, this)
    );
  }

  createAudio() {
    if (!this.game.ambient) this.game.ambient = new Ambient();
    this.ambient = this.game.ambient;
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

  showLocation(key) {
    if (this.time.now < this.inputReadyAt) return;
    this.current = key;
    this.sayIndex = 0;
    this.renderLocation();
  }

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
    this.clearDynamic();
    const { width, height } = this.scale;
    const loc = LOCATIONS[this.current];

    const barTop = Math.round(height * 0.66);
    const floorY = barTop - 12;

    // Painted scene.
    this.bd.clear();
    this.drawScene(loc, width, floorY, barTop);

    // Bottom UI bar — aged stone character with ornate corner details.
    this.bar.clear();
    this.bar.fillStyle(0x15101e, 1);
    this.bar.fillRect(0, barTop, width, height - barTop);
    // Warm inner band to break flatness.
    this.bar.fillStyle(0x1e162e, 0.65);
    this.bar.fillRect(0, barTop + 4, width, height - barTop - 8);
    // Sandstone warm tint strip at top.
    this.bar.fillStyle(0xb07d4a, 0.16);
    this.bar.fillRect(0, barTop, width, 22);
    // Top divider: sandstone line + gold hairline.
    this.bar.fillStyle(0xb07d4a, 0.78);
    this.bar.fillRect(0, barTop, width, 2);
    this.bar.fillStyle(GOLD, 0.5);
    this.bar.fillRect(0, barTop + 2, width, 1);
    // Corner ornaments — top-left.
    const cs = 28;
    this.bar.fillStyle(0xc4956a, 0.45);
    this.bar.fillTriangle(0, barTop, cs, barTop, 0, barTop + cs);
    this.bar.fillStyle(GOLD, 0.75);
    this.bar.fillRect(0, barTop, cs + 8, 2);
    this.bar.fillRect(0, barTop, 2, cs + 8);
    // Corner ornaments — top-right.
    this.bar.fillStyle(0xc4956a, 0.45);
    this.bar.fillTriangle(width, barTop, width - cs, barTop, width, barTop + cs);
    this.bar.fillStyle(GOLD, 0.75);
    this.bar.fillRect(width - cs - 8, barTop, cs + 8, 2);
    this.bar.fillRect(width - 2, barTop, 2, cs + 8);

    if (this.current === 'hall') this.renderHallMenu(loc, width, height, barTop);
    else this.renderRoomBar(loc, width, height, barTop);
  }

  // --- Hall (hub menu) ------------------------------------------------------

  renderHallMenu(loc, width, height, barTop) {
    const title = this.add
      .text(width / 2, barTop + 14, 'Where to, my lord?', {
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
        color: CREAM,
      })
      .setOrigin(0.5, 0)
      .setDepth(102);
    this.dynamic.push(title);

    const items = loc.exits;
    const cols = width < 560 ? 2 : 4;
    const rows = Math.ceil(items.length / cols);
    const areaTop = barTop + 44;
    const areaH = height - areaTop - 14;
    const bw = Math.min((width - 40) / cols - 12, 180);
    const bh = Math.min(areaH / rows - 8, 42);

    items.forEach((key, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const totalW = cols * (bw + 12) - 12;
      const x = (width - totalW) / 2 + col * (bw + 12) + bw / 2;
      const y = areaTop + row * (bh + 8) + bh / 2;
      this.makeButton(x, y, bw, bh, LOCATIONS[key].name, () =>
        this.showLocation(key)
      );
    });
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

    // Line / flavour.
    const line = loc.who ? (loc.say ? loc.say[this.sayIndex] : '') : loc.flavor || '';
    const actionsW = 210;
    const lineText = this.add
      .text(textLeft, padY + 30, line, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: '#d8c8e0',
        wordWrap: { width: width - textLeft - actionsW - 24 },
      })
      .setDepth(102);
    this.dynamic.push(lineText);

    // Actions (right-aligned stack).
    const actions = [];
    if (loc.who && loc.say && loc.say.length > 1) {
      actions.push({
        label: `Speak with ${loc.who}`,
        onClick: () => {
          this.sayIndex = (this.sayIndex + 1) % loc.say.length;
          this.renderLocation();
        },
      });
    }
    (loc.actions || []).forEach((a) =>
      actions.push({ label: a.label, onClick: () => this.goTo(a.scene) })
    );
    actions.push({ label: '‹ The Residency', onClick: () => this.showLocation('hall') });

    const bw = Math.min(actionsW, width * 0.5);
    const bh = 38;
    const totalH = actions.length * (bh + 8) - 8;
    let by = barTop + (height - barTop - totalH) / 2 + bh / 2;
    const bx = width - 16 - bw / 2;
    actions.forEach((a) => {
      this.makeButton(bx, by, bw, bh, a.label, a.onClick);
      by += bh + 8;
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
    // Floor.
    g.fillStyle(0x140d20, 1);
    g.fillRect(0, floorY, width, this.scale.height - floorY);
    g.fillStyle(0x2a1d3a, 1);
    g.fillRect(0, floorY, width, 4);
    g.fillStyle(0x243a64, 0.9); // runner
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

  column(g, x, top, floorY, depth = 0) {
    const sw = 26;
    // depth: 0 = nearest (warm, fully opaque), 1 = furthest (cool, hazy)
    const a     = 1 - depth * 0.38;
    const body  = depth < 0.5 ? 0x3a2a50 : 0x25203c;
    const light = depth < 0.5 ? 0x5a4488 : 0x382e58;
    const shade = depth < 0.5 ? 0x180f28 : 0x120c20;
    const cap   = depth < 0.5 ? 0x4a3870 : 0x322855;
    g.fillStyle(body, a);
    g.fillRect(x - sw / 2, top, sw, floorY - top);
    g.fillStyle(light, a * 0.9);
    g.fillRect(x - sw / 2, top, 5, floorY - top);
    g.fillStyle(shade, a);
    g.fillRect(x + sw / 2 - 4, top, 4, floorY - top);
    g.fillStyle(cap, a);
    g.fillRect(x - sw / 2 - 7, top - 14, sw + 14, 14);
    g.fillStyle(GOLD, (0.8 - depth * 0.55) * a);
    g.fillRect(x - sw / 2 - 7, top - 14, sw + 14, 3);
    g.fillStyle(0x241640, a);
    g.fillRect(x - sw / 2 - 7, floorY - 10, sw + 14, 10);
    if (depth < 0.35) {
      // Near columns: faint central groove for extra detail.
      g.fillStyle(0x180f28, 0.4);
      g.fillRect(x - 1, top + 4, 2, floorY - top - 8);
    }
  }

  sceneHall(g, width, floorY) {
    const cx = width / 2;
    const height = this.scale.height;
    // Floor.
    g.fillStyle(0x140d20, 1);
    g.fillRect(0, floorY, width, height - floorY);
    g.fillStyle(0x2a1d3a, 1);
    g.fillRect(0, floorY, width, 4);
    // Light cone — warm amber, soft feathered edges (no hard triangle).
    const vp = floorY * 0.42;
    const coneW = width * 0.17;
    [
      { w: coneW * 1.5, a: 0.05 },
      { w: coneW * 1.2, a: 0.08 },
      { w: coneW,       a: 0.13 },
      { w: coneW * 0.7, a: 0.09 },
    ].forEach(({ w, a }) => {
      g.fillStyle(0xc8922a, a);
      g.fillTriangle(cx - w, floorY, cx + w, floorY, cx, vp);
    });
    g.fillStyle(0xe8b84a, 0.06);
    g.fillTriangle(cx - coneW * 0.35, floorY, cx + coneW * 0.35, floorY, cx, vp);
    g.fillStyle(GOLD, 0.42);
    g.fillTriangle(cx - 3, floorY, cx + 3, floorY, cx, vp);
    // Radial grain on the cone.
    this.addStoneNoise(cx, (floorY + vp) / 2, coneW * 2.4, floorY - vp, 0xc8922a, 0.055);
    // Far arch — sandstone/ochre palette with stone joints.
    const archW = 92;
    const archRad = archW / 2;
    const archTop = floorY * 0.34;
    const archH = floorY * 0.5;
    // Shadow surround (slightly irregular by offset).
    g.fillStyle(0x7a4e28, 1);
    g.fillRoundedRect(cx - archRad - 5, archTop - 4, archW + 10, archH + 5, {
      tl: archRad + 3, tr: archRad + 3, bl: 0, br: 0,
    });
    // Sandstone face.
    g.fillStyle(0xb07d4a, 1);
    g.fillRoundedRect(cx - archRad, archTop, archW, archH, {
      tl: archRad, tr: archRad, bl: 0, br: 0,
    });
    // Ochre highlight on the lit side.
    g.fillStyle(0xc4956a, 0.5);
    g.fillRoundedRect(cx - archRad, archTop, archW * 0.44, archH, {
      tl: archRad, tr: 0, bl: 0, br: 0,
    });
    // Stone joint lines in the straight section below the semicircle.
    g.fillStyle(0x6a3e1a, 0.55);
    for (let jy = archTop + archRad + 6; jy < archTop + archH; jy += 13) {
      g.fillRect(cx - archRad + 2, jy, archW - 4, 1.5);
    }
    // Dark inner opening.
    g.fillStyle(0x130c08, 1);
    g.fillRoundedRect(cx - archRad + 9, archTop + 9, archW - 18, archH - 9, {
      tl: archRad - 9, tr: archRad - 9, bl: 0, br: 0,
    });
    // Stone noise overlay on the arch face.
    this.addStoneNoise(cx, archTop + archH * 0.55, archW + 14, archH + 6);
    this.addGlow(cx, archTop + archH * 0.55, width * 0.38, 0xffce86, 0.52);
    // Receding columns — i=0 nearest/warmest, i=2 furthest/haziest.
    const pairs = [0.12, 0.24, 0.36];
    pairs.forEach((f, i) => {
      const top = floorY * (0.2 + i * 0.05);
      const colDepth = i / 2;
      this.column(g, cx - width * (0.46 - f * 0.6), top, floorY, colDepth);
      this.column(g, cx + width * (0.46 - f * 0.6), top, floorY, colDepth);
    });
    // Banners.
    [cx - width * 0.22, cx + width * 0.22].forEach((x) =>
      this.banner(g, x, floorY * 0.18, floorY * 0.28)
    );
  }

  banner(g, x, topY, len) {
    const w = 38;
    // House Calder — rich deep blue.
    g.fillStyle(0x1e5090, 1);
    g.fillRect(x - w / 2, topY, w, len);
    g.fillTriangle(x - w / 2, topY + len, x + w / 2, topY + len, x, topY + len + 18);
    // Edge highlights.
    g.fillStyle(0x4888c8, 0.85);
    g.fillRect(x - w / 2, topY, 3, len + 18);
    g.fillRect(x + w / 2 - 3, topY, 3, len);
    // Gold top bar.
    g.fillStyle(GOLD, 1);
    g.fillRect(x - w / 2 - 5, topY - 3, w + 10, 5);
    // Sigil — diamond with cross and centre jewel.
    const sy = topY + len * 0.38;
    g.fillStyle(GOLD, 0.95);
    g.fillTriangle(x, sy - 14, x + 11, sy, x, sy + 14);
    g.fillTriangle(x, sy - 14, x - 11, sy, x, sy + 14);
    g.fillStyle(0x1e5090, 1);
    g.fillTriangle(x, sy - 8, x + 6, sy, x, sy + 8);
    g.fillTriangle(x, sy - 8, x - 6, sy, x, sy + 8);
    g.fillStyle(GOLD, 1);
    g.fillCircle(x, sy, 3);
    g.fillRect(x - 10, sy - 1.5, 20, 3);
    // Wave marks — salt-and-sea for House Calder.
    const wy = topY + len * 0.7;
    g.fillStyle(0x6aaad8, 0.8);
    g.fillRect(x - 9, wy, 18, 2);
    g.fillStyle(0x6aaad8, 0.6);
    g.fillRect(x - 7, wy + 5, 14, 2);
    g.fillStyle(0x6aaad8, 0.4);
    g.fillRect(x - 5, wy + 10, 10, 2);
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
