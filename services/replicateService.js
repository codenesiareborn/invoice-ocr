const { replicate } = require('../config/replicate');

/**
 * Extract invoice data from image using Replicate Gemini 2.5 Flash API
 * @param {string} filename - Uploaded filename
 * @returns {Promise<Object>} Extracted invoice data
 */
async function extractInvoiceData(filename) {
    try {
        // Construct public URL for the image
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const imageUrl = `${baseUrl}/uploads/${filename}`;

        // Craft the prompt for invoice extraction
        const prompt = `Extract invoice data from this image and return ONLY a valid JSON object with these exact fields:

{
  "invoice_number": "string or null if not found",
  "invoice_date": "YYYY-MM-DD format or null if not found",
  "vendor_name": "string or null if not found",
  "total_amount": number or 0 if not found,
  "currency": "string (e.g., USD, IDR, EUR) or null if not found",
  "items": [
    {
      "description": "string",
      "quantity": number,
      "unit_price": number,
      "amount": number
    }
  ]
}

IMPORTANT:
- Return ONLY the JSON object, no markdown formatting, no explanations
- If a field cannot be extracted, use null or 0 for numbers
- Parse all monetary values as numbers without currency symbols
- Ensure the response is valid JSON`;

        // Prepare input according to Replicate API format
        const input = {
            prompt: prompt,
            images: [imageUrl],  // Array of URL strings
            videos: [],
            temperature: 0.1,
            top_p: 0.95,
            max_output_tokens: 4096,  // Increased to ensure complete response
            dynamic_thinking: false
        };

        console.log('Sending to Replicate API:', { imageUrl });

        // Use run with wait to get complete response (not streaming)
        const output = await replicate.run("google/gemini-2.5-flash", {
            input,
            wait: { interval: 500 }  // Wait for completion
        });

        // Output is an array of text chunks, join them
        const text = Array.isArray(output) ? output.join('') : output.toString();

        console.log('Received from Replicate (full):', text);

        // Clean up the response (remove markdown code blocks if present)
        let cleanedText = text.trim();

        // Remove markdown code blocks
        cleanedText = cleanedText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

        // Find JSON object boundaries
        const jsonStart = cleanedText.indexOf('{');
        const jsonEnd = cleanedText.lastIndexOf('}');

        if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error('No valid JSON object found in response');
        }

        cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);

        console.log('Cleaned JSON:', cleanedText);

        // Validate JSON is complete (basic check)
        const openBraces = (cleanedText.match(/{/g) || []).length;
        const closeBraces = (cleanedText.match(/}/g) || []).length;
        const openBrackets = (cleanedText.match(/\[/g) || []).length;
        const closeBrackets = (cleanedText.match(/\]/g) || []).length;

        if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
            console.error('Incomplete JSON detected:', { openBraces, closeBraces, openBrackets, closeBrackets });
            throw new Error('Incomplete JSON response from API. Please try again.');
        }

        // Parse JSON
        const invoiceData = JSON.parse(cleanedText);

        return {
            success: true,
            data: invoiceData,
            rawResponse: text
        };
    } catch (error) {
        console.error('Error extracting invoice data:', error);
        return {
            success: false,
            error: error.message,
            rawResponse: null
        };
    }
}

/**
 * Extract invoice data from transcribed text using Gemini via Replicate
 * @param {string} transcription - Transcribed text from voice
 * @returns {Promise<Object>} Extracted invoice data
 */
async function extractInvoiceDataFromText(transcription) {
    try {
        // Craft the prompt for invoice extraction from text
        const prompt = `Parse invoice information from this voice transcription and return ONLY a valid JSON object.

Transcription:
"${transcription}"

Extract these fields and return JSON with these exact fields:
{
  "invoice_number": "string or null if not found",
  "invoice_date": "YYYY-MM-DD format or null if not found",
  "vendor_name": "string or null if not found",
  "total_amount": number or 0 if not found,
  "currency": "string (e.g., USD, IDR, EUR) or null if not found",
  "items": [
    {
      "description": "string",
      "quantity": number,
      "unit_price": number,
      "amount": number
    }
  ]
}

IMPORTANT PARSING RULES:
- Convert Indonesian number words to digits: "tujuh puluh tiga ribu" → 73000, "lima ratus" → 500
- Convert English number words: "fifty thousand" → 50000
- Parse dates: "dua puluh empat mei dua ribu dua puluh tiga" → "2023-05-24"
- Parse dates: "december 20th 2024" → "2024-12-20"
- If a field is not mentioned, use null or 0 for numbers
- Return ONLY the JSON object, no markdown formatting, no explanations
- Ensure the response is valid JSON`;

        console.log('Sending text to Replicate API for parsing');

        // Use Gemini via Replicate to parse the text
        const output = await replicate.run("google/gemini-2.5-flash", {
            input: {
                prompt: prompt,
                images: [],
                videos: [],
                temperature: 0.1,
                top_p: 0.95,
                max_output_tokens: 2048,
                dynamic_thinking: false
            },
            wait: { interval: 500 }
        });

        // Output is an array of text chunks, join them
        const text = Array.isArray(output) ? output.join('') : output.toString();

        console.log('Received from Replicate (text parsing):', text);

        // Clean up the response
        let cleanedText = text.trim();
        cleanedText = cleanedText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

        // Find JSON object boundaries
        const jsonStart = cleanedText.indexOf('{');
        const jsonEnd = cleanedText.lastIndexOf('}');

        if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error('No valid JSON object found in response');
        }

        cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);

        console.log('Cleaned JSON from text:', cleanedText);

        // Parse JSON
        const invoiceData = JSON.parse(cleanedText);

        return {
            success: true,
            data: invoiceData,
            rawResponse: text
        };
    } catch (error) {
        console.error('Error extracting invoice data from text:', error);
        return {
            success: false,
            error: error.message,
            rawResponse: null
        };
    }
}

module.exports = {
    extractInvoiceData,
    extractInvoiceDataFromText
};
