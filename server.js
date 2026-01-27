// server.js - VERIFICADOR FF - SIMPLE Y ESTABLE
const puppeteer = require('puppeteer-core');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const CONFIG = {
    PIN: '113F2689-95D4-4A49-B3C7-3D590893C76E',
    PORT: process.env.PORT || 3000
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let browser = null;
let page = null;
let ready = false;
let busy = false;

// ========== INICIALIZAR ==========
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
    
    console.log('✅ Navegador iniciado');
    
    page = await browser.newPage();
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
    
    console.log('📄 Cargando redeem.hype.games...');
    await page.goto('https://redeem.hype.games', { waitUntil: 'networkidle2', timeout: 60000 });
    
    await sleep(2000);
    
    console.log('🔑 Ingresando PIN...');
    await page.type('#pininput', CONFIG.PIN, { delay: 30 });
    await sleep(500);
    await page.click('#btn-validate');
    
    console.log('⏳ Esperando formulario...');
    await sleep(4000);
    await page.waitForSelector('#GameAccountId', { timeout: 15000 });
    
    console.log('📝 Llenando datos...');
    await page.click('#Name', { clickCount: 3 });
    await page.type('#Name', 'Jose Hernandez', { delay: 10 });
    await page.click('#BornAt', { clickCount: 3 });
    await page.type('#BornAt', '19/06/2000', { delay: 10 });
    await page.select('#NationalityAlphaCode', 'VE');
    
    const isChecked = await page.evaluate(() => document.querySelector('#privacy')?.checked);
    if (!isChecked) await page.click('#privacy');
    
    ready = true;
    console.log('✅ Listo para verificar IDs\n');
}

// ========== VERIFICAR ==========
async function verificar(playerId) {
    if (!ready) return { success: false, error: 'Servicio iniciando, intenta en 30 seg' };
    if (busy) return { success: false, error: 'Ocupado, intenta de nuevo' };
    
    busy = true;
    const start = Date.now();
    
    try {
        console.log(`⚡ Verificando: ${playerId}`);
        
        // Limpiar
        await page.evaluate(() => {
            document.querySelector('#GameAccountId').value = '';
            const btn = document.querySelector('#btn-player-game-data');
            if (btn) btn.textContent = '';
        });
        
        await sleep(200);
        
        // Escribir ID
        await page.focus('#GameAccountId');
        await page.keyboard.type(playerId, { delay: 15 });
        await sleep(300);
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
        
        // Limpiar
        await page.evaluate(() => {
            document.querySelector('#GameAccountId').value = '';
            const btn = document.querySelector('#btn-player-game-data');
            if (btn) btn.textContent = '';
        });
        
        busy = false;
        const elapsed = Date.now() - start;
        
        if (nickname) {
            console.log(`   ✅ ${nickname} (${elapsed}ms)`);
            return { success: true, player_id: playerId, nickname, time_ms: elapsed };
        } else {
            console.log(`   ❌ No encontrado (${elapsed}ms)`);
            return { success: false, player_id: playerId, error: 'No encontrado' };
        }
        
    } catch (error) {
        console.error(`   ❌ Error:`, error.message);
        busy = false;
        return { success: false, error: error.message };
    }
}

// ========== ENDPOINTS ==========
app.get('/test/:id', async (req, res) => {
    const id = req.params.id;
    if (!/^\d{8,12}$/.test(id)) return res.json({ success: false, error: 'ID inválido' });
    res.json(await verificar(id));
});

app.post('/verify', async (req, res) => {
    const id = req.body.player_id;
    if (!id || !/^\d{8,12}$/.test(id)) return res.json({ success: false, error: 'ID inválido' });
    res.json(await verificar(id));
});

app.get('/', (req, res) => res.json({ status: 'ok', ready: ready ? 1 : 0, busy: busy ? 1 : 0 }));

// ========== INICIO ==========
async function start() {
    console.log('\n🔥 VERIFICADOR FF\n');
    try {
        await initialize();
    } catch (e) {
        console.error('❌ Error inicial:', e.message);
    }
    app.listen(CONFIG.PORT, '0.0.0.0', () => {
        console.log(`⚡ Puerto: ${CONFIG.PORT}\n`);
    });
}

start();
