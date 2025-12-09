// app.js (zaktualizowany)

const express = require('express');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const flash = require('connect-flash');
const sessionMiddleware = require('./config/session');

// ⬇️ NOWY IMPORT – router panelu admina
const adminRouter = require('./routes/admin');

const app = express();

// Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sesje (jedyna konfiguracja sesji)
app.use(sessionMiddleware);

// Flash + locals (globalny user i czas logowania)
app.use(flash());
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.loggedInAt = req.session.loggedInAt || null; // udostępnione w EJS
  res.locals.success = req.flash('success') || [];
  res.locals.error = req.flash('error') || [];

  // ⬇️ NOWE: info czy admin zalogowany (używane w widokach admina)
  res.locals.isAdmin = req.session.isAdmin || false;

  res.locals.req = req;

  next();
});

// EJS + layouty + statyki
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout'); // używa views/layout.ejs, jeśli istnieje
app.use(express.static(path.join(__dirname, 'public')));

// Aliasy, by /login i /register działały bez /auth
app.get('/login', (req, res) => res.redirect('/auth/login'));
app.get('/register', (req, res) => res.redirect('/auth/register'));

// ⬇️ PANEL ADMINA – wszystkie trasy zaczynają się od /admin
app.use('/admin', adminRouter);

// Routery
app.use('/auth', require('./routes/auth'));
app.use('/favorites', require('./routes/favorites'));

// EDUKACJA: quizy i artykuły
app.use('/quiz', require('./routes/quiz'));
app.use('/articles', require('./routes/articles'));
app.use('/millionaire', require('./routes/millionaire'));


// Users
app.use('/user', require('./routes/user'));

// UWAGA: brak app.get('/') — główna trasa jest w server.js
module.exports = app;
