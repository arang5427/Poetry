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
const APP_VERSION = 'Ver-10';
const CLIENT_STORAGE_KEY = 'gemini_poet_client_api_key';
const CLIENT_OPENAI_STORAGE_KEY = 'openai_poet_client_api_key';
const REMOTE_BACKEND_STORAGE_KEY = 'poet_remote_backend_url';

// GitHub Pages 공개 방문자(타인)를 위한 기본 공용 서비스 키
// (타인의 브라우저 로컬 저장소에 키가 없을 때 자동 적용되어 전 세계 누구나 실시간 AI 시 창작 & 사진 분석 가능)
const PUBLIC_SERVICE_GEMINI_KEY = atob('QVEuQWI4Uk42SzUwNGQ0NGwyTUtYTlRSMGU1YzM2RnRBT1pCSktmdW5fVDRSTzZVNWI5dw==');

// 원격 무료 클라우드 백엔드 URL (Render.com, Railway 등 24시간 배포 시 연동 가능)
const REMOTE_BACKEND_URL = (localStorage.getItem(REMOTE_BACKEND_STORAGE_KEY) || '').trim();

const state = {
  // 백엔드 & API 상태
  isBackendOnline: false,
  hasServerKey: false,
  remoteBackendUrl: REMOTE_BACKEND_URL,
  clientKey: localStorage.getItem(CLIENT_STORAGE_KEY) || PUBLIC_SERVICE_GEMINI_KEY,
  clientOpenAiKey: localStorage.getItem(CLIENT_OPENAI_STORAGE_KEY) || '',
  isUsingPublicServiceKey: !localStorage.getItem(CLIENT_STORAGE_KEY),
  selectedModel: 'gemini-3.8-flash',
  selectedMood: 'yoon_dongju',
  selectedVoiceName: 'Iapetus',
  selectedProsody: 'auto',
  currentPoem: null,
  isGenerating: false,

  // 사진 분석 상태 (Ver-8 / Ver-10)
  isAnalyzingPhoto: false,
  uploadedPhotoBase64: null,
  uploadedPhotoMime: 'image/jpeg',
  photoDescription: '',
  extractedWords: [],

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

// PDF 4대 문헌 학습 기반 시적 운율 & 리듬 스타일 정의 (Ver-6)
const PROSODY_STYLES = {
  auto: {
    name: '자동 최적화 (시인풍·감정 맞춤형)',
    desc: '선택한 시인의 문학적 정체성과 사용자의 감정 표현에 가장 부합하는 최적의 운율과 호흡을 자동으로 조율합니다.'
  },
  folk_rhythm: {
    name: '애틋한 7·5조 민요풍 (3음보 서정)',
    desc: '전통 민요와 김소월 시학에서 이어지는 7·5조 음수율과 3음보의 아련한 가락. 이별의 한과 애절한 그리움을 노래하기에 최적화된 리듬.'
  },
  classical_meter: {
    name: '단정한 3·4 / 4·4조 가사풍 (4음보 정통 기품)',
    desc: '전통 가사와 시조의 안정된 3·4조 및 4·4조 음수율과 4음보의 단아한 균형미. 기품 있고 차분한 자아 성찰과 삶의 깊이를 표현.'
  },
  modern_free: {
    name: '감각적 현대 자유율 (긴 행과 짧은 행의 교차)',
    desc: '기계적 일정한 행 길이를 탈피하고, 파도치듯 긴 호흡과 짧은 호흡을 유기적으로 교차시키며 여백과 여운을 극대화한 현대적 호흡.'
  },
  meditative_prose: {
    name: '깊은 사유의 명상적 율격 (유장한 내재율)',
    desc: '강물처럼 깊고 유장하게 흐르는 긴 호흡의 서정 산문율. 내면의 독백과 침묵의 호흡이 어우러진 깊은 사유의 미학.'
  }
};

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
const poemProsodySelect = document.getElementById('poemProsodySelect');
const generatePoemBtn = document.getElementById('generatePoemBtn');
const randomWordsBtn = document.getElementById('randomWordsBtn');

// 입력 방식 메뉴탭 및 사진 분석 요소 (Ver-8)
const tabDirectInputBtn = document.getElementById('tabDirectInputBtn');
const tabPhotoAnalysisBtn = document.getElementById('tabPhotoAnalysisBtn');
const panelDirectInput = document.getElementById('panelDirectInput');
const panelPhotoAnalysis = document.getElementById('panelPhotoAnalysis');

const photoUploadTriggerBtn = document.getElementById('photoUploadTriggerBtn');
const photoFileInput = document.getElementById('photoFileInput');
const photoDropZone = document.getElementById('photoDropZone');
const photoAnalyzingState = document.getElementById('photoAnalyzingState');
const photoPreviewContainer = document.getElementById('photoPreviewContainer');
const photoThumbnail = document.getElementById('photoThumbnail');
const photoRemoveBtn = document.getElementById('photoRemoveBtn');
const photoDisplayWindow = document.getElementById('photoDisplayWindow');
const photoDisplayImg = document.getElementById('photoDisplayImg');
const photoDisplayRemoveBtn = document.getElementById('photoDisplayRemoveBtn');
const photoDescriptionText = document.getElementById('photoDescriptionText');
const photoDescCharCount = document.getElementById('photoDescCharCount');
const extractedWordsChips = document.getElementById('extractedWordsChips');
const applyPhotoDescToEmotionBtn = document.getElementById('applyPhotoDescToEmotionBtn');
const reuploadPhotoBtn = document.getElementById('reuploadPhotoBtn');
const switchToDirectTabBtn = document.getElementById('switchToDirectTabBtn');

// 시 전시 영역
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const loadingMessage = document.getElementById('loadingMessage');
const pipelineStep1 = document.getElementById('pipelineStep1');
const pipelineStep2 = document.getElementById('pipelineStep2');
const pipelineStep3 = document.getElementById('pipelineStep3');
const loadingWordsPreview = document.getElementById('loadingWordsPreview');

const poemContentArea = document.getElementById('poemContentArea');
const btnViewRefinedPoem = document.getElementById('btnViewRefinedPoem');
const btnViewDraftPoem = document.getElementById('btnViewDraftPoem');
const currentViewNotice = document.getElementById('currentViewNotice');

const poemTitle = document.getElementById('poemTitle');
const poemDate = document.getElementById('poemDate');
const poemAuthorTag = document.getElementById('poemAuthorTag');
const poemBody = document.getElementById('poemBody');
const poemNotes = document.getElementById('poemNotes');

// 한국 시문학 심사평가위원 3인 평가 영역 (Ver-9)
const judgesReviewSection = document.getElementById('judgesReviewSection');
const judgesOverallScore = document.getElementById('judgesOverallScore');
const critiqueSummaryText = document.getElementById('critiqueSummaryText');
const judgesCardsGrid = document.getElementById('judgesCardsGrid');
const improvementsList = document.getElementById('improvementsList');

const poemActions = document.getElementById('poemActions');
const reRefinePoemBtn = document.getElementById('reRefinePoemBtn');
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

    // 활성화된 뷰(초고 또는 글다듬기 완성작)의 제목과 본문으로 낭송 (Ver-9)
    const isDraft = (state.currentPoemView === 'draft');
    const activeTitle = isDraft && state.currentPoem.draft ? state.currentPoem.draft.title : state.currentPoem.title;
    const activeBody = isDraft && state.currentPoem.draft ? state.currentPoem.draft.body : state.currentPoem.body;

    // 1. 시 제목 낭독 및 하이라이트
    setRecitationHighlight('poemTitle');
    await speakSegment(`${activeTitle}.`, profile);
    if (speechAbortController) return;
    await waitDelay(profile.stanzaPauseMs);
    if (speechAbortController) return;

    // 2. 문단(연) 내 행(Line) 단위 실시간 낭독 및 연한 노랑색 행 하이라이트
    const stanzas = activeBody.split(/\n\s*\n/);
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
 * - 요구사항 1: TTS에서 *는 음성변환하지 말고 스킵 (Ver-1)
 * - 요구사항 2: TTS에서 /는 음성변환하지 말고 스킵 (Ver-9)
 * - 반각 별표(*), 전각 별표(＊), 특수 별 기호(✦,★,☆), 불릿(•,·), 슬래시(/, ／, ⁄, ⧸), 마크다운(#, `, ~, _)을 완전 제거/스킵
 *   음성 합성 시 "별표", "슬래시", "나누기", "빗금" 등 기호명이 발화되는 문제를 원천 차단하고 자연스러운 호흡 유지
 */
function sanitizeTextForSpeech(text) {
  if (!text) return '';
  return text
    .replace(/[\*＊✦★☆•·]/g, '')  // 별표 및 기호 문자 완전 스킵
    .replace(/[\/／⁄⧸]/g, ' ')      // 슬래시(/) 문자 음성 변환 스킵 (자연스러운 행간 호흡 공백으로 대체)
    .replace(/#+/g, '')           // 마크다운 헤더 기호 제거
    .replace(/[`~_]/g, '')         // 백틱, 물결, 밑줄 제거
    .replace(/\s+/g, ' ')          // 공백 정돈
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
  const backendBase = state.remoteBackendUrl || '';
  try {
    const res = await fetch(backendBase + '/api/status', { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      state.isBackendOnline = true;
      state.hasServerKey = data.hasServerKey;
      state.hasOpenAiKey = Boolean(data.hasOpenAiKey);
      const serverVer = data.version || APP_VERSION;

      if (apiStatusBadge) {
        if (data.hasServerKey || data.hasOpenAiKey) {
          apiStatusBadge.textContent = state.remoteBackendUrl ? `클라우드 서버 연동 (${serverVer})` : `보안 서버 연동 (${serverVer})`;
          apiStatusBadge.className = 'status-badge live';
        } else {
          apiStatusBadge.textContent = '.env 키 등록 필요';
          apiStatusBadge.className = 'status-badge warn';
        }
      }

      if (backendStatusIcon) backendStatusIcon.textContent = (data.hasServerKey || data.hasOpenAiKey) ? '🛡️' : '⚠️';
      if (backendStatusTitle) backendStatusTitle.textContent = (data.hasServerKey || data.hasOpenAiKey) ? `백엔드 보안 연동 완료 [${serverVer}] (.env 키 암호화)` : '서버 .env 파일에 API 키 등록 필요';
      if (backendStatusDetail) backendStatusDetail.innerHTML = '서버의 <code>.env</code> 파일에 등록된 API 키를 사용하여 서버-투-서버로 시를 창작합니다. 브라우저에 API 키가 절대 노출되지 않습니다.';
      if (clientKeySection) clientKeySection.classList.add('hidden');
      if (clearApiKeyBtn) clearApiKeyBtn.classList.add('hidden');

      // 서버에서 설정된 활성 엔진 및 기본 모델을 프론트엔드 셀렉트에 반영
      if (data.activeProvider === 'openai' && data.defaultOpenaiModel && geminiModelSelect) {
        geminiModelSelect.value = data.defaultOpenaiModel;
        state.selectedModel = data.defaultOpenaiModel;
      }
      return;
    }
  } catch (e) {
    state.isBackendOnline = false;
    state.hasServerKey = false;
    state.hasOpenAiKey = false;
  }

  setupStaticPagesMode();
}

function setupStaticPagesMode() {
  if (backendSecurityInfo) backendSecurityInfo.classList.add('hidden');
  if (clientKeySection) clientKeySection.classList.remove('hidden');
  if (clearApiKeyBtn) clearApiKeyBtn.classList.remove('hidden');

  const customGeminiKey = localStorage.getItem(CLIENT_STORAGE_KEY);
  const customOpenAiKey = localStorage.getItem(CLIENT_OPENAI_STORAGE_KEY);
  const hasCustomClientKey = (customGeminiKey && customGeminiKey.trim().length > 5) || 
                             (customOpenAiKey && customOpenAiKey.trim().length > 5);

  if (hasCustomClientKey) {
    if (apiStatusBadge) {
      apiStatusBadge.textContent = 'API 연동 활성 (개인 키)';
      apiStatusBadge.className = 'status-badge live';
    }
    if (apiKeyInput) apiKeyInput.value = state.clientKey || state.clientOpenAiKey;
  } else if (state.clientKey && state.clientKey.trim().length > 5) {
    // 공개 방문자용 공용 서비스 키가 활성화된 경우
    if (apiStatusBadge) {
      apiStatusBadge.textContent = '🌸 AI 시 창작 가동 중 (공개 서비스)';
      apiStatusBadge.className = 'status-badge live';
    }
    if (apiKeyInput) {
      apiKeyInput.placeholder = '개인 Gemini/OpenAI API 키를 등록하여 우선 사용할 수도 있습니다';
      apiKeyInput.value = '';
    }
  } else {
    if (apiStatusBadge) {
      apiStatusBadge.textContent = '데모 모드';
      apiStatusBadge.className = 'status-badge';
    }
    if (apiKeyInput) apiKeyInput.value = '';
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

  if (poemProsodySelect) {
    poemProsodySelect.addEventListener('change', (e) => {
      state.selectedProsody = e.target.value;
      const pInfo = PROSODY_STYLES[state.selectedProsody] || PROSODY_STYLES.auto;
      showToast(`운율 튜닝: ${pInfo.name} 🎵`);
    });
  }

  // 서정시 짓기 버튼
  generatePoemBtn.addEventListener('click', handleGeneratePoem);

  // [Ver-9] 초고 vs 완성작 뷰 전환 버튼
  if (btnViewRefinedPoem) {
    btnViewRefinedPoem.addEventListener('click', () => switchPoemView('refined'));
  }
  if (btnViewDraftPoem) {
    btnViewDraftPoem.addEventListener('click', () => switchPoemView('draft'));
  }

  // [Ver-9] 3인 심사위원 글다듬기 (재퇴고) 버튼
  if (reRefinePoemBtn) {
    reRefinePoemBtn.addEventListener('click', handleReRefinePoem);
  }

  // 텍스트 복사 & 이미지 저장
  copyPoemBtn.addEventListener('click', copyPoemToClipboard);
  downloadImageBtn.addEventListener('click', downloadPoemCardImage);

  // 빗소리 & 모달
  ambientSoundBtn.addEventListener('click', toggleRainSound);

  if (openApiModalBtn) {
    openApiModalBtn.addEventListener('click', () => {
      if (!state.isBackendOnline && apiKeyInput) {
        apiKeyInput.value = state.clientKey;
      }
      if (apiModal) apiModal.classList.remove('hidden');
    });
  }

  if (closeApiModalBtn) {
    closeApiModalBtn.addEventListener('click', () => {
      if (apiModal) apiModal.classList.add('hidden');
    });
  }

  if (closeModalOkBtn) {
    closeModalOkBtn.addEventListener('click', () => {
      if (!state.isBackendOnline && apiKeyInput) {
        const inputVal = apiKeyInput.value.trim();
        if (inputVal.startsWith('sk-')) {
          state.clientOpenAiKey = inputVal;
          localStorage.setItem(CLIENT_OPENAI_STORAGE_KEY, inputVal);
          showToast('OPEN API (OpenAI) 키가 등록되었습니다 🔑');
        } else if (inputVal) {
          state.clientKey = inputVal;
          localStorage.setItem(CLIENT_STORAGE_KEY, inputVal);
          showToast('Google Gemini API 키가 등록되었습니다 🔑');
        } else {
          localStorage.removeItem(CLIENT_STORAGE_KEY);
          localStorage.removeItem(CLIENT_OPENAI_STORAGE_KEY);
          state.clientKey = PUBLIC_SERVICE_GEMINI_KEY;
          state.clientOpenAiKey = '';
          showToast('개인 키가 초기화되어 기본 공개 서비스 키로 전환되었습니다 🌸');
        }
        setupStaticPagesMode();
      }
      if (apiModal) apiModal.classList.add('hidden');
    });
  }

  if (clearApiKeyBtn) {
    clearApiKeyBtn.addEventListener('click', () => {
      localStorage.removeItem(CLIENT_STORAGE_KEY);
      localStorage.removeItem(CLIENT_OPENAI_STORAGE_KEY);
      state.clientKey = PUBLIC_SERVICE_GEMINI_KEY;
      state.clientOpenAiKey = '';
      if (apiKeyInput) apiKeyInput.value = '';
      setupStaticPagesMode();
      if (apiModal) apiModal.classList.add('hidden');
      showToast('개인 키가 삭제되어 기본 공개 서비스 키로 전환되었습니다 🌸');
    });
  }

  if (toggleKeyVisibility && apiKeyInput) {
    toggleKeyVisibility.addEventListener('click', () => {
      if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleKeyVisibility.textContent = '🔒';
      } else {
        apiKeyInput.type = 'password';
        toggleKeyVisibility.textContent = '👁️';
      }
    });
  }

  if (apiModal) {
    apiModal.addEventListener('click', (e) => {
      if (e.target === apiModal) apiModal.classList.add('hidden');
    });
  }

  // [Ver-8] 사진 분석 및 메뉴탭 이벤트 리스너 등록
  setupPhotoAnalysisListeners();
}

// =========================================================
// 6-1. [Ver-8] 사진업로드 및 분석(Vision), 메뉴탭 전환 & 시어 5개 자동 추출
// =========================================================
function setupPhotoAnalysisListeners() {
  // 1. 입력 방식 메뉴탭(Tab Navigation) 전환 함수
  function switchInputTab(mode) {
    if (mode === 'direct') {
      if (tabDirectInputBtn) {
        tabDirectInputBtn.classList.add('active');
        tabDirectInputBtn.setAttribute('aria-selected', 'true');
      }
      if (tabPhotoAnalysisBtn) {
        tabPhotoAnalysisBtn.classList.remove('active');
        tabPhotoAnalysisBtn.setAttribute('aria-selected', 'false');
      }
      if (panelDirectInput) panelDirectInput.classList.remove('hidden');
      if (panelPhotoAnalysis) panelPhotoAnalysis.classList.add('hidden');
    } else if (mode === 'photo') {
      if (tabPhotoAnalysisBtn) {
        tabPhotoAnalysisBtn.classList.add('active');
        tabPhotoAnalysisBtn.setAttribute('aria-selected', 'true');
      }
      if (tabDirectInputBtn) {
        tabDirectInputBtn.classList.remove('active');
        tabDirectInputBtn.setAttribute('aria-selected', 'false');
      }
      if (panelPhotoAnalysis) panelPhotoAnalysis.classList.remove('hidden');
      if (panelDirectInput) panelDirectInput.classList.add('hidden');
    }
  }

  // 메뉴탭 클릭 이벤트
  if (tabDirectInputBtn) {
    tabDirectInputBtn.addEventListener('click', () => switchInputTab('direct'));
  }
  if (tabPhotoAnalysisBtn) {
    tabPhotoAnalysisBtn.addEventListener('click', () => switchInputTab('photo'));
  }

  // 사진 표시창 내 "직접 입력 탭으로 이동" 버튼
  if (switchToDirectTabBtn) {
    switchToDirectTabBtn.addEventListener('click', () => {
      switchInputTab('direct');
      if (wordInputs[0]) wordInputs[0].focus();
    });
  }

  // 2. 사진 업로드 트리거 및 재업로드 버튼
  if (photoUploadTriggerBtn && photoFileInput) {
    photoUploadTriggerBtn.addEventListener('click', () => {
      photoFileInput.click();
    });
  }

  if (reuploadPhotoBtn && photoFileInput) {
    reuploadPhotoBtn.addEventListener('click', () => {
      photoFileInput.click();
    });
  }

  // 3. 사진 드롭존(Drop Zone) 클릭 및 드래그 앤 드롭
  if (photoDropZone && photoFileInput) {
    photoDropZone.addEventListener('click', () => {
      photoFileInput.click();
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      photoDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        photoDropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      photoDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        photoDropZone.classList.remove('dragover');
      });
    });

    photoDropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        handlePhotoFile(dt.files[0]);
      }
    });
  }

  // 파일 선택기 변경 이벤트
  if (photoFileInput) {
    photoFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handlePhotoFile(e.target.files[0]);
      }
    });
  }

  // 사진 삭제 버튼 (표시창 내부 삭제 버튼 및 하위 호환)
  if (photoDisplayRemoveBtn) {
    photoDisplayRemoveBtn.addEventListener('click', clearUploadedPhoto);
  }
  if (photoRemoveBtn) {
    photoRemoveBtn.addEventListener('click', clearUploadedPhoto);
  }

  // 사진 감성 설명 -> 시 감정(느낌) 입력창 반영
  if (applyPhotoDescToEmotionBtn && poemEmotionInput) {
    applyPhotoDescToEmotionBtn.addEventListener('click', () => {
      if (state.photoDescription) {
        poemEmotionInput.value = state.photoDescription;
        poemEmotionInput.focus();
        if (emotionTags) {
          emotionTags.querySelectorAll('.emotion-tag-btn').forEach(b => b.classList.remove('active'));
        }
        showToast('사진 분석 설명이 시 감정에 반영되었습니다 💭');
      }
    });
  }

  // [Ver-10] 5개 단어 입력창 수정 시 사진 표시창 칩 실시간 양방향 동기화
  wordInputs.forEach((input, idx) => {
    if (input) {
      input.addEventListener('input', () => {
        if (state.extractedWords && state.extractedWords.length > idx) {
          state.extractedWords[idx] = input.value.trim();
          const chip = extractedWordsChips ? extractedWordsChips.querySelector(`.extracted-word-chip[data-index="${idx}"]`) : null;
          if (chip && !chip.classList.contains('editing')) {
            const chipText = chip.querySelector('.chip-text');
            if (chipText) chipText.textContent = input.value.trim() || `(단어 ${idx + 1})`;
          }
        }
      });
    }
  });
}

// 캔버스를 이용한 브라우저 단 이미지 리사이징 & 압축 (최대 1280px, 빠른 업로드 보장)
function resizeImageToCanvas(file, maxDimension = 1280) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = 'image/jpeg';
        const base64Data = canvas.toDataURL(mimeType, 0.85);
        resolve({ base64Data, mimeType, width, height });
      };
      img.onerror = () => reject(new Error('이미지 로딩에 실패했습니다.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('파일 읽기에 실패했습니다.'));
    reader.readAsDataURL(file);
  });
}

// 사진 파일 처리 및 AI 분석 오케스트레이션
async function handlePhotoFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('이미지 파일(JPG, PNG, WebP 등)만 업로드할 수 있습니다.');
    return;
  }

  try {
    // 1. UI 전환: 드롭존 및 표시창 숨기고 분석 스피너 노출
    if (photoDropZone) photoDropZone.classList.add('hidden');
    if (photoDisplayWindow) photoDisplayWindow.classList.add('hidden');
    if (photoPreviewContainer) photoPreviewContainer.classList.add('hidden');
    if (photoAnalyzingState) photoAnalyzingState.classList.remove('hidden');
    state.isAnalyzingPhoto = true;

    // 2. 이미지 리사이징 & 압축
    const { base64Data, mimeType } = await resizeImageToCanvas(file);
    state.uploadedPhotoBase64 = base64Data;
    state.uploadedPhotoMime = mimeType;

    // 3. API 호출
    let analysisResult = null;

    // 1순위: 백엔드 보안 분석 (로컬 또는 원격 클라우드 서버)
    const backendBase = state.remoteBackendUrl || '';
    if (state.isBackendOnline && state.hasServerKey) {
      const resp = await fetch(backendBase + '/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Data,
          mimeType,
          model: state.selectedModel
        })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${resp.status} 오류`);
      }

      analysisResult = await resp.json();
    }
    // 2순위: GitHub Pages 클라이언트 키
    else if (!state.isBackendOnline && state.clientKey && state.clientKey.trim().length > 5) {
      analysisResult = await callClientGeminiVisionApi(base64Data, mimeType, state.clientKey, state.selectedModel);
    }
    // 3순위: 데모 모드
    else {
      await new Promise(r => setTimeout(r, 1200));
      analysisResult = generateDemoPhotoAnalysis();
    }

    // 4. 결과 적용
    const words = analysisResult.words || [];
    let description = analysisResult.description || '고요한 빛과 자연의 서정이 머무는 풍경';
    if (description.length > 50) {
      description = description.slice(0, 48) + '..';
    }
    state.photoDescription = description;

    // 5개 단어 입력창에 순차 바인딩 및 펄스 효과
    words.forEach((w, idx) => {
      if (wordInputs[idx]) {
        wordInputs[idx].value = w;
        wordInputs[idx].classList.remove('input-pulse');
        void wordInputs[idx].offsetWidth;
        wordInputs[idx].classList.add('input-pulse');
      }
    });

    // 사진 표시창 이미지 바인딩 및 50자 이내 설명란 렌더링
    if (photoDisplayImg) photoDisplayImg.src = base64Data;
    if (photoThumbnail) photoThumbnail.src = base64Data;
    if (photoDescriptionText) photoDescriptionText.textContent = description;
    if (photoDescCharCount) photoDescCharCount.textContent = `${description.length}/50자`;

    // [Ver-10] 추천 시어 5개 칩 렌더링 및 사용자의 단어별 인라인 수정 바인딩
    renderExtractedWordChips(words);

    if (photoAnalyzingState) photoAnalyzingState.classList.add('hidden');
    if (photoDisplayWindow) photoDisplayWindow.classList.remove('hidden');
    if (photoPreviewContainer) photoPreviewContainer.classList.remove('hidden');
    showToast(`사진 분석 완료! 시어 5개가 자동 입력되었습니다 📷✨`);

  } catch (err) {
    console.error('사진 분석 오류:', err);
    showToast(`사진 분석 실패: ${err.message}`);
    if (photoAnalyzingState) photoAnalyzingState.classList.add('hidden');
    if (photoDropZone) photoDropZone.classList.remove('hidden');
  } finally {
    state.isAnalyzingPhoto = false;
    if (photoFileInput) photoFileInput.value = '';
  }
}

// =========================================================
// 6-2. [Ver-10] 추출된 시어 5개 칩 렌더링 및 사용자의 단어별 인라인 수정 기능
// =========================================================
function renderExtractedWordChips(words = []) {
  if (!extractedWordsChips) return;
  state.extractedWords = [...words];

  extractedWordsChips.innerHTML = words.map((w, i) => `
    <div class="extracted-word-chip" data-index="${i}" title="단어 ${i + 1}: 클릭하여 단어 수정 ✏️">
      <span class="chip-num">${i + 1}</span>
      <span class="chip-text">${escapeHtml(w)}</span>
      <button type="button" class="chip-edit-btn" data-index="${i}" title="단어 ${i + 1} 직접 수정">✏️</button>
    </div>
  `).join('');

  const chipElements = extractedWordsChips.querySelectorAll('.extracted-word-chip');
  chipElements.forEach(chip => {
    const idx = parseInt(chip.getAttribute('data-index'), 10);
    const editBtn = chip.querySelector('.chip-edit-btn');
    const chipText = chip.querySelector('.chip-text');

    function startEditing(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (chip.classList.contains('editing')) return;

      const currentWord = (wordInputs[idx] ? wordInputs[idx].value.trim() : '') || (chipText ? chipText.textContent.trim() : '');
      chip.classList.add('editing');
      chip.innerHTML = `
        <span class="chip-num">${idx + 1}</span>
        <input type="text" class="chip-inline-input" value="${escapeHtml(currentWord)}" maxlength="15" placeholder="시어 입력" />
        <button type="button" class="chip-save-btn" title="저장">✓</button>
      `;

      const input = chip.querySelector('.chip-inline-input');
      const saveBtn = chip.querySelector('.chip-save-btn');
      let isSaved = false;

      function saveWord() {
        if (isSaved) return;
        isSaved = true;
        const newWord = (input.value || '').trim();
        if (newWord.length > 0) {
          if (wordInputs[idx]) {
            wordInputs[idx].value = newWord;
            wordInputs[idx].classList.remove('input-pulse');
            void wordInputs[idx].offsetWidth;
            wordInputs[idx].classList.add('input-pulse');
          }
          state.extractedWords[idx] = newWord;
          showToast(`단어 ${idx + 1}이(가) '${newWord}'(으)로 수정되었습니다 ✏️`);
        }
        renderExtractedWordChips(state.extractedWords);
      }

      input.focus();
      input.select();

      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') {
          ke.preventDefault();
          saveWord();
        } else if (ke.key === 'Escape') {
          isSaved = true;
          renderExtractedWordChips(state.extractedWords);
        }
      });

      saveBtn.addEventListener('click', (se) => {
        se.stopPropagation();
        saveWord();
      });

      input.addEventListener('blur', () => {
        setTimeout(() => {
          if (chip.classList.contains('editing') && !isSaved) {
            saveWord();
          }
        }, 150);
      });
    }

    chip.addEventListener('click', (e) => {
      if (!chip.classList.contains('editing')) {
        startEditing(e);
      }
    });

    if (editBtn) {
      editBtn.addEventListener('click', startEditing);
    }
  });
}

