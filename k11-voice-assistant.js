/**
 * K11 OMNI ELITE — VOICE ASSISTANT v2.0 (Neural Decision Protocol)
 * ════════════════════════════════════════════════════════════════════
 * Assistente de voz e visual integrado ao APP.db em tempo real.
 * Usa Web Speech API (SpeechRecognition + SpeechSynthesis).
 *
 * v2.0 — Integração nativa com K11Brain (local) + Gemini AI (supremo):
 *   • _processQuery() agora chama K11Brain.resolve() antes do _resolve()
 *   • Se Brain local não responde, chama Gemini com contexto completo do db
 *   • Gemini retorna com dados reais serializados no system prompt
 *   • Fallback final: motor local original (_resolve)
 *
 * Depende de: k11-config.js, k11-utils.js, k11-app.js, k11-brain-auxiliar.js, k11-setup.js, k11-key-voice.js
 * Inserir no dashboard.html APÓS k11-brain-auxiliar.js
 */

'use strict';

const K11Voice = (() => {

    // ── ESTADO INTERNO ─────────────────────────────────────────
    let _isOpen      = false;
    let _isListening = false;
    let _isInitDone  = false;
    let _recognition = null;
    let _synth       = null;
    let _transcript  = '';
    let _history     = [];
    let _visualRaf   = null;
    let _analyser    = null;
    let _dataArray   = null;
    let _audioCtx    = null;
    let _sourceNode  = null;
    let _micStream   = null;

    // ── RETRY DE QUERIES PENDENTES ─────────────────────────────
    let _pendingRetryQuery = null;
    let _retryTimer        = null;
    let _dataWatcherTimer  = null;
    let _lastProdCount     = 0;

    function _scheduleRetry(query) {
        _pendingRetryQuery = query;
        clearTimeout(_retryTimer);
        _retryTimer = setTimeout(_checkAndRetry, 1500);
    }

    function _checkAndRetry() {
        if (!_pendingRetryQuery) return;
        if (!_dadosOk()) {
            _retryTimer = setTimeout(_checkAndRetry, 1500);
            return;
        }
        const q = _pendingRetryQuery;
        _pendingRetryQuery = null;
        clearTimeout(_retryTimer);
        const tid = _addTyping();
        setTimeout(() => {
            _removeEl(tid);
            const resp = _resolve(q);
            _addMsg('k11', resp);
            _speak(resp);
        }, 300);
    }

    function _startDataWatcher() {
        clearInterval(_dataWatcherTimer);
        _dataWatcherTimer = setInterval(() => {
            const currentCount = _prods().length;
            if (currentCount > 0 && currentCount !== _lastProdCount) {
                _lastProdCount = currentCount;
                if (_isOpen) {
                    const rups = _prods().filter(p => p.categoriaCor === 'red').length;
                    const msg  = `✅ <b>${currentCount} SKUs</b> carregados.${rups > 0 ? ` ⚠️ <b>${rups}</b> ruptura(s) detectada(s).` : ' Sistema em conformidade.'}<br>Agora você pode consultar SKUs, rupturas, duelo e mais.`;
                    _addMsg('k11', msg);
                }
                clearInterval(_dataWatcherTimer);
            }
        }, 800);
        setTimeout(() => clearInterval(_dataWatcherTimer), 60000);
    }

    // ── IDs DO DOM ─────────────────────────────────────────────
    const ID = {
        btn:     'k11-voice-btn',
        panel:   'k11-voice-panel',
        overlay: 'k11-voice-overlay',
        canvas:  'k11-voice-canvas',
        trans:   'k11-voice-transcript',
        hist:    'k11-voice-history',
        status:  'k11-voice-status',
        close:   'k11-voice-close',
        input:   'k11-voice-type',
        send:    'k11-voice-send',
        mic:     'k11-voice-mic-btn',
        mode:    'k11-voice-mode',   // badge indicando modo atual (local/gemini)
    };

    // ══════════════════════════════════════════════════════════
    // CSS
    // ══════════════════════════════════════════════════════════
    function _injectStyles() {
        if (document.getElementById('k11-voice-style')) return;
        const s = document.createElement('style');
        s.id = 'k11-voice-style';
        s.textContent = `
        #${ID.btn} { color: var(--text-muted); transition: color .2s; }
        #${ID.btn}:hover, #${ID.btn}.va { color: var(--primary); }

        .voice-btn-ring {
            width: 36px; height: 36px; border-radius: 50%;
            background: var(--card-bg); border: 2px solid var(--border-color);
            display: flex; align-items: center; justify-content: center;
            transition: all .3s; position: relative;
        }
        #${ID.btn}.va .voice-btn-ring {
            border-color: var(--primary);
            box-shadow: 0 0 14px rgba(255,140,0,.45);
        }
        .voice-btn-ring .material-symbols-outlined { font-size: 18px; }
        .voice-btn-pulse {
            position: absolute; inset: -4px; border-radius: 50%;
            border: 2px solid var(--primary); opacity: 0;
        }
        #${ID.btn}.va .voice-btn-pulse { animation: vpr 1.4s ease-out infinite; }
        @keyframes vpr { 0%{transform:scale(1);opacity:.7;} 100%{transform:scale(1.6);opacity:0;} }

        #${ID.overlay} {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,.6); backdrop-filter: blur(3px); z-index: 2000;
        }
        #${ID.overlay}.open { display: block; }

        #${ID.panel} {
            position: fixed; bottom: 0; left: 0; right: 0; max-height: 88vh;
            background: var(--card-bg, #0f1623);
            border-top: 1px solid var(--border-color);
            border-radius: 20px 20px 0 0; z-index: 2001;
            display: flex; flex-direction: column;
            transform: translateY(100%);
            transition: transform .35s cubic-bezier(.22,1,.36,1);
            overflow: hidden;
        }
        #${ID.panel}.open { transform: translateY(0); }

        .vh { width:36px; height:4px; background:var(--border-color); border-radius:2px; margin:12px auto 0; flex-shrink:0; }

        .voice-hdr {
            display:flex; align-items:center; gap:12px;
            padding:14px 18px 10px;
            border-bottom:1px solid var(--border-color); flex-shrink:0;
        }
        .voice-hdr-ai {
            width:36px; height:36px; border-radius:50%; flex-shrink:0;
            background:rgba(255,140,0,.12); color:var(--primary);
            display:flex; align-items:center; justify-content:center;
        }
        .voice-hdr-ai .material-symbols-outlined { font-size:18px; }
        .voice-hdr-info { flex:1; }
        .voice-hdr-t { font-size:11px; font-weight:900; letter-spacing:2px; color:#fff; }
        .voice-hdr-s { font-size:9px; letter-spacing:1.5px; color:var(--primary); margin-top:1px; }

        #${ID.mode} {
            font-size:8px; font-weight:700; letter-spacing:1px;
            padding:2px 7px; border-radius:20px;
            background:rgba(16,185,129,.1); color:#10B981;
            border:1px solid rgba(16,185,129,.2);
            transition:all .3s; white-space:nowrap;
        }
        #${ID.mode}.local { background:rgba(255,140,0,.1); color:var(--primary); border-color:rgba(255,140,0,.2); }
        #${ID.mode}.thinking { background:rgba(139,92,246,.1); color:#a78bfa; border-color:rgba(139,92,246,.2); animation:sblink .9s ease infinite; }

        #${ID.status} {
            font-size:9px; font-weight:700; letter-spacing:1px;
            padding:3px 8px; border-radius:20px;
            background:var(--border-color); color:var(--text-muted);
            transition:all .3s; white-space:nowrap;
        }
        #${ID.status}.ls { background:rgba(255,140,0,.15); color:var(--primary); animation:sblink .9s ease infinite; }
        #${ID.status}.sp { background:rgba(16,185,129,.12); color:#10B981; }
        @keyframes sblink { 0%,100%{opacity:1;} 50%{opacity:.4;} }

        #${ID.close} {
            background:none; border:none; cursor:pointer; color:var(--text-muted);
            display:flex; align-items:center; padding:6px; border-radius:50%; transition:color .2s;
        }
        #${ID.close}:hover { color:#fff; }
        #${ID.close} .material-symbols-outlined { font-size:20px; }

        .vcv-wrap { padding:10px 18px 4px; flex-shrink:0; }
        #${ID.canvas} { width:100%; height:52px; border-radius:10px; background:rgba(255,255,255,.03); display:block; }

        .vtr-wrap { min-height:26px; padding:4px 18px 8px; flex-shrink:0; }
        #${ID.trans} { font-size:12px; color:var(--primary); font-style:italic; letter-spacing:.5px; word-break:break-word; }

        #${ID.hist} {
            flex:1; overflow-y:auto; padding:6px 18px 8px;
            display:flex; flex-direction:column; gap:10px; scroll-behavior:smooth;
        }
        #${ID.hist}::-webkit-scrollbar { width:3px; }
        #${ID.hist}::-webkit-scrollbar-thumb { background:var(--border-color); border-radius:3px; }

        .vmsg { display:flex; gap:8px; animation:vin .2s ease; }
        @keyframes vin { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:translateY(0);} }
        .vmsg.user { flex-direction:row-reverse; }
        .vmsg-av { width:28px; height:28px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; margin-top:2px; }
        .vmsg-av .material-symbols-outlined { font-size:14px; }
        .vmsg.k11  .vmsg-av { background:rgba(255,140,0,.15); color:var(--primary); }
        .vmsg.user .vmsg-av { background:rgba(255,255,255,.07); color:var(--text-muted); }
        .vmsg-bbl {
            max-width:82%; padding:8px 12px; border-radius:14px;
            font-size:12px; line-height:1.55; word-break:break-word;
        }
        .vmsg.k11  .vmsg-bbl { background:rgba(255,140,0,.09); color:#fff; border-bottom-left-radius:4px; border:1px solid rgba(255,140,0,.18); }
        .vmsg.user .vmsg-bbl { background:rgba(255,255,255,.06); color:var(--text-muted); border-bottom-right-radius:4px; border:1px solid rgba(255,255,255,.08); }
        .vmsg-bbl b { color:var(--primary); }
        .vmsg-ts { display:block; font-size:9px; color:var(--text-muted); margin-top:4px; }
        .vmsg-src { display:inline-block; font-size:8px; color:#a78bfa; margin-left:4px; opacity:.7; }

        .vmsg-typing { display:flex; gap:4px; align-items:center; padding:10px 12px; border-radius:14px; border-bottom-left-radius:4px; background:rgba(255,140,0,.06); border:1px solid rgba(255,140,0,.1); width:fit-content; }
        .vmsg-typing span { width:5px; height:5px; border-radius:50%; background:var(--primary); opacity:.3; animation:tdot .9s ease infinite; }
        .vmsg-typing span:nth-child(2){animation-delay:.15s;} .vmsg-typing span:nth-child(3){animation-delay:.30s;}
        @keyframes tdot { 0%,100%{opacity:.3;transform:translateY(0);} 50%{opacity:1;transform:translateY(-3px);} }

        .vmsg-typing.gemini span { background:#a78bfa; }

        .vbot { display:flex; align-items:center; gap:8px; padding:10px 14px 14px; border-top:1px solid var(--border-color); flex-shrink:0; }
        #${ID.input} {
            flex:1; background:rgba(255,255,255,.05); border:1px solid var(--border-color);
            border-radius:10px; padding:9px 12px; font-size:12px; color:#fff;
            font-family:inherit; outline:none; transition:border-color .2s;
        }
        #${ID.input}::placeholder { color:var(--text-muted); }
        #${ID.input}:focus { border-color:var(--primary); }

        #${ID.mic} {
            width:40px; height:40px; border-radius:50%;
            background:var(--card-bg); border:2px solid var(--border-color);
            display:flex; align-items:center; justify-content:center;
            cursor:pointer; color:var(--text-muted); transition:all .2s; flex-shrink:0;
        }
        #${ID.mic}.active { background:var(--primary); border-color:var(--primary); color:#000; box-shadow:0 0 16px rgba(255,140,0,.5); }
        #${ID.mic} .material-symbols-outlined { font-size:18px; }

        #${ID.send} {
            width:40px; height:40px; border-radius:10px; background:var(--primary);
            border:none; display:flex; align-items:center; justify-content:center;
            cursor:pointer; color:#000; flex-shrink:0;
        }
        #${ID.send}:disabled { opacity:.35; cursor:not-allowed; }
        #${ID.send} .material-symbols-outlined { font-size:18px; }

        @media (min-width:600px) {
            #${ID.panel} { left:50%; right:auto; width:440px; transform:translate(-50%,100%); }
            #${ID.panel}.open { transform:translate(-50%,0); }
        }`;
        document.head.appendChild(s);
    }

    // ══════════════════════════════════════════════════════════
    // HTML
    // ══════════════════════════════════════════════════════════
    function _injectHTML() {
        if (!document.getElementById(ID.overlay)) {
            const ov = document.createElement('div');
            ov.id = ID.overlay;
            ov.addEventListener('click', close);
            document.body.appendChild(ov);
        }

        if (!document.getElementById(ID.panel)) {
            const p = document.createElement('div');
            p.id = ID.panel;
            p.innerHTML = `
                <div class="vh"></div>
                <div class="voice-hdr">
                    <div class="voice-hdr-ai"><span class="material-symbols-outlined">smart_toy</span></div>
                    <div class="voice-hdr-info">
                        <div class="voice-hdr-t">K11 OMNI VOICE</div>
                        <div class="voice-hdr-s">NEURAL DECISION PROTOCOL</div>
                    </div>
                    <div id="${ID.mode}" class="local">LOCAL</div>
                    <div id="${ID.status}">STANDBY</div>
                    <button id="${ID.close}" title="Fechar (ESC)">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="vcv-wrap"><canvas id="${ID.canvas}" height="52"></canvas></div>
                <div class="vtr-wrap"><div id="${ID.trans}">Neural Link pronto. Fale ou digite...</div></div>
                <div id="${ID.hist}"></div>
                <div class="vbot">
                    <input id="${ID.input}" type="text" placeholder="Fale com o K11..." maxlength="400" autocomplete="off">
                    <button id="${ID.mic}" title="Microfone">
                        <span class="material-symbols-outlined">mic</span>
                    </button>
                    <button id="${ID.send}" title="Enviar">
                        <span class="material-symbols-outlined">send</span>
                    </button>
                    <button id="k11kv-open-btn" title="Configurar Voz de IA"
                        style="flex-shrink:0;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.25);border-radius:10px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#818cf8;transition:all .2s;">
                        <span class="material-symbols-outlined" style="font-size:18px">record_voice_over</span>
                    </button>
                </div>`;
            document.body.appendChild(p);

            document.getElementById(ID.close).addEventListener('click', close);
            document.getElementById(ID.send).addEventListener('click', _sendTyped);
            document.getElementById(ID.mic).addEventListener('click', _toggleListening);
            document.getElementById(ID.input).addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendTyped(); }
            });
            document.getElementById('k11kv-open-btn').addEventListener('click', () => {
                if (typeof K11KeyVoice !== 'undefined') K11KeyVoice.openPanel();
            });
        }
    }

    // ══════════════════════════════════════════════════════════
    // ABERTURA / FECHAMENTO
    // ══════════════════════════════════════════════════════════
    function open() {
        if (!_isInitDone) return;
        _isOpen = true;
        document.getElementById(ID.overlay)?.classList.add('open');
        document.getElementById(ID.panel)?.classList.add('open');
        document.getElementById(ID.btn)?.classList.add('va');
        setTimeout(() => {
            _drawIdle();
            if (_history.length === 0) {
                _addMsg('k11', _welcome());
                _lastProdCount = _prods().length;
            }
            _updateModeBadge();
        }, 60);
    }

    function close() {
        _isOpen = false;
        document.getElementById(ID.overlay)?.classList.remove('open');
        document.getElementById(ID.panel)?.classList.remove('open');
        document.getElementById(ID.btn)?.classList.remove('va');
        if (_isListening) _stopListening();
        _stopVisual();
    }

    function _updateModeBadge(mode) {
        const el = document.getElementById(ID.mode);
        if (!el) return;
        const hasGemini = !!_getApiKey();
        if (mode === 'thinking') {
            el.textContent = '✦ GEMINI'; el.className = 'thinking';
        } else if (hasGemini) {
            el.textContent = '✦ GEMINI'; el.className = '';
        } else {
            el.textContent = 'LOCAL'; el.className = 'local';
        }
    }

    // ══════════════════════════════════════════════════════════
    // CANVAS WAVEFORM
    // ══════════════════════════════════════════════════════════
    function _drawIdle() {
        const canvas = document.getElementById(ID.canvas);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w   = canvas.offsetWidth || 300;
        canvas.width  = w;
        canvas.height = 52;
        const h = canvas.height, bars = 48, bw = w / bars;

        function draw() {
            if (!_isOpen) return;
            _visualRaf = requestAnimationFrame(draw);
            ctx.clearRect(0, 0, w, h);
            if (_analyser && _isListening && _dataArray) _analyser.getByteFrequencyData(_dataArray);
            for (let i = 0; i < bars; i++) {
                const t   = Date.now() / 600;
                const amp = (_analyser && _isListening && _dataArray)
                    ? _dataArray[Math.floor(i * _dataArray.length / bars)] / 255
                    : Math.sin(t + i * 0.4) * 0.18 + 0.07;
                const bh = Math.max(2, amp * h * (_isListening ? 1.2 : 0.65));
                const y  = (h - bh) / 2;
                const g  = ctx.createLinearGradient(0, y, 0, y + bh);
                g.addColorStop(0, `rgba(255,140,0,${Math.min(amp * 0.9 + 0.1, 0.95)})`);
                g.addColorStop(1, 'rgba(255,140,0,0.03)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.roundRect(i * bw + 1, y, bw - 2, bh, 2);
                ctx.fill();
            }
        }
        _stopVisual();
        draw();
    }

    function _stopVisual() {
        if (_visualRaf) { cancelAnimationFrame(_visualRaf); _visualRaf = null; }
    }

    // ══════════════════════════════════════════════════════════
    // RECONHECIMENTO DE VOZ
    // ══════════════════════════════════════════════════════════
    function _toggleListening() {
        if (_isListening) _stopListening(); else _startListening();
    }

    function _startListening() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            _addMsg('k11', 'Reconhecimento de voz não suportado. Use Chrome ou Edge, ou digite no campo de texto.');
            return;
        }

        navigator.mediaDevices?.getUserMedia({ audio: true }).then(stream => {
            _micStream  = stream;
            _audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
            _analyser   = _audioCtx.createAnalyser();
            _analyser.fftSize = 128;
            _dataArray  = new Uint8Array(_analyser.frequencyBinCount);
            _sourceNode = _audioCtx.createMediaStreamSource(stream);
            _sourceNode.connect(_analyser);
        }).catch(() => {});

        _recognition = new SR();
        _recognition.lang            = 'pt-BR';
        _recognition.continuous      = false;
        _recognition.interimResults  = true;
        _recognition.maxAlternatives = 1;

        _recognition.onstart = () => {
            _isListening = true;
            _setStatus('OUVINDO', 'ls');
            _setMicActive(true);
            const el = document.getElementById(ID.trans);
            if (el) el.textContent = '';
        };

        _recognition.onresult = (e) => {
            let interim = '', final = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) final += t; else interim += t;
            }
            _transcript = final || interim;
            const el = document.getElementById(ID.trans);
            if (el) el.textContent = _transcript || '...';
        };

        _recognition.onerror = (e) => {
            _stopListening();
            if (e.error === 'not-allowed') {
                _addMsg('k11', 'Permissão de microfone negada. Permita no navegador ou use o campo de texto.');
            } else if (e.error !== 'aborted' && e.error !== 'no-speech') {
                _addMsg('k11', `Erro no microfone (${e.error}). Tente novamente ou use o campo de texto.`);
            }
        };

        _recognition.onend = () => {
            const q = _transcript.trim();
            _transcript = '';
            const el = document.getElementById(ID.trans);
            if (el) el.textContent = '';
            _isListening = false;
            _setStatus('STANDBY', '');
            _setMicActive(false);
            _releaseAudio();
            if (q) _processQuery(q);
        };

        try { _recognition.start(); }
        catch (err) {
            console.error('[K11Voice]', err);
            _setStatus('ERRO', '');
            _addMsg('k11', 'Não foi possível iniciar o microfone. Tente de novo ou use o campo de texto.');
        }
    }

    function _stopListening() {
        try { _recognition?.stop(); } catch (_) {}
        _isListening = false;
        _setStatus('STANDBY', '');
        _setMicActive(false);
        _releaseAudio();
    }

    function _releaseAudio() {
        try { _sourceNode?.disconnect(); } catch (_) {}
        try { _audioCtx?.close(); }       catch (_) {}
        try { _micStream?.getTracks().forEach(t => t.stop()); } catch (_) {}
        _analyser = _dataArray = _sourceNode = _audioCtx = _micStream = null;
    }

    // ══════════════════════════════════════════════════════════
    // TEXTO / QUERY
    // ══════════════════════════════════════════════════════════
    function _sendTyped() {
        const inp = document.getElementById(ID.input);
        if (!inp) return;
        const q = inp.value.trim();
        if (!q) return;
        inp.value = '';
        _processQuery(q);
    }

    // ══════════════════════════════════════════════════════════
    // ★ PIPELINE DE RESOLUÇÃO — 3 CAMADAS ★
    //
    //  1. K11Brain (local, instantâneo) — intents de cruzamento
    //  2. _resolve local (keywords diretas no db) — fallback rápido
    //  3. Gemini AI (com contexto real serializado) — linguagem natural
    //
    // Ordem de prioridade garante:
    //  • Respostas imediatas para queries conhecidas (sem latência)
    //  • Gemini apenas quando necessário (poupa cota)
    //  • Gemini recebe estado real do estoque — não alucina dados
    // ══════════════════════════════════════════════════════════
    function _processQuery(q) {
        _addMsg('user', esc(q));

        // ── Camada 1: K11Brain local (sem latência) ─────────────
        if (typeof K11Brain !== 'undefined') {
            const brainResp = K11Brain.resolve(q);
            if (brainResp) {
                const tid = _addTyping();
                setTimeout(() => {
                    _removeEl(tid);
                    _addMsg('k11', brainResp, 'brain');
                    _speak(brainResp);
                    _updateModeBadge('local');
                }, 300);
                return;
            }
        }

        // ── Camada 2: _resolve local (keywords rápidas) ─────────
        const localResp = _resolve(q);
        const isFallback = localResp.startsWith('Não entendi');

        if (!isFallback) {
            const tid = _addTyping();
            setTimeout(() => {
                _removeEl(tid);
                _addMsg('k11', localResp, 'local');
                _speak(localResp);
                _updateModeBadge('local');
            }, 380);
            return;
        }

        // ── Camada 3: Gemini AI (linguagem natural + dados reais) ──
        const apiKey = _getApiKey();

        if (!apiKey) {
            // Sem chave — retorna fallback local com dica
            const tid = _addTyping();
            setTimeout(() => {
                _removeEl(tid);
                const hint = localResp + `<br><br>💡 <span style="color:#a78bfa;font-size:11px">Configure o <b>Gemini AI</b> para respostas em linguagem natural — qualquer pergunta.</span>`;
                _addMsg('k11', hint);
                _speak(localResp);
                _updateModeBadge('local');
            }, 380);
            return;
        }

        // Gemini disponível — dispara com contexto
        _updateModeBadge('thinking');
        const tid = _addTyping('gemini');
        _callGemini(q, apiKey).then(resp => {
            _removeEl(tid);
            if (resp) {
                // resp pode ser resposta real ou mensagem de erro (429, timeout)
                const isErrorMsg = resp.startsWith('⚠️') || resp.startsWith('⏳') || resp.startsWith('⏱️') || resp.startsWith('❌') || resp.startsWith('🔑');
                _addMsg('k11', resp, isErrorMsg ? 'local' : 'gemini');
                if (!isErrorMsg) _speak(resp);
                _updateModeBadge(isErrorMsg ? 'local' : null);
            } else {
                // Gemini retornou null — usa fallback local sem "Não entendi"
                const fallback = `🤖 Gemini indisponível no momento.<br>Tente: <b>rupturas</b>, <b>estoque</b>, <b>pkl</b>, <b>fila</b>, <b>duelo</b> ou digite um <b>SKU numérico</b>.`;
                _addMsg('k11', fallback, 'local');
                _updateModeBadge('local');
            }
        }).catch(err => {
            _removeEl(tid);
            console.error('[K11Voice] _callGemini .catch:', err);
            _addMsg('k11', localResp, 'local');
            _speak(localResp);
            _updateModeBadge('local');
        });
    }

    // ══════════════════════════════════════════════════════════
    // GROQ AI — CHAMADA COM CONTEXTO REAL DO ESTOQUE
    // Modelo: llama-3.3-70b-versatile (grátis, 1000 req/dia)
    // ══════════════════════════════════════════════════════════

    let _gemini429Until = 0;

    // ── RESPOSTAS LOCAIS (zero requisições) ───────────────────
    function _geminiLocalResp(q) {
        const n = q.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
        const rups = (window.APP?.db?.produtos ?? []).filter(p => p.categoriaCor === 'red').length;
        if (/^(oi|ola|opa|hey|hi|e ai|eai|ta ai|ta aí|bom dia|boa tarde|boa noite)[!?. ]*$/.test(n))
            return 'Olá! K11 OMNI ativo.' + (rups > 0 ? ' <b>' + rups + '</b> ruptura(s) detectada(s).' : ' Sistema ok.');
        if (/^(obrigad[ao]|valeu|vlw|blz|beleza|ok|otimo|perfeito|certo|entendido)[!?. ]*$/.test(n))
            return 'Pronto.';
        if (/tudo (bem|bom|certo|ok)/.test(n)) return 'Tudo certo, K11 operacional.';
        if (/voce e (real|uma ia|um bot)|quem e voce/.test(n))
            return 'Sou o <b>K11 OMNI Voice</b> — IA assistente da loja K11. 🤖<br>Analiso estoque, PDV, duelos, tendências e agendamentos em linguagem natural.';
        if (/cade|gemini (ativo|ai|aí)|ia (ativa|funcionando)/.test(n))
            return 'Groq AI ativo, Llama 3.3. Pode perguntar.';
        return null; // não é local
    }

    // ── CONTEXTO MODULAR POR TÓPICO ───────────────────────────
    // Base sempre enviada (~400 chars). Módulos extras por palavra-chave.
    // Objetivo: enviar só o que a pergunta precisa. Economiza tokens.

    function _ctxBase() {
        const prods = _prods();
        const red = prods.filter(p => p.categoriaCor === 'red').length;
        const yel = prods.filter(p => p.categoriaCor === 'yellow').length;
        const grn = prods.filter(p => p.categoriaCor === 'green').length;
        const meta = _rank().meta ?? {};
        return 'ESTOQUE: ' + prods.length + ' SKUs | 🔴 ' + red + ' rupturas (R$' + brl(meta.valTotalRed) + ') | 🟡 ' + yel + ' abastecimento | 🟢 ' + grn + ' saudáveis' +
            '\nTAREFAS: ' + _tarefas().filter(t=>!t.done).length + '/' + _tarefas().length + ' pendentes' +
            (_fila().length ? '\nFILA: ' + _fila().length + ' item(ns) na fila de coleta' : '');
    }

    function _ctxRupturas() {
        const top = [..._prods()].filter(p => p.categoriaCor === 'red')
            .sort((a,b) => b.scoreCriticidade - a.scoreCriticidade).slice(0, 15);
        if (!top.length) return '';
        return '\nTOP RUPTURAS (por criticidade):\n' +
            top.map(p => '  🔴 ' + p.id + ' | ' + p.desc.substring(0,45) + ' | total:' + p.total + 'un pkl:' + p.pkl + 'un | ' + p.subStatus + ' | R$' + brl(p.valTotal)).join('\n');
    }

    function _ctxAbastecimento() {
        const top = [..._prods()].filter(p => p.categoriaCor === 'yellow')
            .sort((a,b) => a.pkl - b.pkl).slice(0, 10);
        if (!top.length) return '';
        return '\nABASTECIMENTO CRÍTICO:\n' +
            top.map(p => '  🟡 ' + p.id + ' | ' + p.desc.substring(0,45) + ' | pkl:' + p.pkl + 'un total:' + p.total + 'un').join('\n');
    }

    function _ctxDuelo() {
        const duelos = _rank().duelos ?? [];
        const bench  = _rank().benchmarking ?? {};
        const top    = duelos.slice(0, 12);
        if (!top.length) return '';
        let ctx = '\nBENCHMARK PDV: K11:' + bench.hidraulica + '% | Mesquita:' + bench.mesquita + '% | Jacarepaguá:' + bench.jacarepagua + '% | Benfica:' + bench.benfica + '%';
        ctx += '\nDUELO vs ' + (window.APP?.ui?.pdvAlvo ?? 'concorrente').toUpperCase() + ' — TOP GAPS:\n';
        ctx += top.map(d => '  SKU ' + d.id + ' | ' + (d.desc||'').substring(0,35) + ' | K11:' + d.vMinha + 'un vs ' + d.vAlvo + 'un | gap:' + d.gapAbsoluto + 'un | ' + (d.dominando ? '✅ dominando' : '❌ perdendo')).join('\n');
        return ctx;
    }

    function _ctxTendencias() {
        const growth  = _rank().growth  ?? [];
        const decline = _rank().decline ?? [];
        let ctx = '';
        if (growth.length) {
            ctx += '\nSKUs EM ALTA (crescimento PDV):\n';
            ctx += growth.slice(0,8).map(r => '  📈 ' + r.id + ' | ' + (r.desc||'').substring(0,35) + ' | +' + r.perc + '% vs período anterior').join('\n');
        }
        if (decline.length) {
            ctx += '\nSKUs EM QUEDA:\n';
            ctx += decline.slice(0,8).map(r => '  📉 ' + r.id + ' | ' + (r.desc||'').substring(0,35) + ' | ' + r.perc + '% vs período anterior').join('\n');
        }
        return ctx;
    }

    function _ctxAgendamentos() {
        const ags = _ags().slice(0, 12);
        if (!ags.length) return '';
        return '\nAGENDAMENTOS:\n' +
            ags.map(a => '  📦 SKU ' + a.sku + ' | ' + (a.desc||a.fornecedor||'').substring(0,35) + ' | ' + a.qtdAgendada + 'un | ' + a.dataInicio + ' | Doca:' + (a.doca||'N/I')).join('\n');
    }

    function _ctxUC() {
        const uc = _uc().slice(0, 10);
        if (!uc.length) return '';
        return '\nGARGALOS UC:\n' +
            uc.map(g => '  ⚠️ ' + g.id + ' | ' + (g.desc||'').substring(0,35) + ' | ' + g.status + ' | AEL:' + g.ael + ' RES:' + g.res + ' PKL:' + g.pkl).join('\n');
    }

    function _ctxSku(sku) {
        const p = _prods().find(x => String(x.id) === String(sku));
        if (!p) return '\nSKU ' + sku + ': não encontrado no estoque.';
        const movs = (window.APP?.db?.movimento ?? []).filter(m => String(m['Produto']||m['Nº do produto']||'').trim() === String(sku)).slice(0,5);
        const vendas = (window.APP?.db?.pdv ?? []).filter(v => String(v['Nº do produto']||'').trim() === String(sku));
        const totalVenda = vendas.reduce((s,v) => s + (Number(v['Quantidade vendida'])||0), 0);
        let ctx = '\nSKU ' + sku + ' — ' + p.desc + ':\n';
        ctx += '  Status: ' + p.categoriaCor.toUpperCase() + ' | ' + p.subStatus + '\n';
        ctx += '  Estoque: total:' + p.total + 'un | pkl:' + p.pkl + 'un | ael:' + p.ael + 'un | res:' + p.res + 'un\n';
        ctx += '  Valor: R$' + brl(p.valTotal) + ' | Capacidade PKL: ' + p.capPkl + 'un\n';
        if (totalVenda) ctx += '  Vendas PDV (período): ' + totalVenda + 'un\n';
        if (movs.length) ctx += '  Últimos movimentos: ' + movs.map(m => (m['Data de criação']||m['Data']||'') + ' ' + (m['Qtd.disponível UMA']||m['Quantidade']||'')).join(' | ');
        const ag = _ags().find(a => String(a.sku) === String(sku));
        if (ag) ctx += '\n  Agendamento: ' + ag.qtdAgendada + 'un em ' + ag.dataInicio;
        return ctx;
    }

    function _ctxInconsistencias() {
        const inc = _rank().meta?.inconsistentes ?? [];
        if (!inc.length) return '';
        return '\nINCONSISTÊNCIAS (vendeu mas estoque zerado): ' + inc.length + ' SKUs\n' +
            inc.slice(0,8).map(p => '  ⚠️ ' + p.id + ' | ' + p.desc.substring(0,40)).join('\n');
    }

    // ── CONTEXTO ESTRATÉGICO (perguntas amplas de estratégia/vendas) ──
    function _ctxEstrategico() {
        const prods  = _prods();
        const bench  = _rank().benchmarking ?? {};
        const growth = (_rank().growth  ?? []).slice(0, 3);
        const duelos = (_rank().duelos  ?? []).filter(d => !d.dominando).slice(0, 3);

        // Top 3 rupturas por valor financeiro
        const topRupFinanc = [...prods]
            .filter(p => p.categoriaCor === 'red')
            .sort((a,b) => (b.valTotal||0) - (a.valTotal||0))
            .slice(0, 3);

        // Top 3 PKL crítico (perto de ruptura)
        const topAbastCrit = [...prods]
            .filter(p => p.categoriaCor === 'yellow' && p.pkl <= 2)
            .sort((a,b) => (b.valTotal||0) - (a.valTotal||0))
            .slice(0, 3);

        let ctx = '';

        if (topRupFinanc.length) {
            ctx += '\nMAIOR IMPACTO FINANCEIRO EM RUPTURA:\n';
            topRupFinanc.forEach((p,i) => {
                ctx += '  ' + (i+1) + '. SKU ' + p.id + ' | ' + p.desc.substring(0,40) + ' | R$' + brl(p.valTotal) + ' parado\n';
            });
        }

        if (topAbastCrit.length) {
            ctx += '\nPRÓXIMOS A ROMPER (PKL ≤ 2un):\n';
            topAbastCrit.forEach((p,i) => {
                ctx += '  ' + (i+1) + '. SKU ' + p.id + ' | ' + p.desc.substring(0,40) + ' | pkl:' + p.pkl + 'un\n';
            });
        }

        if (bench.hidraulica !== undefined) {
            const myScore = bench.hidraulica;
            const rivals  = [bench.mesquita, bench.jacarepagua, bench.benfica].filter(Boolean);
            const best    = Math.max(...rivals);
            const gap     = (best - myScore).toFixed(1);
            ctx += '\nPDV: K11 em ' + myScore + '% | maior rival em ' + best + '% | gap: ' + (gap > 0 ? '-' + gap + 'pts' : '+' + Math.abs(gap) + 'pts acima') + '\n';
        }

        if (growth.length) {
            ctx += '\nSKUS EM ALTA (oportunidade de push):\n';
            growth.forEach(r => ctx += '  📈 SKU ' + r.id + ' | ' + (r.desc||'').substring(0,35) + ' | +' + r.perc + '%\n');
        }

        if (duelos.length) {
            ctx += '\nGAPS CRÍTICOS NO PDV:\n';
            duelos.forEach(d => ctx += '  ❌ SKU ' + d.id + ' | K11:' + d.vMinha + 'un vs rival:' + d.vAlvo + 'un | gap:' + d.gapAbsoluto + 'un\n');
        }

        return ctx;
    }

    // ── ROTEADOR DE CONTEXTO DINÂMICO ─────────────────────────
    // Analisa a query e monta APENAS os módulos relevantes
    function _buildSmartContext(query) {
        const n = query.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
        let ctx = _ctxBase();

        // SKU numérico específico — contexto detalhado do SKU
        const skuMatch = n.match(/\b(\d{6,9})\b/);
        if (skuMatch) {
            ctx += _ctxSku(skuMatch[1]);
            ctx += _ctxAgendamentos();
            return ctx;
        }

        // Módulos por tópico detectado na query
        const isRuptura     = /ruptura|zerado|sem estoque|falta/.test(n);
        const isAbast       = /abastecer|abastecimento|pkl baixo|repor/.test(n);
        const isDuelo       = /duelo|pdv|concorrente|mesquita|jacarepagua|benfica|benchmark|gap|vend/.test(n);
        const isTendencia   = /tendencia|crescimento|queda|alta|baixa|trend|cresceu|caiu/.test(n);
        const isAgend       = /agendamento|entrega|doca|fornecedor|nota fiscal|nf|receber/.test(n);
        const isUC          = /uc|gargalo|corredores|corredor/.test(n);
        const isInconsis    = /inconsistencia|vendeu mas|falso.?zero|diverge/.test(n);
        const isEstrategico = /estrategia|estrategico|melhorar|o que (devo|posso|preciso)|prioridade|foco|resultado|oportunidade|como (vender|crescer|melhorar)|acao|ganhar/.test(n);
        const isGeral       = !isRuptura && !isAbast && !isDuelo && !isTendencia && !isAgend && !isUC && !isInconsis && !isEstrategico;

        if (isEstrategico)        ctx += _ctxEstrategico();  // contexto pré-digerido para perguntas estratégicas
        if (isRuptura)            ctx += _ctxRupturas();
        if (isAbast)              ctx += _ctxAbastecimento();
        if (isDuelo)              ctx += _ctxDuelo();
        if (isTendencia)          ctx += _ctxTendencias();
        if (isAgend)              ctx += _ctxAgendamentos();
        if (isUC)                 ctx += _ctxUC();
        if (isInconsis)           ctx += _ctxInconsistencias();
        if (isGeral)              ctx += _ctxEstrategico();  // para perguntas genéricas, estratégico é melhor que dump

        // Tamanho do último SKU consultado (contexto adicional)
        if (typeof K11Brain !== 'undefined' && K11Brain.ctx?.lastSku) {
            const lSku = K11Brain.ctx.lastSku;
            const lProd = _prods().find(x => String(x.id) === lSku);
            if (lProd) ctx += '\nÚLTIMO SKU CONSULTADO: ' + lSku + ' | ' + lProd.desc + ' | ' + lProd.categoriaCor.toUpperCase();
        }

        console.log('[K11Voice] ctx módulos: base' +
            (isRuptura?'+rupturas':'') + (isAbast?'+abast':'') +
            (isDuelo?'+duelo':'') + (isTendencia?'+tend':'') +
            (isAgend?'+agend':'') + (isUC?'+uc':'') +
            (isInconsis?'+incons':'') +
            ' | ' + ctx.length + ' chars');

        return ctx;
    }

    async function _callGemini(query, apiKey) {
        // ── Respostas 100% locais — ZERO API ─────────────────
        const localResp = _geminiLocalResp(query);
        if (localResp) {
            console.log('[K11Voice] Local (zero API):', query);
            return localResp;
        }

        // ── Cooldown após 429 ─────────────────────────────────
        if (Date.now() < _gemini429Until) {
            const s = Math.ceil((_gemini429Until - Date.now()) / 1000);
            return '⏳ <b>Cota Groq em recarga</b> — ' + s + 's.<br>Use: <b>rupturas</b>, <b>estoque</b>, <b>pkl</b>, <b>fila</b>.';
        }

        // ── Contexto dinâmico (só o relevante pra query) ──────
        const ctx = _buildSmartContext(query);

        // ── Dados do usuário logado para personalização ──────
        const usr = _usuario();
        const nomeUsuario = usr.nome ? usr.nome.split(' ')[0] : 'gerente';
        const roleUsuario = usr.role ?? 'op';

        const systemText =
            '# IDENTIDADE\n' +
            'Você é K11 OMNI — inteligência operacional da loja K11 Hidráulica (Obramax).\n' +
            'Você pensa como um gerente comercial sênior: ganancioso por resultado, cirúrgico na análise, direto na recomendação.\n' +
            'Você está conversando com ' + nomeUsuario + (roleUsuario === 'super' ? ' (Supervisor)' : '') + '.\n\n' +

            '# REGRAS DE OURO\n' +
            '1. NUNCA despeje listas — dê UMA recomendação principal com justificativa de impacto.\n' +
            '2. Cada resposta termina com UMA ação concreta: "Ação: [o que fazer agora]".\n' +
            '3. Se a pergunta for ampla (ex: "o que devo fazer?"), escolha O problema de maior impacto financeiro e foque nele.\n' +
            '4. Se a pergunta for sobre um SKU, dê diagnóstico + causa provável + ação em 3 linhas.\n' +
            '5. Use números reais do contexto. NUNCA invente. Se não souber, diga em 1 linha e aponte o que sabe.\n' +
            '6. Fale em português brasileiro, tom direto — sem rodeios, sem introduções longas.\n' +
            '7. Use HTML mínimo: <b> para destacar o que importa, <br> para quebra de linha. Máximo 5 linhas visíveis.\n' +
            '8. Nunca liste mais de 3 itens. Se precisar listar, rankeia por impacto financeiro e corta o resto.\n\n' +

            '# FRAMEWORK DE RESPOSTA\n' +
            'Para perguntas estratégicas: [Diagnóstico em 1 linha] → [Por quê isso importa agora] → [Ação]\n' +
            'Para perguntas de estoque/SKU: [Status] → [Impacto financeiro] → [Ação]\n' +
            'Para perguntas de PDV/duelo: [Posição atual] → [Gap crítico] → [Alavanca]\n\n' +

            '# PRIORIDADE DE ANÁLISE (use esta ordem sempre)\n' +
            '1. Impacto financeiro (R$ em risco ou a ganhar)\n' +
            '2. Velocidade de giro (SKU parado vs. SKU voando)\n' +
            '3. Posição competitiva (gap vs. concorrente no PDV)\n' +
            '4. Risco operacional (ruptura prestes a acontecer)\n\n' +

            'DADOS DO SISTEMA (' + new Date().toLocaleTimeString('pt-BR') + '):\n' + ctx;

        // ── Groq API (OpenAI-compatible) ──────────────────────
        const body = {
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemText },
                { role: 'user',   content: query },
            ],
            temperature: 0.35,   // mais decisivo e assertivo, menos robótico
            max_tokens: 280,    // força respostas curtas e cirúrgicas
            top_p: 0.85,
        };

        const url = 'https://api.groq.com/openai/v1/chat/completions';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        try {
            const r = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timer);

            if (!r.ok) {
                const errBody = await r.json().catch(() => ({}));
                const errMsg  = errBody?.error?.message ?? '';
                console.error('[K11Voice] Groq HTTP ' + r.status + ':', errMsg);
                if (r.status === 429) {
                    _gemini429Until = Date.now() + 60000; // Groq reseta mais rápido (1 min)
                    return '⚠️ <b>Cota Groq esgotada</b>.<br>Aguarde ~1 min ou tente amanhã.<br><span style="font-size:10px;color:#64748b">Offline: <b>rupturas</b>, <b>estoque</b>, <b>pkl</b>, <b>fila</b>, SKU numérico.</span>';
                }
                if (r.status === 401 || r.status === 403) {
                    if (typeof K11Setup !== 'undefined') K11Setup.changeKey();
                    return '🔑 <b>Chave Groq inválida</b> — reconfigurando...';
                }
                return '❌ Groq erro ' + r.status + ': ' + errMsg.substring(0, 80);
            }

            const data = await r.json();
            const text = data?.choices?.[0]?.message?.content ?? '';
            if (!text.trim()) return null;
            _gemini429Until = 0;
            return text.trim();

        } catch (e) {
            clearTimeout(timer);
            if (e.name === 'AbortError') return '⏱️ <b>Groq timeout</b>. Tente novamente.';
            console.error('[K11Voice] Groq erro:', e);
            return null;
        }
    }
    // ── Serializa o estado relevante do APP.db para o Gemini ──
    // Objetivo: dar contexto rico sem estourar o limite de tokens
    function _buildGeminiContext() {
        const lines = [];

        // Sumário geral
        const prods = _prods();
        const red   = prods.filter(p => p.categoriaCor === 'red').length;
        const yel   = prods.filter(p => p.categoriaCor === 'yellow').length;
        const grn   = prods.filter(p => p.categoriaCor === 'green').length;
        lines.push(`ESTOQUE: ${prods.length} SKUs total | 🔴 ${red} rupturas | 🟡 ${yel} abastecimento | 🟢 ${grn} saudáveis`);

        // Top 10 rupturas críticas
        const topRups = [...prods]
            .filter(p => p.categoriaCor === 'red')
            .sort((a,b) => b.scoreCriticidade - a.scoreCriticidade)
            .slice(0,10);
        if (topRups.length) {
            lines.push('\nTOP RUPTURAS:');
            topRups.forEach(p => lines.push(`  SKU ${p.id} | ${p.desc.substring(0,40)} | total:${p.total}un pkl:${p.pkl}un | ${p.subStatus} | R$${brl(p.valTotal)}`));
        }

        // Top 10 abastecimento crítico
        const topYel = [...prods]
            .filter(p => p.categoriaCor === 'yellow')
            .sort((a,b) => a.pkl - b.pkl)
            .slice(0,8);
        if (topYel.length) {
            lines.push('\nABASTECIMENTO CRÍTICO (PKL ≤ 2un):');
            topYel.forEach(p => lines.push(`  SKU ${p.id} | ${p.desc.substring(0,40)} | pkl:${p.pkl}un`));
        }

        // Agendamentos
        const ags = _ags().slice(0, 8);
        if (ags.length) {
            lines.push('\nAGENDAMENTOS:');
            ags.forEach(a => lines.push(`  SKU ${a.sku} | ${(a.desc||a.fornecedor).substring(0,30)} | ${a.qtdAgendada}un | ${a.dataInicio} | Doca:${a.doca||'N/I'}`));
        }

        // Gargalos UC
        const uc = _uc().slice(0, 6);
        if (uc.length) {
            lines.push('\nGARGALOS UC:');
            uc.forEach(g => lines.push(`  SKU ${g.id} | ${g.desc?.substring(0,30)} | ${g.status} | AEL:${g.ael}un RES:${g.res}un PKL:${g.pkl}un`));
        }

        // Benchmark PDV
        const b = _rank().benchmarking ?? {};
        if (b.hidraulica !== undefined) {
            lines.push(`\nBENCHMARK PDV: K11:${b.hidraulica}% | Mesquita:${b.mesquita}% | Jacarepaguá:${b.jacarepagua}% | Benfica:${b.benfica}%`);
        }

        // Fila e tarefas
        const fila = _fila();
        if (fila.length) lines.push(`\nFILA DE COLETA: ${fila.length} item(ns) pendentes`);
        const tarPend = _tarefas().filter(t => !t.done);
        if (tarPend.length) lines.push(`TAREFAS PENDENTES: ${tarPend.length} de ${_tarefas().length}`);

        // Contexto do último SKU consultado (se Brain disponível)
        if (typeof K11Brain !== 'undefined' && K11Brain.ctx?.lastSku) {
            const lastSku = K11Brain.ctx.lastSku;
            const p = prods.find(x => String(x.id) === lastSku);
            if (p) lines.push(`\nÚLTIMO SKU CONSULTADO: ${lastSku} | ${p.desc} | ${p.categoriaCor.toUpperCase()}`);
        }

        return lines.join('\n');
    }

    // ══════════════════════════════════════════════════════════
    // ATALHOS SEGUROS — acessam APP.db sem explodir se vazio
    // ══════════════════════════════════════════════════════════
    function _db()      { return window.APP?.db        ?? {}; }
    function _rank()    { return window.APP?.rankings   ?? {}; }
    function _prods()   { return _db().produtos         ?? []; }
    function _ags()     { return _db().agendamentos     ?? []; }
    function _mov()     { return _db().movimento        ?? []; }
    function _fila()    { return _db().fila             ?? []; }
    function _uc()      { return _db().ucGlobal         ?? []; }
    function _pdv()     { return _db().pdv              ?? []; }
    function _tarefas() { return _db().tarefas          ?? []; }
    function _dadosOk() { return _prods().length > 0; }
    function _usuario() {
        try { return JSON.parse(sessionStorage.getItem('k11_user')) ?? {}; } catch(_) { return {}; }
    }

    // ── Lê a chave Groq de 3 fontes, sem depender do K11Setup ──
    // 1º: constante do k11-config.js (prioridade máxima)
    // 2º: localStorage (salvo pelo K11Setup se estiver carregado)
    // 3º: sessionStorage (fallback iOS modo privado)
    function _getApiKey() {
        try {
            if (typeof K11_GROQ_API_KEY !== 'undefined'
                && K11_GROQ_API_KEY?.startsWith('gsk_')
                && K11_GROQ_API_KEY.length >= 30)
                return K11_GROQ_API_KEY;
        } catch(_) {}
        try { const k = localStorage.getItem('k11_groq_api_key'); if (k?.startsWith('gsk_')) return k; } catch(_) {}
        try { const k = sessionStorage.getItem('k11_groq_api_key'); if (k?.startsWith('gsk_')) return k; } catch(_) {}
        return '';
    }

    // ══════════════════════════════════════════════════════════
    // MOTOR DE RESOLUÇÃO LOCAL (camada 2 — keywords diretas)
    // ══════════════════════════════════════════════════════════
    function _resolve(q) {
        const n = normalizeStr(q);

        // ── 1. SKU numérico direto ─────────────────────────────
        const skuM = q.match(/\b(\d{6,10})\b/);
        if (skuM) return _rProduto(skuM[1]);

        // ── 2. Saudações ───────────────────────────────────────
        if (/^(oi|ola|bom dia|boa tarde|boa noite|hey|alo|e ai|eai|salve)/.test(n))
            return _rSaudacao();

        // ── 3. Ajuda ───────────────────────────────────────────
        if (/ajuda|help|comandos|como usar|o que (voce|vc) (faz|sabe)|funcoes/.test(n))
            return _rHelp();

        // ── 4. Status do sistema ───────────────────────────────
        if (/sistema|kernel|status do sistema|dados carregados|quantos sku/.test(n))
            return _rSistema();

        // ── 5. Falso zero ──────────────────────────────────────
        if (/falso.?zero/.test(n)) return _rFalsoZero();

        // ── 6. Rupturas ────────────────────────────────────────
        if (/ruptura|zerado|sem estoque|produto em falta|faltando/.test(n)) {
            if (/critico|pior|mais grave|maior impacto|financeiro/.test(n))
                return _rRupturasCriticas();
            return _rRupturas();
        }

        // ── 7. Estoque ─────────────────────────────────────────
        if (/estoque|saldo|inventario|posicao geral|resumo/.test(n)) {
            if (/valor|financeiro|custo|reais/.test(n)) return _rEstoqueFinanceiro();
            return _rEstoque();
        }

        // ── 8. Abastecimento ───────────────────────────────────
        if (/abastecimento|pkl baixo|reposicao|repor|abastecer/.test(n))
            return _rAbastecimento();

        // ── 9. Busca por nome ──────────────────────────────────
        if (/busca|procura|encontra|acha/.test(n)) {
            const match = q.match(/(?:busca|procura|encontra|acha)\s+(.{3,})/i);
            if (match) return _rBuscarProduto(match[1].trim());
        }

        // ── 10. Recebimento / Agendamentos ─────────────────────
        if (/recebimento|agendamento|fornecedor|nota fiscal|nf\b|entrega|doca|chegada/.test(n)) {
            if (/hoje|do dia|agora/.test(n))                    return _rRecebimentoHoje();
            if (/fornecedor/.test(n) && !/agend/.test(n))       return _rFornecedores();
            return _rRecebimento();
        }

        // ── 11. Fila ───────────────────────────────────────────
        if (/fila|coleta|picking|rota|separacao|separar/.test(n)) {
            if (/total|quantos|quantidade/.test(n)) return _rFilaResumo();
            return _rFila();
        }

        // ── 12. Tarefas ────────────────────────────────────────
        if (/tarefa|checklist|pendente|turno|o que falta|lista de/.test(n))
            return _rTarefas();

        // ── 13. Gargalos / UC ──────────────────────────────────
        if (/pkl|gargalo|uc\b|unitiza|complementa|dpa|aereo|ael|reserva\b/.test(n)) {
            if (/aereo|ael/.test(n))     return _rGargalosAereo();
            if (/reserva/.test(n))       return _rGargalosReserva();
            return _rPKL();
        }

        // ── 14. Vendas / Duelo ─────────────────────────────────
        if (/duelo|benchmark|pdv|venda|vendas|mesquita|jacarepagua|benfica|performance/.test(n)) {
            if (/crescimento|tendencia|trend|sobe|subindo/.test(n)) return _rTendencia('growth');
            if (/queda|caindo|declinio|caiu|perdendo/.test(n))      return _rTendencia('decline');
            if (/top|melhor|lider|mais vendido/.test(n))            return _rTopVendas();
            if (/inconsistente|vendeu.*zerou|vendeu sem estoque/.test(n)) return _rInconsistencias();
            if (/mesquita/.test(n))    return _rDueloPDV('mesquita');
            if (/jacarepagua/.test(n)) return _rDueloPDV('jacarepagua');
            if (/benfica/.test(n))     return _rDueloPDV('benfica');
            return _rDuelo();
        }

        // ── 15. Ações prioritárias ─────────────────────────────
        if (/acao|acoes|prioritar|alerta|urgente|o que fazer|prioridade/.test(n))
            return _rAcoes();

        // ── 16. Inconsistências ────────────────────────────────
        if (/inconsistente|vendeu.*zerou/.test(n)) return _rInconsistencias();

        // ── Fallback (dispara camada 3 — Gemini) ──────────────
        return `Não entendi "<b>${esc(q.substring(0,40))}</b>".<br>Tente: SKU numérico, <b>rupturas</b>, <b>estoque</b>, <b>fila</b>, <b>recebimento</b>, <b>duelo</b>, <b>pkl</b> ou <b>ações</b>.<br>Digite <b>ajuda</b> para todos os comandos.`;
    }

    // ══════════════════════════════════════════════════════════
    // RESOLVEDORES LOCAIS
    // ══════════════════════════════════════════════════════════

    function _rSistema() {
        const st       = document.getElementById('engine-status')?.innerText ?? '?';
        const pdvExtra = window.APP?.db?.pdvExtra ?? {};
        const pdvLines = Object.entries(pdvExtra)
            .filter(([,v]) => v?.length > 0)
            .map(([k,v]) => `&nbsp;&nbsp;↳ ${esc(k)}: <b>${v.length}</b>`)
            .join('<br>');
        const hasGemini = !!_getApiKey();
        return `🖥️ <b>K11 OMNI ELITE</b> — dados em memória:<br>
📦 Produtos: <b>${_prods().length}</b> SKUs<br>
🔄 Movimentos: <b>${_mov().length}</b> registros<br>
🛒 Vendas PDV: <b>${_pdv().length}</b> registros${pdvLines ? '<br>' + pdvLines : ''}<br>
📋 Agendamentos: <b>${_ags().length}</b><br>
⚠️ Gargalos UC: <b>${_uc().length}</b><br>
📋 Tarefas: <b>${_tarefas().length}</b><br>
🤖 Gemini AI: <b>${hasGemini ? '✅ Ativo' : '⚠️ Sem chave'}</b><br>
Status: <b>${esc(st)}</b>`;
    }

    function _rProduto(sku) {
        if (!_dadosOk()) {
            _scheduleRetry(sku);
            return `⏳ Estoque ainda inicializando. Consultando SKU <b>${esc(sku)}</b> em instantes...`;
        }

        const prod = _prods().find(p => String(p.id) === String(sku));
        if (!prod) return `SKU <b>${esc(sku)}</b> não encontrado no estoque. Verifique o código.`;

        const stMap = { red: '🔴 RUPTURA', yellow: '🟡 ABASTECIMENTO', green: '🟢 SAUDÁVEL', 'sem-estoque': '⚫ SEM ESTOQUE' };
        const status = stMap[prod.categoriaCor] ?? '❓';

        const deps   = prod.depositos ?? [];
        const dPKL   = deps.filter(d => d.tipo === 'PKL');
        const dAEL   = deps.filter(d => d.tipo === 'AEL');
        const dRES   = deps.filter(d => d.tipo === 'RES');
        const dLOG   = deps.filter(d => d.tipo === 'LOG');

        let depHTML = '';
        if (dPKL.length) depHTML += `PKL: <b>${dPKL.map(d => `${esc(d.pos)} (${d.q}un)`).join(', ')}</b> `;
        if (dAEL.length) depHTML += `· AEL: ${dAEL.map(d => `${esc(d.pos)} (${d.q}un)`).join(', ')} `;
        if (dRES.length) depHTML += `· RES: ${dRES.map(d => `${esc(d.pos)} (${d.q}un)`).join(', ')} `;
        if (dLOG.length) depHTML += `· LOG: ${dLOG.map(d => `${esc(d.pos)} (${d.q}un)`).join(', ')} `;
        if (!depHTML.trim()) depHTML = 'Sem posições cadastradas.';

        const movs = _mov().filter(m => String(m?.['Produto'] ?? '').trim() === String(sku));
        let movHTML = 'Nenhum movimento registrado.';
        if (movs.length) {
            const ult  = movs[movs.length - 1];
            const de   = ult['PD origem']  ?? 'N/I';
            const para = ult['PD destino'] ?? 'N/I';
            const data = ult['Data da confirmação'] ?? ult['Data de criação'] ?? 'S/D';
            const qtd  = ult['Qtd.prev.orig.UMA'] ?? '';
            const desc = ult['Descrição produto'] ? ` (${esc(ult['Descrição produto'].substring(0, 25))})` : '';
            movHTML = `Últ. mov${desc}: <b>${esc(de)}</b>→<b>${esc(para)}</b> · ${esc(data)} · ${esc(String(qtd))}un`;
        }

        const venda = _pdv().filter(v => String(v?.['Nº do produto'] ?? '').trim() === String(sku));
        const totalVenda = venda.reduce((s, v) => s + safeFloat(v?.['Quantidade vendida']), 0);
        const vendaHTML = totalVenda > 0 ? `Vendas período: <b>${totalVenda}un</b>` : 'Sem vendas no período.';

        const ag = _ags().find(a => String(a.sku) === String(sku));
        let agHTML = '';
        if (ag) {
            const nfStr = ag.nfs?.length ? ` · NF: ${ag.nfs.join(', ')}` : '';
            agHTML = `<br>📦 Agendado: <b>${esc(ag.fornecedor)}</b> · ${ag.qtdAgendada}un · ${esc(ag.dataInicio)} · Doca: ${esc(ag.doca || 'N/I')}${nfStr}`;
        }

        const gc = _uc().find(g => String(g.id) === String(sku));
        const gcHTML = gc ? `<br>⚠️ Gargalo: <b>${esc(gc.status)}</b> AEL:${gc.ael}un RES:${gc.res}un` : '';

        const valHTML = (prod.valTotal ?? 0) > 0 ? ` · R$<b>${brl(prod.valTotal)}</b>` : '';

        return `<b>${esc(sku)}</b> — ${esc(prod.desc)}<br>
${status} · Total:<b>${prod.total ?? 0}un</b> · PKL:<b>${prod.pkl ?? 0}un</b>${valHTML}<br>
📍 ${depHTML.trim()}<br>
🔄 ${movHTML}<br>
🛒 ${vendaHTML}${agHTML}${gcHTML}`;
    }

    function _rBuscarProduto(termo) {
        if (!_dadosOk()) return '⏳ Estoque ainda carregando. Tente em instantes.';
        const t = normalizeStr(termo);
        const res = _prods().filter(p => normalizeStr(p.desc).includes(t) || String(p.id).includes(termo));
        if (!res.length) return `Nenhum produto encontrado para "<b>${esc(termo)}</b>".`;
        const icone = { red: '🔴', yellow: '🟡', green: '🟢' };
        const lista = res.slice(0, 6).map(p =>
            `${icone[p.categoriaCor] ?? '⚫'} <b>${esc(p.id)}</b> — ${esc(p.desc.substring(0,40))} · ${p.total ?? 0}un`
        ).join('<br>');
        return `🔍 <b>${res.length}</b> resultado(s) para "<b>${esc(termo)}</b>":<br>${lista}${res.length > 6 ? `<br>...e mais ${res.length - 6}.` : ''}`;
    }

    function _rRupturas() {
        if (!_dadosOk()) return '⏳ Estoque ainda carregando.';
        const list = _prods().filter(p => p.categoriaCor === 'red');
        if (!list.length) return '✅ Nenhuma ruptura. Estoque em conformidade.';
        const zerados = list.filter(p => p.subStatus === 'zero-total').length;
        const falsos  = list.filter(p => p.subStatus === 'falso-zero').length;
        const top = list.sort((a,b) => b.scoreCriticidade - a.scoreCriticidade).slice(0,5)
            .map(p => `<b>${esc(p.id)}</b> — ${esc(p.desc.substring(0,33))} · total:${p.total ?? 0}un pkl:${p.pkl ?? 0}un`)
            .join('<br>');
        return `🔴 <b>${list.length} ruptura(s)</b> · ${zerados} zerado(s) · ${falsos} falso-zero<br>${top}${list.length > 5 ? `<br>...e mais ${list.length-5}.` : ''}`;
    }

    function _rRupturasCriticas() {
        if (!_dadosOk()) return '⏳ Estoque ainda carregando.';
        const list = _prods().filter(p => p.categoriaCor === 'red' && (p.valTotal ?? 0) > 0)
            .sort((a,b) => b.scoreCriticidade - a.scoreCriticidade).slice(0,5);
        if (!list.length) return '✅ Sem rupturas com impacto financeiro.';
        const top = list.map(p => `<b>${esc(p.id)}</b> — ${esc(p.desc.substring(0,30))} · R$${brl(p.valTotal)}`).join('<br>');
        return `🔴 Rupturas por impacto financeiro:<br>${top}`;
    }

    function _rFalsoZero() {
        if (!_dadosOk()) return '⏳ Estoque ainda carregando.';
        const list = _prods().filter(p => p.subStatus === 'falso-zero');
        if (!list.length) return '✅ Nenhum falso-zero detectado.';
        const top = list.slice(0,5).map(p =>
            `<b>${esc(p.id)}</b> — ${esc(p.desc.substring(0,33))} · Total:${p.total}un PKL:0un`
        ).join('<br>');
        return `⚠️ <b>${list.length} falso-zero(s)</b> — estoque existe mas sem posição PKL:<br>${top}${list.length>5?`<br>...e mais ${list.length-5}.`:''}`;
    }

    function _rEstoque() {
        if (!_dadosOk()) return '⏳ Estoque ainda carregando.';
        const prods = _prods();
        const red = prods.filter(p => p.categoriaCor === 'red').length;
        const yel = prods.filter(p => p.categoriaCor === 'yellow').length;
        const grn = prods.filter(p => p.categoriaCor === 'green').length;
        const meta = _rank().meta ?? {};
        let fin = '';
        if ((meta.valTotalRed ?? 0) > 0)
            fin = `<br>💰 Em ruptura: R$<b>${brl(meta.valTotalRed)}</b> · Em abastec.: R$<b>${brl(meta.valTotalYellow ?? 0)}</b>`;
        return `📦 Estoque — <b>${prods.length}</b> SKUs<br>🔴 <b>${red}</b> rupturas · 🟡 <b>${yel}</b> abastecimento · 🟢 <b>${grn}</b> saudáveis${fin}`;
    }

    function _rEstoqueFinanceiro() {
        if (!_dadosOk()) return '⏳ Estoque ainda carregando.';
        const meta  = _rank().meta ?? {};
        const total = _prods().reduce((s,p) => s + (p.valTotal ?? 0), 0);
        if (!total) return 'Dados financeiros não disponíveis.';
        return `💰 Valor total: R$<b>${brl(total)}</b><br>🔴 Em ruptura: R$<b>${brl(meta.valTotalRed ?? 0)}</b><br>🟡 Em abastec.: R$<b>${brl(meta.valTotalYellow ?? 0)}</b>`;
    }

    function _rAbastecimento() {
        if (!_dadosOk()) return '⏳ Estoque ainda carregando.';
        const list = _prods().filter(p => p.categoriaCor === 'yellow');
        if (!list.length) return '✅ Nenhum produto em abastecimento crítico.';
        const top = list.slice(0,5).map(p =>
            `<b>${esc(p.id)}</b> — ${esc(p.desc.substring(0,33))} · PKL:${p.pkl}un`
        ).join('<br>');
        return `🟡 <b>${list.length}</b> produto(s) para abastecer (PKL ≤ 2un):<br>${top}${list.length>5?`<br>...e mais ${list.length-5}.`:''}`;
    }

    function _rRecebimento() {
        const ags = _ags();
        if (!ags.length) {
            const raw = (_db()._rawFornecedor ?? []).filter(f =>
                f?.FIELD3 && f?.FIELD1 !== 'Número Pedido' && f?.FIELD1 !== 'Cliente'
            );
            if (!raw.length) return '📋 Nenhum agendamento encontrado.';
            const skus = [...new Set(raw.map(f => String(f.FIELD3).trim()))];
            return `📋 <b>${skus.length}</b> SKU(s) em agendamento:<br>${skus.slice(0,5).map(s => `<b>${esc(s)}</b>`).join(', ')}${skus.length > 5 ? `...e mais ${skus.length-5}` : ''}`;
        }
        const lista = ags.slice(0,5).map(a => {
            const nfStr = a.nfs?.length ? ` · NF:${a.nfs[0]}` : '';
            return `<b>${esc(a.sku)}</b> — ${esc((a.desc || a.fornecedor).substring(0,28))} · ${a.qtdAgendada}un · ${esc(a.dataInicio)}${nfStr}`;
        }).join('<br>');
        return `📋 <b>${ags.length}</b> agendamento(s):<br>${lista}${ags.length>5?`<br>...e mais ${ags.length-5}.`:''}`;
    }

    function _rRecebimentoHoje() {
        const ags = _ags();
        if (!ags.length) return 'Nenhum agendamento encontrado.';
        const hoje = new Date().toLocaleDateString('pt-BR');
        const dd = hoje.substring(0,5);
        const doHoje = ags.filter(a => (a.dataInicio ?? '').includes(dd));
        if (!doHoje.length)
            return `Nenhum agendamento para hoje (${hoje}).<br>Próximo: <b>${esc(ags[0]?.dataInicio)}</b> — ${esc(ags[0]?.fornecedor)} · ${ags[0]?.qtdAgendada}un`;
        const lista = doHoje.slice(0,4).map(a =>
            `<b>${esc(a.sku)}</b> · ${esc(a.fornecedor.substring(0,22))} · ${a.qtdAgendada}un · Doca:${esc(a.doca||'N/I')}`
        ).join('<br>');
        return `📅 <b>${doHoje.length}</b> entrega(s) hoje (${hoje}):<br>${lista}`;
    }

    function _rFornecedores() {
        const raw = _db()._rawFornecedor ?? [];
        if (!raw.length) return 'Dados de fornecedores não disponíveis.';
        const fMap = new Map();
        raw.forEach(f => {
            if (!f?.FIELD12) return;
            const nomeRaw = String(f.FIELD12).trim();
            const nome = nomeRaw.includes(' - ') ? nomeRaw.split(' - ').slice(1).join(' - ') : nomeRaw;
            if (nome) fMap.set(nome, (fMap.get(nome) ?? 0) + 1);
        });
        if (!fMap.size) return 'Nenhum fornecedor identificado.';
        const lista = [...fMap.entries()].sort((a,b) => b[1]-a[1]).slice(0,5)
            .map(([nome, qtd]) => `<b>${esc(nome)}</b> · ${qtd} item(ns)`).join('<br>');
        return `🏭 <b>${fMap.size}</b> fornecedor(es) no agendamento:<br>${lista}`;
    }

    function _rFila() {
        const fila = _fila();
        if (!fila.length) return '📭 Fila de coleta vazia.';
        const lista = fila.slice(0,6).map((t,i) =>
            `${i+1}. <b>${esc(t.id)}</b> — ${esc((t.desc||'').substring(0,30))} · ${t.qtdSolicitada}un`
        ).join('<br>');
        return `📦 Fila — <b>${fila.length}</b> item(ns):<br>${lista}${fila.length>6?`<br>...e mais ${fila.length-6}.`:''}`;
    }

    function _rFilaResumo() {
        const fila = _fila();
        if (!fila.length) return 'Fila vazia.';
        const total = fila.reduce((s,t) => s + (t.qtdSolicitada ?? 0), 0);
        return `📦 Fila: <b>${fila.length}</b> SKU(s) · <b>${total}</b> unidades totais.`;
    }

    function _rTarefas() {
        const tar = _tarefas();
        if (!tar.length) return 'Nenhuma tarefa cadastrada.';
        const pendentes = tar.filter(t => !t.done);
        const feitas    = tar.filter(t => t.done);
        if (!pendentes.length) return `✅ Todas as <b>${tar.length}</b> tarefas do turno concluídas!`;
        const lista = pendentes.slice(0,6).map((t,i) =>
            `${i+1}. ${esc(t.task ?? t['Tarefa'] ?? 'S/D')}`
        ).join('<br>');
        return `📋 Tarefas — <b>${pendentes.length}</b> pendente(s) de <b>${tar.length}</b>:<br>${lista}${pendentes.length>6?`<br>...e mais ${pendentes.length-6}.`:''}<br>✅ Concluídas: <b>${feitas.length}</b>`;
    }

    function _rPKL() {
        const uc     = _uc();
        const semPKL = _prods().filter(p => (p.pkl ?? 0) === 0 && p.total > 0).length;
        if (!uc.length && !semPKL) return '✅ Nenhum gargalo de fluxo identificado.';
        const top = uc.slice(0,4).map(g =>
            `<b>${esc(g.id)}</b> — ${esc(g.desc.substring(0,28))} · ${esc(g.status)} · AEL:${g.ael}un RES:${g.res}un PKL:${g.pkl}un`
        ).join('<br>');
        return `⚠️ <b>${uc.length}</b> gargalo(s) UC · <b>${semPKL}</b> sem PKL:<br>${top}${uc.length>4?`<br>...e mais ${uc.length-4}.`:''}`;
    }

    function _rGargalosAereo() {
        const lista = _uc().filter(g => g.ael > 0).slice(0,5);
        if (!lista.length) return '✅ Nenhum produto parado em AEL.';
        return `📦 Parados em AEL:<br>${lista.map(g=>`<b>${esc(g.id)}</b> AEL:${g.ael}un PKL:${g.pkl}un · <b>${esc(g.status)}</b>`).join('<br>')}`;
    }

    function _rGargalosReserva() {
        const lista = _uc().filter(g => g.res > 0).slice(0,5);
        if (!lista.length) return '✅ Nenhum produto parado em RES.';
        return `🗄️ Parados em RESERVA:<br>${lista.map(g=>`<b>${esc(g.id)}</b> RES:${g.res}un PKL:${g.pkl}un · <b>${esc(g.status)}</b>`).join('<br>')}`;
    }

    function _rDuelo() {
        const b = _rank().benchmarking;
        if (!b || !b.hidraulica) return 'Dados de duelo ainda não calculados.';
        const duelos = _rank().duelos ?? [];
        const top3 = duelos.slice(0,3).map(d =>
            `${d.dominando ? '✅' : '❌'} <b>${esc(d.id)}</b> — ${esc(d.desc.substring(0,22))} K11:${d.vMinha}un vs ${d.vAlvo}un (−${d.loss}%)`
        ).join('<br>');
        return `📊 Benchmark PDV:<br>🟠 K11:<b>${b.hidraulica}%</b> · 🔵 Mesquita:<b>${b.mesquita}%</b> · 🟣 Jacarepaguá:<b>${b.jacarepagua}%</b> · 🟢 Benfica:<b>${b.benfica}%</b>${top3 ? '<br><br>Top gaps:<br>'+top3 : ''}`;
    }

    function _rDueloPDV(pdv) {
        const b = _rank().benchmarking ?? {};
        const duelos = _rank().duelos ?? [];
        if (!duelos.length) return `Dados de duelo vs ${pdv} não disponíveis.`;
        const nomes = { mesquita:'Mesquita 🔵', jacarepagua:'Jacarepaguá 🟣', benfica:'Benfica 🟢' };
        const top = duelos.slice(0,5).map(d =>
            `${d.dominando?'✅':'⬇️'} <b>${esc(d.id)}</b> — ${esc(d.desc.substring(0,22))} · K11:${d.vMinha}un vs ${d.vAlvo}un`
        ).join('<br>');
        return `📊 K11 vs ${nomes[pdv]??pdv} · Score:<b>${b[pdv]??0}%</b><br>${top}`;
    }

    function _rTopVendas() {
        const pdvData = _pdv();
        if (!pdvData.length) return 'Dados de vendas PDV não carregados.';
        const map = new Map();
        pdvData.forEach(v => {
            const id  = String(v?.['Nº do produto'] ?? '').trim();
            const qtd = safeFloat(v?.['Quantidade vendida']);
            if (id && qtd > 0) map.set(id, (map.get(id) ?? 0) + qtd);
        });
        const top = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0,6).map(([id, qtd], i) => {
            const p = _prods().find(x => String(x.id) === id);
            return `${i+1}. <b>${esc(id)}</b> — ${esc((p?.desc ?? id).substring(0,28))} · <b>${qtd}un</b>`;
        }).join('<br>');
        return `🏆 Top SKUs em vendas (período):<br>${top}`;
    }

    function _rTendencia(tipo) {
        const lista = tipo === 'growth' ? (_rank().growth ?? []) : (_rank().decline ?? []);
        if (!lista.length) return 'Dados de tendência não calculados.';
        const tit = tipo === 'growth' ? '📈 Crescimento' : '📉 Queda';
        const sinal = tipo === 'growth' ? '+' : '';
        const top = lista.slice(0,5).map((r,i) =>
            `${i+1}. <b>${esc(r.id)}</b> — ${esc((r.desc??'').substring(0,28))} · <b>${sinal}${r.perc}%</b>${r.isMock?' (est.)':''}`
        ).join('<br>');
        return `${tit} de vendas:<br>${top}`;
    }

    function _rInconsistencias() {
        const inc = _rank().meta?.inconsistentes ?? [];
        if (!inc.length) return '✅ Sem inconsistências detectadas.';
        const lista = inc.slice(0,5).map(p =>
            `<b>${esc(p.id)}</b> — ${esc(p.desc.substring(0,33))} · Vende mas zerado`
        ).join('<br>');
        return `⚠️ <b>${inc.length}</b> SKU(s) com venda mas ruptura de estoque:<br>${lista}${inc.length>5?`<br>...e mais ${inc.length-5}.`:''}`;
    }

    function _rAcoes() {
        let ac = [];
        try { ac = window.APP?._gerarAcoesPrioritarias?.() ?? []; } catch(_) {}
        if (!ac.length) return 'Nenhuma ação prioritária gerada. Verifique se os dados estão carregados.';
        const icons = { alta: '🔴', media: '🟡', baixa: '🟢' };
        const lista = ac.slice(0,5).map((a,i) => {
            const meta = a.meta ? ` — ${esc(a.meta.substring(0,48))}` : '';
            return `${i+1}. ${icons[a.urgencia]??'⚪'} <b>${esc(a.desc??'')}</b>${meta}${a.done?' ✅':''}`;
        }).join('<br>');
        const pend = ac.filter(a => !a.done).length;
        return `⚡ <b>${ac.length}</b> ação(ões) · <b>${pend}</b> pendente(s):<br>${lista}`;
    }

    function _rSaudacao() {
        const nome  = _usuario().nome?.split(' ')[0] ?? '';
        const rups  = _prods().filter(p => p.categoriaCor === 'red').length;
        const fila  = _fila().length;
        const ags   = _ags().length;
        const hasGemini = !!_getApiKey();
        let ctx = '';
        if (!_dadosOk()) {
            ctx = ' ⏳ Dados ainda carregando...';
        } else {
            if (rups > 0) ctx += ` <b>${rups}</b> ruptura(s).`;
            if (fila > 0) ctx += ` Fila: <b>${fila}</b> item(ns).`;
            if (ags  > 0) ctx += ` <b>${ags}</b> agendamento(s).`;
            if (!ctx)     ctx  = ' Sistema ok.';
        }

        return `Olá${nome?`, <b>${esc(nome)}</b>`:''}! K11 Voice ativo.${ctx}`;
    }

    function _rHelp() {
        return `🎙️ Comandos disponíveis:<br>
· <b>[SKU numérico]</b> → posição, movimentos, vendas, agendamento<br>
· <b>"busca [nome]"</b> → procura produto por descrição<br>
· <b>"rupturas"</b> / <b>"falso zero"</b> → produtos zerados<br>
· <b>"estoque"</b> / <b>"estoque financeiro"</b> → inventário geral<br>
· <b>"abastecimento"</b> → PKL crítico (≤ 2un)<br>
· <b>"recebimento"</b> / <b>"hoje"</b> / <b>"fornecedor"</b> → agendamentos<br>
· <b>"fila"</b> → itens de coleta pendentes<br>
· <b>"tarefas"</b> → checklist do turno<br>
· <b>"pkl"</b> / <b>"gargalo"</b> / <b>"aéreo"</b> / <b>"reserva"</b> → UC/DPA<br>
· <b>"duelo"</b> / <b>"vs mesquita"</b> / <b>"vendas"</b> → benchmark PDV<br>
· <b>"insights"</b> / <b>"briefing"</b> → análise cruzada do turno<br>
· <b>"comparar [SKU1] [SKU2]"</b> → comparativo lado a lado<br>
· <b>"monitorar [SKU]"</b> → adiciona à watch list<br>
· <b>"prioridade agora"</b> → fila executiva imediata<br>
· <b>"ações"</b> → alertas prioritários do turno<br>
· <b>"sistema"</b> → quantos dados foram carregados<br>
<br>✦ Com Gemini ativo: qualquer pergunta em linguagem natural`;
    }

    // ══════════════════════════════════════════════════════════
    // TTS
    // ══════════════════════════════════════════════════════════
    // ── Converte HTML para texto limpo (sem emoji, sem tags) ──
    function _htmlToText(html) {
        return html
            .replace(/<span[^>]*font-size:1[0-9]px[^>]*>.*?<\/span>/gi, '')
            .replace(/<br\s*\/?>/gi, '. ')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"')
            .replace(/[·•]/g, ',')
            .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
            .replace(/[\u{2600}-\u{27BF}]/gu, '')
            .replace(/[⚠️✅❌🔴🟡🟢📈📉⏳🔑🤖🎙️✦·•▲▼→←]/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    function _speak(html) {
        const text = _htmlToText(html);
        if (!text) return;

        // ── K11KeyVoice (ElevenLabs) — usa se disponível e configurado ──
        if (typeof K11KeyVoice !== 'undefined' && K11KeyVoice.isReady()) {
            K11KeyVoice.onStart(() => _setStatus('FALANDO', 'sp'));
            K11KeyVoice.onEnd(()   => _setStatus('STANDBY', ''));
            K11KeyVoice.speak(text);
            return;
        }

        // ── Fallback: Web Speech API nativo ──────────────────────────────
        if (!_synth) return;
        try { _synth.cancel(); } catch(_) {}
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR'; u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
        const fire = () => {
            const vl = _synth.getVoices();
            const v  = vl.find(v => v.lang === 'pt-BR') || vl.find(v => v.lang.startsWith('pt')) || vl[0] || null;
            if (v) u.voice = v;
            u.onstart = () => _setStatus('FALANDO', 'sp');
            u.onend   = () => _setStatus('STANDBY', '');
            u.onerror = () => _setStatus('STANDBY', '');
            _synth.speak(u);
        };
        _synth.getVoices().length > 0 ? fire()
            : _synth.addEventListener('voiceschanged', function f() {
                _synth.removeEventListener('voiceschanged', f); fire();
            });
    }

    // ══════════════════════════════════════════════════════════
    // HELPERS DOM
    // ══════════════════════════════════════════════════════════
    function _setStatus(txt, cls) {
        const el = document.getElementById(ID.status);
        if (!el) return;
        el.textContent = txt;
        el.className   = cls || '';
    }

    function _setMicActive(on) {
        const btn = document.getElementById(ID.mic);
        if (!btn) return;
        btn.classList.toggle('active', on);
        const ico = btn.querySelector('.material-symbols-outlined');
        if (ico) ico.textContent = on ? 'mic_off' : 'mic';
        document.getElementById(ID.btn)?.classList.toggle('va', on);
    }

    function _addMsg(role, html, source) {
        const ts  = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
        const id  = `vm-${Date.now()}`;
        _history.push({role,html,ts,id});
        const wrap = document.getElementById(ID.hist);
        if (!wrap) return id;
        const div = document.createElement('div');
        div.className = `vmsg ${role}`;
        div.id = id;
        const srcTag = source === 'gemini' ? `<span class="vmsg-src">✦ gemini</span>` : '';
        div.innerHTML = `<div class="vmsg-av"><span class="material-symbols-outlined">${role==='k11'?'smart_toy':'person'}</span></div><div class="vmsg-bbl">${html}${srcTag}<span class="vmsg-ts">${ts}</span></div>`;
        wrap.appendChild(div);
        wrap.scrollTop = wrap.scrollHeight;
        return id;
    }

    // Expõe addMsg para o Brain poder injetar alertas da watch list
    function _addMsgExternal(role, html) { return _addMsg(role, html); }

    function _addTyping(type) {
        const wrap = document.getElementById(ID.hist);
        if (!wrap) return null;
        const id = `vt-${Date.now()}`;
        const div = document.createElement('div');
        div.className = 'vmsg k11'; div.id = id;
        const dotClass = type === 'gemini' ? 'vmsg-typing gemini' : 'vmsg-typing';
        div.innerHTML = `<div class="vmsg-av"><span class="material-symbols-outlined">smart_toy</span></div><div class="${dotClass}"><span></span><span></span><span></span></div>`;
        wrap.appendChild(div);
        wrap.scrollTop = wrap.scrollHeight;
        return id;
    }

    function _removeEl(id) { document.getElementById(id)?.remove(); }

    function _welcome() {
        return _rSaudacao();
    }

    // ══════════════════════════════════════════════════════════
    // INIT PÚBLICO
    // ══════════════════════════════════════════════════════════
    function init() {
        if (_isInitDone) return;
        _synth = window.speechSynthesis || null;
        _injectStyles();
        _injectHTML();
        _isInitDone = true;
        _startDataWatcher();
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && e.key === 'V') { _isOpen ? close() : open(); }
            if (e.key === 'Escape' && _isOpen) close();
        });
        console.log('[K11 Voice v2.0] ✅ Ativo — 3 camadas: Brain → Local → Gemini. Ctrl+Shift+V');
    }

    return {
        init,
        open,
        close,
        _addMsgExternal,
        get _isInitDone() { return _isInitDone; },
    };

})();

