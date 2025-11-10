// ============================================
// ZEROPRICE DISCORD BOT - VERSION COMPLÈTE
// ============================================

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const API_URL = process.env.API_URL || 'https://zeroprice.alwaysdata.net/api.php';
const API_KEY = process.env.API_KEY;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

const DRAFTBOT_CHANNEL_ID = process.env.DRAFTBOT_CHANNEL_ID || '1437408466648961146';
const DRAFTBOT_ID = process.env.DRAFTBOT_ID || '318312854816161792';
const NOTIF_CHANNEL_ID = process.env.NOTIF_CHANNEL_ID || '1437408883906969630';

// ============================================
// COMMANDES SLASH
// ============================================

const commands = [
  // AJOUTER JEU
  new SlashCommandBuilder()
    .setName('ajouter')
    .setDescription('Ajouter un jeu gratuit')
    .addStringOption(opt => opt.setName('titre').setDescription('Nom du jeu').setRequired(true))
    .addStringOption(opt => opt.setName('image').setDescription('URL de l\'image').setRequired(true))
    .addStringOption(opt => opt.setName('lien').setDescription('Lien vers le jeu').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Description').setRequired(true))
    .addStringOption(opt => opt.setName('plateforme').setDescription('Plateforme')
      .addChoices(
        { name: 'PC', value: 'PC' },
        { name: 'PlayStation', value: 'PlayStation' },
        { name: 'Xbox', value: 'Xbox' },
        { name: 'Switch', value: 'Switch' },
        { name: 'Mobile', value: 'Mobile' },
        { name: 'Multi', value: 'Multi' }
      ).setRequired(true))
    .addStringOption(opt => opt.setName('genre').setDescription('Genre')
      .addChoices(
        { name: 'Action', value: 'Action' },
        { name: 'Aventure', value: 'Aventure' },
        { name: 'RPG', value: 'RPG' },
        { name: 'FPS', value: 'FPS' },
        { name: 'Battle Royale', value: 'Battle Royale' },
        { name: 'MOBA', value: 'MOBA' },
        { name: 'Sport', value: 'Sport' },
        { name: 'Stratégie', value: 'Stratégie' }
      ).setRequired(true))
    .addStringOption(opt => opt.setName('type').setDescription('Type')
      .addChoices(
        { name: 'Gratuit Permanent', value: 'permanent' },
        { name: 'Gratuit Temporaire', value: 'temporaire' }
      ).setRequired(true))
    .addStringOption(opt => opt.setName('date-fin').setDescription('Date fin (YYYY-MM-DD HH:mm)').setRequired(false)),

  // RETIRER JEU
  new SlashCommandBuilder()
    .setName('retirer')
    .setDescription('Retirer un jeu')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID du jeu').setRequired(true)),

  // LISTE JEUX
  new SlashCommandBuilder()
    .setName('liste')
    .setDescription('Liste des derniers jeux')
    .addIntegerOption(opt => opt.setName('limite').setDescription('Nombre (max 20)').setRequired(false)),

  // DONNER AVIS
  new SlashCommandBuilder()
    .setName('avis')
    .setDescription('Donner un avis sur un jeu')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID du jeu').setRequired(true))
    .addIntegerOption(opt => opt.setName('histoire').setDescription('Note Histoire (1-5)').setRequired(true))
    .addIntegerOption(opt => opt.setName('gameplay').setDescription('Note Gameplay (1-5)').setRequired(true))
    .addIntegerOption(opt => opt.setName('graphismes').setDescription('Note Graphismes (1-5)').setRequired(true))
    .addIntegerOption(opt => opt.setName('musique').setDescription('Note Musique (1-5)').setRequired(true))
    .addStringOption(opt => opt.setName('commentaire').setDescription('Commentaire (optionnel)').setRequired(false)),

  // STATS
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Statistiques de la plateforme')
];

// ============================================
// HANDLERS COMMANDES
// ============================================

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    switch(commandName) {
      case 'ajouter':
        await handleAddGame(interaction);
        break;
      case 'retirer':
        await handleDeleteGame(interaction);
        break;
      case 'liste':
        await handleListGames(interaction);
        break;
      case 'avis':
        await handleAddReview(interaction);
        break;
      case 'stats':
        await handleStats(interaction);
        break;
    }
  } catch (error) {
    console.error('❌ Erreur commande:', error.message);
    const detailedError = error.response?.data?.error || error.message;
    const reply = { content: `❌ Erreur: ${detailedError}`, ephemeral: true };
    
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

async function handleAddGame(interaction) {
  await interaction.deferReply();

  const gameData = {
    title: interaction.options.getString('titre'),
    image_url: interaction.options.getString('image'),
    game_url: interaction.options.getString('lien'),
    description: interaction.options.getString('description'),
    platform: interaction.options.getString('plateforme'),
    genre: interaction.options.getString('genre'),
    game_type: interaction.options.getString('type'),
    free_until: interaction.options.getString('date-fin') || null
  };
  
  try {
    const response = await axios.post(`${API_URL}/games`, gameData, {
      headers: { 'X-API-Key': API_KEY }
    });

    const embed = new EmbedBuilder()
      .setColor('#10b981')
      .setTitle('✅ Jeu ajouté avec succès !')
      .setThumbnail(gameData.image_url)
      .addFields(
        { name: '🎮 Titre', value: gameData.title, inline: true },
        { name: '🏷️ ID', value: `#${response.data.data.id}`, inline: true },
        { name: '💻 Plateforme', value: gameData.platform, inline: true },
        { name: '🎯 Genre', value: gameData.genre, inline: true },
        { name: '⚡ Type', value: gameData.game_type === 'permanent' ? 'Gratuit permanent' : 'Gratuit temporaire', inline: true }
      )
      .setFooter({ text: 'ZeroPrice - Gestion des jeux' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Notification
    const notifChannel = client.channels.cache.get(NOTIF_CHANNEL_ID);
    if (notifChannel) {
      const notifEmbed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle(`🆕 ${gameData.title}`)
        .setDescription(gameData.description)
        .setImage(gameData.image_url)
        .addFields(
          { name: '💻 Plateforme', value: gameData.platform, inline: true },
          { name: '🎯 Genre', value: gameData.genre, inline: true },
          { name: '🔗 Lien', value: `[Jouer maintenant](${gameData.game_url})` }
        )
        .setFooter({ text: 'Nouveau jeu gratuit disponible !' })
        .setTimestamp();

      await notifChannel.send({ embeds: [notifEmbed] });
    }
  } catch (error) {
    const apiError = error.response?.data?.error || error.message;
    console.error('❌ Erreur API:', apiError);
    await interaction.editReply({ content: `❌ Erreur: \`${apiError}\``, ephemeral: true });
  }
}

async function handleDeleteGame(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const gameId = interaction.options.getInteger('id');

  try {
    await axios.delete(`${API_URL}/games/${gameId}`, {
      headers: { 'X-API-Key': API_KEY }
    });

    const embed = new EmbedBuilder()
      .setColor('#ef4444')
      .setTitle('✅ Jeu supprimé')
      .setDescription(`Le jeu #${gameId} a été supprimé avec succès.`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const apiError = error.response?.data?.error || error.message;
    await interaction.editReply({ content: `❌ Erreur: \`${apiError}\`` });
  }
}

async function handleListGames(interaction) {
  await interaction.deferReply();

  const limit = Math.min(interaction.options.getInteger('limite') || 10, 20);
  
  try {
    const response = await axios.get(`${API_URL}/games?limit=${limit}`);
    const games = response.data.data || [];

    const embed = new EmbedBuilder()
      .setColor('#3b82f6')
      .setTitle(`📋 Derniers jeux ajoutés (${games.length})`)
      .setDescription(
        games.map(g => `**#${g.id}** - ${g.title} (${g.platform}) - ⭐ ${g.average_rating}`).join('\n')
      )
      .setFooter({ text: `Utilisez /avis [id] pour noter un jeu` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const apiError = error.response?.data?.error || error.message;
    await interaction.editReply({ content: `❌ Erreur: \`${apiError}\`` });
  }
}

async function handleAddReview(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const gameId = interaction.options.getInteger('id');
  const story = interaction.options.getInteger('histoire');
  const gameplay = interaction.options.getInteger('gameplay');
  const graphics = interaction.options.getInteger('graphismes');
  const soundtrack = interaction.options.getInteger('musique');
  const comment = interaction.options.getString('commentaire');

  // Validation
  if ([story, gameplay, graphics, soundtrack].some(v => v < 1 || v > 5)) {
    await interaction.editReply({ content: '❌ Les notes doivent être entre 1 et 5.' });
    return;
  }

  try {
    const ratingData = {
      game_id: gameId,
      user_id: interaction.user.id,
      story_rating: story,
      gameplay_rating: gameplay,
      graphics_rating: graphics,
      soundtrack_rating: soundtrack,
      review_text: comment || null
    };

    await axios.post(`${API_URL}/ratings`, ratingData, {
      headers: { 'X-API-Key': API_KEY }
    });

    const average = ((story + gameplay + graphics + soundtrack) / 4).toFixed(1);

    const embed = new EmbedBuilder()
      .setColor('#fbbf24')
      .setTitle('✅ Avis enregistré !')
      .addFields(
        { name: '📖 Histoire', value: `${story}⭐`, inline: true },
        { name: '🎮 Gameplay', value: `${gameplay}⭐`, inline: true },
        { name: '🎨 Graphismes', value: `${graphics}⭐`, inline: true },
        { name: '🎵 Musique', value: `${soundtrack}⭐`, inline: true },
        { name: '📊 Moyenne', value: `${average}/5` }
      )
      .setFooter({ text: 'Merci pour votre avis !' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const apiError = error.response?.data?.error || error.message;
    await interaction.editReply({ content: `❌ Erreur: \`${apiError}\`` });
  }
}

async function handleStats(interaction) {
  await interaction.deferReply();

  try {
    const response = await axios.get(`${API_URL}/stats`);
    const stats = response.data.data || {};

    const embed = new EmbedBuilder()
      .setColor('#8b5cf6')
      .setTitle('📊 Statistiques ZeroPrice')
      .addFields(
        { name: '🎮 Jeux totaux', value: String(stats.total_games || 0), inline: true },
        { name: '🆓 Jeux gratuits', value: String(stats.free_games || 0), inline: true },
        { name: '🔥 Promos actives', value: String(stats.active_promos || 0), inline: true },
        { name: '👥 Utilisateurs', value: String(stats.total_users || 0), inline: true },
        { name: '⭐ Note moyenne', value: String(stats.avg_rating || 'N/A'), inline: true },
        { name: '💬 Avis', value: String(stats.total_ratings || 0), inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const apiError = error.response?.data?.error || error.message;
    await interaction.editReply({ content: `❌ Erreur: \`${apiError}\`` });
  }
}

// ============================================
// AUTO-AJOUT DRAFTBOT
// ============================================

client.on('messageCreate', async message => {
  if (message.channel.id !== DRAFTBOT_CHANNEL_ID) return;
  if (message.author.id !== DRAFTBOT_ID) return;

  console.log('📨 Message DraftBot détecté !');

  try {
    const gameData = parseDraftBotMessage(message);
    
    if (!gameData || !gameData.title) {
      console.log('⚠️ Impossible de parser le message.');
      return;
    }

    console.log('🎯 Données parsées:', gameData.title);

    // Vérifier si le jeu existe
    const checkResponse = await axios.get(`${API_URL}/games/check-exists`, {
      params: { title: gameData.title },
      headers: { 'X-API-Key': API_KEY }
    });

    if (checkResponse.data.data.exists) {
      console.log(`ℹ️ Jeu déjà existant: ${gameData.title}`);
      return;
    }

    // Ajouter automatiquement
    const response = await axios.post(`${API_URL}/games/auto-add`, gameData, {
      headers: { 'X-API-Key': API_KEY }
    });

    const gameId = response.data.data?.id || 'N/A';
    console.log(`✅ Jeu ajouté: ${gameData.title} (ID: ${gameId})`);

    // Notification
    const notifChannel = client.channels.cache.get(NOTIF_CHANNEL_ID);
    if (notifChannel) {
      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle(`🆕 ${gameData.title}`)
        .setDescription(`Ajouté automatiquement depuis DraftBot`)
        .setImage(gameData.image_url)
        .addFields(
          { name: '🪟 Store', value: gameData.store, inline: true },
          { name: '💻 Plateforme', value: gameData.platform, inline: true },
          { name: '⏰ Jusqu\'au', value: gameData.free_until || 'N/A', inline: true }
        )
        .setFooter({ text: 'ZeroPrice - Auto-ajout' })
        .setTimestamp();

      await notifChannel.send({ embeds: [embed] });
    }

  } catch (error) {
    const apiError = error.response?.data?.error || error.message;
    console.error('❌ Erreur auto-ajout:', apiError);
  }
});

// ============================================
// PARSER DRAFTBOT
// ============================================

function parseDraftBotMessage(message) {
  const content = message.content;
  const embeds = message.embeds;

  let gameData = {
    title: null,
    description: null,
    image_url: null,
    game_url: null,
    platform: 'PC',
    genre: 'N/A',
    game_type: 'temporaire',
    store: 'Epic Games',
    free_until: null,
    source: 'draftbot'
  };

  // EPIC GAMES
  if (content.includes('Epic Games')) {
    const titleMatch = content.match(/\*\*(.*?)\*\*/);
    if (titleMatch) {
      gameData.title = titleMatch[1].trim();
    }

    if (!gameData.title && embeds[0]?.title) {
      gameData.title = embeds[0].title.replace(/gratuit sur l'Epic Games Store !?/i, '').trim();
    }

    const dateMatch = content.match(/jusqu'au (\d{2}\/\d{2}\/\d{4})/);
    if (dateMatch) {
      const [day, month, year] = dateMatch[1].split('/');
      gameData.free_until = `${year}-${month}-${day} 23:59:59`;
    } else {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      gameData.free_until = endDate.toISOString().slice(0, 19).replace('T', ' ');
    }

    gameData.store = 'Epic Games';
  }

  // STEAM
  else if (content.includes('Steam')) {
    const titleMatch = content.match(/\*\*(.*?)\*\*/);
    if (titleMatch) {
      gameData.title = titleMatch[1].trim();
    }

    gameData.store = 'Steam';
    
    if (content.includes('définitivement') || content.includes('permanent')) {
      gameData.game_type = 'permanent';
      gameData.free_until = null;
    }
  }

  // EXTRAIRE DEPUIS EMBEDS
  if (embeds.length > 0) {
    const embed = embeds[0];

    if (embed.description) {
      gameData.description = embed.description.replace(/\[.*?\]\(.*?\)/g, '').slice(0, 500);
    }

    if (embed.image?.url) {
      gameData.image_url = embed.image.url;
    } else if (embed.thumbnail?.url) {
      gameData.image_url = embed.thumbnail.url;
    }

    if (embed.url) {
      gameData.game_url = embed.url;
    }
  }

  // LIEN
  const linkMatch = content.match(/https?:\/\/[^\s)]+/);
  if (linkMatch && !gameData.game_url) {
    gameData.game_url = linkMatch[0];
  }

  if (!gameData.title) {
    return null;
  }

  return gameData;
}

// ============================================
// DÉMARRAGE
// ============================================

client.once('ready', async () => {
  console.log(`✅ Bot connecté: ${client.user.tag}`);
  console.log(`👂 Écoute DraftBot: ${DRAFTBOT_CHANNEL_ID}`);
  console.log(`📢 Notifications: ${NOTIF_CHANNEL_ID}`);

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  
  try {
    console.log('🔄 Enregistrement commandes...');
    if (CLIENT_ID) {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
      console.log('✅ Commandes enregistrées !');
    }
  } catch (error) {
    console.error('❌ Erreur commandes:', error);
  }
});

client.on('error', error => {
  console.error('❌ Erreur Discord:', error);
});

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled rejection:', error);
});

client.login(DISCORD_TOKEN);
