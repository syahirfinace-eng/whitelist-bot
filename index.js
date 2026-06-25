const { Client, GatewayIntentBits, Events } = require("discord.js");
const { Rcon } = require("rcon-client");

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

// Fungsi whitelist via RCON
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

// Fungsi parse dari embed Ticket Tool
function parseFromEmbed(embeds) {
  let platform = null;
  let username = null;

  for (const embed of embeds) {
    // Cek di fields
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

    // Fallback: cek di description
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

  // Deteksi bedrock dari jawaban platform
  const isBedrock = platform?.includes("bedrock") ?? false;

  return { username, isBedrock };
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot aktif sebagai ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
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

  console.log(`🎮 Username: ${displayName} (${platform})`);

  await message.channel.send(
    `⏳ Sedang memproses whitelist untuk **${displayName}** (${platform})...`
  );

  const result = await whitelistPlayer(username, isBedrock);

  if (result.success) {
    await message.channel.send(
      `✅ **${displayName}** berhasil di-whitelist!\n` +
      `Kamu sekarang bisa join ke server Minecraft. Selamat bermain! 🎮`
    );
    console.log(`✅ Whitelist berhasil: ${displayName} — ${result.response}`);

    if (CONFIG.LOG_CHANNEL_ID) {
      const logChannel = client.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
      if (logChannel) {
        logChannel.send(
          `📋 **Whitelist baru:** \`${displayName}\` (${platform}) dari tiket ${message.channel}`
        );
      }
    }
  } else {
    await message.channel.send(
      `❌ Gagal whitelist **${displayName}**. Mohon hubungi admin.\n` +
      `*(Error: ${result.error})*`
    );
    console.error(`❌ Whitelist gagal: ${displayName} — ${result.error}`);
  }
});

client.login(CONFIG.DISCORD_TOKEN);
