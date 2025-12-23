const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// Database path from environment or default
const dbPath = process.env.DB_PATH || './invoices.db';

// Initialize database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Create tables if they don't exist
function initializeDatabase() {
    db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      invoice_number TEXT,
      invoice_date TEXT,
      vendor_name TEXT,
      total_amount REAL,
      currency TEXT,
      items TEXT,
      raw_response TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
        if (err) {
            console.error('Error creating table:', err.message);
        } else {
            console.log('Database table ready');
        }
    });
}

module.exports = db;
