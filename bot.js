// ============================================
// ZEROPRICE DISCORD BOT - RAILWAY READY
// Version: 1.1.0 (Améliorations de robustesse et d'erreurs)
// ============================================

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

// ============================================
// CONFIGURATION
// ============================================

// NÉCESSITE L'ACTIVATION DE "Message Content Intent" DANS LE PORTAIL DEVELOPER
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Utilisez process.env pour les IDs des salons et le DraftBot
const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const API_KEY = process.env.API_KEY;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

// IDs configurés (Chargés depuis .env est FORTEMENT recommandé)
const DRAFTBOT_CHANNEL_ID = process.env.DRAFTBOT_CHANNEL_ID || '1437408466648961146';
const DRAFTBOT_ID = process.env.DRAFTBOT_ID || '318312854816161792';
const NOTIF_CHANNEL_ID = process.env.NOTIF_CHANNEL_ID || '1437408883906969630';


// ============================================
// COMMANDES SLASH
// ============================================

const commands = [
  // AJOUTER JEUX GRATUIT
  new SlashCommandBuilder()
    .setName('ajouter-jeu')
    .setDescription('Ajouter un jeu gratuit sur ZeroPrice')
    .addStringOption(opt => opt.setName('titre').setDescription('Nom du jeu').setRequired(true))
    .addStringOption(opt => opt.setName('image').setDescription('URL de l\'image').setRequired(true))
    .addStringOption(opt => opt.setName('lien').setDescription('Lien vers le jeu').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Description du jeu').setRequired(true))
    .addStringOption(opt => opt.setName('plateforme').setDescription('Plateforme')
      .addChoices(
        { name: 'PC', value: 'PC' },
        { name: 'PlayStation', value: 'PlayStation' },
        { name: 'Xbox', value: 'Xbox' },
        { name: 'Nintendo Switch', value: 'Switch' },
        { name: 'Mobile', value: 'Mobile' }
      ).setRequired(true))
    .addStringOption(opt => opt.setName('genre').setDescription('Genre du jeu')
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
    .addStringOption(opt => opt.setName('type').setDescription('Type de gratuité')
      .addChoices(
        { name: 'Gratuit Permanent', value: 'permanent' },
        { name: 'Gratuit Temporaire', value: 'temporaire' }
      ).setRequired(true))
    .addStringOption(opt => opt.setName('date-fin').setDescription('Date de fin (si temporaire, format: YYYY-MM-DD HH:mm)').setRequired(false)),

  // AJOUTER PROMOTION
  new SlashCommandBuilder()
    .setName('ajouter-promo')
    .setDescription('Ajouter une promotion')
    .addStringOption(opt => opt.setName('titre').setDescription('Nom du jeu').setRequired(true))
    .addStringOption(opt => opt.setName('image').setDescription('URL de l\'image').setRequired(true))
    .addStringOption(opt => opt.setName('lien').setDescription('Lien vers la promo').setRequired(true))
    .addStringOption(opt => opt.setName('store').setDescription('Plateforme de vente')
      .addChoices(
        { name: 'Steam', value: 'Steam' },
        { name: 'Epic Games', value: 'Epic' },
        { name: 'PlayStation Store', value: 'PlayStation' },
        { name: 'Xbox Store', value: 'Xbox' },
        { name: 'Nintendo eShop', value: 'Nintendo' },
        { name: 'GOG', value: 'GOG' }
      ).setRequired(true))
    .addNumberOption(opt => opt.setName('prix-original').setDescription('Prix original (€)').setRequired(true))
    .addNumberOption(opt => opt.setName('prix-promo').setDescription('Prix en promo (€)').setRequired(true))
    .addStringOption(opt => opt.setName('date-fin').setDescription('Date de fin (format: YYYY-MM-DD HH:mm)').setRequired(true)),

  // MODIFIER JEU
  new SlashCommandBuilder()
    .setName('modifier-jeu')
    .setDescription('Modifier un jeu existant')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID du jeu').setRequired(true))
    .addStringOption(opt => opt.setName('champ').setDescription('Champ à modifier')
      .addChoices(
        { name: 'Titre', value: 'titre' },
        { name: 'Description', value: 'description' },
        { name: 'Image', value: 'image' },
        { name: 'Lien', value: 'lien' },
        { name: 'Statut', value: 'statut' }
      ).setRequired(true))
    .addStringOption(opt => opt.setName('valeur').setDescription('Nouvelle valeur').setRequired(true)),

  // SUPPRIMER JEU
  new SlashCommandBuilder()
    .setName('supprimer-jeu')
    .setDescription('Supprimer un jeu')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID du jeu').setRequired(true)),

  // LISTE JEUX
  new SlashCommandBuilder()
    .setName('liste-jeux')
    .setDescription('Lister les derniers jeux ajoutés')
    .addIntegerOption(opt => opt.setName('limite').setDescription('Nombre de jeux (max 10)').setRequired(false)),

  // STATS
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Statistiques de la plateforme'),

  // TEST PARSER
  new SlashCommandBuilder()
    .setName('test-parser')
    .setDescription('Tester le parser DraftBot sur le dernier message')
];

// ============================================
// HANDLERS COMMANDES
// ============================================

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    switch(commandName) {
      case 'ajouter-jeu':
        await handleAddGame(interaction);
        break;
      case 'ajouter-promo':
        await handleAddPromo(interaction);
        break;
      case 'modifier-jeu':
        await handleEditGame(interaction);
        break;
      case 'supprimer-jeu':
        await handleDeleteGame(interaction);
        break;
      case 'liste-jeux':
        await handleListGames(interaction);
        break;
      case 'stats':
        await handleStats(interaction);
        break;
      case 'test-parser':
        await handleTestParser(interaction);
        break;
    }
  } catch (error) {
    console.error('❌ Erreur commande générale:', error.message);
    // Tente de récupérer un message d'erreur d'axios plus spécifique si possible
    const detailedError = error.response?.data?.error || error.message || 'Une erreur inconnue est survenue.';
    const reply = { content: `❌ Une erreur est survenue lors du traitement de la commande : ${detailedError}`, ephemeral: true };
    
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
        { name: '🏷️ ID', value: `#${response.data.data.id || 'N/A'}`, inline: true },
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
    const apiError = error.response?.data?.error || error.message || 'Erreur API inconnue';
    console.error('❌ Erreur API ajouter-jeu:', apiError);
    await interaction.editReply({ content: `❌ Erreur lors de l'ajout du jeu : \`${apiError}\``, ephemeral: true });
  }
}

