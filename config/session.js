require('dotenv').config();
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const store = new MySQLStore({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME,
    createDatabaseTable: true
});

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'change_me',
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
});

module.exports = sessionMiddleware;
