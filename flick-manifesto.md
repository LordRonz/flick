# Flick Arena — Product Manifesto

## 1. The idea

**Flick Arena is an instant local multiplayer party game where phones become motion controllers for a shared screen.**

Players do not install an app, create an account, pair Bluetooth controllers, or buy special hardware.

The host opens Flick Arena on a laptop or shared display. Everyone else scans a QR code, joins through their phone browser, and starts playing.

The core interaction is:

> **Drag to aim. Flick your phone to throw.**

Flick Arena should feel like the accessibility of Jackbox, the physicality of Wii Sports, and the chaos of a compact arcade party game.

The phone is not the main screen. It is a controller.

Players should look at the shared arena, react to one another, laugh together, and physically participate in the same experience.

---

## 2. The product promise

Flick Arena promises that a group can go from nothing to playing together in under one minute.

The full experience should be:

```text
Open the game
→ Create a room
→ Scan the QR code
→ Drag to aim
→ Flick to throw
→ Laugh
→ Play again
```

No one should need instructions from the host.

No one should need to download anything.

No one should need to understand motion sensors, browser permissions, WebSockets, room codes, or calibration systems.

The technology must disappear behind the experience.

---

## 3. Why Flick should exist

Most local multiplayer experiences require friction:

* A console
* Several controllers
* Controller pairing
* Game installation
* Accounts
* A specific television or device
* Expensive hardware
* Players who already understand the controls

Flick Arena uses hardware people already carry.

A laptop becomes the console.

Phones become the controllers.

A browser becomes the distribution platform.

The product is not merely a game about throwing objects. It is a demonstration that physical, shared-screen multiplayer can be immediate and accessible without dedicated gaming hardware.

---

## 4. Target audience

Flick Arena is designed for casual groups, not competitive esports players.

The primary audience includes:

* Friends hanging out
* Families
* House parties
* Students
* Coworkers during social events
* Cafés and game venues
* Conference booths
* Classrooms and clubs
* People who do not normally identify as gamers

The game should be understandable to someone who has never used a game controller.

Skill should matter, but experienced gamers should not dominate simply because they understand traditional controls.

---

## 5. Core principles

### Instant

The time between opening the host page and performing the first throw should be as short as possible.

The ideal target is under 30 seconds for a returning player and under 60 seconds for a new player.

### Physical

The physical phone flick is the identity of the game.

The gesture should feel deliberate, satisfying, and visible to other people in the room.

However, physical motion must never become a barrier. A large on-screen Throw button must always remain available.

### Social

Players should watch the shared screen and one another—not stare continuously at their phones.

The phone controller must be simple enough to use through peripheral attention.

### Understandable

Every action must produce immediate visual feedback.

Dragging on the phone moves the trajectory on the host.

Flicking produces a projectile.

Landing a hit produces sound, particles, points, and feedback on both devices.

### Chaotic but readable

The game should produce surprising collisions and funny moments without becoming visually incomprehensible.

Players must always be able to identify:

* Their character
* Their color
* Their score
* Their aim
* Their current projectile
* Whether their throw was accepted
* Who is winning

### Friendly

The tone is competitive but playful.

The experience should resemble a cartoon office battle, not realistic violence.

Characters react dramatically but are never injured.

Objects burst, bounce, crack, and fly apart in exaggerated ways.

### Replayable

A round should be short enough that losing does not feel frustrating.

Players should immediately understand how they could perform better next time.

The strongest success signal is not completing one match.

It is someone pressing:

> **Play Again**

---

## 6. The first game mode

The first and only required game mode is **Office Mayhem**.

Two to four players occupy stations around a chaotic office arena.

Players throw office objects at one another and destroy props to earn points.

The match lasts 60 seconds.

The player with the highest score wins.

### Player actions

Each player can:

* Drag horizontally on the controller to aim
* Flick the phone forward to throw
* Tap the Throw button as a fallback
* See their next projectile
* Watch their score and cooldown

Players do not walk around the arena in the first version.

Each player remains attached to a station.

This keeps the controls focused entirely on aiming and throwing.

### Arena stations

For two players:

* Lower left
* Lower right

For three players:

* Lower left
* Lower right
* Upper center or upper left

For four players:

* Lower left
* Lower right
* Upper left
* Upper right

