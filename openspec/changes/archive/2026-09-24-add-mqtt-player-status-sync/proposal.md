# Proposal

## Why

The game "Os Caçadores da Arca Perdida" is designed as a two-player co-op
experience (Tobias digs, Lola runs with the flashlight), but today it is
single-player only: there is no way for two browsers to end up in the same
game, and no way for one player's position/animation to be visible to the
other. This change adds the networking foundation — MQTT over WebSocket —
so two players can pair up and see each other move in real time.

## What Changes

- **Room pairing**: a new scene between `MainMenu` and `Game` where players
  create or join a game with a room code, then select a character. Character
  claims are arbitrated through the broker (first-come-first-served; the
  second player gets the remaining character).
- **Local status publish**: the local player's pose (`x`, `y`, orientation,
  animation, state) is published to `game/<room-code>/player/<id>/state`
  at roughly 10–15 Hz, QoS 0 (latest-wins, lossy OK).
- **Remote status rendering**: each client subscribes to the other player's
  state topic and drives a remote sprite from the received snapshots,
  interpolating (lerping) position between the last two snapshots while
  snapping orientation and animation immediately.
- **Presence**: retained slot messages at select time; a Last Will message
  marks a player as left and frees their slot when a client disconnects
  ungracefully. The remote sprite is removed on disconnect.
- **Broker configuration**: broker URL comes from an environment variable
  (inlined at build time by Parcel) with a public test broker as the
  default value. No authentication is in scope — rooms are not private and
  carry no sensitive data.
- **Dependency**: add an MQTT-over-WebSocket client (`mqtt.js` or
  equivalent) to the browser bundle.

Explicit non-goals (deferred to a later change):

- The world/events plane — dig results, cell reveals, zombies, the ark,
  flashlight scares — is **not** in this change. The topic namespace
  `game/<room-code>/world/...` is reserved for it, unused for now.
- Disconnect mid-game policy (remove sprite vs. end game) and rejoin with
  the same code after refresh are left as open decisions.
- Gameplay mechanics themselves (shovel, running, flashlight) are not
  implemented here; only status transport for movement/animation that
  already exists.

## Capabilities

### New Capabilities

- `multiplayer/pairing`: room-code rendezvous — creating/joining a room,
  claiming a character slot, and knowing when both players are ready to
  start.
- `multiplayer/status-sync`: continuous real-time exchange of player pose —
  publishing local status, receiving the peer's status, presence on
  disconnect, and rendering the remote player smoothly.

### Modified Capabilities

(none — the project has no existing specs; this is the first capability set)

## Impact

- **Source**: `src/game/scenes/` — new select/pair scene inserted into the
  scene flow in `src/game/main.js`; `src/game/scenes/Game.js` reworked to
  role-aware rendering (local sprite + remote sprite, interpolation loop)
  and the `tobias x lola -> GameOver` collider reinterpreted.
- **Dependencies**: `package.json` gains an MQTT client; `.env` (or
  equivalent) supplies the broker URL to Parcel via `process.env`.
- **Config/ops**: default points at a public test broker; swapping in a
  private broker later is a config change only.
- **Risks**: `mqtt.js` bundling under Parcel 2 may need bundler hints
  (browser field/ws shims) — verify early as a spike.
