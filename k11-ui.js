/**
 * K11 OMNI ELITE — COMPONENTES DE UI
 * ════════════════════════════════════
 * Modal de confirmação e sistema de toast.
 * Substitui confirm() / alert() nativos do browser.
 *
 * Depende de: k11-utils.js
 */

'use strict';

// ─── MODAL DE CONFIRMAÇÃO ─────────────────────────────────────

/**
 * Exibe modal customizado no lugar do confirm() nativo.
 * Requer um elemento <div id="modal-overlay"> no HTML.
 *
 * @param {string}   mensagem  - Texto exibido no modal
 * @param {Function} onConfirm - Callback chamado ao confirmar
 */
function showConfirm(mensagem, onConfirm) {
    const overlay = document.getElementById('modal-overlay');

    // Fallback para ambientes sem o elemento (ex: index.html)
    if (!overlay) {
        if (confirm(mensagem)) onConfirm();
        return;
    }

    overlay.innerHTML = `
        <div class="modal-box">
            <div class="label" style="margin-bottom:12px">CONFIRMAÇÃO</div>
            <p class="micro-txt" style="color:var(--text-muted);line-height:1.6;margin-bottom:20px">
                ${esc(mensagem)}
            </p>
            <div style="display:flex;gap:8px">
                <button class="pos-tag"
                        style="flex:1;background:var(--border-color);color:var(--text-muted)"
                        onclick="document.getElementById('modal-overlay').classList.remove('active')">
                    CANCELAR
                </button>
                <button class="pos-tag btn-action" style="flex:1" id="modal-confirm-btn">
                    CONFIRMAR
                </button>
            </div>
        </div>`;

    overlay.classList.add('active');

    document.getElementById('modal-confirm-btn').onclick = () => {
        overlay.classList.remove('active');
        onConfirm();
    };
}

// ─── TOAST ────────────────────────────────────────────────────
// O toast vive em APP.ui.toast() para ter acesso ao TOAST_DURATION_MS.
// Esta é a implementação standalone (usada quando APP ainda não existe).

/**
 * Exibe notificação temporária no rodapé da tela.
 * @param {string} msg  - Mensagem a exibir
 * @param {'info'|'success'|'danger'} type - Cor do toast
 */
function showToast(msg, type = 'info') {
    const existing = document.getElementById('k11-toast');
    if (existing) existing.remove();

    const toast       = document.createElement('div');
    toast.id          = 'k11-toast';
    toast.className   = `toast toast-${type}`;
    toast.textContent = msg;

    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    setTimeout(() => {
        toast.classList.remove('toast-visible');
        setTimeout(() => toast.remove(), 300);
    }, TOAST_DURATION_MS);
}
