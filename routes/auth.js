// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { simpleExecute } = require('../config/db');

router.get('/register', (req, res) => {
    res.render('register');
});

router.post('/register', async (req, res) => {
    try {
        const { first_name, last_name, email, password, dob } = req.body;
        if (!email || !password) {
            req.flash('error', 'Wypełnij wymagane pola');
            return res.redirect('/register');
        }
        // check exists
        const exist = await simpleExecute('SELECT id FROM users WHERE email = :email', [email]);
        if (exist.rows && exist.rows.length > 0) {
            req.flash('error', 'Użytkownik o takim emailu już istnieje');
            return res.redirect('/register');
        }
        const hash = await bcrypt.hash(password, 10);
        await simpleExecute(
            `INSERT INTO users (id, first_name, last_name, email, password_hash, dob, role, created_at)
       VALUES (users_seq.NEXTVAL, :fn, :ln, :email, :ph, TO_DATE(:dob, 'YYYY-MM-DD'), 'USER', SYSDATE)`,
            [first_name, last_name, email, hash, dob]
        );
        req.flash('success', 'Zarejestrowano. Możesz się zalogować.');
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd serwera');
        res.redirect('/register');
    }
});

router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await simpleExecute('SELECT id, password_hash, first_name FROM users WHERE email = :email', [email]);
        if (!result.rows || result.rows.length === 0) {
            req.flash('error', 'Nieprawidłowe dane logowania');
            return res.redirect('/login');
        }
        const user = result.rows[0];
        const ok = await bcrypt.compare(password, user.PASSWORD_HASH || user.password_hash);
        if (!ok) {
            req.flash('error', 'Nieprawidłowe dane logowania');
            return res.redirect('/login');
        }
        // store minimal user in session
        req.session.user = { id: user.ID || user.id, name: user.FIRST_NAME || user.first_name, email };
        req.flash('success', 'Zalogowano');
        res.redirect('/');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Błąd logowania');
        res.redirect('/login');
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

module.exports = router;