import { GameScene } from './game/GameScene.js';
const config = {
    type: Phaser.AUTO,
    width: 960,
    height: 540,
    parent: 'game',
    pixelArt: false,
    backgroundColor: '#0b0f1a',
    scene: [GameScene]
};
new Phaser.Game(config);
