/**
 * K11 OMNI ELITE — CONFIGURAÇÕES E CONSTANTES
 * ═══════════════════════════════════════════
 * Centraliza todos os valores configuráveis da aplicação.
 * Edite aqui para ajustar timeouts, usuários e regras de capacidade.
 */

'use strict';

// ─── TUNÁVEIS ─────────────────────────────────────────────────
const FETCH_TIMEOUT_MS  = 8000;
const FETCH_RETRY       = 1;
const DEBOUNCE_DELAY_MS = 280;
const ANIM_DURATION_MS  = 1100;
const TOAST_DURATION_MS = 3200;
// ─── GROQ AI — SUPREME BRAIN ─────────────────────────────────
// Chave gratuita em: https://console.groq.com/keys
// Free tier: 1.000 req/dia, sem cartão de crédito
const K11_GROQ_API_KEY = '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'; // ex: gsk_abc123...

// ─── USUÁRIOS VÁLIDOS ─────────────────────────────────────────
// Substitua com REs e PINs reais do seu time
const USUARIOS_VALIDOS = {
    '11111': { pin: '1234', nome: 'Supervisor K11', role: 'super' },
    '22222': { pin: '2222', nome: 'Operador A',     role: 'op'   },
    '33333': { pin: '3333', nome: 'Operador B',     role: 'op'   },
};

// ─── REGRAS DE CAPACIDADE DO PKL ──────────────────────────────
// Usado para calcular % de ocupação e score de criticidade
const REGRAS_CAPACIDADE = {
    tubo: {
        '20MM': 2000, '25MM': 2000, '32MM': 300,
        '40MM': 100,  '50MM': 100,  '75MM': 20,
        '85MM': 20,   '110MM': 10,
    },
    conexao: {
        '20MM': 3000, '25MM': 3000, '32MM': 100,
        '40MM': 85,   '50MM': 60,
    },
};
const CAPACIDADE_PADRAO = 50;

// ─── MAPEAMENTO DO FORNECEDOR.JSON ────────────────────────────
// Documenta os campos do export do SAP para evitar confusão
// FIELD1                       = Número Pedido
// AGENDAMENTOS POR FORNECEDOR  = Número Nota Fiscal (nome enganoso!)
// FIELD3                       = Código Produto (SKU)
// FIELD4                       = Descrição do Produto
// FIELD5                       = Qtde. Agendada
// FIELD6                       = Qtde. Confirmada NF
// FIELD7                       = Data Início Agendamento (dd/mm/yyyy hh:mm)
// FIELD8                       = Data Fim Agendamento
// FIELD9                       = Id. Agendamento
// FIELD10                      = Local de Entrega (CNPJ - Nome Loja)
// FIELD11                      = Doca de Entrega
// FIELD12                      = Fornecedor (CNPJ - Nome)