// Expõe globalmente para acesso de outros módulos (evita "Can't find variable: K11Voice")
window.K11Voice = K11Voice;

// ══════════════════════════════════════════════════════════════
// AUTO-INIT — estratégia tripla robusta
// ══════════════════════════════════════════════════════════════
(function setupVoiceBoot() {

    if (typeof EventBus !== 'undefined') {
        EventBus.on('estoque:atualizado', () => {
            let tries = 0;
            function waitForOnline() {
                const st = document.getElementById('engine-status')?.innerText ?? '';
                if (st.includes('ONLINE')) {
                    K11Voice.init();
                } else if (tries++ < 20) {
                    setTimeout(waitForOnline, 500);
                } else {
                    K11Voice.init();
                }
            }
            setTimeout(waitForOnline, 200);
        });
    }

    let attempts = 0;
    const MAX = 60;

    function poll() {
        attempts++;
        if (typeof K11Voice !== 'undefined' && K11Voice._isInitDone) return;

        const st       = document.getElementById('engine-status');
        const stText   = st?.innerText ?? '';
        const statusOk = stText.includes('ONLINE');
        const dataOk   = window.APP && Array.isArray(window.APP.db?.produtos) && window.APP.db.produtos.length > 0;

        if (statusOk && dataOk) {
            K11Voice.init();
        } else if (attempts < MAX) {
            setTimeout(poll, 500);
        } else {
            console.warn('[K11 Voice] Timeout 30s. Iniciando no fallback.');
            K11Voice.init();
        }
    }

    if (document.readyState === 'complete') {
        setTimeout(poll, 800);
    } else {
        window.addEventListener('load', () => setTimeout(poll, 800), { once: true });
    }

})();
