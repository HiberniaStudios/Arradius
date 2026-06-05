import Phaser from 'phaser';

/**
 * BootScene generates all the textures the game needs at runtime, so the
 * scaffold runs with zero binary asset files. Swap these out for real
 * spritesheets/images by using `this.load.*` in a preload() method and
 * pointing at files in the `public/` directory.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.makeRectTexture('player', 28, 40, 0x4fc3f7, 0x29b6f6);
    this.makeRectTexture('ground', 64, 64, 0x37474f, 0x263238);
    this.makeRectTexture('platform', 96, 24, 0x6d4c41, 0x4e342e);
    this.makeCoinTexture('coin', 18, 0xffd54f, 0xffb300);

    this.scene.start('GameScene');
  }

  /** Draw a filled rectangle with a darker border into a reusable texture. */
  makeRectTexture(key, width, height, fill, border) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(fill, 1);
    g.fillRect(0, 0, width, height);
    g.lineStyle(2, border, 1);
    g.strokeRect(1, 1, width - 2, height - 2);
    g.generateTexture(key, width, height);
    g.destroy();
  }

  /** Draw a coin (filled circle with border) into a reusable texture. */
  makeCoinTexture(key, size, fill, border) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const r = size / 2;
    g.fillStyle(fill, 1);
    g.fillCircle(r, r, r);
    g.lineStyle(2, border, 1);
    g.strokeCircle(r, r, r - 1);
    g.generateTexture(key, size, size);
    g.destroy();
  }
}
