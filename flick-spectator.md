Continue developing the existing **Flick Arena** repository.

Inspect the current implementation before making changes. Read `PRODUCT_MANIFESTO.md`, the networking protocol, Durable Object room logic, Phaser integration, match lifecycle, host page, controller page, and current tests.

The project is already functional. Do not re-scaffold it or replace the existing architecture.

# Feature: Spectator Display

Add a **Spectator Display** feature that allows another laptop, television, tablet, projector, or browser window to display the same Flick Arena match as the authoritative host.

The spectator does not host the room and does not control gameplay.

The feature should be accessible through a shareable link:

```text
https://current-app-origin/watch?room=ABC123
```

The host should be able to:

* Copy the spectator link
* Open the spectator display in a new tab
* Show a spectator QR code
* See how many spectator displays are connected

The intended use cases are:

* Run the authoritative host on a laptop while displaying the game on a television
* Show the arena on a projector at an event
* Let people elsewhere in the room watch from another screen
* Keep the host controls and technical UI separate from the public game display

# Important architecture decision

Do not implement this through:

* Screen capture
* Video streaming
* WebRTC video
* Browser tab sharing
* Remote desktop
* Repeated screenshots
* DOM mirroring

Implement it as a synchronized Phaser spectator client.

Architecture:

```text
Phone controllers
        │
        ▼
Durable Object room
        │
        ▼
Authoritative host browser
Physics, collisions, scores, match state
        │
        │ synchronized state and events
        ▼
Durable Object room
        │
        ├── Spectator display 1
        ├── Spectator display 2
        └── Spectator display 3
```

The authoritative host continues to own:

* Physics
* Projectile spawning
* Collisions
* Scores
* Prop damage
* Match phases
* Timer
* Final standings

The spectator display only renders state received from the host.

The spectator must never run authoritative gameplay logic.

# Preserve the current stack

Keep:

* TanStack Start
* React
* TypeScript
* Phaser
* Cloudflare Workers
* Cloudflare Durable Objects
* Native WebSockets
* Zod
* Host-authoritative gameplay
* Existing QR room joining
* Existing controller system
* Existing deployment configuration

Do not introduce a new backend service.

# Routes

Add a spectator route:

```text
/watch
```

The room code should be supplied through a query parameter:

```text
/watch?room=ABC123
```

Optionally support a cleaner route if it fits the current TanStack Router conventions:

```text
/watch/ABC123
```

Use whichever approach integrates most cleanly with the existing repository, but ensure the host can generate a complete shareable URL.

The spectator page should connect to the existing room WebSocket endpoint using:

```text
role=spectator
```

or:

```text
role=mirror
```

Choose one term and use it consistently throughout the project. Prefer **spectator** in code and **Spectator Display** in user-facing copy.

# Host-page controls

Add a **Spectator Display** section to the host lobby and host controls.

Include:

## Copy Spectator Link

A clearly labeled button:

```text
Copy Spectator Link
```

On success, show temporary feedback:

```text
Spectator link copied
```

Use `navigator.clipboard.writeText()` when available.

Provide a fallback for browsers where the Clipboard API is unavailable.

The generated link must use:

```ts
window.location.origin
```

and the current room code.

## Open Spectator Display

Add:

```text
Open Spectator Display
```

Open the link in a new browser tab.

Do not navigate the authoritative host away from the game.

## Spectator QR code

Allow the host to reveal a second QR code specifically for spectator displays.

Label the two QR codes clearly:

```text
Controller QR
Spectator QR
```

Do not make players accidentally open the spectator page instead of the controller.

## Connected display count

Show:

```text
Spectator displays: 2
```

Update this count when spectators connect or disconnect.

# Accessibility and usability

The host controls should include:

* Clear labels
* Appropriate ARIA labels
* Keyboard accessibility
* Visible focus states
* Copy-success feedback
* Error feedback when copying fails
* No icon-only buttons without accessible names

The spectator page should be usable with minimal interaction.

# Spectator page experience

The spectator page should feel like a dedicated public game display.

It should show:

