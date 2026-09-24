# Spec Delta

## Purpose

Lets two players rendezvous in the same game session by creating or joining a
room with a shared code and claiming one of the two characters before play
begins.

## ADDED Requirements

### Requirement: Room creation with a joinable code
The system SHALL let a player create a game room and display a room code that
a second player can enter on another device to join the same room.

#### Scenario: Creator sees a room code
- **WHEN** a player chooses to create a game from the main menu
- **THEN** a unique room code is generated, displayed, and the player waits
  in the character selection screen for the second player to join

#### Scenario: Joiner enters the code
- **WHEN** a second player enters the same room code on their device
- **THEN** both players are connected to the same room and both selection
  screens show the same set of character claims

### Requirement: Character claims are first-come-first-served
The system SHALL let each player claim one of the two characters (`tobias`,
`lola`) through a claim that is observable by the other player, and if a
player's chosen character is already claimed by the other player, the system
SHALL give that player the remaining character.

#### Scenario: Players pick different characters
- **WHEN** one player claims `tobias` and the other claims `lola`
- **THEN** both claims succeed without reassignment and each player keeps
  the character they picked

#### Scenario: Players pick the same character
- **WHEN** both players claim the same character in the same room
- **THEN** exactly one claim wins for that character and the other player is
  assigned the remaining character, so both selection screens converge to
  one `tobias` and one `lola`

### Requirement: Claims are visible to a late joiner
The system SHALL preserve character claims so that a player joining a room
where the other player has already chosen sees which characters are taken
immediately, without any extra interaction.

#### Scenario: Joiner sees the taken character
- **WHEN** a player joins a room in which the first player already claimed
  `tobias`
- **THEN** the joiner's selection screen shows `tobias` as taken before they
  interact with any character option

### Requirement: The game starts only when both characters are claimed
The system SHALL start the game scene on both clients exactly when both
character claims in the room are held by live players.

#### Scenario: Second claim starts the game
- **WHEN** the second character claim is won in a room where the first is
  already held
- **THEN** both clients leave the selection screen and start the game scene

#### Scenario: Waiting with one player
- **WHEN** only one character claim exists in a room
- **THEN** the claimed player remains on the selection screen and no game
  scene starts

### Requirement: A claim is freed when its player disconnects before the game
The system SHALL detect a player who disconnects without notice while the
selection screen is open and treat their character claim as freed.

#### Scenario: Joiner closes their tab
- **WHEN** a player who claimed a character closes their browser tab or
  loses connection before the game starts
- **THEN** the remaining player is informed through the broker that the
  claim is no longer held by a live player
