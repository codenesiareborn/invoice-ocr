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

module.exports = {
    saveInvoice,
    getAllInvoices,
    getInvoiceById
};
