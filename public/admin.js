/**
 * 시원(詩苑) AI 관리자 센터 클라이언트 로직 (admin.js)
 * API 보안 상태 모니터링 & Google Gemini / OPEN API 4대 모델 연동 제어
 * [Ver-10] 백엔드(Server-to-Server) & GitHub Pages(브라우저 직접 통신) 완전 듀얼 모드 지원
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. 호스팅 환경 정확한 사전 감지 (GitHub Pages 또는 정적 호스팅)
  const isGitHubPages = window.location.hostname.includes('github.io') || window.location.hostname.endsWith('.github.io');
  const isStaticHosting = isGitHubPages || 
                          window.location.protocol === 'file:' || 
                          (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1') && window.location.port !== '3000');

  // 상태 관리 객체
  const adminState = {
    isStaticHosting: isStaticHosting,
    isBackendOnline: false,
    activeProvider: 'gemini',
    defaultOpenaiModel: 'gpt-6-astra',
    geminiConfigured: false,
    openAiConfigured: false,
    geminiMaskedKey: '',
    openAiMaskedKey: '',
    models: ['gpt-6-astra', 'gpt-5.5-sol', 'gpt-5.5-terra', 'gpt-5.5-luna']
  };

  // DOM 요소 참조
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // 헤더 및 환경 배너 요소
  const serverStatusText = document.getElementById('serverStatusText');
  const envNoticeBanner = document.getElementById('envNoticeBanner');

  // 보안 상태 요소
  const geminiSecStatusBadge = document.getElementById('geminiSecStatusBadge');
  const openAiSecStatusBadge = document.getElementById('openAiSecStatusBadge');
  const geminiMaskedKeyEl = document.getElementById('geminiMaskedKey');
  const openAiMaskedKeyEl = document.getElementById('openAiMaskedKey');
  const securityBadge = document.getElementById('securityBadge');
  const refreshSecurityBtn = document.getElementById('refreshSecurityBtn');

  // 연동 폼 요소
  const radioProviderGemini = document.getElementById('radioProviderGemini');
  const radioProviderOpenAi = document.getElementById('radioProviderOpenAi');
  const openaiKeyInput = document.getElementById('openaiKeyInput');
  const geminiKeyInput = document.getElementById('geminiKeyInput');
  const toggleOpenAiKeyVisibility = document.getElementById('toggleOpenAiKeyVisibility');
  const toggleGeminiKeyVisibility = document.getElementById('toggleGeminiKeyVisibility');
  const testOpenAiBtn = document.getElementById('testOpenAiBtn');
  const testGeminiBtn = document.getElementById('testGeminiBtn');
  const openaiTestResult = document.getElementById('openaiTestResult');
  const geminiTestResult = document.getElementById('geminiTestResult');
  const selectedOpenAiModelInput = document.getElementById('selectedOpenAiModel');
  const openaiModelCards = document.querySelectorAll('.model-card');
  const saveAllConfigBtn = document.getElementById('saveAllConfigBtn');

  // 진단 및 로그 요소
  const diagAppVersion = document.getElementById('diagAppVersion');
  const diagPort = document.getElementById('diagPort');
  const diagActiveEngine = document.getElementById('diagActiveEngine');
  const diagDefaultModel = document.getElementById('diagDefaultModel');
  const runFullDiagnosticsBtn = document.getElementById('runFullDiagnosticsBtn');
  const adminLogConsole = document.getElementById('adminLogConsole');
  const clearLogBtn = document.getElementById('clearLogBtn');
  const adminToast = document.getElementById('adminToast');

  // =========================================================
  // 0. 유틸리티 함수 & 안전한 파서
  // =========================================================
  async function parseJsonResponse(resp) {
    const text = await resp.text();
    const trimmed = text.trim();

    // HTML 응답 (404 페이지 등) 사전 차단 -> Unexpected token '<' 원천 방지
    if (trimmed.startsWith('<') || resp.status === 404) {
      if (isStaticHosting) {
        throw new Error('정적 배포(GitHub Pages) 환경입니다. 백엔드 서버 없이 브라우저 직접 통신 모드로 동작합니다.');
      } else {
        throw new Error(`백엔드 서버 API(/api/admin/...)를 찾을 수 없습니다 (HTTP ${resp.status}). 로컬 서버(http://localhost:3000) 구동 여부를 확인하세요.`);
      }
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`응답 데이터 파싱 실패 (HTTP ${resp.status}): ${trimmed.slice(0, 100)}`);
    }
  }

  function maskApiKey(key = '') {
    const clean = String(key || '').trim();
    if (!clean) return '미등록';
    if (clean.length < 8) return '••••••••';
    return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`;
  }

  function showToast(message, duration = 3000) {
    if (!adminToast) return;
    adminToast.textContent = message;
    adminToast.classList.remove('hidden');
    setTimeout(() => {
      adminToast.classList.add('hidden');
    }, duration);
  }

  function logMessage(text, level = 'info') {
    if (!adminLogConsole) return;
    const time = new Date().toTimeString().split(' ')[0];
    const line = document.createElement('div');
    line.className = `log-line ${level}`;
    line.textContent = `[${time}] ${text}`;
    adminLogConsole.appendChild(line);
    adminLogConsole.scrollTop = adminLogConsole.scrollHeight;
  }

  // =========================================================
  // 1. 탭 네비게이션 제어
  // =========================================================
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      tabPanes.forEach(p => p.classList.add('hidden'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const pane = document.getElementById(targetTab);
      if (pane) pane.classList.remove('hidden');

      const titleEl = btn.querySelector('.tab-title');
      if (titleEl) logMessage(`[NAV] ${titleEl.textContent} 탭으로 이동`);
    });
  });

  // =========================================================
  // 2. OPEN API 최신 모델 4종 선택 카드
  // =========================================================
  openaiModelCards.forEach(card => {
    card.addEventListener('click', () => {
      const modelName = card.dataset.model;
      adminState.defaultOpenaiModel = modelName;
      if (selectedOpenAiModelInput) selectedOpenAiModelInput.value = modelName;

      openaiModelCards.forEach(c => {
        c.classList.remove('active');
        const ind = c.querySelector('.select-indicator');
        if (ind) ind.textContent = '선택';
      });

      card.classList.add('active');
      const curInd = card.querySelector('.select-indicator');
      if (curInd) curInd.textContent = '✓ 선택됨';

      showToast(`OPEN API 모델: [${modelName}] 선택됨 🤖`);
      logMessage(`[OPEN API] 기본 모델이 [${modelName}]으로 선택되었습니다.`);
    });
  });

  // =========================================================
  // 3. API Key 표시 / 숨김 토글
  // =========================================================
  if (toggleOpenAiKeyVisibility && openaiKeyInput) {
    toggleOpenAiKeyVisibility.addEventListener('click', () => {
      const isPass = openaiKeyInput.type === 'password';
      openaiKeyInput.type = isPass ? 'text' : 'password';
      toggleOpenAiKeyVisibility.textContent = isPass ? '🔒' : '👁️';
    });
  }

  if (toggleGeminiKeyVisibility && geminiKeyInput) {
    toggleGeminiKeyVisibility.addEventListener('click', () => {
      const isPass = geminiKeyInput.type === 'password';
      geminiKeyInput.type = isPass ? 'text' : 'password';
      toggleGeminiKeyVisibility.textContent = isPass ? '🔒' : '👁️';
    });
  }

  // =========================================================
  // 4. 상태 초기화 및 동기화 (듀얼 모드)
  // =========================================================
  async function initAdminStatus() {
    // A. 정적 호스팅(GitHub Pages / file://)인 경우 백엔드 호출 완전 생략
    if (isStaticHosting) {
      applyClientStorageStatus();
      logMessage(`[ENV] 🌐 GitHub Pages 정적 배포 환경 감지 완료: 브라우저 직접 통신(Client-Direct) 모드로 가동합니다.`, 'info');
      return;
    }

    // B. 로컬 서버(http://localhost:3000)인 경우 백엔드 상태 조회
    logMessage('[API] 로컬 백엔드 서버 상태 및 보안 정보 요청 중...');
    try {
      const resp = await fetch('/api/admin/status');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await parseJsonResponse(resp);

      adminState.isBackendOnline = true;
      adminState.activeProvider = data.activeProvider || 'gemini';
      adminState.defaultOpenaiModel = data.defaultOpenaiModel || 'gpt-6-astra';
      adminState.geminiConfigured = Boolean(data.gemini?.isConfigured);
      adminState.openAiConfigured = Boolean(data.openai?.isConfigured);
      adminState.geminiMaskedKey = data.gemini?.maskedKey || '미등록';
      adminState.openAiMaskedKey = data.openai?.maskedKey || '미등록';

      // 헤더 상태 배지 업데이트
      if (serverStatusText) {
        serverStatusText.textContent = `보안 서버 구동 중 (Port ${data.port || 3000})`;
        const pill = serverStatusText.closest('.server-status-pill');
        if (pill) pill.className = 'server-status-pill';
      }
      if (envNoticeBanner) envNoticeBanner.classList.add('hidden');

      renderStatusToUI();
      logMessage(`[API] 백엔드 서버 상태 동기화 완료 (Gemini: ${adminState.geminiConfigured ? '연동' : '미등록'}, OPEN API: ${adminState.openAiConfigured ? '연동' : '미등록'})`, 'success');

    } catch (err) {
      console.warn('백엔드 API 미감지 -> 정적 웹/클라이언트 모드로 자동 전환:', err.message);
      applyClientStorageStatus();
    }
  }

  // 클라이언트 로컬 스토리지 상태 반영 함수
  function applyClientStorageStatus() {
    adminState.isBackendOnline = false;

    // 헤더 상태 알림 갱신
    if (serverStatusText) {
      serverStatusText.textContent = isGitHubPages ? '🌐 GitHub Pages 클라이언트 모드' : '⚠️ 브라우저 직접 통신 모드';
      const pill = serverStatusText.closest('.server-status-pill');
      if (pill) pill.className = 'server-status-pill client-mode';
    }
    if (envNoticeBanner) envNoticeBanner.classList.remove('hidden');

    // 브라우저 로컬 저장소(localStorage)에서 키 조회
    const savedGeminiKey = localStorage.getItem('gemini_poet_client_api_key') || '';
    const savedOpenAiKey = localStorage.getItem('openai_poet_client_api_key') || '';
    const savedActiveProvider = localStorage.getItem('poet_client_active_provider') || 'gemini';
    const savedOpenAiModel = localStorage.getItem('openai_poet_client_model') || 'gpt-6-astra';

    adminState.activeProvider = savedActiveProvider;
    adminState.defaultOpenaiModel = savedOpenAiModel;
    adminState.geminiConfigured = Boolean(savedGeminiKey && savedGeminiKey.length > 5);
    adminState.openAiConfigured = Boolean(savedOpenAiKey && savedOpenAiKey.length > 5);
    adminState.geminiMaskedKey = adminState.geminiConfigured ? maskApiKey(savedGeminiKey) : '미등록 (브라우저)';
    adminState.openAiMaskedKey = adminState.openAiConfigured ? maskApiKey(savedOpenAiKey) : '미등록 (브라우저)';

    renderStatusToUI();
  }

  // 상태를 DOM에 렌더링하는 공통 함수
  function renderStatusToUI() {
    // 1. 보안 탭 UI
    if (geminiMaskedKeyEl) geminiMaskedKeyEl.textContent = adminState.geminiMaskedKey;
    if (openAiMaskedKeyEl) openAiMaskedKeyEl.textContent = adminState.openAiMaskedKey;

    if (geminiSecStatusBadge) {
      geminiSecStatusBadge.textContent = adminState.geminiConfigured ? '✅ 연동 완료' : '⚠️ 키 등록 필요';
      geminiSecStatusBadge.className = adminState.geminiConfigured ? 'status-chip live' : 'status-chip warn';
    }

    if (openAiSecStatusBadge) {
      openAiSecStatusBadge.textContent = adminState.openAiConfigured ? '✅ 연동 완료' : '⚠️ 키 미등록';
      openAiSecStatusBadge.className = adminState.openAiConfigured ? 'status-chip live' : 'status-chip warn';
    }

    if (securityBadge) {
      securityBadge.textContent = (adminState.geminiConfigured || adminState.openAiConfigured) ? '정상 가동' : '설정 필요';
      securityBadge.className = (adminState.geminiConfigured || adminState.openAiConfigured) ? 'tab-badge' : 'tab-badge highlight';
    }

    // 2. 연동 탭 라디오 버튼
    if (radioProviderOpenAi && radioProviderGemini) {
      if (adminState.activeProvider === 'openai') {
        radioProviderOpenAi.checked = true;
      } else {
        radioProviderGemini.checked = true;
      }
    }

    // 모델 카드 활성화
    if (selectedOpenAiModelInput) selectedOpenAiModelInput.value = adminState.defaultOpenaiModel;
    openaiModelCards.forEach(card => {
      const isMatch = card.dataset.model === adminState.defaultOpenaiModel;
      card.classList.toggle('active', isMatch);
      const ind = card.querySelector('.select-indicator');
      if (ind) ind.textContent = isMatch ? '✓ 선택됨' : '선택';
    });

    // 3. 진단 탭 UI
    if (diagAppVersion) diagAppVersion.textContent = 'Ver-10';
    if (diagPort) diagPort.textContent = adminState.isBackendOnline ? '3000 (보안 REST)' : (isGitHubPages ? 'HTTPS (GitHub Pages 정적 배포)' : '클라이언트 로컬');
    if (diagActiveEngine) diagActiveEngine.textContent = adminState.activeProvider === 'openai' ? 'OPEN API (OpenAI)' : 'Google Gemini API';
    if (diagDefaultModel) diagDefaultModel.textContent = adminState.defaultOpenaiModel;
  }

  // =========================================================
  // 5. 브라우저 직접 통신 Ping (GitHub Pages 전용 클라이언트 엔진)
  // =========================================================

  // 5-1. Gemini 브라우저 직접 Ping
  async function testGeminiClientDirect(apiKey) {
    const startTime = Date.now();
    // 실제 지원 모델 우선 순위
    const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
    let lastError = null;

    for (const curModel of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${curModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: '안녕' }] }],
            generationConfig: { maxOutputTokens: 20 }
          })
        });

        const elapsed = Date.now() - startTime;
        const text = await response.text();
        let data = {};
        try { data = JSON.parse(text); } catch (e) { data = {}; }

        if (response.ok) {
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.slice(0, 100) || '정상 응답 수신';
          return {
            success: true,
            model: curModel,
            latencyMs: elapsed,
            responseSnippet: reply
          };
        }

        // 400 또는 403 인증 실패
        if (response.status === 400 || response.status === 403) {
          throw new Error(`Google Gemini API 키 인증 실패 (HTTP ${response.status}): ${data.error?.message || '키가 유효하지 않거나 API 권한이 활성화되지 않았습니다.'}`);
        }

        // 429 할당량 초과
        if (response.status === 429) {
          throw new Error(`Google Gemini 요청 한도 초과 (HTTP 429): 잠시 후 다시 시도해 주세요.`);
        }

        // 404 모델 없음 -> 다음 모델 계속 시도
        if (response.status === 404) {
          lastError = new Error(`[${curModel}] 모델 미지원: 다음 모델로 재시도합니다.`);
          continue;
        }

        lastError = new Error(data.error?.message || `HTTP ${response.status} 오류`);
      } catch (netErr) {
        if (netErr.message && (netErr.message.includes('인증 실패') || netErr.message.includes('한도 초과'))) {
          throw netErr;
        }
        lastError = netErr;
      }
    }

    throw lastError || new Error('Google Gemini API 서버에 연결하지 못했습니다. 키와 네트워크 상태를 확인하세요.');
  }

  // 5-2. OpenAI 브라우저 직접 Ping
  async function testOpenAiClientDirect(apiKey, requestedModel = 'gpt-6-astra') {
    const startTime = Date.now();
    // 최신 실가동 모델 폴백 체인
    const candidateModels = [requestedModel, 'gpt-4o-mini', 'gpt-4o'];
    const uniqueCandidates = [...new Set(candidateModels)];
    let lastError = null;

    for (const curModel of uniqueCandidates) {
      const isReasoning = curModel.includes('astra') || curModel.includes('sol') || curModel.startsWith('o1') || curModel.startsWith('o3');
      const messages = [
        { role: isReasoning ? 'developer' : 'system', content: 'You are a test ping agent. Reply with exactly one greeting word in Korean.' },
        { role: 'user', content: 'Ping' }
      ];

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: curModel,
            messages,
            ...(isReasoning ? { max_completion_tokens: 30 } : { max_tokens: 30, temperature: 0.7 })
          })
        });

        const elapsed = Date.now() - startTime;
        const text = await response.text();
        let data = {};
        try { data = JSON.parse(text); } catch (e) { data = {}; }

        if (response.ok) {
          const reply = data.choices?.[0]?.message?.content?.trim()?.slice(0, 100) || '정상 응답 수신';
          const isFallback = curModel !== requestedModel;
          return {
            success: true,
            model: curModel,
            isFallback,
            requestedModel,
            latencyMs: elapsed,
            responseSnippet: reply
          };
        }

        // 401 인증 실패
        if (response.status === 401) {
          throw new Error(`OpenAI API 키 인증 실패 (HTTP 401): 올바르지 않은 API 키입니다 (sk-...).`);
        }

        // 429 크레딧/사용량 제한
        if (response.status === 429) {
          throw new Error(`OpenAI 사용량 제한 (HTTP 429): 계정 크레딧 잔액(Quota)이 부족하거나 호출 한도를 초과했습니다.`);
        }

        // 404 모델 없음 -> 다음 모델(gpt-4o-mini)로 계속 진행
        if (response.status === 404 || data.error?.code === 'model_not_found') {
          lastError = new Error(`[${curModel}] 모델 미지원: ${data.error?.message || 'Model not found'}`);
          continue;
        }

        throw new Error(data.error?.message || `HTTP ${response.status} 오류`);

      } catch (netErr) {
        if (netErr.message && (netErr.message.includes('인증 실패') || netErr.message.includes('사용량 제한'))) {
          throw netErr;
        }
        lastError = netErr;
      }
    }

    throw lastError || new Error('OPEN API 서버에 연결하지 못했습니다. 네트워크 상태 및 API 키를 확인해 주세요.');
  }

  // =========================================================
  // 6. Google Gemini 연결 테스트 버튼 이벤트
  // =========================================================
  if (testGeminiBtn) {
    testGeminiBtn.addEventListener('click', async () => {
      const inputKey = (geminiKeyInput ? geminiKeyInput.value.trim() : '') || localStorage.getItem('gemini_poet_client_api_key') || '';

      if (!geminiTestResult) return;
      geminiTestResult.className = 'test-result-box loading';
      geminiTestResult.classList.remove('hidden');
      geminiTestResult.innerHTML = `<span>⏳ Google Gemini API에 연결 테스트 핑을 전송 중입니다...</span>`;
      testGeminiBtn.disabled = true;

      try {
        let result = null;

        // A. 정적 호스팅(GitHub Pages)이거나 백엔드가 오프라인인 경우 -> 브라우저 직접 테스트
        if (isStaticHosting || !adminState.isBackendOnline) {
          if (!inputKey || inputKey.length < 5) {
            throw new Error('Google Gemini API Key를 입력해 주세요. (Google AI Studio에서 발급받은 AIzaSy... 키를 상단 입력창에 입력 후 테스트를 눌러주세요)');
          }
          result = await testGeminiClientDirect(inputKey);
        } else {
          // B. 로컬 백엔드 서버 구동 중인 경우 -> 서버를 통한 테스트
          try {
            const resp = await fetch('/api/admin/test-connection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                provider: 'gemini',
                apiKey: inputKey,
                model: 'gemini-2.5-flash'
              })
            });
            result = await parseJsonResponse(resp);
            if (!resp.ok || !result.success) throw new Error(result.error || `HTTP ${resp.status}`);
          } catch (backendErr) {
            if (inputKey && inputKey.length > 5) {
              logMessage(`[TEST] 백엔드 연결 불가 (${backendErr.message}), 브라우저 직접 테스트로 전환합니다.`, 'warn');
              result = await testGeminiClientDirect(inputKey);
            } else {
              throw backendErr;
            }
          }
        }

        // 성공 렌더링
        geminiTestResult.className = 'test-result-box success';
        let noticeHtml = '';
        if (inputKey) {
          localStorage.setItem('gemini_poet_client_api_key', inputKey);
          adminState.geminiConfigured = true;
          adminState.geminiMaskedKey = maskApiKey(inputKey);
          if (geminiMaskedKeyEl) geminiMaskedKeyEl.textContent = adminState.geminiMaskedKey;
          if (geminiSecStatusBadge) {
            geminiSecStatusBadge.textContent = '✅ 연동 완료';
            geminiSecStatusBadge.className = 'status-chip live';
          }
          if (securityBadge) {
            securityBadge.textContent = '정상 가동';
            securityBadge.className = 'tab-badge';
          }
          noticeHtml = `<p style="margin-top:4px; font-size:0.78rem; color:#10b981;">💾 API 키가 브라우저에 안전하게 보관되어 서정시 창작에 즉시 연동됩니다.</p>`;
        }

        geminiTestResult.innerHTML = `
          <div>
            <strong>✅ Google Gemini 연결 성공!</strong>
            <p style="margin-top:4px; font-size:0.82rem;">모델: <code>${result.model}</code> · 응답 지연: <strong>${result.latencyMs}ms</strong></p>
            <p style="margin-top:2px; font-size:0.8rem; opacity:0.85;">수신 응답: "${result.responseSnippet}"</p>
            ${noticeHtml}
          </div>
        `;
        logMessage(`[TEST] Google Gemini 연결 성공 (${result.latencyMs}ms)`, 'success');
        showToast(`Google Gemini 연결에 성공했습니다! ⚡ (${result.latencyMs}ms)`);

      } catch (err) {
        geminiTestResult.className = 'test-result-box error';
        geminiTestResult.innerHTML = `
          <div>
            <strong>❌ Google Gemini 연결 실패</strong>
            <p style="margin-top:4px; font-size:0.82rem;">오류 내용: ${err.message}</p>
          </div>
        `;
        logMessage(`[TEST] Google Gemini 연결 실패: ${err.message}`, 'error');
        showToast(`Google Gemini 연결 실패: ${err.message}`);
      } finally {
        testGeminiBtn.disabled = false;
      }
    });
  }

  // =========================================================
  // 7. OPEN API (OpenAI) 연결 테스트 버튼 이벤트
  // =========================================================
  if (testOpenAiBtn) {
    testOpenAiBtn.addEventListener('click', async () => {
      const inputKey = (openaiKeyInput ? openaiKeyInput.value.trim() : '') || localStorage.getItem('openai_poet_client_api_key') || '';
      const modelToTest = (selectedOpenAiModelInput ? selectedOpenAiModelInput.value : '') || 'gpt-6-astra';

      if (!openaiTestResult) return;
      openaiTestResult.className = 'test-result-box loading';
      openaiTestResult.classList.remove('hidden');
      openaiTestResult.innerHTML = `<span>⏳ OPEN API [${modelToTest}] 모델에 연결 테스트 핑을 전송 중입니다...</span>`;
      testOpenAiBtn.disabled = true;

      try {
        let result = null;

        // A. 정적 호스팅(GitHub Pages)이거나 백엔드가 오프라인인 경우 -> 브라우저 직접 테스트
        if (isStaticHosting || !adminState.isBackendOnline) {
          if (!inputKey || inputKey.length < 5) {
            throw new Error('OPEN API Key(sk-...)를 상단 입력창에 입력해 주세요.');
          }
          result = await testOpenAiClientDirect(inputKey, modelToTest);
        } else {
          // B. 로컬 백엔드 서버 구동 중인 경우 -> 서버를 통한 테스트
          try {
            const resp = await fetch('/api/admin/test-connection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                provider: 'openai',
                apiKey: inputKey,
                model: modelToTest
              })
            });
            result = await parseJsonResponse(resp);
            if (!resp.ok || !result.success) throw new Error(result.error || `HTTP ${resp.status}`);
          } catch (backendErr) {
            if (inputKey && inputKey.length > 5) {
              logMessage(`[TEST] 백엔드 연결 불가 (${backendErr.message}), 브라우저 직접 테스트로 전환합니다.`, 'warn');
              result = await testOpenAiClientDirect(inputKey, modelToTest);
            } else {
              throw backendErr;
            }
          }
        }

        // 성공 렌더링
        openaiTestResult.className = 'test-result-box success';
        let noticeHtml = '';
        if (result.isFallback) {
          noticeHtml = `<p style="margin-top:4px; font-size:0.78rem; color:#f59e0b;">💡 <strong>참고</strong>: [${result.requestedModel}] 모델이 계정에서 미지원되어 실가동 모델 <code>${result.model}</code>로 키 유효성을 완벽히 검증했습니다.</p>`;
        }
        if (inputKey) {
          localStorage.setItem('openai_poet_client_api_key', inputKey);
          localStorage.setItem('openai_poet_client_model', result.model);
          adminState.openAiConfigured = true;
          adminState.openAiMaskedKey = maskApiKey(inputKey);
          if (openAiMaskedKeyEl) openAiMaskedKeyEl.textContent = adminState.openAiMaskedKey;
          if (openAiSecStatusBadge) {
            openAiSecStatusBadge.textContent = '✅ 연동 완료';
            openAiSecStatusBadge.className = 'status-chip live';
          }
          if (securityBadge) {
            securityBadge.textContent = '정상 가동';
            securityBadge.className = 'tab-badge';
          }
          noticeHtml += `<p style="margin-top:4px; font-size:0.78rem; color:#10b981;">💾 API 키가 브라우저에 안전하게 보관되어 서정시 창작에 즉시 연동됩니다.</p>`;
        }

        openaiTestResult.innerHTML = `
          <div>
            <strong>✅ OPEN API 연결 성공!</strong>
            <p style="margin-top:4px; font-size:0.82rem;">모델: <code>${result.model}</code> · 응답 지연: <strong>${result.latencyMs}ms</strong></p>
            <p style="margin-top:2px; font-size:0.8rem; opacity:0.85;">수신 응답: "${result.responseSnippet}"</p>
            ${noticeHtml}
          </div>
        `;
        logMessage(`[TEST] OPEN API (${result.model}) 연결 성공 (${result.latencyMs}ms)`, 'success');
        showToast(`OPEN API [${result.model}] 연결에 성공했습니다! ⚡ (${result.latencyMs}ms)`);

      } catch (err) {
        openaiTestResult.className = 'test-result-box error';
        openaiTestResult.innerHTML = `
          <div>
            <strong>❌ OPEN API 연결 실패</strong>
            <p style="margin-top:4px; font-size:0.82rem;">오류 내용: ${err.message}</p>
          </div>
        `;
        logMessage(`[TEST] OPEN API 연결 실패: ${err.message}`, 'error');
        showToast(`OPEN API 연결 실패: ${err.message}`);
      } finally {
        testOpenAiBtn.disabled = false;
      }
    });
  }

  // =========================================================
  // 8. 관리자 설정 저장 (로컬 .env 또는 브라우저 로컬 저장소)
  // =========================================================
  if (saveAllConfigBtn) {
    saveAllConfigBtn.addEventListener('click', async () => {
      saveAllConfigBtn.disabled = true;
      saveAllConfigBtn.innerHTML = '<span>⏳ 설정 저장 및 적용 중...</span>';

      const activeProvider = (radioProviderOpenAi && radioProviderOpenAi.checked) ? 'openai' : 'gemini';
      const defaultOpenaiModel = (selectedOpenAiModelInput ? selectedOpenAiModelInput.value : '') || 'gpt-6-astra';
      const openaiApiKey = openaiKeyInput ? openaiKeyInput.value.trim() : '';
      const geminiApiKey = geminiKeyInput ? geminiKeyInput.value.trim() : '';

      try {
        // A. 정적 호스팅(GitHub Pages)인 경우 -> 브라우저 로컬 스토리지에 영구 저장
        if (isStaticHosting || !adminState.isBackendOnline) {
          if (openaiApiKey) localStorage.setItem('openai_poet_client_api_key', openaiApiKey);
          if (geminiApiKey) localStorage.setItem('gemini_poet_client_api_key', geminiApiKey);
          localStorage.setItem('poet_client_active_provider', activeProvider);
          localStorage.setItem('openai_poet_client_model', defaultOpenaiModel);

          showToast('🎉 브라우저 로컬 저장소에 API 키와 모델 설정이 안전하게 저장되었습니다!');
          logMessage(`[SAVE] 브라우저(localStorage) 설정 저장 완료 (활성 엔진: ${activeProvider}, 모델: ${defaultOpenaiModel})`, 'success');

          if (openaiKeyInput) openaiKeyInput.value = '';
          if (geminiKeyInput) geminiKeyInput.value = '';
          applyClientStorageStatus();

        } else {
          // B. 로컬 백엔드 서버 구동 중인 경우 -> 서버 .env 파일에 저장
          const payload = { activeProvider, defaultOpenaiModel };
          if (openaiApiKey) payload.openaiApiKey = openaiApiKey;
          if (geminiApiKey) payload.geminiApiKey = geminiApiKey;

          const resp = await fetch('/api/admin/save-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const data = await parseJsonResponse(resp);
          if (resp.ok && data.success) {
            showToast('🎉 관리자 설정이 .env에 성공적으로 저장되었습니다!');
            logMessage(`[SAVE] .env 설정 저장 완료 (활성: ${data.activeProvider}, 모델: ${data.defaultOpenaiModel})`, 'success');
            if (openaiKeyInput) openaiKeyInput.value = '';
            if (geminiKeyInput) geminiKeyInput.value = '';
            await initAdminStatus();
          } else {
            throw new Error(data.error || '저장에 실패했습니다.');
          }
        }
      } catch (err) {
        showToast(`저장 오류: ${err.message}`);
        logMessage(`[ERROR] 설정 저장 실패: ${err.message}`, 'error');
      } finally {
        saveAllConfigBtn.disabled = false;
        saveAllConfigBtn.innerHTML = '<span>💾 관리자 설정 영구 저장 및 즉시 적용</span>';
      }
    });
  }

  // =========================================================
  // 9. 진단 및 새로고침 이벤트
  // =========================================================
  if (refreshSecurityBtn) {
    refreshSecurityBtn.addEventListener('click', () => {
      initAdminStatus();
      showToast('보안 상태 정보를 갱신했습니다 🔄');
    });
  }

  if (runFullDiagnosticsBtn) {
    runFullDiagnosticsBtn.addEventListener('click', () => {
      initAdminStatus();
      showToast('전체 시스템 종합 진단을 완료했습니다 ⚡');
    });
  }

  if (clearLogBtn && adminLogConsole) {
    clearLogBtn.addEventListener('click', () => {
      adminLogConsole.innerHTML = '<div class="log-line info">[LOG] 로그 콘솔이 초기화되었습니다.</div>';
    });
  }

  // 시작 시 상태 조회 실행
  initAdminStatus();
});
