# Flick Arena

Flick Arena is a local multiplayer office battle. One laptop renders the Phaser game; two to four phones join the room over WebSockets and become tilt-and-flick controllers.

The host owns the match, physics, scoring, and results. The Durable Object only owns room membership, player slots, reconnection grace, and validated message relay.

## Local desktop test

```bash
pnpm install
pnpm dev
```

1. Open `http://localhost:3000` and click **Create Game**.
2. Open the controller URL in two to four additional desktop tabs.
3. Use the controller **Show Debug Panel → Test Flick** button or the keyboard fallback to verify input.
4. Mark at least two controllers ready, then start the round on the host.
5. Test the 3-2-1-FLICK countdown, the 60-second timer, the scoreboard, and **Play Again**.

Keyboard fallback:

- Player 1: `A` / `D` aim, `W` or `Space` throw
- Player 2: `Left` / `Right` aim, `Arrow Up` throw
- Player 3: `J` / `L` aim, `I` throw
- Player 4: `Numpad 4` / `Numpad 6` aim, `Numpad 8` throw

Development builds also allow a one-player demo round.

## Test with iPhone or Android controllers

Motion sensors require a secure context. Deploy the worker, or expose the app through an HTTPS development tunnel that is reachable from the phone.

```bash
pnpm cf-typegen
pnpm deploy
```

1. Open the deployed HTTPS URL on the laptop and create a game.
2. Scan the host QR code with each phone’s camera.
3. On each controller, tap **Enable Motion Controls** and grant permission.
4. Confirm the controller reports **SCREEN AWAKE**. The app requests a Screen Wake Lock automatically after motion controls start.
5. Hold the phone in portrait and tap **Calibrate Phone** while still.
6. Confirm the assigned number/color, then tap **Mark Me Ready**.
7. Start the round on the host. Tilt to aim and flick forward to throw.

The controller stores a room-scoped session ID in `localStorage`, so a refresh can reclaim the same player slot during the approximately 15-second reconnect grace period. A fifth simultaneous controller is rejected.

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm cf-typegen
pnpm deploy
```

The host game uses Phaser `4.2.1` with Phaser Matter Physics. Phaser is imported and initialized only from the client-side effect in `src/components/PhaserGame.tsx`; it is not part of the SSR execution path.

## Device limitations and known rough edges

- iPhone Safari requires motion permission from a direct user gesture and normally requires HTTPS. Permission can need to be granted again after a reload or orientation change.
- The controller requests Screen Wake Lock automatically over HTTPS so supported browsers do not dim or auto-lock during play. Battery saver, low power mode, older browsers, or a browser policy can reject or revoke it; the controller will show a warning and remain usable, but the phone must then be kept awake manually.
- Manually locking the phone or sending the browser to the background pauses reliable motion and WebSocket control. Unlock or return to the controller page to let it reacquire the wake lock; a native app would be required for guaranteed locked-screen control.
- Some iPhone browsers and embedded browsers do not expose `navigator.vibrate`; haptic feedback is optional and fails silently.
- Android motion event names and sensor values vary by browser and device. Chrome over HTTPS is the recommended Android test target.
- Audio is intentionally not required for the playable slice yet; the arena uses Phaser-native visual effects, particles, and camera shake.
- Temporary procedural art is used for the office, props, players, and projectiles. The gameplay is complete enough to test the arena loop, but the art and physics tuning are still prototype quality.

No physical-device test is claimed by this README; verify iPhone and Android behavior on the actual devices you intend to support.