Every station has its own constrained aiming arc so players naturally throw toward the arena.

---

## 7. Control philosophy

The previous motion-based aiming system was too ambiguous.

Players did not know whether they should tilt, rotate, point, or swing their phones.

Flick Arena therefore uses a hybrid control system.

### Aim

Players drag across a large horizontal aiming surface on their phone.

The input is absolute:

* Far left represents the minimum angle
* Center represents the neutral angle
* Far right represents the maximum angle

The chosen aim remains after the player releases their finger.

The shared screen displays a matching trajectory preview in real time.

### Throw

Players perform a short, controlled forward phone flick.

The gesture affects throw intensity but not aim direction.

Players should not make large swings.

The instruction is:

> Hold your phone securely and make a short forward throwing motion.

### Throw button

Every controller includes a large Throw button.

The button is not a developer fallback or accessibility afterthought.

It is a supported input method for:

* Browsers that block sensors
* Devices with unreliable motion data
* Players who prefer touch
* Players with limited movement
* Debugging
* Safety

The game remains fully playable without motion permissions.

### Calibration

Aiming does not require motion calibration.

Physical flick detection may expose simple sensitivity settings:

* Low
* Normal
* High

Players should never need to tune raw sensor values.

---

## 8. Match structure

### Home

The host sees:

* Flick Arena branding
* A short explanation
* Create Game

### Lobby

The host sees:

* Room code
* QR code
* Connected players
* Player colors
* Ready states
* Start Game

The controller sees:

* Assigned player number
* Assigned color
* Enable Physical Flick
* Drag-to-aim tutorial
* Practice throw
* Ready button

A player may become ready even when motion access is unavailable.

### Countdown

The arena displays:

```text
3
2
1
FLICK!
```

Gameplay input is ignored until the countdown ends.

The countdown must include strong audio and visual feedback.

### Match

The game runs for 60 seconds.

The host displays:

* Timer
* Player scores
* Player identities
* Aim trajectories
* Current projectiles
* Impact feedback
* Prop states

### Final moments

The final ten seconds should feel more intense.

Possible treatment:

* Music accelerates
* Timer grows larger
* Arena lighting changes
* Score differences become more visible
* Final three seconds receive distinct sounds

This should not alter core rules or create unfair randomness.

### Results

The results screen displays:

* Winner
* Ranking
* Score
* Hits
* Props destroyed
* Throws
* Accuracy, if tracked reliably

The screen includes:

* Play Again
* Back to Lobby

Players must remain connected between rounds.

---

## 9. Projectile design

The first version uses three throwable objects.

### Paper ball

Character:

* Fast
* Light
* Frequent
* Easy to understand

Gameplay:

* Low impact
* Low score
* Mild bounce
* Useful for rapid attacks

Suggested player-hit score:

```text
+50
```

### Coffee mug

Character:

* Balanced
* Heavier than paper
* Visually satisfying
* Breakable

Gameplay:

* Medium speed
* Medium impact
* Medium score
* Ceramic break effect on strong collision

Suggested player-hit score:

```text
+100
```

### Stapler

Character:

* Heavy
* Slow
* Dangerous
* Comedic

Gameplay:

* Strong impact
* Strong camera shake
* High score
* Lower bounce
* More dramatic sound

Suggested player-hit score:

```text
+150
```

Every projectile should feel different without requiring players to read statistics.

The differences must be visible through:

* Size
* Speed
* Rotation
* Sound
* Trail
* Impact
* Camera response

---

## 10. Destructible office props

The arena should contain recognizable office objects:

* Monitor
* Printer
* Potted plant
* Water cooler
* Document stack

Props can take damage and eventually break.

Breaking a prop awards points.

Destruction should use controlled visual tricks:

* Damaged texture states
* Cracks
* Tint flashes
* Shaking
* Particles
* Temporary debris
* Sound
* Object disappearance

Flick Arena does not require fully simulated destruction or fractured geometry.

The objective is satisfying feedback, not engineering a destruction simulator.

---

## 11. Scoring philosophy

Scoring must be easy to understand.

Players earn points by:

* Hitting opponents
* Destroying office props

The host is authoritative.

Controllers never decide:

* Whether a collision occurred
* How many points were earned
* Which projectile was thrown
* Which object was hit

A projectile cannot repeatedly score against the same target.

