import { getDisplayName } from '../store/useProjectStore';

export interface RoleSpec {
  role: string;
  appearance: string;
  clothing: string;
  accessories: string;
  posture: string;
  emotion: string;
}

export interface ExteriorSpec {
  category: string;
  elements: string;
  lighting: string;
  atmosphere: string;
}

export interface PropSpec {
  category: string;
  materials: string;
  details: string;
}

export const ROLE_LIBRARY: RoleSpec[] = [
  {
    role: 'Queen',
    appearance: 'beautiful queen, graceful posture, gentle yet dignified expression, elegant royal presence',
    clothing: 'exquisite silk gown with gold embroidery, luxurious royal dress',
    accessories: 'diamond tiara, pearl earrings, necklace, white ceremonial gloves',
    posture: 'standing gracefully, composed posture',
    emotion: 'calm, serene, dignified'
  },
  {
    role: 'Princess',
    appearance: 'young beautiful princess, delicate facial features, elegant hair, graceful demeanor',
    clothing: 'lovely pastel-colored silk dress with lace and ruffles, flowing gown',
    accessories: 'silver tiara, delicate necklace, floral hairpin',
    posture: 'standing-gently, hands clasped together in front',
    emotion: 'gentle, polite, smiling'
  },
  {
    role: 'King',
    appearance: 'mature king, strong physical build, bearded, dignified face, majestic presence',
    clothing: 'heavy royal robes with fur trim, gold-embroidered tunic, royal mantle',
    accessories: 'golden crown, royal scepter, large signet ring',
    posture: 'standing tall, authoritative posture',
    emotion: 'stern, wise, commanding'
  },
  {
    role: 'Prince',
    appearance: 'handsome young prince, athletic build, confident look, noble posture',
    clothing: 'decorated military royal doublet, formal noble trousers, leather boots',
    accessories: 'golden circlet, ceremonial sword at the waist',
    posture: 'standing upright, confident stance',
    emotion: 'confident, heroic, determined'
  },
  {
    role: 'Knight / Guard',
    appearance: 'strong physical build, alert eyes, disciplined posture, battle-ready demeanor',
    clothing: 'steel plate armor or chainmail over leather tunic, iron greaves',
    accessories: 'longsword, steel shield, knight helmet, emblem cloak',
    posture: 'alert standing stance, hand on sword hilt',
    emotion: 'focused, brave, vigilant'
  },
  {
    role: 'Mage / Wizard / Sorcerer',
    appearance: 'mysterious individual, sharp wise eyes, mystical aura',
    clothing: 'flowing wizard robes, embroidered hood, travel cloak',
    accessories: 'magic staff, glowing mana crystal amulet, leather spellbook pouch',
    posture: 'standing, holding staff or preparing a spell',
    emotion: 'mysterious, wise, calculating'
  },
  {
    role: 'Priest / Priestess / Cleric',
    appearance: 'serene individual, gentle look, peaceful holy presence',
    clothing: 'clean white and blue ceremonial robes, simple belt',
    accessories: 'holy staff, cross or sacred emblem necklace',
    posture: 'standing, hands clasping holy symbol or staff',
    emotion: 'compassionate, serene, peaceful'
  },
  {
    role: 'Merchant',
    appearance: 'friendly face, expressive eyes, calculating yet welcoming demeanor',
    clothing: 'durable travel coat, linen shirt, leather boots',
    accessories: 'leather satchel, ledger book, key ring, pouch of coins',
    posture: 'standing, gesturing warmly or holding ledger',
    emotion: 'welcoming, friendly, alert'
  },
  {
    role: 'Maid',
    appearance: 'neat appearance, polite eyes, humble posture, clean look',
    clothing: 'maid uniform dress, white apron, hair headband',
    accessories: 'feather duster or serving tray, simple pocket watch',
    posture: 'polite standing posture, hands folded in front',
    emotion: 'polite, helpful, reserved'
  },
  {
    role: 'Butler',
    appearance: 'refined older gentleman, combed hair, impeccable posture',
    clothing: 'formal black tuxedo suit, white shirt, bowtie',
    accessories: 'white gloves, silver pocket watch on chain',
    posture: 'impeccable upright standing posture, hands behind back',
    emotion: 'formal, composed, professional'
  },
  {
    role: 'Assassin / Thief / Rogue',
    appearance: 'slender agile figure, masked face, sharp calculating eyes',
    clothing: 'dark leather stealth gear, hooded cloak, fingerless gloves',
    accessories: 'daggers in sheaths, throw knives, lockpick set',
    posture: 'crouched or alert stealthy stance',
    emotion: 'focused, stealthy, calculating'
  },
  {
    role: 'Peasant / Villager / Farmer',
    appearance: 'weathered skin, simple look, humble posture, down-to-earth presence',
    clothing: 'simple worn linen tunic, patched trousers, leather boots',
    accessories: 'wooden basket, simple tools, woven hat',
    posture: 'natural standing posture',
    emotion: 'humble, hard-working, simple'
  }
];

