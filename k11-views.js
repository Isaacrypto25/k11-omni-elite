/**
 * K11 OMNI ELITE — VIEWS (Templates HTML)
 * ════════════════════════════════════════
 * Cada método retorna uma string HTML que é inserida no #stage.
 * Nenhuma view tem efeitos colaterais — apenas lê APP.db e APP.rankings.
 *
 * Depende de: k11-config.js, k11-utils.js
 *
 * Estrutura:
 *   _skeleton()           → Placeholder animado durante carregamento
 *   dash()                → Dashboard principal com KPIs e charts
 *   acoesPrioritarias()   → Plano de ação do dia
 *   detalheInconsistencias() → SKUs com venda e estoque zero
 *   consultiveReport()    → Relatório consultivo por cor
 *   detalheUC()           → Gargalos de UC com posições detalhadas
 *   operacional()         → Fila de rotas e picker
 *   rastreio()            → Investigar SKU individual
 *   projetor()            → Duelo de vendas vs concorrentes
 *   estoque()             → Listagem filtrada de estoque
 *   detalheTarefas()      → Tarefas do turno
 *   recebimento()         → Agenda de recebimentos de fornecedores
 */

'use strict';

const Views = {


        _skeleton() {
            const sk = (w, h = 18) => `<div class="skeleton" style="width:${w};height:${h}px;border-radius:4px;margin-bottom:8px;"></div>`;
            return `
                <div class="op-card">${sk('60%', 12)} ${sk('100%', 48)} ${sk('80%')} ${sk('90%')}</div>
                <div class="op-card margin-t-15">${sk('50%', 12)} ${sk('100%', 120)}</div>
                <div class="kpi-row margin-t-15">
                    <div class="kpi-btn">${sk('60px', 60)}</div>
                    <div class="kpi-btn">${sk('60px', 60)}</div>
                    <div class="kpi-btn">${sk('60px', 60)}</div>
                </div>`;
        },

        dash() {
            const vT         = APP.db.produtos.reduce((a, b) => a + b.valTotal, 0);
            const percT      = APP.db.tarefas.length > 0 ? Math.round((APP.db.tarefas.filter(t => t.done).length / APP.db.tarefas.length) * 100) : 0;
            const totalUC    = APP.db.ucGlobal.length;
            const vYellow    = APP.rankings.meta.valTotalYellow;
            const vRed       = APP.rankings.meta.valTotalRed;
            const st         = APP.rankings.pieStats;
            const pRed       = Math.round((st.red    / st.total) * 100);
            const pYellow    = Math.round((st.yellow / st.total) * 100);
            const pGreen     = 100 - pRed - pYellow;
            const b          = APP.rankings.benchmarking;
            const inconsCount = APP.rankings.meta.inconsistentes.length;
            const pdvsSorted = [
                { name: 'MESQUITA',    key: 'mesquita',    val: b.mesquita,    gap: 100 - b.mesquita },
                { name: 'JACAREPAGUÁ', key: 'jacarepagua', val: b.jacarepagua, gap: 100 - b.jacarepagua },
                { name: 'BENFICA',     key: 'benfica',     val: b.benfica,     gap: 100 - b.benfica },
            ].sort((a, z) => z.gap - a.gap);
            const worstPDV  = pdvsSorted[0];
            const topDrag   = APP.rankings.duelos[0];
            const mediaGeral = Math.round((b.mesquita + b.jacarepagua + b.benfica) / 3);
            const deltaHidra = b.hidraulica - mediaGeral;
            const pieGradient = `conic-gradient(var(--success) 0% ${pGreen}%, var(--warning) ${pGreen}% ${pGreen + pYellow}%, var(--danger) ${pGreen + pYellow}% 100%)`;

            // Chart SVG
            const W=460, H=200, PL=28, PR=16, PT=32, PB=28;
            const cw=W-PL-PR, ch=H-PT-PB;
            const yMax = Math.max(100, Math.ceil(Math.max(b.mesquita, b.jacarepagua, b.benfica, b.hidraulica)/25)*25);
            const cy   = v => PT + ch - (Math.min(Math.max(v,0),yMax)/yMax)*ch;
            const concorrentes = [{ label:'MESQ', val:b.mesquita }, { label:'JACA', val:b.jacarepagua }, { label:'BENF', val:b.benfica }];
            const BAR_W = 36, barGap = cw*0.66/2;
            const cyMedia = cy(mediaGeral);
            const mediaX2 = PL + cw*0.66 + BAR_W/2;
            const hidraX  = PL + cw*0.82;
            const hidraBH = (b.hidraulica/yMax)*ch;
            const hidraY  = PT + ch - hidraBH;
            const hidraBW = 46;
            const dcol    = deltaHidra >= 0 ? 'var(--success)' : 'var(--danger)';
            const dsym    = deltaHidra >= 0 ? '▲' : '▼';

            const gradeHTML = [0,25,50,75,100].filter(v=>v<=yMax).map(v => {
                const y = cy(v);
                return `<line x1="${PL-4}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="${v%50===0?'3,3':'2,6'}" stroke-opacity="${v%50===0?.22:.09}"/>
                        <text x="${PL-6}" y="${y+3}" text-anchor="end" font-family="monospace" font-size="6" fill="var(--text-muted)" opacity="0.5">${v}</text>`;
            }).join('');

            const barsHTML = concorrentes.map((c, i) => {
                const x = PL + i*barGap, bH = (c.val/yMax)*ch, y = PT + ch - bH;
                const isMax = c.val === Math.max(...concorrentes.map(d=>d.val));
                const lY = y > PT+14 ? y-5 : y+12;
                return `<rect x="${x-BAR_W/2}" y="${y}" width="${BAR_W}" height="${bH}"
                              fill="${isMax?'rgba(255,140,0,0.22)':'rgba(255,140,0,0.08)'}"
                              stroke="${isMax?'rgba(255,140,0,0.5)':'rgba(255,140,0,0.18)'}"
                              stroke-width="0.8" rx="3" style="cursor:pointer"
                              onclick="APP.actions._chartTooltip('${c.label}',${c.val},event)"/>
                        <text x="${x}" y="${lY}" text-anchor="middle" font-family="monospace" font-size="7.5" fill="var(--primary)" font-weight="${isMax?'bold':'normal'}" opacity="${isMax?0.9:0.6}">${c.val}%</text>
                        <text x="${x}" y="${PT+ch+14}" text-anchor="middle" font-family="monospace" font-size="7" fill="var(--text-muted)" letter-spacing="0.5">${c.label}</text>`;
            }).join('');

            const hidraHTML = `
                <defs>
                    <linearGradient id="hbg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.95"/>
                        <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.18"/>
                    </linearGradient>
                    <filter id="ghh" x="-80%" y="-80%" width="260%" height="260%">
                        <feGaussianBlur stdDeviation="5" result="b"/>
                        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                </defs>
                <line x1="${PL-10}" y1="${cyMedia}" x2="${mediaX2}" y2="${cyMedia}" stroke="var(--success)" stroke-width="1" stroke-dasharray="5,3" stroke-opacity="0.45"/>
                <text x="${PL-10}" y="${cyMedia-4}" font-family="monospace" font-size="6.5" fill="var(--success)" opacity="0.65">ø${mediaGeral}%</text>
                <line x1="${hidraX+hidraBW/2+8}" y1="${cyMedia}" x2="${hidraX+hidraBW/2+8}" y2="${cy(b.hidraulica)}" stroke="${dcol}" stroke-width="1.5" stroke-opacity="0.75"/>
                <text x="${hidraX+hidraBW/2+14}" y="${(cyMedia+cy(b.hidraulica))/2+3}" font-family="monospace" font-size="8" fill="${dcol}" font-weight="bold">${dsym}${Math.abs(deltaHidra)}</text>
                <rect x="${hidraX-hidraBW/2}" y="${hidraY}" width="${hidraBW}" height="${hidraBH}" fill="url(#hbg)" stroke="var(--primary)" stroke-width="1.2" rx="4" filter="url(#ghh)" style="cursor:pointer" onclick="APP.actions._chartTooltip('HIDRÁULICA',${b.hidraulica},event)"/>
                <text x="${hidraX}" y="${hidraY-8}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="bold" fill="var(--primary)" filter="url(#ghh)">${b.hidraulica}%</text>
                <circle cx="${hidraX}" cy="${hidraY-1}" r="20" fill="none" stroke="var(--primary)" stroke-width="0.8" stroke-opacity="0.18" class="pulse-ring"/>
                <text x="${hidraX}" y="${PT+ch+14}" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" letter-spacing="1.2" fill="var(--primary)">HIDRA</text>`;

            const topDrags  = APP.rankings.duelos.slice(0, 4);
            const topBoosts = APP.rankings.duelos.filter(d => d.dominando).slice(0, 3);
            const acoesPrio = APP._gerarAcoesPrioritarias();

            setTimeout(() => {
                APP.actions.animateValue('val-inv',    0, vT,      ANIM_DURATION_MS);
                APP.actions.animateValue('val-ganhos', 0, vYellow, ANIM_DURATION_MS);
                APP.actions.animateValue('val-red',    0, vRed,    ANIM_DURATION_MS);
            }, 50);
            // Animar os arcos KPI após render
            setTimeout(() => {
                const circ = 2 * Math.PI * 30;
                const pctCheck = percT;
                const pctUC    = totalUC > 0 ? Math.min(100, Math.round((totalUC / 200) * 100)) : 0;
                const pctAcoes = acoesPrio.length > 0 ? Math.min(100, Math.round((acoesPrio.length / 10) * 100)) : 0;
                [['arc_ck', pctCheck], ['arc_uc', pctUC], ['arc_ac', pctAcoes]].forEach(([id, pct], i) => {
                    const el = document.getElementById(id);
                    if (el) setTimeout(() => { el.style.strokeDashoffset = circ * (1 - pct / 100); }, i * 120);
                });
            }, 100);

            return `
                <!-- BANNER -->
                <div class="op-card margin-b-0" style="border-left:3px solid var(--danger);background:linear-gradient(135deg,rgba(239,68,68,0.06) 0%,transparent 100%);cursor:pointer" onclick="APP.view('acoesPrioritarias')">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span style="font-size:18px;flex-shrink:0">⚡</span>
                        <div style="flex:1;min-width:0">
                            <div class="micro-txt txt-danger" style="letter-spacing:1.5px;margin-bottom:2px">AÇÃO IMEDIATA</div>
                            <div class="bold-desc" style="font-size:11px;line-height:1.3">
                                ${worstPDV ? `${esc(worstPDV.name)} com gap de ${worstPDV.gap}pts` : 'Nenhum gap crítico detectado'}
                                ${topDrag  ? ` · ${esc(topDrag.id)} puxa resultado para baixo` : ''}
                            </div>
                        </div>
                        <span class="txt-danger" style="font-size:16px;flex-shrink:0">→</span>
                    </div>
                </div>

                <!-- PIE SAÚDE PKL -->
                <div class="op-card border-warning margin-t-10">
                    <div class="flex-between align-start">
                        <div style="flex:1">
                            <div class="label txt-warning">COMPOSIÇÃO DE SAÚDE PKL</div>
                            <div class="mono font-18" style="margin:5px 0">R$ <span id="val-inv">0</span></div>
                            <div style="display:flex;gap:10px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
                                <div class="micro-txt txt-warning bold-desc">CRÍTICO: R$ <span id="val-ganhos">0</span></div>
                                <div class="micro-txt txt-danger pulse-danger">ZERADOS: R$ <span id="val-red">0</span></div>
                            </div>
                            <div class="chart-legend">
                                <div onclick="APP.view('detalheCriticos','green')"><span class="dot bg-success"></span>${pGreen}% <span class="micro-txt">SAUDÁVEL</span></div>
                                <div onclick="APP.view('detalheCriticos','yellow')" class="bold-desc"><span class="dot bg-warning"></span>${pYellow}% <span class="micro-txt">ZONA CRÍTICA</span></div>
                                <div onclick="APP.view('detalheCriticos','red')"><span class="dot bg-danger"></span>${pRed}% <span class="micro-txt">ZERADOS</span></div>
                            </div>
                            ${inconsCount > 0 ? `<div class="alert-inline alert-danger margin-t-10" onclick="APP.view('detalheInconsistencias')">⚠ ${inconsCount} SKU${inconsCount>1?'s':''} vendidos sem estoque <span class="micro-txt">→ ver</span></div>` : ''}
                        </div>
                        <div class="pie-container" onclick="APP.view('detalheCriticos','yellow')">
                            <div class="pie-chart" style="background:${pieGradient}">
                                <div class="pie-center"><span class="micro-label">SKUS</span><b class="font-18">${st.total}</b></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- MAPA DE ATAQUE PDV -->
                <div class="op-card no-pad overflow-hid margin-t-10">
                    <div class="intel-header">
                        <span class="label">MAPA DE ATAQUE — PDVs</span>
                        <span class="micro-txt txt-muted">onde focar hoje</span>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border-color)">
                        ${pdvsSorted.map((pdv, i) => {
                            const prio = i + 1;
                            const bCol = prio===1 ? 'var(--danger)' : prio===2 ? 'var(--warning)' : 'var(--success)';
                            const rank = prio===1 ? '🔴' : prio===2 ? '🟡' : '🟢';
                            // [FIX] usa key pré-normalizada
                            return `<div style="background:var(--bg);padding:12px 10px;cursor:pointer;${prio===1?'animation:critPulse 2.5s ease infinite':''}" onclick="APP.actions.mudarAlvo('${pdv.key}')">
                                <span class="micro-txt" style="letter-spacing:1px;color:var(--text-muted)">${rank} #${prio}</span>
                                <div class="bold-desc" style="font-size:10px;letter-spacing:0.5px">${esc(pdv.name)}</div>
                                <div style="font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700;color:${bCol};line-height:1;margin:4px 0 2px">-${pdv.gap}<span style="font-size:10px">pts</span></div>
                                <div style="background:var(--border-color);height:3px;border-radius:2px;overflow:hidden;margin-top:6px">
                                    <div style="width:${pdv.val}%;height:100%;background:${bCol};border-radius:2px;transition:width .8s cubic-bezier(.16,1,.3,1)"></div>
                                </div>
                                <div class="micro-txt" style="margin-top:4px;color:var(--text-muted)">${pdv.val}% vs target</div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>

                <!-- PERFORMANCE CHART -->
                <div class="op-card no-pad overflow-hid margin-t-10">
                    <div class="intel-header">
                        <span class="label">PERFORMANCE — HIDRÁULICA VS PDVs</span>
                        <div style="display:flex;align-items:center;gap:8px">
                            <span style="font-family:'JetBrains Mono',monospace;font-size:8px;padding:2px 7px;border-radius:3px;background:${deltaHidra>=0?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.12)'};border:1px solid ${deltaHidra>=0?'rgba(16,185,129,0.35)':'rgba(239,68,68,0.35)'};color:${deltaHidra>=0?'var(--success)':'var(--danger)'}">
                                ${deltaHidra>=0?'▲ ACIMA':'▼ ABAIXO'} DA MÉDIA
                            </span>
                            <button class="consultive-btn" onclick="APP.view('consultiveReport')" title="Relatório Consultivo">
                                <span class="material-symbols-outlined" style="font-size:14px">psychology</span>
                            </button>
                            <button class="consultive-btn" onclick="K11Regional.open()" title="Dashboard Regional" style="background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.3);color:#60a5fa">
                                <span class="material-symbols-outlined" style="font-size:14px">hub</span>
                            </button>
                        </div>
                    </div>
                    <div style="padding:4px 10px 0 10px;display:flex;align-items:center;justify-content:space-between">
                        <span class="micro-txt txt-muted">ÍNDICE RELATIVO vs CONCORRENTES</span>
                        <span class="micro-txt" style="color:#60a5fa;cursor:pointer;display:flex;align-items:center;gap:3px" onclick="K11Regional.open()">
                            <span class="material-symbols-outlined" style="font-size:11px">open_in_full</span>
                            MAPA REGIONAL
                        </span>
                    </div>
                    <div style="position:relative;padding:4px 12px 10px;cursor:pointer" onclick="K11Regional.open()" title="Abrir Dashboard Regional Interativo">
                        <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible" aria-label="Performance por PDV">
                            ${gradeHTML}${barsHTML}${hidraHTML}
                        </svg>
                        <div id="chart-tooltip" style="display:none;position:absolute;top:6px;right:18px;background:var(--bg);border:1px solid var(--primary);border-radius:5px;padding:6px 12px;font-size:10px;pointer-events:none;color:var(--primary);box-shadow:0 0 16px rgba(255,140,0,0.2)"></div>
                        <div class="chart-expand-hint">🗺 CLIQUE PARA MAPA REGIONAL INTERATIVO</div>
                    </div>
                </div>

                <!-- KPI ROW — SVG ANIMATED RINGS -->
                <div class="kpi-row margin-t-10" id="kpi-ring-row">
                    ${(function(){
                        const R = 30, C = 38, STROKE = 5;
                        const circ = 2 * Math.PI * R;
                        function ring(pct, color, glowColor, val, label, iconPath, onclick, uid, pulse) {
                            const offset = circ * (1 - pct / 100);
                            const glowId = 'kglow_' + uid;
                            const animId = 'kanim_' + uid;
                            return `<div class="kpi-btn kpi-ring-btn" onclick="${onclick}" id="kbtn_${uid}">
                                <div style="position:relative;width:${C*2}px;height:${C*2}px;margin:0 auto 8px">
                                    <svg width="${C*2}" height="${C*2}" viewBox="0 0 ${C*2} ${C*2}" style="position:absolute;top:0;left:0;overflow:visible">
                                        <defs>
                                            <filter id="${glowId}" x="-40%" y="-40%" width="180%" height="180%">
                                                <feGaussianBlur stdDeviation="3" result="blur"/>
                                                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                                            </filter>
                                            <linearGradient id="grad_${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
                                                <stop offset="100%" stop-color="${glowColor}" stop-opacity="0.85"/>
                                            </linearGradient>
                                        </defs>
                                        <!-- track -->
                                        <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="${STROKE}"/>
                                        <!-- fill arc -->
                                        <circle id="arc_${uid}" cx="${C}" cy="${C}" r="${R}" fill="none"
                                            stroke="url(#grad_${uid})"
                                            stroke-width="${STROKE}" stroke-linecap="round"
                                            stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
                                            transform="rotate(-90 ${C} ${C})"
                                            filter="url(#${glowId})"
                                            style="transition:stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)"/>
                                        ${pulse ? `<!-- pulse ring --><circle cx="${C}" cy="${C}" r="${R+6}" fill="none" stroke="${color}" stroke-width="1" opacity="0" style="animation:kpiPulse_${uid} 2.4s ease-out infinite"/>` : ''}
                                    </svg>
                                    <!-- center icon + value -->
                                    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="opacity:0.7">
                                            ${iconPath}
                                        </svg>
                                        <span style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:900;color:${color};line-height:1">${val}</span>
                                    </div>
                                </div>
                                <div style="font-size:9px;font-weight:900;letter-spacing:1px;color:rgba(255,255,255,0.35);text-transform:uppercase">${label}</div>
                            </div>`;
                        }

                        const checkIcon = '<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
                        const alertIcon = '<path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
                        const boltIcon  = '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

                        const pctCheck = percT;
                        const pctUC    = totalUC > 0 ? Math.min(100, Math.round((totalUC / 200) * 100)) : 0;
                        const pctAcoes = acoesPrio.length > 0 ? Math.min(100, Math.round((acoesPrio.length / 10) * 100)) : 0;

                        const r1 = ring(pctCheck, percT===100?'#10B981':'#FF8C00', percT===100?'#34d399':'#FFB347', percT+'%', 'CHECKLIST', checkIcon, "APP.view('detalheTarefas')", 'ck', percT===100);
                        const r2 = ring(totalUC>0?100:0, '#EF4444', '#f87171', totalUC, 'GARGALOS', alertIcon, "APP.view('detalheUC')", 'uc', totalUC>0);
                        const r3 = ring(pctAcoes, '#F59E0B', '#fcd34d', acoesPrio.length, 'AÇÕES', boltIcon, "APP.view('acoesPrioritarias')", 'ac', acoesPrio.length>0);

                        return r1 + r2 + r3;
                    })()}
                </div>
                <style>
                    .kpi-ring-btn { cursor:pointer; padding:14px 5px; transition:transform 0.2s, border-color 0.2s; }
                    .kpi-ring-btn:hover { transform:translateY(-2px); border-color:rgba(255,255,255,0.1) !important; }
                    .kpi-ring-btn:active { transform:scale(0.96); }
                    @keyframes kpiPulse_ck { 0%,100%{opacity:0;transform:scale(0.9)} 50%{opacity:0.25;transform:scale(1.1)} }
                    @keyframes kpiPulse_uc { 0%,100%{opacity:0;transform:scale(0.9)} 50%{opacity:0.3;transform:scale(1.1)} }
                    @keyframes kpiPulse_ac { 0%,100%{opacity:0;transform:scale(0.9)} 50%{opacity:0.25;transform:scale(1.1)} }
                </style>

                <!-- SKU MATRIX -->
                <div class="op-card no-pad overflow-hid margin-t-10">
                    <div class="intel-header" onclick="APP.actions.toggleSkuMatrix()">
                        <span class="label">SKUs QUE IMPACTAM O RESULTADO</span>
                        <span class="material-symbols-outlined" style="transition:transform .3s;${APP.ui.skuMatrixAberta?'transform:rotate(180deg)':''}">expand_more</span>
                    </div>
                    <div class="${APP.ui.skuMatrixAberta?'':'display-none'} pad-15">
                        <div style="display:flex;gap:4px;margin-bottom:10px">
                            <button onclick="APP.actions.setSkuTab('drag')" class="pos-tag ${APP.ui.skuTab!=='boost'?'btn-action':''}" style="flex:1;font-size:8px;padding:5px;letter-spacing:1px">▼ PERDENDO</button>
                            <button onclick="APP.actions.setSkuTab('boost')" class="pos-tag ${APP.ui.skuTab==='boost'?'btn-action':''}" style="flex:1;font-size:8px;padding:5px;letter-spacing:1px">▲ GANHANDO</button>
                        </div>
                        ${(APP.ui.skuTab==='boost'?topBoosts:topDrags).map(d => {
                            const isNeg  = d.gapAbsoluto > 0;
                            const valRef = APP.db.produtos.find(p => p.id === d.id);
                            const valImp = valRef ? brl(valRef.valTotal) : '—';
                            const statCor = d.vMinha===0 ? 'var(--danger)' : 'var(--warning)';
                            const statTxt = d.vMinha===0 ? 'SEM VENDA' : `${(100-d.loss).toFixed(0)}% EFIC.`;
                            return `<div style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--border-color)">
                                <b class="mono" style="font-size:11px;color:var(--primary)">${esc(d.id)}</b>
                                <div>
                                    <div style="font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${esc(d.desc.substring(0,28))}</div>
                                    <div style="display:flex;gap:4px;margin-top:3px">
                                        <span style="font-family:'JetBrains Mono',monospace;font-size:7px;padding:1px 5px;border-radius:2px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:${statCor}">${statTxt}</span>
                                        <span class="micro-txt txt-muted">R$ ${valImp}</span>
                                    </div>
                                </div>
                                <div style="text-align:right">
                                    <div style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;color:${isNeg?'var(--danger)':'var(--success)'}">${isNeg?'-':'+'}${Math.abs(d.gapAbsoluto)}un</div>
                                    <div class="micro-txt txt-muted">${isNeg?'-':'+'}${Math.abs(d.loss).toFixed(0)}%</div>
                                </div>
                            </div>`;
                        }).join('') || '<div class="centered opacity-5 pad-10">Sem dados</div>'}
                        <button class="pos-tag btn-action margin-t-10" style="width:100%" onclick="APP.view('projetor')">VER TODOS OS DUELOS →</button>
                    </div>
                </div>

                <!-- TREND -->
                <div class="op-card no-pad overflow-hid margin-t-10">
                    <div onclick="APP.actions.toggleRanking()" class="intel-header">
                        <span class="label">INTELIGÊNCIA DE MERCADO
                            ${APP.rankings.growth[0]?.isMock
                                ? '<span class="badge-mock" title="Dados estimados. Forneça pdvAnterior.json para dados reais.">ESTIMADO</span>'
                                : '<span class="badge-real">DADOS REAIS</span>'}
                        </span>
                        <span class="material-symbols-outlined" style="transition:transform .3s;${APP.ui.rankingAberto?'transform:rotate(180deg)':''}">expand_more</span>
                    </div>
                    <div class="${APP.ui.rankingAberto?'':'display-none'} pad-15">
                        <div class="dual-grid">
                            <div>
                                <div class="label txt-success">▲ GROWTH</div>
                                ${APP.rankings.growth.map(r => `<div class="trend-item"><div class="trend-header"><b>${esc(r.id)}</b><span class="trend-up">+${esc(String(r.perc))}%</span></div><div class="trend-desc">${esc(r.desc.substring(0,25))}</div><div class="trend-qty micro-txt">${esc(String(r.qAtual))} → ant:${esc(String(Math.round(r.qAnterior)))}</div></div>`).join('')}
                            </div>
                            <div>
                                <div class="label txt-danger">▼ DECLINE</div>
                                ${APP.rankings.decline.map(r => `<div class="trend-item"><div class="trend-header"><b>${esc(r.id)}</b><span class="trend-down">${esc(String(r.perc))}%</span></div><div class="trend-desc">${esc(r.desc.substring(0,25))}</div><div class="trend-qty micro-txt">${esc(String(r.qAtual))} → ant:${esc(String(Math.round(r.qAnterior)))}</div></div>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>`;
        },

        acoesPrioritarias() {
            const acoes = APP._gerarAcoesPrioritarias();
            const done  = acoes.filter(a => a.done).length;
            return `
                <div class="op-card">
                    <div class="flex-between"><span class="label">PLANO DE AÇÃO DO DIA</span><span class="micro-txt txt-muted">${done}/${acoes.length} concluídas</span></div>
                    <div style="background:var(--border-color);height:3px;border-radius:2px;overflow:hidden;margin:10px 0 14px">
                        <div style="width:${acoes.length?Math.round((done/acoes.length)*100):0}%;height:100%;background:var(--success);transition:width .6s ease;border-radius:2px"></div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px">
                        ${acoes.map((a, i) => {
                            const acol = a.urgencia==='alta' ? 'var(--danger)' : a.urgencia==='media' ? 'var(--warning)' : 'var(--success)';
                            return `<div onclick="APP.actions.toggleAcao(${i})" style="display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-radius:7px;background:var(--bg);border:1px solid var(--border-color);opacity:${a.done?.45:1};cursor:pointer;transition:opacity .2s">
                                <div style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;background:${acol}22;border:1px solid ${acol}55;color:${acol}">${i+1}</div>
                                <div>
                                    <div style="font-size:11px;font-weight:600;${a.done?'text-decoration:line-through':''}">${esc(a.desc)}</div>
                                    <div class="micro-txt txt-muted" style="margin-top:2px">${esc(a.meta)}</div>
                                </div>
                                <div style="text-align:right;flex-shrink:0">
                                    <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:${acol}">${esc(a.val)}</div>
                                    <div style="width:18px;height:18px;border:1px solid ${a.done?'var(--success)':'var(--border-color)'};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;margin-top:4px;margin-left:auto;background:${a.done?'rgba(16,185,129,.15)':'transparent'};color:var(--success)">${a.done?'✓':''}</div>
                                </div>
                            </div>`;
                        }).join('') || '<div class="centered opacity-5 pad-20">Nenhuma ação gerada</div>'}
                    </div>
                    <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR</button>
                </div>`;
        },

        detalheCriticos(corAlvo) {
            const cor = corAlvo ?? 'yellow';
            const titulos     = { yellow: 'ZONA CRÍTICA (PKL 1–2 UNIDADES)', red: 'RUPTURAS (ZERADO TOTAL + FALSO ZERO)', green: 'ESTOQUE SAUDÁVEL' };
            const coresBorder = { yellow: 'border-warning', red: 'border-danger', green: 'border-success' };
            const lista = APP.db.produtos.filter(p => p.categoriaCor === cor).sort((a, b) => b.scoreCriticidade - a.scoreCriticidade);
            return `
                <div class="op-card ${coresBorder[cor]}">
                    <span class="label">${titulos[cor]}</span>
                    <div class="margin-t-15">
                        ${lista.map(p => {
                            const bgBord = p.categoriaCor==='yellow'?'warning':p.categoriaCor==='red'?'danger':'success';
                            const nomeFornecedor = APP.db.fornecedorMap.get(p.id) ?? 'Consultar Compras';
                            const subLabel = p.subStatus==='falso-zero' ? '<span class="badge-sub">FALSO ZERO</span>' : p.subStatus==='pkl-critico' ? '<span class="badge-sub">PKL CRÍTICO</span>' : '';
                            return `<div class="op-card margin-b-10" style="border-left:4px solid var(--${bgBord})">
                                <div class="flex-between">
                                    <b class="mono font-18">${esc(p.id)}</b>
                                    <span class="badge" style="background:var(--bg);color:var(--text-main)">R$ ${brl(p.valTotal)}</span>
                                </div>
                                <div class="bold-desc margin-t-5">${esc(p.desc)}</div>
                                ${subLabel}
                                <div class="micro-txt txt-primary bold-desc margin-t-5">FORNECEDOR: ${esc(nomeFornecedor)}</div>
                                <div class="end-box-clean micro-txt margin-t-10">
                                    <span>PKL: <b>${esc(String(p.pkl))} un</b></span>
                                    <span>TOTAL: <b>${esc(String(p.total))} un</b></span>
                                </div>
                                <button class="pos-tag btn-action margin-t-10" onclick="APP.actions.preencher('${esc(p.id)}')">LANÇAR REPOSIÇÃO</button>
                            </div>`;
                        }).join('') || '<div class="centered opacity-5 pad-20">NENHUM ITEM NESTA CATEGORIA</div>'}
                    </div>
                    <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR AO DASHBOARD</button>
                </div>`;
        },

        detalheInconsistencias() {
            const lista = APP.rankings.meta.inconsistentes;
            return `
                <div class="op-card border-danger">
                    <span class="label txt-danger">⚠ INCONSISTÊNCIAS — VENDA SEM ESTOQUE</span>
                    <div class="micro-txt margin-t-5" style="opacity:.7">SKUs com registro de venda no PDV mas estoque zerado. Verificar baixas, inventário ou transferências pendentes.</div>
                    <div class="margin-t-15">
                        ${lista.map(p => `<div class="op-card margin-b-10" style="border-left:3px solid var(--danger)">
                            <div class="flex-between"><b class="mono">${esc(p.id)}</b><span class="badge status-critico">SEM ESTOQUE</span></div>
                            <div class="bold-desc">${esc(p.desc)}</div>
                            <div class="micro-txt txt-danger margin-t-5">Valor referência: R$ ${brl(p.valTotal)}</div>
                        </div>`).join('') || '<div class="centered">Sem inconsistências.</div>'}
                    </div>
                    <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR</button>
                </div>`;
        },

        consultiveReport() {
            const top       = APP.rankings.topLeverage;
            const pullsDown = APP.rankings.duelos.slice(0, 3);
            return `
                <div class="op-card">
                    <div class="label txt-primary">INSIGHT CONSULTIVO: ALAVANCAGEM</div>
                    <div class="op-card border-success margin-t-15">
                        <div class="label micro-txt">SKU QUE MAIS IMPULSIONA SEU SETOR:</div>
                        <div class="bold-desc margin-t-10">${esc(top.desc)}</div>
                        <div class="flex-between margin-t-10">
                            <span class="micro-txt">K11: <b>${esc(String(top.vMinha))} un</b></span>
                            <span class="badge status-dominio">DOMÍNIO ABSOLUTO</span>
                        </div>
                    </div>
                    <div class="label txt-danger margin-t-20 margin-b-10">GAPS QUE PUXAM SUA MÉDIA PARA BAIXO</div>
                    ${pullsDown.map(p => `<div class="end-box-alert">
                        <div class="flex-between"><b class="mono">${esc(p.id)}</b><b class="txt-danger">−${esc(String(p.gapAbsoluto))} un vs Alvo</b></div>
                        <div class="micro-txt">${esc(p.desc)}</div>
                    </div>`).join('')}
                    <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR AO DASHBOARD</button>
                </div>`;
        },

        detalheUC() {
            // ── Contadores para o painel de resumo ──────────────────────────
            const cnt = { ruptura: 0, aereo: 0, reserva: 0, pkl: 0 };
            APP.db.ucGlobal.forEach(g => {
                if (g.status === 'RUPTURA')                            cnt.ruptura++;
                else if (g.status.includes('AÉREO'))                  cnt.aereo++;
                else if (g.status.includes('RESERVA') && g.ael === 0) cnt.reserva++;
                else                                                   cnt.pkl++;
            });
            const scoreMax = APP.db.ucGlobal[0]?.scoreGargalo || 1;

            const COR = { danger: 'var(--danger)', warning: 'var(--warning)' };

            return `
                <div>
                    <!-- ── PAINEL RESUMO ─────────────────────────────── -->
                    <div class="op-card" style="padding:14px">
                        <div class="label" style="margin-bottom:10px">
                            UC GLOBAL · ${APP.db.ucGlobal.length} GARGALOS DE ARMAZENAMENTO
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center">
                            ${[
                                { n: cnt.ruptura, label: 'RUPTURA',  cor: 'danger',  icon: '⛔' },
                                { n: cnt.aereo,   label: 'AÉREO',    cor: 'danger',  icon: '🔼' },
                                { n: cnt.reserva, label: 'RESERVA',  cor: 'warning', icon: '📦' },
                                { n: cnt.pkl,     label: 'PKL↓',     cor: 'warning', icon: '⚠' },
                            ].map(c => `
                                <div style="background:rgba(${c.cor==='danger'?'239,68,68':'245,158,11'},0.1);border:1px solid rgba(${c.cor==='danger'?'239,68,68':'245,158,11'},0.3);border-radius:6px;padding:8px 4px">
                                    <div style="font-size:18px;font-weight:900;font-family:'JetBrains Mono',monospace;color:var(--${c.cor})">${c.n}</div>
                                    <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:var(--${c.cor});margin-top:1px">${c.icon} ${c.label}</div>
                                </div>`).join('')}
                        </div>
                    </div>

                    <!-- ── CARDS POR GARGALO ────────────────────────── -->
                    ${APP.db.ucGlobal.map(item => {
                        const cor      = COR[item.corStatus];
                        const scorePct = Math.round((item.scoreGargalo / scoreMax) * 100);

                        // ── Posições PKL
                        const pklRows = item.deposPKL.map(d => `
                            <div class="uc-dep-row" style="--dep-cor:${item.pkl<=2?'var(--danger)':'var(--primary)'}">
                                <span class="uc-dep-label">PKL</span>
                                <span class="mono micro-txt" style="color:var(--text-muted)">${esc(d.pos)}</span>
                                <b style="color:${item.pkl<=2?'var(--danger)':'var(--primary)'}">${esc(String(d.q))} un</b>
                            </div>`).join('');

                        // ── Posições AEL
                        const aelRows = item.deposAEL.map(d => `
                            <div class="uc-dep-row" style="--dep-cor:var(--warning)">
                                <span class="uc-dep-label" style="background:rgba(245,158,11,0.15);color:var(--warning);border-color:rgba(245,158,11,0.4)">AEL</span>
                                <span class="mono micro-txt" style="color:var(--text-muted)">${esc(d.pos)}</span>
                                <b class="txt-warning">${esc(String(d.q))} un</b>
                            </div>`).join('');

                        // ── Posições RES
                        const resRows = item.deposRES.map(d => `
                            <div class="uc-dep-row" style="--dep-cor:#60a5fa">
                                <span class="uc-dep-label" style="background:rgba(96,165,250,0.12);color:#60a5fa;border-color:rgba(96,165,250,0.35)">RES</span>
                                <span class="mono micro-txt" style="color:var(--text-muted)">${esc(d.pos)}</span>
                                <b style="color:#60a5fa">${esc(String(d.q))} un</b>
                            </div>`).join('');

                        // ── Bloco de agendamento
                        const ag = item.agendamento;
                        const agendHTML = ag
                            ? `<div style="margin-top:8px;padding:10px 12px;border-radius:6px;background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.25)">
                                <!-- Linha 1: Fornecedor + Doca -->
                                <div class="flex-between" style="align-items:flex-start;gap:6px">
                                    <span class="micro-txt txt-success" style="font-weight:800;line-height:1.3">📦 ${esc(ag.fornecedor)}</span>
                                    <span style="font-size:9px;padding:2px 7px;border-radius:3px;font-weight:900;letter-spacing:0.5px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:var(--success);flex-shrink:0">${esc(ag.doca) || 'S/DOCA'}</span>
                                </div>
                                <!-- Linha 2: Pedido(s) + NF(s) -->
                                <div class="flex-between margin-t-5">
                                    <span class="micro-txt txt-muted">Pedido: <b style="color:var(--text-main)">${ag.pedidos.join(', ')}</b></span>
                                    ${ag.nfs.length ? `<span class="micro-txt txt-muted">NF: <b style="color:var(--text-main)">${ag.nfs.join(', ')}</b></span>` : ''}
                                </div>
                                <!-- Linha 3: Qtd Agendada + Qtd Confirmada NF -->
                                <div class="flex-between margin-t-5">
                                    <span class="micro-txt txt-muted">Agendado: <b class="txt-success">${ag.qtdAgendada} un</b></span>
                                    <span class="micro-txt txt-muted">Conf. NF: <b class="${ag.qtdConfirmada > 0 ? 'txt-success' : 'txt-muted'}">${ag.qtdConfirmada} un</b></span>
                                </div>
                                <!-- Linha 4: Janela de agendamento -->
                                <div class="flex-between margin-t-5">
                                    <span class="micro-txt txt-muted">Início: <b style="color:var(--text-main)">${esc(ag.dataInicio)}</b></span>
                                    ${ag.dataFim && ag.dataFim !== ag.dataInicio ? `<span class="micro-txt txt-muted">Fim: <b style="color:var(--text-main)">${esc(ag.dataFim)}</b></span>` : ''}
                                    ${ag.idAgendamento ? `<span class="micro-txt txt-muted">ID: <b style="color:var(--text-main)">${esc(ag.idAgendamento)}</b></span>` : ''}
                                </div>
                               </div>`
                            : `<div style="margin-top:8px;padding:5px 10px;border-radius:5px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.18)">
                                <span class="micro-txt" style="color:var(--danger)">⚠ Sem agendamento de fornecedor</span>
                               </div>`;

                        // ── Badge de status
                        const statusBadge = `<span style="font-size:9px;padding:2px 8px;border-radius:3px;font-weight:900;letter-spacing:0.8px;background:${cor}22;border:1px solid ${cor}55;color:${cor}">${esc(item.status)}</span>`;

                        // ── Ação recomendada contextual
                        const acaoTxt = item.pkl === 0
                            ? (item.ael > 0 ? 'BAIXAR DO AÉREO PARA PKL' : 'TRAZER DA RESERVA PARA PKL')
                            : 'COMPLETAR PKL';

                        return `
                        <div class="op-card margin-b-10" style="border-left:4px solid ${cor}">
                            <!-- Cabeçalho: ID + status + valor -->
                            <div class="flex-between" style="align-items:flex-start;gap:8px">
                                <div>
                                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                                        <b class="mono" style="font-size:15px;color:${cor}">${esc(item.id)}</b>
                                        ${statusBadge}
                                    </div>
                                    <div class="bold-desc margin-t-5">${esc(item.desc)}</div>
                                </div>
                                <div style="text-align:right;flex-shrink:0">
                                    <div class="micro-txt txt-muted">Valor</div>
                                    <div style="font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace">R$ ${brl(item.valTotal)}</div>
                                </div>
                            </div>

                            <!-- Gauge PKL / AEL / RES -->
                            <div style="display:grid;grid-template-columns:${item.ael>0&&item.res>0?'1fr 1fr 1fr':(item.ael>0||item.res>0)?'1fr 1fr':'1fr'};gap:6px;margin:10px 0">
                                <!-- PKL -->
                                <div style="background:var(--bg);border-radius:5px;padding:8px;text-align:center;border:1px solid ${item.pkl<=2?'rgba(239,68,68,0.4)':'var(--border-color)'}">
                                    <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:${item.pkl<=2?'var(--danger)':item.pkl<=5?'var(--warning)':'var(--primary)'};margin-bottom:2px">PKL</div>
                                    <div style="font-size:22px;font-weight:900;font-family:'JetBrains Mono',monospace;line-height:1;color:${item.pkl===0?'var(--danger)':item.pkl<=2?'var(--danger)':item.pkl<=5?'var(--warning)':'var(--primary)'}">${item.pkl}</div>
                                    <div class="micro-txt txt-muted" style="margin-top:2px">cap: ${item.capMax}</div>
                                    <div style="height:3px;background:var(--border-color);border-radius:2px;overflow:hidden;margin-top:5px">
                                        <div style="width:${item.pklPct}%;height:100%;border-radius:2px;background:${item.pkl===0?'var(--danger)':item.pkl<=2?'var(--danger)':item.pkl<=5?'var(--warning)':'var(--primary)'}"></div>
                                    </div>
                                </div>
                                <!-- AEL (só se tiver) -->
                                ${item.ael > 0 ? `
                                <div style="background:var(--bg);border-radius:5px;padding:8px;text-align:center;border:1px solid rgba(245,158,11,0.35)">
                                    <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:var(--warning);margin-bottom:2px">AÉREO ↓</div>
                                    <div style="font-size:22px;font-weight:900;font-family:'JetBrains Mono',monospace;line-height:1;color:var(--warning)">${item.ael}</div>
                                    <div class="micro-txt txt-muted" style="margin-top:2px">a descer</div>
                                    <div style="height:3px;background:rgba(245,158,11,0.15);border-radius:2px;overflow:hidden;margin-top:5px">
                                        <div style="width:100%;height:100%;border-radius:2px;background:var(--warning)"></div>
                                    </div>
                                </div>` : ''}
                                <!-- RES (só se tiver) -->
                                ${item.res > 0 ? `
                                <div style="background:var(--bg);border-radius:5px;padding:8px;text-align:center;border:1px solid rgba(96,165,250,0.35)">
                                    <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:#60a5fa;margin-bottom:2px">RESERVA ↓</div>
                                    <div style="font-size:22px;font-weight:900;font-family:'JetBrains Mono',monospace;line-height:1;color:#60a5fa">${item.res}</div>
                                    <div class="micro-txt txt-muted" style="margin-top:2px">a liberar</div>
                                    <div style="height:3px;background:rgba(96,165,250,0.12);border-radius:2px;overflow:hidden;margin-top:5px">
                                        <div style="width:100%;height:100%;border-radius:2px;background:#60a5fa"></div>
                                    </div>
                                </div>` : ''}
                            </div>

                            <!-- Barra de criticidade -->
                            <div style="margin-bottom:10px">
                                <div class="flex-between micro-txt" style="margin-bottom:3px">
                                    <span class="txt-muted">URGÊNCIA</span>
                                    <span style="color:${cor};font-weight:700">${scorePct}%</span>
                                </div>
                                <div style="height:4px;background:var(--border-color);border-radius:2px;overflow:hidden">
                                    <div style="width:${scorePct}%;height:100%;background:${cor};border-radius:2px;transition:width .6s ease"></div>
                                </div>
                            </div>

                            <!-- Posições detalhadas -->
                            ${pklRows}${aelRows}${resRows}

                            <!-- Agendamento de fornecedor -->
                            ${agendHTML}

                            <!-- CTA contextual -->
                            <button class="pos-tag btn-action margin-t-10"
                                    onclick="APP.actions.preencher('${esc(item.id)}')">
                                ${esc(acaoTxt)}
                            </button>
                        </div>`;
                    }).join('') || '<div class="op-card centered opacity-5" style="padding:30px">NENHUM GARGALO DETECTADO</div>'}

                    <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR AO DASHBOARD</button>
                </div>`;
        },

        operacional() {
            const filaHTML = APP.db.fila.length === 0
                ? '<div class="op-card centered opacity-5">FILA VAZIA — Deslize card para remover</div>'
                : APP.db.fila.map((t, i) => `
                    <div class="op-card swipe-item" style="background:rgba(16,185,129,0.05);border-color:rgba(16,185,129,0.2)" data-fila-idx="${i}">
                        <div class="flex-between">
                            <div>
                                <b class="mono font-18">${esc(t.id)}</b>
                                <div class="micro-txt txt-muted">${esc(t.desc)}</div>
                                <b class="txt-primary">QTD: ${esc(String(t.qtdSolicitada))}</b>
                            </div>
                            <span class="material-symbols-outlined btn-done" onclick="APP.actions.remFila(${i})">task_alt</span>
                        </div>
                        <div class="margin-t-10">
                            ${t.depositos.map(d => `<div class="end-box-clean mono micro-txt"><span>${esc(d.tipo)} | <b>${esc(d.pos)}</b></span><b>${esc(String(d.q))} un</b></div>`).join('')}
                        </div>
                        <div class="micro-txt txt-muted margin-t-5" style="opacity:.4">← deslize para remover</div>
                    </div>`).join('');

            return `
                <div>
                    <div class="op-card pad-20">
                        <span class="label">BIPAR SKU</span>
                        <input type="number" id="sk-in" class="op-input margin-t-10" inputmode="numeric" placeholder="Código SKU" autocomplete="off">
                        <input type="number" id="qt-in" class="op-input margin-t-10" placeholder="QTD" inputmode="numeric">
                        <button onclick="APP.actions.addFila()" class="pos-tag btn-action margin-t-10">LANÇAR NA FILA</button>
                    </div>
                    <div class="flex-between margin-t-15" style="padding:0 4px">
                        <span class="label">FILA DE ROTAS ${APP.db.fila.length>0?`<span class="badge-count">${APP.db.fila.length}</span>`:''}</span>
                        <div style="display:flex;gap:8px">
                            ${APP.db.fila.length > 0 ? `
                                <button class="micro-btn-danger" onclick="APP.actions.exportarFila()">EXPORTAR</button>
                                <button class="micro-btn-danger" onclick="APP.actions.limparFila()">LIMPAR</button>` : ''}
                        </div>
                    </div>
                    <div class="margin-t-10">${filaHTML}</div>
                </div>`;
        },

        rastreio() {
            return `
                <div class="op-card">
                    <span class="label">RASTREIO DE FLUXO INDUSTRIAL</span>
                    <input type="number" id="sk-r" class="op-input margin-t-10" placeholder="SKU..." inputmode="numeric" autocomplete="off">
                    <button onclick="APP.actions.rastrear()" class="pos-tag margin-t-10">PESQUISAR HISTÓRICO</button>
                </div>
                <div id="res-investigar" class="margin-b-80"></div>`;
        },

        projetor() {
            const q    = APP.ui.buscaDuelo.toLowerCase();
            const lista = APP.rankings.duelos.filter(x => x.id.includes(APP.ui.buscaDuelo) || x.desc.toLowerCase().includes(q));
            return `
                <div class="duel-selector">
                    ${['mesquita', 'jacarepagua', 'benfica'].map(l => `<button class="alvo-btn ${APP.ui.pdvAlvo===l?'active':''}" onclick="APP.actions.mudarAlvo('${l}')">${l.toUpperCase()}</button>`).join('')}
                </div>
                <div class="op-card margin-t-10">
                    <div class="label">LOSS GAP IMPACTO (TOP 10): ${esc(APP.rankings.meta.lossGap)}%</div>
                    <input type="text" placeholder="BUSCAR SKU OU DESCRIÇÃO..." class="op-input margin-t-10" oninput="APP.actions.filtrarDuelo(this.value)" value="${esc(APP.ui.buscaDuelo)}">
                </div>
                <div class="margin-b-80">
                    ${lista.map(g => `<div class="op-card duel-border" style="border-left-color:${g.gapAbsoluto>10?'var(--danger)':'var(--success)'}">
                        <div class="flex-between">
                            <b class="mono">${esc(g.id)}</b>
                            <div class="gap-impact-badge">${g.dominando?`<span class="txt-success">+${Math.abs(g.gapAbsoluto)} un</span>`:`GAP: −${esc(String(g.gapAbsoluto))} un`}</div>
                        </div>
                        <div class="bold-desc margin-t-5">${esc(g.desc)}</div>
                        <div class="duel-grid-stats margin-t-10">
                            <div><div class="label micro">K11</div><b>${esc(String(g.vMinha))}</b></div>
                            <div><div class="label micro">${esc(APP.ui.pdvAlvo.toUpperCase())}</div><b>${esc(String(g.vAlvo))}</b></div>
                            <div><div class="label micro">EFICIÊNCIA</div><b class="${g.loss>50?'txt-danger':''}">${(100-g.loss).toFixed(1)}%</b></div>
                        </div>
                    </div>`).join('')}
                </div>`;
        },

        estoque() {
            const f    = APP.ui.filtroEstoque;
            const busca = APP.ui.buscaEstoque.toLowerCase();
            const lista = APP.db.produtos
                .filter(p => p.status === f && (!busca || p.id.toLowerCase().includes(busca) || p.desc.toLowerCase().includes(busca)))
                .sort((a, b) => b.scoreCriticidade - a.scoreCriticidade);
            return `
                <div class="kpi-row">
                    <div class="kpi-btn ${f==='ruptura'?'btn-selected-danger':''}" onclick="APP.actions.setFiltroEstoque('ruptura')">RUPTURAS <span class="badge-count">${APP.rankings.pieStats.red}</span></div>
                    <div class="kpi-btn ${f==='abastecimento'?'btn-selected-primary':''}" onclick="APP.actions.setFiltroEstoque('abastecimento')">REPOSIÇÃO <span class="badge-count">${APP.rankings.pieStats.yellow}</span></div>
                </div>
                <input type="text" placeholder="BUSCAR SKU OU PRODUTO..." class="op-input margin-t-10" oninput="APP.actions.filtrarEstoque(this.value)" value="${esc(APP.ui.buscaEstoque)}">
                <div class="margin-b-80 margin-t-10">
                    ${lista.map(p => `<div class="op-card" onclick="APP.actions.preencher('${esc(p.id)}')">
                        <div class="flex-between"><b class="mono">${esc(p.id)}</b><b>${esc(String(p.total))} UN</b></div>
                        <div class="bold-desc margin-t-5">${esc(p.desc)}</div>
                        ${p.subStatus!=='ok'?`<span class="badge-sub">${esc(p.subStatus)}</span>`:''}
                        ${p.depositos.map(d => `<div class="end-box-mini mono margin-t-5"><span>${esc(d.tipo)} | <b>${esc(d.pos)}</b></span><b>${esc(String(d.q))}</b></div>`).join('')}
                    </div>`).join('') || '<div class="centered opacity-5 pad-20">Nenhum item encontrado</div>'}
                </div>`;
        },

        detalheTarefas() {
            const done  = APP.db.tarefas.filter(t => t.done).length;
            const total = APP.db.tarefas.length;
            const pct   = total > 0 ? Math.round((done/total)*100) : 0;
            return `
                <div class="op-card">
                    <div class="flex-between">
                        <span class="label">CONFERÊNCIA DE ROTINA</span>
                        <span class="micro-txt">${done}/${total} — ${pct}%</span>
                    </div>
                    <div style="height:4px;background:var(--border-color);border-radius:2px;overflow:hidden;margin:10px 0">
                        <div style="width:${pct}%;height:100%;background:${pct===100?'var(--success)':'var(--primary)'};border-radius:2px;transition:width .5s"></div>
                    </div>
                    <div class="margin-t-10">
                        ${APP.db.tarefas.map(t => `<div class="task-line ${t.done?'done':''}">
                            <span>${esc(t.task)}</span>
                            <span class="material-symbols-outlined" onclick="APP.actions.toggleTask(${t.id})">${t.done?'check_box':'check_box_outline_blank'}</span>
                        </div>`).join('')}
                    </div>
                    <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR</button>
                </div>`;
        },

        recebimento() {
            const lista = APP.db.agendamentos;
            const COR_STATUS   = { red: 'var(--danger)', yellow: 'var(--warning)', green: 'var(--success)', 'sem-estoque': 'var(--text-muted)' };
            const LABEL_STATUS = { red: 'RUPTURA', yellow: 'PKL CRÍTICO', green: 'SAUDÁVEL', 'sem-estoque': 'SEM ESTOQUE' };

            // Agrupa por fornecedor
            const porFornecedor = new Map();
            lista.forEach(ag => {
                if (!porFornecedor.has(ag.fornecedor)) porFornecedor.set(ag.fornecedor, []);
                porFornecedor.get(ag.fornecedor).push(ag);
            });

            const totalItens = lista.length;
            const totalConf  = lista.reduce((a, b) => a + b.qtdConfirmada, 0);
            const fornCount  = porFornecedor.size;

            const cardsForn = [...porFornecedor.entries()].map(([forn, itens]) => {
                const qtdForn  = itens.reduce((a, b) => a + b.qtdAgendada, 0);
                const confForn = itens.reduce((a, b) => a + b.qtdConfirmada, 0);
                const doca     = itens[0]?.doca || 'S/DOCA';
                const dataIn   = itens[0]?.dataInicio || '';
                const dataFm   = itens[0]?.dataFim    || '';
                const pedidos  = [...new Set(itens.flatMap(i => i.pedidos))];
                const nfs      = [...new Set(itens.flatMap(i => i.nfs))];
                const idAgend  = itens[0]?.idAgendamento || '';

                const skuRows = itens.map(ag => {
                    const cor = COR_STATUS[ag.status]   || 'var(--text-muted)';
                    const lbl = LABEL_STATUS[ag.status] || ag.status.toUpperCase();
                    return `<div style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:7px 10px;border-radius:5px;background:var(--bg);border:1px solid var(--border-color)">
                                <b class="mono" style="font-size:12px">${esc(ag.sku)}</b>
                                <div style="min-width:0">
                                    <div style="font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ag.desc)}</div>
                                    <div style="display:flex;gap:6px;margin-top:2px;align-items:center">
                                        <span style="font-size:8px;padding:1px 5px;border-radius:2px;font-weight:900;background:${cor}22;border:1px solid ${cor}44;color:${cor}">${lbl}</span>
                                        ${ag.pkl !== null ? `<span class="micro-txt txt-muted">PKL: <b style="color:${ag.pkl<=2?'var(--danger)':'var(--text-main)'}">${ag.pkl} un</b></span>` : ''}
                                    </div>
                                </div>
                                <div style="text-align:right;flex-shrink:0">
                                    <div style="font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--success)">${ag.qtdConfirmada} un</div>
                                    <div class="micro-txt txt-muted">agend: ${ag.qtdAgendada}</div>
                                </div>
                            </div>`;
                }).join('');

                return `<div class="op-card margin-b-10" style="border-left:3px solid var(--primary)">
                    <div class="flex-between" style="align-items:flex-start;gap:8px">
                        <div style="flex:1;min-width:0">
                            <div style="font-size:13px;font-weight:900;color:var(--primary);line-height:1.2">${esc(forn)}</div>
                            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px;align-items:center">
                                <span style="font-size:9px;padding:2px 7px;border-radius:3px;font-weight:900;letter-spacing:0.5px;background:rgba(255,140,0,0.12);border:1px solid rgba(255,140,0,0.3);color:var(--primary)">${esc(doca)}</span>
                                ${idAgend ? `<span class="micro-txt txt-muted">ID: <b>${esc(idAgend)}</b></span>` : ''}
                            </div>
                        </div>
                        <div style="text-align:right;flex-shrink:0">
                            <div style="font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--success)">${confForn} un conf.</div>
                            <div class="micro-txt txt-muted">${qtdForn} agendadas</div>
                        </div>
                    </div>
                    <div style="background:var(--bg);border-radius:5px;padding:8px 10px;margin:8px 0;border:1px solid var(--border-color)">
                        <div class="flex-between">
                            <span class="micro-txt txt-muted">Pedido: <b style="color:var(--text-main)">${esc(pedidos.join(', '))}</b></span>
                            ${nfs.length ? `<span class="micro-txt txt-muted">NF: <b style="color:var(--text-main)">${esc(nfs.join(', '))}</b></span>` : ''}
                        </div>
                        <div class="flex-between margin-t-5">
                            <span class="micro-txt txt-muted">Entrada: <b style="color:var(--text-main)">${esc(dataIn)}</b></span>
                            ${dataFm && dataFm !== dataIn ? `<span class="micro-txt txt-muted">Fim: <b style="color:var(--text-main)">${esc(dataFm)}</b></span>` : ''}
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:4px">${skuRows}</div>
                </div>`;
            }).join('');

            return `
                <div class="op-card" style="border-left:3px solid var(--primary)">
                    <div class="label">AGENDA DE RECEBIMENTO</div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;text-align:center">
                        <div style="background:var(--bg);border-radius:6px;padding:8px;border:1px solid var(--border-color)">
                            <div style="font-size:20px;font-weight:900;font-family:'JetBrains Mono',monospace;color:var(--primary)">${fornCount}</div>
                            <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:var(--text-muted);margin-top:2px">FORNECEDORES</div>
                        </div>
                        <div style="background:var(--bg);border-radius:6px;padding:8px;border:1px solid var(--border-color)">
                            <div style="font-size:20px;font-weight:900;font-family:'JetBrains Mono',monospace;color:var(--primary)">${totalItens}</div>
                            <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:var(--text-muted);margin-top:2px">SKUS AGENDADOS</div>
                        </div>
                        <div style="background:var(--bg);border-radius:6px;padding:8px;border:1px solid var(--border-color)">
                            <div style="font-size:20px;font-weight:900;font-family:'JetBrains Mono',monospace;color:var(--success)">${totalConf}</div>
                            <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:var(--text-muted);margin-top:2px">UN CONFIRMADAS</div>
                        </div>
                    </div>
                </div>
                <div class="margin-t-10 margin-b-80">
                    ${lista.length === 0
                        ? '<div class="op-card centered opacity-5" style="padding:30px">Nenhum agendamento carregado</div>'
                        : cardsForn
                    }
                </div>`;
        },

};
