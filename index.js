const { TikTokLiveConnection } = require('tiktok-live-connector');
const axios = require('axios');
require('dotenv').config();

const TIKTOK_USERNAME = process.env.TIKTOK_TARGET_ACCOUNT || 'france_antique_centre';
const BACKEND_URL = process.env.SPRING_WEBHOOK_URL;
const SECRET_TOKEN = process.env.WEBHOOK_SECRET;

console.log(`📡 TikTok Радар активовано для @${TIKTOK_USERNAME}`);

function sendToSpring(isActive, url = '') {
    axios.post(BACKEND_URL, {
        platform: 'TIKTOK',
        isActive: isActive,
        url: url
    }, {
        headers: { 'Authorization': `Bearer ${SECRET_TOKEN}` }
    })
        .then(() => console.log(`📤 Статус TikTok (${isActive}) відправлено на бекенд.`))
        .catch(err => console.error('❌ Помилка зв\'язку з бекендом:', err.message));
}

function startTikTokListener() {
    // Переконайся, що TIKTOK_USERNAME не містить символу @
    let tiktokConnect = new TikTokLiveConnection(TIKTOK_USERNAME);

    tiktokConnect.connect()
        .then(state => {
            console.log(`🔴 TikTok: ЕФІР АКТИВНИЙ! (ID: ${state.roomId})`);
            sendToSpring(true, `https://www.tiktok.com/@${TIKTOK_USERNAME}/live`);
        })
        .catch(err => {
            // ТУТ КРИЄТЬСЯ ВІДПОВІДЬ:
            console.error('❌ Помилка підключення:', err.message || err);

            // Якщо це бан по IP, краще почекати довше перед перезапуском
            setTimeout(startTikTokListener, 120000);
        });

    tiktokConnect.on('streamEnd', () => {
        console.log('⚪️ TikTok: Ефір завершено.');
        sendToSpring(false);
        setTimeout(startTikTokListener, 60000);
    });

    tiktokConnect.on('error', (err) => {
        // Додаємо вивід самої помилки
        console.error('⚠️ Помилка під час ефіру:', err.message || err);
        setTimeout(startTikTokListener, 60000);
    });
}

const http = require('http');

// Створюємо міні-сервер для Render
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('TikTok Radar is running...');
});

// Render сам підставить порт у змінну оточення PORT
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`✅ Dummy server is listening on port ${PORT}`);
});

startTikTokListener();