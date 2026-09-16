/**
 * 시원(詩苑) AI 관리자 센터 클라이언트 로직 (admin.js)
 * API 보안 상태 모니터링 & OPEN API 4대 모델 연동 제어
 */

document.addEventListener('DOMContentLoaded', () => {
  // 상태 관리 객체
  const adminState = {
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
  // 1. 탭 전환 제어
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

      logMessage(`[NAV] ${btn.querySelector('.tab-title').textContent} 탭으로 이동`);
    });
  });

  // =========================================================
  // 2. OPEN API 최신 모델 4종 선택 카드 상호작용
  // =========================================================
  openaiModelCards.forEach(card => {
    card.addEventListener('click', () => {
      const modelName = card.dataset.model;
      adminState.defaultOpenaiModel = modelName;
      selectedOpenAiModelInput.value = modelName;

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
  // 3. API Key 표시/숨김 토글
  // =========================================================
  toggleOpenAiKeyVisibility.addEventListener('click', () => {
    const isPass = openaiKeyInput.type === 'password';
    openaiKeyInput.type = isPass ? 'text' : 'password';
    toggleOpenAiKeyVisibility.textContent = isPass ? '🔒' : '👁️';
  });

  toggleGeminiKeyVisibility.addEventListener('click', () => {
    const isPass = geminiKeyInput.type === 'password';
    geminiKeyInput.type = isPass ? 'text' : 'password';
    toggleGeminiKeyVisibility.textContent = isPass ? '🔒' : '👁️';
  });

  // =========================================================
  // 4. 관리자 상태 조회 및 UI 초기화
  // =========================================================
  async function fetchAdminStatus() {
    try {
      logMessage('[API] 서버 상태 및 보안 정보 요청 중...');
      const resp = await fetch('/api/admin/status');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      adminState.activeProvider = data.activeProvider || 'gemini';
      adminState.defaultOpenaiModel = data.defaultOpenaiModel || 'gpt-6-astra';
      adminState.geminiConfigured = Boolean(data.gemini?.isConfigured);
      adminState.openAiConfigured = Boolean(data.openai?.isConfigured);
      adminState.geminiMaskedKey = data.gemini?.maskedKey || '미등록';
      adminState.openAiMaskedKey = data.openai?.maskedKey || '미등록';

      // 1. 보안 탭 UI 갱신
      if (geminiMaskedKeyEl) geminiMaskedKeyEl.textContent = adminState.geminiMaskedKey;
      if (openAiMaskedKeyEl) openAiMaskedKeyEl.textContent = adminState.openAiMaskedKey;

      if (adminState.geminiConfigured) {
        geminiSecStatusBadge.textContent = '✅ 연동 완료';
        geminiSecStatusBadge.className = 'status-chip live';
      } else {
        geminiSecStatusBadge.textContent = '⚠️ 키 등록 필요';
        geminiSecStatusBadge.className = 'status-chip warn';
      }

      if (adminState.openAiConfigured) {
        openAiSecStatusBadge.textContent = '✅ 연동 완료';
        openAiSecStatusBadge.className = 'status-chip live';
      } else {
        openAiSecStatusBadge.textContent = '⚠️ 키 미등록';
        openAiSecStatusBadge.className = 'status-chip warn';
      }

      if (adminState.geminiConfigured || adminState.openAiConfigured) {
        securityBadge.textContent = '보안 가동';
        securityBadge.className = 'tab-badge';
      } else {
        securityBadge.textContent = '설정 필요';
        securityBadge.className = 'tab-badge highlight';
      }

      // 2. 연동 탭 UI 갱신 (제공자 라디오)
      if (adminState.activeProvider === 'openai') {
        radioProviderOpenAi.checked = true;
      } else {
        radioProviderGemini.checked = true;
      }

      // OPEN API 선택 모델 카드 하이라이트
      selectedOpenAiModelInput.value = adminState.defaultOpenaiModel;
      openaiModelCards.forEach(card => {
        const isMatch = card.dataset.model === adminState.defaultOpenaiModel;
        card.classList.toggle('active', isMatch);
        const ind = card.querySelector('.select-indicator');
        if (ind) ind.textContent = isMatch ? '✓ 선택됨' : '선택';
      });

      // 3. 진단 탭 UI 갱신
      if (diagAppVersion) diagAppVersion.textContent = data.version || 'Ver-10';
      if (diagPort) diagPort.textContent = data.port || '3000';
      if (diagActiveEngine) diagActiveEngine.textContent = adminState.activeProvider === 'openai' ? 'OPEN API (OpenAI)' : 'Google Gemini API';
      if (diagDefaultModel) diagDefaultModel.textContent = adminState.defaultOpenaiModel;

      logMessage(`[API] 서버 상태 동기화 완료 (Gemini: ${adminState.geminiConfigured ? '연동' : '미등록'}, OPEN API: ${adminState.openAiConfigured ? '연동' : '미등록'})`, 'success');
    } catch (err) {
      console.error('관리자 상태 로드 실패:', err);
      logMessage(`[ERROR] 상태 조회 실패: ${err.message}`, 'error');
      showToast(`서버 상태를 불러오지 못했습니다: ${err.message}`);
    }
  }

  // =========================================================
  // 5. OPEN API 연결 테스트 (실시간 Ping)
  // =========================================================
  testOpenAiBtn.addEventListener('click', async () => {
    const inputKey = openaiKeyInput.value.trim();
    const modelToTest = selectedOpenAiModelInput.value || 'gpt-6-astra';

    openaiTestResult.className = 'test-result-box loading';
    openaiTestResult.classList.remove('hidden');
    openaiTestResult.innerHTML = `<span>⏳ OPEN API [${modelToTest}] 모델에 연결 테스트 핑을 전송 중입니다...</span>`;
    testOpenAiBtn.disabled = true;

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

      const result = await resp.json();

      if (resp.ok && result.success) {
        openaiTestResult.className = 'test-result-box success';
        openaiTestResult.innerHTML = `
          <div>
            <strong>✅ OPEN API 연결 성공!</strong>
            <p style="margin-top:4px; font-size:0.82rem;">모델: <code>${result.model}</code> · 응답 지연: <strong>${result.latencyMs}ms</strong></p>
            <p style="margin-top:2px; font-size:0.8rem; opacity:0.85;">수신 메시지: "${result.responseSnippet}"</p>
          </div>
        `;
        logMessage(`[TEST] OPEN API (${result.model}) 연결 성공 (${result.latencyMs}ms)`, 'success');
        showToast(`OPEN API [${result.model}] 연결에 성공했습니다! ⚡ (${result.latencyMs}ms)`);
      } else {
        throw new Error(result.error || `HTTP ${resp.status}`);
      }
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

  // =========================================================
  // 6. Gemini 연결 테스트 (실시간 Ping)
  // =========================================================
  testGeminiBtn.addEventListener('click', async () => {
    const inputKey = geminiKeyInput.value.trim();

    geminiTestResult.className = 'test-result-box loading';
    geminiTestResult.classList.remove('hidden');
    geminiTestResult.innerHTML = `<span>⏳ Google Gemini API에 연결 테스트 핑을 전송 중입니다...</span>`;
    testGeminiBtn.disabled = true;

    try {
      const resp = await fetch('/api/admin/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gemini',
          apiKey: inputKey,
          model: 'gemini-3.8-flash'
        })
      });

      const result = await resp.json();

      if (resp.ok && result.success) {
        geminiTestResult.className = 'test-result-box success';
        geminiTestResult.innerHTML = `
          <div>
            <strong>✅ Google Gemini 연결 성공!</strong>
            <p style="margin-top:4px; font-size:0.82rem;">모델: <code>${result.model}</code> · 응답 지연: <strong>${result.latencyMs}ms</strong></p>
            <p style="margin-top:2px; font-size:0.8rem; opacity:0.85;">수신 메시지: "${result.responseSnippet}"</p>
          </div>
        `;
        logMessage(`[TEST] Google Gemini 연결 성공 (${result.latencyMs}ms)`, 'success');
        showToast(`Google Gemini 연결에 성공했습니다! ⚡ (${result.latencyMs}ms)`);
      } else {
        throw new Error(result.error || `HTTP ${resp.status}`);
      }
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

  // =========================================================
  // 7. 통합 관리자 설정 저장
  // =========================================================
  saveAllConfigBtn.addEventListener('click', async () => {
    saveAllConfigBtn.disabled = true;
    saveAllConfigBtn.innerHTML = '<span>⏳ .env 동기화 및 저장 중...</span>';

    const activeProvider = radioProviderOpenAi.checked ? 'openai' : 'gemini';
    const defaultOpenaiModel = selectedOpenAiModelInput.value || 'gpt-6-astra';
    const openaiApiKey = openaiKeyInput.value.trim();
    const geminiApiKey = geminiKeyInput.value.trim();

    const payload = {
      activeProvider,
      defaultOpenaiModel
    };

    // 키가 입력된 경우만 payload에 포함 (빈 칸이면 기존 키 유지)
    if (openaiApiKey) payload.openaiApiKey = openaiApiKey;
    if (geminiApiKey) payload.geminiApiKey = geminiApiKey;

    try {
      const resp = await fetch('/api/admin/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await resp.json();

      if (resp.ok && data.success) {
        showToast('🎉 관리자 설정이 .env에 성공적으로 저장되었습니다!');
        logMessage(`[SAVE] 설정 저장 완료 (활성 엔진: ${data.activeProvider}, 기본 모델: ${data.defaultOpenaiModel})`, 'success');
        
        // 입력창 비우기 (보안상 입력 필드는 초기화하고 마스킹 뷰로 갱신)
        openaiKeyInput.value = '';
        geminiKeyInput.value = '';

        // 상태 새로고침
        await fetchAdminStatus();
      } else {
        throw new Error(data.error || '저장에 실패했습니다.');
      }
    } catch (err) {
      showToast(`저장 오류: ${err.message}`);
      logMessage(`[ERROR] 설정 저장 실패: ${err.message}`, 'error');
    } finally {
      saveAllConfigBtn.disabled = false;
      saveAllConfigBtn.innerHTML = '<span>💾 관리자 설정 영구 저장 및 즉시 적용</span>';
    }
  });

  // =========================================================
  // 8. 진단 및 새로고침 이벤트
  // =========================================================
  if (refreshSecurityBtn) {
    refreshSecurityBtn.addEventListener('click', () => {
      fetchAdminStatus();
      showToast('보안 상태 정보를 갱신했습니다 🔄');
    });
  }

  if (runFullDiagnosticsBtn) {
    runFullDiagnosticsBtn.addEventListener('click', () => {
      fetchAdminStatus();
      showToast('전체 시스템 종합 진단을 완료했습니다 ⚡');
    });
  }

  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', () => {
      adminLogConsole.innerHTML = '<div class="log-line info">[LOG] 로그 콘솔이 초기화되었습니다.</div>';
    });
  }

  // =========================================================
  // 9. 유틸리티 함수
  // =========================================================
  function showToast(message, duration = 3000) {
    adminToast.textContent = message;
    adminToast.classList.remove('hidden');
    setTimeout(() => {
      adminToast.classList.add('hidden');
    }, duration);
  }

  function logMessage(text, level = 'info') {
    const time = new Date().toTimeString().split(' ')[0];
    const line = document.createElement('div');
    line.className = `log-line ${level}`;
    line.textContent = `[${time}] ${text}`;
    adminLogConsole.appendChild(line);
    adminLogConsole.scrollTop = adminLogConsole.scrollHeight;
  }

  // 최초 로드 시 상태 조회 실행
  fetchAdminStatus();
});
