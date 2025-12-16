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

// Drabina nagród (10 poziomów)
const PRIZE_LADDER = [
    500,
    1000,
    2000,
    5000,
    10000,
    20000,
    50000,
    125000,
    250000,
    1000000
];

// Ekran startowy – TYLKO ZALOGOWANI (blokuje wejście z paska)
router.get('/', requireLogin, (req, res) => {
    res.render('millionaire/index');
});

// START gry – losujemy 10 różnych pytań z puli (TYLKO ZALOGOWANI)
router.get('/start', requireLogin, async (req, res) => {
    try {
        const [[{ count: activeCount }]] = await pool.query(
            'SELECT COUNT(*) AS count FROM millionaire_questions WHERE is_active = 1'
        );

        if (activeCount < 10) {
            return res.render('millionaire/no_questions', {
                minRequired: 10,
                currentCount: activeCount
            });
        }

        const [questions] = await pool.query(
            `SELECT *
             FROM millionaire_questions
             WHERE is_active = 1
             ORDER BY RAND()
                 LIMIT 10`
        );

        req.session.millionaireGame = {
            currentIndex: 0,
            questions,
            score: 0,
            lifelines: {
                fiftyUsed: false,
                audienceUsed: false,
                audienceQuestionId: null
            },
            hiddenOptionsByQuestion: {}
        };

        res.redirect('/millionaire/question');
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd serwera przy starcie gry');
    }
});

// helper: pobierz podpowiedzi do pytania
async function getHintsForQuestion(questionId) {
    const [rows] = await pool.query(
        'SELECT * FROM millionaire_hints WHERE question_id = ?',
        [questionId]
    );

    let fifty = null;
    let audience = null;

    rows.forEach(r => {
        if (r.hint_type === 'FIFTY') fifty = r;
        if (r.hint_type === 'AUDIENCE') audience = r;
    });

    return { fifty, audience };
}

// WYŚWIETLENIE PYTANIA (TYLKO ZALOGOWANI)
router.get('/question', requireLogin, async (req, res) => {
    const game = req.session.millionaireGame;
    if (!game) return res.redirect('/millionaire');

    const { currentIndex, questions, lifelines, hiddenOptionsByQuestion, score } = game;
    const question = questions[currentIndex];
    if (!question) return res.redirect('/millionaire/summary');

    const { fifty, audience } = await getHintsForQuestion(question.id);

    const currentPrize = score > 0 ? PRIZE_LADDER[score - 1] : 0;
    const hiddenOptions = hiddenOptionsByQuestion[question.id] || [];

    const audienceVisible =
        lifelines.audienceUsed && lifelines.audienceQuestionId === question.id;

    res.render('millionaire/question', {
        question,
        index: currentIndex + 1,
        total: questions.length,
        score,
        currentPrize,
        lifelines,
        hiddenOptions,
        prizeLadder: PRIZE_LADDER,
        fiftyHint: fifty,
        audienceHint: audience,
        audienceVisible
    });
});

// OBSŁUGA ODPOWIEDZI (TYLKO ZALOGOWANI)
router.post('/answer', requireLogin, (req, res) => {
    const game = req.session.millionaireGame;
    if (!game) return res.redirect('/millionaire');

    const { currentIndex, questions } = game;
    const question = questions[currentIndex];
    const chosen = req.body.answer;

    const isCorrect = chosen === question.correct_opt;

    if (isCorrect) {
        game.score = currentIndex + 1;

        if (currentIndex + 1 >= questions.length) {
            return res.redirect('/millionaire/summary');
        }

        game.currentIndex += 1;
        return res.redirect('/millionaire/question');
    }

    return res.redirect('/millionaire/summary');
});

// KOŁA RATUNKOWE (TYLKO ZALOGOWANI)
router.post('/lifeline', requireLogin, async (req, res) => {
    const type = req.body.type; // 'fifty' | 'audience'
    const game = req.session.millionaireGame;
    if (!game) return res.redirect('/millionaire');

    const { currentIndex, questions } = game;
    const question = questions[currentIndex];

    const { fifty } = await getHintsForQuestion(question.id);

    const options = ['A', 'B', 'C', 'D'];
    const correct = question.correct_opt;
    const wrongOptions = options.filter(o => o !== correct);

    if (type === 'fifty' && !game.lifelines.fiftyUsed) {
        let hidden = [];

        if (fifty) {
            options.forEach(letter => {
                if (letter === correct) return;
                const col = 'hide_' + letter.toLowerCase();
                if (fifty[col]) hidden.push(letter);
            });
        }

        hidden = hidden.filter(l => wrongOptions.includes(l));

        if (hidden.length > 2) hidden = hidden.slice(0, 2);

        if (hidden.length < 2) {
            for (const w of wrongOptions) {
                if (!hidden.includes(w)) {
                    hidden.push(w);
                    if (hidden.length === 2) break;
                }
            }
        }

        game.hiddenOptionsByQuestion[question.id] = hidden;
        game.lifelines.fiftyUsed = true;
    }

    if (type === 'audience' && !game.lifelines.audienceUsed) {
        game.lifelines.audienceUsed = true;
        game.lifelines.audienceQuestionId = question.id;
    }

    return res.redirect('/millionaire/question');
});

// PODSUMOWANIE (TYLKO ZALOGOWANI)
router.get('/summary', requireLogin, async (req, res) => {
    const game = req.session.millionaireGame;
    if (!game) return res.redirect('/millionaire');

    const { score, questions } = game;
    const total = questions.length;
    const earnedPrize = score > 0 ? PRIZE_LADDER[score - 1] : 0;

    const user = req.session.user;
    if (user && user.id) {
        try {
            await pool.query(
                `INSERT INTO millionaire_results (user_id, score, total_questions, won_amount)
                 VALUES (?, ?, ?, ?)`,
                [user.id, score, total, earnedPrize]
            );
        } catch (err) {
            console.error('Błąd zapisu wyniku Milionerów', err);
        }
    }

    req.session.millionaireGame = null;

    res.render('millionaire/summary', { score, total, earnedPrize });
});

// RANKING (publiczny)
router.get('/leaderboard', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT
                 u.username,
                 u.email,
                 MAX(r.score)      AS best_score,
                 MAX(r.won_amount) AS best_amount,
                 MAX(r.created_at) AS last_played
             FROM millionaire_results r
                      LEFT JOIN users u ON u.id = r.user_id
             GROUP BY r.user_id
             ORDER BY best_score DESC, best_amount DESC, last_played ASC
                 LIMIT 20`
        );

        res.render('millionaire/leaderboard', { rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Błąd pobierania rankingu');
    }
});

module.exports = router;
