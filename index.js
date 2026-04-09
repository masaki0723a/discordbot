cat << 'EOF' > index.js
require('dotenv').config();

const { Client, GatewayIntentBits, Events } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ],
});

client.once(Events.ClientReady, () => {
  console.log("起動:", client.user.tag);
});

client.login(process.env.TOKEN);
EOF
//onakin//