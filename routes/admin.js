// routes/admin.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Middleware: wymaga zalogowania i roli administratora (req.session.isAdmin ustawiane przy logowaniu)
function requireAdmin(req, res, next) {
    // Brak sesji lub brak zalogowanego użytkownika
    if (!req.session || !req.session.user) {
        req.flash('error', 'Musisz być zalogowany');
        return res.redirect('/login'); // alias w app.js przenosi na /auth/login
    }

    // Użytkownik zalogowany, ale bez uprawnień administratora
    if (!req.session.isAdmin) {
        req.flash('error', 'Brak uprawnień administratora');
        return res.redirect('/');
    }

    return next();
}

/* =========================================================
   LOGOWANIE / WYLOGOWANIE (ADMIN KORZYSTA ZE STANDARDOWEGO AUTH)
========================================================= */

// Admin nie ma osobnego logowania – przekierowanie na standardowe logowanie
router.get('/login', (req, res) => {
    req.flash('error', 'Zaloguj się kontem administratora');
    return res.redirect('/login');
});

// POST /admin/login nie jest używany – informacja i przekierowanie
router.post('/login', (req, res) => {
    req.flash('error', 'Logowanie do panelu admina odbywa się przez standardowe logowanie.');
    return res.redirect('/login');
});

// Wylogowanie admina = standardowe wylogowanie użytkownika
router.get('/logout', (req, res) => {
    return res.redirect('/auth/logout');
});

/* =========================================================
   DASHBOARD
========================================================= */

router.get('/', requireAdmin, async (req, res) => {
    try {
        // Liczniki do widoku dashboardu
        const [articles] = await pool.query('SELECT COUNT(*) AS cnt FROM articles');
        const [quizzes] = await pool.query('SELECT COUNT(*) AS cnt FROM quizzes');
        const [questions] = await pool.query('SELECT COUNT(*) AS cnt FROM quiz_questions');
        const [millionaire] = await pool.query('SELECT COUNT(*) AS cnt FROM millionaire_questions');
        const [taxRules] = await pool.query('SELECT COUNT(*) AS cnt FROM tax_rules');

        return res.render('admin/dashboard', {
            articlesCount: articles[0].cnt,
            quizzesCount: quizzes[0].cnt,
            questionsCount: questions[0].cnt,
            millionaireCount: millionaire[0].cnt,
            taxRulesCount: taxRules[0].cnt
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd serwera');
    }
});

/* =========================================================
   ARTYKUŁY (tabela: articles)
========================================================= */

// Lista artykułów
router.get('/articles', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, title, summary, image_url, created_at FROM articles ORDER BY created_at DESC'
        );
        return res.render('admin/articles_list', { articles: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd serwera');
    }
});

// Formularz dodawania artykułu
router.get('/articles/new', requireAdmin, (req, res) => {
    return res.render('admin/articles_form', {
        article: null,
        action: '/admin/articles/new'
    });
});

// Zapis nowego artykułu
router.post('/articles/new', requireAdmin, async (req, res) => {
    const { title, summary, image_url, content } = req.body;
    try {
        await pool.query(
            'INSERT INTO articles (title, summary, image_url, content) VALUES (?, ?, ?, ?)',
            [title, summary, image_url || null, content]
        );
        req.flash('success', 'Dodano artykuł');
        return res.redirect('/admin/articles');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd zapisu artykułu');
        return res.redirect('/admin/articles');
    }
});

// Formularz edycji artykułu
router.get('/articles/:id/edit', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM articles WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.redirect('/admin/articles');

        return res.render('admin/articles_form', {
            article: rows[0],
            action: `/admin/articles/${req.params.id}/edit`
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd serwera');
    }
});

// Zapis edycji artykułu
router.post('/articles/:id/edit', requireAdmin, async (req, res) => {
    const { title, summary, image_url, content } = req.body;
    try {
        await pool.query(
            'UPDATE articles SET title = ?, summary = ?, image_url = ?, content = ? WHERE id = ?',
            [title, summary, image_url || null, content, req.params.id]
        );
        req.flash('success', 'Zapisano zmiany artykułu');
        return res.redirect('/admin/articles');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd zapisu artykułu');
        return res.redirect('/admin/articles');
    }
});

// Usuwanie artykułu
router.post('/articles/:id/delete', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM articles WHERE id = ?', [req.params.id]);
        req.flash('success', 'Usunięto artykuł');
        return res.redirect('/admin/articles');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd usuwania artykułu');
        return res.redirect('/admin/articles');
    }
});

