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
    // FIT locks the design aspect ratio (16:9) and letterboxes the spare space
    // rather than squashing the scene when the window is a different shape. The
    // scene always lays out against this fixed logical size (1280x720); Phaser
    // scales the rendered canvas to fit the screen and centres it.
    // To retarget, change width/height: 16:10 → 1280x800, 4:3 → 1024x768,
    // 21:9 → 1280x548. Keep them in proportion to the aspect you want.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
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
const game = new Phaser.Game(config);
window.__game = game;

// Only the focused tab plays audio — prevents stacked soundtracks when the game
// is open in several tabs.
document.addEventListener('visibilitychange', () => {
  const audio = game.audio;
  if (!audio) return;
  if (document.hidden) audio.suspendForHidden();
  else audio.resumeIfVisible();
});
