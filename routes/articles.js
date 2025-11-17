const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // pool MySQL do zapytań

router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT id, title, summary, created_at FROM articles ORDER BY created_at DESC'
        );
        res.render('articles', { articles: rows || [] });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania artykułów');
        res.redirect('/');
    }
});

// Pojedynczy artykuł
router.get('/:id', async (req, res) => {
    const articleId = req.params.id;
    try {
        const [rows] = await pool.execute(
            'SELECT id, title, summary, content, created_at FROM articles WHERE id = ?',
            [articleId]
        );
        if (rows.length === 0) {
            req.flash('error', 'Artykuł nie został znaleziony');
            return res.redirect('/articles');
        }
        res.render('article_detail', { article: rows[0] });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania artykułu');
        res.redirect('/articles');
    }
});

module.exports = router;