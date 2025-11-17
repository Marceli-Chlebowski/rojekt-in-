const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const router = express.Router();

function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/auth/login');
    next();
}

// GET: profil
router.get('/profile', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, first_name, last_name, birth_date, email, username FROM users WHERE id = ? LIMIT 1',
            [req.session.user.id]
        );
        const u = rows[0];
        if (!u) return res.redirect('/');

        // Sformatuj datę YYYY-MM-DD pod <input type="date">
        let birth_date = '';
        if (u.birth_date) {
            const d = new Date(u.birth_date);
            // obsługa strefy – bezpiecznie:
            birth_date = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
        }

        res.render('user/profile', {
            userRow: {
                ...u,
                birth_date
            }
        });
    } catch (e) {
        console.error('[USER][GET PROFILE] ', e.message || e);
        req.flash('error', 'Nie udało się pobrać profilu.');
        res.redirect('/');
    }
});

// POST: update profilu (bez hasła)
router.post('/profile', requireAuth, async (req, res) => {
    try {
        const { first_name, last_name, birth_date, email, username } = req.body;

        // prosta walidacja
        if (!first_name || !last_name || !birth_date || !email || !username) {
            req.flash('error', 'Uzupełnij wszystkie pola.');
            return res.redirect('/user/profile');
        }

        // sprawdź duplikaty email/login (z wyłączeniem bieżącego usera)
        const [dups] = await pool.query(
            'SELECT id FROM users WHERE (email = ? OR username = ?) AND id <> ? LIMIT 1',
            [email, username, req.session.user.id]
        );
        if (dups.length) {
            req.flash('error', 'Podany email lub login jest już zajęty.');
            return res.redirect('/user/profile');
        }

        await pool.query(
            'UPDATE users SET first_name = ?, last_name = ?, birth_date = ?, email = ?, username = ? WHERE id = ?',
            [first_name, last_name, birth_date, email, username, req.session.user.id]
        );

        // zaktualizuj sesję, jeśli login się zmienił
        req.session.user.username = username;

        req.flash('success', 'Zapisano zmiany w profilu.');
        res.redirect('/user/profile');
    } catch (e) {
        console.error('[USER][POST PROFILE] ', e.code || e.message || e);
        req.flash('error', 'Błąd zapisu profilu.');
        res.redirect('/user/profile');
    }
});

// POST: zmiana hasła
router.post('/change-password', requireAuth, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password) {
            req.flash('error', 'Podaj aktualne i nowe hasło.');
            return res.redirect('/user/profile');
        }
        if (new_password.length < 8) {
            req.flash('error', 'Nowe hasło musi mieć co najmniej 8 znaków.');
            return res.redirect('/user/profile');
        }

        // pobierz hash
        const [rows] = await pool.query(
            'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
            [req.session.user.id]
        );
        const row = rows[0];
        if (!row) {
            req.flash('error', 'Użytkownik nie istnieje.');
            return res.redirect('/user/profile');
        }

        const ok = await bcrypt.compare(current_password, row.password_hash);
        if (!ok) {
            req.flash('error', 'Aktualne hasło jest nieprawidłowe.');
            return res.redirect('/user/profile');
        }

        const newHash = await bcrypt.hash(new_password, 12);
        await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.session.user.id]);

        req.flash('success', 'Hasło zostało zmienione.');
        res.redirect('/user/profile');
    } catch (e) {
        console.error('[USER][CHANGE PASSWORD] ', e.code || e.message || e);
        req.flash('error', 'Błąd przy zmianie hasła.');
        res.redirect('/user/profile');
    }
});

module.exports = router;