* Full Flick Arena gameplay
* Match HUD
* Scores
* Timer
* Countdown
* Projectiles
* Players
* Props
* Effects
* Results screen

It should not show:

* QR codes
* Room-management controls
* Start Game button
* Debug controls
* Controller diagnostics
* WebSocket payloads
* Player-management buttons
* Development tools

The spectator page may include a minimal overlay with:

* Connection status
* Room code
* Fullscreen button
* Mute toggle
* Reconnect button when disconnected

Hide or minimize this overlay during gameplay.

# Fullscreen support

Add a prominent:

```text
Enter Fullscreen
```

button before or during the spectator session.

Use the browser Fullscreen API where supported.

The page should continue working when fullscreen is unavailable.

The Phaser canvas must:

* Maintain the logical 16:9 aspect ratio
* Fit the available viewport
* Remain centered
* Avoid stretching
* Avoid cropping important HUD elements
* Work on laptops, tablets, televisions, and projectors

# Audio behavior

Spectator displays may be connected near the authoritative host, so duplicate audio could cause echoes.

Default spectator audio to **muted**.

Show a clear toggle:

```text
Enable Sound
```

Only enable audio after direct user interaction to comply with browser autoplay restrictions.

Persist the spectator mute preference locally.

Do not change the host’s audio setting when the spectator changes its own setting.

# Durable Object changes

Extend the room to support spectator WebSocket connections.

A room should support:

* Exactly one host
* Up to four controllers
* Multiple spectators

Set a reasonable spectator limit such as:

```ts
const MAX_SPECTATORS = 8;
```

Keep it configurable.

Spectators must not consume controller player slots.

Connection attachment:

```ts
type ConnectionAttachment =
  | {
      role: "host";
      connectedAt: number;
    }
  | {
      role: "controller";
      playerId: string;
      sessionId: string;
      connectedAt: number;
    }
  | {
      role: "spectator";
      spectatorId: string;
      connectedAt: number;
    };
```

Generate spectator IDs using:

```ts
crypto.randomUUID()
```

When a spectator connects:

1. Validate the room.
2. Verify the host is connected.
3. Enforce the spectator limit.
4. Accept the connection.
5. Notify the host.
6. Update the spectator count.
7. Request a complete game-state snapshot from the host.
8. Send the snapshot to the new spectator.

When a spectator disconnects:

1. Remove it from the room.
2. Notify the host.
3. Update the spectator count.

When the host disconnects:

* Inform spectators that the host is unavailable.
* Stop accepting new spectator connections.
* Close spectator connections after showing or sending a clear reason.
* Do not leave spectators frozen indefinitely without explanation.

# Read-only spectator security

Spectator connections are strictly read-only for gameplay.

A spectator may send only narrowly defined client messages such as:

```ts
type SpectatorToRoomMessage =
  | {
      type: "request-sync";
    }
  | {
      type: "ping";
      timestamp: number;
    };
```

Reject spectator attempts to send:

* Aim input
* Flick input
* Ready state
* Match commands
* Score changes
* Player IDs
* Projectile commands
* Host commands

Do not trust a role supplied inside normal JSON messages. The Durable Object must derive the connection role from the accepted WebSocket attachment.

Validate all messages with Zod.

Preserve existing payload-size limits.

# Synchronization model

Use a combination of:

1. Periodic game-state snapshots
2. Discrete gameplay events

Do not send every Phaser object every animation frame.

## State snapshots

During an active match, the authoritative host should send spectator snapshots at approximately:

```text
12–20 updates per second
```

Start at 15 updates per second and tune only if necessary.

Each snapshot should include enough state to render the current match:

```ts
type SpectatorSnapshot = {
  type: "spectator-snapshot";
  sequence: number;
  hostTimestamp: number;
  phase: MatchPhase;
  timeRemainingMs: number;
  players: SpectatorPlayerState[];
  projectiles: SpectatorProjectileState[];
  props: SpectatorPropState[];
  scores: Array<{
    playerId: string;
    score: number;
  }>;
};
```

Example player state:

