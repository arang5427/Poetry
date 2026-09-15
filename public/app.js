/**
 * 시원(詩苑) - 한국 서정시 창작소 통합 애플리케이션 로직 (public/app.js)
 * 
 * [주요 기능]
 * 1. 구글 유튜브 기반 분위기별 보컬 없는 연주곡(BGM) 자동 재생 & 음량/영상 컨트롤
 * 2. 시 낭송 맞춤 성우 시스템: 성별(여/남) × 연령대(20대/40대/60대)
 * 3. [신규] 시 분위기 맞춤 Google TTS 감성 파라미터(Pitch, Rate, Pause) 실시간 자동 조절
 * 4. 낭송 시 오디오 더킹(Audio Ducking) 및 행간/연간 서정적 호흡 지연(Pause) 엔진 탑재
 * 5. 보안 백엔드(.env) & GitHub Pages 정적 배포 완전 지원
 */

// =========================================================
// 1. 상태 및 상수 정의
// =========================================================
const APP_VERSION = 'Ver-5';
const CLIENT_STORAGE_KEY = 'gemini_poet_client_api_key';

const state = {
  // 백엔드 & API 상태
  isBackendOnline: false,
  hasServerKey: false,
  clientKey: localStorage.getItem(CLIENT_STORAGE_KEY) || '',
  selectedModel: 'gemini-3.8-flash',
  selectedMood: 'yoon_dongju',
  selectedVoiceName: 'Iapetus',
  currentPoem: null,
  isGenerating: false,

  // 유튜브 BGM 상태
  ytPlayer: null,
  isYtApiReady: false,
  isBgmPlaying: false,
  bgmVolume: 35,
  currentBgmVideoId: '',
  currentBgmIndex: 0,
  failedBgmVideoIds: new Set(),
  autoRecoverCount: 0,

  // 성우 낭송 및 감성 튜닝 상태
  voiceGender: 'male',
  voiceAge: 20,
  autoMoodTts: true,
  isSpeaking: false,
  originalBgmVolBeforeDucking: 35,

  // 빗소리
  isRainPlaying: false
};

// =========================================================
// [핵심] Google TTS 30가지 음성 (voice_name) 정의 및 파라미터 튜닝
// =========================================================
const GOOGLE_TTS_VOICES = {
  Zephyr: {
    name: 'Zephyr',
    label: 'Zephyr -- Bright (화사하고 밝음)',
    gender: 'female',
    age: 20,
    trait: 'Bright',
    traitKo: '화사하고 밝은 음색',
    pitchOffset: 0.08,
    rateOffset: 0.04,
    linePauseMs: 550,
    stanzaPauseMs: 1000,
    style: '화사하고 맑게 울리는 밝은 음색',
    pauseDesc: '1.0초 (산뜻한 호흡)'
  },
  Puck: {
    name: 'Puck',
    label: 'Puck -- 경쾌함 (재치 있는 리듬)',
    gender: 'male',
    age: 20,
    trait: 'Brisk',
    traitKo: '발랄하고 경쾌한 낭독',
    pitchOffset: 0.06,
    rateOffset: 0.07,
    linePauseMs: 500,
    stanzaPauseMs: 950,
    style: '통통 튀는 경쾌하고 재치 있는 리듬',
    pauseDesc: '0.95초 (경쾌한 템포)'
  },
  Charon: {
    name: 'Charon',
    label: 'Charon -- 유용한 정보를 제공함 (차분한 전달력)',
    gender: 'male',
    age: 40,
    trait: 'Informative',
    traitKo: '차분하고 또박또박한 전달력',
    pitchOffset: -0.05,
    rateOffset: -0.02,
    linePauseMs: 650,
    stanzaPauseMs: 1200,
    style: '또박또박하고 차분한 신뢰감의 서술',
    pauseDesc: '1.2초 (안정적 호흡)'
  },
  Kore: {
    name: 'Kore',
    label: 'Kore -- Firm (단호하고 결연한 절제미)',
    gender: 'female',
    age: 40,
    trait: 'Firm',
    traitKo: '절제되고 단호한 어조',
    pitchOffset: -0.03,
    rateOffset: -0.04,
    linePauseMs: 700,
    stanzaPauseMs: 1300,
    style: '흔들림 없이 절제되고 결연한 낭독',
    pauseDesc: '1.3초 (결연한 여운)'
  },
  Fenrir: {
    name: 'Fenrir',
    label: 'Fenrir -- Excitable (벅찬 감정과 격정적 고조)',
    gender: 'male',
    age: 20,
    trait: 'Excitable',
    traitKo: '벅찬 감정과 격정적 호흡',
    pitchOffset: 0.05,
    rateOffset: 0.06,
    linePauseMs: 520,
    stanzaPauseMs: 1000,
    style: '가슴 벅찬 감정과 역동적인 고조',
    pauseDesc: '1.0초 (고조된 호흡)'
  },
  Leda: {
    name: 'Leda',
    label: 'Leda -- Youthful (풋풋하고 순수한 젊은 호흡)',
    gender: 'female',
    age: 20,
    trait: 'Youthful',
    traitKo: '티 없이 맑은 젊은 호흡',
    pitchOffset: 0.10,
    rateOffset: 0.04,
    linePauseMs: 530,
    stanzaPauseMs: 980,
    style: '티 없이 맑고 풋풋한 젊은 서정',
    pauseDesc: '1.0초 (순수한 호흡)'
  },
  Orus: {
    name: 'Orus',
    label: 'Orus -- Firm (묵직한 저음과 단단한 의지)',
    gender: 'male',
    age: 60,
    trait: 'Firm',
    traitKo: '묵직하고 굵은 단호함',
    pitchOffset: -0.09,
    rateOffset: -0.05,
    linePauseMs: 750,
    stanzaPauseMs: 1400,
    style: '묵직한 저음과 단단한 의지의 낭독',
    pauseDesc: '1.4초 (묵직한 여운)'
  },
  Aoede: {
    name: 'Aoede',
    label: 'Aoede -- Breezy (산들바람처럼 은은한 서정)',
    gender: 'female',
    age: 20,
    trait: 'Breezy',
    traitKo: '가볍고 은은한 바람의 서정',
    pitchOffset: 0.04,
    rateOffset: 0.02,
    linePauseMs: 600,
    stanzaPauseMs: 1100,
    style: '바람처럼 가볍고 은은하게 스치는 서정',
    pauseDesc: '1.1초 (부드러운 미풍)'
  },
  Callirrhoe: {
    name: 'Callirrhoe',
    label: 'Callirrhoe -- 느긋함 (유연하고 편안한 긴 호흡)',
    gender: 'female',
    age: 40,
    trait: 'Easygoing',
    traitKo: '느긋하고 편안한 여유',
    pitchOffset: -0.03,
    rateOffset: -0.08,
    linePauseMs: 800,
    stanzaPauseMs: 1500,
    style: '세월을 관조하듯 느긋하고 편안한 호흡',
    pauseDesc: '1.5초 (느긋한 여운)'
  },
  Autonoe: {
    name: 'Autonoe',
    label: 'Autonoe -- 밝음 (햇살처럼 환하고 맑음)',
    gender: 'female',
    age: 20,
    trait: 'Bright',
    traitKo: '햇살처럼 환하고 맑음',
    pitchOffset: 0.07,
    rateOffset: 0.03,
    linePauseMs: 540,
    stanzaPauseMs: 1020,
    style: '햇살이 깃든 듯 환하고 따스한 음색',
    pauseDesc: '1.0초 (환한 호흡)'
  },
  Enceladus: {
    name: 'Enceladus',
    label: '엔셀라두스 (Enceladus) -- 숨소리 (귓가의 밀어와 속삭임)',
    gender: 'female',
    age: 40,
    trait: 'Breathy',
    traitKo: '귓가의 숨결과 은밀한 밀어',
    pitchOffset: -0.04,
    rateOffset: -0.09,
    linePauseMs: 850,
    stanzaPauseMs: 1600,
    style: '귓가에 나직이 속삭이는 내밀한 숨결',
    pauseDesc: '1.6초 (내밀한 숨결)'
  },
  Iapetus: {
    name: 'Iapetus',
    label: 'Iapetus -- Clear (티 없이 맑고 선명함)',
    gender: 'male',
    age: 20,
    trait: 'Clear',
    traitKo: '선명하고 티 없는 청명함',
    pitchOffset: 0.02,
    rateOffset: -0.02,
    linePauseMs: 650,
    stanzaPauseMs: 1250,
    style: '티 없이 맑고 청명한 성찰의 낭독',
    pauseDesc: '1.25초 (투명한 여운)'
  },
  Umbriel: {
    name: 'Umbriel',
    label: 'Umbriel -- 느긋함 (고요한 밤의 심연과 그윽함)',
    gender: 'male',
    age: 40,
    trait: 'Relaxed',
    traitKo: '고요한 밤의 그윽한 사색',
    pitchOffset: -0.06,
    rateOffset: -0.08,
    linePauseMs: 800,
    stanzaPauseMs: 1500,
    style: '고요한 밤의 심연을 거니는 그윽한 호흡',
    pauseDesc: '1.5초 (그윽한 침묵)'
  },
  Algieba: {
    name: 'Algieba',
    label: 'Algieba -- Smooth (비단결처럼 부드러움)',
    gender: 'male',
    age: 40,
    trait: 'Smooth',
    traitKo: '매끄럽고 유려한 감성',
    pitchOffset: 0.01,
    rateOffset: -0.03,
    linePauseMs: 620,
    stanzaPauseMs: 1150,
    style: '비단결처럼 매끄럽고 유려한 낭송',
    pauseDesc: '1.15초 (매끄러운 흐름)'
  },
  Despina: {
    name: 'Despina',
    label: 'Despina -- Smooth (나직하고 감미로운 선율)',
    gender: 'female',
    age: 40,
    trait: 'Smooth',
    traitKo: '나직하고 감미로운 선율',
    pitchOffset: 0.03,
    rateOffset: -0.03,
    linePauseMs: 650,
    stanzaPauseMs: 1200,
    style: '가슴을 적시는 감미롭고 부드러운 톤',
    pauseDesc: '1.2초 (감미로운 여운)'
  },
  Erinome: {
    name: 'Erinome',
    label: 'Erinome -- 맑음 (청아한 이슬 울림)',
    gender: 'female',
    age: 20,
    trait: 'Clear',
    traitKo: '청아한 이슬 같은 맑음',
    pitchOffset: 0.06,
    rateOffset: 0.00,
    linePauseMs: 600,
    stanzaPauseMs: 1100,
    style: '아침 이슬처럼 맑고 영롱한 청아함',
    pauseDesc: '1.1초 (맑은 울림)'
  },
  Algenib: {
    name: 'Algenib',
    label: 'Algenib -- 자갈 (거친 자갈밭 같은 민초의 질감)',
    gender: 'male',
    age: 60,
    trait: 'Gravelly',
    traitKo: '삶의 무게가 실린 거친 질감',
    pitchOffset: -0.09,
    rateOffset: -0.06,
    linePauseMs: 780,
    stanzaPauseMs: 1450,
    style: '거친 자갈밭을 딛고 선 민초의 질감',
    pauseDesc: '1.45초 (투박한 쉼)'
  },
  Rasalgethi: {
    name: 'Rasalgethi',
    label: 'Rasalgethi -- 유용한 정보를 전달함 (명료한 사유의 낭독)',
    gender: 'male',
    age: 40,
    trait: 'Informative',
    traitKo: '사유를 정돈하는 명료함',
    pitchOffset: -0.03,
    rateOffset: -0.01,
    linePauseMs: 630,
    stanzaPauseMs: 1180,
    style: '사유의 결을 명료하게 짚어주는 낭독',
    pauseDesc: '1.2초 (명료한 호흡)'
  },
  Laomedeia: {
    name: 'Laomedeia',
    label: 'Laomedeia -- 경쾌함 (청량한 리듬과 템포)',
    gender: 'female',
    age: 20,
    trait: 'Brisk',
    traitKo: '산뜻하고 경쾌한 리듬',
    pitchOffset: 0.05,
    rateOffset: 0.06,
    linePauseMs: 510,
    stanzaPauseMs: 960,
    style: '발걸음 가볍게 건네는 산뜻한 리듬',
    pauseDesc: '0.95초 (산뜻한 리듬)'
  },
  Achernar: {
    name: 'Achernar',
    label: 'Achernar -- Soft (포근하고 애잔한 여운)',
    gender: 'female',
    age: 40,
    trait: 'Soft',
    traitKo: '포근하고 애절한 부드러움',
    pitchOffset: -0.03,
    rateOffset: -0.05,
    linePauseMs: 720,
    stanzaPauseMs: 1350,
    style: '솜털처럼 포근하고 애잔한 여운',
    pauseDesc: '1.35초 (포근한 여운)'
  },
  Alnilam: {
    name: 'Alnilam',
    label: 'Alnilam -- Firm (굳센 신념과 꿋꿋한 기백)',
    gender: 'male',
    age: 40,
    trait: 'Firm',
    traitKo: '굳센 신념과 기백',
    pitchOffset: -0.07,
    rateOffset: -0.03,
    linePauseMs: 700,
    stanzaPauseMs: 1300,
    style: '칼날 같은 신념과 굳건한 기백',
    pauseDesc: '1.3초 (굳건한 호흡)'
  },
  Schedar: {
    name: 'Schedar',
    label: 'Schedar -- Even (잔잔하고 평온한 균형미)',
    gender: 'female',
    age: 40,
    trait: 'Even',
    traitKo: '담담하고 평온한 균형',
    pitchOffset: 0.00,
    rateOffset: 0.00,
    linePauseMs: 640,
    stanzaPauseMs: 1200,
    style: '파도 없이 잔잔하고 평온한 낭독',
    pauseDesc: '1.2초 (평온한 쉼)'
  },
  Gacrux: {
    name: 'Gacrux',
    label: 'Gacrux -- 성인용 (삶의 연륜이 묻어나는 중후함)',
    gender: 'male',
    age: 60,
    trait: 'Mature',
    traitKo: '삶의 연륜이 묻어나는 중후함',
    pitchOffset: -0.10,
    rateOffset: -0.07,
    linePauseMs: 820,
    stanzaPauseMs: 1550,
    style: '깊은 연륜과 원초적 미학의 중후함',
    pauseDesc: '1.55초 (중후한 여운)'
  },
  Pulcherrima: {
    name: 'Pulcherrima',
    label: 'Pulcherrima -- 앞으로 (당당하게 뻗어나가는 진취성)',
    gender: 'female',
    age: 40,
    trait: 'Forward',
    traitKo: '앞으로 뻗어 나가는 울림',
    pitchOffset: 0.03,
    rateOffset: 0.03,
    linePauseMs: 580,
    stanzaPauseMs: 1080,
    style: '새벽을 열듯 당당하게 울려 퍼지는 진취성',
    pauseDesc: '1.1초 (진취적 호흡)'
  },
  Achird: {
    name: 'Achird',
    label: 'Achird -- 친근함 (오랜 벗처럼 다정한 말투)',
    gender: 'male',
    age: 40,
    trait: 'Friendly',
    traitKo: '오랜 벗 같은 다정함',
    pitchOffset: 0.01,
    rateOffset: -0.01,
    linePauseMs: 620,
    stanzaPauseMs: 1150,
    style: '곁에 앉아 도란도란 들려주는 친근함',
    pauseDesc: '1.15초 (친근한 쉼)'
  },
  Zubenelgenubi: {
    name: 'Zubenelgenubi',
    label: 'Zubenelgenubi -- 캐주얼 (자연스러운 일상의 어조)',
    gender: 'female',
    age: 20,
    trait: 'Casual',
    traitKo: '격식 없는 편안한 어조',
    pitchOffset: 0.02,
    rateOffset: 0.02,
    linePauseMs: 590,
    stanzaPauseMs: 1100,
    style: '일상의 숨결처럼 자연스럽고 편안한 말투',
    pauseDesc: '1.1초 (자연스러운 호흡)'
  },
  Vindemiatrix: {
    name: 'Vindemiatrix',
    label: 'Vindemiatrix -- 온화함 (감싸 안아주는 자애로움)',
    gender: 'female',
    age: 40,
    trait: 'Gentle',
    traitKo: '감싸 안아주는 자애로운 온화함',
    pitchOffset: -0.02,
    rateOffset: -0.06,
    linePauseMs: 780,
    stanzaPauseMs: 1450,
    style: '상처를 어루만지듯 감싸 안는 자애로움',
    pauseDesc: '1.45초 (온화한 온기)'
  },
  Sadachbia: {
    name: 'Sadachbia',
    label: 'Sadachbia -- 활기참 (생동감 넘치는 에너지)',
    gender: 'female',
    age: 20,
    trait: 'Lively',
    traitKo: '생명력 넘치는 활기',
    pitchOffset: 0.08,
    rateOffset: 0.07,
    linePauseMs: 500,
    stanzaPauseMs: 950,
    style: '파릇파릇 돋아나는 생명력과 활기',
    pauseDesc: '0.95초 (활기찬 템포)'
  },
  Sadaltager: {
    name: 'Sadaltager',
    label: 'Sadaltager -- 지식이 풍부함 (철학적 깊이와 지적 무게)',
    gender: 'male',
    age: 60,
    trait: 'Knowledgeable',
    traitKo: '철학적 깊이와 지적 무게',
    pitchOffset: -0.07,
    rateOffset: -0.05,
    linePauseMs: 760,
    stanzaPauseMs: 1400,
    style: '존재의 심연을 응시하는 지적 사유의 울림',
    pauseDesc: '1.4초 (깊은 사유)'
  },
  Sulafat: {
    name: 'Sulafat',
    label: 'Sulafat -- 따뜻함 (마음을 덥혀주는 포근한 온기)',
    gender: 'female',
    age: 40,
    trait: 'Warm',
    traitKo: '가슴을 덥혀주는 포근한 온기',
    pitchOffset: -0.01,
    rateOffset: -0.05,
    linePauseMs: 750,
    stanzaPauseMs: 1400,
    style: '겨울밤 군불처럼 가슴을 덥혀주는 따스함',
    pauseDesc: '1.4초 (따스한 온기)'
  }
};

