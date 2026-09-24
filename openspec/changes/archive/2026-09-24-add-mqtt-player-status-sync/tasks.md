# Tasks

## 1. Setup and broker spike

- [x] 1.1 Add `mqtt` to `package.json` and verify installation succeeds
  (`yarn add mqtt` completes and `node -e "require('mqtt')" ` resolves)
- [x] 1.2 Spike: bundle a minimal mqtt.js connect/publish/subscribe with
  Parcel and verify `yarn build` succeeds and a dev-page log shows
  `connect`, one published message, and its own subscription receipt
  (if bundling fails, resolve the fallback from design D8/Risk-1 before
  proceeding)
- [x] 1.3 Add broker URL config (`MQTT_BROKER_URL` read via
  `process.env.MQTT_BROKER_URL`, default
  `wss://broker.emqx.io:8084/mqtt`, `.env.example` documenting it) and
  verify a build with the variable unset logs the default URL while a
  build with it set logs the overridden URL

## 2. MQTT session module

- [x] 2.1 Implement a shared session module (random `client-id` via
  `crypto.randomUUID()`, room-code generator from the unambiguous
  alphabet, topic builders for `game/<code>/slot/<char>` and
  `game/<code>/player/<id>/state`, connection with Last Will
  `{"state":"left"}` on the state topic) and verify a standalone call
  logs the expected topic strings and an `connect` event with
  `will.present = true`
- [x] 2.2 Implement pose publish helper (JSON `{x, y, dir, anim, state}`
  at QoS 0) and retained-slot claim read/write helpers and verify, via
  the module's own subscription, that a published claim is retained
  (returned on a fresh subscribe) and a pose message parses to the spec
  contract fields

## 3. Character selection and pairing scene

- [x] 3.1 Create the `CharacterSelect` scene and insert it into the flow
  `MainMenu -> CharacterSelect -> Game` (registered in
  `src/game/main.js`) with create-room (shows generated code) and
  join-room (code input) UI, and verify by clicking through that a
  created code is displayed and entering it on a second browser tab
  reaches the same selection screen
- [x] 3.2 Implement first-come-first-served character claims per design
  D4 (publish retained claim to `slot/<char>`, read back, lose ->
  take the other character) and verify with two tabs claiming the same
  character that both screens converge to one `tobias` and one `lola`,
  and that a tab joining later sees the taken character immediately
- [x] 3.3 Implement ready-gating (start `Game` on both clients only when
  both slots are held by live players) and pre-game presence (a closed
  tab's `left` state marks its claim freed on the remaining screen) and
  verify that one tab alone never starts the game and that closing the
  claimed tab shows the slot freed on the other tab

## 4. Game scene: role-aware rendering and status sync

- [x] 4.1 Make `Game.js` role-aware: accept init data
  (`room`, `clientId`, `char`, `peer`), spawn the local sprite with the
  chosen character texture (joystick logic unchanged), and verify both
  textures work by loading the scene as each character
- [x] 4.2 Add the fixed-rate pose publisher (time accumulator, 66-100 ms,
  publishing even when stationary) in `Game.update()` and verify with an
  external subscriber (`mosquitto_sub`/mqtt client on the state topic)
  that messages arrive at 10-15 Hz with the spec payload contract
- [x] 4.3 Implement remote-player rendering: subscribe to the peer state
  topic, create the peer sprite at the first `playing` message with the
  peer's character texture, interpolate position between the last two
  snapshots (~100 ms delay buffer, receive timestamps), apply `dir` and
  `anim` immediately, and verify with two tabs that the remote sprite
  moves smoothly without teleporting and plays the correct animation
- [x] 4.4 Remove the `tobias x lola -> GameOver` collider from `Game.js`
  (keep map collision for both sprites) and verify that the two player
  sprites can overlap without the GameOver scene starting
- [x] 4.5 Implement leave handling: graceful leave publishes
  `{"state":"left"}`, and a received `left` state (graceful or
  Last Will) removes the remote sprite, and verify by closing one tab
  abruptly that the remaining tab's remote sprite disappears

## 5. End-to-end verification

- [x] 5.1 Walk through every scenario in
  `specs/multiplayer/pairing/spec.md` and `specs/multiplayer/status-sync/spec.md`
  with two browser tabs and verify each WHEN/THEN holds (record results
  per scenario)
- [x] 5.2 Verify topic confinement (no topic under `game/<code>/world/`
  exists on the broker during the walkthrough) and that
  `openspec validate "add-mqtt-player-status-sync" --strict` and
  `yarn build` both pass