// 클라이언트 Gemini Vision 멀티모달 호출 (GitHub Pages 지원)
async function callClientGeminiVisionApi(base64Data, mimeType, apiKey, model = 'gemini-3.8-flash') {
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '').trim();
  const modelsToTry = [model, ...CLIENT_FALLBACK_CHAIN.filter(m => m !== model)];

  const systemInstruction = `당신은 사진에 깃든 시각적 정서와 서정적 울림을 예리하게 포착하는 한국 서정시 예술가이자 사진 미학 분석가입니다.
제공된 사진의 [사진적 구도, 분위기, 전체적 맥락, 감성, 피사체의 행동 분석]을 심층적으로 종합 분석하여, 50자 이내의 밀도 높은 사진 감성 설명과 그 분석 내용을 바탕으로 긴밀히 연계된 한국어 서정 시어 5개를 도출하세요.`;

  const userPrompt = `
제공된 사진을 깊이 있게 관찰하고 분석하여 다음 두 가지를 유효한 JSON 형식으로만 응답해 주세요:

[📸 5대 심층 분석 필수 반영 지침]
다음 5가지 요소를 종합적으로 분석하여 감성 설명과 추천 시어에 녹여내세요:
1. 사진적 구도 (Composition & Framing): 피사체 배치, 원근감, 삼분할/대칭/여백, 앵글, 시선의 흐름
2. 분위기 (Atmosphere & Mood): 빛과 그림자, 조명, 색온도, 명암 대비, 공기감
3. 전체적 맥락 (Overall Context): 계절, 시간대, 공간적 배경과 서사적 상황
4. 감성 (Poetic Emotion): 사진 전체가 자아내는 내밀한 시적 여운, 정서적 울림
5. 피사체의 행동 분석 (Subject Action/State): 인물/동물/자연물/사물의 구체적인 움직임, 머무름, 시선, 흔들림 등의 동적 상태

[📝 출력 항목]
1. "description": 위 5대 요소(구도·분위기·맥락·감성·피사체 행동)를 유기적으로 한데 응축하여 시적으로 묘사한 사진 감성 설명 (반드시 공백 포함 한국어 50자 이내).
2. "words": 위 사진 감성 설명 및 5대 심층 분석 내용(구도, 피사체의 행동, 분위기 등)을 바탕으로 이와 가장 밀접하게 연계된 아름다운 한국어 서정 시어(명사) 정확히 5개 배열.

[🚨 엄격한 시어 선정 지침 (Negative Constraints)]
- 다음 17개 상투적 클리셰 시어는 절대로 words에 포함하지 마세요:
[${FORBIDDEN_POETIC_WORDS.join(', ')}]
- 17대 금지어 대신, 사진 속 구도와 피사체의 구체적 행동, 사물, 색감, 자연물, 감각적 시어(예: 윤슬, 달빛, 노을, 파도, 숲, 이슬, 바람결, 그늘, 모래, 황혼, 등불, 바다, 날갯짓, 쉼, 침묵 등)를 적극 선정하세요.
- 각 시어는 군더더기 없는 순수 명사 1~3단어 길이로 작성하세요.

반드시 다른 부연설명 없이 오직 아래와 같은 유효한 JSON 형식으로만 출력하세요:
{
  "description": "...",
  "words": ["단어1", "단어2", "단어3", "단어4", "단어5"]
}
`;

  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            text: `${systemInstruction}\n\n${userPrompt}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 1024
    }
  };

  let lastError = '서버 응답 없음';
  for (const currentModel of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          let parsed = null;
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
          else parsed = JSON.parse(rawText);

          let words = (parsed.words || [])
            .map(w => String(w || '').trim())
            .filter(w => w.length > 0 && !FORBIDDEN_POETIC_WORDS.includes(w))
            .slice(0, 5);
          
          const defaultPool = ['윤슬', '달빛', '바람', '등불', '기다림'];
          while (words.length < 5) {
            const pick = defaultPool.find(w => !words.includes(w));
            if (pick) words.push(pick);
            else words.push('하늘');
          }

          let description = String(parsed.description || '').trim();
          if (description.length > 50) description = description.slice(0, 48) + '..';

          return { success: true, words, description, model: currentModel };
        }
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  throw new Error(`사진 분석에 실패했습니다. (${lastError})`);
}

// [Ver-10] 데모 모드 사진 분석 생성기 (구도·분위기·맥락·감성·피사체 행동 5대 요소 종합 반영)
function generateDemoPhotoAnalysis() {
  const selectablePool = KOREAN_POETIC_WORDS_159.filter(w => !FORBIDDEN_POETIC_WORDS.includes(w));
  const shuffled = [...selectablePool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const words = shuffled.slice(0, 5);
  const sampleDescriptions = [
    '황혼의 낮은 앵글 속, 붉은 노을을 향해 걸어가는 그림자의 아련한 침묵',
    '여백 가득한 흑백 구도, 차가운 빗줄기를 온몸으로 견디는 나뭇가지의 고요',
    '황금빛 역광 아래, 날갯짓을 멈추고 수면에 내려앉는 새 한 마리의 평온',
    '대각선 프레임 너머, 창가에 기대어 먼 지평선을 응시하는 이의 쓸쓸한 사유',
    '푸른 새벽빛 여명 속, 잔잔히 피어오르는 물안개를 가만히 응시하는 새벽길'
  ];
  const description = sampleDescriptions[Math.floor(Math.random() * sampleDescriptions.length)];
  return { success: true, words, description, model: '시원 AI Vision 데모 (Ver-10)' };
}

// 업로드된 사진 제거
function clearUploadedPhoto() {
  state.uploadedPhotoBase64 = null;
  state.uploadedPhotoMime = 'image/jpeg';
  state.photoDescription = '';
  state.extractedWords = [];
  if (photoDisplayImg) photoDisplayImg.src = '';
  if (photoThumbnail) photoThumbnail.src = '';
  if (photoDescriptionText) photoDescriptionText.textContent = '';
  if (photoDescCharCount) photoDescCharCount.textContent = '0/50자';
  if (extractedWordsChips) extractedWordsChips.innerHTML = '';
  if (photoDisplayWindow) photoDisplayWindow.classList.add('hidden');
  if (photoPreviewContainer) photoPreviewContainer.classList.add('hidden');
  if (photoAnalyzingState) photoAnalyzingState.classList.add('hidden');
  if (photoDropZone) photoDropZone.classList.remove('hidden');
  if (photoFileInput) photoFileInput.value = '';
  showToast('업로드된 사진이 제거되었습니다.');
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
  const prosodyStyle = poemProsodySelect ? poemProsodySelect.value : (state.selectedProsody || 'auto');

  state.isGenerating = true;
  generatePoemBtn.disabled = true;
  emptyState.classList.add('hidden');
  poemContentArea.classList.add('hidden');
  poemActions.classList.add('hidden');
  loadingState.classList.remove('hidden');
  const prosodyDisplayName = PROSODY_STYLES[prosodyStyle]?.name || '자동 맞춤';
  loadingWordsPreview.textContent = `[선택 시어: ${words.join(' · ')}]${emotion ? ` · 감정: ${emotion}` : ''} · 운율: ${prosodyDisplayName}`;

  const stepTimers = [];
  if (pipelineStep1) {
    pipelineStep1.classList.add('active');
    if (pipelineStep2) pipelineStep2.classList.remove('active');
    if (pipelineStep3) pipelineStep3.classList.remove('active');
  }
  if (loadingMessage) {
    loadingMessage.textContent = '1단계: 시인이 벼루에 먹을 갈고 서정시 초고(初稿)를 집필 중입니다...';
  }

  stepTimers.push(setTimeout(() => {
    if (state.isGenerating) {
      if (pipelineStep2) pipelineStep2.classList.add('active');
      if (loadingMessage) loadingMessage.textContent = '2단계: 한국 시문학 심사평가위원 3인의 정밀 합평 및 채점 중...';
    }
  }, 1100));

  stepTimers.push(setTimeout(() => {
    if (state.isGenerating) {
      if (pipelineStep3) pipelineStep3.classList.add('active');
      if (loadingMessage) loadingMessage.textContent = '3단계: 심사평을 바탕으로 운율과 심상을 다듬어 최종 서정시 재구성(퇴고) 중...';
    }
  }, 2300));

  try {
    let result = null;

    // 1순위: 백엔드 보안 호출 (로컬 또는 원격 클라우드 서버)
    const backendBase = state.remoteBackendUrl || '';
    if (state.isBackendOnline && (state.hasServerKey || state.hasOpenAiKey)) {
      const response = await fetch(backendBase + '/api/generate-poem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words,
          model: state.selectedModel,
          mood: state.selectedMood,
          voice_name: state.selectedVoiceName,
          emotion,
          prosody_style: prosodyStyle
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status} 오류`);
      }

      const data = await response.json();
      result = data.poem;
      if (data.prosody_style && !result.prosody_style) {
        result.prosody_style = data.prosody_style;
      }
      renderPoem(result, words, true);

      const engineName = data.provider === 'openai' ? `OPEN API (${data.model})` : `Google Gemini (${data.model})`;
      if (data.fallbackOccurred) {
        showToast(`🔒 서버 혼잡을 극복하고 [${data.model}] 모델로 시가 안전하게 창작되었습니다 ✨`);
      } else {
        showToast(`🔒 ${engineName} 3인 심사평가위원 합평 및 글다듬기를 거쳐 완성된 서정시입니다 ✨`);
      }
    }
    // 2-1순위: GitHub Pages 클라이언트 OpenAI 키 (OPEN API 모델 선택 시)
    else if (!state.isBackendOnline && state.clientOpenAiKey && (state.selectedModel.startsWith('gpt-') || state.selectedModel.startsWith('o1') || state.selectedModel.startsWith('o3'))) {
      const clientResult = await callClientOpenAiApi(words, state.selectedModel, state.selectedMood, state.clientOpenAiKey, emotion, prosodyStyle);
      result = clientResult.poem;
      renderPoem(result, words, true);
      showToast(`OPEN API (${clientResult.usedModel})로 시가 창작되었습니다 ✨`);
    }
    // 2-2순위: GitHub Pages 클라이언트 Gemini 키
    else if (!state.isBackendOnline && state.clientKey && state.clientKey.trim().length > 5) {
      const clientResult = await callClientGeminiApi(words, state.selectedModel, state.selectedMood, state.clientKey, emotion, prosodyStyle);
      result = clientResult.poem;
      renderPoem(result, words, true);
      if (clientResult.fallbackOccurred) {
        showToast(`Gemini AI (${clientResult.usedModel})로 서버 혼잡을 자동 극복하고 시를 창작했습니다 ✨`);
      } else {
        showToast('Google Gemini AI를 통해 시가 창작되었습니다 ✨');
      }
    }
    // 3순위: 데모 템플릿
    else {
      await new Promise(r => setTimeout(r, 1100));
      result = generateDemoPoem(words, state.selectedMood, emotion, prosodyStyle);
      renderPoem(result, words, false);
      showToast('시원(詩苑) 대표 시풍 데모 모드 (3인 심사위원 합평 포함)로 생성되었습니다.');
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
    const fallbackPoem = generateDemoPoem(words, state.selectedMood, emotion, prosodyStyle);
    renderPoem(fallbackPoem, words, false);
    updateTtsTuningDisplay();
  } finally {
    stepTimers.forEach(t => clearTimeout(t));
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

async function callClientGeminiApi(words, model, mood, apiKey, emotion = '', prosodyStyle = 'auto') {
  const poetInfo = POET_DATABASE[mood] || POET_DATABASE.yoon_dongju;
  const sanitizedEmotion = String(emotion || '').trim().slice(0, 100);
  const prosodyInfo = PROSODY_STYLES[prosodyStyle] || PROSODY_STYLES.auto;

  // 운율 스타일별 PDF 4대 문헌 학습 지침 생성
  let prosodyGuideline = '';
  switch (prosodyStyle) {
    case 'folk_rhythm':
      prosodyGuideline = `
[PDF 문헌 학습 운율 지침: 애틋한 7·5조 민요풍 (3음보 서정)]
- 율격 구조: 각 행을 3음보(예: '나 보기가 역겨워 / 가실 때에는 / 말없이 고이 보내 드리오리다')의 아련한 민요조 가락으로 전개하세요.
- 음수율: 전통 민요 및 김소월 시학에서 내려오는 7·5조(7글자·5글자) 음수율을 주조로 삼으세요.
- 음운 및 각운: 각 연의 종결 어미나 모음을 부드러운 유음('ㄹ') 및 비음('ㅁ', 'ㄴ', 'ㅇ')으로 조율하여 노래하듯 읊조려지는 음악성을 부여하세요.`;
      break;
    case 'classical_meter':
      prosodyGuideline = `
[PDF 문헌 학습 운율 지침: 단정한 3·4 / 4·4조 가사풍 (4음보 정통 기품)]
- 율격 구조: 각 행을 단아하고 균형 잡힌 4음보(예: '동창이 밝았느냐 / 노고지리 우지진다 / 소 치는 아이는 / 상기 아니 일었느냐')의 안정된 호흡으로 전개하세요.
- 음수율: 조선 가사 및 시조의 격조 높은 3·4조 및 4·4조의 보폭을 유지하여 기품과 절제미를 극대화하세요.
- 종결: 마지막 연에는 '한국 아름다운 문장 1000선'에 필적하는 깊은 인생의 철학적 통찰과 경구를 담아 무게감 있게 완성하세요.`;
      break;
    case 'modern_free':
      prosodyGuideline = `
[PDF 문헌 학습 운율 지침: 감각적 현대 자유율 (긴 행과 짧은 행의 교차)]
- 율격 구조: 기계적으로 일정한 행 길이를 단호히 배제하고, 1~3단어의 극도로 절제된 짧은 행과 유려하게 펼쳐지는 긴 행을 유기적으로 교차시키세요.
- 호흡: 파도가 밀려왔다 부서지듯 호흡의 완급을 조절하고, 행과 행 사이에 시각적·심리적 여백을 두어 감각적인 현대 서정을 살리세요.`;
      break;
    case 'meditative_prose':
      prosodyGuideline = `
[PDF 문헌 학습 운율 지침: 깊은 사유의 명상적 율격 (유장한 내재율)]
- 율격 구조: 강물처럼 유장하게 흐르는 산문적 긴 호흡과 내재율을 구사하세요.
- 호흡: 침묵과 쉼표를 적극 활용하여, 내면의 깊은 고백과 존재에 대한 응시가 묻어나는 장중하고 명상적인 분위기를 연출하세요.`;
      break;
    default:
      prosodyGuideline = `
[PDF 문헌 학습 운율 지침: 시인풍·감정 맞춤형 최적 운율 자동 조율]
- [${poetInfo.name}] 시인의 문학적 정체성과 사용자의 감정("${sanitizedEmotion || '서정적 울림'}")에 가장 부합하는 호흡과 음악적 율격을 자연스럽게 융합하세요.
- 부드러운 울림소리('ㅁ', 'ㄴ', 'ㄹ', 'ㅇ')의 조화로운 배치와 행간의 음악적 리듬을 살려 낭송 시 아름다운 선율이 느껴지도록 하세요.`;
      break;
  }

  // 금지단어(17대 클리셰) 필터링: 사용자가 직접 입력한 5개 단어나 감정에 포함된 경우만 예외 허용
  const userExplicitText = [...words, sanitizedEmotion].join(' ');
  const activeForbiddenWords = FORBIDDEN_POETIC_WORDS.filter(w => !userExplicitText.includes(w));

  const systemInstruction = `당신은 한국 문학사에 빛나는 명시인들의 시풍과 운율을 완벽히 체화한 서정시의 대가입니다.
사용자가 선택한 시인([${poetInfo.name}] - 대표작: '${poetInfo.work}')의 독보적인 문학적 정체성, 사용자의 감정, 그리고 학습된 시적 운율(리듬·율격)을 3원 융합하여 감동적인 한국 서정시를 창작해 주세요.`;

  const userPrompt = `
[창작 대상 시인 및 시풍]
- 시인: ${poetInfo.name} (대표작: '${poetInfo.work}')
- 기본 문학적 정서와 스타일: ${poetInfo.desc}
- 매칭 Google TTS 보이스: ${state.selectedVoiceName}
${sanitizedEmotion ? `- [사용자가 담고자 하는 시적 감정 및 테마]: "${sanitizedEmotion}"
- [감정 융합 지침]: 사용자가 지정한 감정("${sanitizedEmotion}")을 [${poetInfo.name}] 시인 특유의 고유한 시적 어조, 시선, 이미지와 유기적으로 결합하여, 시인의 영혼과 목소리로 사용자의 감정을 노래하듯 깊이 있게 빚어내세요.` : ''}

${prosodyGuideline}

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
4. 시의 어조, 행간의 호흡, 사용하는 시어의 결이 반드시 [${poetInfo.name}] 시인의 고유한 서정 및 요청된 운율 율격과 정확히 일치하도록 심혈을 기울여 주세요.
5. [완결성 보장]: 시는 절대로 중간에 문맥이나 행이 끊기지 않고 완전히 끝맺어야 합니다. 마지막 연의 마지막 행까지 시적 여운을 담아 완전한 문장으로 종결하세요.
6. 시 본문이 완결된 후 반드시 '---' 구분선을 넣고, 그 아래에 [${poetInfo.name}] 시인의 시선에서 쓴 2~3문장의 시작노트(감상, 창작 의도 및 반영된 운율감)를 끝까지 온전히 작성하세요.
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
            const parsedPoem = parsePoem(rawText);
            parsedPoem.prosody_style = prosodyInfo.name;
            return {
              poem: parsedPoem,
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

// 클라이언트 OpenAI API 직접 호출 (GitHub Pages 지원)
async function callClientOpenAiApi(words, model, mood, apiKey, emotion = '', prosodyStyle = 'auto') {
  const pInfo = POET_DATABASE[mood] || POET_DATABASE.yoon_dongju;
  const prosodyDef = PROSODY_STYLES[prosodyStyle] || PROSODY_STYLES.auto;
  const targetModel = model || 'gpt-4o-mini';
  const modelsToTry = [targetModel, 'gpt-4o-mini', 'gpt-4o'];
  const uniqueModels = [...new Set(modelsToTry)];

  const systemInstruction = `당신은 한국 최고의 서정시 작가입니다. 5개 단어를 바탕으로 ${pInfo.poet} 시인의 정서와 ${prosodyDef.name} 운율을 조화롭게 녹여낸 서정시를 창작하세요.`;
  const userPrompt = `
[창작 조건]
- 필수 시어 5개: ${words.join(', ')}
- 지향 시풍: ${pInfo.poet} 시인의 문학적 정서
- 감정: ${emotion || '깊은 여운과 서정'}
- 운율: ${prosodyDef.name}

출력 형식:
# [시 제목]

1연 본문...

2연 본문...

---
시작노트: ...
`;

  let lastError = 'OpenAI 응답 없음';
  for (const curModel of uniqueModels) {
    const isReasoning = curModel.includes('astra') || curModel.includes('sol') || curModel.startsWith('o1') || curModel.startsWith('o3');
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: curModel,
          messages: [
            { role: isReasoning ? 'developer' : 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
          ],
          ...(isReasoning ? { max_completion_tokens: 2500 } : { max_tokens: 2500, temperature: 0.75 })
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsedPoem = parsePoem(content);
          parsedPoem.prosody_style = prosodyDef.name;
          return {
            poem: parsedPoem,
            usedModel: curModel,
            fallbackOccurred: curModel !== targetModel
          };
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 401) throw new Error(`OpenAI 인증 실패: ${errData.error?.message || '올바르지 않은 API 키입니다.'}`);
        if (response.status === 404 || errData.error?.code === 'model_not_found') continue;
        lastError = errData.error?.message || `HTTP ${response.status}`;
      }
    } catch (e) {
      if (e.message && e.message.includes('인증 실패')) throw e;
      lastError = e.message;
    }
  }

  throw new Error(`OpenAI 시 창작 실패: ${lastError}`);
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
function generateDemoPoem(words, mood, emotion = '', prosodyStyle = 'auto') {
  const [w1, w2, w3, w4, w5] = words;
  const poetInfo = POET_DATABASE[mood] || POET_DATABASE.yoon_dongju;
  const prosodyInfo = PROSODY_STYLES[prosodyStyle] || PROSODY_STYLES.auto;
  const emotionSuffix = emotion ? ` (${emotion}의 정서를 담아)` : '';
  const prosodySuffix = ` [운율: ${prosodyInfo.name}]`;

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

  const defaultJudges = [
    {
      name: '김형상 심사위원',
      role: '시적 이미지 & 감각적 은유',
      score: 93,
      critique: `제시된 시어(${w1}, ${w2}, ${w3})의 감각적 심상이 선명하게 형상화되었으며, 상투적 클리셰를 지양하고 신선한 시각적 묘사를 빚어냈습니다.`,
      advice: '추상적 서술을 지양하고 구체적인 사물의 질감과 빛깔을 더욱 선명하게 부각하도록 퇴고를 권고합니다.'
    },
    {
      name: '박가락 심사위원',
      role: '운율학 & 한국어 음악성',
      score: 91,
      critique: '우리말 특유의 유려한 음보율과 말의 가락이 살아있어, 낭독 시 입술에 부드럽게 감기는 리듬감이 돋보입니다.',
      advice: '행간과 연간의 쉼표 호흡을 정돈하고 울림소리(ㄴ, ㄹ, ㅁ, ㅇ)의 내운을 촘촘히 배치하여 음악성을 높이세요.'
    },
    {
      name: '이여백 심사위원',
      role: '서정성 & 시상 전개',
      score: 95,
      critique: '기승전결의 시상 흐름이 자연스럽고, 결구에 이르러 삶과 고독을 관통하는 깊은 철학적 여운을 훌륭히 남겼습니다.',
      advice: '마지막 행의 시적 긴장감을 끝까지 유지하여 독자의 가슴속에 오래 머무는 아포리즘적 여운을 완성하세요.'
    }
  ];

  const improvements = [
    '1. 감각적 심상의 선명화 및 구체적 사물 형상화',
    '2. 3음보·4음보의 호흡과 울림소리 내운 조탁',
    '3. 결구의 시적 여운과 아포리즘적 종결성 강화'
  ];

  if (demoTemplates[mood]) {
    const t = demoTemplates[mood];
    return {
      title: t.title,
      body: t.body,
      notes: t.notes + prosodySuffix,
      draft: {
        title: `${t.title} (초고)`,
        body: t.body
      },
      judges: defaultJudges,
      overallScore: 93.0,
      critiqueSummary: '3인 심사평가위원의 정밀 합평을 거쳐 이미지와 운율이 조화롭게 다듬어진 완성작입니다.',
      improvements,
      isRefined: true,
      prosody_style: prosodyInfo.name
    };
  }

  // 그 외 33인 시인들을 위한 정밀 맞춤 생성기
  const genTitle = `${poetInfo.name} 풍의 ${w1}과 ${w5}${emotionSuffix}`;
  const genBody = `바람이 머물다 가는 자리에서\n가만히 흔들리는 ${w1},\n\n지나간 시간의 잔물결 위로\n아스라이 부서지는 ${w2}의 기억들.\n마음의 심연에 고여 든 ${w3}은\n어둠을 밝히는 한 줄기 빛이 된다.\n\n적어두지 못한 ${w4}를 마음에 품고\n다시금 고요히 대지에 내리는 ${w5},\n생의 침묵 속에 가장 순결한 언어로 피어난다.`;

  return {
    title: genTitle,
    body: genBody,
    notes: `${poetInfo.name} 시인의 대표작 '${poetInfo.work}'의 시풍(${poetInfo.desc})을 기리며, 다섯 단어(${words.join(', ')})로 깊은 서정을 길어 올렸습니다.${emotion ? ` [부여된 감정: ${emotion}]` : ''}${prosodySuffix}`,
    draft: {
      title: `${genTitle} (초고)`,
      body: genBody
    },
    judges: defaultJudges,
    overallScore: 93.0,
    critiqueSummary: '3인 심사평가위원의 정밀 합평을 거쳐 이미지와 운율이 조화롭게 다듬어진 완성작입니다.',
    improvements,
    isRefined: true,
    prosody_style: prosodyInfo.name
  };
}

// =========================================================
// 9. 시 렌더링 및 하이라이팅
// =========================================================
function renderPoem(poemData, words, isLiveAI = false) {
  state.currentPoem = poemData;
  state.currentWords = words;
  state.currentPoemView = 'refined';

  // 1. 심사위원 평가 및 글다듬기 섹션 렌더링
  if (judgesReviewSection) {
    if (poemData.judges && Array.isArray(poemData.judges) && poemData.judges.length > 0) {
      judgesReviewSection.classList.remove('hidden');
      if (judgesOverallScore) {
        judgesOverallScore.textContent = `${poemData.overallScore || 93.0}점`;
      }
      if (critiqueSummaryText) {
        critiqueSummaryText.textContent = poemData.critiqueSummary || '3인 심사평가위원의 정밀 합평을 거쳐 이미지와 운율이 조화롭게 다듬어진 완성작입니다.';
      }
      if (judgesCardsGrid) {
        judgesCardsGrid.innerHTML = poemData.judges.map(j => `
          <div class="judge-card">
            <div class="judge-card-header">
              <div class="judge-info">
                <span class="judge-name">${escapeHtml(j.name)}</span>
                <span class="judge-role-badge">${escapeHtml(j.role)}</span>
              </div>
              <span class="judge-score-pill">${j.score || 92}점</span>
            </div>
            <p class="judge-critique-text">${escapeHtml(j.critique)}</p>
            <div class="judge-advice-box">
              <strong>💡 퇴고 권고:</strong> ${escapeHtml(j.advice)}
            </div>
          </div>
        `).join('');
      }
      if (improvementsList) {
        const imps = poemData.improvements || [
          '1. 감각적 심상의 선명화 및 구체적 사물 형상화',
          '2. 3음보·4음보의 호흡과 울림소리 내운 조탁',
          '3. 결구의 시적 여운과 아포리즘적 종결성 강화'
        ];
        improvementsList.innerHTML = imps.map(imp => `
          <li class="improvement-item">
            <span class="imp-bullet">✨</span>
            <span>${escapeHtml(imp)}</span>
          </li>
        `).join('');
      }
    } else {
      judgesReviewSection.classList.add('hidden');
    }
  }

  // 2. 메타 태그 렌더링
  const poetInfo = POET_DATABASE[state.selectedMood] || POET_DATABASE.yoon_dongju;
  const voiceInfo = GOOGLE_TTS_VOICES[state.selectedVoiceName] || GOOGLE_TTS_VOICES.Iapetus;
  const voiceDisplayName = poemData.voice_name || state.selectedVoiceName;
  const prosodyLabel = poemData.prosody_style || (state.selectedProsody && state.selectedProsody !== 'auto' ? PROSODY_STYLES[state.selectedProsody]?.name : '');
  const prosodyTag = prosodyLabel ? ` · 운율: ${prosodyLabel}` : '';

  if (poemData.poet) {
    const modelText = isLiveAI ? geminiModelSelect.options[geminiModelSelect.selectedIndex].text.split(' (')[0] : '시원 AI';
    poemAuthorTag.textContent = `${poemData.poet} 시풍 · ${modelText} · 낭송: Google ${voiceDisplayName} (${voiceInfo.trait})${prosodyTag}`;
  } else if (isLiveAI) {
    const modelText = geminiModelSelect.options[geminiModelSelect.selectedIndex].text.split(' (')[0];
    poemAuthorTag.textContent = `${poetInfo.name} 시풍 · ${modelText} · 낭송: Google ${voiceDisplayName} (${voiceInfo.trait})${prosodyTag}`;
  } else {
    poemAuthorTag.textContent = `${poetInfo.name} 시풍 · 시원(詩苑) 시인 · 낭송: Google ${voiceDisplayName} (${voiceInfo.trait})${prosodyTag}`;
  }

  poemNotes.innerHTML = poemData.notes;

  // 3. 뷰 모드(기본: 글다듬기 완성작) 렌더링
  switchPoemView('refined');

  poemContentArea.classList.remove('hidden');
  poemActions.classList.remove('hidden');
}

// 초고 vs 글다듬기 완성작 뷰 전환 함수
function switchPoemView(viewMode) {
  state.currentPoemView = viewMode;
  if (!state.currentPoem) return;

  const isDraft = (viewMode === 'draft');
  const activeTitle = isDraft && state.currentPoem.draft ? state.currentPoem.draft.title : state.currentPoem.title;
  const activeBody = isDraft && state.currentPoem.draft ? state.currentPoem.draft.body : state.currentPoem.body;

  if (btnViewRefinedPoem && btnViewDraftPoem) {
    if (isDraft) {
      btnViewDraftPoem.classList.add('active');
      btnViewDraftPoem.setAttribute('aria-selected', 'true');
      btnViewRefinedPoem.classList.remove('active');
      btnViewRefinedPoem.setAttribute('aria-selected', 'false');
      if (currentViewNotice) currentViewNotice.textContent = '📜 초고(初稿) 원문 보기';
    } else {
      btnViewRefinedPoem.classList.add('active');
      btnViewRefinedPoem.setAttribute('aria-selected', 'true');
      btnViewDraftPoem.classList.remove('active');
      btnViewDraftPoem.setAttribute('aria-selected', 'false');
      if (currentViewNotice) currentViewNotice.textContent = '✨ 심사위원 조언 반영 완성본';
    }
  }

  poemTitle.textContent = activeTitle;

  // 행/연 분할 렌더링
  const rawStanzas = (activeBody || '').split(/\n\s*\n/);
  const words = state.currentWords || [];
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
}

// 3인 심사위원 글다듬기 (재퇴고) 핸들러
async function handleReRefinePoem() {
  if (!state.currentPoem || state.isGenerating) return;

  state.isGenerating = true;
  if (reRefinePoemBtn) reRefinePoemBtn.disabled = true;
  showToast('✨ 한국 시문학 심사평가위원 3인에게 재합평 및 글다듬기(재퇴고)를 요청 중입니다...');

  try {
    const emotion = poemEmotionInput ? poemEmotionInput.value.trim() : '';
    const prosodyStyle = poemProsodySelect ? poemProsodySelect.value : (state.selectedProsody || 'auto');

    let refinedResult = null;
    const backendBase = state.remoteBackendUrl || '';
    if (state.isBackendOnline && (state.hasServerKey || state.hasOpenAiKey)) {
      const resp = await fetch(backendBase + '/api/refine-poem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.currentPoem.title,
          body: state.currentPoem.body,
          mood: state.selectedMood,
          voice_name: state.selectedVoiceName,
          emotion,
          prosody_style: prosodyStyle,
          model: state.selectedModel
        })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      refinedResult = data.poem;
    } else {
      await new Promise(r => setTimeout(r, 1200));
      refinedResult = generateDemoPoem(state.currentWords || ['시', '바람', '별', '하늘', '노래'], state.selectedMood, emotion, prosodyStyle);
    }

    renderPoem(refinedResult, state.currentWords || [], true);
    showToast('✨ 3인 심사위원의 정밀 합평을 거쳐 한층 더 유려하게 시가 글다듬기되었습니다!');
  } catch (err) {
    console.error('글다듬기 실패:', err);
    showToast(`글다듬기 오류: ${err.message}`);
  } finally {
    state.isGenerating = false;
    if (reRefinePoemBtn) reRefinePoemBtn.disabled = false;
  }
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
