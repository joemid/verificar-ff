// server.js - VERIFICADOR FF - RAILWAY (MEJORADO v2)
const puppeteer = require('puppeteer-core');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const CONFIG = {
    PIN: '113F2689-95D4-4A49-B3C7-3D590893C76E',
    PORT: process.env.PORT || 3000,
    TIMEOUT: 60000
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let browser = null;
let page = null;
let pageReady = false;
let pageBusy = false;
let requestQueue = [];

// ========== INICIALIZAR NAVEGADOR ==========
async function initialize() {
    console.log('🚀 Iniciando navegador...');
    
    browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/google-chrome-stable',
        protocolTimeout: CONFIG.TIMEOUT,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-sync',
            '--disable-translate',
            '--mute-audio'
        ]
    });
    
    console.log('✅ Navegador iniciado\n');
    await prepararPagina();
}

// ========== PREPARAR PÁGINA ==========
async function prepararPagina() {
    try {
        console.log('📄 Preparando página...');
        pageReady = false;
        
        // Cerrar página anterior si existe
        if (page) {
            try { await page.close(); } catch(e) {}
        }
        
        page = await browser.newPage();
        page.setDefaultTimeout(CONFIG.TIMEOUT);
        page.setDefaultNavigationTimeout(CONFIG.TIMEOUT);
        
        await page.setViewport({ width: 1000, height: 800 });
        
        // Bloquear recursos innecesarios
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        console.log('   Cargando redeem.hype.games...');
        await page.goto('https://redeem.hype.games', { 
            waitUntil: 'networkidle2', 
            timeout: CONFIG.TIMEOUT 
        });
        
        await sleep(2000);
        
        console.log('   Ingresando PIN...');
        await page.waitForSelector('#pininput', { timeout: 10000 });
        await page.type('#pininput', CONFIG.PIN, { delay: 30 });
        
        await sleep(500);
        
        console.log('   Click Canjear...');
        await page.click('#btn-validate');
        
        console.log('   Esperando formulario...');
        await sleep(3000);
        
        // Esperar formulario con reintentos
        let formFound = false;
        for (let i = 0; i < 5; i++) {
            try {
                await page.waitForSelector('#GameAccountId', { timeout: 5000 });
                formFound = true;
                break;
            } catch (e) {
                console.log(`   Reintento ${i + 1}...`);
                await sleep(2000);
            }
        }
        
        if (!formFound) {
            throw new Error('Formulario no encontrado');
        }
        
        console.log('   Llenando formulario...');
        await llenarFormulario();
        
        await sleep(500);
        
        pageReady = true;
        console.log('✅ Página lista - esperando IDs\n');
        
    } catch (error) {
        console.error('❌ Error preparando página:', error.message);
        pageReady = false;
        
        // Reintentar después de 5 segundos
        setTimeout(() => prepararPagina(), 5000);
    }
}

// ========== LLENAR FORMULARIO ==========
async function llenarFormulario() {
    await page.click('#Name', { clickCount: 3 });
    await page.type('#Name', 'Jose Hernandez', { delay: 10 });
    
    await page.click('#BornAt', { clickCount: 3 });
    await page.type('#BornAt', '19/06/2000', { delay: 10 });
    
    await page.select('#NationalityAlphaCode', 'VE');
    
    const isChecked = await page.evaluate(() => document.querySelector('#privacy')?.checked);
    if (!isChecked) {
        await page.click('#privacy');
    }
}

// ========== VERIFICAR ID ==========
async function verificarID(playerId) {
    // Si página no está lista, encolar
    if (!pageReady) {
        console.log(`⏳ Página no lista, encolando: ${playerId}`);
        return await new Promise(r => requestQueue.push({ resolve: r, playerId }));
    }
    
    // Si página ocupada, encolar
    if (pageBusy) {
        console.log(`⏳ Página ocupada, encolando: ${playerId}`);
        return await new Promise(r => requestQueue.push({ resolve: r, playerId }));
    }
    
    pageBusy = true;
    const start = Date.now();
    
    try {
        console.log(`\n⚡ Verificando: ${playerId}`);
        
        // Limpiar campo
        await page.evaluate(() => {
            const input = document.querySelector('#GameAccountId');
            if (input) input.value = '';
            const btn = document.querySelector('#btn-player-game-data');
            if (btn) btn.textContent = '';
            const div = document.querySelector('.redeem-data');
            if (div) div.style.display = 'none';
        });
        
        await sleep(200);
        
        // Escribir ID
        await page.focus('#GameAccountId');
        await page.keyboard.type(playerId, { delay: 15 });
        
        await sleep(300);
        
        // Click verificar
        await page.click('#btn-verify');
        
        // Esperar nickname
        let nickname = null;
        for (let i = 0; i < 40; i++) {
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
        
        // Limpiar para siguiente
        await page.evaluate(() => {
            const input = document.querySelector('#GameAccountId');
            if (input) input.value = '';
            const btn = document.querySelector('#btn-player-game-data');
            if (btn) btn.textContent = '';
            const div = document.querySelector('.redeem-data');
            if (div) div.style.display = 'none';
        });
        
        pageBusy = false;
        procesarCola();
        
        if (nickname) {
            console.log(`   ✅ ${nickname} (${elapsed}ms)`);
            return { success: true, player_id: playerId, nickname, time_ms: elapsed };
        } else {
            console.log(`   ❌ No encontrado (${elapsed}ms)`);
            return { success: false, player_id: playerId, error: 'No encontrado' };
        }
        
    } catch (error) {
        console.error(`   ❌ Error:`, error.message);
        pageBusy = false;
        
        // Si hay error grave, recargar página
        if (error.message.includes('timeout') || error.message.includes('Protocol') || error.message.includes('Target')) {
            console.log('🔄 Recargando página por error...');
            prepararPagina();
        }
        
        procesarCola();
        return { success: false, player_id: playerId, error: error.message };
    }
}

// ========== PROCESAR COLA ==========
function procesarCola() {
    if (requestQueue.length > 0 && pageReady && !pageBusy) {
        const { resolve, playerId } = requestQueue.shift();
        verificarID(playerId).then(resolve);
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
    ready: pageReady ? 1 : 0,
    busy: pageBusy ? 1 : 0,
    queue: requestQueue.length
}));

// ========== HEALTH CHECK ==========
setInterval(() => {
    if (!pageReady && !pageBusy && requestQueue.length === 0) {
        console.log('🔍 Health check: página no lista, reintentando...');
        prepararPagina();
    }
}, 60000);

// ========== INICIO ==========
async function start() {
    console.log('\n🔥 VERIFICADOR FF - RAILWAY (v2)\n');
    await initialize();
    app.listen(CONFIG.PORT, '0.0.0.0', () => {
        console.log(`⚡ Puerto: ${CONFIG.PORT}`);
        console.log(`🧪 Probar: http://localhost:${CONFIG.PORT}/test/123456789\n`);
    });
}

process.on('SIGINT', async () => { if (browser) await browser.close(); process.exit(); });
process.on('SIGTERM', async () => { if (browser) await browser.close(); process.exit(); });

start();
