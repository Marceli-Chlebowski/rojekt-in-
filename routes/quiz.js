const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// middleware – tylko zalogowany (TAK SAMO jak w kalkulatorze)
function requireLogin(req, res, next) {
    if (!req.session.user) {
        req.flash('error', 'Musisz być zalogowany');
        return res.redirect('/login');
    }
    next();
}

// lista wszystkich quizów – TYLKO ZALOGOWANI (blokuje wejście z paska)
router.get('/', requireLogin, async (req, res) => {
    try {
        const [quizzes] = await pool.execute('SELECT id, title, description FROM quizzes');

        // Pobierz leaderboard - top 20 użytkowników z najwyższymi sumarycznymi wynikami
        const [leaderboard] = await pool.execute(`
            SELECT u.username, SUM(qr.score) AS total_score
            FROM quiz_results qr
                     JOIN users u ON qr.user_id = u.id
            GROUP BY u.id, u.username
            ORDER BY total_score DESC
                LIMIT 20
        `);

        res.render('quizzes', { quizzes, leaderboard });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania quizów');
        res.redirect('/');
    }
});

// GET /quiz/:id - pobierz pytania do wybranego quizu (TYLKO ZALOGOWANI)
router.get('/:id', requireLogin, async (req, res) => {
    try {
        const quizId = req.params.id;
        const [[quiz]] = await pool.execute('SELECT id, title FROM quizzes WHERE id = ?', [quizId]);
        if (!quiz) {
            req.flash('error', 'Nie znaleziono quizu');
            return res.redirect('/quiz');
        }

        const [questions] = await pool.execute(
            'SELECT id, question_text, opt_a, opt_b, opt_c, opt_d FROM quiz_questions WHERE quiz_id = ? ORDER BY RAND() LIMIT 10',
            [quizId]
        );

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

        res.render('quiz', { quiz, questions: formatted });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd pobierania pytań');
        res.redirect('/quiz');
    }
});

// POST /quiz/:id/submit - ocena odpowiedzi (TYLKO ZALOGOWANI)
router.post('/:id/submit', requireLogin, async (req, res) => {
    try {
        const quizId = req.params.id;
        const answers = Object.keys(req.body)
            .filter(k => k.startsWith('q_'))
            .map(k => ({ id: parseInt(k.slice(2)), ans: req.body[k] }));

        if (!answers.length) {
            req.flash('error', 'Brak odpowiedzi');
            return res.redirect(`/quiz/${quizId}`);
        }

        let correctCount = 0;
        const breakdown = [];

        for (const a of answers) {
            const [rows] = await pool.execute(
                'SELECT correct_opt, question_text, opt_a, opt_b, opt_c, opt_d FROM quiz_questions WHERE id = ?',
                [a.id]
            );
            const row = rows[0];
            if (!row) continue;

            const correct = (row.correct_opt || '').toUpperCase();
            const isCorrect = (a.ans || '').toUpperCase() === correct;
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

        // teraz userId zawsze istnieje, bo requireLogin przepuszcza tylko zalogowanych
        const userId = req.session.user.id;

        const points = correctCount * 100; // 100 punktów za każdą poprawną odpowiedź
        await pool.execute(
            'INSERT INTO quiz_results (user_id, quiz_id, score, total, created_at) VALUES (?, ?, ?, ?, NOW())',
            [userId, quizId, points, answers.length]
        );

        res.render('quiz_result', { score: correctCount, total: answers.length, points, breakdown });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd podczas oceniania quizu');
        res.redirect(`/quiz/${req.params.id}`);
    }
});

module.exports = router;
