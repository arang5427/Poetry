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
const CLIENT_STORAGE_KEY = 'gemini_poet_client_api_key';

const state = {
  // 백엔드 & API 상태
  isBackendOnline: false,
  hasServerKey: false,
  clientKey: localStorage.getItem(CLIENT_STORAGE_KEY) || '',
  selectedModel: 'gemini-3.8-flash',
  selectedMood: 'nostalgic',
  currentPoem: null,
  isGenerating: false,

  // 유튜브 BGM 상태
  ytPlayer: null,
  isYtApiReady: false,
  isBgmPlaying: false,
  bgmVolume: 35,
  currentBgmVideoId: '',

  // 성우 낭송 및 감성 튜닝 상태
  voiceGender: 'female',
  voiceAge: 40,
  autoMoodTts: true,
  isSpeaking: false,
  originalBgmVolBeforeDucking: 35,

  // 빗소리
  isRainPlaying: false
};

// 시 분위기별 감성 TTS 튜닝 사전 (Google TTS 특화)
const MOOD_TTS_TUNING = {
  nostalgic: {
    style: '아련하고 애절한 한(恨)의 여운',
    pitchOffset: -0.06,
    rateOffset: -0.05,
    linePauseMs: 750,
    stanzaPauseMs: 1400,
    pauseDesc: '1.4초 (깊은 여운)'
  },
  contemplative: {
    style: '절제된 고요와 순결한 사색',
    pitchOffset: 0.00,
    rateOffset: -0.03,
    linePauseMs: 650,
    stanzaPauseMs: 1200,
    pauseDesc: '1.2초 (차분한 침묵)'
  },
  nature: {
    style: '청명하고 소박한 자연의 숨결',
    pitchOffset: +0.04,
    rateOffset: +0.03,
    linePauseMs: 550,
    stanzaPauseMs: 1050,
    pauseDesc: '1.0초 (부드러운 호흡)'
  },
  comfort: {
    style: '나직하고 포근한 온기의 속삭임',
    pitchOffset: -0.04,
    rateOffset: -0.07,
    linePauseMs: 800,
    stanzaPauseMs: 1500,
    pauseDesc: '1.5초 (온기 어린 쉼)'
  },
  romantic: {
    style: '미소 띤 첫사랑의 다정한 설렘',
    pitchOffset: +0.07,
    rateOffset: +0.05,
    linePauseMs: 500,
    stanzaPauseMs: 950,
    pauseDesc: '0.9초 (산뜻한 호흡)'
  }
};

// 분위기별 유튜브 BGM 트랙 매핑 (보컬 없는 고품질 서정 연주곡)
const MOOD_BGM_TRACKS = {
  nostalgic: {
    videoId: 'r13T2c0bK2Q',
    title: '한국 전통 서정 선율 (가야금 & 대금 인스트루멘탈)',
    moodLabel: '김소월 풍 (아련한 그리움)'
  },
  contemplative: {
    videoId: 'IV8LO-T66ys',
    title: '별빛 밤의 고요한 사색 (서정 피아노)',
    moodLabel: '윤동주 풍 (순결한 자아 성찰)'
  },
  nature: {
    videoId: 'd9O9u28P9wE',
    title: '청산(靑山)의 바람과 자연 선율 (국악 힐링)',
    moodLabel: '박목월 풍 (담백한 자연과 고향)'
  },
  comfort: {
    videoId: '1E0942rV2i4',
    title: '따스한 위로의 선율 (피아노 & 첼로)',
    moodLabel: '정호승 풍 (따스한 온기와 위로)'
  },
  romantic: {
    videoId: '5qap5aO4i9A',
    title: '봄날의 설렘 (따스한 어쿠스틱 기타 선율)',
    moodLabel: '나태주 풍 (풋풋한 첫사랑의 설렘)'
  }
};

// 감성 단어 추천 세트
const POETIC_WORD_SETS = [
  ['밤바다', '윤슬', '그리움', '편지', '별빛'],
  ['낙엽', '발자국', '안개', '침묵', '찻잔'],
  ['첫눈', '기다림', '골목길', '가로등', '숨결'],
  ['노을', '민들레', '바람소리', '소나기', '언덕'],
  ['동백꽃', '달그림자', '물결', '손안개', '기억'],
  ['서리꽃', '새벽', '외투', '온기', '먼산']
];