export const EXTERIOR_LIBRARY: ExteriorSpec[] = [
  {
    category: 'Tavern / Inn / Pub / Bar',
    elements: 'wooden tables and benches, quest board with parchment sheets, counter bar with wooden stools, barrels of ale, warm stone fireplace',
    lighting: 'warm torchlight, flickering candlelight, glowing fireplace embers',
    atmosphere: 'rustic, lively, cozy and warm'
  },
  {
    category: 'Throne Room / Castle Hall / Palace Room',
    elements: 'grand stone arches, majestic throne on a raised platform, high stained-glass windows, crimson banners, crystal chandeliers',
    lighting: 'volumetric sun rays filtering through high windows, grand chandeliers',
    atmosphere: 'regal, dignified, majestic and formal'
  },
  {
    category: 'Dungeon / Catacomb / Cave / Prison',
    elements: 'rough stone walls, mossy stones, iron gates, chains on the wall, dark damp corners, iron torch holders',
    lighting: 'dim torchlight, cold shadows, dramatic high contrast shadows',
    atmosphere: 'ominous, eerie, dark and mysterious'
  },
  {
    category: 'Alley / Street / Marketplace',
    elements: 'stone-paved road, timber-framed houses, street lanterns, market stalls with goods, wooden crates and barrels',
    lighting: 'natural sunlight or soft lanterns at night, casting long shadows',
    atmosphere: 'lively, atmospheric, detailed lived-in environment'
  },
  {
    category: 'Forest / Woodland / Nature',
    elements: 'ancient towering trees, thick exposed roots, mossy terrain, natural vegetation, wild flowers, dirt path',
    lighting: 'dappled sunlight filtering through leaves, volumetric forest rays',
    atmosphere: 'serene, mystical, natural and immersive'
  },
  {
    category: 'Bedroom / Private Room / Cottage Interior',
    elements: 'simple wooden bed with straw mattress, small desk, single candle, wooden chest, wool blanket, small window',
    lighting: 'soft candlelight, moonlight from the window, gentle ambient glow',
    atmosphere: 'peaceful, quiet, simple and personal'
  }
];

export const PROP_LIBRARY: PropSpec[] = [
  {
    category: 'Weapon / Sword / Spear / Bow',
    materials: 'forged weathered steel, polished blade, leather wrapped grip, metallic parts',
    details: 'hilt with guard, engraved runes or engravings on the blade, leather scabbard'
  },
  {
    category: 'Shield',
    materials: 'reinforced wood, forged iron rim, leather holding straps',
    details: 'painted crest or symbol on the front, weathered surface with minor scratches'
  },
  {
    category: 'Potion / Vial / Bottle',
    materials: 'clear glass container, glowing colored liquid inside, wooden cork stopper',
    details: 'wrapped in a leather strap, detailed cork texture, magical bubble effects'
  },
  {
    category: 'Book / Scroll / Spellbook',
    materials: 'leather-bound book, parchment pages, aged paper texture',
    details: 'mystical symbols or runes embossed on the cover, silk ribbon page marker'
  },
  {
    category: 'Jewelry / Key / Amulet / Ring',
    materials: 'gold or silver chain, polished metal, glowing gem or mana crystal',
    details: 'intricate filigree work, glowing magical aura, engraved runes'
  },
  {
    category: 'Chest / Container / Tool / Backpack',
    materials: 'weathered wood planks, brass rivets, iron padlocks, leather straps',
    details: 'handcrafted details, worn corners, rustic locks and handles'
  }
];

