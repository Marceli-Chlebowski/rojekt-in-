// routes/favorites.js
const express = require('express');
const axios = require('axios');
const pool = require('../config/db');

const router = express.Router();

// Middleware: wymaga zalogowania do zarządzania ulubionymi
function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/auth/login');
    return next();
}

/* =========================================================
   LISTA ULUBIONYCH
========================================================= */

router.get('/', requireAuth, async (req, res) => {
    try {
        // Pobranie ulubionych ID z bazy
        const [favRows] = await pool.query(
            'SELECT coin_id, added_at FROM favorites WHERE user_id = ? ORDER BY added_at DESC',
            [req.session.user.id]
        );

        const favoriteIds = favRows.map(r => r.coin_id);

        // Próba uzupełnienia danych z cache aplikacji
        const cache = req.app.locals.cryptoCache || { data: [] };
        const fromCache = cache.data.filter(c => favoriteIds.includes(c.id));

        // Dociągnięcie brakujących elementów z API (CoinGecko)
        const haveIds = new Set(fromCache.map(c => c.id));
        const missingIds = favoriteIds.filter(id => !haveIds.has(id));

        let fetched = [];
        if (missingIds.length) {
            const url = 'https://api.coingecko.com/api/v3/coins/markets';
            const resApi = await axios.get(url, {
                params: {
                    vs_currency: 'usd',
                    ids: missingIds.join(','),
                    order: 'market_cap_desc',
                    per_page: missingIds.length,
                    page: 1,
                    sparkline: false
                },
                timeout: 10000
            });
            fetched = Array.isArray(resApi.data) ? resApi.data : [];
        }

        // Złożenie wyników w kolejności z bazy (favoriteIds)
        const mapAll = new Map([...fromCache, ...fetched].map(c => [c.id, c]));
        const favCryptos = favoriteIds.map(id => mapAll.get(id)).filter(Boolean);

        return res.render('favorites', {
            cryptos: favCryptos,
            favoriteIds,
            currentPage: 1,
            totalPages: 1,
            search: ''
        });
    } catch (e) {
        console.error('[FAV][LIST] Błąd:', e.code || e.message || e);
        return res.render('favorites', {
            cryptos: [],
            favoriteIds: [],
            currentPage: 1,
            totalPages: 1,
            search: ''
        });
    }
});

/* =========================================================
   DODAJ/USUŃ Z ULUBIONYCH (TOGGLE)
========================================================= */

router.post('/toggle', requireAuth, async (req, res) => {
    try {
        // Walidacja wejścia
        const coin_id = (req.body?.coin_id || '').trim();
        if (!coin_id) return res.status(422).json({ error: 'Brak coin_id' });

        // Sprawdzenie czy już istnieje w ulubionych
        const [found] = await pool.query(
            'SELECT id FROM favorites WHERE user_id = ? AND coin_id = ?',
            [req.session.user.id, coin_id]
        );

        if (found.length) {
            // Usuwamy z ulubionych
            await pool.query(
                'DELETE FROM favorites WHERE user_id = ? AND coin_id = ?',
                [req.session.user.id, coin_id]
            );
            return res.json({ ok: true, liked: false });
        } else {
            // Dodajemy do ulubionych
            await pool.query(
                'INSERT INTO favorites (user_id, coin_id) VALUES (?, ?)',
                [req.session.user.id, coin_id]
            );
            return res.json({ ok: true, liked: true });
        }
    } catch (e) {
        console.error('[FAV][TOGGLE] Błąd:', e.code || e.message || e);
        return res.status(500).json({ error: 'Błąd serwera (favorites).' });
    }
});

module.exports = router;
