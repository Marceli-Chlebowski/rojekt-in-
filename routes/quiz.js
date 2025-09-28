// routes/quiz.js
const express = require('express');
const router = express.Router();
const { simpleExecute } = require('../config/db');

// helper: ensure logged in (optional — allow anonymous too)
function ensureLoggedIn(req, res, next) {
    if (req.session && req.session.user) return next();
    // allow anonymous but set userId = null
    return next();
}

// GET /quiz - ładuje 10 pytań
router.get('/', async (req, res) => {
    try {
        const result = await simpleExecute(
            `SELECT id, question_text, opt_a, opt_b, opt_c, opt_d 
       FROM quiz_questions
       WHERE ROWNUM <= 10
       ORDER BY DBMS_RANDOM.VALUE`
        );
        const questions = (result.rows || []).map(q => ({
            id: q.ID,
            question_text: q.QUESTION_TEXT,
            options: [
                { key: 'A', text: q.OPT_A },
                { key: 'B', text: q.OPT_B },
                { key: 'C', text: q.OPT_C },
                { key: 'D', text: q.OPT_D }
            ]
        }));
        res.render('quiz', { questions });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd quizu');
        res.redirect('/');
    }
});

// POST /quiz/submit - ocena odpowiedzi
router.post('/submit', async (req, res) => {
    try {
        // req.body zawiera pola q_<id> = 'A'|'B'|...
        const answers = Object.keys(req.body)
            .filter(k => k.startsWith('q_'))
            .map(k => ({ id: parseInt(k.slice(2), 10), ans: req.body[k] }));

        if (answers.length === 0) {
            req.flash('error', 'Brak odpowiedzi');
            return res.redirect('/quiz');
        }

        let correctCount = 0;
        const breakdown = [];

        // dla prostoty: pętlowo pobieramy poprawne odpowiedzi (można optymalizować batch)
        for (const item of answers) {
            const qres = await simpleExecute(
                `SELECT correct_opt, question_text, opt_a, opt_b, opt_c, opt_d
         FROM quiz_questions WHERE id = :id`, [item.id]
            );

            if (!qres.rows || qres.rows.length === 0) {
                // pomiń brakujące
                breakdown.push({ id: item.id, status: 'missing' });
                continue;
            }

            const row = qres.rows[0];
            const correct = (row.CORRECT_OPT || row.correct_opt || '').toUpperCase();
            const isCorrect = (item.ans || '').toUpperCase() === correct;
            if (isCorrect) correctCount++;
            breakdown.push({
                id: item.id,
                question: row.QUESTION_TEXT || row.question_text,
                selected: item.ans,
                correct,
                isCorrect,
                options: {
                    A: row.OPT_A, B: row.OPT_B, C: row.OPT_C, D: row.OPT_D
                }
            });
        }

        const total = answers.length;
        // zapisz wynik w quiz_results (jeżeli chcesz)
        const userId = (req.session && req.session.user) ? req.session.user.id : null;
        await simpleExecute(
            `INSERT INTO quiz_results (id, user_id, score, total, created_at)
       VALUES (quiz_results_seq.NEXTVAL, :uid, :score, :total, SYSDATE)`,
            [userId, correctCount, total]
        );

        res.render('quiz_result', { score: correctCount, total, breakdown });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd podczas oceniania quizu');
        res.redirect('/quiz');
    }
});

module.exports = router;