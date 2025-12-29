const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Middleware: dostęp tylko dla zalogowanych
function requireLogin(req, res, next) {
    if (!req.session.user) {
        req.flash('error', 'Musisz być zalogowany');
        return res.redirect('/login');
    }
    return next();
}

/* =========================================================
   FORMULARZ
========================================================= */

// Wyświetlenie formularza (tylko zalogowani)
router.get('/', requireLogin, async (req, res) => {
    const [countries] = await pool.execute(
        'SELECT country_code, country_name FROM tax_rules ORDER BY country_name'
    );

    return res.render('tax', {
        countries,
        result: null,
        form: {}
    });
});

/* =========================================================
   OBLICZENIE PODATKU + ZAPIS WYNIKU
========================================================= */

router.post('/calculate', requireLogin, async (req, res) => {
    const { buy_price, sell_price, amount, country_code, buy_date, sell_date } = req.body;

    // Pobranie stawek podatkowych dla kraju
    const [rows] = await pool.execute(
        'SELECT tax_rate, long_term_rate, long_term_days FROM tax_rules WHERE country_code = ?',
        [country_code]
    );

    if (!rows.length) {
        req.flash('error', 'Brak stawki podatkowej');
        return res.redirect('/tax');
    }

    // Wyliczenie liczby dni trzymania aktywa
    const buyDate = new Date(buy_date);
    const sellDate = new Date(sell_date);
    const holdingDays = Math.floor((sellDate - buyDate) / (1000 * 60 * 60 * 24));

    // Dobór stawki (standardowa vs długoterminowa)
    let taxRate = rows[0].tax_rate;
    const isLongTerm = rows[0].long_term_days && holdingDays >= rows[0].long_term_days;
    if (isLongTerm) {
        taxRate = rows[0].long_term_rate;
    }

    // Zysk i należny podatek (tylko od dodatniego zysku)
    const profit = (sell_price - buy_price) * amount;
    const taxDue = profit > 0 ? profit * (taxRate / 100) : 0;

    // Zapis kalkulacji do bazy
    await pool.execute(
        `INSERT INTO tax_calculations
             (user_id, country_code, buy_price, sell_price, amount, profit, tax_due, buy_date, sell_date, holding_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            req.session.user.id,
            country_code,
            buy_price,
            sell_price,
            amount,
            profit,
            taxDue,
            buy_date,
            sell_date,
            holdingDays
        ]
    );

    // Ponowne pobranie listy krajów do renderu
    const [countries] = await pool.execute(
        'SELECT country_code, country_name FROM tax_rules ORDER BY country_name'
    );

    return res.render('tax', {
        countries,
        form: { buy_price, sell_price, amount, country_code, buy_date, sell_date },
        result: {
            profit,
            taxRate,
            taxDue,
            holdingDays,
            isLongTerm
        }
    });
});

module.exports = router;
