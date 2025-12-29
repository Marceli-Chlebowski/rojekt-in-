const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const router = express.Router();

function todayISO() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
}

function isFutureDateYYYYMMDD(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return true;
    return dateStr > todayISO();
}

// Middleware: wymagamy zalogowania
function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/auth/login');
    return next();
}

/* =========================================================
   PROFIL: PODGLĄD
========================================================= */

router.get('/profile', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, first_name, last_name, birth_date, email, username FROM users WHERE id = ? LIMIT 1',
            [req.session.user.id]
        );

        const u = rows[0];
        if (!u) return res.redirect('/');

        // Format daty YYYY-MM-DD pod <input type="date">
        let birth_date = '';
        if (u.birth_date) {
            const d = new Date(u.birth_date);
            birth_date = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 10);
        }

        return res.render('user/profile', {
            today: todayISO(),
            userRow: { ...u, birth_date }
        });
    } catch (e) {
        console.error('[USER][GET PROFILE]', e.message || e);
        req.flash('error', 'Nie udało się pobrać profilu.');
        return res.redirect('/');
    }
});

/* =========================================================
   PROFIL: AKTUALIZACJA DANYCH (BEZ HASŁA)
========================================================= */

router.post('/profile', requireAuth, async (req, res) => {
    try {
        const { first_name, last_name, birth_date, email, username } = req.body;

        // Walidacja pól
        if (!first_name || !last_name || !birth_date || !email || !username) {
            req.flash('error', 'Uzupełnij wszystkie pola.');
            return res.redirect('/user/profile');
        }

        // Blokada daty urodzenia w przyszłości
        if (isFutureDateYYYYMMDD(birth_date)) {
            req.flash('error', 'Data urodzenia nie może być w przyszłości.');
            return res.redirect('/user/profile');
        }

        // Sprawdzenie duplikatów email/login (z pominięciem bieżącego usera)
        const [dups] = await pool.query(
            'SELECT id FROM users WHERE (email = ? OR username = ?) AND id <> ? LIMIT 1',
            [email, username, req.session.user.id]
        );
        if (dups.length) {
            req.flash('error', 'Podany email lub login jest już zajęty.');
            return res.redirect('/user/profile');
        }

        // Aktualizacja danych użytkownika
        await pool.query(
            'UPDATE users SET first_name = ?, last_name = ?, birth_date = ?, email = ?, username = ? WHERE id = ?',
            [first_name, last_name, birth_date, email, username, req.session.user.id]
        );

        // Aktualizacja nazwy użytkownika w sesji (do nagłówka itp.)
        req.session.user.username = username;

        req.flash('success', 'Zapisano zmiany w profilu.');
        return res.redirect('/user/profile');
    } catch (e) {
        console.error('[USER][POST PROFILE]', e.code || e.message || e);
        req.flash('error', 'Błąd zapisu profilu.');
        return res.redirect('/user/profile');
    }
});

/* =========================================================
   ZMIANA HASŁA
========================================================= */

router.post('/change-password', requireAuth, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        // Walidacja wejścia
        if (!current_password || !new_password) {
            req.flash('error', 'Podaj aktualne i nowe hasło.');
            return res.redirect('/user/profile');
        }
        if (new_password.length < 8) {
            req.flash('error', 'Nowe hasło musi mieć co najmniej 8 znaków.');
            return res.redirect('/user/profile');
        }

        // Pobranie aktualnego hasha
        const [rows] = await pool.query(
            'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
            [req.session.user.id]
        );
        const row = rows[0];

        if (!row) {
            req.flash('error', 'Użytkownik nie istnieje.');
            return res.redirect('/user/profile');
        }

        // Sprawdzenie aktualnego hasła
        const ok = await bcrypt.compare(current_password, row.password_hash);
        if (!ok) {
            req.flash('error', 'Aktualne hasło jest nieprawidłowe.');
            return res.redirect('/user/profile');
        }

        // Zapis nowego hasła
        const newHash = await bcrypt.hash(new_password, 12);
        await pool.query(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [newHash, req.session.user.id]
        );

        req.flash('success', 'Hasło zostało zmienione.');
        return res.redirect('/user/profile');
    } catch (e) {
        console.error('[USER][CHANGE PASSWORD]', e.code || e.message || e);
        req.flash('error', 'Błąd przy zmianie hasła.');
        return res.redirect('/user/profile');
    }
});

module.exports = router;