// =========================================================
// [핵심] 한국 대표 시인 33인 문학 데이터베이스 & Google TTS 매칭
// =========================================================
const POET_DATABASE = {
  // 1. 한국 고전 서정의 명시인 (10인)
  yoon_dongju: {
    name: '윤동주',
    work: '하늘과 바람과 별과 시',
    desc: '순결한 자아 성찰과 참회의 정신, 부끄러움 없는 삶을 향한 고요한 밤과 별빛의 시선, 맑고 단정한 어조',
    recommendedVoice: 'Iapetus',
    recommendedGender: 'male',
    recommendedAge: 20,
    bgmKey: 'contemplative'
  },
  kim_sowol: {
    name: '김소월',
    work: '진달래꽃',
    desc: '전통 민조적 7·5조 율격과 한(恨), 이별의 애틋한 슬픔과 아련한 그리움, 애절하고 서정적인 가락',
    recommendedVoice: 'Achernar',
    recommendedGender: 'female',
    recommendedAge: 40,
    bgmKey: 'nostalgic'
  },
  na_taeju: {
    name: '나태주',
    work: '풀꽃',
    desc: '소박하고 친근한 일상의 언어, 풀꽃처럼 작고 여린 생명을 향한 다정한 온기와 순수한 사랑',
    recommendedVoice: 'Sulafat',
    recommendedGender: 'female',
    recommendedAge: 40,
    bgmKey: 'romantic'
  },
  park_mokwol: {
    name: '박목월',
    work: '나그네',
    desc: '향토적 서정과 자연의 소박한 정취, 담백하고 절제된 여운, 구름에 달 가듯 유유자적한 발걸음',
    recommendedVoice: 'Algieba',
    recommendedGender: 'male',
    recommendedAge: 40,
    bgmKey: 'nature'
  },
  jung_hoseung: {
    name: '정호승',
    work: '사랑하다가 죽어버려라',
    desc: '상처 입은 영혼을 감싸 안는 따스한 인간애와 연민, 눈물 속에서 피어나는 사랑과 실존적 위로',
    recommendedVoice: 'Vindemiatrix',
    recommendedGender: 'female',
    recommendedAge: 40,
    bgmKey: 'comfort'
  },
  kim_chunsoo: {
    name: '김춘수',
    work: '꽃',
    desc: '존재의 본질과 사물의 명명을 탐구하는 순수 관념시학, 감각적이면서도 철학적인 인식의 시선',
    recommendedVoice: 'Sadaltager',
    recommendedGender: 'male',
    recommendedAge: 60,
    bgmKey: 'contemplative'
  },
  seo_jeongju: {
    name: '서정주',
    work: '무서운 시간 / 자화상',
    desc: '원초적 생명력과 토속적 미학, 무속적·동양적 상상력과 원숙하고 중후한 한국어의 조탁',
    recommendedVoice: 'Gacrux',
    recommendedGender: 'male',
    recommendedAge: 60,
    bgmKey: 'nostalgic'
  },
  shin_kyeongrim: {
    name: '신경림',
    work: '갈대',
    desc: '민초들의 삶의 애환과 연대, 갈대처럼 흔들리면서도 서로를 의지하며 함께 우는 따스한 공동체적 서정',
    recommendedVoice: 'Charon',
    recommendedGender: 'male',
    recommendedAge: 40,
    bgmKey: 'contemplative'
  },
  hwang_donggyu: {
    name: '황동규',
    work: '사랑의 전당 / 즐거운 편지',
    desc: '지적인 사유와 절제된 감정의 기다림, 편지를 쓰듯 건네는 깊이 있는 사랑과 존재의 성찰',
    recommendedVoice: 'Schedar',
    recommendedGender: 'female',
    recommendedAge: 40,
    bgmKey: 'contemplative'
  },
  ahn_dohyun: {
    name: '안도현',
    work: '연탄 한 장',
    desc: '연탄 한 장처럼 자신을 태워 세상을 덥히는 헌신, 다정하고 진솔한 일상 사물에 깃든 감동',
    recommendedVoice: 'Achird',
    recommendedGender: 'male',
    recommendedAge: 40,
    bgmKey: 'nature'
  },

  // 2. 사유와 시대의 깊은 울림 (12인)
  ko_un: {
    name: '고은',
    work: '만인보',
    desc: '역사와 인간 군상의 거친 생명력, 대지의 흙냄새와 민중의 숨결을 품어내는 웅혼하고 파노라마적인 필치',
    recommendedVoice: 'Algenib',
    recommendedGender: 'male',
    recommendedAge: 60,
    bgmKey: 'contemplative'
  },
  yi_sang: {
    name: '이상',
    work: '오감도',
    desc: '전위적 모더니즘과 파격적 실험성, 초현실적 불안과 자아 분열의 심연을 응시하는 날카로운 지성',
    recommendedVoice: 'Fenrir',
    recommendedGender: 'male',
    recommendedAge: 20,
    bgmKey: 'modern'
  },
  han_kang: {
    name: '한강',
    work: '서랍에 저녁을 넣어 두었다',
    desc: '서늘하고 투명한 고통의 심연, 상처 입은 내면과 침묵의 빛을 촛불처럼 밝히는 정밀하고 섬세한 문장',
    recommendedVoice: 'Enceladus',
    recommendedGender: 'female',
    recommendedAge: 40,
    bgmKey: 'contemplative'
  },
  hwang_jiwoo: {
    name: '황지우',
    work: '새들도 세상을 뜨는구나',
    desc: '해체적 풍자와 시대의 억압을 뚫고 솟구치는 파격, 비장함과 절규 속에서 피어나는 자유의 외침',
    recommendedVoice: 'Pulcherrima',
    recommendedGender: 'female',
    recommendedAge: 40,
    bgmKey: 'modern'
  },
  kim_hoon: {
    name: '김훈',
    work: '칼의 노래',
    desc: '불필요한 수사를 걷어낸 서늘하고 단단한 문체, 사물의 물성과 삶의 고독, 명료한 비장미',
    recommendedVoice: 'Orus',
    recommendedGender: 'male',
    recommendedAge: 60,
    bgmKey: 'comfort'
  },
  lee_munjae: {
    name: '이문재',
    work: '지금 여기가 맨 앞',
    desc: '생태적 사유와 공동체적 성찰, 잃어버린 마음의 길을 되찾는 따스하고 담담한 사색',
    recommendedVoice: 'Rasalgethi',
    recommendedGender: 'male',
    recommendedAge: 40,
    bgmKey: 'contemplative'
  },
  yoo_anjin: {
    name: '유안진',
    work: '지란지교를 꿈꾸며',
    desc: '지란지교처럼 맑고 그윽한 영혼의 교감, 품격 있고 단아한 문체로 빚어내는 삶의 온기',
    recommendedVoice: 'Callirrhoe',
    recommendedGender: 'female',
    recommendedAge: 40,
    bgmKey: 'nostalgic'
  },
  choi_seungho: {
    name: '최승호',
    work: '대설주의보',
    desc: '현대 도시 문명의 황폐함과 생태적 위기를 꿰뚫는 서늘하고 단호한 언어, 존재의 허무를 응시하는 눈길',
    recommendedVoice: 'Kore',
    recommendedGender: 'female',
    recommendedAge: 40,
    bgmKey: 'modern'
  },
  shin_dalja: {
    name: '신달자',
    work: '열애',
    desc: '뜨겁고 솔직한 사랑과 고백, 여인의 생애와 고통을 온몸으로 긍정하는 원숙하고 정열적인 어조',
    recommendedVoice: 'Despina',
    recommendedGender: 'female',
    recommendedAge: 40,
    bgmKey: 'nostalgic'
  },
  kim_kyungju: {
    name: '김경주',
    work: '나는 이 세상에 없는 계절이다',
    desc: '세상에 없는 계절을 방랑하는 유목민의 시선, 폭발적인 감각과 환상, 낯설고 매혹적인 언어의 유희',
    recommendedVoice: 'Aoede',
    recommendedGender: 'female',
    recommendedAge: 20,
    bgmKey: 'modern'
  },
  kim_haeja: {
    name: '김해자',
    work: '무기여 잘 있거라',
    desc: '노동과 삶터의 땀방울이 밴 솔직한 숨결, 억척스럽고 꿋꿋하게 삶을 밀고 나가는 민초의 진정성',
    recommendedVoice: 'Alnilam',
    recommendedGender: 'male',
    recommendedAge: 40,
    bgmKey: 'contemplative'
  },
  jo_jeonghwan: {
    name: '조정환',
    work: '사유와 실존의 시학',
    desc: '시대의 모순과 실존을 꿰뚫는 철학적 사유, 깊은 사색과 저항의 언어로 빚어낸 지적 울림',
    recommendedVoice: 'Sadaltager',
    recommendedGender: 'male',
    recommendedAge: 60,
    bgmKey: 'contemplative'
  },

  // 3. 현대 문학과 독창적 일상 감성 (6인)
  park_joon: {
    name: '박준',
    work: '당신의 이름을 지어다가 며칠은 먹었다',
    desc: '쓸쓸한 골목길과 일상의 슬픔, 곁에 머물러 울어주는 다정하고 나직한 문장, 서늘한 미열의 서정',
    recommendedVoice: 'Umbriel',
    recommendedGender: 'male',
    recommendedAge: 40,
    bgmKey: 'comfort'
  },
  kang_hwagil: {
    name: '강화길',
    work: '내밀한 심리 서정',
    desc: '내밀한 불안과 심리적 긴장, 서늘한 고백을 통해 드러나는 여성적 서사와 상처의 결',
    recommendedVoice: 'Enceladus',
    recommendedGender: 'female',
    recommendedAge: 40,
    bgmKey: 'modern'
  },
  moon_boyoung: {
    name: '문보영',
    work: '책기둥',
    desc: '일기체와 상상력의 경계를 넘나드는 유쾌하고 발랄한 언어, 동시대 일상의 독창적 변주',
    recommendedVoice: 'Puck',
    recommendedGender: 'male',
    recommendedAge: 20,
    bgmKey: 'modern'
  },
  choi_jeonghwa: {
    name: '최정화',
    work: '모던한 감각과 도시의 시선',
    desc: '도시의 건조하고 낯선 풍경, 쿨하면서도 서늘하게 파고드는 모던한 감각과 이미지',
    recommendedVoice: 'Zubenelgenubi',
    recommendedGender: 'female',
    recommendedAge: 20,
    bgmKey: 'modern'
  },
  kim_minjung: {
    name: '김민정',
    work: '날씨와 생활',
    desc: '거침없고 솔직한 날것의 어조, 일상의 비루함과 위선을 유쾌하게 전복시키는 리드미컬한 파격',
    recommendedVoice: 'Laomedeia',
    recommendedGender: 'female',
    recommendedAge: 20,
    bgmKey: 'modern'
  },
  kim_yideum: {
    name: '김이듬',
    work: '히스테리아',
    desc: '도발적이고 거침없는 상상력, 억압을 찢고 나오는 생생한 에너지와 전복적 언어의 축제',
    recommendedVoice: 'Sadachbia',
    recommendedGender: 'female',
    recommendedAge: 20,
    bgmKey: 'modern'
  },

  // 4. 동시대 청년 신진 시인 (5인)
  hwang_inchan: {
    name: '황인찬',
    work: '기쁜 이와 함께 나를 나눌 것',
    desc: '군더더기 없는 절제와 투명한 여백, 평범한 일상의 찰나에서 길어 올리는 섬세하고 아름다운 서정',
    recommendedVoice: 'Zephyr',
    recommendedGender: 'female',
    recommendedAge: 20,
    bgmKey: 'romantic'
  },
  yang_anda: {
    name: '양안다',
    work: '빛과 매듭',
    desc: '빛과 어둠, 매듭과 기억이 얽히는 몽환적이고 환상적인 이미지의 미학, 부드러운 환각',
    recommendedVoice: 'Erinome',
    recommendedGender: 'female',
    recommendedAge: 20,
    bgmKey: 'romantic'
  },
  yook_hosoo: {
    name: '육호수',
    work: '나는 나비와 날고',
    desc: '동화적 순수함과 유년의 투명한 환상, 나비처럼 가볍고 맑게 날아오르는 서정적 호흡',
    recommendedVoice: 'Leda',
    recommendedGender: 'female',
    recommendedAge: 20,
    bgmKey: 'romantic'
  },
  kim_bona: {
    name: '김보나',
    work: '김근종',
    desc: '동시대 청년의 감각과 현실을 꾸밈없이 응시하는 솔직하고 담백한 어조, 신선한 시적 호흡',
    recommendedVoice: 'Autonoe',
    recommendedGender: 'female',
    recommendedAge: 20,
    bgmKey: 'romantic'
  },
  kang_woogeun: {
    name: '강우근',
    work: '개미 한마리를 실수로 밟을 뻔한 날',
    desc: '작고 여린 미물도 다치지 않기를 바라는 여리고 다정한 생명 존중, 무해하고 따스한 시선',
    recommendedVoice: 'Achird',
    recommendedGender: 'male',
    recommendedAge: 40,
    bgmKey: 'nature'
  },

  // 구버전 호환용 5개 정서 앨리어스
  nostalgic: { name: '김소월', work: '진달래꽃', desc: '아련한 그리움과 민조적 한', recommendedVoice: 'Achernar', recommendedGender: 'female', recommendedAge: 40, bgmKey: 'nostalgic' },
  contemplative: { name: '윤동주', work: '하늘과 바람과 별과 시', desc: '순결한 자아 성찰과 별빛', recommendedVoice: 'Iapetus', recommendedGender: 'male', recommendedAge: 20, bgmKey: 'contemplative' },
  nature: { name: '박목월', work: '나그네', desc: '담백한 자연과 고향의 정취', recommendedVoice: 'Algieba', recommendedGender: 'male', recommendedAge: 40, bgmKey: 'nature' },
  comfort: { name: '정호승', work: '사랑하다가 죽어버려라', desc: '상처를 어루만지는 따스한 위로', recommendedVoice: 'Vindemiatrix', recommendedGender: 'female', recommendedAge: 40, bgmKey: 'comfort' },
  romantic: { name: '나태주', work: '풀꽃', desc: '소박하고 다정한 풀꽃의 위로', recommendedVoice: 'Sulafat', recommendedGender: 'female', recommendedAge: 40, bgmKey: 'romantic' }
};

