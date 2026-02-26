/**
 * K11 OMNI ELITE — BRAIN AUXILIAR v2.0
 * ══════════════════════════════════════════════════════════════════
 * Camada 1 do pipeline de resolução do K11Voice.
 *
 * Esta versão corrige os bugs críticos da v1.0:
 *   ✗ escu() → esc() (função inexistente)
 *   ✗ Integração fantasma via EventBus.on('voice:query') que nunca disparava
 *   ✗ resolve() retornava null em intents válidos por bugs de pattern matching
 *   ✗ _buildGeminiContext() duplicado entre Brain e Voice
 *
 * Agora o K11Voice chama diretamente K11Brain.resolve(q) no início de
 * _processQuery() — integração real, sem intermediários.
 *
 * Responsabilidades:
 *   ① Intents de cruzamento de dados (estoque × vendas × UC × agendamentos)
 *   ② Contexto multi-turno (lastSku, pronomes, "mais detalhes")
 *   ③ Insights automáticos do turno
 *   ④ Watch list com alertas automáticos
 *   ⑤ Registro externo de intents (extensível)
 *
 * Depende de: k11-config.js, k11-utils.js
 * Inserir ANTES de k11-voice-assistant.js no dashboard.html
 */

'use strict';

const K11Brain = (() => {

    // ══════════════════════════════════════════════════════════
    // ESTADO DE SESSÃO
    // ══════════════════════════════════════════════════════════
    const _ctx = {
        history:      [],         // [{role, text, ts}]
        lastSku:      null,       // último SKU mencionado
        lastIntent:   null,       // última intent resolvida
        lastPdv:      null,       // último PDV mencionado
        watchList:    new Set(),  // SKUs monitorados
        insightCache: null,
        insightTs:    0,
    };

    const MAX_HISTORY = 40;

    function _pushHistory(role, text) {
        _ctx.history.push({ role, text, ts: Date.now() });
        if (_ctx.history.length > MAX_HISTORY) _ctx.history.shift();
    }

    // ══════════════════════════════════════════════════════════
    // ATALHOS SEGUROS AO APP.db
    // ══════════════════════════════════════════════════════════
    const $db    = () => window.APP?.db       ?? {};
    const $rank  = () => window.APP?.rankings ?? {};
    const $prods = () => $db().produtos       ?? [];
    const $ags   = () => $db().agendamentos   ?? [];
    const $mov   = () => $db().movimento      ?? [];
    const $fila  = () => $db().fila           ?? [];
    const $uc    = () => $db().ucGlobal       ?? [];
    const $pdv   = () => $db().pdv            ?? [];
    const $tar   = () => $db().tarefas        ?? [];

    function $prod(sku) {
        return $prods().find(p => String(p.id) === String(sku)) ?? null;
    }

    function $ok() { return $prods().length > 0; }

    // ══════════════════════════════════════════════════════════
    // UTILITÁRIOS
    // ══════════════════════════════════════════════════════════
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const brl = v => Number(v ?? 0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    const nrm = s => String(s ?? '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();

    function safeFloat(v) {
        if (typeof v === 'number') return v;
        return parseFloat(String(v ?? '0').replace(',','.')) || 0;
    }

    function extractSku(q) {
        const m = String(q ?? '').match(/\b(\d{6,10})\b/);
        return m ? m[1] : null;
    }

    // ── BUSCA POR DESCRIÇÃO DE TEXTO ──────────────────────────
    function _searchByDesc(query, maxResults) {
        maxResults = maxResults || 5;
        if (!$ok()) return [];
        const stopwords = new Set(['de','da','do','em','um','na','no','as','os','ou','a','o','e','com','sem','para','pra','que','so','mm','cm','m','un','x','lr','sn','pvc','af','dn']);
        const tokens = nrm(query)
            .split(' ')
            .filter(function(t){ return t.length >= 2 && !/^\d+$/.test(t) && !stopwords.has(t); });

        if (!tokens.length) return [];

        const prods = $prods();
        const scored = [];
        for (let i = 0; i < prods.length; i++) {
            const p = prods[i];
            const descN = nrm(p.desc || '');
            let score = 0, matched = 0;
            for (let j = 0; j < tokens.length; j++) {
                const t = tokens[j];
                if (descN.indexOf(t) !== -1) {
                    matched++;
                    score += t.length >= 6 ? 4 : t.length >= 5 ? 3 : t.length >= 4 ? 2 : 1;
                    // bônus match de palavra inteira
                    const re = new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b');
                    if (re.test(descN)) score += 2;
                }
            }
            const minMatch = Math.max(1, Math.ceil(tokens.length * 0.45));
            if (matched >= minMatch) scored.push({ p: p, score: score, matched: matched });
        }

        return scored
            .sort(function(a,b){ return b.score - a.score || b.matched - a.matched; })
            .slice(0, maxResults)
            .map(function(x){ return x.p; });
    }

    // Detecta se a query parece ser um nome/descrição de produto
    function _isDescSearch(q, n) {
        if (/\b\d{6,10}\b/.test(q)) return false; // tem SKU numérico
        const stopwords = new Set(['de','da','do','em','um','na','no','as','os','ou','a','o','e','com','sem','para','pra','que','so']);
        const words = n.split(' ').filter(function(w){ return w.length >= 3 && !/^\d+$/.test(w) && !stopwords.has(w); });
        return words.length >= 2;
    }

    // Formata resultado de busca por descrição
    function _rBuscaDesc(resultados, queryOriginal) {
        if (!resultados.length)
            return '🔍 Nenhum produto encontrado para <b>"' + esc(queryOriginal) + '"</b>.<br>Tente com menos palavras ou use o SKU numérico.';
        if (resultados.length === 1)
            return _rSkuCompleto(String(resultados[0].id));

        const linhas = resultados.map(function(p) {
            const ico = p.categoriaCor === 'red' ? '🔴' : p.categoriaCor === 'yellow' ? '🟡' : '🟢';
            const vendas = $pdv().filter(function(v){ return String(v['Nº do produto']||'').trim() === String(p.id); });
            const totalVenda = vendas.reduce(function(s,v){ return s + safeFloat(v['Quantidade vendida']); }, 0);
            return ico + ' <b>' + esc(p.id) + '</b> — ' + esc(p.desc.substring(0,40)) +
                '<br>&nbsp;&nbsp;PKL:' + p.pkl + 'un | Total:' + p.total + 'un' +
                (totalVenda ? ' | Venda PDV:' + totalVenda + 'un' : '') +
                ' | R$' + brl(p.valTotal);
        });
        return '🔍 <b>' + resultados.length + ' produto(s)</b> encontrado(s) para <b>"' + esc(queryOriginal) + '"</b>:<br>' + linhas.join('<br>');
    }

    // Separa query de comparação em dois fragmentos de descrição
    // Suporta: "X vs Y", "X com Y", "X e Y", "X versus Y", "comparar X com Y"
    function _splitComparDesc(q) {
        // Remove verbo de comparação do início
        const clean = q.replace(/^(quero\s+)?(comparar?|compara|compare)\s+/i,'').trim();
        // Tenta separar por separadores conhecidos (ordem de prioridade)
        const seps = [' vs ', ' versus ', ' com ', ' e ', ' / '];
        for (let i = 0; i < seps.length; i++) {
            const sep = seps[i];
            const idx = clean.toLowerCase().indexOf(sep);
            if (idx > 3 && idx < clean.length - 3) {
                const d1 = clean.substring(0, idx).replace(/^(o|a|os|as)\s+/i,'').trim();
                const d2 = clean.substring(idx + sep.length).replace(/^(o|a|os|as)\s+/i,'').trim();
                if (d1.length >= 3 && d2.length >= 3) return [d1, d2];
            }
        }
        return null;
    }

    function _loading()     { return '⏳ Dados ainda carregando. Tente em instantes.'; }
    function _skuNeeded()   { return 'Informe o SKU numérico ou consulte um produto primeiro.'; }

    // ══════════════════════════════════════════════════════════
    // REGISTRO DE INTENTS — EXTENSÍVEL
    // ══════════════════════════════════════════════════════════
    const _intents = [];

    function registerIntent(tag, patterns, handler) {
        _intents.push({
            tag,
            patterns: patterns.map(p => typeof p === 'string' ? new RegExp(p,'i') : p),
            handler,
        });
    }

    // ══════════════════════════════════════════════════════════
    // INTENTS NATIVOS
    // ══════════════════════════════════════════════════════════

    // ─── PRONOMES / CONTEXTO DO ÚLTIMO SKU ────────────────────
    registerIntent('ctx_sku', [
        /^(ele|ela|esse|esse sku|o mesmo|aquele|desse produto|esse produto|o produto|dele)\b/i
    ], (q, n) => {
        if (!_ctx.lastSku) return _skuNeeded();
        return _rSkuCompleto(_ctx.lastSku);
    });

    // ─── COMPARAR DOIS SKUs ────────────────────────────────────
    registerIntent('comparar', [
        /compar|diferenca entre|vs\b|versus/i
    ], (q, n) => {
        const matches = [...q.matchAll(/\b(\d{6,10})\b/g)];
        if (matches.length < 2) {
            const sku1 = extractSku(q) || _ctx.lastSku;
            if (!sku1) return 'Informe dois SKUs para comparar. Ex: <b>comparar 1234567 7654321</b>';
            return 'Preciso do segundo SKU para comparar. Qual é o código?';
        }
        const [sku1, sku2] = [matches[0][1], matches[1][1]];
        _ctx.lastSku = sku1;
        return _rCompararSkus(sku1, sku2);
    });

    // ─── ANÁLISE COMPLETA DE SKU ───────────────────────────────
    registerIntent('sku_completo', [
        /analise|analisa|detalhe|full|completo|tudo sobre|me fala (do|sobre)|me conta sobre/i
    ], (q, n) => {
        const sku = extractSku(q) || _ctx.lastSku;
        if (!sku) return _skuNeeded();
        _ctx.lastSku = sku;
        return _rSkuCompleto(sku);
    });

    // ─── ONDE ESTÁ (endereçamento físico) ─────────────────────
    registerIntent('onde_esta', [
        /onde esta|endereco|posicao de|localizacao|onde fica|onde acho|aonde fica/i
    ], (q, n) => {
        const sku = extractSku(q) || _ctx.lastSku;
        if (!sku) return _skuNeeded();
        _ctx.lastSku = sku;
        const p = $prod(sku);
        if (!p) return `SKU <b>${esc(sku)}</b> não encontrado.`;
        const deps = p.depositos ?? [];
        if (!deps.length) return `SKU <b>${esc(sku)}</b> sem posições cadastradas.`;
        const grupos = {};
        deps.forEach(d => { (grupos[d.tipo] = grupos[d.tipo] || []).push(`${esc(d.pos)}(${d.q}un)`); });
        const html = Object.entries(grupos).map(([t,v]) => `<b>${t}:</b> ${v.join(', ')}`).join('<br>');
        return `📍 Posições de <b>${esc(sku)}</b> — ${esc(p.desc.substring(0,35))}:<br>${html}`;
    });

    // ─── HISTÓRICO DE MOVIMENTOS ───────────────────────────────
    registerIntent('historico_mov', [
        /historico|movimentos?|transferencia|transferiu|onde foi|movimentou|movimentacao/i
    ], (q, n) => {
        const sku = extractSku(q) || _ctx.lastSku;
        if (!sku) return _skuNeeded();
        _ctx.lastSku = sku;
        const movs = $mov().filter(m => String(m?.['Produto'] ?? '').trim() === sku);
        if (!movs.length) return `Sem movimentos registrados para SKU <b>${esc(sku)}</b>.`;
        const top = movs.slice(-5).reverse().map(m => {
            const de   = m['PD origem']  ?? 'N/I';
            const para = m['PD destino'] ?? 'N/I';
            const data = m['Data da confirmação'] ?? m['Data de criação'] ?? 'S/D';
            const qtd  = m['Qtd.prev.orig.UMA'] ?? '?';
            return `🔄 <b>${esc(de)}</b>→<b>${esc(para)}</b> · ${esc(data)} · ${esc(String(qtd))}un`;
        }).join('<br>');
        return `🔄 Últimos movimentos — SKU <b>${esc(sku)}</b>:<br>${top}`;
    });

    // ─── AGENDAMENTO DE SKU ESPECÍFICO ────────────────────────
    registerIntent('sku_agendamento', [
        /vai chegar|tem agendamento|quando chega|previsao de chegada|entrega prevista/i
    ], (q, n) => {
        const sku = extractSku(q) || _ctx.lastSku;
        if (!sku) return _skuNeeded();
        _ctx.lastSku = sku;
        const ag = $ags().find(a => String(a.sku) === sku);
        if (!ag) return `Sem agendamento ativo para SKU <b>${esc(sku)}</b>.`;
        return `📦 SKU <b>${esc(sku)}</b> tem entrega prevista:<br><b>${esc(ag.fornecedor)}</b> · ${ag.qtdAgendada}un · ${esc(ag.dataInicio)} · Doca: ${esc(ag.doca||'N/I')}`;
    });

    // ─── RUPTURAS SEM AGENDAMENTO (cruzamento) ────────────────
    registerIntent('ruptura_sem_ag', [
        /ruptura.*sem.*agendamento|ruptura.*sem.*previsao|sem.*cobertura|descoberto|ruptura.*nao.*tem/i,
        /sku.*sem.*previsao|zerado.*sem.*entrega/i
    ], (q, n) => {
        if (!$ok()) return _loading();
        const rups   = $prods().filter(p => p.categoriaCor === 'red');
        const skusAg = new Set($ags().map(a => String(a.sku)));
        const semCob = rups.filter(p => !skusAg.has(String(p.id)))
            .sort((a,b) => b.scoreCriticidade - a.scoreCriticidade);
        if (!semCob.length) return '✅ Todas as rupturas possuem agendamento de cobertura.';
        const top = semCob.slice(0,6).map(p =>
            `🔴 <b>${esc(p.id)}</b> — ${esc(p.desc.substring(0,35))} · R$${brl(p.valTotal)}`
        ).join('<br>');
        return `⚠️ <b>${semCob.length}</b> SKU(s) em ruptura SEM agendamento:<br>${top}${semCob.length > 6 ? `<br>...e mais ${semCob.length-6}.` : ''}`;
    });

    // ─── AGENDAMENTOS QUE COBREM RUPTURAS ─────────────────────
    registerIntent('ag_cobre_ruptura', [
        /agendamento.*ruptura|ruptura.*agendamento|vai receber.*ruptura|chegada.*zerado|entrega.*ruptura/i
    ], (q, n) => {
        if (!$ok()) return _loading();
        const rupsSet = new Set($prods().filter(p => p.categoriaCor === 'red').map(p => String(p.id)));
        const agRups  = $ags().filter(a => rupsSet.has(String(a.sku)));
        if (!agRups.length) return '📋 Nenhum agendamento para SKUs em ruptura.';
        const top = agRups.slice(0,6).map(a =>
            `📦 <b>${esc(a.sku)}</b> — ${esc((a.desc||a.fornecedor).substring(0,28))} · ${a.qtdAgendada}un · ${esc(a.dataInicio)}`
        ).join('<br>');
        return `📦 <b>${agRups.length}</b> agendamento(s) cobrindo rupturas ativas:<br>${top}`;
    });

    // ─── VENDENDO MAS SEM ESTOQUE (inconsistência) ────────────
    registerIntent('vende_sem_estoque', [
        /inconsiste|vende.*zero|vende.*ruptura|vendendo.*sem.*estoque|saindo.*mas.*zerado|vendeu.*zerou/i
    ], (q, n) => {
        if (!$ok()) return _loading();
        const inc = $rank().meta?.inconsistentes ?? [];
        // Calcula on-the-fly se não estiver no cache
        const vendaMap = new Map();
        $pdv().forEach(v => {
            const id  = String(v?.['Nº do produto'] ?? '').trim();
            const qtd = safeFloat(v?.['Quantidade vendida']);
            if (id && qtd > 0) vendaMap.set(id, (vendaMap.get(id) ?? 0) + qtd);
        });
        const live = inc.length > 0
            ? inc
            : $prods().filter(p => p.categoriaCor === 'red' && vendaMap.has(String(p.id)));
        if (!live.length) return '✅ Nenhum SKU em ruptura com venda ativa.';
        const top = live.slice(0,5).map(p =>
            `<b>${esc(p.id)}</b> — ${esc((p.desc||'').substring(0,33))} · Venda:${vendaMap.get(String(p.id))??'?'}un · Estoque:0un`
        ).join('<br>');
        return `⚠️ <b>${live.length}</b> SKU(s) vendendo ativamente em ruptura (perda real):<br>${top}`;
    });

    // ─── IMPACTO FINANCEIRO ────────────────────────────────────
    registerIntent('impacto_financeiro', [
        /impacto financeiro|quanto.*perdendo|valor.*ruptura|custo.*ruptura|perda.*estoque|prejuizo/i
    ], (q, n) => {
        if (!$ok()) return _loading();
        const meta  = $rank().meta ?? {};
        const total = $prods().reduce((s,p) => s + (p.valTotal ?? 0), 0);
        const rVal  = meta.valTotalRed    ?? 0;
        const yVal  = meta.valTotalYellow ?? 0;
        const pct   = total > 0 ? ((rVal / total) * 100).toFixed(1) : '0';
        const top   = $prods()
            .filter(p => p.categoriaCor === 'red' && p.valTotal > 0)
            .sort((a,b) => b.valTotal - a.valTotal).slice(0,5)
            .map(p => `<b>${esc(p.id)}</b> — ${esc(p.desc.substring(0,30))} · R$${brl(p.valTotal)}`)
            .join('<br>');
        return `💰 Impacto financeiro de ruptura:<br>🔴 Em ruptura: R$<b>${brl(rVal)}</b> (<b>${pct}%</b> do inventário)<br>🟡 Em abastec. crítico: R$<b>${brl(yVal)}</b><br><br>Top por valor:<br>${top}`;
    });

    // ─── GARGALO × RUPTURA SIMULTÂNEOS ────────────────────────
    registerIntent('gargalo_ruptura', [
        /gargalo.*ruptura|ruptura.*gargalo|uc.*critico|ael.*ruptura|reserva.*ruptura|preso.*aéreo/i
    ], (q, n) => {
        if (!$ok()) return _loading();
        const rupsSet = new Set($prods().filter(p => p.categoriaCor === 'red').map(p => String(p.id)));
        const gargRups = $uc().filter(g => rupsSet.has(String(g.id)));
        if (!gargRups.length) return '✅ Nenhum gargalo UC coincide com rupturas.';
        const top = gargRups.slice(0,5).map(g => {
            const p = $prod(String(g.id));
            return `🔴 <b>${esc(g.id)}</b> — ${esc((p?.desc ?? g.desc ?? '').substring(0,30))} · AEL:${g.ael}un RES:${g.res}un PKL:${g.pkl}un · <b>${esc(g.status)}</b>`;
        }).join('<br>');
        return `⚠️ <b>${gargRups.length}</b> SKU(s) em RUPTURA e com GARGALO UC simultaneamente:<br>${top}`;
    });

    // ─── PRÓXIMOS A ENTRAR EM RUPTURA ─────────────────────────
    registerIntent('proximo_ruptura', [
        /proximo.*ruptura|vai.*zerar|quase.*zerado|baixo.*critico|ponto.*critico|iminente|prestes.*ruptura/i
    ], (q, n) => {
        if (!$ok()) return _loading();
        const em_risco = $prods()
            .filter(p => p.categoriaCor !== 'red' && p.pkl >= 1 && p.pkl <= 5)
            .sort((a,b) => a.pkl - b.pkl).slice(0,6);
        if (!em_risco.length) return '✅ Nenhum produto com PKL em risco iminente de ruptura.';
        const top = em_risco.map(p =>
            `🟡 <b>${esc(p.id)}</b> — ${esc(p.desc.substring(0,33))} · PKL:<b>${p.pkl}un</b>`
        ).join('<br>');
        return `⚠️ <b>${em_risco.length}</b> SKU(s) com PKL iminente de ruptura (1-5un):<br>${top}`;
    });

    // ─── INSIGHTS / BRIEFING DO TURNO ─────────────────────────
    registerIntent('insights', [
        /insights?|analise.*geral|resumo.*inteligente|o que.*esta.*acontecendo|situacao.*geral|overview|briefing|relatorio.*rapido|resumo.*turno/i
    ], () => _rInsights());

    // ─── PRIORIDADE EXECUTIVA ──────────────────────────────────
    registerIntent('prioridade', [
        /prioridade.*agora|o que fazer.*agora|foco.*agora|urgente.*agora|onde focar|prioridade.*turno|acao.*imediata/i
    ], () => _rPrioridadeTurno());

    // ─── CONTAGENS GERAIS ──────────────────────────────────────
    registerIntent('contagens', [
        /quantos.*sku|quantos.*produto|quantos.*ruptura|quantos.*agendamento|quantos.*tarefa|quantos.*gargalo|quantidade.*total/i
    ], () => {
        if (!$ok()) return _loading();
        return `📊 Contagens atuais:<br>
📦 SKUs totais: <b>${$prods().length}</b><br>
🔴 Rupturas: <b>${$prods().filter(p=>p.categoriaCor==='red').length}</b> · 🟡 Abastecimento: <b>${$prods().filter(p=>p.categoriaCor==='yellow').length}</b> · 🟢 Saudáveis: <b>${$prods().filter(p=>p.categoriaCor==='green').length}</b><br>
📋 Agendamentos: <b>${$ags().length}</b><br>
📦 Fila: <b>${$fila().length}</b> item(ns)<br>
📋 Tarefas pendentes: <b>${$tar().filter(t=>!t.done).length}</b> de <b>${$tar().length}</b><br>
⚠️ Gargalos UC: <b>${$uc().length}</b>`;
    });

    // ─── WATCH LIST — ADICIONAR ────────────────────────────────
    registerIntent('watch_add', [
        /monitorar|vigiar|watch\s+\d|acompanhar\s+\d|alerta.*sku/i
    ], (q, n) => {
        const sku = extractSku(q);
        if (!sku) return 'Informe o SKU numérico para monitorar. Ex: <b>monitorar 1234567</b>';
        _ctx.watchList.add(sku);
        _watchSnapshot.set(sku, $prod(sku)?.categoriaCor ?? null);
        return `👁️ SKU <b>${esc(sku)}</b> adicionado ao monitoramento.<br>Lista atual: <b>${[..._ctx.watchList].join(', ')}</b>`;
    });

    // ─── WATCH LIST — VER ─────────────────────────────────────
    registerIntent('watch_list', [
        /lista.*monitor|monitorados|watch list|em.*observacao|quais.*monitor|o que.*monitorando/i
    ], () => {
        if (!_ctx.watchList.size) return '👁️ Nenhum SKU em monitoramento. Use: <b>monitorar [SKU]</b>';
        const items = [..._ctx.watchList].map(sku => {
            const p = $prod(sku);
            if (!p) return `❓ <b>${esc(sku)}</b> — não encontrado`;
            const ico = {red:'🔴',yellow:'🟡',green:'🟢'}[p.categoriaCor] ?? '⚫';
            return `${ico} <b>${esc(sku)}</b> — ${esc(p.desc.substring(0,30))} · PKL:${p.pkl}un`;
        }).join('<br>');
        return `👁️ SKUs monitorados (<b>${_ctx.watchList.size}</b>):<br>${items}`;
    });

    // ─── WATCH LIST — REMOVER ──────────────────────────────────
    registerIntent('watch_remove', [
        /parar.*monitor|remover.*monitor|tirar.*monitor|desmonitorar/i
    ], (q, n) => {
        const sku = extractSku(q);
        if (!sku) return 'Informe o SKU para parar de monitorar.';
        if (_ctx.watchList.has(sku)) {
            _ctx.watchList.delete(sku);
            _watchSnapshot.delete(sku);
            return `🗑️ SKU <b>${esc(sku)}</b> removido do monitoramento.`;
        }
        return `SKU <b>${esc(sku)}</b> não estava sendo monitorado.`;
    });

    // ─── MAIS DETALHES (sub-contexto do último SKU) ────────────
    registerIntent('mais_detalhe', [
        /mais detalhe|me conta mais|e as vendas|e os movimentos|e o agendamento|e o gargalo|continua|seguinte/i
    ], (q, n) => {
        const sku = _ctx.lastSku;
        if (!sku) return 'Sobre qual SKU você quer mais detalhes?';
        if (/venda/.test(n))            return _rVendasSku(sku);
        if (/movimento|mov/.test(n))    return _rMovSku(sku);
        if (/agendamento|entrega/.test(n)) {
            const ag = $ags().find(a => String(a.sku) === sku);
            return ag
                ? `📦 <b>${esc(sku)}</b> — Agendado: <b>${esc(ag.fornecedor)}</b> · ${ag.qtdAgendada}un · ${esc(ag.dataInicio)} · Doca:${esc(ag.doca||'N/I')}`
                : `Sem agendamento para SKU <b>${esc(sku)}</b>.`;
        }
        if (/gargalo|uc/.test(n)) {
            const g = $uc().find(x => String(x.id) === sku);
            return g
                ? `⚠️ Gargalo <b>${esc(sku)}</b>: ${esc(g.status)} · AEL:${g.ael}un RES:${g.res}un PKL:${g.pkl}un`
                : `Sem gargalo UC para SKU <b>${esc(sku)}</b>.`;
        }
        return _rSkuCompleto(sku);
    });

    // ══════════════════════════════════════════════════════════
    // RESOLVEDORES INTERNOS
    // ══════════════════════════════════════════════════════════

    function _rSkuCompleto(sku) {
        if (!$ok()) return _loading();
        const p = $prod(sku);
        if (!p) return `SKU <b>${esc(sku)}</b> não encontrado no estoque.`;

        const ico  = {red:'🔴',yellow:'🟡',green:'🟢'}[p.categoriaCor] ?? '⚫';
        const deps = p.depositos ?? [];
        const grupos = {};
        deps.forEach(d => { (grupos[d.tipo] = grupos[d.tipo] || []).push(`${d.pos}(${d.q}un)`); });
        const depStr = Object.entries(grupos).map(([t,v]) => `${t}:${v.join(',')}`).join(' · ') || 'Sem posições';

        const movs   = $mov().filter(m => String(m?.['Produto'] ?? '').trim() === sku);
        const ultMov = movs.length ? (() => {
            const m = movs[movs.length-1];
            return `${m['PD origem']??'N/I'}→${m['PD destino']??'N/I'} · ${m['Data da confirmação']??'S/D'}`;
        })() : 'Sem movimentos';

        const vendas  = $pdv().filter(v => String(v?.['Nº do produto']??'').trim() === sku);
        const totVend = vendas.reduce((s,v) => s + safeFloat(v?.['Quantidade vendida']),0);

        const ag    = $ags().find(a => String(a.sku) === sku);
        const agStr = ag ? `${esc(ag.fornecedor)} · ${ag.qtdAgendada}un · ${esc(ag.dataInicio)}` : 'Sem agendamento';

        const gc    = $uc().find(g => String(g.id) === sku);
        const gcStr = gc ? `${esc(gc.status)} · AEL:${gc.ael}un RES:${gc.res}un PKL:${gc.pkl}un` : 'Sem gargalo';

        return `${ico} <b>${esc(sku)}</b> — ${esc(p.desc)}<br>
📦 Total:<b>${p.total}un</b> · PKL:<b>${p.pkl}un</b> · R$${brl(p.valTotal)}<br>
📍 ${esc(depStr)}<br>
🔄 Mov: ${esc(ultMov)}<br>
🛒 Vendas: <b>${totVend}un</b><br>
📋 Agend: ${agStr}<br>
⚠️ UC: ${gcStr}`;
    }

    function _rVendasSku(sku) {
        const vendas = $pdv().filter(v => String(v?.['Nº do produto']??'').trim() === sku);
        if (!vendas.length) return `Sem dados de venda para SKU <b>${esc(sku)}</b> no período.`;
        const tot = vendas.reduce((s,v) => s + safeFloat(v?.['Quantidade vendida']),0);
        const p   = $prod(sku);
        return `🛒 Vendas de <b>${esc(sku)}</b>${p ? ' — ' + esc(p.desc.substring(0,30)) : ''}: <b>${tot}un</b> · ${vendas.length} registro(s).`;
    }

    function _rMovSku(sku) {
        const movs = $mov().filter(m => String(m?.['Produto']??'').trim() === sku);
        if (!movs.length) return `Sem movimentos registrados para SKU <b>${esc(sku)}</b>.`;
        const top = movs.slice(-4).reverse().map(m =>
            `🔄 ${m['PD origem']??'N/I'}→${m['PD destino']??'N/I'} · ${m['Data da confirmação']??'S/D'} · ${m['Qtd.prev.orig.UMA']??'?'}un`
        ).join('<br>');
        return `🔄 Movimentos de <b>${esc(sku)}</b>:<br>${top}`;
    }

    function _rCompararSkus(sku1, sku2) {
        const p1 = $prod(sku1), p2 = $prod(sku2);
        if (!p1 && !p2) return `SKUs <b>${esc(sku1)}</b> e <b>${esc(sku2)}</b> não encontrados.`;
        if (!p1) return `SKU <b>${esc(sku1)}</b> não encontrado. Verifique o código.`;
        if (!p2) return `SKU <b>${esc(sku2)}</b> não encontrado. Verifique o código.`;

        const ico = c => ({red:'🔴',yellow:'🟡',green:'🟢'}[c]??'⚫');
        const v1  = $pdv().filter(v => String(v?.['Nº do produto']??'').trim()===sku1).reduce((s,v)=>s+safeFloat(v?.['Quantidade vendida']),0);
        const v2  = $pdv().filter(v => String(v?.['Nº do produto']??'').trim()===sku2).reduce((s,v)=>s+safeFloat(v?.['Quantidade vendida']),0);
        const ag1 = $ags().find(a => String(a.sku) === sku1);
        const ag2 = $ags().find(a => String(a.sku) === sku2);

        // ── Análise estratégica ───────────────────────────────
        const vencedorVenda  = v1 > v2 ? 1 : v2 > v1 ? 2 : 0;
        const vencedorEstq   = p1.pkl > p2.pkl ? 1 : p2.pkl > p1.pkl ? 2 : 0;
        const vencedorValor  = p1.valTotal > p2.valTotal ? 1 : p2.valTotal > p1.valTotal ? 2 : 0;
        const giroP1         = p1.pkl > 0 ? (v1 / p1.pkl).toFixed(1) : '∞';
        const giroP2         = p2.pkl > 0 ? (v2 / p2.pkl).toFixed(1) : '∞';

        // Risco: ruptura ou sem agendamento
        const riscoP1 = p1.categoriaCor === 'red' ? '🔴 RUPTURA' : p1.categoriaCor === 'yellow' ? '🟡 CRÍTICO' : null;
        const riscoP2 = p2.categoriaCor === 'red' ? '🔴 RUPTURA' : p2.categoriaCor === 'yellow' ? '🟡 CRÍTICO' : null;

        // Quem focar agora?
        let acaoStr = '';
        if (vencedorVenda === 1 && (riscoP1 || p1.pkl <= 5)) {
            acaoStr = `⚡ Ação: <b>${esc(sku1)}</b> vende mais mas está ${riscoP1 || 'com PKL baixo'} — reabastecer PKL <b>urgente</b>.`;
        } else if (vencedorVenda === 2 && (riscoP2 || p2.pkl <= 5)) {
            acaoStr = `⚡ Ação: <b>${esc(sku2)}</b> vende mais mas está ${riscoP2 || 'com PKL baixo'} — reabastecer PKL <b>urgente</b>.`;
        } else if (vencedorVenda === 1) {
            acaoStr = `⚡ Ação: Manter frente de ${esc(sku1)} abastecida (giro ${giroP1}x). ${esc(sku2)} pode ser reposicionado ou promovido.`;
        } else if (vencedorVenda === 2) {
            acaoStr = `⚡ Ação: Manter frente de ${esc(sku2)} abastecida (giro ${giroP2}x). ${esc(sku1)} com venda baixa — verificar posição de gôndola.`;
        } else {
            acaoStr = `⚡ Ação: Vendas iguais — priorize o de maior margem ou melhor posição de gôndola.`;
        }

        // Linha de agendamento
        const agStr1 = ag1 ? `📦 Agend: ${ag1.qtdAgendada}un em ${esc(ag1.dataInicio)}` : '📦 Sem agendamento';
        const agStr2 = ag2 ? `📦 Agend: ${ag2.qtdAgendada}un em ${esc(ag2.dataInicio)}` : '📦 Sem agendamento';

        return `📊 <b>Comparativo Estratégico:</b><br>` +
            `${ico(p1.categoriaCor)} <b>${esc(sku1)}</b> — ${esc(p1.desc.substring(0,35))}<br>` +
            `&nbsp;&nbsp;PKL:${p1.pkl}un · Total:${p1.total}un · Vendas:<b>${v1}un</b> · Giro:${giroP1}x · R$${brl(p1.valTotal)}<br>` +
            `&nbsp;&nbsp;${agStr1}<br>` +
            `${ico(p2.categoriaCor)} <b>${esc(sku2)}</b> — ${esc(p2.desc.substring(0,35))}<br>` +
            `&nbsp;&nbsp;PKL:${p2.pkl}un · Total:${p2.total}un · Vendas:<b>${v2}un</b> · Giro:${giroP2}x · R$${brl(p2.valTotal)}<br>` +
            `&nbsp;&nbsp;${agStr2}<br>` +
            `${vencedorVenda ? `📈 Vende mais: <b>${esc(vencedorVenda===1?sku1:sku2)}</b>` : '↔️ Vendas iguais'} · ` +
            `${vencedorEstq  ? `🏪 Mais PKL: <b>${esc(vencedorEstq===1?sku1:sku2)}</b>` : '↔️ PKL igual'}<br>` +
            acaoStr;
    }

    // ─── INSIGHTS AUTOMÁTICOS DO TURNO ────────────────────────
    function _rInsights() {
        if (!$ok()) return _loading();

        // Cache 60s
        if (_ctx.insightCache && (Date.now() - _ctx.insightTs) < 60000) {
            return _ctx.insightCache;
        }

        const prods = $prods();
        const rups  = prods.filter(p => p.categoriaCor === 'red');
        const meta  = $rank().meta ?? {};
        const ags   = $ags();
        const uc    = $uc();

        const insights = [];

        // 1. Rupturas sem cobertura
        const skusAg   = new Set(ags.map(a => String(a.sku)));
        const semCobNr = rups.filter(p => !skusAg.has(String(p.id))).length;
        if (semCobNr > 0) insights.push(`🔴 <b>${semCobNr}</b> SKU(s) em ruptura sem nenhum agendamento previsto`);

        // 2. Impacto financeiro
        const rVal = meta.valTotalRed ?? 0;
        if (rVal > 0) insights.push(`💰 R$<b>${brl(rVal)}</b> em valor travado por ruptura — risco de perda de venda`);

        // 3. Gargalo + ruptura simultâneos
        const rupsSet  = new Set(rups.map(p => String(p.id)));
        const gargRups = uc.filter(g => rupsSet.has(String(g.id))).length;
        if (gargRups > 0) insights.push(`⚠️ <b>${gargRups}</b> SKU(s) em ruptura E com gargalo UC — precisam ser liberados do AEL/RES`);

        // 4. Falsos zeros
        const falsoZ = rups.filter(p => p.subStatus === 'falso-zero').length;
        if (falsoZ > 0) insights.push(`🟠 <b>${falsoZ}</b> falso-zero(s) — produto existe em AEL/RES mas sem posição PKL`);

        // 5. Vendendo em ruptura
        const vendaMap = new Map();
        $pdv().forEach(v => {
            const id  = String(v?.['Nº do produto']??'').trim();
            const qtd = safeFloat(v?.['Quantidade vendida']);
            if (id && qtd > 0) vendaMap.set(id, (vendaMap.get(id)??0)+qtd);
        });
        const vendRup = rups.filter(p => vendaMap.has(String(p.id))).length;
        if (vendRup > 0) insights.push(`📉 <b>${vendRup}</b> SKU(s) com VENDA ATIVA em ruptura — perda real em andamento`);

        // 6. PKL iminente
        const pkliminente = prods.filter(p => p.categoriaCor !== 'red' && p.pkl >= 1 && p.pkl <= 5).length;
        if (pkliminente > 0) insights.push(`🟡 <b>${pkliminente}</b> SKU(s) com PKL ≤ 5un — próximos de ruptura`);

        // 7. Fila parada
        const filaLen = $fila().length;
        if (filaLen > 0) insights.push(`📦 <b>${filaLen}</b> item(ns) pendente(s) na fila de coleta`);

        // 8. Tarefas pendentes
        const pendTar = $tar().filter(t => !t.done).length;
        if (pendTar > 0) insights.push(`📋 <b>${pendTar}</b> tarefa(s) do turno ainda abertas`);

        if (!insights.length) {
            const result = '✅ <b>Turno em conformidade.</b> Nenhuma anomalia crítica detectada.';
            _ctx.insightCache = result; _ctx.insightTs = Date.now();
            return result;
        }

        const html = `🧠 <b>Insights do Turno</b> — ${new Date().toLocaleTimeString('pt-BR')}:<br>${insights.map((i,n)=>`${n+1}. ${i}`).join('<br>')}`;
        _ctx.insightCache = html; _ctx.insightTs = Date.now();
        return html;
    }

    // ─── PRIORIDADE EXECUTIVA ──────────────────────────────────
    function _rPrioridadeTurno() {
        if (!$ok()) return _loading();
        const acoes  = [];
        const prods  = $prods();
        const uc     = $uc();

        // Mapa de vendas
        const vendaMap = new Map();
        $pdv().forEach(v => {
            const id  = String(v?.['Nº do produto']??'').trim();
            const qtd = safeFloat(v?.['Quantidade vendida']);
            if (id && qtd > 0) vendaMap.set(id, (vendaMap.get(id)??0)+qtd);
        });

        // 1. Ruptura com venda ativa = máxima urgência
        prods.filter(p => p.categoriaCor==='red' && vendaMap.has(String(p.id)))
            .sort((a,b) => b.valTotal - a.valTotal).slice(0,3)
            .forEach(p => acoes.push(`🔴 <b>CRÍTICO:</b> SKU <b>${esc(p.id)}</b> — ruptura com venda ativa → reabastecer AGORA`));

        // 2. Falso zero → criar posição PKL
        prods.filter(p => p.subStatus==='falso-zero').slice(0,2)
            .forEach(p => acoes.push(`🟠 <b>URGENTE:</b> SKU <b>${esc(p.id)}</b> — falso zero, criar posição PKL`));

        // 3. Gargalo AEL com ruptura → descer
        const rupsSet = new Set(prods.filter(p=>p.categoriaCor==='red').map(p=>String(p.id)));
        uc.filter(g => rupsSet.has(String(g.id)) && g.ael>0).slice(0,2)
            .forEach(g => acoes.push(`⚡ <b>DESCE AEL:</b> SKU <b>${esc(g.id)}</b> — ${g.ael}un no aéreo, baixar para PKL`));

        // 4. PKL iminente
        prods.filter(p => p.categoriaCor!=='red' && p.pkl>=1 && p.pkl<=3)
            .sort((a,b)=>a.pkl-b.pkl).slice(0,2)
            .forEach(p => acoes.push(`🟡 <b>ABASTECER:</b> SKU <b>${esc(p.id)}</b> — apenas ${p.pkl}un no PKL`));

        // 5. Fila
        const filaLen = $fila().length;
        if (filaLen > 0) acoes.push(`📦 <b>FILA:</b> ${filaLen} item(ns) aguardando separação`);

        if (!acoes.length) return '✅ Nenhuma ação imediata necessária. Turno estável.';
        return `⚡ <b>Ações agora</b> (${acoes.length}):<br>${acoes.join('<br>')}`;
    }

    // ══════════════════════════════════════════════════════════
    // WATCH LIST — POLLING
    // ══════════════════════════════════════════════════════════
    const _watchSnapshot = new Map();

    function _checkWatchList() {
        if (!_ctx.watchList.size || !$ok()) return;
        const alertas = [];
        _ctx.watchList.forEach(sku => {
            const p = $prod(sku);
            if (!p) return;
            const prev = _watchSnapshot.get(sku);
            _watchSnapshot.set(sku, p.categoriaCor);
            if (prev && prev !== p.categoriaCor) {
                const ico = {red:'🔴',yellow:'🟡',green:'🟢'}[p.categoriaCor] ?? '⚫';
                alertas.push(`${ico} <b>ALERTA WATCH:</b> SKU <b>${esc(sku)}</b> — ${prev.toUpperCase()} → <b>${p.categoriaCor.toUpperCase()}</b>`);
            }
        });
        if (alertas.length) {
            try {
                // K11Voice expõe _addMsgExternal para alertas externos
                const _voice = (typeof K11Voice !== 'undefined' ? K11Voice : window.K11Voice);
                alertas.forEach(a => _voice?._addMsgExternal?.('k11', a));
            } catch(_) {}
        }
    }

    setInterval(_checkWatchList, 30000);

    // ══════════════════════════════════════════════════════════
    // MOTOR DE RESOLUÇÃO PRINCIPAL
    // ══════════════════════════════════════════════════════════
    // ─── BUSCA COM VERBO EXPLÍCITO ────────────────────────────
    registerIntent('busca_desc', [
        /^(buscar?|encontrar?|procurar?|pesquisar?|achar?|ver|mostrar?|me\s+mostra|localizar?)\s+/i,
        /^(qual|quais|me\s+mostra|mostra)\s+(o|a|os|as|produto|produtos)?\s*/i,
        /^sku\s+(do|da|de)\s+/i,
    ], function(q, n) {
        if (!$ok()) return _loading();
        const cleaned = q
            .replace(/^(buscar?|encontrar?|procurar?|pesquisar?|achar?|ver|mostrar?|me\s+mostra|localizar?|qual|quais|mostra)\s+(o|a|os|as|produto|produtos)?\s*/i, '')
            .replace(/^sku\s+(do|da|de)\s+/i, '')
            .trim();
        if (!cleaned || cleaned.length < 3) return null;
        const results = _searchByDesc(cleaned);
        if (!results.length) return null;
        const res = _rBuscaDesc(results, cleaned);
        if (results.length === 1) _ctx.lastSku = String(results[0].id);
        return res;
    });

    // ─── COMPARAR COM DOIS SKUs NUMÉRICOS ─────────────────────
    registerIntent('comparar_skus', [
        /compar/i,
    ], function(q, n) {
        const matches = [...q.matchAll(/\b(\d{6,10})\b/g)];
        if (matches.length < 2) return null; // deixa comparar_desc tentar
        const sku1 = matches[0][1], sku2 = matches[1][1];
        _ctx.lastSku = sku1;
        return _rCompararSkus(sku1, sku2);
    });

    // ─── COMPARAR POR DESCRIÇÃO (dois fragmentos de texto) ────
    registerIntent('comparar_desc', [
        /compar/i,
        / vs /i,
        / versus /i,
    ], function(q, n) {
        if (!$ok()) return _loading();
        // Já resolveu com SKUs numéricos? Não faz nada
        if ([...q.matchAll(/\b(\d{6,10})\b/g)].length >= 2) return null;

        const partes = _splitComparDesc(q);
        if (!partes) {
            // Não conseguiu separar — tenta com o lastSku no contexto
            const sku1 = extractSku(q) || _ctx.lastSku;
            if (sku1) return 'Preciso do segundo produto para comparar. Descreva o outro ou informe o SKU.';
            return null;
        }

        const [desc1, desc2] = partes;
        const r1 = _searchByDesc(desc1, 1);
        const r2 = _searchByDesc(desc2, 1);

        if (!r1.length && !r2.length)
            return '🔍 Não encontrei nenhum dos dois produtos. Tente descrever com mais detalhes ou use SKUs numéricos.';
        if (!r1.length)
            return '🔍 Não encontrei produto para <b>"' + esc(desc1) + '"</b>.<br>Tente: SKU numérico ou mais palavras-chave.';
        if (!r2.length)
            return '🔍 Não encontrei produto para <b>"' + esc(desc2) + '"</b>.<br>Tente: SKU numérico ou mais palavras-chave.';

        // Encontrou ambos — vai para o comparativo estratégico
        _ctx.lastSku = String(r1[0].id);
        return _rCompararSkus(String(r1[0].id), String(r2[0].id));
    });

    // ─── BUSCA LIVRE (último fallback do Brain) ────────────────
    registerIntent('texto_livre', [
        /.+/,
    ], function(q, n) {
        if (!$ok()) return null;
        if (!_isDescSearch(q, n)) return null;
        // Perguntas estratégicas/abertas → delega ao Groq
        if (/estrategi|melhorar|o que devo|como (vender|crescer|aumentar)|por que|explica|analisa|sugere|recomend/i.test(q)) return null;
        const results = _searchByDesc(q);
        if (!results.length) return null;
        const res = _rBuscaDesc(results, q);
        if (results.length === 1) _ctx.lastSku = String(results[0].id);
        return res;
    });

    function resolve(query) {
        if (!query?.trim()) return null;
        const q = query.trim();
        const n = nrm(q);

        _pushHistory('user', q);

        for (const intent of _intents) {
            for (const pattern of intent.patterns) {
                if (pattern.test(q) || pattern.test(n)) {
                    try {
                        const result = intent.handler(q, n);
                        if (result) {
                            _ctx.lastIntent = intent.tag;
                            _pushHistory('brain', result);
                            const sku = extractSku(q);
                            if (sku) _ctx.lastSku = sku;
                            return result;
                        }
                    } catch(e) {
                        console.error('[K11Brain] Erro no intent', intent.tag, e);
                    }
                }
            }
        }

        return null; // não reconhecido → delega ao Voice (local ou Gemini)
    }

    // ══════════════════════════════════════════════════════════
    // API PÚBLICA
    // ══════════════════════════════════════════════════════════
    return {
        resolve,
        register: registerIntent,
        insights: _rInsights,
        prioridade: _rPrioridadeTurno,
        invalidateCache() { _ctx.insightCache = null; _ctx.insightTs = 0; },
        resetCtx() {
            _ctx.history = []; _ctx.lastSku = null;
            _ctx.lastIntent = null; _ctx.insightCache = null;
        },
        get ctx() { return { ..._ctx, watchList: [..._ctx.watchList] }; },
        debug() {
            console.group('[K11Brain v2.0]');
            console.log('lastSku:', _ctx.lastSku);
            console.log('lastIntent:', _ctx.lastIntent);
            console.log('watchList:', [..._ctx.watchList]);
            console.log('intents:', _intents.map(i => i.tag));
            console.log('history (last 5):', _ctx.history.slice(-5));
            console.groupEnd();
        },
    };

})();

// ══════════════════════════════════════════════════════════════
// INTEGRAÇÃO COM EVENTBUS
// Invalida cache quando dados são reprocessados
// ══════════════════════════════════════════════════════════════
(function setupBrainEvents() {
    function _bind() {
        if (typeof EventBus === 'undefined') { setTimeout(_bind, 500); return; }
        EventBus.on('estoque:atualizado', () => K11Brain.invalidateCache());
        EventBus.on('duelo:atualizado',   () => K11Brain.invalidateCache());
        EventBus.on('uc:atualizado',      () => K11Brain.invalidateCache());
        console.log('[K11Brain v2.0] ✅ Pronto — integrado como camada 1 do K11Voice.');
    }
    if (document.readyState === 'complete') setTimeout(_bind, 100);
    else window.addEventListener('load', () => setTimeout(_bind, 100), { once: true });
})();
