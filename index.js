const { TikTokLiveConnection } = require('tiktok-live-connector');
const axios = require('axios');
require('dotenv').config();

const TIKTOK_USERNAME = process.env.TIKTOK_TARGET_ACCOUNT || 'france_antique_centre';
const BACKEND_URL = process.env.SPRING_WEBHOOK_URL;
const SECRET_TOKEN = 'antique_super_secret_token_2026';

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
    let tiktokConnect = new TikTokLiveConnection(TIKTOK_USERNAME);

    tiktokConnect.connect()
        .then(state => {
            console.log(`🔴 TikTok: ЕФІР АКТИВНИЙ! (ID: ${state.roomId})`);
            sendToSpring(true, `https://www.tiktok.com/@${TIKTOK_USERNAME}/live`);
        })
        .catch(err => {
            setTimeout(startTikTokListener, 60000);
        });

    tiktokConnect.on('streamEnd', () => {
        console.log('⚪️ TikTok: Ефір завершено.');
        sendToSpring(false);
        setTimeout(startTikTokListener, 60000);
    });

    tiktokConnect.on('error', (err) => {
        console.log('⚠️ TikTok Error, перезапуск...');
        setTimeout(startTikTokListener, 60000);
    });
}

startTikTokListener();