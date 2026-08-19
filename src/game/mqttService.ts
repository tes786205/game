import mqtt from "mqtt";

const room =
  new URLSearchParams(window.location.search).get("room") ||
  Math.random().toString(16).substring(2, 5);
export const mqttTopic = `tes786205/${room}`;
export const mqttClientId = `player-${Math.random().toString(16).substring(2, 10)}`;

export const mqttService = mqtt.connect("wss://mqtt.k8s.sj.ifsc.edu.br", {
  clientId: mqttClientId,
});

mqttService.on("connect", () => {
  console.log(`Connected to broker!`);
});

mqttService.on("error", (err) => {
  console.error(`MQTT connection error: ${err.message}`);
});

mqttService.on("close", () => {
  console.warn(`MQTT connection closed.`);
});
