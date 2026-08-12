---
name: launch-claudemon
description: Launch/activate the Claudemon handheld — opens the pixel-pet window and turns this session into the game, and on first run offers a desktop shortcut. Use when the user says "launch / open / activate / start Claudemon".
---

# Launch Claudemon 🎮

The friendly front door: turn the user's terminal into their Claudemon handheld — the pixel game where they command a crew of specialist agents.

When the user wants to launch / open / activate / start Claudemon:

1. **Confirm first.** Ask plainly: **"🎮 Launch Claudemon? This opens your handheld and turns this terminal into the game."** Wait for a yes.

2. **Call the `launch_claudemon` tool** (from the claudemon plugin's MCP server). It boots the local server if it isn't running and opens the chromeless handheld window. On the user's **first** launch, also offer a desktop shortcut and pass `shortcut: true` only if they say yes.

3. Tell them their handheld is opening and their crew is standing by. 🦀

Keep it warm and short — this is a delightful moment, not a setup wizard. Once launched, the user drives everything from the handheld itself.
