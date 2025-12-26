const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { extractInvoiceData } = require('../services/replicateService');
const {
    saveInvoice,
    getAllInvoices,
    getInvoiceById,
    getInvoiceStatistics,
    getInvoicesByVendor,
    getInvoicesByMonth,
    getInvoicesByAmountRange
} = require('../services/databaseService');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'invoice-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
        }
    }
});

/**
 * POST /api/invoice/process
 * Upload and process invoice image
 */
router.post('/process', upload.single('invoice'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        console.log('File uploaded:', req.file.filename);

        // Extract invoice data using Replicate (pass filename, not buffer)
        const extractionResult = await extractInvoiceData(req.file.filename);

        if (!extractionResult.success) {
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);

            return res.status(500).json({
                success: false,
                error: 'Failed to extract invoice data',
                details: extractionResult.error
            });
        }

        // Save to database
        const dbResult = await saveInvoice(
            extractionResult.data,
            req.file.originalname,
            extractionResult.rawResponse
        );

        // Clean up uploaded file after successful processing
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            message: 'Invoice processed successfully',
            id: dbResult.id,
            data: extractionResult.data
        });

    } catch (error) {
        console.error('Error processing invoice:', error);

        // Clean up uploaded file if exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: 'Server error processing invoice',
            details: error.message
        });
    }
});

/**
 * GET /api/invoice/statistics
 * Get invoice statistics
 */
router.get('/statistics', async (req, res) => {
    try {
        const [stats, byVendor, byMonth, byAmountRange] = await Promise.all([
            getInvoiceStatistics(),
            getInvoicesByVendor(),
            getInvoicesByMonth(),
            getInvoicesByAmountRange()
        ]);

        res.json({
            success: true,
            data: {
                overview: stats,
                byVendor,
                byMonth,
                byAmountRange
            }
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics',
            details: error.message
        });
    }
});

/**
 * GET /api/invoice/list
 * Get all invoices
 */
router.get('/list', async (req, res) => {
    try {
        const invoices = await getAllInvoices();
        res.json({
            success: true,
            count: invoices.length,
            data: invoices
        });
    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch invoices',
            details: error.message
        });
    }
});

/**
 * GET /api/invoice/:id
 * Get specific invoice by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const invoice = await getInvoiceById(id);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                error: 'Invoice not found'
            });
        }

        res.json({
            success: true,
            data: invoice
        });
    } catch (error) {
        console.error('Error fetching invoice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch invoice',
            details: error.message
        });
    }
});

module.exports = router;
