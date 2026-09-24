import mqtt from "mqtt";

export const DEFAULT_MQTT_BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
export const MQTT_BROKER_URL =
  process.env.MQTT_BROKER_URL || DEFAULT_MQTT_BROKER_URL;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CHARACTERS = ["tobias", "lola"];

const VALID_ROOM_CODE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{4}$`);
const VALID_CHARACTER = new Set(CHARACTERS);

export function generateClientId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function generateRoomCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
}

export function normalizeRoomCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .split("")
    .filter((character) => ROOM_CODE_ALPHABET.includes(character))
    .join("");
}

export function isValidRoomCode(value) {
  return VALID_ROOM_CODE.test(value);
}

export function assertCharacter(character) {
  if (!VALID_CHARACTER.has(character)) {
    throw new Error(`Unknown character: ${character}`);
  }
  return character;
}

export function otherCharacter(character) {
  assertCharacter(character);
  return character === "tobias" ? "lola" : "tobias";
}

export function slotTopic(room, character) {
  assertCharacter(character);
  return `game/${room}/slot/${character}`;
}

export function playerTopic(room, clientId, channel) {
  return `game/${room}/player/${clientId}/${channel}`;
}

export function claimIntentTopic(room, clientId) {
  return playerTopic(room, clientId, "claim");
}

export function stateTopic(room, clientId) {
  return playerTopic(room, clientId, "state");
}

export function slotClaimPattern(room) {
  return `game/${room}/slot/+`;
}

export function playerClaimPattern(room) {
  return `game/${room}/player/+/claim`;
}

export function playerStatePattern(room) {
  return `game/${room}/player/+/state`;
}

function createEventBus() {
  const listeners = new Map();

  return {
    on(event, listener) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(listener);
      return () => listeners.get(event)?.delete(listener);
    },
    emit(event, ...args) {
      listeners.get(event)?.forEach((listener) => listener(...args));
    },
  };
}

export function createMqttSession({
  room,
  clientId = generateClientId(),
  brokerUrl = MQTT_BROKER_URL,
} = {}) {
  if (!isValidRoomCode(room)) {
    throw new Error(`Invalid room code: ${room}`);
  }

  const events = createEventBus();
  const state = stateTopic(room, clientId);
  const will = Object.freeze({
    topic: state,
    payload: JSON.stringify({ state: "left" }),
    qos: 1,
    retain: true,
  });
  let client = null;
  let connected = false;
  let connecting = null;
  let closePromise = null;

  console.log("MQTT broker:", brokerUrl);

  const session = {
    room,
    clientId,
    brokerUrl,
    will,
    stateTopic: state,

    get connected() {
      return connected;
    },

    connect() {
      if (connected) {
        return Promise.resolve(session);
      }
      if (connecting) {
        return connecting;
      }

      connecting = new Promise((resolve, reject) => {
        let settled = false;

        try {
          client = mqtt.connect(brokerUrl, {
            clientId,
            clean: true,
            keepalive: 30,
            reconnectPeriod: 2000,
            connectTimeout: 10000,
            resubscribe: true,
            will,
          });
          client.on("message", (topic, payload) => {
            events.emit("message", topic, payload);
          });
        } catch (error) {
          reject(error);
          return;
        }

        client.on("connect", () => {
          connected = true;
          events.emit("connect");
          if (!settled) {
            settled = true;
            resolve(session);
          }
        });
        client.on("reconnect", () => events.emit("reconnect"));
        client.on("offline", () => events.emit("offline"));
        client.on("close", () => {
          connected = false;
          events.emit("close");
          if (!settled) {
            settled = true;
            reject(new Error("MQTT connection closed before CONNACK"));
          }
        });
        client.on("error", (error) => {
          events.emit("error", error);
          if (!settled) {
            settled = true;
            reject(error);
          }
        });
      });

      return connecting;
    },

    subscribe(topic, options = { qos: 0 }) {
      return new Promise((resolve, reject) => {
        if (!client || !connected) {
          reject(new Error("MQTT session is not connected"));
          return;
        }
        client.subscribe(topic, options, (error, grants) => {
          if (error) {
            reject(error);
            return;
          }
          if (grants?.some((grant) => grant.qos >= 128)) {
            reject(new Error(`Broker rejected subscription to ${topic}`));
            return;
          }
          resolve();
        });
      });
    },

    publish(topic, payload, { qos = 0, retain = false } = {}) {
      return new Promise((resolve, reject) => {
        if (!client) {
          reject(new Error("MQTT session is not connected"));
          return;
        }
        if (!connected) {
          if (qos === 0) {
            resolve(false);
          } else {
            reject(new Error("MQTT session is not connected"));
          }
          return;
        }
        client.publish(topic, payload, { qos, retain }, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },

    async publishJson(topic, value, options) {
      await session.publish(topic, JSON.stringify(value), options);
    },

    on(event, listener) {
      return events.on(event, listener);
    },

    onMessage(listener) {
      return events.on("message", listener);
    },

    close(force = false) {
      if (closePromise) {
        return closePromise;
      }
      if (!client) {
        return Promise.resolve();
      }

      const activeClient = client;
      client = null;
      connected = false;
      connecting = null;
      const gracefulClose = activeClient.endAsync(force);
      let forceCloseTimer;
      const forceCloseAfterTimeout = new Promise((resolve) => {
        forceCloseTimer = setTimeout(() => {
          activeClient.end(true);
          resolve();
        }, 5000);
      });
      closePromise = Promise.race([gracefulClose, forceCloseAfterTimeout]).finally(
        () => {
          clearTimeout(forceCloseTimer);
          closePromise = null;
        },
      );
      return closePromise;
    },
  };

  return session;
}
