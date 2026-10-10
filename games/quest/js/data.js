/* 생명 탐사대 — 데이터: 생물, 서식지, 파트너, 체육관
 * 원작(포켓몬스터 레드·그린)의 구조만 빌렸다. 이름·캐릭터·상징은 모두 새로 만들었다.
 * 생물은 모두 한국에서 볼 수 있는 실제 생물이다.
 */
(function (root) {
  // kind: 식물 | 동물 | 균류   role: 생산자 | 소비자 | 분해자   time: day | night | both
  // ask: 처음 만났을 때 낼 관찰 질문 — kind(어느 무리) | role(양분을 얻는 방법 = 생태계 역할) | vert(등뼈 유무, 동물만)
  //   질문 종류만 보고 답을 짐작하지 못하게, 서식지·시간 풀(학교 단지·학교 뒷산·저수지 생태공원 × 낮·밤)마다 세 종류가 모두 나오고
  //   같은 종류의 질문끼리 정답이 갈리도록 배정했다. 생물을 더하거나 바꾸면 tests/quest-logic.js로 확인한다.
  //   배열이면 차례로 낸다. 앞 질문을 맞혀야 다음 질문이 나오고, 모두 맞혀야 관찰이 완성된다.
  //   먹물버섯은 '버섯은 식물인가'를 짚는 무리 질문을 먼저 받고, 맞히면 역할 질문을 이어 받는다.
  //   푸른곰팡이는 첫 질문부터 역할 질문이다. 먹물버섯만으로는 첫 질문의 정답이 '분해자'인 생물이 없어서 둔다.
  //   (생물마다 처음 받는 질문만 보면 역할 질문의 정답이 생산자·소비자로만 갈려, 분해자를 묻지 않는 셈이었다.)
  const SPECIES = [
    // 학교 단지
    { id: 'dandelion', name: '서양민들레', kind: '식물', cls: '속씨식물 · 쌍떡잎식물', role: '생산자', ask: 'kind', time: 'both', habitat: 'campus', color: '#f2c14e',
      fact: '잎에서 빛에너지로 양분을 만든다(광합성). 씨에 달린 갓털이 바람을 타고 멀리 퍼진다. 꽃 아래 초록 조각(총포) 가운데 바깥쪽 조각이 아래로 젖혀져 있으면 대개 서양민들레, 위로 붙어 있으면 토종 민들레다.' },
    { id: 'cherrytree', name: '왕벚나무', kind: '식물', cls: '속씨식물 · 쌍떡잎식물', role: '생산자', ask: 'role', time: 'both', habitat: 'campus', color: '#f4c6d0',
      fact: '봄에 잎보다 꽃이 먼저 피고, 열매(버찌)는 초여름에 검게 익는다. 학교와 길가에 많이 심는다.' },
    { id: 'clover', name: '토끼풀', kind: '식물', cls: '속씨식물 · 쌍떡잎식물', role: '생산자', ask: 'role', time: 'both', habitat: 'campus', color: '#9bd27a',
      fact: '잔디밭에 흔한 풀이다. 잎 하나가 보통 작은잎 세 장으로 되어 있고, 작은 꽃이 공 모양으로 모여 핀다.' },
    { id: 'shaggymane', name: '먹물버섯', kind: '균류', cls: '균류 · 버섯', role: '분해자', ask: ['kind', 'role'], time: 'both', habitat: 'campus', color: '#d8d2c4',
      fact: '비 온 뒤 잔디밭에 돋는다. 버섯이지만 엽록체가 없고 몸이 균사로 되어 있는 균류다. 땅속의 죽은 식물 조각 등을 분해해 양분을 얻고, 다 자라면 갓이 검은 먹물처럼 녹아내린다.' },
    { id: 'sparrow', name: '참새', kind: '동물', cls: '척추동물 · 조류', role: '소비자', ask: 'role', time: 'day', habitat: 'campus', color: '#8d6e4c',
      fact: '곡식과 곤충을 모두 먹는 잡식성 텃새다. 새는 알을 낳고 깃털로 체온을 지킨다.' },
    { id: 'magpie', name: '까치', kind: '동물', cls: '척추동물 · 조류', role: '소비자', ask: 'vert', time: 'day', habitat: 'campus', color: '#2f3b4a',
      fact: '높은 나무나 전봇대에 나뭇가지로 큰 둥지를 짓는 잡식성 텃새다.' },
    { id: 'cabbagebutterfly', name: '배추흰나비', kind: '동물', cls: '무척추동물 · 곤충', role: '소비자', ask: 'vert', time: 'day', habitat: 'campus', color: '#e9e4c9',
      fact: '알 → 애벌레 → 번데기 → 어른벌레로 모습이 바뀐다(완전 탈바꿈). 한 개체가 자라며 모습이 바뀌는 탈바꿈은 여러 세대에 걸쳐 일어나는 “진화”와 다르다.' },
    { id: 'housebat', name: '집박쥐', kind: '동물', cls: '척추동물 · 포유류', role: '소비자', ask: 'role', time: 'night', habitat: 'campus', color: '#5b5560',
      fact: '건물 틈에 사는 작은 박쥐다. 해 질 녘부터 날며 모기 같은 작은 곤충을 잡아먹는다. 날개가 있지만 새끼를 낳아 젖을 먹이는 포유류다.' },
    { id: 'cricket', name: '왕귀뚜라미', kind: '동물', cls: '무척추동물 · 곤충', role: '소비자', ask: 'vert', time: 'night', habitat: 'campus', color: '#6b4a2b',
      fact: '가을밤 풀밭에서 수컷이 앞날개를 비벼 소리를 낸다.' },
    { id: 'toad', name: '두꺼비', kind: '동물', cls: '척추동물 · 양서류', role: '소비자', ask: 'vert', time: 'night', habitat: 'campus', color: '#a07b4f',
      fact: '주로 밤에 나와 곤충 등을 잡아먹는다. 살갗이 울퉁불퉁하고, 이른 봄에 저수지나 웅덩이로 모여 얕은 물속에 끈 모양의 알을 낳는다.' },
    // 학교 뒷산
    { id: 'mulberry', name: '뽕나무', kind: '식물', cls: '속씨식물 · 쌍떡잎식물', role: '생산자', ask: 'kind', time: 'both', habitat: 'hill', color: '#4f8a3c',
      fact: '잎은 누에의 먹이이고, 초여름에 열매(오디)가 검붉게 익는다.' },
    { id: 'pine', name: '소나무', kind: '식물', cls: '겉씨식물', role: '생산자', ask: 'role', time: 'both', habitat: 'hill', color: '#3f7d4e',
      fact: '바늘 모양 잎이 겨울에도 달려 있는 늘푸른나무다. 잎의 기공으로 이산화 탄소를 받아들인다.' },
    { id: 'turkeytail', name: '구름버섯', kind: '균류', cls: '균류 · 버섯', role: '분해자', ask: 'kind', time: 'both', habitat: 'hill', color: '#9a8f7a',
      fact: '죽은 나무줄기나 그루터기에 구름처럼 겹겹이 붙어 자라며, 죽은 나무를 분해해 양분을 얻는다.' },
    { id: 'bluemold', name: '푸른곰팡이', kind: '균류', cls: '균류 · 곰팡이', role: '분해자', ask: 'role', time: 'both', habitat: 'hill', color: '#79b0a3',
      fact: '몸이 가는 실 모양의 균사로 되어 있고, 푸른빛을 띠는 포자로 번식한다. 떨어진 열매나 낙엽 같은 죽은 생물의 몸을 분해해 양분을 얻는다. 눈에 보이지 않는 세균도 죽은 생물을 분해하는 분해자다.' },
    { id: 'joro', name: '무당거미', kind: '동물', cls: '무척추동물 · 거미류', role: '소비자', ask: 'vert', time: 'both', habitat: 'hill', color: '#e0b43a',
      fact: '숲 가장자리에 큰 그물을 친다. 다리가 8개이고 몸이 머리가슴과 배 두 부분이라 곤충이 아니다.' },
    { id: 'redsquirrel', name: '청설모', kind: '동물', cls: '척추동물 · 포유류', role: '소비자', ask: 'vert', time: 'day', habitat: 'hill', color: '#6e6259',
      fact: '나무 위에서 살며 잣·도토리 같은 나무의 씨와 열매를 먹는다. 낮에 활동한다.' },
    { id: 'jay', name: '어치', kind: '동물', cls: '척추동물 · 조류', role: '소비자', ask: 'role', time: 'day', habitat: 'hill', color: '#b08a6e',
      fact: '도토리를 땅에 묻어 저장하는 습성이 있다. 다른 새의 소리를 흉내 내기도 한다.' },
    { id: 'waterdeer', name: '고라니', kind: '동물', cls: '척추동물 · 포유류', role: '소비자', ask: 'vert', time: 'night', habitat: 'hill', color: '#b59a72',
      fact: '뿔이 없고 수컷은 송곳니가 입 밖으로 길게 나온다. 주로 해 질 녘과 밤에 풀과 잎을 먹는다.' },
    { id: 'weasel', name: '족제비', kind: '동물', cls: '척추동물 · 포유류', role: '소비자', ask: 'kind', time: 'night', habitat: 'hill', color: '#c4823f',
      fact: '몸이 가늘고 길며 주로 밤에 쥐나 개구리를 사냥한다.' },
    // 저수지 생태공원
    { id: 'waterpepper', name: '여뀌', kind: '식물', cls: '속씨식물 · 쌍떡잎식물', role: '생산자', ask: 'kind', time: 'both', habitat: 'park', color: '#c46a7a',
      fact: '물가나 축축한 땅에 자란다. 잎에 매운맛을 내는 물질이 들어 있다.' },
    { id: 'birthwort', name: '쥐방울덩굴', kind: '식물', cls: '속씨식물 · 쌍떡잎식물', role: '생산자', ask: 'role', time: 'both', habitat: 'park', color: '#6f9e4a',
      fact: '다른 물체를 감고 오르는 덩굴식물이다. 꼬리명주나비 애벌레가 주로 이 잎을 먹는다.' },
    { id: 'carp', name: '잉어', kind: '동물', cls: '척추동물 · 어류', role: '소비자', ask: 'kind', time: 'both', habitat: 'park', color: '#c9873a',
      fact: '입가에 수염이 두 쌍 있고, 아가미로 호흡한다. 물풀과 작은 동물을 두루 먹는다.' },
    { id: 'spotbill', name: '흰뺨검둥오리', kind: '동물', cls: '척추동물 · 조류', role: '소비자', ask: 'role', time: 'both', habitat: 'park', color: '#6d5b4a',
      fact: '부리 끝이 노랗다. 물에 떠서 물풀·씨앗·작은 동물을 먹으며 우리나라에 사계절 산다.' },
    { id: 'mudsnail', name: '강우렁이', kind: '동물', cls: '무척추동물 · 연체동물', role: '소비자', ask: 'vert', time: 'both', habitat: 'park', color: '#7d7a5c',
      fact: '단단한 껍데기가 있지만 등뼈는 없다. 물 바닥을 기며 돌이나 물풀 겉에 붙어 자라는 돌말 같은 작은 생물을 긁어 먹는다.' },
    { id: 'heron', name: '왜가리', kind: '동물', cls: '척추동물 · 조류', role: '소비자', ask: 'vert', time: 'day', habitat: 'park', color: '#9aa6b2',
      fact: '긴 다리와 부리로 얕은 물에서 물고기와 개구리를 잡아먹는다.' },
    { id: 'swallowtail', name: '꼬리명주나비', kind: '동물', cls: '무척추동물 · 곤충', role: '소비자', ask: 'vert', time: 'day', habitat: 'park', color: '#e8d9a8',
      fact: '뒷날개 끝에 긴 꼬리 모양 돌기가 있다. 애벌레는 쥐방울덩굴 잎을 먹고 자라, 쥐방울덩굴이 사라지면 함께 사라진다.' },
    { id: 'nightheron', name: '해오라기', kind: '동물', cls: '척추동물 · 조류', role: '소비자', ask: 'vert', time: 'night', habitat: 'park', color: '#5d6f80',
      fact: '낮에는 나무 위에서 쉬다가 해 질 녘부터 물가에서 물고기나 개구리를 잡는 백로 무리의 새다.' },
    { id: 'narrowfrog', name: '맹꽁이', kind: '동물', cls: '척추동물 · 양서류', role: '소비자', ask: 'role', time: 'night', habitat: 'park', color: '#8a9a5b', rare: true,
      fact: '장마철 밤에 물웅덩이에 모여 수컷이 운다. 개미나 파리 같은 작은 곤충을 잡아먹는다. 멸종 위기 야생생물이라 잡거나 서식지를 해치지 않는다.' },
  ];

  // 조우 칸 기호에서 서식지를 찾는다. 지도는 mapdata.js의 QuestMaps.MAPS에 둔다.
  const HABITATS = {
    campus: { name: '학교 단지', tile: ':' },
    hill: { name: '학교 뒷산', tile: ',' },
    park: { name: '저수지 생태공원', tile: ';' },
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

  root.GameData = { SPECIES, PARTNERS, GYMS, HABITATS };
  if (typeof module !== 'undefined') module.exports = root.GameData;
})(typeof window !== 'undefined' ? window : globalThis);
