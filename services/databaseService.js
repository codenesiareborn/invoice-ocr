const db = require('../config/database');

/**
 * Save invoice data to database
 * @param {Object} invoiceData - Invoice data object
 * @param {string} filename - Original filename
 * @param {string} rawResponse - Raw Gemini API response
 * @returns {Promise<Object>} Result with inserted ID
 */
function saveInvoice(invoiceData, filename, rawResponse) {
    return new Promise((resolve, reject) => {
        const sql = `
      INSERT INTO invoices (
        filename, 
        invoice_number, 
        invoice_date, 
        vendor_name, 
        total_amount, 
        currency, 
        items, 
        raw_response
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

        const params = [
            filename,
            invoiceData.invoice_number || null,
            invoiceData.invoice_date || null,
            invoiceData.vendor_name || null,
            invoiceData.total_amount || 0,
            invoiceData.currency || null,
            JSON.stringify(invoiceData.items || []),
            rawResponse
        ];

        db.run(sql, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve({
                    success: true,
                    id: this.lastID
                });
            }
        });
    });
}

/**
 * Get all invoices from database
 * @returns {Promise<Array>} List of invoices
 */
function getAllInvoices() {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM invoices ORDER BY created_at DESC';

        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                // Parse JSON fields
                const invoices = rows.map(row => ({
                    ...row,
                    items: JSON.parse(row.items || '[]')
                }));
                resolve(invoices);
            }
        });
    });
}

/**
 * Get specific invoice by ID
 * @param {number} id - Invoice ID
 * @returns {Promise<Object>} Invoice object
 */
function getInvoiceById(id) {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM invoices WHERE id = ?';

        db.get(sql, [id], (err, row) => {
            if (err) {
                reject(err);
            } else if (!row) {
                resolve(null);
            } else {
                // Parse JSON fields
                const invoice = {
                    ...row,
                    items: JSON.parse(row.items || '[]')
                };
                resolve(invoice);
            }
        });
    });
}

/**
 * Get invoice statistics
 * @returns {Promise<Object>} Statistics object
 */
function getInvoiceStatistics() {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT
                COUNT(*) as total_invoices,
                SUM(total_amount) as total_amount,
                AVG(total_amount) as average_amount,
                MIN(total_amount) as min_amount,
                MAX(total_amount) as max_amount,
                COUNT(DISTINCT vendor_name) as unique_vendors
            FROM invoices
            WHERE total_amount IS NOT NULL
        `;

        db.get(sql, [], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row || {});
            }
        });
    });
}

/**
 * Get invoices grouped by vendor
 * @returns {Promise<Array>} Vendor statistics
 */
function getInvoicesByVendor() {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT
                vendor_name,
                COUNT(*) as count,
                SUM(total_amount) as total_amount
            FROM invoices
            WHERE vendor_name IS NOT NULL AND total_amount IS NOT NULL
            GROUP BY vendor_name
            ORDER BY total_amount DESC
        `;

        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

/**
 * Get invoices grouped by month
 * @returns {Promise<Array>} Monthly statistics
 */
function getInvoicesByMonth() {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT
                strftime('%Y-%m', created_at) as month,
                COUNT(*) as count,
                SUM(total_amount) as total_amount
            FROM invoices
            WHERE created_at IS NOT NULL AND total_amount IS NOT NULL
            GROUP BY strftime('%Y-%m', created_at)
            ORDER BY month ASC
        `;

        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

/**
 * Get invoices by amount range
 * @returns {Promise<Array>} Amount range statistics
 */
function getInvoicesByAmountRange() {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT
                CASE
                    WHEN total_amount < 100 THEN '0-100'
                    WHEN total_amount < 500 THEN '100-500'
                    WHEN total_amount < 1000 THEN '500-1000'
                    WHEN total_amount < 5000 THEN '1000-5000'
                    ELSE '5000+'
                END as amount_range,
                COUNT(*) as count
            FROM invoices
            WHERE total_amount IS NOT NULL
            GROUP BY amount_range
            ORDER BY
                CASE amount_range
                    WHEN '0-100' THEN 1
                    WHEN '100-500' THEN 2
                    WHEN '500-1000' THEN 3
                    WHEN '1000-5000' THEN 4
                    WHEN '5000+' THEN 5
                END
        `;

        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

module.exports = {
    saveInvoice,
    getAllInvoices,
    getInvoiceById,
    getInvoiceStatistics,
    getInvoicesByVendor,
    getInvoicesByMonth,
    getInvoicesByAmountRange
};
