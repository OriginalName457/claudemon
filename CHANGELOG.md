# Changelog

All notable changes to Claudemon are noted here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [Unreleased]
- 🌐 **Clawland multiplayer** — authoritative server + netcode client are built and tested; hosting TBD. *(coming soon)*

## [1.0.0] — 2026-08-09
First public release. 🦀

### The pet
- Tamagotchi × Digimon pixel pet that lives in Claude Code via an MCP server (zero dependencies).
- Real-time stat decay (fullness / hydration / energy / happiness), care tracking, XP, and branching evolution.
- In-editor statusline pet + a localhost "tank" view where the creature wanders.

### Clawland (the game)
- A single-player **.io-style crab brawler** reachable from the app: eat to grow (🐣→🥉→🥈→🥇), level up to unlock moves, evolve, and capture nodes to found a clan and hold territory against rival clans + the Corrupted.
- **Per-Claudemon meta-progression** — each creature levels up across runs and earns attribute points (one per 10 levels) to spend permanently.
- **Attack editor** — position each move's left/right swing per aim direction; procedural attack VFX (slash / hook / pincher / bite / bash) tinted per element.
- **Procedural sound effects** (Web Audio, no audio files) for attacks, hits, eating, level-ups, evolutions, captures, and more — with a mute toggle.
- Chunk-streamed procedural terrain, clan dens/leaders, diplomacy (Charm/Wit drive recruitment & alliances), an OSRS-style stats panel, a clan-members tab, and a one-time tutorial.
- Clean **enter / exit** game mode from anywhere in the app.
