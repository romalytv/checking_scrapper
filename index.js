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

    console.log('👁️ Перевірка Instagram...');
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // Вкрай важливо для Docker
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
            await sendWebhook('INSTAGRAM', true, currentUrl); // <--- додали await
        } else {
            console.log(`⚪️ Instagram: мовчить.`);
            await sendWebhook('INSTAGRAM', false, ''); // <--- додали await
        }
    } catch (error) {
        console.error('❌ Помилка Instagram скрапера:', error.message);
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