/* =========================================================
   QUIZY (tabela: quizzes)
========================================================= */

// Lista quizów
router.get('/quizzes', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM quizzes ORDER BY id DESC');
        return res.render('admin/quizzes_list', { quizzes: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd serwera');
    }
});

// Formularz dodawania quizu
router.get('/quizzes/new', requireAdmin, (req, res) => {
    return res.render('admin/quiz_form', {
        quiz: null,
        action: '/admin/quizzes/new'
    });
});

// Zapis nowego quizu
router.post('/quizzes/new', requireAdmin, async (req, res) => {
    const { title, description } = req.body;
    try {
        await pool.query(
            'INSERT INTO quizzes (title, description) VALUES (?, ?)',
            [title, description]
        );
        return res.redirect('/admin/quizzes');
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd zapisu quizu');
    }
});

// Formularz edycji quizu
router.get('/quizzes/:id/edit', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.redirect('/admin/quizzes');

        return res.render('admin/quiz_form', {
            quiz: rows[0],
            action: `/admin/quizzes/${req.params.id}/edit`
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd serwera');
    }
});

// Zapis edycji quizu
router.post('/quizzes/:id/edit', requireAdmin, async (req, res) => {
    const { title, description } = req.body;
    try {
        await pool.query(
            'UPDATE quizzes SET title = ?, description = ? WHERE id = ?',
            [title, description, req.params.id]
        );
        return res.redirect('/admin/quizzes');
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd zapisu quizu');
    }
});

// Usuwanie quizu
router.post('/quizzes/:id/delete', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM quizzes WHERE id = ?', [req.params.id]);
        return res.redirect('/admin/quizzes');
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd usuwania quizu');
    }
});

/* =========================================================
   PYTANIA (tabela: quiz_questions)
========================================================= */

// Lista pytań dla danego quizu
router.get('/quizzes/:quizId/questions', requireAdmin, async (req, res) => {
    const quizId = req.params.quizId;
    try {
        const [[quiz]] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
        const [questions] = await pool.query(
            'SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY id ASC',
            [quizId]
        );
        return res.render('admin/questions_list', { quiz, questions });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd serwera');
    }
});

