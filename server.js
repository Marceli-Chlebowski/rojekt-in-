// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const bodyParser = require('body-parser');
const { initPool, closePool } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

const expressLayouts = require('express-ejs-layouts');
app.use(expressLayouts);
app.set('layout', 'layout'); // domyślny layout.ejs

// view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// static
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// session + flash
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false
}));
app.use(flash());

// locals for flash/messages/user
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

// routes
const authRoutes = require('./routes/auth');
const articlesRoutes = require('./routes/articles');
const quizRoutes = require('./routes/quiz');
const adminRoutes = require('./routes/admin');

app.use('/', authRoutes);
app.use('/articles', articlesRoutes);
app.use('/quiz', quizRoutes);
app.use('/admin', adminRoutes);

app.get('/', (req, res) => {
    res.render('index');
});

(async () => {
    try {
        await initPool();
        app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
    } catch (err) {
        console.error('Failed to start app', err);
    }
})();

// graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await closePool();
    process.exit(0);
});