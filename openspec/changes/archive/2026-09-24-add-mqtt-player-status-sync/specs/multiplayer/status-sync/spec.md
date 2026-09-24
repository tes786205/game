# Spec Delta

## Purpose

Keeps both players visible to each other in a shared room by publishing the
local player's pose to an MQTT broker over WebSocket and rendering the remote
player's pose locally, including presence when a player leaves.

## ADDED Requirements

### Requirement: Local pose is published while playing
While the game scene is running, the system SHALL publish the local player's
pose to topic `game/<room-code>/player/<client-id>/state` at a rate between
10 and 15 messages per second using MQTT QoS 0.

#### Scenario: Moving player publishes poses
- **WHEN** the local player moves with the joystick in a paired room
- **THEN** pose messages for the local player appear on that room's state
  topic at 10-15 messages per second

#### Scenario: Stationary player still publishes
- **WHEN** the local player stands still in a paired room for 10 seconds
- **THEN** pose messages continue to be published at the same rate, with the
  animation value `stopped`

### Requirement: Pose payload contract
Each state message SHALL be a JSON object containing: `x` and `y` as numbers
in world coordinates, `dir` as one of `up`, `down`, `left`, `right`, `anim`
as one of `stopped`, `walking`, `running`, and `state` as one of `playing`,
`left`.

#### Scenario: Receiving client parses a pose
- **WHEN** a client receives a state message from the other player
- **THEN** it can read numeric `x`/`y`, a valid `dir`, a valid `anim`, and a
  valid `state` from the message without additional requests

### Requirement: Remote player is rendered from received poses
On the first received state message with `state` `playing`, the system SHALL
create a remote player sprite using the other player's claimed character, and
on every subsequent message SHALL move that sprite by interpolating position
between the previously received and the newly received pose, while applying
`dir` and `anim` immediately.

#### Scenario: Remote player moves smoothly
- **WHEN** the other player moves and their state messages arrive
- **THEN** the remote sprite moves smoothly between received positions
  without teleporting, and plays the other player's current animation and
  faces their current direction

#### Scenario: Remote player appears at first message
- **WHEN** a client receives the first `playing` state message in a room
- **THEN** a sprite of the other player's character appears in the game
  scene at the received position

### Requirement: A leaving player is removed from the scene
The system SHALL configure a Last Will message on the broker connection so
that an ungraceful disconnect publishes `{"state":"left"}` on that player's
state topic, and a client receiving a state message with `state` `left`
SHALL remove the remote player's sprite from the scene.

#### Scenario: Other player's tab is closed
- **WHEN** the other player's browser crashes or their tab is closed without
  a graceful shutdown
- **THEN** the broker publishes the `left` state on their behalf and the
  remaining client removes the remote sprite from the game scene

#### Scenario: Graceful leave
- **WHEN** a player leaves the game through the normal flow
- **THEN** their client publishes `{"state":"left"}` before closing and the
  other client removes the remote sprite the same way

### Requirement: Broker endpoint comes from configuration
The system SHALL read the MQTT broker WebSocket URL from an environment
variable at build time, SHALL fall back to a public test broker when the
variable is not set, and SHALL connect without credentials.

#### Scenario: Default broker
- **WHEN** the game is built without the broker environment variable set
- **THEN** the client connects to the configured public test broker

#### Scenario: Overridden broker
- **WHEN** the game is built with the broker environment variable set to
  another WebSocket endpoint
- **THEN** the client connects to that endpoint instead, with no code change

### Requirement: Messages stay in the room's reserved namespaces
Pairing claim messages SHALL use topics under `game/<room-code>/slot/`, and
status-sync and presence messages SHALL use topics under
`game/<room-code>/player/`. The namespace `game/<room-code>/world/` SHALL
remain unused so it is available for future game-world events.

#### Scenario: Topic confinement
- **WHEN** any message is published by pairing or status sync
- **THEN** its topic begins with either `game/<room-code>/slot/` or
  `game/<room-code>/player/`, and no topic under `game/<room-code>/world/`
  exists on the broker
