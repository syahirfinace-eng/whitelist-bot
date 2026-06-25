# Whitelist Bot — Setup Guide

## Langkah 1: Aktifkan RCON di Minecraft
Edit file `server.properties` di server MC kamu:
```
enable-rcon=true
rcon.port=25575
rcon.password=isi_password_sesukamu
```
Lalu restart server Minecraft.

## Langkah 2: Buat Bot Discord
1. Buka https://discord.com/developers/applications
2. Klik "New Application" → beri nama
3. Masuk ke tab "Bot" → klik "Add Bot"
4. Copy TOKEN bot kamu
5. Di tab "Bot", aktifkan:
   - ✅ SERVER MEMBERS INTENT
   - ✅ MESSAGE CONTENT INTENT
6. Invite bot ke server: OAuth2 → URL Generator
   - Centang: `bot`
   - Permissions: `Send Messages`, `Read Message History`, `View Channels`

## Langkah 3: Deploy ke Railway
1. Buka https://railway.app → login dengan GitHub
2. "New Project" → "Deploy from GitHub repo"
3. Upload folder ini atau push ke GitHub dulu
4. Di Railway, masuk ke tab "Variables" dan isi:
   - `DISCORD_TOKEN` = token bot Discord
   - `RCON_HOST` = IP server MC kamu
   - `RCON_PORT` = 25575 (atau sesuai server.properties)
   - `RCON_PASSWORD` = password RCON kamu
   - `LOG_CHANNEL_ID` = (opsional) ID channel log admin

## Langkah 4: Sesuaikan nama field form
Di `index.js` baris CONFIG, pastikan `FORM_FIELD_USERNAME` 
SAMA PERSIS dengan label field di form Ticket Tool kamu.

Contoh dari screenshot: "Apa Nama Username MC kamu"

## Cek Apakah Berjalan
Di Railway, lihat tab "Logs" — harusnya muncul:
✅ Bot aktif sebagai NamaBot#1234
