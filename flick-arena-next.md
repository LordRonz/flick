Continue developing the existing **Flick** repository.

The current proof of concept is deployed and working:

* TanStack Start
* React
* TypeScript
* Cloudflare Workers
* Cloudflare Durable Objects
* Native WebSockets
* QR room joining
* Phone motion permissions
* Tilt controls
* Physical flick detection
* Manual Test Flick
* A basic Canvas ball-and-target prototype

Do not re-scaffold the application or replace the existing networking architecture.

The goal of this phase is to:

1. Migrate the host-side game from the handmade Canvas implementation to **Phaser**.
2. Preserve all working phone-controller and networking functionality.
3. Extend the application into the first playable version of **Flick Arena**.
4. Support two to four local players.
5. Build one polished 60-second office battle mode.

# Important correction

Do not continue expanding the existing custom Canvas game engine.

The Canvas implementation was only a networking and sensor proof of concept. Replace it with Phaser before implementing multiplayer gameplay, projectiles, collisions, particles, sound, cameras, and arena systems.

After the Phaser migration reaches feature parity, remove the old Canvas rendering and physics implementation.

Do not keep two game engines active.

# Required stack

Keep:

* TypeScript
* React
* TanStack Start
* TanStack Router
* Vite
* Cloudflare Workers
* Cloudflare Durable Objects
* Native WebSockets
* Zod
* pnpm

Add:

* Phaser
* Phaser’s built-in physics system
* Prefer Phaser Matter Physics for thrown objects, rotation, bouncing, and collisions

Use the current stable Phaser package available to the project.

Before implementing, consult the current official Phaser documentation rather than relying on remembered APIs.

If the current stable Phaser release has compatibility problems with Matter Physics, use Phaser Arcade Physics as a fallback and document the reason. Do not introduce a separate external physics engine unless absolutely necessary.

Do not add:

* Socket.IO
* WebRTC
* Supabase
* Firebase
* Express
* Three.js
* PixiJS directly
* React-based game-loop libraries
* A second rendering engine
* A database
* User accounts
* Remote multiplayer
* AI features

# Responsibilities

## TanStack Start and React own

* Routing
* Home page
* Host lobby
* QR code
* Controller page
* Motion permission UI
* Calibration UI
* Ready state
* Room status
* Host buttons
* Results overlays
* Error states
* WebSocket setup
* Cloudflare API routes

## Phaser owns

* Host-side game rendering
* Arena background
* Players
* Player stations
* Aim indicators
* Physics
* Projectiles
* Platforms
* Props
* Collisions
* Particles
* Floating score text
* Camera shake
* Audio
* Countdown animation
* Match visuals

## Durable Object owns

* Room membership
* One host connection
* Up to four controller connections
* Player slot assignment
* Player colors
* Ready states
* Lightweight reconnection
* Validated message relay
* Host-to-controller feedback

## Phones own

* Motion sensor reading
* Permission requests
* Calibration
* Tilt normalization
* Flick detection
* Input throttling
* Haptic feedback
* Controller UI

The Durable Object must not run Phaser, physics, rendering, or the game loop.

# Phaser and React integration

Phaser must run only in the browser.

TanStack Start may render routes on the server, so do not import or initialize Phaser in an SSR execution path.

Use a client-only Phaser integration.

Recommended structure:

```text
src/
  game/
    FlickGame.ts
    createGameConfig.ts
    bridge/
      GameBridge.ts
      game-events.ts
    scenes/
      BootScene.ts
      PreloadScene.ts
      ArenaScene.ts
    entities/
      PlayerStation.ts
      Projectile.ts
      DestructibleProp.ts
    systems/
      ProjectileSystem.ts
      ScoringSystem.ts
      EffectsSystem.ts
      AudioSystem.ts
      MatchSystem.ts
    config/
      projectiles.ts
      players.ts
      arena.ts
      scoring.ts
    assets/
  components/
    PhaserGame.tsx
```

Create a React component approximately like:

