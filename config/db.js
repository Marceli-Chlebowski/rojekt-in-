// config/db.js
const oracledb = require('oracledb');
require('dotenv').config();

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function initPool() {
    try {
        await oracledb.createPool({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASSWORD,
            connectString: process.env.ORACLE_CONNECTION_STRING,
            poolMin: 1,
            poolMax: 5,
            poolIncrement: 1
        });
        console.log('Oracle pool created');
    } catch (err) {
        console.error('Error creating Oracle pool', err);
        throw err;
    }
}

async function closePool() {
    try {
        await oracledb.getPool().close(10);
        console.log('Oracle pool closed');
    } catch (err) {
        console.error(err);
    }
}

async function simpleExecute(statement, binds = [], opts = {}) {
    let conn;
    try {
        conn = await oracledb.getConnection();
        const result = await conn.execute(statement, binds, { autoCommit: true, ...opts });
        return result;
    } finally {
        if (conn) {
            try { await conn.close(); } catch (err) { console.error(err); }
        }
    }
}

module.exports = { initPool, closePool, simpleExecute, oracledb };