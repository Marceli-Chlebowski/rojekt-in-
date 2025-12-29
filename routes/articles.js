// routes/articles.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Middleware: wymagamy zalogowania do dodawania komentarzy
function requireUser(req, res, next) {
    if (req.session && req.session.user) return next();
    req.flash('error', 'Musisz być zalogowany, aby dodać komentarz.');
    return res.redirect('/auth/login');
}

/* =========================================================
   LISTA ARTYKUŁÓW
========================================================= */

router.get('/', async (req, res) => {
    try {
        const [articles] = await pool.query(
            'SELECT id, title, summary, image_url, created_at FROM articles ORDER BY created_at DESC'
        );

        return res.render('articles', { articles });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd ładowania artykułów');
    }
});

/* =========================================================
   SZCZEGÓŁ ARTYKUŁU + KOMENTARZE
========================================================= */

router.get('/:id', async (req, res) => {
    const articleId = req.params.id;

    const [[article]] = await pool.query('SELECT * FROM articles WHERE id = ?', [articleId]);
    if (!article) return res.status(404).send('Nie znaleziono artykułu');

    // Pobranie komentarzy wraz z nazwą użytkownika
    const [comments] = await pool.query(
        `SELECT c.*, u.username
         FROM article_comments c
                  JOIN users u ON u.id = c.user_id
         WHERE c.article_id = ?
         ORDER BY c.created_at DESC`,
        [articleId]
    );

    return res.render('article_detail', {
        article,
        comments,
        user: req.session.user || null
    });
});

/* =========================================================
   DODAWANIE KOMENTARZA
========================================================= */

router.post('/:id/comments', requireUser, async (req, res) => {
    const articleId = req.params.id;
    const { content } = req.body;
    const userId = req.session.user.id;

    // Walidacja treści komentarza
    if (!content || !content.trim()) {
        req.flash('error', 'Komentarz nie może być pusty.');
        return res.redirect('/articles/' + articleId);
    }

    try {
        await pool.query(
            'INSERT INTO article_comments (article_id, user_id, content) VALUES (?, ?, ?)',
            [articleId, userId, content.trim()]
        );

        req.flash('success', 'Dodano komentarz.');
        return res.redirect('/articles/' + articleId);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd podczas dodawania komentarza.');
        return res.redirect('/articles/' + articleId);
    }
});

module.exports = router;