```tsx
export function PhaserGame(props: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    let cancelled = false;

    void import("../game/FlickGame").then(({ createFlickGame }) => {
      if (cancelled || !containerRef.current) {
        return;
      }

      gameRef.current = createFlickGame({
        parent: containerRef.current,
        bridge: props.bridge,
      });
    });

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="phaser-game-container" />;
}
```

Adjust this to the project’s actual structure and current Phaser API.

Requirements:

* Create exactly one Phaser.Game instance.
* Do not recreate the game on every React render.
* Destroy it cleanly on unmount.
* Do not store Phaser game objects in React state.
* Do not update React state every frame.
* Do not access `window`, `document`, or Phaser during SSR.
* Do not use React as an entity-component system.
* Do not make Phaser depend directly on React components.

# Typed game bridge

Create a typed bridge between React/networking and Phaser.

The bridge should allow React to send commands into the game:

```ts
type ReactToGameEvent =
  | {
      type: "player-joined";
      player: PlayerAssignment;
    }
  | {
      type: "player-left";
      playerId: string;
    }
  | {
      type: "player-ready";
      playerId: string;
      ready: boolean;
    }
  | {
      type: "orientation";
      playerId: string;
      normalizedX: number;
    }
  | {
      type: "flick";
      playerId: string;
      intensity: number;
    }
  | {
      type: "start-match";
    }
  | {
      type: "reset-match";
    };
```

Phaser should send domain events back out:

```ts
type GameToReactEvent =
  | {
      type: "game-ready";
    }
  | {
      type: "phase-changed";
      phase: MatchPhase;
    }
  | {
      type: "score-changed";
      playerId: string;
      score: number;
    }
  | {
      type: "player-hit";
      attackerPlayerId: string;
      targetPlayerId: string;
      score: number;
    }
  | {
      type: "prop-destroyed";
      playerId: string;
      propType: PropType;
      score: number;
    }
  | {
      type: "projectile-thrown";
      playerId: string;
      projectileType: ProjectileType;
    }
  | {
      type: "match-ended";
      standings: MatchStanding[];
    };
```

Use either:

* A small typed event emitter, or
* A purpose-built `GameBridge` class

Do not use global browser events unless there is a clear reason.

Do not let Phaser know about WebSockets or Cloudflare. Phaser should consume game commands and emit game-domain events.

# Phaser scenes

Use a small scene structure.

## BootScene

Responsible for:

* Minimal initialization
* Creating generated placeholder textures if needed
* Starting PreloadScene

## PreloadScene

Responsible for:

* Loading local assets
* Displaying a simple loading indicator
* Starting ArenaScene

If all initial assets are generated procedurally, keep this scene minimal.

## ArenaScene

Responsible for:

* Arena construction
* Players
* Projectiles
* Props
* Physics
* Match state
* Effects
* Camera
* Audio
* Scoring
* Cleanup between rounds

Do not create a separate scene for every UI state unless it clearly improves the design.

The React host lobby can remain outside Phaser. The ArenaScene can stay active behind lobby and results overlays.

# Phaser configuration

Use a fixed logical resolution:

```ts
const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
```

Configure responsive scaling using Phaser’s scaling system.

Desired behavior:

* Maintain the game aspect ratio.
* Fit inside the host browser viewport.
* Center the game canvas.
* Avoid stretching.
* Keep physics in logical game coordinates.
* Support laptop screens and external displays.
* Handle browser resizing.

Use WebGL with Canvas fallback through the appropriate Phaser renderer setting.

Set the game background to a dark office-themed color.

Disable unnecessary DOM overlays inside Phaser.

# Physics choice

Use **Phaser Matter Physics** for the host game if supported cleanly by the installed stable Phaser version.

Matter Physics is preferred because the game needs:

* Rotating projectiles
* Different projectile masses
* Restitution and bouncing
* Platform collisions
* Player hit sensors
* Office-prop collisions
* Knockback
* Thrown mugs and staplers that feel physically different

The host is the only machine running the game simulation, so cross-client physics determinism is not required.

Configure:

