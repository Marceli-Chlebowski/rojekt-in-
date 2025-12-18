const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const router = express.Router();

router.get('/login', (req, res) => res.render('login', { error: null }));
router.get('/register', (req, res) => res.render('register', { error: null }));

router.post('/register', async (req, res) => {
    try {
        const { first_name, last_name, birth_date, email, username, password } = req.body;

        if (!first_name || !last_name || !birth_date || !email || !username || !password) {
            return res.status(422).render('register', { error: 'Uzupełnij wszystkie pola.' });
        }
        if (password.length < 8) {
            return res.status(422).render('register', { error: 'Hasło min. 8 znaków.' });
        }

        const [dup] = await pool.query(
            'SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1',
            [email, username]
        );
        if (dup.length) {
            return res.status(409).render('register', { error: 'Email lub login już istnieje.' });
        }

        const hash = await bcrypt.hash(password, 12);
        const [result] = await pool.query(
            'INSERT INTO users (first_name, last_name, birth_date, email, username, password_hash) VALUES (?,?,?,?,?,?)',
            [first_name, last_name, birth_date, email, username, hash]
        );

        // auto-logowanie po rejestracji
        req.session.user = { id: result.insertId, username };
        req.session.isAdmin = false; // nowy user jest zwykłym userem
        req.session.loggedInAt = new Date().toISOString();

        // ✅ POWIĄZANIE usera z sesją w tabeli user_sessions
        await pool.query(
            `INSERT INTO user_sessions (user_id, session_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
            [result.insertId, req.sessionID]
        );

        console.log('[AUTH] Zarejestrowano user_id=', result.insertId);
        res.redirect('/');
    } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') {
            return res.status(409).render('register', { error: 'Email lub login już istnieje.' });
        }
        console.error('[AUTH][REGISTER] Błąd:', e.code || e.message || e);
        res.status(500).render('register', { error: 'Błąd serwera (rejestracja).' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        if (!login || !password) {
            return res.status(422).render('login', { error: 'Podaj login i hasło.' });
        }

        const [rows] = await pool.query(
            'SELECT id, username, password_hash, role FROM users WHERE email = ? OR username = ? LIMIT 1',
            [login, login]
        );

        const user = rows[0];
        const ok = user && await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            return res.status(401).render('login', { error: 'Błędny login lub hasło.' });
        }

        req.session.user = { id: user.id, username: user.username };
        req.session.isAdmin = (user.role === 'admin');
        req.session.loggedInAt = new Date().toISOString();

        // ✅ POWIĄZANIE usera z sesją w tabeli user_sessions
        await pool.query(
            `INSERT INTO user_sessions (user_id, session_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
            [user.id, req.sessionID]
        );

        console.log('[AUTH] Zalogowano user_id=', user.id, 'isAdmin=', req.session.isAdmin);
        res.redirect('/');
    } catch (e) {
        console.error('[AUTH][LOGIN] Błąd:', e.code || e.message || e);
        res.status(500).render('login', { error: 'Błąd serwera (logowanie).' });
    }
});

router.post('/logout', async (req, res) => {
    try {
        const sid = req.sessionID; // zapisz zanim zniszczysz sesję

        // ✅ usuń powiązanie sesji z użytkownikiem
        await pool.query('DELETE FROM user_sessions WHERE session_id = ?', [sid]);

        req.session.destroy((err) => {
            if (err) console.error('[AUTH][LOGOUT] Błąd destroy sesji:', err?.message || err);
            res.redirect('/');
        });
    } catch (e) {
        console.error('[AUTH][LOGOUT] Błąd:', e.code || e.message || e);
        // nawet jak coś pójdzie nie tak, spróbuj zniszczyć sesję
        req.session.destroy(() => res.redirect('/'));
    }
});

module.exports = router;
