/**
 * K11 OMNI ELITE — ACTIONS (Handlers de Interação)
 * ══════════════════════════════════════════════════
 * Funções chamadas diretamente pelo HTML via onclick="APP.actions.xxx()".
 * Modificam estado (APP.db, APP.ui) e geralmente chamam APP.view() para re-renderizar.
 *
 * Depende de: k11-config.js, k11-utils.js, k11-ui.js
 */

'use strict';

const Actions = {

    animateValue(id, start, end, duration) {
        const obj = document.getElementById(id);
        if (!obj) return;
        if (APP.ui._rafIds[id]) cancelAnimationFrame(APP.ui._rafIds[id]);
        let startT = null;
        const step = (t) => {
            if (!startT) startT = t;
            const progress = Math.min((t - startT) / duration, 1);
            const eased    = 1 - Math.pow(1 - progress, 3);
            obj.innerHTML  = brl(eased * (end - start) + start);
            if (progress < 1) { APP.ui._rafIds[id] = requestAnimationFrame(step); }
            else { delete APP.ui._rafIds[id]; }
        };
        APP.ui._rafIds[id] = requestAnimationFrame(step);
    },

    rastrear() {
        const v   = document.getElementById('sk-r')?.value.trim();
        const res = document.getElementById('res-investigar');
        if (!v || !res) return;
        const p    = APP.db.produtos.find(x => x.id === v);
        const movs = APP.db.movimento.filter(m => String(m?.['Produto'] ?? m?.['Nº do produto'] ?? '').trim() === v);
        if (!p) { res.innerHTML = `<div class="op-card centered margin-t-15">SKU NÃO ENCONTRADO</div>`; return; }

        // [NEW] Timeline visual para histórico
        const histHTML = movs.length
            ? [...movs].reverse().slice(0, 15).map((m, i) => `
                <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color)">
                    <div style="display:flex;flex-direction:column;align-items:center;padding-top:3px">
                        <div style="width:8px;height:8px;border-radius:50%;background:${i===0?'var(--primary)':'var(--border-color)'}"></div>
                        ${i<14?`<div style="width:1px;flex:1;background:var(--border-color);margin-top:3px"></div>`:''}
                    </div>
                    <div style="flex:1">
                        <div class="flex-between">
                            <b class="micro-txt">${esc(m['Data de criação']??m.Data??m['Data da confirmação']??'S/D')}</b>
                            <span class="micro-txt txt-primary">${esc(String(m['Quantidade confirmada']??m['Qtd.prev.orig.UMA']??''))} un</span>
                        </div>
                        <div class="micro-txt txt-muted">DE: ${esc(m['Pos.depósito origem']??m['PD origem']??'S/E')} → PARA: ${esc(m['Pos.depósito destino']??m['PD destino']??'S/E')}</div>
                    </div>
                </div>`).join('')
            : '<div class="end-box-clean margin-t-5">Sem movimentos registrados.</div>';

        res.innerHTML = `
            <div class="op-card margin-t-15">
                <b class="mono font-18">${esc(p.id)}</b>
                <div class="label margin-t-5">${esc(p.desc)}</div>
                <div class="label margin-t-15 txt-primary">ESTOQUE ATUAL</div>
                ${p.depositos.map(d => `<div class="end-box-clean mono micro-txt margin-t-5"><span>${esc(d.tipo)} | <b>${esc(d.pos)}</b></span><b>${esc(String(d.q))} un</b></div>`).join('')}
                <div class="label margin-t-15 txt-success">HISTÓRICO DE FLUXO</div>
                ${histHTML}
            </div>`;
    },

    addFila() {
        const s = document.getElementById('sk-in')?.value.trim();
        const q = safeFloat(document.getElementById('qt-in')?.value);
        const p = APP.db.produtos.find(x => x.id === s);
        if (!p) { APP.ui.toast('SKU não encontrado no estoque.', 'danger'); return; }
        if (q <= 0) { APP.ui.toast('Informe uma quantidade válida.', 'danger'); return; }
        APP.db.fila.push({ ...p, qtdSolicitada: q });
        APP._saveFilaToSession();
        APP.ui.toast(`${s} adicionado à fila.`, 'success');
        APP.view('operacional');
    },

    remFila(i) {
        APP.db.fila.splice(i, 1);
        APP._saveFilaToSession();
        APP.view('operacional');
    },

    // [FIX] Modal customizado
    limparFila() {
        showConfirm('Deseja limpar toda a fila de rotas?', () => {
            APP.db.fila = [];
            APP._saveFilaToSession();
            APP.view('operacional');
            APP.ui.toast('Fila limpa.', 'info');
        });
    },

    // [NEW] Exportar fila como texto para clipboard
    exportarFila() {
        if (APP.db.fila.length === 0) { APP.ui.toast('Fila vazia.', 'danger'); return; }
        const linhas = APP.db.fila.map((t, i) =>
            `${i+1}. SKU ${t.id} — ${t.desc.substring(0,30)} | QTD: ${t.qtdSolicitada}un`
        );
        const texto = `FILA K11 OMNI — ${new Date().toLocaleString('pt-BR')}\n${'─'.repeat(50)}\n${linhas.join('\n')}`;
        navigator.clipboard?.writeText(texto).then(() => {
            APP.ui.toast('Fila copiada para clipboard!', 'success');
        }).catch(() => {
            APP.ui.toast('Erro ao copiar. Navegador não suporta.', 'danger');
        });
    },

    toggleTask(id) {
        const t = APP.db.tarefas.find(x => x.id === id);
        if (t) { t.done = !t.done; APP.view('detalheTarefas'); }
    },

    toggleSkuMatrix() { APP.ui.skuMatrixAberta = !APP.ui.skuMatrixAberta; APP.view('dash'); },
    setSkuTab(tab)    { APP.ui.skuTab = tab; APP.view('dash'); },

    // [FIX] _acoesState garantido com ??=
    toggleAcao(i) {
        APP.ui._acoesState ??= [];
        const acoes = APP._gerarAcoesPrioritarias();
        const acao  = acoes[i];
        if (!acao) return;
        const idx = APP.ui._acoesState.indexOf(acao.id);
        if (idx === -1) APP.ui._acoesState.push(acao.id);
        else            APP.ui._acoesState.splice(idx, 1);
        APP.view('acoesPrioritarias');
    },

    toggleRanking() { APP.ui.rankingAberto = !APP.ui.rankingAberto; APP.view('dash'); },

    mudarAlvo(l) {
        APP.ui.pdvAlvo = l;
        APP.processarDueloAqua();
        APP.view('projetor');
    },

    setFiltroEstoque(f) { APP.ui.filtroEstoque = f; APP.view('estoque'); },

    // [NEW] Busca no estoque com debounce
    filtrarEstoque: debounce((v) => { APP.ui.buscaEstoque = v; APP.view('estoque'); }, DEBOUNCE_DELAY_MS),
    filtrarDuelo:   debounce((v) => { APP.ui.buscaDuelo   = v; APP.view('projetor'); }, DEBOUNCE_DELAY_MS),

    preencher(id) {
        APP.view('operacional');
        setTimeout(() => {
            const input = document.getElementById('sk-in');
            if (input) { input.value = id; document.getElementById('qt-in')?.focus(); }
        }, 150);
    },

    // [FIX] _chartTooltip ÚNICO — versão completa com diff vs HIDRA
    _chartTooltip(label, val, event) {
        const tip = document.getElementById('chart-tooltip');
        if (!tip) return;
        const hidraVal = APP.rankings.benchmarking.hidraulica;
        const diff = label === 'HIDRÁULICA' ? null : val - hidraVal;
        const diffStr = diff !== null
            ? (diff > 0 ? `<span style="color:#EF4444">+${diff}% vs HIDRA</span>` : `<span style="color:#10B981">${diff}% vs HIDRA</span>`)
            : '<span style="color:var(--primary)">referência da hidráulica</span>';
        tip.innerHTML = `<b>${esc(label)}</b> · ${val}%<br>${diffStr}`;
        tip.style.display = 'block';
        clearTimeout(tip._closeTimer);
        tip._closeTimer = setTimeout(() => { tip.style.display = 'none'; }, 2500);
    },

};
