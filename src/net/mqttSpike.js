import mqtt from "mqtt";
import {
  MQTT_BROKER_URL,
  generateClientId,
  generateRoomCode,
  stateTopic,
} from "./session.js";

const SPIKE_TIMEOUT_MS = 15000;

export function runMqttSpike() {
  const room = generateRoomCode();
  const clientId = generateClientId();
  const topic = stateTopic(room, clientId);
  const payload = JSON.stringify({
    x: 1,
    y: 2,
    dir: "down",
    anim: "stopped",
    state: "playing",
  });

  console.log("MQTT spike broker:", MQTT_BROKER_URL);
  console.log("MQTT spike topic:", topic);

  return new Promise((resolve, reject) => {
    let client;
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error("Timed out waiting for MQTT spike receipt"));
    }, SPIKE_TIMEOUT_MS);

    function finish(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      client?.end(true);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }

    try {
      client = mqtt.connect(MQTT_BROKER_URL, {
        clientId,
        clean: true,
        reconnectPeriod: 0,
        connectTimeout: SPIKE_TIMEOUT_MS,
      });
    } catch (error) {
      finish(error);
      return;
    }

    client.on("connect", () => {
      console.log("MQTT spike connect");
      client.subscribe(topic, { qos: 0 }, (subscribeError) => {
        if (subscribeError) {
          finish(subscribeError);
          return;
        }
        client.publish(topic, payload, { qos: 0 }, (publishError) => {
          if (publishError) {
            finish(publishError);
            return;
          }
          console.log("MQTT spike published", topic);
        });
      });
    });

    client.on("message", (receivedTopic, receivedPayload) => {
      if (receivedTopic === topic) {
        console.log(
          "MQTT spike subscription receipt",
          receivedPayload.toString(),
        );
        finish();
      }
    });
    client.on("error", finish);
  });
}
