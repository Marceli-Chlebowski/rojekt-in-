require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const bodyParser = require('body-parser');
const axios = require('axios');
const { initPool, closePool } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

const expressLayouts = require('express-ejs-layouts');
app.use(expressLayouts);
app.set('layout', 'layout'); // domyślny layout.ejs

// view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// static
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// session + flash
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false
}));
app.use(flash());

// locals for flash/messages/user
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

// routes
const authRoutes = require('./routes/auth');
const articlesRoutes = require('./routes/articles');
const quizRoutes = require('./routes/quiz');
const adminRoutes = require('./routes/admin');

app.use('/', authRoutes);
app.use('/articles', articlesRoutes);
app.use('/quiz', quizRoutes);
app.use('/admin', adminRoutes);



// Funkcja sleep, jeśli w przyszłości będzie potrzeba wielu żądań do API
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// helper do fetch z retry i exponential backoff (obsługa 429 i innych błędów)
const fetchWithRetry = async (url, opts = {}, maxRetries = 4, initialDelay = 2000) => {
    let lastErr;
    let delay = initialDelay;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await axios.get(url, opts);
        } catch (err) {
            lastErr = err;
            const status = err?.response?.status;
            if (status === 429 && i < maxRetries - 1) {
                const ra = err.response.headers['retry-after'];
                const wait = ra ? parseInt(ra, 10) * 1000 : delay;
                console.warn(`429 otrzymane — czekam ${wait}ms przed retry (${i + 1}/${maxRetries})`);
                await sleep(wait);
                delay *= 2; // exponential backoff
                continue;
            }
            break; // inne błędy - nie retry, tylko rzucamy
        }
    }
    throw lastErr;
};

// cache w pamięci z TTL 2 minuty
let cryptoCache = { data: [], updatedAt: 0, ttlMs: 2 * 60 * 1000 };

// Funkcja pobierająca TOP 100 kryptowalut z CoinGecko (1 żądanie)
const fetchAllCryptos = async () => {
    const url = 'https://api.coingecko.com/api/v3/coins/markets';
    const opts = {
        params: {
            vs_currency: 'usd',
            order: 'market_cap_desc',
            per_page: 100,
            page: 1,
            sparkline: false
        },
        timeout: 10000
    };
    let res;
    try {
        res = await fetchWithRetry(url, opts, 4, 2000);
    } catch (err) {
        console.warn(`Błąd pobierania kryptowalut:`, err.message || err);
        throw err;
    }
    if (Array.isArray(res.data)) {
        cryptoCache.data = res.data;
        cryptoCache.updatedAt = Date.now();
        return res.data;
    }
    throw new Error('Nieprawidłowa odpowiedź API');
};

// Trasa szczegółów kryptowaluty z dynamicznym zakresem (days przez query, domyślnie 7)
app.get('/crypto/:id', async (req, res) => {
    const { id } = req.params;
    const days = req.query.days || 7;
    try {
        // szczegóły kryptowaluty
        const coinRes = await fetchWithRetry(`https://api.coingecko.com/api/v3/coins/${id}`, {}, 4, 2000);
        const coin = coinRes.data;

        // historia cen z wybranym zakresem
        const chartRes = await fetchWithRetry(`https://api.coingecko.com/api/v3/coins/${id}/market_chart`, {
            params: { vs_currency: 'usd', days }
        }, 4, 2000);

        res.render('crypto-details', { coin, chartData: chartRes.data.prices, chartDays: days });
    } catch (err) {
        console.error('Błąd pobierania szczegółów kryptowaluty:', err.message || err);
        req.flash('error', 'Nie udało się pobrać danych o kryptowalucie');
        res.redirect('/');
    }
});

// Endpoint API do pobierania wykresu (AJAX)
app.get('/api/coin/:id/market_chart', async (req, res) => {
    const { id } = req.params;
    const days = req.query.days || 7;
    try {
        const chartRes = await fetchWithRetry(`https://api.coingecko.com/api/v3/coins/${id}/market_chart`, {
            params: { vs_currency: 'usd', days }
        }, 4, 2000);
        res.json({ prices: chartRes.data.prices });
    } catch (err) {
        console.error('Błąd pobierania wykresu:', err.message || err);
        res.status(500).json({ error: 'Nie udało się pobrać wykresu' });
    }
});

// Odświeżaj cache co 2 minuty
const refreshCryptoCache = async () => {
    return await fetchAllCryptos();
};

setInterval(async () => {
    try {
        await refreshCryptoCache();
    } catch (err) {
        console.warn('Nie udało się odświeżyć cache kryptowalut:', err.message || err);
    }
}, cryptoCache.ttlMs);

// trasa główna - paginacja, cache, retry, obsługa top 100 z cache
app.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const perPage = 50;
    const search = req.query.search ? String(req.query.search).toLowerCase() : '';
    try {
        // Upewnij się, że cache jest aktualny
        const age = Date.now() - cryptoCache.updatedAt;
        if (!cryptoCache.data.length || age > cryptoCache.ttlMs) {
            await refreshCryptoCache();
        }

        // Wyszukiwanie w top 100
        let filteredCryptos = cryptoCache.data;
        if (search) {
            filteredCryptos = filteredCryptos.filter(c =>
                (c.name && c.name.toLowerCase().includes(search)) ||
                (c.symbol && c.symbol.toLowerCase().includes(search))
            );
        }

        // Paginacja po filtrze (50 na stronę)
        const totalResults = filteredCryptos.length;
        const totalPages = Math.max(1, Math.ceil(totalResults / perPage));
        const paginatedCryptos = filteredCryptos.slice((page - 1) * perPage, page * perPage);

        // Fix: price_change_percentage_24h może być null, naprawiamy na 0 lub null-safe
        paginatedCryptos.forEach(c => {
            if (typeof c.price_change_percentage_24h !== 'number') {
                c.price_change_percentage_24h = 0;
            }
        });

        res.render('index', {
            cryptos: paginatedCryptos,
            currentPage: page,
            totalPages,
            search
        });
    } catch (err) {
        console.error('Błąd pobierania kryptowalut:', err.message || err);
        res.render('index', { cryptos: [], currentPage: 1, totalPages: 1, search: '' });
    }
});

(async () => {
    try {
        await initPool();
        app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
    } catch (err) {
        console.error('Failed to start app', err);
    }
})();

// graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await closePool();
    process.exit(0);
});