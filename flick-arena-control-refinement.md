Continue developing the existing **Flick Arena** project.

The current controller scheme uses phone orientation to aim and a physical phone flick to throw. In real-device testing, motion-based aiming is confusing, unstable, and difficult to understand across different phones.

Replace the primary aiming interaction with a clearer hybrid control scheme:

> **Drag on the phone screen to aim. Physically flick the phone forward to throw.**

Do not re-scaffold the application or replace the existing architecture.

# Main objective

Make the controller immediately understandable:

* Drag horizontally to adjust aim.
* Release the drag without firing.
* Physically flick the phone forward to throw using the current aim.
* Provide a large **Throw** button as a fallback.
* Show the same aim direction on both the phone and host screen.
* Do not require phone orientation for normal aiming.

The player should understand the controls within five seconds.

# Preserve existing architecture

Keep:

* TanStack Start
* React
* TypeScript
* Phaser
* Cloudflare Workers
* Cloudflare Durable Objects
* Native WebSockets
* Existing room and player assignment
* Existing physical flick detection
* Existing projectile systems
* Existing match lifecycle
* Existing Zod validation
* Existing phone motion permission flow where needed for flick detection

Do not introduce:

* New backend services
* WebRTC
* Socket.IO
* Native applications
* Additional game frameworks
* AI features
* A virtual joystick library

# New control scheme

## Aim

Aim using a horizontal touch surface on the phone controller.

The controller should contain a large dedicated area labeled:

```text
DRAG TO AIM
```

Behavior:

* Drag left to aim further left.
* Drag right to aim further right.
* The aim remains at its last position after the finger is released.
* Releasing the finger must not throw.
* Multi-touch gestures should be ignored.
* Prevent the page from scrolling or zooming while interacting with the aim surface.
* Use Pointer Events when available so the same implementation supports touch and mouse debugging.

The controller sends normalized aim values:

```ts
type AimInputMessage = {
  type: "aim";
  normalizedAim: number;
  timestamp: number;
};
```

Where:

```text
-1 = minimum allowed angle
 0 = center/default angle
 1 = maximum allowed angle
```

Clamp all values to `-1` through `1`.

Do not send raw screen coordinates to the host.

## Throw

Throw using either:

1. A physical forward phone flick
2. A large on-screen **THROW** button

Both should use the current aim.

The physical flick remains the signature interaction.

The Throw button is a fully supported fallback, not merely a hidden debug tool.

The Throw button should:

* Be large enough to press with one thumb.
* Be visually disabled during cooldown.
* Display cooldown progress.
* Trigger the same message and game behavior as a physical flick.
* Use a default intensity such as `0.75`.
* Provide immediate visual feedback.
* Vibrate where supported.

Example:

```ts
{
  type: "flick",
  intensity: 0.75,
  source: "button",
  timestamp: Date.now()
}
```

Physical flick example:

```ts
{
  type: "flick",
  intensity: detectedIntensity,
  source: "motion",
  timestamp: Date.now()
}
```

Add the source field to the relevant schema and types.

The host should treat both input sources identically after validation.

# Remove motion-based aiming from normal gameplay

Stop using `DeviceOrientationEvent` as the normal aiming input.

The controller should no longer require orientation permission to aim.

Motion permission should only be needed for physical flick detection through `DeviceMotionEvent`.

Requirements:

* Remove orientation listeners from the main controller path.
* Remove orientation calibration from the required onboarding flow.
* Remove orientation values from the primary controller UI.
* Remove orientation messages from the active realtime protocol.
* Preserve any useful orientation diagnostics only inside an optional development-only debug panel.
* Remove unused orientation code after confirming no other feature depends on it.

Do not leave two competing aiming systems active.

An optional experimental motion-aim mode may exist only behind a development flag, but it must not appear in the normal production interface.

# Controller layout

Redesign the phone controller for portrait orientation.

Suggested layout:

