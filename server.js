// server.js - VERIFICADOR FF - RAILWAY (CON LOGS)
const puppeteer = require('puppeteer-core');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const isWindows = process.platform === 'win32';

const CONFIG = {
    PIN: '113F2689-95D4-4A49-B3C7-3D590893C76E',
    PORT: process.env.PORT || 3000,
    MAX_PAGES: 1,
    TIMEOUT: 60000,
    CHROME_PATH: isWindows 
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : '/usr/bin/google-chrome-stable'
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let browser = null;
let pagePool = [];
let busyPages = new Set();
let requestQueue = [];

// ========== PUPPETEER ==========
async function initialize() {
    const totalStart = Date.now();
    console.log('\n🚀 Iniciando navegador...');
    console.log(`   Modo: ${isWindows ? 'Windows (visible)' : 'Railway (headless)'}`);
    
    const browserStart = Date.now();
    browser = await puppeteer.launch({
        headless: isWindows ? false : 'new',
        executablePath: CONFIG.CHROME_PATH,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--disable-extensions'
        ]
    });
    console.log(`   ✅ Navegador iniciado: ${Date.now() - browserStart}ms`);
    
    for (let i = 0; i < CONFIG.MAX_PAGES; i++) {
        await prepararPagina(i);
    }
    
    const ready = pagePool.filter(p => p?.ready).length;
    console.log(`\n✅ ${ready} páginas listas - TOTAL: ${Date.now() - totalStart}ms\n`);
}