* Gravity
* Collision categories
* Collision masks
* Restitution
* Friction
* Air friction
* Static platforms
* Sensor bodies where appropriate

Create explicit collision categories for:

```ts
const CollisionCategory = {
  WORLD: 0x0001,
  PROJECTILE: 0x0002,
  PLAYER: 0x0004,
  PROP: 0x0008,
  SENSOR: 0x0010,
} as const;
```

Adjust values if needed.

Do not implement a custom physics engine around Phaser.

# Product concept

Flick Arena is a browser-based local multiplayer party brawler.

One laptop or shared display shows the game.

Two to four players scan a QR code. Their phones become motion controllers without requiring an app installation.

Players:

* Tilt to aim
* Flick forward to throw office objects
* Hit opponents
* Break office props
* Earn points
* Compete in a 60-second round

The first arena is a chaotic office.

# Primary player experience

1. The host creates a room.
2. A QR code appears.
3. Two to four players join.
4. Each player receives a unique number and color.
5. Players enable motion controls.
6. Players calibrate their phones.
7. Players mark themselves ready.
8. The host starts the round.
9. A 3-2-1-FLICK countdown appears.
10. Players tilt and physically flick office objects.
11. Hits and destroyed props award points.
12. The match ends after 60 seconds.
13. A winner and rankings appear.
14. Everyone can play again without reconnecting.

# Multiplayer lobby

Extend the current room from one controller to four.

Support:

* Exactly one host
* Up to four controllers
* Stable player assignment
* Player colors
* Ready states
* Reconnection grace period
* Controller replacement after a player fully disconnects

Assign colors in this order:

```ts
const PLAYER_COLORS = [
  "blue",
  "red",
  "green",
  "yellow",
] as const;
```

Player assignment:

```ts
type PlayerAssignment = {
  playerId: string;
  playerNumber: 1 | 2 | 3 | 4;
  color: PlayerColor;
};
```

Use `crypto.randomUUID()` for player IDs.

Do not use `Math.random()` for identifiers or session tokens.

When a controller connects:

1. Validate that the room exists.
2. Validate that the host is connected.
3. Attempt to reclaim its previous player session.
4. Otherwise assign the first free slot.
5. Reject the connection if four controllers are active.
6. Send the assignment to the controller.
7. Notify the host.
8. Include the complete lobby state.

Store a controller session identifier in localStorage so a refresh can reclaim the same slot.

Use a disconnect grace period of approximately 15 seconds.

# Match phases

Use:

```ts
type MatchPhase =
  | "lobby"
  | "countdown"
  | "playing"
  | "results";
```

## Lobby

The host shows:

* Room code
* QR code
* Connected players
* Player colors
* Motion/calibration status if available
* Ready state
* Start button

Normal matches require at least two connected and ready players.

Include a development-only option to start with one player.

## Countdown

Show:

```text
3
2
1
FLICK!
```

Use Phaser text and tween animations.

Ignore gameplay input until the countdown finishes.

## Playing

Run a 60-second match.

Show:

* Timer
* Player scores
* Player colors
* Current projectile
* Aim indicators
* Hit feedback
* Destroyed props

## Results

Show through React or Phaser:

* Winner
* Final rankings
* Scores
* Hits
* Props destroyed
* Accuracy, only if easy to track

Include:

* Play Again
* Back to Lobby

Play Again must reset the Phaser scene without reconnecting controllers.

# Arena layout

Build a side-view office arena.

Include:

* Office walls and windows
* Floor
* Desks or elevated shelves
* Printer
* Monitors
* Potted plants
* Water cooler
* Paper stacks
* Four player stations

Suggested stations:

```text
Player 1: lower-left
Player 2: lower-right
Player 3: upper-left
Player 4: upper-right
```

For two players, use the lower stations.

For three players, use two lower stations and one upper station.

For four players, use all stations.

Players remain attached to their station during this version.

Do not implement walking or platforming.

Each player station displays:

* Player color
* Player number
* Current projectile
* Aim direction
* Cooldown state
* Hit reaction

# Player representation

Create a simple office-worker, launcher, or expressive blob character for each player.

