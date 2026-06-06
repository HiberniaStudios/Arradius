import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import ResidencyScene from './scenes/ResidencyScene.js';
import WorldMapScene from './scenes/WorldMapScene.js';
import ExpeditionScene from './scenes/ExpeditionScene.js';
import KuwaharaPostFX from './shaders/KuwaharaPostFX.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0a1f',
  pixelArt: true,
  scale: {
    // RESIZE makes the canvas match the parent (screen) size exactly, so the
    // game fills any aspect ratio with no letterboxing. The scene lays itself
    // out proportionally and listens for resize/orientation changes.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 900 },
      debug: false,
    },
  },
  pipeline: { KuwaharaPostFX },
  scene: [BootScene, ResidencyScene, WorldMapScene, ExpeditionScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
