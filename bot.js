const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config();

// Import services
const { extractInvoiceData, extractInvoiceDataFromText } = require('./services/replicateService');
const { saveInvoice, getAllInvoices, getInvoiceById } = require('./services/databaseService');
const { transcribeAudio } = require('./services/whisperService');

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


// Reply keyboard markup for quick access
const mainMenuKeyboard = {
    keyboard: [
        [{ text: '📊 Statistics' }, { text: '📋 History' }],
        [{ text: '📥 Export All' }, { text: '❓ Help' }]
    ],
    resize_keyboard: true,
    persistent: true
};

// Command: /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `
👋 *Selamat datang di Invoice OCR Bot!*

📸 *Cara Menggunakan:*
• Kirim foto invoice, atau
• 🎤 Kirim voice message dengan data invoice

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
📷 Foto: JPG, PNG, WebP
🎤 Voice: Bahasa Indonesia / English

*Contoh voice:*
_"Invoice dari Toko ABC, nomor 123, tanggal 20 Desember 2024, total 50 ribu rupiah, item sabun 10 ribu, shampo 40 ribu"_

💡 *Gunakan menu di bawah untuk akses cepat!*

━━━━━━━━━━━━━━━━━━━━━
© 2024 Almafazi, Codenesia
  `;

    bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard
    });
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
        }, {
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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

        // Generate filename (sanitize invoice number for filesystem)
        const sanitizedInvoiceNumber = (invoice.invoice_number || invoice.id).toString().replace(/[/\\?%*:|"<>]/g, '-');
        const filename = `Invoice_${sanitizedInvoiceNumber}_${new Date().toISOString().split('T')[0]}.xlsx`;
        const filepath = path.join(__dirname, 'temp', filename);

        // Write file
        XLSX.writeFile(wb, filepath);

        // Send file
        await bot.sendDocument(chatId, filepath, {
            caption: `✅ Export invoice #${invoice.id}\n📄 ${invoice.invoice_number || 'N/A'}\n💰 ${invoice.currency || ''} ${(invoice.total_amount || 0).toLocaleString('id-ID')}`
        }, {
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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
        }, {
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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

// Handle voice messages
bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;

    try {
        // Send processing message
        const processingMsg = await bot.sendMessage(chatId, '🎤 Transcribing audio...');

        // Get voice file info
        const voice = msg.voice;
        const fileId = voice.file_id;
        const duration = voice.duration;

        // Check duration (reject if too short)
        if (duration < 1) {
            await bot.editMessageText(
                '❌ Audio terlalu pendek. Minimal 1 detik.',
                { chat_id: chatId, message_id: processingMsg.message_id }
            );
            return;
        }

        // Download voice from Telegram
        const file = await bot.getFile(fileId);
        const filePath = file.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        // Generate unique filename
        const ext = path.extname(filePath) || '.ogg';
        const filename = `voice-${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
        const tempFilePath = path.join(__dirname, 'temp', filename);

        // Download file
        const response = await axios.get(fileUrl, { responseType: 'stream' });
        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // Move to uploads directory for public access
        const uploadPath = path.join(__dirname, 'uploads', filename);
        fs.renameSync(tempFilePath, uploadPath);

        // Construct public URL
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const audioUrl = `${baseUrl}/uploads/${filename}`;

        // Update status
        await bot.editMessageText(
            '🎤 Transcribing audio...\n⏳ Processing...',
            { chat_id: chatId, message_id: processingMsg.message_id }
        );

        // Transcribe audio using Whisper
        const transcriptionResult = await transcribeAudio(audioUrl);

        if (!transcriptionResult.success) {
            // Clean up file
            if (fs.existsSync(uploadPath)) {
                fs.unlinkSync(uploadPath);
            }

            await bot.editMessageText(
                '❌ Gagal transcribe audio. Pastikan audio jelas dan tidak ada noise berlebihan.',
                { chat_id: chatId, message_id: processingMsg.message_id }
            );
            return;
        }

        const transcription = transcriptionResult.transcription;
        console.log('Transcription:', transcription);

        // Update status
        await bot.editMessageText(
            `🎤 Transcription: "${transcription.substring(0, 100)}..."\n⏳ Extracting invoice data...`,
            { chat_id: chatId, message_id: processingMsg.message_id }
        );

        // Extract invoice data from transcription
        const extractionResult = await extractInvoiceDataFromText(transcription);

        // Clean up audio file
        if (fs.existsSync(uploadPath)) {
            fs.unlinkSync(uploadPath);
        }

        if (!extractionResult.success) {
            await bot.editMessageText(
                `❌ *Gagal extract data invoice dari voice*\n\n📝 Transcription:\n"${transcription}"\n\n`,
                { chat_id: chatId, message_id: processingMsg.message_id, parse_mode: 'Markdown' }
            );

            // Send additional help based on error type
            let helpMessage = '';

            if (extractionResult.error === 'INSUFFICIENT_DATA') {
                helpMessage = '💡 *Tips:* Sebutkan dengan jelas:\n';
                helpMessage += '• Nomor invoice\n';
                helpMessage += '• Nama vendor/toko\n';
                helpMessage += '• Total amount dengan mata uang\n';
                helpMessage += '• (Opsional) Daftar item dan harga\n\n';
                helpMessage += `ℹ️ ${extractionResult.details || 'Data tidak mencukupi'}`;
            } else {
                helpMessage = '💡 *Contoh:* "Invoice dari Toko ABC, nomor 123, tanggal 20 Desember 2024, total 50 ribu rupiah"';
            }

            await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
            return;
        }

        // Save to database
        const dbResult = await saveInvoice(
            extractionResult.data,
            `voice_${chatId}_${filename}`,
            `Transcription: ${transcription}\n\nRaw: ${extractionResult.rawResponse}`
        );

        // Format result message
        const data = extractionResult.data;
        let resultMessage = '✅ *Invoice dari voice berhasil diproses!*\n\n';
        resultMessage += `🎤 *Transcription:* "${transcription.substring(0, 150)}${transcription.length > 150 ? '...' : ''}"\n\n`;
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

        // Update processing message with result and inline keyboard
        await bot.editMessageText(resultMessage, {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '📊 Export to Excel',
                            callback_data: `export_${dbResult.id}`
                        }
                    ]
                ]
            }
        });

    } catch (error) {
        console.error('Error processing voice:', error);
        bot.sendMessage(chatId, `❌ Terjadi error: ${error.message}`);
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

            // Handle different error types
            let errorMessage = '❌ Gagal memproses invoice.';

            if (extractionResult.error === 'NOT_INVOICE') {
                errorMessage = '❌ *Gambar tidak terdeteksi sebagai invoice*\n\n';
                errorMessage += '📸 Pastikan foto menampilkan invoice/nota dengan jelas yang berisi:\n';
                errorMessage += '• Informasi vendor/toko\n';
                errorMessage += '• Nomor invoice atau tanggal\n';
                errorMessage += '• Daftar item dan harga\n';
                errorMessage += '• Total amount\n\n';
                errorMessage += `ℹ️ ${extractionResult.details || 'Gambar tidak mengandung informasi invoice'}`;
            } else if (extractionResult.error === 'INSUFFICIENT_DATA') {
                errorMessage = '❌ *Data invoice tidak lengkap*\n\n';
                errorMessage += '📋 Invoice harus memiliki minimal 2 dari:\n';
                errorMessage += '• Nomor invoice\n';
                errorMessage += '• Nama vendor\n';
                errorMessage += '• Total amount\n\n';
                errorMessage += `ℹ️ ${extractionResult.details || 'Data tidak mencukupi'}`;
            } else {
                errorMessage += '\n\nSilakan coba lagi dengan foto yang lebih jelas.';
            }

            await bot.editMessageText(errorMessage, {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: 'Markdown'
            });
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

        // Update processing message with result and inline keyboard
        await bot.editMessageText(resultMessage, {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '📊 Export to Excel',
                            callback_data: `export_${dbResult.id}`
                        }
                    ]
                ]
            }
        });

    } catch (error) {
        console.error('Error processing photo:', error);
        bot.sendMessage(chatId, `❌ Terjadi error: ${error.message}`);
    }
});

// Handle callback queries (inline keyboard buttons)
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Handle export button
    if (data.startsWith('export_')) {
        const invoiceId = parseInt(data.split('_')[1]);

        try {
            // Answer callback query to remove loading state
            await bot.answerCallbackQuery(query.id, { text: '📊 Generating Excel...' });

            const invoice = await getInvoiceById(invoiceId);

            if (!invoice) {
                await bot.answerCallbackQuery(query.id, { text: '❌ Invoice tidak ditemukan', show_alert: true });
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

            // Generate filename (sanitize invoice number)
            const sanitizedInvoiceNumber = (invoice.invoice_number || invoice.id).toString().replace(/[/\\?%*:|"<>]/g, '-');
            const filename = `Invoice_${sanitizedInvoiceNumber}_${new Date().toISOString().split('T')[0]}.xlsx`;
            const filepath = path.join(__dirname, 'temp', filename);

            // Write file
            XLSX.writeFile(wb, filepath);

            // Send file
            await bot.sendDocument(chatId, filepath, {
                caption: `✅ Export invoice #${invoice.id}\n📄 ${invoice.invoice_number || 'N/A'}\n💰 ${invoice.currency || ''} ${(invoice.total_amount || 0).toLocaleString('id-ID')}`
            }, {
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });

            // Clean up file
            fs.unlinkSync(filepath);

        } catch (error) {
            console.error('Error in callback export:', error);
            await bot.answerCallbackQuery(query.id, { text: '❌ Gagal export', show_alert: true });
        }
    }
});