// 분위기별 프롬프트 가이드
const MOOD_PROMPTS = {
  nostalgic: '김소월 시인 특유의 민조적 율격과 한(恨), 아련한 그리움과 애틋함의 정서',
  contemplative: '윤동주 시인 특유의 순결한 자아 성찰, 부끄러움 없는 삶을 향한 고요한 밤과 별빛의 시선',
  nature: '박목월 시인 특유의 담백한 향토색, 한국 자연의 사계와 고향 길의 소박한 정취',
  comfort: '정호승 시인 특유의 상처 입은 영혼을 보듬는 따스한 온기와 인간적인 사랑의 위로',
  romantic: '나태주 시인 특유의 소박하고 다정한 말씨, 풀꽃처럼 피어나는 첫사랑의 설렘과 다정함'
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
const bgmVideoToggleBtn = document.getElementById('bgmVideoToggleBtn');
const bgmVolumeSlider = document.getElementById('bgmVolumeSlider');
const bgmVolumeText = document.getElementById('bgmVolumeText');
const bgmAutoPlayCheck = document.getElementById('bgmAutoPlayCheck');
const youtubePlayerContainer = document.getElementById('youtubePlayerContainer');

// 성우 낭송 & 감성 튜닝 제어 요소
const voiceGenderGroup = document.getElementById('voiceGenderGroup');
const voiceAgeGroup = document.getElementById('voiceAgeGroup');
const autoMoodTtsCheck = document.getElementById('autoMoodTtsCheck');
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
  const defaultTrack = MOOD_BGM_TRACKS[state.selectedMood] || MOOD_BGM_TRACKS.nostalgic;
  state.currentBgmVideoId = defaultTrack.videoId;
  updateBgmTitleUI(defaultTrack.title);

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

function onPlayerError(err) {
  console.warn('YouTube 재생 오류:', err);
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

function switchBgmForMood(mood, autoPlay = false) {
  const track = MOOD_BGM_TRACKS[mood] || MOOD_BGM_TRACKS.nostalgic;
  updateBgmTitleUI(track.title);

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

// 연령대, 성별, 시의 분위기에 따른 정밀 감성 프로필 산출
function computeVoiceProfile(gender, age, mood, autoMood = true) {
  const voiceData = resolveKoreanVoice(gender);
  const isNaturalMale = voiceData ? voiceData.isNaturalMale : false;
  const tuning = MOOD_TTS_TUNING[mood] || MOOD_TTS_TUNING.nostalgic;

  // 기본 연령대 및 성별 베이스라인 피치 & 속도
  let basePitch = 1.0;
  let baseRate = 0.82;

  if (gender === 'female') {
    if (age === 20) {
      basePitch = 1.15;
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
        basePitch = 1.06;
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
  let styleText = '표준 낭송 호흡';
  let pauseText = '1.2초 (표준 여운)';

  // 시 분위기 맞춤 자동 감성 조절이 활성화된 경우 파라미터 미세 튜닝
  if (autoMood) {
    finalPitch = Math.max(0.4, Math.min(1.8, basePitch + tuning.pitchOffset));
    finalRate = Math.max(0.5, Math.min(1.4, baseRate + tuning.rateOffset));
    linePauseMs = tuning.linePauseMs;
    stanzaPauseMs = tuning.stanzaPauseMs;
    styleText = tuning.style;
    pauseText = tuning.pauseDesc;
  }

  return {
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
    state.selectedMood,
    state.autoMoodTts
  );

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

  const genderName = state.voiceGender === 'female' ? '여성' : '남성';
  const ageName = `${state.voiceAge}대`;
  const sampleText = `안녕하세요. ${ageName} ${genderName} 성우입니다. 시의 분위기에 맞춘 목소리로 낭송해 드리겠습니다.`;

  const utterance = new SpeechSynthesisUtterance(sampleText);
  utterance.lang = 'ko-KR';

  const profile = computeVoiceProfile(
    state.voiceGender,
    state.voiceAge,
    state.selectedMood,
    state.autoMoodTts
  );

  if (profile.voice) utterance.voice = profile.voice;
  utterance.pitch = profile.pitch;
  utterance.rate = profile.rate;

  showToast(`[${ageName} ${genderName} 성우 · ${profile.style}] 미리듣기 🎧`);
  window.speechSynthesis.speak(utterance);
}

// 지능형 서정 시 낭송 엔진 (연/행간 감성 지연 + 오디오 더킹)
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
    state.selectedMood,
    state.autoMoodTts
  );

  const genderName = state.voiceGender === 'female' ? '여성' : '남성';
  showToast(`[${state.voiceAge}대 ${genderName} 성우 · ${profile.style}] 낭송을 시작합니다...`);

  try {
    // 1. 시 제목 낭독
    await speakSegment(`${state.currentPoem.title}.`, profile);
    if (speechAbortController) return;
    await waitDelay(profile.stanzaPauseMs);
    if (speechAbortController) return;

    // 2. 연(Stanza)별 자연스러운 시적 호흡 낭독
    const stanzas = state.currentPoem.body.split(/\n\s*\n/);
    for (let stanza of stanzas) {
      if (speechAbortController) return;
      const cleanStanza = stanza.trim();
      if (!cleanStanza) continue;

      await speakSegment(cleanStanza, profile);
      if (speechAbortController) return;
      await waitDelay(profile.stanzaPauseMs);
    }

    // 3. 시인의 시작(詩作) 노트 낭독
    if (!speechAbortController && state.currentPoem.notes) {
      await waitDelay(profile.stanzaPauseMs);
      if (speechAbortController) return;
      await speakSegment(`시인의 노트. ${state.currentPoem.notes}`, profile);
    }
  } catch (err) {
    console.warn('낭송 인터럽트:', err);
  } finally {
    stopSpeakingUI();
  }
}

function speakSegment(text, profile) {
  return new Promise((resolve) => {
    if (speechAbortController) return resolve();

    const utterance = new SpeechSynthesisUtterance(text);
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

      if (data.hasServerKey) {
        apiStatusBadge.textContent = '보안 서버 연동';
        apiStatusBadge.className = 'status-badge live';
        backendStatusIcon.textContent = '🛡️';
        backendStatusTitle.textContent = '백엔드 보안 연동 완료 (.env 키 암호화 보관)';
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
  bgmVideoToggleBtn.addEventListener('click', toggleVideoContainer);
  bgmVolumeSlider.addEventListener('input', handleVolumeChange);

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

  // 시 분위기 맞춤 자동 튜닝 토글 체크박스
  if (autoMoodTtsCheck) {
    autoMoodTtsCheck.addEventListener('change', (e) => {
      state.autoMoodTts = e.target.checked;
      updateTtsTuningDisplay();
      if (state.autoMoodTts) {
        showToast('시 분위기 맞춤 Google TTS 자동 튜닝 활성화 ✨');
      } else {
        showToast('성우 기본 음높이/속도로 전환되었습니다.');
      }
    });
  }

  // 성우 미리듣기 & 낭송 시작
  previewVoiceBtn.addEventListener('click', previewVoiceActor);
  readPoemBtn.addEventListener('click', toggleSpeech);

  // 분위기 셀렉트 변경 시 BGM 트랙 및 TTS 튜닝 자동 동기화!
  poemMoodSelect.addEventListener('change', (e) => {
    state.selectedMood = e.target.value;
    switchBgmForMood(state.selectedMood, false);
    updateTtsTuningDisplay();
  });

  // 🎲 추천 단어 무작위 채우기
  randomWordsBtn.addEventListener('click', () => {
    const randomSet = POETIC_WORD_SETS[Math.floor(Math.random() * POETIC_WORD_SETS.length)];
    wordInputs.forEach((input, index) => {
      input.value = randomSet[index];
    });
    showToast('감성 시어 5개가 추천되었습니다 🎲');
  });

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

  state.isGenerating = true;
  generatePoemBtn.disabled = true;
  emptyState.classList.add('hidden');
  poemContentArea.classList.add('hidden');
  poemActions.classList.add('hidden');
  loadingState.classList.remove('hidden');
  loadingWordsPreview.textContent = `[선택 시어: ${words.join(' · ')}]`;

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
          mood: state.selectedMood
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status} 오류`);
      }

      const data = await response.json();
      result = data.poem;
      renderPoem(result, words, true);
      showToast('🔒 보안 백엔드를 통해 안전하게 시가 창작되었습니다.');
    }
    // 2순위: GitHub Pages 클라이언트 키
    else if (!state.isBackendOnline && state.clientKey && state.clientKey.trim().length > 5) {
      result = await callClientGeminiApi(words, state.selectedModel, state.selectedMood, state.clientKey);
      renderPoem(result, words, true);
      showToast('Google Gemini AI를 통해 실시간 시가 창작되었습니다 ✨');
    }
    // 3순위: 데모 템플릿
    else {
      await new Promise(r => setTimeout(r, 1100));
      result = generateDemoPoem(words, state.selectedMood);
      renderPoem(result, words, false);
      showToast('전통 서정시 데모 모드로 생성되었습니다.');
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
    const fallbackPoem = generateDemoPoem(words, state.selectedMood);
    renderPoem(fallbackPoem, words, false);
    updateTtsTuningDisplay();
  } finally {
    state.isGenerating = false;
    generatePoemBtn.disabled = false;
    loadingState.classList.add('hidden');
  }
}

// 클라이언트 Gemini API 호출
async function callClientGeminiApi(words, model, mood, apiKey) {
  const moodDesc = MOOD_PROMPTS[mood] || MOOD_PROMPTS.nostalgic;

  const systemInstruction = `당신은 대한민국 대표 서정시인(김소월, 윤동주, 박목월, 정호승, 나태주의 감성을 품은 명시인)입니다.
사용자가 건넨 다섯 가지 단어의 영혼을 꿰뚫어 보아, 한국 전통의 고즈넉한 여운과 깊은 서정성을 지닌 감동적인 현대 서정시를 창작해 주세요.`;

  const userPrompt = `
[선택된 다섯 단어]
1. ${words[0]}
2. ${words[1]}
3. ${words[2]}
4. ${words[3]}
5. ${words[4]}

[작품 분위기 및 지침]
- 분위기: ${moodDesc}
- 지침:
  1. 시의 맨 첫 줄은 '# [시의 제목]' 형식으로 작성하세요.
  2. 3~5개의 연으로 구성하고, 연과 연 사이는 빈 줄로 구분하세요.
  3. 제공된 다섯 단어(${words.join(', ')})를 시 본문 속에 자연스럽고 유려하게 녹여내세요.
  4. 시 본문이 끝난 뒤에는 '---' 구분선을 넣고, 그 아래에 시인의 짤막한 시작노트(2~3문장의 감상과 창작 의도)를 덧붙여 주세요.
  5. 군더더기 인사말은 절대 포함하지 마세요.
`;

  const payload = {
    contents: [{ parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }] }],
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      maxOutputTokens: 2048
    }
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok && response.status === 404 && model === 'gemini-3.8-flash') {
    const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    response = await fetch(fallbackEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errMessage = errorData.error?.message || `HTTP ${response.status} 오류`;
    throw new Error(errMessage);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('Gemini API로부터 시 내용을 받아오지 못했습니다.');
  }

  return parsePoem(rawText);
}

function parsePoem(rawText) {
  let title = '마음의 풍경';
  let bodyLines = [];
  let noteLines = [];
  let isNoteSection = false;

  const lines = rawText.trim().split('\n');

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      title = trimmed.replace(/^#\s*/, '').replace(/["'«»]/g, '');
    } else if (trimmed === '---' || trimmed.startsWith('---')) {
      isNoteSection = true;
    } else if (isNoteSection) {
      noteLines.push(line);
    } else {
      bodyLines.push(line);
    }
  }

  return {
    title,
    body: bodyLines.join('\n').trim(),
    notes: noteLines.join('\n').trim() || '다섯 알의 낱말이 모여 가슴 한 켠에 작은 등불을 켭니다.'
  };
}

// =========================================================
// 8. 데모 모드 템플릿 엔진
// =========================================================
function generateDemoPoem(words, mood) {
  const [w1, w2, w3, w4, w5] = words;

  const demoTemplates = {
    nostalgic: {
      title: `${w1}에 띄우는 ${w4}`,
      body: `먼동이 트기 전 가만히 부르면\n이슬 젖은 창턱에 머무는 ${w1},\n\n물결 위를 스쳐 가던 ${w2}처럼\n흘러간 세월은 잡을 길 없고\n가슴 깊이 고여 든 ${w3}만\n바람 끝에 흔들립니다.\n\n적어두지 못한 ${w4} 한 장\n가슴 한 켠에 접어 묻어두니\n어느새 저 하늘에서 내리는 ${w5},\n시린 계절을 따스히 덮어줍니다.`,
      notes: `${w1}와 ${w2}의 찰나에서 비롯된 그리움이 ${w5}처럼 차분하게 마음에 가라앉는 순간을 노래했습니다.`
    },
    contemplative: {
      title: `${w1}과 고요의 시간`,
      body: `밤하늘 높이 우러른 ${w1} 아래\n차마 부끄러운 고백들이 흩어지고,\n\n가만히 눈감으면 반짝이는 ${w2},\n홀로 걷는 길목마다 드리운 ${w3}은\n어둠을 헤치고 나아갈 등불이 됩니다.\n\n마른 가슴에 띄운 한 조각 ${w4}를 쥐고\n첫 마음처럼 순결한 ${w5}을 맞이할 때,\n비로소 살아 숨 쉬는 자아를 마주합니다.`,
      notes: `윤동주의 별빛처럼 순결한 마음을 담아, 다섯 낱말(${words.join(', ')})로 깊은 내면의 소리를 엮었습니다.`
    },
    nature: {
      title: `고향 길, ${w1} 언덕에서`,
      body: `굽이굽이 산모롱이 돌아가면\n바람결에 피어나는 푸른 ${w1},\n\n개울가 바위 틈에 어린 ${w2} 따라\n송아지 울음소리 아련한 ${w3},\n\n흙 묻은 손으로 엮은 ${w4}가\n새소리에 실려 날아오르면\n산천 가득 피어오르는 ${w5}처럼\n넉넉한 대지가 품을 내어줍니다.`,
      notes: `박목월의 토속적이고 청명한 시풍으로, 자연의 숨결과 소박한 안식을 다섯 단어 속에 풀어냈습니다.`
    },
    comfort: {
      title: `${w5}이 내리는 창가에서`,
      body: `울지 마라, 외로우니까 사람이다.\n저물어 가는 ${w1} 저편으로\n눈물방울마다 맺힌 ${w2}이 고와서,\n\n끝내 버리지 못한 질긴 ${w3}도\n서로의 등을 감싸 안는 온기가 된다.\n\n부치지 못한 ${w4}를 품에 안고서\n오늘 밤 소리 없이 내리는 ${w5}을 보라,\n상처 없는 영혼이 어디 있으랴.`,
      notes: `정호승 시인의 따뜻한 위로처럼, 생의 그늘을 사랑으로 어루만지는 시어들로 엮었습니다.`
    },
    romantic: {
      title: `자세히 보아야 예쁜 ${w2}`,
      body: `풀잎 끝에 맺힌 ${w1}처럼\n너는 가만히 내게 다가왔다.\n\n햇살 부서지는 강가의 ${w2}보다\n더 눈부신 네 눈망울,\n가만히 불러보는 것만으로 벅찬 ${w3}.\n\n수줍게 건네지 못한 작은 ${w4} 속에\n너를 향한 봄날의 ${w5}이 곱게 피어난다.\n\n너는 나에게 참 좋은 사람이다.`,
      notes: `나태주 시인의 다정하고 소박한 눈길로, 사랑하는 대상을 향한 순수한 설렘을 노래했습니다.`
    }
  };

  return demoTemplates[mood] || demoTemplates.nostalgic;
}

// =========================================================
// 9. 시 렌더링 및 하이라이팅
// =========================================================
function renderPoem(poemData, words, isLiveAI = false) {
  state.currentPoem = poemData;

  poemTitle.textContent = poemData.title;
  poemNotes.innerHTML = poemData.notes;

  if (isLiveAI) {
    const modelText = geminiModelSelect.options[geminiModelSelect.selectedIndex].text.split(' (')[0];
    poemAuthorTag.textContent = `${modelText} 작시`;
  } else {
    poemAuthorTag.textContent = `시원(詩苑) 시인`;
  }

  let formattedBody = escapeHtml(poemData.body);
  words.forEach(w => {
    if (w) {
      const regex = new RegExp(`(${escapeRegex(w)})`, 'gi');
      formattedBody = formattedBody.replace(regex, '<span class="highlight-word">$1</span>');
    }
  });

  poemBody.innerHTML = formattedBody;
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
