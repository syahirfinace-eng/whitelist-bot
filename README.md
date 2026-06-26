# 🎮 Whitelist Bot — Auto Registration System

Bot Discord untuk auto whitelist pemain Minecraft (Java & Bedrock) via Ticket Tool. Terintegrasi dengan RCON dan Floodgate.

---

## ✨ Fitur

- ✅ Auto whitelist Java player via RCON
- ✅ Auto whitelist Bedrock player via Floodgate (`fwhitelist`)
- ✅ Deteksi platform otomatis (Java/Bedrock) dari form Ticket Tool
- ✅ Log whitelist ke channel admin
- ✅ 1 akun Discord = 1 akun MC (via limitasi Ticket Tool)

---

## 🛠️ Persiapan

### 1. Server Minecraft (Pterodactyl/Panel)

Edit `server.properties`:
```
enable-rcon=true
rcon.port=PORT_RCON_KAMU   # Harus salah satu port yang dialokasikan di panel
rcon.password=PASSWORD_RCON_KAMU
```

> ⚠️ Di Pterodactyl, port RCON **harus** salah satu port yang ada di tab **Network** panel. Port default 25575 tidak bisa dipakai kecuali dialokasikan.

Restart server setelah edit.

---

### 2. Plugin yang Dibutuhkan (untuk Bedrock support)

- **Geyser** — jembatan antara Bedrock dan Java
- **Floodgate** — handle UUID dan whitelist Bedrock player

Tanpa Floodgate, hanya Java player yang bisa di-whitelist otomatis.

---

### 3. Bot Discord

1. Buka [Discord Developer Portal](https://discord.com/developers/applications)
2. Klik **New Application** → beri nama
3. Masuk tab **Bot** → klik **Add Bot**
4. Copy **TOKEN** bot
5. Aktifkan intents:
   - ✅ `SERVER MEMBERS INTENT`
   - ✅ `MESSAGE CONTENT INTENT`
6. Invite bot ke server via **OAuth2 → URL Generator**:
   - Centang: `bot`
   - Permissions: `Send Messages`, `Read Message History`, `View Channels`

---

### 4. Ticket Tool

1. Buka [tickettool.xyz](https://tickettool.xyz) → login
2. Buat **Panel** baru
3. Di **Forms**, tambah 3 field:

| Label | Keterangan |
|-------|-----------|
| `Kamu menggunakan apa?` | Player isi: `Java` atau `Bedrock` |
| `Apa Nama Username MC kamu` | Username Minecraft player |
| `Apakah Anda setuju bahwa 1 akun Discord hanya` | Player isi: `Yes/No` |

> ⚠️ Label field harus **sama persis** dengan yang ada di `index.js` CONFIG.

---

### 5. Konfigurasi Bot

Edit bagian `CONFIG` di `index.js`:

```js
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,

  FORM_FIELD_PLATFORM: "Kamu menggunakan apa?",     // Harus sama persis dengan label form
  FORM_FIELD_USERNAME: "Apa Nama Username MC kamu", // Harus sama persis dengan label form

  RCON_HOST: process.env.RCON_HOST,
  RCON_PORT: parseInt(process.env.RCON_PORT) || 25575,
  RCON_PASSWORD: process.env.RCON_PASSWORD,

  LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID || "", // Opsional
};
```

---

## 🚀 Deploy

Bot ini bisa di-deploy ke platform manapun yang support Node.js.

### Environment Variables yang dibutuhkan:

| Variable | Keterangan |
|----------|-----------|
| `DISCORD_TOKEN` | Token bot Discord |
| `RCON_HOST` | IP server Minecraft |
| `RCON_PORT` | Port RCON (sesuai panel) |
| `RCON_PASSWORD` | Password RCON |
| `LOG_CHANNEL_ID` | ID channel log admin (opsional) |

### Jalankan secara lokal:

```bash
# Install dependencies
npm install

# Buat file .env dari contoh
cp .env.example .env
# Edit .env dan isi semua variable

# Jalankan bot
npm start
```

---

## ⚙️ Cara Kerja

1. Player buka tiket di Discord via Ticket Tool
2. Player isi form: platform (Java/Bedrock) + username MC
3. Bot deteksi jawaban field `Kamu menggunakan apa?`
4. Jika **Java** → kirim `whitelist add <username>` via RCON
5. Jika **Bedrock** → kirim `fwhitelist add .<username>` via RCON (Floodgate)
6. Bot kirim konfirmasi ke channel tiket
7. Log dikirim ke channel admin (jika dikonfigurasi)

---

## 🐛 Troubleshooting

| Error | Penyebab | Solusi |
|-------|---------|--------|
| `ETIMEDOUT` | Port RCON tidak bisa diakses | Pastikan port RCON ada di Network tab panel |
| `ECONNREFUSED` | RCON tidak aktif | Pastikan `enable-rcon=true` dan server sudah direstart |
| `Connection closed` | Port bukan RCON | Jangan pakai port game (port utama MC) untuk RCON |
| Bot tidak respon | Bot tidak detect pesan | Pastikan `MESSAGE CONTENT INTENT` aktif di Developer Portal |
| Bedrock tidak terwhitelist | Floodgate tidak terinstall | Install plugin Floodgate di server MC |

---

## 📁 Struktur File

```
whitelist-bot/
├── index.js        # Main bot
├── package.json    # Dependencies
├── .env.example    # Contoh environment variables
└── README.md       # Dokumentasi ini
```

---

## 📦 Dependencies

- [discord.js](https://discord.js.org/) v14
- [rcon-client](https://www.npmjs.com/package/rcon-client)

---

*Dibuat untuk ImKim MC Server 🎮*