```ts
type SpectatorPlayerState = {
  playerId: string;
  playerNumber: number;
  color: PlayerColor;
  stationId: string;
  x: number;
  y: number;
  rotation: number;
  aimAngle: number;
  cooldownRemainingMs: number;
  animationState:
    | "idle"
    | "aiming"
    | "throwing"
    | "hit"
    | "winning"
    | "losing";
};
```

Example projectile state:

```ts
type SpectatorProjectileState = {
  projectileId: string;
  ownerPlayerId: string;
  projectileType: ProjectileType;
  x: number;
  y: number;
  rotation: number;
  velocityX: number;
  velocityY: number;
};
```

Example prop state:

```ts
type SpectatorPropState = {
  propId: string;
  propType: PropType;
  x: number;
  y: number;
  rotation: number;
  health: number;
  maxHealth: number;
  destroyed: boolean;
  damageState: number;
};
```

Do not include unnecessary internal physics-engine data.

Do not include Phaser object references or Matter bodies.

# Discrete presentation events

Send important one-time events separately:

```ts
type SpectatorPresentationEvent =
  | {
      type: "projectile-thrown";
      eventId: string;
      playerId: string;
      projectileId: string;
      projectileType: ProjectileType;
      intensity: number;
    }
  | {
      type: "player-hit";
      eventId: string;
      attackerPlayerId: string;
      targetPlayerId: string;
      projectileType: ProjectileType;
      score: number;
      impactX: number;
      impactY: number;
      impactStrength: number;
    }
  | {
      type: "prop-damaged";
      eventId: string;
      propId: string;
      propType: PropType;
      impactX: number;
      impactY: number;
    }
  | {
      type: "prop-destroyed";
      eventId: string;
      playerId: string;
      propId: string;
      propType: PropType;
      score: number;
      impactX: number;
      impactY: number;
    }
  | {
      type: "countdown";
      eventId: string;
      value: 3 | 2 | 1 | "FLICK";
    }
  | {
      type: "match-ended";
      eventId: string;
      standings: MatchStanding[];
    };
```

Use event IDs to prevent duplicate playback after reconnects or repeated network delivery.

These events should trigger spectator-local:

* Sound
* Particles
* Camera shake
* Floating score text
* Countdown animations
* Winner effects

Do not attempt to synchronize every individual particle.

The authoritative host sends the gameplay event. Each spectator recreates the corresponding presentation effect locally.

# Initial synchronization

A spectator may join:

* In the lobby
* During countdown
* In the middle of a match
* On the results screen

It must recover the current state correctly.

When a spectator joins:

1. The Durable Object sends a `spectator-sync-request` to the host.
2. The host immediately creates a complete snapshot.
3. The host sends the snapshot through the Durable Object.
4. The Durable Object sends it to the joining spectator.
5. The spectator initializes its Phaser scene from that state.

Do not rely only on in-memory Durable Object state for the authoritative game snapshot.

The host remains the source of truth.

If no snapshot arrives within a reasonable timeout, show:

```text
Waiting for the host display…
```

and allow the spectator to retry.

# Phaser spectator mode

Reuse the existing Phaser assets, scenes, entities, and effects as much as possible.

Do not create an entirely separate visual implementation.

Add a spectator mode to the game configuration:

```ts
type GameMode = "host" | "spectator";
```

or:

```ts
type FlickGameOptions = {
  mode: "host" | "spectator";
  bridge: GameBridge;
};
```

In spectator mode:

* Do not run authoritative collisions.
* Do not award scores.
* Do not damage props.
* Do not spawn projectiles from controller input.
* Do not advance match phases independently.
* Do not make gameplay decisions.
* Do not send host commands.
* Render received state.
* Play presentation effects from received events.
* Interpolate moving entities between snapshots.

Avoid duplicating every scene or entity class.

Prefer shared visual entities with separate host-authoritative and spectator-update paths.

# Interpolation

Snapshots will arrive less frequently than the render loop.

Implement interpolation to keep spectator motion smooth.

Maintain a small snapshot buffer, such as approximately:

```text
80–120 ms
```

Render slightly behind the host’s latest state and interpolate between snapshots.

Requirements:

