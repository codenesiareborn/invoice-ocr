const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Get the model
const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash-exp'
});

module.exports = { model };
