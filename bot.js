const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import services
const { extractInvoiceData } = require('./services/replicateService');
const { saveInvoice, getAllInvoices, getInvoiceById } = require('./services/databaseService');

// Initialize database
require('./config/database');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN tidak ditemukan di .env');
    process.exit(1);
}

// Create bot instance
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Invoice OCR Telegram Bot started...');
console.log('📊 Using Replicate API: google/gemini-2.5-flash');

// Helper function to escape Markdown special characters
function escapeMarkdown(text) {
    if (!text) return text;
    return text.toString().replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}


// Command: /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `
👋 *Selamat datang di Invoice OCR Bot!*

📸 *Cara Menggunakan:*
Kirim foto invoice Anda, dan saya akan extract data secara otomatis.

✨ *Fitur:*
• Extract nomor invoice
• Extract tanggal
• Extract nama vendor
• Extract total amount
• Extract detail item

📋 *Command:*
/start - Tampilkan pesan ini
/history - Lihat 10 invoice terakhir
/stats - Statistik invoice

🎯 *Format yang didukung:*
JPG, PNG, WebP

Silakan kirim foto invoice Anda sekarang! 📷
  `;

    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// Command: /history
bot.onText(/\/history/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const invoices = await getAllInvoices();

        if (invoices.length === 0) {
            bot.sendMessage(chatId, '📭 Belum ada invoice yang diproses.');
            return;
        }

        let message = '📋 *10 Invoice Terakhir:*\n\n';

        invoices.slice(0, 10).forEach((inv, i) => {
            message += `${i + 1}. *${inv.vendor_name || 'N/A'}*\n`;
            message += `   No: ${inv.invoice_number || 'N/A'}\n`;
            message += `   Tanggal: ${inv.invoice_date || 'N/A'}\n`;
            message += `   Total: ${inv.currency || ''} ${inv.total_amount?.toLocaleString('id-ID') || 0}\n`;
            message += `   ID: \`${inv.id}\` (gunakan /detail_${inv.id})\n\n`;
        });

        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('Error fetching history:', error);
        bot.sendMessage(chatId, '❌ Gagal mengambil riwayat invoice.');
    }
});

// Command: /detail_[id]
bot.onText(/\/detail_(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const invoiceId = parseInt(match[1]);

    try {
        const invoice = await getInvoiceById(invoiceId);

        if (!invoice) {
            bot.sendMessage(chatId, '❌ Invoice tidak ditemukan.');
            return;
        }

        let message = '📄 *Detail Invoice*\n\n';
        message += `🆔 *ID:* ${invoice.id}\n`;
        message += `📄 *No. Invoice:* ${invoice.invoice_number || 'N/A'}\n`;
        message += `📅 *Tanggal:* ${invoice.invoice_date || 'N/A'}\n`;
        message += `🏪 *Vendor:* ${invoice.vendor_name || 'N/A'}\n`;
        message += `💰 *Total:* ${invoice.currency || ''} ${invoice.total_amount?.toLocaleString('id-ID') || 0}\n\n`;

        if (invoice.items && invoice.items.length > 0) {
            message += '*📦 Item:*\n';
            invoice.items.forEach((item, i) => {
                message += `${i + 1}. ${item.description}\n`;
                message += `   ${item.quantity}x @ ${item.unit_price?.toLocaleString('id-ID')} = ${item.amount?.toLocaleString('id-ID')}\n`;
            });
        }

        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('Error fetching invoice:', error);
        bot.sendMessage(chatId, '❌ Gagal mengambil detail invoice.');
    }
});

// Command: /stats
bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const invoices = await getAllInvoices();

        const totalInvoices = invoices.length;
        const totalAmount = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
        const vendors = [...new Set(invoices.map(inv => inv.vendor_name).filter(Boolean))];

        let message = '📊 *Statistik Invoice*\n\n';
        message += `📝 Total Invoice: *${totalInvoices}*\n`;
        message += `💰 Total Amount: *IDR ${totalAmount.toLocaleString('id-ID')}*\n`;
        message += `🏪 Jumlah Vendor: *${vendors.length}*\n`;

        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('Error fetching stats:', error);
        bot.sendMessage(chatId, '❌ Gagal mengambil statistik.');
    }
});

