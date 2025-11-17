require('dotenv').config();
const http = require('http');
const axios = require('axios');

const app = require('./app');
const pool = require('./config/db');

const PORT = process.env.PORT || 3000;

// --- Helpers do pobierania z CoinGecko ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

const fetchWithRetry = async (url, opts = {}, maxRetries = 4, initialDelay = 2000) => {
    let lastErr; let delay = initialDelay;
    for (let i = 0; i < maxRetries; i++) {
        try { return await axios.get(url, opts); }
        catch (err) {
            lastErr = err;
            const status = err?.response?.status;
            if (status === 429 && i < maxRetries - 1) {
                const ra = err.response.headers['retry-after'];
                const wait = ra ? parseInt(ra, 10) * 1000 : delay;
                console.warn(`429 — retry za ${wait}ms (${i + 1}/${maxRetries})`);
                await sleep(wait); delay *= 2; continue;
            }
            break;
        }
    }
    throw lastErr;
};

// --- Cache top 100 kryptowalut ---
let cryptoCache = { data: [], updatedAt: 0, ttlMs: 2 * 60 * 1000 };
app.locals.cryptoCache = cryptoCache;

const fetchAllCryptos = async () => {
    const url = 'https://api.coingecko.com/api/v3/coins/markets';
    const opts = {
        params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 100, page: 1, sparkline: false },
        timeout: 10000
    };
    const res = await fetchWithRetry(url, opts, 4, 2000);
    if (!Array.isArray(res.data)) throw new Error('Nieprawidłowa odpowiedź API');
    cryptoCache.data = res.data;
    cryptoCache.updatedAt = Date.now();
    app.locals.cryptoCache = cryptoCache;
    return res.data;
};

const refreshCryptoCache = async () => await fetchAllCryptos();

setInterval(async () => {
    try { await refreshCryptoCache(); }
    catch (err) { console.warn('Odświeżanie cache nie powiodło się:', err.message || err); }
}, cryptoCache.ttlMs);

// --- Trasy ---
// Strona główna z listą/paginacją/wyszukiwaniem + ulubione
app.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const perPage = 50;
    const search = req.query.search ? String(req.query.search).toLowerCase() : '';
    try {
        // ulubione ID (dla zalogowanego)
        let favoriteIds = [];
        if (req.session.user) {
            const [favRows] = await pool.query('SELECT coin_id FROM favorites WHERE user_id = ?', [req.session.user.id]);
            favoriteIds = favRows.map(r => r.coin_id);
        }

        const age = Date.now() - cryptoCache.updatedAt;
        if (!cryptoCache.data.length || age > cryptoCache.ttlMs) await refreshCryptoCache();

        let filteredCryptos = cryptoCache.data;
        if (search) {
            filteredCryptos = filteredCryptos.filter(c =>
                (c.name && c.name.toLowerCase().includes(search)) ||
                (c.symbol && c.symbol.toLowerCase().includes(search))
            );
        }

        const totalResults = filteredCryptos.length;
        const totalPages = Math.max(1, Math.ceil(totalResults / perPage));
        const paginatedCryptos = filteredCryptos.slice((page - 1) * perPage, page * perPage);

        paginatedCryptos.forEach(c => {
            if (typeof c.price_change_percentage_24h !== 'number') c.price_change_percentage_24h = 0;
        });

        res.render('index', {
            cryptos: paginatedCryptos,
            currentPage: page,
            totalPages,
            search,
            favoriteIds
        });
    } catch (err) {
        console.error('Błąd pobierania kryptowalut:', err.message || err);
        res.render('index', { cryptos: [], currentPage: 1, totalPages: 1, search: '', favoriteIds: [] });
    }
});

// Szczegóły
app.get('/crypto/:id', async (req, res) => {
    const { id } = req.params;
    const days = req.query.days || 7;
    try {
        const coinRes = await fetchWithRetry(`https://api.coingecko.com/api/v3/coins/${id}`, {}, 4, 2000);
        const coin = coinRes.data;
        const chartRes = await fetchWithRetry(`https://api.coingecko.com/api/v3/coins/${id}/market_chart`, {
            params: { vs_currency: 'usd', days }
        }, 4, 2000);

        res.render('crypto-details', { coin, chartData: chartRes.data.prices, chartDays: days });
    } catch (err) {
        console.error('Błąd pobierania szczegółów kryptowaluty:', err.message || err);
        res.redirect('/');
    }
});

// API wykresu
app.get('/api/coin/:id/market_chart', async (req, res) => {
    const { id } = req.params; const days = req.query.days || 7;
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

// sanity check DB
(async () => {
    try { await pool.query('SELECT 1'); console.log('[DB] OK'); }
    catch (e) { console.error('DB error:', e.message || e); }
})();

http.createServer(app).listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});

process.on('SIGINT', async () => { console.log('Shutting down...'); process.exit(0); });
