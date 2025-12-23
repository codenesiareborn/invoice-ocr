# Invoice OCR Web Application

Extract invoice data from images using Google Gemini 2.5 Flash API.

## Features

- 📤 Upload invoice images (JPG, PNG, WebP)
- 📷 Capture photos using device camera
- 🤖 AI-powered data extraction with Gemini
- 💾 Store extracted data in SQLite database
- 📊 View recent invoices
- 📱 Responsive mobile-friendly design

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Backend**: Node.js + Express
- **AI**: Google Gemini 2.5 Flash API
- **Database**: SQLite3
- **File Upload**: Multer

## Prerequisites

- Node.js (v14 or higher)
- Gemini API key

## Installation

1. **Clone or navigate to the project directory**
   ```bash
   cd invoice-ocr
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   The `.env` file is already set up with your Gemini API key:
   ```
   GEMINI_API_KEY=AIzaSyDvi2xdyP3jI2qxaFIXHKv3yNfhRIWBGP0
   PORT=3000
   DB_PATH=./invoices.db
   ```

## Usage

1. **Start the server**
   ```bash
   npm start
   ```

2. **Open your browser**
   ```
   http://localhost:3000
   ```

3. **Upload an invoice**
   - Drag & drop an invoice image
   - Click "Browse Files" to select an image
   - Click "Take Photo" to use your camera

4. **View results**
   - Extracted data will be displayed automatically
   - Data is saved to the SQLite database
   - View recent invoices at the bottom of the page

## API Endpoints

### Process Invoice
```
POST /api/invoice/process
Content-Type: multipart/form-data
Body: invoice (file)

Response:
{
  "success": true,
  "message": "Invoice processed successfully",
  "id": 1,
  "data": {
    "invoice_number": "INV-001",
    "invoice_date": "2024-01-15",
    "vendor_name": "Acme Corp",
    "total_amount": 1500.00,
    "currency": "USD",
    "items": [...]
  }
}
```

### Get All Invoices
```
GET /api/invoice/list

Response:
{
  "success": true,
  "count": 5,
  "data": [...]
}
```

### Get Specific Invoice
```
GET /api/invoice/:id

Response:
{
  "success": true,
  "data": {...}
}
```

## Project Structure

```
invoice-ocr/
├── config/
│   ├── database.js       # SQLite configuration
│   └── gemini.js         # Gemini API setup
├── routes/
│   └── invoice.js        # API routes
├── services/
│   ├── geminiService.js  # Gemini extraction logic
│   └── databaseService.js # Database operations
├── public/
│   ├── index.html        # Main UI
│   ├── css/
│   │   └── style.css     # Styling
│   └── js/
│       └── app.js        # Frontend logic
├── uploads/              # Temporary file storage
├── server.js             # Express server
├── package.json          # Dependencies
└── .env                  # Environment variables
```

## Database Schema

**invoices** table:
- `id` - Primary key
- `filename` - Original filename
- `invoice_number` - Extracted invoice number
- `invoice_date` - Invoice date (YYYY-MM-DD)
- `vendor_name` - Vendor/supplier name
- `total_amount` - Total amount (numeric)
- `currency` - Currency code
- `items` - Line items (JSON)
- `raw_response` - Raw Gemini response
- `created_at` - Timestamp

## Testing

1. Use sample invoice images (receipts, bills, invoices)
2. Test with different formats and qualities
3. Try camera capture on mobile devices
4. Verify data accuracy in results

## Troubleshooting

**Camera not working:**
- Check browser permissions
- Use HTTPS or localhost
- Try different browsers

**API errors:**
- Verify Gemini API key is valid
- Check internet connection
- Ensure server is running

**File upload fails:**
- Check file size (max 10MB)
- Verify file type (JPG, PNG, WebP)
- Check uploads/ directory permissions

## License

MIT