// Handle photo messages
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;

    try {
        // Send processing message
        const processingMsg = await bot.sendMessage(chatId, '⏳ Memproses invoice...');

        // Get highest resolution photo
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;

        // Download photo from Telegram
        const file = await bot.getFile(fileId);
        const filePath = file.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        // Generate unique filename
        const ext = path.extname(filePath) || '.jpg';
        const filename = `invoice-${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
        const tempFilePath = path.join(__dirname, 'temp', filename);

        // Download file
        const response = await axios.get(fileUrl, { responseType: 'stream' });
        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // Move to uploads directory for processing
        const uploadPath = path.join(__dirname, 'uploads', filename);
        fs.renameSync(tempFilePath, uploadPath);

        // Extract invoice data
        const extractionResult = await extractInvoiceData(filename);

        if (!extractionResult.success) {
            // Clean up file
            if (fs.existsSync(uploadPath)) {
                fs.unlinkSync(uploadPath);
            }

            await bot.editMessageText(
                '❌ Gagal memproses invoice. Silakan coba lagi dengan foto yang lebih jelas.',
                { chat_id: chatId, message_id: processingMsg.message_id }
            );
            return;
        }

        // Save to database
        const dbResult = await saveInvoice(
            extractionResult.data,
            `telegram_${chatId}_${filename}`,
            extractionResult.rawResponse
        );

        // Clean up uploaded file
        if (fs.existsSync(uploadPath)) {
            fs.unlinkSync(uploadPath);
        }

        // Format result message
        const data = extractionResult.data;
        let resultMessage = '✅ *Invoice berhasil diproses!*\n\n';
        resultMessage += `🆔 *ID:* ${dbResult.id}\n`;
        resultMessage += `📄 *No\\. Invoice:* ${escapeMarkdown(data.invoice_number) || 'N/A'}\n`;
        resultMessage += `📅 *Tanggal:* ${escapeMarkdown(data.invoice_date) || 'N/A'}\n`;
        resultMessage += `🏪 *Vendor:* ${escapeMarkdown(data.vendor_name) || 'N/A'}\n`;
        resultMessage += `💰 *Total:* ${escapeMarkdown(data.currency) || ''} ${data.total_amount?.toLocaleString('id-ID') || 0}\n\n`;

        if (data.items && data.items.length > 0) {
            resultMessage += '*📦 Item:*\n';
            data.items.forEach((item, i) => {
                resultMessage += `${i + 1}\\. ${escapeMarkdown(item.description)}\n`;
                resultMessage += `   ${item.quantity}x @ ${item.unit_price?.toLocaleString('id-ID')} = ${item.amount?.toLocaleString('id-ID')}\n`;
            });
            resultMessage += '\n';
        }

        resultMessage += `💾 Data tersimpan dengan ID: \`${dbResult.id}\`\n`;
        resultMessage += `Gunakan /detail\\_${dbResult.id} untuk melihat detail lengkap\\.`;

        // Update processing message with result
        await bot.editMessageText(resultMessage, {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: 'Markdown'
        });

    } catch (error) {
        console.error('Error processing photo:', error);
        bot.sendMessage(chatId, `❌ Terjadi error: ${error.message}`);
    }
});

// Handle document (reject)
bot.on('document', (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
        chatId,
        '📎 Mohon kirim sebagai *foto*, bukan sebagai file/document.\n\nTekan icon 📷 untuk mengirim foto.',
        { parse_mode: 'Markdown' }
    );
});

// Handle errors
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down bot...');
    bot.stopPolling();
    process.exit(0);
});
