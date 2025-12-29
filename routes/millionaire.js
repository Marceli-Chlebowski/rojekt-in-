const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Middleware: dostęp tylko dla zalogowanych (tak samo jak w kalkulatorze)
function requireLogin(req, res, next) {
    if (!req.session.user) {
        req.flash('error', 'Musisz być zalogowany');
        return res.redirect('/login');
    }
    return next();
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

/* =========================================================
   START / INICJACJA GRY
========================================================= */

// Ekran startowy (tylko zalogowani)
router.get('/', requireLogin, (req, res) => {
    return res.render('millionaire/index');
});

// Start gry: losujemy 10 różnych aktywnych pytań (tylko zalogowani)
router.get('/start', requireLogin, async (req, res) => {
    try {
        // Sprawdzenie, czy mamy minimalną liczbę aktywnych pytań
        const [[{ count: activeCount }]] = await pool.query(
            'SELECT COUNT(*) AS count FROM millionaire_questions WHERE is_active = 1'
        );

        if (activeCount < 10) {
            return res.render('millionaire/no_questions', {
                minRequired: 10,
                currentCount: activeCount
            });
        }

        // Losujemy 10 pytań na sesję gry
        const [questions] = await pool.query(
            `SELECT *
             FROM millionaire_questions
             WHERE is_active = 1
             ORDER BY RAND()
                 LIMIT 10`
        );

        // Stan gry trzymamy w sesji
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

        return res.redirect('/millionaire/question');
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd serwera przy starcie gry');
    }
});

/* =========================================================
   POMOCNICZE: PODPOWIEDZI
========================================================= */

// Pobranie podpowiedzi do pytania (50/50 i publiczność)
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

/* =========================================================
   PYTANIE / ODPOWIEDŹ
========================================================= */

// Wyświetlenie aktualnego pytania (tylko zalogowani)
router.get('/question', requireLogin, async (req, res) => {
    const game = req.session.millionaireGame;
    if (!game) return res.redirect('/millionaire');

    const { currentIndex, questions, lifelines, hiddenOptionsByQuestion, score } = game;
    const question = questions[currentIndex];

    // Jeśli brak pytania, przechodzimy do podsumowania
    if (!question) return res.redirect('/millionaire/summary');

    // Pobranie podpowiedzi dla aktualnego pytania
    const { fifty, audience } = await getHintsForQuestion(question.id);

    // Aktualnie zdobyta nagroda (na podstawie liczby poprawnych odpowiedzi)
    const currentPrize = score > 0 ? PRIZE_LADDER[score - 1] : 0;

    // Ukryte odpowiedzi dla aktualnego pytania (koło 50/50)
    const hiddenOptions = hiddenOptionsByQuestion[question.id] || [];

    // „Publiczność” pokazujemy tylko na pytaniu, na którym jej użyto
    const audienceVisible =
        lifelines.audienceUsed && lifelines.audienceQuestionId === question.id;

    return res.render('millionaire/question', {
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

// Obsługa odpowiedzi (tylko zalogowani)
router.post('/answer', requireLogin, (req, res) => {
    const game = req.session.millionaireGame;
    if (!game) return res.redirect('/millionaire');

    const { currentIndex, questions } = game;
    const question = questions[currentIndex];
    const chosen = req.body.answer;

    const isCorrect = chosen === question.correct_opt;

    if (isCorrect) {
        // Wynik = liczba poprawnych odpowiedzi
        game.score = currentIndex + 1;

        // Jeśli to było ostatnie pytanie – koniec gry
        if (currentIndex + 1 >= questions.length) {
            return res.redirect('/millionaire/summary');
        }

        // Przechodzimy do kolejnego pytania
        game.currentIndex += 1;
        return res.redirect('/millionaire/question');
    }

    // Błędna odpowiedź – przechodzimy do podsumowania
    return res.redirect('/millionaire/summary');
});

/* =========================================================
   KOŁA RATUNKOWE
========================================================= */

// Użycie koła ratunkowego (tylko zalogowani)
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

    // 50/50: ukrywamy dwie błędne odpowiedzi (z preferencją ustawień z DB)
    if (type === 'fifty' && !game.lifelines.fiftyUsed) {
        let hidden = [];

        // Jeśli jest wpis w DB, wykorzystujemy go jako podpowiedź
        if (fifty) {
            options.forEach(letter => {
                if (letter === correct) return;
                const col = 'hide_' + letter.toLowerCase();
                if (fifty[col]) hidden.push(letter);
            });
        }

        // Bezpieczeństwo: ukrywamy tylko błędne odpowiedzi
        hidden = hidden.filter(l => wrongOptions.includes(l));

        // Maksymalnie dwie odpowiedzi
        if (hidden.length > 2) hidden = hidden.slice(0, 2);

        // Jeśli DB nie podało dwóch – dobieramy losowo/po kolei z błędnych
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

    // Publiczność: oznaczamy, że ma być widoczna na tym pytaniu
    if (type === 'audience' && !game.lifelines.audienceUsed) {
        game.lifelines.audienceUsed = true;
        game.lifelines.audienceQuestionId = question.id;
    }

    return res.redirect('/millionaire/question');
});

/* =========================================================
   PODSUMOWANIE + RANKING
========================================================= */

// Podsumowanie gry (tylko zalogowani) + zapis wyniku
router.get('/summary', requireLogin, async (req, res) => {
    const game = req.session.millionaireGame;
    if (!game) return res.redirect('/millionaire');

    const { score, questions } = game;
    const total = questions.length;
    const earnedPrize = score > 0 ? PRIZE_LADDER[score - 1] : 0;

    // Zapis wyniku do bazy (jeśli znamy user_id)
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

    // Czyścimy stan gry z sesji
    req.session.millionaireGame = null;

    return res.render('millionaire/summary', { score, total, earnedPrize });
});

// Ranking (publiczny)
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

        return res.render('millionaire/leaderboard', { rows });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Błąd pobierania rankingu');
    }
});

module.exports = router;
