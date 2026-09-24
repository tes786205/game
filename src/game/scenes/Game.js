import { Scene } from "phaser";
import { interpolateSnapshots } from "../../net/interpolation.js";
import {
  clearClaimIntent,
  parsePlayerState,
  publishLeft,
  publishPose,
} from "../../net/protocol.js";
import { otherCharacter, stateTopic } from "../../net/session.js";

const POSE_INTERVAL_MS = 80;
const INTERPOLATION_DELAY_MS = 100;

export class Game extends Scene {
  constructor() {
    super("Game");
  }

  init(data = {}) {
    this.room = data.room;
    this.clientId = data.clientId;
    this.character = data.char;
    this.peer = data.peer;
    this.peerCharacter =
      data.peerChar || (this.character && otherCharacter(this.character));
    this.session = data.session;
    this.poseAccumulator = 0;
    this.snapshots = [];
    this.remotePlayer = null;
    this.remoteCollider = null;
    this.removeMessageListener = null;
    this.leaving = false;
    this.shuttingDown = false;
  }

  create() {
    this.events.once("shutdown", this.shutdown, this);
    if (!this.session || !this.room || !this.character || !this.peer) {
      this.scene.start("CharacterSelect");
      return;
    }

    this.lights.enable().setAmbientColor(0x666666);

    this.owlSound = this.sound.add("owl");
    this.cemeterySound = this.sound.add("cemetery");
    this.cemeterySound.play({ loop: true, volume: 0.5 });
    this.ownSoundLoop = this.time.addEvent({
      delay: Math.floor(Math.random() * 10000) + 5000,
      callback: () => {
        this.owlSound.play();
        console.log("Owl sound played", this.ownSoundLoop.delay);
      },
      loop: true,
    });

    this.createMap();
    this.createAnimations("tobias");
    this.createAnimations("lola");

    this.player = this.physics.add
      .sprite(300, 225, this.character, 14)
      .setLighting(true);
    this.player.animation = "stopped";
    this.player.orientation = "down";
    this.player.anims.play(`${this.character}-stopped-down`, true);

    this.backlight = this.lights
      .addLight(this.player.x, this.player.y, 100)
      .setColor(0xffffff)
      .setIntensity(1.5);
    this.cameras.main.startFollow(this.player);

    this.createJoystick();
    this.createLeaveButton();
    this.setupRemotePlayer().catch((error) => {
      console.error("Could not subscribe to remote player", error);
    });
  }

  createMap() {
    this.tilemap = this.make.tilemap({ key: "map" });
    this.tilesetGrass = this.tilemap.addTilesetImage("grass");
    this.tilesetShadows = this.tilemap.addTilesetImage("shadows");
    this.tilesetItems = this.tilemap.addTilesetImage("items");

    this.layerFloor = this.tilemap
      .createLayer("floor", [this.tilesetGrass])
      .setLighting(true);
    this.layerShadows = this.tilemap
      .createLayer("shadows", [this.tilesetShadows])
      .setLighting(true);
    this.layerObjects = this.tilemap
      .createLayer("objects", [this.tilesetItems])
      .setLighting(true);
    this.layerObjects.setCollisionByProperty({ collides: true });
  }

