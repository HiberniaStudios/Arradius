import Phaser from 'phaser';
import AudioManager from '../audio/AudioManager.js';
import { enablePainterly, togglePainterly } from '../shaders/KuwaharaPostFX.js';

// The Residency — House Calder's seat, presented as static painted screens in
// the spirit of Cryo's Dune: a hub hall you navigate point-and-click, each room
// a painted scene with portrait-led dialogue. Side-scrolling is reserved for
// expeditions (the Corsair Deck) and the World Map handles strategy.

const GOLD = 0xc9a24a;
const GOLD_S = '#c9a24a';
const CREAM = '#f2e6d0';

// Experiment: use the painted PNG backdrop for the hall instead of the
// procedural art. Set false to fall back to the fully procedural hall (which
// is left completely intact). Auto-falls back if the texture failed to load.
const USE_HALL_BG = true;

// Painted backdrops by room feature → BootScene texture key. Rooms without an
// entry fall back to procedural art.
const BACKDROPS    = { hall: 'hallBg', comms: 'commsBg', court: 'courtBg' };
const CHAR_SPRITES = { 'Lord Aldric': 'aldric', 'Halix': 'halix' };

const LOCATIONS = {
  hall: {
    name: 'The Grand Hallway',
    flavor:
      'The great hall of House Calder at Saltspire. Lamplight and slow dust. Your house has held this world for two generations — and the decree that takes it has just arrived.',
    feature: 'hall',
  },
  court: {
    name: 'The Court',
    who: 'Lord Aldric',
    accent: 0xffd27a,
    feature: 'court',
    say: [
      '”Calder has kept faith with Aridun for sixty years. Korinth will hear that argument — I will make them hear it.”',
      '”I am glad you are home. I will not pretend the timing is coincidence — you felt it too, I think. The house needs you here now more than ever.”',
      '”I have read the decree four times. It does not name a grievance. It does not cite a failure. It simply… reassigns us. As though sixty years of stewardship were a lease arrangement and the term has expired.”',
      '”My father stayed on Aridun when other houses sent factors and forgot the place. The Shadmen asked us to stay. Not begged — asked, with the full weight of people who have held this rock for ten thousand years. That is the foundation this house stands on. Korinth did not build it. They cannot deed it away.”',
      '”Someone has been writing a different record of us in the capital. I do not yet know whose hand. But the decree assumes things about Calder that are not in any honest account — which means someone provided a dishonest one. Find that person before you worry about Vorrin.”',
      '”We wait, and we prepare. You have been away — best you reacquaint yourself with the court while I consider my next arrangements.”',
    ],
  },
  comms: {
    name: 'The Communications Room',
    who: 'Halix',
    accent: 0x8899bb,
    feature: 'comms',
    flavor: 'The intelligence feeds run day and night. Halix watches everything.',
    say: [
      // [0] gate line — shown until Aldric has been spoken to
      '”Ahh Eren, it\'s been some time. I recommend speaking to your father first before we get into current events.”',
      // [1]–[6] strategic briefing
      '”Your father\'s letters would give you the broad shape of things. They would not give you the details, they rarely do. That\'s what I need you to understand, before anything else moves.”',
      '”The decree is not about conduct. It is about output. Vorrin has offered Korinth three times our yield through industrial boring. That is the only conversation the Emperor is having.”',
      '”Your father believes there is room in the decree. He is meeting an Imperial envoy — off the record — to hear it. Perhaps he is right.”',
      '”Vorrin are already moving — three new sites on the Keth rockbed overnight. They do not need the decree settled before they act. Every day this remains a diplomatic problem is a day they close the gap.”',
      '”Vorrin are drilling with offworld methods — projecting triple our yield. What that does to the seam itself, no one here can say. The Shadmen at Tamir\'s Hollow have worked that ground for generations. If anyone can tell us what it can actually sustain — and what we can credibly put in front of Korinth — it is them.”',
      '”Your father will do as he will. Focus on the Aurun numbers — that is the only argument Korinth has ever answered.”',
      // [7] map line — permanent loop
      '”This map shows Vorrin\'s current operation sites and the Shadmen Hollows — what we know now. As you move across Aridun, it will update. Your Nav device carries the same map. Use it to travel between any location you have already reached.”',
    ],
    actions: [{ label: 'Study the map', scene: 'WorldMapScene' }],
  },
  war: {
    name: "The Reckoner's Chamber",
    accent: 0x8899bb,
    feature: 'war',
    flavor: 'Maps cover every surface. Vorrin drilling sites, Shadmen Hollow positions, Pale Legion movements. The room smells of cold logic.',
  },
  veil: {
    name: "The Veil's Sanctum",
    who: 'Mother Ysolde',
    accent: 0xb98cff,
    feature: 'veil',
    say: [
      '“The threads tangle around you, child. I cannot yet see the knot.”',
      '”When the Aurun finds you in the deep, let it settle. The Seir does not arrive — it surfaces.”',
    ],
  },
  solar: {
    name: 'The Solar',
    who: 'Sela',
    accent: 0xd4924a,
    feature: 'solar',
    say: [
      '"The Sleepers moved east last night. I felt it. You learn to feel it, growing up here — and you have."',
      '"There are things I\'ve been waiting for the right moment to tell you. I keep believing the moment will come. It will."',
    ],
  },
  infirmary: {
    name: 'The Infirmary',
    who: 'Master Orlin',
    accent: 0x7fd0a0,
    feature: 'infirmary',
    say: [
      '“All is well, my lord. The house is in good health.”',
      'He smiles, and bows, and holds the smile a moment too long.',
    ],
  },
  yard: {
    name: "The Bladewarden's Yard",
    who: 'Brannic',
    accent: 0xd0a070,
    feature: 'yard',
    say: [
      '“Steel won\'t win Aridun alone — but it\'ll keep you breathing till the Shadmen do.”',
      '“Say the word and the Saltguard musters. We are yours.”',
    ],
  },
  living_hall: {
    name: 'The Residential Wing',
    accent: 0xc9a24a,
    feature: 'living_hall',
    flavor: 'A quiet corridor off the court. Eren\'s rooms to the left, Sela\'s Solar to the right.',
  },
  spirit_hall: {
    name: 'The Inner Passage',
    accent: 0xb98cff,
    feature: 'spirit_hall',
    flavor: 'The air changes here — cooler, older. The Veil\'s Sanctum opens to the left; the Reckoner\'s Chamber to the right.',
  },
  quarters: {
    name: "Eren's Quarters",
    accent: 0x6fb0ff,
    feature: 'quarters',
    flavor: 'Your own rooms. The rock remembers things here, when the palace is quiet.',
  },
  deck: {
    name: 'The Corsair Deck',
    accent: 0xffce86,
    feature: 'deck',
    flavor: 'A corsair waits, wings folded against the dusk.',
    actions: [{ label: 'Ride out into Aridun', scene: 'ExpeditionScene' }],
  },
};

// Spatial adjacency — which door (direction) of each room leads where. The
// player walks the palace by clicking doors, not picking from a menu. Edit this
// to re-route the map; `forward` is the central arch, `left`/`right` the side
// doors, `back` the way you came.
// Single source of truth for spatial adjacency. renderRoomBar derives its
// navigation choices from this table only — no shortcuts to non-adjacent rooms.
// 'back' is the way you came; all other keys are forward/side exits.
const EXITS = {
  hall:        { left: 'yard', right: 'infirmary', forward: 'court' }, // comms+deck via PNG hotspots
  court:       { back: 'hall',        left: 'living_hall', right: 'spirit_hall' },
  // Living Wing corridor — Eren's Quarters left, The Solar right
  living_hall: { back: 'court',       left: 'quarters',    right: 'solar' },
  quarters:    { back: 'living_hall' },
  solar:       { back: 'living_hall' },
  // Spirit/Knowledge Wing corridor — Veil's Sanctum left, Reckoner's Chamber right
  spirit_hall: { back: 'court',       left: 'veil',        right: 'war' },
  veil:        { back: 'spirit_hall' },
  war:         { back: 'spirit_hall' },
  yard:        { back: 'hall' },
  infirmary:   { back: 'hall' },
  comms:       { back: 'hall' },   // Reckoner reached via Spirit Wing, not Comms
  deck:        { back: 'hall' },
};

// ─── Codex data ───────────────────────────────────────────────────────────────

const CODEX_LORE = [
  {
    id: 'aridun', title: 'Aridun · Arradius',
    body: 'This world carries two names, and which you use says whose side you\'re on.\n\nArradius — the Imperial registry name. What appears on Korinth\'s charts, on the fief decree, on House Vorrin\'s drilling licences. A designation, a source of Aurun, an administrative unit in someone else\'s ledger.\n\nAridun — what the Shadmen call it. What those born here call it. A name that predates any Korinthian charter by generations. House Calder learned to use both.\n\nThe world itself is not a sand world. It is a rock world. Vast platforms of ancient hard rockbed cover most of its surface — flat, dramatic, permanent. The dune seas fill the low ground between formations; they are almost cosmetic by comparison. What matters is the rock.\n\nAurun blooms surface through porous sections of rock face, not through sand. To find blooms, you read the rock. Below the hard surface lies a softer friable layer — the Sleeper domain. The Shadmen carve their Hollows into the hard layer, touching the deep layer only at thinned junction points.',
  },
  {
    id: 'sleepers', title: 'The Sleepers',
    body: 'Great creatures of the deep rock. They move through the softer friable layer beneath the rockbed, displacing rather than boring — the stone yields to them.\n\nWhat they leave behind is a network of void passages, traced with Aurun residue. The network is the ecology: it carries moisture to the surface, structures the food web, maintains the mechanical integrity of the rock above. Destroy the network and you destroy the world.',
  },
  {
    id: 'aurun', title: 'Aurun',
    body: 'A substance deposited by the Sleepers in their passage channels — accumulating in the deep rock over generations of repeated transit, and surfacing as a luminescent bloom through porous sections of the rockbed after a Sleeper has passed. Structural and luminescent. Valuable to Korinth\'s civilization as a material — not a narcotic, not a life-extender. A resource, and a consequential one.\n\nThe Shadmen collect the surface bloom from the rockbed in a Sleeper\'s wake — reading the routes, timing the seasons, respecting the rate at which each bloom can recover. Collect too fast, even from the wake, and the bloom thins before it replenishes; stress a route enough and the Sleeper shifts. Once it shifts, the bloom follows it and the old site begins to die. This is the knowledge the Shadmen hold.\n\nVorrin bypasses it entirely. Their boring equipment drives through the hard rockbed to reach the concentrated deep deposits directly — faster, industrial, and permanently destructive. The drilling collapses Sleeper channels and kills the ecology at every scale simultaneously.\n\nContact with the raw, concentrated form in the deep passages is rare outside the channels themselves. Those exposed to it describe a sharpening — a sensitivity to the deep rock\'s movements. The Veil studies this carefully.',
  },
  {
    id: 'seir', title: 'The Seir',
    body: 'An ancient text — ecological record or prophecy, depending on who is reading it. Its core claim: that when the northern blooms fail and the deep channels close, one who walks both the surface world and the rock-world will open the third path.\n\nTwo camps contest what this means. The believers hold that the text describes a specific person — a lord\'s heir, born of Aridun, already present. The skeptics say it describes a quality and a moment, not an individual, and that pinning it to the noble heir who needs the Shadmen most is exactly the mistake desperation produces.\n\nMother Ysolde reads it as prophecy. The "third path" — between extraction and preservation — has not yet been named by either side.',
  },
  {
    id: 'calder', title: 'House Calder',
    body: 'Granted the Aridun fief sixty years ago — a consolidation prize when the empire needed a reliable presence in a difficult seat.\n\nThe grandfather made first contact with the Shadmen and established a relationship of cautious respect. Two generations have held the world carefully: no mass extraction, no drilling, Aurun gathered as it comes. The fief has now been revoked in favour of House Vorrin.',
  },
  {
    id: 'vorrin', title: 'House Vorrin',
    body: 'The new grantees. They arrived with boring rigs and have been drilling directly into the hard rockbed — the fastest route to Aurun deposits.\n\nThe drilling collapses Sleeper passages immediately, destroying travel networks built over generations and, in some cases, killing Shadmen who depend on them. The ecology cannot recover at this pace.',
  },
  {
    id: 'shadmen', title: 'The Shadmen',
    body: 'The indigenous people of the rockbed. They build their communities — Hollows — within the hard stone, navigating via Sleeper-adjacent passages. Their material culture is shaped by the rock: they know it as living infrastructure, not raw resource.\n\nFirst contact with House Calder was made two generations ago. The relationship has been careful and, on both sides, sustained. Vorrin\'s drilling threatens everything they built.',
  },
  {
    id: 'korinth', title: 'Korinth',
    body: 'The empire that granted and has now revoked the Aridun fief. Its interests are material and distant.\n\nThe formal Calder objection to Vorrin\'s drilling methods has not been acknowledged. Korinth does not appear to be listening.',
  },
  {
    id: 'saltspire', title: 'Saltspire',
    body: 'The capital city of Aridun and the seat of House Calder\'s rule. Built into a coastal rockbed formation — carved from the same ancient hard stone that the boring rigs are now beginning to reach from below.\n\nWithin Saltspire sits the Residency: the palace and administrative heart of House Calder, its rooms cut from living rock. The great hallway, the court, the communications room, the Veil\'s sanctum, the Corsair deck — all the same stone.',
  },
  {
    id: 'veil', title: 'The Veil',
    body: 'Older than House Calder\'s presence on Aridun. Not a galactic order with a programme — the Veil are Aridun\'s keepers of long memory: Sleeper migration patterns, deep water tables, the ecology of the Aurun blooms. They watch what the houses treat as a resource and the Shadmen treat as home, and record what both miss.\n\nTheir discipline is reading deep pattern — the ecological and geological rhythms that run beneath the politics. The Seir is their primary text. They have a presence within House Calder\'s court at Saltspire, and their reach extends further than their numbers suggest.\n\nMother Ysolde is their elder and their patience. Sela is their urgency.',
  },
];

const CODEX_CHARACTERS = {
  'Lord Aldric': {
    title: 'Lord Aldric Calder',
    body: 'Second generation of Calder on Aridun. His father made the Shadmen contact out of necessity — you cannot govern this world without understanding it. Aldric inherited that arrangement and maintained it, but as policy rather than relationship. He kept the agreements, paid fair prices for Shadmen guidance, filed formal objections to Vorrin\'s early encroachments through proper channels.\n\nHe is not naive about power — he understands it acutely — but he believes its legitimate exercise should be answered in kind. The Korinth decree has confounded him. Not because he doesn\'t understand politics, but because he genuinely believes sixty years of Calder stewardship speaks for itself. He hasn\'t fully grasped that Korinth isn\'t listening to records anymore.',
  },
  'Halix': {
    title: 'Halix',
    body: 'A Reckoner — trained in a specific discipline: that sufficient information, correctly analysed, resolves into the right course of action. He does not operate on intuition. He came to House Calder with references that checked out and a skill that proved itself quickly. Where he came from before is in his file.\n\nHis intelligence picture of Aridun is the most complete in the Residency — Vorrin drilling schedules, Pale Legion patrol rotations, Shadmen route maps — not because he has special gifts but because he is systematic in a way most people find exhausting.',
  },
  'Mother Ysolde': {
    title: 'Mother Ysolde',
    body: 'She was at Saltspire before Aldric was lord. She was there when his father held the seat. She is the oldest person in the Residency by some margin and does not draw attention to this.\n\nThe Veil\'s discipline is record-keeping — ecological observation, Sleeper migration patterns, deep water tables, the slow signals in the rock — accumulated across generations. Ysolde holds more time-series data on Aridun\'s deep patterns than anyone alive. She does not call this prophecy; she calls it reading. She reads the Seir the same way: not as mysticism but as a precise account of observable conditions, written by someone who observed them. She speaks rarely. When she does, she has finished thinking.',
  },
  'Sela': {
    title: 'Sela',
    body: 'She is not from the court. She came to Saltspire. She grew up in the deep desert — not Shadmen, but close enough to their world to read the rock the way people read things they grew up inside rather than learned. She knows Sleeper routes that are not on any map because you cannot map them; they shift.\n\nShe has been in the Residency long enough to understand its rhythms but has never fully belonged to it. She is of the Veil — their urgency, where Ysolde is their patience — which means she holds a longer view of what is happening to Aridun than anyone else in this building, and finds it harder than any of them to sit still.',
  },
  'Master Orlin': {
    title: 'Master Orlin',
    body: 'A decade in the Residency, treating the same household. He knows the bodies of House Calder\'s court the way a physician learns people over years — who carries tension in the neck, who doesn\'t sleep well, who has the particular mineral dryness in their skin that comes from time in the deep desert.\n\nHe knows Aridun\'s medicine specifically: what the rock environment does to people, how the dry altitude affects healing, how Aurun exposure — rare, but not unknown in a house like this — presents. He is good at his work and careful with it, and the household likes him for both.',
  },
  'Brannic': {
    title: 'Brannic',
    body: 'Aridun-born, not Shadmen. His father was a garrison soldier in Saltspire. He grew up in the palace\'s service wing and learned his trade under the previous Bladewarden — a more traditional soldier who hadn\'t fully adapted to what fighting on Aridun actually means.\n\nBrannic has spent eight years correcting for that. He knows the Saltguard\'s limits on this terrain and has built something closer to intelligence relationships with Shadmen contacts — not alliance, but the kind of mutual understanding that requires years and honesty about what each side needs. He considers this the most militarily important thing he has done since taking the post.',
  },
};

export default class ResidencyScene extends Phaser.Scene {
  constructor() {
    super('ResidencyScene');
  }

  init(data) {
    // Accept an optional startRoom from scenes that navigate back here
    // (e.g. WorldMapScene returns to 'comms').
    this._startRoom = (data && data.startRoom) || 'hall';
  }

  create() {
    this.current = this._startRoom || 'hall';
    this.sayIndex = 0;
    this.charSayProgress = {};
    this.dynamic = [];
    this.backdropImg = null;
    this.dialogueObjects = [];
    this.dialogueActive = false;
    this.codexOpen = false;
    this.codexObjects = [];
    this.codexSection = 'world';
    this.codexEntryId = CODEX_LORE[0].id;

    // Persistent layers.
    this.wall = this.add
      .image(0, 0, 'interiorWall')
      .setOrigin(0, 0)
      .setDepth(-100);
    this.bd = this.add.graphics().setDepth(-90);
    this.bar = this.add.graphics().setDepth(100);
    this.frame = this.add.graphics().setDepth(900);
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0, 0).setDepth(940);

    this.dust = this.add
      .particles(0, 0, 'glow', {
        x: { min: 0, max: this.scale.width },
        y: { min: 40, max: this.scale.height * 0.6 },
        lifespan: 9000,
        speedX: { min: -5, max: 5 },
        speedY: { min: -6, max: 4 },
        scale: { start: 0.05, end: 0 },
        alpha: { start: 0.18, end: 0 },
        tint: 0xffe0b0,
        blendMode: Phaser.BlendModes.ADD,
        frequency: 320,
        quantity: 1,
      })
      .setDepth(50);

