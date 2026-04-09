console.log("起動確認OK");
client.on("ready", () => {
  console.log("Discord接続OK");
});
client.on("voiceStateUpdate", (oldState, newState) => {
  console.log("VCイベント発火", oldState.channelId, "→", newState.channelId);
});
console.log("■■ 起動した ■■");
client.on("ready", () => {
  console.log("■■ Discord接続成功 ■■");
});

client.on("voiceStateUpdate", (oldState, newState) => {
  console.log("VC検知", oldState.channelId, "→", newState.channelId);
});

require('dotenv').config();
console.log("TOKEN:", process.env.TOKEN)

const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

/* =========================================================
   通知bot部分（そのまま）
========================================================= */

const messageOwnerMap = new Map();
const vcOwnerMap = new Map();

function getTimeRoleMention() {
  const hour = (new Date().getUTCHours() + 9) % 24;
  const r = config.timeRoles;

  if (hour < 5) return `<@&${r.lateNight}>`;
  if (hour < 8) return `<@&${r.earlyMorning}>`;
  if (hour < 12) return `<@&${r.morning}>`;
  if (hour < 18) return `<@&${r.afternoon}>`;
  return `<@&${r.evening}>`;
}

const VC_TYPES = {
  notify_chat: "🗨️ 雑談",
  notify_game: "🎮 ゲーム",
  notify_housework: "👜 家事作業",
  notify_move: "🚶 移動中",
  notify_drink: "🍺 晩酌",
  notify_karaoke: "🎤 カラオケ",
  notify_newbie: "🆕 新規さんと話したい",
  notify_other: "📌 その他",
};

const MESSAGE_MAP = {
  notify_chat: (name) =>
    `🗨️ **雑談**\n${name} さんが雑談部屋あけてます！\n今少し話せそうな方、一緒に雑談しませんか✨`,
  notify_game: (name) =>
    `🎮 **ゲーム**\n${name} さんがゲーム部屋あけました！\n一緒に遊べる方お待ちしてます🔥`,
  notify_housework: (name) =>
    `👜 **家事作業**\n${name} さんが家事しながら通話してます！\n一緒に作業しながら、少し話しませんか🙂`,
  notify_move: (name) =>
    `🚶 **移動中**\n${name} さんが移動中で少し時間あります！\n短めでも話せる方いたらぜひ⏰`,
  notify_drink: (name) =>
    `🍺 **晩酌**\n${name} さんが晩酌しながら上がってます！\n飲みつつ、ゆるく話しませんか😄`,
  notify_karaoke: (name) =>
    `🎤 **カラオケ**\n${name} さんがカラオケ部屋あけてます！\n歌うのも聴くのも大歓迎です🎶`,
  notify_newbie: (name) =>
    `🆕 **新規さん**\n${name} さんが新規さんと話したいVCを開きました。\n🌱 新しく参加された方がいます！\n一緒に話せる方、いかがでしょう😊`,
  notify_other: (name) =>
    `📌 **その他**\n${name} さんが目的別の部屋を立てました！\nタイミング合えば、ご一緒に👋`,
};

function createButtons() {
  const buttons = Object.entries(VC_TYPES).map(([id, label]) =>
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel(label.replace(/^[^ ]+ /, ""))
      .setStyle(ButtonStyle.Primary)
  );

  return [
    new ActionRowBuilder().addComponents(buttons.slice(0, 5)),
    new ActionRowBuilder().addComponents(buttons.slice(5)),
  ];
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await loadProfiles();
});

/* TempVC検知 */
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  console.log("入室?", oldState.channelId, "→", newState.channelId);
});
if (!newState.channelId) return;

  const member = newState.member;
  const vc = newState.channel;

  vcOwnerMap.set(vc.id, member.id);

  const notifyChannel = await client.channels.fetch(config.notifyChannelId).catch(() => null);
  if (!notifyChannel) return;

  const msg = await notifyChannel.send({
    content: `🔔 **VCの用途を選択してください**\n（${member.displayName} さん）`,
    components: createButtons(),
  });

  const timeoutId = setTimeout(async () => {
    messageOwnerMap.delete(msg.id);
    await msg.delete().catch(() => {});
  }, 3 * 60 * 1000);

  messageOwnerMap.set(msg.id, { ownerId: member.id, timeoutId });
;

/* VC削除 */
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (!oldState.channelId || newState.channelId) return;

  const ownerId = vcOwnerMap.get(oldState.channelId);
  if (oldState.member.id !== ownerId) return;

  const vc = oldState.guild.channels.cache.get(oldState.channelId);
  if (vc) await vc.delete().catch(() => {});
  vcOwnerMap.delete(oldState.channelId);
});

