# Flick Arena

## Register

product

## Users

Casual in-person groups of two to four players: friends, families, students, coworkers, event attendees, and people who may not identify as gamers. A host uses a laptop or shared display while each player uses their own phone as a controller. The primary job is to join quickly, understand the controls without verbal coaching, and share a physical, social game around one screen.

## Product Purpose

Flick Arena turns ordinary phones into browser-based motion controllers for a shared office-battle party game. A group should move from opening the host page to a first throw in under one minute, without downloads, accounts, controller pairing, or special hardware. Success means the technology disappears, inputs feel immediate and trustworthy, the match remains readable amid the chaos, and players choose Play Again.

## Brand Personality

Playful, physical, and instantly understandable. The tone is competitive without hostility: bright arcade chaos in a friendly stylized office, with exaggerated reactions and clear feedback rather than realistic violence.

## Anti-references

- Engineering dashboards, sensor readouts, raw protocol details, or developer-placeholder UI in the normal player experience.
- Dark military styling, realistic violence, gritty destruction, or anything that makes the office battle feel threatening.
- Dense or excessively detailed backgrounds, tiny text, thin controls, particle overload, or effects that obscure players, aim paths, projectiles, and scores.
- Traditional-controller assumptions, lengthy instructions, forced motion permissions, and setup flows that require host coaching.
- Feature sprawl, persistent progression, online matchmaking, and unfinished extra modes that delay one polished Office Mayhem experience.

## Design Principles

1. **Get to the first throw fast.** Every screen should shorten or clarify the path from room creation to play.
2. **Make every input undeniable.** Aim, accepted throws, hits, cooldowns, scoring, and connection changes need immediate, redundant feedback.
3. **Keep eyes on the shared arena.** The phone is a glanceable controller, not a second game screen or diagnostic console.
4. **Create readable chaos.** Exaggerate action while preserving each player's identity, trajectory, projectile, score, and match status.
5. **Degrade gracefully.** Touch throwing, visual feedback, reconnection, and human-readable errors keep the game playable when sensors, haptics, audio, or networking are imperfect.

## Accessibility & Inclusion

Target WCAG 2.2 AA for the React interface. Keep large touch targets, high contrast, visible keyboard focus, a large Throw-button fallback, and clear errors. Never rely on color alone: pair player color with number, label, and station identity. Physical motion is optional, short, and safety-conscious. The experience must remain understandable without vibration or sound and should honor reduced-motion preferences where feasible.
