const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
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
• Export ke Excel

📋 *Command:*
/start - Tampilkan pesan ini
/history - Lihat 10 invoice terakhir
/stats - Statistik invoice
/export\\_all - Export semua invoice ke Excel
/export\\_month - Export invoice bulan ini
/export\\_[id] - Export invoice tertentu

🎯 *Format yang didukung:*
JPG, PNG, WebP

Silakan kirim foto invoice Anda sekarang! 📷

━━━━━━━━━━━━━━━━━━━━━
© 2024 Almafazi, Codenesia
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

// Command: /export_all - Export all invoices to Excel
bot.onText(/\/export_all/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const statusMsg = await bot.sendMessage(chatId, '📊 Generating Excel file...');

        const invoices = await getAllInvoices();

        if (invoices.length === 0) {
            await bot.editMessageText('📭 Belum ada invoice untuk di-export.', {
                chat_id: chatId,
                message_id: statusMsg.message_id
            });
            return;
        }

        // Prepare data for Excel
        const excelData = [];
        invoices.forEach(inv => {
            // Add main invoice row
            excelData.push({
                'ID': inv.id,
                'Invoice Number': inv.invoice_number || 'N/A',
                'Date': inv.invoice_date || 'N/A',
                'Vendor': inv.vendor_name || 'N/A',
                'Total Amount': inv.total_amount || 0,
                'Currency': inv.currency || '',
                'Items Count': inv.items ? inv.items.length : 0,
                'Created At': inv.created_at
            });
        });

        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Auto-size columns
        const colWidths = [
            { wch: 5 },  // ID
            { wch: 20 }, // Invoice Number
            { wch: 12 }, // Date
            { wch: 25 }, // Vendor
            { wch: 15 }, // Total Amount
            { wch: 8 },  // Currency
            { wch: 12 }, // Items Count
            { wch: 20 }  // Created At
        ];
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, 'Invoices');

        // Generate filename
        const filename = `Invoice_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
        const filepath = path.join(__dirname, 'temp', filename);

        // Write file
        XLSX.writeFile(wb, filepath);

        // Send file
        await bot.sendDocument(chatId, filepath, {
            caption: `✅ Export berhasil!\n📝 Total: ${invoices.length} invoices\n💰 Total Amount: IDR ${invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0).toLocaleString('id-ID')}`
        });

        // Delete status message
        await bot.deleteMessage(chatId, statusMsg.message_id);

        // Clean up file
        fs.unlinkSync(filepath);

    } catch (error) {
        console.error('Error exporting to Excel:', error);
        bot.sendMessage(chatId, '❌ Gagal membuat file Excel.');
    }
});

// Command: /export_[id] - Export specific invoice to Excel
bot.onText(/\/export_(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const invoiceId = parseInt(match[1]);

    try {
        const statusMsg = await bot.sendMessage(chatId, '📊 Generating Excel file...');

        const invoice = await getInvoiceById(invoiceId);

        if (!invoice) {
            await bot.editMessageText('❌ Invoice tidak ditemukan.', {
                chat_id: chatId,
                message_id: statusMsg.message_id
            });
            return;
        }

        // Create workbook with two sheets
        const wb = XLSX.utils.book_new();

        // Sheet 1: Invoice Summary
        const summaryData = [{
            'Field': 'ID',
            'Value': invoice.id
        }, {
            'Field': 'Invoice Number',
            'Value': invoice.invoice_number || 'N/A'
        }, {
            'Field': 'Date',
            'Value': invoice.invoice_date || 'N/A'
        }, {
            'Field': 'Vendor',
            'Value': invoice.vendor_name || 'N/A'
        }, {
            'Field': 'Total Amount',
            'Value': invoice.total_amount || 0
        }, {
            'Field': 'Currency',
            'Value': invoice.currency || ''
        }];

        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        wsSummary['!cols'] = [{ wch: 20 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

        // Sheet 2: Line Items
        if (invoice.items && invoice.items.length > 0) {
            const itemsData = invoice.items.map((item, i) => ({
                'No': i + 1,
                'Description': item.description || '',
                'Quantity': item.quantity || 0,
                'Unit Price': item.unit_price || 0,
                'Amount': item.amount || 0
            }));

            const wsItems = XLSX.utils.json_to_sheet(itemsData);
            wsItems['!cols'] = [
                { wch: 5 },
                { wch: 30 },
                { wch: 10 },
                { wch: 15 },
                { wch: 15 }
            ];
            XLSX.utils.book_append_sheet(wb, wsItems, 'Items');
        }

        // Generate filename
        const filename = `Invoice_${invoice.invoice_number || invoice.id}_${new Date().toISOString().split('T')[0]}.xlsx`;
        const filepath = path.join(__dirname, 'temp', filename);

        // Write file
        XLSX.writeFile(wb, filepath);

        // Send file
        await bot.sendDocument(chatId, filepath, {
            caption: `✅ Export invoice #${invoice.id}\n📄 ${invoice.invoice_number || 'N/A'}\n💰 ${invoice.currency || ''} ${(invoice.total_amount || 0).toLocaleString('id-ID')}`
        });

        // Delete status message
        await bot.deleteMessage(chatId, statusMsg.message_id);

        // Clean up file
        fs.unlinkSync(filepath);

    } catch (error) {
        console.error('Error exporting invoice:', error);
        bot.sendMessage(chatId, '❌ Gagal membuat file Excel.');
    }
});

// Command: /export_month - Export current month invoices
bot.onText(/\/export_month/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const statusMsg = await bot.sendMessage(chatId, '📊 Generating Excel file...');

        const allInvoices = await getAllInvoices();

        // Filter invoices from current month
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const monthInvoices = allInvoices.filter(inv => {
            if (!inv.invoice_date) return false;
            const invDate = new Date(inv.invoice_date);
            return invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear;
        });

        if (monthInvoices.length === 0) {
            await bot.editMessageText('📭 Tidak ada invoice bulan ini.', {
                chat_id: chatId,
                message_id: statusMsg.message_id
            });
            return;
        }

        // Prepare data for Excel
        const excelData = monthInvoices.map(inv => ({
            'ID': inv.id,
            'Invoice Number': inv.invoice_number || 'N/A',
            'Date': inv.invoice_date || 'N/A',
            'Vendor': inv.vendor_name || 'N/A',
            'Total Amount': inv.total_amount || 0,
            'Currency': inv.currency || '',
            'Items Count': inv.items ? inv.items.length : 0
        }));

        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);
        ws['!cols'] = [
            { wch: 5 }, { wch: 20 }, { wch: 12 }, { wch: 25 },
            { wch: 15 }, { wch: 8 }, { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Invoices');

        // Generate filename
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const filename = `Invoice_${monthNames[currentMonth]}_${currentYear}.xlsx`;
        const filepath = path.join(__dirname, 'temp', filename);

        // Write file
        XLSX.writeFile(wb, filepath);

        // Send file
        await bot.sendDocument(chatId, filepath, {
            caption: `✅ Export ${monthNames[currentMonth]} ${currentYear}\n📝 Total: ${monthInvoices.length} invoices\n💰 Total Amount: IDR ${monthInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0).toLocaleString('id-ID')}`
        });

        // Delete status message
        await bot.deleteMessage(chatId, statusMsg.message_id);

        // Clean up file
        fs.unlinkSync(filepath);

    } catch (error) {
        console.error('Error exporting month:', error);
        bot.sendMessage(chatId, '❌ Gagal membuat file Excel.');
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