The game should reward deliberate throws more than projectile spam.

If spam becomes dominant, balance using:

* Throw cooldown
* Projectile speed
* Projectile frequency
* Limited heavy-object frequency
* Smaller scores for paper balls

Do not introduce complex combos until the basic scoring loop has been playtested.

---

## 12. Game feel

Flick Arena will succeed or fail based on game feel.

Every accepted throw should produce:

* Immediate phone feedback
* A visible launcher reaction
* A distinct launch sound
* Projectile rotation
* A readable trajectory
* A short trail

Every hit should produce:

* Impact sound
* Particle burst
* Target flash
* Short knockback animation
* Floating score
* Camera shake proportional to impact
* Attacker feedback
* Target feedback

Every destroyed prop should produce:

* Strong break sound
* Debris
* Score popup
* Brief arena reaction

The game should exaggerate actions.

Small inputs should create clear outcomes.

Players should never wonder whether their action registered.

---

## 13. Visual identity

The visual direction is:

> Bright arcade chaos inside a stylized office.

The palette is anchored around player colors:

* Blue
* Red
* Green
* Yellow

The office environment should use neutral backgrounds so players and projectiles remain readable.

The style should be:

* Cartoon-like
* Bold
* Friendly
* High contrast
* Slightly exaggerated
* Clean enough for laptop screens

Avoid:

* Realistic violence
* Dark military aesthetics
* Excessively detailed backgrounds
* Thin UI elements
* Tiny text
* Overwhelming particles
* Generic developer placeholder styling

Placeholder vector graphics are acceptable during development, but the final submission must feel visually consistent.

Every asset should appear to belong to the same game.

---

## 14. Player characters

Player characters may be expressive blobs, office workers, or launcher-like mascots.

They should be simple enough to read at a distance.

Each character needs:

* Idle animation
* Aim animation
* Throw animation
* Hit reaction
* Recovery animation
* Winner celebration
* Losing reaction

Player colors must remain identifiable even during effects.

Do not rely only on color. Also show:

* Player number
* Station shape
* Icon
* Label

This improves accessibility and readability.

---

## 15. Controller experience

The phone controller should feel like a real game controller, not an engineering dashboard.

The primary interface includes:

* Player number
* Player color
* Connection status
* Score
* Timer
* Current projectile
* Next projectile
* Aim surface
* Aim direction
* Throw button
* Cooldown
* Short physical-flick instruction

Technical diagnostics belong in a collapsed Debug section.

The normal player should never see:

* Raw acceleration arrays
* WebSocket payloads
* Orientation axes
* Sensor sampling intervals
* Internal player IDs
* Durable Object state

The controller must work in portrait orientation and support one-handed aiming where possible.

---

## 16. Onboarding

Onboarding should be interactive and shorter than 20 seconds.

### Step one: Aim

Display:

> Drag the marker left and right.

Require the player to move through a meaningful range.

The host trajectory should move immediately.

### Step two: Throw

Display:

> Make a short forward flick with your phone.

Also display:

> Or tap Throw.

The step completes when the host accepts a throw.

### Step three: Ready

Display:

> You’re ready to play.

Returning players may skip the tutorial.

A Replay Tutorial option remains available.

---

## 17. Sound and haptics

Audio is essential to perceived polish.

Required sounds:

* UI click
* Player join
* Player ready
* Countdown
* Round start
* Paper throw
* Mug throw
* Stapler throw
* Light impact
* Heavy impact
* Prop break
* Final countdown
* Round end
* Winner sting

Sound must be unlocked after a host interaction to respect browser autoplay rules.

The host includes a mute control.

Phone haptics should be used where supported:

* Throw accepted: short pulse
* Hit confirmed: medium pulse
* Player hit: double pulse
* Match start: short pulse
* Match end: longer pulse

The game must remain understandable when vibration is unavailable.

---

## 18. Technical architecture

### TanStack Start

Owns:

* Routes
* Pages
* Server endpoints
* Host shell
* Controller shell
* Lobby UI
* Results UI
* Error states

### React

Owns:

* Product interface
* Lobby state presentation
* Controller interface
* Menus and overlays

React must not update every game frame.

### Phaser

Owns:

* Host rendering
* Physics
* Arena
* Players
* Projectiles
* Props
* Collisions
* Effects
* Camera
* Sound
* Match visuals

