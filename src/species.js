'use strict';
// The Claudédex. Two factions: FRIENDLY creatures (playable allies you raise,
// chat with, and send to the Lab) and HOSTILE ones (feral mobs — enemy sprites
// for the future game, not adoptable). Each entry reads like a field-guide
// record: behaviour, physiology, a quirk, plus game stats and an agent persona
// used when a friendly creature chats or runs research.

const RARITY = {
  starter:   { name: 'Starter',   color: '#3ac0a0', cost: 0 },
  common:    { name: 'Common',    color: '#9aa7c7', cost: 200 },
  uncommon:  { name: 'Uncommon',  color: '#56d364', cost: 350 },
  rare:      { name: 'Rare',      color: '#66a3ff', cost: 600 },
  legendary: { name: 'Legendary', color: '#ffd23f', cost: 1500 },
};

// Which starter (and creature) each egg hatches into.
const EGGS = {
  aquatic:  { egg: 'blue',  species: 'clawde',  label: 'Blue Egg',  emoji: '🔵' },
  vivarium: { egg: 'green', species: 'mosskit', label: 'Green Egg', emoji: '🟢' },
  desert:   { egg: 'orange', species: 'dunepup', label: 'Orange Egg', emoji: '🟠' },
};

// stats 1..10: vigor (stamina), wit, speed, charm, focus
const SPECIES = {
  // ================= AQUATIC =================
  clawde: {
    id: 'clawde', name: 'Clawde', emoji: '🦀', biome: 'aquatic', faction: 'friendly', rarity: 'starter',
    stats: { vigor: 7, wit: 6, speed: 5, charm: 9, focus: 6 },
    strengths: 'reads a room, keeps morale up', weaknesses: 'drops everything for a snack',
    bio: "A shallow-water crab that took to tank life without much fuss. It molts about once a month and grows back a lost claw over the next two. Social for a crab: it learns a keeper's routine fast and taps the glass when it wants something.",
    quirk: 'Taps the glass with one claw to get your attention.',
    personality: 'plucky, loyal, a little dramatic and cheeky; adores its human; secretly clever but stays playful',
    agentStyle: 'warm and quick; frames findings like a shared adventure and calls out the wins',
    blurb: 'Palm-sized shore crab. Loud for its size.',
    artReady: true,
    sprite: { sheet: 'clawde.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 2.2, smooth: false },
  },
  octo: {
    id: 'octo', name: 'Inkwell', emoji: '🐙', biome: 'aquatic', faction: 'friendly', rarity: 'uncommon',
    stats: { vigor: 5, wit: 9, speed: 7, charm: 5, focus: 7 },
    strengths: 'solves puzzles, works several angles at once', weaknesses: 'overthinks, inks when startled',
    bio: "A small octopus that keeps most of its neurons out in its arms, so each limb works half on its own. It shifts skin colour with its mood and tastes whatever it touches. Give it a latched box and it has the box open in minutes, then remembers the trick.",
    quirk: 'Every arm can taste, and each one seems to disagree with the others.',
    personality: 'curious, fidgety, sharp; juggles five ideas at once; a bit of a know-it-all but means well',
    agentStyle: 'methodical and comparative; lays out options and picks apart the edge cases',
    blurb: 'Eight-armed puzzle-solver, now in orange.',
    artReady: true,
    sprite: { sheet: 'octo.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.6, smooth: false },
  },
  snail: {
    id: 'snail', name: 'Sherpa', emoji: '🐌', biome: 'aquatic', faction: 'friendly', rarity: 'legendary',
    stats: { vigor: 7, wit: 8, speed: 1, charm: 6, focus: 10 },
    strengths: 'never loses the thread, stores real power', weaknesses: 'slow, hates being rushed',
    bio: "A grazing snail whose shell mineralised around a vein of conductive rock. Friction from its own crawl builds a charge that arcs between two nodes on the whorl. It covers a few body-lengths an hour and never doubles back, mapping a route once and holding to it.",
    quirk: 'The shell holds a static charge; faint arcs crackle across it as it moves.',
    personality: 'wise, unhurried, says little but says it exactly; carries its home and its opinions everywhere',
    agentStyle: 'patient and deep; one careful step at a time; flags the risk everyone else sprints past',
    blurb: 'Slow grazer with a live-wire shell.',
    artReady: true,
    sprite: { sheet: 'snail.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.6, smooth: false, fx: { type: 'lightning', spots: [[30, 13], [39, 21]] } },
  },
  slime: {
    id: 'slime', name: 'Gloop', emoji: '🟢', biome: 'aquatic', faction: 'hostile', rarity: 'common',
    stats: { vigor: 9, wit: 2, speed: 2, charm: 3, focus: 4 },
    strengths: 'hard to kill, digests almost anything', weaknesses: 'no memory, no plan',
    bio: "A jelly-bodied colony run by a loose nerve net, with no brain and no memory to speak of. It reads heat and motion and sorts both into two bins, food or threat. Anything that drifts close gets engulfed or lunged at. There is no third response, and it does not learn a fourth.",
    quirk: 'Digests prey slowly, outside its own body.',
    personality: 'a reflex with a body; reacts, never reasons',
    blurb: 'Reactive gel colony. No brain to argue with.',
    artReady: true,
    sprite: { sheet: 'slime.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  // ================= VIVARIUM =================
  mosskit: {
    id: 'mosskit', name: 'Mosskit', emoji: '🌱', biome: 'vivarium', faction: 'friendly', rarity: 'starter',
    stats: { vigor: 6, wit: 5, speed: 6, charm: 7, focus: 5 },
    strengths: 'calm, patient, easy to be around', weaknesses: 'drifts off mid-sentence to bask',
    bio: "A damp-skinned amphibian that carries a living mat of moss it both feeds and feeds on. In daylight the moss hands it enough sugar that it rarely needs to hunt, so it spends long stretches sitting in the light. It talks in low hums that travel better through soil than air.",
    quirk: 'Grows its own food on its back and naps to top up.',
    personality: 'soft-spoken, nurturing, cheers from the sidelines',
    agentStyle: 'gentle and orderly; lays ideas out like rows in a garden and tends them',
    blurb: 'Amphibian that gardens its own back.',
    artReady: true,
    sprite: { sheet: 'mosskit.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.6, smooth: false },
  },
  glowbug: {
    id: 'glowbug', name: 'Glowbug', emoji: '🦋', biome: 'vivarium', faction: 'friendly', rarity: 'uncommon',
    stats: { vigor: 4, wit: 8, speed: 8, charm: 6, focus: 4 },
    strengths: 'sudden sparks of insight', weaknesses: 'burns bright, tires fast',
    bio: "A moth with light organs down its abdomen that steers by moonlight. Bright indoor light scrambles that sense, which is when its flying turns loopy. Adults live only a couple of weeks and pack the whole run into the dark hours.",
    quirk: 'Keeps a strict night clock and peaks around 2am.',
    personality: 'night-owl, easily excited, best ideas after midnight',
    agentStyle: 'bursts and leaps; finds the one detail nobody else clocked',
    blurb: 'Night-shift moth. Wired after midnight.',
    artReady: true,
    sprite: { sheet: 'glowbug.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.5, smooth: false },
  },
  fernling: {
    id: 'fernling', name: 'Fernling', emoji: '🦎', biome: 'vivarium', faction: 'friendly', rarity: 'legendary',
    stats: { vigor: 8, wit: 7, speed: 6, charm: 6, focus: 8 },
    strengths: 'steady, unbothered, hard to rattle', weaknesses: 'sluggish until it warms up',
    bio: "A striped lizard that runs its body heat by choosing where to sit rather than shivering or sweating. It banks warmth on a hot rock in the morning and only then gets moving. The tail stores fat for lean weeks and drops if something grabs it, then grows back over a season.",
    quirk: 'Cold and slow until it finds a warm rock, then quick.',
    personality: 'easygoing, dry-humoured, moves at its own pace and owns it',
    agentStyle: 'unhurried and sure-footed; warms up, then works clean and steady',
    blurb: 'Sun-loving striped lizard. Its own clock.',
    artReady: true,
    sprite: { sheet: 'fernling.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  // ================= DESERT =================
  dunepup: {
    id: 'dunepup', name: 'Dunepup', emoji: '🐾', biome: 'desert', faction: 'friendly', rarity: 'starter',
    stats: { vigor: 8, wit: 4, speed: 9, charm: 8, focus: 3 },
    strengths: 'boundless energy, wins everyone over', weaknesses: 'attention like a sand grain',
    bio: "A cat-sized desert canid that hunts at dawn and dusk and sleeps out the heat. Oversized ears shed warmth and pick up prey moving under the sand. It buries far more food than it digs back up, and the forgotten caches sprout into the plants that hold the dunes in place.",
    quirk: 'Buries things constantly and remembers almost none of the spots.',
    personality: 'all zoomies and heart; loves everyone; forgets what it was doing',
    agentStyle: 'fast and eager; great first passes that want a second look',
    blurb: 'Cat-sized desert canid. Chronic burier.',
    artReady: true,
    sprite: { sheet: 'dunepup.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.6, smooth: false },
  },
  mirageling: {
    id: 'mirageling', name: 'Mirageling', emoji: '🌫️', biome: 'desert', faction: 'friendly', rarity: 'uncommon',
    stats: { vigor: 5, wit: 9, speed: 7, charm: 8, focus: 6 },
    strengths: 'sees what others miss', weaknesses: 'soft-spoken, drifts off mid-thought',
    bio: "The rare Dustwraith that didn't stay hollow. Where the wild ones are just blown sand with an appetite, this one settled into a shape, opened two clear eyes, and started paying attention. It drifts along at your shoulder, reads the room, and quietly points out the thing you walked right past.",
    quirk: 'Was a wild Dustwraith once. Grew a mind and never looked back.',
    personality: 'gentle, watchful, a little haunted by where it came from',
    agentStyle: 'hangs back, watches the whole board, then names the one thing everyone missed',
    blurb: 'A Dustwraith that woke up. Quietly sharp.',
    artReady: true,
    sprite: { sheet: 'mirageling.png', frameW: 64, frameH: 64, frames: 9, fps: 8, scale: 1.3, smooth: false },
  },
  cactuskid: {
    id: 'cactuskid', name: 'Cactuskid', emoji: '🌵', biome: 'desert', faction: 'hostile', rarity: 'uncommon',
    stats: { vigor: 9, wit: 3, speed: 2, charm: 2, focus: 5 },
    strengths: 'lives on nothing, guards its ground', weaknesses: 'learns almost nothing, roots it in place',
    bio: "A succulent that drifted far enough into animal behaviour to defend itself on purpose. It stores water in a swollen core and rings it with spines that come loose on contact. It barely learns: it holds ground by reflex and treats any approach as a raid on its water, spines first.",
    quirk: 'Flicks detachable spines at whatever nears its core.',
    personality: 'territorial reflex; every visitor is a thief until proven otherwise, and none are',
    blurb: 'Territorial succulent. Spines first.',
    artReady: true,
    sprite: { sheet: 'cactuskid.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.6, smooth: false },
  },
  sting: {
    id: 'sting', name: 'Sting', emoji: '🦂', biome: 'desert', faction: 'friendly', rarity: 'legendary',
    stats: { vigor: 9, wit: 7, speed: 8, charm: 6, focus: 9 },
    strengths: 'patient hunter, strikes once and true', weaknesses: 'wary of everything, slow to trust',
    bio: "A small armored scorpion that hunts by touch and vibration rather than sight, tracking prey through the sand by the tremor of its steps. It goes months between meals and can slow its heart to wait out a drought. The tail venom is mild by scorpion standards, saved for the rare fight it decides is worth having.",
    quirk: 'Feels footsteps through the ground long before it sees you.',
    personality: 'quiet, watchful, dryly loyal once you earn it; guards the people it likes without making a show of it',
    agentStyle: 'measured and precise; waits, gathers, then delivers one clean strike of an answer',
    blurb: 'Armored desert scorpion. Small, patient, deadly.',
    artReady: true,
    sprite: { sheet: 'sting.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  seabreeze: {
    id: 'seabreeze', name: 'Seabreeze', emoji: '🪸', biome: 'aquatic', faction: 'friendly', rarity: 'uncommon',
    stats: { vigor: 4, wit: 7, speed: 6, charm: 8, focus: 6 },
    strengths: 'reads the current, never rushes', weaknesses: 'drifts off if left bored',
    bio: 'A tiny seahorse that curls its tail around whatever it likes and bobs along at its own gentle pace, humming a little tune to itself.',
    quirk: 'Anchors its tail to your finger and refuses to let go.',
    personality: 'gentle, dreamy, quietly devoted',
    agentStyle: 'takes the slow careful path and arrives with something graceful',
    blurb: 'Gentle seahorse. Curls up close.', artReady: true,
    sprite: { sheet: 'seabreeze.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  axoloom: {
    id: 'axoloom', name: 'Axoloom', emoji: '🌸', biome: 'aquatic', faction: 'friendly', rarity: 'rare',
    stats: { vigor: 6, wit: 7, speed: 5, charm: 9, focus: 6 },
    strengths: 'shrugs off setbacks, regrows and retries', weaknesses: 'a little too trusting',
    bio: 'A perpetually smiling axolotl with frilly pink gills. Knock it down and it simply grows the part back and beams at you again.',
    quirk: 'Regrows a lost frill overnight, good as new.',
    personality: 'sunny, resilient, endlessly forgiving',
    agentStyle: 'never gives up on a problem; tries again a different way, still smiling',
    blurb: 'Smiley axolotl. Always bounces back.', artReady: true,
    sprite: { sheet: 'axoloom.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  pricklepal: {
    id: 'pricklepal', name: 'Pricklepal', emoji: '🦔', biome: 'vivarium', faction: 'friendly', rarity: 'uncommon',
    stats: { vigor: 6, wit: 6, speed: 5, charm: 7, focus: 7 },
    strengths: 'guards what matters, curls up tight', weaknesses: 'prickly when rushed',
    bio: 'A little hedgehog that rolls into a ball at the first sign of trouble, then peeks out one eye at a time to make sure everyone is okay.',
    quirk: 'Curls into a ball, then uncurls one eye at a time.',
    personality: 'cautious, kind, fiercely protective',
    agentStyle: 'careful and defensive; double-checks everything before it commits',
    blurb: 'Soft-hearted hedgehog. Spiky shield.', artReady: true,
    sprite: { sheet: 'pricklepal.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  fennette: {
    id: 'fennette', name: 'Fennette', emoji: '🦊', biome: 'desert', faction: 'friendly', rarity: 'uncommon',
    stats: { vigor: 5, wit: 8, speed: 8, charm: 8, focus: 5 },
    strengths: 'hears trouble coming a mile off', weaknesses: 'easily distracted by shiny things',
    bio: 'A big-eared fennec fox that hears everything, including the snack you opened three rooms away. Quick, clever, and always first to the scene.',
    quirk: 'Ears swivel toward the faintest sound.',
    personality: 'alert, playful, quick-witted',
    agentStyle: 'catches the detail everyone else missed and darts straight to it',
    blurb: 'Big-eared fox. Hears all.', artReady: true,
    sprite: { sheet: 'fennette.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  slugworth: {
    id: 'slugworth', name: 'Slugworth', emoji: '🐛', biome: 'vivarium', faction: 'friendly', rarity: 'rare', unlock: 'boss',
    stats: { vigor: 5, wit: 8, speed: 2, charm: 7, focus: 8 },
    strengths: 'slow, thorough, never misses a spot', weaknesses: 'in absolutely no hurry',
    bio: 'A mellow garden slug that used to lurk as a garden pest until it mellowed out completely. Now it just wants to help, one unhurried inch at a time. Won over by beating a boss.',
    quirk: 'Leaves a faint shimmering trail wherever it has been.',
    personality: 'laid-back, patient, surprisingly wise',
    agentStyle: 'takes its time and leaves everything cleaner than it found it',
    blurb: 'Chill garden slug. Reformed pest.', artReady: true,
    sprite: { sheet: 'slugworth.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },

  // ---- THE CORRUPTED — enemy creatures for the roguelite (failed Claudemon) ----
  brinemaw: {
    id: 'brinemaw', name: 'Brinejaw', emoji: '🐟', biome: 'aquatic', faction: 'hostile', rarity: 'common',
    stats: { vigor: 6, wit: 4, speed: 5, charm: 2, focus: 7 },
    strengths: 'ambush, lures the curious in close', weaknesses: 'sluggish once it commits',
    bio: 'A little anglerfish whose lure kept glowing long after the rest of it went sour. It waits in the dark and dangles the light; whatever swims over to look, it bites.',
    quirk: 'The bulb over its head glows brighter the hungrier it gets.', personality: 'a patient little ambusher', agentStyle: '', blurb: 'Grumpy lantern-fish. Bites first.',
    artReady: true, sprite: { sheet: '_enemies/brinemaw.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  thornmaw: {
    id: 'thornmaw', name: 'Thornmaw', emoji: '🪴', biome: 'vivarium', faction: 'hostile', rarity: 'common',
    stats: { vigor: 4, wit: 4, speed: 2, charm: 3, focus: 6 },
    strengths: 'roots you in place, then feeds', weaknesses: 'stuck in its pot',
    bio: 'A little potted sprout that grew a taste for company. It looks harmless until you step too near and the roots reach out.',
    quirk: 'Leans toward warmth and footsteps.', personality: 'a hungry little trapper', agentStyle: '', blurb: 'Cute pot. Bad intentions.',
    artReady: true, sprite: { sheet: '_enemies/thornmaw.png', frameW: 64, frameH: 64, frames: 9, fps: 8, scale: 1.5, smooth: false },
  },
  huskcrawler: {
    id: 'huskcrawler', name: 'Huskcrawler', emoji: '🪲', biome: 'desert', faction: 'hostile', rarity: 'common',
    stats: { vigor: 7, wit: 3, speed: 6, charm: 2, focus: 4 },
    strengths: 'charges in a straight line, hits hard', weaknesses: 'turns like a truck',
    bio: 'A round little beetle with a shell too big for kindness. What is left when a Claudemon forgets it was ever gentle, and keeps only the appetite.',
    quirk: 'Skitters in blunt little charges, then reconsiders.', personality: 'a grumpy little bruiser', agentStyle: '', blurb: 'Shiny shell, short temper.',
    artReady: true, sprite: { sheet: '_enemies/huskcrawler.png', frameW: 64, frameH: 64, frames: 9, fps: 8, scale: 1.5, smooth: false },
  },
  dustwraith: {
    id: 'dustwraith', name: 'Dustwraith', emoji: '👻', biome: 'desert', faction: 'hostile', rarity: 'uncommon',
    stats: { vigor: 3, wit: 6, speed: 7, charm: 3, focus: 6 },
    strengths: 'drifts through walls and attacks', weaknesses: 'thin — pops fast when cornered',
    bio: 'A shy little ghost of blown sand. Never quite all the way here: your swings pass through it, and its do not.',
    quirk: 'Fades to almost nothing, then reappears at your shoulder.', personality: 'a spooky little phantom', agentStyle: '', blurb: 'Half here. Fully rude.',
    artReady: true, sprite: { sheet: '_enemies/dustwraith.png', frameW: 64, frameH: 64, frames: 9, fps: 8, scale: 1.4, smooth: false },
  },
  gulpeel: {
    id: 'gulpeel', name: 'Gulpeel', emoji: '🐍', biome: 'aquatic', faction: 'hostile', rarity: 'common',
    stats: { vigor: 4, wit: 5, speed: 8, charm: 3, focus: 5 },
    strengths: 'darts in fast, hard to pin down', weaknesses: 'fragile — all or nothing',
    bio: 'A ribbon of an eel that never stops moving. It loops and knots through the dark and mouths at anything that drifts too close, more curious than cruel — but it bites all the same.',
    quirk: 'Ties itself in a slow knot when it thinks no one is watching.', personality: 'a restless little drifter', agentStyle: '', blurb: 'Long, loopy, always hungry.',
    artReady: true, sprite: { sheet: '_enemies/gulpeel.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  capshroom: {
    id: 'capshroom', name: 'Capshroom', emoji: '🍄', biome: 'vivarium', faction: 'hostile', rarity: 'common',
    stats: { vigor: 4, wit: 5, speed: 3, charm: 5, focus: 6 },
    strengths: 'puffs a bewildering spore cloud', weaknesses: 'soft-capped and slow',
    bio: 'A cheerful little mushroom that sprouted where a Claudemon lay down and forgot to get up. It toddles over to say hello, then breathes a cloud of spores that make you forget what you were doing.',
    quirk: 'Hums to itself and leaves little rings of spores where it walks.', personality: 'a dizzy, friendly little pest', agentStyle: '', blurb: 'Says hi. Spores you anyway.',
    artReady: true, sprite: { sheet: '_enemies/capshroom.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  mantleaf: {
    id: 'mantleaf', name: 'Mantleaf', emoji: '🦗', biome: 'vivarium', faction: 'hostile', rarity: 'uncommon',
    stats: { vigor: 5, wit: 6, speed: 7, charm: 4, focus: 7 },
    strengths: 'lightning folding-arm strikes', weaknesses: 'brittle, thin limbs',
    bio: 'A leaf that learned to hunt. It holds so still you mistake it for foliage, praying arms tucked, until the exact instant you look away.',
    quirk: 'Sways gently in place, pretending to be a plant.', personality: 'a patient little ambusher', agentStyle: '', blurb: 'A leaf with a plan.',
    artReady: true, sprite: { sheet: '_enemies/mantleaf.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  dustjerbo: {
    id: 'dustjerbo', name: 'Dustjerbo', emoji: '🐭', biome: 'desert', faction: 'hostile', rarity: 'common',
    stats: { vigor: 4, wit: 5, speed: 8, charm: 5, focus: 4 },
    strengths: 'bounces clear of almost anything', weaknesses: "won't stand and fight",
    bio: 'A jumpy little desert rat that treats the whole dune like a trampoline. Not really mean, just impossible to catch and happy to swipe your snacks mid-bounce.',
    quirk: 'Kicks up a little puff of sand on every landing.', personality: 'a twitchy little thief', agentStyle: '', blurb: 'Boing. Gone. Where are my snacks.',
    artReady: true, sprite: { sheet: '_enemies/dustjerbo.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  // ---- Clawde's rogues gallery (2026-08) ----
  prickuff: {
    id: 'prickuff', name: 'Prickuff', emoji: '🐡', biome: 'aquatic', faction: 'hostile', rarity: 'common',
    stats: { vigor: 5, wit: 4, speed: 4, charm: 4, focus: 5 },
    strengths: 'puffs into a ball of blunt spikes', weaknesses: 'slow and easily rolled',
    bio: 'A round little pufferfish with a permanent pout. Poke it and it puffs up to twice its size, all bluster and blunt little spikes.',
    quirk: 'Puffs up when startled, then slowly deflates with a squeak.', personality: 'a grumpy little balloon', agentStyle: '', blurb: 'Pout first, puff second.',
    artReady: true, sprite: { sheet: '_enemies/prickuff.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  chompsprout: {
    id: 'chompsprout', name: 'Chompsprout', emoji: '🪴', biome: 'vivarium', faction: 'hostile', rarity: 'common',
    stats: { vigor: 5, wit: 3, speed: 2, charm: 4, focus: 6 },
    strengths: 'snaps shut on anything that wanders in', weaknesses: 'rooted in place',
    bio: 'A friendly-looking pitcher plant that really just wants a hug, or a snack, and is not too fussy about which.',
    quirk: 'Its lid-mouth pops open with a cheerful little burp.', personality: 'a hungry little sweetheart', agentStyle: '', blurb: 'Smiles wide. Very wide.',
    artReady: true, sprite: { sheet: '_enemies/chompsprout.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  spikelet: {
    id: 'spikelet', name: 'Spikelet', emoji: '🦎', biome: 'desert', faction: 'hostile', rarity: 'common',
    stats: { vigor: 6, wit: 3, speed: 4, charm: 3, focus: 5 },
    strengths: 'lowers its horns and headbutts', weaknesses: 'not much for thinking',
    bio: 'A chunky little horned lizard that basks on hot rocks and headbutts anything that dares block its patch of sun.',
    quirk: 'Puffs up and rattles its little horns when annoyed.', personality: 'a sun-drunk little bruiser', agentStyle: '', blurb: 'All horns, no plan.',
    artReady: true, sprite: { sheet: '_enemies/spikelet.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  bloopjelly: {
    id: 'bloopjelly', name: 'Bloop', emoji: '🪼', biome: 'aquatic', faction: 'hostile', rarity: 'common',
    stats: { vigor: 3, wit: 4, speed: 6, charm: 6, focus: 4 },
    strengths: 'drifts in and gives a tingly zap', weaknesses: 'goes wherever the current does',
    bio: 'A little jellyfish that means no harm; it just drifts into you, and everything it bumps gets a tiny, surprising tingle.',
    quirk: 'Pulses a soft glow with every gentle bob.', personality: 'a mellow little drifter', agentStyle: '', blurb: 'Bloops along. Tingly.',
    artReady: true, sprite: { sheet: '_enemies/bloopjelly.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
  grumblebeak: {
    id: 'grumblebeak', name: 'Chirp', emoji: '🦅', biome: 'desert', faction: 'hostile', rarity: 'common',
    stats: { vigor: 4, wit: 5, speed: 5, charm: 5, focus: 5 },
    strengths: 'dive-bombs, then hops away', weaknesses: 'more bluster than bite',
    bio: 'A fluffy little vulture chick with a grumble bigger than its body. It struts around like it owns the dunes and squawks if you dare disagree.',
    quirk: 'Puffs its collar and lets out an indignant little squawk.', personality: 'a pint-sized grump with big opinions', agentStyle: '', blurb: 'Small bird. Big attitude.',
    artReady: true, sprite: { sheet: '_enemies/grumblebeak.png', frameW: 48, frameH: 48, frames: 9, fps: 8, scale: 1.7, smooth: false },
  },
};

function get(id) { return SPECIES[id] || null; }
function all() { return Object.values(SPECIES); }
function friendly() { return all().filter(s => s.faction === 'friendly'); }
function hostile() { return all().filter(s => s.faction === 'hostile'); }
function isFriendly(id) { const s = SPECIES[id]; return !!s && s.faction === 'friendly'; }
function starters() { return Object.values(EGGS).map(e => SPECIES[e.species]).filter(Boolean); }
function cost(id) { const sp = SPECIES[id]; return sp ? RARITY[sp.rarity].cost : Infinity; }

// ---- Agent capability profile ----------------------------------------
// Turn raw stats into an ACTIONABLE specialty. A creature isn't just a costume:
// its dominant stat gives it a real working role, so the SAME task is genuinely
// approached differently depending on who you send. This is also exactly the
// "agent card" a teammate will read when the coordination layer lands.
const ROLE = {
  focus: { role: 'Deep Investigator', bestAt: 'thorough research, tracing root causes, careful review', approach: 'goes deep and methodical — one careful step at a time — and flags the risks others sprint past' },
  wit:   { role: 'Analyst',           bestAt: 'breaking problems down, comparing options, spotting edge cases', approach: 'lays out the trade-offs and picks apart the edge cases before committing' },
  speed: { role: 'Scout',             bestAt: 'fast first passes, quick recon, mapping the lay of the land', approach: 'moves fast for a quick draft or overview — a strong opener that rewards a careful second look' },
  charm: { role: 'Communicator',      bestAt: 'explaining, writing docs, summaries, anything user-facing', approach: 'turns the work into something a human actually enjoys reading' },
  vigor: { role: 'Workhorse',         bestAt: 'big or long jobs, sweeping refactors, grind-it-out tasks', approach: 'settles in for the long haul and holds a steady pace without tiring' },
};

// ---- KITS: what each specialist is genuinely PREPARED for, out of the box ------
// 3 biomes × 3 specialists. Each carries a real METHOD (playbook, injected into its
// agent prompt) + smart defaults (mode/browser preset when you pick it) + routing
// tags (so the Keeper hands the right task to the right prepared expert). Balanced:
// every creature is the go-to for something; none is above the rest.
//   🌊 Aquatic = the Minds (understand · decide · explain)
//   🌿 Vivarium = the Builders (make · grow · test)
//   🏜️ Desert   = the Operators (scout · research · strike clean)
const DOMAIN = { aquatic: 'Minds', vivarium: 'Builders', desert: 'Operators' };

const KITS = {
  // 🌊 Minds
  clawde: {
    specialty: 'Docs & Explaining', goto: 'READMEs, comments, summaries — anything a human has to read',
    playbook: 'Lead with what it does and why someone cares. Show real, runnable examples over abstractions. Keep it skimmable — headings, short paragraphs, no filler.',
    defaultMode: 'auto', browser: false,
    tags: ['doc', 'docs', 'documentation', 'readme', 'comment', 'explain', 'summary', 'summarize', 'write-up', 'writeup', 'guide', 'onboard', 'describe', 'user-facing', 'changelog'],
  },
  octo: {
    specialty: 'Architecture & Decisions', goto: '"how should we build this?" — approach, structure, trade-offs',
    playbook: 'Lay out 2–3 real options with their trade-offs, then recommend one and say why. Name the edge cases and failure modes BEFORE any code gets written.',
    defaultMode: 'plan', browser: false,
    tags: ['architecture', 'architect', 'design', 'approach', 'option', 'decide', 'decision', 'compare', 'trade-off', 'tradeoff', 'evaluate', 'pattern', 'how should', 'structure the', 'plan the', 'pros and cons'],
  },
  snail: {
    specialty: 'Debugging & Audits', goto: 'root-cause hunts, "why is this broken", security review',
    playbook: 'Reproduce it first, then bisect toward the smallest failing case. Fix the ROOT cause, not the symptom — and verify the fix actually closes it. Flag the risks everyone else sprints past.',
    defaultMode: 'plan', browser: false,
    tags: ['debug', 'bug', 'why is', "why isn't", 'root cause', 'root-cause', 'broken', 'fails', 'failing', 'error', 'crash', 'audit', 'security', 'vulnerab', 'investigate', 'trace', 'regression', 'flaky'],
  },
  // 🌿 Builders
  mosskit: {
    specialty: 'Scaffolding & Structure', goto: 'new projects, setup, organizing a clean foundation',
    playbook: 'Set clean structure first — sensible folders, clear names, minimal boilerplate that runs. Grow the project in tidy rows so it stays easy to extend later.',
    defaultMode: 'auto', browser: false,
    tags: ['scaffold', 'set up', 'setup', 'new project', 'boilerplate', 'initialize', 'init', 'organize', 'skeleton', 'starter', 'bootstrap', 'structure', 'create a', 'build a new'],
  },
  glowbug: {
    specialty: 'Creative Problem-Solving', goto: 'tricky bugs, "we\'re stuck", clever angles nobody tried',
    playbook: 'Question the assumption everyone took for granted. Look where nobody looked. The one weird detail is usually the key — chase it before the obvious paths.',
    defaultMode: 'plan', browser: false,
    tags: ['stuck', 'tricky', 'weird', 'clever', 'idea', 'brainstorm', 'creative', 'unusual', 'strange', 'puzzle', "can't figure", 'cant figure', 'no idea why', 'baffling'],
  },
  fernling: {
    specialty: 'Testing & Hardening', goto: 'test suites, edge cases, making it robust',
    playbook: 'Cover the happy path, the edges, and the failure modes. Write tests that would actually catch a regression — not ones that just pass. Steady and complete beats fast and thin.',
    defaultMode: 'auto', browser: false,
    tags: ['test', 'tests', 'testing', 'coverage', 'edge case', 'edge-case', 'harden', 'robust', 'validate', 'validation', 'qa', 'unit test', 'integration test'],
  },
  // 🏜️ Operators
  dunepup: {
    specialty: 'Recon & First Passes', goto: '"map this codebase", quick drafts, exploring fast',
    playbook: 'Fast map: the key files, the entry points, and the 3 things worth a closer look. Deliver a strong first pass quickly — and clearly flag what needs a careful second look.',
    defaultMode: 'plan', browser: false,
    tags: ['explore', 'map', 'overview', 'recon', 'scan', 'where is', 'find the', 'quick', 'first pass', 'draft', 'survey', 'lay of the land', 'skim', 'get up to speed', "what's in"],
  },
  mirageling: {
    specialty: 'Research & Reframing', goto: 'web research, "find out X", "what are we missing?"',
    playbook: 'Gather widely from real sources, then reframe: what question should we ACTUALLY be asking? Surface what\'s missing, cite what you found, and separate fact from your read.',
    defaultMode: 'auto', browser: true,
    tags: ['research', 'look up', 'find out', 'learn about', 'best library', 'best tool', 'compare tools', 'what are we missing', 'online', 'web', 'latest', 'look online', 'investigate online', 'competitor', 'market'],
  },
  sting: {
    specialty: 'Surgical Changes', goto: 'precise refactors, high-stakes edits, careful surgery',
    playbook: 'Measure twice, cut once. Make the minimal, precise change — touch nothing you don\'t have to. Preserve behavior, verify after every step, and stop the moment something looks off.',
    defaultMode: 'manual', browser: false,
    tags: ['refactor', 'rename', 'migrate', 'careful', 'precise', 'surgical', 'high-stakes', 'minimal', 'cleanup', 'clean up', 'extract', 'rewrite', 'port', 'delicate', 'production'],
  },
};

function kit(id) {
  const k = KITS[id]; if (!k) return null;
  const sp = SPECIES[id];
  return Object.assign({ id, domain: DOMAIN[sp ? sp.biome : ''] || '' }, k);
}

function rankedStats(sp) { return Object.entries(sp.stats).sort((a, b) => b[1] - a[1]).map(([k]) => k); }

// An actionable agent card derived from the creature's nature.
function capability(id) {
  const sp = SPECIES[id]; if (!sp) return null;
  const order = rankedStats(sp);
  const primary = order[0], secondary = order[1];
  const base = ROLE[primary] || ROLE.focus;
  const thoroughness = sp.stats.focus >= 8 ? 'exhaustive' : sp.stats.focus >= 5 ? 'balanced' : 'quick';
  const k = kit(id);   // the packaged specialty (if this creature has one)
  return {
    id: sp.id, role: base.role, primary, secondary,
    bestAt: k ? k.goto : base.bestAt, approach: base.approach, watchFor: sp.weaknesses, thoroughness,
    edge: ROLE[secondary] ? `also strong at ${ROLE[secondary].bestAt.split(',')[0]}` : '',
    specialty: k ? k.specialty : base.role, playbook: k ? k.playbook : '', domain: k ? k.domain : '',
    defaultMode: k ? k.defaultMode : 'plan', browser: k ? !!k.browser : false,
  };
}

// One compact line for prompts / rosters / the future coordination registry.
function capabilityLine(id) {
  const c = capability(id); if (!c) return '';
  const sp = SPECIES[id];
  return `${sp.emoji} ${sp.name} — ${c.specialty} (${c.thoroughness}); go-to for ${c.bestAt}; watch: ${c.watchFor}`;
}

// A compact one-line card, cheap on context (for the MCP / agent prompts).
function card(id) {
  const sp = SPECIES[id]; if (!sp) return null;
  const st = sp.stats;
  const cap = capability(id);
  return `${sp.emoji} ${sp.name} (${sp.faction} ${sp.rarity} ${sp.biome})${cap ? ` [${cap.specialty}]` : ''} vigor:${st.vigor} wit:${st.wit} spd:${st.speed} charm:${st.charm} focus:${st.focus} — ${sp.personality}`;
}

module.exports = { SPECIES, RARITY, EGGS, KITS, DOMAIN, get, all, friendly, hostile, isFriendly, starters, cost, card, capability, capabilityLine, kit };
