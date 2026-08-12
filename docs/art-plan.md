# Claudemon — Creature Art Plan

**Pipeline:** Sprite-AI (Claude Code MCP) → transparent sprite sheets → `web/assets/` → `manifest.json` → live tank.
**Style:** Classic Digimon / monster — cute AND cool, a "cute-to-cool" digivolution arc. Baby forms are round and adorable; champion/ultimate forms gain horns, armor, spikes, attitude. One consistent lineage (teal shell + orange belly + expressive eyes) that clearly grows up.

**Shared style suffix for every prompt:**
`, pixel art, transparent background, side view, expressive eyes, clean readable silhouette, consistent teal-and-orange palette, Digimon-monster style, game sprite`

**Animations per form:** `idle` (2–4 frames, blink/breathe) and `walk` (4–6 frames). Sheet = rows per anim, frames left-to-right. Export transparent PNG.

## Roster (7 forms across the evolution tree)

| Form | Stage | Size | Prompt (before shared suffix) |
|---|---|---|---|
| **egg** | 0 Egg | 32×32 | teal monster egg with orange spots, tiny cracks, cute, gentle wobble |
| **blip** | 1 Baby | 32×32 | tiny round teal slime-blob baby monster, huge eyes, two little horn nubs, squishy |
| **clawde** | 2 Rookie | 32×32 | cute crab monster, teal shell, orange belly, small horns, big eyes, two friendly claws |
| **prismshell** | 3 Champion (radiant) | 40×40 | heroic crystal-armored crab monster, glowing cyan gemstone shell, elegant, noble, cute-cool |
| **rustclaw** | 3 Champion (feral) | 40×40 | rugged battle-scarred crab monster, rusty iron shell, one big chipped claw, tough, scrappy |
| **aurelian** | 4 Ultimate (radiant) | 48×48 | golden crab-king monster, small crown, radiant ornate armor, majestic, wise, regal |
| **voidmaw** | 4 Ultimate (feral) | 48×48 | dark abyssal glitch crab monster, deep purple shell, neon-green cracks, menacing but cool |

## Consistency strategy
1. Generate **clawde** (the rookie) first — it's the anchor of the lineage.
2. Use it as a **reference/inpaint base** for the others so shell shape, palette, and eyes carry through (Sprite-AI style-lock / reference image).
3. Baby forms (egg, blip) = simplified clawde. Champions/Ultimates = clawde + armor/horns/scale-up, keeping the crab silhouette recognizable.

## Manifest entry template (per form, added as sheets land)
```json
"clawde": {
  "sheet": "clawde.png",
  "frameW": 32, "frameH": 32, "fps": 6, "scale": 3,
  "anims": { "idle": { "row": 0, "frames": 4 }, "walk": { "row": 1, "frames": 6 } }
}
```
`scale` upsizes tiny sprites in the 192×128 tank (32px × 3 = 96px). Bigger forms use a smaller `scale` so ultimates read as larger than babies but still fit.

## Execution order once the key is in
1. `claude mcp add --transport http sprite-ai https://www.sprite-ai.art/api/mcp --header "Authorization: Bearer sai_sk_..."`
2. Generate **clawde** idle+walk → save `web/assets/clawde.png` → add manifest entry → verify in tank.
3. If clawde looks great, generate the rest of the line (7 total) using it as the style anchor.
4. Delete `clawde-test.png` placeholder; reset pet to a fresh egg for the real first-run experience.
