export interface StoryGenre {
  id: string;
  name: string;
  description: string;

  world: string;              // Mô tả thế giới
  architecture: string;       // Kiến trúc, địa điểm
  professions: string;        // Nghề nghiệp, vai trò
  clothing: string;           // Trang phục
  transportation: string;     // Phương tiện
  creatures?: string;         // Quái vật / sinh vật (nếu có)
  props: string;              // Đạo cụ
  visualMotifs?: string;      // Biểu tượng đặc trưng (đồng hồ vỡ, ma pháp...)
  avoid: string;              // Những yếu tố không được xuất hiện
  renderStyle: string;        // Phong cách hình ảnh mặc định

  // Backward compatibility fields
  mappingSpec: string;
  imageSpec: string;
  characterStyleContext: string;
  characterClothing: string;
  characterDetailFallback: string;
  exteriorStyleContext: string;
  propStyleContext: string;
}

const RAW_GENRES = [
  {
    id: 'none',
    name: 'Không áp dụng (Mặc định)',
    description: 'Giữ nguyên prompt gốc của hệ thống. Phù hợp nhất cho truyện hiện đại thông thường.',
    world: 'Modern urban world.',
    architecture: 'Apartment, office building, shopping mall, café, hospital, school, airport, convenience store, luxury villa.',
    professions: 'Office worker, student, teacher, doctor, police officer, lawyer, engineer, delivery worker.',
    clothing: 'Modern casual wear, business suit, school uniform, hoodie, jeans, sneakers.',
    transportation: 'Car, motorcycle, bus, subway, train, airplane.',
    props: 'Smartphone, laptop, television, coffee cup, documents, credit card, suitcase.',
    avoid: 'Medieval castles, fantasy armor, magic circles, swords, dragons.',
    renderStyle: 'modern present-day Japan (year 2026) realism, avoiding retro Shouwa-era appearance, grounded Japanese TV drama realism'
  },
  {
    id: 'modern',
    name: 'Hiện đại (Modern)',
    description: 'Bối cảnh đô thị, cuộc sống đương đại và công nghệ ngày nay.',
    world: 'Modern urban world.',
    architecture: 'Apartment, office building, shopping mall, café, hospital, school, airport, convenience store, luxury villa.',
    professions: 'Office worker, student, teacher, doctor, police officer, lawyer, engineer, delivery worker.',
    clothing: 'Modern casual wear, business suit, school uniform, hoodie, jeans, sneakers.',
    transportation: 'Car, motorcycle, bus, subway, train, airplane.',
    props: 'Smartphone, laptop, television, coffee cup, documents, credit card, suitcase.',
    avoid: 'Medieval castles, fantasy armor, magic circles, swords, dragons.',
    renderStyle: 'modern present-day Japan (year 2026) realism, avoiding retro Shouwa-era appearance, grounded Japanese TV drama realism'
  },
  {
    id: 'isekai_action',
    name: 'Dị thế giới mạo hiểm (Action Isekai)',
    description: 'Thế giới giả tưởng, hội mạo hiểm giả, đi hầm ngục, chiến đấu quái vật, hệ thống RPG.',
    world: 'Japanese medieval fantasy RPG world.',
    architecture: 'Stone castle, guild hall, dungeon, medieval village, blacksmith, inn, fortress, marketplace.',
    professions: 'Adventurer, swordsman, knight, mage, priest, alchemist, merchant, hunter.',
    clothing: 'Leather armor, steel armor, travel cloak, wizard robe, fantasy noble clothing.',
    transportation: 'Horse, carriage, wagon.',
    creatures: 'Goblin, slime, wolf, orc, skeleton, wyvern, dragon.',
    props: 'Sword, shield, spear, bow, magic staff, potion, mana crystal, quest board, torch.',
    avoid: 'Cars, smartphones, guns, skyscrapers, modern electronics.',
    renderStyle: 'semi-realistic anime character design, Japanese light novel illustration, modern colored anime painting, expressive anime face, refined facial anatomy, natural body proportions, detailed realistic hair strands, soft digital painting, subtle skin shading, highly detailed eyes, realistic fabric folds, weathered leather and steel armor textures, elegant fantasy costume design, professional anime artwork, masterpiece quality'
  },
  {
    id: 'royal_fantasy',
    name: 'Hoàng gia giả tưởng (Royal Fantasy)',
    description: 'Truyện hoàng gia cung điện châu Âu cổ kính, công chúa, quý tộc, dạ hội lãng mạn.',
    world: 'European royal fantasy kingdom.',
    architecture: 'Royal palace, ballroom, noble mansion, castle, cathedral, palace garden, throne room.',
    professions: 'Princess, prince, king, queen, duke, duchess, knight commander, maid, butler.',
    clothing: 'Elegant royal dresses, noble suits, military uniforms, crowns, jewelry.',
    transportation: 'Royal carriage, horse.',
    props: 'Royal seal, crown, necklace, letter, tea set, chandelier, throne.',
    avoid: 'Guilds, RPG status screens, futuristic technology.',
    renderStyle: 'fantasy royal medieval European palace setting, elegant aristocratic realism'
  },
  {
    id: 'reincarnation',
    name: 'Trùng sinh (Reincarnation)',
    description: 'Quay lại quá khứ, biết trước tương lai, thay đổi số phận.',
    world: 'Emphasizes memories of a previous life and changing fate.',
    architecture: 'Current world architecture mixed with symbolic flashback locations.',
    professions: 'Young appearance with mature mentality, strategic thinking, knowledge of future events.',
    clothing: 'Modern fashionable casual wear or timeline-specific clothing.',
    transportation: 'Car, train, pedestrian street.',
    props: 'Old diary, watch, photograph, letter, symbolic object from previous life.',
    visualMotifs: 'Broken clock, falling memories, light fragments, contrasting past and present.',
    avoid: 'Fantasy armor, magic wands, dragons.',
    renderStyle: 'modern present-day Japan (year 2026) realism, avoiding retro Shouwa-era appearance, grounded TV drama realism, contrasting past and present highlights'
  },
  {
    id: 'historical_china',
    name: 'Cổ trang Trung Quốc (Historical China)',
    description: 'Hoàng cung phương Đông cổ xưa, phủ đệ phong kiến Trung Hoa.',
    world: 'Ancient Chinese imperial dynasty.',
    architecture: 'Imperial palace, courtyard, pavilion, lotus pond, temple, noble residence.',
    professions: 'Emperor, empress, prince, concubine, minister, general, imperial physician.',
    clothing: 'Hanfu, dragon robe, silk dress, jade accessories.',
    transportation: 'Horse carriage, sedan chair.',
    props: 'Scroll, jade pendant, fan, tea set, ancient sword, seal.',
    avoid: 'Modern furniture, electricity, firearms.',
    renderStyle: 'ancient Eastern imperial dynasty setting, traditional Eastern historical realism'
  },
  {
    id: 'edo',
    name: 'Thời Edo (Samurai / Edo Period)',
    description: 'Nhật Bản cổ đại thời Edo, võ sĩ đạo.',
    world: 'Japan during the Edo period.',
    architecture: 'Wooden houses, dojo, shrine, castle town, tea house.',
    professions: 'Samurai, ronin, ninja, geisha, merchant, monk.',
    clothing: 'Kimono, hakama, yukata, waraji sandals.',
    transportation: 'Horse, wooden cart, boat.',
    props: 'Katana, wakizashi, paper umbrella, lantern, tea ceremony tools.',
    avoid: 'Modern buildings, western clothing, vehicles.',
    renderStyle: 'historical Edo period Japan setting, traditional Samurai/Geisha realism'
  },
  {
    id: 'murim',
    name: 'Võ lâm (Murim / Wuxia)',
    description: 'Thế giới võ hiệp, môn phái, võ học Trung Hoa cổ đại.',
    world: 'Ancient martial arts world.',
    architecture: 'Mountain sect, martial arts academy, bamboo forest, inn, temple.',
    professions: 'Martial artist, sect leader, disciple, assassin, physician.',
    clothing: 'Traditional martial robes, belts, cloaks.',
    transportation: 'Horse.',
    props: 'Sword, spear, guqin, wine jar, martial manual, jade token.',
    avoid: 'Modern technology, fantasy monsters.',
    renderStyle: 'traditional ancient Eastern martial arts sect setting, wuxia epic realism'
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk (Viễn tưởng công nghệ)',
    description: 'Thế giới tương lai công nghệ cao, thành phố neon dystopian.',
    world: 'High-tech futuristic megacity.',
    architecture: 'Neon skyscrapers, underground market, cyber laboratories.',
    professions: 'Hacker, mercenary, android engineer, bounty hunter.',
    clothing: 'Cyber jackets, tactical suits, augmented implants.',
    transportation: 'Flying cars, hoverbikes.',
    props: 'Holograms, cyber implants, drones, plasma weapons.',
    avoid: 'Medieval castles, horses, fantasy magic.',
    renderStyle: 'cyberpunk high-tech dystopian futuristic megacity style, neon lights'
  },
  {
    id: 'post_apocalypse',
    name: 'Hậu tận thế (Post Apocalypse)',
    description: 'Thế giới suy tàn sau thảm họa toàn cầu.',
    world: 'Ruined civilization after a global disaster.',
    architecture: 'Destroyed cities, abandoned factories, underground shelters.',
    professions: 'Survivor, scavenger, soldier, medic.',
    clothing: 'Dirty jackets, tactical gear, backpacks, gas masks.',
    transportation: 'Modified trucks, motorcycles.',
    props: 'Flashlight, rifle, canned food, generator, radio.',
    avoid: 'Luxury modern life, fantasy magic.',
    renderStyle: 'gritty ruined post-apocalyptic environment design, decayed survival realism'
  },
  {
    id: 'detective_mystery',
    name: 'Trinh thám / Bí ẩn (Detective / Mystery)',
    description: 'Điều tra phá án, hiện trường tội phạm, phá giải bí ẩn.',
    world: 'Modern investigative setting.',
    architecture: 'Police station, crime scene, courtroom, apartment.',
    professions: 'Detective, police officer, prosecutor, forensic expert.',
    clothing: 'Suit, trench coat, police uniform.',
    transportation: 'Police car.',
    props: 'Evidence bag, fingerprint kit, notebook, handgun, camera.',
    avoid: 'Fantasy elements unless explicitly stated.',
    renderStyle: 'noir detective investigative mood, dramatic shadow contrast'
  },
  {
    id: 'school_life',
    name: 'Học đường (School Life)',
    description: 'Cuộc sống học sinh, trường học Nhật Bản.',
    world: 'Modern Japanese school.',
    architecture: 'Classroom, hallway, rooftop, gymnasium, library, school gate.',
    professions: 'Student, teacher, principal.',
    clothing: 'Japanese school uniform, sportswear.',
    transportation: 'Bicycle, train.',
    props: 'School bag, notebook, lunch box, chalkboard.',
    avoid: 'Fantasy armor, medieval architecture.',
    renderStyle: 'bright cheerful Japanese school life anime style, warm daylight'
  },
  {
    id: 'slice_of_life_fantasy',
    name: 'Điền viên giả tưởng (Slice of Life Fantasy)',
    description: 'Cuộc sống bình yên ở vùng nông thôn giả tưởng.',
    world: 'Peaceful fantasy countryside.',
    architecture: 'Wooden cottage, bakery, farm, village, flower garden.',
    professions: 'Farmer, innkeeper, baker, herbalist.',
    clothing: 'Simple fantasy clothing, apron, travel clothes.',
    transportation: 'Horse, wagon.',
    props: 'Bread, herbs, baskets, cooking utensils, fireplace.',
    avoid: 'War, dark fantasy atmosphere, modern technology.',
    renderStyle: 'peaceful warm fantasy countryside illustration, soft watercolor-like lighting'
  },
  {
    id: 'dark_fantasy',
    name: 'Cực tối giả tưởng (Dark Fantasy)',
    description: 'Thế giới ma thuật hắc ám, nguyền rủa, quái dị.',
    world: 'A cursed medieval fantasy realm.',
    architecture: 'Ruined castles, abandoned churches, cursed forests, underground catacombs.',
    professions: 'Dark knight, necromancer, inquisitor, witch hunter.',
    clothing: 'Dark armor, hooded cloaks, worn leather.',
    transportation: 'Horse.',
    creatures: 'Undead, demons, vampires, monsters.',
    props: 'Dark magic books, cursed swords, ritual candles, skulls.',
    avoid: 'Bright colorful fantasy, modern technology.',
    renderStyle: 'ominous atmospheric dark fantasy, high contrast shadow, gothic illustration'
  },
  {
    id: 'scifi_space',
    name: 'Hàng vũ trụ (Sci-Fi Space)',
    description: 'Văn minh liên tinh hà, du hành vũ trụ.',
    world: 'Interstellar civilization.',
    architecture: 'Space station, futuristic city, research facility, spaceship.',
    professions: 'Pilot, scientist, space marine, engineer.',
    clothing: 'Space suits, futuristic uniforms.',
    transportation: 'Spaceship, shuttle.',
    props: 'Laser weapons, holographic screens, robots.',
    avoid: 'Medieval architecture, fantasy magic.',
    renderStyle: 'interstellar sci-fi spacescape realism, clean high-tech metals'
  }
];

