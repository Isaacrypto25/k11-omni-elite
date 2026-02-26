/**
 * K11 OMNI ELITE 4.0 — ELECTRON MAIN PROCESS
 * ════════════════════════════════════════════
 * Ponto de entrada do Electron.
 * Os arquivos JSON (auditoria.json, fornecedor.json, etc.) devem
 * ficar na MESMA pasta que este main.js e o dashboard.html.
 *
 * Estrutura esperada:
 * ├── main.js              ← este arquivo
 * ├── dashboard.html
 * ├── global.css
 * ├── k11-config.js
 * ├── k11-app.js
 * ├── ... (demais .js)
 * ├── auditoria.json
 * ├── fornecedor.json
 * ├── produtos.json
 * ├── movimento.json
 * ├── pdv.json
 * └── ... (demais .json)
 */

'use strict';

const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');

// ─── JANELA PRINCIPAL ─────────────────────────────────────────

function createWindow() {
    const win = new BrowserWindow({
        width:  1280,
        height: 800,
        minWidth:  480,
        minHeight: 600,
        title: 'K11 OMNI ELITE 4.0',

        // Ícone opcional — coloque um icon.png na pasta do projeto
        // icon: path.join(__dirname, 'icon.png'),

        webPreferences: {
            // Permite fetch() para arquivos locais (file://) — necessário para os JSONs
            webSecurity: false,

            // Desabilita Node.js no renderer — a app usa apenas browser APIs
            nodeIntegration: false,
            contextIsolation: true,
        },

        // Visual limpo
        backgroundColor: '#09090F',
        show: false, // Aguarda 'ready-to-show' para evitar flash branco
    });

    // ─── CARREGA O DASHBOARD ──────────────────────────────────
    win.loadFile(path.join(__dirname, 'dashboard.html'));

    // Exibe a janela só quando o HTML estiver pronto (sem flash branco)
    win.once('ready-to-show', () => win.show());

    // DevTools em desenvolvimento — remova ou comente em produção
    // win.webContents.openDevTools();
}

// ─── LIFECYCLE ────────────────────────────────────────────────

app.whenReady().then(() => {
    createWindow();

    // MacOS: recria janela ao clicar no ícone do Dock se não houver janelas abertas
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Windows / Linux: encerra o processo ao fechar todas as janelas
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
