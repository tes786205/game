import { Scene } from "phaser";

export class MainMenu extends Scene {
  constructor() {
    super("MainMenu");
  }

  create() {
    this.add.image(400, 225, "background");

    this.add
      .text(400, 400, "Iniciar", {
        fontFamily: "Rubik Glitch",
        fontSize: 36,
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5);

    this.input.once("pointerdown", () => {
      this.scene.start("CharacterSelect");
    });
  }
}
