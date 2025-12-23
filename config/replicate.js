const Replicate = require('replicate');
require('dotenv').config();

// Initialize Replicate API
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

module.exports = { replicate };