/* =========================================================
   こそプロ部分
========================================================= */

const profileCache = new Map();

async function loadProfiles() {
  const guild = client.guilds.cache.get(config.GUILD_ID);
  if (!guild) return;

  for (const channelId of config.PROFILE_CHANNEL_IDS || []) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;

    const messages = await channel.messages.fetch({ limit: 100 });
    messages.forEach(msg => {
      profileCache.set(msg.author.id, msg.content);
    });
  }

  console.log("プロフィールキャッシュ完了");
}

/* Slash登録 */
const commands = [
  new SlashCommandBuilder()
    .setName("dp")
    .setDescription("VC内メンバー全員のプロフィールを表示")
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        config.CLIENT_ID,
        config.GUILD_ID
      ),
      { body: commands }
    );
    console.log("Slash登録完了");
  } catch (err) {
    console.error(err);
  }
})();

/* プロフ更新監視 */
client.on(Events.MessageCreate, message => {
  if (!config.PROFILE_CHANNEL_IDS?.includes(message.channel.id)) return;
  profileCache.set(message.author.id, message.content);
});

client.on(Events.MessageUpdate, (_, newMessage) => {
  if (!newMessage.channel) return;
  if (!config.PROFILE_CHANNEL_IDS?.includes(newMessage.channel.id)) return;
  if (!newMessage.author) return;
  profileCache.set(newMessage.author.id, newMessage.content);
});

/* =========================================================
   Interaction統合処理
========================================================= */

client.on(Events.InteractionCreate, async (interaction) => {

  /* ==== Slash: dp ==== */
  if (interaction.isChatInputCommand() && interaction.commandName === "dp") {

  await interaction.deferReply({ ephemeral: true });

  const voiceChannel = interaction.member.voice.channel;

  if (!voiceChannel) {
    return interaction.editReply({ content: "VCに入ってから使用してください" });
  }

  const members = [...voiceChannel.members.values()];
  const embeds = [];

  const limitedMembers = members.slice(0, 10);

  for (const vcMember of limitedMembers) {

    const profileText =
      profileCache.get(vcMember.id) || "プロフィール未登録";

    const roles =
      vcMember.roles.cache
        .filter(r => r.name !== "@everyone")
        .map(r => r.name)
        .join(", ") || "ロールなし";

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({
        name: vcMember.displayName,
        iconURL: vcMember.displayAvatarURL()
      })
      .setDescription(
        `🆔 <@${vcMember.id}>\n\n📝 ${profileText}\n\n🎭ロール ${roles}`
      );

    embeds.push(embed);
  }

  if (members.length > 10) {
    embeds.push(
      new EmbedBuilder()
        .setColor(0xff5555)
        .setDescription(`⚠ VC人数が多いため、先頭10人のみ表示しています。`)
    );
  }

  return interaction.editReply({ embeds });
}

  /* ==== ボタン処理（既存通知機能） ==== */
  if (!interaction.isButton()) return;

  const data = messageOwnerMap.get(interaction.message.id);
  if (!data) {
    return interaction.reply({
      content: "⚠️ この操作は期限切れです",
      ephemeral: true,
    }).catch(() => {});
  }

  if (interaction.user.id !== data.ownerId) {
    return interaction.reply({
      content: "⚠️ この操作はVC作成者のみ可能です",
      ephemeral: true,
    }).catch(() => {});
  }

  const vc = interaction.member.voice.channel;
  if (!vc) {
    return interaction.reply({
      content: "⚠️ VCから退出したため操作できません",
      ephemeral: true,
    }).catch(() => {});
  }

  try {
    const label = VC_TYPES[interaction.customId];
    const messageFn = MESSAGE_MAP[interaction.customId];
    if (!label) throw new Error();

    await vc.setName(label);

    const notifyChannel = await client.channels.fetch(config.notifyChannelId);

    await notifyChannel.send({
      content: `${getTimeRoleMention()}\n${messageFn(interaction.member.displayName)}`,
    });

    clearTimeout(data.timeoutId);
    messageOwnerMap.delete(interaction.message.id);
    await interaction.message.delete().catch(() => {});
  } catch {
    clearTimeout(data.timeoutId);
    messageOwnerMap.delete(interaction.message.id);
    await interaction.message.delete().catch(() => {});
  }
});

/* ===== ログイン ===== */
client.login(process.env.TOKEN);

client.on("ready", async () => {
  const ch = await client.channels.fetch("1489472275098108055");
  ch.send("テスト送信");
});