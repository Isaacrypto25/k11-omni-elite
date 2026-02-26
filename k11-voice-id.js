/**
 * K11 OMNI ELITE — VOICE ID (ElevenLabs TTS)
 * ════════════════════════════════════════════════════════════════
 * Módulo de síntese de voz com IA real via ElevenLabs API.
 * Substitui o Web Speech API nativo por vozes neurais de alta qualidade.
 *
 * INTEGRAÇÃO:
 *   • K11VoiceID.speak(text)        → fala o texto via ElevenLabs
 *   • K11VoiceID.isReady()          → true se chave + voice_id configurados
 *   • K11VoiceID.stop()             → para a reprodução atual
 *   • K11VoiceID.openSettings()     → abre painel de configuração
 *
 * FALLBACK:
 *   • Se não houver chave ou falhar, delega ao Web Speech API nativo.
 *
 * Free tier ElevenLabs: ~10.000 caracteres/mês sem cartão.
 * Chave em: https://elevenlabs.io/app/settings/api-keys
 *
 * Inserir no dashboard.html ANTES de k11-voice-assistant.js
 */

'use strict';

const K11VoiceID = (() => {

    // ── CONSTANTES ────────────────────────────────────────────
    const STORAGE_KEY_API  = 'sk_8dea030f6cf373be688c0af977b591ce236ee624cf3a89a1';
    const STORAGE_KEY_VOICE = 'k11_elevenlabs_voice_id';
    const API_BASE         = 'https://api.elevenlabs.io/v1';

    // Voz padrão sugerida: "Rachel" — clara, natural, neutra
    // O usuário pode trocar pelo ID de qualquer voz do catálogo
    const DEFAULT_VOICE_ID = 'cgSgspJ2msm6clMCkdW9'; // Jessica (pt compatível)

    // Vozes sugeridas com suporte a português (podem ser trocadas no painel)
    const SUGGESTED_VOICES = [
        { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica',  desc: 'Feminina, clara'     },
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',    desc: 'Feminina, suave'     },
        { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam',     desc: 'Masculina, direto'   },
        { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',     desc: 'Feminina, expressiva'},
        { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',   desc: 'Masculina, profundo' },
    ];

    // ── ESTADO ────────────────────────────────────────────────
    let _currentAudio  = null;
    let _onStartCb     = null;
    let _onEndCb       = null;
    let _settingsOpen  = false;

    // ── STORAGE ───────────────────────────────────────────────
    function _getApiKey()  {
        try { return localStorage.getItem(STORAGE_KEY_API)  || ''; } catch(_) { return ''; }
    }
    function _getVoiceId() {
        try { return localStorage.getItem(STORAGE_KEY_VOICE) || DEFAULT_VOICE_ID; } catch(_) { return DEFAULT_VOICE_ID; }
    }
    function _saveApiKey(k)  { try { localStorage.setItem(STORAGE_KEY_API,   k.trim()); } catch(_) {} }
    function _saveVoiceId(v) { try { localStorage.setItem(STORAGE_KEY_VOICE, v.trim()); } catch(_) {} }

    // ── API PÚBLICA ───────────────────────────────────────────
    function isReady() {
        const k = _getApiKey();
        return k.length > 10;
    }

    function onStart(cb) { _onStartCb = cb; }
    function onEnd(cb)   { _onEndCb   = cb; }

    function stop() {
        if (_currentAudio) {
            _currentAudio.pause();
            _currentAudio = null;
        }
        if (_onEndCb) _onEndCb();
    }

    async function speak(text) {
        if (!text?.trim()) return;
        if (!isReady()) {
            console.warn('[K11VoiceID] Sem chave ElevenLabs — usando fallback Web Speech.');
            _webSpeechFallback(text);
            return;
        }

        stop(); // cancela qualquer áudio anterior

        const apiKey = _getApiKey();
        const voiceId = _getVoiceId();

        try {
            if (_onStartCb) _onStartCb();

            const response = await fetch(`${API_BASE}/text-to-speech/${voiceId}/stream`, {
                method: 'POST',
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    model_id: 'eleven_multilingual_v2', // melhor suporte pt-BR
                    voice_settings: {
                        stability:        0.5,
                        similarity_boost: 0.8,
                        style:            0.2,
                        use_speaker_boost: true,
                    },
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                console.error('[K11VoiceID] Erro ElevenLabs:', response.status, err);
                _webSpeechFallback(text);
                return;
            }

            const blob = await response.blob();
            const url  = URL.createObjectURL(blob);
            const audio = new Audio(url);

            audio.onended = () => {
                URL.revokeObjectURL(url);
                _currentAudio = null;
                if (_onEndCb) _onEndCb();
            };
            audio.onerror = () => {
                _currentAudio = null;
                if (_onEndCb) _onEndCb();
                _webSpeechFallback(text);
            };

            _currentAudio = audio;
            audio.play();

        } catch (e) {
            console.error('[K11VoiceID] Exceção:', e);
            _webSpeechFallback(text);
            if (_onEndCb) _onEndCb();
        }
    }

    // ── FALLBACK WEB SPEECH ───────────────────────────────────
    function _webSpeechFallback(text) {
        const synth = window.speechSynthesis;
        if (!synth) return;
        try { synth.cancel(); } catch(_) {}
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR';
        u.onstart = () => { if (_onStartCb) _onStartCb(); };
        u.onend   = () => { if (_onEndCb)   _onEndCb();   };
        const fire = () => {
            const vl = synth.getVoices();
            const v  = vl.find(v => v.lang === 'pt-BR') || vl.find(v => v.lang.startsWith('pt')) || null;
            if (v) u.voice = v;
            synth.speak(u);
        };
        synth.getVoices().length > 0 ? fire()
            : synth.addEventListener('voiceschanged', function f() {
                synth.removeEventListener('voiceschanged', f); fire();
            });
    }

    // ── PAINEL DE CONFIGURAÇÃO ────────────────────────────────
    function _injectSettingsCSS() {
        if (document.getElementById('k11-vid-css')) return;
        const s = document.createElement('style');
        s.id = 'k11-vid-css';
        s.textContent = `
        #k11-vid-overlay {
            display:none; position:fixed; inset:0;
            background:rgba(9,9,15,.97); backdrop-filter:blur(8px);
            z-index:10000; align-items:center; justify-content:center; padding:20px;
        }
        #k11-vid-overlay.active { display:flex; }
        .k11-vid-box {
            width:100%; max-width:440px; background:#0f0f1a;
            border:1px solid rgba(99,102,241,.3); border-radius:16px;
            padding:24px; box-shadow:0 0 60px rgba(99,102,241,.1);
        }
        .k11-vid-hdr { display:flex; align-items:center; gap:12px; margin-bottom:20px; }
        .k11-vid-icon {
            width:40px; height:40px; border-radius:50%;
            background:rgba(99,102,241,.15); border:1px solid rgba(99,102,241,.3);
            display:flex; align-items:center; justify-content:center; color:#818cf8;
        }
        .k11-vid-icon .material-symbols-outlined { font-size:20px; }
        .k11-vid-title { font-size:11px; font-weight:800; letter-spacing:2px; color:#818cf8; text-transform:uppercase; }
        .k11-vid-sub   { font-size:10px; color:#64748b; margin-top:2px; }
        .k11-vid-label { font-size:9px; font-weight:700; letter-spacing:2px; color:#64748b; text-transform:uppercase; margin-bottom:6px; margin-top:16px; }
        .k11-vid-input {
            width:100%; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);
            border-radius:10px; padding:10px 14px; font-size:12px; color:#e0e0e0;
            outline:none; font-family:monospace; transition:border-color .2s; box-sizing:border-box;
        }
        .k11-vid-input:focus { border-color:rgba(99,102,241,.5); }
        .k11-vid-voices {
            display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px;
        }
        .k11-vid-voice-btn {
            padding:8px 10px; border-radius:8px; cursor:pointer; text-align:left;
            background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07);
            transition:all .15s;
        }
        .k11-vid-voice-btn:hover { border-color:rgba(99,102,241,.4); background:rgba(99,102,241,.08); }
        .k11-vid-voice-btn.selected { border-color:rgba(99,102,241,.6); background:rgba(99,102,241,.15); }
        .k11-vid-voice-name { font-size:11px; font-weight:700; color:#e2e8f0; }
        .k11-vid-voice-desc { font-size:9px; color:#64748b; margin-top:2px; }
        .k11-vid-actions { display:flex; gap:8px; margin-top:20px; }
        .k11-vid-btn-test {
            flex:1; padding:10px; border-radius:10px; cursor:pointer;
            background:rgba(99,102,241,.15); border:1px solid rgba(99,102,241,.3);
            color:#818cf8; font-weight:700; font-size:11px; letter-spacing:1px; text-transform:uppercase;
            transition:all .2s;
        }
        .k11-vid-btn-test:hover { background:rgba(99,102,241,.25); }
        .k11-vid-btn-save {
            flex:2; padding:10px; border-radius:10px; cursor:pointer;
            background:#6366f1; border:none;
            color:#fff; font-weight:800; font-size:11px; letter-spacing:1px; text-transform:uppercase;
            box-shadow:0 4px 20px rgba(99,102,241,.3); transition:all .2s;
        }
        .k11-vid-btn-save:hover { box-shadow:0 4px 28px rgba(99,102,241,.5); }
        .k11-vid-status {
            font-size:10px; margin-top:12px; text-align:center; color:#64748b; min-height:16px;
        }
        .k11-vid-status.ok  { color:#10b981; }
        .k11-vid-status.err { color:#f87171; }
        .k11-vid-close {
            position:absolute; top:16px; right:16px;
            background:none; border:none; color:#64748b; cursor:pointer; font-size:18px;
        }
        .k11-vid-info {
            font-size:10px; color:#475569; line-height:1.6; margin-top:14px;
            padding:10px 12px; background:rgba(255,255,255,.02);
            border:1px solid rgba(255,255,255,.05); border-radius:8px;
        }
        .k11-vid-info a { color:#818cf8; text-decoration:none; }
        .k11-vid-badge {
            display:inline-flex; align-items:center; gap:4px;
            font-size:9px; font-weight:700; letter-spacing:1px;
            padding:2px 8px; border-radius:99px;
            background:rgba(99,102,241,.15); color:#818cf8; border:1px solid rgba(99,102,241,.3);
            vertical-align:middle; margin-left:6px;
        }
        `;
        document.head.appendChild(s);
    }

    function _injectSettingsHTML() {
        if (document.getElementById('k11-vid-overlay')) return;
        const div = document.createElement('div');
        div.id = 'k11-vid-overlay';
        div.style.position = 'relative';

        div.innerHTML = `
            <div class="k11-vid-box" style="position:relative;">
                <button class="k11-vid-close" id="k11-vid-close">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <div class="k11-vid-hdr">
                    <div class="k11-vid-icon">
                        <span class="material-symbols-outlined">record_voice_over</span>
                    </div>
                    <div>
                        <div class="k11-vid-title">K11 Voice ID <span class="k11-vid-badge">ElevenLabs</span></div>
                        <div class="k11-vid-sub">Voz neural de alta qualidade</div>
                    </div>
                </div>

                <div class="k11-vid-label">Chave API ElevenLabs</div>
                <input class="k11-vid-input" id="k11-vid-apikey" type="password"
                    placeholder="sk_..." autocomplete="off" spellcheck="false"
                    value="${_getApiKey()}">

                <div class="k11-vid-label">Voz <span style="color:#475569;font-weight:400;text-transform:none;letter-spacing:0">— selecione ou cole um Voice ID personalizado</span></div>
                <div class="k11-vid-voices" id="k11-vid-voices">
                    ${SUGGESTED_VOICES.map(v => `
                        <div class="k11-vid-voice-btn ${_getVoiceId() === v.id ? 'selected' : ''}"
                             data-id="${v.id}">
                            <div class="k11-vid-voice-name">${v.name}</div>
                            <div class="k11-vid-voice-desc">${v.desc}</div>
                        </div>
                    `).join('')}
                </div>
                <input class="k11-vid-input" id="k11-vid-voiceid" style="margin-top:8px;"
                    placeholder="Cole aqui um Voice ID personalizado..."
                    value="${!SUGGESTED_VOICES.find(v => v.id === _getVoiceId()) ? _getVoiceId() : ''}">

                <div class="k11-vid-actions">
                    <button class="k11-vid-btn-test" id="k11-vid-test">TESTAR</button>
                    <button class="k11-vid-btn-save" id="k11-vid-save">SALVAR</button>
                </div>
                <div class="k11-vid-status" id="k11-vid-status"></div>

                <div class="k11-vid-info">
                    Crie sua chave grátis em <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank">elevenlabs.io</a>.
                    Free tier: ~10.000 caracteres/mês sem cartão.<br>
                    Explore mais vozes em <a href="https://elevenlabs.io/voice-library" target="_blank">elevenlabs.io/voice-library</a>.
                </div>
            </div>`;

        document.body.appendChild(div);
        _bindSettingsEvents();
    }

    function _bindSettingsEvents() {
        document.getElementById('k11-vid-close').addEventListener('click', closeSettings);

        // Seleção de voz por botão
        document.getElementById('k11-vid-voices').addEventListener('click', e => {
            const btn = e.target.closest('.k11-vid-voice-btn');
            if (!btn) return;
            document.querySelectorAll('.k11-vid-voice-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('k11-vid-voiceid').value = ''; // limpa campo customizado
        });

        // Testar voz
        document.getElementById('k11-vid-test').addEventListener('click', async () => {
            const status = document.getElementById('k11-vid-status');
            const apiKey = document.getElementById('k11-vid-apikey').value.trim();
            const voiceId = _resolveSelectedVoice();

            if (!apiKey) { _setSettingsStatus('Cole sua chave API primeiro.', 'err'); return; }
            if (!voiceId) { _setSettingsStatus('Selecione ou cole um Voice ID.', 'err'); return; }

            _setSettingsStatus('Gerando áudio de teste...', '');
            try {
                const r = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
                    method: 'POST',
                    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: 'K11 OMNI Voice ID ativo. Voz neural pronta para uso operacional.',
                        model_id: 'eleven_multilingual_v2',
                        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
                    }),
                });
                if (!r.ok) {
                    const e = await r.json().catch(() => ({}));
                    _setSettingsStatus('Erro: ' + (e?.detail?.message || r.status), 'err');
                    return;
                }
                const blob = await r.blob();
                new Audio(URL.createObjectURL(blob)).play();
                _setSettingsStatus('Áudio reproduzindo...', 'ok');
            } catch(e) {
                _setSettingsStatus('Falha na conexão: ' + e.message, 'err');
            }
        });

        // Salvar
        document.getElementById('k11-vid-save').addEventListener('click', () => {
            const apiKey  = document.getElementById('k11-vid-apikey').value.trim();
            const voiceId = _resolveSelectedVoice();

            if (!apiKey)   { _setSettingsStatus('Informe a chave API.', 'err'); return; }
            if (!voiceId)  { _setSettingsStatus('Selecione ou cole um Voice ID.', 'err'); return; }

            _saveApiKey(apiKey);
            _saveVoiceId(voiceId);
            _setSettingsStatus('Configuração salva! Voz de IA ativa.', 'ok');
            setTimeout(closeSettings, 1200);
        });
    }

    function _resolveSelectedVoice() {
        const custom = document.getElementById('k11-vid-voiceid')?.value.trim();
        if (custom) return custom;
        const sel = document.querySelector('.k11-vid-voice-btn.selected');
        return sel?.dataset?.id || '';
    }

    function _setSettingsStatus(msg, type) {
        const el = document.getElementById('k11-vid-status');
        if (!el) return;
        el.textContent = msg;
        el.className = 'k11-vid-status' + (type ? ' ' + type : '');
    }

    function openSettings() {
        _injectSettingsCSS();
        _injectSettingsHTML();
        document.getElementById('k11-vid-overlay').classList.add('active');
        _settingsOpen = true;
    }

    function closeSettings() {
        document.getElementById('k11-vid-overlay')?.classList.remove('active');
        _settingsOpen = false;
    }

    // ── INIT ──────────────────────────────────────────────────
    function init() {
        _injectSettingsCSS();
        console.log('[K11VoiceID] ' + (isReady()
            ? '✅ ElevenLabs configurado — voz neural ativa.'
            : '⚠️ Sem chave ElevenLabs — usando Web Speech fallback. Use K11VoiceID.openSettings().'));
    }

    // Auto-init quando DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { speak, stop, isReady, onStart, onEnd, openSettings, closeSettings };

})();
