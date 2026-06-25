const { Client, GatewayIntentBits, Events } = require("discord.js");
const { Rcon } = require("rcon-client");

// =====================================================
// KONFIGURASI — isi via environment variable di Railway
// =====================================================
const CONFIG = {
  // Discord
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,

  // Nama field form Ticket Tool untuk username MC
  // Harus SAMA PERSIS dengan label form di Ticket Tool kamu
  FORM_FIELD_USERNAME: "Apa Nama Username MC kamu",

  // RCON Minecraft
  RCON_HOST: process.env.RCON_HOST,       // IP server MC kamu
  RCON_PORT: parseInt(process.env.RCON_PORT) || 25575,
  RCON_PASSWORD: process.env.RCON_PASSWORD,

  // Channel log (opsional) — ID channel untuk notif whitelist berhasil
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
// Otomatis deteksi Bedrock player (username diawali titik)
async function whitelistPlayer(username) {
  const rcon = new Rcon({
    host: CONFIG.RCON_HOST,
    port: CONFIG.RCON_PORT,
    password: CONFIG.RCON_PASSWORD,
  });

  try {
    await rcon.connect();

    let command;
    if (username.startsWith(".")) {
      // Bedrock player — pakai Floodgate whitelist command
      command = `fwhitelist add ${username}`;
      console.log(`📱 Bedrock player terdeteksi: ${username}`);
    } else {
      // Java player — pakai whitelist biasa
      command = `whitelist add ${username}`;
      console.log(`☕ Java player terdeteksi: ${username}`);
    }

    const response = await rcon.send(command);
    await rcon.end();
    return { success: true, response };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Fungsi parse username dari embed Ticket Tool
function parseUsernameFromEmbed(embeds) {
  for (const embed of embeds) {
    if (!embed.fields) continue;
    for (const field of embed.fields) {
      if (
        field.name
          .toLowerCase()
          .includes(CONFIG.FORM_FIELD_USERNAME.toLowerCase())
      ) {
        return field.value?.trim() || null;
      }
    }

    // Beberapa versi Ticket Tool taruh di description bukan fields
    if (embed.description) {
      const lines = embed.description.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (
          lines[i]
            .toLowerCase()
            .includes(CONFIG.FORM_FIELD_USERNAME.toLowerCase())
        ) {
          // Username biasanya di baris berikutnya
          const val = lines[i + 1]?.replace(/[*_`]/g, "").trim();
          if (val) return val;
        }
      }
    }
  }
  return null;
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot aktif sebagai ${c.user.tag}`);
});

// Deteksi pesan baru di channel tiket
client.on(Events.MessageCreate, async (message) => {
  // Hanya proses pesan dari bot Ticket Tool
  if (!message.author.bot) return;
  if (!message.author.username.toLowerCase().includes("ticket")) return;

  // Harus ada embed (form submission dari Ticket Tool)
  if (!message.embeds || message.embeds.length === 0) return;

  // Coba parse username dari embed
  const username = parseUsernameFromEmbed(message.embeds);
  if (!username) return;

  console.log(`🎮 Username MC terdeteksi: ${username}`);

  // Deteksi platform untuk pesan konfirmasi
  const platform = username.startsWith(".") ? "📱 Bedrock" : "☕ Java";

  // Kirim konfirmasi dulu ke channel tiket
  await message.channel.send(
    `⏳ Sedang memproses whitelist untuk **${username}** (${platform})...`
  );

  // Jalankan whitelist via RCON
  const result = await whitelistPlayer(username);

  if (result.success) {
    await message.channel.send(
      `✅ **${username}** berhasil di-whitelist!\n` +
      `Kamu sekarang bisa join ke server Minecraft. Selamat bermain! 🎮`
    );

    console.log(`✅ Whitelist berhasil: ${username} — ${result.response}`);

    // Kirim log ke channel admin (jika dikonfigurasi)
    if (CONFIG.LOG_CHANNEL_ID) {
      const logChannel = client.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
      if (logChannel) {
        logChannel.send(
          `📋 **Whitelist baru:** \`${username}\` (${platform}) dari tiket ${message.channel}`
        );
      }
    }
  } else {
    await message.channel.send(
      `❌ Gagal whitelist **${username}**. Mohon hubungi admin.\n` +
      `*(Error: ${result.error})*`
    );
    console.error(`❌ Whitelist gagal: ${username} — ${result.error}`);
  }
});

client.login(CONFIG.DISCORD_TOKEN);
