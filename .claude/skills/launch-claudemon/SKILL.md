---
name: launch-claudemon
description: Launch/activate the Claudemon handheld from the terminal — boots the local game server, opens the pixel-pet window (turning this session into the game), and on first run offers to add a desktop shortcut. Use when the user says "launch / open / activate / start Claudemon".
---

# Launch Claudemon 🎮

The friendly front door: turn the user's terminal into their Claudemon handheld — the pixel game where they command a crew of specialist agents (each a real Claude Code session).

When the user wants to launch / open / activate / start Claudemon:

1. **Confirm first.** Ask plainly: **"🎮 Launch Claudemon? This opens your handheld and turns this terminal into the game."** Wait for a yes before doing anything.

2. **Launch it.** From the Claudemon install directory, run:
   ```
   node scripts/launch.js
   ```
   This boots the local game server if it isn't already running and opens the chromeless handheld window. Tell them their handheld is opening and their crew is standing by. 🦀

3. **First-run: offer a shortcut.** If this looks like their first launch (the file `state/.launched` did not exist before step 2), ask: **"🖥️ Want a Claudemon shortcut on your desktop so you can open it any time?"** If yes, run:
   ```
   node scripts/shortcut.js
   ```
   and tell them where the icon landed. (To remove it later: `node scripts/shortcut.js --remove`.)

Keep it warm and short — this is a delightful moment, not a setup wizard. Once launched, the user drives everything from the handheld itself (the Crew tab is their transformed terminal).
