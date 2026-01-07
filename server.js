// server.js - VERIFICADOR FF - RAILWAY VERSION
const puppeteer = require('puppeteer-core');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const CONFIG = {
    PIN: '113F2689-95D4-4A49-B3C7-3D590893C76E',
    PORT: process.env.PORT || 3000,
    MAX_PAGES: 2,
    TIMEOUT: 30000
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let browser = null;
let pagePool = [];
let busyPages = new Set();
let requestQueue = [];

async function initialize() {
    console.log('🚀 Iniciando navegador...');
    
    browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/google-chrome-stable',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-extensions'
        ]
    });
    
    console.log('✅ Navegador iniciado\n');
    
    for (let i = 0; i < CONFIG.MAX_PAGES; i++) {
        await prepararPagina(i);
    }
    
    const ready = pagePool.filter(p => p?.ready).length;
    console.log(`\n✅ ${ready} páginas listas\n`);
}

async function prepararPagina(index) {
    try {
        console.log(`   [${index + 1}] Abriendo...`);
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1000, height: 800 });
        
        console.log(`   [${index + 1}] Cargando redeem.hype.games...`);
        await page.goto('https://redeem.hype.games', { 
            waitUntil: 'networkidle2', 
            timeout: CONFIG.TIMEOUT 
        });
        
        await sleep(2000);
        
        console.log(`   [${index + 1}] Ingresando PIN...`);
        await page.type('#pininput', CONFIG.PIN, { delay: 30 });
        
        await sleep(500);
        
        console.log(`   [${index + 1}] Click Canjear...`);
        await page.click('#btn-validate');
        
        console.log(`   [${index + 1}] Esperando formulario...`);
        await sleep(4000);
        
        try {
            await page.waitForSelector('#GameAccountId', { timeout: 10000 });
        } catch (e) {
            await sleep(3000);
        }
        
        console.log(`   [${index + 1}] Llenando formulario...`);
        await llenarFormulario(page);
        await sleep(500);
        
        const check = await page.evaluate(() => {
            return {
                name: document.querySelector('#Name')?.value || '',
                born: document.querySelector('#BornAt')?.value || '',
                country: document.querySelector('#NationalityAlphaCode')?.value || '',
                privacy: document.querySelector('#privacy')?.checked || false
            };
        });
        console.log(`   [${index + 1}] Form:`, JSON.stringify(check));
        
        pagePool[index] = { page, ready: true };
        console.log(`   [${index + 1}] ✅ Lista`);
        
    } catch (error) {
        console.error(`   [${index + 1}] ❌ Error:`, error.message);
        pagePool[index] = { page: null, ready: false };
    }
}

async function llenarFormulario(page) {
    await page.click('#Name', { clickCount: 3 });
    await page.type('#Name', 'Jose Hernandez');
    
    await page.click('#BornAt', { clickCount: 3 });
    await page.type('#BornAt', '19/06/2000');
    
    await page.select('#NationalityAlphaCode', 'VE');
    
    const isChecked = await page.evaluate(() => document.querySelector('#privacy')?.checked);
    if (!isChecked) {
        await page.click('#privacy');
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
        if (avail) verificarID(playerId, avail).then(resolve);
    }
}

async function verificarID(playerId, { page, index }) {
    try {
        const start = Date.now();
        console.log(`\n⚡ [${index + 1}] Verificando: ${playerId}`);
        
        await page.click('#GameAccountId', { clickCount: 3 });
        await page.type('#GameAccountId', playerId);
        
        await sleep(300);
        
        console.log(`   [${index + 1}] Click en Verificar ID...`);
        await page.click('#btn-verify');
        
        let nickname = null;
        console.log(`   [${index + 1}] Esperando nickname...`);
        
        for (let i = 0; i < 30; i++) {
            await sleep(200);
            
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
        
        const elapsed = Date.now() - start;
        
        await page.click('#GameAccountId', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        
        await page.evaluate(() => {
            const btn = document.querySelector('#btn-player-game-data');
            if (btn) btn.textContent = '';
            const div = document.querySelector('.redeem-data');
            if (div) div.style.display = 'none';
        });
        
        releasePage(index);
        
        if (nickname) {
            console.log(`   ✅ ${nickname} (${elapsed}ms)`);
            return { success: true, player_id: playerId, nickname, time_ms: elapsed };
        } else {
            console.log(`   ❌ No encontrado (${elapsed}ms)`);
            return { success: false, player_id: playerId, error: 'No encontrado' };
        }
        
    } catch (error) {
        console.error(`   ❌ Error:`, error.message);
        releasePage(index);
        return { success: false, error: error.message };
    }
}

app.get('/test/:id', async (req, res) => {
    const id = req.params.id;
    if (!/^\d{8,12}$/.test(id)) return res.json({ success: false, error: 'ID inválido' });
    
    const avail = getAvailablePage();
    if (avail) {
        res.json(await verificarID(id, avail));
    } else {
        res.json(await new Promise(r => requestQueue.push({ resolve: r, playerId: id })));
    }
});

app.post('/verify', async (req, res) => {
    const id = req.body.player_id;
    if (!id || !/^\d{8,12}$/.test(id)) return res.json({ success: false, error: 'ID inválido' });
    
    const avail = getAvailablePage();
    if (avail) {
        res.json(await verificarID(id, avail));
    } else {
        res.json(await new Promise(r => requestQueue.push({ resolve: r, playerId: id })));
    }
});

app.get('/', (req, res) => res.json({ 
    status: 'ok', 
    ready: pagePool.filter(p => p?.ready).length,
    busy: busyPages.size 
}));

async function start() {
    console.log('\n🔥 VERIFICADOR FF - RAILWAY\n');
    await initialize();
    app.listen(CONFIG.PORT, '0.0.0.0', () => {
        console.log(`⚡ Servidor en puerto ${CONFIG.PORT}`);
    });
}

process.on('SIGINT', async () => { if (browser) await browser.close(); process.exit(); });
process.on('SIGTERM', async () => { if (browser) await browser.close(); process.exit(); });

start();
