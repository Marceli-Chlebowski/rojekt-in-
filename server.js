require('dotenv').config();
const http = require('http');
const axios = require('axios');

const app = require('./app');
const pool = require('./config/db');

const PORT = process.env.PORT || 3000;

// --- Helpers do pobierania z CoinGecko ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

const fetchWithRetry = async (url, opts = {}, maxRetries = 4, initialDelay = 2000) => {
    let lastErr;
    let delay = initialDelay;
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

// --- Aktualizacja kryptowalut w bazie co 2 minuty ---
const updateCryptosInDB = async () => {
    try {
        const url = 'https://api.coingecko.com/api/v3/coins/markets';
        const opts = {
            params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 100, page: 1, sparkline: false },
            timeout: 10000
        };
        const res = await fetchWithRetry(url, opts, 4, 2000);
        if (!Array.isArray(res.data)) throw new Error('Nieprawidłowa odpowiedź API');

        const cryptos = res.data;

        // Insert or update each crypto in DB
        const queries = cryptos.map(c => {
            return pool.query(
                `INSERT INTO cryptocurrencies (id, symbol, name, image, current_price, market_cap, market_cap_rank, total_volume, price_change_percentage_24h)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                                          symbol = VALUES(symbol),
                                          name = VALUES(name),
                                          image = VALUES(image),
                                          current_price = VALUES(current_price),
                                          market_cap = VALUES(market_cap),
                                          market_cap_rank = VALUES(market_cap_rank),
                                          total_volume = VALUES(total_volume),
                                          price_change_percentage_24h = VALUES(price_change_percentage_24h)`,
                [
                    c.id,
                    c.symbol,
                    c.name,
                    c.image,
                    c.current_price,
                    c.market_cap,
                    c.market_cap_rank,
                    c.total_volume,
                    c.price_change_percentage_24h
                ]
            );
        });

        await Promise.all(queries);
        console.log(`[DB] Zaktualizowano ${cryptos.length} kryptowalut.`);
    } catch (err) {
        console.warn('Aktualizacja kryptowalut w DB nie powiodła się:', err.message || err);
    }
};

// Initial update and set interval
updateCryptosInDB();
setInterval(updateCryptosInDB, 2 * 60 * 1000);

// --- Strony ---
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

        // Pobierz kryptowaluty z bazy
        let query = 'SELECT * FROM cryptocurrencies';
        let params = [];
        if (search) {
            query += ' WHERE LOWER(name) LIKE ? OR LOWER(symbol) LIKE ?';
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam);
        }
        query += ' ORDER BY market_cap_rank ASC LIMIT ? OFFSET ?';
        params.push(perPage, (page - 1) * perPage);

        const [rows] = await pool.query(query, params);

        // Pobierz łączną liczbę wyników dla paginacji
        let totalResults = 0;
        if (search) {
            const countQuery = 'SELECT COUNT(*) as count FROM cryptocurrencies WHERE LOWER(name) LIKE ? OR LOWER(symbol) LIKE ?';
            const [countRows] = await pool.query(countQuery, [`%${search}%`, `%${search}%`]);
            totalResults = countRows[0].count;
        } else {
            const countQuery = 'SELECT COUNT(*) as count FROM cryptocurrencies';
            const [countRows] = await pool.query(countQuery);
            totalResults = countRows[0].count;
        }

        const totalPages = Math.max(1, Math.ceil(totalResults / perPage));

        rows.forEach(c => {
            if (typeof c.price_change_percentage_24h !== 'number') c.price_change_percentage_24h = 0;
        });

        res.render('index', {
            cryptos: rows,
            currentPage: page,
            totalPages,
            search,
            favoriteIds
        });
    } catch (err) {
        console.error('Błąd pobierania kryptowalut z bazy:', err.message || err);
        res.render('index', { cryptos: [], currentPage: 1, totalPages: 1, search: '', favoriteIds: [] });
    }
});

// Szczegóły kryptowaluty
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