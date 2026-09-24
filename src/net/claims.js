import { CHARACTERS } from "./session.js";

export function resolveCharacterAssignments(
  intents,
  activeClientIds,
  claims = new Map(),
) {
  const active = new Set(activeClientIds);
  const assignments = new Map();
  const claimedCharacters = new Set();
  const compareCandidates = (first, second) => {
    const timeDifference =
      intents.get(first).requestedAt - intents.get(second).requestedAt;
    return timeDifference || first.localeCompare(second);
  };

  // A live retained claim wins immediately. In particular, do not require a
  // claim-intent message here: a late joiner can see the retained slot before
  // the original publisher's intent message arrives.
  CHARACTERS.forEach((character) => {
    const owner = claims.get(character);
    if (owner && active.has(owner)) {
      assignments.set(owner, character);
      claimedCharacters.add(character);
    }
  });

  // Fill unclaimed slots from the clients that are actively choosing. The
  // earliest request wins; the client id breaks exact timestamp ties.
  CHARACTERS.forEach((character) => {
    if (claimedCharacters.has(character)) {
      return;
    }

    const candidates = [...active]
      .filter(
        (clientId) =>
          !assignments.has(clientId) && intents.get(clientId)?.char === character,
      )
      .sort(compareCandidates);
    const winner = candidates[0];
    if (winner) {
      assignments.set(winner, character);
      claimedCharacters.add(character);
    }
  });

  // If both clients asked for the same character, the unassigned client gets
  // the remaining character. This is the fallback for the brief interval in
  // which both retained claim publishes are in flight.
  CHARACTERS.forEach((character) => {
    if (claimedCharacters.has(character)) {
      return;
    }

    const fallback = [...active]
      .filter((clientId) => !assignments.has(clientId) && intents.has(clientId))
      .sort(compareCandidates)[0];
    if (fallback) {
      assignments.set(fallback, character);
      claimedCharacters.add(character);
    }
  });

  return assignments;
}