// 분위기별 유튜브 BGM 후보 플레이리스트 (보컬 없는 고품질 서정 연주곡 다중 후보군)
const MOOD_BGM_PLAYLISTS = {
  contemplative: [
    { videoId: 'IV8LO-T66ys', title: '별빛 밤의 고요한 사색 (서정 피아노)', desc: '순결한 자아 성찰과 깊은 사유의 피아노 선율' },
    { videoId: '1E0942rV2i4', title: '고요한 밤의 독백 (피아노 & 첼로)', desc: '차분하게 가라앉는 사색과 성찰의 울림' },
    { videoId: 'vV_yUe4WqN0', title: '달빛과 침묵의 호수 (앰비언트 클래식)', desc: '투명하고 청명한 밤하늘의 서정' },
    { videoId: 'n61ULEU7SU0', title: '새벽 별빛을 따라서 (서정 피아노 솔로)', desc: '맑고 단정한 내면의 고백' }
  ],
  nostalgic: [
    { videoId: 'r13T2c0bK2Q', title: '한국 전통 서정 선율 (가야금 & 대금 인스트루멘탈)', desc: '아련한 그리움과 애틋한 한' },
    { videoId: 'b4-nQ4P5yW4', title: '옛 기억의 언덕길 (가야금 서정곡)', desc: '가슴 한구석을 울리는 옛이야기 선율' },
    { videoId: 'd9O9u28P9wE', title: '고향의 봄과 저녁노을 (해금 & 피아노)', desc: '아득하고 따스한 유년의 기억' },
    { videoId: 'gL3xI3p9XjM', title: '바람이 머무는 숲 (국악 퓨전 힐링)', desc: '시린 마음을 어루만지는 전통 가락' }
  ],
  nature: [
    { videoId: 'd9O9u28P9wE', title: '청산(靑山)의 바람과 자연 선율 (국악 힐링)', desc: '담백한 자연과 고향 길의 정취' },
    { videoId: 'WPni755-Krg', title: '솔바람 부는 언덕 (어쿠스틱 & 피아노)', desc: '맑은 숲속의 산뜻하고 청량한 바람' },
    { videoId: '5qap5aO4i9A', title: '들꽃 피는 오솔길 (어쿠스틱 기타)', desc: '흙냄새와 풀내음 가득한 시골길' },
    { videoId: 'n61ULEU7SU0', title: '새벽 이슬 머금은 숲 (자연 앰비언트 & 피아노)', desc: '아침 햇살에 반짝이는 나뭇잎의 숨결' }
  ],
  comfort: [
    { videoId: '1E0942rV2i4', title: '따스한 위로의 선율 (피아노 & 첼로)', desc: '상처를 어루만지는 온기와 위로' },
    { videoId: '7NOSDKb0HlU', title: '지친 하루 끝에 건네는 온기 (포근한 피아노)', desc: '수고한 당신을 말없이 안아주는 멜로디' },
    { videoId: 'IV8LO-T66ys', title: '다시 일어서는 용기 (희망의 서정 듀엣)', desc: '눈물 속에서 다시 피어나는 잔잔한 위안' },
    { videoId: 'r13T2c0bK2Q', title: '마음의 쉼터 (따뜻한 연주곡)', desc: '모든 짐을 내려놓고 쉬어가는 평온함' }
  ],
  romantic: [
    { videoId: '5qap5aO4i9A', title: '봄날의 설렘 (따스한 어쿠스틱 기타 선율)', desc: '풋풋한 첫사랑과 풀꽃의 다정함' },
    { videoId: '7NOSDKb0HlU', title: '너를 향한 설레는 발걸음 (경쾌한 피아노)', desc: '햇살처럼 반짝이는 청춘의 사랑' },
    { videoId: 'WPni755-Krg', title: '달콤한 봄바람의 고백 (어쿠스틱 듀엣)', desc: '부드럽고 감미로운 서정의 멜로디' },
    { videoId: 'IV8LO-T66ys', title: '영원한 별빛의 약속 (로맨틱 클래식)', desc: '은은하게 울려 퍼지는 사랑의 잔상' }
  ],
  modern: [
    { videoId: 'IV8LO-T66ys', title: '고요한 밤의 몽환적 선율 (모던 피아노 & 앰비언트)', desc: '현대적 일상과 감각적 사유' },
    { videoId: '1E0942rV2i4', title: '도시의 서늘한 네온사인 (모던 미니멀리즘)', desc: '건조한 도시 속 감각적인 서정' },
    { videoId: 'vV_yUe4WqN0', title: '심야의 사색 (로파이 앰비언트 & 신스)', desc: '몽환적이고 감각적인 현대인의 내면' },
    { videoId: '5qap5aO4i9A', title: '어스름한 새벽 골목길 (모던 어쿠스틱)', desc: '새벽의 고요와 도시의 여운' }
  ]
};

// 하위 호환용 기본 트랙 맵 (각 분위기의 첫 번째 후보곡)
const MOOD_BGM_TRACKS = {
  contemplative: MOOD_BGM_PLAYLISTS.contemplative[0],
  nostalgic: MOOD_BGM_PLAYLISTS.nostalgic[0],
  nature: MOOD_BGM_PLAYLISTS.nature[0],
  comfort: MOOD_BGM_PLAYLISTS.comfort[0],
  romantic: MOOD_BGM_PLAYLISTS.romantic[0],
  modern: MOOD_BGM_PLAYLISTS.modern[0]
};

function getMoodPlaylist(mood) {
  const poetInfo = POET_DATABASE[mood] || POET_DATABASE.yoon_dongju;
  const bgmKey = poetInfo.bgmKey || 'contemplative';
  return MOOD_BGM_PLAYLISTS[bgmKey] || MOOD_BGM_PLAYLISTS.contemplative;
}

function getCurrentMoodTrack(mood, index = state.currentBgmIndex) {
  const playlist = getMoodPlaylist(mood);
  const safeIdx = ((index % playlist.length) + playlist.length) % playlist.length;
  return { track: playlist[safeIdx], index: safeIdx, total: playlist.length };
}

// 한국 대표 서정 시어 159선 (한국_시어_159개.MD 기반)
const KOREAN_POETIC_WORDS_159 = [
  // 1. 기존 대표 시어 (1~50)
  '사람', '어머니', '아이', '얼굴', '눈', '손', '몸', '가슴', '입', '목숨',
  '마음', '사랑', '생각', '꿈', '말', '소리', '이야기', '가난', '걱정', '후회',
  '하늘', '바람', '바다', '산', '강', '물', '땅', '나무', '꽃', '새',
  '밤', '아침', '저녁', '오늘', '하루', '날', '때', '시간', '달', '별',
  '길', '집', '방', '마을', '거리', '산골', '나라', '세상', '속', '끝',
  // 2. 추가 서정 시어 (51~150)
  '새벽', '황혼', '노을', '여명', '석양', '어스름', '달빛', '별빛', '햇살', '그림자',
  '구름', '안개', '이슬', '서리', '눈꽃', '빗방울', '소나기', '눈보라', '바람결', '물안개',
  '숲', '들판', '풀잎', '낙엽', '꽃잎', '꽃봉오리', '새싹', '뿌리', '가지', '열매',
  '봄', '여름', '가을', '겨울', '계절', '동백', '매화', '진달래', '국화', '갈대',
  '파도', '물결', '여울', '시냇물', '샘물', '호수', '바닷가', '모래', '수평선', '나루',
  '그리움', '외로움', '고독', '슬픔', '눈물', '한숨', '설렘', '기쁨', '아픔', '침묵',
  '이별', '만남', '추억', '기억', '망각', '기다림', '약속', '인연', '그대', '당신',
  '고향', '골목', '창문', '문턱', '지붕', '처마', '우물', '담장', '빈집', '오솔길',
  '흔적', '발자국', '숨결', '향기', '체온', '떨림', '메아리', '울림', '노래', '기도',
  '희망', '절망', '청춘', '세월', '순간', '영원', '운명', '생명', '죽음', '허무',
  // 3. 한국 고유의 아름다운 시어 (151~159)
  '윤슬', '시나브로', '서리꽃', '산그늘', '물비늘', '풋사랑', '꽃샘추위', '해사하다', '여백'
];

// 17대 상투적 클리셰 시어 (사용자가 명시적으로 입력하지 않은 경우 생성 배제)
const FORBIDDEN_POETIC_WORDS = [
  '공기', '온기', '발자국', '숨', '네온', '심장', '온도', '계절',
  '손끝', '가로등', '박자', '쪽으로', '번져', '골목', '발끝', '볕살이', '괜히'
];

// =========================================================
// 2. DOM 요소 참조
// =========================================================
const wordInputs = [
  document.getElementById('word1'),
  document.getElementById('word2'),
  document.getElementById('word3'),
  document.getElementById('word4'),
  document.getElementById('word5')
];