Use either:

* Local permissively licensed sprites, or
* Procedurally generated Phaser textures and graphics

For the first version, generated vector-like placeholder art is acceptable.

Each player should have:

* Idle animation
* Aim rotation
* Throw squash/stretch
* Hit flash
* Short knockback reaction
* Return-to-station animation
* Winner celebration

The player body may remain static or sensor-only for gameplay purposes.

Do not allow projectiles to permanently move player stations.

# Aiming

Phone tilt controls an aiming angle.

Each player station has its own valid aiming arc based on orientation and arena location.

Convert normalized tilt into an angle:

```ts
type AimConfig = {
  minAngle: number;
  maxAngle: number;
  defaultAngle: number;
};
```

Display:

* Dotted trajectory preview, or
* A direction arrow

A short predicted trajectory is preferable if Phaser/Matter calculations make it straightforward.

Do not attempt exact long-range simulation if it adds significant complexity.

Apply smoothing to the input.

Do not directly snap the aim angle to noisy sensor values.

# Throwing

A phone sends:

```ts
{
  type: "flick",
  intensity: number,
  timestamp: number
}
```

Map intensity into a useful speed range:

```ts
const MIN_THROW_SPEED = 12;
const MAX_THROW_SPEED = 28;
```

Tune these values for Matter’s coordinate system and the arena.

Requirements:

* Even a weak valid flick produces a useful throw.
* Strong flicks are visibly faster.
* Clamp invalid values.
* Use a cooldown between approximately 500 and 800 milliseconds.
* Ignore flicks outside the playing phase.
* Ignore flicks while the player is on cooldown.
* Acknowledge accepted throws back to the phone.

# Projectile types

Implement three office projectile types.

## Paper ball

* Light
* Fast
* Low damage
* Low knockback
* Low score
* Mild bounce

## Coffee mug

* Medium mass
* Medium speed
* Medium damage
* Medium score
* Break effect after a strong collision

## Stapler

* Heavy
* Slower
* Strong knockback
* High score
* Strong camera shake
* Lower bounce

Definitions:

```ts
type ProjectileType =
  | "paper-ball"
  | "coffee-mug"
  | "stapler";

type ProjectileDefinition = {
  textureKey: string;
  bodyShape: "circle" | "rectangle";
  width: number;
  height: number;
  radius?: number;
  mass: number;
  restitution: number;
  friction: number;
  frictionAir: number;
  speedMultiplier: number;
  hitScore: number;
  propDamage: number;
  lifetimeMs: number;
  angularVelocityRange: {
    min: number;
    max: number;
  };
};
```

Keep projectile definitions in one configuration file.

Use a rotating or randomized next-projectile queue.

Show the next projectile on:

* The host player station
* The phone controller

Do not build inventory management.

# Projectile system

Use Phaser groups or a dedicated projectile manager.

Every projectile should track:

```ts
type ProjectileMetadata = {
  projectileId: string;
  ownerPlayerId: string;
  projectileType: ProjectileType;
  createdAt: number;
  scoredPlayerIds: Set<string>;
  destroyedPropIds: Set<string>;
};
```

Projectiles must:

* Spawn at the correct station
* Launch along the aim vector
* Rotate in flight
* Collide with platforms
* Collide with props
* Hit other players
* Avoid immediately hitting their owner
* Stop scoring repeatedly against one player
* Expire after their configured lifetime
* Be destroyed when far outside the arena
* Be cleaned up between rounds

Do not allow unbounded projectile accumulation.

# Player hits

When a projectile hits another player:

1. Confirm the projectile does not belong to that player.
2. Confirm it has not already scored against that player.
3. Calculate score from projectile type.
4. Award score to the owner.
5. Play a player-hit reaction.
6. Show floating score text.
7. Spawn particles.
8. Play an impact sound.
9. Shake the camera based on impact strength.
10. Notify the attacker’s phone.
11. Notify the target’s phone.

Suggested scores:

```ts
const HIT_SCORES = {
  "paper-ball": 50,
  "coffee-mug": 100,
  stapler: 150,
} as const;
```

