const { model } = require('../config/gemini');

/**
 * Extract invoice data from image using Gemini Vision API
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} mimeType - Image MIME type
 * @returns {Promise<Object>} Extracted invoice data
 */
async function extractInvoiceData(imageBuffer, mimeType) {
    try {
        // Convert buffer to base64
        const base64Image = imageBuffer.toString('base64');

        // Prepare the image part
        const imagePart = {
            inlineData: {
                data: base64Image,
                mimeType: mimeType
            }
        };

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

        // Generate content
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        // Clean up the response (remove markdown code blocks if present)
        let cleanedText = text.trim();
        if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (cleanedText.startsWith('```')) {
            cleanedText = cleanedText.replace(/```\n?/g, '');
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

module.exports = {
    extractInvoiceData
};
