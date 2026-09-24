import { Scene } from "phaser";
import { resolveCharacterAssignments } from "../../net/claims.js";
import {
  clearClaimIntent,
  parseClaimIntent,
  parsePlayerState,
  parseSlotClaim,
  publishClaimIntent,
  publishInitialPresence,
  publishLeft,
  publishSlotClaim,
} from "../../net/protocol.js";
import {
  CHARACTERS,
  ROOM_CODE_ALPHABET,
  createMqttSession,
  generateClientId,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  otherCharacter,
  playerClaimPattern,
  playerStatePattern,
  slotClaimPattern,
} from "../../net/session.js";

const ARBITRATION_DELAY_MS = 200;
const PAGE_CLIENT_ID = generateClientId();

function claimTimestamp() {
  return typeof performance !== "undefined" && performance.timeOrigin
    ? performance.timeOrigin + performance.now()
    : Date.now();
}

export class CharacterSelect extends Scene {
  constructor() {
    super("CharacterSelect");
  }

  create() {
    this.clientId = PAGE_CLIENT_ID;
    this.session = null;
    this.roomCode = null;
    this.desiredCharacter = null;
    this.selectedCharacter = null;
    this.roomInput = "";
    this.claims = new Map();
    this.intents = new Map();
    this.activeClientIds = new Set();
    this.removeMessageListener = null;
    this.removeSessionListeners = [];
    this.arbitrationTimer = null;
    this.arbitrationRunning = false;
    this.arbitrationQueued = false;
    this.startingGame = false;
    this.leaving = false;
    this.shuttingDown = false;
    this.inRoom = false;
    this.characterButtons = {};
    this.events.once("shutdown", this.shutdown, this);

    this.add.image(400, 225, "background");
    this.add
      .text(400, 55, "Jogar em dupla", {
        fontFamily: "Rubik Glitch",
        fontSize: 38,
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5);

    this.roomText = this.add
      .text(400, 120, "", {
        fontFamily: "Rubik Glitch",
        fontSize: 30,
        color: "#f4d35e",
        align: "center",
        backgroundColor: "#222222",
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.statusText = this.add
      .text(400, 390, "Crie uma sala ou entre com o código de um amigo.", {
        fontFamily: "Rubik Glitch",
        fontSize: 20,
        color: "#ffffff",
        align: "center",
        wordWrap: { width: 700 },
      })
      .setOrigin(0.5);

    this.showLobby();
  }

  clearUi() {
    this.ui?.removeAll(true);
    this.ui?.destroy();
  }

  showLobby() {
    this.clearUi();
    this.ui = this.add.container();

    this.addButtonToContainer(this.ui, 300, 260, "Criar sala", () => {
      this.roomCode = generateRoomCode();
      this.startRoom();
    });
    this.addButtonToContainer(this.ui, 500, 260, "Entrar com código", () => {
      this.showJoinInput();
    });
  }

  showJoinInput() {
    this.clearUi();
    this.ui = this.add.container();
    this.roomText.setVisible(true).setText("Digite o código da sala");
    this.statusText.setText(
      "Use quatro letras e números. Pressione Enter para entrar.",
    );

    this.input.keyboard.on("keydown", this.handleJoinKey, this);
    this.addButtonToContainer(this.ui, 650, 420, "Voltar", () => {
      this.input.keyboard.off("keydown", this.handleJoinKey, this);
      this.roomText.setVisible(false);
      this.showLobby();
    });
  }

  handleJoinKey(event) {
    if (event.key === "Backspace") {
      this.roomInput = this.roomInput.slice(0, -1);
    } else if (event.key === "Enter") {
      const room = normalizeRoomCode(this.roomInput);
      if (isValidRoomCode(room)) {
        this.input.keyboard.off("keydown", this.handleJoinKey, this);
        this.roomCode = room;
        this.startRoom();
      }
    } else {
      const character = String(event.key).toUpperCase();
      if (character.length === 1 && ROOM_CODE_ALPHABET.includes(character)) {
        this.roomInput = normalizeRoomCode(this.roomInput + character).slice(0, 4);
      }
    }

    this.roomText.setText(
      this.roomInput.length > 0
        ? `Código: ${this.roomInput}`
        : "Digite o código da sala",
    );
  }

  addButtonToContainer(container, x, y, label, callback) {
    const background = this.add.rectangle(x, y, 220, 58, 0x263238, 0.94);
    const text = this.add
      .text(x, y, label, {
        fontFamily: "Rubik Glitch",
        fontSize: 20,
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5);

    background.setInteractive({ useHandCursor: true });
    background.on("pointerdown", callback);
    container.add([background, text]);
    return { background, text };
  }

  async startRoom() {
    if (this.session || !isValidRoomCode(this.roomCode)) {
      return;
    }

    this.clearUi();
    this.ui = this.add.container();
    this.roomText.setVisible(true).setText(`Sala: ${this.roomCode}`);
    this.statusText.setText("Conectando ao broker...");

    const session = createMqttSession({
      room: this.roomCode,
      clientId: this.clientId,
    });
    this.session = session;

    this.removeSessionListeners.push(
      session.on("error", (error) => {
        console.error("MQTT session error", error);
        this.statusText.setText(`Erro de conexão: ${error.message}`);
      }),
      session.on("close", () => {
        if (!this.startingGame && !this.leaving) {
          this.statusText.setText(
            "Conexão encerrada. Atualize a página para tentar novamente.",
          );
        }
      }),
      session.on("connect", () => {
        if (this.inRoom) {
          publishInitialPresence(session).catch((error) => {
            console.error("Could not restore player presence", error);
          });
        }
      }),
    );

    this.removeMessageListener = session.onMessage((topic, payload) => {
      this.handleMessage(topic, payload);
    });

    try {
      await session.connect();
      await Promise.all([
        session.subscribe(slotClaimPattern(this.roomCode), { qos: 1 }),
        session.subscribe(playerClaimPattern(this.roomCode), { qos: 1 }),
        session.subscribe(playerStatePattern(this.roomCode), { qos: 0 }),
      ]);
      await publishInitialPresence(session);
      this.inRoom = true;
      this.showCharacterSelection();
    } catch (error) {
      console.error("Could not enter room", error);
      this.statusText.setText(`Não foi possível entrar na sala: ${error.message}`);
      await session.close(true);
      this.session = null;
    }
  }

  showCharacterSelection() {
    this.clearUi();
    this.ui = this.add.container();

    this.ui.add(this.add.image(300, 235, "tobias").setScale(1.5));
    this.ui.add(this.add.image(500, 235, "lola").setScale(1.5));

    CHARACTERS.forEach((character, index) => {
      const x = index === 0 ? 300 : 500;
      this.characterButtons[character] = this.addButtonToContainer(
        this.ui,
        x,
        335,
        character === "tobias" ? "Tobias" : "Lola",
        () => this.chooseCharacter(character),
      );
    });

    this.addButtonToContainer(this.ui, 680, 420, "Sair", () => {
      this.leaveAndReturnToMenu();
    });

    this.statusText.setText("Escolha. O jogo começa quando os dois reservarem.");
    this.updateSelectionLabels();
    this.maybeStartGame();
  }

  async chooseCharacter(character) {
    if (!this.session?.connected || this.startingGame || this.leaving) {
      return;
    }
    if (this.selectedCharacter && this.selectedCharacter !== character) {
      return;
    }

    const requestedAt = claimTimestamp();
    const intent = { char: character, requestedAt };
    this.desiredCharacter = character;
    this.intents.set(this.clientId, intent);
    this.updateSelectionLabels();
    this.scheduleArbitration();

    try {
      await publishClaimIntent(this.session, character, requestedAt);
      this.scheduleArbitration();
    } catch (error) {
      console.error("Could not publish character choice", error);
      this.statusText.setText(`Não foi possível enviar a escolha: ${error.message}`);
    }
  }

  handleMessage(topic, payload) {
    if (this.shuttingDown || this.startingGame || this.leaving) {
      return;
    }

    try {
      const parts = topic.split("/");
      if (parts[2] === "slot") {
        const character = parts[3];
        if (payload.length === 0) {
          this.claims.delete(character);
        } else {
          const claim = parseSlotClaim(payload);
          if (claim.char !== character) {
            throw new Error("Slot claim character does not match its topic");
          }
          this.claims.set(character, claim.id);
        }
        this.scheduleArbitration();
      } else if (parts[2] === "player" && parts[4] === "claim") {
        const clientId = parts[3];
        if (payload.length === 0) {
          this.intents.delete(clientId);
        } else {
          this.intents.set(clientId, parseClaimIntent(payload));
        }
        this.scheduleArbitration();
      } else if (parts[2] === "player" && parts[4] === "state") {
        const clientId = parts[3];
        const state = parsePlayerState(payload);
        if (state.state === "left") {
          this.handlePlayerLeft(clientId);
        } else {
          this.activeClientIds.add(clientId);
          this.scheduleArbitration();
        }
      }
    } catch (error) {
      console.warn("Ignored invalid MQTT message", topic, error);
    }

    this.updateSelectionLabels();
    this.maybeStartGame();
  }

  handlePlayerLeft(clientId) {
    this.activeClientIds.delete(clientId);
    this.intents.delete(clientId);
    for (const [character, ownerId] of this.claims.entries()) {
      if (ownerId === clientId) {
        this.claims.delete(character);
      }
    }
    if (this.claims.get(this.selectedCharacter) !== this.clientId) {
      this.selectedCharacter = null;
    }
    this.scheduleArbitration();
  }

  scheduleArbitration() {
    if (
      !this.session ||
      this.shuttingDown ||
      this.arbitrationTimer ||
      this.arbitrationRunning
    ) {
      if (this.arbitrationRunning) {
        this.arbitrationQueued = true;
      }
      return;
    }
    if (this.shuttingDown || this.startingGame || this.leaving) {
      return;
    }

    this.arbitrationTimer = this.time.delayedCall(ARBITRATION_DELAY_MS, () => {
      this.arbitrationTimer = null;
      this.runArbitration();
    });
  }

  async runArbitration() {
    if (this.shuttingDown || this.startingGame || this.leaving) {
      return;
    }
    if (this.arbitrationRunning) {
      this.arbitrationQueued = true;
      return;
    }

    this.arbitrationRunning = true;
    try {
      await this.arbitrateClaims();
    } catch (error) {
      if (!this.shuttingDown) {
        console.error("Could not arbitrate character claims", error);
        this.statusText.setText(
          `Não foi possível reservar o personagem: ${error.message}`,
        );
      }
    } finally {
      this.arbitrationRunning = false;
      if (this.arbitrationQueued) {
        this.arbitrationQueued = false;
        this.scheduleArbitration();
      }
    }
  }

  async arbitrateClaims() {
    if (
      !this.session ||
      this.shuttingDown ||
      this.startingGame ||
      this.leaving ||
      !this.desiredCharacter
    ) {
      return;
    }

    const assignments = resolveCharacterAssignments(
      this.intents,
      this.activeClientIds,
      this.claims,
    );
    const assignment = assignments.get(this.clientId);
    if (!assignment) {
      this.selectedCharacter = null;
      this.updateSelectionLabels();
      this.maybeStartGame();
      return;
    }

    if (assignment !== this.desiredCharacter) {
      const requestedAt = claimTimestamp();
      this.desiredCharacter = assignment;
      this.intents.set(this.clientId, { char: assignment, requestedAt });
      await publishClaimIntent(this.session, assignment, requestedAt);
      if (this.shuttingDown || this.leaving) {
        return;
      }
    }

    const previousCharacter = this.selectedCharacter;
    if (previousCharacter && previousCharacter !== assignment) {
      this.selectedCharacter = null;
    }

    const owner = this.claims.get(assignment);
    if (owner === this.clientId && this.activeClientIds.has(this.clientId)) {
      this.selectedCharacter = assignment;
    } else {
      this.selectedCharacter = null;
      if (!owner || !this.activeClientIds.has(owner)) {
        await publishSlotClaim(this.session, assignment);
        if (this.shuttingDown || this.leaving) {
          return;
        }
      }
    }

    this.updateSelectionLabels();
    this.maybeStartGame();
  }

  updateSelectionLabels() {
    CHARACTERS.forEach((character, index) => {
      const ownerId = this.claims.get(character);
      const liveOwnerId = this.activeClientIds.has(ownerId) ? ownerId : null;
      const name = index === 0 ? "Tobias" : "Lola";
      const suffix =
        liveOwnerId === this.clientId
          ? " (você)"
          : liveOwnerId
            ? " (ocupado)"
            : this.desiredCharacter === character && !this.selectedCharacter
              ? " (reservando)"
              : "";
      const button = this.characterButtons[character];
      if (!button) {
        return;
      }
      button.background.setAlpha(liveOwnerId && liveOwnerId !== this.clientId ? 0.55 : 1);
      button.text.setText(`${name}${suffix}`);
    });
  }

  maybeStartGame() {
    if (
      this.shuttingDown ||
      this.startingGame ||
      !this.session ||
      !this.selectedCharacter
    ) {
      return;
    }

    const tobiasOwner = this.claims.get("tobias");
    const lolaOwner = this.claims.get("lola");
    if (
      !tobiasOwner ||
      !lolaOwner ||
      tobiasOwner === lolaOwner ||
      !this.activeClientIds.has(tobiasOwner) ||
      !this.activeClientIds.has(lolaOwner) ||
      this.claims.get(this.selectedCharacter) !== this.clientId
    ) {
      return;
    }

    this.startingGame = true;
    this.statusText.setText("Personagens reservados. Entrando na sala...");
    const peer = tobiasOwner === this.clientId ? lolaOwner : tobiasOwner;
    this.scene.start("Game", {
      room: this.roomCode,
      clientId: this.clientId,
      char: this.selectedCharacter,
      peer,
      peerChar: otherCharacter(this.selectedCharacter),
      session: this.session,
    });
  }

  async leaveAndReturnToMenu() {
    if (this.leaving) {
      return;
    }
    this.leaving = true;
    this.statusText.setText("Saindo da sala...");
    await this.leaveSession();
    this.scene.start("MainMenu");
  }

  async leaveSession() {
    if (!this.session) {
      return;
    }

    const session = this.session;
    try {
      await publishLeft(session);
      await clearClaimIntent(session, this.clientId);
      await session.close(false);
    } catch (error) {
      console.error("Could not cleanly leave room", error);
      await session.close(true);
    }
  }

  shutdown() {
    this.shuttingDown = true;
    this.removeMessageListener?.();
    this.removeSessionListeners.forEach((removeListener) => removeListener());
    this.input.keyboard?.off("keydown", this.handleJoinKey, this);
    this.arbitrationTimer?.remove(false);

    if (this.session && !this.startingGame && !this.leaving) {
      this.leaving = true;
      this.leaveSession().catch((error) => {
        console.error("Could not close MQTT session", error);
      });
    }
  }
}
