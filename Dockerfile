# 1. Використовуємо офіційний легкий образ Node.js (версія 20)
FROM node:20-slim

# 2. Встановлюємо системний Chromium та необхідні шрифти для рендерингу сторінок
# Це позбавить нас від мільйона помилок відсутності Linux-бібліотек
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 3. Кажемо Puppeteer НЕ завантажувати свою версію Chrome (щоб зекономити пам'ять і час збірки),
# а використовувати той Chromium, який ми щойно встановили в систему
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 4. Створюємо робочу папку для нашого мікросервісу
WORKDIR /usr/src/app

# 5. Спочатку копіюємо файли залежностей (package.json)
# Це робиться окремим кроком для кешування Docker (щоб швидше збиралося наступного разу)
COPY package*.json ./

# 6. Встановлюємо всі npm-пакети
RUN npm install

# 7. Копіюємо наш головний файл index.js та всі інші файли
COPY . .

# 8. Запускаємо нашого бота!
CMD ["node", "index.js"]
