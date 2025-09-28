// routes/admin.js
const express = require('express');
const router = express.Router();
const { simpleExecute } = require('../config/db');

// middleware: wymaga, żeby user był zalogowany i miał role ADMIN
function ensureAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'ADMIN') return next();
    req.flash('error', 'Dostęp tylko dla administratora');
    return res.redirect('/login');
}

// dashboard
router.get('/', ensureAdmin, async (req, res) => {
    res.render('admin_dashboard');
});

/* -- ARTICLES CRUD -- */

// list
router.get('/articles', ensureAdmin, async (req, res) => {
    try {
        const result = await simpleExecute('SELECT id, title, created_at FROM articles ORDER BY created_at DESC');
        res.render('admin_articles', { articles: result.rows || [] });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania artykułów');
        res.redirect('/admin');
    }
});

// new form
router.get('/articles/new', ensureAdmin, (req, res) => {
    res.render('new_article');
});

// create
router.post('/articles', ensureAdmin, async (req, res) => {
    try {
        const { title, summary, content } = req.body;
        await simpleExecute(
            `INSERT INTO articles (id, title, summary, content, created_at)
       VALUES (articles_seq.NEXTVAL, :title, :summary, :content, SYSDATE)`,
            [title, summary, content]
        );
        req.flash('success', 'Dodano artykuł');
        res.redirect('/admin/articles');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd dodawania artykułu');
        res.redirect('/admin/articles');
    }
});

// edit form
router.get('/articles/edit/:id', ensureAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const r = await simpleExecute('SELECT * FROM articles WHERE id = :id', [id]);
        if (!r.rows || r.rows.length === 0) { req.flash('error','Brak artykułu'); return res.redirect('/admin/articles'); }
        res.render('edit_article', { article: r.rows[0] });
    } catch (err) {
        console.error(err);
        req.flash('error','Błąd');
        res.redirect('/admin/articles');
    }
});

// update
router.post('/articles/update/:id', ensureAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { title, summary, content } = req.body;
        await simpleExecute(
            `UPDATE articles SET title = :title, summary = :summary, content = :content WHERE id = :id`,
            [title, summary, content, id]
        );
        req.flash('success','Zaktualizowano');
        res.redirect('/admin/articles');
    } catch (err) {
        console.error(err);
        req.flash('error','Błąd aktualizacji');
        res.redirect('/admin/articles');
    }
});

// delete
router.post('/articles/delete/:id', ensureAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await simpleExecute('DELETE FROM articles WHERE id = :id', [id]);
        req.flash('success','Usunięto artykuł');
        res.redirect('/admin/articles');
    } catch (err) {
        console.error(err);
        req.flash('error','Błąd usuwania');
        res.redirect('/admin/articles');
    }
});

/* -- QUIZ QUESTIONS CRUD -- */

// list
router.get('/questions', ensureAdmin, async (req, res) => {
    try {
        const r = await simpleExecute('SELECT id, question_text, difficulty FROM quiz_questions ORDER BY id');
        res.render('admin_questions', { questions: r.rows || [] });
    } catch (err) {
        console.error(err);
        req.flash('error','Błąd pobierania pytań');
        res.redirect('/admin');
    }
});

// new question form
router.get('/questions/new', ensureAdmin, (req, res) => {
    res.render('new_question');
});

// create question
router.post('/questions', ensureAdmin, async (req, res) => {
    try {
        const { question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, difficulty } = req.body;
        await simpleExecute(
            `INSERT INTO quiz_questions (id, question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, difficulty, created_at)
       VALUES (quiz_seq.NEXTVAL, :q, :a, :b, :c, :d, :co, :diff, SYSDATE)`,
            [question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, difficulty]
        );
        req.flash('success','Dodano pytanie');
        res.redirect('/admin/questions');
    } catch (err) {
        console.error(err);
        req.flash('error','Błąd dodawania pytania');
        res.redirect('/admin/questions');
    }
});

// edit form
router.get('/questions/edit/:id', ensureAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const r = await simpleExecute('SELECT * FROM quiz_questions WHERE id = :id', [id]);
        if (!r.rows || r.rows.length === 0) { req.flash('error','Brak pytania'); return res.redirect('/admin/questions'); }
        res.render('edit_question', { q: r.rows[0] });
    } catch (err) {
        console.error(err);
        req.flash('error','Błąd');
        res.redirect('/admin/questions');
    }
});

// update question
router.post('/questions/update/:id', ensureAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, difficulty } = req.body;
        await simpleExecute(
            `UPDATE quiz_questions
       SET question_text = :q, opt_a = :a, opt_b = :b, opt_c = :c, opt_d = :d, correct_opt = :co, difficulty = :diff
       WHERE id = :id`,
            [question_text, opt_a, opt_b, opt_c, opt_d, correct_opt, difficulty, id]
        );
        req.flash('success','Zaktualizowano pytanie');
        res.redirect('/admin/questions');
    } catch (err) {
        console.error(err);
        req.flash('error','Błąd aktualizacji');
        res.redirect('/admin/questions');
    }
});

// delete question
router.post('/questions/delete/:id', ensureAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await simpleExecute('DELETE FROM quiz_questions WHERE id = :id', [id]);
        req.flash('success','Usunięto pytanie');
        res.redirect('/admin/questions');
    } catch (err) {
        console.error(err);
        req.flash('error','Błąd usuwania');
        res.redirect('/admin/questions');
    }
});

module.exports = router;