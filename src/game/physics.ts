export type Projectile = {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  age: number
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function createProjectile(launcherX: number, launcherY: number, intensity: number): Projectile {
  return {
    x: launcherX,
    y: launcherY - 14,
    vx: intensity * 160,
    vy: -(520 + intensity * 720),
    radius: 7,
    age: 0,
  }
}

export function advanceProjectile(projectile: Projectile, deltaSeconds: number, width: number, height: number) {
  const next = { ...projectile }
  next.age += deltaSeconds
  next.vy += 980 * deltaSeconds
  next.x += next.vx * deltaSeconds
  next.y += next.vy * deltaSeconds
  if (next.x < next.radius) {
    next.x = next.radius
    next.vx = Math.abs(next.vx)
  }
  if (next.x > width - next.radius) {
    next.x = width - next.radius
    next.vx = -Math.abs(next.vx)
  }
  return next.y > height + next.radius || next.age > 6 ? null : next
}

export function hitsTarget(projectile: Projectile, targetX: number, targetY: number, targetRadius: number) {
  const dx = projectile.x - targetX
  const dy = projectile.y - targetY
  const hitDistance = projectile.radius + targetRadius
  return dx * dx + dy * dy <= hitDistance * hitDistance
}
