/**
 * K11 OMNI ELITE — APP CORE (Bootstrap & Navegação)
 * ════════════════════════════════════════════════════
 * Singleton principal. Inicializa o sistema, carrega dados e gerencia navegação.
 *
 * Depende de: k11-config.js, k11-utils.js, k11-ui.js,
 *             k11-processors.js, k11-views.js, k11-actions.js
 *
 * Ordem de carregamento no HTML:
 *   1. k11-config.js
 *   2. k11-utils.js
 *   3. k11-ui.js
 *   4. k11-processors.js
 *   5. k11-views.js
 *   6. k11-actions.js
 *   7. k11-app.js     ← este arquivo (deve ser o último)
 */

'use strict';

const APP = {

    // ── ESTADO ──────────────────────────────────────────────────
    db: {
        produtos:      [],
        auditoria:     [],
        fila:          [],
        movimento:     [],
        pdv:           [],
        pdvAnterior:   [],
        pdvExtra:      {},
        tarefas:       [],
        ucGlobal:      [],
        agendamentos:  [],   // todos os agendamentos do fornecedor.json
        fornecedorMap: new Map(),
    },

    rankings: {
        growth:       [],
        decline:      [],
        duelos:       [],
        pieStats:     { red: 0, yellow: 0, green: 0, total: 1 },
        benchmarking: { hidraulica: 0, mesquita: 0, jacarepagua: 0, benfica: 0, loja: 0 },
        topLeverage:  { desc: 'N/A', vMinha: 0 },
        meta: {
            lossGap:        '0.0',
            valTotalRed:     0,
            valTotalYellow:  0,
            inconsistentes:  [],
        },
    },

    ui: {
        rankingAberto:   false,
        filtroEstoque:   'ruptura',
        buscaEstoque:    '',
        pdvAlvo:         'mesquita',
        buscaDuelo:      '',
        skuMatrixAberta: true,
        skuTab:          'drag',
        _acoesState:     [],
        _rafIds:         {},

        toast(msg, type = 'info') {
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
        },
    },

    // ── AUTENTICAÇÃO ─────────────────────────────────────────────
    auth: {
        login() {
            const reEl   = document.getElementById('user-re');
            const passEl = document.getElementById('user-pass');
            const btn    = document.getElementById('btn-login');
            const re     = reEl?.value?.trim();
            const pass   = passEl?.value?.trim();

            if (!re || !pass) {
                document.querySelector('.op-card')?.classList.add('shake-error');
                setTimeout(() => document.querySelector('.op-card')?.classList.remove('shake-error'), 500);
                APP.ui.toast('Preencha RE e PIN.', 'danger');
                return;
            }

            const usuario = USUARIOS_VALIDOS[re];
            if (!usuario || usuario.pin !== pass) {
                [reEl, passEl].forEach(el => {
                    el?.classList.add('shake-error');
                    setTimeout(() => el?.classList.remove('shake-error'), 500);
                });
                APP.ui.toast('RE ou PIN incorreto.', 'danger');
                if (btn) btn.innerHTML = 'AUTENTICAR NO KERNEL';
                return;
            }

            try { sessionStorage.setItem('k11_user', JSON.stringify({ re, nome: usuario.nome, role: usuario.role })); } catch (_) {}

            if (btn) btn.innerHTML = '<div class="spinner-small"></div> AUTENTICANDO...';
            setTimeout(() => {
                document.body.classList.add('fade-out');
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 400);
            }, 600);
        },
    },

    // ── BOOTSTRAP ────────────────────────────────────────────────
    async init() {
        const st    = document.getElementById('engine-status');
        const stage = document.getElementById('stage');

        if (st)    st.innerHTML    = '<div class="spinner-small"></div> CARREGANDO...';
        if (stage) stage.innerHTML = APP.views._skeleton();

        try {
            const t = Date.now();
            const [p, a, m, v, vAnt, tar, vMesq, vJaca, vBenf, forn] = await Promise.all([
                APP._safeFetch(`./produtos.json?t=${t}`),
                APP._safeFetch(`./auditoria.json?t=${t}`),
                APP._safeFetch(`./movimento.json?t=${t}`),
                APP._safeFetch(`./pdv.json?t=${t}`),
                APP._safeFetch(`./pdvAnterior.json?t=${t}`),
                APP._safeFetch(`./tarefas.json?t=${t}`),
                APP._safeFetch(`./pdvmesquita.json?t=${t}`),
                APP._safeFetch(`./pdvjacarepagua.json?t=${t}`),
                APP._safeFetch(`./pdvbenfica.json?t=${t}`),
                APP._safeFetch(`./fornecedor.json?t=${t}`),
            ]);

            // ── Fornecedor raw + maps ──────────────────────────────────
            APP.db._rawFornecedor = Array.isArray(forn) ? forn : [];

            APP.db.fornecedorMap = new Map();
            APP.db._rawFornecedor.forEach(f => {
                if (f?.FIELD1 === 'Número Pedido' || f?.FIELD1 === 'Cliente') return;
                const sku     = String(f?.FIELD3 ?? '').trim();
                const nomeRaw = String(f?.FIELD12 ?? '').trim();
                const nome    = nomeRaw.includes(' - ') ? nomeRaw.split(' - ').slice(1).join(' - ') : nomeRaw;
                if (sku) APP.db.fornecedorMap.set(sku, nome || 'Fornecedor Indefinido');
            });

            // ── Agendamentos brutos (enriquecidos após processarEstoque) ─
            const _agMap = new Map();
            APP.db._rawFornecedor.forEach(f => {
                if (f?.FIELD1 === 'Número Pedido' || f?.FIELD1 === 'Cliente') return;
                const sku = String(f?.FIELD3 ?? '').trim();
                if (!sku) return;
                const nomeRaw = String(f?.FIELD12 ?? '').trim();
                const nome    = nomeRaw.includes(' - ') ? nomeRaw.split(' - ').slice(1).join(' - ') : nomeRaw;
                const nf      = String(f['AGENDAMENTOS POR FORNECEDOR'] ?? '').trim();
                const prev    = _agMap.get(sku);
                if (prev) {
                    prev.qtdAgendada   += safeFloat(f.FIELD5);
                    prev.qtdConfirmada += safeFloat(f.FIELD6);
                    if (!prev.pedidos.includes(String(f.FIELD1))) prev.pedidos.push(String(f.FIELD1));
                    if (nf && !prev.nfs.includes(nf)) prev.nfs.push(nf);
                } else {
                    _agMap.set(sku, {
                        sku,
                        descForn:      String(f?.FIELD4 ?? '').trim(),
                        fornecedor:    nome || 'Não identificado',
                        nfs:           nf ? [nf] : [],
                        pedidos:       [String(f.FIELD1)],
                        qtdAgendada:   safeFloat(f.FIELD5),
                        qtdConfirmada: safeFloat(f.FIELD6),
                        dataInicio:    String(f.FIELD7 ?? '').substring(0, 10),
                        dataFim:       String(f.FIELD8 ?? '').substring(0, 10),
                        idAgendamento: String(f.FIELD9  ?? '').trim(),
                        doca:          String(f.FIELD11 ?? '').trim(),
                    });
                }
            });
            APP.db._agMapRaw = _agMap;

            // ── Outros dados ──────────────────────────────────────────
            APP.db.auditoria = (Array.isArray(a) ? a : []).map((item, idx) => ({
                id: `uc-${idx}`,
                fornecedor: item?.cod_comprador ?? 'N/A',
                desc:       item?.descricao    ?? 'N/A',
                done: false,
            }));

            APP.db.movimento   = Array.isArray(m)   ? m   : Object.values(m ?? {});
            APP.db.pdv         = Array.isArray(v)   ? v   : [];
            APP.db.pdvAnterior = Array.isArray(vAnt) ? vAnt : [];
            APP.db.pdvExtra    = { mesquita: vMesq ?? [], jacarepagua: vJaca ?? [], benfica: vBenf ?? [] };
            APP.db.tarefas     = (Array.isArray(tar) ? tar : []).map((tk, i) => ({
                ...tk, id: i, done: false,
                task: tk?.task ?? tk?.['Tarefa'] ?? 'Tarefa s/ descrição',
            }));

            APP._restoreFilaFromSession();

            // ── Processamento ──────────────────────────────────────────
            APP.processarEstoque(p);

            // Enriquecer agendamentos com dados de estoque (após processarEstoque)
            APP.db.agendamentos = [...(APP.db._agMapRaw ?? new Map()).values()].map(ag => {
                const prod = APP.db.produtos.find(p => p.id === ag.sku);
                return {
                    ...ag,
                    desc:   prod?.desc          ?? ag.descForn ?? 'N/A',
                    pkl:    prod?.pkl            ?? null,
                    total:  prod?.total          ?? null,
                    status: prod?.categoriaCor   ?? 'sem-estoque',
                };
            }).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));

            APP.processarDueloAqua();
            APP.processarBI_DualTrend();
            APP.processarUCGlobal_DPA();
            APP._detectarInconsistencias();

            // ── Online ─────────────────────────────────────────────────
            if (st) { st.innerText = '● K11 OMNI ONLINE'; st.classList.add('status-online'); }

            APP._setupPullToRefresh();
            APP._setupSwipeFila();
            APP.view('dash', document.querySelector('.nav-btn'));
            APP._updateNavBadges();
            // Avisa se os JSONs não carregaram (ambiente sem servidor)
            if (APP._warnNoServer) APP._showNoServerWarning();

        } catch (e) {
            if (st) st.innerText = '⚠ ERRO DE CARREGAMENTO';
            console.error('[K11 init]', e);
            APP.ui.toast('Falha ao carregar dados. Tente novamente.', 'danger');
        }
    },

    // ── FETCH COM RETRY ───────────────────────────────────────────
    async _safeFetch(url, retries = FETCH_RETRY) {
        const controller = new AbortController();
        const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const r = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.json();
        } catch (e) {
            clearTimeout(timer);
            if (retries > 0) {
                await new Promise(res => setTimeout(res, 400));
                return APP._safeFetch(url, retries - 1);
            }
            // Detecta ambiente sem servidor HTTP (Spck Studio, file://, etc.)
            const isFileProtocol = location.protocol === 'file:';
            const isDataUrl      = location.href.startsWith('data:');
            const isSpck         = navigator.userAgent.includes('Spck') || location.hostname === '';
            if (isFileProtocol || isDataUrl || isSpck) {
                APP._warnNoServer = true;
            }
            console.warn(`[K11 fetch] Falhou: ${url}`, e?.message || e);
            return [];
        }
    },

    // ── AVISO DE AMBIENTE SEM SERVIDOR ───────────────────────────
    _showNoServerWarning() {
        const st = document.getElementById('engine-status');
        if (st) {
            st.innerHTML = '⚠ MODO DEMO — sem dados';
            st.style.color = 'var(--warning, #eab308)';
        }
        const stage = document.getElementById('stage');
        if (stage && APP.db.produtos.length === 0) {
            stage.innerHTML = `
                <div style="padding:30px 20px;text-align:center">
                    <div style="font-size:32px;margin-bottom:16px">⚠️</div>
                    <div style="font-family:monospace;font-size:13px;font-weight:800;
                                color:#eab308;letter-spacing:2px;margin-bottom:12px">
                        ARQUIVOS JSON NÃO ENCONTRADOS
                    </div>
                    <div style="font-size:12px;color:#64748b;line-height:1.7;max-width:340px;margin:0 auto">
                        O sistema precisa de um servidor HTTP para carregar os dados.<br><br>
                        <b style="color:#e2e8f0">No Spck Studio:</b><br>
                        Vá em <b style="color:#ff8c00">⚙ Settings → Preview → Use built-in server</b>
                        e adicione seus arquivos JSON no projeto.<br><br>
                        <b style="color:#e2e8f0">No computador:</b><br>
                        Rode <code style="background:rgba(255,255,255,.07);padding:2px 6px;border-radius:4px">
                        python3 -m http.server 7700</code><br>
                        e acesse <code style="background:rgba(255,255,255,.07);padding:2px 6px;border-radius:4px">
                        localhost:7700</code>
                    </div>
                    <div style="margin-top:24px;padding:12px 16px;background:rgba(255,140,0,.07);
                                border:1px solid rgba(255,140,0,.2);border-radius:10px;
                                font-size:11px;color:#94a3b8;line-height:1.6">
                        O assistente de voz funciona sem dados,<br>
                        mas só poderá responder com base nos KPIs (todos zerados).
                    </div>
                </div>`;
        }
    },

    // ── DELEGAÇÃO PARA MÓDULOS EXTERNOS ──────────────────────────
    // Estes métodos delegam para os módulos separados para manter
    // compatibilidade com chamadas existentes no HTML e nos templates.

    getCapacidade: (desc) => getCapacidade(desc),

    processarEstoque(data)      { Processors.processarEstoque(data);       },
    processarDueloAqua()        { Processors.processarDueloAqua();         },
    processarBI_DualTrend()     { Processors.processarBI_DualTrend();      },
    processarUCGlobal_DPA()     { Processors.processarUCGlobal_DPA();      },
    _gerarAcoesPrioritarias()   { return Processors.gerarAcoesPrioritarias(); },
    _detectarInconsistencias()  { Processors.detectarInconsistencias();    },

    views:   Views,
    actions: Actions,

    // ── NAVEGAÇÃO ─────────────────────────────────────────────────
    view(v, param) {
        const NAV_VIEWS = ['dash', 'estoque', 'operacional', 'projetor', 'rastreio', 'recebimento'];

        if (param?.classList) {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            param.classList.add('active');
        }

        const stage = document.getElementById('stage');
        if (!stage || !APP.views[v]) return;

        const arg = typeof param === 'string' ? param : undefined;
        stage.innerHTML = APP.views[v](arg);
        window.scrollTo({ top: 0, behavior: 'instant' });

        if (v === 'operacional') setTimeout(() => APP._setupSwipeFila(), 50);
    },

    // ── HELPERS DE UI ─────────────────────────────────────────────
    _updateNavBadges() {
        const rupturas = APP.db.produtos.filter(p => p.categoriaCor === 'red').length;
        const gargalos = APP.db.ucGlobal.length;
        document.querySelectorAll('[data-badge="rupturas"]').forEach(el => { el.dataset.count = rupturas > 0 ? rupturas : ''; });
        document.querySelectorAll('[data-badge="gargalos"]').forEach(el => { el.dataset.count = gargalos > 0 ? gargalos : ''; });
    },

    _setupPullToRefresh() {
        let startY = 0;
        document.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
        document.addEventListener('touchend',   e => {
            const delta = e.changedTouches[0].clientY - startY;
            if (delta > 70 && window.scrollY === 0) {
                APP.ui.toast('Atualizando dados...', 'info');
                setTimeout(() => APP.init(), 500);
            }
        }, { passive: true });
    },

    _setupSwipeFila() {
        document.querySelectorAll('.swipe-item').forEach(el => {
            const idx = parseInt(el.dataset.filaIdx, 10);
            let startX = 0, isDragging = false;

            el.addEventListener('touchstart', e => {
                startX = e.touches[0].clientX;
                isDragging = true;
                el.style.transition = 'none';
            }, { passive: true });

            el.addEventListener('touchmove', e => {
                if (!isDragging) return;
                const dx = e.touches[0].clientX - startX;
                if (dx < 0) el.style.transform = `translateX(${dx}px)`;
            }, { passive: true });

            el.addEventListener('touchend', e => {
                if (!isDragging) return;
                isDragging = false;
                const dx = e.changedTouches[0].clientX - startX;
                el.style.transition = 'transform 0.3s, opacity 0.3s';
                if (dx < -80) {
                    el.style.transform = 'translateX(-110%)';
                    el.style.opacity   = '0';
                    setTimeout(() => APP.actions.remFila(idx), 310);
                } else {
                    el.style.transform = 'translateX(0)';
                }
            }, { passive: true });
        });
    },

    _saveFilaToSession()    { try { sessionStorage.setItem('k11_fila', JSON.stringify(APP.db.fila)); } catch (_) {} },
    _restoreFilaFromSession() {
        try {
            const raw = sessionStorage.getItem('k11_fila');
            if (raw) APP.db.fila = JSON.parse(raw);
        } catch (_) { APP.db.fila = []; }
    },
};

// ─── EXPOSIÇÃO GLOBAL ─────────────────────────────────────────
// Necessário para que K11Voice (e outros módulos) acessem
// window.APP.db, window.APP.rankings, etc.
window.APP = APP;

// ─── ENTRY POINT ──────────────────────────────────────────────
window.addEventListener('load', () => {
    if (document.getElementById('engine-status')) APP.init();
});