  createAnimations(texture) {
    const animations = {
      "stopped-up": { start: 28, end: 28, frameRate: 1, repeat: 0 },
      "stopped-down": { start: 14, end: 14, frameRate: 1, repeat: 0 },
      "stopped-left": { start: 36, end: 36, frameRate: 1, repeat: 0 },
      "stopped-right": { start: 52, end: 52, frameRate: 1, repeat: 0 },
      "digging-up": { start: 28, end: 35, frameRate: 10, repeat: 3 },
      "digging-down": { start: 44, end: 51, frameRate: 10, repeat: 3 },
      "digging-left": { start: 36, end: 43, frameRate: 10, repeat: 3 },
      "digging-right": { start: 52, end: 59, frameRate: 10, repeat: 3 },
      "walking-up": { start: 60, end: 68, frameRate: 10, repeat: -1 },
      "walking-down": { start: 78, end: 86, frameRate: 10, repeat: -1 },
      "walking-left": { start: 69, end: 77, frameRate: 10, repeat: -1 },
      "walking-right": { start: 87, end: 95, frameRate: 10, repeat: -1 },
      "running-up": { start: 236, end: 243, frameRate: 10, repeat: -1 },
      "running-down": { start: 252, end: 259, frameRate: 10, repeat: -1 },
      "running-left": { start: 244, end: 251, frameRate: 10, repeat: -1 },
      "running-right": { start: 260, end: 267, frameRate: 10, repeat: -1 },
    };

    Object.entries(animations).forEach(([name, definition]) => {
      const key = `${texture}-${name}`;
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(texture, {
            start: definition.start,
            end: definition.end,
          }),
          frameRate: definition.frameRate,
          repeat: definition.repeat,
        });
      }
    });
  }

  createJoystick() {
    this.joystick = this.plugins.get("rexVirtualJoystick").add(this, {
      x: 100,
      y: 350,
      radius: 50,
      base: this.add.circle(120, 360, 50, 0x888888),
      thumb: this.add.circle(120, 360, 25, 0xcccccc),
    });

    this.joystick.on("update", () => {
      const cursorKeys = this.joystick.createCursorKeys();

      if (this.joystick.force > 25) {
        this.player.animation = "running";
        this.player.velocity = 200;
      } else if (this.joystick.force > 0) {
        this.player.animation = "walking";
        this.player.velocity = 100;
      } else {
        this.player.animation = "stopped";
        this.player.setVelocity(0, 0);
      }

      if (cursorKeys.up.isDown) {
        this.player.orientation = "up";
        this.player.setVelocityY(-this.player.velocity);
      }
      if (cursorKeys.down.isDown) {
        this.player.orientation = "down";
        this.player.setVelocityY(this.player.velocity);
      }
      if (cursorKeys.left.isDown) {
        this.player.orientation = "left";
        this.player.setVelocityX(-this.player.velocity);
      }
      if (cursorKeys.right.isDown) {
        this.player.orientation = "right";
        this.player.setVelocityX(this.player.velocity);
      }

      this.player.anims.play(
        `${this.character}-${this.player.animation}-${this.player.orientation}`,
        true,
      );
    });

    this.physics.add.collider(this.player, this.layerObjects);
  }

  createLeaveButton() {
    const background = this.add
      .rectangle(730, 415, 100, 42, 0x263238, 0.9)
      .setScrollFactor(0);
    const label = this.add
      .text(730, 415, "Sair", {
        fontFamily: "Rubik Glitch",
        fontSize: 18,
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    background.setInteractive({ useHandCursor: true });
    background.on("pointerdown", () => this.leaveAndReturnToMenu());
  }

  async setupRemotePlayer() {
    const topic = stateTopic(this.room, this.peer);
    this.removeMessageListener = this.session.onMessage((receivedTopic, payload) => {
      if (this.shuttingDown || this.leaving || receivedTopic !== topic) {
        return;
      }

      try {
        const state = parsePlayerState(payload);
        if (state.state === "left") {
          this.removeRemotePlayer();
        } else {
          this.receiveRemotePose(state);
        }
      } catch (error) {
        console.warn("Ignored invalid remote player state", error);
      }
    });

    try {
      await this.session.subscribe(topic, { qos: 0 });
    } catch (error) {
      this.removeMessageListener();
      this.removeMessageListener = null;
      throw error;
    }

    if (!this.scene.isActive()) {
      this.removeMessageListener();
      this.removeMessageListener = null;
    }
  }

  receiveRemotePose(pose) {
    if (!this.remotePlayer) {
      this.remotePlayer = this.physics.add
        .sprite(pose.x, pose.y, this.peerCharacter, 14)
        .setLighting(true);
      this.remoteCollider = this.physics.add.collider(
        this.remotePlayer,
        this.layerObjects,
      );
    }

    this.remotePlayer.anims.play(
      `${this.peerCharacter}-${pose.anim}-${pose.dir}`,
      true,
    );

    this.snapshots.push({
      x: pose.x,
      y: pose.y,
      receivedAt: performance.now(),
    });
    this.snapshots.sort((first, second) => first.receivedAt - second.receivedAt);
    this.snapshots = this.snapshots.slice(-2);
  }

  interpolateRemotePlayer() {
    if (!this.remotePlayer) {
      return;
    }

    const position = interpolateSnapshots(
      this.snapshots,
      performance.now() - INTERPOLATION_DELAY_MS,
    );
    if (position) {
      this.remotePlayer.setPosition(position.x, position.y);
    }
  }

  removeRemotePlayer() {
    this.snapshots = [];
    if (!this.remotePlayer) {
      return;
    }
    if (this.remoteCollider && this.physics?.world) {
      this.physics.world.removeCollider(this.remoteCollider);
    }
    if (this.remotePlayer?.scene) {
      this.remotePlayer.destroy();
    }
    this.remotePlayer = null;
    this.remoteCollider = null;
  }

  publishCurrentPose() {
    publishPose(this.session, {
      x: this.player.x,
      y: this.player.y,
      dir: this.player.orientation,
      anim: this.player.animation,
      state: "playing",
    }).catch((error) => {
      console.warn("Could not publish local pose", error);
    });
  }

  update(time, delta) {
    if (!this.player || !this.backlight) {
      return;
    }

    if (this.leaving) {
      return;
    }

    this.backlight.x = this.player.x;
    this.backlight.y = this.player.y;
    this.interpolateRemotePlayer();

    this.poseAccumulator += delta;
    if (this.poseAccumulator >= POSE_INTERVAL_MS) {
      this.poseAccumulator %= POSE_INTERVAL_MS;
      this.publishCurrentPose();
    }
  }

  async leaveAndReturnToMenu() {
    if (this.leaving) {
      return;
    }
    this.leaving = true;
    await this.leaveSession();
    this.scene.start("MainMenu");
  }

  async leaveSession() {
    this.ownSoundLoop?.remove(false);
    this.owlSound?.stop();
    this.cemeterySound?.stop();
    this.owlSound?.destroy();
    this.cemeterySound?.destroy();
    this.owlSound = null;
    this.cemeterySound = null;

    if (!this.session) {
      return;
    }

    const session = this.session;
    try {
      await publishLeft(session);
      await clearClaimIntent(session, this.clientId);
      await session.close(false);
    } catch (error) {
      console.error("Could not cleanly leave game", error);
      await session.close(true);
    }
  }

  shutdown() {
    this.shuttingDown = true;
    this.removeMessageListener?.();
    this.removeMessageListener = null;
    this.removeRemotePlayer();
    this.ownSoundLoop?.remove(false);
    this.owlSound?.stop();
    this.cemeterySound?.stop();
    this.owlSound?.destroy();
    this.cemeterySound?.destroy();
    this.owlSound = null;
    this.cemeterySound = null;

    if (this.session && !this.leaving) {
      this.leaveSession().catch((error) => {
        console.error("Could not close game MQTT session", error);
      });
    }
  }
}
