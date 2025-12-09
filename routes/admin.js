// routes/admin.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// proste dane logowania admina (na potrzeby projektu)
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// middleware: wymagamy zalogowania jako admin
function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    return res.redirect('/admin/login');
}

/* ---------- LOGOWANIE ---------- */

router.get('/login', (req, res) => {
    res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_LOGIN && password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        return res.redirect('/admin');
    }

    res.render('admin/login', { error: 'Zły login lub hasło' });
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
});

/* ---------- DASHBOARD ---------- */

router.get('/', requireAdmin, async (req, res) => {
    try {
        const [articles] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM articles'
        );
        const [quizzes] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM quizzes'
        );
        const [questions] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM quiz_questions'
        );
        // 👇 LICZENIE PYTAŃ MILIONERÓW
        const [millionaire] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM millionaire_questions'
        );

        res.render('admin/dashboard', {
            articlesCount: articles[0].cnt,
            quizzesCount: quizzes[0].cnt,
            questionsCount: questions[0].cnt,
            millionaireCount: millionaire[0].cnt   // 👈 PRZEKAZUJEMY DO EJS
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

/* ---------- ARTYKUŁY (tabela: articles) ---------- */


// lista artykułów
router.get('/articles', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, title, summary, image_url, created_at FROM articles ORDER BY created_at DESC'
        );
        res.render('admin/articles_list', { articles: rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// formularz dodawania
router.get('/articles/new', requireAdmin, (req, res) => {
    res.render('admin/articles_form', {
        article: null,
        action: '/admin/articles/new'
    });
});

// dodawanie artykułu (z obrazkiem)
router.post('/articles/new', requireAdmin, async (req, res) => {
    const { title, summary, image_url, content } = req.body;
    try {
        await pool.query(
            'INSERT INTO articles (title, summary, image_url, content) VALUES (?, ?, ?, ?)',
            [title, summary, image_url || null, content]
        );
        req.flash('success', 'Dodano artykuł');
        res.redirect('/admin/articles');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd zapisu artykułu');
        res.redirect('/admin/articles');
    }
});

// formularz edycji
router.get('/articles/:id/edit', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM articles WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.redirect('/admin/articles');

        res.render('admin/articles_form', {
            article: rows[0],
            action: `/admin/articles/${req.params.id}/edit`
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// zapis edycji (tekst + obrazek)
router.post('/articles/:id/edit', requireAdmin, async (req, res) => {
    const { title, summary, image_url, content } = req.body;
    try {
        await pool.query(
            'UPDATE articles SET title = ?, summary = ?, image_url = ?, content = ? WHERE id = ?',
            [title, summary, image_url || null, content, req.params.id]
        );
        req.flash('success', 'Zapisano zmiany artykułu');
        res.redirect('/admin/articles');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd zapisu artykułu');
        res.redirect('/admin/articles');
    }
});

// usuwanie artykułu (razem z komentarzami – dzięki ON DELETE CASCADE)
router.post('/articles/:id/delete', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM articles WHERE id = ?', [req.params.id]);
        req.flash('success', 'Usunięto artykuł');
        res.redirect('/admin/articles');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd usuwania artykułu');
        res.redirect('/admin/articles');
    }
});


/* ---------- QUIZY (tabela: quizzes) ---------- */

// lista quizów
router.get('/quizzes', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM quizzes ORDER BY id DESC');
        res.render('admin/quizzes_list', { quizzes: rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// formularz dodawania quizu
router.get('/quizzes/new', requireAdmin, (req, res) => {
    res.render('admin/quiz_form', {
        quiz: null,
        action: '/admin/quizzes/new'
    });
});

// dodanie quizu
router.post('/quizzes/new', requireAdmin, async (req, res) => {
    const { title, description } = req.body;
    try {
        await pool.query(
            'INSERT INTO quizzes (title, description) VALUES (?, ?)',
            [title, description]
        );
        res.redirect('/admin/quizzes');
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd zapisu quizu');
    }
});

// formularz edycji quizu
router.get('/quizzes/:id/edit', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.redirect('/admin/quizzes');
        res.render('admin/quiz_form', {
            quiz: rows[0],
            action: `/admin/quizzes/${req.params.id}/edit`
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// zapis edycji quizu
router.post('/quizzes/:id/edit', requireAdmin, async (req, res) => {
    const { title, description } = req.body;
    try {
        await pool.query(
            'UPDATE quizzes SET title = ?, description = ? WHERE id = ?',
            [title, description, req.params.id]
        );
        res.redirect('/admin/quizzes');
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd zapisu quizu');
    }
});

// usuwanie quizu
router.post('/quizzes/:id/delete', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM quizzes WHERE id = ?', [req.params.id]);
        res.redirect('/admin/quizzes');
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd usuwania quizu');
    }
});

/* ---------- PYTANIA (tabela: quiz_questions) ---------- */

// lista pytań dla danego quizu
router.get('/quizzes/:quizId/questions', requireAdmin, async (req, res) => {
    const quizId = req.params.quizId;
    try {
        const [[quiz]] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
        const [questions] = await pool.query(
            'SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY id ASC',
            [quizId]
        );
        res.render('admin/questions_list', { quiz, questions });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// formularz dodawania pytania
router.get('/quizzes/:quizId/questions/new', requireAdmin, async (req, res) => {
    const quizId = req.params.quizId;
    try {
        const [[quiz]] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
        res.render('admin/question_form', {
            quiz,
            question: null,
            action: `/admin/quizzes/${quizId}/questions/new`
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// dodanie pytania
router.post('/quizzes/:quizId/questions/new', requireAdmin, async (req, res) => {
    const quizId = req.params.quizId;
    const {
        question_text,
        opt_a,
        opt_b,
        opt_c,
        opt_d,
        correct_opt,
        level
    } = req.body;

    try {
        await pool.query(
            `INSERT INTO quiz_questions
             (quiz_id, question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, level)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [quizId, question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, Number(level) || 1]
        );
        res.redirect(`/admin/quizzes/${quizId}/questions`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd zapisu pytania');
    }
});

// formularz edycji pytania
router.get('/questions/:id/edit', requireAdmin, async (req, res) => {
    try {
        const [[question]] = await pool.query(
            'SELECT * FROM quiz_questions WHERE id = ?',
            [req.params.id]
        );
        if (!question) return res.redirect('/admin');

        const [[quiz]] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [question.quiz_id]);

        res.render('admin/question_form', {
            quiz,
            question,
            action: `/admin/questions/${question.id}/edit`
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera');
    }
});

// zapis edycji pytania
router.post('/questions/:id/edit', requireAdmin, async (req, res) => {
    const {
        question_text,
        opt_a,
        opt_b,
        opt_c,
        opt_d,
        correct_opt,
        level
    } = req.body;

    try {
        const [[oldQuestion]] = await pool.query(
            'SELECT quiz_id FROM quiz_questions WHERE id = ?',
            [req.params.id]
        );

        await pool.query(
            `UPDATE quiz_questions SET
                                       question_text = ?,
                                       opt_a = ?,
                                       opt_b = ?,
                                       opt_c = ?,
                                       opt_d = ?,
                                       correct_opt = ?,
                                       level = ?
             WHERE id = ?`,
            [question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, Number(level) || 1, req.params.id]
        );

        res.redirect(`/admin/quizzes/${oldQuestion.quiz_id}/questions`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd zapisu pytania');
    }
});

// usuwanie pytania
router.post('/questions/:id/delete', requireAdmin, async (req, res) => {
    try {
        const [[oldQuestion]] = await pool.query(
            'SELECT quiz_id FROM quiz_questions WHERE id = ?',
            [req.params.id]
        );

        await pool.query('DELETE FROM quiz_questions WHERE id = ?', [req.params.id]);

        res.redirect(`/admin/quizzes/${oldQuestion.quiz_id}/questions`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd usuwania pytania');
    }
});

// ============================
//  ADMIN – MILLIONAIRE QUIZ
// ============================

// Lista pytań
router.get('/millionaire/questions', requireAdmin, async (req, res) => {
    try {
        const [questions] = await pool.query(
            'SELECT * FROM millionaire_questions ORDER BY id DESC'
        );
        res.render('admin/millionaire_questions_list', { questions });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Nie udało się pobrać pytań Milionerów');
        res.redirect('/admin');
    }
});

// Formularz dodawania nowego pytania
router.get('/millionaire/questions/new', requireAdmin, (req, res) => {
    res.render('admin/millionaire_question_form', {
        question: null,
        fifty: null,
        audience: null,
        action: '/admin/millionaire/questions/new'
    });
});

// Zapis nowego pytania + 50/50 + Audience
router.post('/millionaire/questions/new', requireAdmin, async (req, res) => {
    const {
        question_text,
        opt_a,
        opt_b,
        opt_c,
        opt_d,
        correct_opt,
        is_active,
        hide_a,
        hide_b,
        hide_c,
        hide_d,
        perc_a,
        perc_b,
        perc_c,
        perc_d
    } = req.body;

    const active = is_active === 'on' ? 1 : 0;

    try {
        const [result] = await pool.query(
            `INSERT INTO millionaire_questions
                 (question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, active]
        );

        const qId = result.insertId;

        const hide = {
            A: hide_a ? 1 : 0,
            B: hide_b ? 1 : 0,
            C: hide_c ? 1 : 0,
            D: hide_d ? 1 : 0
        };
        hide[correct_opt] = 0;

        await pool.query(
            `INSERT INTO millionaire_hints
                 (question_id, hint_type, hide_a, hide_b, hide_c, hide_d)
             VALUES (?, 'FIFTY', ?, ?, ?, ?)`,
            [qId, hide.A, hide.B, hide.C, hide.D]
        );

        await pool.query(
            `INSERT INTO millionaire_hints
                 (question_id, hint_type, perc_a, perc_b, perc_c, perc_d)
             VALUES (?, 'AUDIENCE', ?, ?, ?, ?)`,
            [
                qId,
                perc_a || null,
                perc_b || null,
                perc_c || null,
                perc_d || null
            ]
        );

        req.flash('success', 'Dodano pytanie Milionerów');
        res.redirect('/admin/millionaire/questions');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd podczas zapisu pytania Milionerów');
        res.redirect('/admin/millionaire/questions');
    }
});

// Formularz edycji pytania
router.get('/millionaire/questions/:id/edit', requireAdmin, async (req, res) => {
    const id = req.params.id;

    try {
        const [[question]] = await pool.query(
            'SELECT * FROM millionaire_questions WHERE id = ?',
            [id]
        );

        if (!question) {
            req.flash('error', 'Nie znaleziono pytania');
            return res.redirect('/admin/millionaire/questions');
        }

        const [hints] = await pool.query(
            'SELECT * FROM millionaire_hints WHERE question_id = ?',
            [id]
        );

        let fifty = null;
        let audience = null;
        hints.forEach(h => {
            if (h.hint_type === 'FIFTY') fifty = h;
            if (h.hint_type === 'AUDIENCE') audience = h;
        });

        res.render('admin/millionaire_question_form', {
            question,
            fifty,
            audience,
            action: `/admin/millionaire/questions/${id}/edit`
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania pytania Milionerów');
        res.redirect('/admin/millionaire/questions');
    }
});

// Zapis edycji pytania + 50/50 + Audience
router.post('/millionaire/questions/:id/edit', requireAdmin, async (req, res) => {
    const id = req.params.id;

    const {
        question_text,
        opt_a,
        opt_b,
        opt_c,
        opt_d,
        correct_opt,
        is_active,
        hide_a,
        hide_b,
        hide_c,
        hide_d,
        perc_a,
        perc_b,
        perc_c,
        perc_d
    } = req.body;

    const active = is_active === 'on' ? 1 : 0;

    try {
        await pool.query(
            `UPDATE millionaire_questions
             SET question_text = ?, opt_a = ?, opt_b = ?, opt_c = ?, opt_d = ?, correct_opt = ?, is_active = ?
             WHERE id = ?`,
            [question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, active, id]
        );

        const hide = {
            A: hide_a ? 1 : 0,
            B: hide_b ? 1 : 0,
            C: hide_c ? 1 : 0,
            D: hide_d ? 1 : 0
        };
        hide[correct_opt] = 0;

        await pool.query(
            'DELETE FROM millionaire_hints WHERE question_id = ? AND hint_type = "FIFTY"',
            [id]
        );

        await pool.query(
            `INSERT INTO millionaire_hints
                 (question_id, hint_type, hide_a, hide_b, hide_c, hide_d)
             VALUES (?, 'FIFTY', ?, ?, ?, ?)`,
            [id, hide.A, hide.B, hide.C, hide.D]
        );

        await pool.query(
            'DELETE FROM millionaire_hints WHERE question_id = ? AND hint_type = "AUDIENCE"',
            [id]
        );

        await pool.query(
            `INSERT INTO millionaire_hints
                 (question_id, hint_type, perc_a, perc_b, perc_c, perc_d)
             VALUES (?, 'AUDIENCE', ?, ?, ?, ?)`,
            [
                id,
                perc_a || null,
                perc_b || null,
                perc_c || null,
                perc_d || null
            ]
        );

        req.flash('success', 'Zaktualizowano pytanie Milionerów');
        res.redirect('/admin/millionaire/questions');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd podczas aktualizacji pytania Milionerów');
        res.redirect('/admin/millionaire/questions');
    }
});

// Usuwanie pytania Milionerów
router.post('/millionaire/questions/:id/delete', requireAdmin, async (req, res) => {
    const id = req.params.id;
    try {
        // sprawdzamy, czy pytanie jest aktywne
        const [[question]] = await pool.query(
            'SELECT is_active FROM millionaire_questions WHERE id = ?',
            [id]
        );

        if (!question) {
            req.flash('error', 'Nie znaleziono pytania');
            return res.redirect('/admin/millionaire/questions');
        }

        // liczymy ile jest AKTYWNYCH pytań
        const [[{ count: activeCount }]] = await pool.query(
            'SELECT COUNT(*) AS count FROM millionaire_questions WHERE is_active = 1'
        );

        // jeśli chcemy usunąć aktywne, a jest 10 lub mniej → blokujemy
        if (question.is_active && activeCount <= 10) {
            req.flash(
                'error',
                'Nie możesz mieć mniej niż 10 aktywnych pytań w Milionerach. Najpierw dodaj nowe pytania lub oznacz inne jako nieaktywne.'
            );
            return res.redirect('/admin/millionaire/questions');
        }

        await pool.query('DELETE FROM millionaire_questions WHERE id = ?', [id]);
        req.flash('success', 'Usunięto pytanie Milionerów');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd podczas usuwania pytania');
    }
    res.redirect('/admin/millionaire/questions');
});

/* ---------- KOMENTARZE DO ARTYKUŁÓW (article_comments) ---------- */

// lista komentarzy pod artykułem
router.get('/articles/:id/comments', requireAdmin, async (req, res) => {
    const articleId = req.params.id;

    try {
        const [[article]] = await pool.query(
            'SELECT id, title FROM articles WHERE id = ?',
            [articleId]
        );
        if (!article) {
            req.flash('error', 'Nie znaleziono artykułu');
            return res.redirect('/admin/articles');
        }

        const [comments] = await pool.query(
            `SELECT c.id, c.content, c.created_at, u.username
             FROM article_comments c
             JOIN users u ON u.id = c.user_id
             WHERE c.article_id = ?
             ORDER BY c.created_at DESC`,
            [articleId]
        );

        // 👇 ważne: nazwa widoku pasuje do pliku views/admin/article_comments.ejs
        res.render('admin/article_comments', {
            article,
            comments
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania komentarzy');
        res.redirect('/admin/articles');
    }
});

// usuwanie komentarza
router.post('/articles/:articleId/comments/:commentId/delete', requireAdmin, async (req, res) => {
    const { articleId, commentId } = req.params;

    try {
        await pool.query(
            'DELETE FROM article_comments WHERE id = ? AND article_id = ?',
            [commentId, articleId]
        );
        req.flash('success', 'Usunięto komentarz');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd podczas usuwania komentarza');
    }

    res.redirect(`/admin/articles/${articleId}/comments`);
});

module.exports = router;

