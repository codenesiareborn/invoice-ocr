# Menu Shortcut Buttons - Quick Reference

## Fitur Baru ✨

Bot Invoice OCR sekarang memiliki **menu shortcut buttons** yang persistent di bawah input field, mirip seperti bot Cointry.

![Menu Shortcut Preview](menu_shortcut_preview.png)

## Menu Buttons

| Button | Fungsi | Command Equivalent |
|--------|--------|-------------------|
| 📊 Statistics | Tampilkan statistik invoice | `/stats` |
| 📋 History | Lihat 10 invoice terakhir | `/history` |
| 📥 Export All | Export semua invoice ke Excel | `/export_all` |
| ❓ Help | Tampilkan help & welcome message | `/start` |

## Cara Menggunakan

1. Buka bot di Telegram
2. Ketik `/start` untuk menampilkan menu keyboard
3. Menu akan muncul di bawah input field
4. Tap button untuk akses cepat ke fitur

## Keuntungan

✅ **Akses cepat** - Tidak perlu ketik command manual
✅ **User-friendly** - Lebih mudah untuk pengguna non-teknis
✅ **Persistent** - Menu selalu tersedia di setiap chat
✅ **Visual** - Emoji membuat menu lebih menarik

## Technical Details

- Menggunakan **Reply Keyboard Markup** dari Telegram Bot API
- `resize_keyboard: true` - Menyesuaikan ukuran dengan layar
- `persistent: true` - Menu tetap muncul setelah kirim pesan
- Text handler menangkap tap button dan trigger command yang sesuai

## Screenshot

![Uploaded Example](uploaded_image_1766494006102.png)
*Contoh menu shortcut dari Cointry bot*
