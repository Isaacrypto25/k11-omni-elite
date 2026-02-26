/**
 * K11 OMNI ELITE — MODAL REGIONAL ULTRA-TECH v2.0
 * ═════════════════════════════════════════════════
 * Modal de dashboard com KPIs regionais, gráficos animados
 * e mapa interativo real do Estado do Rio de Janeiro.
 *
 * ATIVADO: clique no gráfico de performance do dash.
 *
 * Depende de: k11-config.js, k11-utils.js, k11-app.js
 * Carregado APÓS k11-app.js no dashboard.html.
 */

'use strict';

const K11Regional = (() => {

    // ─── LOJAS COM COORDENADAS REAIS (lat/lon → projeção SVG) ────
    // Referência geográfica do Estado do RJ para projeção Mercator simplificada
    const LOJAS = [
        {
            id:    'hidraulica',
            label: 'K11 HIDRÁULICA',
            city:  'Duque de Caxias',
            lat:   -22.785,
            lon:   -43.311,
            color: '#FF8C00',
            key:   'hidraulica',
            main:  true,
        },
        {
            id:    'mesquita',
            label: 'MESQUITA',
            city:  'Mesquita',
            lat:   -22.814,
            lon:   -43.434,
            color: '#3B82F6',
            key:   'mesquita',
        },
        {
            id:    'jacarepagua',
            label: 'JACAREPAGUÁ',
            city:  'Rio de Janeiro',
            lat:   -22.928,
            lon:   -43.367,
            color: '#8B5CF6',
            key:   'jacarepagua',
        },
        {
            id:    'benfica',
            label: 'BENFICA',
            city:  'Rio de Janeiro',
            lat:   -22.902,
            lon:   -43.239,
            color: '#10B981',
            key:   'benfica',
        },
    ];

    // Bounding box do RJ para normalização (aprox.)
    const MAP_BOUNDS = { minLat: -23.4, maxLat: -20.8, minLon: -44.9, maxLon: -40.9 };
    const MAP_W = 500, MAP_H = 340;
    const PAD = 30;

    function project(lat, lon) {
        const x = PAD + ((lon - MAP_BOUNDS.minLon) / (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon)) * (MAP_W - PAD * 2);
        const y = PAD + ((MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * (MAP_H - PAD * 2);
        return { x, y };
    }

    // ─── CONTORNO SIMPLIFICADO DO ESTADO DO RJ ───────────────────
    // Polígono SVG aproximado do contorno do Estado do Rio de Janeiro
    // Pontos extraídos de fontes públicas de domínio público (IBGE simplificado)
    const RJ_PATH = (() => {
        // Coordenadas lat/lon do contorno do RJ (simplificado, domínio público)
        const coords = [
            [-22.8, -44.9], [-22.3, -44.7], [-21.9, -44.3], [-21.5, -43.8],
            [-21.1, -43.4], [-21.0, -42.8], [-21.2, -42.1], [-21.5, -41.5],
            [-21.9, -41.0], [-22.3, -40.9], [-22.8, -41.1], [-23.1, -41.5],
            [-23.4, -42.0], [-23.4, -43.2], [-23.3, -44.0], [-23.1, -44.5],
            [-22.8, -44.9],
        ];
        const pts = coords.map(([lat, lon]) => {
            const p = project(lat, lon);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        });
        return `M${pts.join(' L')} Z`;
    })();

    // Baía de Guanabara (shape aproximado)
    const GUANABARA_PATH = (() => {
        const coords = [
            [-22.75, -43.15], [-22.78, -43.11], [-22.85, -43.10],
            [-22.92, -43.13], [-22.95, -43.18], [-22.90, -43.22],
            [-22.82, -43.22], [-22.75, -43.19], [-22.75, -43.15],
        ];
        const pts = coords.map(([lat, lon]) => {
            const p = project(lat, lon);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        });
        return `M${pts.join(' L')} Z`;
    })();

    // Grid de municípios (pontos de referência)
    const CIDADES_REF = [
        { name: 'Campos', lat: -21.75, lon: -41.33 },
        { name: 'Volta Redonda', lat: -22.52, lon: -44.10 },
        { name: 'Petrópolis', lat: -22.50, lon: -43.18 },
        { name: 'Niterói', lat: -22.88, lon: -43.10 },
        { name: 'Nova Iguaçu', lat: -22.76, lon: -43.45 },
        { name: 'São Gonçalo', lat: -22.83, lon: -43.05 },
        { name: 'Angra', lat: -22.97, lon: -44.32 },
    ];

    // ─── HELPERS DE DADOS ────────────────────────────────────────

    function getBM() { return APP.rankings?.benchmarking ?? { hidraulica: 0, mesquita: 0, jacarepagua: 0, benfica: 0 }; }
    function getPS() { return APP.rankings?.pieStats ?? { red: 0, yellow: 0, green: 0, total: 1 }; }
    function getMeta() { return APP.rankings?.meta ?? { lossGap: '0', valTotalRed: 0, valTotalYellow: 0 }; }

    function buildKPIs() {
        const ps   = getPS();
        const bm   = getBM();
        const meta = getMeta();
        const pctRuptura  = ps.total > 0 ? Math.round((ps.red    / ps.total) * 100) : 0;
        const pctSaudavel = ps.total > 0 ? Math.round((ps.green  / ps.total) * 100) : 0;
        const lossGap     = safeFloat(meta.lossGap ?? 0);
        const valRed      = safeFloat(meta.valTotalRed ?? 0);
        return [
            { label: 'SKUs Ruptura',    value: ps.red,       fmt: `${ps.red}`,        delta: `${pctRuptura}% portfólio`,    dir: ps.red > 0 ? 'down' : 'up',        accent: ps.red > 10 ? '#EF4444' : '#F59E0B' },
            { label: 'PKL Crítico',     value: ps.yellow,    fmt: `${ps.yellow}`,     delta: 'abastecimento urgente',        dir: ps.yellow > 5 ? 'down' : 'neu',    accent: '#F59E0B' },
            { label: 'Saúde Estoque',   value: pctSaudavel,  fmt: `${pctSaudavel}%`,  delta: `${ps.green} SKUs ok`,          dir: pctSaudavel > 70 ? 'up' : 'down', accent: pctSaudavel > 70 ? '#10B981' : '#EF4444' },
            { label: 'Loss Gap',        value: lossGap,      fmt: `${lossGap}%`,      delta: 'eficiência vs concorrente',   dir: lossGap > 20 ? 'down' : 'up',     accent: lossGap > 20 ? '#EF4444' : '#10B981' },
            { label: 'Valor em Risco',  value: valRed,       fmt: `R$${(valRed/1000).toFixed(0)}k`, delta: 'em rupturas',  dir: valRed > 0 ? 'down' : 'up',       accent: '#EF4444' },
            { label: 'Gargalos UC',     value: (APP.db?.ucGlobal ?? []).length, fmt: `${(APP.db?.ucGlobal ?? []).length}`, delta: 'fluxo travado', dir: (APP.db?.ucGlobal ?? []).length > 0 ? 'down' : 'up', accent: '#8B5CF6' },
        ];
    }

    function buildActivity() {
        const items = [];
        (APP.db?.ucGlobal ?? []).slice(0, 2).forEach(g => items.push({
            dot: g.corStatus === 'danger' ? '#EF4444' : '#F59E0B',
            txt: `UC PENDENTE · ${(g.desc ?? '').substring(0, 30)} — ${g.ael + g.res} un`,
            time: 'agora',
        }));
        (APP.db?.produtos ?? []).filter(p => p.categoriaCor === 'red').slice(0, 2).forEach(p => items.push({
            dot: '#EF4444',
            txt: `RUPTURA · SKU ${p.id} — ${(p.desc ?? '').substring(0, 24)}`,
            time: 'turno',
        }));
        (APP.rankings?.growth ?? []).slice(0, 1).forEach(r => items.push({
            dot: '#10B981',
            txt: `CRESCIMENTO · ${(r.desc ?? '').substring(0, 28)} +${r.perc}%`,
            time: 'semana',
        }));
        if (items.length === 0) items.push({ dot: '#4B5563', txt: 'Nenhuma atividade registrada no turno.', time: '' });
        return items.slice(0, 5);
    }

    function sparkData(base, points = 14) {
        const arr = [];
        let v = base;
        for (let i = 0; i < points; i++) {
            v = Math.max(0, v + (Math.random() - 0.48) * base * 0.18);
            arr.push(v);
        }
        return arr;
    }

    // ─── RENDERIZADORES ──────────────────────────────────────────

    function renderKPIs(kpis) {
        return kpis.map((k, i) => `
        <div class="rmo-kpi" style="--ka:${k.accent}" data-idx="${i}">
            <div class="rmo-kpi-label">${esc(k.label)}</div>
            <div class="rmo-kpi-val" style="color:${k.accent}">${esc(k.fmt)}</div>
            <div class="rmo-kpi-delta ${k.dir}">
                <span>${k.dir === 'up' ? '▲' : k.dir === 'down' ? '▼' : '▶'}</span>
                <span>${esc(k.delta)}</span>
            </div>
        </div>`).join('');
    }

    function renderDonut() {
        const ps    = getPS();
        const data  = [
            { l: 'RUPTURA',  v: ps.red,    c: '#EF4444' },
            { l: 'CRÍTICO',  v: ps.yellow, c: '#F59E0B' },
            { l: 'SAUDÁVEL', v: ps.green,  c: '#10B981' },
        ];
        const total = data.reduce((s, d) => s + d.v, 0) || 1;
        const r = 42, cx = 54, cy = 54, sw = 10;
        const circ = 2 * Math.PI * r;
        let offset = 0;
        const segs = data.map(d => {
            const frac = d.v / total;
            const dash = frac * circ;
            const seg  = { ...d, dash, gap: circ - dash, off: offset };
            offset += dash;
            return seg;
        });
        const pctGreen = Math.round((ps.green / total) * 100);

        const segsSVG = segs.map(s => `
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
                stroke="${s.c}" stroke-width="${sw}"
                stroke-dasharray="${s.dash.toFixed(2)} ${s.gap.toFixed(2)}"
                stroke-dashoffset="${(-s.off + circ / 4).toFixed(2)}"
                class="rmo-donut-seg" opacity="0.88"/>`).join('');

        const legend = data.map(d => `
            <div class="rmo-legend-row">
                <span class="rmo-legend-dot" style="background:${d.c}"></span>
                <span class="rmo-legend-txt">${d.l}</span>
                <span class="rmo-legend-val" style="color:${d.c}">${d.v}</span>
            </div>`).join('');

        return `
            <div class="rmo-donut-wrap">
                <svg viewBox="0 0 ${cx * 2} ${cy * 2}" width="118" height="118" class="rmo-donut-svg">
                    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="${sw}"/>
                    ${segsSVG}
                    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="monospace" font-size="16" font-weight="900" fill="#fff">${pctGreen}%</text>
                    <text x="${cx}" y="${cy + 9}" text-anchor="middle" font-family="monospace" font-size="7" fill="rgba(255,255,255,0.35)" letter-spacing="1">SAUDÁVEL</text>
                </svg>
                <div class="rmo-legend">${legend}</div>
            </div>`;
    }

    function renderBars() {
        const bm = getBM();
        const bars = [
            { l: 'K11 HIDRÁULICA', v: bm.hidraulica  ?? 0, c: '#FF8C00' },
            { l: 'MESQUITA',       v: bm.mesquita    ?? 0, c: '#3B82F6' },
            { l: 'JACAREPAGUÁ',    v: bm.jacarepagua ?? 0, c: '#8B5CF6' },
            { l: 'BENFICA',        v: bm.benfica     ?? 0, c: '#10B981' },
        ];
        const max = Math.max(...bars.map(b => b.v), 1);
        return bars.map((b, i) => `
            <div class="rmo-bar-row">
                <span class="rmo-bar-lbl">${b.l}</span>
                <div class="rmo-bar-track">
                    <div class="rmo-bar-fill" style="width:${(b.v / max * 100).toFixed(1)}%;background:${b.c};animation-delay:${i * 0.1}s"></div>
                </div>
                <span class="rmo-bar-num" style="color:${b.c}">${b.v}%</span>
            </div>`).join('');
    }

    function renderSpark(data, color, label) {
        const W = 210, H = 56, pad = 6;
        const pw = W - pad * 2, ph = H - pad * 2;
        const max = Math.max(...data, 1), min = Math.min(...data, 0), rng = max - min || 1;
        const pts = data.map((v, i) => {
            const x = pad + (i / (data.length - 1)) * pw;
            const y = pad + ph - ((v - min) / rng) * ph;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        const lastPt = pts[pts.length - 1].split(',');
        const areaClose = `${(pad + pw).toFixed(1)},${(pad + ph).toFixed(1)} ${pad},${(pad + ph).toFixed(1)}`;
        const uid = label.replace(/\W/g, '');
        return `
            <div class="rmo-spark-wrap">
                <div class="rmo-spark-label">${esc(label)}</div>
                <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">
                    <defs>
                        <linearGradient id="sg_${uid}" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stop-color="${color}" stop-opacity=".45"/>
                            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                    <polygon points="${pts.join(' ')} ${areaClose}" fill="url(#sg_${uid})"/>
                    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="3" fill="${color}" style="filter:drop-shadow(0 0 4px ${color})"/>
                </svg>
            </div>`;
    }

    // ─── MAPA INTERATIVO REAL ────────────────────────────────────

    function renderMap() {
        const bm  = getBM();
        const lojaData = LOJAS.map(l => ({
            ...l,
            val:   bm[l.key] ?? 0,
            proj:  project(l.lat, l.lon),
        }));
        const main = lojaData.find(l => l.main);
        const maxV = Math.max(...lojaData.map(l => l.val), 1);

        // Grid de fundo (latitude/longitude lines)
        const gridLines = [];
        for (let lat = -23.5; lat <= -21.0; lat += 0.5) {
            const p1 = project(lat, MAP_BOUNDS.minLon + 0.1);
            const p2 = project(lat, MAP_BOUNDS.maxLon - 0.1);
            gridLines.push(`<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-width="0.5"/>`);
        }
        for (let lon = -44.5; lon <= -41.0; lon += 0.5) {
            const p1 = project(MAP_BOUNDS.minLat + 0.1, lon);
            const p2 = project(MAP_BOUNDS.maxLat - 0.1, lon);
            gridLines.push(`<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-width="0.5"/>`);
        }

        // Cidades de referência (pontos cinza)
        const cidadesHTML = CIDADES_REF.map(c => {
            const p = project(c.lat, c.lon);
            return `
                <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2" fill="rgba(255,255,255,0.12)"/>
                <text x="${p.x.toFixed(1)}" y="${(p.y - 5).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="5" fill="rgba(255,255,255,0.2)" letter-spacing="0.3">${c.name}</text>`;
        }).join('');

        // Linhas de conexão animadas entre lojas e a principal
        const linesHTML = lojaData.filter(l => !l.main).map((l, i) => {
            const m = main.proj;
            return `
                <line x1="${m.x.toFixed(1)}" y1="${m.y.toFixed(1)}" x2="${l.proj.x.toFixed(1)}" y2="${l.proj.y.toFixed(1)}"
                    stroke="${l.color}" stroke-opacity="0.2" stroke-width="0.8" stroke-dasharray="4,5"/>
                <line x1="${m.x.toFixed(1)}" y1="${m.y.toFixed(1)}" x2="${l.proj.x.toFixed(1)}" y2="${l.proj.y.toFixed(1)}"
                    stroke="${l.color}" stroke-opacity="0.7" stroke-width="1"
                    stroke-dasharray="10,200" class="rmo-map-pulse" style="animation-delay:${i * 1.1}s"/>`;
        }).join('');

        // Nodes das lojas
        const nodesHTML = lojaData.map(l => {
            const pr = l.proj;
            const nodeR = l.main ? 9 : 5 + (l.val / maxV) * 5;
            const rankDelta = l.main ? '' : (l.val >= bm.hidraulica ? `<tspan fill="#10B981">▲</tspan>` : `<tspan fill="#EF4444">▼</tspan>`);
            return `
                <g class="rmo-map-node" data-id="${l.id}" data-key="${l.key}" style="cursor:pointer" onclick="K11Regional._nodeClick('${l.key}')">
                    ${l.main ? `<circle cx="${pr.x.toFixed(1)}" cy="${pr.y.toFixed(1)}" r="${nodeR + 6}" fill="none" stroke="${l.color}" stroke-width="1" opacity="0.15" class="rmo-node-ping"/>` : ''}
                    ${l.main ? `<circle cx="${pr.x.toFixed(1)}" cy="${pr.y.toFixed(1)}" r="${nodeR + 3}" fill="none" stroke="${l.color}" stroke-width="0.6" opacity="0.08"/>` : ''}
                    <circle cx="${pr.x.toFixed(1)}" cy="${pr.y.toFixed(1)}" r="${nodeR.toFixed(1)}"
                        fill="${l.color}" fill-opacity="0.92"
                        stroke="${l.color}" stroke-width="1.5" stroke-opacity="0.4"
                        style="filter:drop-shadow(0 0 ${l.main ? 8 : 4}px ${l.color})"/>
                    <text x="${pr.x.toFixed(1)}" y="${(pr.y - nodeR - 5).toFixed(1)}" text-anchor="middle"
                        font-family="monospace" font-size="${l.main ? 7 : 6.5}" font-weight="900"
                        fill="rgba(255,255,255,0.85)" letter-spacing="0.3">${l.label.substring(0, 10)}</text>
                    <text x="${pr.x.toFixed(1)}" y="${(pr.y + nodeR + 10).toFixed(1)}" text-anchor="middle"
                        font-family="monospace" font-size="6.5" font-weight="700" fill="${l.color}">
                        ${rankDelta}${l.val}%
                    </text>
                </g>`;
        }).join('');

        // Tooltip interativo (DOM element criado por JS depois)
        return `
            <div id="rmo-map-wrap" style="position:relative;border-radius:8px;overflow:hidden;background:linear-gradient(135deg,#06080f 0%,#0a0d16 100%);border:1px solid rgba(255,255,255,0.06)">
                <svg id="rmo-map-svg" viewBox="0 0 ${MAP_W} ${MAP_H}" style="width:100%;display:block" preserveAspectRatio="xMidYMid meet">
                    <defs>
                        <radialGradient id="rmo-glow-bg" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="rgba(255,140,0,0.06)"/>
                            <stop offset="100%" stop-color="transparent"/>
                        </radialGradient>
                        <filter id="rmo-blur-sm">
                            <feGaussianBlur stdDeviation="2"/>
                        </filter>
                    </defs>

                    <!-- Fundo gradiente -->
                    <rect width="${MAP_W}" height="${MAP_H}" fill="url(#rmo-glow-bg)"/>

                    <!-- Grid lat/lon -->
                    ${gridLines.join('')}

                    <!-- Contorno do estado RJ -->
                    <path d="${RJ_PATH}" fill="rgba(255,140,0,0.04)" stroke="rgba(255,140,0,0.25)" stroke-width="1.2" stroke-linejoin="round"/>

                    <!-- Baía de Guanabara -->
                    <path d="${GUANABARA_PATH}" fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.3)" stroke-width="0.8"/>
                    <text x="${project(-22.87, -43.17).x.toFixed(1)}" y="${project(-22.87, -43.17).y.toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="5" fill="rgba(59,130,246,0.45)" letter-spacing="0.5">BAÍA DE GUANABARA</text>

                    <!-- Cidades de referência -->
                    ${cidadesHTML}

                    <!-- Linhas de conexão -->
                    ${linesHTML}

                    <!-- Nodes das lojas -->
                    ${nodesHTML}

                    <!-- Label do estado -->
                    <text x="${(MAP_W * 0.15).toFixed(0)}" y="20" font-family="monospace" font-size="8" fill="rgba(255,140,0,0.3)" letter-spacing="2" font-weight="700">ESTADO DO RIO DE JANEIRO</text>
                </svg>

                <!-- Tooltip overlay -->
                <div id="rmo-map-tooltip" style="
                    display:none; position:absolute; pointer-events:none;
                    background:rgba(9,9,15,0.95); border:1px solid rgba(255,140,0,0.3);
                    border-radius:8px; padding:10px 14px; font-family:monospace;
                    box-shadow:0 8px 32px rgba(0,0,0,0.6); min-width:150px; z-index:10;
                "></div>

                <!-- Legenda do mapa -->
                <div style="position:absolute;bottom:8px;right:10px;display:flex;flex-direction:column;gap:4px">
                    <div style="font-size:7px;font-family:monospace;color:rgba(255,255,255,0.2);letter-spacing:1px;text-align:right">LOJAS</div>
                    ${lojaData.map(l => `
                        <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end" class="rmo-map-node" data-id="${l.id}" onclick="K11Regional._nodeClick('${l.key}')" style="cursor:pointer">
                            <span style="font-size:7px;font-family:monospace;color:rgba(255,255,255,0.45)">${l.label.substring(0,10)}</span>
                            <span style="width:6px;height:6px;border-radius:50%;background:${l.color};box-shadow:0 0 4px ${l.color};flex-shrink:0"></span>
                        </div>`).join('')}
                </div>
            </div>`;
    }

    // ─── CSS INJETADO ────────────────────────────────────────────

    const CSS = `
    #rmo-overlay {
        position: fixed; inset: 0; z-index: 8500;
        background: rgba(0,0,0,0.88);
        backdrop-filter: blur(14px) saturate(0.8);
        display: flex; align-items: flex-start; justify-content: center;
        opacity: 0; pointer-events: none;
        transition: opacity 0.3s cubic-bezier(.4,0,.2,1);
        padding: 10px 10px 10px;
        overflow-y: auto;
    }
    #rmo-overlay.rmo-open { opacity: 1; pointer-events: all; }

    #rmo-panel {
        width: 100%; max-width: 980px;
        background: #07080f;
        border: 1px solid rgba(255,140,0,0.15);
        border-radius: 16px;
        box-shadow: 0 0 0 1px rgba(255,140,0,0.06), 0 32px 80px rgba(0,0,0,0.85);
        transform: translateY(24px) scale(0.98);
        transition: transform 0.38s cubic-bezier(.4,0,.2,1);
        position: relative; overflow: hidden;
        margin: auto;
    }
    #rmo-overlay.rmo-open #rmo-panel { transform: translateY(0) scale(1); }

    /* Scanline */
    #rmo-panel::after {
        content: '';
        position: absolute; inset: 0; pointer-events: none; z-index: 50;
        background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.007) 2px, rgba(255,255,255,0.007) 4px);
        border-radius: 16px;
    }

    .rmo-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 20px 13px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        background: linear-gradient(180deg, rgba(255,140,0,0.04) 0%, transparent 100%);
        position: sticky; top: 0; z-index: 30;
        backdrop-filter: blur(8px);
    }
    .rmo-hdr-left { display: flex; align-items: center; gap: 12px; }
    .rmo-badge-tag {
        font-family: monospace; font-size: 8.5px; font-weight: 900; letter-spacing: 2px;
        color: #FF8C00; background: rgba(255,140,0,0.1);
        border: 1px solid rgba(255,140,0,0.2); border-radius: 4px; padding: 3px 8px;
    }
    .rmo-hdr-title { font-size: 13px; font-weight: 800; letter-spacing: 1.5px; color: #fff; }
    .rmo-hdr-sub { font-size: 9.5px; color: rgba(255,255,255,0.3); letter-spacing: 0.8px; font-family: monospace; margin-top: 1px; }
    .rmo-close-btn {
        width: 32px; height: 32px; border-radius: 8px;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.45); font-size: 16px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s; font-family: monospace;
    }
    .rmo-close-btn:hover { background: rgba(239,68,68,0.15); color: #EF4444; border-color: rgba(239,68,68,0.3); }

    .rmo-body { padding: 14px 18px 22px; }

    /* KPI Grid */
    .rmo-kpi-grid {
        display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 12px;
    }
    @media (max-width: 700px) { .rmo-kpi-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 480px) { .rmo-kpi-grid { grid-template-columns: repeat(2, 1fr); } }

    .rmo-kpi {
        background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
        border-radius: 9px; padding: 11px 10px 9px; position: relative; overflow: hidden;
        transition: border-color 0.2s, transform 0.15s;
    }
    .rmo-kpi:hover { border-color: rgba(var(--ka-rgb, 255,140,0), 0.35); transform: translateY(-1px); }
    .rmo-kpi::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
        background: var(--ka, #FF8C00); border-radius: 9px 9px 0 0; opacity: 0.6;
    }
    .rmo-kpi-label { font-size: 8px; font-weight: 800; letter-spacing: 1.5px; color: rgba(255,255,255,0.3); margin-bottom: 5px; font-family: monospace; text-transform: uppercase; }
    .rmo-kpi-val { font-size: 20px; font-weight: 900; line-height: 1; font-family: monospace; }
    .rmo-kpi-delta { font-size: 9px; margin-top: 4px; display: flex; align-items: center; gap: 3px; font-family: monospace; }
    .rmo-kpi-delta.up   { color: #10B981; }
    .rmo-kpi-delta.down { color: #EF4444; }
    .rmo-kpi-delta.neu  { color: rgba(255,255,255,0.3); }

    /* Mid grid */
    .rmo-mid { display: grid; grid-template-columns: 1.7fr 1fr; gap: 10px; margin-bottom: 10px; }
    @media (max-width: 600px) { .rmo-mid { grid-template-columns: 1fr; } }

    /* Bot grid */
    .rmo-bot { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
    @media (max-width: 700px) { .rmo-bot { grid-template-columns: 1fr; } }

    .rmo-panel-box {
        background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.06);
        border-radius: 11px; padding: 12px 14px;
    }
    .rmo-panel-title {
        font-size: 8.5px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;
        color: rgba(255,255,255,0.35); margin-bottom: 12px; font-family: monospace;
        display: flex; align-items: center; gap: 8px;
    }
    .rmo-panel-title::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(255,140,0,0.2), transparent); }

    /* Bars */
    .rmo-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
    .rmo-bar-lbl { font-size: 8px; font-weight: 700; letter-spacing: 0.5px; color: rgba(255,255,255,0.4); width: 72px; flex-shrink: 0; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rmo-bar-track { flex: 1; height: 5px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; }
    .rmo-bar-fill { height: 100%; border-radius: 3px; transform-origin: left; animation: rmoBarIn 0.9s cubic-bezier(.4,0,.2,1) both; position: relative; overflow: hidden; }
    .rmo-bar-fill::after { content: ''; position: absolute; top: 0; left: -80%; width: 50%; height: 100%; background: rgba(255,255,255,0.35); animation: rmoShimmer 2.2s infinite; }
    .rmo-bar-num { font-size: 9.5px; font-weight: 800; font-family: monospace; width: 32px; text-align: right; flex-shrink: 0; }

    @keyframes rmoBarIn { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @keyframes rmoShimmer { to { left: 180%; } }

    /* Donut */
    .rmo-donut-wrap { display: flex; align-items: center; gap: 14px; justify-content: center; flex-wrap: wrap; }
    .rmo-donut-seg { transition: stroke-width 0.2s; cursor: pointer; }
    .rmo-donut-seg:hover { stroke-width: 13; }
    .rmo-legend { display: flex; flex-direction: column; gap: 7px; }
    .rmo-legend-row { display: flex; align-items: center; gap: 7px; }
    .rmo-legend-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .rmo-legend-txt { font-size: 9px; color: rgba(255,255,255,0.5); font-family: monospace; flex: 1; }
    .rmo-legend-val { font-size: 10px; font-weight: 800; font-family: monospace; }

    /* Spark */
    .rmo-spark-wrap { margin-bottom: 12px; position: relative; }
    .rmo-spark-label { font-size: 8px; font-family: monospace; color: rgba(255,255,255,0.3); letter-spacing: 1px; margin-bottom: 3px; }

    /* Activity */
    .rmo-act-item { display: flex; gap: 8px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04); align-items: flex-start; }
    .rmo-act-item:last-child { border-bottom: none; }
    .rmo-act-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
    .rmo-act-txt { font-size: 9.5px; color: rgba(255,255,255,0.5); font-family: monospace; line-height: 1.5; flex: 1; }
    .rmo-act-time { font-size: 8px; color: rgba(255,255,255,0.2); font-family: monospace; flex-shrink: 0; margin-top: 2px; }

    /* Map node hover */
    .rmo-map-node { transition: opacity 0.2s; }
    .rmo-map-node:hover { opacity: 0.8; }
    .rmo-node-ping { animation: rmoNodePing 2.2s ease-out infinite; }
    @keyframes rmoNodePing { 0% { r: 9; opacity: 0.5; } 100% { r: 22; opacity: 0; } }
    .rmo-map-pulse { stroke-dasharray: 12,200; animation: rmoMapPulse 3s ease-in-out infinite; }
    @keyframes rmoMapPulse { 0% { stroke-dashoffset: 200; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { stroke-dashoffset: -20; opacity: 0; } }

    /* Chart expand hint */
    .chart-expand-hint {
        position: absolute; bottom: 14px; right: 14px;
        background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.25);
        border-radius: 4px; padding: 2px 8px;
        font-size: 8px; font-weight: 700; letter-spacing: 0.8px;
        color: #60a5fa; pointer-events: none; opacity: 0.8;
        font-family: 'Inter', sans-serif;
    }

    /* Scrollbar */
    #rmo-overlay::-webkit-scrollbar { width: 4px; }
    #rmo-overlay::-webkit-scrollbar-thumb { background: rgba(255,140,0,0.2); border-radius: 4px; }
    `;

    // ─── TOOLTIP DO MAPA ─────────────────────────────────────────

    function _showMapTooltip(key, evt) {
        const tip = document.getElementById('rmo-map-tooltip');
        if (!tip) return;
        const bm    = getBM();
        const loja  = LOJAS.find(l => l.key === key);
        if (!loja) return;
        const val   = bm[key] ?? 0;
        const hidra = bm.hidraulica ?? 0;
        const diff  = val - hidra;
        const diffStr = loja.main ? '🏠 LOJA BASE' : diff >= 0 ? `<span style="color:#10B981">▲ +${diff}% vs K11</span>` : `<span style="color:#EF4444">▼ ${diff}% vs K11</span>`;
        const rupturas = (APP.db?.produtos ?? []).filter(p => p.categoriaCor === 'red').length;
        tip.innerHTML = `
            <div style="font-size:10px;font-weight:900;color:${loja.color};letter-spacing:1px;margin-bottom:6px">${loja.label}</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.45);font-family:monospace;margin-bottom:4px">${loja.city}</div>
            <div style="font-size:18px;font-weight:900;color:${loja.color};font-family:monospace;margin-bottom:4px">${val}%</div>
            <div style="font-size:9px;font-family:monospace">${diffStr}</div>
            ${loja.main ? `<div style="margin-top:6px;font-size:8.5px;font-family:monospace;color:rgba(255,255,255,0.3)">⚠ ${rupturas} rupturas ativas</div>` : ''}`;

        // Posição relativa ao wrapper
        const wrap = document.getElementById('rmo-map-wrap');
        if (!wrap) { tip.style.display = 'block'; return; }
        const rect = wrap.getBoundingClientRect();
        const projPt = project(loja.lat, loja.lon);
        const svgEl = document.getElementById('rmo-map-svg');
        const vb    = svgEl?.viewBox?.baseVal;
        if (!vb) { tip.style.display = 'block'; return; }
        const scaleX = wrap.clientWidth / vb.width;
        const scaleY = (wrap.clientHeight || vb.height) / vb.height;
        let tx = projPt.x * scaleX + 10;
        let ty = projPt.y * scaleY - 10;
        if (tx + 170 > wrap.clientWidth) tx = projPt.x * scaleX - 175;
        if (ty + 120 > wrap.clientHeight) ty = projPt.y * scaleY - 125;
        tip.style.left = `${tx}px`;
        tip.style.top  = `${ty}px`;
        tip.style.display = 'block';
    }

    function _hideMapTooltip() {
        const tip = document.getElementById('rmo-map-tooltip');
        if (tip) tip.style.display = 'none';
    }

    // ─── MONTAGEM HTML ───────────────────────────────────────────

    function buildHTML() {
        const kpis  = buildKPIs();
        const bm    = getBM();
        const acts  = buildActivity();
        const spk1  = sparkData(bm.hidraulica || 40, 14);
        const spk2  = sparkData(bm.mesquita   || 25, 14);
        const now   = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

        return `
        <div id="rmo-panel">
            <div class="rmo-header">
                <div class="rmo-hdr-left">
                    <div class="rmo-badge-tag">REGIONAL · RJ</div>
                    <div>
                        <div class="rmo-hdr-title">Dashboard Operacional</div>
                        <div class="rmo-hdr-sub">K11 OMNI ELITE · DUQUE DE CAXIAS · ${now}</div>
                    </div>
                </div>
                <button class="rmo-close-btn" onclick="K11Regional.close()" title="Fechar (ESC)">✕</button>
            </div>

            <div class="rmo-body">
                <!-- KPIs -->
                <div class="rmo-kpi-grid">${renderKPIs(kpis)}</div>

                <!-- Mapa + Benchmark -->
                <div class="rmo-mid">
                    <div class="rmo-panel-box">
                        <div class="rmo-panel-title">Mapa Regional Interativo · Rio de Janeiro</div>
                        ${renderMap()}
                    </div>
                    <div class="rmo-panel-box">
                        <div class="rmo-panel-title">Benchmark de Vendas</div>
                        ${renderBars()}
                    </div>
                </div>

                <!-- Donut + Sparks + Activity -->
                <div class="rmo-bot">
                    <div class="rmo-panel-box">
                        <div class="rmo-panel-title">Composição Estoque</div>
                        ${renderDonut()}
                    </div>
                    <div class="rmo-panel-box">
                        <div class="rmo-panel-title">Tendência de Venda</div>
                        ${renderSpark(spk1, '#FF8C00', 'K11 HIDRÁULICA')}
                        ${renderSpark(spk2, '#3B82F6', 'MESQUITA')}
                    </div>
                    <div class="rmo-panel-box">
                        <div class="rmo-panel-title">Atividade do Turno</div>
                        ${acts.map(a => `
                        <div class="rmo-act-item">
                            <div class="rmo-act-dot" style="background:${a.dot}"></div>
                            <div class="rmo-act-txt">${esc(a.txt)}</div>
                            <div class="rmo-act-time">${esc(a.time)}</div>
                        </div>`).join('')}
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ─── API PÚBLICA ─────────────────────────────────────────────

    function _injectCSS() {
        if (document.getElementById('rmo-style')) return;
        const s = document.createElement('style');
        s.id = 'rmo-style';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    function _ensureOverlay() {
        let el = document.getElementById('rmo-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'rmo-overlay';
            document.body.appendChild(el);
            el.addEventListener('click', e => { if (e.target === el) K11Regional.close(); });
        }
        return el;
    }

    return {
        open() {
            _injectCSS();
            const ov = _ensureOverlay();
            ov.innerHTML = buildHTML();

            // Bind map node hover
            requestAnimationFrame(() => {
                document.querySelectorAll('#rmo-panel .rmo-map-node').forEach(g => {
                    const key = g.dataset.key || g.getAttribute('data-key');
                    if (!key) return;
                    g.addEventListener('mouseenter', e => _showMapTooltip(key, e));
                    g.addEventListener('mouseleave', _hideMapTooltip);
                    g.addEventListener('touchstart', e => _showMapTooltip(key, e), { passive: true });
                });
                requestAnimationFrame(() => ov.classList.add('rmo-open'));
            });

            document.addEventListener('keydown', K11Regional._onKey);
        },

        close() {
            const ov = document.getElementById('rmo-overlay');
            if (!ov) return;
            ov.classList.remove('rmo-open');
            document.removeEventListener('keydown', K11Regional._onKey);
        },

        _onKey(e) { if (e.key === 'Escape') K11Regional.close(); },

        _nodeClick(key) {
            // Ao clicar numa loja no mapa, muda o alvo do duelo e abre a view projetor
            if (key && key !== 'hidraulica' && APP?.actions?.mudarAlvo) {
                K11Regional.close();
                setTimeout(() => {
                    APP.actions.mudarAlvo(key);
                    const btn = document.querySelector('.nav-btn[onclick*="projetor"]');
                    APP.view('projetor', btn);
                }, 320);
            }
        },
    };

})();
