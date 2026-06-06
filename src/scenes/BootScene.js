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

  create() {
    this.makeSky();
    this.makeGlow();
    this.makeAurun();
    this.makeEren();

    this.scene.start('GameScene');
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
}