export const DEFAULT_GENRES: StoryGenre[] = RAW_GENRES.map(raw => {
  const mappingSpec = raw.id === 'none' ? '' : `[THỂ LOẠI: ${raw.name.toUpperCase()}]
- Bối cảnh/Thế giới: ${raw.world}
- Kiến trúc, địa điểm đặc trưng: ${raw.architecture}
- Nhân vật & Nghề nghiệp/Tâm lý: ${raw.professions}
- Trang phục: ${raw.clothing}
- Phương tiện: ${raw.transportation}${'creatures' in raw ? `\n- Sinh vật/Quái vật: ${(raw as any).creatures}` : ''}
- Đạo cụ tiêu biểu: ${raw.props}${'visualMotifs' in raw ? `\n- Biểu tượng đặc trưng: ${(raw as any).visualMotifs}` : ''}
- KHÔNG ĐƯỢC XUẤT HIỆN: ${raw.avoid}`;

  const imageSpec = raw.id === 'none' ? '' : `[THỂ LOẠI: ${raw.name.toUpperCase()}]
- Phong cách hình ảnh mặc định: ${raw.renderStyle}
- Trang phục: ${raw.clothing}
- Bối cảnh kiến trúc: ${raw.architecture}
- Đạo cụ: ${raw.props}${'creatures' in raw ? `\n- Sinh vật/Quái vật: ${(raw as any).creatures}` : ''}${'visualMotifs' in raw ? `\n- Biểu tượng đặc trưng: ${(raw as any).visualMotifs}` : ''}
- Tuyệt đối TRÁNH xuất hiện: ${raw.avoid}`;

  const characterStyleContext = raw.renderStyle;
  const characterClothing = raw.clothing;
  const characterDetailFallback = raw.id === 'none' ? 'Japanese individual' : (raw.professions.split(',')[0].trim().toLowerCase() + ' character');
  const exteriorStyleContext = raw.architecture;
  const propStyleContext = raw.props;

  return {
    ...raw,
    mappingSpec,
    imageSpec,
    characterStyleContext,
    characterClothing,
    characterDetailFallback,
    exteriorStyleContext,
    propStyleContext
  };
});

