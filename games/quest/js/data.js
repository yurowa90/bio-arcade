/* 생명 탐사대 — 데이터: 생물, 지도, 인물
 * 원작(포켓몬스터 레드·그린)의 구조만 빌렸다. 이름·캐릭터·상징은 모두 새로 만들었다.
 * 생물은 모두 한국에서 볼 수 있는 실제 생물이다.
 */
(function (root) {
  // kind: 식물 | 동물 | 균류   role: 생산자 | 소비자 | 분해자   time: day | night | both
  const SPECIES = [
    // 숲길
    { id: 'squirrel', name: '다람쥐', kind: '동물', cls: '척추동물 · 포유류', role: '소비자', time: 'day', habitat: 'forest', color: '#b7793f',
      fact: '볼주머니에 도토리 같은 먹이를 담아 옮기고 땅속에 저장한다. 낮에 활동한다.' },
    { id: 'sparrow', name: '참새', kind: '동물', cls: '척추동물 · 조류', role: '소비자', time: 'day', habitat: 'forest', color: '#8d6e4c',
      fact: '곡식과 곤충을 모두 먹는 잡식성 텃새다. 새는 알을 낳고 깃털로 체온을 지킨다.' },
    { id: 'cabbagebutterfly', name: '배추흰나비', kind: '동물', cls: '무척추동물 · 곤충', role: '소비자', time: 'day', habitat: 'forest', color: '#e9e4c9',
      fact: '알 → 애벌레 → 번데기 → 어른벌레로 모습이 바뀐다(완전 탈바꿈). 한 개체의 모습이 바뀌는 것은 “진화”가 아니라 “발생”이다.' },
    { id: 'dandelion', name: '민들레', kind: '식물', cls: '속씨식물 · 쌍떡잎식물', role: '생산자', time: 'day', habitat: 'forest', color: '#f2c14e',
      fact: '잎에서 빛에너지로 양분을 만든다(광합성). 씨에 달린 갓털이 바람을 타고 멀리 퍼진다.' },
    { id: 'pine', name: '소나무', kind: '식물', cls: '겉씨식물', role: '생산자', time: 'both', habitat: 'forest', color: '#3f7d4e',
      fact: '바늘 모양 잎이 겨울에도 달려 있는 늘푸른나무다. 잎의 기공으로 이산화 탄소를 받아들인다.' },
    { id: 'oyster', name: '느타리', kind: '균류', cls: '균류 · 버섯', role: '분해자', time: 'both', habitat: 'forest', color: '#b8b1a6',
      fact: '죽은 나무를 분해해 양분을 얻는다. 엽록체가 없어 광합성을 하지 못하므로 식물이 아니다.' },
    { id: 'scopsowl', name: '소쩍새', kind: '동물', cls: '척추동물 · 조류', role: '소비자', time: 'night', habitat: 'forest', color: '#7a6a58',
      fact: '밤에 “소쩍 소쩍” 하고 우는 올빼미 무리의 새다. 밤에 곤충 등을 사냥한다.' },
    { id: 'firefly', name: '애반딧불이', kind: '동물', cls: '무척추동물 · 곤충', role: '소비자', time: 'night', habitat: 'forest', color: '#d9e36a',
      fact: '배 끝의 발광 기관에서 빛을 내 짝을 찾는다. 애벌레는 물속에서 다슬기 등을 먹는다.' },
    { id: 'raccoondog', name: '너구리', kind: '동물', cls: '척추동물 · 포유류', role: '소비자', time: 'night', habitat: 'forest', color: '#6f6559',
      fact: '열매·곤충·작은 동물을 두루 먹는 잡식성이다. 주로 해 질 녘과 밤에 활동한다. (미국너구리와는 다른 동물이다.)' },
    { id: 'bat', name: '관박쥐', kind: '동물', cls: '척추동물 · 포유류', role: '소비자', time: 'night', habitat: 'forest', color: '#4f4a52',
      fact: '초음파를 내고 되돌아오는 소리로 먹이와 장애물의 위치를 안다. 날개가 있지만 새끼를 낳아 젖을 먹이는 포유류다.' },
    // 습지길
    { id: 'treefrog', name: '청개구리', kind: '동물', cls: '척추동물 · 양서류', role: '소비자', time: 'both', habitat: 'wetland', color: '#6cbf5b',
      fact: '어릴 때(올챙이)는 아가미로, 자라면 폐와 피부로 호흡한다. 발가락 끝의 흡반으로 나무에 붙는다.' },
    { id: 'heron', name: '왜가리', kind: '동물', cls: '척추동물 · 조류', role: '소비자', time: 'day', habitat: 'wetland', color: '#9aa6b2',
      fact: '긴 다리와 부리로 얕은 물에서 물고기와 개구리를 잡아먹는다.' },
    { id: 'cattail', name: '부들', kind: '식물', cls: '속씨식물 · 외떡잎식물', role: '생산자', time: 'both', habitat: 'wetland', color: '#8a6d3b',
      fact: '물가에 자라며 소시지 모양의 이삭이 달린다. 습지의 생산자로 많은 동물의 먹이와 쉼터가 된다.' },
    { id: 'divingbeetle', name: '물방개', kind: '동물', cls: '무척추동물 · 곤충', role: '소비자', time: 'both', habitat: 'wetland', color: '#3d4a3a',
      fact: '딱지날개 아래에 공기 방울을 저장해 물속에서도 호흡한다.' },
    { id: 'waterstrider', name: '소금쟁이', kind: '동물', cls: '무척추동물 · 곤충', role: '소비자', time: 'day', habitat: 'wetland', color: '#5a5048',
      fact: '다리의 잔털과 물의 표면 장력 덕분에 물 위를 걷는다.' },
    { id: 'duckweed', name: '개구리밥', kind: '식물', cls: '속씨식물 · 외떡잎식물', role: '생산자', time: 'both', habitat: 'wetland', color: '#7bc96f',
      fact: '물 위에 떠서 사는 아주 작은 식물이다. 물 위에서 빛을 받아 광합성을 한다.' },
    { id: 'otter', name: '수달', kind: '동물', cls: '척추동물 · 포유류', role: '소비자', time: 'night', habitat: 'wetland', color: '#6b4f3a',
      fact: '물갈퀴가 있어 헤엄을 잘 치고 주로 밤에 물고기를 사냥한다. 천연기념물이자 멸종 위기 야생생물이다.' },
    { id: 'blackspottedfrog', name: '참개구리', kind: '동물', cls: '척추동물 · 양서류', role: '소비자', time: 'night', habitat: 'wetland', color: '#7a9a5b',
      fact: '여름밤 논에서 수컷이 볼의 울음주머니를 부풀려 운다. 알 → 올챙이 → 개구리로 탈바꿈한다.' },
  ];

  /* 지도 기호
   * T 나무  . 길  f 꽃(장식)  , 숲 풀숲(조우)  ; 습지 풀숲(조우)  ~ 물  B 다리
   * R 지붕  H 벽  D 집 문  L 연구소 문  G 1체육관 문  J 2체육관 문  S 표지판
   * 막힌 칸: T ~ R H S 및 문(D L G J — 문은 밟으려 할 때 사건 발생)
   */
  const MAPS = {
    town: {
      name: '새싹마을', music: 'town',
      rows: [
        'TTTTTTTTT..TTTTTTTTT',
        'Tf................fT',
        'T.RRRR.......RRRRR.T',
        'T.HHHH.......HHHHH.T',
        'T.HDHH...S...HHLHH.T',
        'T..................T',
        'T..ff.........ff...T',
        'T..................T',
        'T...~~~~....ff.....T',
        'T...~~~~...........T',
        'T..................T',
        'TTTTTTTTTTTTTTTTTTTT',
      ],
      exits: [
        { x: 9, y: 0, to: 'route1', tx: 9, ty: 18 },
        { x: 10, y: 0, to: 'route1', tx: 10, ty: 18 },
      ],
      signs: { '9,4': ['새싹마을', '“작은 생명도 자세히 보면 모두 다르다.”', '북쪽: 숲길 → 잎새마을'] },
      npcs: [
        { id: 'granny', x: 6, y: 7, color: '#c96f6f', lines: ['얘야, 숲길 풀숲에서는 생물을 만날 수 있단다.', '밤에 가면 낮과 다른 생물이 나오지. 박쥐나 반딧불이 같은 녀석들 말이야.'] },
      ],
    },
    route1: {
      name: '숲길',
      rows: [
        'TTTTTTTTT..TTTTTTTTT',
        'T,,,,....,,....,,,,T',
        'T,,,,....,,....,,,,T',
        'T,,......,,......,,T',
        'T....TTT....TTT....T',
        'T,,..TTT.S..TTT..,,T',
        'T,,,..............,T',
        'T,,,,,.......,,,,,,T',
        'TTTTT,,,,..,,,,TTTTT',
        'T.....,,,..,,,.....T',
        'T.ff.....,,.....ff.T',
        'T..TTTT........TTTTT',
        'T..TTTT..,,,,..TTTTT',
        'T,,,,....,,,,....,,T',
        'T,,,,,...,,,,...,,,T',
        'T,,.............,,,T',
        'T...ff.......ff....T',
        'T..................T',
        'T..................T',
        'TTTTTTTTT..TTTTTTTTT',
      ],
      exits: [
        { x: 9, y: 0, to: 'leaftown', tx: 9, ty: 10 },
        { x: 10, y: 0, to: 'leaftown', tx: 10, ty: 10 },
        { x: 9, y: 19, to: 'town', tx: 9, ty: 1 },
        { x: 10, y: 19, to: 'town', tx: 10, ty: 1 },
      ],
      signs: { '9,5': ['숲길', '풀숲(진한 초록)에 들어가면 생물을 만날 수 있다.', '시간에 따라 만나는 생물이 달라진다.'] },
      npcs: [
        { id: 'senior', x: 3, y: 17, color: '#5b7fc9', lines: ['나는 탐사대 선배야. 도감은 “발견”이 아니라 “관찰”로 채우는 거야.', '생물을 만나면 무엇을 먹는지, 스스로 양분을 만드는지부터 살펴봐. 그게 생산자와 소비자를 가르는 기준이거든.'] },
      ],
    },
    leaftown: {
      name: '잎새마을',
      rows: [
        'TTTTTTTTTTTTTTTTTTTT',
        'T..................T',
        'T.RRRRRRR.....ff...T',
        'T.HHHHHHH..........T',
        'T.HHHGHHH..S.......T',
        'T...................',
        'T..ff..............T',
        'T.............RRR..T',
        'T.............HHH..T',
        'T.............HDH..T',
        'T..................T',
        'TTTTTTTTT..TTTTTTTTT',
      ],
      exits: [
        { x: 9, y: 11, to: 'route1', tx: 9, ty: 1 },
        { x: 10, y: 11, to: 'route1', tx: 10, ty: 1 },
        { x: 19, y: 5, to: 'route2', tx: 1, ty: 6 },
      ],
      signs: { '11,4': ['잎새마을', '광합성 체육관 — 관장: 초록', '“빛·물·이산화 탄소, 가장 모자란 것이 속도를 정한다.”'] },
      npcs: [],
    },
    route2: {
      name: '습지길',
      rows: [
        'TTTTTTTTTTTTTTTTTTTTTTTT',
        'T;;;;;..~~~~~~..;;;;;;;T',
        'T;;;;;..~~~~~~..;;;;;;;T',
        'T;;.....~~~~~~.....;;;;T',
        'T;;..;;;BBBBBB;;;......T',
        'T....;;;~~~~~~;;;..RRRRT',
        '.....;;;~~~~~~;;;..HHHHT',
        'T;;.....~~~~~~.....HHJHT',
        'T;;;;...~~~~~~...;;....T',
        'T;;;;;;.~~~~~~.;;;;;;;.T',
        'T..........S...........T',
        'TTTTTTTTTTTTTTTTTTTTTTTT',
      ],
      exits: [
        { x: 0, y: 6, to: 'leaftown', tx: 18, ty: 5 },
      ],
      signs: { '11,10': ['습지길', '동쪽: 소화 체육관 — 관장: 모아', '물가의 풀숲에서는 숲과 다른 생물이 산다.'] },
      npcs: [
        { id: 'angler', x: 3, y: 7, color: '#c9a25b', lines: ['쉿, 물고기가 도망가.', '밤이 되면 수달이 사냥하러 나온다더라. 낮에는 좀처럼 볼 수가 없어.'] },
      ],
    },
  };

  const PARTNERS = [
    { id: 'leafy', name: '잎새롱', desc: '엽록체를 닮은 초록 요정. 광합성 이야기를 좋아한다.', color: '#58b368' },
    { id: 'mito', name: '톡토리', desc: '미토콘드리아를 닮은 주황 요정. 에너지 이야기를 좋아한다.', color: '#f08a4b' },
    { id: 'spore', name: '포실이', desc: '버섯 포자를 닮은 보라 요정. 분해와 순환 이야기를 좋아한다.', color: '#9b7ad1' },
  ];

  // 교과 단원 = 체육관 (로드맵 포함)
  const GYMS = [
    { id: 'photo', name: '광합성 체육관', leader: '초록', badge: '새잎 배지', unit: '식물과 에너지 (광합성)', ready: true },
    { id: 'digest', name: '소화 체육관', leader: '모아', badge: '융털 배지', unit: '동물과 에너지 (소화·흡수)', ready: true },
    { id: 'circ', name: '순환·호흡·배설 체육관', leader: '?', badge: '?', unit: '동물과 에너지 (순환·호흡·배설)', ready: false },
    { id: 'nerve', name: '자극과 반응 체육관', leader: '?', badge: '?', unit: '자극과 반응 (신경계·호르몬·항상성)', ready: false },
    { id: 'gene', name: '생식과 유전 체육관', leader: '?', badge: '?', unit: '생식과 유전', ready: false },
    { id: 'cell', name: '세포 체육관', leader: '?', badge: '?', unit: '통합과학1 (생명 시스템·물질대사·유전 정보)', ready: false },
  ];

  root.GameData = { SPECIES, MAPS, PARTNERS, GYMS };
  if (typeof module !== 'undefined') module.exports = root.GameData;
})(typeof window !== 'undefined' ? window : globalThis);
