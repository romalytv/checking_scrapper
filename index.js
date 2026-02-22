require('dotenv').config();
const puppeteer = require('puppeteer');
const axios = require('axios');
const { TikTokLiveConnection } = require('tiktok-live-connector');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Antique Life Scraper Bot is alive and running!');
});

const IG_TARGET_ACCOUNT = process.env.IG_TARGET_ACCOUNT;
const TIKTOK_TARGET_ACCOUNT = process.env.TIKTOK_TARGET_ACCOUNT;
const YOUTUBE_TARGET_ACCOUNT = process.env.YOUTUBE_TARGET_ACCOUNT;
const SPRING_WEBHOOK_URL = process.env.SPRING_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function startTikTokListener() {
    if (!TIKTOK_TARGET_ACCOUNT) return console.log('⚠️ ТікТок акаунт не вказано.');

    console.log(`🎧 Підключення до TikTok: @${TIKTOK_TARGET_ACCOUNT}...`);
    let tiktokLiveConnection = new TikTokLiveConnection(TIKTOK_TARGET_ACCOUNT);

    tiktokLiveConnection.connect().then(state => {
        console.log(`✅ TikTok: підключено (Кімната ${state.roomId})`);
    }).catch(err => {
        setTimeout(startTikTokListener, 60000);
    });

    tiktokLiveConnection.on('streamEnd', async () => { // <--- додали async
        console.log('⚪️ TikTok: Ефір завершено!');
        await sendWebhook('TIKTOK', false, ''); // <--- додали await
        setTimeout(startTikTokListener, 60000);
    });

    tiktokLiveConnection.on('connected', async () => { // <--- додали async
        console.log('🔴 TikTok: ЕФІР АКТИВНИЙ!');
        await sendWebhook('TIKTOK', true, `https://www.tiktok.com/@${TIKTOK_TARGET_ACCOUNT}/live`); // <--- додали await
    });
}

async function checkYouTubeLive() {
    if (!YOUTUBE_TARGET_ACCOUNT) return;

    console.log('▶️ Перевірка YouTube...');
    try {
        const ytUrl = `https://www.youtube.com/@${YOUTUBE_TARGET_ACCOUNT}/live`;
        const response = await axios.get(ytUrl);
        const isLive = response.data.includes('"isLiveNow":true');

        if (isLive) {
            const videoIdMatch = response.data.match(/"videoId":"(.*?)"/);
            const videoUrl = videoIdMatch ? `https://www.youtube.com/watch?v=${videoIdMatch[1]}` : ytUrl;
            console.log(`🔴 YouTube: ЕФІР АКТИВНИЙ!`);
            await sendWebhook('YOUTUBE', true, videoUrl);
        } else {
            console.log(`⚪️ YouTube: мовчить.`);
            await sendWebhook('YOUTUBE', false, '');
        }
    } catch (error) {
        console.error('❌ Помилка YouTube перевірки:', error.message);
    }
}

async function checkInstagramLive() {
    if (!IG_TARGET_ACCOUNT || !process.env.BOT_USERNAME || !process.env.BOT_PASSWORD) {
        return console.log('⚠️ Дані для Інстаграму не налаштовані.');
    }

    console.log('👁️ Перевірка Instagram (режим маскування)...');

    const browser = await puppeteer.launch({
        headless: "new", // Використовуємо новий режим headless
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled', // Прибирає мітку "Бот"
            '--window-size=1920,1080'
        ]
    });

    const page = await browser.newPage();

    // 1. Маскуємо параметри браузера
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // Функція для рандомних пауз (як у людини)
    const randomDelay = (min, max) => new Promise(res => setTimeout(res, Math.floor(Math.random() * (max - min + 1) + min)));

    try {
        // Переходимо спочатку на головну, а не відразу на логін
        await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
        await randomDelay(2000, 5000);

        await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('[name="username"]', { timeout: 30000 });
        await randomDelay(1500, 3500);

        // Імітуємо реальний набір тексту з різною швидкістю клавіш
        await page.type('[name="username"]', process.env.BOT_USERNAME, { delay: Math.floor(Math.random() * 100) + 50 });
        await randomDelay(800, 2000);
        await page.type('[name="password"]', process.env.BOT_PASSWORD, { delay: Math.floor(Math.random() * 100) + 70 });

        await randomDelay(1000, 2500);
        await page.click('[type="submit"]');

        // Чекаємо переходу після логіну
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
        console.log('🔓 Авторизація успішна');
        await randomDelay(3000, 6000);

        const liveUrl = `https://www.instagram.com/${IG_TARGET_ACCOUNT}/live/`;
        await page.goto(liveUrl, { waitUntil: 'networkidle2' });
        await randomDelay(2000, 4000);

        const currentUrl = page.url();
        const isLive = currentUrl.includes('/live/');

        if (isLive) {
            console.log(`🔴 Instagram: ЕФІР АКТИВНИЙ!`);
            await sendWebhook('INSTAGRAM', true, currentUrl);
        } else {
            console.log(`⚪️ Instagram: мовчить.`);
            await sendWebhook('INSTAGRAM', false, '');
        }
    } catch (error) {
        console.error('❌ Помилка Instagram скрапера:', error.message);
        // Робимо скріншот помилки для діагностики (тільки якщо тестуєте локально)
        // await page.screenshot({ path: 'error_debug.png' });
    } finally {
        await browser.close();
    }
}

async function sendWebhook(platform, isActive, url) {
    if (!SPRING_WEBHOOK_URL) return;

    try {
        await axios.post(SPRING_WEBHOOK_URL,
            { platform, isActive, url },
            {
                headers: {
                    'Authorization': `Bearer ${WEBHOOK_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`📤 Відправлено в Spring: ${platform} -> ${isActive}`);
    } catch (err) {
        console.error(`❌ Помилка зв'язку зі Spring сервером:`, err.message);
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущено на порту ${PORT}`);
    console.log('📡 Радар Antique Life активовано!');

    // Запускаємо слухачів
    startTikTokListener();

    setInterval(checkYouTubeLive, 2 * 60 * 1000);
    checkYouTubeLive().catch(console.error);

    setInterval(checkInstagramLive, 3 * 60 * 1000);
    checkInstagramLive().catch(console.error);
});