/**
 * Efectos con nombre de los ítems (League of Legends Wiki, «Named item effect»).
 * https://wiki.leagueoflegends.com/en-us/Named_item_effect
 *
 * exclusive: solo un ítem con este efecto por build. Los efectos compartidos de la wiki son «únicos»
 * (solo se obtienen una vez entre todos los ítems que los dan), así que van como exclusivos;
 * excepción: Vigor (Energized), que Eneko permite repetir. Los aislados (un solo ítem) no restringen.
 * Para cambiar una restricción basta con tocar `exclusive` aquí.
 */
export type NamedEffectKind = 'active' | 'passive';

export const NAMED_EFFECT_KIND_LABEL: Record<NamedEffectKind, string> = { active: 'Activa', passive: 'Pasiva' };

/** Variante de un efecto compartido que cambia según el ítem (p. ej. Hoja encantada física / mágica). Id guardado: `base:key`. */
export type NamedEffectVariant = {
  key: string;
  /** Nombre completo para mostrar, p. ej. «Hoja encantada (física)». */
  name: string;
  /** Etiqueta corta («física»). */
  short: string;
  description: string;
  wikiItems: string[];
};

export type NamedEffect = {
  id: string;
  /** Nombre para mostrar (español si hay uno razonable). */
  name: string;
  /** Nombre en la wiki (inglés). */
  en: string;
  exclusive: boolean;
  shared: boolean;
  /** Activa (se usa) o pasiva. La wiki no las etiqueta: clasificación según el ítem en el juego. */
  kind: NamedEffectKind;
  /** Solo si los ítems que lo dan difieren de verdad (tipo de daño, stat…). La exclusividad sigue siendo del efecto base. */
  variants?: NamedEffectVariant[];
  description?: string;
  /** Ítems que lo tienen según la wiki (nombres en inglés, solo informativo). */
  wikiItems?: string[];
};

