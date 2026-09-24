import assert from "node:assert/strict";
import {
  createMqttSession,
  generateClientId,
  generateRoomCode,
  playerStatePattern,
  slotClaimPattern,
} from "../src/net/session.js";
import {
  clearClaimIntent,
  clearSlotClaim,
  parsePlayerState,
  parseSlotClaim,
  publishClaimIntent,
  publishInitialPresence,
  publishSlotClaim,
} from "../src/net/protocol.js";

const timeoutMs = 15000;
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitUntil(predicate, description) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await wait(50);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function createParticipant(room, clientId = generateClientId()) {
  const session = createMqttSession({ room, clientId });
  const state = {
    session,
    clientId,
    claims: new Map(),
    activeClientIds: new Set(),
  };

  session.onMessage((topic, payload) => {
    const parts = topic.split("/");
    if (parts[1] === "slot") {
      const character = parts[3];
      if (payload.length === 0) {
        state.claims.delete(character);
      } else {
        const claim = parseSlotClaim(payload);
        if (claim.char === character) {
          state.claims.set(character, claim.id);
        }
      }
    } else if (parts[2] === "player" && parts[4] === "state") {
      const playerState = parsePlayerState(payload);
      if (playerState.state === "left") {
        state.activeClientIds.delete(parts[3]);
      } else {
        state.activeClientIds.add(parts[3]);
      }
    }
  });

  await session.connect();
  await Promise.all([
    session.subscribe(slotClaimPattern(room), { qos: 1 }),
    session.subscribe(playerStatePattern(room), { qos: 0 }),
  ]);
  await publishInitialPresence(session);
  state.activeClientIds.add(clientId);
  return state;
}

async function closeParticipant(participant) {
  const { session } = participant;
  await clearSlotClaim(session, "tobias").catch(() => {});
  await clearSlotClaim(session, "lola").catch(() => {});
  await clearClaimIntent(session, participant.clientId).catch(() => {});
  await session.close(true).catch(() => {});
}

const room = generateRoomCode();
const participants = [];
try {
  const first = await createParticipant(room);
  const second = await createParticipant(room);
  participants.push(first, second);

  await publishClaimIntent(first.session, "tobias");
  await publishSlotClaim(first.session, "tobias");
  await waitUntil(() => second.claims.get("tobias") === first.clientId, "the first claim to reach the second client");

  await publishClaimIntent(second.session, "lola");
  await publishSlotClaim(second.session, "lola");
  await waitUntil(
    () =>
      first.claims.get("tobias") === first.clientId &&
      first.claims.get("lola") === second.clientId,
    "different-character claims",
  );
  console.log("pairing: different characters retained and visible");

  const lateJoiner = await createParticipant(room);
  participants.push(lateJoiner);
  await waitUntil(
    () => lateJoiner.claims.get("tobias") === first.clientId,
    "late joiner to see the retained claim",
  );
  console.log("pairing: late joiner sees retained claims");

  const loser = second;
  assert.notEqual(loser.clientId, first.clientId);
  await clearSlotClaim(loser.session, "lola");
  await waitUntil(() => !first.claims.has("lola"), "the released claim");

  await clearSlotClaim(first.session, "tobias");
  await waitUntil(() => !second.claims.has("tobias"), "the cleared first claim");

  await publishClaimIntent(first.session, "tobias");
  await publishSlotClaim(first.session, "tobias");
  await publishClaimIntent(second.session, "tobias");
  await publishSlotClaim(second.session, "tobias");
  await wait(500);

  const owner = first.claims.get("tobias");
  assert.ok(
    owner === first.clientId || owner === second.clientId,
    "one participant owns the collided slot",
  );
  const collisionLoser = owner === first.clientId ? second : first;
  await publishSlotClaim(collisionLoser.session, "lola");
  await waitUntil(
    () =>
      first.claims.get("tobias") !== first.claims.get("lola") &&
      first.claims.has("lola"),
    "the collision fallback claim",
  );
  assert.notEqual(first.claims.get("tobias"), first.claims.get("lola"));
  console.log("pairing: same-character collision converges to one of each");

  const closed = collisionLoser;
  const observer = owner === first.clientId ? second : first;
  await closed.session.close(true);
  await waitUntil(
    () =>
      !observer.activeClientIds.has(closed.clientId) &&
      ![...observer.claims.values()].includes(closed.clientId),
    "Last Will left state",
  );
  console.log("pairing: Last Will removes presence and releases the slot");
  console.log(`pairing verification passed (room ${room})`);
} finally {
  for (const participant of participants) {
    await closeParticipant(participant).catch(() => {});
  }
}