export function getGenreById(id: string | undefined): StoryGenre {
  const normalizedId = id === 'historical' ? 'historical_china' : (id || 'none');
  return DEFAULT_GENRES.find(g => g.id === normalizedId) || DEFAULT_GENRES[0];
}

export function formatGenreKnowledgeBase(genre: StoryGenre): string {
  if (genre.id === 'none') return '';
  let kb = `\n\n[WORLD SPECIFICATION & KNOWLEDGE BASE: ${genre.name.toUpperCase()}]`;
  if (genre.world) kb += `\n- World: ${genre.world}`;
  if (genre.architecture) kb += `\n- Typical Architecture: ${genre.architecture}`;
  if (genre.professions) kb += `\n- Typical Professions: ${genre.professions}`;
  if (genre.clothing) kb += `\n- Typical Clothing: ${genre.clothing}`;
  if (genre.creatures) kb += `\n- Typical Creatures/Monsters: ${genre.creatures}`;
  if (genre.props) kb += `\n- Typical Props: ${genre.props}`;
  if (genre.transportation) kb += `\n- Typical Transportation: ${genre.transportation}`;
  if (genre.visualMotifs) kb += `\n- Typical Visual Motifs: ${genre.visualMotifs}`;
  if (genre.avoid) kb += `\n- Avoid Elements: ${genre.avoid}`;
  return kb;
}
