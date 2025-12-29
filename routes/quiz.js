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
   LISTA QUIZÓW + RANKING
========================================================= */

// Lista quizów + ranking sumy najlepszych wyników (tylko zalogowani)
router.get('/', requireLogin, async (req, res) => {
    try {
        const [quizzes] = await pool.execute('SELECT id, title, description FROM quizzes');

        // Ranking: suma najlepszych wyników użytkownika w każdym quizie
        const [leaderboard] = await pool.execute(`
            SELECT u.username, SUM(best.score) AS total_score
            FROM (
                     SELECT user_id, quiz_id, MAX(score) AS score
                     FROM quiz_results
                     GROUP BY user_id, quiz_id
                 ) best
                     JOIN users u ON best.user_id = u.id
            GROUP BY u.id, u.username
            ORDER BY total_score DESC
                LIMIT 20
        `);

        return res.render('quizzes', { quizzes, leaderboard });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania quizów');
        return res.redirect('/');
    }
});

/* =========================================================
   QUIZ: LOSOWANIE PYTAŃ
========================================================= */

// Pobranie pytań do wybranego quizu (tylko zalogowani)
router.get('/:id', requireLogin, async (req, res) => {
    try {
        const quizId = req.params.id;

        // Podstawowe dane quizu
        const [[quiz]] = await pool.execute('SELECT id, title FROM quizzes WHERE id = ?', [quizId]);
        if (!quiz) {
            req.flash('error', 'Nie znaleziono quizu');
            return res.redirect('/quiz');
        }

        // Losowanie maks. 10 pytań do quizu
        const [questions] = await pool.execute(
            'SELECT id, question_text, opt_a, opt_b, opt_c, opt_d FROM quiz_questions WHERE quiz_id = ? ORDER BY RAND() LIMIT 10',
            [quizId]
        );

        // Wymóg minimalny: quiz ma mieć przynajmniej 4 pytania
        if (questions.length < 4) {
            req.flash('error', 'Ten quiz nie jest jeszcze kompletny (mniej niż 4 pytania).');
            return res.redirect('/quiz');
        }

        // Formatowanie pod widok (A-D jako tablica opcji)
        const formatted = questions.map(q => ({
            id: q.id,
            question_text: q.question_text,
            options: [
                { key: 'A', text: q.opt_a },
                { key: 'B', text: q.opt_b },
                { key: 'C', text: q.opt_c },
                { key: 'D', text: q.opt_d }
            ]
        }));

        return res.render('quiz', { quiz, questions: formatted });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania pytań');
        return res.redirect('/quiz');
    }
});

/* =========================================================
   QUIZ: OCENA I ZAPIS WYNIKU
========================================================= */

// Ocena odpowiedzi + zapis wyniku (tylko zalogowani)
router.post('/:id/submit', requireLogin, async (req, res) => {
    try {
        const quizId = req.params.id;

        // Wyciągamy odpowiedzi z formularza (pola q_<ID>)
        const answers = Object.keys(req.body)
            .filter(k => k.startsWith('q_'))
            .map(k => ({ id: parseInt(k.slice(2), 10), ans: req.body[k] }));

        if (!answers.length) {
            req.flash('error', 'Brak odpowiedzi');
            return res.redirect(`/quiz/${quizId}`);
        }

        let correctCount = 0;
        const breakdown = [];

        // Sprawdzamy każdą odpowiedź
        for (const a of answers) {
            const [rows] = await pool.execute(
                'SELECT correct_opt, question_text, opt_a, opt_b, opt_c, opt_d FROM quiz_questions WHERE id = ?',
                [a.id]
            );
            const row = rows[0];
            if (!row) continue;

            const correct = (row.correct_opt || '').toUpperCase();
            const selected = (a.ans || '').toUpperCase();
            const isCorrect = selected === correct;

            if (isCorrect) correctCount++;

            breakdown.push({
                id: a.id,
                question: row.question_text,
                selected: a.ans,
                correct,
                isCorrect,
                options: { A: row.opt_a, B: row.opt_b, C: row.opt_c, D: row.opt_d }
            });
        }

        // Punktacja: 100 pkt za poprawną odpowiedź
        const userId = req.session.user.id;
        const points = correctCount * 100;

        // Zapisujemy wynik tylko jeśli jest lepszy niż poprzedni najlepszy
        const [[best]] = await pool.execute(
            'SELECT MAX(score) AS bestScore FROM quiz_results WHERE user_id = ? AND quiz_id = ?',
            [userId, quizId]
        );

        if (!best.bestScore || points > best.bestScore) {
            await pool.execute(
                'INSERT INTO quiz_results (user_id, quiz_id, score, total, created_at) VALUES (?, ?, ?, ?, NOW())',
                [userId, quizId, points, answers.length]
            );
        }

        return res.render('quiz_result', {
            score: correctCount,
            total: answers.length,
            points,
            breakdown
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd podczas oceniania quizu');
        return res.redirect(`/quiz/${req.params.id}`);
    }
});

module.exports = router;