    this.createAudio();
    this.createFilterToggle();
    // ESC walks back one room (toward the hall).
    this.input.keyboard.on('keydown-ESC', () => {
      const back = EXITS[this.current] && EXITS[this.current].back;
      if (back) this.travelTo(back);
    });
    this.input.keyboard.on('keydown-K', () => {
      const on = togglePainterly(this);
      if (this.filterCircle) this.filterCircle.setAlpha(on ? 1 : 0.45);
    });

    this.layout(this.scale.width, this.scale.height);
    this.cameras.main.fadeIn(600, 6, 4, 12);
    this.inputReadyAt = this.time.now + 350;
    this.showEntryTitle();

    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
      this.destroyCommsAnim();
      this.exitDialogue();
      this.closeCodex();
    });
  }

  createAudio() {
    if (!this.game.audio) this.game.audio = new AudioManager();
    this.ambient = this.game.audio;
    // Pre-build the graph now so the first gesture starts sound without a hitch.
    this.ambient.prepare();
    // Inside the Residency the score is contained and courtly.
    this.ambient.setMusicState('residency');
    this.ambient.setAmbience(this.current);
    const startOnce = () => this.ambient.start();
    this.input.once('pointerdown', startOnce);
    this.input.keyboard.once('keydown', startOnce);

    const on0 = this.ambient.enabled;
    this.musicCircle = this.add
      .circle(0, 0, 20, 0xffffff, 0.14)
      .setStrokeStyle(2, GOLD, 0.5)
      .setDepth(910)
      .setAlpha(on0 ? 1 : 0.5)
      .setInteractive({ useHandCursor: true });
    this.musicLabel = this.add
      .text(0, 0, on0 ? '♪' : '♪̷', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: CREAM,
      })
      .setOrigin(0.5)
      .setDepth(911);
    this.musicCircle.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      this.ambient.start();
      const on = this.ambient.toggle();
      this.musicCircle.setAlpha(on ? 1 : 0.5);
      this.musicLabel.setText(on ? '♪' : '♪̷');
    });
  }

  createFilterToggle() {
    this.filterCircle = this.add
      .circle(0, 0, 20, 0xffffff, 0.14)
      .setStrokeStyle(2, GOLD, 0.5)
      .setDepth(910)
      .setInteractive({ useHandCursor: true });
    this.filterLabel = this.add
      .text(0, 0, '✦', { fontFamily: 'monospace', fontSize: '17px', color: CREAM })
      .setOrigin(0.5)
      .setDepth(911);
    this.filterCircle.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      const on = togglePainterly(this);
      this.filterCircle.setAlpha(on ? 1 : 0.45);
    });
  }

  // --- Navigation -----------------------------------------------------------

  goTo(scene) {
    if (this.time.now < this.inputReadyAt) return;
    this.cameras.main.fadeOut(500, 6, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  // --- Rendering ------------------------------------------------------------

  layout(width, height) {
    this.wall.setDisplaySize(width, height);
    this.vignette.setDisplaySize(width, height);

    // Ornate frame.
    this.frame.clear();
    this.frame.lineStyle(3, GOLD, 0.72);
    this.frame.strokeRect(6, 6, width - 12, height - 12);
    this.frame.lineStyle(1, GOLD, 0.48);
    this.frame.strokeRect(11, 11, width - 22, height - 22);

    if (this.musicCircle) {
      this.musicCircle.setPosition(width - 32, 30);
      this.musicLabel.setPosition(width - 32, 30);
    }
    if (this.filterCircle) {
      this.filterCircle.setPosition(width - 74, 30);
      this.filterLabel.setPosition(width - 74, 30);
    }

    this.renderLocation();
  }

  onResize(gameSize) {
    this.exitDialogue();
    this.closeCodex();
    this.layout(gameSize.width, gameSize.height);
  }

  clearDynamic() {
    this.dynamic.forEach((o) => o.destroy());
    this.dynamic = [];
  }

  renderLocation() {
    if (!this.bd) return;
    // Crossfade the room's atmosphere as you move through the Residency.
    this.ambient?.setAmbience(this.current);
    this.clearDynamic();
    this.destroyCommsAnim();           // live comms objects are rebuilt below if needed
    this.doorHotspots = {};            // populated by sceneHall / sceneShell
    this.captionText = null;           // recreated by renderHallCaption (hall only)
    const { width, height } = this.scale;
    const loc = LOCATIONS[this.current];
    const floorY = Math.round(height * 0.60); // full-canvas floor line (procedural rooms)

    // Track which characters the player has encountered (for the Codex).
    if (loc.who) {
      const met = this.registry.get('metCharacters') || [];
      if (!met.includes(loc.who)) {
        this.registry.set('metCharacters', [...met, loc.who]);
      }
    }

    // Painted scene — EVERY room fills the full canvas, for one consistent frame.
    this.bd.clear();
    const bgKey = USE_HALL_BG ? BACKDROPS[loc.feature] : null;
    const useBg = !!bgKey && this.textures.exists(bgKey);
    if (useBg) {
      this.showBackdrop(bgKey, width, height);
      if (loc.feature === 'hall')        this.setHallHotspots(width, height);
      if (loc.feature === 'court')       this.setCourtHotspots(width, height);
      if (loc.feature === 'living_hall') this.setWingHotspots('quarters', 'solar');
      if (loc.feature === 'spirit_hall') this.setWingHotspots('veil', 'war');
      if (loc.feature === 'comms') {
        // Live rotating planet + sweep overlaid on the painted dish.
        this.commsScreenInfo = {
          x: Math.round(width * 0.72), y: Math.round(height * 0.400),
          R: Math.round(height * 0.21), prRatio: 0.29, overlay: true,
        };
        this.createCommsAnim();
      }
    } else if (loc.feature === 'comms') {
      if (this.backdropImg) this.backdropImg.setVisible(false);
      this.sceneComms(this.bd, width, height);
      this.createCommsAnim();
    } else {
      if (this.backdropImg) this.backdropImg.setVisible(false);
      this.drawScene(loc, width, floorY);
    }

    // Slim bar for all screens — character interaction is via in-scene sprites.
    const bt = Math.round(height * 0.86);
    this.drawPanel(width, height, bt);
    this.createDoorZones();
    if (loc.feature === 'hall') this.renderHallCaption(loc, width, height, bt);
    else this.renderRoomBar(loc, width, height, bt);
    if (loc.who) this.addCharacterSprites(loc, width, floorY);
  }

  /** The shared translucent UI panel — identical style on every screen. */
  drawPanel(width, height, bt) {
    const b = this.bar;
    b.clear();
    const ph = height - bt;
    // Transparent purple overlay — room shows through with a purple tint.
    const grad = 5;
    for (let i = 0; i < grad; i += 1) {
      b.fillStyle(0x2a1848, (0.35 + 0.40 * ((i + 1) / grad)));
      b.fillRect(0, bt + (ph * i) / grad, width, ph / grad + 1);
    }
    // Sandstone + gold top trim.
    b.fillStyle(0xb07d4a, 0.90);
    b.fillRect(0, bt, width, 2);
    b.fillStyle(GOLD, 0.80);
    b.fillRect(0, bt + 2, width, 1);
    // Gold corner brackets.
    const cs = 22;
    b.fillStyle(GOLD, 0.90);
    b.fillRect(0, bt, cs, 2);
    b.fillRect(0, bt, 2, cs);
    b.fillRect(width - cs, bt, cs, 2);
    b.fillRect(width - 2, bt, 2, cs);
  }

  // --- Painted backdrop (experimental) --------------------------------------

  /** Generic backdrop display — creates or reuses a full-canvas image for the given texture key.
   *  Hotspot setup is handled separately by setHallHotspots / setCourtHotspots / setWingHotspots. */
  showBackdrop(bgKey, width, height) {
    // Hide the old backdrop if switching to a different texture.
    if (this.backdropImg && this.backdropImg.texture.key !== bgKey) {
      this.backdropImg.setVisible(false);
      this.backdropImg = null;
    }
    if (!this.backdropImg) {
      this.backdropImg = this.add.image(0, 0, bgKey).setOrigin(0, 0).setDepth(-60);
      // Keep backwards-compat alias so legacy `hallBgImg` references still work.
      this.hallBgImg = this.backdropImg;
    }
    this.backdropImg.setVisible(true).setDisplaySize(width, height);
  }

  /** @deprecated Use showBackdrop('hallBg', …) + setHallHotspots(). Kept for legacy call-sites. */
  showHallBackground(width, height) {
    this.showBackdrop('hallBg', width, height);
    this.setHallHotspots(width, height);
  }

  /** Door hotspots for the painted Hall backdrop. */
  setHallHotspots(width, height) {
    const door = (x, y, w, h, key) => ({
      x: width * x, y: height * y, w: width * w, h: height * h,
      key, label: LOCATIONS[key].name,
    });
    this.doorHotspots = {
      forward:    door(0.43, 0.28, 0.14, 0.34, 'court'),
      leftInner:  door(0.275, 0.42, 0.085, 0.26, 'comms'),
      leftOuter:  door(0.135, 0.42, 0.075, 0.24, 'yard'),
      rightInner: door(0.64, 0.42, 0.085, 0.26, 'deck'),
      rightOuter: door(0.79, 0.42, 0.075, 0.24, 'infirmary'),
    };
  }

  /** Door hotspots over the painted court's two wing arches. */
  setCourtHotspots(width, height) {
    const door = (x, y, w, h, key) => ({
      x: width * x, y: height * y, w: width * w, h: height * h,
      key, label: LOCATIONS[key].name,
    });
    this.doorHotspots = {
      left:  door(0.05, 0.23, 0.09, 0.57, 'living_hall'),
      right: door(0.86, 0.23, 0.09, 0.57, 'spirit_hall'),
    };
  }

  /** Generic left+right door hotspots for wing corridor rooms (before painted backdrops). */
  setWingHotspots(leftKey, rightKey) {
    const { width, height } = this.scale;
    const door = (x, y, w, h, key) => ({
      x: width * x, y: height * y, w: width * w, h: height * h,
      key, label: LOCATIONS[key].name,
    });
    // Positions derived from sceneHallway geometry: bwW=0.22, dA=0.38, dB=0.60, vTop=0.18.
    // bwL=0.39*width → TN.x=14.8%, TF.x=23.4% → left arch x≈14–24%.
    // Right arch mirrors: x≈76–86%. Vertical: arch top≈13%, arch bottom≈57% of canvas height.
    this.doorHotspots = {
      left:  door(0.13, 0.13, 0.12, 0.44, leftKey),
      right: door(0.75, 0.13, 0.12, 0.44, rightKey),
    };
  }

  // --- Spatial navigation (doors) -------------------------------------------

  /** Invisible interactive zones over each painted doorway. */
  createDoorZones() {
    Object.values(this.doorHotspots || {}).forEach((hs) => {
      // Subtle warm highlight that fades in over the arch on hover.
      const hl = this.add
        .rectangle(hs.x + hs.w / 2, hs.y + hs.h / 2, hs.w, hs.h, 0xffcc66, 0)
        .setDepth(58);

      const z = this.add
        .zone(hs.x + hs.w / 2, hs.y + hs.h / 2, hs.w, hs.h)
        .setInteractive({ useHandCursor: true })
        .setDepth(60);

      z.on('pointerover', () => {
        hl.setAlpha(0.14);
        this.setCaption(`${hs.label}  ›`);
      });
      z.on('pointerout', () => {
        hl.setAlpha(0);
        this.setCaption(this.defaultCaption);
      });
      z.on('pointerdown', (p, x, y, e) => {
        e?.stopPropagation();
        this.travelTo(hs.key);
      });
      this.dynamic.push(hl, z);
    });
  }

  setCaption(text) {
    if (this.captionText) this.captionText.setText(text);
  }

  /** Walk through a door — a brief fade for a sense of moving rooms. */
  travelTo(key) {
    if (this.time.now < this.inputReadyAt || this.travelling) return;
    this.exitDialogue();
    this.closeCodex();
    this.travelling = true;
    this.cameras.main.fadeOut(200, 6, 4, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.current = key;
      this.sayIndex = 0;
      this.renderLocation();
      this.cameras.main.fadeIn(220, 6, 4, 12);
      this.travelling = false;
      this.inputReadyAt = this.time.now + 250;
    });
  }

  // --- Hall caption ---------------------------------------------------------

  renderHallCaption(loc, width, height, barTop) {
    this.defaultCaption = 'Four wings open off the entrance — the Court lies beyond the arch.';
    this.captionText = this.add
      .text(width * 0.44, barTop + (height - barTop) / 2, this.defaultCaption, {
        fontFamily: 'Georgia, serif',
        fontSize: '17px',
        color: CREAM,
        align: 'center',
        wordWrap: { width: width * 0.62 },
      })
      .setOrigin(0.5)
      .setDepth(102);
    this.dynamic.push(this.captionText);
    this.drawCodex(width - 58, barTop + (height - barTop) / 2);
  }


  // --- Room bar (identity left · interactions centre · navigation right) ----

  renderRoomBar(loc, width, height, barTop) {
    const bh = height - barTop;
    const cy = barTop + bh / 2;

    // LEFT — character coin disc + name, or plain room name.
    const identW = 172;
    if (loc.who) {
      const dx = 42;
      const charTexKey = CHAR_SPRITES[loc.who];
      const hasCharSprite = charTexKey && this.textures.exists(charTexKey);

      // Disc background fill (no stroke — border drawn on top of sprite below)
      const dg = this.add.graphics().setDepth(102);
      dg.fillStyle(0x0e0a18, 1);
      dg.fillCircle(dx, cy, 28);
      dg.fillStyle(loc.accent, 0.18);
      dg.fillCircle(dx, cy, 24);
      if (!hasCharSprite) {
        const faceCol = Phaser.Display.Color.IntegerToColor(loc.accent).darken(30).color;
        dg.fillStyle(faceCol, 1);
        dg.fillCircle(dx, cy - 8, 10);
        dg.fillStyle(0x1b1228, 1);
        dg.fillRoundedRect(dx - 13, cy + 2, 26, 20, { tl: 9, tr: 9, bl: 0, br: 0 });
      }
      this.dynamic.push(dg);

      if (hasCharSprite) {
        // Clip sprite to inner circle so it sits behind the border ring
        const mskG = this.add.graphics();
        mskG.fillStyle(0xffffff);
        mskG.fillCircle(dx, cy, 24);
        const geoMask = mskG.createGeometryMask();
        this.dynamic.push(mskG);

        // Scale so top 22% of sprite height fills the 48px inner disc — head + shoulders
        const src = this.textures.get(charTexKey).source[0];
        const dispH = Math.round(48 / 0.22);
        const dispW = Math.round(dispH * src.width / src.height);
        const sprite = this.add.image(dx, cy - 24, charTexKey)
          .setOrigin(0.5, 0)
          .setDisplaySize(dispW, dispH)
          .setTint(0xc8864e)
          .setMask(geoMask)
          .setDepth(103);
        this.dynamic.push(sprite);
      }

      // Border ring drawn over the sprite
      const discRing = this.add.graphics().setDepth(104);
      discRing.lineStyle(2, loc.accent, 0.6);
      discRing.strokeCircle(dx, cy, 28);
      this.dynamic.push(discRing);

      const discZone = this.add
        .circle(dx, cy, 30).setInteractive({ useHandCursor: true }).setDepth(104);
      discZone.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.enterDialogue(loc); });
      this.dynamic.push(discZone);

      const nameTxt = this.add
        .text(80, cy - 8, loc.who, {
          fontFamily: 'Georgia, serif', fontSize: '15px',
          color: CREAM,
        })
        .setOrigin(0, 0.5).setDepth(104).setInteractive({ useHandCursor: true });
      nameTxt.on('pointerover', () => nameTxt.setColor(GOLD_S));
      nameTxt.on('pointerout', () => nameTxt.setColor(CREAM));
      nameTxt.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.enterDialogue(loc); });
      this.dynamic.push(nameTxt);

      this.dynamic.push(this.add
        .text(80, cy + 8, loc.name, { fontFamily: 'monospace', fontSize: '11px', color: '#9a8878' })
        .setOrigin(0, 0.5).setDepth(104));
    } else {
      this.dynamic.push(this.add
        .text(20, cy, loc.name, { fontFamily: 'Georgia, serif', fontSize: '15px', color: CREAM })
        .setOrigin(0, 0.5).setDepth(104));
    }

    // Column boundaries.
    const codexCX = width - 58;
    const navRight = codexCX - 46;
    const navW = 210;
    const navLeft = navRight - navW;
    const div1X = identW;           // identity | interactions
    const div2X = navLeft - 10;     // interactions | navigation

    const divG = this.add.graphics().setDepth(102);
    divG.lineStyle(1, GOLD, 0.40);
    divG.lineBetween(div1X, barTop + 8, div1X, height - 8);
    divG.lineBetween(div2X, barTop + 8, div2X, height - 8);
    this.dynamic.push(divG);

    // CENTRE — interactions: talk + scene actions, centred in the zone.
    const interactions = [];
    if (loc.who) {
      interactions.push({ label: `Talk to ${loc.who}`, onClick: () => this.enterDialogue(loc) });
    }
    (loc.actions || []).forEach((a) =>
      interactions.push({ label: a.label, onClick: () => this.goTo(a.scene) })
    );
    if (interactions.length > 0) {
      const centerX = div1X + (div2X - div1X) / 2;
      const iItemH = Math.min(32, (bh - 8) / interactions.length);
      const iTotalH = interactions.length * iItemH;
      const iStartY = barTop + (bh - iTotalH) / 2;
      interactions.forEach((c, i) => {
        this.makeInteractionOption(centerX, iStartY + i * iItemH + iItemH / 2, c.label, c.onClick, loc.accent);
      });
    }

    // RIGHT — hover label (filled by door pointerover) + single "Go back" link.
    const roomExits = EXITS[this.current] || {};
    const back = roomExits.back || 'hall';
    const navCX = navLeft + navW / 2;

    // Hover label — empty at rest, room name appears when cursor enters a door.
    this.captionText = this.add
      .text(navCX, barTop + bh * 0.30, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '15px',
        color: GOLD_S,
        align: 'center',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(104);
    this.defaultCaption = '';
    this.dynamic.push(this.captionText);

    // Go back — the only persistent navigation item.
    const backTxt = this.add
      .text(navCX, barTop + bh * 0.70, `‹  ${LOCATIONS[back].name}`, {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#d8c4a0',
        align: 'center',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(104)
      .setInteractive({ useHandCursor: true });
    backTxt.on('pointerover', () => backTxt.setColor(CREAM));
    backTxt.on('pointerout',  () => backTxt.setColor('#d8c4a0'));
    backTxt.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.travelTo(back); });
    this.dynamic.push(backTxt);

    this.drawCodex(codexCX, cy);
  }

  makeInteractionOption(cx, cy, label, onClick, accent) {
    const txt = this.add
      .text(cx, cy, label, {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: CREAM,
      })
      .setOrigin(0.5, 0.5).setDepth(104).setInteractive({ useHandCursor: true });
    txt.on('pointerover', () => txt.setColor(GOLD_S));
    txt.on('pointerout', () => txt.setColor(CREAM));
    txt.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); onClick(); });
    this.dynamic.push(txt);
  }

  makeTextOption(x, y, label, onClick, accent) {
    const accentHex = accent
      ? Phaser.Display.Color.IntegerToColor(accent).rgba
      : GOLD_S;

    const bullet = this.add
      .text(x, y, '›', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: GOLD_S,
      })
      .setOrigin(0, 0.5)
      .setDepth(104);

    const txt = this.add
      .text(x + 16, y, label, {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#d8c4a0',
      })
      .setOrigin(0, 0.5)
      .setDepth(104);

    // Invisible hit zone wider than the text so short labels stay clickable.
    const zone = this.add
      .rectangle(x + 110, y, 224, 26, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(105);

    zone.on('pointerover', () => txt.setColor(CREAM));
    zone.on('pointerout', () => txt.setColor('#d8c4a0'));
    zone.on('pointerdown', (p, lx, ly, e) => {
      e?.stopPropagation();
      onClick();
    });

    this.dynamic.push(bullet, txt, zone);
  }

  drawCodex(cx, cy) {
    const w = 30;
    const h = 40;
    const g = this.add.graphics().setDepth(103);

    const draw = (hover) => {
      g.clear();
      g.fillStyle(hover ? 0x5a3418 : 0x3e2210, 1);              // cover
      g.fillRect(cx - w / 2, cy - h / 2, w, h);
      g.lineStyle(2, hover ? GOLD : 0xd4922e, 1);               // border — full opacity
      g.strokeRect(cx - w / 2, cy - h / 2, w, h);
      g.fillStyle(hover ? 0x7a4820 : 0x5c3216, 1);              // spine
      g.fillRect(cx - w / 2, cy - h / 2, 5, h);
      g.lineStyle(1, 0xe0a840, hover ? 0.9 : 0.7);              // spine highlight
      g.lineBetween(cx - w / 2 + 5, cy - h / 2 + 3, cx - w / 2 + 5, cy + h / 2 - 3);
      g.lineStyle(1, hover ? 0xe0d0a0 : 0xa89060, 0.9);         // page lines
      [-9, -2, 5, 12].forEach((dy) => {
        g.lineBetween(cx - w / 2 + 8, cy + dy, cx + w / 2 - 3, cy + dy);
      });
      const aa = hover ? 1 : 0.85;
      g.fillStyle(hover ? GOLD : 0xd4922e, aa);                  // corner accents
      g.fillRect(cx + w / 2 - 6, cy - h / 2, 6, 1.5);
      g.fillRect(cx + w / 2 - 1.5, cy - h / 2, 1.5, 6);
      g.fillRect(cx + w / 2 - 6, cy + h / 2 - 1.5, 6, 1.5);
      g.fillRect(cx + w / 2 - 1.5, cy + h / 2 - 6, 1.5, 6);
    };

    draw(false);

    const lbl = this.add
      .text(cx, cy + h / 2 + 5, 'CODEX', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#c8922a',
      })
      .setOrigin(0.5, 0)
      .setDepth(103);

    const zone = this.add
      .rectangle(cx, cy, w + 10, h + 16, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(106);

    zone.on('pointerover', () => { draw(true); lbl.setColor('#f0d060'); });
    zone.on('pointerout', () => { draw(false); lbl.setColor('#c8922a'); });
    zone.on('pointerdown', (p, lx, ly, e) => { e?.stopPropagation(); this.openCodex(); });

    this.dynamic.push(g, lbl, zone);
  }

  // --- Codex overlay --------------------------------------------------------

  openCodex() {
    if (this.codexOpen) { this.closeCodex(); return; }
    this.exitDialogue();
    this.codexOpen = true;
    this.codexObjects = [];
    if (!this.codexSection) this.codexSection = 'world';
    if (!this.codexEntryId) this.codexEntryId = CODEX_LORE[0].id;
    this.renderCodexPanel();
  }

  closeCodex() {
    if (!this.codexOpen) return;
    (this.codexObjects || []).forEach((o) => o.destroy());
    this.codexObjects = [];
    this.codexOpen = false;
  }

  renderCodexPanel() {
    (this.codexObjects || []).forEach((o) => o.destroy());
    this.codexObjects = [];
    const C = this.codexObjects;
    const { width, height } = this.scale;

    const pw = Math.round(width * 0.86);
    const ph = Math.round(height * 0.84);
    const px = Math.round((width - pw) / 2);
    const py = Math.round((height - ph) / 2);
    const headerH = 44;
    const listW = 230;

    // Scrim — full canvas, click outside panel to close.
    const scrim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72)
      .setInteractive().setDepth(970);
    scrim.on('pointerdown', () => this.closeCodex());
    C.push(scrim);

    // Main panel background.
    const bg = this.add.graphics().setDepth(971);
    bg.fillStyle(0x080512, 1);
    bg.fillRect(px, py, pw, ph);
    bg.lineStyle(1.5, GOLD, 0.55);
    bg.strokeRect(px, py, pw, ph);
    bg.lineStyle(1, GOLD, 0.2);
    bg.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
    C.push(bg);

    // Header band.
    const hdr = this.add.graphics().setDepth(972);
    hdr.fillStyle(0x100c22, 1);
    hdr.fillRect(px, py, pw, headerH);
    hdr.lineStyle(1, GOLD, 0.3);
    hdr.lineBetween(px, py + headerH, px + pw, py + headerH);
    C.push(hdr);

    C.push(this.add.text(px + pw / 2, py + headerH / 2, 'CODEX', {
      fontFamily: 'monospace', fontSize: '16px', color: GOLD_S, letterSpacing: 8,
    }).setOrigin(0.5).setDepth(973));

    const closeTxt = this.add.text(px + pw - 14, py + headerH / 2, '✕', {
      fontFamily: 'monospace', fontSize: '15px', color: '#6a5040',
    }).setOrigin(1, 0.5).setDepth(973).setInteractive({ useHandCursor: true });
    closeTxt.on('pointerover', () => closeTxt.setColor('#f0e0c0'));
    closeTxt.on('pointerout', () => closeTxt.setColor('#6a5040'));
    closeTxt.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.closeCodex(); });
    C.push(closeTxt);

    // Left column background.
    const contentY = py + headerH;
    const colH = ph - headerH;
    const listBg = this.add.graphics().setDepth(972);
    listBg.fillStyle(0x060410, 1);
    listBg.fillRect(px, contentY, listW, colH);
    listBg.lineStyle(1, GOLD, 0.18);
    listBg.lineBetween(px + listW, contentY, px + listW, py + ph);
    C.push(listBg);

    // Section tabs.
    const TABS = [{ id: 'world', label: 'WORLD LORE' }, { id: 'people', label: 'PEOPLE' }];
    const tabH = 36;
    TABS.forEach((tab, i) => {
      const tabY = contentY + i * tabH;
      const sel = this.codexSection === tab.id;
      if (sel) {
        const hl = this.add.graphics().setDepth(972);
        hl.fillStyle(0x1c1638, 1);
        hl.fillRect(px, tabY, listW, tabH);
        hl.lineStyle(2, GOLD, 0.45);
        hl.lineBetween(px, tabY + tabH - 1, px + listW, tabY + tabH - 1);
        C.push(hl);
      }
      const tabTxt = this.add.text(px + listW / 2, tabY + tabH / 2, tab.label, {
        fontFamily: 'monospace', fontSize: '11px', color: sel ? GOLD_S : '#4a3a2a', letterSpacing: 2,
      }).setOrigin(0.5).setDepth(973).setInteractive({ useHandCursor: true });
      if (!sel) {
        tabTxt.on('pointerover', () => tabTxt.setColor('#a08060'));
        tabTxt.on('pointerout', () => tabTxt.setColor('#4a3a2a'));
      }
      tabTxt.on('pointerdown', (p, x, y, e) => {
        e?.stopPropagation();
        if (this.codexSection === tab.id) return;
        this.codexSection = tab.id;
        if (tab.id === 'world') {
          this.codexEntryId = CODEX_LORE[0].id;
        } else {
          const met = this.registry.get('metCharacters') || [];
          const first = met.find((n) => CODEX_CHARACTERS[n]);
          this.codexEntryId = first || null;
        }
        this.renderCodexPanel();
      });
      C.push(tabTxt);

      // Hairline divider between tabs.
      if (i < TABS.length - 1) {
        const td = this.add.graphics().setDepth(972);
        td.lineStyle(1, 0x1e1830, 1);
        td.lineBetween(px + 12, tabY + tabH, px + listW - 12, tabY + tabH);
        C.push(td);
      }
    });

    // Entry list.
    const entries = this.codexSection === 'world'
      ? CODEX_LORE.map((e) => ({ id: e.id, label: e.title }))
      : (this.registry.get('metCharacters') || [])
          .filter((n) => CODEX_CHARACTERS[n])
          .map((n) => ({ id: n, label: CODEX_CHARACTERS[n].title }));

    const listStartY = contentY + TABS.length * tabH + 6;
    const entryH = 27;
    entries.forEach((entry) => {
      const ey = listStartY + entries.indexOf(entry) * entryH;
      const sel = this.codexEntryId === entry.id;
      if (sel) {
        const ehl = this.add.graphics().setDepth(972);
        ehl.fillStyle(0x1e1840, 1);
        ehl.fillRect(px + 2, ey, listW - 4, entryH);
        ehl.lineStyle(1, GOLD, 0.2);
        ehl.lineBetween(px + 2, ey + entryH - 1, px + listW - 4, ey + entryH - 1);
        C.push(ehl);
      }
      const eTxt = this.add.text(px + 14, ey + entryH / 2, entry.label, {
        fontFamily: 'Georgia, serif', fontSize: '13px',
        color: sel ? '#f0e0c0' : '#7a6a4a',
      }).setOrigin(0, 0.5).setDepth(973).setInteractive({ useHandCursor: true });
      if (!sel) {
        eTxt.on('pointerover', () => eTxt.setColor('#c8b090'));
        eTxt.on('pointerout', () => eTxt.setColor('#7a6a4a'));
      }
      eTxt.on('pointerdown', (p, x, y, e) => {
        e?.stopPropagation();
        if (this.codexEntryId === entry.id) return;
        this.codexEntryId = entry.id;
        this.renderCodexPanel();
      });
      C.push(eTxt);
    });

    // Empty-state message for people tab.
    if (this.codexSection === 'people' && entries.length === 0) {
      C.push(this.add.text(px + listW / 2, listStartY + 40, 'No one\nencountered yet.', {
        fontFamily: 'Georgia, serif', fontSize: '12px', color: '#3a2e1e', align: 'center',
      }).setOrigin(0.5, 0).setDepth(973));
    }

    // Right column — entry content.
    const rightX = px + listW + 28;
    const rightW = pw - listW - 44;
    const rightY = contentY + 20;

    let entry = null;
    if (this.codexSection === 'world') {
      entry = CODEX_LORE.find((e) => e.id === this.codexEntryId);
      if (entry) entry = { title: entry.title, body: entry.body };
    } else if (this.codexEntryId) {
      const cd = CODEX_CHARACTERS[this.codexEntryId];
      if (cd) entry = { title: cd.title, body: cd.body };
    }

    if (entry) {
      C.push(this.add.text(rightX, rightY, entry.title, {
        fontFamily: 'Georgia, serif', fontSize: '19px', color: GOLD_S,
      }).setDepth(973));

      const divG = this.add.graphics().setDepth(973);
      divG.lineStyle(1, GOLD, 0.40);
      divG.lineBetween(rightX, rightY + 30, rightX + rightW, rightY + 30);
      C.push(divG);

      C.push(this.add.text(rightX, rightY + 46, entry.body, {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: '#c0b0cc',
        wordWrap: { width: rightW },
        lineSpacing: 6,
      }).setDepth(973));
    } else if (this.codexSection === 'people') {
      C.push(this.add.text(px + listW + (pw - listW) / 2, contentY + colH / 2, 'Select a name.', {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: '#3a2e1e',
      }).setOrigin(0.5).setDepth(973));
    }
  }

  // --- Character sprites in scene -------------------------------------------

  addCharacterSprites(loc, width, floorY) {
    if (!loc.who) return;
    const cx = width / 2;
    const offsets = {
      court: -90, comms: -100, veil: 10, solar: 80,
      infirmary: -80, yard: 80,
    };
    // Some rooms draw their floor at a different fraction than the global 0.60.
    const floorFracs = { comms: 0.76 };
    const actualFloorY = floorFracs[loc.feature]
      ? Math.round(this.scale.height * floorFracs[loc.feature])
      : floorY;
    const offX = offsets[loc.feature] ?? 0;
    const fx = cx + offX;
    const s = Phaser.Math.Clamp(actualFloorY / 360, 0.8, 1.4);

    const charTexKey = CHAR_SPRITES[loc.who];
    const hasCharSprite = charTexKey && this.textures.exists(charTexKey);
    const figH = 110 * s;
    let hitH = figH;
    let hitW = 60 * s;

    if (hasCharSprite) {
      const src = this.textures.get(charTexKey).source[0];
      const dispH = figH * 1.7;
      const dispW = Math.round(dispH * src.width / src.height);
      hitH = dispH;
      hitW = dispW;
      const sprite = this.add.image(fx, actualFloorY, charTexKey)
        .setOrigin(0.5, 1)
        .setDisplaySize(dispW, dispH)
        .setTint(0xc8864e)
        .setDepth(10);
      this.dynamic.push(sprite);
    } else {
      const g = this.add.graphics().setDepth(10);
      this.drawCharacterFigure(g, fx, actualFloorY, loc.accent, s);
      this.dynamic.push(g);
    }
    const zone = this.add
      .zone(fx, actualFloorY - hitH / 2, hitW, hitH)
      .setInteractive({ useHandCursor: true })
      .setDepth(11);

    let tooltip = null;
    zone.on('pointerover', () => {
      tooltip = this.add
        .text(fx, actualFloorY - hitH - 6, loc.who, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: CREAM,
          backgroundColor: '#0a0610',
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0.5, 1)
        .setDepth(15);
      this.dynamic.push(tooltip);
    });
    zone.on('pointerout', () => {
      if (tooltip) { tooltip.destroy(); tooltip = null; }
    });
    zone.on('pointerdown', (p, x, y, e) => {
      e?.stopPropagation();
      if (tooltip) { tooltip.destroy(); tooltip = null; }
      this.enterDialogue(loc);
    });
    this.dynamic.push(zone);
  }

  drawCharacterFigure(g, x, floorY, accent, s = 1) {
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(x, floorY + 2, 52 * s, 10 * s);
    // Outer cloak.
    g.fillStyle(0x1a1228, 1);
    g.fillTriangle(x - 22 * s, floorY, x + 22 * s, floorY, x, floorY - 82 * s);
    // Inner robe — accent tinted.
    const inner = Phaser.Display.Color.IntegerToColor(accent).darken(45).color;
    g.fillStyle(inner, 1);
    g.fillTriangle(x - 13 * s, floorY - 6 * s, x + 13 * s, floorY - 6 * s, x, floorY - 74 * s);
    // Shoulders.
    g.fillStyle(0x2a1e38, 1);
    g.fillEllipse(x, floorY - 76 * s, 46 * s, 18 * s);
    // Head.
    const faceCol = Phaser.Display.Color.IntegerToColor(accent).darken(30).color;
    g.fillStyle(faceCol, 1);
    g.fillCircle(x, floorY - 90 * s, 14 * s);
    // Hood shadow.
    g.fillStyle(0x0a0610, 0.65);
    g.fillRoundedRect(x - 16 * s, floorY - 106 * s, 32 * s, 22 * s, 8 * s);
    // Accent trim stripe.
    g.fillStyle(accent, 0.45);
    g.fillRect(x - 2 * s, floorY - 78 * s, 4 * s, 56 * s);
    // Eyes.
    g.fillStyle(0xffd080, 0.7);
    g.fillCircle(x - 5 * s, floorY - 91 * s, 1.5 * s);
    g.fillCircle(x + 5 * s, floorY - 91 * s, 1.5 * s);
  }

  // --- Dialogue overlay (Cryo Dune style) ------------------------------------

  playVoiceLine(who, index) {
    const key = `${who.toLowerCase().replace(/\s+/g, '_')}_say_${index}`;
    if (!this.cache.audio.has(key)) return;
    if (this.voiceSound && this.voiceSound.isPlaying) this.voiceSound.stop();
    this.voiceSound = this.sound.add(key, { volume: 0.9 });
    this.voiceSound.play();
  }

  enterDialogue(loc) {
    if (this.dialogueActive || this.time.now < this.inputReadyAt) return;
    this.dialogueActive = true;
    this.dialogueObjects = [];
    // Resume from last seen line; loop line (last index) is the ceiling
    const loopIdx = loc.say ? loc.say.length - 1 : 0;
    if (loc.who === 'Halix') {
      const aldricSeen = !!this.charSayProgress['Lord Aldric'];
      if (!aldricSeen) {
        this.sayIndex = 0; // gate: hold on the redirect line
      } else {
        const saved = this.charSayProgress['Halix'] || 0;
        this.sayIndex = Math.min(saved <= 0 ? 1 : saved, loopIdx);
      }
    } else {
      this.sayIndex = Math.min(this.charSayProgress[loc.who] || 0, loopIdx);
    }
    this.renderDialogueOverlay(loc, this.scale.width, this.scale.height);
    if (loc.who) this.playVoiceLine(loc.who, this.sayIndex);
  }

  exitDialogue() {
    if (!this.dialogueActive) return;
    if (this.voiceSound && this.voiceSound.isPlaying) this.voiceSound.stop();
    (this.dialogueObjects || []).forEach((o) => o.destroy());
    this.dialogueObjects = [];
    this.dialogueSpeechText = null;
    this.dialogueActive = false;
  }

  renderDialogueOverlay(loc, width, height) {
    const dTop = Math.round(height * 0.56);
    const portW = 180;
    const optH = 52;
    const D = this.dialogueObjects;

    // Scrim — dark base, intercepts clicks to scene below.
    const scrim = this.add
      .rectangle(width / 2, dTop + (height - dTop) / 2, width, height - dTop, 0x0a0610, 0.92)
      .setInteractive()
      .setDepth(950);
    D.push(scrim);

    // Portrait panel — left column.
    const portBg = this.add.graphics().setDepth(951);
    portBg.fillStyle(0x080510, 1);
    portBg.fillRect(0, dTop, portW, height - dTop);
    portBg.lineStyle(1, GOLD, 0.28);
    portBg.lineBetween(portW, dTop + 8, portW, height - 8);
    D.push(portBg);

    // Gold top trim line.
    const trim = this.add.graphics().setDepth(952);
    trim.fillStyle(0xb07d4a, 0.5);
    trim.fillRect(0, dTop - 2, width, 2);
    trim.fillStyle(GOLD, 0.35);
    trim.fillRect(0, dTop, width, 2);
    D.push(trim);

    // Large procedural portrait inside the left column.
    const portCY = dTop + (height - optH - dTop) / 2;
    this.drawDialoguePortrait(portW / 2, portCY, loc, D);

    // Character name below portrait.
    const nameLbl = this.add
      .text(portW / 2, height - optH - 12, loc.who, {
        fontFamily: 'Georgia, serif', fontSize: '12px', color: '#c8a98f',
      })
      .setOrigin(0.5, 1).setDepth(962);
    D.push(nameLbl);

    // Speech bubble — right of portrait column.
    const bubX1 = portW + 22;
    const bubX2 = width - 18;
    const bubY1 = dTop + 20;
    const bubY2 = height - optH - 12;
    const bubW = bubX2 - bubX1;
    const bubH = bubY2 - bubY1;
    const bubG = this.add.graphics().setDepth(960);
    bubG.fillStyle(0x130e20, 1);
    bubG.fillRoundedRect(bubX1, bubY1, bubW, bubH, 10);
    bubG.lineStyle(1, GOLD, 0.28);
    bubG.strokeRoundedRect(bubX1, bubY1, bubW, bubH, 10);
    // Subtle inner tint on upper half.
    bubG.fillStyle(0x1e1830, 0.45);
    bubG.fillRoundedRect(bubX1 + 4, bubY1 + 4, bubW - 8, bubH * 0.42, 8);
    D.push(bubG);

    // Dialogue text.
    const line = loc.say ? loc.say[this.sayIndex] : loc.flavor || '';
    this.dialogueSpeechText = this.add
      .text(bubX1 + 28, bubY1 + 26, line, {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#e0d0f0',
        wordWrap: { width: bubW - 56 },
        lineSpacing: 7,
      })
      .setDepth(961);
    D.push(this.dialogueSpeechText);

    // Options strip separator.
    const optSep = this.add.graphics().setDepth(961);
    optSep.lineStyle(1, GOLD, 0.18);
    optSep.lineBetween(0, height - optH, width, height - optH);
    D.push(optSep);

    const optY = height - optH / 2;

    // "Talk" — cycles through say[] lines.
    if (loc.say && loc.say.length > 1) {
      const talkTxt = this.add
        .text(portW + 28, optY, `Talk to ${loc.who}`, {
          fontFamily: 'Georgia, serif', fontSize: '14px', color: '#a09078',
        })
        .setOrigin(0, 0.5).setDepth(962).setInteractive({ useHandCursor: true });
      talkTxt.on('pointerover', () => talkTxt.setColor('#f0e0c0'));
      talkTxt.on('pointerout', () => talkTxt.setColor('#a09078'));
      talkTxt.on('pointerdown', (p, x, y, e) => {
        e?.stopPropagation();
        const gated = loc.who === 'Halix' && !this.charSayProgress['Lord Aldric'];
        const loopIdx = gated ? 0 : loc.say.length - 1;
        this.sayIndex = Math.min(this.sayIndex + 1, loopIdx);
        this.charSayProgress[loc.who] = this.sayIndex;
        this.dialogueSpeechText.setText(loc.say[this.sayIndex]);
        if (loc.who) this.playVoiceLine(loc.who, this.sayIndex);
      });
      D.push(talkTxt);
    }

    // "Leave" — closes the overlay.
    const leaveTxt = this.add
      .text(width - 24, optY, 'Leave', {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: '#706050',
      })
      .setOrigin(1, 0.5).setDepth(962).setInteractive({ useHandCursor: true });
    leaveTxt.on('pointerover', () => leaveTxt.setColor('#f0e0c0'));
    leaveTxt.on('pointerout', () => leaveTxt.setColor('#706050'));
    leaveTxt.on('pointerdown', (p, x, y, e) => { e?.stopPropagation(); this.exitDialogue(); });
    D.push(leaveTxt);
  }

  drawDialoguePortrait(cx, cy, loc, objs) {
    const accent = loc.accent;
    const w = 136;
    const h = 176;

    // Frame background + border
    const g = this.add.graphics().setDepth(962);
    objs.push(g);
    g.fillStyle(0x0e0a18, 1);
    g.fillRect(cx - w / 2, cy - h / 2, w, h);
    g.fillStyle(accent, 0.14);
    g.fillRect(cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6);

    const charTexKey = CHAR_SPRITES[loc.who];
    const hasCharSprite = charTexKey && this.textures.exists(charTexKey);

    if (hasCharSprite) {
      // Clip sprite to portrait interior rect
      const mskG = this.add.graphics();
      mskG.fillStyle(0xffffff);
      mskG.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, h - 4);
      const geoMask = mskG.createGeometryMask();
      objs.push(mskG);

      // Scale so top 28% of sprite fills portrait height — head + shoulders
      const src = this.textures.get(charTexKey).source[0];
      const dispH = Math.round(h / 0.28);
      const dispW = Math.round(dispH * src.width / src.height);
      const sprite = this.add.image(cx, cy - h / 2, charTexKey)
        .setOrigin(0.5, 0)
        .setDisplaySize(dispW, dispH)
        .setTint(0xc8864e)
        .setMask(geoMask)
        .setDepth(963);
      objs.push(sprite);
    } else {
      // Procedural bust fallback
      const by = cy + 30;
      g.fillStyle(0x1b1228, 1);
      g.fillRoundedRect(cx - 46, by - 10, 92, 70, { tl: 32, tr: 32, bl: 0, br: 0 });
      const faceCol = Phaser.Display.Color.IntegerToColor(accent).darken(40).color;
      g.fillStyle(faceCol, 1);
      g.fillCircle(cx, by - 36, 32);
      g.fillStyle(0x140d20, 1);
      g.fillRoundedRect(cx - 32, cy - h / 2 + 14, 64, 38, 14);
      g.fillStyle(0xffce86, 0.9);
      g.fillCircle(cx - 10, by - 34, 3);
      g.fillCircle(cx + 10, by - 34, 3);
      g.fillStyle(accent, 0.65);
      g.fillRect(cx - 26, by - 4, 52, 4);
    }

    // Border drawn over sprite
    const border = this.add.graphics().setDepth(964);
    border.lineStyle(1.5, GOLD, 0.5);
    border.strokeRect(cx - w / 2, cy - h / 2, w, h);
    objs.push(border);
  }

  // --- Portraits ------------------------------------------------------------

  drawPortrait(cx, cy, accent, name) {
    const g = this.add.graphics().setDepth(102);
    const w = 84;
    const h = 96;
    // Frame.
    g.fillStyle(0x0e0a18, 1);
    g.fillRect(cx - w / 2, cy - h / 2, w, h);
    g.lineStyle(2, GOLD, 0.7);
    g.strokeRect(cx - w / 2, cy - h / 2, w, h);
    // Backing glow.
    g.fillStyle(accent, 0.18);
    g.fillRect(cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6);
    // Bust.
    const by = cy + 18;
    g.fillStyle(0x1b1228, 1);
    g.fillRoundedRect(cx - 26, by - 6, 52, 40, { tl: 16, tr: 16, bl: 0, br: 0 });
    g.fillStyle(Phaser.Display.Color.IntegerToColor(accent).darken(40).color, 1);
    g.fillCircle(cx, by - 18, 17);
    g.fillStyle(0x140d20, 1); // hood/hair
    g.fillRoundedRect(cx - 18, cy - 26, 36, 22, 10);
    // Eyes.
    g.fillStyle(0xffce86, 0.9);
    g.fillCircle(cx - 6, by - 18, 1.7);
    g.fillCircle(cx + 6, by - 18, 1.7);
    this.dynamic.push(g);

    const nm = this.add
      .text(cx, cy + h / 2 + 4, name, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#c8a98f',
      })
      .setOrigin(0.5, 0)
      .setDepth(102);
    this.dynamic.push(nm);
  }

  // --- Painted scenes -------------------------------------------------------

  drawScene(loc, width, floorY) {
    const g = this.bd;
    if (loc.feature === 'hall') {
      this.sceneHall(g, width, floorY);
      return;
    }
    if (loc.feature === 'court') {
      this.sceneCourt(g, width, floorY);
      return;
    }
    if (loc.feature === 'living_hall') {
      this.sceneHallway(g, width, floorY, 'warm');
      return;
    }
    if (loc.feature === 'spirit_hall') {
      this.sceneHallway(g, width, floorY, 'cool');
      return;
    }
    this.sceneShell(g, width, floorY);
    const cx = width / 2;
    const s = Phaser.Math.Clamp(floorY / 360, 0.8, 1.7);
    const fns = {
      court: this.featureCourt,
      war: this.featureWar,
      veil: this.featureVeil,
      infirmary: this.featureInfirmary,
      yard: this.featureYard,
      quarters: this.featureQuarters,
      deck: this.featureDeck,
    };
    fns[loc.feature]?.call(this, g, cx, floorY, s);
    // A warm hanging light over the room.
    this.addGlow(cx, floorY * 0.2, width * 0.5, 0xffd9a0, 0.4);
    this.addGlow(cx, floorY + 6, width * 0.5, 0xffcaa0, 0.12);
  }

  addGlow(x, y, size, tint, alpha) {
    const img = this.add
      .image(x, y, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint)
      .setAlpha(alpha)
      .setDisplaySize(size, size)
      .setDepth(-80);
    this.dynamic.push(img);
  }

  addStoneNoise(x, y, w, h, tint = 0xc4956a, alpha = 0.09) {
    if (!this.textures.exists('noise')) return;
    const img = this.add
      .image(x, y, 'noise')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint)
      .setAlpha(alpha)
      .setDisplaySize(w, h)
      .setDepth(-89);
    this.dynamic.push(img);
  }

  /** A generic painted room: floor, flanking columns, a central arch, banners. */
  sceneShell(g, width, floorY) {
    // Floor — warm copper/terracotta.
    g.fillStyle(0x2a1408, 1);
    g.fillRect(0, floorY, width, this.scale.height - floorY);
    g.fillStyle(0x4a2810, 1);
    g.fillRect(0, floorY, width, 4);
    g.fillStyle(0x7a3818, 0.8); // runner
    g.fillRect(width * 0.18, floorY + 10, width * 0.64, 14);
    g.fillStyle(GOLD, 0.6);
    g.fillRect(width * 0.18, floorY + 10, width * 0.64, 2);

    // Central arch alcove — sandstone surround, dark interior.
    const aw = width * 0.5;
    const ar = aw / 2;
    const at = floorY * 0.16;
    // Shadow base surround.
    g.fillStyle(0x7a4e28, 1);
    g.fillRoundedRect(width / 2 - ar - 6, at - 4, aw + 12, floorY - at + 5, {
      tl: ar + 4, tr: ar + 4, bl: 0, br: 0,
    });
    // Sandstone face.
    g.fillStyle(0xb07d4a, 1);
    g.fillRoundedRect(width / 2 - ar, at, aw, floorY - at, {
      tl: ar, tr: ar, bl: 0, br: 0,
    });
    // Ochre highlight on the lit side.
    g.fillStyle(0xc4956a, 0.4);
    g.fillRoundedRect(width / 2 - ar, at, aw * 0.42, floorY - at, {
      tl: ar, tr: 0, bl: 0, br: 0,
    });
    // Stone joints below the semicircle.
    g.fillStyle(0x6a3e1a, 0.5);
    for (let jy = at + ar + 8; jy < floorY; jy += 16) {
      g.fillRect(width / 2 - ar + 4, jy, aw - 8, 1.5);
    }
    // Dark interior.
    g.fillStyle(0x130c08, 1);
    g.fillRoundedRect(width / 2 - ar + 9, at + 9, aw - 18, floorY - at - 9, {
      tl: ar - 9, tr: ar - 9, bl: 0, br: 0,
    });
    // Stone noise on arch surround.
    this.addStoneNoise(width / 2, at + (floorY - at) * 0.5, aw + 14, floorY - at + 6);

    // Flanking columns.
    [width * 0.16, width * 0.84].forEach((x) => this.column(g, x, at - 6, floorY));

    // Frieze.
    g.fillStyle(GOLD, 0.7);
    g.fillRect(0, at - 8, width, 3);
  }

  // --- Connecting corridors (Living Wing / Inner Passage) --------------------

  /**
   * One-point-perspective corridor with a side arch on each wall.
   * palette = 'warm' (Residential Wing — amber sandstone) |
   *           'cool' (Inner Passage — dark slate/violet).
   */
  sceneHallway(g, width, floorY, palette) {
    const warm = palette === 'warm';
    const P = warm ? {
      ceiling:    0x1a0c04,
      sideLight:  0x7a4820,
      sideDark:   0x562e14,
      backWall:   0x3e2410,
      floor:      0x221008,
      floorStripe:0x3a1c0c,
      archFace:   0x9c6a28,
      archInner:  0x0c0602,
      archGlow:   0xffb840,
      torchGlow:  0xffaa44,
      joint:      0x1a0c06,
      accent:     0xc9a24a,
      rimLight:   0xffcc80,
    } : {
      ceiling:    0x0c0a18,
      sideLight:  0x26223c,
      sideDark:   0x1a1830,
      backWall:   0x141224,
      floor:      0x0e0c18,
      floorStripe:0x1a1828,
      archFace:   0x3a346a,
      archInner:  0x04030a,
      archGlow:   0x9080cc,
      torchGlow:  0x9988cc,
      joint:      0x0c0a16,
      accent:     0xb98cff,
      rimLight:   0xc0b0ff,
    };

    const sceneBot = floorY;
    const cx = width / 2;
    // Narrow corridor — bwW drives how tight the perspective feels.
    const bwW   = width * 0.22;
    const bwL   = (width - bwW) / 2;
    const bwR   = (width + bwW) / 2;
    const bwTop = Math.round(floorY * 0.18);
    const bwBot = Math.round(floorY * 0.86);

    // Side-wall perspective mapper — same convention as sceneHall/sceneCourt.
    const wallMap = (sign, d, v) => {
      const fx = sign < 0 ? 0 : width;
      const bx = sign < 0 ? bwL : bwR;
      const x  = fx + (bx - fx) * d;
      const ty = bwTop * d;
      const by = sceneBot + (bwBot - sceneBot) * d;
      return { x, y: ty + (by - ty) * v };
    };

    // ── Ceiling ───────────────────────────────────────────────────────────────
    g.fillStyle(P.ceiling, 1);
    g.fillPoints([
      { x: 0, y: 0 }, { x: width, y: 0 },
      { x: bwR, y: bwTop }, { x: bwL, y: bwTop },
    ], true);
    // Coffer ribs converging to vanishing point.
    g.fillStyle(0x000000, 0.3);
    for (let k = 1; k <= 4; k++) {
      const fx = k * width / 5;
      const bx = bwL + (bwR - bwL) * (k / 5);
      g.fillPoints([
        { x: fx - 2, y: 0 }, { x: fx + 2, y: 0 },
        { x: bx + 1, y: bwTop }, { x: bx - 1, y: bwTop },
      ], true);
    }

    // ── Side walls ────────────────────────────────────────────────────────────
    g.fillStyle(P.sideLight, 1);
    g.fillPoints([
      { x: 0, y: 0 }, { x: 0, y: sceneBot },
      { x: bwL, y: bwBot }, { x: bwL, y: bwTop },
    ], true);
    g.fillStyle(P.sideDark, 1);
    g.fillPoints([
      { x: width, y: 0 }, { x: width, y: sceneBot },
      { x: bwR, y: bwBot }, { x: bwR, y: bwTop },
    ], true);

    // Stone-course banding on each wall.
    g.lineStyle(1, P.joint, 0.22);
    [-1, 1].forEach((sign) => {
      [0.16, 0.34, 0.52, 0.70, 0.86].forEach((v) => {
        const a = wallMap(sign, 0.03, v);
        const b = wallMap(sign, 0.97, v);
        g.lineBetween(a.x, a.y, b.x, b.y);
      });
    });

    // ── Back wall ─────────────────────────────────────────────────────────────
    g.fillStyle(P.backWall, 1);
    g.fillRect(bwL, bwTop, bwW, bwBot - bwTop);
    // Small window slit on back wall.
    const slitW = bwW * 0.14;
    const slitH = (bwBot - bwTop) * 0.28;
    const slitX = cx - slitW / 2;
    const slitY = bwTop + (bwBot - bwTop) * 0.18;
    g.fillStyle(0x000000, 1);
    g.fillRoundedRect(slitX, slitY, slitW, slitH, { tl: slitW / 2, tr: slitW / 2, bl: 0, br: 0 });
    g.lineStyle(1.5, P.accent, 0.3);
    g.strokeRoundedRect(slitX, slitY, slitW, slitH, { tl: slitW / 2, tr: slitW / 2, bl: 0, br: 0 });

    // ── Floor ─────────────────────────────────────────────────────────────────
    // Foreground fill — covers the strip from the near floor edge to canvas bottom.
    g.fillStyle(P.floor, 1);
    g.fillRect(0, sceneBot, width, this.scale.height - sceneBot);
    // Perspective trapezoid — the floor receding toward the back wall.
    g.fillPoints([
      { x: 0, y: sceneBot }, { x: width, y: sceneBot },
      { x: bwR, y: bwBot  }, { x: bwL, y: bwBot  },
    ], true);
    // Flagstone tile lines in perspective.
    g.lineStyle(1, P.floorStripe, 0.5);
    const fHW = (t) => width / 2 + (bwW / 2 - width / 2) * t;
    const fY  = (t) => sceneBot + (bwBot - sceneBot) * t;
    [0.25, 0.5, 0.75].forEach((t) => {
      g.lineBetween(cx - fHW(t), fY(t), cx + fHW(t), fY(t));
    });
    // Floor edge.
    g.fillStyle(P.floorStripe, 1);
    g.fillRect(0, sceneBot, width, 3);

    // ── Arch openings in side walls ───────────────────────────────────────────
    // vTop=0.18 ensures the arch top sits low enough below the ceiling that the
    // gothic peak (≈archW*0.60 above TN) stays within the canvas.  dA/dB were
    // widened toward the wall midpoint so the arch width in screen-space is
    // proportional to its height.  Both peak Y values are clamped to the wall
    // ceiling at their respective depths to guarantee no overflow.
    const dA  = 0.38;  // near depth of arch
    const dB  = 0.60;  // far depth of arch
    const sD  = 0.06;  // stone-frame margin (depth units each side) — thicker for visibility
    const vTop = 0.18; // arch top v-fraction

    [-1, 1].forEach((sign) => {
      // Arch void corners.
      const TN    = wallMap(sign, dA, vTop);
      const TF    = wallMap(sign, dB, vTop);
      const BN    = wallMap(sign, dA, 1.0);
      const BF    = wallMap(sign, dB, 1.0);
      const BNext = { x: BN.x, y: sceneBot };
      const BFext = { x: BF.x, y: Math.min(BF.y + 4, sceneBot) };

      // Outer stone-frame corners — wallMap-derived so they follow wall geometry.
      const OTN = wallMap(sign, dA - sD, Math.max(0.02, vTop - 0.10));
      const OTF = wallMap(sign, dB + sD, Math.max(0.02, vTop - 0.10));
      const OBN = { x: wallMap(sign, dA - sD, 1.0).x, y: sceneBot };
      const OBF = { x: wallMap(sign, dB + sD, 1.0).x, y: sceneBot };

      const archW      = Math.abs(TF.x - TN.x);
      const outerW     = Math.abs(OTF.x - OTN.x);
      const peakX      = (TN.x  + TF.x)  / 2;
      const outerPeakX = (OTN.x + OTF.x) / 2;
      // Clamp both peaks to the wall ceiling at their respective depth — this is
      // the root fix that prevents triangle overflow above the canvas.
      const peakY      = Math.max(bwTop * dA       + 4, TN.y  - archW  * 0.60);
      const outerPeakY = Math.max(bwTop * (dA - sD) + 4, OTN.y - outerW * 0.60);

      // 1. Stone surround — outer frame quad + clamped gothic cap triangle.
      g.fillStyle(P.archFace, 1);
      g.fillPoints([OTN, OTF, OBF, OBN], true);
      g.fillTriangle(OTN.x, OTN.y, OTF.x, OTF.y, outerPeakX, outerPeakY);

      // 2. Dark void — perspective trapezoid to floor.
      g.fillStyle(P.archInner, 1);
      g.fillPoints([TN, TF, BFext, BNext], true);

      // 3. Pointed gothic cap — dark triangle above the void opening.
      g.fillTriangle(TN.x, TN.y, TF.x, TF.y, peakX, peakY);

      // 4. Glow spilling from the opening.
      this.addGlow(peakX, (TN.y + BN.y) / 2, archW * 2.2, P.archGlow, warm ? 0.13 : 0.09);

      // 5. Gold trim — outer frame silhouette up to clamped peak and back down.
      g.lineStyle(2, P.accent, 0.65);
      g.beginPath();
      g.moveTo(OBN.x, OBN.y);
      g.lineTo(OTN.x, OTN.y);
      g.lineTo(outerPeakX, outerPeakY);
      g.lineTo(OTF.x, OTF.y);
      g.lineTo(OBF.x, OBF.y);
      g.strokePath();
      // Inner arch edge.
      g.lineStyle(1, P.accent, 0.38);
      g.beginPath();
      g.moveTo(BNext.x, BNext.y);
      g.lineTo(TN.x, TN.y);
      g.lineTo(peakX, peakY);
      g.lineTo(TF.x, TF.y);
      g.lineTo(BFext.x, BFext.y);
      g.strokePath();

      // Wall torch between the screen edge and the arch.
      const torchD = dA * 0.48;
      const tp = wallMap(sign, torchD, 0.30);
      const ts = 1 - torchD * 0.5;
      const tl = wallMap(sign, torchD - 0.06, 0.78);
      const tr = wallMap(sign, torchD + 0.06, 0.78);
      g.fillStyle(P.torchGlow, 0.08);
      g.fillTriangle(tp.x, tp.y + 5 * ts, tl.x, tl.y, tr.x, tr.y);
      g.fillStyle(0x241e18, 1);
      g.fillRect(tp.x - 1.5 * ts, tp.y - 2 * ts, 3 * ts, 13 * ts);
      g.fillStyle(0x3a3028, 1);
      g.fillEllipse(tp.x, tp.y - 2 * ts, 11 * ts, 5 * ts);
      const fy2 = tp.y - 6 * ts;
      g.fillStyle(0xe2541a, 0.95); g.fillEllipse(tp.x, fy2 - 8 * ts, 10 * ts, 22 * ts);
      g.fillStyle(0xff9a2a, 1);    g.fillEllipse(tp.x, fy2 - 9 * ts, 7 * ts, 15 * ts);
      g.fillStyle(0xffd24a, 1);    g.fillEllipse(tp.x, fy2 - 9 * ts, 4 * ts, 10 * ts);
      g.fillStyle(0xfff0c0, 1);    g.fillEllipse(tp.x, fy2 - 7 * ts, 2 * ts, 5 * ts);
      this.addGlow(tp.x, fy2 - 7 * ts, 80 * ts, P.torchGlow, 0.5);
    });

    // Near-corner shadow vignette.
    g.fillStyle(0x000000, 0.5);
    g.fillTriangle(0, 0, 0, sceneBot, width * 0.07, sceneBot * 0.35);
    g.fillTriangle(width, 0, width, sceneBot, width * 0.93, sceneBot * 0.35);

    // Hanging ambient glow from above.
    this.addGlow(cx, floorY * 0.18, width * 0.35, P.torchGlow, warm ? 0.25 : 0.15);
  }

  // --- Communications Room (bespoke) ----------------------------------------

  /** Comms chamber: sandstone walls, a power-crystal + Calder banner at left,
   *  and a great circular star-map screen with a control console at right.
   *  Procedural shape reference for the painted art to come. */
  sceneComms(g, width, height) {
    const floorY = Math.round(height * 0.67);
    const cx = width / 2;

    // Back wall — warm sandstone, washed warmer toward the crystal (left).
    g.fillStyle(0x4a3826, 1);
    g.fillRect(0, 0, width, floorY);
    g.fillStyle(0x6a4e2c, 0.5);
    g.fillRect(0, 0, Math.round(width * 0.44), floorY);
    // Ceiling beam band + beams.
    g.fillStyle(0x2a1e12, 1);
    g.fillRect(0, 0, width, Math.round(floorY * 0.11));
    g.fillStyle(0x36281a, 1);
    [0.2, 0.5, 0.8].forEach((f) =>
      g.fillRect(Math.round(width * f) - 12, 0, 24, Math.round(floorY * 0.11)));
    // Faint stone-course banding.
    g.lineStyle(1, 0x2a1e12, 0.25);
    for (let i = 1; i < 6; i++) {
      const y = Math.round((floorY * i) / 6);
      g.lineBetween(0, y, width, y);
    }

    // Floor — stone tiles with light perspective, to the bottom of the canvas.
    g.fillStyle(0x33271a, 1);
    g.fillRect(0, floorY, width, height - floorY);
    g.fillStyle(0x4a3826, 1);
    g.fillRect(0, floorY, width, 3);
    g.lineStyle(1, 0x8a6a3a, 0.12);
    for (let r = 1; r <= 4; r++) {
      const y = floorY + (height - floorY) * (r / 5);
      g.lineBetween(0, y, width, y);
    }
    for (let k = -5; k <= 5; k++) {
      g.lineBetween(cx + k * width * 0.10, floorY, cx + k * width * 0.20, height);
    }

    // LEFT — pilasters framing the banner, with the power-crystal.
    this.commsPilaster(g, width * 0.05, floorY);
    this.commsPilaster(g, width * 0.28, floorY);
    this.banner(g, Math.round(width * 0.165), Math.round(height * 0.10), Math.round(height * 0.34), 1.05);
    this.commsCrystal(g, width * 0.05, height * 0.36, height * 0.36);

    // RIGHT — the great circular star-map screen, with a control console below.
    const sx = Math.round(width * 0.70);
    const sy = Math.round(height * 0.31);
    const R = Math.round(height * 0.245);
    this.commsScreen(g, sx, sy, R);
    this.commsConsole(g, sx, sy + R, floorY, R);
  }

  commsPilaster(g, x, floorY) {
    const w = Math.round(floorY * 0.11);
    g.fillStyle(0x5a4632, 1);
    g.fillRect(x - w / 2, 0, w, floorY);
    g.fillStyle(0x6e573a, 1);                              // lit edge
    g.fillRect(x - w / 2, 0, Math.round(w * 0.28), floorY);
    g.fillStyle(0x2a1e12, 1);                              // shadow edge
    g.fillRect(x + w / 2 - Math.round(w * 0.2), 0, Math.round(w * 0.2), floorY);
    g.fillStyle(0x4a3826, 1);                              // base + capital
    g.fillRect(x - w * 0.7, floorY - w * 0.55, w * 1.4, w * 0.55);
    g.fillRect(x - w * 0.7, 0, w * 1.4, w * 0.4);
    g.fillStyle(0x6e573a, 0.6);
    g.fillRect(x - w * 0.7, 0, w * 1.4, 2);
  }

  commsCrystal(g, x, cy, h) {
    const w = h * 0.26;
    this.addGlow(x, cy, w * 7, 0xffaa33, 0.6);
    g.fillStyle(0x2a1e12, 1);                              // brackets
    g.fillRect(x - w * 0.6, cy - h / 2 - 4, w * 1.2, 5);
    g.fillRect(x - w * 0.6, cy + h / 2 - 1, w * 1.2, 5);
    const hex = (ww, hh) => [
      { x, y: cy - hh / 2 }, { x: x + ww / 2, y: cy - hh * 0.26 },
      { x: x + ww / 2, y: cy + hh * 0.26 }, { x, y: cy + hh / 2 },
      { x: x - ww / 2, y: cy + hh * 0.26 }, { x: x - ww / 2, y: cy - hh * 0.26 },
    ];
    g.fillStyle(0xc8821a, 1); g.fillPoints(hex(w, h), true);
    g.fillStyle(0xffc24a, 1); g.fillPoints(hex(w * 0.62, h * 0.86), true);
    g.fillStyle(0xfff0c0, 0.95); g.fillPoints(hex(w * 0.22, h * 0.7), true);
  }

  commsScreen(g, x, y, R) {
    const fr = Math.round(R * 0.14);
    g.fillStyle(0x3a2c1c, 1); g.fillCircle(x, y, R + fr + 3);   // frame ring
    g.fillStyle(0x5a4632, 1); g.fillCircle(x, y, R + fr);
    g.fillStyle(0x6e573a, 0.5); g.fillCircle(x - fr * 0.4, y - fr * 0.4, R + fr * 0.5);
    const bf = Math.round(R * 0.16);                            // cardinal bolts
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => {
      const bx = x + dx * (R + fr * 0.5), by = y + dy * (R + fr * 0.5);
      g.fillStyle(0x2a1e12, 1); g.fillRect(bx - bf / 2, by - bf / 2, bf, bf);
      g.fillStyle(0xc8a24a, 0.9); g.fillCircle(bx, by, bf * 0.22);
    });
    g.fillStyle(0x0e1230, 1); g.fillCircle(x, y, R);            // screen
    g.fillStyle(0x1c2450, 0.55); g.fillCircle(x, y, R * 0.66);
    if (!this.commsStars) {
      this.commsStars = Array.from({ length: 90 }, () => ({
        a: Math.random() * Math.PI * 2,
        r: Math.sqrt(Math.random()) * 0.9,
        sz: Math.random() * 1.3 + 0.4,
        b: Math.random() * 0.6 + 0.3,
      }));
    }
    this.commsStars.forEach((s) => {
      g.fillStyle(0xdfe6ff, s.b);
      g.fillCircle(x + Math.cos(s.a) * s.r * R, y + Math.sin(s.a) * s.r * R, s.sz);
    });
    g.lineStyle(1.5, 0xc8922a, 0.4);                           // radar rings + crosshair
    [0.28, 0.52, 0.76, 0.97].forEach((f) => g.strokeCircle(x, y, R * f));
    g.lineBetween(x - R * 0.97, y, x + R * 0.97, y);
    g.lineBetween(x, y - R * 0.97, x, y + R * 0.97);
    this.addGlow(x, y, R * 2.4, 0x3a5fae, 0.16);            // screen ambiance
    // The planet (Arradius) + radar sweep are live objects, built in renderLocation.
    this.commsScreenInfo = { x, y, R };
  }

  /** Build the live comms planet + radar sweep.
   *  - overlay (PNG backdrop): a TRANSPARENT cloud layer drifts over the painted
   *    planet (which supplies texture + shading); no opaque sphere.
   *  - procedural: an opaque rotating desert sphere with its own lighting.
   *  The sweep emanates from the planet's edge, so it reads as passing behind it. */
  createCommsAnim() {
    const info = this.commsScreenInfo;
    if (!info) return;
    const { x, y, R, overlay } = info;
    const pr = Math.round(R * (info.prRatio || 0.26));
    const base = overlay ? -58 : -88;

    const mask = this.add.graphics().setVisible(false);
    mask.fillStyle(0xffffff, 1).fillCircle(x, y, pr);

    let planet;
    let ov = null;
    if (overlay) {
      if (!this.textures.exists('planetClouds')) return;
      // Drifting clouds only — the painted planet shows through underneath.
      planet = this.add
        .tileSprite(x, y, pr * 2, pr * 2, 'planetClouds')
        .setAlpha(0.7)
        .setDepth(base + 2);
      planet.setMask(mask.createGeometryMask());
    } else {
      if (!this.textures.exists('planetSurface')) return;
      planet = this.add.tileSprite(x, y, pr * 2, pr * 2, 'planetSurface').setDepth(base + 2);
      planet.tilePositionY = 14;
      planet.setMask(mask.createGeometryMask());
      ov = this.add.graphics().setDepth(base + 3);
      ov.fillStyle(0xd9ab68, 0.36); ov.fillCircle(x - pr * 0.28, y - pr * 0.26, pr * 0.5);  // lit side
      ov.fillStyle(0x241606, 0.34); ov.fillCircle(x + pr * 0.36, y + pr * 0.30, pr * 0.62); // terminator
      ov.fillStyle(0xe8d8b0, 0.32); ov.fillEllipse(x, y - pr * 0.8, pr * 0.62, pr * 0.2);   // N polar cap
      ov.fillStyle(0xe8d8b0, 0.2); ov.fillEllipse(x, y + pr * 0.82, pr * 0.5, pr * 0.16);   // S polar cap
      ov.lineStyle(2, 0xe6bc7e, 0.5); ov.strokeCircle(x, y, pr * 0.95);                     // lit limb
      ov.lineStyle(2.5, 0x2e1d0c, 0.55); ov.strokeCircle(x, y, pr - 1);                     // dark rim
    }

    // Subtle atmosphere halo (gentle over the painted planet).
    const glow = this.add.image(x, y, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb24a)
      .setAlpha(overlay ? 0.12 : 0.22)
      .setDisplaySize(pr * 3.0, pr * 3.0).setDepth(base + 4);

    const sweep = this.add.graphics().setDepth(base + 5);

    // Hover label — "Study the map  →"
    const mapLabel = this.add
      .text(x, y + R + 14, 'Study the map  →', {
        fontFamily: 'Georgia, serif', fontSize: '14px', color: '#aee4ff',
      })
      .setOrigin(0.5, 0).setDepth(base + 6).setAlpha(0);

    // Transparent circular hit zone over the whole disc.
    const mapZone = this.add
      .circle(x, y, R, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(base + 7);

    mapZone.on('pointerover', () => {
      glow.setAlpha((overlay ? 0.12 : 0.22) + 0.14);
      this.tweens.add({ targets: mapLabel, alpha: 1, duration: 200 });
    });
    mapZone.on('pointerout', () => {
      glow.setAlpha(overlay ? 0.12 : 0.22);
      this.tweens.add({ targets: mapLabel, alpha: 0, duration: 200 });
    });
    mapZone.on('pointerdown', (p, lx, ly, e) => {
      e?.stopPropagation();
      this.goTo('WorldMapScene');
    });

    this.dynamic.push(mapLabel, mapZone);
    this.commsAnim = { planet, mask, ov, glow, sweep, x, y, R, pr, overlay, angle: -Math.PI / 2 };
  }

  destroyCommsAnim() {
    const a = this.commsAnim;
    if (!a) return;
    [a.planet, a.mask, a.ov, a.glow, a.sweep].forEach((o) => o && o.destroy());
    this.commsAnim = null;
  }

  update(time, delta) {
    const a = this.commsAnim;
    if (!a) return;
    a.planet.tilePositionX += delta * (a.overlay ? 0.005 : 0.01); // clouds drift / surface rotates
    a.angle = (a.angle + delta * 0.0009) % (Math.PI * 2);
    const inner = a.pr * 1.06;            // start at the planet's edge → "behind" it
    const outer = a.R * 1.12;
    const c = Math.cos(a.angle), s = Math.sin(a.angle);
    const g = a.sweep;
    g.clear();
    // Faint trailing wedge (annular sector from the planet edge to the dish edge).
    g.fillStyle(0x7ad0ff, 0.07);
    g.beginPath();
    g.arc(a.x, a.y, outer, a.angle - 0.5, a.angle, false);
    g.arc(a.x, a.y, inner, a.angle, a.angle - 0.5, true);
    g.closePath();
    g.fillPath();
    // Leading line from the planet edge outward.
    g.lineStyle(2.3, 0xaee4ff, 0.7);
    g.lineBetween(a.x + c * inner, a.y + s * inner, a.x + c * outer, a.y + s * outer);
  }

  /** Control console beneath the star-map. topY = the screen's bottom edge. */
  commsConsole(g, x, topY, floorY, R) {
    const deskTop = topY + Math.round(R * 0.10);
    const ch = floorY - deskTop;
    const topHW = R * 0.5;   // back (upper) half-width
    const botHW = R * 0.9;   // front (lower) half-width
    // Floor shadow.
    g.fillStyle(0x120c06, 0.4);
    g.fillEllipse(x, floorY + 3, botHW * 2.3, Math.max(6, ch * 0.32));
    // Support neck up to the screen frame.
    g.fillStyle(0x2e2114, 1);
    g.fillRect(x - R * 0.1, topY, R * 0.2, deskTop - topY + 2);
    // Angled desk body (narrow at back, wide at front).
    g.fillStyle(0x3a2c1c, 1);
    g.fillPoints([
      { x: x - topHW, y: deskTop }, { x: x + topHW, y: deskTop },
      { x: x + botHW, y: floorY }, { x: x - botHW, y: floorY },
    ], true);
    g.fillStyle(0x5a4632, 1); g.fillRect(x - topHW, deskTop, topHW * 2, 3); // lit lip
    g.fillStyle(0x241a10, 1);                                              // front shadow band
    g.fillPoints([
      { x: x - botHW, y: floorY - ch * 0.16 }, { x: x + botHW, y: floorY - ch * 0.16 },
      { x: x + botHW, y: floorY }, { x: x - botHW, y: floorY },
    ], true);
    // Recessed control board with three amber readout clusters.
    const bw = topHW * 1.7;
    const by0 = deskTop + Math.round(ch * 0.2);
    const bh = Math.round(ch * 0.52);
    g.fillStyle(0x0e0a06, 1); g.fillRect(x - bw / 2, by0, bw, bh);
    g.fillStyle(0x2a1e12, 1); g.fillRect(x - bw / 2, by0 - 2, bw, 2);
    for (let c = 0; c < 3; c += 1) {
      const cxp = x - bw / 2 + (bw * (c + 0.5)) / 3;
      const cw = bw / 3 - 6;
      g.fillStyle(0xc8922a, 0.85);
      [0, 1, 2].forEach((r) =>
        g.fillRect(cxp - cw / 2, by0 + 6 + (r * (bh - 12)) / 3, cw * (0.55 + 0.45 * ((c + r) % 2)), 1.6));
      g.fillStyle(c === 1 ? 0x6ad0ff : 0xffd24a, 0.9);
      g.fillCircle(cxp + cw / 2 - 1, by0 + 5, 1.8);
    }
    this.addGlow(x, by0 + bh * 0.4, R * 1.3, 0xc8922a, 0.13);
  }

  column(g, x, top, floorY, depth = 0, scale = 1, litDir = 1) {
    const botHW  = Math.round(46 * scale);
    const topHW  = Math.round(botHW * 0.84);
    const plinthH = Math.round(22 * scale);
    const capH   = Math.round(26 * scale);
    const capHW  = Math.round(botHW * 1.32);
    const colBot = floorY - plinthH;
    const dim    = 1 - depth * 0.30;               // distance haze

    // RGB lerp helper.
    const lerpC = (c1, c2, t) => {
      const r = ((c1 >> 16) & 255) + (((c2 >> 16) & 255) - ((c1 >> 16) & 255)) * t;
      const gg = ((c1 >> 8) & 255) + (((c2 >> 8) & 255) - ((c1 >> 8) & 255)) * t;
      const b = (c1 & 255) + ((c2 & 255) - (c1 & 255)) * t;
      return (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(b);
    };
    const SHADOW = 0x140a04;
    const MID    = 0x6e3414;
    const LIGHT  = 0xd0883c;

    // Barrel shading — vertical bands across the tapered shaft. Bright toward the
    // lit side (the central doorway), falling to near-black at the far edge.
    const pPeak = litDir > 0 ? 0.74 : 0.26;        // brightest band position [0..1]
    const nb = 14;
    for (let i = 0; i < nb; i++) {
      const p0 = i / nb, p1 = (i + 1) / nb, pm = (p0 + p1) / 2;
      // Brightness: peak at pPeak, fall off to each edge (rounded cylinder).
      let f = 1 - Math.abs(pm - pPeak) / 0.78;
      f = Math.max(0, Math.min(1, f));
      f = f * f;                                   // tighten the highlight
      const col = f < 0.5
        ? lerpC(SHADOW, MID, f * 2)
        : lerpC(MID, LIGHT, (f - 0.5) * 2);
      g.fillStyle(col, dim);
      g.fillPoints([
        { x: x + topHW * (2 * p0 - 1), y: top },
        { x: x + topHW * (2 * p1 - 1), y: top },
        { x: x + botHW * (2 * p1 - 1), y: colBot },
        { x: x + botHW * (2 * p0 - 1), y: colBot },
      ], true);
    }
    // Subtle fluting grooves.
    g.fillStyle(0x100804, 0.22 * dim);
    [0.30, 0.5, 0.70].forEach((p) => {
      g.fillRect(Math.round(x + botHW * (2 * p - 1)) - 1, top + 2, 2, colBot - top - 4);
    });

    // Capital — abacus slab + tapered echinus bell, shaded lit-side-up.
    const abacusH = Math.round(capH * 0.42);
    const echinHW = Math.round(capHW * 0.78);
    g.fillStyle(lerpC(MID, LIGHT, 0.35), dim);
    g.fillRect(x - capHW, top - capH, capHW * 2, abacusH);
    g.fillStyle(lerpC(SHADOW, LIGHT, 0.7), dim);
    g.fillRect(x - capHW, top - capH, capHW * 2, Math.max(2, Math.round(3 * scale)));
    g.fillStyle(lerpC(SHADOW, MID, 0.8), dim);
    g.fillPoints([
      { x: x - echinHW, y: top - capH + abacusH },
      { x: x + echinHW, y: top - capH + abacusH },
      { x: x + topHW,   y: top },
      { x: x - topHW,   y: top },
    ], true);

    // Plinth — wide base block.
    const plinthHW = Math.round(capHW * 0.92);
    g.fillStyle(lerpC(SHADOW, MID, 0.55), dim);
    g.fillRect(x - plinthHW, colBot, plinthHW * 2, plinthH);
    g.fillStyle(lerpC(MID, LIGHT, 0.4), dim);
    g.fillRect(x - plinthHW, colBot, plinthHW * 2, Math.max(1, Math.round(2 * scale)));
    g.fillStyle(0x0a0502, 0.5 * dim);
    g.fillRect(x - plinthHW, colBot + plinthH - Math.max(2, Math.round(3 * scale)), plinthHW * 2, Math.max(2, Math.round(3 * scale)));

    // Ground contact shadow.
    g.fillStyle(0x0a0602, 0.32 * dim);
    g.fillEllipse(x, floorY + 2, botHW * 2.6, Math.max(4, Math.round(botHW * 0.36)));
  }

  sceneHall(g, width, floorY) {
    const cx = width / 2;
    const height = this.scale.height;
    g._cx = cx;

    // ── Single vanishing point — cathedral nave geometry ───────────────────────
    // Everything derived from one point: near columns tower, arch is small+distant.
    // ── One-point perspective BOX (not a tunnel to a single point) ────────────
    // A small back-wall rectangle sits at the far end. Floor, ceiling and side
    // walls are TRAPEZOIDS connecting the full-size front frame to that back
    // wall — they stop AT the wall, they don't collapse to a point. The door
    // sits flat on the back wall. Mental model: a cathedral nave from the door.
    const sceneBot = Math.round(height * 0.72);  // bottom of painted area (nearest)

    // Back wall (far end of the hall).
    const bwW   = Math.round(width * 0.20);
    const bwL   = cx - bwW / 2;
    const bwR   = cx + bwW / 2;
    const bwBot = Math.round(floorY * 0.66);     // far floor meets back wall here
    const bwTop = Math.round(floorY * 0.10);     // top of the back wall

    // Map a point onto a side wall — shared by panels, banding, sconces, doors.
    // sign<0 = left wall, >0 = right. d: depth 0(near)→1(back wall). v: 0 top→1 floor.
    const wallMap = (sign, d, v) => {
      const fx = sign < 0 ? 0 : width;
      const bx = sign < 0 ? bwL : bwR;
      const x = fx + (bx - fx) * d;
      const ty = bwTop * d;                          // ceiling line at depth d
      const by = sceneBot + (bwBot - sceneBot) * d;  // floor line at depth d
      return { x, y: ty + (by - ty) * v };
    };

    // CEILING trapezoid — full-width top edge → back-wall top edge.
    g.fillStyle(0x2e1608, 1);
    g.fillPoints([
      { x: 0, y: 0 }, { x: width, y: 0 },
      { x: bwR, y: bwTop }, { x: bwL, y: bwTop },
    ], true);
    // Coffer ribs converging toward the back wall.
    g.fillStyle(0x140a04, 0.6);
    for (let k = 1; k <= 5; k++) {
      const fx = k * width / 6;
      const bx = bwL + (bwR - bwL) * (k / 6);
      g.fillPoints([
        { x: fx - 2, y: 0 }, { x: fx + 2, y: 0 },
        { x: bx + 1, y: bwTop }, { x: bx - 1, y: bwTop },
      ], true);
    }

    // SIDE WALLS — front side edges → back-wall side edges.
    g.fillStyle(0x6e3416, 1);
    g.fillPoints([
      { x: 0, y: 0 }, { x: 0, y: sceneBot },
      { x: bwL, y: bwBot }, { x: bwL, y: bwTop },
    ], true);
    g.fillStyle(0x5a2a12, 1);
    g.fillPoints([
      { x: width, y: 0 }, { x: width, y: sceneBot },
      { x: bwR, y: bwBot }, { x: bwR, y: bwTop },
    ], true);
    // Near-corner shadow vignette.
    g.fillStyle(0x0e0804, 0.4);
    g.fillTriangle(0, 0, 0, sceneBot, Math.round(width * 0.05), Math.round(sceneBot * 0.5));
    g.fillTriangle(width, 0, width, sceneBot, Math.round(width * 0.95), Math.round(sceneBot * 0.5));

    // ── Wall detailing: stone banding, recessed panels, sconces ──────────────
    // Drawn on the wall face before the columns, so columns stand in front.
    [-1, 1].forEach((sign) => {
      // Faint horizontal stone-course lines, full wall, in perspective.
      g.lineStyle(1, 0x0e0804, 0.2);
      [0.16, 0.34, 0.52, 0.70, 0.86].forEach((v) => {
        const a = wallMap(sign, 0.02, v);
        const b = wallMap(sign, 0.98, v);
        g.lineBetween(a.x, a.y, b.x, b.y);
      });

      // Shallow recessed panel in the front bay (the deeper bay holds the door).
      [[0.16, 0.40]].forEach(([d0, d1]) => {
        const quad = [
          wallMap(sign, d0, 0.22), wallMap(sign, d1, 0.22),
          wallMap(sign, d1, 0.74), wallMap(sign, d0, 0.74),
        ];
        g.fillStyle(0x1a1008, 0.4);                 // recessed depth
        g.fillPoints(quad, true);
        g.lineStyle(1.5, GOLD, 0.3);                // outer border
        g.strokePoints(quad, true, true);
        g.lineStyle(1, 0xc8822a, 0.2);              // top + near-edge rim highlight
        g.lineBetween(quad[0].x, quad[0].y, quad[1].x, quad[1].y);
        g.lineBetween(quad[0].x, quad[0].y, quad[3].x, quad[3].y);
      });

      // Wall torches — iron bracket, layered flame, warm glow + cast light.
      [0.10, 0.42].forEach((d) => {
        const p = wallMap(sign, d, 0.34);
        const s = 1 - d * 0.55;                     // shrink with depth
        // Warm light washing down the wall below the torch.
        const cl = wallMap(sign, d - 0.05, 0.74), cr = wallMap(sign, d + 0.05, 0.74);
        g.fillStyle(0xffcc66, 0.07);
        g.fillTriangle(p.x, p.y + 4 * s, cl.x, cl.y, cr.x, cr.y);
        // Iron bracket + cup.
        g.fillStyle(0x241e18, 1);
        g.fillRect(p.x - 1.5 * s, p.y - 2 * s, 3 * s, 14 * s);
        g.fillStyle(0x3a3028, 1);
        g.fillEllipse(p.x, p.y - 2 * s, 11 * s, 5 * s);
        // Flame, outer → core.
        const fy = p.y - 5 * s;
        g.fillStyle(0xe2541a, 0.95); g.fillEllipse(p.x, fy - 9 * s, 11 * s, 24 * s);
        g.fillStyle(0xff9a2a, 1);    g.fillEllipse(p.x, fy - 10 * s, 7 * s, 17 * s);
        g.fillStyle(0xffd24a, 1);    g.fillEllipse(p.x, fy - 10 * s, 4 * s, 11 * s);
        g.fillStyle(0xfff0c0, 1);    g.fillEllipse(p.x, fy - 8 * s, 2 * s, 6 * s);
        this.addGlow(p.x, fy - 8 * s, 82 * s, 0xffaa44, 0.5);
      });
    });

    // FLOOR — three depth-graded brightness zones (dark near → warm by the arch).
    const floorHW = (t) => width / 2 + (bwW / 2 - width / 2) * t;   // half-width at depth t
    const floorYt = (t) => sceneBot + (bwBot - sceneBot) * t;       // t: 0 front → 1 back
    const floorBand = (t0, t1, col) => {
      g.fillStyle(col, 1);
      g.fillPoints([
        { x: cx - floorHW(t0), y: floorYt(t0) }, { x: cx + floorHW(t0), y: floorYt(t0) },
        { x: cx + floorHW(t1), y: floorYt(t1) }, { x: cx - floorHW(t1), y: floorYt(t1) },
      ], true);
    };
    floorBand(0.0, 0.20, 0x3d2510);   // far: warmest, lit by the arch
    floorBand(0.20, 0.55, 0x2a1a0c);  // mid: neutral warm stone
    floorBand(0.55, 1.0, 0x1a1008);   // near: darkest, in shadow
    g.fillStyle(0x5a3020, 1);
    g.fillRect(0, sceneBot - 2, width, 2);
    // Arch light pooling on the floor (radial, at the back-wall threshold).
    this.addGlow(cx, bwBot + 18, width * 0.55, 0xc8822a, 0.16);
    // Receding floor courses (parallel to the front edge, narrowing with depth).
    for (let r = 1; r <= 6; r++) {
      const t  = r / 7;
      const y  = Math.round(sceneBot + (bwBot - sceneBot) * t);
      const hw = Math.round((width / 2) + (bwW / 2 - width / 2) * t);
      g.fillStyle(0xc8922a, 0.24 * (1 - t * 0.4));
      g.fillRect(cx - hw, y, hw * 2, Math.max(1, Math.round((1 - t) * 3 + 1)));
    }
    // Floorboards converging toward the back wall.
    g.lineStyle(1, 0xc8922a, 0.1);
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      g.beginPath();
      g.moveTo(cx + k * (width / 7), sceneBot);
      g.lineTo(cx + k * (bwW / 7), bwBot);
      g.strokePath();
    }

    // ── Carpet runner — crimson, bottom-centre to the arch threshold ──────────
    const runBotHW = width * 0.11;   // ~22% wide at the viewer
    const runTopHW = width * 0.025;  // ~5% near the arch
    const runTopY = bwBot;
    const runPts = (sh) => [
      { x: cx - runBotHW - sh, y: sceneBot }, { x: cx + runBotHW + sh, y: sceneBot },
      { x: cx + runTopHW + sh * 0.25, y: runTopY }, { x: cx - runTopHW - sh * 0.25, y: runTopY },
    ];
    g.fillStyle(0x2a0810, 1);                       // worn-edge underlay (offset, darker)
    g.fillPoints(runPts(2), true);
    g.fillStyle(0x5a1020, 1);                       // deep crimson base
    g.fillPoints(runPts(0), true);
    g.fillStyle(0x3a0a14, 0.55);                    // shadowed near end
    g.fillPoints([
      { x: cx - runBotHW, y: sceneBot }, { x: cx + runBotHW, y: sceneBot },
      { x: cx + (runBotHW * 0.55 + runTopHW * 0.45), y: floorYt(0.45) },
      { x: cx - (runBotHW * 0.55 + runTopHW * 0.45), y: floorYt(0.45) },
    ], true);
    g.fillStyle(GOLD, 0.5);                         // gold border trim, both edges
    const trim = 4;
    g.fillPoints([
      { x: cx - runBotHW, y: sceneBot }, { x: cx - runBotHW + trim, y: sceneBot },
      { x: cx - runTopHW + trim * 0.3, y: runTopY }, { x: cx - runTopHW, y: runTopY },
    ], true);
    g.fillPoints([
      { x: cx + runBotHW - trim, y: sceneBot }, { x: cx + runBotHW, y: sceneBot },
      { x: cx + runTopHW, y: runTopY }, { x: cx + runTopHW - trim * 0.3, y: runTopY },
    ], true);
    this.addGlow(cx, runTopY + 6, width * 0.16, 0xc8822a, 0.15); // brighter at the arch end
    // Woven House sigil — gold diamond, foreshortened on the floor.
    const emY = floorYt(0.62);
    const emW = (runBotHW * 0.34) * 0.85;
    const emH = emW * 0.62;                          // squashed for floor perspective
    g.fillStyle(GOLD, 0.92);
    g.fillTriangle(cx, emY - emH, cx + emW, emY, cx, emY + emH);
    g.fillTriangle(cx, emY - emH, cx - emW, emY, cx, emY + emH);
    g.fillStyle(0x5a1020, 1);                        // crimson cut-out
    g.fillTriangle(cx, emY - emH * 0.6, cx + emW * 0.62, emY, cx, emY + emH * 0.6);
    g.fillTriangle(cx, emY - emH * 0.6, cx - emW * 0.62, emY, cx, emY + emH * 0.6);
    g.fillStyle(GOLD, 1);                            // cross-bar + centre jewel
    g.fillRect(cx - emW * 0.78, emY - emH * 0.12, emW * 1.56, emH * 0.24);
    g.fillCircle(cx, emY, emH * 0.34);

    // BACK WALL face.
    g.fillStyle(0x46260f, 1);
    g.fillRect(bwL, bwTop, bwW, bwBot - bwTop);
    g.fillStyle(0xb07d4a, 0.7);   // cornice
    g.fillRect(bwL, bwTop, bwW, 2);

    // ── Door — tall arch sitting flat on the back wall, on the floor ──────────
    const archW   = Math.round(bwW * 0.52);
    const archRad = archW / 2;
    const archBot = bwBot - 2;                                   // stands on floor
    const archTop = Math.round(bwTop + (bwBot - bwTop) * 0.12);
    const archH   = archBot - archTop;
    const archL   = cx - archRad;
    const archR   = cx + archRad;

    g.fillStyle(0x5a3a18, 1);                                    // stone surround
    g.fillRoundedRect(archL - 4, archTop - 3, archW + 8, archH + 3, {
      tl: archRad + 3, tr: archRad + 3, bl: 0, br: 0,
    });
    g.fillStyle(0x2a1a08, 1);                                    // soffit
    g.fillRoundedRect(archL, archTop, archW, archH, {
      tl: archRad, tr: archRad, bl: 0, br: 0,
    });
    const inset = Math.max(2, Math.round(archW * 0.13));
    g.fillStyle(0x100c08, 1);                                    // dark opening
    g.fillRoundedRect(archL + inset, archTop + inset, archW - inset * 2, archH - inset, {
      tl: archRad - inset, tr: archRad - inset, bl: 0, br: 0,
    });
    this.addGlow(cx, archBot - archH * 0.4, archW * 2.6, 0xffce86, 0.5);

    // Warm light spilling from the doorway across the near floor.
    g.fillStyle(0xc8922a, 0.06);
    g.fillTriangle(archL, archBot, archR, archBot, cx + width * 0.22, sceneBot);
    g.fillTriangle(archL, archBot, archR, archBot, cx - width * 0.22, sceneBot);

    // ── Side doors — modest arched openings cut FLUSH into each wall ──────────
    // Built in (depth, height) wall coordinates and mapped onto the wall plane,
    // so they lie in the wall rather than sitting out from it. Set deeper, in the
    // bay by the second pair of columns. Drawn before the columns so a column can
    // stand in front of a doorway (as in a real colonnade).
    const sideDoor = (sign) => {
      const map = (d, v) => wallMap(sign, d, v);        // share the wall mapping
      const dA = 0.68, dB = 0.80;                       // deeper bay, clear of columns
      const vFloor = 0.99, vSpring = 0.60, vPeak = 0.46; // a modest, shallow arch
      // Closed door outline: floor edge then arched top; ed/ev expand for frames.
      const outline = (ed, ev) => {
        const a = dA - ed, b = dB + ed;
        const sp = vSpring - ev, pk = vPeak - ev;
        const pts = [map(a, vFloor), map(b, vFloor)];
        const N = 9;
        for (let i = 0; i <= N; i++) {
          const t = i / N;                              // far spring → crown → near spring
          pts.push(map(b + (a - b) * t, sp - (sp - pk) * Math.sin(Math.PI * t)));
        }
        return pts;
      };
      g.fillStyle(0x6a4626, 1);                         // sandstone frame
      g.fillPoints(outline(0.018, 0.035), true);
      g.fillStyle(0x3a2614, 1);                         // inner reveal (wall thickness)
      g.fillPoints(outline(0.006, 0.012), true);
      g.fillStyle(0x130d08, 1);                         // dark opening
      g.fillPoints(outline(-0.004, -0.004), true);
      // Faint warm spill from within (modest, not grand).
      const c = map((dA + dB) / 2, (vFloor + vPeak) / 2);
      const wpx = Math.abs(map(dA, vFloor).x - map(dB, vFloor).x);
      this.addGlow(c.x, c.y, wpx * 3.0, 0xffce86, 0.16);
      // Hotspot bounding box (sampled corners + crown).
      const corners = [
        map(dA, vFloor), map(dB, vFloor),
        map(dA, vSpring), map(dB, vSpring), map((dA + dB) / 2, vPeak),
      ];
      const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    };

    this.doorHotspots = {
      left:    { ...sideDoor(-1), key: EXITS.hall.left,  label: LOCATIONS[EXITS.hall.left].name },
      right:   { ...sideDoor(+1), key: EXITS.hall.right, label: LOCATIONS[EXITS.hall.right].name },
      forward: { x: archL, y: archTop, w: archW, h: archH, key: EXITS.hall.forward, label: LOCATIONS[EXITS.hall.forward].name },
    };

    // ── Columns — colonnade receding with the SAME box mapping as the walls ───
    // Each column spans floor→ceiling AT ITS DEPTH: the floor line is
    // sceneBot→bwBot, the ceiling line is 0→bwTop. Horizontal offset + width
    // shrink by the wall's horizontal scale, so the row converges with the room.
    const hBack = bwW / width;                    // horizontal scale at back wall
    const FRONT_OFF = width * 0.42;
    const colData = [0.04, 0.50, 0.78].map((d) => {
      const wScale = 1 - d * (1 - hBack);
      const offX   = Math.round(FRONT_OFF * wScale);
      const baseY  = Math.round(sceneBot + (bwBot - sceneBot) * d);  // floor at depth d
      const topY   = Math.round(bwTop * d) + Math.round(26 * wScale); // capital meets ceiling
      return { d, wScale, offX, baseY, topY };
    });
    // Floor reflections — faint, fading mirror of each column on the polished floor.
    colData.forEach(({ offX, baseY, wScale, d }) => {
      const hw = Math.round(46 * wScale * 0.55);
      const reflLen = Math.round((sceneBot - baseY) * 0.85 + 8);
      [cx - offX, cx + offX].forEach((x) => {
        for (let i = 0; i < 5; i++) {
          g.fillStyle(0xc8884a, 0.12 * (1 - i / 5) * (1 - d * 0.4));
          g.fillRect(x - hw, Math.round(baseY + (reflLen * i) / 5), hw * 2, Math.ceil(reflLen / 5) + 1);
        }
      });
    });
    // Columns (drawn over their reflections).
    colData.forEach(({ d, wScale, offX, baseY, topY }) => {
      this.column(g, cx - offX, topY, baseY, d, wScale, +1); // left lit toward centre
      this.column(g, cx + offX, topY, baseY, d, wScale, -1); // right lit toward centre
    });

    // ── Foreground urns — dark glazed vases flanking the entrance ─────────────
    const urn = (ux, uy, us) => {
      // Floor reflection (faint, flipped sheen below).
      g.fillStyle(0x000000, 0.22);
      g.fillEllipse(ux, uy + 4 * us, 56 * us, 10 * us);
      // Body, foot, neck, rim.
      g.fillStyle(0x171210, 1); g.fillEllipse(ux, uy - 30 * us, 42 * us, 52 * us);
      g.fillStyle(0x241c16, 1); g.fillEllipse(ux - 9 * us, uy - 36 * us, 16 * us, 28 * us); // sheen
      g.fillStyle(0x100c0a, 1); g.fillEllipse(ux, uy - 2 * us, 30 * us, 9 * us);            // foot shadow
      g.fillStyle(0x1b1512, 1); g.fillRect(ux - 13 * us, uy - 62 * us, 26 * us, 18 * us);   // neck
      g.fillStyle(0x342820, 1); g.fillEllipse(ux, uy - 62 * us, 32 * us, 9 * us);           // rim
      g.fillStyle(0x5a4632, 0.8); g.fillEllipse(ux, uy - 63 * us, 30 * us, 5 * us);         // rim light
      g.fillStyle(0xc8884a, 0.25); g.fillEllipse(ux - 11 * us, uy - 40 * us, 5 * us, 16 * us); // torch glint
    };
    urn(cx - width * 0.32, sceneBot - 2, 1.15);
    urn(cx + width * 0.32, sceneBot - 2, 1.15);

    // ── Banners — mounted on the back wall, neatly flanking the door ──────────
    const bScale = 0.7;
    const bGapL  = Math.round((bwL + archL) / 2);
    const bGapR  = Math.round((bwR + archR) / 2);
    const bTopY  = bwTop + Math.round(10 * bScale);
    const bLen   = Math.round((bwBot - bwTop) * 0.46);
    this.banner(g, bGapL, bTopY, bLen, bScale);
    this.banner(g, bGapR, bTopY, bLen, bScale);
  }

  // --- Court (bespoke) --------------------------------------------------------

  /** The Court — formal audience chamber of House Calder. One-point perspective
   *  box (bwW ≈ 28 %) with sandstone walls, polished stone floor, a raised
   *  three-step dais, and the High Seat. Not a king's throne — the working
   *  judge's chair of a sixty-year house. */
  sceneCourt(g, width, _floorY) {
    const cx       = width / 2;
    const height   = this.scale.height;
    const sceneBot = Math.round(height * 0.72);

    // ── Perspective box — narrow back wall → aggressive convergence → wide feel ──
    // Reducing bwW from 0.28→0.17 is the primary width trick: the vanishing-point
    // convergence becomes much more acute, suggesting a vast lateral space.
    const bwW   = Math.round(width * 0.17);
    const bwL   = cx - bwW / 2;
    const bwR   = cx + bwW / 2;
    const bwTop = Math.round(sceneBot * 0.09);
    const bwBot = Math.round(sceneBot * 0.63);

    // Wall-plane mapping — depth 0(viewer) → 1(back wall), v 0(ceil) → 1(floor).
    // Identical pattern to sceneHall; used for stone banding, torches, arch openings.
    const wallMap = (sign, d, v) => {
      const fx = sign < 0 ? 0 : width;
      const bx = sign < 0 ? bwL : bwR;
      const x  = fx + (bx - fx) * d;
      const ty = bwTop * d;
      const by = sceneBot + (bwBot - sceneBot) * d;
      return { x, y: ty + (by - ty) * v };
    };

    const hScale   = (d) => 1 - d * (1 - bwW / width);
    const floorAtD = (d) => sceneBot + (bwBot - sceneBot) * d;
    const ceilAtD  = (d) => bwTop * d;
    const floorHW  = (t) => width / 2 + (bwW / 2 - width / 2) * t;
    const floorYt  = (t) => sceneBot + (bwBot - sceneBot) * t;

    const lerpC = (c1, c2, t) => {
      const r  = ((c1 >> 16) & 255) + (((c2 >> 16) & 255) - ((c1 >> 16) & 255)) * t;
      const gg = ((c1 >>  8) & 255) + (((c2 >>  8) & 255) - ((c1 >>  8) & 255)) * t;
      const b  = ( c1        & 255) + (( c2        & 255) - ( c1        & 255)) * t;
      return (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(b);
    };

    // ── Ceiling — very dark, warm ─────────────────────────────────────────────
    g.fillStyle(0x160c06, 1);
    g.fillPoints([
      { x: 0, y: 0 }, { x: width, y: 0 },
      { x: bwR, y: bwTop }, { x: bwL, y: bwTop },
    ], true);
    // 9 converging coffer ribs — more ribs on wider ceiling span
    g.fillStyle(0x0a0604, 0.55);
    for (let k = 1; k <= 9; k++) {
      const fx = k * width / 10;
      const bx = bwL + bwW * (k / 10);
      g.fillPoints([
        { x: fx - 2, y: 0 }, { x: fx + 2, y: 0 },
        { x: bx + 1, y: bwTop }, { x: bx - 1, y: bwTop },
      ], true);
    }
    // Cornice band suggesting massive vault scale
    g.fillStyle(0x2e1a0a, 1);
    g.fillRect(0, bwTop - 3, width, 5);
    g.fillStyle(GOLD, 0.22);
    g.fillRect(0, bwTop - 3, width, 1);

    // ── Side walls — wide visible surface with stone detail ───────────────────
    g.fillStyle(0x3a2210, 1);      // left — cooler shadow
    g.fillPoints([
      { x: 0,   y: 0       }, { x: bwL, y: bwTop  },
      { x: bwL, y: bwBot   }, { x: 0,   y: sceneBot },
    ], true);
    g.fillStyle(0x4a2c14, 1);      // right — warmer, slight lamp catch
    g.fillPoints([
      { x: width, y: 0       }, { x: width, y: sceneBot },
      { x: bwR,   y: bwBot   }, { x: bwR,   y: bwTop   },
    ], true);

    // Wall detail: perspective stone courses + recessed panels + torches
    [-1, 1].forEach((sign) => {
      // Faint horizontal stone-course lines mapped in wall perspective
      g.lineStyle(1, 0x1a0e06, 0.20);
      [0.18, 0.36, 0.54, 0.72, 0.88].forEach((v) => {
        const a = wallMap(sign, 0.02, v);
        const b = wallMap(sign, 0.98, v);
        g.lineBetween(a.x, a.y, b.x, b.y);
      });

      // Decorative recessed panel in the front bay (near the entrance columns)
      const panelPts = [
        wallMap(sign, 0.18, 0.18), wallMap(sign, 0.34, 0.18),
        wallMap(sign, 0.34, 0.74), wallMap(sign, 0.18, 0.74),
      ];
      g.fillStyle(0x1e1008, 0.4);
      g.fillPoints(panelPts, true);
      g.lineStyle(1.5, GOLD, 0.28);
      g.strokePoints(panelPts, true, true);
      g.lineStyle(1, 0xc8822a, 0.18);
      g.lineBetween(panelPts[0].x, panelPts[0].y, panelPts[1].x, panelPts[1].y);
      g.lineBetween(panelPts[0].x, panelPts[0].y, panelPts[3].x, panelPts[3].y);

      // Wall torches — two per side, mapped in perspective
      [0.08, 0.44].forEach((d) => {
        const p = wallMap(sign, d, 0.30);
        const s = 1 - d * 0.45;
        const cl = wallMap(sign, d - 0.05, 0.72), cr = wallMap(sign, d + 0.05, 0.72);
        g.fillStyle(0xffcc66, 0.07);
        g.fillTriangle(p.x, p.y + 4 * s, cl.x, cl.y, cr.x, cr.y);
        g.fillStyle(0x241e18, 1);
        g.fillRect(p.x - 1.5 * s, p.y - 2 * s, 3 * s, 14 * s);
        g.fillStyle(0x3a3028, 1);
        g.fillEllipse(p.x, p.y - 2 * s, 11 * s, 5 * s);
        const fy = p.y - 5 * s;
        g.fillStyle(0xe2541a, 0.95); g.fillEllipse(p.x, fy - 9 * s, 11 * s, 24 * s);
        g.fillStyle(0xff9a2a, 1);    g.fillEllipse(p.x, fy - 10 * s, 7 * s, 17 * s);
        g.fillStyle(0xffd24a, 1);    g.fillEllipse(p.x, fy - 10 * s, 4 * s, 11 * s);
        g.fillStyle(0xfff0c0, 1);    g.fillEllipse(p.x, fy - 8 * s, 2 * s, 6 * s);
        this.addGlow(p.x, fy - 8 * s, 82 * s, 0xffaa44, 0.45);
      });
    });

    // ── Side arch openings — drawn on wall face BEFORE columns ────────────────
    // Left wall carries two doors (the living quarters wing): Veil (mid-depth)
    // and Eren's Quarters (deeper, past the far columns). Right wall has Solar.
    // Having Quarters as a side door — not behind the throne — is correct:
    // you don't walk through the lord's seat to reach the player's quarters.
    const sideArch = (sign, dA, dB) => {
      const map = (d, v) => wallMap(sign, d, v);
      const vFloor = 0.99, vSpring = 0.58, vPeak = 0.42;
      const outline = (ed, ev) => {
        const a = dA - ed, b = dB + ed;
        const sp = vSpring - ev, pk = vPeak - ev;
        const pts = [map(a, vFloor), map(b, vFloor)];
        for (let i = 0; i <= 9; i++) {
          const t = i / 9;
          pts.push(map(b + (a - b) * t, sp - (sp - pk) * Math.sin(Math.PI * t)));
        }
        return pts;
      };
      g.fillStyle(0x6a4626, 1);
      g.fillPoints(outline(0.018, 0.035), true);
      g.fillStyle(0x3a2614, 1);
      g.fillPoints(outline(0.006, 0.012), true);
      g.fillStyle(0x130d08, 1);
      g.fillPoints(outline(-0.004, -0.004), true);
      const c   = map((dA + dB) / 2, (vFloor + vPeak) / 2);
      const wpx = Math.abs(map(dA, vFloor).x - map(dB, vFloor).x);
      this.addGlow(c.x, c.y, wpx * 3.2, 0xffce86, 0.22);
      const corners = [
        map(dA, vFloor), map(dB, vFloor),
        map(dA, vSpring), map(dB, vSpring), map((dA + dB) / 2, vPeak),
      ];
      const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
      return {
        x: Math.min(...xs), y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
      };
    };
    // LEFT wall: Veil (mid) then Quarters (deeper — private wing beyond the columns)
    const leftVeilHS     = sideArch(-1, 0.26, 0.44);   // mid-depth, between column pairs
    const leftQuartersHS = sideArch(-1, 0.60, 0.76);   // deeper, past far columns
    // RIGHT wall: Solar only
    const rightSolarHS   = sideArch(+1, 0.26, 0.44);

    // ── Back wall — sandstone, lighter/slightly cooler than side walls ─────────
    g.fillStyle(0x5a3c20, 1);
    g.fillRect(bwL, bwTop, bwW, bwBot - bwTop);
    g.lineStyle(1, 0x2e1c0c, 0.30);
    for (let i = 1; i < 6; i++) {
      const y = bwTop + (bwBot - bwTop) * i / 6;
      g.lineBetween(bwL, Math.round(y), bwR, Math.round(y));
    }
    g.fillStyle(0x6a4a26, 1);
    g.fillRect(bwL - 3, bwTop - 5, bwW + 6, 7);
    g.fillStyle(GOLD, 0.55);
    g.fillRect(bwL - 3, bwTop - 5, bwW + 6, 1);

    // ── Back wall — plain sandstone, no door. The throne reads as final authority.
    // (Quarters is reached via the left-wall passage, not through the lord's seat.)

    // ── Floor — three depth-graded zones ──────────────────────────────────────
    const floorBand = (t0, t1, col) => {
      g.fillStyle(col, 1);
      g.fillPoints([
        { x: cx - floorHW(t0), y: floorYt(t0) }, { x: cx + floorHW(t0), y: floorYt(t0) },
        { x: cx + floorHW(t1), y: floorYt(t1) }, { x: cx - floorHW(t1), y: floorYt(t1) },
      ], true);
    };
    floorBand(0.0, 0.22, 0x3a2010);   // far: warm, lit by arch glow
    floorBand(0.22, 0.58, 0x241808);  // mid: neutral warm stone
    floorBand(0.58, 1.0, 0x1a1008);   // near: darkest, in shadow
    // Perspective tile lines (horizontal)
    g.lineStyle(1, 0x3a2214, 0.22);
    for (let r = 1; r <= 6; r++) {
      const t  = r / 7;
      const y  = Math.round(sceneBot + (bwBot - sceneBot) * t);
      const hw = Math.round(width / 2 + (bwW / 2 - width / 2) * t);
      g.lineBetween(cx - hw, y, cx + hw, y);
    }
    // Converging vertical lines — more acute with the narrower bwW
    for (let k = -8; k <= 8; k++) {
      g.lineBetween(
        Math.round(cx + k * width * 0.10), sceneBot,
        Math.round(cx + k * bwW  * 0.10), bwBot,
      );
    }
    // Arch-light pooling on the far floor
    this.addGlow(cx, bwBot + 16, width * 0.50, 0xc8822a, 0.14);

    // ── Crimson runner — wider near-width reinforces grand scale ──────────────
    const rnFarW  = Math.round(bwW * 0.36);
    const rnNearW = Math.round(width * 0.16);
    g.fillStyle(0x2a0810, 1);
    g.fillPoints([
      { x: cx - rnFarW / 2 - 2,  y: bwBot    },
      { x: cx + rnFarW / 2 + 2,  y: bwBot    },
      { x: cx + rnNearW / 2 + 2, y: sceneBot },
      { x: cx - rnNearW / 2 - 2, y: sceneBot },
    ], true);
    g.fillStyle(0x580810, 1);
    g.fillPoints([
      { x: cx - rnFarW / 2,  y: bwBot    },
      { x: cx + rnFarW / 2,  y: bwBot    },
      { x: cx + rnNearW / 2, y: sceneBot },
      { x: cx - rnNearW / 2, y: sceneBot },
    ], true);
    // Shadowed leading end
    g.fillStyle(0x3a0a14, 0.50);
    g.fillPoints([
      { x: cx - rnNearW / 2, y: sceneBot },
      { x: cx + rnNearW / 2, y: sceneBot },
      { x: cx + (rnNearW / 2 * 0.55 + rnFarW / 2 * 0.45), y: floorYt(0.45) },
      { x: cx - (rnNearW / 2 * 0.55 + rnFarW / 2 * 0.45), y: floorYt(0.45) },
    ], true);
    const rin = 5;
    g.lineStyle(1, GOLD, 0.50);
    g.lineBetween(cx - rnFarW / 2,  bwBot,   cx - rnNearW / 2, sceneBot);
    g.lineBetween(cx + rnFarW / 2,  bwBot,   cx + rnNearW / 2, sceneBot);
    g.lineStyle(1, 0xa03040, 0.55);
    g.lineBetween(cx - rnFarW / 2 + rin, bwBot, cx - rnNearW / 2 + rin * 2, sceneBot);
    g.lineBetween(cx + rnFarW / 2 - rin, bwBot, cx + rnNearW / 2 - rin * 2, sceneBot);
    // Woven Calder emblem — foreshortened diamond on the runner
    const emY = floorYt(0.60);
    const emW = rnNearW * 0.28;
    const emH = emW * 0.62;
    g.fillStyle(GOLD, 0.85);
    g.fillTriangle(cx, emY - emH, cx + emW, emY, cx, emY + emH);
    g.fillTriangle(cx, emY - emH, cx - emW, emY, cx, emY + emH);
    g.fillStyle(0x580810, 1);
    g.fillTriangle(cx, emY - emH * 0.6, cx + emW * 0.62, emY, cx, emY + emH * 0.6);
    g.fillTriangle(cx, emY - emH * 0.6, cx - emW * 0.62, emY, cx, emY + emH * 0.6);

    // ── Far column pair (d=0.52) — drawn first, flanks the dais approach ──────
    const colFarD   = 0.52;
    const hsFar     = hScale(colFarD);
    const colFarOff = Math.round(width * 0.38 * hsFar);
    this.column(g, cx - colFarOff, Math.round(ceilAtD(colFarD)), Math.round(floorAtD(colFarD)), colFarD, hsFar,  1);
    this.column(g, cx + colFarOff, Math.round(ceilAtD(colFarD)), Math.round(floorAtD(colFarD)), colFarD, hsFar, -1);

    // ── Near column pair (d=0.12) — grand entrance frame, drawn over far pair ──
    const colNearD   = 0.12;
    const hsNear     = hScale(colNearD);
    const colNearOff = Math.round(width * 0.40 * hsNear);
    this.column(g, cx - colNearOff, Math.round(ceilAtD(colNearD)), Math.round(floorAtD(colNearD)), colNearD, hsNear,  1);
    this.column(g, cx + colNearOff, Math.round(ceilAtD(colNearD)), Math.round(floorAtD(colNearD)), colNearD, hsNear, -1);

    // ── Raised Dais — three steps ascending to the High Seat ─────────────────
    const daisSteps = 3;
    const stepH     = Math.round((bwBot - bwTop) * 0.088);
    const daisFullW = Math.round(bwW * 0.88);
    for (let s = 0; s < daisSteps; s++) {
      const sw   = Math.round(daisFullW * (1 - s * 0.18));
      const sL   = cx - sw / 2;
      const sTop = bwBot - (s + 1) * stepH;
      g.fillStyle(s % 2 === 0 ? 0x241608 : 0x2e1c0e, 1);
      g.fillRect(sL, sTop, sw, stepH);
      g.fillStyle(lerpC(0x3a2210, 0x5a3820, s / daisSteps), 0.75);
      g.fillRect(sL, sTop, sw, 2);
      if (s === daisSteps - 1) {
        g.fillStyle(GOLD, 0.35);
        g.fillRect(sL + 1, sTop, sw - 2, 1);
      }
    }
    const daisTop = bwBot - daisSteps * stepH;
    // No tall platform face — the back-wall arch is the visual anchor;
    // the throne sits in front of its opening rather than behind a slab.

    // ── House Calder banners — flanking the throne on the back wall ──────────
    const bScale = Math.max(0.55, bwW / 300);
    const bOff   = Math.round(bwW * 0.26);   // symmetric about back-wall centre
    const bTopY  = bwTop + 4;
    const bLen   = Math.round((daisTop - bwTop) * 0.70);
    this.banner(g, cx - bOff, bTopY, bLen, bScale);
    this.banner(g, cx + bOff, bTopY, bLen, bScale);

    // ── The High Seat ─────────────────────────────────────────────────────────
    const sc    = Math.max(0.72, bwW / 260);
    const seatX = cx;
    const seatY = daisTop;
    const backW = Math.round(54 * sc);
    const backH = Math.round(132 * sc);
    const backT = seatY - backH;

    g.fillStyle(0x0a0602, 0.55);
    g.fillRect(seatX - backW / 2 + 5, backT + 5, backW, backH);

    g.fillStyle(0x1e120a, 1);
    g.fillRect(seatX - backW / 2, backT, backW, backH);
    g.fillStyle(0x3a2214, 0.75);
    g.fillRect(seatX - backW / 2, backT, Math.round(backW * 0.35), backH);
    g.fillStyle(0x4e3020, 0.4);
    g.fillRect(seatX - backW / 2, backT, Math.round(backW * 0.14), backH);

    const panW = Math.round(backW * 0.48);
    const panH = Math.round(backH * 0.60);
    const panT = backT + Math.round(backH * 0.14);
    g.fillStyle(0x100a06, 0.85);
    g.fillRect(cx - panW / 2, panT, panW, panH);
    g.lineStyle(1, GOLD, 0.22);
    g.strokeRect(cx - panW / 2, panT, panW, panH);
    const sigY = panT + panH * 0.42;
    const sigR = Math.round(7 * sc);
    g.fillStyle(GOLD, 0.60);
    g.fillTriangle(cx, sigY - sigR, cx + sigR, sigY, cx, sigY + sigR);
    g.fillTriangle(cx, sigY - sigR, cx - sigR, sigY, cx, sigY + sigR);

    const finR = Math.round(5 * sc);
    g.fillStyle(GOLD, 0.88);
    g.fillCircle(seatX - Math.round(backW * 0.36), backT, finR);
    g.fillCircle(seatX + Math.round(backW * 0.36), backT, finR);
    g.fillStyle(GOLD, 0.55);
    g.fillRect(seatX - backW / 2 - 2, backT - 2, backW + 4, 3);

    const armW = Math.round(backW * 0.72);
    const armH = Math.round(10 * sc);
    const armY = seatY - Math.round(46 * sc);
    g.fillStyle(0x281808, 1);
    g.fillRect(seatX - backW / 2 - armW, armY, armW, armH);
    g.fillRect(seatX + backW / 2,        armY, armW, armH);
    g.fillStyle(0x3e2410, 0.65);
    g.fillRect(seatX - backW / 2 - armW, armY, armW, 2);
    g.fillRect(seatX + backW / 2,        armY, armW, 2);
    g.fillStyle(0x1e1008, 1);
    g.fillRect(seatX - backW / 2 - armW + 2, armY + armH, Math.round(8 * sc), seatY - armY - armH);
    g.fillRect(seatX + backW / 2 + armW - Math.round(10 * sc), armY + armH, Math.round(8 * sc), seatY - armY - armH);

    const plinthW = Math.round(backW * 1.5);
    const plinthH = Math.round(14 * sc);
    g.fillStyle(0x160e06, 1);
    g.fillRect(seatX - plinthW / 2, seatY - plinthH, plinthW, plinthH);
    g.fillStyle(0x3a2214, 0.6);
    g.fillRect(seatX - plinthW / 2, seatY - plinthH, plinthW, 2);
    g.fillStyle(0x000000, 0.38);
    g.fillEllipse(seatX, seatY + 3, plinthW * 1.2, Math.round(8 * sc));

    // ── Overhead hanging lamp ─────────────────────────────────────────────────
    const lampX  = cx;
    const lampY  = Math.round(bwTop + (daisTop - bwTop) * 0.22);
    const chainH = lampY - bwTop;
    g.lineStyle(1, 0x8a6a3a, 0.75);
    g.lineBetween(lampX, bwTop + 2, lampX, lampY - 8);
    g.fillStyle(0xa88040, 0.6);
    for (let i = 1; i < 5; i++) g.fillCircle(lampX, bwTop + chainH * i / 5, 2);
    const lsc = Math.max(1, Math.round(bwW / 70));
    g.fillStyle(0x2a1c0c, 1);
    g.fillRect(lampX - 7 * lsc, lampY - 6 * lsc, 14 * lsc, 12 * lsc);
    g.fillStyle(GOLD, 0.75);
    g.fillRect(lampX - 7 * lsc, lampY - 7 * lsc, 14 * lsc, 2 * lsc);
    g.fillRect(lampX - 7 * lsc, lampY + 5 * lsc, 14 * lsc, 2 * lsc);
    g.fillStyle(0xffdd80, 0.9);
    g.fillEllipse(lampX, lampY, 5 * lsc, 7 * lsc);
    this.addGlow(lampX, lampY + 30, Math.round(width * 0.20), 0xffcc60, 0.52);
    this.addGlow(lampX, lampY,      Math.round(width * 0.06), 0xfffbe0, 0.65);
    this.addGlow(lampX, bwBot - 20, Math.round(bwW * 0.80), 0xffcc60, 0.18);

    // ── Door hotspots ─────────────────────────────────────────────────────────
    // Three side-wall arches: Veil + Quarters on the left (the living wing),
    // Solar on the right. Nothing through the throne — that's Lord Aldric's seat.
    this.doorHotspots = {
      leftVeil:     { ...leftVeilHS,     key: 'veil',     label: LOCATIONS.veil.name },
      leftQuarters: { ...leftQuartersHS, key: 'quarters', label: LOCATIONS.quarters.name },
      right:        { ...rightSolarHS,   key: 'solar',    label: LOCATIONS.solar.name },
    };

    // ── Floor extension + vignettes ───────────────────────────────────────────
    g.fillStyle(0x1a1008, 1);
    g.fillRect(0, sceneBot, width, height - sceneBot);
    this.addGlow(cx, sceneBot + 8, width * 0.9, 0x000000, 0.22);
    g.fillStyle(0x000000, 0.55);
    g.fillRect(0, 0, width, Math.round(sceneBot * 0.06));
    // Narrower vignette than before — the wide walls should read, not be swallowed
    const vigW = Math.round(width * 0.14);
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0, 0.55, 0);
    g.fillRect(0, 0, vigW, sceneBot);
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.55, 0, 0.55);
    g.fillRect(width - vigW, 0, vigW, sceneBot);
  }

  banner(g, x, topY, len, s = 1) {
    const w = 40 * s;
    // Hanging rod with finial ends.
    g.fillStyle(0xc8922a, 1);
    g.fillRect(x - w / 2 - 10 * s, topY - 7 * s, w + 20 * s, 5 * s);
    g.fillCircle(x - w / 2 - 10 * s, topY - 5 * s, 5 * s);
    g.fillCircle(x + w / 2 + 10 * s, topY - 5 * s, 5 * s);
    g.fillStyle(0x8a5a18, 0.8);
    g.fillRect(x - w / 2 - 2 * s, topY - 7 * s, w + 4 * s, 2 * s);
    // House Calder — deep crimson/wine (warm, sits in the palette).
    g.fillStyle(0x6e0c1a, 1);
    g.fillRect(x - w / 2, topY, w, len);
    g.fillTriangle(x - w / 2, topY + len, x + w / 2, topY + len, x, topY + len + 18 * s);
    // Edge highlights.
    g.fillStyle(0xa03050, 0.9);
    g.fillRect(x - w / 2, topY, 3 * s, len + 18 * s);
    g.fillRect(x + w / 2 - 3 * s, topY, 3 * s, len);
    // Gold top bar.
    g.fillStyle(GOLD, 1);
    g.fillRect(x - w / 2 - 5 * s, topY - 3 * s, w + 10 * s, 5 * s);
    // Sigil — diamond with cross and centre jewel.
    const sy = topY + len * 0.38;
    g.fillStyle(GOLD, 0.95);
    g.fillTriangle(x, sy - 14 * s, x + 11 * s, sy, x, sy + 14 * s);
    g.fillTriangle(x, sy - 14 * s, x - 11 * s, sy, x, sy + 14 * s);
    g.fillStyle(0x6e0c1a, 1);
    g.fillTriangle(x, sy - 8 * s, x + 6 * s, sy, x, sy + 8 * s);
    g.fillTriangle(x, sy - 8 * s, x - 6 * s, sy, x, sy + 8 * s);
    g.fillStyle(GOLD, 1);
    g.fillCircle(x, sy, 3 * s);
    g.fillRect(x - 10 * s, sy - 1.5 * s, 20 * s, 3 * s);
    // Wave marks — salt-and-sea for House Calder.
    const wy = topY + len * 0.7;
    g.fillStyle(0xd04060, 0.8);
    g.fillRect(x - 9 * s, wy, 18 * s, 2 * s);
    g.fillStyle(0xd04060, 0.55);
    g.fillRect(x - 7 * s, wy + 5 * s, 14 * s, 2 * s);
    g.fillStyle(0xd04060, 0.35);
    g.fillRect(x - 5 * s, wy + 10 * s, 10 * s, 2 * s);
  }

  // Feature props (centred on the floor) ------------------------------------

  featureCourt(g, x, floorY, s) {
    g.fillStyle(0x2a1d40, 1);
    g.fillRect(x - 80 * s, floorY - 12 * s, 160 * s, 12 * s);
    g.fillStyle(0x33244e, 1);
    g.fillRect(x - 58 * s, floorY - 24 * s, 116 * s, 12 * s);
    g.fillStyle(0x3a2858, 1);
    g.fillRect(x - 22 * s, floorY - 86 * s, 44 * s, 62 * s);
    g.fillStyle(0x243a64, 1);
    g.fillRect(x - 20 * s, floorY - 54 * s, 40 * s, 8 * s);
    g.fillStyle(GOLD, 1);
    g.fillCircle(x - 22 * s, floorY - 88 * s, 4 * s);
    g.fillCircle(x + 22 * s, floorY - 88 * s, 4 * s);
  }

  featureWar(g, x, floorY, s) {
    g.fillStyle(0x2e2142, 1);
    g.fillRect(x - 70 * s, floorY - 40 * s, 140 * s, 10 * s);
    g.fillStyle(0x241a36, 1);
    g.fillRect(x - 64 * s, floorY - 30 * s, 10 * s, 30 * s);
    g.fillRect(x + 54 * s, floorY - 30 * s, 10 * s, 30 * s);
    g.fillStyle(0xb89a6a, 0.95);
    g.fillRect(x - 56 * s, floorY - 47 * s, 112 * s, 8 * s);
    g.fillStyle(0xe0503c, 1);
    g.fillCircle(x - 28 * s, floorY - 43 * s, 3 * s);
    g.fillStyle(0x6fb0ff, 1);
    g.fillCircle(x + 8 * s, floorY - 43 * s, 3 * s);
    g.fillStyle(0xffce86, 1);
    g.fillCircle(x + 32 * s, floorY - 43 * s, 3 * s);
  }

  featureVeil(g, x, floorY, s) {
    g.fillStyle(0x3a2a6a, 0.8);
    for (let k = -1; k <= 1; k += 1)
      g.fillRect(x - 70 * s + k * 52 * s, floorY - 150 * s, 18 * s, 150 * s);
    g.fillStyle(0xb98cff, 0.5);
    g.fillCircle(x, floorY - 120 * s, 22 * s);
    g.fillStyle(0x231541, 1);
    g.fillCircle(x, floorY - 120 * s, 16 * s);
    g.fillStyle(0xb98cff, 0.85);
    g.fillCircle(x, floorY - 120 * s, 4 * s);
    this.drawFlame(g, x - 78 * s, floorY, s);
    this.drawFlame(g, x + 78 * s, floorY, s);
  }

  featureInfirmary(g, x, floorY, s) {
    const cols = [0x7fd0a0, 0xff8a5a, 0x6fb0ff, 0xffd27a];
    g.fillStyle(0x3a2850, 1);
    g.fillRect(x - 80 * s, floorY - 96 * s, 60 * s, 7 * s);
    g.fillRect(x - 80 * s, floorY - 66 * s, 60 * s, 7 * s);
    for (let i = 0; i < 4; i += 1) {
      g.fillStyle(cols[i], 0.9);
      g.fillRect(x - 78 * s + i * 14 * s, floorY - 108 * s, 8 * s, 12 * s);
    }
    g.fillStyle(0x2e2142, 1);
    g.fillRect(x + 8 * s, floorY - 16 * s, 70 * s, 16 * s);
    g.fillStyle(0x4a3a5e, 1);
    g.fillRect(x + 8 * s, floorY - 20 * s, 70 * s, 6 * s);
  }

  featureYard(g, x, floorY, s) {
    g.fillStyle(0x3a2850, 1);
    g.fillRect(x - 80 * s, floorY - 80 * s, 7 * s, 80 * s);
    g.fillRect(x - 30 * s, floorY - 80 * s, 7 * s, 80 * s);
    g.fillRect(x - 80 * s, floorY - 80 * s, 57 * s, 6 * s);
    g.fillStyle(0xcfd0d8, 1);
    g.fillRect(x - 70 * s, floorY - 74 * s, 4 * s, 64 * s);
    g.fillRect(x - 58 * s, floorY - 74 * s, 4 * s, 64 * s);
    g.fillStyle(0x5a4632, 1);
    g.fillRect(x + 36 * s, floorY - 50 * s, 12 * s, 50 * s);
    g.fillStyle(0x7a5a3a, 1);
    g.fillCircle(x + 42 * s, floorY - 56 * s, 11 * s);
    g.fillStyle(0x6a4a2a, 1);
    g.fillRect(x + 20 * s, floorY - 46 * s, 40 * s, 9 * s);
  }

  featureQuarters(g, x, floorY, s) {
    g.fillStyle(0x3a2850, 1);
    g.fillRect(x - 90 * s, floorY - 24 * s, 80 * s, 24 * s);
    g.fillStyle(0x5a466e, 1);
    g.fillRect(x - 90 * s, floorY - 30 * s, 80 * s, 9 * s);
    g.fillStyle(0xcfc0d8, 1);
    g.fillRect(x - 86 * s, floorY - 32 * s, 22 * s, 9 * s);
    g.fillStyle(0x0c1430, 1);
    g.fillRoundedRect(x + 24 * s, floorY - 150 * s, 56 * s, 120 * s, {
      tl: 28 * s,
      tr: 28 * s,
      bl: 0,
      br: 0,
    });
    g.fillStyle(0x6fa0d0, 0.5);
    g.fillCircle(x + 52 * s, floorY - 116 * s, 9 * s);
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(x + 36 * s, floorY - 130 * s, 1.4);
    g.fillCircle(x + 66 * s, floorY - 138 * s, 1.4);
  }

  featureDeck(g, x, floorY, s) {
    g.fillStyle(0x4a2858, 1);
    g.fillRoundedRect(x - 110 * s, floorY - 190 * s, 220 * s, 178 * s, {
      tl: 110 * s,
      tr: 110 * s,
      bl: 0,
      br: 0,
    });
    g.fillStyle(0x7a4a3a, 1);
    g.fillRoundedRect(x - 98 * s, floorY - 178 * s, 196 * s, 166 * s, {
      tl: 98 * s,
      tr: 98 * s,
      bl: 0,
      br: 0,
    });
    g.fillStyle(0xffce86, 0.5);
    g.fillCircle(x + 44 * s, floorY - 120 * s, 26 * s);
    g.fillStyle(0x1a1224, 1);
    g.fillEllipse(x, floorY - 30 * s, 90 * s, 18 * s);
    g.fillTriangle(x - 66 * s, floorY - 38 * s, x - 10 * s, floorY - 46 * s, x - 10 * s, floorY - 28 * s);
    g.fillTriangle(x + 66 * s, floorY - 38 * s, x + 10 * s, floorY - 46 * s, x + 10 * s, floorY - 28 * s);
  }

  drawFlame(g, fx, fy, s) {
    g.fillStyle(0xddd0c0, 1);
    g.fillRect(fx - 2 * s, fy - 16 * s, 4 * s, 16 * s);
    g.fillStyle(0xff8a3a, 0.9);
    g.fillEllipse(fx, fy - 20 * s, 7 * s, 13 * s);
    g.fillStyle(0xffe0a0, 1);
    g.fillEllipse(fx, fy - 20 * s, 3 * s, 7 * s);
  }

  // --- Title ----------------------------------------------------------------

  showEntryTitle() {
    const { width, height } = this.scale;
    const first = !this.registry.get('enteredResidency');
    this.registry.set('enteredResidency', true);
    this.registry.set('water', this.registry.get('water') ?? 100);

    const main = first ? 'ARRADIUS' : 'The Grand Hallway';
    const sub = first ? 'House Calder · Saltspire' : 'Saltspire';
    const t1 = this.add
      .text(width / 2, height * 0.3, main, {
        fontFamily: 'Georgia, serif',
        fontSize: first ? '46px' : '28px',
        color: '#f0e3d0',
      })
      .setOrigin(0.5)
      .setDepth(2000)
      .setAlpha(0);
    const t2 = this.add
      .text(width / 2, height * 0.3 + 38, sub, {
        fontFamily: 'Georgia, serif',
        fontSize: '15px',
        color: '#c8a98f',
      })
      .setOrigin(0.5)
      .setDepth(2000)
      .setAlpha(0);
    this.tweens.add({
      targets: [t1, t2],
      alpha: 1,
      duration: 1300,
      hold: 1600,
      yoyo: true,
      onComplete: () => {
        t1.destroy();
        t2.destroy();
      },
    });
  }
}
