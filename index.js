const { Client, GatewayIntentBits, Events } = require("discord.js");
const { Rcon } = require("rcon-client");
const SftpClient = require("ssh2-sftp-client");

// =====================================================
// KONFIGURASI — isi via environment variable di Railway
// =====================================================
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,

  // Label field form Ticket Tool — harus SAMA PERSIS
  FORM_FIELD_PLATFORM: "Kamu menggunakan apa?",   // Java atau Bedrock
  FORM_FIELD_USERNAME: "Apa Nama Username MC kamu",

  // RCON Minecraft
  RCON_HOST: process.env.RCON_HOST,
  RCON_PORT: parseInt(process.env.RCON_PORT) || 25575,
  RCON_PASSWORD: process.env.RCON_PASSWORD,

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,

  // IP Server MC yang dikirim ke player (env variable, jangan hardcode)
  MC_SERVER_IP: process.env.MC_SERVER_IP,

  // Channel log (opsional)
  LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID || "",

  // Channel khusus admin commands — isi dengan ID channel #console-code
  // Siapapun yang bisa akses channel ini otomatis bisa pakai command admin
  CONSOLE_CHANNEL_ID: process.env.CONSOLE_CHANNEL_ID || "",

  // SFTP — untuk akses file log MC server
  SFTP_HOST: process.env.SFTP_HOST || "",          // contoh: ap2.nzl.zelpstore.id
  SFTP_PORT: parseInt(process.env.SFTP_PORT) || 2022,
  SFTP_USER: process.env.SFTP_USER || "",          // contoh: syahirgunadarma2027_15522.41ab30e2
  SFTP_PASS: process.env.SFTP_PASS || "",          // password login panel ZelpStore
  LOG_FILE_PATH: process.env.LOG_FILE_PATH || "plugins/Skript/logs/plugins/skript/logs/link-log.txt.log", // path file log di server MC
};
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =====================================================
// SUPABASE — helper fetch langsung tanpa library
// =====================================================
async function supabaseRequest(method, endpoint, body = null) {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    "apikey": CONFIG.SUPABASE_KEY,
    "Authorization": `Bearer ${CONFIG.SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": (method === "POST" || method === "DELETE") ? "return=representation" : "",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${err}`);
  }

  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// Cek apakah Discord user sudah pernah daftar
async function isAlreadyRegistered(discordId) {
  const data = await supabaseRequest(
    "GET",
    `players?discord_id=eq.${discordId}&select=discord_id`
  );
  return data.length > 0;
}

// Simpan data player baru ke Supabase
async function savePlayer({ discordId, discordUsername, mcUsername, isBedrock, linkCode }) {
  await supabaseRequest("POST", "players", {
    discord_id: discordId,
    discord_username: discordUsername,
    mc_username: mcUsername,
    is_bedrock: isBedrock,
    link_code: linkCode,
    is_linked: false,
    registered_at: new Date().toISOString(),
  });
}

// =====================================================
// GENERATE KODE UNIK — 4 karakter alphanumeric
// =====================================================
function generateLinkCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // hapus karakter ambigu: O,0,I,1
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Pastikan kode unik (tidak bentrok dengan yang sudah ada)
async function generateUniqueCode() {
  let code;
  let attempts = 0;
  do {
    code = generateLinkCode();
    const existing = await supabaseRequest(
      "GET",
      `players?link_code=eq.${code}&select=link_code`
    );
    if (existing.length === 0) break;
    attempts++;
  } while (attempts < 10);
  return code;
}

