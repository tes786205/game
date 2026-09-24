import assert from "node:assert/strict";
import { resolveCharacterAssignments } from "../src/net/claims.js";
import { interpolateSnapshots } from "../src/net/interpolation.js";
import {
  createMqttSession,
  generateClientId,
  generateRoomCode,
  playerStatePattern,
  slotClaimPattern,
  slotTopic,
  stateTopic,
} from "../src/net/session.js";
import {
  clearSlotClaim,
  parsePlayerState,
  parsePose,
  parseSlotClaim,
  publishInitialPresence,
  publishLeft,
  publishSlotClaim,
} from "../src/net/protocol.js";

const room = generateRoomCode();
const clientId = generateClientId();
const session = createMqttSession({ room, clientId });
const localStateTopic = stateTopic(room, clientId);
const localSlotTopic = slotTopic(room, "tobias");
const timeoutMs = 15000;
let subscriber;

const simultaneousClaims = resolveCharacterAssignments(
  new Map([
    ["client-z", { char: "tobias", requestedAt: 1 }],
    ["client-a", { char: "tobias", requestedAt: 2 }],
  ]),
  ["client-z", "client-a"],
);
assert.deepEqual(
  [...simultaneousClaims.entries()].sort(),
  [
    ["client-a", "lola"],
    ["client-z", "tobias"],
  ],
);
const lateClaims = resolveCharacterAssignments(
  new Map([
    ["client-a", { char: "tobias", requestedAt: 1 }],
    ["client-b", { char: "tobias", requestedAt: 2 }],
  ]),
  ["client-a", "client-b"],
  new Map([["tobias", "client-a"]]),
);
assert.equal(lateClaims.get("client-a"), "tobias");
assert.equal(lateClaims.get("client-b"), "lola");
assert.deepEqual(
  interpolateSnapshots(
    [
      { x: 0, y: 10, receivedAt: 100 },
      { x: 100, y: 110, receivedAt: 200 },
    ],
    150,
  ),
  { x: 50, y: 60 },
);

function waitForTopic(activeSession, expectedTopic, parse) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      offMessage();
      reject(new Error(`Timed out waiting for ${expectedTopic}`));
    }, timeoutMs);
    const offMessage = activeSession.onMessage((topic, payload) => {
      if (topic !== expectedTopic) {
        return;
      }
      clearTimeout(timeout);
      offMessage();
      resolve(parse(payload));
    });
  });
}

function waitForPlayerLeft(activeSession, expectedTopic) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      offMessage();
      reject(new Error(`Timed out waiting for leave on ${expectedTopic}`));
    }, timeoutMs);
    const offMessage = activeSession.onMessage((topic, payload) => {
      if (topic !== expectedTopic) {
        return;
      }
      const state = parsePlayerState(payload);
      if (state.state === "left") {
        clearTimeout(timeout);
        offMessage();
        resolve(state);
      }
    });
  });
}

try {
  assert.equal(session.will.topic, localStateTopic);
  assert.deepEqual(JSON.parse(session.will.payload), { state: "left" });
  assert.equal(session.will.retain, true);
  console.log("topics", localSlotTopic, localStateTopic);
  console.log("will", session.will);

  await session.connect();
  await session.subscribe(localStateTopic, { qos: 0 });
  await session.subscribe(localSlotTopic, { qos: 1 });

  const poseMessage = waitForTopic(session, localStateTopic, parsePose);
  await publishInitialPresence(session);
  assert.deepEqual(await poseMessage, {
    x: 300,
    y: 225,
    dir: "down",
    anim: "stopped",
    state: "playing",
  });

  const claimMessage = waitForTopic(session, localSlotTopic, parseSlotClaim);
  await publishSlotClaim(session, "tobias");
  assert.deepEqual(await claimMessage, {
    id: clientId,
    char: "tobias",
    state: "joined",
  });

  subscriber = createMqttSession({ room });
  const retainedMessage = waitForTopic(
    subscriber,
    localSlotTopic,
    parseSlotClaim,
  );
  await subscriber.connect();
  await subscriber.subscribe(slotClaimPattern(room), { qos: 1 });
  assert.equal((await retainedMessage).id, clientId);

  const willMessage = waitForPlayerLeft(subscriber, localStateTopic);
  await subscriber.subscribe(playerStatePattern(room), { qos: 0 });
  await clearSlotClaim(session, "tobias");
  await session.close(true);
  assert.deepEqual(await willMessage, { state: "left" });
  console.log("MQTT session verification passed");
} finally {
  if (subscriber) {
    await subscriber.close(true);
  }
  if (session.clientId) {
    await publishLeft(session).catch(() => {});
    await clearSlotClaim(session, "tobias").catch(() => {});
    await session.close(false);
  }
}