export function getRoleSpecificPrompt(id: string, genre: any): { appearance: string; clothing: string; accessories: string; posture: string; emotion: string } {
  const normId = id.toLowerCase();
  
  const match = ROLE_LIBRARY.find(r => {
    const roles = r.role.toLowerCase().split('/').map(x => x.trim());
    return roles.some(role => {
      // Avoid partial matching that causes false positives (like 'maid' matching 'mermaid')
      const regex = new RegExp(`\\b${role}\\b`);
      return regex.test(normId) || normId.includes(role);
    });
  });

  if (match) {
    return {
      appearance: match.appearance,
      clothing: match.clothing,
      accessories: match.accessories,
      posture: match.posture,
      emotion: match.emotion
    };
  }

  // Fallback to genre professions/clothing
  const firstProfession = (genre.professions || 'adventurer').split(',')[0].trim().toLowerCase();
  return {
    appearance: `${firstProfession} character, natural body proportions`,
    clothing: genre.clothing || 'simple travel clothing',
    accessories: (genre.props || 'simple items').split(',')[0].trim() || 'basic accessories',
    posture: 'natural standing posture',
    emotion: 'neutral facial expression'
  };
}

export function getExteriorSpecificPrompt(id: string, genre: any): { elements: string; lighting: string; atmosphere: string } {
  const normId = id.toLowerCase();

  const match = EXTERIOR_LIBRARY.find(e => {
    const categories = e.category.toLowerCase().split('/').map(x => x.trim());
    return categories.some(cat => {
      const regex = new RegExp(`\\b${cat}\\b`);
      return regex.test(normId) || normId.includes(cat);
    });
  });

  if (match) {
    return {
      elements: match.elements,
      lighting: match.lighting,
      atmosphere: match.atmosphere
    };
  }

  // Fallback to genre architecture
  return {
    elements: genre.architecture || 'wooden structures, stone walls',
    lighting: 'natural ambient lighting, realistic shadows',
    atmosphere: 'atmospheric, detailed environment'
  };
}

export function getPropSpecificPrompt(id: string, genre: any): { materials: string; details: string } {
  const normId = id.toLowerCase();

  const match = PROP_LIBRARY.find(p => {
    const categories = p.category.toLowerCase().split('/').map(x => x.trim());
    return categories.some(cat => {
      const regex = new RegExp(`\\b${cat}\\b`);
      return regex.test(normId) || normId.includes(cat);
    });
  });

  if (match) {
    return {
      materials: match.materials,
      details: match.details
    };
  }

  // Fallback to genre props
  const firstProp = (genre.props || 'equipment').split(',')[0].trim();
  return {
    materials: `handcrafted fantasy materials, realistic textures`,
    details: `matching the look of a ${firstProp}, consistent design`
  };
}

export function formatRoleLibrary(): string {
  let text = `\n\n[ROLE REFERENCE LIBRARY (CHARACTER SHEET COMPOSITION DICTIONARY)]
Use this library as a guideline to compose specific character sheets based on their role:`;
  ROLE_LIBRARY.forEach(spec => {
    text += `\n- Role: ${spec.role}
  + Typical Appearance: ${spec.appearance}
  + Typical Clothing: ${spec.clothing}
  + Typical Accessories: ${spec.accessories}
  + Typical Posture: ${spec.posture}
  + Typical Emotion: ${spec.emotion}`;
  });
  return text;
}

export function formatExteriorLibrary(): string {
  let text = `\n\n[LOCATION REFERENCE LIBRARY (ENVIRONMENT SHEET DICTIONARY)]
Use this library as a guideline to compose environment descriptions based on location categories:`;
  EXTERIOR_LIBRARY.forEach(spec => {
    text += `\n- Category: ${spec.category}
  + Typical Elements: ${spec.elements}
  + Typical Lighting: ${spec.lighting}
  + Typical Atmosphere: ${spec.atmosphere}`;
  });
  return text;
}

export function formatPropLibrary(): string {
  let text = `\n\n[PROP REFERENCE LIBRARY (PRODUCT SHEET DICTIONARY)]
Use this library as a guideline to compose prop descriptions based on prop categories:`;
  PROP_LIBRARY.forEach(spec => {
    text += `\n- Category: ${spec.category}
  + Typical Materials: ${spec.materials}
  + Typical Details: ${spec.details}`;
  });
  return text;
}