```text
┌──────────────────────────┐
│ P1 • BLUE        00:42   │
│ Score: 350               │
│                          │
│ Current: STAPLER         │
│                          │
│     ↖    ↑    ↗          │
│        AIM: 34°          │
│                          │
│ ┌──────────────────────┐ │
│ │                      │ │
│ │     DRAG TO AIM      │ │
│ │                      │ │
│ │   ←──────────────→   │ │
│ │          ●           │ │
│ └──────────────────────┘ │
│                          │
│  FLICK PHONE TO THROW    │
│                          │
│ ┌──────────────────────┐ │
│ │        THROW         │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

The primary screen should show:

* Player number
* Player color
* Connection state
* Match phase
* Score
* Match timer
* Current projectile
* Current aim
* Large drag-to-aim surface
* Physical flick instruction
* Large Throw button
* Cooldown indicator

Keep technical values inside a collapsible Debug section.

# Aim surface behavior

Implement the aim surface using Pointer Events:

* `pointerdown`
* `pointermove`
* `pointerup`
* `pointercancel`

Call `setPointerCapture()` during an active drag where supported.

Use:

```css
touch-action: none;
user-select: none;
overscroll-behavior: contain;
```

The drag should work in either of these modes:

## Preferred mode: absolute position

Map the pointer’s horizontal position inside the aim surface directly to `-1` through `1`.

Example:

```ts
normalizedAim =
  ((pointerX - surfaceLeft) / surfaceWidth) * 2 - 1;
```

This is easier to understand than relative dragging because the player can tap or drag directly to an aim position.

Add:

* A visible center marker
* A visible aim handle
* Left and right limits
* A highlighted trajectory direction
* Optional light snapping around the neutral center

Use a small center dead zone only if it improves control.

Do not add inertial scrolling or momentum to the aim handle.

# Network behavior

Replace orientation messages with aim messages.

Controller-to-room protocol:

```ts
type ControllerToRoomMessage =
  | {
      type: "aim";
      normalizedAim: number;
      timestamp: number;
    }
  | {
      type: "flick";
      intensity: number;
      source: "motion" | "button";
      timestamp: number;
    }
  | {
      type: "ready";
      ready: boolean;
    }
  | {
      type: "motion-status";
      enabled: boolean;
    };
```

Room-to-host controller input:

```ts
type ControllerInput =
  | {
      type: "aim";
      normalizedAim: number;
      timestamp: number;
    }
  | {
      type: "flick";
      intensity: number;
      source: "motion" | "button";
      timestamp: number;
    };