async function prepararPagina(index) {
    const start = Date.now();
    let t;
    
    try {
        console.log(`\n   [${index + 1}] === PREPARANDO PÁGINA ===`);
        
        t = Date.now();
        const page = await browser.newPage();
        await page.setViewport({ width: 1000, height: 800 });
        console.log(`   [${index + 1}] Nueva página: ${Date.now() - t}ms`);
        
        t = Date.now();
        await page.goto('https://redeem.hype.games', { 
            waitUntil: 'networkidle2', 
            timeout: CONFIG.TIMEOUT 
        });
        console.log(`   [${index + 1}] Página cargada: ${Date.now() - t}ms`);
        
        // Cookies
        t = Date.now();
        try {
            await page.waitForSelector('#adopt-accept-all-button', { timeout: 3000 });
            await page.click('#adopt-accept-all-button');
            console.log(`   [${index + 1}] Cookies aceptadas: ${Date.now() - t}ms`);
            await sleep(300);
        } catch (e) {
            console.log(`   [${index + 1}] Sin popup cookies`);
        }
        
        // PIN
        t = Date.now();
        await page.evaluate((pin) => {
            document.querySelector('#pininput').value = pin;
        }, CONFIG.PIN);
        await sleep(100);
        await page.click('#btn-validate');
        console.log(`   [${index + 1}] PIN + Click: ${Date.now() - t}ms`);
        
        // Esperar formulario - reducido de 3000 a 1500
        t = Date.now();
        await sleep(1500);
        await page.waitForSelector('#GameAccountId', { timeout: 15000 });
        console.log(`   [${index + 1}] Formulario visible: ${Date.now() - t}ms`);
        
        // Llenar formulario
        t = Date.now();
        
        // Nombre
        await page.evaluate(() => {
            const el = document.querySelector('#Name');
            el.value = 'Jose Hernandez';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        // Fecha
        await page.evaluate(() => {
            const el = document.querySelector('#BornAt');
            el.value = '19/06/2000';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        // País
        await page.select('#NationalityAlphaCode', 'VE');
        
        console.log(`   [${index + 1}] Formulario llenado: ${Date.now() - t}ms`);
        
        // Checkbox
        t = Date.now();
        await sleep(100);
        const isChecked = await page.evaluate(() => document.querySelector('#privacy')?.checked);
        if (!isChecked) {
            await page.click('#privacy');
        }
        const finalCheck = await page.evaluate(() => document.querySelector('#privacy')?.checked);
        console.log(`   [${index + 1}] Checkbox: ${Date.now() - t}ms (${finalCheck ? '✅' : '❌'})`);
        
        pagePool[index] = { page, ready: true };
        console.log(`   [${index + 1}] ✅ LISTA - Total: ${Date.now() - start}ms`);
        
    } catch (error) {
        console.error(`   [${index + 1}] ❌ Error: ${error.message}`);
        pagePool[index] = { page: null, ready: false };
    }
}

function getAvailablePage() {
    for (let i = 0; i < pagePool.length; i++) {
        if (pagePool[i]?.ready && !busyPages.has(i)) {
            busyPages.add(i);
            return { page: pagePool[i].page, index: i };
        }
    }
    return null;
}

function releasePage(index) {
    busyPages.delete(index);
    if (requestQueue.length > 0) {
        const { resolve, playerId } = requestQueue.shift();
        const avail = getAvailablePage();
        if (avail) verificarConPuppeteer(playerId, avail).then(resolve);
    }
}

async function verificarConPuppeteer(playerId, { page, index }) {
    const start = Date.now();
    let t;
    
    try {
        console.log(`\n⚡ [${index + 1}] Verificando: ${playerId}`);
        
        // Escribir ID
        t = Date.now();
        await page.evaluate((id) => {
            const input = document.querySelector('#GameAccountId');
            input.value = id;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }, playerId);
        console.log(`   → ID escrito: ${Date.now() - t}ms`);
        
        // Click verificar
        t = Date.now();
        await page.click('#btn-verify');
        console.log(`   → Click verificar: ${Date.now() - t}ms`);
        
        // Esperar nickname
        t = Date.now();
        let nickname = null;
        
        for (let i = 0; i < 30; i++) {
            await sleep(150);
            
            nickname = await page.evaluate(() => {
                const el = document.querySelector('#btn-player-game-data');
                if (el && el.offsetParent !== null) {
                    const t = el.textContent.trim();
                    if (t.length >= 3 && t.length <= 30) return t;
                }
                return null;
            });
            
            if (nickname) break;
        }
        const waitTime = Date.now() - t;
        
        // Limpiar
        await page.evaluate(() => {
            document.querySelector('#GameAccountId').value = '';
            const btn = document.querySelector('#btn-player-game-data');
            if (btn) btn.textContent = '';
            const div = document.querySelector('.redeem-data');
            if (div) div.style.display = 'none';
        });
        
        releasePage(index);
        
        const total = Date.now() - start;
        
        if (nickname) {
            console.log(`   → Nickname encontrado: ${waitTime}ms`);
            console.log(`   ✅ ${nickname} (${total}ms total)`);
            return { success: true, player_id: playerId, nickname, time_ms: total };
        } else {
            console.log(`   → Timeout: ${waitTime}ms`);
            console.log(`   ❌ No encontrado (${total}ms total)`);
            return { success: false, player_id: playerId, error: 'No encontrado' };
        }
        
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        releasePage(index);
        return { success: false, error: error.message };
    }
}

// ========== VERIFICACIÓN ==========
async function verificarID(playerId) {
    const avail = getAvailablePage();
    if (avail) {
        return await verificarConPuppeteer(playerId, avail);
    } else {
        return await new Promise(r => requestQueue.push({ resolve: r, playerId }));
    }
}

// ========== ENDPOINTS ==========
app.get('/test/:id', async (req, res) => {
    const id = req.params.id;
    if (!/^\d{8,12}$/.test(id)) return res.json({ success: false, error: 'ID inválido' });
    res.json(await verificarID(id));
});

app.post('/verify', async (req, res) => {
    const id = req.body.player_id;
    if (!id || !/^\d{8,12}$/.test(id)) return res.json({ success: false, error: 'ID inválido' });
    res.json(await verificarID(id));
});

app.get('/', (req, res) => res.json({ 
    status: 'ok', 
    ready: pagePool.filter(p => p?.ready).length,
    busy: busyPages.size,
    queue: requestQueue.length
}));

// ========== INICIO ==========
async function start() {
    console.log('\n🔥 VERIFICADOR FF - RAILWAY\n');
    await initialize();
    app.listen(CONFIG.PORT, '0.0.0.0', () => {
        console.log(`⚡ Servidor en puerto ${CONFIG.PORT}\n`);
    });
}

process.on('SIGINT', async () => { if (browser) await browser.close(); process.exit(); });
process.on('SIGTERM', async () => { if (browser) await browser.close(); process.exit(); });

start();
