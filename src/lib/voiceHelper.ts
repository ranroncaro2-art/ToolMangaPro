export interface VoiceCategory {
  group: string;
  desc: string;
}

export function getSpeakerCategory(name: string): VoiceCategory {
  const nameLower = name.toLowerCase();

  // 1. Nhóm Giọng Nam Trẻ (male_young)
  if (
    nameLower.includes('にせ') || nameLower.includes('nise') ||
    nameLower.includes('澤原') || nameLower.includes('sawahara') ||
    nameLower.includes('猩々') || nameLower.includes('shojo') ||
    nameLower.includes('hinakoyuhara') ||
    nameLower.includes('m1') || nameLower.includes('m2') ||
    // Voicevox
    nameLower.includes('kotaro') || nameLower.includes('虎太郎') ||
    nameLower.includes('hanamaru') || nameLower.includes('花丸') ||
    nameLower.includes('maron') || nameLower.includes('まろん')
  ) {
    let desc = 'Thiếu niên | Giọng trẻ';
    if (nameLower.includes('にせ') || nameLower.includes('nise')) desc = 'Thiếu niên | Sáng, ngay thẳng';
    if (nameLower.includes('澤原') || nameLower.includes('sawahara')) desc = 'Thanh niên | Hơi khàn, dễ cảm xúc';
    if (nameLower.includes('猩々') || nameLower.includes('shojo')) desc = 'Thanh niên | Giọng trung, ít cảm xúc';
    if (nameLower.includes('hinakoyuhara')) desc = 'Thanh niên | Giọng hơi cứng';
    if (nameLower.includes('m1')) desc = 'Thiếu niên | Giọng trẻ, hơi cảm xúc';
    if (nameLower.includes('m2')) desc = 'Thiếu niên | Giọng hơi nghẹn ngào, cảm xúc';
    if (nameLower.includes('kotaro') || nameLower.includes('虎太郎')) desc = 'Thiếu niên | Giọng sáng, năng động (Voicevox)';
    if (nameLower.includes('hanamaru') || nameLower.includes('花丸')) desc = 'Thiếu niên | Giọng khỏe khoắn (Voicevox)';
    if (nameLower.includes('maron') || nameLower.includes('まろん')) desc = 'Cậu bé | Giọng dễ thương (Voicevox)';
    return { group: '1. Nhóm Giọng Nam Trẻ (male_young)', desc };
  }

  // 2. Nhóm Giọng Nam Trung / Trưởng Thành (male_adult)
  if (
    nameLower.includes('阿井田') || nameLower.includes('aida') ||
    nameLower.includes('1c3b33b6') || nameLower.includes('31d31e1e') ||
    nameLower.includes('4822c3b3') || nameLower.includes('52b72950') ||
    nameLower.includes('7d40796f') || nameLower.includes('ef931eb2') ||
    nameLower.includes('takehiro') || nameLower.includes('玄野') ||
    nameLower.includes('ryusei') || nameLower.includes('龍星') ||
    nameLower.includes('mesuo') || nameLower.includes('雌雄')
  ) {
    let desc = 'Trung niên | Giọng trầm';
    if (nameLower.includes('1c3b33b6')) desc = 'Trung niên | Giọng rền 1, hơi khàn, trầm thấp';
    if (nameLower.includes('31d31e1e')) desc = 'Trung niên | Giọng rền 2, sáng hơn, trầm thấp';
    if (nameLower.includes('4822c3b3')) desc = 'Trung niên | Giọng rền 3, sáng hơn, trầm thấp';
    if (nameLower.includes('52b72950')) desc = 'Trung niên | Giọng rền 4, Nhẹ nhàng';
    if (nameLower.includes('7d40796f')) desc = 'Trung niên | Giọng hơi khè';
    if (nameLower.includes('ef931eb2')) desc = 'Trung niên | Giọng rền 5, kiểu ông chủ';
    if (nameLower.includes('阿井田') || nameLower.includes('aida')) desc = 'Trung niên | Giọng hơi khàn, nhiều cảm xúc';
    if (nameLower.includes('takehiro') || nameLower.includes('玄野')) desc = 'Thanh niên | Giọng điềm đạm, trầm ấm (Voicevox)';
    if (nameLower.includes('ryusei') || nameLower.includes('龍星')) desc = 'Nam trưởng thành | Trầm ấm, lịch lãm (Voicevox)';
    if (nameLower.includes('mesuo') || nameLower.includes('雌雄')) desc = 'Nam trưởng thành | Nghiêm túc, trí thức (Voicevox)';
    return { group: '2. Nhóm Giọng Nam Trung / Trưởng Thành (male_adult)', desc };
  }

  // 3. Nhóm Giọng Nữ Trẻ (female_young)
  if (
    nameLower.includes('さつき') || nameLower.includes('satsuki') ||
    nameLower.includes('まい') || nameLower.includes('mai') ||
    nameLower.includes('るな') || nameLower.includes('luna') ||
    nameLower.includes('中2') || nameLower.includes('chu2') ||
    nameLower.includes('qinglin') ||
    nameLower.includes('凛音') || nameLower.includes('rinne') ||
    nameLower.includes('桜音') || nameLower.includes('sakura') ||
    nameLower.includes('水巻咲') || nameLower.includes('火山夢') ||
    nameLower.includes('葉土此') || nameLower.includes('t2') ||
    // Voicevox female_young
    nameLower.includes('metan') || nameLower.includes('めたん') ||
    nameLower.includes('zundamon') || nameLower.includes('ずんだ') ||
    nameLower.includes('tsumugi') || nameLower.includes('つむぎ') ||
    nameLower.includes('hau') || nameLower.includes('はう') ||
    nameLower.includes('ritsu') || nameLower.includes('リツ') ||
    nameLower.includes('himari') || nameLower.includes('ひまり') ||
    nameLower.includes('sora') || nameLower.includes('そら') ||
    nameLower.includes('mochiko') || nameLower.includes('もち子') ||
    nameLower.includes('miko') || nameLower.includes('ミコ') ||
    nameLower.includes('sayo') || nameLower.includes('小夜') ||
    nameLower.includes('nurse') || nameLower.includes('ナース') ||
    nameLower.includes('akane') || nameLower.includes('茜') ||
    nameLower.includes('aoi') || nameLower.includes('葵')
  ) {
    let desc = 'Thiếu nữ | Ngọt ngào, trong trẻo';
    if (nameLower.includes('qinglin')) desc = 'Thiếu nữ | Nữ sinh, dễ thương, biểu cảm tốt';
    if (nameLower.includes('さつき') || nameLower.includes('satsuki')) desc = 'Trẻ tuổi (20-30s) | Giọng thật, tự nhiên';
    if (nameLower.includes('まい') || nameLower.includes('mai')) desc = 'Thiếu nữ | Nữ 20-30, ấm, có cảm xúc';
    if (nameLower.includes('るな') || nameLower.includes('luna')) desc = 'Thiếu nữ | Nữ 20-30, có lực, đanh đá';
    if (nameLower.includes('中2') || nameLower.includes('chu2')) desc = 'Thiếu nữ | Nữ 15-25, giọng ngoan hiền';
    if (nameLower.includes('凛音') || nameLower.includes('rinne')) desc = 'Thiếu nữ | Nữ 20-40, hơi cứng, vai phụ';
    if (nameLower.includes('桜音') || nameLower.includes('sakura')) desc = 'Thiếu nữ | Nữ 15-25, nhẹ, hơi nhút nhát';
    if (nameLower.includes('水巻咲')) desc = 'Thiếu nữ | Giọng lạnh lùng, ít cảm xúc';
    if (nameLower.includes('火山夢')) desc = 'Thiếu nữ | Nữ 15-30, sáng, cute, cảm xúc';
    if (nameLower.includes('葉土此')) desc = 'Trẻ em (10-20 tuổi)';
    
    // Voicevox female_young
    if (nameLower.includes('metan') || nameLower.includes('めたん')) desc = 'Thiếu nữ | Điệu đà, quý phái (Voicevox)';
    if (nameLower.includes('zundamon') || nameLower.includes('ずんだ')) desc = 'Cute | Nhí nhảnh, năng động (Voicevox)';
    if (nameLower.includes('tsumugi') || nameLower.includes('つむぎ')) desc = 'Thiếu nữ | Tự nhiên, hoạt bát (Voicevox)';
    if (nameLower.includes('hau') || nameLower.includes('はう')) desc = 'Thiếu nữ | Trong trẻo, nhẹ nhàng (Voicevox)';
    if (nameLower.includes('ritsu') || nameLower.includes('リツ')) desc = 'Thiếu nữ | Giọng có lực, cá tính (Voicevox)';
    if (nameLower.includes('himari') || nameLower.includes('ひまり')) desc = 'Thiếu nữ | Rất dễ thương, ấm áp (Voicevox)';
    if (nameLower.includes('sora') || nameLower.includes('そら')) desc = 'Thiếu nữ | Giọng trong, kiểu nữ sinh (Voicevox)';
    if (nameLower.includes('mochiko') || nameLower.includes('もち子')) desc = 'Thiếu nữ | Giọng cực cute (Voicevox)';
    if (nameLower.includes('miko') || nameLower.includes('ミコ')) desc = 'Thiếu nữ | Giọng hơi máy, cute (Voicevox)';
    if (nameLower.includes('sayo') || nameLower.includes('小夜')) desc = 'Thiếu nữ | Giọng nữ tính, thanh lịch (Voicevox)';
    if (nameLower.includes('nurse') || nameLower.includes('ナース')) desc = 'Thiếu nữ | Giọng y tá robot, dễ thương (Voicevox)';
    if (nameLower.includes('akane') || nameLower.includes('茜')) desc = 'Thiếu nữ | Giọng Kansai, ngọt ngào (Voicevox)';
    if (nameLower.includes('aoi') || nameLower.includes('葵')) desc = 'Thiếu nữ | Giọng điềm đạm, trong sáng (Voicevox)';
    return { group: '3. Nhóm Giọng Nữ Trẻ (female_young)', desc };
  }

  // 4. Nhóm Giọng Nữ Trung / Trưởng Thành (female_adult)
  if (
    nameLower.includes('072a32b6') || nameLower.includes('3f090f6d') ||
    nameLower.includes('goki') || nameLower.includes('後鬼') ||
    nameLower.includes('whitecul') ||
    nameLower.includes('no.7') || nameLower.includes('no7')
  ) {
    let desc = 'Trung niên | Điềm đạm, nghiêm túc';
    if (nameLower.includes('072a32b6')) desc = 'Trung niên | Chín chắn, trầm ấm';
    if (nameLower.includes('3f090f6d')) desc = 'Trung niên | Giọng trung, ấm, có cảm xúc';
    if (nameLower.includes('goki') || nameLower.includes('後鬼')) desc = 'Nữ trưởng thành | Dày dặn, đáng tin cậy (Voicevox)';
    if (nameLower.includes('whitecul')) desc = 'Nữ trưởng thành | Lịch sự, chuyên nghiệp (Voicevox)';
    if (nameLower.includes('no.7') || nameLower.includes('no7')) desc = 'Nữ trưởng thành | Giọng cool, cá tính (Voicevox)';
    return { group: '4. Nhóm Giọng Nữ Trung / Trưởng Thành (female_adult)', desc };
  }

  // 5. Nhóm Giọng Khác (Other)
  if (
    nameLower.includes('shiki') || nameLower.includes('ちび式じい')
  ) {
    return { group: '5. Nhóm Giọng Khác (Other)', desc: 'Giọng người già | Khàn đặc biệt (Voicevox)' };
  }

  // Fallback for general hex hashes
  if (/^[0-9a-f]{8}/.test(nameLower)) {
    if (nameLower.includes('m') || nameLower.includes('male') || nameLower.includes('nam')) {
      return { group: '2. Nhóm Giọng Nam Trung / Trưởng Thành (male_adult)', desc: 'Trung niên | Trầm, dày, nghiêm nghị' };
    }
    return { group: '4. Nhóm Giọng Nữ Trung / Trưởng Thành (female_adult)', desc: 'Trung niên | Điềm đạm, sâu lắng, nghiêm túc' };
  }

  return { group: '5. Nhóm Giọng Khác (Other)', desc: 'Giọng đọc mặc định' };
}