Phaser must load only in the browser and never execute during server-side rendering.

### Cloudflare Worker

Owns:

* Application deployment
* HTTP routing
* Room creation
* WebSocket upgrade routing

### Durable Objects

Each room maps to one Durable Object.

The room owns:

* Host connection
* Up to four controller connections
* Player slot assignment
* Player colors
* Ready states
* Session recovery
* Validated message relay
* Host-to-controller feedback

The Durable Object does not own:

* Physics
* Rendering
* Collision detection
* Scoring decisions
* Game loops

### Host browser

The host is authoritative for gameplay.

It owns:

* Match state
* Timer
* Physics
* Scores
* Projectile creation
* Collision results
* Prop states
* Final standings

### Phone controller

The phone owns:

* Touch aim
* Motion-event reading
* Flick detection
* Sensitivity
* Input throttling
* Haptics
* Local controller UI

---

## 19. Reliability requirements

Flick Arena must degrade gracefully.

If physical motion does not work:

> The Throw button works.

If vibration does not work:

> Visual feedback remains clear.

If a player briefly disconnects:

> Their slot is preserved for a short grace period.

If a player reconnects:

> They reclaim their color and station.

If the fifth controller joins:

> They receive a friendly room-full message.

If the host disconnects:

> Controllers receive a clear notification.

If a phone sleeps or changes tabs:

> Reconnection is attempted.

If a browser blocks sensor APIs:

> The player can still complete onboarding and play.

---

## 20. Performance requirements

The host should run smoothly on an ordinary modern laptop.

The game must:

* Use one Phaser game loop
* Avoid React updates every frame
* Limit projectiles
* Limit particles
* Limit debris
* Destroy expired physics bodies
* Clean up event listeners
* Clean up WebSocket handlers
* Reuse textures
* Avoid excessive allocations
* Prevent objects from accumulating between rounds

The game should prioritize stable responsiveness over visual excess.

A consistent 60 FPS is ideal.

A stable 30 FPS is better than unstable effects-heavy gameplay.

---

## 21. Privacy and accessibility

Flick Arena should require:

* No account
* No name
* No email address
* No contact access
* No camera access after QR scanning
* No microphone
* No persistent personal information

Room data is temporary.

Player sessions should contain only what is needed for reconnection.

Accessibility considerations include:

* Throw button fallback
* Large touch targets
* High contrast
* Player numbers in addition to colors
* Mute control
* Reduced-motion option if feasible
* Clear error messages
* No requirement for large physical gestures

---

## 22. What Flick Arena is not

Flick Arena is not currently:

* An online matchmaking game
* A remote multiplayer platform
* A game engine for third-party developers
* A user-generated game platform
* An AI-generated game
* A virtual reality experience
* A native phone application
* A competitive esport
* A social network
* A persistent progression system
* A marketplace
* A collection of ten unfinished minigames

The first objective is one excellent local multiplayer game.

---

## 23. Scope for the hackathon

The hackathon version must include:

* Public working deployment
* Browser-based host
* QR joining
* Two to four controllers
* Unique player assignments
* Drag-to-aim controls
* Physical flick input
* Throw button fallback
* Phaser-based office arena
* Three projectile types
* Opponent collisions
* Destructible props
* Scoring
* 60-second matches
* Countdown
* Results
* Play Again
* Sound
* Particles
* Camera effects
* Clear onboarding
* iPhone Safari support
* Android Chrome support
* Honest fallback for unsupported browsers

Anything beyond this list must justify delaying polish.

---

## 24. Definition of polished

The game is not polished merely because all features exist.

It is polished when:

* A new player joins without verbal assistance
* The controls are understood within seconds
* The trajectory reacts immediately
* Throws consistently register
* The three projectile types feel different
* Hits are satisfying
* Scores are readable
* The round starts and ends cleanly
* Reconnection does not destroy the experience
* The game does not visibly lag
* The controller does not look like a diagnostic page
* The arena has one cohesive art direction
* Sound and effects reinforce every action
* Errors have human-readable explanations
* Players ask to play again

Polish is primarily the removal of confusion, delay, inconsistency, and dead moments.

---

## 25. Playtesting standard

Do not evaluate the game only as its developer.

Test with at least three types of players:

