# Invoice OCR Telegram Bot - Setup Guide

## 🚀 Quick Start

### 1. Buat Bot di Telegram

1. Buka Telegram, cari **@BotFather**
2. Kirim `/newbot`
3. Beri nama bot (contoh: "Invoice OCR Bot")
4. Beri username (contoh: "invoice_ocr_bot")
5. **Simpan TOKEN** yang diberikan

### 2. Konfigurasi Bot

Edit file `.env` dan masukkan bot token Anda:

```bash
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

Ganti `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz` dengan token dari BotFather.

### 3. Jalankan Bot

```bash
node bot.js
```

Output yang diharapkan:
```
🤖 Invoice OCR Telegram Bot started...
📊 Using Replicate API: google/gemini-2.5-flash
Connected to SQLite database
Database table ready
```

### 4. Test Bot

1. Buka Telegram
2. Cari bot Anda (username yang dibuat di BotFather)
3. Klik **Start** atau kirim `/start`
4. Kirim foto invoice
5. Tunggu hasil ekstraksi!

---

## 📋 Fitur Bot

### Commands

| Command | Deskripsi |
|---------|-----------|
| `/start` | Tampilkan pesan welcome dan panduan |
| `/history` | Lihat 10 invoice terakhir |
| `/stats` | Statistik total invoice dan amount |
| `/detail_[id]` | Lihat detail invoice berdasarkan ID |

### Contoh Penggunaan

**1. Kirim Foto Invoice:**
- Buka chat dengan bot
- Kirim foto invoice (JPG/PNG/WebP)
- Bot akan memproses dan mengirim hasil

**2. Lihat Riwayat:**
```
/history
```
Output:
```
📋 10 Invoice Terakhir:

1. TOKO LANCAR JAYA
   No: 19344/KSR/UTM/0524
   Tanggal: 2023-05-24
   Total: IDR 73,500
   ID: 1 (gunakan /detail_1)

2. UD. BUDI JAYA
   No: N/A
   Tanggal: 2020-03-23
   Total: IDR 530,000
   ID: 2 (gunakan /detail_2)
```

**3. Lihat Detail:**
```
/detail_1
```

**4. Lihat Statistik:**
```
/stats
```
Output:
```
📊 Statistik Invoice

📝 Total Invoice: 15
💰 Total Amount: IDR 2,450,000
🏪 Jumlah Vendor: 8
```

---

## 🔧 Troubleshooting

### Bot tidak merespon

**Cek:**
1. Apakah `node bot.js` masih running?
2. Apakah TOKEN sudah benar di `.env`?
3. Cek log error di terminal

### Error "TELEGRAM_BOT_TOKEN tidak ditemukan"

**Solusi:**
```bash
# Edit .env
nano .env

# Pastikan ada baris:
TELEGRAM_BOT_TOKEN=your_actual_token_here
```

### Error saat processing foto

**Kemungkinan:**
1. Cloudflare tunnel tidak aktif
2. Replicate API quota habis
3. Foto terlalu buram

**Solusi:**
- Pastikan `BASE_URL` di `.env` aktif
- Cek Replicate API key
- Kirim foto yang lebih jelas

---

## 📁 Struktur File

```
invoice-ocr/
├── bot.js                    # ← Telegram Bot (jalankan ini!)
├── server.js                 # Express server (opsional, tidak dipakai bot)
├── config/
│   ├── database.js          # Database config
│   └── replicate.js         # Replicate API config
├── services/
│   ├── replicateService.js  # Invoice extraction logic
│   └── databaseService.js   # Database operations
├── temp/                     # Temporary files
├── uploads/                  # Uploaded invoices
├── invoices.db              # SQLite database
├── package.json
└── .env                      # Configuration
```

---

## 🔒 Privacy & Security

- ✅ Data invoice tersimpan di **komputer Anda** (`invoices.db`)
- ✅ Telegram **tidak menyimpan** data invoice
- ✅ Foto invoice di-delete setelah diproses
- ✅ Hanya Anda yang bisa akses database

---

## 🚀 Production Deployment

### Opsi 1: VPS (Recommended)

```bash
# Install PM2
npm install -g pm2

# Run bot dengan PM2
pm2 start bot.js --name invoice-bot

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Opsi 2: Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "bot.js"]
```

```bash
docker build -t invoice-bot .
docker run -d --name invoice-bot invoice-bot
```

---

## 💡 Tips

1. **Foto yang baik:**
   - Pencahayaan cukup
   - Fokus jelas
   - Seluruh invoice terlihat

2. **Multi-user:**
   - Bot bisa digunakan banyak user sekaligus
   - Setiap user bisa lihat semua invoice (shared database)
   - Jika mau private per user, tambahkan filter `chatId`

3. **Backup database:**
   ```bash
   cp invoices.db invoices.db.backup
   ```

---

## 🎯 Next Steps

Setelah bot berjalan, Anda bisa:

1. ✅ Test dengan berbagai jenis invoice
2. ✅ Invite teman untuk test multi-user
3. ✅ Deploy ke VPS untuk 24/7 uptime
4. ✅ Tambahkan fitur export ke Excel/CSV
5. ✅ Tambahkan filter per user (private mode)

---

## 📞 Support

Jika ada masalah:
1. Cek log di terminal
2. Pastikan semua dependencies terinstall
3. Pastikan `.env` sudah benar

Selamat menggunakan Invoice OCR Bot! 🎉
