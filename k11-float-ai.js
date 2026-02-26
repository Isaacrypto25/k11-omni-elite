/**
 * K11 OMNI ELITE — FLOATING AI ASSISTANT
 * ════════════════════════════════════════
 * FAB persistente em todas as telas.
 * Abre popup com opções: Escrever (texto) ou Falar (voz).
 * Delega para K11Voice.open() que já existe.
 */
'use strict';

(function K11FloatAI() {

    const FAB_ID    = 'k11-float-fab';
    const POPUP_ID  = 'k11-float-popup';
    const RIPPLE_ID = 'k11-float-ripple';

    // ─── CSS ──────────────────────────────────────────────────
    const CSS = `
    /* ── FAB ────────────────────────────────────────────────── */
    #${FAB_ID} {
        position: fixed;
        right: 18px;
        bottom: 82px;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        z-index: 1200;
        background: linear-gradient(145deg, #FF9800, #E06000);
        box-shadow:
            0 4px 20px rgba(255,140,0,0.40),
            0 0 0 0 rgba(255,140,0,0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.3s cubic-bezier(.34,1.56,.64,1), box-shadow 0.3s;
        outline: none;
        -webkit-tap-highlight-color: transparent;
    }
    #${FAB_ID}:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 28px rgba(255,140,0,0.55), 0 0 0 0 rgba(255,140,0,0.25);
    }
    #${FAB_ID}.fab-open {
        transform: rotate(45deg) scale(1.05);
        background: linear-gradient(145deg, #2D3252, #1A1D2E);
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    #${FAB_ID} svg { transition: transform 0.3s, opacity 0.2s; }

    /* pulse ring */
    #${FAB_ID}::before {
        content: '';
        position: absolute;
        inset: -5px;
        border-radius: 50%;
        border: 1.5px solid rgba(255,140,0,0.35);
        animation: fabRing 2.5s ease-out infinite;
    }
    @keyframes fabRing {
        0%   { transform: scale(0.88); opacity: 0.7; }
        60%  { transform: scale(1.22); opacity: 0.05; }
        100% { transform: scale(0.88); opacity: 0.7; }
    }
    #${FAB_ID}.fab-open::before { display: none; }

    /* ── POPUP ───────────────────────────────────────────────── */
    #${POPUP_ID} {
        position: fixed;
        right: 14px;
        bottom: 142px;
        width: 220px;
        background: #0d0f18;
        border: 1px solid rgba(255,140,0,0.18);
        border-radius: 18px;
        padding: 16px;
        z-index: 1199;
        box-shadow:
            0 16px 48px rgba(0,0,0,0.70),
            0 0 0 1px rgba(255,255,255,0.03),
            inset 0 1px 0 rgba(255,255,255,0.04);
        opacity: 0;
        transform: translateY(12px) scale(0.94);
        pointer-events: none;
        transition: opacity 0.25s cubic-bezier(.16,1,.3,1), transform 0.25s cubic-bezier(.16,1,.3,1);
    }
    #${POPUP_ID}.popup-open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: all;
    }

    /* header */
    .k11f-head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .k11f-avatar {
        width: 34px; height: 34px; border-radius: 50%;
        background: linear-gradient(135deg, rgba(255,140,0,0.2), rgba(255,140,0,0.06));
        border: 1px solid rgba(255,140,0,0.28);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        box-shadow: 0 0 12px rgba(255,140,0,0.15);
    }
    .k11f-title  { font-size: 11px; font-weight: 900; letter-spacing: 1px; color: #EDF0F7; text-transform: uppercase; }
    .k11f-sub    { font-size: 9px;  font-weight: 700; letter-spacing: 0.8px; color: #5A6480; margin-top: 1px; text-transform: uppercase; }

    /* options */
    .k11f-opts   { display: flex; flex-direction: column; gap: 8px; }
    .k11f-opt {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 11px 13px;
        border-radius: 12px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.18s;
        text-align: left;
        background: transparent;
        width: 100%;
        font-family: 'Inter', sans-serif;
    }
    .k11f-opt:hover { transform: translateX(2px); }
    .k11f-opt-text {
        background: rgba(255,140,0,0.07);
        border-color: rgba(255,140,0,0.18);
    }
    .k11f-opt-text:hover {
        background: rgba(255,140,0,0.13);
        border-color: rgba(255,140,0,0.35);
        box-shadow: 0 0 16px rgba(255,140,0,0.1);
    }
    .k11f-opt-voice {
        background: rgba(16,185,129,0.07);
        border-color: rgba(16,185,129,0.18);
    }
    .k11f-opt-voice:hover {
        background: rgba(16,185,129,0.13);
        border-color: rgba(16,185,129,0.35);
        box-shadow: 0 0 16px rgba(16,185,129,0.1);
    }
    .k11f-ico {
        width: 32px; height: 32px; border-radius: 9px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
    }
    .k11f-ico-text  { background: rgba(255,140,0,0.15); }
    .k11f-ico-voice { background: rgba(16,185,129,0.15); }
    .k11f-opt-label { font-size: 12px; font-weight: 800; color: #EDF0F7; letter-spacing: 0.3px; }
    .k11f-opt-hint  { font-size: 9px; color: #5A6480; margin-top: 1px; font-weight: 600; letter-spacing: 0.3px; }

    /* ripple on fab click */
    .k11f-ripple {
        position: fixed;
        border-radius: 50%;
        background: rgba(255,140,0,0.25);
        pointer-events: none;
        animation: k11fRipple 0.5s ease-out forwards;
        z-index: 1198;
    }
    @keyframes k11fRipple {
        0%   { transform: scale(0); opacity: 1; }
        100% { transform: scale(3); opacity: 0; }
    }

    /* ── BACKDROP ────────────────────────────────────────────── */
    #k11f-backdrop {
        position: fixed; inset: 0;
        z-index: 1198;
        display: none;
    }
    #k11f-backdrop.active { display: block; }
    `;

    // ─── SVG ICONS ────────────────────────────────────────────
    const SVG = {
        bot: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="8" width="18" height="13" rx="3" stroke="#FF8C00" stroke-width="1.8"/>
            <circle cx="9"  cy="13" r="1.5" fill="#FF8C00"/>
            <circle cx="15" cy="13" r="1.5" fill="#FF8C00"/>
            <path d="M9 17h6" stroke="#FF8C00" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M12 8V5" stroke="#FF8C00" stroke-width="1.8" stroke-linecap="round"/>
            <circle cx="12" cy="4" r="1.5" stroke="#FF8C00" stroke-width="1.5"/>
        </svg>`,
        close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
        </svg>`,
        text: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#FF8C00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 9h8M8 13h5" stroke="#FF8C00" stroke-width="1.8" stroke-linecap="round"/>
        </svg>`,
        mic: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke="#10B981" stroke-width="2"/>
            <path d="M19 10v2a7 7 0 01-14 0v-2" stroke="#10B981" stroke-width="2" stroke-linecap="round"/>
            <line x1="12" y1="19" x2="12" y2="23" stroke="#10B981" stroke-width="2" stroke-linecap="round"/>
            <line x1="8"  y1="23" x2="16" y2="23" stroke="#10B981" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
    };

    let _open = false;

    // ─── INIT ─────────────────────────────────────────────────
    function _init() {
        // Inject CSS
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        // Backdrop
        const bd = document.createElement('div');
        bd.id = 'k11f-backdrop';
        bd.addEventListener('click', _close);
        document.body.appendChild(bd);

        // Popup
        const popup = document.createElement('div');
        popup.id = POPUP_ID;
        popup.innerHTML = `
            <div class="k11f-head">
                <div class="k11f-avatar">${SVG.bot}</div>
                <div>
                    <div class="k11f-title">K11 OMNI AI</div>
                    <div class="k11f-sub">Como quer interagir?</div>
                </div>
            </div>
            <div class="k11f-opts">
                <button class="k11f-opt k11f-opt-text" id="k11f-btn-text">
                    <div class="k11f-ico k11f-ico-text">${SVG.text}</div>
                    <div>
                        <div class="k11f-opt-label" style="color:#FF8C00">Escrever</div>
                        <div class="k11f-opt-hint">Digitar uma pergunta ou comando</div>
                    </div>
                </button>
                <button class="k11f-opt k11f-opt-voice" id="k11f-btn-voice">
                    <div class="k11f-ico k11f-ico-voice">${SVG.mic}</div>
                    <div>
                        <div class="k11f-opt-label" style="color:#10B981">Falar</div>
                        <div class="k11f-opt-hint">Usar microfone e voz</div>
                    </div>
                </button>
            </div>`;
        document.body.appendChild(popup);

        // FAB
        const fab = document.createElement('button');
        fab.id = FAB_ID;
        fab.setAttribute('aria-label', 'Assistente K11');
        fab.innerHTML = SVG.bot;
        fab.addEventListener('click', _toggle);
        document.body.appendChild(fab);

        // Button actions
        document.getElementById('k11f-btn-text').addEventListener('click', () => {
            _close();
            _openText();
        });
        document.getElementById('k11f-btn-voice').addEventListener('click', () => {
            _close();
            _openVoice();
        });

        // ESC to close
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && _open) _close(); });

        // Hide FAB when voice panel is open (evita sobreposição)
        document.addEventListener('click', () => {
            const panel = document.getElementById('k11va-panel');
            if (panel?.classList.contains('open')) {
                fab.style.opacity = '0';
                fab.style.pointerEvents = 'none';
            } else {
                fab.style.opacity = '1';
                fab.style.pointerEvents = 'all';
            }
        }, true);
    }

    function _toggle(e) {
        // Ripple
        const fab = document.getElementById(FAB_ID);
        const rect = fab.getBoundingClientRect();
        const rip = document.createElement('div');
        rip.className = 'k11f-ripple';
        const sz = 52;
        rip.style.cssText = `width:${sz}px;height:${sz}px;left:${rect.left}px;top:${rect.top}px;`;
        document.body.appendChild(rip);
        setTimeout(() => rip.remove(), 500);

        _open ? _close() : _show();
    }

    function _show() {
        _open = true;
        const fab   = document.getElementById(FAB_ID);
        const popup = document.getElementById(POPUP_ID);
        const bd    = document.getElementById('k11f-backdrop');
        fab.classList.add('fab-open');
        fab.innerHTML = SVG.close;
        popup.classList.add('popup-open');
        bd.classList.add('active');
    }

    function _close() {
        _open = false;
        const fab   = document.getElementById(FAB_ID);
        const popup = document.getElementById(POPUP_ID);
        const bd    = document.getElementById('k11f-backdrop');
        if (!fab || !popup) return;
        fab.classList.remove('fab-open');
        fab.innerHTML = SVG.bot;
        popup.classList.remove('popup-open');
        bd?.classList.remove('active');
    }

    function _openText() {
        // Abre o painel do K11Voice e foca no input de texto
        if (typeof K11Voice !== 'undefined') {
            K11Voice.open();
            setTimeout(() => {
                const input = document.getElementById('k11va-input');
                if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth' }); }
            }, 300);
        } else {
            console.warn('[K11FloatAI] K11Voice não disponível');
        }
    }

    function _openVoice() {
        // Abre o painel e dispara o microfone imediatamente
        if (typeof K11Voice !== 'undefined') {
            K11Voice.open();
            setTimeout(() => {
                const mic = document.getElementById('k11va-mic');
                if (mic) mic.click();
            }, 400);
        } else {
            console.warn('[K11FloatAI] K11Voice não disponível');
        }
    }

    // ─── BOOT ─────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        // Small delay to let the voice assistant inject its DOM first
        setTimeout(_init, 200);
    }

    // Expose for external control
    window.K11FloatAI = { open: _show, close: _close };

})();
