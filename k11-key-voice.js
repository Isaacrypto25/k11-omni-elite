/**
 * K11 OMNI ELITE — KEY VOICE (ElevenLabs)
 * ════════════════════════════════════════════════════════════════
 * Responsável por:
 *   1. Armazenar e recuperar a chave ElevenLabs e o Voice ID
 *   2. Expor K11KeyVoice.speak(text) — síntese neural via ElevenLabs
 *   3. Expor K11KeyVoice.openPanel() — painel de configuração visual
 *   4. Log interno acessível via K11KeyVoice.getLog()
 *   5. Fallback automático para Web Speech se sem chave ou erro
 *
 * Free tier ElevenLabs: ~10.000 chars/mês, sem cartão.
 * Chave em: https://elevenlabs.io/app/settings/api-keys
 *
 * Inserir no dashboard.html ANTES de k11-voice-assistant.js:
 *   <script src="k11-key-voice.js"></script>
 *   <script src="k11-voice-assistant.js"></script>
 */

'use strict';

const K11KeyVoice = (() => {

    // ══════════════════════════════════════════════════════════
    // CONSTANTES
    // ══════════════════════════════════════════════════════════
    const SK_API   = 'sk_ff5e76724ba2deb0a9afcb0fd81a913e7559b725fc7d58b0';
    const SK_VOICE = 'k11_el_voice_id';
    const API_BASE = 'https://api.elevenlabs.io/v1';
    const MODEL    = 'eleven_multilingual_v2';

    // Vozes sugeridas (todas funcionam bem em pt-BR)
    const VOICES = [
        { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica',  tag: 'Feminina · clara'      },
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',    tag: 'Feminina · suave'       },
        { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam',     tag: 'Masculina · objetivo'   },
        { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',     tag: 'Feminina · expressiva'  },
        { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',   tag: 'Masculina · profundo'   },
    ];

    // ══════════════════════════════════════════════════════════
    // LOG INTERNO
    // ══════════════════════════════════════════════════════════
    const _log = [];

    function _emit(level, msg, data) {
        const entry = {
            ts:    new Date().toLocaleTimeString('pt-BR'),
            level, // 'info' | 'ok' | 'warn' | 'error'
            msg,
            data:  data ?? null,
        };
        _log.push(entry);
        const icon = { info:'ℹ️', ok:'✅', warn:'⚠️', error:'❌' }[level] || '·';
        console.log(`[K11KeyVoice] ${icon} ${msg}`, data ?? '');
        _renderLog();
        return entry;
    }

    function getLog() { return [..._log]; }

    // ══════════════════════════════════════════════════════════
    // STORAGE
    // ══════════════════════════════════════════════════════════
    function getApiKey()  { try { return localStorage.getItem(SK_API)   || ''; } catch(_) { return ''; } }
    function getVoiceId() { try { return localStorage.getItem(SK_VOICE) || VOICES[0].id; } catch(_) { return VOICES[0].id; } }

    function _saveApiKey(k)  { try { localStorage.setItem(SK_API,   k.trim()); } catch(_) {} }
    function _saveVoiceId(v) { try { localStorage.setItem(SK_VOICE, v.trim()); } catch(_) {} }

    function isReady() { return getApiKey().length > 10; }

    // ══════════════════════════════════════════════════════════
    // SÍNTESE — ElevenLabs + fallback Web Speech
    // ══════════════════════════════════════════════════════════
    let _currentAudio  = null;
    let _onStartCb     = null;
    let _onEndCb       = null;
    let _audioCtx      = null;  // AudioContext desbloqueado pelo primeiro gesto

    // Desbloqueia autoplay no iOS/Safari — DEVE ser chamado dentro de um click/touch
    function _unlockAudio() {
        try {
            if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (_audioCtx.state === 'suspended') _audioCtx.resume();
        } catch(_) {}
    }

    // Reproduz blob de áudio compatível com iOS Safari (autoplay policy)
    async function _playBlob(blob) {
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { URL.revokeObjectURL(url); _currentAudio = null; };
        audio.onerror = () => { URL.revokeObjectURL(url); _currentAudio = null; };
        _currentAudio = audio;
        try {
            await audio.play();
        } catch(e) {
            // iOS bloqueou — tenta via AudioContext como fallback
            try {
                const ctx     = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
                _audioCtx     = ctx;
                if (ctx.state === 'suspended') await ctx.resume();
                const arrBuf  = await new Response(blob).arrayBuffer();
                const decoded = await ctx.decodeAudioData(arrBuf);
                const src     = ctx.createBufferSource();
                src.buffer    = decoded;
                src.connect(ctx.destination);
                src.onended   = () => { _currentAudio = null; };
                src.start(0);
                _currentAudio = { pause: () => { try { src.stop(); } catch(_){} } };
            } catch(e2) {
                _emit('error', 'Autoplay bloqueado pelo navegador', e2.message);
                _currentAudio = null;
                throw e2;
            }
        }
    }

    function onStart(cb) { _onStartCb = cb; }
    function onEnd(cb)   { _onEndCb   = cb; }

    function stop() {
        if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
        if (_onEndCb) _onEndCb();
    }

    async function speak(text) {
        if (!text?.trim()) return;

        if (!isReady()) {
            _emit('warn', 'Sem chave ElevenLabs — fallback Web Speech', { text: text.substring(0, 40) });
            _webSpeechFallback(text);
            return;
        }

        stop();
        const apiKey  = getApiKey();
        const voiceId = getVoiceId();
        const voiceName = VOICES.find(v => v.id === voiceId)?.name ?? voiceId.substring(0, 8);

        _emit('info', `Gerando áudio — voz: ${voiceName}`, { chars: text.length });

        try {
            if (_onStartCb) _onStartCb();

            const res = await fetch(`${API_BASE}/text-to-speech/${voiceId}/stream`, {
                method: 'POST',
                headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    model_id: MODEL,
                    voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
                }),
            });

            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                const errMsg  = errBody?.detail?.message ?? errBody?.detail ?? `HTTP ${res.status}`;
                _emit('error', `ElevenLabs recusou a requisição`, { status: res.status, msg: errMsg });
                _webSpeechFallback(text);
                if (_onEndCb) _onEndCb();
                return;
            }

            const blob = await res.blob();
            try {
                await _playBlob(blob);
                _emit('ok', 'Reproduzindo áudio ElevenLabs');
                // Aguarda fim do áudio para disparar onEndCb
                if (_currentAudio && _currentAudio.addEventListener) {
                    _currentAudio.addEventListener('ended', () => { if (_onEndCb) _onEndCb(); });
                    _currentAudio.addEventListener('error', () => { _webSpeechFallback(text); if (_onEndCb) _onEndCb(); });
                } else {
                    // AudioContext path — sem evento ended confiável, dispara direto
                    setTimeout(() => { if (_onEndCb) _onEndCb(); }, 500);
                }
            } catch(e) {
                _emit('warn', 'ElevenLabs bloqueado — fallback Web Speech');
                _webSpeechFallback(text);
                if (_onEndCb) _onEndCb();
            }

        } catch (e) {
            _emit('error', 'Exceção na chamada ElevenLabs', e.message);
            _webSpeechFallback(text);
            if (_onEndCb) _onEndCb();
        }
    }

    function _webSpeechFallback(text) {
        _emit('info', 'Usando Web Speech API (fallback)');
        const synth = window.speechSynthesis;
        if (!synth) { _emit('error', 'Web Speech indisponível neste browser'); return; }
        try { synth.cancel(); } catch(_) {}
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR';
        u.onstart = () => { if (_onStartCb) _onStartCb(); };
        u.onend   = () => { _emit('ok', 'Web Speech finalizado'); if (_onEndCb) _onEndCb(); };
        const fire = () => {
            const vl = synth.getVoices();
            const v  = vl.find(v => v.lang === 'pt-BR') || vl.find(v => v.lang.startsWith('pt')) || null;
            if (v) { u.voice = v; _emit('info', `Web Speech voz: ${v.name}`); }
            synth.speak(u);
        };
        synth.getVoices().length > 0 ? fire()
            : synth.addEventListener('voiceschanged', function f() {
                synth.removeEventListener('voiceschanged', f); fire();
            });
    }

    // ══════════════════════════════════════════════════════════
    // PAINEL DE CONFIGURAÇÃO
    // ══════════════════════════════════════════════════════════
    function _css() {
        if (document.getElementById('k11kv-css')) return;
        const s = document.createElement('style');
        s.id = 'k11kv-css';
        s.textContent = `
        #k11kv-overlay {
            display:none; position:fixed; inset:0;
            background:rgba(5,5,12,.97); backdrop-filter:blur(10px);
            z-index:10001; align-items:flex-end; justify-content:center;
            padding:0;
        }
        #k11kv-overlay.active { display:flex; }
        #k11kv-panel {
            width:100%; max-width:480px; background:#0d0d1c;
            border:1px solid rgba(99,102,241,.2); border-bottom:none;
            border-radius:20px 20px 0 0;
            padding:0 0 env(safe-area-inset-bottom,12px);
            box-shadow:0 -8px 60px rgba(99,102,241,.12);
            max-height:92vh; overflow-y:auto;
            animation:k11kv-up .25s ease;
        }
        @keyframes k11kv-up { from{transform:translateY(100%)} to{transform:translateY(0)} }
        .k11kv-drag {
            width:40px; height:4px; background:rgba(255,255,255,.12);
            border-radius:2px; margin:10px auto 0;
        }
        .k11kv-hdr {
            display:flex; align-items:center; gap:12px;
            padding:16px 18px 12px;
            border-bottom:1px solid rgba(255,255,255,.05);
        }
        .k11kv-icon {
            width:38px; height:38px; border-radius:50%; flex-shrink:0;
            background:rgba(99,102,241,.15); border:1px solid rgba(99,102,241,.3);
            display:flex; align-items:center; justify-content:center; color:#818cf8;
        }
        .k11kv-icon .material-symbols-outlined { font-size:20px; }
        .k11kv-title { font-size:13px; font-weight:800; color:#e2e8f0; letter-spacing:.5px; }
        .k11kv-sub   { font-size:10px; color:#64748b; margin-top:2px; }
        .k11kv-status-badge {
            margin-left:auto; padding:4px 10px; border-radius:99px; font-size:9px;
            font-weight:800; letter-spacing:1px; text-transform:uppercase;
        }
        .k11kv-status-badge.active { background:rgba(16,185,129,.15); color:#10b981; border:1px solid rgba(16,185,129,.3); }
        .k11kv-status-badge.inactive { background:rgba(100,116,139,.1); color:#64748b; border:1px solid rgba(100,116,139,.2); }
        .k11kv-section { padding:14px 18px 0; }
        .k11kv-label {
            font-size:9px; font-weight:700; letter-spacing:2px; color:#475569;
            text-transform:uppercase; margin-bottom:8px; display:flex; align-items:center; gap:6px;
        }
        .k11kv-input {
            width:100%; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);
            border-radius:10px; padding:11px 14px; font-size:12px; color:#e0e0e0;
            outline:none; font-family:monospace; transition:border-color .2s;
            box-sizing:border-box;
        }
        .k11kv-input:focus { border-color:rgba(99,102,241,.5); }
        .k11kv-input::placeholder { color:rgba(255,255,255,.2); }
        .k11kv-voices { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
        .k11kv-vbtn {
            padding:10px 12px; border-radius:10px; cursor:pointer;
            background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07);
            transition:all .15s; text-align:left;
        }
        .k11kv-vbtn:hover  { border-color:rgba(99,102,241,.35); background:rgba(99,102,241,.07); }
        .k11kv-vbtn.sel    { border-color:rgba(99,102,241,.6);  background:rgba(99,102,241,.15); }
        .k11kv-vbtn-name   { font-size:12px; font-weight:700; color:#e2e8f0; }
        .k11kv-vbtn-tag    { font-size:9px; color:#64748b; margin-top:3px; }
        .k11kv-actions { display:flex; gap:8px; padding:16px 18px 10px; }
        .k11kv-btn {
            flex:1; padding:12px; border-radius:12px; cursor:pointer;
            font-weight:800; font-size:11px; letter-spacing:1px; text-transform:uppercase;
            border:none; transition:all .2s;
        }
        .k11kv-btn.test {
            background:rgba(99,102,241,.12); border:1px solid rgba(99,102,241,.25); color:#818cf8;
        }
        .k11kv-btn.test:hover { background:rgba(99,102,241,.22); }
        .k11kv-btn.save {
            flex:2; background:#6366f1; color:#fff;
            box-shadow:0 4px 20px rgba(99,102,241,.3);
        }
        .k11kv-btn.save:hover { box-shadow:0 4px 28px rgba(99,102,241,.5); }
        .k11kv-btn.close-btn {
            background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07); color:#64748b;
        }
        .k11kv-msg {
            font-size:11px; text-align:center; padding:6px 18px;
            min-height:20px; transition:color .2s;
        }
        .k11kv-msg.ok   { color:#10b981; }
        .k11kv-msg.err  { color:#f87171; }
        .k11kv-msg.info { color:#94a3b8; }

        /* LOG */
        .k11kv-log-hdr {
            display:flex; align-items:center; justify-content:space-between;
            padding:10px 18px 6px;
            border-top:1px solid rgba(255,255,255,.05); margin-top:6px;
            cursor:pointer;
        }
        .k11kv-log-title { font-size:9px; font-weight:700; letter-spacing:2px; color:#334155; text-transform:uppercase; }
        .k11kv-log-toggle { font-size:9px; color:#334155; }
        #k11kv-log-body {
            display:none; margin:0 18px 14px;
            background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.05);
            border-radius:8px; padding:8px; max-height:160px; overflow-y:auto;
            font-family:monospace; font-size:10px;
        }
        #k11kv-log-body.open { display:block; }
        .k11kv-log-row { padding:2px 0; border-bottom:1px solid rgba(255,255,255,.03); display:flex; gap:6px; }
        .k11kv-log-ts  { color:#334155; flex-shrink:0; }
        .k11kv-log-info  { color:#94a3b8; }
        .k11kv-log-ok    { color:#10b981; }
        .k11kv-log-warn  { color:#eab308; }
        .k11kv-log-error { color:#f87171; }
        .k11kv-info-box {
            margin:0 18px 16px; font-size:10px; color:#475569; line-height:1.7;
            padding:10px 12px; background:rgba(255,255,255,.02);
            border:1px solid rgba(255,255,255,.04); border-radius:8px;
        }
        .k11kv-info-box a { color:#818cf8; text-decoration:none; }
        `;
        document.head.appendChild(s);
    }

    function _html() {
        if (document.getElementById('k11kv-overlay')) return;
        const el = document.createElement('div');
        el.id = 'k11kv-overlay';
        el.innerHTML = `
            <div id="k11kv-panel">
                <div class="k11kv-drag"></div>

                <div class="k11kv-hdr">
                    <div class="k11kv-icon">
                        <span class="material-symbols-outlined">record_voice_over</span>
                    </div>
                    <div>
                        <div class="k11kv-title">K11 Voice ID</div>
                        <div class="k11kv-sub">ElevenLabs · Voz neural</div>
                    </div>
                    <div id="k11kv-badge" class="k11kv-status-badge ${isReady() ? 'active' : 'inactive'}">
                        ${isReady() ? 'ATIVO' : 'SEM CHAVE'}
                    </div>
                </div>

                <div class="k11kv-section">
                    <div class="k11kv-label">
                        <span class="material-symbols-outlined" style="font-size:13px">key</span>
                        Chave API ElevenLabs
                    </div>
                    <input class="k11kv-input" id="k11kv-apikey" type="password"
                        placeholder="sk_xxxxxxxxxxxxxxxx..." autocomplete="off" spellcheck="false">
                </div>

                <div class="k11kv-section" style="margin-top:14px;">
                    <div class="k11kv-label">
                        <span class="material-symbols-outlined" style="font-size:13px">graphic_eq</span>
                        Escolha a voz
                    </div>
                    <div class="k11kv-voices" id="k11kv-voices">
                        ${VOICES.map(v => `
                            <div class="k11kv-vbtn" data-id="${v.id}">
                                <div class="k11kv-vbtn-name">${v.name}</div>
                                <div class="k11kv-vbtn-tag">${v.tag}</div>
                            </div>`).join('')}
                    </div>
                    <input class="k11kv-input" id="k11kv-voiceid" style="margin-top:8px;"
                        placeholder="Ou cole um Voice ID personalizado...">
                </div>

                <div class="k11kv-msg info" id="k11kv-msg">Cole sua chave e escolha uma voz para começar.</div>

                <div class="k11kv-actions">
                    <button class="k11kv-btn test" id="k11kv-test">TESTAR</button>
                    <button class="k11kv-btn save" id="k11kv-save">SALVAR</button>
                    <button class="k11kv-btn close-btn" id="k11kv-close">FECHAR</button>
                </div>

                <div class="k11kv-info-box">
                    Crie sua chave grátis em
                    <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank">elevenlabs.io</a>.
                    Free tier: ~10.000 chars/mês, sem cartão.<br>
                    Mais vozes em
                    <a href="https://elevenlabs.io/voice-library" target="_blank">elevenlabs.io/voice-library</a>
                    — copie o Voice ID e cole acima.
                </div>

                <div class="k11kv-log-hdr" id="k11kv-log-toggle-btn">
                    <span class="k11kv-log-title">Log de processo</span>
                    <span class="k11kv-log-toggle" id="k11kv-log-arrow">▶ expandir</span>
                </div>
                <div id="k11kv-log-body"></div>
            </div>`;
        document.body.appendChild(el);
        _bindEvents();
        _syncUI();
    }

    function _bindEvents() {
        document.getElementById('k11kv-close').addEventListener('click', closePanel);

        // Fechar clicando fora do panel
        document.getElementById('k11kv-overlay').addEventListener('click', e => {
            if (e.target.id === 'k11kv-overlay') closePanel();
        });

        // Seleção de voz
        document.getElementById('k11kv-voices').addEventListener('click', e => {
            const btn = e.target.closest('.k11kv-vbtn');
            if (!btn) return;
            document.querySelectorAll('.k11kv-vbtn').forEach(b => b.classList.remove('sel'));
            btn.classList.add('sel');
            document.getElementById('k11kv-voiceid').value = '';
            _setMsg('Voz "' + btn.querySelector('.k11kv-vbtn-name').textContent + '" selecionada. Clique em TESTAR.', 'info');
        });

        // Testar
        document.getElementById('k11kv-test').addEventListener('click', async () => {
            _unlockAudio(); // iOS: desbloqueia AudioContext dentro do gesto do usuário
            const apiKey  = document.getElementById('k11kv-apikey').value.trim();
            const voiceId = _resolveVoice();
            if (!apiKey)   { _setMsg('Cole sua chave API primeiro.', 'err'); _emit('warn', 'Teste sem chave'); return; }
            if (!voiceId)  { _setMsg('Selecione ou cole um Voice ID.', 'err'); return; }

            const vName = VOICES.find(v => v.id === voiceId)?.name ?? voiceId.substring(0,8);
            _setMsg('Gerando áudio de teste...', 'info');
            _emit('info', `Testando voz: ${vName}`, { voiceId });

            try {
                const r = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
                    method: 'POST',
                    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: 'K11 OMNI Voice ID. Voz neural ativa.',
                        model_id: MODEL,
                        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
                    }),
                });

                if (!r.ok) {
                    const e = await r.json().catch(() => ({}));
                    const msg = e?.detail?.message ?? e?.detail ?? `HTTP ${r.status}`;
                    _setMsg('Erro: ' + msg, 'err');
                    _emit('error', 'Teste falhou', { status: r.status, msg });
                    return;
                }

                _unlockAudio(); // desbloqueia autoplay iOS antes de reproduzir
                const testBlob = await r.blob();
                _setMsg('Reproduzindo teste com voz "' + vName + '"...', 'ok');
                await _playBlob(testBlob).catch(e => _setMsg('Erro ao reproduzir: ' + e.message, 'err'));
                _emit('ok', `Teste OK — voz: ${vName}`);

            } catch(e) {
                _setMsg('Falha de conexão: ' + e.message, 'err');
                _emit('error', 'Exceção no teste', e.message);
            }
        });

        // Salvar
        document.getElementById('k11kv-save').addEventListener('click', () => {
            const apiKey  = document.getElementById('k11kv-apikey').value.trim();
            const voiceId = _resolveVoice();
            if (!apiKey)  { _setMsg('Informe a chave API.', 'err'); return; }
            if (!voiceId) { _setMsg('Selecione ou cole um Voice ID.', 'err'); return; }

            _saveApiKey(apiKey);
            _saveVoiceId(voiceId);

            const vName = VOICES.find(v => v.id === voiceId)?.name ?? voiceId.substring(0,8);
            _setMsg('Salvo! Voz "' + vName + '" ativa no K11.', 'ok');
            _emit('ok', `Config salva — voz: ${vName}`, { voiceId });

            // Atualiza badge
            const badge = document.getElementById('k11kv-badge');
            if (badge) { badge.className = 'k11kv-status-badge active'; badge.textContent = 'ATIVO'; }

            setTimeout(closePanel, 1400);
        });

        // Toggle log
        document.getElementById('k11kv-log-toggle-btn').addEventListener('click', () => {
            const body  = document.getElementById('k11kv-log-body');
            const arrow = document.getElementById('k11kv-log-arrow');
            const open  = body.classList.toggle('open');
            arrow.textContent = open ? '▼ recolher' : '▶ expandir';
        });
    }

    function _syncUI() {
        // Preenche chave se já salva
        const key = getApiKey();
        if (key) document.getElementById('k11kv-apikey').value = key;

        // Marca voz salva
        const vid = getVoiceId();
        document.querySelectorAll('.k11kv-vbtn').forEach(b => {
            b.classList.toggle('sel', b.dataset.id === vid);
        });
        // Se é um ID customizado, coloca no campo
        if (!VOICES.find(v => v.id === vid)) {
            document.getElementById('k11kv-voiceid').value = vid;
        }
    }

    function _resolveVoice() {
        const custom = document.getElementById('k11kv-voiceid')?.value.trim();
        if (custom) return custom;
        return document.querySelector('.k11kv-vbtn.sel')?.dataset?.id ?? '';
    }

    function _setMsg(text, type) {
        const el = document.getElementById('k11kv-msg');
        if (!el) return;
        el.textContent = text;
        el.className = 'k11kv-msg ' + (type || 'info');
    }

    // ── Renderiza log no painel ────────────────────────────────
    function _renderLog() {
        const body = document.getElementById('k11kv-log-body');
        if (!body) return;
        body.innerHTML = _log.slice(-30).reverse().map(e =>
            `<div class="k11kv-log-row">
                <span class="k11kv-log-ts">${e.ts}</span>
                <span class="k11kv-log-${e.level}">${e.msg}${e.data ? ' — ' + JSON.stringify(e.data) : ''}</span>
            </div>`
        ).join('');
    }

    // ══════════════════════════════════════════════════════════
    // API PÚBLICA DO PAINEL
    // ══════════════════════════════════════════════════════════
    function openPanel() {
        _unlockAudio(); // iOS: aproveita o gesto de abertura para desbloquear AudioContext
        _css();
        _html();
        document.getElementById('k11kv-overlay').classList.add('active');
        _syncUI();
        _renderLog();
        _emit('info', `Painel aberto — status: ${isReady() ? 'chave presente' : 'sem chave'}`);
    }

    function closePanel() {
        document.getElementById('k11kv-overlay')?.classList.remove('active');
    }

    // ══════════════════════════════════════════════════════════
    // INIT
    // ══════════════════════════════════════════════════════════
    function _init() {
        _css();
        if (isReady()) {
            _emit('ok', 'ElevenLabs configurado — voz neural ativa', { voice: getVoiceId().substring(0,8) });
        } else {
            _emit('warn', 'Sem chave ElevenLabs — Web Speech ativo como fallback');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    return { speak, stop, isReady, onStart, onEnd, openPanel, closePanel, getLog, getApiKey, getVoiceId };

})();
