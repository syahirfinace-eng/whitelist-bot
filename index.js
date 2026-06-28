const { Client, GatewayIntentBits, Events } = require("discord.js");
const { Rcon } = require("rcon-client");

// =====================================================
// KONFIGURASI — isi via environment variable di Railway
// =====================================================
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,

  // Label field form Ticket Tool — harus SAMA PERSIS
  FORM_FIELD_PLATFORM: "Kamu menggunakan apa?",   // Java atau Bedrock
  FORM_FIELD_USERNAME: "Apa Username MC kamu?",

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
    "Prefer": method === "POST" ? "return=representation" : "",
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

  return res.json();
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

    if (embed.description) {
      const lines = embed.description.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        if (lineLower.includes(CONFIG.FORM_FIELD_PLATFORM.toLowerCase())) {
          platform = lines[i + 1]?.replace(/[*_`]/g, "").trim().toLowerCase();
        }
        if (lineLower.includes(CONFIG.FORM_FIELD_USERNAME.toLowerCase())) {
          username = lines[i + 1]?.replace(/[*_`]/g, "").trim();
        }
      }
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
// MAIN EVENT
// =====================================================
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot aktif sebagai ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  // Hanya proses pesan dari bot Ticket Tool
  if (!message.author.bot) return;
  if (!message.author.username.toLowerCase().includes("ticket")) return;
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

  // ── Proses whitelist ──
  await message.channel.send(
    `⏳ Sedang memproses whitelist untuk **${displayName}** (${platform})...`
  );

  const result = await whitelistPlayer(username, isBedrock);

  if (!result.success) {
    await message.channel.send(
      `❌ Gagal whitelist **${displayName}**. Mohon hubungi admin.\n` +
      `*(Error: ${result.error})*`
    );
    console.error(`❌ Whitelist gagal: ${displayName} — ${result.error}`);
    return;
  }

  // ── Generate kode unik ──
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
  } catch (err) {
    console.error("❌ Gagal generate/simpan kode:", err.message);
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
    `3️⃣ Aktivasi akun: \`/link ${linkCode}\`\n\n` +
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

client.login(CONFIG.DISCORD_TOKEN);
