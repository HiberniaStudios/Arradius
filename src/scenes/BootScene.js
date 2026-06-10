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
    ['sky','glow','aurun','eren','figure','interiorWall','vignette','noise','planetSurface','planetClouds','aldric']
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
    this.makeAldric();

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
    const w = 44;
    const h = 76;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // ── Cape — sweeps left, deepest shadow ───────────────────────────────────
    g.fillStyle(0x08060f, 1);
    g.fillTriangle(2, 26, 20, 26, 2, 74);

    // ── Body — high-collared formal coat ────────────────────────────────────
    g.fillStyle(0x0e0c1c, 1);
    g.fillRoundedRect(10, 24, 26, 48, { tl: 3, tr: 3, bl: 2, br: 2 });

    // ── Shoulders — squared, military ───────────────────────────────────────
    g.fillStyle(0x141228, 1);
    g.fillRect(5, 24, 34, 9);

    // ── V-collar ────────────────────────────────────────────────────────────
    g.fillStyle(0x0e0c1c, 1);
    g.fillTriangle(17, 24, 27, 24, 22, 35);

    // ── House Calder blue — shoulder trim ───────────────────────────────────
    g.fillStyle(0x6fb0ff, 0.55);
    g.fillRect(5, 24, 34, 2);
    // Collar edge highlights
    g.fillStyle(0x6fb0ff, 0.45);
    g.fillTriangle(17, 24, 19, 24, 22, 33);
    g.fillTriangle(27, 24, 25, 24, 22, 33);

    // ── Gold buttons down centre placket ────────────────────────────────────
    g.fillStyle(0xc8a050, 0.90);
    g.fillCircle(22, 33, 1.4);
    g.fillCircle(22, 41, 1.4);
    g.fillCircle(22, 49, 1.4);
    g.fillCircle(22, 57, 1.4);

    // ── House Calder signet diamond — left breast ────────────────────────────
    g.fillStyle(0x6fb0ff, 0.85);
    g.fillTriangle(13, 32, 17, 28, 17, 36);
    g.fillStyle(0x4a88cc, 0.85);
    g.fillTriangle(17, 28, 21, 32, 17, 36);

    // ── Cool blue rim light — right edge (moonrise) ──────────────────────────
    g.fillStyle(0x6fb0ff, 0.22);
    g.fillRect(35, 16, 2, 56);

    // ── Neck ────────────────────────────────────────────────────────────────
    g.fillStyle(0xa87e58, 1);
    g.fillRect(19, 19, 6, 8);

    // ── Head — angular, weathered noble ─────────────────────────────────────
    g.fillStyle(0xb8906a, 1);
    g.fillEllipse(22, 12, 16, 18);

    // ── Hair — dark, swept back ──────────────────────────────────────────────
    g.fillStyle(0x12101e, 1);
    g.fillRect(14, 4, 16, 7);   // top
    g.fillRect(14, 4, 3, 13);   // left side
    g.fillRect(27, 4, 3, 13);   // right side

    // ── Silver temples ───────────────────────────────────────────────────────
    g.fillStyle(0x9a9aae, 0.80);
    g.fillRect(14, 6, 3, 8);
    g.fillRect(27, 6, 3, 8);

    // ── Heavy brows — authoritative ─────────────────────────────────────────
    g.fillStyle(0x18161e, 1);
    g.fillRect(16, 10, 4, 2);
    g.fillRect(24, 10, 4, 2);

    // ── Steel-blue eyes ──────────────────────────────────────────────────────
    g.fillStyle(0x5a8ab8, 1);
    g.fillRect(16, 13, 4, 2);
    g.fillRect(24, 13, 4, 2);
    // Pupils
    g.fillStyle(0x1a2a3a, 1);
    g.fillRect(18, 13, 2, 2);
    g.fillRect(26, 13, 2, 2);

    // ── Strong jaw / chin shadow ─────────────────────────────────────────────
    g.fillStyle(0x9a7050, 0.60);
    g.fillRect(17, 19, 10, 3);

    g.generateTexture('aldric', w, h);
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