const geminiModelSelect = document.getElementById('geminiModelSelect');
const poemMoodSelect = document.getElementById('poemMoodSelect');
const poemEmotionInput = document.getElementById('poemEmotionInput');
const emotionTags = document.getElementById('emotionTags');
const generatePoemBtn = document.getElementById('generatePoemBtn');
const randomWordsBtn = document.getElementById('randomWordsBtn');

// 시 전시 영역
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const loadingWordsPreview = document.getElementById('loadingWordsPreview');
const poemContentArea = document.getElementById('poemContentArea');
const poemTitle = document.getElementById('poemTitle');
const poemDate = document.getElementById('poemDate');
const poemAuthorTag = document.getElementById('poemAuthorTag');
const poemBody = document.getElementById('poemBody');
const poemNotes = document.getElementById('poemNotes');
const poemActions = document.getElementById('poemActions');
const copyPoemBtn = document.getElementById('copyPoemBtn');
const downloadImageBtn = document.getElementById('downloadImageBtn');

// 유튜브 BGM 제어 요소
const bgmTrackTitle = document.getElementById('bgmTrackTitle');
const bgmPlayToggleBtn = document.getElementById('bgmPlayToggleBtn');
const bgmPlayIcon = document.getElementById('bgmPlayIcon');
const bgmPlayText = document.getElementById('bgmPlayText');
const bgmStopBtn = document.getElementById('bgmStopBtn');
const bgmRefreshBtn = document.getElementById('bgmRefreshBtn');
const bgmSearchYoutubeBtn = document.getElementById('bgmSearchYoutubeBtn');
const bgmVideoToggleBtn = document.getElementById('bgmVideoToggleBtn');
const bgmVolumeSlider = document.getElementById('bgmVolumeSlider');
const bgmVolumeText = document.getElementById('bgmVolumeText');
const bgmAutoPlayCheck = document.getElementById('bgmAutoPlayCheck');
const bgmStatusAlert = document.getElementById('bgmStatusAlert');
const bgmStatusAlertText = document.getElementById('bgmStatusAlertText');
const closeBgmAlertBtn = document.getElementById('closeBgmAlertBtn');
const youtubePlayerContainer = document.getElementById('youtubePlayerContainer');
const customBgmInput = document.getElementById('customBgmInput');
const applyCustomBgmBtn = document.getElementById('applyCustomBgmBtn');

// 성우 낭송 & Google TTS 30 음성 제어 요소
const voiceGenderGroup = document.getElementById('voiceGenderGroup');
const voiceAgeGroup = document.getElementById('voiceAgeGroup');
const googleVoiceSelect = document.getElementById('googleVoiceSelect');
const voiceTraitBadge = document.getElementById('voiceTraitBadge');
const autoMoodTtsCheck = document.getElementById('autoMoodTtsCheck');
const paramVoiceName = document.getElementById('paramVoiceName');
const paramMoodStyle = document.getElementById('paramMoodStyle');
const paramPitchVal = document.getElementById('paramPitchVal');
const paramRateVal = document.getElementById('paramRateVal');
const paramPauseVal = document.getElementById('paramPauseVal');
const previewVoiceBtn = document.getElementById('previewVoiceBtn');
const readPoemBtn = document.getElementById('readPoemBtn');
const readPoemIcon = document.getElementById('readPoemIcon');
const readPoemText = document.getElementById('readPoemText');

// 상단 도구 & 모달
const ambientSoundBtn = document.getElementById('ambientSoundBtn');
const apiModal = document.getElementById('apiModal');
const openApiModalBtn = document.getElementById('openApiModalBtn');
const closeApiModalBtn = document.getElementById('closeApiModalBtn');
const closeModalOkBtn = document.getElementById('closeModalOkBtn');
const clearApiKeyBtn = document.getElementById('clearApiKeyBtn');
const apiStatusBadge = document.getElementById('apiStatusBadge');
const backendSecurityInfo = document.getElementById('backendSecurityInfo');
const backendStatusIcon = document.getElementById('backendStatusIcon');
const backendStatusTitle = document.getElementById('backendStatusTitle');
const backendStatusDetail = document.getElementById('backendStatusDetail');
const clientKeySection = document.getElementById('clientKeySection');
const apiKeyInput = document.getElementById('apiKeyInput');
const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
const toast = document.getElementById('toast');

// =========================================================
// 3. YouTube IFrame API 초기화 및 BGM 제어
// =========================================================
window.onYouTubeIframeAPIReady = function() {
  state.isYtApiReady = true;
  initYouTubePlayer();
};

function initYouTubePlayer() {
  const poetInfo = POET_DATABASE[state.selectedMood] || POET_DATABASE.yoon_dongju;
  const current = getCurrentMoodTrack(state.selectedMood, state.currentBgmIndex);
  const defaultTrack = current.track;
  state.currentBgmVideoId = defaultTrack.videoId;
  updateBgmTitleUI(`[${poetInfo.name} 풍] ${defaultTrack.title}`);

  try {
    state.ytPlayer = new YT.Player('youtubeIframeTarget', {
      height: '100%',
      width: '100%',
      videoId: defaultTrack.videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        loop: 1,
        playlist: defaultTrack.videoId
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError
      }
    });
  } catch (err) {
    console.warn('YouTube Player 초기화 대기 중:', err);
  }
}

function onPlayerReady(event) {
  event.target.setVolume(state.bgmVolume);
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    state.isBgmPlaying = true;
    bgmPlayIcon.textContent = '⏸️';
    bgmPlayText.textContent = 'BGM 일시정지';
    bgmPlayToggleBtn.classList.add('playing');
  } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
    state.isBgmPlaying = false;
    bgmPlayIcon.textContent = '▶️';
    bgmPlayText.textContent = 'BGM 재생';
    bgmPlayToggleBtn.classList.remove('playing');
  }
}

// 🔀 유튜브 재생 실패 시 자동 복구 엔진 (Error 2, 5, 100, 101, 150 등 대응)
function onPlayerError(err) {
  const errorCode = (err && typeof err === 'object' && err.data !== undefined)
    ? err.data
    : (typeof err === 'number' ? err : 'Unknown');

  console.warn(`[시원 BGM] YouTube 재생 제한/오류 감지 (코드: ${errorCode}, 영상 ID: ${state.currentBgmVideoId})`);

  if (state.currentBgmVideoId) {
    state.failedBgmVideoIds.add(state.currentBgmVideoId);
  }

  autoRecoverBgm(errorCode);
}

function autoRecoverBgm(errorCode) {
  state.autoRecoverCount++;
  const poetInfo = POET_DATABASE[state.selectedMood] || POET_DATABASE.yoon_dongju;
  const playlist = getMoodPlaylist(state.selectedMood);

  // 아직 실패하지 않은 다음 후보 곡 탐색
  let candidateIdx = -1;
  for (let i = 0; i < playlist.length; i++) {
    const nextIdx = (state.currentBgmIndex + 1 + i) % playlist.length;
    const track = playlist[nextIdx];
    if (!state.failedBgmVideoIds.has(track.videoId)) {
      candidateIdx = nextIdx;
      break;
    }
  }

  if (candidateIdx !== -1) {
    state.currentBgmIndex = candidateIdx;
    const nextTrack = playlist[candidateIdx];
    state.currentBgmVideoId = nextTrack.videoId;

    updateBgmTitleUI(`[${poetInfo.name} 풍] 🔀 자동 대체곡 #${candidateIdx + 1}: ${nextTrack.title}`);
    showBgmAlert(`⚠️ 기존 영상 재생 불가(오류코드: ${errorCode}) → 시풍에 어울리는 새로운 연주곡으로 자동 교체했습니다.`);
    showToast(`시의 분위기에 어울리는 새로운 BGM으로 자동 전환하여 재생합니다 🎵`);

    if (state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
      state.ytPlayer.loadVideoById({
        videoId: nextTrack.videoId,
        startSeconds: 0
      });
      state.ytPlayer.setVolume(state.bgmVolume);
    }
  } else {
    // 모든 후보 영상이 임베드 제한된 경우 안내
    showBgmAlert(`⚠️ 유튜브 영상 정책으로 재생이 제한되었습니다. 상단 [🔍 유튜브 검색]으로 직접 감상하시거나 [📺 영상]에서 직접 URL을 입력하세요.`);
    showToast(`배경음악 재생이 제한되었습니다. [🔍 유튜브 검색]을 이용해 보세요.`);
  }
}

// 🔀 수동 BGM 교체 및 새로고침
function rotateBgm(isManual = true) {
  const poetInfo = POET_DATABASE[state.selectedMood] || POET_DATABASE.yoon_dongju;
  const playlist = getMoodPlaylist(state.selectedMood);
  state.currentBgmIndex = (state.currentBgmIndex + 1) % playlist.length;
  const nextTrack = playlist[state.currentBgmIndex];
  state.currentBgmVideoId = nextTrack.videoId;

  updateBgmTitleUI(`[${poetInfo.name} 풍] #${state.currentBgmIndex + 1}: ${nextTrack.title}`);

  if (state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
    state.ytPlayer.loadVideoById({
      videoId: nextTrack.videoId,
      startSeconds: 0
    });
    state.ytPlayer.setVolume(state.bgmVolume);
  }

  if (isManual) {
    hideBgmAlert();
    showToast(`[${nextTrack.title}] 다른 연주곡으로 교체 재생합니다 🔀`);
  }
}

// 🔍 유튜브에서 현재 시풍 연주곡 직접 검색하기
function searchYoutubeForMood() {
  const poetInfo = POET_DATABASE[state.selectedMood] || POET_DATABASE.yoon_dongju;
  const query = `${poetInfo.name} 분위기 잔잔한 서정 연주곡 BGM 가사없는음악`;
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  window.open(searchUrl, '_blank');
  showToast(`유튜브에서 [${poetInfo.name}] 시풍에 맞는 연주곡 검색창을 열었습니다 🔍`);
}

// 직접 입력한 유튜브 링크 또는 영상 ID 파싱
function extractYouTubeVideoId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = trimmed.match(regExp);
  return match ? match[1] : null;
}

// 사용자 맞춤 유튜브 영상 적용 및 즉시 재생
function handleApplyCustomBgm() {
  const inputVal = customBgmInput ? customBgmInput.value.trim() : '';
  if (!inputVal) {
    showToast('유튜브 영상 주소(URL) 또는 11자리 영상 ID를 입력해 주세요.');
    return;
  }

  const videoId = extractYouTubeVideoId(inputVal);
  if (!videoId) {
    showToast('올바른 유튜브 주소 형식이 아닙니다. 확인 후 다시 시도해 주세요.');
    return;
  }

  state.currentBgmVideoId = videoId;
  updateBgmTitleUI(`[직접 지정 BGM] 사용자 맞춤 연주 영상 (${videoId})`);
  hideBgmAlert();

  if (state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
    state.ytPlayer.loadVideoById({
      videoId: videoId,
      startSeconds: 0
    });
    state.ytPlayer.setVolume(state.bgmVolume);
  }

  showToast('사용자가 지정한 유튜브 음악을 재생합니다 🎶');
  if (customBgmInput) customBgmInput.value = '';
}

function showBgmAlert(message) {
  if (!bgmStatusAlert || !bgmStatusAlertText) return;
  bgmStatusAlertText.textContent = message;
  bgmStatusAlert.classList.remove('hidden');
}

function hideBgmAlert() {
  if (!bgmStatusAlert) return;
  bgmStatusAlert.classList.add('hidden');
}

function updateBgmTitleUI(title) {
  if (bgmTrackTitle) {
    bgmTrackTitle.textContent = title;
  }
}

function toggleBgm() {
  if (!state.ytPlayer || typeof state.ytPlayer.playVideo !== 'function') {
    showToast('배경음악 플레이어를 준비하는 중입니다...');
    return;
  }

  if (state.isBgmPlaying) {
    state.ytPlayer.pauseVideo();
    showToast('배경음악을 일시정지했습니다 ⏸️');
  } else {
    state.ytPlayer.playVideo();
    showToast('유튜브 서정 연주곡을 재생합니다 🎵');
  }
}

// 배경음악 완전 정지 함수
function stopBgm() {
  if (!state.ytPlayer) {
    showToast('배경음악 플레이어가 아직 준비되지 않았습니다.');
    return;
  }

  try {
    if (typeof state.ytPlayer.stopVideo === 'function') {
      state.ytPlayer.stopVideo();
    } else if (typeof state.ytPlayer.pauseVideo === 'function') {
      state.ytPlayer.pauseVideo();
      if (typeof state.ytPlayer.seekTo === 'function') {
        state.ytPlayer.seekTo(0, true);
      }
    }
  } catch (err) {
    console.warn('BGM 정지 오류:', err);
  }

  state.isBgmPlaying = false;
  if (bgmPlayIcon) bgmPlayIcon.textContent = '▶️';
  if (bgmPlayText) bgmPlayText.textContent = 'BGM 재생';
  if (bgmPlayToggleBtn) bgmPlayToggleBtn.classList.remove('playing');
  showToast('배경음악을 완전히 정지했습니다 ⏹️');
}

