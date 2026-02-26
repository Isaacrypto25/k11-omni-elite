/**
 * K11 OMNI ELITE — UTILITÁRIOS PUROS
 * ═══════════════════════════════════
 * Funções sem efeitos colaterais, sem dependência de DOM ou APP.
 * Podem ser testadas em isolamento.
 *
 * Depende de: k11-config.js
 */

'use strict';

// ─── FORMATAÇÃO / ESCAPE ──────────────────────────────────────

/** Escapa HTML para evitar XSS em templates literais */
const esc = (str) => {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

/** Formata número como moeda BRL (R$ 1.234,56) */
const brl = (n) =>
    Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Converte string com vírgula para float seguro */
const safeFloat = (v) => {
    const n = parseFloat(String(v ?? '0').replace(',', '.'));
    return isFinite(n) ? n : 0;
};

// ─── PERFORMANCE ──────────────────────────────────────────────

/** Atrasa execução da fn enquanto continua sendo chamada */
const debounce = (fn, ms) => {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
};

/** Cache de resultado por argumento (só funciona com 1 argumento) */
const memoize = (fn) => {
    const cache = new Map();
    return (arg) => {
        if (cache.has(arg)) return cache.get(arg);
        const result = fn(arg);
        cache.set(arg, result);
        return result;
    };
};

// ─── STRINGS ──────────────────────────────────────────────────

/** Remove acentos e normaliza para comparação case-insensitive */
const normalizeStr = (s) =>
    String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

// ─── EVENT BUS ────────────────────────────────────────────────

/**
 * Pub/Sub simples para desacoplar módulos.
 * Uso: EventBus.on('estoque:atualizado', fn) / EventBus.emit('estoque:atualizado')
 */
const EventBus = {
    _listeners: {},
    on(event, fn)        { (this._listeners[event] ??= []).push(fn); },
    emit(event, payload) { (this._listeners[event] ?? []).forEach(fn => fn(payload)); },
};

// ─── CAPACIDADE DO PKL ────────────────────────────────────────

/**
 * Retorna capacidade máxima de PKL para um produto pela descrição.
 * Memoizado — cada descrição só é processada uma vez.
 */
const getCapacidade = memoize((desc) => {
    const d    = (desc ?? '').toUpperCase();
    const base = d.includes('TUBO') ? REGRAS_CAPACIDADE.tubo : REGRAS_CAPACIDADE.conexao;
    for (const bitola in base) {
        if (d.includes(bitola)) return base[bitola];
    }
    return CAPACIDADE_PADRAO;
});