// =====================================================
// WHITELIST via RCON
// =====================================================
async function whitelistPlayer(username, isBedrock) {
  const rcon = new Rcon({
    host: CONFIG.RCON_HOST,
    port: CONFIG.RCON_PORT,
    password: CONFIG.RCON_PASSWORD,
  });

  try {
    await rcon.connect();

    let command;
    if (isBedrock) {
      const bedrockUsername = username.startsWith(".") ? username : `.${username}`;
      command = `fwhitelist add ${bedrockUsername}`;
      console.log(`📱 Bedrock player: ${bedrockUsername}`);
    } else {
      command = `whitelist add ${username}`;
      console.log(`☕ Java player: ${username}`);
    }

    const response = await rcon.send(command);
    await rcon.end();
    return { success: true, response };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =====================================================
// PARSE EMBED dari Ticket Tool
// =====================================================
function parseFromEmbed(embeds) {
  let platform = null;
  let username = null;

  for (const embed of embeds) {
    // Method 1: fields (standard)
    if (embed.fields) {
      for (const field of embed.fields) {
        const fieldName = field.name.toLowerCase();
        if (fieldName.includes(CONFIG.FORM_FIELD_PLATFORM.toLowerCase())) {
          platform = field.value?.trim().toLowerCase();
        }
        if (fieldName.includes(CONFIG.FORM_FIELD_USERNAME.toLowerCase())) {
          username = field.value?.trim();
        }
      }
    }

    // Method 2: description dengan format Ticket Tool
    if (embed.description) {
      const desc = embed.description;
      const bt = '\`\`\`';
      const platformMatch = desc.match(new RegExp('\\*\\*Kamu menggunakan apa\\?\\*\\*[\\s\\S]*?' + bt + '([^' + '\`' + ']+)' + bt, 'i'));
      if (platformMatch) platform = platformMatch[1].trim().toLowerCase();
      const usernameMatch = desc.match(new RegExp('\\*\\*Apa(?:\\s+Nama)?\\s+Username\\s+MC\\s+kamu\\??\\*\\*[\\s\\S]*?' + bt + '([^' + '\`' + ']+)' + bt, 'i'));
      if (usernameMatch) username = usernameMatch[1].trim();
    }
  }

  if (!username) return null;

  const isBedrock = platform?.includes("bedrock") ?? false;
  return { username, isBedrock };
}

// =====================================================
// AMBIL DISCORD USER ID dari mention di embed/message
// =====================================================
function extractDiscordUserId(message) {
  // Ticket Tool biasanya mention player di content atau embed description
  // Format: <@123456789012345678>
  const mentionRegex = /<@!?(\d+)>/;

  // Cek di content message
  let match = message.content?.match(mentionRegex);
  if (match) return match[1];

  // Cek di embed description
  for (const embed of message.embeds) {
    const descMatch = embed.description?.match(mentionRegex);
    if (descMatch) return descMatch[1];

    // Cek di fields
    for (const field of embed.fields || []) {
      const fieldMatch = field.value?.match(mentionRegex);
      if (fieldMatch) return fieldMatch[1];
    }
  }

  return null;
}

// =====================================================
// SFTP — baca & tulis file log MC server
// =====================================================

async function removeFromLog(username) {
  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host: CONFIG.SFTP_HOST,
      port: CONFIG.SFTP_PORT,
      username: CONFIG.SFTP_USER,
      password: CONFIG.SFTP_PASS,
    });

    // Baca file sebagai buffer lalu convert ke string
    const buffer = await sftp.get(CONFIG.LOG_FILE_PATH);
    const content = buffer.toString("utf8");
    const lines = content.split("\n");

    const removed = [];
    const kept = [];

    for (const line of lines) {
      // Format log: [6/28/26, 10:07 AM] [LINK] kimhyunns | UUID: ... | Kode: ... | Discord: ...
      const lineUserMatch = line.match(/\[LINK\]\s+([^\s|]+)/i);
      if (lineUserMatch && lineUserMatch[1].toLowerCase() === username.toLowerCase()) {
        removed.push(line);
      } else {
        kept.push(line);
      }
    }

    // Tulis balik file tanpa baris yang dihapus
    const newContent = kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
    const writeBuffer = Buffer.from(newContent ? newContent + "\n" : "", "utf8");
    await sftp.put(writeBuffer, CONFIG.LOG_FILE_PATH);

    return { removed, kept };
  } finally {
    await sftp.end().catch(() => {});
  }
}