* Interpolate position
* Interpolate rotation using shortest-angle interpolation
* Smooth aim-angle changes
* Snap when the error is extremely large
* Do not extrapolate indefinitely
* Stop or freeze gracefully during connection loss

Create pure, testable interpolation helpers.

Do not update React state every frame.

Phaser owns the spectator render loop.

# Clock synchronization

Do not rely solely on the spectator’s local countdown.

Use host timestamps and snapshot time remaining.

The spectator may locally interpolate the timer between snapshots, but it must periodically correct itself to the authoritative host value.

Avoid visible timer jumps where possible.

# Snapshot performance

Keep snapshot payloads small.

Requirements:

* Send only active projectiles
* Send only required player state
* Send concise prop state
* Do not include textures or static arena data
* Do not send particles
* Do not send audio
* Avoid excessive JSON nesting
* Cap active projectile counts as already required by the game
* Measure approximate snapshot size during development

JSON is acceptable for this version.

Do not add binary serialization unless profiling proves JSON is inadequate.

# Host integration

The Phaser host should expose a method such as:

```ts
createSpectatorSnapshot(): SpectatorSnapshot
```

or a dedicated system:

```text
SpectatorSyncSystem
```

This system should:

* Read current authoritative game state
* Produce serializable DTOs
* Assign increasing sequence numbers
* Throttle snapshot sending
* Stop sending when no spectators are connected
* Send an immediate snapshot when a spectator joins
* Clean up timers and subscriptions

Do not serialize Phaser or Matter objects directly.

# Spectator HUD

Use the same visual HUD as the host game, but remove host-only controls.

Display:

* Match timer
* Player scores
* Player numbers
* Current phase
* Winner and results

The spectator should look nearly identical to the public gameplay area of the host.

Minor differences are acceptable:

* Connection indicator
* Fullscreen control
* Mute control

# Lobby spectator state

When the room is in the lobby, the spectator display should show a clean public lobby presentation:

* Flick Arena logo
* Room code
* Connected player cards
* Player colors
* Ready indicators
* “Waiting for host to start”

Do not display controller QR codes on the spectator page unless explicitly useful.

The host remains the place where players join.

# Results synchronization

When the match ends, spectators must show:

* Winner
* Final standings
* Scores
* Celebration effects
* Play Again waiting state

When the host starts another round, the spectator should transition automatically.

The spectator does not need a Play Again button.

# Reconnection

If the spectator WebSocket disconnects:

1. Show a non-blocking reconnecting overlay.
2. Attempt reconnection with exponential backoff.
3. Request a fresh full snapshot after reconnecting.
4. Clear stale interpolation buffers.
5. Resume rendering from the authoritative state.

Do not require the user to reload manually for ordinary temporary disconnects.

Provide a manual Retry button after repeated failures.

# Development tools

Add development-only tools for testing:

* Open spectator in a new tab
* Simulate 50 ms latency
* Simulate 150 ms latency
* Simulate dropped snapshots
* Pause snapshot delivery
* Force spectator resync
* Display snapshot rate
* Display last sequence number
* Display interpolation-buffer size
* Display spectator latency estimate

Hide these tools in production.

# Testing

Preserve existing tests.

Add unit tests for:

* Spectator role validation
* Spectator limit
* Spectators not consuming player slots
* Read-only message enforcement
* Snapshot schema validation
* Snapshot sequence handling
* Stale snapshot rejection
* Duplicate presentation-event prevention
* Position interpolation
* Rotation interpolation
* Timer correction
* Reconnection resync behavior
* Spectator link generation

Add Durable Object integration tests for:

* Host connects
* Spectator connects
* Host receives spectator-connected notification
* Spectator count updates
* Multiple spectators connect
* Spectator limit is enforced
* Spectator cannot send controller input
* Snapshot is relayed to spectators
* Presentation event is relayed
* Host disconnect notification reaches spectators
* Controller slots remain available when spectators connect

Add browser-level tests where practical for:

* Copy Spectator Link
* Open Spectator Display
* Spectator connection
* Fullscreen control
* Default-muted audio
* Reconnection overlay

Do not attempt to test Phaser pixel rendering exhaustively.

# Implementation order

## Milestone 1: Protocol and room roles