Do not implement health or player elimination yet.

The objective is points, not survival.

# Destructible office props

Implement at least these props:

* Monitor
* Printer
* Potted plant
* Water cooler
* Document stack

Definition:

```ts
type PropType =
  | "monitor"
  | "printer"
  | "plant"
  | "water-cooler"
  | "document-stack";

type PropDefinition = {
  textureKey: string;
  maxHealth: number;
  scoreValue: number;
  collisionShape: PropCollisionShape;
  isStatic: boolean;
};
```

Props should:

* Take damage from projectiles
* Flash or shake when hit
* Display at least one damaged state
* Break when health reaches zero
* Award points to the last damaging player
* Spawn debris or particles
* Play a destruction sound
* Remain destroyed for the rest of the round
* Reset when the next round begins

Do not implement pixel-level destruction or geometry fracture.

For visual destruction, use:

* Texture swaps
* Tinting
* Cracks
* Particle fragments
* Small temporary Matter bodies
* Hide/destroy after animation

Cap debris bodies and remove them after a short lifetime.

# Scoring

Track per-player:

```ts
type PlayerRoundStats = {
  score: number;
  throws: number;
  playerHits: number;
  propsDestroyed: number;
};
```

Scoring:

```text
Paper-ball player hit: +50
Coffee-mug player hit: +100
Stapler player hit: +150
Prop destroyed: use prop-specific score
```

The host is authoritative.

Do not trust controller-supplied scores, projectile types, or targets.

# Networking protocol

Preserve and expand the existing Zod-validated protocol.

Controller-to-room:

```ts
type ControllerToRoomMessage =
  | {
      type: "orientation";
      normalizedX: number;
      timestamp: number;
    }
  | {
      type: "flick";
      intensity: number;
      timestamp: number;
    }
  | {
      type: "ready";
      ready: boolean;
    }
  | {
      type: "calibration-status";
      calibrated: boolean;
    };
```

Room-to-host:

```ts
type RoomToHostMessage =
  | {
      type: "player-connected";
      player: PlayerAssignment;
    }
  | {
      type: "player-disconnected";
      playerId: string;
    }
  | {
      type: "lobby-state";
      players: LobbyPlayer[];
    }
  | {
      type: "controller-input";
      playerId: string;
      input:
        | {
            type: "orientation";
            normalizedX: number;
            timestamp: number;
          }
        | {
            type: "flick";
            intensity: number;
            timestamp: number;
          };
    };
```

Host-to-room:

```ts
type HostToRoomMessage =
  | {
      type: "match-state";
      phase: MatchPhase;
      timeRemainingMs?: number;
    }
  | {
      type: "flick-accepted";
      playerId: string;
      projectileType: ProjectileType;
    }
  | {
      type: "hit-confirmed";
      attackerPlayerId: string;
      targetPlayerId: string;
      score: number;
    }
  | {
      type: "player-hit";
      targetPlayerId: string;
      attackerPlayerId: string;
    }
  | {
      type: "prop-destroyed";
      playerId: string;
      propType: PropType;
      score: number;
    }
  | {
      type: "round-result";
      standings: MatchStanding[];
    };
```

All messages must be validated.

Keep controller orientation messages throttled to approximately 10 Hz and only send meaningful changes.

Do not stream raw accelerometer data.

# Phone controller redesign

Make the controller look like part of a game rather than a diagnostics tool.

Primary interface:

* Player number
* Player color
* Connection status
* Motion permission status
* Calibration status
* Ready button
* Current projectile
* Next projectile
* Aim visualization
* Throw cooldown
* Score
* Match timer
* Final rank

Keep:

* Enable Motion Controls
* Calibrate
* Test Flick

Move raw diagnostics into a collapsible Debug panel:

* Normalized tilt
* Raw orientation
* Acceleration magnitude
* Flick threshold
* Last flick intensity
* WebSocket state
* Session ID
* Assigned player ID

Hide Test Flick outside debug mode after physical flicking is confirmed reliable.