// =====================================================
// MAIN EVENT
// =====================================================
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot aktif sebagai ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  // Hanya proses pesan dari bot Ticket Tool
  if (!message.author.bot) return;
  if (message.author.id !== "557628352828014614") return;
  if (!message.embeds || message.embeds.length === 0) return;

  const parsed = parseFromEmbed(message.embeds);
  if (!parsed || !parsed.username) return;

  const { username, isBedrock } = parsed;
  const platform = isBedrock ? "📱 Bedrock" : "☕ Java";
  const displayName = isBedrock
    ? (username.startsWith(".") ? username : `.${username}`)
    : username;

  // Ambil Discord ID player dari mention di ticket
  const discordUserId = extractDiscordUserId(message);
  const discordUsername = discordUserId
    ? (await message.guild?.members.fetch(discordUserId).catch(() => null))?.user?.username || "Unknown"
    : "Unknown";

  console.log(`🎮 Username: ${displayName} (${platform}) | Discord: ${discordUsername}`);

  // ── Cek duplikat ──
  if (discordUserId) {
    try {
      const alreadyRegistered = await isAlreadyRegistered(discordUserId);
      if (alreadyRegistered) {
        await message.channel.send(
          `⚠️ Akun Discord <@${discordUserId}> sudah pernah mendaftar sebelumnya!\n` +
          `Jika ada masalah, hubungi admin.`
        );
        console.log(`⚠️ Duplikat: Discord ${discordUserId} sudah terdaftar`);
        return;
      }
    } catch (err) {
      console.error("❌ Gagal cek duplikat Supabase:", err.message);
    }
  }

  await message.channel.send(
    `⏳ Sedang memproses whitelist untuk **${displayName}** (${platform})...`
  );

  // =====================================================
  // FIX RACE CONDITION: Kirim /setlinkcode ke MC DULU,
  // baru whitelist player — supaya kode sudah ada
  // sebelum player sempat join dan /link
  // =====================================================

  // ── Generate kode unik & simpan ke Supabase ──
  let linkCode = "????";
  try {
    linkCode = await generateUniqueCode();

    // Simpan ke Supabase
    if (discordUserId) {
      await savePlayer({
        discordId: discordUserId,
        discordUsername,
        mcUsername: displayName,
        isBedrock,
        linkCode,
      });
    }

    // Kirim kode ke MC via RCON SEBELUM whitelist
    const rconLink = new Rcon({
      host: CONFIG.RCON_HOST,
      port: CONFIG.RCON_PORT,
      password: CONFIG.RCON_PASSWORD,
    });
    await rconLink.connect();
    await rconLink.send(`setlinkcode ${displayName} ${linkCode} ${discordUserId || "unknown"}`);
    await rconLink.end();
    console.log(`🔑 Kode ${linkCode} dikirim ke MC untuk ${displayName}`);
  } catch (err) {
    console.error("❌ Gagal generate/simpan/kirim kode:", err.message);
  }

  // ── Baru whitelist player ──
  const result = await whitelistPlayer(username, isBedrock);

  if (!result.success) {
    await message.channel.send(
      `❌ Gagal whitelist **${displayName}**. Mohon hubungi admin.\n` +
      `*(Error: ${result.error})*`
    );
    console.error(`❌ Whitelist gagal: ${displayName} — ${result.error}`);
    return;
  }

  // ── Kirim pesan sukses + IP + Kode Unik di ticket (private) ──
  await message.channel.send(
    `✅ **${displayName}** berhasil di-whitelist! (${platform})\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🌐 **IP Server:** \`${CONFIG.MC_SERVER_IP}\`\n` +
    `🔑 **Kode Link kamu:** \`${linkCode}\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `**Cara masuk server:**\n` +
    `1️⃣ Join ke IP di atas\n` +
    `2️⃣ Daftar password: \`/register [password] [password]\`\n` +
    `3️⃣ Aktivasi akun: \`/aktivasi ${linkCode}\`\n\n` +
    `⚠️ Kode ini **hanya untuk kamu** dan hanya dipakai **1x saat pertama join**.\n` +
    `Jangan bagikan kode ini ke siapapun!`
  );

  console.log(`✅ Whitelist berhasil: ${displayName} | Kode: ${linkCode}`);

  // ── Log ke channel log ──
  if (CONFIG.LOG_CHANNEL_ID) {
    const logChannel = client.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
    if (logChannel) {
      logChannel.send(
        `📋 **Whitelist baru**\n` +
        `👤 MC: \`${displayName}\` (${platform})\n` +
        `🏷️ Discord: <@${discordUserId}> (\`${discordUsername}\`)\n` +
        `🔑 Kode: \`${linkCode}\`\n` +
        `🎫 Tiket: ${message.channel}`
      );
    }
  }
});