```

Validation requirements:

* `normalizedAim` must be finite and between `-1` and `1`.
* `intensity` must be finite and between `0` and `1`.
* Reject unknown input sources.
* Reject stale or malformed messages.
* Preserve existing payload-size limits.
* Do not trust player IDs supplied by the controller.
* Continue attaching the player ID inside the Durable Object.

Throttle aim messages to at most approximately 15 messages per second.

Also send when:

* The value changes by a meaningful threshold, such as `0.015–0.025`
* The drag ends
* A maximum interval has passed without an update

Do not send aim updates every animation frame.

# Phaser integration

Update Phaser so each player’s aim is controlled by `normalizedAim`.

Each player station should define:

```ts
type AimConfig = {
  minAngle: number;
  maxAngle: number;
  defaultAngle: number;
  invertInput?: boolean;
};
```

Convert normalized aim into an angle:

```ts
function normalizedAimToAngle(
  normalizedAim: number,
  config: AimConfig
): number {
  const t = (normalizedAim + 1) / 2;
  const angle =
    config.minAngle +
    t * (config.maxAngle - config.minAngle);

  return config.invertInput ? -angle : angle;
}
```

Adjust the calculation for the project’s actual coordinate system.

Requirements:

* Aiming should feel visually consistent from every player station.
* Dragging right should move the host trajectory in the direction the player expects.
* Mirror or invert input for stations facing the opposite direction where necessary.
* Keep each player’s valid aiming arc constrained.
* Smooth the host aim slightly, but do not add noticeable lag.
* The trajectory preview should update immediately while dragging.
* Throwing should use the most recently received aim value.
* A throw must not alter the current aim.

Do not use phone orientation anywhere in the Phaser aiming path.

# Controller aim preview

Show a lightweight visual aim preview on the phone.

It may be:

* A rotating arrow
* A small launcher illustration
* A curved trajectory line
* A numerical angle combined with an arrow

The visual should clearly change while the player drags.

Use the same normalized aim value that is transmitted to the host.

Do not attempt to render the entire arena on the phone.

# Host visual feedback

Make the relationship between phone input and host output obvious.

Each player station on the host should display:

* A colored aim line or dotted trajectory
* Player number
* Current projectile
* Cooldown state

While the player is actively dragging:

* Brighten the trajectory preview
* Optionally show a small aiming indicator above the player

When the drag ends:

* Return the trajectory to its normal visual state
* Preserve the selected angle

Consider adding controller messages for drag state only if it materially improves feedback. Otherwise, keep it client-side.

# Physical flick detection

Preserve physical flick detection but simplify its responsibility.

It should only answer:

> Did the user make a deliberate short forward throwing motion?

It should not influence aim.

Requirements:

* Continue reading `DeviceMotionEvent`.
* Use `acceleration` when available.
* Fall back to `accelerationIncludingGravity`.
* Keep a configurable threshold.
* Keep a cooldown of approximately 500–800 ms.
* Ignore repeated spikes during cooldown.
* Normalize detected strength into `0–1`.
* Show accepted physical throws clearly.
* Keep raw diagnostics inside the Debug panel.
* Do not fire while the match is not in the playing phase.
* Do not fire while the player is already on cooldown.

Add an optional sensitivity control in Debug mode:

```text
Low
Normal
High
```

Internally map this to clearly named threshold configurations.

Do not expose arbitrary raw numeric tuning to normal users.

# Motion onboarding

Replace the previous calibration flow.

New flow:

1. Player joins the room.
2. Player receives a color.
3. Player sees the aim surface immediately.
4. Player taps **Enable Physical Flick**.
5. Request motion permission where required.
6. Player performs one practice flick.
7. The controller confirms the practice throw.
8. Player presses Ready.

A player who denies motion permission should still be able to play using the Throw button.

Do not block the Ready button solely because motion permission was denied.

Show:

```text
Physical flick enabled
```

or:

```text
Physical flick unavailable — use the Throw button
```

This fallback is important for Brave, unsupported Android browsers, and devices with restricted sensors.

# Interactive tutorial

Add a short first-time tutorial on the controller.

## Step 1: Aim

Instruction:

```text
Drag the marker left and right.
```

Require the player to move the aim through a meaningful range.

Show immediate host and phone feedback.

## Step 2: Throw

Instruction:

```text
Make a short forward flick with your phone.
```

Also display:

```text
Or tap THROW
```

Complete the step when either method successfully sends an accepted throw.

## Step 3: Ready

Show:

```text
You’re ready to play.
```

Store tutorial completion locally so returning players can skip it.

Include a **Replay Tutorial** option in settings or debug UI.

Keep the tutorial under approximately 20 seconds.

# Copy and terminology

Use consistent language everywhere:

* **Drag to aim**
* **Flick to throw**
* **Tap Throw if motion is unavailable**

Do not use vague instructions such as:

* Move your phone
* Point your phone
* Rotate your phone
* Swing to aim
* Tilt to aim

The physical motion instruction should be:

> Hold the phone securely and make a short forward throwing motion.

Include a brief safety note:

> Keep a firm grip on your phone and leave space around you.

Do not encourage players to make large or forceful swings.

# Desktop and browser debugging

Add mouse support for the controller aim surface.

Desktop controller testing should allow:

* Mouse drag to aim
* Throw button to throw
* Existing keyboard host controls
* Optional keyboard shortcut on the controller page for a test throw

Preserve host keyboard mappings.

Add development diagnostics for:

* Last aim value
* Aim messages per second
* Current Phaser aim angle
* Last throw source
* Physical motion event count
* Last acceleration magnitude
* Cooldown remaining

# Remove obsolete UI

Remove or demote:

* Motion-based aim calibration
* Live orientation angle as a primary value
* Instructions to tilt for aiming
* Orientation permission as a prerequisite
* Any “Tilt to aim” copy
* Any UI that implies the phone should be pointed at the shared display

Search the repository for all obsolete copy and update it consistently.

# Implementation order

## Milestone 1: Protocol migration

* Add the `aim` message.
* Add `source` to flick messages.
* Update Zod schemas.
* Update Durable Object relay logic.
* Preserve temporary backward compatibility only if needed during migration.
* Remove backward compatibility once both clients are updated.

## Milestone 2: Controller aim surface

* Build the drag surface.
* Add normalized value mapping.
* Add aim handle and arrow.
* Add throttled network sending.
* Add mouse debugging support.

Verify the host receives stable `-1` to `1` values.

## Milestone 3: Phaser aim mapping

* Map normalized aim to each station’s allowed angle.
* Handle mirrored stations.
* Update trajectory previews.
* Preserve the selected aim after release.

Verify each player’s direction behaves intuitively.

## Milestone 4: Throw button

* Add a large production-ready Throw button.
* Route it through the same validated input flow.
* Add cooldown.
* Add acknowledgment.
* Add visual and haptic feedback.

Verify the game remains fully playable without motion sensors.

## Milestone 5: Physical flick cleanup

* Remove orientation dependency.
* Keep DeviceMotion-only detection.
* Add sensitivity presets.
* Verify physical flick uses the current touch-selected aim.

## Milestone 6: Tutorial and copy

* Add the short interactive tutorial.
* Update all instructions.
* Add safety text.
* Store tutorial completion locally.

## Milestone 7: Cleanup

* Remove obsolete orientation aiming code.
* Remove unused calibration state.
* Remove old protocol types.
* Remove dead tests.
* Remove conflicting UI.

## Milestone 8: Verification

* Run build.
* Run typecheck.
* Run tests.
* Test controller with mouse.
* Test physical flick on available devices.
* Test denied motion permission.
* Test unsupported motion browser.
* Test multiple players aiming simultaneously.
* Update README.

# Tests

Add or update tests for:

* Pointer position to normalized aim conversion
* Aim clamping
* Aim throttling
* Meaningful-change threshold
* Aim-to-angle mapping
* Mirrored player station mapping
* Flick source validation
* Button throw default intensity
* Throw cooldown
* Physical flick cooldown
* Playing without motion permission
* Updated protocol validation
* Correct player ID routing
* Simultaneous independent player aim values

Remove tests that only apply to the obsolete motion-aim system.

# Acceptance criteria

The implementation is complete when:

1. Players no longer use phone orientation to aim.
2. Dragging on the phone changes aim smoothly.
3. The phone displays a clear aim preview.
4. The host displays the matching trajectory.
5. Releasing the drag does not throw.
6. The selected aim remains after release.
7. A physical forward flick throws using the current aim.
8. The Throw button throws using the current aim.
9. Motion permission denial does not prevent gameplay.
10. The controller works in browsers that block motion sensors.
11. Aim values are throttled and validated.
12. Each player controls only their own aim.
13. Opposite-side player stations map controls intuitively.
14. The throw cooldown works for both motion and button input.
15. The tutorial clearly teaches aiming and throwing.
16. All “Tilt to aim” language has been removed.
17. Obsolete orientation-aim code has been deleted.
18. Build passes.
19. Typecheck passes.
20. Tests pass.
21. Cloudflare deployment still works.
22. Existing room, match, scoring, and Phaser functionality remains intact.

# Final response

After implementation:

1. Summarize the control-system changes.
2. List obsolete motion-aim code that was removed.
3. Explain the new aim mapping.
4. Explain how physical flick and button throwing share the same path.
5. Report build, typecheck, and test results.
6. Explain how to test without phone sensors.
7. Explain how to test physical flick on Android and iPhone.
8. Mention any browser-specific limitations honestly.
9. Do not claim real-device testing unless it was actually performed.
10. Do not stop after updating UI copy; implement the complete end-to-end control change.

The final production control scheme must be:

> **Drag to aim. Flick to throw. Tap Throw as a fallback.**