async function handleAddPromo(interaction) {
  await interaction.deferReply();

  const promoData = {
    title: interaction.options.getString('titre'),
    image_url: interaction.options.getString('image'),
    promo_url: interaction.options.getString('lien'),
    store: interaction.options.getString('store'),
    original_price: interaction.options.getNumber('prix-original'),
    discount_price: interaction.options.getNumber('prix-promo'),
    end_date: interaction.options.getString('date-fin')
  };

  const discount = Math.round(((promoData.original_price - promoData.discount_price) / promoData.original_price) * 100);
  promoData.discount_percentage = discount;

  try {
    const response = await axios.post(`${API_URL}/promotions`, promoData, {
      headers: { 'X-API-Key': API_KEY }
    });

    const embed = new EmbedBuilder()
      .setColor('#f59e0b')
      .setTitle('✅ Promotion ajoutée !')
      .setThumbnail(promoData.image_url)
      .addFields(
        { name: '🎮 Jeu', value: promoData.title, inline: true },
        { name: '🏪 Store', value: promoData.store, inline: true },
        { name: '💰 Prix', value: `~~${promoData.original_price}€~~ → **${promoData.discount_price}€**`, inline: true },
        { name: '🔥 Réduction', value: `-${discount}%`, inline: true },
        { name: '⏰ Fin', value: promoData.end_date, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const apiError = error.response?.data?.error || error.message || 'Erreur API inconnue';
    console.error('❌ Erreur API ajouter-promo:', apiError);
    await interaction.editReply({ content: `❌ Erreur lors de l'ajout de la promotion : \`${apiError}\``, ephemeral: true });
  }
}

async function handleListGames(interaction) {
  await interaction.deferReply();

  const limit = interaction.options.getInteger('limite') || 5;
  try {
    const response = await axios.get(`${API_URL}/games?limit=${limit}`, {
      headers: { 'X-API-Key': API_KEY }
    });

    const games = response.data.data || response.data.games || response.data; // Adapter à la structure de réponse
    const embed = new EmbedBuilder()
      .setColor('#3b82f6')
      .setTitle(`📋 Derniers jeux ajoutés (${games.length})`)
      .setDescription(
        games.map(g => `**#${g.id}** - ${g.title} (${g.platform})`).join('\n')
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const apiError = error.response?.data?.error || error.message || 'Erreur API inconnue';
    console.error('❌ Erreur API liste-jeux:', apiError);
    await interaction.editReply({ content: `❌ Erreur lors de la récupération des jeux : \`${apiError}\``, ephemeral: true });
  }
}

async function handleStats(interaction) {
  await interaction.deferReply();

  try {
    const response = await axios.get(`${API_URL}/stats`, {
      headers: { 'X-API-Key': API_KEY }
    });

    const stats = response.data.data || response.data; // Adapter à la structure de réponse
    const embed = new EmbedBuilder()
      .setColor('#8b5cf6')
      .setTitle('📊 Statistiques ZeroPrice')
      .addFields(
        { name: '🎮 Jeux totaux', value: String(stats.total_games || 0), inline: true },
        { name: '🆓 Jeux gratuits actifs', value: String(stats.free_games || 0), inline: true },
        { name: '🔥 Promotions actives', value: String(stats.active_promos || 0), inline: true },
        { name: '👥 Utilisateurs inscrits', value: String(stats.total_users || 0), inline: true },
        { name: '⭐ Notes moyennes', value: String(stats.avg_rating || 'N/A'), inline: true },
        { name: '💬 Commentaires', value: String(stats.total_comments || 0), inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const apiError = error.response?.data?.error || error.message || 'Erreur API inconnue';
    console.error('❌ Erreur API stats:', apiError);
    await interaction.editReply({ content: `❌ Erreur lors de la récupération des stats : \`${apiError}\``, ephemeral: true });
  }
}

async function handleEditGame(interaction) {
  await interaction.reply({ content: '⚠️ Fonction en cours de développement', ephemeral: true });
}

async function handleDeleteGame(interaction) {
  await interaction.reply({ content: '⚠️ Fonction en cours de développement', ephemeral: true });
}

async function handleTestParser(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = client.channels.cache.get(DRAFTBOT_CHANNEL_ID);
  if (!channel) {
    return interaction.editReply('❌ Salon DraftBot introuvable');
  }

  try {
    const messages = await channel.messages.fetch({ limit: 20 });
    const draftbotMsg = messages.find(m => m.author.id === DRAFTBOT_ID);

    if (!draftbotMsg) {
      return interaction.editReply('❌ Aucun message DraftBot trouvé dans les 20 derniers messages');
    }

    const parsed = parseDraftBotMessage(draftbotMsg);

    if (!parsed) {
      return interaction.editReply('❌ Impossible de parser le message');
    }

    const embed = new EmbedBuilder()
      .setColor('#3b82f6')
      .setTitle('🧪 Résultat du Parser')
      .addFields(
        { name: '🎮 Titre', value: parsed.title, inline: false },
        { name: '🏪 Store', value: parsed.store, inline: true },
        { name: '💻 Plateforme', value: parsed.platform, inline: true },
        { name: '🎯 Genre', value: parsed.genre, inline: true },
        { name: '⏰ Gratuit jusqu\'au', value: parsed.free_until || 'Permanent', inline: false },
        { name: '📝 Description', value: (parsed.description?.slice(0, 200) || 'N/A') + (parsed.description && parsed.description.length > 200 ? '...' : ''), inline: false },
        { name: '🔗 URL', value: parsed.game_url || 'N/A', inline: false }
      )
      .setImage(parsed.image_url)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('❌ Erreur test-parser:', error);
    await interaction.editReply({ content: '❌ Erreur lors de l\'exécution du test-parser.', ephemeral: true });
  }
}

// ============================================
// AUTO-AJOUT DRAFTBOT
// ============================================

client.on('messageCreate', async message => {
  // Ignorer si ce n'est pas le salon configuré
  if (message.channel.id !== DRAFTBOT_CHANNEL_ID) return;
  
  // Ignorer si ce n'est pas DraftBot
  if (message.author.id !== DRAFTBOT_ID) return;

  console.log('📨 Message DraftBot détecté !');

  try {
    const gameData = parseDraftBotMessage(message);
    
    if (!gameData || !gameData.title) {
      console.log('⚠️ Impossible de parser le message ou titre manquant.');
      return;
    }

    console.log('🎯 Données parsées:', gameData.title);

    // Vérifier si le jeu existe déjà
    const checkResponse = await axios.get(`${API_URL}/games/check-exists`, {
      params: { title: gameData.title },
      headers: { 'X-API-Key': API_KEY }
    });

    if (checkResponse.data.exists) {
      console.log(`ℹ️ Jeu déjà existant: ${gameData.title}`);
      return;
    }

    // Ajouter le jeu automatiquement
    const response = await axios.post(`${API_URL}/games/auto-add`, gameData, {
      headers: { 'X-API-Key': API_KEY }
    });

    const addedGameId = response.data.data?.id || response.data.id || 'N/A';

    console.log(`✅ Jeu ajouté automatiquement: ${gameData.title} (ID: ${addedGameId})`);

    // Notification
    const notifChannel = client.channels.cache.get(NOTIF_CHANNEL_ID);
    if (notifChannel) {
      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle(`🆕 ${gameData.title}`)
        .setDescription(`Ajouté automatiquement depuis DraftBot`)
        .setImage(gameData.image_url)
        .addFields(
          { name: '🏪 Store', value: gameData.store, inline: true },
          { name: '💻 Plateforme', value: gameData.platform, inline: true },
          { name: '⏰ Jusqu\'au', value: gameData.free_until || 'N/A', inline: true }
        )
        .setFooter({ text: 'ZeroPrice - Auto-ajout' })
        .setTimestamp();

      await notifChannel.send({ embeds: [embed] });
    }

  } catch (error) {
    const apiError = error.response?.data?.error || error.message || 'Erreur API inconnue';
    console.error('❌ Erreur auto-ajout DraftBot:', apiError);
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
  if (content.includes('Epic Games Store') || content.includes('Epic Games')) {
    const titleMatch = content.match(/\*\*(.*?)\*\*/);
    if (titleMatch) {
      gameData.title = titleMatch[1].trim();
    }

    if (!gameData.title && embeds[0]?.title) {
      gameData.title = embeds[0].title
        .replace(/gratuit sur l'Epic Games Store !?/i, '')
        .trim();
    }

    const dateMatch = content.match(/jusqu'au (\d{2}\/\d{2}\/\d{4})/);
    if (dateMatch) {
      const [day, month, year] = dateMatch[1].split('/');
      gameData.free_until = `${year}-${month}-${day} 23:59:59`;
    } else {
      // Estimation (basé sur l'hypothèse de la gratuité d'une semaine d'EGS)
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7); 
      gameData.free_until = endDate.toISOString().slice(0, 19).replace('T', ' ');
      console.log(`⚠️ Date de fin estimée à +7 jours pour ${gameData.title}`);
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
    } else {
      // Estimation de 3 jours si la date n'est pas spécifiée (risque)
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 3);
      gameData.free_until = endDate.toISOString().slice(0, 19).replace('T', ' ');
      console.log(`⚠️ Date de fin estimée à +3 jours pour ${gameData.title}`);
    }
  }

  // GOG
  else if (content.includes('GOG')) {
    const titleMatch = content.match(/\*\*(.*?)\*\*/);
    if (titleMatch) {
      gameData.title = titleMatch[1].trim();
    }

    gameData.store = 'GOG';
    
    // Estimation de 2 jours (risque)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 2);
    gameData.free_until = endDate.toISOString().slice(0, 19).replace('T', ' ');
    console.log(`⚠️ Date de fin estimée à +2 jours pour ${gameData.title}`);
  }

  // EXTRAIRE DEPUIS EMBEDS
  if (embeds.length > 0) {
    const embed = embeds[0];

    if (embed.description) {
      // Supprimer les liens Markdown pour garder une description propre
      gameData.description = embed.description
        .replace(/\[.*?\]\(.*?\)/g, '') 
        .slice(0, 500);
    }

    if (embed.image?.url) {
      gameData.image_url = embed.image.url;
    } else if (embed.thumbnail?.url) {
      gameData.image_url = embed.thumbnail.url;
    }

    if (embed.url) {
      gameData.game_url = embed.url;
    }

    if (embed.fields) {
      embed.fields.forEach(field => {
        if (field.name.toLowerCase().includes('genre')) {
          gameData.genre = field.value;
        }
        if (field.name.toLowerCase().includes('plateforme')) {
          gameData.platform = field.value;
        }
      });
    }
  }

  // CHERCHER LIEN FINAL
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
  console.log(`✅ Bot ZeroPrice connecté : ${client.user.tag}`);
  console.log(`👂 Écoute du salon DraftBot: ${DRAFTBOT_CHANNEL_ID}`);
  console.log(`📢 Notifications dans: ${NOTIF_CHANNEL_ID}`);

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  
  try {
    console.log('🔄 Enregistrement des commandes slash...');
    // S'assurer que CLIENT_ID est défini
    if (CLIENT_ID) {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
      console.log('✅ Commandes slash enregistrées !');
    } else {
      console.error('❌ DISCORD_CLIENT_ID non défini. Les commandes slash ne seront pas enregistrées.');
    }
  } catch (error) {
    console.error('❌ Erreur enregistrement commandes:', error);
  }
});

// Gestion des erreurs
client.on('error', error => {
  console.error('❌ Erreur Discord:', error);
});

// Gère l'erreur "Used disallowed intents" si le paramètre n'est pas réglé sur Discord
process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

client.login(DISCORD_TOKEN);