export const NAMED_EFFECTS: NamedEffect[] = [
  { id: "annul", name: "Anulación", en: "Annul", exclusive: true, shared: true, kind: "passive", description: "Escudo de hechizos que bloquea la siguiente habilidad enemiga.", wikiItems: ["Verdant Barrier", "Banshee's Veil", "Edge of Night"] },
  { id: "awe", name: "Asombro", en: "Awe", exclusive: true, shared: true, kind: "passive", description: "Da una stat basada en el maná.", wikiItems: ["Archangel's Staff", "Seraph's Embrace", "Manamune", "Muramana", "Winter's Approach", "Fimbulwinter"], variants: [{ key: "ap", name: "Asombro (AP)", short: "AP", description: "Da AP según el maná extra.", wikiItems: ["Archangel's Staff", "Seraph's Embrace"] }, { key: "ad", name: "Asombro (AD)", short: "AD", description: "Da AD extra según el maná máximo.", wikiItems: ["Manamune", "Muramana"] }, { key: "health", name: "Asombro (vida)", short: "vida", description: "Da vida extra según el maná extra.", wikiItems: ["Winter's Approach", "Fimbulwinter"] }] },
  { id: "cleave", name: "Hendidura", en: "Cleave", exclusive: true, shared: true, kind: "passive", description: "Los ataques básicos dañan a los enemigos cercanos al objetivo.", wikiItems: ["Tiamat", "Profane Hydra", "Ravenous Hydra", "Stridebreaker", "Titanic Hydra"], variants: [{ key: "ad", name: "Hendidura (AD)", short: "AD", description: "Daño físico según el AD a los enemigos alrededor del objetivo.", wikiItems: ["Tiamat", "Profane Hydra", "Ravenous Hydra", "Stridebreaker"] }, { key: "health", name: "Hendidura (vida máx.)", short: "vida máx.", description: "Daño físico según la vida máxima, en cono (Hidra titánica).", wikiItems: ["Titanic Hydra"] }] },
  { id: "energized", name: "Vigor", en: "Energized", exclusive: false, shared: true, kind: "passive", description: "Acumula cargas al moverse y atacar; con el máximo, el siguiente ataque básico las consume para un efecto extra al golpear.", wikiItems: ["Rapid Firecannon", "Statikk Shiv", "Stormrazor", "Voltaic Cyclosword"], variants: [{ key: "magic", name: "Vigor (mágico)", short: "mágico", description: "El ataque cargado hace daño mágico extra.", wikiItems: ["Rapid Firecannon", "Statikk Shiv", "Stormrazor"] }, { key: "physical", name: "Vigor (físico)", short: "físico", description: "El ataque cargado hace daño físico según la vida actual y da letalidad (Ciclovoltaica).", wikiItems: ["Voltaic Cyclosword"] }] },
  { id: "eternity", name: "Eternidad", en: "Eternity", exclusive: true, shared: true, kind: "passive", description: "Recupera maná según el daño recibido y vida según el maná gastado.", wikiItems: ["Catalyst of Aeons", "Rod of Ages"] },
  { id: "glory", name: "Gloria", en: "Glory", exclusive: true, shared: true, kind: "passive", description: "Cargas por asesinatos/asistencias (se pierden al morir); AP por carga.", wikiItems: ["Dark Seal", "Mejai's Soulstealer"] },
  { id: "grievous-wounds", name: "Heridas graves", en: "Grievous Wounds", exclusive: true, shared: true, kind: "passive", description: "El daño a campeones les aplica Heridas graves unos segundos.", wikiItems: ["Executioner's Calling", "Oblivion Orb", "Morellonomicon", "Mortal Reminder"], variants: [{ key: "physical", name: "Heridas graves (física)", short: "física", description: "Al hacer daño físico a campeones.", wikiItems: ["Executioner's Calling", "Mortal Reminder"] }, { key: "magic", name: "Heridas graves (mágica)", short: "mágica", description: "Al hacer daño mágico a campeones.", wikiItems: ["Oblivion Orb", "Morellonomicon"] }] },
  { id: "harmony", name: "Armonía", en: "Harmony", exclusive: true, shared: true, kind: "passive", description: "Poder de curación y escudo según el maná adicional.", wikiItems: ["Diadem of Songs", "Whispering Circlet"] },
  { id: "helping-hand", name: "Mano amiga", en: "Helping Hand", exclusive: true, shared: true, kind: "passive", description: "Los ataques básicos hacen daño extra a súbditos.", wikiItems: ["Doran's Helm", "Doran's Ring", "Doran's Shield", "Tear of the Goddess"] },
  { id: "immolate", name: "Inmolación", en: "Immolate", exclusive: true, shared: true, kind: "passive", description: "Daña con el tiempo a los enemigos cercanos.", wikiItems: ["Bami's Cinder", "Hollow Radiance", "Sunfire Aegis"] },
  { id: "lifeline", name: "Salvavidas", en: "Lifeline", exclusive: true, shared: true, kind: "passive", description: "Escudo o vida extra unos segundos al bajar de un umbral de vida.", wikiItems: ["Archangel's Staff", "Hexdrinker", "Immortal Shieldbow", "Maw of Malmortius", "Protoplasm Harness", "Seraph's Embrace", "Sterak's Gage"], variants: [{ key: "magic", name: "Salvavidas (vs. daño mágico)", short: "vs. daño mágico", description: "Escudo que solo absorbe daño mágico (Sorbemaleficios, Malmortius).", wikiItems: ["Hexdrinker", "Maw of Malmortius"] }, { key: "shield", name: "Salvavidas (escudo)", short: "escudo", description: "Escudo contra cualquier daño.", wikiItems: ["Archangel's Staff", "Seraph's Embrace", "Immortal Shieldbow", "Sterak's Gage"] }, { key: "health", name: "Salvavidas (vida extra)", short: "vida extra", description: "Vida extra y curación en vez de escudo (Arnés de protoplasma).", wikiItems: ["Protoplasm Harness"] }] },
  { id: "manaflow", name: "Flujo de maná", en: "Manaflow", exclusive: true, shared: true, kind: "passive", description: "Maná adicional al golpear con básicos y/o al afectar con habilidades, hasta un tope.", wikiItems: ["Tear of the Goddess", "Archangel's Staff", "Manamune", "Whispering Circlet", "Winter's Approach"] },
  { id: "quicksilver", name: "Azogue", en: "Quicksilver", exclusive: true, shared: true, kind: "active", description: "Elimina todos los efectos de control (salvo derribos).", wikiItems: ["Quicksilver Sash", "Mercurial Scimitar"] },
  { id: "spellblade", name: "Hoja encantada", en: "Spellblade", exclusive: true, shared: true, kind: "passive", description: "Tras lanzar una habilidad, el siguiente ataque básico hace daño extra al golpear.", wikiItems: ["Sheen", "Bloodsong", "Dusk and Dawn", "Essence Reaver", "Iceborn Gauntlet", "Lich Bane", "Trinity Force"], variants: [{ key: "ad", name: "Hoja encantada (AD base)", short: "AD base", description: "Daño extra según el AD base.", wikiItems: ["Sheen", "Trinity Force"] }, { key: "lich", name: "Hoja encantada (AD base + AP, bonus de velocidad de ataque)", short: "AD base + AP, bonus de velocidad de ataque", description: "Daño mágico extra (AD base + AP) y el ataque gana velocidad de ataque.", wikiItems: ["Lich Bane"] }, { key: "frost", name: "Hoja encantada (AD base, ralentización)", short: "AD base, ralentización", description: "Daño extra según el AD base y crea un campo de escarcha que ralentiza.", wikiItems: ["Iceborn Gauntlet"] }, { key: "essence", name: "Hoja encantada (AD base + probabilidad de crítico, recuperación de maná)", short: "AD base + probabilidad de crítico, recuperación de maná", description: "Daño extra según el AD base y la probabilidad de crítico; recupera maná.", wikiItems: ["Essence Reaver"] }, { key: "dusk", name: "Hoja encantada (AD base + AP, curación y doble efecto de impacto)", short: "AD base + AP, curación y doble efecto de impacto", description: "Daño mágico extra (AD base + AP), cura y aplica los efectos al impactar dos veces.", wikiItems: ["Dusk and Dawn"] }] },
  { id: "thorns", name: "Espinas", en: "Thorns", exclusive: true, shared: true, kind: "passive", description: "Daña a quien te golpea con básicos y le aplica Heridas graves si es campeón.", wikiItems: ["Bramble Vest", "Thornmail"] },
  { id: "time-stop", name: "Estasis", en: "Time Stop", exclusive: true, shared: true, kind: "active", description: "Estasis unos segundos: inatacable e invulnerable, pero sin poder actuar.", wikiItems: ["Seeker's Armguard", "Zhonya's Hourglass"] },
  { id: "ward", name: "Centinela", en: "Ward", exclusive: true, shared: true, kind: "active", description: "Cargas para colocar centinelas que se recargan al volver a base.", wikiItems: ["Runic Compass", "Bounty of Worlds", "Bloodsong", "Celestial Opposition", "Dream Maker", "Solstice Sleigh", "Zaz'Zak's Realmspike"] },
  { id: "jungle-companions", name: "Compañeros de la jungla", en: "Jungle Companions", exclusive: true, shared: true, kind: "passive", description: "Invoca una mascota que ayuda contra los monstruos de la jungla.", wikiItems: ["Gustwalker Hatchling", "Mosstomper Seedling", "Scorchclaw Pup"] },
  { id: "shared-riches", name: "Riquezas compartidas", en: "Shared Riches", exclusive: true, shared: true, kind: "passive", description: "Genera cargas que dan oro a un aliado cercano al ejecutar súbditos o dañar campeones/estructuras.", wikiItems: ["World Atlas", "Runic Compass"] },
  { id: "anguish", name: "Anguish", en: "Anguish", exclusive: false, shared: false, kind: "passive" },
  { id: "arcane-aim", name: "Arcane Aim", en: "Arcane Aim", exclusive: false, shared: false, kind: "passive" },
  { id: "bitter-cold", name: "Bitter Cold", en: "Bitter Cold", exclusive: false, shared: false, kind: "passive" },
  { id: "blackout", name: "Blackout", en: "Blackout", exclusive: false, shared: false, kind: "passive" },
  { id: "blessing-of-the-mountain", name: "Blessing of the Mountain", en: "Blessing of the Mountain", exclusive: false, shared: false, kind: "passive" },
  { id: "boarding-party", name: "Boarding Party", en: "Boarding Party", exclusive: false, shared: false, kind: "passive" },
  { id: "bolt", name: "Bolt", en: "Bolt", exclusive: false, shared: false, kind: "passive" },
  { id: "boundless-vitality", name: "Boundless Vitality", en: "Boundless Vitality", exclusive: false, shared: false, kind: "passive" },
  { id: "breaking-shockwave", name: "Breaking Shockwave", en: "Breaking Shockwave", exclusive: false, shared: false, kind: "active" },
  { id: "bring-it-down", name: "Bring It Down", en: "Bring It Down", exclusive: false, shared: false, kind: "passive" },
  { id: "bullseye", name: "Bullseye", en: "Bullseye", exclusive: false, shared: false, kind: "passive" },
  { id: "carve", name: "Carve", en: "Carve", exclusive: false, shared: false, kind: "passive" },
  { id: "cinderbloom", name: "Cinderbloom", en: "Cinderbloom", exclusive: false, shared: false, kind: "passive" },
  { id: "clawing-shadows", name: "Clawing Shadows", en: "Clawing Shadows", exclusive: false, shared: false, kind: "passive" },
  { id: "colossal-consumption", name: "Colossal Consumption", en: "Colossal Consumption", exclusive: false, shared: false, kind: "passive" },
  { id: "command", name: "Command", en: "Command", exclusive: false, shared: false, kind: "passive" },
  { id: "consonance", name: "Consonance", en: "Consonance", exclusive: false, shared: false, kind: "passive" },
  { id: "control", name: "Control", en: "Control", exclusive: false, shared: false, kind: "passive" },
  { id: "crescent", name: "Crescent", en: "Crescent", exclusive: false, shared: false, kind: "active" },
  { id: "cryocumbustion", name: "Cryocumbustion", en: "Cryocumbustion", exclusive: false, shared: false, kind: "passive" },
  { id: "death", name: "Death", en: "Death", exclusive: false, shared: false, kind: "passive" },
  { id: "desolate", name: "Desolate", en: "Desolate", exclusive: false, shared: false, kind: "passive" },
  { id: "devotion", name: "Devotion", en: "Devotion", exclusive: false, shared: false, kind: "active" },
  { id: "do-something", name: "Do Something", en: "Do Something", exclusive: false, shared: false, kind: "passive" },
  { id: "dragonforce", name: "Dragonforce", en: "Dragonforce", exclusive: false, shared: false, kind: "passive" },
  { id: "drain", name: "Drain", en: "Drain", exclusive: false, shared: false, kind: "passive" },
  { id: "dream-maker", name: "Dream Maker", en: "Dream Maker", exclusive: false, shared: false, kind: "passive" },
  { id: "echo", name: "Echo", en: "Echo", exclusive: false, shared: false, kind: "passive" },
  { id: "electroshock", name: "Electroshock", en: "Electroshock", exclusive: false, shared: false, kind: "passive" },
  { id: "electrospark", name: "Electrospark", en: "Electrospark", exclusive: false, shared: false, kind: "passive" },
  { id: "eminence", name: "Eminence", en: "Eminence", exclusive: false, shared: false, kind: "passive" },
  { id: "enduring-focus", name: "Enduring Focus", en: "Enduring Focus", exclusive: false, shared: false, kind: "passive" },
  { id: "enlighten", name: "Enlighten", en: "Enlighten", exclusive: false, shared: false, kind: "passive" },
  { id: "ever-rising-moon", name: "Ever Rising Moon", en: "Ever Rising Moon", exclusive: false, shared: false, kind: "passive" },
  { id: "everlasting", name: "Everlasting", en: "Everlasting", exclusive: false, shared: false, kind: "passive" },
  { id: "extinguish", name: "Extinguish", en: "Extinguish", exclusive: false, shared: false, kind: "passive" },
  { id: "famine", name: "Famine", en: "Famine", exclusive: false, shared: false, kind: "passive" },
  { id: "fanfare", name: "Fanfare", en: "Fanfare", exclusive: false, shared: false, kind: "passive" },
  { id: "feast", name: "Feast", en: "Feast", exclusive: false, shared: false, kind: "passive" },
  { id: "fervor", name: "Fervor", en: "Fervor", exclusive: false, shared: false, kind: "passive" },
  { id: "firmament", name: "Firmament", en: "Firmament", exclusive: false, shared: false, kind: "passive" },
  { id: "first-light", name: "First Light", en: "First Light", exclusive: false, shared: false, kind: "passive" },
  { id: "fleetfooted", name: "Fleetfooted", en: "Fleetfooted", exclusive: false, shared: false, kind: "passive" },
  { id: "flurry", name: "Flurry", en: "Flurry", exclusive: false, shared: false, kind: "passive" },
  { id: "flux", name: "Flux", en: "Flux", exclusive: false, shared: false, kind: "passive" },
  { id: "focused-will", name: "Focused Will", en: "Focused Will", exclusive: false, shared: false, kind: "passive" },
  { id: "fray", name: "Fray", en: "Fray", exclusive: false, shared: false, kind: "passive" },
  { id: "frostfire-tempest", name: "Frostfire Tempest", en: "Frostfire Tempest", exclusive: false, shared: false, kind: "passive" },
  { id: "galvanize", name: "Galvanize", en: "Galvanize", exclusive: false, shared: false, kind: "passive" },
  { id: "giant-slayer", name: "Giant Slayer", en: "Giant Slayer", exclusive: false, shared: false, kind: "passive" },
  { id: "going-sledding", name: "Going Sledding", en: "Going Sledding", exclusive: false, shared: false, kind: "passive" },
  { id: "goliath", name: "Goliath", en: "Goliath", exclusive: false, shared: false, kind: "passive" },
  { id: "hackshorn", name: "Hackshorn", en: "Hackshorn", exclusive: false, shared: false, kind: "passive" },
  { id: "hatefog", name: "Hatefog", en: "Hatefog", exclusive: false, shared: false, kind: "passive" },
  { id: "haunt", name: "Haunt", en: "Haunt", exclusive: false, shared: false, kind: "passive" },
  { id: "heretical-cleave", name: "Heretical Cleave", en: "Heretical Cleave", exclusive: false, shared: false, kind: "active" },
  { id: "hexcharged", name: "Hexcharged", en: "Hexcharged", exclusive: false, shared: false, kind: "passive" },
  { id: "humility", name: "Humility", en: "Humility", exclusive: false, shared: false, kind: "active" },
  { id: "icathian-bite", name: "Icathian Bite", en: "Icathian Bite", exclusive: false, shared: false, kind: "passive" },
  { id: "ichorshield", name: "Ichorshield", en: "Ichorshield", exclusive: false, shared: false, kind: "passive" },
  { id: "inflame", name: "Inflame", en: "Inflame", exclusive: false, shared: false, kind: "passive" },
  { id: "inspiring-speech", name: "Inspiring Speech", en: "Inspiring Speech", exclusive: false, shared: false, kind: "active" },
  { id: "intervention", name: "Intervention", en: "Intervention", exclusive: false, shared: false, kind: "active" },
  { id: "ionian-insight", name: "Ionian Insight", en: "Ionian Insight", exclusive: false, shared: false, kind: "passive" },
  { id: "juxtaposition", name: "Juxtaposition", en: "Juxtaposition", exclusive: false, shared: false, kind: "passive" },
  { id: "life-from-death", name: "Life from Death", en: "Life from Death", exclusive: false, shared: false, kind: "passive" },
  { id: "lightning-bolt", name: "Lightning Bolt", en: "Lightning Bolt", exclusive: false, shared: false, kind: "active" },
  { id: "lightshield-strike", name: "Lightshield Strike", en: "Lightshield Strike", exclusive: false, shared: false, kind: "passive" },
  { id: "madness", name: "Madness", en: "Madness", exclusive: false, shared: false, kind: "passive" },
  { id: "magebane", name: "Magebane", en: "Magebane", exclusive: false, shared: false, kind: "passive" },
  { id: "magical-opus", name: "Magical Opus", en: "Magical Opus", exclusive: false, shared: false, kind: "passive" },
  { id: "magnification", name: "Magnification", en: "Magnification", exclusive: false, shared: false, kind: "passive" },
  { id: "mana-made-real", name: "Mana Made Real", en: "Mana Made Real", exclusive: false, shared: false, kind: "passive" },
  { id: "mists-edge", name: "Mist's Edge", en: "Mist's Edge", exclusive: false, shared: false, kind: "passive" },
  { id: "night-vigil", name: "Night Vigil", en: "Night Vigil", exclusive: false, shared: false, kind: "passive" },
  { id: "nightstalker", name: "Nightstalker", en: "Nightstalker", exclusive: false, shared: false, kind: "passive" },
  { id: "now-and-forever", name: "Now And Forever", en: "Now And Forever", exclusive: false, shared: false, kind: "passive" },
  { id: "noxian-endurance", name: "Noxian Endurance", en: "Noxian Endurance", exclusive: false, shared: false, kind: "passive" },
  { id: "noxian-fervor", name: "Noxian Fervor", en: "Noxian Fervor", exclusive: false, shared: false, kind: "passive" },
  { id: "noxian-haste", name: "Noxian Haste", en: "Noxian Haste", exclusive: false, shared: false, kind: "passive" },
  { id: "noxian-persistance", name: "Noxian Persistance", en: "Noxian Persistance", exclusive: false, shared: false, kind: "passive" },
  { id: "opening-barrage", name: "Opening Barrage", en: "Opening Barrage", exclusive: false, shared: false, kind: "passive" },
  { id: "overdrive", name: "Overdrive", en: "Overdrive", exclusive: false, shared: false, kind: "passive" },
  { id: "plating", name: "Plating", en: "Plating", exclusive: false, shared: false, kind: "passive" },
  { id: "practice-makes-lethal", name: "Practice Makes Lethal", en: "Practice Makes Lethal", exclusive: false, shared: false, kind: "passive" },
  { id: "purify", name: "Purify", en: "Purify", exclusive: false, shared: false, kind: "active" },
  { id: "quicken", name: "Quicken", en: "Quicken", exclusive: false, shared: false, kind: "passive" },
  { id: "rage", name: "Rage", en: "Rage", exclusive: false, shared: false, kind: "passive" },
  { id: "rapids", name: "Rapids", en: "Rapids", exclusive: false, shared: false, kind: "passive" },
  { id: "ravenous-crescent", name: "Ravenous Crescent", en: "Ravenous Crescent", exclusive: false, shared: false, kind: "active" },
  { id: "reap", name: "Reap", en: "Reap", exclusive: false, shared: false, kind: "passive" },
  { id: "rebirth", name: "Rebirth", en: "Rebirth", exclusive: false, shared: false, kind: "passive" },
  { id: "recovery", name: "Recovery", en: "Recovery", exclusive: false, shared: false, kind: "passive" },
  { id: "resilience", name: "Resilience", en: "Resilience", exclusive: false, shared: false, kind: "passive" },
  { id: "retribution", name: "Retribution", en: "Retribution", exclusive: false, shared: false, kind: "passive" },
  { id: "revved", name: "Revved", en: "Revved", exclusive: false, shared: false, kind: "passive" },
  { id: "rimefrost", name: "Rimefrost", en: "Rimefrost", exclusive: false, shared: false, kind: "passive" },
  { id: "rock-solid", name: "Rock Solid", en: "Rock Solid", exclusive: false, shared: false, kind: "passive" },
  { id: "sabotage", name: "Sabotage", en: "Sabotage", exclusive: false, shared: false, kind: "passive" },
  { id: "sanctify", name: "Sanctify", en: "Sanctify", exclusive: false, shared: false, kind: "passive" },
  { id: "scorn", name: "Scorn", en: "Scorn", exclusive: false, shared: false, kind: "passive" },
  { id: "seething-strike", name: "Seething Strike", en: "Seething Strike", exclusive: false, shared: false, kind: "passive" },
  { id: "shadow", name: "Shadow", en: "Shadow", exclusive: false, shared: false, kind: "passive" },
  { id: "shaped-charge", name: "Shaped Charge", en: "Shaped Charge", exclusive: false, shared: false, kind: "passive" },
  { id: "sharpshooter", name: "Sharpshooter", en: "Sharpshooter", exclusive: false, shared: false, kind: "passive" },
  { id: "shield-reaver", name: "Shield Reaver", en: "Shield Reaver", exclusive: false, shared: false, kind: "passive" },
  { id: "shipwrecker", name: "Shipwrecker", en: "Shipwrecker", exclusive: false, shared: false, kind: "passive" },
  { id: "shock", name: "Shock", en: "Shock", exclusive: false, shared: false, kind: "passive" },
  { id: "skipper", name: "Skipper", en: "Skipper", exclusive: false, shared: false, kind: "passive" },
  { id: "slay", name: "Slay", en: "Slay", exclusive: false, shared: false, kind: "passive" },
  { id: "slightly-quicker", name: "Slightly Quicker", en: "Slightly Quicker", exclusive: false, shared: false, kind: "passive" },
  { id: "soul-siphon", name: "Soul Siphon", en: "Soul Siphon", exclusive: false, shared: false, kind: "passive" },
  { id: "spectral-waltz", name: "Spectral Waltz", en: "Spectral Waltz", exclusive: false, shared: false, kind: "passive" },
  { id: "spelldance", name: "Spelldance", en: "Spelldance", exclusive: false, shared: false, kind: "passive" },
  { id: "starlit-grace", name: "Starlit Grace", en: "Starlit Grace", exclusive: false, shared: false, kind: "passive" },
  { id: "steadfast", name: "Steadfast", en: "Steadfast", exclusive: false, shared: false, kind: "passive" },
  { id: "sting", name: "Sting", en: "Sting", exclusive: false, shared: false, kind: "passive" },
  { id: "suffering", name: "Suffering", en: "Suffering", exclusive: false, shared: false, kind: "passive" },
  { id: "supersonic", name: "Supersonic", en: "Supersonic", exclusive: false, shared: false, kind: "active" },
  { id: "taxes", name: "Taxes", en: "Taxes", exclusive: false, shared: false, kind: "passive" },
  { id: "the-claws-that-catch", name: "The Claws that Catch", en: "The Claws that Catch", exclusive: false, shared: false, kind: "passive" },
  { id: "timeless", name: "Timeless", en: "Timeless", exclusive: false, shared: false, kind: "passive" },
  { id: "titanic-crescent", name: "Titanic Crescent", en: "Titanic Crescent", exclusive: false, shared: false, kind: "active" },
  { id: "torment", name: "Torment", en: "Torment", exclusive: false, shared: false, kind: "passive" },
  { id: "transcendence", name: "Transcendence", en: "Transcendence", exclusive: false, shared: false, kind: "passive" },
  { id: "tyranny", name: "Tyranny", en: "Tyranny", exclusive: false, shared: false, kind: "passive" },
  { id: "undaunted", name: "Undaunted", en: "Undaunted", exclusive: false, shared: false, kind: "passive" },
  { id: "unmake", name: "Unmake", en: "Unmake", exclusive: false, shared: false, kind: "passive" },
  { id: "unsinkable", name: "Unsinkable", en: "Unsinkable", exclusive: false, shared: false, kind: "passive" },
  { id: "upgrade", name: "Upgrade", en: "Upgrade", exclusive: false, shared: false, kind: "passive" },
  { id: "vile-decay", name: "Vile Decay", en: "Vile Decay", exclusive: false, shared: false, kind: "passive" },
  { id: "voidborn-resilience", name: "Voidborn Resilience", en: "Voidborn Resilience", exclusive: false, shared: false, kind: "passive" },
  { id: "void-corruption", name: "Void Corruption", en: "Void Corruption", exclusive: false, shared: false, kind: "passive" },
  { id: "void-explosion", name: "Void Explosion", en: "Void Explosion", exclusive: false, shared: false, kind: "passive" },
  { id: "void-infusion", name: "Void Infusion", en: "Void Infusion", exclusive: false, shared: false, kind: "passive" },
  { id: "warmogs-heart", name: "Warmog's Heart", en: "Warmog's Heart", exclusive: false, shared: false, kind: "passive" },
  { id: "warmogs-vitality", name: "Warmog's Vitality", en: "Warmog's Vitality", exclusive: false, shared: false, kind: "passive" },
  { id: "winds-fury", name: "Wind's Fury", en: "Wind's Fury", exclusive: false, shared: false, kind: "passive" },
  { id: "winters-caress", name: "Winter's Caress", en: "Winter's Caress", exclusive: false, shared: false, kind: "passive" },
  { id: "wraith-step", name: "Wraith Step", en: "Wraith Step", exclusive: false, shared: false, kind: "active" },
  { id: "wrath", name: "Wrath", en: "Wrath", exclusive: false, shared: false, kind: "passive" },
  { id: "baleful-blaze", name: "Baleful Blaze", en: "Baleful Blaze", exclusive: false, shared: false, kind: "passive" },
  { id: "blackfire", name: "Blackfire", en: "Blackfire", exclusive: false, shared: false, kind: "passive" },
  { id: "hypershot", name: "Hypershot", en: "Hypershot", exclusive: false, shared: false, kind: "passive" },
  { id: "focus", name: "Focus", en: "Focus", exclusive: false, shared: false, kind: "passive" },
  { id: "ignore-pain", name: "Ignore Pain", en: "Ignore Pain", exclusive: false, shared: false, kind: "passive" },
  { id: "defy", name: "Defy", en: "Defy", exclusive: false, shared: false, kind: "passive" },
  { id: "pledge", name: "Pledge", en: "Pledge", exclusive: false, shared: false, kind: "active" },
  { id: "sacrifice", name: "Sacrifice", en: "Sacrifice", exclusive: false, shared: false, kind: "passive" },
  { id: "stormraider", name: "Stormraider", en: "Stormraider", exclusive: false, shared: false, kind: "passive" },
  { id: "squall", name: "Squall", en: "Squall", exclusive: false, shared: false, kind: "passive" },
];