function switchBgmForMood(mood, autoPlay = false) {
  const poetInfo = POET_DATABASE[mood] || POET_DATABASE.yoon_dongju;
  state.currentBgmIndex = 0; // 시풍 변경 시 첫 번째 트랙으로 초기화
  const current = getCurrentMoodTrack(mood, state.currentBgmIndex);
  const track = current.track;
  updateBgmTitleUI(`[${poetInfo.name} 풍] ${track.title}`);
  hideBgmAlert();

  if (!state.ytPlayer || typeof state.ytPlayer.loadVideoById !== 'function') {
    state.currentBgmVideoId = track.videoId;
    return;
  }

  if (state.currentBgmVideoId !== track.videoId) {
    state.currentBgmVideoId = track.videoId;
    if (autoPlay) {
      state.ytPlayer.loadVideoById({
        videoId: track.videoId,
        startSeconds: 0
      });
      state.ytPlayer.setVolume(state.bgmVolume);
    } else {
      state.ytPlayer.cueVideoById({
        videoId: track.videoId,
        startSeconds: 0
      });
    }
  } else if (autoPlay && !state.isBgmPlaying) {
    state.ytPlayer.playVideo();
  }
}

function handleVolumeChange(e) {
  const vol = parseInt(e.target.value, 10);
  state.bgmVolume = vol;
  bgmVolumeText.textContent = `${vol}%`;
  if (state.ytPlayer && typeof state.ytPlayer.setVolume === 'function') {
    state.ytPlayer.setVolume(vol);
  }
}

function toggleVideoContainer() {
  const isHidden = youtubePlayerContainer.classList.contains('hidden');
  if (isHidden) {
    youtubePlayerContainer.classList.remove('hidden');
    bgmVideoToggleBtn.querySelector('span').textContent = '📺 영상 접기';
  } else {
    youtubePlayerContainer.classList.add('hidden');
    bgmVideoToggleBtn.querySelector('span').textContent = '📺 영상 보기';
  }
}

// =========================================================
// 4. 시 분위기 맞춤 Google TTS 감성 튜닝 & 성우 시스템
// =========================================================

// 최적의 한국어 음성 및 성별 매칭 (Google TTS 최우선 감지)
function resolveKoreanVoice(gender) {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const koVoices = voices.filter(v => v.lang.includes('ko') || v.lang.includes('KO'));

  if (koVoices.length === 0) return null;

  if (gender === 'male') {
    const naturalMale = koVoices.find(v => 
      v.name.includes('InJoon') || 
      v.name.toLowerCase().includes('male') || 
      v.name.includes('남성')
    );
    if (naturalMale) {
      return { voice: naturalMale, isNaturalMale: true };
    }
    // 남성 전용 음성이 없는 경우 피치를 낮춘 합성 톤 사용
    return { voice: koVoices[0], isNaturalMale: false };
  } else {
    // 구글 한국어 또는 SunHi, Heami 등 자연스러운 여성 음성
    const naturalFemale = koVoices.find(v => 
      v.name.includes('Google') || 
      v.name.includes('SunHi') || 
      v.name.includes('Heami') || 
      v.name.includes('Yuna') || 
      v.name.toLowerCase().includes('female')
    );
    return { voice: naturalFemale || koVoices[0], isNaturalMale: false };
  }
}

// 연령대, 성별, Google TTS 음성에 따른 정밀 감성 프로필 산출
function computeVoiceProfile(gender, age, voiceName = state.selectedVoiceName, autoMood = true) {
  const voiceData = resolveKoreanVoice(gender);
  const isNaturalMale = voiceData ? voiceData.isNaturalMale : false;
  const gVoice = GOOGLE_TTS_VOICES[voiceName] || GOOGLE_TTS_VOICES.Iapetus;

  // 기본 연령대 및 성별 베이스라인 피치 & 속도
  let basePitch = 1.0;
  let baseRate = 0.82;

  if (gender === 'female') {
    if (age === 20) {
      basePitch = 1.14;
      baseRate = 0.88;
    } else if (age === 40) {
      basePitch = 0.98;
      baseRate = 0.80;
    } else {
      basePitch = 0.82;
      baseRate = 0.70;
    }
  } else {
    if (isNaturalMale) {
      if (age === 20) {
        basePitch = 1.05;
        baseRate = 0.88;
      } else if (age === 40) {
        basePitch = 0.90;
        baseRate = 0.78;
      } else {
        basePitch = 0.78;
        baseRate = 0.68;
      }
    } else {
      if (age === 20) {
        basePitch = 0.74;
        baseRate = 0.88;
      } else if (age === 40) {
        basePitch = 0.63;
        baseRate = 0.78;
      } else {
        basePitch = 0.52;
        baseRate = 0.68;
      }
    }
  }

  let finalPitch = basePitch;
  let finalRate = baseRate;
  let linePauseMs = 600;
  let stanzaPauseMs = 1200;
  let styleText = gVoice.style;
  let pauseText = gVoice.pauseDesc;

  // 시풍 및 Google TTS 맞춤 자동 감성 조절이 활성화된 경우 파라미터 미세 튜닝
  if (autoMood) {
    finalPitch = Math.max(0.4, Math.min(1.8, basePitch + gVoice.pitchOffset));
    finalRate = Math.max(0.5, Math.min(1.4, baseRate + gVoice.rateOffset));
    linePauseMs = gVoice.linePauseMs;
    stanzaPauseMs = gVoice.stanzaPauseMs;
    styleText = gVoice.style;
    pauseText = gVoice.pauseDesc;
  }

  return {
    voiceName: gVoice.name,
    voiceLabel: `${gVoice.name} (${gVoice.trait})`,
    voice: voiceData ? voiceData.voice : null,
    pitch: parseFloat(finalPitch.toFixed(2)),
    rate: parseFloat(finalRate.toFixed(2)),
    linePauseMs,
    stanzaPauseMs,
    style: styleText,
    pauseDesc: pauseText,
    pitchDiffPercent: Math.round((finalPitch - 1.0) * 100)
  };
}

// 실시간 TTS 감성 튜닝 UI 뱃지 업데이트
function updateTtsTuningDisplay() {
  const profile = computeVoiceProfile(
    state.voiceGender,
    state.voiceAge,
    state.selectedVoiceName,
    state.autoMoodTts
  );

  const gVoice = GOOGLE_TTS_VOICES[state.selectedVoiceName] || GOOGLE_TTS_VOICES.Iapetus;

  if (paramVoiceName) paramVoiceName.textContent = `${gVoice.name} (${gVoice.trait})`;
  if (voiceTraitBadge) voiceTraitBadge.textContent = `${gVoice.name} · ${gVoice.trait}`;
  if (paramMoodStyle) paramMoodStyle.textContent = profile.style;

  const pitchDiff = profile.pitchDiffPercent >= 0 ? `+${profile.pitchDiffPercent}%` : `${profile.pitchDiffPercent}%`;
  if (paramPitchVal) paramPitchVal.textContent = `${profile.pitch}x (${pitchDiff})`;

  const speedDesc = profile.rate < 0.75 ? '차분하고 느림' : profile.rate < 0.85 ? '안정적 호흡' : '산뜻한 템포';
  if (paramRateVal) paramRateVal.textContent = `${profile.rate}x (${speedDesc})`;

  if (paramPauseVal) paramPauseVal.textContent = profile.pauseDesc;
}

// 오디오 더킹
function applyAudioDucking(enable) {
  if (!state.ytPlayer || typeof state.ytPlayer.setVolume !== 'function') return;

  if (enable) {
    state.originalBgmVolBeforeDucking = state.bgmVolume;
    state.ytPlayer.setVolume(Math.min(10, Math.floor(state.bgmVolume * 0.28)));
  } else {
    state.ytPlayer.setVolume(state.originalBgmVolBeforeDucking);
  }
}

// 목소리 미리듣기
function previewVoiceActor() {
  if (!('speechSynthesis' in window)) {
    showToast('현재 브라우저가 음성 합성을 지원하지 않습니다.');
    return;
  }

  stopSpeakingUI();

  const gVoice = GOOGLE_TTS_VOICES[state.selectedVoiceName] || GOOGLE_TTS_VOICES.Iapetus;
  const genderName = state.voiceGender === 'female' ? '여성' : '남성';
  const ageName = `${state.voiceAge}대`;
  const sampleText = `안녕하세요. Google TTS ${gVoice.name} 음성입니다. ${ageName} ${genderName} 성우의 호흡으로 시를 낭송해 드리겠습니다.`;

  const utterance = new SpeechSynthesisUtterance(sampleText);
  utterance.lang = 'ko-KR';

  const profile = computeVoiceProfile(
    state.voiceGender,
    state.voiceAge,
    state.selectedVoiceName,
    state.autoMoodTts
  );

  if (profile.voice) utterance.voice = profile.voice;
  utterance.pitch = profile.pitch;
  utterance.rate = profile.rate;

  showToast(`[Google ${gVoice.name} · ${profile.style}] 미리듣기 🎧`);
  window.speechSynthesis.speak(utterance);
}

// 낭송 하이라이트 제어 헬퍼 함수
function clearRecitationHighlights() {
  if (poemTitle) poemTitle.classList.remove('reciting-active');
  const allStanzas = document.querySelectorAll('.poem-stanza');
  allStanzas.forEach(el => el.classList.remove('reciting-active', 'current-stanza'));
  const allLines = document.querySelectorAll('.poem-line');
  allLines.forEach(el => el.classList.remove('reciting-active'));
  const notesContainer = document.querySelector('.notes-container');
  if (notesContainer) notesContainer.classList.remove('reciting-active');
}

