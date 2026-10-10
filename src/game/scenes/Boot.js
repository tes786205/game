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
    this.add.image(400, 225, "background");

    this.add
      .text(400, 400, "Clique na tela para iniciar.", {
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
      this.scene.stop();
      this.scene.start("Preloader");
    });
  }
}
