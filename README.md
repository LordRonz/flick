# Flick

Minimal proof of concept: an iPhone tilts and flicks a physics game running in a laptop browser.

## Local desktop test

```bash
pnpm install
pnpm dev
```

1. Open `http://localhost:3000` and click **Create Game**.
2. On the host screen, verify arrow keys move the launcher and Spacebar launches a projectile.
3. Scan the QR code, or open the controller URL in another browser tab.
4. Press **Test Flick**. A projectile should launch on the host screen and the controller should show **FLICK ACCEPTED**.

## Real iPhone test

1. Create a free Cloudflare account and authenticate Wrangler with `pnpm wrangler login`.
2. Run `pnpm deploy`.
3. Open the resulting `https://...workers.dev` URL on the laptop.
4. Click **Create Game**, then scan the QR code with the iPhone Camera app.
5. Open the link in Safari, tap **Enable Motion Controls**, and grant permission.
6. Tap **Calibrate** while holding the phone upright in portrait.
7. Tilt left and right to move, then make a short forward throwing motion to flick.

Deployment is required because iPhone motion APIs need a secure HTTPS page. Safari may still require motion permission again after a reload or orientation change.

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm cf-typegen
pnpm deploy
```

The Durable Object relays only validated JSON controller messages. The laptop owns rendering, physics, score, target collision, and projectile movement. The Durable Object does not run a game loop.