// Handle text messages (menu shortcuts)
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ignore if it's a command (starts with /)
    if (text.startsWith('/')) return;

    // Handle menu shortcuts
    try {
        switch (text) {
            case '📊 Statistics':
                // Execute /stats logic
                const invoices = await getAllInvoices();
                const totalInvoices = invoices.length;
                const totalAmount = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
                const vendors = [...new Set(invoices.map(inv => inv.vendor_name).filter(Boolean))];

                let statsMessage = '📊 *Statistik Invoice*\n\n';
                statsMessage += `📝 Total Invoice: *${totalInvoices}*\n`;
                statsMessage += `💰 Total Amount: *IDR ${totalAmount.toLocaleString('id-ID')}*\n`;
                statsMessage += `🏪 Jumlah Vendor: *${vendors.length}*\n`;

                bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard });
                break;

            case '📋 History':
                // Execute /history logic
                const allInvoices = await getAllInvoices();

                if (allInvoices.length === 0) {
                    bot.sendMessage(chatId, '📭 Belum ada invoice yang diproses.', { reply_markup: mainMenuKeyboard });
                    return;
                }

                let historyMessage = '📋 *10 Invoice Terakhir:*\n\n';

                allInvoices.slice(0, 10).forEach((inv, i) => {
                    historyMessage += `${i + 1}. *${inv.vendor_name || 'N/A'}*\n`;
                    historyMessage += `   No: ${inv.invoice_number || 'N/A'}\n`;
                    historyMessage += `   Tanggal: ${inv.invoice_date || 'N/A'}\n`;
                    historyMessage += `   Total: ${inv.currency || ''} ${inv.total_amount?.toLocaleString('id-ID') || 0}\n`;
                    historyMessage += `   ID: \`${inv.id}\` (gunakan /detail_${inv.id})\n\n`;
                });

                bot.sendMessage(chatId, historyMessage, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard });
                break;

            case '📥 Export All':
                // Execute /export_all logic
                const statusMsg = await bot.sendMessage(chatId, '📊 Generating Excel file...', { reply_markup: mainMenuKeyboard });

                const exportInvoices = await getAllInvoices();

                if (exportInvoices.length === 0) {
                    await bot.editMessageText('📭 Belum ada invoice untuk di-export.', {
                        chat_id: chatId,
                        message_id: statusMsg.message_id
                    });
                    return;
                }

                // Prepare data for Excel
                const excelData = [];
                exportInvoices.forEach(inv => {
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
                    caption: `✅ Export berhasil!\n📝 Total: ${exportInvoices.length} invoices\n💰 Total Amount: IDR ${exportInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0).toLocaleString('id-ID')}`
                }, {
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });

                // Delete status message
                await bot.deleteMessage(chatId, statusMsg.message_id);

                // Clean up file
                fs.unlinkSync(filepath);
                break;

            case '❓ Help':
                // Execute /start logic
                const welcomeMessage = `
👋 *Selamat datang di Invoice OCR Bot!*

📸 *Cara Menggunakan:*
• Kirim foto invoice, atau
• 🎤 Kirim voice message dengan data invoice

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
📷 Foto: JPG, PNG, WebP
🎤 Voice: Bahasa Indonesia / English

*Contoh voice:*
_"Invoice dari Toko ABC, nomor 123, tanggal 20 Desember 2024, total 50 ribu rupiah, item sabun 10 ribu, shampo 40 ribu"_

💡 *Gunakan menu di bawah untuk akses cepat!*

━━━━━━━━━━━━━━━━━━━━━
© 2024 Almafazi, Codenesia
  `;

                bot.sendMessage(chatId, welcomeMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: mainMenuKeyboard
                });
                break;

            default:
                // Ignore other text messages
                break;
        }
    } catch (error) {
        console.error('Error handling menu shortcut:', error);
        bot.sendMessage(chatId, '❌ Terjadi error saat memproses menu.', { reply_markup: mainMenuKeyboard });
    }
});

// Handle document (reject)
bot.on('document', (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
        chatId,
        '📎 Mohon kirim sebagai *foto*, bukan sebagai file/document.\n\nTekan icon 📷 untuk mengirim foto.',
        { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard }
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
