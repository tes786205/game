import { Boot } from "./scenes/Boot";
import { CharacterSelect } from "./scenes/CharacterSelect";
import { Game as MainGame } from "./scenes/Game";
import { GameOver } from "./scenes/GameOver";
import { MainMenu } from "./scenes/MainMenu";
import { Preloader } from "./scenes/Preloader";
import { AUTO, Game, Scale } from "phaser";
import VirtualJoystickPlugin from "./plugins/rexvirtualjoystickplugin.min.js";

const config = {
  type: AUTO,
  width: 800,
  height: 450,
  parent: "game-container",
  backgroundColor: "#000000",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: true,
    },
  },
  plugins: {
    global: [
      {
        key: "rexVirtualJoystick",
        plugin: VirtualJoystickPlugin,
        start: true,
      },
    ],
  },
  scale: {
    mode: Scale.FIT,
    autoCenter: Scale.CENTER_BOTH,
  },
  scene: [Boot, Preloader, MainMenu, CharacterSelect, MainGame, GameOver],
};

const StartGame = (parent) => {
  return new Game({ ...config, parent });
};

export default StartGame;
