import { Scene } from "phaser";

export class Boot extends Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    this.load.image("background", "assets/boot-background.png");
    this.load.font("Rubik Glitch", "assets/RubikGlitch-Regular.ttf");
  }

  create() {
    this.add.image(this.game.config.width / 2, this.game.config.height / 2, "background");

    this.add
      .text(this.game.config.width / 2, this.game.config.height / 2 + 120, "Clique na tela para iniciar.", {
        fontFamily: "Rubik Glitch",
        fontSize: 36,
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5);

    this.input.once("pointerdown", () => {
      try {
        this.scale.startFullscreen();
      } catch (error) {
        console.error("Failed to start fullscreen:", error);
      }
      this.scene.start("Preloader");
    });
  }
}
