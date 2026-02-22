require('dotenv').config();
const puppeteer = require('puppeteer');
const axios = require('axios');
const { WebcastPushConnection } = require('tiktok-live-connector');

// ==========================================
// НАЛАШТУВАННЯ АКАУНТІВ ANTIQUE LIFE
// ==========================================
const IG_TARGET_ACCOUNT = 'antique_life_shop'; 
const TIKTOK_TARGET_ACCOUNT = 'antique_life_tiktok'; 
const YOUTUBE_TARGET_ACCOUNT = 'AntiqueLifeChannel'; // Ваш handle (той, що з @)
const SPRING_WEBHOOK_URL = 'https://ваша-апі-адреса.com/api/internal/stream/webhook';

// ==========================================
// 1. TIKTOK (Слухач через WebSockets)
// ==========================================
function startTikTokListener() {
    console.log(`🎧 Підключення до TikTok: @${TIKTOK_TARGET_ACCOUNT}...`);
    let tiktokLiveConnection = new WebcastPushConnection(TIKTOK_TARGET_ACCOUNT);

    tiktokLiveConnection.connect().then(state => {
        console.log(`✅ TikTok: підключено (Кімната ${state.roomId})`);
    }).catch(err => {
        // Якщо ефіру немає, підключення відхиляється. Пробуємо знову через хвилину.
        setTimeout(startTikTokListener, 60000); 
    });

    tiktokLiveConnection.on('streamEnd', () => {
        console.log('⚪️ TikTok: Ефір завершено!');
        sendWebhook('TIKTOK', false, '');
        setTimeout(startTikTokListener, 60000);
    });

    tiktokLiveConnection.on('connected', () => {
        console.log('🔴 TikTok: ЕФІР АКТИВНИЙ!');
        sendWebhook('TIKTOK', true, `https://www.tiktok.com/@${TIKTOK_TARGET_ACCOUNT}/live`);
    });
}

// ==========================================
// 2. YOUTUBE (Легкий HTTP Scraping)
// ==========================================
async function checkYouTubeLive() {
    console.log('▶️ Перевірка YouTube...');
    try {
        // Ютуб перенаправляє це посилання на активний стрім (якщо він є)
        const ytUrl = `https://www.youtube.com/@${YOUTUBE_TARGET_ACCOUNT}/live`;
        const response = await axios.get(ytUrl);

        // Шукаємо системний маркер прямого ефіру
        const isLive = response.data.includes('"isLiveNow":true');

        if (isLive) {
            // Витягуємо ID відео, щоб передати точне посилання для вашого iframe на сайті
            const videoIdMatch = response.data.match(/"videoId":"(.*?)"/);
            const videoUrl = videoIdMatch ? `https://www.youtube.com/watch?v=${videoIdMatch[1]}` : ytUrl;
            
            console.log(`🔴 YouTube: ЕФІР АКТИВНИЙ!`);
            sendWebhook('YOUTUBE', true, videoUrl);
        } else {
            console.log(`⚪️ YouTube: мовчить.`);
            sendWebhook('YOUTUBE', false, ''); 
        }
    } catch (error) {
        console.error('❌ Помилка YouTube перевірки:', error.message);
    }
}

// ==========================================
// 3. INSTAGRAM (Важкий Scraping через Puppeteer)
// ==========================================
async function checkInstagramLive() {
    console.log('👁️ Перевірка Instagram...');
    
    // Аргументи для стабільної роботи на Linux-серверах
    const browser = await puppeteer.launch({ 
        headless: true, 
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // <--- Ось це додати
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();

    try {
        await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2' });
        await page.waitForSelector('[name="username"]', { timeout: 15000 });
        
        await page.type('[name="username"]', process.env.BOT_USERNAME, { delay: 50 });
        await page.type('[name="password"]', process.env.BOT_PASSWORD, { delay: 50 });
        await page.click('[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        const liveUrl = `https://www.instagram.com/${IG_TARGET_ACCOUNT}/live/`;
        await page.goto(liveUrl, { waitUntil: 'networkidle2' });

        const currentUrl = page.url();
        const isLive = currentUrl.includes('/live/');

        if (isLive) {
            console.log(`🔴 Instagram: ЕФІР АКТИВНИЙ!`);
            sendWebhook('INSTAGRAM', true, currentUrl);
        } else {
            console.log(`⚪️ Instagram: мовчить.`);
            sendWebhook('INSTAGRAM', false, '');
        }
    } catch (error) {
        console.error('❌ Помилка Instagram скрапера:', error.message);
    } finally {
        await browser.close();
    }
}

// ==========================================
// 4. ВІДПРАВКА ДАНИХ НА ВАШ SPRING BOOT
// ==========================================
async function sendWebhook(platform, isActive, url) {
    try {
        await axios.post(SPRING_WEBHOOK_URL, { platform, isActive, url });
        console.log(`📤 Відправлено в Spring: ${platform} -> ${isActive}`);
    } catch (err) {
        console.error(`❌ Помилка зв'язку зі Spring сервером:`, err.message);
    }
}

// ==========================================
// ЗАПУСК УСІХ МОДУЛІВ
// ==========================================
console.log('🚀 Радар Antique Life запущено!');

// ТікТок працює через підключення, запускаємо один раз
startTikTokListener(); 

// Ютуб легкий, можна перевіряти кожні 2 хвилини
setInterval(checkYouTubeLive, 2 * 60 * 1000); 
checkYouTubeLive(); // Перший запуск одразу

// Інстаграм важкий, перевіряємо кожні 3 хвилини
setInterval(checkInstagramLive, 3 * 60 * 1000); 
checkInstagramLive(); // Перший запуск одразу
