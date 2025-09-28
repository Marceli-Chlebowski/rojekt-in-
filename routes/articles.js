// routes/articles.js
const express = require('express');
const router = express.Router();
const { simpleExecute } = require('../config/db');

router.get('/', async (req, res) => {
    try {
        const result = await simpleExecute('SELECT id, title, summary, created_at FROM articles ORDER BY created_at DESC');
        res.render('articles', { articles: result.rows || [] });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania artykułów');
        res.redirect('/');
    }
});

module.exports = router;