function setRecitationHighlight(target) {
  clearRecitationHighlights();
  if (!target) return;
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (el) {
    el.classList.add('reciting-active');
    const parentStanza = el.closest('.poem-stanza');
    if (parentStanza) {
      parentStanza.classList.add('current-stanza');
    }
    // 현재 낭송 중인 행 위치로 부드럽게 스크롤
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// 지능형 서정 시 낭송 엔진 (연/행간 감성 지연 + 행 단위 실시간 하이라이트 + 오디오 더킹)
let speechAbortController = false;

async function startPoemRecitation() {
  if (!state.currentPoem) return;

  window.speechSynthesis.cancel();
  speechAbortController = false;
  state.isSpeaking = true;

  if (readPoemIcon) readPoemIcon.textContent = '⏹️';
  if (readPoemText) readPoemText.textContent = '낭송 멈춤';
  if (readPoemBtn) readPoemBtn.classList.add('speaking');
  applyAudioDucking(true);

  const profile = computeVoiceProfile(
    state.voiceGender,
    state.voiceAge,
    state.selectedVoiceName,
    state.autoMoodTts
  );

  const gVoice = GOOGLE_TTS_VOICES[state.selectedVoiceName] || GOOGLE_TTS_VOICES.Iapetus;
  const genderName = state.voiceGender === 'female' ? '여성' : '남성';
  showToast(`[Google ${gVoice.name} · ${state.voiceAge}대 ${genderName} · ${profile.style}] 낭송을 시작합니다...`);

  try {
    clearRecitationHighlights();

    // 1. 시 제목 낭독 및 하이라이트
    setRecitationHighlight('poemTitle');
    await speakSegment(`${state.currentPoem.title}.`, profile);
    if (speechAbortController) return;
    await waitDelay(profile.stanzaPauseMs);
    if (speechAbortController) return;

    // 2. 문단(연) 내 행(Line) 단위 실시간 낭독 및 연한 노랑색 행 하이라이트
    const stanzas = state.currentPoem.body.split(/\n\s*\n/);
    for (let sIndex = 0; sIndex < stanzas.length; sIndex++) {
      if (speechAbortController) return;
      const stanzaText = stanzas[sIndex].trim();
      if (!stanzaText) continue;

      const lines = stanzaText.split('\n');
      for (let lIndex = 0; lIndex < lines.length; lIndex++) {
        if (speechAbortController) return;
        const cleanLine = lines[lIndex].trim();
        if (!cleanLine) continue;

        // 현재 낭송 중인 행(Line) 연한 노랑색 하이라이트 표시
        setRecitationHighlight(`poemLine-${sIndex}-${lIndex}`);
        await speakSegment(cleanLine, profile);
        if (speechAbortController) return;

        // 행간(Line Pause) 감성 호흡 지연
        if (lIndex < lines.length - 1) {
          await waitDelay(profile.linePauseMs);
          if (speechAbortController) return;
        }
      }

      // 연간(Stanza Pause) 감성 여운 지연
      if (sIndex < stanzas.length - 1) {
        await waitDelay(profile.stanzaPauseMs);
        if (speechAbortController) return;
      }
    }

    // 3. 시인의 시작(詩作) 노트 낭독 및 하이라이트
    if (!speechAbortController && state.currentPoem.notes) {
      setRecitationHighlight(document.querySelector('.notes-container'));
      await waitDelay(profile.stanzaPauseMs);
      if (speechAbortController) return;
      await speakSegment(`시인의 노트. ${state.currentPoem.notes}`, profile);
    }
  } catch (err) {
    console.warn('낭송 인터럽트:', err);
  } finally {
    clearRecitationHighlights();
    stopSpeakingUI();
  }
}

/**
 * TTS 음성 합성용 텍스트 정제 함수
 * - 요구사항: TTS에서 *는 음성변환하지 말고 스킵
 * - 반각 별표(*), 전각 별표(＊), 특수 별 기호(✦,★,☆), 불릿(•,·) 및 마크다운(#, `, ~, _)을 완전 제거하여
 *   음성 합성 시 "별표"나 기호명이 발화되는 문제를 원천 차단
 */
function sanitizeTextForSpeech(text) {
  if (!text) return '';
  return text
    .replace(/[\*＊✦★☆•·]/g, '') // 별표 및 기호 문자 완전 스킵
    .replace(/#+/g, '')          // 마크다운 헤더 기호 제거
    .replace(/[`~_]/g, '')        // 백틱, 물결, 밑줄 제거
    .replace(/\s+/g, ' ')         // 공백 정돈
    .trim();
}

function speakSegment(text, profile) {
  return new Promise((resolve) => {
    if (speechAbortController) return resolve();

    const cleanText = sanitizeTextForSpeech(text);
    // 별표나 마크다운 기호 제거 후 남은 텍스트가 없으면(예: 구분선 *** 등) 발화 건너뜀
    if (!cleanText) return resolve();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ko-KR';
    if (profile.voice) utterance.voice = profile.voice;
    utterance.pitch = profile.pitch;
    utterance.rate = profile.rate;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

function waitDelay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), ms);
    const checkInterval = setInterval(() => {
      if (speechAbortController) {
        clearTimeout(timer);
        clearInterval(checkInterval);
        resolve();
      }
    }, 40);
  });
}

function toggleSpeech() {
  if (!('speechSynthesis' in window)) {
    showToast('현재 브라우저가 음성 합성을 지원하지 않습니다.');
    return;
  }

  if (state.isSpeaking) {
    stopSpeakingUI();
    showToast('시 낭송을 멈추었습니다 ⏹️');
  } else {
    startPoemRecitation();
  }
}

function stopSpeakingUI() {
  speechAbortController = true;
  clearRecitationHighlights();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  state.isSpeaking = false;
  if (readPoemIcon) readPoemIcon.textContent = '🎙️';
  if (readPoemText) readPoemText.textContent = '시 낭송 듣기';
  if (readPoemBtn) readPoemBtn.classList.remove('speaking');
  applyAudioDucking(false);
}

// =========================================================
// 5. 초기화 및 백엔드 보안 점검
// =========================================================
async function init() {
  setupEventListeners();

  const today = new Date();
  poemDate.textContent = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  const appVersionBadge = document.getElementById('appVersionBadge');
  if (appVersionBadge) {
    appVersionBadge.textContent = APP_VERSION;
  }
  console.log(`🌸 시원(詩苑) [${APP_VERSION}] 서정시 창작소가 준비되었습니다.`);

  if (poemMoodSelect) {
    state.selectedMood = poemMoodSelect.value || 'yoon_dongju';
  }
  const poetInfo = POET_DATABASE[state.selectedMood] || POET_DATABASE.yoon_dongju;
  state.selectedVoiceName = poetInfo.recommendedVoice || 'Iapetus';
  if (googleVoiceSelect) {
    googleVoiceSelect.value = state.selectedVoiceName;
  }

  await checkBackendStatus();
  updateTtsTuningDisplay();

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
      updateTtsTuningDisplay();
    };
  }
}

async function checkBackendStatus() {
  try {
    const res = await fetch('/api/status', { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      state.isBackendOnline = true;
      state.hasServerKey = data.hasServerKey;
      const serverVer = data.version || APP_VERSION;

      if (data.hasServerKey) {
        apiStatusBadge.textContent = `보안 서버 연동 (${serverVer})`;
        apiStatusBadge.className = 'status-badge live';
        backendStatusIcon.textContent = '🛡️';
        backendStatusTitle.textContent = `백엔드 보안 연동 완료 [${serverVer}] (.env 키 암호화)`;
        backendStatusDetail.innerHTML = '서버의 <code>.env</code> 파일에 등록된 API 키를 사용하여 서버-투-서버로 시를 창작합니다. 브라우저에 API 키가 절대 노출되지 않습니다.';
        clientKeySection.classList.add('hidden');
        clearApiKeyBtn.classList.add('hidden');
      } else {
        apiStatusBadge.textContent = '.env 키 등록 필요';
        apiStatusBadge.className = 'status-badge warn';
        backendStatusIcon.textContent = '⚠️';
        backendStatusTitle.textContent = '서버 .env 파일에 GEMINI_API_KEY 등록 필요';
        backendStatusDetail.innerHTML = '서버의 <code>.env</code> 파일에 <code>GEMINI_API_KEY=발급받은키</code>를 입력하시면 즉시 실시간 AI 시 창작이 활성화됩니다.';
        clientKeySection.classList.add('hidden');
        clearApiKeyBtn.classList.add('hidden');
      }
      return;
    }
  } catch (e) {
    state.isBackendOnline = false;
    state.hasServerKey = false;
  }

  setupStaticPagesMode();
}

function setupStaticPagesMode() {
  backendSecurityInfo.classList.add('hidden');
  clientKeySection.classList.remove('hidden');
  clearApiKeyBtn.classList.remove('hidden');

  if (state.clientKey && state.clientKey.trim().length > 5) {
    apiStatusBadge.textContent = 'API 연동 활성';
    apiStatusBadge.className = 'status-badge live';
    apiKeyInput.value = state.clientKey;
  } else {
    apiStatusBadge.textContent = '데모 모드';
    apiStatusBadge.className = 'status-badge';
    apiKeyInput.value = '';
  }
}

function showToast(message, duration = 2600) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

// =========================================================
// 6. 이벤트 리스너 등록
// =========================================================
function setupEventListeners() {
  // 유튜브 BGM 컨트롤
  bgmPlayToggleBtn.addEventListener('click', toggleBgm);
  if (bgmStopBtn) {
    bgmStopBtn.addEventListener('click', stopBgm);
  }
  bgmVideoToggleBtn.addEventListener('click', toggleVideoContainer);
  bgmVolumeSlider.addEventListener('input', handleVolumeChange);

  if (bgmRefreshBtn) {
    bgmRefreshBtn.addEventListener('click', () => rotateBgm(true));
  }
  if (bgmSearchYoutubeBtn) {
    bgmSearchYoutubeBtn.addEventListener('click', searchYoutubeForMood);
  }
  if (applyCustomBgmBtn) {
    applyCustomBgmBtn.addEventListener('click', handleApplyCustomBgm);
  }
  if (customBgmInput) {
    customBgmInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleApplyCustomBgm();
    });
  }
  if (closeBgmAlertBtn) {
    closeBgmAlertBtn.addEventListener('click', hideBgmAlert);
  }

  // 성우 낭송 설정 (성별 선택)
  voiceGenderGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    voiceGenderGroup.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.voiceGender = btn.dataset.gender;
    updateTtsTuningDisplay();
    showToast(`성우 성별: [${btn.textContent.trim()}] 설정됨`);
  });

  // 성우 낭송 설정 (연령대 선택)
  voiceAgeGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    voiceAgeGroup.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.voiceAge = parseInt(btn.dataset.age, 10);
    updateTtsTuningDisplay();
    showToast(`성우 연령대: [${btn.textContent.trim()}] 설정됨`);
  });

  // Google TTS 30가지 음성 수동 선택 리스너
  if (googleVoiceSelect) {
    googleVoiceSelect.addEventListener('change', (e) => {
      state.selectedVoiceName = e.target.value;
      const gVoice = GOOGLE_TTS_VOICES[state.selectedVoiceName];
      if (gVoice) {
        state.voiceGender = gVoice.gender;
        state.voiceAge = gVoice.age;
        voiceGenderGroup.querySelectorAll('.seg-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.gender === state.voiceGender);
        });
        voiceAgeGroup.querySelectorAll('.seg-btn').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.age, 10) === state.voiceAge);
        });
        updateTtsTuningDisplay();
        showToast(`Google TTS 음성: [${gVoice.label}] 설정됨`);
      }
    });
  }

  // 시 분위기 맞춤 자동 튜닝 토글 체크박스
  if (autoMoodTtsCheck) {
    autoMoodTtsCheck.addEventListener('change', (e) => {
      state.autoMoodTts = e.target.checked;
      updateTtsTuningDisplay();
      if (state.autoMoodTts) {
        showToast('시풍 맞춤 Google TTS 자동 튜닝 활성화 ✨');
      } else {
        showToast('성우 기본 음높이/속도로 전환되었습니다.');
      }
    });
  }

  // 성우 미리듣기 & 낭송 시작
  previewVoiceBtn.addEventListener('click', previewVoiceActor);
  readPoemBtn.addEventListener('click', toggleSpeech);

  // 시풍 및 시인 선택 변경 시 BGM 트랙 및 Google TTS 30 보이스 자동 동기화!
  poemMoodSelect.addEventListener('change', (e) => {
    state.selectedMood = e.target.value;
    const poetInfo = POET_DATABASE[state.selectedMood] || POET_DATABASE.yoon_dongju;

    // 시풍 자동 조절 활성화 시 추천 Google TTS 보이스 및 성별/연령대 자동 전환
    if (state.autoMoodTts && poetInfo) {
      if (poetInfo.recommendedVoice && GOOGLE_TTS_VOICES[poetInfo.recommendedVoice]) {
        state.selectedVoiceName = poetInfo.recommendedVoice;
        if (googleVoiceSelect) googleVoiceSelect.value = state.selectedVoiceName;
      }
      if (poetInfo.recommendedGender) {
        state.voiceGender = poetInfo.recommendedGender;
        voiceGenderGroup.querySelectorAll('.seg-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.gender === state.voiceGender);
        });
      }
      if (poetInfo.recommendedAge) {
        state.voiceAge = poetInfo.recommendedAge;
        voiceAgeGroup.querySelectorAll('.seg-btn').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.age, 10) === state.voiceAge);
        });
      }
      showToast(`시풍 변경: [${poetInfo.name}] 시인 · Google ${state.selectedVoiceName} 보이스 자동 매칭 ✨`);
    }

    switchBgmForMood(state.selectedMood, false);
    updateTtsTuningDisplay();
  });

  // 🎲 추천 단어 무작위 채우기 (한국 대표 시어 159선에서 중복 없이 5개 선정)
  randomWordsBtn.addEventListener('click', () => {
    // 17대 클리셰 금지단어는 기본 무작위 추천 풀에서 배제하여 신선하고 품격 있는 시어만 추천
    const selectablePool = KOREAN_POETIC_WORDS_159.filter(w => !FORBIDDEN_POETIC_WORDS.includes(w));
    
    // Fisher-Yates 셔플 알고리즘으로 무작위 5개 중복 없이 추출
    const shuffled = [...selectablePool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const chosenWords = shuffled.slice(0, 5);

    wordInputs.forEach((input, index) => {
      input.value = chosenWords[index];
      input.classList.remove('input-pulse');
      void input.offsetWidth; // 브라우저 리플로우 강제 트리거
      input.classList.add('input-pulse');
    });
    showToast(`한국 대표 시어 159선에서 5개 시어가 추천되었습니다 🎲 (${chosenWords.slice(0, 3).join(', ')} 등)`);
  });

  // 감정 태그 칩 클릭 및 직접 입력 이벤트 (시인풍과 융합)
  if (emotionTags && poemEmotionInput) {
    emotionTags.addEventListener('click', (e) => {
      const btn = e.target.closest('.emotion-tag-btn');
      if (!btn) return;
      const tagEmotion = btn.dataset.emotion;
      if (poemEmotionInput.value.trim() === tagEmotion) {
        poemEmotionInput.value = '';
        btn.classList.remove('active');
      } else {
        poemEmotionInput.value = tagEmotion;
        emotionTags.querySelectorAll('.emotion-tag-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });

    poemEmotionInput.addEventListener('input', () => {
      const currentVal = poemEmotionInput.value.trim();
      emotionTags.querySelectorAll('.emotion-tag-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.emotion === currentVal);
      });
    });
  }

  geminiModelSelect.addEventListener('change', (e) => {
    state.selectedModel = e.target.value;
  });

  // 서정시 짓기 버튼
  generatePoemBtn.addEventListener('click', handleGeneratePoem);

  // 텍스트 복사 & 이미지 저장
  copyPoemBtn.addEventListener('click', copyPoemToClipboard);
  downloadImageBtn.addEventListener('click', downloadPoemCardImage);

  // 빗소리 & 모달
  ambientSoundBtn.addEventListener('click', toggleRainSound);

  openApiModalBtn.addEventListener('click', () => {
    if (!state.isBackendOnline && apiKeyInput) {
      apiKeyInput.value = state.clientKey;
    }
    apiModal.classList.remove('hidden');
  });

  closeApiModalBtn.addEventListener('click', () => {
    apiModal.classList.add('hidden');
  });

  closeModalOkBtn.addEventListener('click', () => {
    if (!state.isBackendOnline && apiKeyInput) {
      const inputVal = apiKeyInput.value.trim();
      state.clientKey = inputVal;
      if (inputVal) {
        localStorage.setItem(CLIENT_STORAGE_KEY, inputVal);
        showToast('Gemini API 키가 저장되었습니다 🔑');
      } else {
        localStorage.removeItem(CLIENT_STORAGE_KEY);
        showToast('API 키가 비어있어 데모 모드로 동작합니다.');
      }
      setupStaticPagesMode();
    }
    apiModal.classList.add('hidden');
  });

  clearApiKeyBtn.addEventListener('click', () => {
    state.clientKey = '';
    localStorage.removeItem(CLIENT_STORAGE_KEY);
    apiKeyInput.value = '';
    setupStaticPagesMode();
    apiModal.classList.add('hidden');
    showToast('API 키가 삭제되어 데모 모드로 전환되었습니다.');
  });

  toggleKeyVisibility.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleKeyVisibility.textContent = '🔒';
    } else {
      apiKeyInput.type = 'password';
      toggleKeyVisibility.textContent = '👁️';
    }
  });

  apiModal.addEventListener('click', (e) => {
    if (e.target === apiModal) apiModal.classList.add('hidden');
  });
}

// =========================================================
// 7. 시 생성 핸들러 (BGM 자동 플레이 & TTS 감성 연동)
// =========================================================
async function handleGeneratePoem() {
  const words = wordInputs.map(input => input.value.trim()).filter(w => w.length > 0);

  if (words.length < 5) {
    showToast('다섯 개의 단어를 모두 채워주세요!');
    for (let input of wordInputs) {
      if (!input.value.trim()) {
        input.focus();
        break;
      }
    }
    return;
  }

  const emotion = poemEmotionInput ? poemEmotionInput.value.trim() : '';

  state.isGenerating = true;
  generatePoemBtn.disabled = true;
  emptyState.classList.add('hidden');
  poemContentArea.classList.add('hidden');
  poemActions.classList.add('hidden');
  loadingState.classList.remove('hidden');
  loadingWordsPreview.textContent = `[선택 시어: ${words.join(' · ')}]${emotion ? ` · 감정: ${emotion}` : ''}`;

  try {
    let result = null;

    // 1순위: 백엔드 보안 호출
    if (state.isBackendOnline && state.hasServerKey) {
      const response = await fetch('/api/generate-poem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words,
          model: state.selectedModel,
          mood: state.selectedMood,
          voice_name: state.selectedVoiceName,
          emotion
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status} 오류`);
      }

      const data = await response.json();
      result = data.poem;
      renderPoem(result, words, true);

      if (data.fallbackOccurred) {
        showToast(`🔒 서버 혼잡을 극복하고 [${data.model}] 모델로 시가 안전하게 창작되었습니다 ✨`);
      } else {
        showToast('🔒 보안 백엔드를 통해 안전하게 시가 창작되었습니다.');
      }
    }
    // 2순위: GitHub Pages 클라이언트 키
    else if (!state.isBackendOnline && state.clientKey && state.clientKey.trim().length > 5) {
      const clientResult = await callClientGeminiApi(words, state.selectedModel, state.selectedMood, state.clientKey, emotion);
      result = clientResult.poem;
      renderPoem(result, words, true);
      if (clientResult.fallbackOccurred) {
        showToast(`Gemini AI (${clientResult.usedModel})로 서버 혼잡을 자동 극복하고 시를 창작했습니다 ✨`);
      } else {
        showToast('Google Gemini AI를 통해 실시간 시가 창작되었습니다 ✨');
      }
    }
    // 3순위: 데모 템플릿
    else {
      await new Promise(r => setTimeout(r, 1100));
      result = generateDemoPoem(words, state.selectedMood, emotion);
      renderPoem(result, words, false);
      showToast('시원(詩苑) 대표 시풍 데모 모드로 생성되었습니다.');
    }

    // TTS 감성 튜닝 UI 갱신
    updateTtsTuningDisplay();

    // 시 창작 성공 시: 체크되어 있으면 분위기에 맞는 유튜브 BGM 자동 재생!
    if (bgmAutoPlayCheck.checked) {
      switchBgmForMood(state.selectedMood, true);
    }

  } catch (error) {
    console.error('시 생성 오류:', error);
    showToast(`오류 발생: ${error.message}`);
    const fallbackPoem = generateDemoPoem(words, state.selectedMood, emotion);
    renderPoem(fallbackPoem, words, false);
    updateTtsTuningDisplay();
  } finally {
    state.isGenerating = false;
    generatePoemBtn.disabled = false;
    loadingState.classList.add('hidden');
  }
}

// 클라이언트 Gemini API 호출 (Google 서버 트래픽 과부하 시 자동 재시도 및 모델 자동 전환 스마트 폴백)
const CLIENT_FALLBACK_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest'
];