// =====================================================
// ADMIN COMMANDS — hanya di channel #console-code
// =====================================================
client.on(Events.MessageCreate, async (message) => {
  // Hanya proses pesan dari manusia (bukan bot)
  if (message.author.bot) return;

  // Hanya proses di channel console-code
  if (!CONFIG.CONSOLE_CHANNEL_ID) return;
  if (message.channel.id !== CONFIG.CONSOLE_CHANNEL_ID) return;

  const content = message.content.trim();

  // ── !resetuser @mention ──
  if (content.startsWith("!resetuser")) {
    const mentionMatch = content.match(/<@!?(\d+)>/);
    if (!mentionMatch) {
      return message.reply("❌ Format: `!resetuser @mention`");
    }

    const targetId = mentionMatch[1];
    const processing = await message.reply(`⏳ Memproses reset untuk <@${targetId}>...`);

    try {
      // Ambil data player dulu untuk info
      const data = await supabaseRequest(
        "GET",
        `players?discord_id=eq.${targetId}&select=*`
      );

      if (data.length === 0) {
        return processing.edit(`⚠️ Data <@${targetId}> tidak ditemukan di database.`);
      }

      const player = data[0];
      const mcUsername = player.mc_username;
      const mcUuid = player.mc_uuid || null;
      const results = [];

      // ── 1. Unwhitelist dari MC via RCON ──
      try {
        const rconReset = new Rcon({
          host: CONFIG.RCON_HOST,
          port: CONFIG.RCON_PORT,
          password: CONFIG.RCON_PASSWORD,
        });
        await rconReset.connect();

        // Unwhitelist (bedrock pakai fwhitelist, java pakai whitelist)
        if (player.is_bedrock) {
          await rconReset.send(`fwhitelist remove ${mcUsername}`);
        } else {
          await rconReset.send(`whitelist remove ${mcUsername}`);
        }

        // Hapus variabel Skript linked dan linkcode
        if (mcUuid) {
          await rconReset.send(`skript eval delete {linked::${mcUuid}}`);
          await rconReset.send(`skript eval delete {player_discord::${mcUuid}}`);
        }
        await rconReset.send(`skript eval delete {linkcode::${mcUsername}}`);
        await rconReset.send(`skript eval delete {linkdiscord::${mcUsername}}`);

        await rconReset.end();
        results.push("✅ Unwhitelist MC");
        results.push("✅ Reset variabel Skript");
        console.log(`🔄 RCON reset selesai untuk ${mcUsername}`);
      } catch (rconErr) {
        results.push(`⚠️ RCON gagal: ${rconErr.message}`);
        console.error("⚠️ RCON reset gagal:", rconErr.message);
      }

      // ── 2. Hapus dari Supabase ──
      try {
        await supabaseRequest("DELETE", `players?discord_id=eq.${targetId}`);
        results.push("✅ Hapus data Supabase");
      } catch (dbErr) {
        results.push(`⚠️ Supabase gagal: ${dbErr.message}`);
      }

      // ── 3. Hapus dari link-log.txt via SFTP ──
      try {
        const { removed } = await removeFromLog(mcUsername);
        results.push(`✅ Hapus log (${removed.length} baris)`);
      } catch (sftpErr) {
        results.push(`⚠️ Log gagal: ${sftpErr.message}`);
      }

      await processing.edit(
        `🔄 **Reset selesai untuk <@${targetId}>!**\n` +
        `🎮 MC: \`${mcUsername}\`\n\n` +
        results.join("\n") + "\n\n" +
        `Player sekarang bisa daftar ulang via ticket.`
      );

      console.log(`🗑️ Full reset: Discord ${targetId} (${mcUsername}) oleh ${message.author.username}`);
    } catch (err) {
      console.error("❌ Gagal reset user:", err.message);
      processing.edit(`❌ Gagal reset: ${err.message}`);
    }
    return;
  }

  // ── !cekuser @mention ──
  if (content.startsWith("!cekuser")) {
    const mentionMatch = content.match(/<@!?(\d+)>/);
    if (!mentionMatch) {
      return message.reply("❌ Format: `!cekuser @mention`");
    }

    const targetId = mentionMatch[1];

    try {
      const data = await supabaseRequest(
        "GET",
        `players?discord_id=eq.${targetId}&select=*`
      );

      if (data.length === 0) {
        return message.reply(`⚠️ <@${targetId}> belum terdaftar di database.`);
      }

      const p = data[0];
      const platform = p.is_bedrock ? "📱 Bedrock" : "☕ Java";
      const linkedStatus = p.is_linked ? "✅ Sudah /link" : "❌ Belum /link";
      const registeredAt = new Date(p.registered_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
      const linkedAt = p.linked_at
        ? new Date(p.linked_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
        : "-";

      await message.reply(
        `📋 **Info Player**
` +
        `━━━━━━━━━━━━━━━━━━━━━━━
` +
        `👤 Discord: <@${targetId}> (\`${p.discord_username}\`)
` +
        `🎮 MC: \`${p.mc_username}\` (${platform})
` +
        `🔗 Status: ${linkedStatus}
` +
        `🔑 Kode: \`${p.link_code}\`
` +
        `📅 Daftar: ${registeredAt}
` +
        `📅 Linked: ${linkedAt}
` +
        `━━━━━━━━━━━━━━━━━━━━━━━`
      );
    } catch (err) {
      console.error("❌ Gagal cek user:", err.message);
      message.reply(`❌ Gagal ambil data: ${err.message}`);
    }
    return;
  }

  // ── !resetlog [username] ──
  if (content.startsWith("!resetlog")) {
    const parts = content.split(/\s+/);
    const targetUsername = parts[1];

    if (!targetUsername) {
      return message.reply("❌ Format: `!resetlog [mc_username]`\nContoh: `!resetlog kimhyunns`");
    }

    if (!CONFIG.SFTP_HOST || !CONFIG.SFTP_USER || !CONFIG.SFTP_PASS) {
      return message.reply("❌ SFTP belum dikonfigurasi. Tambahkan `SFTP_HOST`, `SFTP_USER`, dan `SFTP_PASS` di env Railway.");
    }

    const processing = await message.reply(`🔍 Mencari entri \`${targetUsername}\` di log...`);

    try {
      const { removed } = await removeFromLog(targetUsername);

      if (removed.length === 0) {
        return processing.edit(`⚠️ Tidak ada entri untuk \`${targetUsername}\` di log file.`);
      }

      await processing.edit(
        `✅ **${removed.length} baris** berhasil dihapus dari log!\n` +
        `👤 Username: \`${targetUsername}\`\n\n` +
        `📄 **Baris yang dihapus:**\n` +
        `\`\`\`\n${removed.join("\n")}\n\`\`\``
      );

      console.log(`🗑️ Log reset: ${targetUsername} (${removed.length} baris) oleh ${message.author.username}`);
    } catch (err) {
      console.error("❌ Gagal reset log:", err.message);
      await processing.edit(`❌ Gagal akses file log: \`${err.message}\``);
    }
    return;
  }

  // ── !help ──
  if (content === "!help") {
    await message.reply(
      `📖 **Admin Commands**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `\`!resetuser @mention\` — Hapus data player dari database (bisa daftar ulang)\n` +
      `\`!cekuser @mention\` — Lihat info lengkap player\n` +
      `\`!resetlog [mc_username]\` — Hapus entri username dari link-log.txt\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }
});

client.login(CONFIG.DISCORD_TOKEN);
