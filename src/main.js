import StartGame from "./game/main";
import { runMqttSpike } from "./net/mqttSpike";

document.addEventListener("DOMContentLoaded", () => {
  if (new URLSearchParams(window.location.search).has("mqtt-spike")) {
    runMqttSpike().catch((error) => {
      console.error("MQTT spike failed", error);
    });
    return;
  }

  StartGame("game-container");
});
