/**
 * K11 OMNI ELITE — SETUP DE API KEY (GROQ)
 * ════════════════════════════════════════════
 * Exibe tela de configuração quando não há chave Groq.
 * Salva no localStorage. SEM chamada de validação à API.
 */
'use strict';

const K11Setup = (() => {
    const STORAGE_KEY = 'k11_groq_api_key';

    function getKey() {
        try {
            // 1º: config.js embutida (prioridade máxima)
            if (typeof K11_GROQ_API_KEY !== 'undefined'
                && K11_GROQ_API_KEY?.startsWith('gsk_')
                && K11_GROQ_API_KEY.length >= 30
                && !K11_GROQ_API_KEY.includes('COLE_SUA'))
                return K11_GROQ_API_KEY;
        } catch (_) {}
        // 2º: localStorage (persiste entre sessões)
        try { const k = localStorage.getItem(STORAGE_KEY); if (k) return k; } catch (_) {}
        // 3º: sessionStorage (fallback p/ Safari modo privado / iOS restrito)
        try { const k = sessionStorage.getItem(STORAGE_KEY); if (k) return k; } catch (_) {}
        return '';
    }

    function saveKey(key) {
        const v = key.trim();
        // Tenta localStorage; se bloqueado (modo privado iOS), usa sessionStorage
        let saved = false;
        try { localStorage.setItem(STORAGE_KEY, v); saved = true; } catch (_) {}
        if (!saved) { try { sessionStorage.setItem(STORAGE_KEY, v); } catch (_) {} }
    }

    function removeKey() {
        try { localStorage.removeItem(STORAGE_KEY); }  catch (_) {}
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }

    function _css() {
        if (document.getElementById('k11-setup-css')) return;
        const s = document.createElement('style');
        s.id = 'k11-setup-css';
        s.textContent = `
        #k11-setup-overlay {
            display:none;position:fixed;inset:0;
            background:rgba(9,9,15,.97);backdrop-filter:blur(8px);
            z-index:9999;align-items:center;justify-content:center;padding:20px;
        }
        #k11-setup-overlay.active{display:flex;}
        .k11-setup-box{
            width:100%;max-width:420px;background:#0f0f1a;
            border:1px solid rgba(255,140,0,.25);border-radius:16px;
            padding:28px 24px;box-shadow:0 0 60px rgba(255,140,0,.08);
        }
        .k11-setup-logo{display:flex;align-items:center;gap:10px;margin-bottom:20px;}
        .k11-setup-logo-icon{
            width:40px;height:40px;border-radius:50%;
            background:rgba(255,140,0,.1);border:1px solid rgba(255,140,0,.3);
            display:flex;align-items:center;justify-content:center;
            color:var(--primary,#ff8c00);
        }
        .k11-setup-logo-icon .material-symbols-outlined{font-size:20px;}
        .k11-setup-title{font-size:11px;font-weight:800;letter-spacing:2px;color:var(--primary,#ff8c00);text-transform:uppercase;}
        .k11-setup-sub{font-size:10px;color:#64748b;}
        .k11-setup-heading{font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:6px;}
        .k11-setup-desc{font-size:12px;color:#64748b;line-height:1.6;margin-bottom:20px;}
        .k11-setup-desc a{color:var(--primary,#ff8c00);text-decoration:none;}
        .k11-setup-steps{
            background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);
            border-radius:10px;padding:12px 14px;margin-bottom:18px;
        }
        .k11-setup-step{display:flex;gap:10px;font-size:11px;color:#94a3b8;line-height:1.5;padding:4px 0;}
        .k11-setup-step-n{
            width:18px;height:18px;border-radius:50%;flex-shrink:0;
            background:rgba(255,140,0,.15);color:var(--primary,#ff8c00);
            display:flex;align-items:center;justify-content:center;
            font-size:9px;font-weight:800;margin-top:1px;
        }
        .k11-setup-step b{color:#e2e8f0;}
        .k11-setup-label{font-size:9px;font-weight:700;letter-spacing:2px;color:#64748b;text-transform:uppercase;margin-bottom:6px;}
        #k11-setup-input{
            width:100%;background:rgba(255,255,255,.04);
            border:1px solid rgba(255,255,255,.1);border-radius:10px;
            padding:11px 14px;font-size:12px;color:#e0e0e0;outline:none;
            transition:border-color .2s;margin-bottom:12px;font-family:monospace;
        }
        #k11-setup-input:focus{border-color:rgba(255,140,0,.5);}
        #k11-setup-input::placeholder{color:rgba(255,255,255,.2);}
        #k11-setup-btn{
            width:100%;padding:12px;border-radius:10px;
            background:var(--primary,#ff8c00);border:none;
            color:#000;font-weight:800;font-size:12px;letter-spacing:1px;
            text-transform:uppercase;cursor:pointer;
            box-shadow:0 4px 20px rgba(255,140,0,.3);transition:all .2s;
        }
        #k11-setup-btn:hover{box-shadow:0 4px 28px rgba(255,140,0,.5);}
        .k11-setup-error{
            font-size:11px;color:#f87171;margin-bottom:10px;
            padding:8px 12px;background:rgba(239,68,68,.08);
            border:1px solid rgba(239,68,68,.2);border-radius:8px;display:none;
        }
        .k11-setup-privacy{margin-top:14px;font-size:10px;color:#475569;text-align:center;line-height:1.5;}
        .k11-setup-privacy span{color:#10b981;}`;
        document.head.appendChild(s);
    }

    function _html() {
        if (document.getElementById('k11-setup-overlay')) return;
        const div = document.createElement('div');
        div.id = 'k11-setup-overlay';
        div.innerHTML = `
            <div class="k11-setup-box">
                <div class="k11-setup-logo">
                    <div class="k11-setup-logo-icon">
                        <span class="material-symbols-outlined">neurology</span>
                    </div>
                    <div>
                        <div class="k11-setup-title">K11 Supreme Brain</div>
                        <div class="k11-setup-sub">Configuração da API Groq</div>
                    </div>
                </div>
                <div class="k11-setup-heading">Configure o Assistente de IA</div>
                <div class="k11-setup-desc">
                    O assistente usa a API <b style="color:#e2e8f0">gratuita</b> do Groq
                    (~1.000 requisições/dia, sem cartão de crédito).<br>
                    Crie sua chave em <a href="https://console.groq.com/keys" target="_blank">console.groq.com/keys</a>.
                </div>
                <div class="k11-setup-steps">
                    <div class="k11-setup-step">
                        <div class="k11-setup-step-n">1</div>
                        <div>Acesse <b>console.groq.com/keys</b> com sua conta Google</div>
                    </div>
                    <div class="k11-setup-step">
                        <div class="k11-setup-step-n">2</div>
                        <div>Clique em <b>"Create API Key"</b> e copie a chave</div>
                    </div>
                    <div class="k11-setup-step">
                        <div class="k11-setup-step-n">3</div>
                        <div>Cole abaixo — ou coloque direto no <b>k11-config.js</b></div>
                    </div>
                </div>
                <div class="k11-setup-label">Sua chave Groq</div>
                <input id="k11-setup-input" type="password"
                       placeholder="gsk_..." autocomplete="off" spellcheck="false">
                <div class="k11-setup-error" id="k11-setup-error"></div>
                <button id="k11-setup-btn">SALVAR E ATIVAR</button>
                <div class="k11-setup-privacy">
                    <span>🔒</span> Salva apenas neste navegador. Nunca enviada a nenhum servidor nosso.<br>
                    Não fazemos nenhuma chamada de validação — sua cota não é consumida ao salvar.<br>
                    <span style="color:#eab308">⚠</span> Em modo privado / aba anônima a chave não persiste ao fechar a aba.
                </div>
            </div>`;
        document.body.appendChild(div);
        document.getElementById('k11-setup-btn').addEventListener('click', _submit);
        document.getElementById('k11-setup-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') _submit();
        });
    }

    function _submit() {
        // ⚠ SEM fetch — não consome nenhuma requisição da API ao salvar
        const input = document.getElementById('k11-setup-input');
        const err   = document.getElementById('k11-setup-error');
        const key   = input.value.trim();

        err.style.display = 'none';

        if (!key) {
            err.textContent = 'Cole sua chave antes de continuar.';
            err.style.display = 'block';
            return;
        }
        if (!key.startsWith('gsk_') || key.length < 30) {
            err.textContent = 'Chave inválida. Deve começar com "gsk_..." e ter pelo menos 30 caracteres.';
            err.style.display = 'block';
            return;
        }

        saveKey(key);
        hide();
        if (typeof EventBus !== 'undefined') EventBus.emit('groq:key-configured');
    }

    function show() {
        _css(); _html();
        document.getElementById('k11-setup-overlay').classList.add('active');
        setTimeout(() => document.getElementById('k11-setup-input')?.focus(), 100);
    }

    function hide() {
        document.getElementById('k11-setup-overlay')?.classList.remove('active');
    }

    function changeKey() { removeKey(); show(); }

    // Só mostra tela se NÃO houver chave em lugar nenhum (config.js ou localStorage)
    function check() {
        if (!getKey()) show();
    }

    return { check, show, hide, changeKey, getKey, saveKey };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => K11Setup.check());
} else {
    K11Setup.check();
}
