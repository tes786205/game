import {
  CHARACTERS,
  assertCharacter,
  claimIntentTopic,
  slotTopic,
  stateTopic,
} from "./session.js";

const DIRECTIONS = new Set(["up", "down", "left", "right"]);
const ANIMATIONS = new Set(["stopped", "walking", "running"]);
const STATES = new Set(["playing", "left"]);

function decodePayload(payload) {
  if (payload === null || payload === undefined) {
    return null;
  }
  const text = payload.toString();
  if (text.length === 0) {
    return null;
  }
  return JSON.parse(text);
}

export function createPose({ x, y, dir, anim, state = "playing" }) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Pose coordinates must be finite numbers");
  }
  if (!DIRECTIONS.has(dir)) {
    throw new Error(`Invalid pose direction: ${dir}`);
  }
  if (!ANIMATIONS.has(anim)) {
    throw new Error(`Invalid pose animation: ${anim}`);
  }
  if (!STATES.has(state)) {
    throw new Error(`Invalid player state: ${state}`);
  }
  return { x, y, dir, anim, state };
}

export function parsePose(payload) {
  const value = decodePayload(payload);
  if (!value) {
    throw new Error("Pose payload is empty");
  }
  return createPose(value);
}

export function parsePlayerState(payload) {
  const value = decodePayload(payload);
  if (!value || !STATES.has(value.state)) {
    throw new Error("Invalid player state payload");
  }
  if (value.state === "left") {
    return { state: "left" };
  }
  return createPose(value);
}

export function parseSlotClaim(payload) {
  const value = decodePayload(payload);
  if (
    !value ||
    typeof value.id !== "string" ||
    !CHARACTERS.includes(value.char) ||
    value.state !== "joined"
  ) {
    throw new Error("Invalid slot claim payload");
  }
  return { id: value.id, char: value.char, state: value.state };
}

export function parseClaimIntent(payload) {
  const value = decodePayload(payload);
  if (
    !value ||
    !CHARACTERS.includes(value.char) ||
    value.state !== "choosing" ||
    !Number.isFinite(value.requestedAt)
  ) {
    throw new Error("Invalid claim intent payload");
  }
  return {
    char: value.char,
    state: value.state,
    requestedAt: value.requestedAt,
  };
}

export async function publishPose(session, pose) {
  const value = createPose(pose);
  await session.publishJson(
    stateTopic(session.room, session.clientId),
    value,
    { qos: 0, retain: true },
  );
}

export async function publishLeft(session) {
  await session.publishJson(
    stateTopic(session.room, session.clientId),
    { state: "left" },
    { qos: 1, retain: true },
  );
}

export async function publishInitialPresence(session) {
  await publishPose(session, {
    x: 300,
    y: 225,
    dir: "down",
    anim: "stopped",
    state: "playing",
  });
}

export async function publishSlotClaim(session, character) {
  assertCharacter(character);
  await session.publishJson(
    slotTopic(session.room, character),
    { id: session.clientId, char: character, state: "joined" },
    { qos: 1, retain: true },
  );
}

export async function clearSlotClaim(session, character) {
  assertCharacter(character);
  await session.publish(slotTopic(session.room, character), "", {
    qos: 1,
    retain: true,
  });
}

export async function publishClaimIntent(
  session,
  character,
  requestedAt = Date.now(),
) {
  assertCharacter(character);
  await session.publishJson(
    claimIntentTopic(session.room, session.clientId),
    { char: character, state: "choosing", requestedAt },
    { qos: 1, retain: true },
  );
}

export async function clearClaimIntent(session, clientId) {
  await session.publish(claimIntentTopic(session.room, clientId), "", {
    qos: 1,
    retain: true,
  });
}

export function clearRetained(session, topic) {
  return session.publish(topic, "", { qos: 1, retain: true });
}