# Haptic feedback

Use vibration when available:

```text
Throw accepted: short pulse
Hit confirmed: medium pulse
Player was hit: double pulse
Countdown complete: short pulse
Round ended: long pulse
```

Fail silently on unsupported browsers, including iPhone browsers that do not expose vibration.

Do not make vibration required for gameplay.

# Phaser effects

Use Phaser-native features for:

* Tween animations
* Particle emitters
* Camera shake
* Sprite tint/flash
* Floating score text
* Projectile trails
* Countdown transitions
* Winner celebration

Effects should be pooled or capped where appropriate.

Avoid creating unlimited tweens, particles, sounds, or bodies.

# Audio

Use Phaser’s sound system.

Required sounds:

* UI click
* Countdown
* Round start
* Paper throw
* Mug throw
* Stapler throw
* Light impact
* Heavy impact
* Prop break
* Round end
* Winner sting

Use local files only.

Do not load audio from remote URLs at runtime.

Respect browser autoplay restrictions.

Unlock sound after a direct host interaction such as pressing Start Game.

Add a mute toggle.

# Visual direction

The arena should resemble a colorful office battle.

Include:

* Blue, red, green, and yellow players
* Office platforms
* Printer
* Monitors
* Plants
* Water cooler
* Paper
* Coffee mugs
* Staplers
* Impact effects
* Score popups
* Visible aim paths

The style should be:

* Bright
* Arcade-like
* Readable
* Slightly chaotic
* Friendly rather than violent

Use simple temporary artwork where necessary.

Prioritize gameplay readability over detailed art.

# Performance

Target smooth gameplay on a normal laptop.

Requirements:

* Phaser owns the update loop.
* React does not update every frame.
* Cap active projectiles.
* Cap particles.
* Cap debris.
* Destroy expired Matter bodies.
* Reuse objects where reasonable.
* Remove collision listeners when scenes shut down.
* Clean up bridge subscriptions.
* Pause or reduce activity when appropriate.
* Do not recreate textures repeatedly.
* Avoid allocating large objects inside `update()`.

Add a development performance overlay showing:

* FPS
* Active projectiles
* Active Matter bodies
* Particle count

Hide it in production.

# Desktop debugging

Keep keyboard fallback controls.

Suggested mapping:

```text
Player 1:
A / D = aim
W or Space = throw

Player 2:
Left / Right = aim
Arrow Up = throw

Player 3:
J / L = aim
I = throw

Player 4:
Numpad 4 / Numpad 6 = aim
Numpad 8 = throw
```

Add a development-only panel to:

* Add fake players
* Remove fake players
* Mark players ready
* Start with one player
* Simulate tilt
* Simulate flick strength
* Select next projectile
* Add score
* Destroy a prop
* Reset the scene
* End the match

# Migration strategy

Do not delete the Canvas prototype immediately.

Follow this order:

## Step 1: Baseline

* Inspect the current repository.
* Run the current app.
* Run build, typecheck, and tests.
* Document existing behavior.
* Identify the current Canvas game boundary.

## Step 2: Phaser shell

* Install Phaser.
* Add client-only Phaser mounting.
* Create BootScene, PreloadScene, and ArenaScene.
* Render a simple arena.
* Verify TanStack Start SSR still works.
* Verify Cloudflare build and deployment still work.

## Step 3: Feature parity

Reimplement the current proof of concept in Phaser:

* One player station
* Tilt aiming
* Test Flick
* Physical Flick
* Projectile launch
* Target collision
* Score

Verify phone input works with Phaser before continuing.

## Step 4: Remove old engine

Once Phaser reaches feature parity:

* Delete the old Canvas game component.
* Delete obsolete custom render-loop code.
* Delete obsolete physics code.
* Preserve reusable pure math and controller code.
* Ensure no duplicate game loop remains.

## Step 5: Multiplayer lobby

* Extend Durable Object to four controllers.
* Add player slots.
* Add colors.
* Add ready states.
* Add reconnection.
* Verify four browser tabs can join.

## Step 6: Match flow

