/**
 * K11 OMNI ELITE — PROCESSADORES DE DADOS
 * ════════════════════════════════════════
 * Transforma os JSONs brutos em estruturas otimizadas para as views.
 * Cada processador popula APP.db e APP.rankings, emitindo eventos via EventBus.
 *
 * Depende de: k11-config.js, k11-utils.js
 */

'use strict';

const Processors = {

    /**
     * Processa produtos.json → APP.db.produtos + APP.rankings.pieStats
     * Classifica cada SKU em: ruptura (red), abastecimento (yellow) ou saudável (green).
     *
     * Regras de tipo de depósito:
     *   CAB* / CHI* → tratados como PKL (piso de venda com nomenclatura diferente)
     *   PKL         → piso de picking
     *   AEL         → aéreo (endereço elevado)
     *   RES         → reserva
     *   LOG         → logística/trânsito
     */
    processarEstoque(data) {
        if (!Array.isArray(data) || data.length === 0) return;
        const mapa = new Map();

        data.forEach(p => {
            const sku = String(p?.['Produto'] ?? p?.['Nº do produto'] ?? '').trim();
            if (!sku) return;

            if (!mapa.has(sku)) {
                mapa.set(sku, { id: sku, desc: p['Descrição produto'] ?? 'N/A', depositos: [], pkl: 0, total: 0, valTotal: 0 });
            }

            const entry   = mapa.get(sku);
            const q       = safeFloat(p['Quantidade']);
            const pos     = String(p['Posição no depósito'] ?? p['Posição'] ?? '').toUpperCase().trim();
            const tipoRaw = String(p['Tipo de depósito']   ?? p['Tipo']    ?? '').toUpperCase().trim();

            // [FIX] CAB e CHI são prefixos de piso de venda — contam como PKL
            const tipo = (pos.startsWith('CAB') || pos.startsWith('CHI')) ? 'PKL' : tipoRaw;

            entry.depositos.push({ pos: p['Posição no depósito'] ?? p['Posição'] ?? 'S/E', tipo, q });
            if (tipo === 'PKL') entry.pkl += q;
            entry.total    += q;
            entry.valTotal += safeFloat(p['Valor total']);
        });

        let valRed = 0, valYellow = 0;
        APP.db.produtos = [...mapa.values()].map(p => {
            if      (p.total <= 0) { p.categoriaCor = 'red';    p.status = 'ruptura';       p.subStatus = 'zero-total';  valRed    += p.valTotal; }
            else if (p.pkl   <= 0) { p.categoriaCor = 'red';    p.status = 'ruptura';       p.subStatus = 'falso-zero';  valRed    += p.valTotal; }
            else if (p.pkl   <= 2) { p.categoriaCor = 'yellow'; p.status = 'abastecimento'; p.subStatus = 'pkl-critico'; valYellow += p.valTotal; }
            else                   { p.categoriaCor = 'green';  p.status = 'saudavel';      p.subStatus = 'ok'; }
            p.scoreCriticidade = p.valTotal * (p.categoriaCor === 'red' ? 3 : p.categoriaCor === 'yellow' ? 1.5 : 0);
            return p;
        });

        APP.rankings.meta.valTotalRed    = valRed;
        APP.rankings.meta.valTotalYellow = valYellow;

        const prods = APP.db.produtos;
        APP.rankings.pieStats = {
            red:    prods.filter(x => x.categoriaCor === 'red').length,
            yellow: prods.filter(x => x.categoriaCor === 'yellow').length,
            green:  prods.filter(x => x.categoriaCor === 'green').length,
            total:  prods.length,
        };

        EventBus.emit('estoque:atualizado');
    },

    /**
     * Processa vendas PDV → duelo hidráulica vs lojas concorrentes.
     * Popula APP.rankings.duelos, benchmarking, topLeverage.
     */
    processarDueloAqua() {
        const KEYWORDS = new Set(['BOMBA', 'PISCINA', 'CLORO', 'FILTRO', 'MOTOBOMBA', 'VALV', 'CHAVE']);

        const mapVendas = (arr) => {
            const m = new Map();
            (Array.isArray(arr) ? arr : []).forEach(v => {
                const id = String(v?.['Nº do produto'] ?? v?.Produto ?? '').trim();
                const q  = safeFloat(v?.['Quantidade vendida']);
                if (id) m.set(id, (m.get(id) ?? 0) + q);
            });
            return m;
        };

        const mapas = {
            minha:       mapVendas(APP.db.pdv),
            alvo:        mapVendas(APP.db.pdvExtra[APP.ui.pdvAlvo] ?? []),
            mesquita:    mapVendas(APP.db.pdvExtra.mesquita),
            jacarepagua: mapVendas(APP.db.pdvExtra.jacarepagua),
            benfica:     mapVendas(APP.db.pdvExtra.benfica),
        };

        const comparativo = [];
        const totalLoja   = { hidraulica: 0, mesquita: 0, jacarepagua: 0, benfica: 0 };

        APP.db.produtos.forEach(p => {
            const desc = p.desc.toUpperCase();
            if (![...KEYWORDS].some(k => desc.includes(k))) return;

            const vMinha = mapas.minha.get(p.id) ?? 0;
            const vAlvo  = mapas.alvo.get(p.id)  ?? 0;

            totalLoja.hidraulica  += vMinha;
            totalLoja.mesquita    += mapas.mesquita.get(p.id)    ?? 0;
            totalLoja.jacarepagua += mapas.jacarepagua.get(p.id) ?? 0;
            totalLoja.benfica     += mapas.benfica.get(p.id)     ?? 0;

            if (vAlvo === 0 && vMinha === 0) return;

            const gapAbsoluto = vAlvo - vMinha;
            const loss = vAlvo > 0 ? Math.max(0, (1 - (vMinha / vAlvo)) * 100) : 0;

            comparativo.push({
                id: p.id, desc: p.desc, vAlvo, vMinha, gapAbsoluto,
                loss: parseFloat(loss.toFixed(1)),
                dominando:   vMinha > vAlvo,
                statusClass: loss >= 30 ? 'status-critico' : 'status-dominio',
            });
        });

        APP.rankings.duelos = comparativo.sort((a, b) => b.gapAbsoluto - a.gapAbsoluto);

        const top10 = APP.rankings.duelos.slice(0, 10);
        APP.rankings.meta.lossGap = (top10.reduce((a, b) => a + b.loss, 0) / (top10.length || 1)).toFixed(1);

        const maxV = Math.max(1, ...Object.values(totalLoja));
        APP.rankings.benchmarking = {
            hidraulica:  Math.round((totalLoja.hidraulica  / maxV) * 100),
            mesquita:    Math.round((totalLoja.mesquita    / maxV) * 100),
            jacarepagua: Math.round((totalLoja.jacarepagua / maxV) * 100),
            benfica:     Math.round((totalLoja.benfica     / maxV) * 100),
            loja: Math.round(((totalLoja.mesquita + totalLoja.jacarepagua + totalLoja.benfica) / 3 / maxV) * 100),
        };

        APP.rankings.topLeverage =
            APP.rankings.duelos.filter(d => d.dominando).sort((a, b) => b.vMinha - a.vMinha)[0]
            ?? { desc: 'N/A', vMinha: 0 };

        EventBus.emit('duelo:atualizado');
    },

    /**
     * Calcula tendência de crescimento/queda por SKU comparando período atual vs anterior.
     * Se pdvAnterior.json não existir, usa valores estimados (modo MOCK).
     */
    processarBI_DualTrend() {
        const temDadosReais = APP.db.pdvAnterior.length > 0;
        if (!temDadosReais) {
            console.info('[K11] Trend em modo ESTIMADO — forneça pdvAnterior.json para dados reais.');
        }

        const agregar = (arr) => {
            const m = new Map();
            (Array.isArray(arr) ? arr : []).forEach(v => {
                const id = String(v?.['Nº do produto'] ?? v?.Produto ?? '').trim();
                const q  = safeFloat(v?.['Quantidade vendida']);
                if (id && q > 0) m.set(id, (m.get(id) ?? 0) + q);
            });
            return m;
        };

        const mapAtual    = agregar(APP.db.pdv);
        const mapAnterior = temDadosReais ? agregar(APP.db.pdvAnterior) : null;
        const todosSKUs   = new Set([...mapAtual.keys(), ...(mapAnterior?.keys() ?? [])]);

        const lista = [...todosSKUs].map(id => {
            const qAtual    = mapAtual.get(id) ?? 0;
            const qAnterior = mapAnterior
                ? (mapAnterior.get(id) ?? 0)
                : qAtual * (0.7 + Math.random() * 0.3);    // estimativa MOCK
            const diff  = qAtual - qAnterior;
            const perc  = qAnterior > 0 ? (diff / qAnterior) * 100 : (qAtual > 0 ? 100 : 0);
            const pInfo = APP.db.produtos.find(x => x.id === id);
            return { id, qAtual, qAnterior, perc: parseFloat(perc.toFixed(1)), desc: pInfo?.desc ?? 'N/A', isMock: !temDadosReais };
        });

        APP.rankings.growth  = [...lista].sort((a, b) => b.perc - a.perc).slice(0, 10);
        APP.rankings.decline = [...lista].sort((a, b) => a.perc - b.perc).slice(0, 10);

        EventBus.emit('bi:atualizado', { temDadosReais });
    },

    /**
     * Identifica gargalos de UC (Unitização e Complementação):
     * SKUs com mercadoria travada em AEL/RES mas PKL crítico (≤5 un).
     * Score = (ael + res) × fator_urgência → ordena por impacto.
     */
    processarUCGlobal_DPA() {
        // Constrói mapa de agendamentos por SKU a partir do fornecedor.json
        const agendMap = new Map();
        (APP.db._rawFornecedor ?? []).forEach(f => {
            if (!f?.FIELD3 || f?.FIELD1 === 'Número Pedido' || f?.FIELD1 === 'Cliente') return;
            const sku = String(f.FIELD3).trim();
            if (!sku) return;

            const nomeRaw    = String(f.FIELD12 ?? '').trim();
            const nome       = nomeRaw.includes(' - ') ? nomeRaw.split(' - ').slice(1).join(' - ') : nomeRaw;
            const nf         = String(f['AGENDAMENTOS POR FORNECEDOR'] ?? '').trim();
            const dataInicio = String(f.FIELD7 ?? '').substring(0, 10);
            const dataFim    = String(f.FIELD8 ?? '').substring(0, 10);

            const prev = agendMap.get(sku);
            if (prev) {
                prev.qtdAgendada   += safeFloat(f.FIELD5);
                prev.qtdConfirmada += safeFloat(f.FIELD6);
                if (!prev.pedidos.includes(String(f.FIELD1))) prev.pedidos.push(String(f.FIELD1));
                if (nf && !prev.nfs.includes(nf)) prev.nfs.push(nf);
            } else {
                agendMap.set(sku, {
                    fornecedor:    nome || 'Não identificado',
                    nfs:           nf ? [nf] : [],
                    pedidos:       [String(f.FIELD1)],
                    qtdAgendada:   safeFloat(f.FIELD5),
                    qtdConfirmada: safeFloat(f.FIELD6),
                    dataInicio, dataFim,
                    idAgendamento: String(f.FIELD9  ?? '').trim(),
                    doca:          String(f.FIELD11 ?? '').trim(),
                });
            }
        });

        const gargalos = [];

        APP.db.produtos.forEach(prod => {
            let pkl = 0, ael = 0, res = 0, log = 0;
            const deposPKL = [], deposAEL = [], deposRES = [], deposLOG = [];

            prod.depositos.forEach(d => {
                const t = (d.tipo ?? '').toUpperCase();
                if      (t === 'PKL') { pkl += d.q; deposPKL.push(d); }
                else if (t === 'AEL') { ael += d.q; deposAEL.push(d); }
                else if (t === 'RES') { res += d.q; deposRES.push(d); }
                else if (t === 'LOG') { log += d.q; deposLOG.push(d); }
            });

            if (!((ael > 0 || res > 0) && pkl <= 5)) return;

            // Classificação de urgência
            let status, corStatus, scoreFator;
            if      (prod.total <= 0)                        { status = 'RUPTURA';         corStatus = 'danger';  scoreFator = 4;   }
            else if (pkl === 0 && ael > 0 && res === 0)      { status = 'AÉREO SEM PKL';   corStatus = 'danger';  scoreFator = 3;   }
            else if (pkl === 0 && res > 0 && ael === 0)      { status = 'RESERVA SEM PKL'; corStatus = 'warning'; scoreFator = 3;   }
            else if (pkl === 0 && ael > 0 && res > 0)        { status = 'AÉREO + RESERVA'; corStatus = 'danger';  scoreFator = 3.5; }
            else if (pkl <= 2)                               { status = 'PKL CRÍTICO';     corStatus = 'danger';  scoreFator = 2;   }
            else                                             { status = 'PKL BAIXO';       corStatus = 'warning'; scoreFator = 1;   }

            const capMax      = getCapacidade(prod.desc);
            const pklPct      = capMax > 0 ? Math.min(Math.round((pkl / capMax) * 100), 100) : 0;
            const scoreGargalo = (ael + res) * scoreFator;

            gargalos.push({
                id: prod.id, desc: prod.desc,
                status, corStatus,
                pkl, ael, res, log,
                deposPKL, deposAEL, deposRES, deposLOG,
                capMax, pklPct,
                valTotal: prod.valTotal,
                scoreGargalo,
                agendamento: agendMap.get(prod.id) ?? null,
            });
        });

        APP.db.ucGlobal = gargalos.sort((a, b) => b.scoreGargalo - a.scoreGargalo);
        EventBus.emit('uc:atualizado');
    },

    /**
     * Gera lista de ações prioritárias combinando gargalos UC, rupturas e gaps de venda.
     * @returns {Array} Lista de até 6 ações com urgência e estado done/pendente
     */
    gerarAcoesPrioritarias() {
        const acoes = [];

        APP.db.ucGlobal.slice(0, 2).forEach(g => {
            acoes.push({
                urgencia: 'alta',
                desc: `Liberar fluxo: ${g.desc.substring(0, 32)}`,
                meta: `${g.id} · ${g.diasParado < 999 ? g.diasParado + 'd parado' : 'S/MOV'} no DPA`,
                val: `${g.qtdDPA} un`,
                id: `dpa-${g.id}`,
            });
        });

        APP.db.produtos
            .filter(p => p.categoriaCor === 'red')
            .sort((a, b) => b.scoreCriticidade - a.scoreCriticidade)
            .slice(0, 2)
            .forEach(p => {
                acoes.push({
                    urgencia: 'alta',
                    desc: `Repor PKL: ${p.desc.substring(0, 32)}`,
                    meta: `${p.id} · ${p.subStatus === 'falso-zero' ? 'FALSO ZERO' : 'ZERADO'}`,
                    val: `R$ ${brl(p.valTotal)}`,
                    id: `rupt-${p.id}`,
                });
            });

        APP.rankings.duelos.slice(0, 2).forEach(d => {
            acoes.push({
                urgencia: 'media',
                desc: `Atacar gap: ${d.desc.substring(0, 30)}`,
                meta: `${d.id} · -${d.gapAbsoluto}un vs ${APP.ui.pdvAlvo.toUpperCase()}`,
                val: `-${d.loss.toFixed(0)}% efic.`,
                id: `gap-${d.id}`,
            });
        });

        APP.rankings.growth.slice(0, 1).forEach(r => {
            acoes.push({
                urgencia: 'baixa',
                desc: `Ampliar exposição: ${r.desc.substring(0, 30)}`,
                meta: `${r.id} · +${r.perc}% crescimento`,
                val: `+${r.perc}%`,
                id: `grow-${r.id}`,
            });
        });

        APP.ui._acoesState ??= [];
        return acoes.slice(0, 6).map(a => ({ ...a, done: APP.ui._acoesState.includes(a.id) }));
    },

    /**
     * Detecta inconsistências: SKUs com venda registrada mas estoque zerado.
     * Resultado salvo em APP.rankings.meta.inconsistentes.
     */
    detectarInconsistencias() {
        const vendasIds = new Set(
            APP.db.pdv
                .map(v => String(v?.['Nº do produto'] ?? v?.Produto ?? '').trim())
                .filter(Boolean)
        );

        APP.rankings.meta.inconsistentes = APP.db.produtos.filter(
            p => p.categoriaCor === 'red' && vendasIds.has(p.id)
        );

        if (APP.rankings.meta.inconsistentes.length > 0) {
            console.warn(
                `[K11] ⚠ ${APP.rankings.meta.inconsistentes.length} SKUs com venda mas estoque zerado:`,
                APP.rankings.meta.inconsistentes.map(p => p.id)
            );
        }
    },
};
