# Verification Results

Date: 2026-09-23

## Automated coverage

- `yarn verify:mqtt` — passed against the default EMQX broker, including
  retained claim delivery, pose parsing, and Last Will delivery after a forced
  disconnect.
- Browser MQTT spike at `/?mqtt-spike=1` — passed with both the default broker
  and an overridden `MQTT_BROKER_URL`; observed connect, publish, and self
  subscription receipt logs.
- Two-page browser walkthrough — passed for same-character fallback,
  different-character selection, movement, overlap, remote removal, graceful
  leave, and topic confinement.
- Stationary external measurement — 12.20 Hz and 12.35 Hz per client.
- Moving external measurement — 12.35 Hz and 12.82 Hz per client.
- `yarn build` — passed with the default broker and with an overridden broker.
- `openspec validate "add-mqtt-player-status-sync" --strict` — passed.
- Final production bundle starts with Phaser 4.2.1 in WebGL mode. The complete
  automated walkthrough used the Canvas renderer because software WebGL in the
  isolated headless environment paced Phaser's update loop below the pose
  requirement; this does not affect the production `AUTO` renderer.

## Pairing scenarios

| Scenario | Result | Evidence |
| --- | --- | --- |
| Creator sees a room code | PASS | A generated four-character code was displayed in both walkthroughs. |
| Joiner enters the code | PASS | The second page entered the same selection screen and received the creator's retained claim. |
| Players pick different characters | PASS | Tobias and Lola claims were retained for different clients and both clients entered `Game`. |
| Players pick the same character | PASS | The earlier claim retained Tobias; the later client converged to Lola. |
| Late joiner sees a taken character | PASS | The late joiner's UI immediately displayed `Tobias (ocupado)`. |
| Second claim starts the game | PASS | Both clients transitioned from `CharacterSelect` to `Game` after both live claims were present. |
| Waiting with one player | PASS | The first client remained in `CharacterSelect`; no pose heartbeat began before the peer joined. |
| Disconnect before game frees a claim | PASS | After the claiming page closed, the remaining page removed the inactive owner and exposed the character as free. |

## Status-sync scenarios

| Scenario | Result | Evidence |
| --- | --- | --- |
| Moving player publishes poses | PASS | Both clients published while moving; externally measured rates were 12.35–12.82 Hz. |
| Stationary player still publishes | PASS | Both clients published `anim: "stopped"` while stationary at 12.20–12.35 Hz. |
| Receiving client parses a pose | PASS | `parsePose` and `parsePlayerState` validated all received payloads. |
| Remote player moves smoothly | PASS | Two-snapshot interpolation with a 100 ms receive-time delay was unit-checked and exercised in both browser views while moving. |
| Remote player appears at first message | PASS | The peer sprite appeared after the first `playing` snapshot and then tracked movement. |
| Other player's tab is closed | PASS | Last Will delivered `{"state":"left"}`; the remote sprite disappeared and no later `playing` pose arrived. |
| Graceful leave | PASS | The leave button published `{"state":"left"}` before closing and returned to the main menu. |
| Default broker | PASS | Browser console logged `MQTT broker: wss://broker.emqx.io:8084/mqtt`. |
| Overridden broker | PASS | A build with `MQTT_BROKER_URL=wss://test.mosquitto.org:8081/mqtt` logged and connected to the override. |
| Topic confinement | PASS | Pairing claims appeared under `game/<code>/slot/...`, status and presence used `game/<code>/player/...`, and no `game/<code>/world/` message was observed. |

## Topic namespace resolution

The status-sync delta spec was corrected to state the implemented contract
explicitly: pairing claims use `game/<code>/slot/`, status and presence use
`game/<code>/player/`, and `game/<code>/world/` remains unused.