async function callClientGeminiApi(words, model, mood, apiKey, emotion = '') {
  const poetInfo = POET_DATABASE[mood] || POET_DATABASE.yoon_dongju;
  const sanitizedEmotion = String(emotion || '').trim().slice(0, 100);

  // 금지단어(17대 클리셰) 필터링: 사용자가 직접 입력한 5개 단어나 감정에 포함된 경우만 예외 허용
  const userExplicitText = [...words, sanitizedEmotion].join(' ');
  const activeForbiddenWords = FORBIDDEN_POETIC_WORDS.filter(w => !userExplicitText.includes(w));

  const systemInstruction = `당신은 한국 문학사에 빛나는 명시인들의 시풍과 영혼을 완벽히 체화한 서정시의 대가입니다.
사용자가 선택한 시인([${poetInfo.name}] - 대표작: '${poetInfo.work}')의 독보적인 문학적 정체성, 특유의 시적 어조, 리듬감, 세계관, 그리고 대표 모티프를 철저히 반영하여, 다섯 단어로 감동적인 한국 현대 서정시를 창작해 주세요.`;

  const userPrompt = `
[창작 대상 시인 및 시풍]
- 시인: ${poetInfo.name} (대표작: '${poetInfo.work}')
- 기본 문학적 정서와 스타일: ${poetInfo.desc}
- 매칭 Google TTS 보이스: ${state.selectedVoiceName}
${sanitizedEmotion ? `- [사용자가 담고자 하는 시적 감정 및 테마]: "${sanitizedEmotion}"
- [감정 융합 지침]: 사용자가 지정한 감정("${sanitizedEmotion}")을 [${poetInfo.name}] 시인 특유의 고유한 시적 어조, 시선, 이미지와 유기적으로 결합하여, 시인의 영혼과 목소리로 사용자의 감정을 노래하듯 깊이 있게 빚어내세요.` : ''}

[선택된 다섯 단어]
1. ${words[0]}
2. ${words[1]}
3. ${words[2]}
4. ${words[3]}
5. ${words[4]}

[🚨 시적 클리셰 및 금지단어 배제 지침 (Negative Constraints)]
${activeForbiddenWords.length > 0 ? `다음 단어들은 지나치게 상투적이고 흔하게 남발되는 클리셰 시어이므로, 사용자가 5개 단어나 감정으로 명시적으로 직접 요청하지 않은 한 시 본문과 제목에서 절대로 사용하지 마세요:
[${activeForbiddenWords.join(', ')}]
- 위 금지어 대신 시인의 개성이 담긴 신선하고 독창적인 묘사와 구체적인 사물, 감각적 시어를 활용하세요.` : ''}

[작품 완결성 및 종결 지침 (필수)]
1. 시의 맨 첫 줄은 '# [시의 제목]' 형식으로 작성하세요.
2. 3~5개의 연으로 구성하고, 연과 연 사이는 빈 줄로 구분하세요.
3. 제공된 다섯 단어(${words.join(', ')})를 시 본문 속에 자연스럽고 유려하게 녹여내세요.
4. 시의 어조, 행간의 호흡, 사용하는 시어의 결이 반드시 [${poetInfo.name}] 시인의 고유한 서정과 정확히 일치하도록 심혈을 기울여 주세요.
5. [완결성 보장]: 시는 절대로 중간에 문맥이나 행이 끊기지 않고 완전히 끝맺어야 합니다. 마지막 연의 마지막 행까지 시적 여운을 담아 완전한 문장으로 종결하세요.
6. 시 본문이 완결된 후 반드시 '---' 구분선을 넣고, 그 아래에 [${poetInfo.name}] 시인의 시선에서 쓴 2~3문장의 시작노트(감상과 창작 의도)를 끝까지 온전히 작성하세요.
7. 군더더기 인사말은 절대 포함하지 마세요.
`;

  const payload = {
    contents: [{ parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }] }],
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      maxOutputTokens: 4096
    }
  };

  const modelsToTry = [model, ...CLIENT_FALLBACK_CHAIN.filter(m => m !== model)];
  let lastError = '서버 응답 없음';

  for (const currentModel of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        let response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const data = await response.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            return {
              poem: parsePoem(rawText),
              usedModel: currentModel,
              fallbackOccurred: currentModel !== model
            };
          }
        }

        const errorData = await response.json().catch(() => ({}));
        const status = response.status;
        const errMessage = errorData.error?.message || `HTTP ${status} 오류`;
        lastError = errMessage;

        const isTrafficError = status === 503 || status === 429 || status === 500 ||
          errMessage.includes('high traffic') || errMessage.includes('overloaded') || errMessage.includes('UNAVAILABLE') || errMessage.includes('capacity');
        const isNotFoundError = status === 404 || errMessage.includes('not found') || errMessage.includes('no longer available');

        if (attempt === 1 && isTrafficError) {
          console.warn(`[Client Gemini 과부하 감지] ${currentModel} 1차 실패 (${errMessage}) -> 1.2초 후 재시도...`);
          await new Promise(r => setTimeout(r, 1200));
          continue;
        }

        if (isTrafficError || isNotFoundError) {
          console.warn(`[Client Gemini 스마트 폴백] ${currentModel} 실패 -> 다음 모델 시도`);
          break;
        } else {
          throw new Error(errMessage);
        }
      } catch (err) {
        lastError = err.message;
        if (attempt === 1) {
          await new Promise(r => setTimeout(r, 1000));
        } else {
          break;
        }
      }
    }
  }

  throw new Error(`모든 AI 모델 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요. (${lastError})`);
}