* Lobby
* Countdown
* Playing
* Results
* Play Again

Verify using desktop controls.

## Step 7: Player stations

* Create two-to-four station layouts.
* Route each controller to the correct player.
* Add aim indicators.
* Add cooldowns.
* Add player reactions.

## Step 8: Projectiles

* Paper ball
* Coffee mug
* Stapler
* Matter body tuning
* Projectile queue
* Host and controller previews

## Step 9: Hits and scoring

* Player collision
* Duplicate-hit prevention
* Scoring
* Phone feedback
* Stats
* Floating text
* Particles
* Camera shake

## Step 10: Props

* Monitor
* Printer
* Plant
* Water cooler
* Document stack
* Damage
* Destruction
* Debris
* Scoring

## Step 11: Presentation

* Audio
* Trails
* Countdown animation
* Results
* Winner celebration
* Responsive UI
* Controller polish

## Step 12: Verification

* Build
* Typecheck
* Tests
* Local browser testing
* Deployed HTTPS testing
* README update

Do not begin later systems while Phaser feature parity is broken.

# Testing

Preserve all existing tests.

Add unit tests for:

* Player slot assignment
* Player colors
* Reconnection
* Maximum player count
* Ready validation
* Match phase transitions
* Aim-angle mapping
* Throw-speed mapping
* Projectile definitions
* Score calculations
* Duplicate-hit prevention
* Protocol validation

Keep Phaser scene tests focused.

Prefer testing pure game-domain systems outside Phaser where possible.

Add integration coverage for:

* Host connection
* Four controller connections
* Fifth controller rejection
* Correct player ID attached to input
* Test Flick reaching Phaser
* Reconnection reclaiming a slot
* Round result routing to controllers

Do not spend excessive time trying to unit-test Phaser rendering internals.

# Acceptance criteria

This phase is complete when:

1. The old custom Canvas game has been replaced by Phaser.
2. Phaser is loaded only on the client.
3. TanStack Start SSR does not crash.
4. Cloudflare deployment still works.
5. The original single-player tilt and flick interaction works through Phaser.
6. Test Flick launches a Phaser projectile.
7. Physical Flick launches a Phaser projectile.
8. Two to four phones can join one room.
9. Every phone gets a unique color and player slot.
10. Every player controls only their own station.
11. Players can ready up.
12. The host can start a 60-second round.
13. The countdown blocks early input.
14. Paper balls, mugs, and staplers feel different.
15. Projectiles rotate and collide through Phaser physics.
16. Player hits award points.
17. Duplicate hits are prevented.
18. At least three office props are destructible.
19. The live scoreboard updates.
20. The match ends automatically.
21. Results show the winner and rankings.
22. Play Again works without reconnecting.
23. Haptic feedback works where browser-supported.
24. Audio respects autoplay restrictions.
25. The host remains smooth on a normal laptop.
26. Build passes.
27. Typecheck passes.
28. Tests pass.
29. The application deploys successfully to Cloudflare.
30. The README explains testing with iPhone and Android controllers.

# Explicit scope exclusions

Do not add:

* AI gameplay generation
* Accounts
* Profiles
* Persistent progression
* Cosmetics
* Monetization
* Remote online play
* Matchmaking
* Voice
* Chat
* Multiple arenas
* Multiple modes
* Free player movement
* Character selection
* Fully fractured geometry
* A level editor
* Native mobile packaging

Build one strong office arena mode.

# Final response requirements

After implementation:

1. Summarize the Phaser migration.
2. List completed milestones.
3. State which Phaser version was installed.
4. State which Phaser physics system was used and why.
5. List the files removed from the old Canvas implementation.
6. Report build, typecheck, and test commands and results.
7. Explain how to test with two to four phones.
8. Identify any iPhone or Android limitations.
9. Identify known gameplay rough edges honestly.
10. Do not claim physical-device testing unless it actually occurred.
11. Do not stop after scaffolding or placeholder TODOs.

Deliver a working Phaser-based Flick Arena, not merely a Phaser container around the old Canvas game.