const byId = new Map(NAMED_EFFECTS.map(effect => [effect.id, effect]));

/** Id base de un id guardado (`spellblade:magic` → `spellblade`). */
export const baseNamedEffectId = (id: string): string => id.split(':')[0];

/** Efecto base (también para ids de variante): exclusividad, tipo, etc. */
export const findNamedEffect = (id: string): NamedEffect | undefined => byId.get(baseNamedEffectId(id));

export const findNamedEffectVariant = (id: string): NamedEffectVariant | undefined => {
  const [base, key] = id.split(':');
  return key ? byId.get(base)?.variants?.find(variant => variant.key === key) : undefined;
};

export const namedEffectName = (id: string): string => findNamedEffectVariant(id)?.name ?? findNamedEffect(id)?.name ?? id;

export const namedEffectDescription = (id: string): string | undefined =>
  findNamedEffectVariant(id)?.description ?? findNamedEffect(id)?.description;

/** Ids elegibles de un efecto: sus variantes si las tiene, si no el propio efecto. */
export const namedEffectOptions = (effect: NamedEffect): { id: string; name: string }[] =>
  effect.variants?.length
    ? effect.variants.map(variant => ({ id: `${effect.id}:${variant.key}`, name: variant.name }))
    : [{ id: effect.id, name: effect.name }];