* Add spectator role
* Add spectator attachments
* Add spectator connection limits
* Add spectator count
* Enforce read-only behavior
* Add Zod schemas

## Milestone 2: Host sharing controls

* Generate spectator URL
* Copy link
* Open in new tab
* Spectator QR
* Connected-display count
* Accessible feedback

## Milestone 3: Spectator route

* Add `/watch`
* Connect as spectator
* Add loading, error, and host-unavailable states
* Add fullscreen and mute controls

## Milestone 4: State synchronization

* Create serializable host snapshots
* Add sequence numbers
* Add snapshot throttling
* Send snapshots only when spectators exist
* Add initial sync request

## Milestone 5: Spectator Phaser mode

* Reuse current assets
* Render players
* Render projectiles
* Render props
* Render HUD
* Disable authoritative systems

## Milestone 6: Interpolation

* Add snapshot buffer
* Interpolate positions and rotations
* Handle large corrections
* Handle stale snapshots

## Milestone 7: Presentation events

* Throws
* Hits
* Prop damage
* Prop destruction
* Countdown
* Match results
* Local spectator effects and sound

## Milestone 8: Reconnection

* Automatic reconnect
* Fresh snapshot
* Buffer reset
* Error UI

## Milestone 9: Visual polish

* Public-display layout
* Fullscreen behavior
* Minimal overlays
* Lobby presentation
* Results presentation

## Milestone 10: Verification

* Build
* Typecheck
* Tests
* Two-browser test
* Multiple-spectator test
* Mid-match join
* Disconnect/reconnect
* Fullscreen
* Audio behavior
* Cloudflare deployment

Do not begin visual polish until synchronization is reliable.

# Acceptance criteria

The feature is complete when:

1. The host can copy a spectator link.
2. Copying provides clear success or failure feedback.
3. The host can open the spectator view in a new tab.
4. The host can display a spectator QR code.
5. A second browser can join as a spectator.
6. Spectators do not consume controller slots.
7. Spectators cannot control the game.
8. Spectators see the same arena, players, projectiles, props, scores, and timer.
9. Moving projectiles appear smooth through interpolation.
10. Hits and destruction effects appear on spectator displays.
11. Countdown and results synchronize correctly.
12. A spectator can join during an active match.
13. A spectator receives a complete current-state snapshot.
14. Multiple spectator displays can connect.
15. The configured spectator limit is enforced.
16. The host sees the connected spectator count.
17. Temporary spectator disconnections reconnect automatically.
18. Reconnected spectators receive a fresh state.
19. Host disconnection produces a clear spectator message.
20. Spectator audio is muted by default.
21. Spectator audio can be enabled manually.
22. Fullscreen mode works where supported.
23. The spectator page contains no host or controller controls.
24. Existing phone controls and gameplay remain unchanged.
25. Existing controller capacity remains unchanged.
26. Performance remains smooth with several spectators.
27. Build passes.
28. Typecheck passes.
29. Tests pass.
30. Cloudflare deployment continues to work.

# Scope exclusions

Do not add:

* Remote matchmaking
* Public room discovery
* Spectator chat
* Spectator reactions
* Spectator voting
* Video streaming
* Screen capture
* Recorded replays
* Persistent match history
* Authentication
* Password-protected rooms
* Custom spectator layouts
* Commentary audio
* Remote controller support

This feature is a synchronized read-only display.

# Final response

After implementation:

1. Summarize the architecture.
2. Explain why the spectator is not authoritative.
3. List the new routes and controls.
4. Explain the snapshot rate and interpolation strategy.
5. Explain how mid-match joining works.
6. Report the spectator connection limit.
7. Report build, typecheck, and test results.
8. Explain how to test with two browser windows.
9. Explain how to test on a television or projector.
10. Mention remaining synchronization imperfections honestly.
11. Do not claim physical multi-device testing unless it actually occurred.
12. Do not stop after adding the link or route; implement full synchronized rendering.

The completed user experience should be:

> **Host creates room → clicks Copy Spectator Link → opens the link on a TV or second laptop → the second screen automatically displays the same match without becoming the host.**