// 시 텍스트 파서 헬퍼 함수 (강화된 완결성 및 유연한 시작노트 파싱)
function parsePoem(rawText) {
  let title = '마음의 풍경';
  let bodyLines = [];
  let noteLines = [];
  let isNoteSection = false;

  const lines = (rawText || '').trim().split('\n');

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ') || trimmed.startsWith('# [') || /^#+\s+/.test(trimmed)) {
      title = trimmed.replace(/^#+\s*/, '').replace(/[\[\]"'«»]/g, '').trim();
    } else if (
      trimmed === '---' ||
      trimmed === '***' ||
      trimmed === '___' ||
      trimmed.startsWith('---') ||
      trimmed.startsWith('***') ||
      /^#*\s*(시작\s*노트|시인의\s*말|시인의\s*노트|작가의\s*말|작가의\s*노트)[:\]]?/i.test(trimmed) ||
      /^\[(시작\s*노트|시인의\s*말|시인의\s*노트)\]/i.test(trimmed)
    ) {
      isNoteSection = true;
      if (trimmed.startsWith('#') || trimmed.startsWith('[') || /^(시작|시인의|작가의)/.test(trimmed)) {
        continue;
      }
    } else if (isNoteSection) {
      noteLines.push(line);
    } else {
      bodyLines.push(line);
    }
  }

  let body = bodyLines.join('\n').trim();
  let notes = noteLines.join('\n').trim();

  // 만약 시작노트 구분선 없이 본문 끝에 합쳐진 경우 스마트 분리
  if (!notes) {
    const noteMatch = body.match(/\n\s*(?:###?\s*|\[)?(?:시작\s*노트|시인의\s*말|시인의\s*노트)[:\]]?\s*([\s\S]+)$/i);
    if (noteMatch) {
      notes = noteMatch[1].trim();
      body = body.slice(0, noteMatch.index).trim();
    }
  }

  return {
    title: title || '마음의 풍경',
    body: body || '바람이 불어오는 곳으로\n조용히 귀를 기울입니다.',
    notes: notes || '다섯 알의 낱말이 모여 가슴 한 켠에 작은 등불을 켭니다.'
  };
}

// =========================================================
// 8. 데모 모드 템플릿 엔진 (33인 시인별 맞춤형 서정 & 감정 결합)
// =========================================================
function generateDemoPoem(words, mood, emotion = '') {
  const [w1, w2, w3, w4, w5] = words;
  const poetInfo = POET_DATABASE[mood] || POET_DATABASE.yoon_dongju;
  const emotionSuffix = emotion ? ` (${emotion}의 정서를 담아)` : '';

  const demoTemplates = {
    yoon_dongju: {
      title: `${w1}과 별빛의 시간`,
      body: `밤하늘 높이 우러른 ${w1} 아래\n차마 부끄러운 고백들이 흩어지고,\n\n가만히 눈감으면 반짝이는 ${w2},\n홀로 걷는 길섶마다 드리운 ${w3}은\n어둠을 헤치고 나아갈 등불이 됩니다.\n\n마른 가슴에 띄운 한 조각 ${w4}를 쥐고\n첫 마음처럼 순결한 ${w5}을 맞이할 때,\n비로소 살아 있는 자아를 마주합니다.`,
      notes: `윤동주의 '하늘과 바람과 별과 시' 속 순결한 별빛처럼, 다섯 낱말(${words.join(', ')})로 깊은 내면의 참회를 엮었습니다.${emotion ? ` [반영 감정: ${emotion}]` : ''}`
    },
    kim_sowol: {
      title: `${w1}에 띄우는 ${w4}`,
      body: `먼동이 트기 전 가만히 부르면\n이슬 젖은 창턱에 머무는 ${w1},\n\n물결 위를 스쳐 가던 ${w2}처럼\n흘러간 세월은 잡을 길 없고\n가슴 깊이 고여 든 ${w3}만\n바람 끝에 흔들립니다.\n\n적어두지 못한 ${w4} 한 장\n가슴 한 켠에 접어 묻어두니\n어느새 저 하늘에서 내리는 ${w5},\n시린 대지를 다정히 덮어줍니다.`,
      notes: `김소월 시인의 '진달래꽃'에 깃든 민조적 7·5조 율격과 애절한 한(恨)으로 다섯 단어를 노래했습니다.${emotion ? ` [반영 감정: ${emotion}]` : ''}`
    },
    na_taeju: {
      title: `자세히 보아야 예쁜 ${w2}`,
      body: `풀잎 끝에 맺힌 ${w1}처럼\n너는 가만히 내게 다가왔다.\n\n햇살 부서지는 강가의 ${w2}보다\n더 눈부신 네 눈망울,\n가만히 불러보는 것만으로 벅찬 ${w3}.\n\n수줍게 건네지 못한 작은 ${w4} 속에\n너를 향한 봄날의 ${w5}이 곱게 피어난다.\n\n너는 나에게 참 좋은 사람이다.`,
      notes: `나태주 시인의 '풀꽃'처럼 소박하고 다정한 눈길로, 대상을 향한 순수한 사랑의 설렘을 담았습니다.${emotion ? ` [반영 감정: ${emotion}]` : ''}`
    },
    park_mokwol: {
      title: `고향 길, ${w1} 언덕에서`,
      body: `굽이굽이 산모롱이 돌아가면\n바람결에 피어나는 푸른 ${w1},\n\n개울가 바위 틈에 어린 ${w2} 따라\n송아지 울음소리 아련한 ${w3},\n\n흙 묻은 손으로 엮은 ${w4}가\n새소리에 실려 날아오르면\n산천 가득 피어오르는 ${w5}처럼\n넉넉한 대지가 품을 내어줍니다.`,
      notes: `박목월 시인의 '나그네'처럼 향토적 서정과 자연의 소박한 정취를 다섯 시어에 풀어냈습니다.${emotion ? ` [반영 감정: ${emotion}]` : ''}`
    },
    jung_hoseung: {
      title: `${w5}이 내리는 창가에서`,
      body: `울지 마라, 외로우니까 사람이다.\n저물어 가는 ${w1} 저편으로\n눈물방울마다 맺힌 ${w2}이 고와서,\n\n끝내 버리지 못한 질긴 ${w3}도\n서로의 등을 감싸 안는 다정한 위로가 된다.\n\n부치지 못한 ${w4}를 품에 안고서\n오늘 밤 소리 없이 내리는 ${w5}을 보라,\n상처 없는 영혼이 어디 있으랴.`,
      notes: `정호승 시인의 '사랑하다가 죽어버려라'처럼, 상처 입은 영혼을 감싸는 인간적 연민과 위로를 노래했습니다.${emotion ? ` [반영 감정: ${emotion}]` : ''}`
    },
    kim_chunsoo: {
      title: `${w1}의 이름과 ${w2}`,
      body: `내가 그의 이름을 불러 주기 전에는\n그는 다만 하나의 몸짓에 지나지 않았다.\n\n어둠 속에서 반짝이는 ${w1},\n그 빛을 향해 떨리는 ${w2}의 그림자.\n\n내가 그의 이름을 불러 주었을 때\n비로소 피어난 아득한 ${w3}은,\n너와 나 사이에 건너간 ${w4}가 되어\n어느 눈부신 ${w5}의 언어로 피어났다.`,
      notes: `김춘수 시인의 '꽃'처럼, 존재의 본질을 인식하고 명명하는 순수 관념의 시학을 담았습니다.${emotion ? ` [반영 감정: ${emotion}]` : ''}`
    },
    yi_sang: {
      title: `제13인의 ${w1}`,
      body: `13인의아해가도로로질주하오.\n길은막다른미로가적당하오.\n\n거울속의 ${w1}은왼손잡이오.\n부서지는 ${w2}의파편들,\n분열된내면에서꿈틀거리는 ${w3}.\n\n한장의 ${w4}는불타고있소.\n공포와전율사이로쏟아지는 ${w5},\n그곳에무서운아해와무서워하는아해가있소.`,
      notes: `이상 시인의 '오감도'처럼 전위적인 파격과 모더니즘의 심연을 다섯 단어로 해체하고 재구성했습니다.${emotion ? ` [반영 감정: ${emotion}]` : ''}`
    },
    han_kang: {
      title: `서랍 속의 ${w1}과 저녁`,
      body: `서랍 속에 저녁을 넣어 두었다.\n문틈으로 흘러나오는 서늘한 ${w1}.\n\n투명한 유리창에 맺힌 ${w2}을 닦아내면\n말해지지 않은 침묵의 ${w3}이 고이고,\n\n조용히 어루만지는 낡은 ${w4} 한 줄에\n차마 흘리지 못한 ${w5}이 촛불처럼 번져온다.\n우리는 고통을 통과해 겨우 빛이 된다.`,
      notes: `한강 시인의 '서랍에 저녁을 넣어 두었다'처럼, 서늘하고 투명한 고통의 심연과 침묵의 빛을 엮었습니다.${emotion ? ` [반영 감정: ${emotion}]` : ''}`
    },
    park_joon: {
      title: `당신의 ${w1}을 지어다가`,
      body: `그리움도 오래되면 미열이 된다.\n어둠 내린 저 길목 아래 웅크린 ${w1},\n\n물기 묻은 유리창에 비친 ${w2}을 보며\n며칠은 앓았고 며칠은 ${w3}을 삼켰다.\n\n우리가 함께 부치지 못한 ${w4}는\n찬 방바닥 위에 소리 없이 흩어지고,\n첫 새벽 내리는 ${w5}을 이불 삼아\n당신의 이름을 가만히 불러보았다.`,
      notes: `박준 시인의 '당신의 이름을 지어다가 며칠은 먹었다'처럼, 쓸쓸하고 다정한 일상의 슬픔을 담았습니다.${emotion ? ` [반영 감정: ${emotion}]` : ''}`
    },
    hwang_inchan: {
      title: `기쁜 ${w1}과 여백`,
      body: `빛이 드는 방에서 우리는 가만히 앉아 있었다.\n탁자 위에 놓인 작은 ${w1},\n\n창밖으로 흐르는 맑은 ${w2}을 보며\n말하지 않아도 충분한 ${w3}을 나누었다.\n\n서랍에 넣어 둔 짧은 ${w4}처럼\n지나가는 세월 끝에 내리는 ${w5},\n아름다운 것은 언제나 조용히 도착한다.`,
      notes: `황인찬 시인의 '기쁜 이와 함께 나를 나눌 것'처럼, 군더더기 없는 절제와 투명한 여백의 서정을 노래했습니다.${emotion ? ` [반영 감정: ${emotion}]` : ''}`
    }
  };

  if (demoTemplates[mood]) {
    return demoTemplates[mood];
  }

  // 그 외 33인 시인들을 위한 정밀 맞춤 생성기
  return {
    title: `${poetInfo.name} 풍의 ${w1}과 ${w5}${emotionSuffix}`,
    body: `바람이 머물다 가는 자리에서\n가만히 흔들리는 ${w1},\n\n지나간 시간의 잔물결 위로\n아스라이 부서지는 ${w2}의 기억들.\n마음의 심연에 고여 든 ${w3}은\n어둠을 밝히는 한 줄기 빛이 된다.\n\n적어두지 못한 ${w4}를 마음에 품고\n다시금 고요히 대지에 내리는 ${w5},\n생의 침묵 속에 가장 순결한 언어로 피어난다.`,
    notes: `${poetInfo.name} 시인의 대표작 '${poetInfo.work}'의 시풍(${poetInfo.desc})을 기리며, 다섯 단어(${words.join(', ')})로 깊은 서정을 길어 올렸습니다.${emotion ? ` [부여된 감정: ${emotion}]` : ''}`
  };
}

// =========================================================
// 9. 시 렌더링 및 하이라이팅
// =========================================================
function renderPoem(poemData, words, isLiveAI = false) {
  state.currentPoem = poemData;

  poemTitle.textContent = poemData.title;
  poemNotes.innerHTML = poemData.notes;

  const poetInfo = POET_DATABASE[state.selectedMood] || POET_DATABASE.yoon_dongju;
  const voiceInfo = GOOGLE_TTS_VOICES[state.selectedVoiceName] || GOOGLE_TTS_VOICES.Iapetus;
  const voiceDisplayName = poemData.voice_name || state.selectedVoiceName;

  if (poemData.poet) {
    const modelText = isLiveAI ? geminiModelSelect.options[geminiModelSelect.selectedIndex].text.split(' (')[0] : '시원 AI';
    poemAuthorTag.textContent = `${poemData.poet} 시풍 · ${modelText} · 낭송: Google ${voiceDisplayName} (${voiceInfo.trait})`;
  } else if (isLiveAI) {
    const modelText = geminiModelSelect.options[geminiModelSelect.selectedIndex].text.split(' (')[0];
    poemAuthorTag.textContent = `${poetInfo.name} 시풍 · ${modelText} · 낭송: Google ${voiceDisplayName} (${voiceInfo.trait})`;
  } else {
    poemAuthorTag.textContent = `${poetInfo.name} 시풍 · 시원(詩苑) 시인 · 낭송: Google ${voiceDisplayName} (${voiceInfo.trait})`;
  }

  // 시 문단(연, Stanza) 및 문단 내 행(Line) 단위 분할 렌더링
  const rawStanzas = poemData.body.split(/\n\s*\n/);
  const stanzasHtml = rawStanzas.map((stanzaText, sIndex) => {
    const rawLines = stanzaText.split('\n');
    const linesHtml = rawLines.map((lineText, lIndex) => {
      let formattedLine = escapeHtml(lineText);
      words.forEach(w => {
        if (w) {
          const regex = new RegExp(`(${escapeRegex(w)})`, 'gi');
          formattedLine = formattedLine.replace(regex, '<span class="highlight-word">$1</span>');
        }
      });
      return `<div class="poem-line" id="poemLine-${sIndex}-${lIndex}" data-stanza="${sIndex}" data-line="${lIndex}">${formattedLine || '&nbsp;'}</div>`;
    }).join('');

    return `<div class="poem-stanza" id="poemStanza-${sIndex}" data-stanza-index="${sIndex}">${linesHtml}</div>`;
  }).join('');

  poemBody.innerHTML = stanzasHtml;
  poemContentArea.classList.remove('hidden');
  poemActions.classList.remove('hidden');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =========================================================
// 10. 시 텍스트 복사 및 캔버스 카드 이미지 저장
// =========================================================
function copyPoemToClipboard() {
  if (!state.currentPoem) return;

  const copyText = `[${state.currentPoem.title}]\n\n${state.currentPoem.body}\n\n- 시인의 노트: ${poemNotes.textContent}`;
  navigator.clipboard.writeText(copyText).then(() => {
    showToast('시 텍스트가 클립보드에 복사되었습니다 📋');
  }).catch(() => {
    showToast('복사에 실패했습니다.');
  });
}

function downloadPoemCardImage() {
  if (!state.currentPoem) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const width = 800;
  const padding = 60;
  const lines = state.currentPoem.body.split('\n');
  const lineHeight = 38;
  const titleHeight = 90;
  const footerHeight = 120;
  const totalHeight = padding * 2 + titleHeight + (lines.length * lineHeight) + footerHeight;

  canvas.width = width;
  canvas.height = Math.max(700, totalHeight);

  ctx.fillStyle = '#fcfaf6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#dcd3c3';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  ctx.strokeStyle = '#ede4d4';
  ctx.lineWidth = 1;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

  ctx.fillStyle = '#18181b';
  ctx.font = 'bold 34px "Gowun Batang", "Noto Serif KR", serif';
  ctx.textAlign = 'center';
  ctx.fillText(state.currentPoem.title, width / 2, padding + 45);

  ctx.strokeStyle = '#baa891';
  ctx.beginPath();
  ctx.moveTo(width / 2 - 50, padding + 70);
  ctx.lineTo(width / 2 + 50, padding + 70);
  ctx.stroke();

  ctx.fillStyle = '#27272a';
  ctx.font = '20px "Gowun Batang", "Noto Serif KR", serif';
  ctx.textAlign = 'center';

  let currentY = padding + titleHeight + 20;
  for (let line of lines) {
    ctx.fillText(line, width / 2, currentY);
    currentY += lineHeight;
  }

  const sealSize = 46;
  const sealX = width - padding - 60;
  const sealY = canvas.height - padding - 60;

  ctx.strokeStyle = '#991b1b';
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(153, 27, 27, 0.05)';
  ctx.fillRect(sealX, sealY, sealSize, sealSize);
  ctx.strokeRect(sealX, sealY, sealSize, sealSize);

  ctx.fillStyle = '#991b1b';
  ctx.font = 'bold 13px "Gowun Batang", serif';
  ctx.textAlign = 'center';
  ctx.fillText('心月', sealX + sealSize / 2, sealY + 20);
  ctx.fillText('吟詠', sealX + sealSize / 2, sealY + 36);

  ctx.fillStyle = '#71717a';
  ctx.font = '14px "Pretendard", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('시원(詩苑) · 서정시 창작소', padding + 20, canvas.height - padding - 20);

  const link = document.createElement('a');
  link.download = `${state.currentPoem.title}_시원.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();

  showToast('아름다운 시 카드가 이미지(PNG)로 저장되었습니다 🖼️');
}

// ---------------------------------------------------------
// 11. Web Audio API 빗소리 신디사이저 (보조 앰비언트)
// ---------------------------------------------------------
let audioCtx = null;
let rainGainNode = null;
let rainNoiseNode = null;

function toggleRainSound() {
  if (state.isRainPlaying) {
    stopRainSound();
  } else {
    startRainSound();
  }
}

function startRainSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx) audioCtx = new AudioContext();

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    rainNoiseNode = audioCtx.createBufferSource();
    rainNoiseNode.buffer = noiseBuffer;
    rainNoiseNode.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(850, audioCtx.currentTime);

    rainGainNode = audioCtx.createGain();
    rainGainNode.gain.setValueAtTime(0.01, audioCtx.currentTime);
    rainGainNode.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 1.5);

    rainNoiseNode.connect(filter);
    filter.connect(rainGainNode);
    rainGainNode.connect(audioCtx.destination);

    rainNoiseNode.start();
    state.isRainPlaying = true;
    ambientSoundBtn.classList.add('active');
    ambientSoundBtn.querySelector('.text').textContent = '빗소리 끄기';
    showToast('창밖의 잔잔한 빗소리가 흐릅니다 🌧️');
  } catch (err) {
    console.error('오디오 에러:', err);
    showToast('오디오를 시작할 수 없습니다.');
  }
}

function stopRainSound() {
  if (rainGainNode && audioCtx) {
    rainGainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8);
    setTimeout(() => {
      if (rainNoiseNode) {
        rainNoiseNode.stop();
        rainNoiseNode.disconnect();
      }
      state.isRainPlaying = false;
      ambientSoundBtn.classList.remove('active');
      ambientSoundBtn.querySelector('.text').textContent = '빗소리 듣기';
    }, 800);
  } else {
    state.isRainPlaying = false;
    ambientSoundBtn.classList.remove('active');
    ambientSoundBtn.querySelector('.text').textContent = '빗소리 듣기';
  }
}

// DOM 준비 시 초기화
document.addEventListener('DOMContentLoaded', init);