* Someone technical
* Someone who casually plays games
* Someone who rarely plays games

During testing, do not explain the controls unless they become completely stuck.

Observe:

* How long joining takes
* Whether they notice the Ready button
* Whether they understand dragging
* Whether they understand flicking
* Whether they watch the host or phone
* Whether they know when a throw registers
* Whether scores make sense
* Whether they know why they won or lost
* Whether they request another round

After each session, fix the three biggest sources of confusion before adding features.

---

## 26. Hackathon positioning

Flick Arena belongs in **Apps for Your Life**.

The submission should position it as entertainment and social play:

> Flick Arena turns phones people already own into instant motion controllers for shared-screen party games, with no downloads, accounts, consoles, or dedicated hardware.

The technical story includes:

* Browser motion sensors
* Cross-device input
* Real-time WebSockets
* Durable Object room coordination
* Phaser physics
* Mobile browser compatibility
* Host-authoritative gameplay
* Graceful sensor fallbacks

The product story includes:

* Less setup
* Lower hardware barriers
* Physical in-person play
* Immediate social interaction
* Accessibility for casual players

Do not claim the underlying phone-controller concept has never existed.

Claim that Flick Arena provides a modern, polished, browser-first implementation with instant onboarding and a distinctive physical party-game experience.

---

## 27. Codex collaboration story

The repository and README should clearly document how Codex contributed.

Examples include:

* Scaffolding the TanStack Start and Cloudflare architecture
* Implementing Durable Object room coordination
* Building typed WebSocket protocols
* Creating the Phaser migration
* Debugging motion sensors across browsers
* Designing the hybrid aim-and-flick controls
* Generating tests
* Reviewing performance
* Refining the controller UX
* Iterating based on real playtest findings

The narrative should also show human decisions:

* Rejecting ambiguous tilt-based aiming
* Choosing drag-to-aim and flick-to-throw
* Keeping a Throw fallback
* Limiting the first version to one arena
* Prioritizing game feel over feature count
* Keeping gameplay host-authoritative
* Avoiding forced AI features inside the product

Codex accelerated implementation.

The product direction, tradeoffs, and quality bar remained deliberate human choices.

---

## 28. Demo video vision

The demo must communicate Flick Arena in seconds.

### Opening

Show a laptop with the Flick Arena lobby.

Say:

> Flick Arena turns any phone into a motion controller for a shared-screen party game. No app, account, console, or dedicated controller is required.

### Joining

Show two or more people scanning the QR code.

Show their colors appearing immediately.

### Controls

Show:

* A player dragging to aim
* The trajectory moving on the laptop
* A physical flick
* An object launching into the arena

### Gameplay

Show:

* Multiple players throwing
* A mug hitting an opponent
* A stapler breaking a monitor
* Score changes
* Phone feedback
* Final countdown
* Winner screen
* Play Again

### Technical explanation

Briefly show:

* TanStack Start
* Phaser
* Durable Objects
* WebSockets
* Codex workflow

Do not let technical explanation dominate the actual experience.

The game must sell itself visually.

---

## 29. Future direction

Only after the first game is polished should Flick expand.

Possible future directions:

### Additional arenas

* Kitchen Chaos
* Classroom Clash
* Garage Mayhem
* Space Station
* Pirate Ship

### Additional game modes

* Knockout
* Cooperative survival
* Target challenge
* Team battle
* Boss fight
* Trick-shot mode

### Commercial direction

* Paid party packs
* Event passes
* Company-branded arenas
* Venue subscriptions
* Classroom experiences
* Conference installations
* Developer SDK

None of these should dilute the first objective:

> Make Office Mayhem genuinely fun.

---

## 30. Final north star

Every decision should be evaluated against one question:

> Does this make it easier and more enjoyable for a group to pick up their phones and immediately play together?

If a feature adds complexity without improving that experience, remove it.

If an effect looks impressive but hides gameplay, reduce it.

If motion controls feel novel but unreliable, provide a better fallback.

If the game works technically but players are confused, it is not finished.

If players understand it, laugh, compete, and press Play Again, Flick Arena is working.

## Final pitch

> **Flick Arena is a browser-based local multiplayer party game where players scan a QR code, drag to aim, and physically flick their phones to throw objects across a shared arena—without installing an app or buying controllers.**