// Formularz dodawania pytania do quizu
router.get('/quizzes/:quizId/questions/new', requireAdmin, async (req, res) => {
    const quizId = req.params.quizId;
    try {
        const [[quiz]] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
        return res.render('admin/question_form', {
            quiz,
            question: null,
            action: `/admin/quizzes/${quizId}/questions/new`
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd serwera');
    }
});

// Zapis nowego pytania do quizu
router.post('/quizzes/:quizId/questions/new', requireAdmin, async (req, res) => {
    const quizId = req.params.quizId;
    const { question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, level } = req.body;

    // Walidacja: wymagane 4 odpowiedzi oraz jedna poprawna
    if (!question_text || !opt_a || !opt_b || !opt_c || !opt_d) {
        req.flash('error', 'Musisz podać treść pytania oraz 4 odpowiedzi.');
        return res.redirect(`/admin/quizzes/${quizId}/questions/new`);
    }
    if (!['A', 'B', 'C', 'D'].includes(correct_opt)) {
        req.flash('error', 'Musisz wskazać jedną poprawną odpowiedź (A–D).');
        return res.redirect(`/admin/quizzes/${quizId}/questions/new`);
    }

    try {
        await pool.query(
            `INSERT INTO quiz_questions
             (quiz_id, question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, level)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [quizId, question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, Number(level) || 1]
        );
        return res.redirect(`/admin/quizzes/${quizId}/questions`);
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd zapisu pytania');
    }
});

// Formularz edycji pytania (po ID pytania)
router.get('/questions/:id/edit', requireAdmin, async (req, res) => {
    try {
        const [[question]] = await pool.query('SELECT * FROM quiz_questions WHERE id = ?', [req.params.id]);
        if (!question) return res.redirect('/admin');

        const [[quiz]] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [question.quiz_id]);

        return res.render('admin/question_form', {
            quiz,
            question,
            action: `/admin/questions/${question.id}/edit`
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd serwera');
    }
});

// Zapis edycji pytania
router.post('/questions/:id/edit', requireAdmin, async (req, res) => {
    const { question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, level } = req.body;

    // Walidacja: wymagane 4 odpowiedzi oraz jedna poprawna
    if (!question_text || !opt_a || !opt_b || !opt_c || !opt_d) {
        req.flash('error', 'Musisz podać treść pytania oraz komplet 4 odpowiedzi.');
        return res.redirect(`/admin/questions/${req.params.id}/edit`);
    }
    if (!['A', 'B', 'C', 'D'].includes(correct_opt)) {
        req.flash('error', 'Musisz wskazać jedną poprawną odpowiedź (A–D).');
        return res.redirect(`/admin/questions/${req.params.id}/edit`);
    }

    try {
        // Pobranie quiz_id, żeby wrócić do listy pytań danego quizu
        const [[oldQuestion]] = await pool.query('SELECT quiz_id FROM quiz_questions WHERE id = ?', [req.params.id]);

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

        return res.redirect(`/admin/quizzes/${oldQuestion.quiz_id}/questions`);
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd zapisu pytania');
    }
});

// Usuwanie pytania
router.post('/questions/:id/delete', requireAdmin, async (req, res) => {
    try {
        // Pobranie quiz_id, żeby wrócić do listy pytań danego quizu
        const [[oldQuestion]] = await pool.query('SELECT quiz_id FROM quiz_questions WHERE id = ?', [req.params.id]);

        await pool.query('DELETE FROM quiz_questions WHERE id = ?', [req.params.id]);

        return res.redirect(`/admin/quizzes/${oldQuestion.quiz_id}/questions`);
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd usuwania pytania');
    }
});

/* =========================================================
   MILIONERZY (tabele: millionaire_questions, millionaire_hints)
========================================================= */

// Lista pytań Milionerów
router.get('/millionaire/questions', requireAdmin, async (req, res) => {
    try {
        const [questions] = await pool.query('SELECT * FROM millionaire_questions ORDER BY id DESC');
        return res.render('admin/millionaire_questions_list', { questions });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Nie udało się pobrać pytań Milionerów');
        return res.redirect('/admin');
    }
});

// Formularz dodawania pytania Milionerów
router.get('/millionaire/questions/new', requireAdmin, (req, res) => {
    return res.render('admin/millionaire_question_form', {
        question: null,
        fifty: null,
        audience: null,
        action: '/admin/millionaire/questions/new'
    });
});

// Zapis nowego pytania + podpowiedzi (50/50 i publiczność)
router.post('/millionaire/questions/new', requireAdmin, async (req, res) => {
    const {
        question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, is_active,
        hide_a, hide_b, hide_c, hide_d,
        perc_a, perc_b, perc_c, perc_d
    } = req.body;

    // Walidacja: wymagane 4 odpowiedzi oraz jedna poprawna
    if (!question_text || !opt_a || !opt_b || !opt_c || !opt_d) {
        req.flash('error', 'Pytanie musi zawierać dokładnie 4 odpowiedzi.');
        return res.redirect('/admin/millionaire/questions/new');
    }
    if (!['A', 'B', 'C', 'D'].includes(correct_opt)) {
        req.flash('error', 'Musisz wskazać jedną poprawną odpowiedź (A–D).');
        return res.redirect('/admin/millionaire/questions/new');
    }

    const active = is_active === 'on' ? 1 : 0;

    try {
        // 1) Zapis pytania
        const [result] = await pool.query(
            `INSERT INTO millionaire_questions
             (question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, active]
        );

        const qId = result.insertId;

        // 2) Podpowiedź 50/50 – nie pozwalamy ukryć poprawnej odpowiedzi
        const hide = { A: hide_a ? 1 : 0, B: hide_b ? 1 : 0, C: hide_c ? 1 : 0, D: hide_d ? 1 : 0 };
        hide[correct_opt] = 0;

        await pool.query(
            `INSERT INTO millionaire_hints
             (question_id, hint_type, hide_a, hide_b, hide_c, hide_d)
             VALUES (?, 'FIFTY', ?, ?, ?, ?)`,
            [qId, hide.A, hide.B, hide.C, hide.D]
        );

        // 3) Podpowiedź „Publiczność”
        await pool.query(
            `INSERT INTO millionaire_hints
             (question_id, hint_type, perc_a, perc_b, perc_c, perc_d)
             VALUES (?, 'AUDIENCE', ?, ?, ?, ?)`,
            [qId, perc_a || null, perc_b || null, perc_c || null, perc_d || null]
        );

        req.flash('success', 'Dodano pytanie Milionerów');
        return res.redirect('/admin/millionaire/questions');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd podczas zapisu pytania Milionerów');
        return res.redirect('/admin/millionaire/questions');
    }
});

// Formularz edycji pytania Milionerów
router.get('/millionaire/questions/:id/edit', requireAdmin, async (req, res) => {
    const id = req.params.id;

    try {
        const [[question]] = await pool.query('SELECT * FROM millionaire_questions WHERE id = ?', [id]);
        if (!question) {
            req.flash('error', 'Nie znaleziono pytania');
            return res.redirect('/admin/millionaire/questions');
        }

        // Pobranie podpowiedzi (50/50 i publiczność)
        const [hints] = await pool.query('SELECT * FROM millionaire_hints WHERE question_id = ?', [id]);

        let fifty = null;
        let audience = null;
        hints.forEach(h => {
            if (h.hint_type === 'FIFTY') fifty = h;
            if (h.hint_type === 'AUDIENCE') audience = h;
        });

        return res.render('admin/millionaire_question_form', {
            question,
            fifty,
            audience,
            action: `/admin/millionaire/questions/${id}/edit`
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania pytania Milionerów');
        return res.redirect('/admin/millionaire/questions');
    }
});

// Zapis edycji pytania + podpowiedzi (50/50 i publiczność)
router.post('/millionaire/questions/:id/edit', requireAdmin, async (req, res) => {
    const id = req.params.id;

    const {
        question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, is_active,
        hide_a, hide_b, hide_c, hide_d,
        perc_a, perc_b, perc_c, perc_d
    } = req.body;

    // Walidacja: wymagane 4 odpowiedzi oraz jedna poprawna
    if (!question_text || !opt_a || !opt_b || !opt_c || !opt_d) {
        req.flash('error', 'Pytanie musi zawierać komplet 4 odpowiedzi.');
        return res.redirect(`/admin/millionaire/questions/${id}/edit`);
    }
    if (!['A', 'B', 'C', 'D'].includes(correct_opt)) {
        req.flash('error', 'Musisz wskazać jedną poprawną odpowiedź (A–D).');
        return res.redirect(`/admin/millionaire/questions/${id}/edit`);
    }

    const active = is_active === 'on' ? 1 : 0;

    try {
        // 1) Aktualizacja pytania
        await pool.query(
            `UPDATE millionaire_questions
             SET question_text = ?, opt_a = ?, opt_b = ?, opt_c = ?, opt_d = ?, correct_opt = ?, is_active = ?
             WHERE id = ?`,
            [question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, active, id]
        );

        // 2) Aktualizacja 50/50 – nie pozwalamy ukryć poprawnej odpowiedzi
        const hide = { A: hide_a ? 1 : 0, B: hide_b ? 1 : 0, C: hide_c ? 1 : 0, D: hide_d ? 1 : 0 };
        hide[correct_opt] = 0;

        await pool.query('DELETE FROM millionaire_hints WHERE question_id = ? AND hint_type = "FIFTY"', [id]);
        await pool.query(
            `INSERT INTO millionaire_hints
             (question_id, hint_type, hide_a, hide_b, hide_c, hide_d)
             VALUES (?, 'FIFTY', ?, ?, ?, ?)`,
            [id, hide.A, hide.B, hide.C, hide.D]
        );

        // 3) Aktualizacja „Publiczność”
        await pool.query('DELETE FROM millionaire_hints WHERE question_id = ? AND hint_type = "AUDIENCE"', [id]);
        await pool.query(
            `INSERT INTO millionaire_hints
             (question_id, hint_type, perc_a, perc_b, perc_c, perc_d)
             VALUES (?, 'AUDIENCE', ?, ?, ?, ?)`,
            [id, perc_a || null, perc_b || null, perc_c || null, perc_d || null]
        );

        req.flash('success', 'Zaktualizowano pytanie Milionerów');
        return res.redirect('/admin/millionaire/questions');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd podczas aktualizacji pytania Milionerów');
        return res.redirect('/admin/millionaire/questions');
    }
});

// Usuwanie pytania Milionerów (z kontrolą minimalnej liczby aktywnych)
router.post('/millionaire/questions/:id/delete', requireAdmin, async (req, res) => {
    const id = req.params.id;

    try {
        const [[question]] = await pool.query('SELECT is_active FROM millionaire_questions WHERE id = ?', [id]);
        if (!question) {
            req.flash('error', 'Nie znaleziono pytania');
            return res.redirect('/admin/millionaire/questions');
        }

        // Minimalnie 10 aktywnych pytań – nie pozwalamy zejść poniżej
        const [[{ count: activeCount }]] = await pool.query(
            'SELECT COUNT(*) AS count FROM millionaire_questions WHERE is_active = 1'
        );

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

    return res.redirect('/admin/millionaire/questions');
});

/* =========================================================
   KOMENTARZE DO ARTYKUŁÓW (tabela: article_comments)
========================================================= */

// Lista komentarzy do artykułu (moderacja)
router.get('/articles/:id/comments', requireAdmin, async (req, res) => {
    const articleId = req.params.id;

    try {
        const [[article]] = await pool.query('SELECT id, title FROM articles WHERE id = ?', [articleId]);
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

        return res.render('admin/article_comments', { article, comments });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania komentarzy');
        return res.redirect('/admin/articles');
    }
});

// Usuwanie komentarza (moderacja)
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

    return res.redirect(`/admin/articles/${articleId}/comments`);
});

/* =========================================================
   PODATKI (tabela: tax_rules)
========================================================= */

// Lista reguł podatkowych
router.get('/tax-rules', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, country_code, country_name, tax_rate, long_term_rate, long_term_days, created_at
             FROM tax_rules
             ORDER BY country_name ASC`
        );
        return res.render('admin/tax_rules_list', { rules: rows });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania reguł podatkowych');
        return res.redirect('/admin');
    }
});

// Formularz dodawania reguły podatkowej
router.get('/tax-rules/new', requireAdmin, (req, res) => {
    return res.render('admin/tax_rule_form', {
        rule: null,
        action: '/admin/tax-rules/new'
    });
});

// Zapis nowej reguły podatkowej
router.post('/tax-rules/new', requireAdmin, async (req, res) => {
    try {
        let { country_code, country_name, tax_rate, long_term_rate, long_term_days } = req.body;

        // Normalizacja danych wejściowych
        country_code = (country_code || '').trim().toUpperCase();
        country_name = (country_name || '').trim();

        // Walidacja pól wymaganych
        if (!country_code || !country_name || tax_rate === undefined || tax_rate === '') {
            req.flash('error', 'Uzupełnij: kod kraju, nazwę kraju i stawkę podatku.');
            return res.redirect('/admin/tax-rules/new');
        }

        // Konwersje typów
        const taxRate = Number(tax_rate);
        const longRate = (long_term_rate === '' || long_term_rate == null) ? null : Number(long_term_rate);
        const longDays = (long_term_days === '' || long_term_days == null) ? null : parseInt(long_term_days, 10);

        // Walidacja liczb
        if (Number.isNaN(taxRate) || taxRate < 0) {
            req.flash('error', 'Stawka podatku musi być liczbą >= 0.');
            return res.redirect('/admin/tax-rules/new');
        }
        if (longRate != null && (Number.isNaN(longRate) || longRate < 0)) {
            req.flash('error', 'Długoterminowa stawka musi być liczbą >= 0.');
            return res.redirect('/admin/tax-rules/new');
        }
        if (longDays != null && (Number.isNaN(longDays) || longDays < 0)) {
            req.flash('error', 'Dni długoterminowe muszą być liczbą całkowitą >= 0.');
            return res.redirect('/admin/tax-rules/new');
        }

        await pool.query(
            `INSERT INTO tax_rules (country_code, country_name, tax_rate, long_term_rate, long_term_days)
             VALUES (?, ?, ?, ?, ?)`,
            [country_code, country_name, taxRate, longRate, longDays]
        );

        req.flash('success', 'Dodano regułę podatkową');
        return res.redirect('/admin/tax-rules');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd dodawania reguły podatkowej (sprawdź czy kod kraju nie jest zdublowany)');
        return res.redirect('/admin/tax-rules');
    }
});

// Formularz edycji reguły podatkowej
router.get('/tax-rules/:id/edit', requireAdmin, async (req, res) => {
    try {
        const [[rule]] = await pool.query(
            `SELECT id, country_code, country_name, tax_rate, long_term_rate, long_term_days
             FROM tax_rules WHERE id = ?`,
            [req.params.id]
        );

        if (!rule) {
            req.flash('error', 'Nie znaleziono reguły podatkowej');
            return res.redirect('/admin/tax-rules');
        }

        return res.render('admin/tax_rule_form', {
            rule,
            action: `/admin/tax-rules/${rule.id}/edit`
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania reguły do edycji');
        return res.redirect('/admin/tax-rules');
    }
});

// Zapis edycji reguły podatkowej
router.post('/tax-rules/:id/edit', requireAdmin, async (req, res) => {
    try {
        let { country_code, country_name, tax_rate, long_term_rate, long_term_days } = req.body;

        // Normalizacja danych wejściowych
        country_code = (country_code || '').trim().toUpperCase();
        country_name = (country_name || '').trim();

        // Walidacja pól wymaganych
        if (!country_code || !country_name || tax_rate === undefined || tax_rate === '') {
            req.flash('error', 'Uzupełnij: kod kraju, nazwę kraju i stawkę podatku.');
            return res.redirect(`/admin/tax-rules/${req.params.id}/edit`);
        }

        // Konwersje typów
        const taxRate = Number(tax_rate);
        const longRate = (long_term_rate === '' || long_term_rate == null) ? null : Number(long_term_rate);
        const longDays = (long_term_days === '' || long_term_days == null) ? null : parseInt(long_term_days, 10);

        // Walidacja liczb
        if (Number.isNaN(taxRate) || taxRate < 0) {
            req.flash('error', 'Stawka podatku musi być liczbą >= 0.');
            return res.redirect(`/admin/tax-rules/${req.params.id}/edit`);
        }

        await pool.query(
            `UPDATE tax_rules
             SET country_code = ?, country_name = ?, tax_rate = ?, long_term_rate = ?, long_term_days = ?
             WHERE id = ?`,
            [country_code, country_name, taxRate, longRate, longDays, req.params.id]
        );

        req.flash('success', 'Zapisano zmiany reguły podatkowej');
        return res.redirect('/admin/tax-rules');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd zapisu zmian reguły podatkowej');
        return res.redirect('/admin/tax-rules');
    }
});

// Usuwanie reguły (blokada, jeśli istnieją obliczenia dla kraju)
router.post('/tax-rules/:id/delete', requireAdmin, async (req, res) => {
    try {
        const [[rule]] = await pool.query('SELECT country_code FROM tax_rules WHERE id = ?', [req.params.id]);
        if (!rule) {
            req.flash('error', 'Nie znaleziono reguły podatkowej');
            return res.redirect('/admin/tax-rules');
        }

        // Blokujemy usuwanie, jeśli są obliczenia w tax_calculations dla danego kraju
        const [[{ cnt }]] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM tax_calculations WHERE country_code = ?',
            [rule.country_code]
        );

        if (cnt > 0) {
            req.flash('error', 'Nie można usunąć — istnieją obliczenia podatku dla tego kraju.');
            return res.redirect('/admin/tax-rules');
        }

        await pool.query('DELETE FROM tax_rules WHERE id = ?', [req.params.id]);
        req.flash('success', 'Usunięto regułę podatkową');
        return res.redirect('/admin/tax-rules');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd usuwania reguły podatkowej');
        return res.redirect('/admin/tax-rules');
    }
});

module.exports = router;
