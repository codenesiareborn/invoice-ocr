const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import routes
const invoiceRoutes = require('./routes/invoice');

// Initialize database
require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files from uploads directory
app.use('/uploads', express.static('uploads'));

// Serve static files from public directory
app.use(express.static('public'));

// API Routes
app.use('/api/invoice', invoiceRoutes);

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Something went wrong!',
        details: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Invoice OCR Server running on http://localhost:${PORT}`);
    console.log(`📊 Using Replicate API: google/gemini-2.5-flash`);
});
