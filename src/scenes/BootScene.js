import Phaser from 'phaser';

/**
 * Generates the painterly textures for the Arradius slice at runtime — a dusk
 * sky gradient, soft glow, Eren's hooded silhouette, and an Aurun mote. Still
 * asset-free; swap these for real art by loading files in preload() later.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Optional painted room backdrops. If absent, scenes fall back to procedural
    // art — the loaderror is swallowed so a missing file never blocks boot.
    this.load.image('aldric',    'Aldric.png');
    this.load.image('halix',     'Halix.png');
    this.load.audio('lord_aldric_say_0', 'audio/dialogue/lord_aldric_say_0.mp3');
    this.load.audio('lord_aldric_say_1', 'audio/dialogue/lord_aldric_say_1.mp3');
    this.load.audio('lord_aldric_say_2', 'audio/dialogue/lord_aldric_say_2.mp3');
    this.load.audio('lord_aldric_say_3', 'audio/dialogue/lord_aldric_say_3.mp3');
    this.load.audio('lord_aldric_say_4', 'audio/dialogue/lord_aldric_say_4.mp3');
    this.load.audio('lord_aldric_say_5', 'audio/dialogue/lord_aldric_say_5.mp3');
    this.load.audio('halix_say_0', 'audio/dialogue/Halix_say_0.mp3');
    this.load.audio('halix_say_1', 'audio/dialogue/Halix_say_1.mp3');
    this.load.audio('halix_say_2', 'audio/dialogue/Halix_say_2.mp3');
    this.load.audio('halix_say_3', 'audio/dialogue/Halix_say_3.mp3');
    this.load.audio('halix_say_4', 'audio/dialogue/Halix_say_4.mp3');
    this.load.audio('halix_say_5', 'audio/dialogue/Halix_say_5.mp3');
    this.load.audio('halix_say_6', 'audio/dialogue/Halix_say_6.mp3');
    this.load.audio('halix_say_7', 'audio/dialogue/Halix_say_7.mp3');
    this.load.image('hallBg',    'hall.png');
    this.load.image('commsBg',   'comms.png');
    this.load.image('courtBg',   'The_Court.png');
    // Map node sprites — optional, fall back to procedural symbols if absent
    this.load.image('node-city',   'map/Saltspire_icon.png');
    this.load.image('node-hollow', 'map/Hollow_icon.png');
    this.load.image('node-fort',   'map/DrillingRig_icon.png');
    this.load.image('mapBg', 'map/enhanced_Arradius_map.png');
    this.load.on('loaderror', () => {});
  }

  create() {
    // Purge any stale canvas textures left by a previous BootScene run.
    // Happens during Vite HMR cycles: the module re-executes but the Phaser
    // TextureManager persists, so createCanvas() returns null for existing keys.
    ['sky','glow','aurun','eren','figure','interiorWall','vignette','noise','planetSurface','planetClouds']
      .forEach(k => { if (this.textures.exists(k)) this.textures.remove(k); });

    this.makeSky();
    this.makeGlow();
    this.makeAurun();
    this.makeEren();
    this.makeFigure();
    this.makeInteriorWall();
    this.makeVignette();
    this.makeNoise();
    this.makePlanetSurface();
    this.makePlanetClouds();
    if (!this.textures.exists('aldric')) this.makeAldric();
    this.textures.get('aldric').setFilter(Phaser.Textures.FilterMode.NEAREST);
    if (!this.textures.exists('halix')) this.makeHalix();
    this.textures.get('halix').setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.scene.start('ResidencyScene');
  }

  /** Warm interior wall gradient — indigo vault above, sandstone glow at floor. */
  makeInteriorWall() {
    const w = 16;
    const h = 512;
    const tex = this.textures.createCanvas('interiorWall', w, h);
    const ctx = tex.getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, '#180d08');
    grad.addColorStop(0.22, '#2e1508');
    grad.addColorStop(0.48, '#5a2812');
    grad.addColorStop(0.74, '#8c3e1c');
    grad.addColorStop(1.0, '#c06028');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
  }

  /** A soft vignette to darken the screen edges for a painterly mood. */
  makeVignette() {
    const size = 256;
    const tex = this.textures.createCanvas('vignette', size, size);
    const ctx = tex.getContext();
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, r * 0.55, r, r, r);
    grad.addColorStop(0.0, 'rgba(6,3,10,0)');
    grad.addColorStop(1.0, 'rgba(6,3,10,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  /** A neutral standing figure, tintable per character (court NPCs). */
  makeFigure() {
    const w = 30;
    const h = 54;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    // Two greys so a uniform tint still yields a little robe/head contrast.
    g.fillStyle(0xbfbfbf, 1);
    g.fillRoundedRect(7, 18, 16, 34, { tl: 6, tr: 6, bl: 2, br: 2 });
    g.fillTriangle(4, 52, 26, 52, 15, 30);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(15, 12, 8);
    g.generateTexture('figure', w, h);
    g.destroy();
  }

  /** Vertical dusk gradient: indigo night up top to burnt orange at the horizon. */
  makeSky() {
    const w = 16;
    const h = 512;
    const tex = this.textures.createCanvas('sky', w, h);
    const ctx = tex.getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, '#0b0a1f');
    grad.addColorStop(0.35, '#231646');
    grad.addColorStop(0.62, '#4a2358');
    grad.addColorStop(0.82, '#8a3a48');
    grad.addColorStop(1.0, '#c66a31');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
  }

  /** Soft radial glow used for the sun, Aurun light, and atmospheric haze. */
  makeGlow() {
    const size = 256;
    const tex = this.textures.createCanvas('glow', size, size);
    const ctx = tex.getContext();
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0.0, 'rgba(255,244,214,1)');
    grad.addColorStop(0.35, 'rgba(255,206,140,0.55)');
    grad.addColorStop(0.7, 'rgba(230,150,90,0.18)');
    grad.addColorStop(1.0, 'rgba(230,150,90,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  /** A glowing amber mote — the Aurun bloom. */
  makeAurun() {
    const size = 32;
    const tex = this.textures.createCanvas('aurun', size, size);
    const ctx = tex.getContext();
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0.0, 'rgba(255,246,222,1)');
    grad.addColorStop(0.3, 'rgba(255,200,96,0.95)');
    grad.addColorStop(0.65, 'rgba(255,150,48,0.35)');
    grad.addColorStop(1.0, 'rgba(255,150,48,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  /** Eren: a hooded silhouette with a faint rim light and Aurun-amber eyes. */
  makeEren() {
    const w = 30;
    const h = 52;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Cloak body (dark silhouette).
    g.fillStyle(0x140f20, 1);
    g.fillRoundedRect(7, 16, 16, 34, { tl: 6, tr: 6, bl: 2, br: 2 });
    g.fillTriangle(4, 50, 26, 50, 15, 30); // flared hem
    // Hood / head.
    g.fillCircle(15, 12, 8);
    g.fillRoundedRect(8, 8, 14, 12, 6);

    // Faint warm rim light on the sun-facing edge.
    g.fillStyle(0xc8884a, 0.5);
    g.fillRect(21, 12, 2, 34);
    g.fillStyle(0xc8884a, 0.35);
    g.fillCircle(21, 9, 2.4);

    // Aurun-touched eyes.
    g.fillStyle(0xffcc66, 0.95);
    g.fillCircle(12, 12, 1.5);
    g.fillCircle(18, 12, 1.5);

    g.generateTexture('eren', w, h);
    g.destroy();
  }

  /** Fine grain noise — used as a stone / parchment texture overlay in scenes. */
  makeNoise() {
    const size = 256;
    const tex = this.textures.createCanvas('noise', size, size);
    const ctx = tex.getContext();
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(Math.random() * 220 + 35);
      img.data[i]     = v;
      img.data[i + 1] = Math.floor(v * 0.82);
      img.data[i + 2] = Math.floor(v * 0.60);
      img.data[i + 3] = Math.floor(Math.random() * 52 + 8);
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }

  /** Lord Aldric Calder — Duke Leto style: bare-headed, high-collared coat,
   *  House Calder blue trim, silver temples, steel-blue eyes. */
  makeAldric() {
    const w = 48;
    const h = 80;
    const cx = 24;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // ── Cape — left sweep; inner edge lighter so it reads against the coat ──
    g.fillStyle(0x07050e, 1);
    g.fillTriangle(0, 28, 22, 28, 0, 78);
    g.fillStyle(0x1c1838, 0.55);
    g.fillTriangle(3, 28, 6, 28, 3, 72);  // cape inner-edge highlight

    // ── Coat body ────────────────────────────────────────────────────────────
    g.fillStyle(0x0d0b1c, 1);
    g.fillRoundedRect(11, 27, 28, 49, { tl: 3, tr: 3, bl: 2, br: 2 });
    // Right side catch-light — depth
    g.fillStyle(0x1a1840, 0.40);
    g.fillRect(30, 29, 8, 45);

    // ── Shoulders — squared, epaulette bar ──────────────────────────────────
    g.fillStyle(0x161434, 1);
    g.fillRect(5, 27, 38, 8);

    // ── House Calder blue trim — top + bottom of shoulder bar ───────────────
    g.fillStyle(0x6fb0ff, 0.80);
    g.fillRect(5, 27, 38, 2);
    g.fillStyle(0x6fb0ff, 0.35);
    g.fillRect(5, 34, 38, 1);

    // ── V-collar — deep shadow cut ───────────────────────────────────────────
    g.fillStyle(0x07050e, 1);
    g.fillTriangle(18, 27, 30, 27, cx, 40);
    // Collar Calder-blue piping
    g.fillStyle(0x6fb0ff, 0.50);
    g.fillTriangle(18, 27, 20, 27, cx, 38);
    g.fillTriangle(30, 27, 28, 27, cx, 38);

    // ── Gold buttons ─────────────────────────────────────────────────────────
    g.fillStyle(0xc8a050, 0.92);
    [38, 47, 56, 65].forEach(y => g.fillCircle(cx, y, 1.6));

    // ── House Calder signet diamond — left breast, two-tone + gold pip ──────
    g.fillStyle(0x6fb0ff, 0.90);
    g.fillTriangle(13, 37, 19, 31, 19, 43);
    g.fillStyle(0x3a68a0, 0.90);
    g.fillTriangle(19, 31, 25, 37, 19, 43);
    g.fillStyle(0xc8a050, 1);
    g.fillCircle(19, 37, 1.3);

    // ── Cool Calder-blue rim light — right coat edge ─────────────────────────
    g.fillStyle(0x6fb0ff, 0.20);
    g.fillRect(38, 20, 2, 58);

    // ── Neck ─────────────────────────────────────────────────────────────────
    g.fillStyle(0xa87858, 1);
    g.fillRect(20, 22, 8, 7);

    // ── Head — layered planes for readability ─────────────────────────────────
    // Forehead (lighter, catches light)
    g.fillStyle(0xc49870, 1);
    g.fillEllipse(cx, 7, 18, 12);
    // Mid-face / cheeks
    g.fillStyle(0xb88860, 1);
    g.fillRect(15, 9, 18, 10);
    // Jaw — slightly narrower + darker
    g.fillStyle(0xa87858, 1);
    g.fillRect(16, 17, 16, 6);
    g.fillRect(17, 22, 14, 2);  // chin taper

    // ── Hair — clearly separate from face, swept back ─────────────────────────
    g.fillStyle(0x100e1e, 1);
    g.fillRect(15, 0, 18, 6);   // top crown
    g.fillRect(13, 1, 3, 16);   // left side
    g.fillRect(32, 1, 3, 16);   // right side

    // ── Silver temples — bright band, clearly hair not helmet ────────────────
    g.fillStyle(0xb8b8c8, 0.85);
    g.fillRect(13, 6, 3, 9);
    g.fillRect(32, 6, 3, 9);

    // ── Brows — heavy, close-set, authoritative ──────────────────────────────
    g.fillStyle(0x100e1e, 1);
    g.fillRect(16, 11, 5, 2);
    g.fillRect(27, 11, 5, 2);

    // ── Eyes — steel blue, wide-set, resolute ────────────────────────────────
    g.fillStyle(0x5888b0, 1);
    g.fillRect(16, 14, 5, 3);
    g.fillRect(27, 14, 5, 3);
    // Pupil
    g.fillStyle(0x0c1828, 1);
    g.fillRect(18, 14, 2, 3);
    g.fillRect(29, 14, 2, 3);
    // Catchlight — gives life to the eyes
    g.fillStyle(0xeef6ff, 0.90);
    g.fillRect(19, 14, 1, 1);
    g.fillRect(30, 14, 1, 1);

    // ── Nose — minimal shadow bridge ─────────────────────────────────────────
    g.fillStyle(0x9a7050, 0.50);
    g.fillRect(22, 18, 4, 3);

    // ── Mouth — firm, set line ────────────────────────────────────────────────
    g.fillStyle(0x7a4c38, 0.85);
    g.fillRect(19, 22, 10, 2);
    // Slight highlight on upper lip
    g.fillStyle(0xbe9070, 0.50);
    g.fillRect(20, 21, 8, 1);

    g.generateTexture('aldric', w, h);
    g.destroy();
  }

  /** Halix — the Reckoner. Lean graphite uniform, high collar, data pad, ice-blue eyes. */
  makeHalix() {
    const w = 48;
    const h = 80;
    const cx = 24;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // ── Coat — graphite, straight cut, no cape ────────────────────────────────
    g.fillStyle(0x14161a, 1);
    g.fillRoundedRect(10, 27, 28, 49, { tl: 2, tr: 2, bl: 2, br: 2 });
    g.fillStyle(0x1e2228, 0.5);
    g.fillRect(28, 29, 9, 45);

    // ── Shoulders — straight, functional ─────────────────────────────────────
    g.fillStyle(0x1c1e24, 1);
    g.fillRect(8, 27, 32, 6);
    g.fillStyle(0x8899bb, 0.65);
    g.fillRect(8, 27, 32, 2);  // steel-blue shoulder trim

    // ── High collar — closed, precise ────────────────────────────────────────
    g.fillStyle(0x1c1e24, 1);
    g.fillRect(18, 19, 12, 10);
    g.fillStyle(0x8899bb, 0.55);
    g.fillRect(18, 19, 2, 10);  // left edge
    g.fillRect(28, 19, 2, 10);  // right edge

    // ── Left arm — straight, cuff band ───────────────────────────────────────
    g.fillStyle(0x14161a, 1);
    g.fillRect(10, 33, 10, 35);
    g.fillStyle(0x8899bb, 0.55);
    g.fillRect(10, 65, 10, 2);

    // ── Data pad — held at waist, faint screen glow ───────────────────────────
    g.fillStyle(0x1a1e24, 1);
    g.fillRoundedRect(27, 44, 10, 14, 1);
    g.fillStyle(0x8899bb, 0.25);
    g.fillRect(28, 45, 8, 12);
    g.fillStyle(0x8899bb, 0.75);
    [47, 50, 53].forEach(y => g.fillRect(29, y, 6, 1));

    // ── Neck ─────────────────────────────────────────────────────────────────
    g.fillStyle(0x9898b0, 1);
    g.fillRect(21, 18, 6, 5);

    // ── Head — angular, lean, pale indoor complexion ──────────────────────────
    g.fillStyle(0xa8a8c0, 1);
    g.fillEllipse(cx, 7, 15, 10);
    g.fillStyle(0x9898b2, 1);
    g.fillRect(17, 9, 14, 8);
    g.fillStyle(0x8888a8, 1);
    g.fillRect(18, 16, 12, 5);
    g.fillRect(19, 20, 10, 2);

    // ── Hair — very dark, close-cropped ──────────────────────────────────────
    g.fillStyle(0x0c0e18, 1);
    g.fillRect(17, 0, 14, 5);
    g.fillRect(14, 1, 4, 11);
    g.fillRect(30, 1, 4, 11);

    // ── Brows — thin, sharp, arched — perpetually analytical ─────────────────
    g.fillStyle(0x0c0e18, 1);
    g.fillRect(17, 10, 5, 1);
    g.fillRect(26, 10, 5, 1);

    // ── Eyes — ice blue, intent, narrowed ─────────────────────────────────────
    g.fillStyle(0x7a9bbc, 1);
    g.fillRect(17, 12, 5, 2);
    g.fillRect(26, 12, 5, 2);
    g.fillStyle(0x0c1828, 1);
    g.fillRect(19, 12, 2, 2);
    g.fillRect(28, 12, 2, 2);
    g.fillStyle(0xddeeff, 0.85);
    g.fillRect(20, 12, 1, 1);
    g.fillRect(29, 12, 1, 1);

    // ── Nose — sharp, minimal ─────────────────────────────────────────────────
    g.fillStyle(0x7878a0, 0.5);
    g.fillRect(23, 15, 3, 4);

    // ── Mouth — thin, neutral ─────────────────────────────────────────────────
    g.fillStyle(0x606070, 0.9);
    g.fillRect(20, 20, 8, 1);

    g.generateTexture('halix', w, h);
    g.destroy();
  }

  /** Tileable desert-world surface for the comms-screen planet (scrolls to rotate). */
  makePlanetSurface() {
    const w = 256;
    const h = 128;
    const tex = this.textures.createCanvas('planetSurface', w, h);
    const ctx = tex.getContext();
    const R = Math.random;
    // Base sand.
    ctx.fillStyle = '#b9824a';
    ctx.fillRect(0, 0, w, h);
    // Latitude shading bands (lighter/darker ochre) — full width, seamless.
    for (let i = 0; i < 11; i += 1) {
      const y = R() * h;
      const bh = 3 + R() * 16;
      ctx.fillStyle = R() > 0.5
        ? `rgba(122,78,34,${(0.15 + R() * 0.3).toFixed(2)})`
        : `rgba(214,168,102,${(0.12 + R() * 0.25).toFixed(2)})`;
      ctx.fillRect(0, y, w, bh);
    }
    // Blotch helper, drawn with horizontal wrap so the texture tiles seamlessly.
    const blob = (bx, by, br, ry, col) => {
      ctx.fillStyle = col;
      [bx, bx - w, bx + w].forEach((px) => {
        ctx.beginPath();
        ctx.ellipse(px, by, br, ry, R() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    // Rock / canyon regions.
    for (let i = 0; i < 16; i += 1) {
      const br = 5 + R() * 18;
      blob(R() * w, R() * h, br, br * (0.5 + R() * 0.4),
        R() > 0.5 ? 'rgba(106,66,30,0.5)' : 'rgba(150,106,54,0.4)');
    }
    // Faint high cloud wisps.
    for (let i = 0; i < 6; i += 1) {
      const br = 14 + R() * 26;
      blob(R() * w, R() * h, br, br * 0.45, 'rgba(232,216,184,0.10)');
    }
    tex.refresh();
  }

  /** Tileable, mostly-transparent cloud layer — drifts over the painted planet. */
  makePlanetClouds() {
    const w = 256;
    const h = 128;
    const tex = this.textures.createCanvas('planetClouds', w, h);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h); // transparent base
    const R = Math.random;
    // Soft radial wisps, drawn with horizontal wrap so the texture tiles.
    const wisp = (bx, by, br) => {
      [bx, bx - w, bx + w].forEach((px) => {
        const g = ctx.createRadialGradient(px, by, 0, px, by, br);
        g.addColorStop(0, 'rgba(236,230,214,0.55)');
        g.addColorStop(0.6, 'rgba(236,230,214,0.2)');
        g.addColorStop(1, 'rgba(236,230,214,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(px, by, br, br * (0.5 + R() * 0.35), R() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    for (let i = 0; i < 16; i += 1) wisp(R() * w, R() * h, 10 + R() * 26);
    tex.refresh();
  }
}