/** ¿El id guardado `id` cumple el filtro `wanted`? Un id base incluye todas sus variantes. */
export const namedEffectMatches = (id: string, wanted: string): boolean =>
  wanted.includes(':') ? id === wanted : baseNamedEffectId(id) === wanted;

export type NamedEffectGroup = { key: string; label: string; effects: NamedEffect[] };

/** Agrupa para selectores: Activas y luego Pasivas; dentro, compartidos (★) antes que los propios de un ítem. */
export const groupNamedEffects = (effects: NamedEffect[]): NamedEffectGroup[] => {
  const byName = (a: NamedEffect, b: NamedEffect) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  const groups: NamedEffectGroup[] = [];
  for (const kind of ['active', 'passive'] as const) {
    const title = kind === 'active' ? 'Activas' : 'Pasivas';
    const ofKind = effects.filter(effect => effect.kind === kind);
    const shared = ofKind.filter(effect => effect.shared).sort(byName);
    const own = ofKind.filter(effect => !effect.shared).sort(byName);
    if (shared.length) groups.push({ key: `${kind}-shared`, label: `${title} · compartidos (★ = solo uno por build)`, effects: shared });
    if (own.length) groups.push({ key: `${kind}-own`, label: `${title} · propios de un ítem`, effects: own });
  }
  return groups;
};

