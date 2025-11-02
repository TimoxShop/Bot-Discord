const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🚓 Bot Police Manager est en ligne !");
});

const server = app.listen(PORT, () => {
  console.log(`Serveur web demarre sur le port ${PORT}`);
});

// Auto-ping pour garder le bot actif
function keepAlive() {
  const http = require('http');
  
  setInterval(() => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/',
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      console.log(`✅ Keep-alive ping: ${res.statusCode}`);
    });
    
    req.on('error', (error) => {
      console.error('❌ Keep-alive error:', error.message);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
    });
    
    req.end();
  }, 5 * 60 * 1000); // Toutes les 5 minutes
}

// Démarrer le keep-alive après 30 secondes
setTimeout(() => {
  keepAlive();
  console.log('🔄 Système keep-alive activé');
}, 30000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Nouveau : nécessaire pour lire message.content
  ],
});

const DB_PATH = path.join(__dirname, "database.json");

let database = {
  agents: {},
  services: {},
  absences: [],
  // Stocke les infractions par guild : { [guildId]: { [userId]: [timestamp, ...] } }
  infractions: {},
  salaryConfig: {
    hourlyRate: 0,
    roleSalaries: {},
  },
  config: {
    absenceChannelConfirm: null,
    absenceRole: null,
    serviceVoiceChannels: [],
    logChannel: null,
    defaultRole: null,
    embedImage: "https://i.imgur.com/lQMZxSh.png",
    protectionChannel: null,
    protectionRole: null,
    protectionPingRole: null,
    transcriptChannel: null, // Nouveau: salon où seront envoyés les transcripts des agents
    whitelistDomains: [],
    whitelistChannels: [], // Nouveau : stocke les IDs des salons whitelistés
    gradeOrder: null,
  },
};

function loadDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, "utf8");
      database = JSON.parse(data);
      
      // S'assurer que les tableaux de whitelist existent
      if (!database.config.whitelistDomains) database.config.whitelistDomains = [];
      if (!database.config.whitelistChannels) database.config.whitelistChannels = [];
      if (!database.config.embedImage) {
        database.config.embedImage = "https://i.imgur.com/lQMZxSh.png";
      }
    } else {
      saveDatabase();
    }
  } catch (error) {
    console.error("Erreur lors du chargement de la base de donnees:", error);
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(database, null, 2));
  } catch (error) {
    console.error("Erreur lors de la sauvegarde de la base de donnees:", error);
  }
}

function calculateSalary(agent, member) {
  const services = database.services[agent.userId] || [];
  let totalHours = 0;
  let totalMinutes = 0;

  services.forEach((service) => {
    if (service.endTime) {
      const duration = service.endTime - service.startTime;
      const hours = Math.floor(duration / (1000 * 60 * 60));
      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
      totalHours += hours;
      totalMinutes += minutes;
    }
  });

  totalHours += Math.floor(totalMinutes / 60);
  totalMinutes = totalMinutes % 60;

  let fixedSalary = agent.fixedSalary || 7500000;
  if (member && database.salaryConfig.roleSalaries) {
    for (const [roleId, salary] of Object.entries(
      database.salaryConfig.roleSalaries,
    )) {
      if (member.roles.cache.has(roleId)) {
        fixedSalary = salary;
        break;
      }
    }
  }

  const hourlyRate = database.salaryConfig.hourlyRate || 0;
  const salaryPerService = hourlyRate * (totalHours + totalMinutes / 60);
  const totalSalary = fixedSalary + salaryPerService;

  return {
    totalHours,
    totalMinutes,
    serviceCount: services.filter((s) => s.endTime).length,
    fixedSalary,
    salaryPerService,
    totalSalary,
  };
}

function getMemberGrade(member) {
  const configuredOrder = database.config.gradeOrder || [];
  
  // Vérifier chaque grade dans l'ordre configuré
  for (const roleId of configuredOrder) {
    if (member.roles.cache.has(roleId)) {
      return `<@&${roleId}>`;
    }
  }

  // Fallback sur Agent si aucun grade trouvé
  return "Tes qui enfaite ?";
}

client.once("ready", () => {
  console.log(`✅ Bot connecte en tant que ${client.user.tag}`);
  console.log(`📊 Connecte a ${client.guilds.cache.size} serveur(s)`);
  loadDatabase();
  registerCommands();

  // Mettre la présence initiale puis lancer une mise à jour périodique
  updatePresence().catch(() => {});
  // actualiser toutes les 60 secondes (ajustable)
  setInterval(() => updatePresence().catch(() => {}), 60 * 1000);
});

// --- Ajout: fonction updatePresence pour éviter erreurs au démarrage ---
async function updatePresence() {
  try {
    if (!client.user) return;
    const totalAgents = Object.keys(database.agents || {}).length || 0;
    const serviceCount = Object.values(database.services || {}).reduce((acc, arr) => {
      return acc + (arr.filter(s => !s.endTime).length || 0);
    }, 0);
    const name = `${serviceCount} en service • ${totalAgents} agents`;
    await client.user.setPresence({
      activities: [{ name }],
      status: "online",
    });
  } catch (err) {
    console.error("Erreur updatePresence:", err);
  }
}

async function registerCommands() {
  const commands = [
    {
      name: "agents",
      description: "Gestion des agents",
      options: [
        {
          name: "ajouter",
          description: "Enregistrer un agent dans la base de donnees",
          type: 1,
          options: [
            {
              name: "utilisateur",
              description: "Utilisateur a enregistrer",
              type: 6,
              required: true,
            },
            {
              name: "matricule",
              description: "Matricule de l'agent (1-99)",
              type: 4,
              required: true,
              min_value: 1,
              max_value: 99,
            },
            {
              name: "unique_id",
              description: "ID unique en jeu (6 chiffres max)",
              type: 4,
              required: true,
              min_value: 1,
              max_value: 999999,
            },
            {
              name: "dossier_channel",
              description: "Channel du dossier agent",
              type: 7,
              required: true,
              channel_types: [0],
            },
          ],
        },
        {
          name: "retirer",
          description: "Retirer un agent de la base de donnees",
          type: 1,
          options: [
            {
              name: "utilisateur",
              description: "Utilisateur a retirer",
              type: 6,
              required: true,
            },
          ],
        },
        {
          name: "liste",
          description: "Affiche la liste des matricules disponibles",
          type: 1,
        },
      ],
    },
    {
      name: "rapport",
      description: "Generer un rapport d'heures de service d'un employe",
      options: [
        {
          name: "utilisateur",
          description: "Agent concerne",
          type: 6,
          required: false,
        },
      ],
    },
    {
      name: "abs-button",
      description: "Afficher un bouton pour ouvrir un formulaire d'absence",
      type: 1,
    },
    {
      name: "abs-channel-confirm",
      description:
        "Definir le salon ou envoyer les demandes d'absences a confirmer",
      options: [
        {
          name: "channel",
          description: "Salon de confirmation",
          type: 7,
          required: true,
          channel_types: [0],
        },
      ],
    },
    {
      name: "abs-role",
      description: "Definir le role ABS",
      options: [
        {
          name: "role",
          description: "Role pour les absences",
          type: 8,
          required: true,
        },
      ],
    },
    {
      name: "setup-voiceservice",
      description: "Configuration du systeme de prise de service vocal",
      options: [
        {
          name: "add-voicechannel",
          description:
            "Ajoute un channel vocal qui declenche une prise de service",
          type: 1,
          options: [
            {
              name: "channel",
              description: "Channel vocal",
              type: 7,
              required: true,
              channel_types: [2],
            },
          ],
        },
        {
          name: "remove-voicechannel",
          description:
            "Retire un channel vocal de la liste des prises de service",
          type: 1,
          options: [
            {
              name: "channel",
              description: "Channel vocal",
              type: 7,
              required: true,
              channel_types: [2],
            },
          ],
        },
        {
          name: "set-logchannel",
          description:
            "Definit le channel ou seront envoyes les logs des prises et fins de service",
          type: 1,
          options: [
            {
              name: "channel",
              description: "Channel de logs",
              type: 7,
              required: true,
              channel_types: [0],
            },
          ],
        },
        {
          name: "set-default-role",
          description:
            "Ajouter le role pour que les PDS soient prises en compte",
          type: 1,
          options: [
            {
              name: "role",
              description: "Role par defaut",
              type: 8,
              required: true,
            },
          ],
        },
        {
          name: "view",
          description:
            "Affiche la configuration actuelle des channels de service",
          type: 1,
        },
      ],
    },
    {
      name: "service",
      description: "Gestion des services",
      options: [
        {
          name: "en-cours",
          description: "Affiche la liste des agents actuellement en service",
          type: 1,
        },
        {
          name: "purge-vocal",
          description:
            "Cloture les services en cours des agents qui ne sont plus en vocal",
          type: 1,
        },
      ],
    },
    {
      name: "gestion-pds",
      description: "Gestion des prises de service",
      options: [
        {
          name: "view",
          description: "Affiche la liste des prises de service d'un agent",
          type: 1,
          options: [
            {
              name: "utilisateur",
              description: "Agent concerne",
              type: 6,
              required: true,
            },
          ],
        },
        {
          name: "delete",
          description: "Supprimer une prise de service precise via un ID",
          type: 1,
          options: [
            {
              name: "id",
              description: "ID de la prise de service",
              type: 3,
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "salary",
      description: "Gestion des salaires",
      options: [
        {
          name: "set-hours",
          description: "Definit le taux horaire",
          type: 1,
          options: [
            {
              name: "montant",
              description: "Montant par heure",
              type: 10,
              required: true,
            },
          ],
        },
        {
          name: "set-role",
          description: "Definit le salaire fixe en fonction d'un role",
          type: 1,
          options: [
            {
              name: "role",
              description: "Role",
              type: 8,
              required: true,
            },
            {
              name: "montant",
              description: "Salaire fixe",
              type: 10,
              required: true,
            },
          ],
        },
        {
          name: "view",
          description:
            "Affiche les salaires associes aux roles et le taux horaire",
          type: 1,
        },
        {
          name: "remove",
          description: "Supprime un salaire a partir de son ID",
          type: 1,
          options: [
            {
              name: "role",
              description: "Role du salaire a supprimer",
              type: 8,
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "rewardsanctions",
      description: "Gestion des recompenses et sanctions",
      options: [
        {
          name: "ajouter",
          description: "Ajouter une recompense ou une sanction a un agent",
          type: 1,
          options: [
            {
              name: "utilisateur",
              description: "Agent concerne",
              type: 6,
              required: true,
            },
            {
              name: "type",
              description: "Type",
              type: 3,
              required: true,
              choices: [
                { name: "Recompense", value: "reward" },
                { name: "Sanction", value: "sanction" },
              ],
            },
            {
              name: "description",
              description: "Description",
              type: 3,
              required: true,
            },
          ],
        },
        {
          name: "retirer",
          description: "Retirer une recompense ou une sanction d'un agent",
          type: 1,
          options: [
            {
              name: "utilisateur",
              description: "Agent concerne",
              type: 6,
              required: true,
            },
            {
              name: "id",
              description: "ID de la recompense/sanction",
              type: 3,
              required: true,
            },
          ],
        },
        {
          name: "voir",
          description: "Voir les recompenses et sanctions d'un agent",
          type: 1,
          options: [
            {
              name: "utilisateur",
              description: "Agent concerne",
              type: 6,
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "rapport-temporaire",
      description:
        "Envoyer un embed permettant aux agents de visualiser leur rapport temporaire",
    },
    {
      name: "rapport-auto",
      description:
        "Genere et envoie automatiquement les rapports de tous les agents",
    },
    {
      name: "top-agents",
      description: "Affiche le top 5 des agents les plus actifs de la semaine",
    },
    {
      name: "reset-services",
      description: "Reinitialiser la base de donnees des services",
    },
    {
      name: "config",
      description: "Configuration du bot",
      options: [
        {
          name: "set-image",
          description: "Definir l'image des embeds",
          type: 1,
          options: [
            {
              name: "url",
              description: "URL de l'image (imgur, discord cdn, etc.)",
              type: 3,
              required: true,
            },
          ],
        },
        {
          name: "set-grades-1-20",
          description: "Définir les grades 1 à 20 (du plus haut au plus bas)",
          type: 1,
          options: [
            { name: "grade1", description: "Grade 1", type: 8, required: true },
            { name: "grade2", description: "Grade 2", type: 8, required: false },
            { name: "grade3", description: "Grade 3", type: 8, required: false },
            { name: "grade4", description: "Grade 4", type: 8, required: false },
            { name: "grade5", description: "Grade 5", type: 8, required: false },
            { name: "grade6", description: "Grade 6", type: 8, required: false },
            { name: "grade7", description: "Grade 7", type: 8, required: false },
            { name: "grade8", description: "Grade 8", type: 8, required: false },
            { name: "grade9", description: "Grade 9", type: 8, required: false },
            { name: "grade10", description: "Grade 10", type: 8, required: false },
            { name: "grade11", description: "Grade 11", type: 8, required: false },
            { name: "grade12", description: "Grade 12", type: 8, required: false },
            { name: "grade13", description: "Grade 13", type: 8, required: false },
            { name: "grade14", description: "Grade 14", type: 8, required: false },
            { name: "grade15", description: "Grade 15", type: 8, required: false },
            { name: "grade16", description: "Grade 16", type: 8, required: false },
            { name: "grade17", description: "Grade 17", type: 8, required: false },
            { name: "grade18", description: "Grade 18", type: 8, required: false },
            { name: "grade19", description: "Grade 19", type: 8, required: false },
            { name: "grade20", description: "Grade 20", type: 8, required: false },
          ],
        },
        {
          name: "view-grades",
          description: "Afficher l'ordre actuel des grades",
          type: 1,
        },
      ],
    },
    {
      name: "role_antifraude_ping",
      description: "Definir le rôle à ping pour les notifications anti-fraudes",
      options: [
        {
          name: "role",
          description: "Rôle à ping",
          type: 8,
          required: true,
        },
      ],
    },
    {
      name: "protection",
      description: "Configuration Protection Anti-Fraudes",
      options: [
        {
          name: "set-channel",
          description: "Definir le salon de notification anti-fraudes",
          type: 1,
          options: [
            {
              name: "channel",
              description: "Salon où envoyer les notifications anti-fraudes",
              type: 7,
              required: true,
              channel_types: [0],
            },
          ],
        },
        {
          name: "set-role",
          description: "Definir le role a surveiller pour la protection",
          type: 1,
          options: [
            {
              name: "role",
              description: "Role à surveiller (LSPD)",
              type: 8,
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "whitelist",
      description: "Gérer la whitelist de domaines",
      options: [
        {
          name: "add",
          description: "Ajouter un domaine à la whitelist",
          type: 1,
          options: [
            {
              name: "domaine",
              description: "Ex: example.com",
              type: 3,
              required: true,
            },
          ],
        },
        {
          name: "remove",
          description: "Retirer un domaine de la whitelist",
          type: 1,
          options: [
            {
              name: "domaine",
              description: "Ex: example.com",
              type: 3,
              required: true,
            },
          ],
        },
        {
          name: "list",
          description: "Afficher les domaines whitelistés",
          type: 1,
        },
      ],
    },
    {
      name: "transcript",
      description:
        "Configurer le salon de transcript / logger manuellement un agent",
      options: [
        {
          name: "set-channel",
          description: "Définir le salon de transcript",
          type: 1,
          options: [
            {
              name: "channel",
              description: "Salon pour les transcripts",
              type: 7,
              required: true,
              channel_types: [0],
            },
          ],
        },
        {
          name: "log",
          description:
            "Enregistrer manuellement un agent avec raison obligatoire",
          type: 1,
          options: [
            {
              name: "utilisateur",
              description: "Agent concerné",
              type: 6,
              required: true,
            },
            {
              name: "raison",
              description: "Raison (licenciement, démission, etc.)",
              type: 3,
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "setup_channel_rapport_temporaire",
      description: "Configurer un salon avec bouton pour les rapports temporaires",
      options: [
        {
          name: "channel",
          description: "Salon où envoyer l'embed avec le bouton",
          type: 7,
          required: true,
          channel_types: [0],
        }
      ]
    },
    {
      name: "channel_whitelist",
      description: "Gérer la whitelist des salons pour les liens",
      options: [
        {
          name: "add",
          description: "Ajouter un salon à la whitelist",
          type: 1,
          options: [
            {
              name: "channel",
              description: "Salon à whitelister",
              type: 7,
              required: true,
              channel_types: [0],
            },
          ],
        },
        {
          name: "remove",
          description: "Retirer un salon de la whitelist",
          type: 1,
          options: [
            {
              name: "channel",
              description: "Salon à retirer",
              type: 7,
              required: true,
              channel_types: [0],
            },
          ],
        },
        {
          name: "list",
          description: "Voir la liste des salons whitelistés",
          type: 1,
        },
      ],
    },
  ];

  try {
    console.log("📝 Enregistrement des commandes...");
    await client.application.commands.set(commands);
    console.log("✅ Commandes enregistrees avec succes");
  } catch (error) {
    console.error("❌ Erreur lors de l'enregistrement des commandes:", error);
  }
}

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleCommand(interaction);
  } else if (interaction.isButton()) {
    await handleButton(interaction);
  } else if (interaction.isModalSubmit()) {
    await handleModal(interaction);
  }
});

async function handleCommand(interaction) {
  const { commandName, options } = interaction;

  try {
    if (commandName === "setup_channel_rapport_temporaire") {
      const channel = options.getChannel("channel");
      
      const embed = new EmbedBuilder()
        .setTitle("📊 Rapports Temporaires")
        .setDescription("Cliquez sur le bouton ci-dessous pour voir votre rapport temporaire d'heures et salaire.")
        .setColor(0x3498db)
        .setThumbnail(database.config.embedImage);

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("voir_rapport_temporaire")
            .setLabel("Voir mon rapport")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📋")
        );

      await channel.send({ embeds: [embed], components: [row] });
      
      await interaction.reply({
        content: `✅ Le bouton de rapport temporaire a été installé dans ${channel}`,
        ephemeral: true
      });
      
      return;
    }

    // Handler /transcript
    if (commandName === "transcript") {
      const sub = options.getSubcommand();
      if (sub === "set-channel") {
        const channel = options.getChannel("channel");
        if (!channel)
          return interaction.reply({
            content: "❌ Salon invalide",
            ephemeral: true,
          });
        database.config.transcriptChannel = channel.id;
        saveDatabase();
        return interaction.reply({
          content: `✅ Salon de transcript défini sur ${channel}`,
          ephemeral: true,
        });
      }

      if (sub === "log") {
        const user = options.getUser("utilisateur");
        const raison = options.getString("raison");
        const tcId = database.config.transcriptChannel;
        if (!tcId) {
          return interaction.reply({
            content:
              "❌ Aucun salon de transcript défini. Utilisez /transcript set-channel.",
            ephemeral: true,
          });
        }
        const tc = await client.channels.fetch(tcId).catch(() => null);
        if (!tc)
          return interaction.reply({
            content: "❌ Impossible de récupérer le salon de transcript.",
            ephemeral: true,
          });

        // Construire embed de transcript
        const agent = database.agents[user.id];
        const embed = new EmbedBuilder()
          .setTitle("📝 Transcript — Enregistrement manuel")
          .setColor(0x3498db)
          .addFields(
            {
              name: "Agent",
              value: `${user.tag} (<@${user.id}>)`,
              inline: false,
            },
            { name: "Raison", value: raison, inline: false },
            {
              name: "Enregistré par",
              value: `<@${interaction.user.id}>`,
              inline: true,
            },
            {
              name: "Date",
              value: new Date().toLocaleString("fr-FR"),
              inline: true,
            },
          )
          .setTimestamp();

        if (agent) {
          embed.addFields(
            {
              name: "Matricule",
              value: String(agent.matricule || "N/A"),
              inline: true,
            },
            {
              name: "ID Unique",
              value: String(agent.uniqueId || "N/A"),
              inline: true,
            },
            {
              name: "Dossier",
              value: agent.dossierChannelId
                ? `<#${agent.dossierChannelId}>`
                : "N/A",
              inline: false,
            },
          );
        }

        await tc.send({ embeds: [embed] }).catch(() => {});
        return interaction.reply({
          content: "✅ Transcript enregistré.",
          ephemeral: true,
        });
      }
    }

    if (commandName === "agents") {
      const subcommand = options.getSubcommand();

      if (subcommand === "ajouter") {
        const user = options.getUser("utilisateur");
        const matricule = options.getInteger("matricule");
        const uniqueId = options.getInteger("unique_id");
        const dossierChannel = options.getChannel("dossier_channel");

        const existingAgent = Object.values(database.agents).find(
          (a) => a.matricule === matricule,
        );
        if (existingAgent) {
          return interaction.reply({
            content: `❌ Le matricule ${matricule} est deja utilise par <@${existingAgent.userId}>`,
            ephemeral: true,
          });
        }

        database.agents[user.id] = {
          userId: user.id,
          username: user.username,
          matricule,
          uniqueId,
          dossierChannelId: dossierChannel.id,
          addedAt: Date.now(),
          fixedSalary: 7500000,
          salaryPerHour: 0,
          rewardsAndSanctions: [],
        };

        saveDatabase();

        const embed = new EmbedBuilder()
          .setTitle("✅ Ajout d'un nouvel agent dans la base de donnee")
          .setColor(0x00ff00)
          .addFields(
            { name: "Agent :", value: `➜ ${user}`, inline: false },
            { name: "Matricule :", value: `➜ ${matricule}`, inline: false },
            { name: "ID Unique :", value: `➜ ${uniqueId}`, inline: false },
            { name: "Dossier :", value: `➜ ${dossierChannel}`, inline: false },
          )
          .setFooter({ text: `Agent ajoute par: ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Si salon transcript configuré => envoyer un transcript automatique
        try {
          const tcId = database.config.transcriptChannel;
          if (tcId) {
            const tc = await client.channels.fetch(tcId).catch(() => null);
            if (tc) {
              const tEmbed = new EmbedBuilder()
                .setTitle("📝 Transcript — Nouvel agent")
                .setColor(0x00ff00)
                .addFields(
                  {
                    name: "Agent",
                    value: `${user.tag} (<@${user.id}>)`,
                    inline: false,
                  },
                  { name: "Matricule", value: String(matricule), inline: true },
                  { name: "ID Unique", value: String(uniqueId), inline: true },
                  {
                    name: "Dossier",
                    value: `<#${dossierChannel.id}>`,
                    inline: false,
                  },
                  {
                    name: "Ajouté par",
                    value: `<@${interaction.user.id}>`,
                    inline: true,
                  },
                  {
                    name: "Date",
                    value: new Date().toLocaleString("fr-FR"),
                    inline: true,
                  },
                )
                .setTimestamp();
              await tc.send({ embeds: [tEmbed] }).catch(() => {});
            }
          }
        } catch (e) {
          console.error("Erreur en envoyant le transcript automatique:", e);
        }

        // Ajouter automatiquement le salon à la whitelist
        if (!database.config.whitelistChannels) database.config.whitelistChannels = [];
        if (!database.config.whitelistChannels.includes(dossierChannel.id)) {
          database.config.whitelistChannels.push(dossierChannel.id);
          saveDatabase();
        }

        return;
      } else if (subcommand === "retirer") {
        const user = options.getUser("utilisateur");

        if (!database.agents[user.id]) {
          return interaction.reply({
            content: "❌ Cet agent n'est pas dans la base de donnees",
            ephemeral: true,
          });
        }

        const agent = database.agents[user.id];
        delete database.agents[user.id];
        delete database.services[user.id];

        saveDatabase();

        const embed = new EmbedBuilder()
          .setTitle("🗑️ Retrait d'un agent de la base de donnee")
          .setColor(0xff0000)
          .addFields(
            { name: "Agent :", value: `➜ ${user}`, inline: false },
            {
              name: "Matricule :",
              value: `➜ ${agent.matricule}`,
              inline: false,
            },
            {
              name: "ID Unique :",
              value: `➜ ${agent.uniqueId}`,
              inline: false,
            },
          )
          .setFooter({ text: `Agent retire par: ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else if (subcommand === "liste") {
        const embed = new EmbedBuilder()
          .setTitle("📋 Liste des Agents")
          .setColor(0x3498db)
          .setThumbnail(database.config.embedImage);

        let description = "";
        for (let i = 1; i <= 99; i++) {
          const agent = Object.values(database.agents).find(
            (a) => a.matricule === i
          );
          if (agent) {
            description += `👮 [${String(i).padStart(2, "0")}] - <@${agent.userId}>\n`;
          } else {
            description += `✅ [${String(i).padStart(2, "0")}] - Disponible\n`;
          }
        }

        embed.setDescription(description);
        await interaction.reply({ embeds: [embed] });
      }
    } else if (commandName === "rapport") {
      const targetUser = options.getUser("utilisateur") || interaction.user;

      if (!database.agents[targetUser.id]) {
        return interaction.reply({
          content: "❌ Cet agent n'est pas dans la base de donnees",
          ephemeral: true,
        });
      }

      const agent = database.agents[targetUser.id];
      const member = await interaction.guild.members.fetch(targetUser.id);
      const grade = getMemberGrade(member);
      const stats = calculateSalary(agent, member);

      const rewardsText =
        agent.rewardsAndSanctions
          ?.filter((r) => r.type === "reward")
          .map((r) => `🏅 ${r.description}`)
          .join("\n") || "";
      const sanctionsText =
        agent.rewardsAndSanctions
          ?.filter((r) => r.type === "sanction")
          .map((r) => `⚠️ ${r.description}`)
          .join("\n") || "";
      const rewardSanctionText =
        rewardsText + (sanctionsText ? "\n" + sanctionsText : "") ||
        "Aucune recompense ou sanction enregistree.";

      const embed = new EmbedBuilder()
        .setTitle("📊 Rapport d'heures de service")
        .setColor(0x3498db)
        .setThumbnail(database.config.embedImage)
        .addFields(
          {
            name: "📛 Nom :",
            value: `${agent.username} (${targetUser})`,
            inline: false,
          },
          {
            name: "────────────────────────────────────────────────",
            value: "\u200B",
            inline: false,
          },
          { name: "👮 Grade :", value: grade, inline: true },
          {
            name: "⏱️ Heures de service :",
            value: `${stats.totalHours}h ${stats.totalMinutes}m`,
            inline: true,
          },
          {
            name: "📅 Prises de service :",
            value: `${stats.serviceCount}`,
            inline: true,
          },
          {
            name: "💰 Salaire Fixe :",
            value: `${stats.fixedSalary.toLocaleString("fr-FR")} $`,
            inline: true,
          },
          {
            name: "💵 Salaire Heure de Service :",
            value: `${stats.salaryPerService.toLocaleString("fr-FR")} $`,
            inline: true,
          },
          {
            name: "💸 Salaire total :",
            value: `${stats.totalSalary.toLocaleString("fr-FR")} $`,
            inline: true,
          },
          {
            name: "🏅 Medailles & Sanctions :",
            value: rewardSanctionText,
            inline: false,
          },
        )
        .setFooter({ text: "Police Manager" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "rapport-temporaire") {
      // Envoie un embed temporaire (privé) pour l'utilisateur courant
      const targetUser = interaction.user;
      if (!database.agents[targetUser.id]) {
        return interaction.reply({
          content: "❌ Cet agent n'est pas dans la base de donnees",
          ephemeral: true,
        });
      }

      const agent = database.agents[targetUser.id];
      const member = await interaction.guild.members
        .fetch(targetUser.id)
        .catch(() => null);
      const grade = member ? getMemberGrade(member) : "Agent";
      const stats = calculateSalary(agent, member);

      const rewardsText =
        agent.rewardsAndSanctions
          ?.filter((r) => r.type === "reward")
          .map((r) => `🏅 ${r.description}`)
          .join("\n") || "";
      const sanctionsText =
        agent.rewardsAndSanctions
          ?.filter((r) => r.type === "sanction")
          .map((r) => `⚠️ ${r.description}`)
          .join("\n") || "";
      const rewardSanctionText =
        rewardsText + (sanctionsText ? "\n" + sanctionsText : "") ||
        "Aucune recompense ou sanction enregistree.";

      const embed = new EmbedBuilder()
        .setTitle("📊 Rapport temporaire")
        .setColor(0x3498db)
        .setThumbnail(database.config.embedImage)
        .addFields(
          {
            name: "📛 Nom :",
            value: `${agent.username} (${targetUser})`,
            inline: false,
          },
          {
            name: "────────────────────────────────────────────────",
            value: "\u200B",
            inline: false,
          },
          { name: "👮 Grade :", value: grade, inline: true },
          {
            name: "⏱️ Heures de service :",
            value: `${stats.totalHours}h ${stats.totalMinutes}m`,
            inline: true,
          },
          {
            name: "📅 Prises de service :",
            value: `${stats.serviceCount}`,
            inline: true,
          },
          {
            name: "💰 Salaire Fixe :",
            value: `${stats.fixedSalary.toLocaleString("fr-FR")} $`,
            inline: true,
          },
          {
            name: "💵 Salaire Heure de Service :",
            value: `${stats.salaryPerService.toLocaleString("fr-FR")} $`,
            inline: true,
          },
          {
            name: "💸 Salaire total :",
            value: `${stats.totalSalary.toLocaleString("fr-FR")} $`,
            inline: true,
          },
          {
            name: "🏅 Medailles & Sanctions :",
            value: rewardSanctionText,
            inline: false,
          },
        )
        .setFooter({ text: "Police Manager" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (commandName === "rapport-auto") {
      // Envoie chaque rapport dans le dossier (channel) de l'agent si possible,
      // sinon retombe sur le salon de logs si configuré.
      await interaction.reply({
        content:
          "✅ Lancement de l'envoi des rapports vers les dossiers des agents...",
        ephemeral: true,
      });

      const defaultLogChannelId = database.config.logChannel || null;
      for (const agent of Object.values(database.agents)) {
        try {
          const member = await interaction.guild.members
            .fetch(agent.userId)
            .catch(() => null);
          const grade = member ? getMemberGrade(member) : "Agent";
          const stats = calculateSalary(agent, member);

          const rewardsText =
            agent.rewardsAndSanctions
              ?.filter((r) => r.type === "reward")
              .map((r) => `🏅 ${r.description}`)
              .join("\n") || "";
          const sanctionsText =
            agent.rewardsAndSanctions
              ?.filter((r) => r.type === "sanction")
              .map((r) => `⚠️ ${r.description}`)
              .join("\n") || "";
          const rewardSanctionText =
            rewardsText + (sanctionsText ? "\n" + sanctionsText : "") ||
            "Aucune recompense ou sanction enregistree.";

          const embed = new EmbedBuilder()
            .setTitle(`📊 Rapport — ${agent.username}`)
            .setColor(0x3498db)
            .setThumbnail(database.config.embedImage)
            .addFields(
              {
                name: "📛 Nom :",
                value: `${agent.username} (<@${agent.userId}>)`,
                inline: false,
              },
              {
                name: "────────────────────────────────────────────────",
                value: "\u200B",
                inline: false,
              },
              { name: "👮 Grade :", value: grade, inline: true },
              {
                name: "⏱️ Heures de service :",
                value: `${stats.totalHours}h ${stats.totalMinutes}m`,
                inline: true,
              },
              {
                name: "📅 Prises de service :",
                value: `${stats.serviceCount}`,
                inline: true,
              },
              {
                name: "💰 Salaire Fixe :",
                value: `${stats.fixedSalary.toLocaleString("fr-FR")} $`,
                inline: true,
              },
              {
                name: "💵 Salaire Heure de Service :",
                value: `${stats.salaryPerService.toLocaleString("fr-FR")} $`,
                inline: true,
              },
              {
                name: "💸 Salaire total :",
                value: `${stats.totalSalary.toLocaleString("fr-FR")} $`,
                inline: true,
              },
              {
                name: "🏅 Medailles & Sanctions :",
                value: rewardSanctionText,
                inline: false,
              },
            )
            .setFooter({ text: "Police Manager" })
            .setTimestamp();

          // Priorité : dossier de l'agent
          if (agent.dossierChannelId) {
            const dossierChannel = await client.channels
              .fetch(agent.dossierChannelId)
              .catch(() => null);
            if (dossierChannel) {
              await dossierChannel.send({ embeds: [embed] }).catch(() => {});
              continue;
            }
          }

          // Sinon, fallback sur salon de logs si configuré
          if (defaultLogChannelId) {
            const logChannel = await client.channels
              .fetch(defaultLogChannelId)
              .catch(() => null);
            if (logChannel) {
              await logChannel.send({ embeds: [embed] }).catch(() => {});
              continue;
            }
          }

          // Si pas de destination disponible, ignorer cet agent
        } catch (err) {
          // ne pas interrompre la boucle pour une erreur sur un agent
          console.error(
            `Erreur en envoyant le rapport pour agent ${agent.userId}:`,
            err,
          );
        }
      }
    } else if (commandName === "abs-button") {
      const embed = new EmbedBuilder()
        .setTitle("📅 Declaration d'absence")
        .setDescription(
          "📝 **Remplir le formulaire**\nDeclare une absence en precisando la date de debut, de fin et la raison.\n\n👁️ **Voir mes absences**\nConsulte la liste de tes absences en cours ou passees.\n\n❌ **Supprimer mon absence**\nAnnule une absence enregistree si elle n'est plus d'actualite.",
        )
        .setColor(0x3498db);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("abs_fill_form")
          .setLabel("Remplir le formulaire")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("📝"),
        new ButtonBuilder()
          .setCustomId("abs_view")
          .setLabel("Voir mes absences")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("👁️"),
        new ButtonBuilder()
          .setCustomId("abs_delete")
          .setLabel("Supprimer mon absence")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌"),
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    } else if (commandName === "abs-channel-confirm") {
      const channel = options.getChannel("channel");
      database.config.absenceChannelConfirm = channel.id;
      saveDatabase();

      await interaction.reply({
        content: `✅ Le salon de confirmation des absences a ete defini sur ${channel}`,
        ephemeral: true,
      });
    } else if (commandName === "abs-role") {
      const role = options.getRole("role");
      database.config.absenceRole = role.id;
      saveDatabase();

      await interaction.reply({
        content: `✅ Le role ABS a ete defini sur ${role}`,
        ephemeral: true,
      });
    } else if (commandName === "setup-voiceservice") {
      const subcommand = options.getSubcommand();

      if (subcommand === "add-voicechannel") {
        const channel = options.getChannel("channel");
        if (!database.config.serviceVoiceChannels.includes(channel.id)) {
          database.config.serviceVoiceChannels.push(channel.id);
          saveDatabase();
          await interaction.reply({
            content: `✅ Le salon vocal ${channel} a ete ajoute pour les prises de service`,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: `❌ Ce salon est deja configure`,
            ephemeral: true,
          });
        }
      } else if (subcommand === "remove-voicechannel") {
        const channel = options.getChannel("channel");
        const index = database.config.serviceVoiceChannels.indexOf(channel.id);
        if (index > -1) {
          database.config.serviceVoiceChannels.splice(index, 1);
          saveDatabase();
          await interaction.reply({
            content: `✅ Le salon vocal ${channel} a ete retire des prises de service`,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: `❌ Ce salon n'etait pas configure`,
            ephemeral: true,
          });
        }
      } else if (subcommand === "set-logchannel") {
        const channel = options.getChannel("channel");
        database.config.logChannel = channel.id;
        saveDatabase();
        await interaction.reply({
          content: `✅ Le salon de logs a ete defini sur ${channel}`,
          ephemeral: true,
        });
      } else if (subcommand === "set-default-role") {
        const role = options.getRole("role");
        database.config.defaultRole = role.id;
        saveDatabase();
        await interaction.reply({
          content: `✅ Le role par defaut a ete defini sur ${role}`,
          ephemeral: true,
        });
      } else if (subcommand === "view") {
        const logChannel = database.config.logChannel
          ? `<#${database.config.logChannel}>`
          : "Non defini";
        const voiceChannels =
          database.config.serviceVoiceChannels
            .map((id) => `<#${id}>`)
            .join("\n") || "Aucun";
        const defaultRole = database.config.defaultRole
          ? `<@&${database.config.defaultRole}>`
          : "Non defini";

        const embed = new EmbedBuilder()
          .setTitle("⚙️ Configuration actuelle des channels de service")
          .setColor(0x3498db)
          .addFields(
            { name: "📢 Salon de logs", value: logChannel },
            { name: "🔊 Salons vocaux de service", value: voiceChannels },
            { name: "👥 Role par defaut", value: defaultRole },
          );

        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } else if (commandName === "salary") {
      const subcommand = options.getSubcommand();

      if (subcommand === "set-hours") {
        const montant = options.getNumber("montant");
        database.salaryConfig.hourlyRate = montant;
        saveDatabase();

        await interaction.reply({
          content: `✅ Le taux horaire a ete defini a ${montant.toLocaleString("fr-FR")} $`,
          ephemeral: true,
        });
      } else if (subcommand === "set-role") {
        const role = options.getRole("role");
        const montant = options.getNumber("montant");

        database.salaryConfig.roleSalaries[role.id] = montant;
        saveDatabase();

        await interaction.reply({
          content: `✅ Le salaire fixe pour ${role} a ete defini a ${montant.toLocaleString("fr-FR")} $`,
          ephemeral: true,
        });
      } else if (subcommand === "view") {
        const hourlyRate = database.salaryConfig.hourlyRate || 0;
        let rolesList = "";

        for (const [roleId, salary] of Object.entries(
          database.salaryConfig.roleSalaries || {},
        )) {
          rolesList += `<@&${roleId}> : ${salary.toLocaleString("fr-FR")} $\n`;
        }

        if (!rolesList) rolesList = "Aucun salaire configure";

        const embed = new EmbedBuilder()
          .setTitle("💰 Configuration des salaires")
          .setColor(0xffd700)
          .addFields(
            {
              name: "⏱️ Taux horaire",
              value: `${hourlyRate.toLocaleString("fr-FR")} $ / heure`,
            },
            { name: "👥 Salaires par role", value: rolesList },
          );

        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else if (subcommand === "remove") {
        const role = options.getRole("role");

        if (database.salaryConfig.roleSalaries[role.id]) {
          delete database.salaryConfig.roleSalaries[role.id];
          saveDatabase();
          await interaction.reply({
            content: `✅ Le salaire pour ${role} a ete supprime`,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: `❌ Aucun salaire configure pour ce role`,
            ephemeral: true,
          });
        }
      }
    } else if (commandName === "whitelist") {
      const sub = options.getSubcommand();
      
      // Initialiser si nécessaire
      if (!database.config.whitelistDomains) database.config.whitelistDomains = [];

      if (sub === "add") {
        const domain = options.getString("domaine")
          .toLowerCase()
          .replace(/^https?:\/\//i, '')  // Retire http:// et https://
          .replace(/^www\./i, '')        // Retire www.
          .split('/')[0];                // Garde uniquement le domaine

        // Vérifier si le domaine existe déjà
        if (database.config.whitelistDomains.includes(domain)) {
          return interaction.reply({
            content: `❌ Le domaine \`${domain}\` est déjà dans la whitelist.`,
            ephemeral: true
          });
        }

        // Ajouter le domaine
        database.config.whitelistDomains.push(domain);
        saveDatabase();

        return interaction.reply({
          content: `✅ Le domaine \`${domain}\` a été ajouté à la whitelist.`,
          ephemeral: true
        });
      }
      else if (sub === "remove") {
        const domain = options
          .getString("domaine")
          .toLowerCase()
          .replace(/^www\./i, "");
        const list = database.config.whitelistDomains || [];
        const idx = list.findIndex((d) => d.toLowerCase() === domain);
        if (idx === -1) {
          return interaction.reply({
            content: `❌ ${domain} n'est pas dans la whitelist.`,
            ephemeral: true,
          });
        }
        list.splice(idx, 1);
        database.config.whitelistDomains = list;
        saveDatabase();
        return interaction.reply({
          content: `✅ ${domain} retiré de la whitelist.`,
          ephemeral: true,
        });
      }

      if (sub === "list") {
        const list = database.config.whitelistDomains || [];
        return interaction.reply({
          content: list.length
            ? `Whitelist: ${list.join(", ")}`
            : "Aucun domaine whitelisté.",
          ephemeral: true,
        });
      }
    } else if (commandName === "channel_whitelist") {
      const sub = options.getSubcommand();
      
      if (sub === "add") {
        const channel = options.getChannel("channel");
        if (!database.config.whitelistChannels) database.config.whitelistChannels = [];
        
        if (database.config.whitelistChannels.includes(channel.id)) {
          return interaction.reply({
            content: `❌ ${channel} est déjà dans la whitelist.`,
            ephemeral: true,
          });
        }
        
        database.config.whitelistChannels.push(channel.id);
        saveDatabase();
        return interaction.reply({
          content: `✅ ${channel} ajouté à la whitelist.`,
          ephemeral: true,
        });
      }

      if (sub === "remove") {
        const channel = options.getChannel("channel");
        if (!database.config.whitelistChannels) database.config.whitelistChannels = [];
        
        const idx = database.config.whitelistChannels.indexOf(channel.id);
        if (idx === -1) {
          return interaction.reply({
            content: `❌ ${channel} n'est pas dans la whitelist.`,
            ephemeral: true,
          });
        }
        
        database.config.whitelistChannels.splice(idx, 1);
        saveDatabase();
        return interaction.reply({
          content: `✅ ${channel} retiré de la whitelist.`,
          ephemeral: true,
        });
      }

      if (sub === "list") {
        const channels = database.config.whitelistChannels || [];
        const channelMentions = channels.map(id => `<#${id}>`).join("\n") || "Aucun salon whitelisté";
        
        const embed = new EmbedBuilder()
          .setTitle("🔓 Salons Whitelistés")
          .setDescription(channelMentions)
          .setColor(0x00ff00);
        
        return interaction.reply({
          embeds: [embed],
          ephemeral: true,
        });
      }
    }
    // --- NEW: gestion de la commande "config" ---
    if (commandName === "config") {
      // Sécuriser la récupération de la sous-commande
      let sub;
      try {
        sub = options.getSubcommand();
      } catch (e) {
        return interaction.reply({
          content: "❌ Sous-commande manquante. Utilisation: /config <set-image|set-grades-...|view-grades>",
          ephemeral: true,
        });
      }

      // set-image
      if (sub === "set-image") {
        const url = options.getString("url");
        if (!url) {
          return interaction.reply({ content: "❌ URL manquante.", ephemeral: true });
        }
        database.config.embedImage = url;
        saveDatabase();
        return interaction.reply({ content: "✅ Image des embeds définie.", ephemeral: true });
      }

      // utilitaire pour collecter les rôles fournis
      const collectGrades = (names) => {
        const ids = [];
        for (const n of names) {
          const r = options.getRole(n);
          if (r) ids.push(r.id);
        }
        return ids;
      };

      // set-grades-1-5 (remplace l'ordre)
      if (sub === "set-grades-1-5") {
        const ids = collectGrades(["grade1", "grade2", "grade3", "grade4", "grade5"]);
        database.config.gradeOrder = ids;
        saveDatabase();
        return interaction.reply({ content: `✅ Grades 1-5 enregistrés (${ids.length} rôles).`, ephemeral: true });
      }

      // set-grades-6-10
      if (sub === "set-grades-6-10") {
        const ids = collectGrades(["grade6", "grade7", "grade8", "grade9", "grade10"]);
        database.config.gradeOrder = ids;
        saveDatabase();
        return interaction.reply({ content: `✅ Grades 6-10 enregistrés (${ids.length} rôles).`, ephemeral: true });
      }

      // set-grades-11-15
      if (sub === "set-grades-11-15") {
        const ids = collectGrades(["grade11", "grade12", "grade13", "grade14", "grade15"]);
        database.config.gradeOrder = ids;
        saveDatabase();
        return interaction.reply({ content: `✅ Grades 11-15 enregistrés (${ids.length} rôles).`, ephemeral: true });
      }

      // set-grades-16-20
      if (sub === "set-grades-16-20") {
        const ids = collectGrades(["grade16", "grade17", "grade18", "grade19", "grade20"]);
        database.config.gradeOrder = ids;
        saveDatabase();
        return interaction.reply({ content: `✅ Grades 16-20 enregistrés (${ids.length} rôles).`, ephemeral: true });
      }

      // view-grades
      if (sub === "view-grades") {
        const order = database.config.gradeOrder || [];
        if (!order.length) {
          return interaction.reply({ content: "Aucun ordre de grades configuré.", ephemeral: true });
        }
        const mentions = order.map(id => `<@&${id}>`).join("\n");
        return interaction.reply({ content: `Ordre des grades:\n${mentions}`, ephemeral: true });
      }

      // si sous-commande inconnue
      return interaction.reply({ content: "❌ Sous-commande inconnue.", ephemeral: true });
    }
  } catch (error) {
    console.error("Erreur lors du traitement de la commande:", error);
    await interaction.reply({ 
      content: "❌ Une erreur est survenue", 
      ephemeral: true 
    }).catch(() => {});
  }
}

async function handleButton(interaction) {
  try {
    const id = interaction.customId || "";

    // --- Ajout: gestion approve/reject pour les absences envoyées dans le canal de confirmation ---
    if (id.startsWith("approve_absence_") || id.startsWith("reject_absence_")) {
      // Autoriser seulement les personnes ayant MANAGE_MESSAGES ou le créateur du message? ici simple: vérifier permission MANAGE_MESSAGES
      const isApprove = id.startsWith("approve_absence_");
      const absenceId = id.split("_").slice(2).join("_");
      const absence = database.absences.find(a => a.id === absenceId);
      if (!absence) {
        return interaction.reply({ content: "❌ Absence introuvable.", ephemeral: true });
      }

      // Vérifier permission : gérer les absences (MANAGE_GUILD ou MANAGE_MESSAGES)
      const member = interaction.member;
      if (!member.permissions.has?.(PermissionFlagsBits.ManageMessages) && !member.permissions.has?.(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "❌ Vous n'avez pas la permission de valider/refuser.", ephemeral: true });
      }

      absence.status = isApprove ? "approved" : "rejected";
      saveDatabase();

      // Répondre et essayer d'éditer le message pour refléter le statut si possible
      try {
        await interaction.reply({ content: `✅ Demande ${isApprove ? "confirmée" : "refusée"} (#${absenceId.slice(-6)}).`, ephemeral: true });
      } catch (e) {}

      // Optionnel: notifier l'auteur
      try {
        const user = await client.users.fetch(absence.userId).catch(() => null);
        if (user) {
          await user.send(`Votre demande d'absence #${absenceId.slice(-6)} a été ${isApprove ? "confirmée" : "refusée"}.`).catch(() => {});
        }
      } catch (e) {}

      return;
    }

    if (id === "abs_fill_form") {
      // Construire et afficher le modal d'absence
      const modal = new ModalBuilder()
        .setCustomId("absence_form")
        .setTitle("Formulaire d'absence");

      const startInput = new TextInputBuilder()
        .setCustomId("start_date")
        .setLabel("Date de debut (jj/mm/aaaa)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const endInput = new TextInputBuilder()
        .setCustomId("end_date")
        .setLabel("Date de fin (jj/mm/aaaa)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const reasonInput = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Raison")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(startInput);
      const row2 = new ActionRowBuilder().addComponents(endInput);
      const row3 = new ActionRowBuilder().addComponents(reasonInput);

      modal.addComponents(row1, row2, row3);
      await interaction.showModal(modal);
      return;
    }

    if (id === "abs_view") {
      const list = database.absences.filter(
        (a) => a.userId === interaction.user.id,
      );
      if (!list.length) {
        return interaction.reply({
          content: "Aucune absence enregistree.",
          ephemeral: true,
        });
      }
      const description = list
        .map(
          (a) =>
            `ID: ${a.id} • ${a.startDate} → ${a.endDate} • ${a.status} • ${a.reason}`,
        )
        .join("\n");
      const embed = new EmbedBuilder()
        .setTitle("📋 Mes absences")
        .setDescription(description)
        .setColor(0xffa500);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (id === "abs_delete") {
      const list = database.absences.filter(
        (a) => a.userId === interaction.user.id,
      );
      if (!list.length)
        return interaction.reply({
          content: "Aucune absence a supprimer.",
          ephemeral: true,
        });
      const toDelete = list[list.length - 1];
      database.absences = database.absences.filter((a) => a.id !== toDelete.id);
      saveDatabase();
      return interaction.reply({
        content: `✅ Absence ${toDelete.id} supprimee.`,
        ephemeral: true,
      });
    }

    if (id === "voir_rapport_temporaire") {
      const targetUser = interaction.user;
      if (!database.agents[targetUser.id]) {
        return interaction.reply({
          content: "❌ Vous n'êtes pas enregistré comme agent",
          ephemeral: true,
        });
      }

      const agent = database.agents[targetUser.id];
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      const grade = member ? getMemberGrade(member) : "Agent";
      const stats = calculateSalary(agent, member);

      const rewardsText = agent.rewardsAndSanctions
        ?.filter((r) => r.type === "reward")
        .map((r) => `🏅 ${r.description}`)
        .join("\n") || "";
      const sanctionsText = agent.rewardsAndSanctions
        ?.filter((r) => r.type === "sanction")
        .map((r) => `⚠️ ${r.description}`)
        .join("\n") || "";
      const rewardSanctionText = (rewardsText + (sanctionsText ? "\n" + sanctionsText : "")) || 
        "Aucune récompense ou sanction enregistrée.";

      const embed = new EmbedBuilder()
        .setTitle("📊 Rapport temporaire")
        .setColor(0x3498db)
        .setThumbnail(database.config.embedImage)
        .addFields(
          { name: "📛 Nom :", value: `${agent.username} (${targetUser})`, inline: false },
          { name: "────────────────────────────────────────────────", value: "\u200B", inline: false },
          { name: "👮 Grade :", value: grade, inline: true },
          { name: "⏱️ Heures de service :", value: `${stats.totalHours}h ${stats.totalMinutes}m`, inline: true },
          { name: "📅 Prises de service :", value: `${stats.serviceCount}`, inline: true },
          { name: "💰 Salaire Fixe :", value: `${stats.fixedSalary.toLocaleString("fr-FR")} $`, inline: true },
          { name: "💵 Salaire Heure de Service :", value: `${stats.salaryPerService.toLocaleString("fr-FR")} $`, inline: true },
          { name: "💸 Salaire total :", value: `${stats.totalSalary.toLocaleString("fr-FR")} $`, inline: true },
          { name: "🏅 Medailles & Sanctions :", value: rewardSanctionText, inline: false }
        )
        .setFooter({ text: "Police Manager" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (error) {
    console.error("Erreur lors du traitement du bouton:", error);
    await interaction
      .reply({ content: "❌ Une erreur est survenue", ephemeral: true })
      .catch(() => {});
  }
}

async function handleModal(interaction) {
  try {
    if (interaction.customId === "absence_form") {
      const startDate = interaction.fields.getTextInputValue("start_date");
      const endDate = interaction.fields.getTextInputValue("end_date");
      const reason = interaction.fields.getTextInputValue("reason");

      const absenceId = Date.now().toString();
      database.absences.push({
        id: absenceId,
        userId: interaction.user.id,
        startDate,
        endDate,
        reason,
        status: "pending",
        submittedAt: Date.now(),
      });

      saveDatabase();

      await interaction.reply({
        content: "✅ Votre demande d'absence a ete soumise",
        ephemeral: true,
      });

      if (database.config.absenceChannelConfirm) {
        const channel = await client.channels
          .fetch(database.config.absenceChannelConfirm)
          .catch(() => null);
        const agent = database.agents[interaction.user.id];
        const member = await interaction.guild.members
          .fetch(interaction.user.id)
          .catch(() => null);

        if (channel && agent && member) {
          const grade = getMemberGrade(member);

          // Calculer la durée
          const startParts = startDate.split("/");
          const endParts = endDate.split("/");
          const start = new Date(
            startParts[2],
            startParts[1] - 1,
            startParts[0],
          );
          const end = new Date(endParts[2], endParts[1] - 1, endParts[0]);
          const durationDays =
            Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

          const embed = new EmbedBuilder()
            .setTitle("📝 Nouvelle demande d'absence")
            .setColor(0xffa500)
            .addFields(
              {
                name: "👤 Agent",
                value: `[${grade} ${agent.matricule}] ${agent.username} (<@${interaction.user.id}>)\nID : ${agent.uniqueId}`,
                inline: false,
              },
              {
                name: "🆔 Matricule",
                value: `${agent.matricule}`,
                inline: true,
              },
              {
                name: "📁 Dossier",
                value: `<#${agent.dossierChannelId}>`,
                inline: true,
              },
              {
                name: "📅 Periode",
                value: `${startDate} → ${endDate}`,
                inline: false,
              },
              {
                name: "⏳ Duree",
                value: `${durationDays} jours`,
                inline: true,
              },
              { name: "📝 Raison", value: reason, inline: false },
              {
                name: "🕐 Soumise le",
                value: new Date().toLocaleString("fr-FR"),
                inline: false,
              },
              {
                name: "Statut",
                value: "⏳ En attente de validation",
                inline: false,
              },
            )
            .setFooter({ text: `Demande d'absence #${absenceId.slice(-6)}` })
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`approve_absence_${absenceId}`)
              .setLabel("Confirmée")
              .setStyle(ButtonStyle.Success)
              .setEmoji("✅"),
            new ButtonBuilder()
              .setCustomId(`reject_absence_${absenceId}`)
              .setLabel("Refusée")
              .setStyle(ButtonStyle.Danger)
              .setEmoji("❌"),
          );

          await channel.send({ embeds: [embed], components: [row] });
        }
      }
    }
  } catch (error) {
    console.error("Erreur lors du traitement du modal:", error);
    await interaction
      .reply({ content: "❌ Une erreur est survenue", ephemeral: true })
      .catch(() => {});
  }
}

// Variable pour suivre les agents en cours de traitement (éviter les doublons)
const processingVoiceStates = new Set();

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    if (
      !database.config.serviceVoiceChannels ||
      database.config.serviceVoiceChannels.length === 0
    ) {
      return;
    }

    const userId = newState.id;
    const agent = database.agents[userId];

    if (!agent) return;

    const member = newState.member;
    if (
      database.config.defaultRole &&
      !member.roles.cache.has(database.config.defaultRole)
    ) {
      return;
    }

    // Créer une clé unique pour cet événement
    const eventKey = `${userId}-${Date.now()}`;

    // Vérifier si cet agent est déjà en cours de traitement
    if (processingVoiceStates.has(userId)) {
      return;
    }

    const joinedServiceChannel =
      newState.channelId &&
      database.config.serviceVoiceChannels.includes(newState.channelId);
    const leftServiceChannel =
      oldState.channelId &&
      database.config.serviceVoiceChannels.includes(oldState.channelId);

    // PRISE DE SERVICE
    if (joinedServiceChannel && !leftServiceChannel) {
      processingVoiceStates.add(userId);

      if (!database.services[userId]) {
        database.services[userId] = [];
      }

      const activeService = database.services[userId].find((s) => !s.endTime);
      if (activeService) {
        processingVoiceStates.delete(userId);
        return;
      }

      const serviceId = `${userId}_${Date.now()}`;
      const startTime = Date.now();

      database.services[userId].push({
        id: serviceId,
        startTime: startTime,
        endTime: null,
      });

      saveDatabase();

      if (database.config.logChannel) {
        const logChannel = await client.channels
          .fetch(database.config.logChannel)
          .catch(() => null);
        if (logChannel) {
          const grade = getMemberGrade(member);
          const voiceChannel = newState.channel;

          const embed = new EmbedBuilder()
            .setTitle("🟢 Prise de service")
            .setDescription(
              `**[${grade} ${agent.matricule}] ${agent.username}**\n\n<@${member.user.id}> a commencé son service !\n📌 Salon : 🔊 <#${voiceChannel.id}>`,
            )
            .setColor(0x00ff00)
            .setFooter({
              text: new Date(startTime).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
            });

          await logChannel.send({ embeds: [embed] });
        }
      }

      processingVoiceStates.delete(userId);
    }

    // FIN DE SERVICE
    else if (!joinedServiceChannel && leftServiceChannel) {
      processingVoiceStates.add(userId);

      if (database.services[userId]) {
        const activeService = database.services[userId].find((s) => !s.endTime);
        if (activeService) {
          activeService.endTime = Date.now();
          saveDatabase();

          const duration = activeService.endTime - activeService.startTime;
          const hours = Math.floor(duration / (1000 * 60 * 60));
          const minutes = Math.floor(
            (duration % (1000 * 60 * 60)) / (1000 * 60),
          );

          if (database.config.logChannel) {
            const logChannel = await client.channels
              .fetch(database.config.logChannel)
              .catch(() => null);
            if (logChannel) {
              const grade = getMemberGrade(member);

              const embed = new EmbedBuilder()
                .setTitle("🔴 Fin de service")
                .setDescription(
                  `**[${grade} ${agent.matricule}] ${agent.username}**\n\n<@${member.user.id}>, n'est plus en service !\nDurée totale de service : ${hours} heures et ${minutes} minutes.`,
                )
                .setColor(0xff0000)
                .setFooter({
                  text: new Date().toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }),
                });

              await logChannel.send({ embeds: [embed] });
            }
          }
        }
      }

      processingVoiceStates.delete(userId);
    }
  } catch (error) {
    console.error("Erreur lors de la gestion du voice state:", error);
    // Nettoyer l'état en cas d'erreur
    if (newState.id) {
      processingVoiceStates.delete(newState.id);
    }
  } finally {
    // Mettre a jour la presence apres tout changement vocal
    updatePresence().catch(() => {});
  }
});

// Nouvel événement pour gérer les départs de membres (protection anti-fraude)
client.on("guildMemberRemove", async (member) => {
  try {
    const protectionRoleId = database.config.protectionRole;
    const agent = database.agents[member.id];
    const hasProtectedRole =
      protectionRoleId &&
      member.roles &&
      member.roles.cache &&
      member.roles.cache.has(protectionRoleId);
    if (!hasProtectedRole && !agent) return;

    const protectionChannelId =
      database.config.protectionChannel || database.config.logChannel || null;
    const protectionChannel = protectionChannelId
      ? await client.channels.fetch(protectionChannelId).catch(() => null)
      : null;
    if (!protectionChannel) {
      console.error(
        "Protection: aucun salon de notification configuré (protectionChannel ou logChannel).",
      );
    }

    // Préparer la mention à envoyer au-dessus de l'embed si configurée
    const pingRoleId = database.config.protectionPingRole || null;
    const pingContent = pingRoleId ? `<@&${pingRoleId}>` : null;

    // Formatter les rôles (juste les noms)
    const rolesList =
      member.roles && member.roles.cache
        ? member.roles.cache
            .filter((r) => r.id !== member.guild.id) // exclure @everyone
            .map((r) => r.name) // garder juste le nom du rôle
            .join(", ") || "Aucun"
        : "Aucun";

    const embed = new EmbedBuilder()
      .setTitle("🛑 Protection | Anti Fraudes 🛑")
      .setColor(0xff0000)
      .setDescription(
        `Un ${agent ? "agent" : "membre"} vient de quitter le serveur Discord.`,
      )
      .addFields(
        {
          name: "Membre",
          value: `${member.user.tag} (<@${member.id}>)`,
          inline: false,
        },
        { name: "ID Discord", value: member.id, inline: true },
      )
      .setThumbnail(
        member.user.displayAvatarURL
          ? member.user.displayAvatarURL({ dynamic: true })
          : undefined,
      )
      .setTimestamp();

    if (agent) {
      embed.addFields(
        { name: "Matricule", value: String(agent.matricule), inline: true },
        { name: "ID Unique", value: String(agent.uniqueId), inline: true },
        {
          name: "Dossier",
          value: `<#${agent.dossierChannelId}>`,
          inline: true,
        },
      );
    }

    embed.addFields({ name: "Rôles", value: rolesList, inline: false });

    // Envoi dans le salon de protection/logs (avec ping si configuré)
    if (protectionChannel) {
      if (pingContent) {
        // Envoyer le ping tout seul d'abord
        await protectionChannel.send(pingContent).catch(() => {});
        // Puis envoyer l'embed dans un message séparé
        await protectionChannel.send({ embeds: [embed] }).catch((err) => {
          console.error("Erreur en envoyant l'embed de protection:", err);
        });
      } else {
        await protectionChannel.send({ embeds: [embed] }).catch((err) => {
          console.error("Erreur en envoyant l'embed de protection:", err);
        });
      }
    }

    // Envoi dans le dossier de l'agent si existant
    if (agent && agent.dossierChannelId) {
      const dossierChannel = await client.channels
        .fetch(agent.dossierChannelId)
        .catch(() => null);
      if (dossierChannel) {
        // Premier embed : Notification de départ
        const leaveEmbed = new EmbedBuilder()
          .setTitle("🛑 Protection | Anti Fraudes")
          .setColor(0xff0000)
          .setDescription(`<@${member.id}> a quitté le serveur.`)
          .setTimestamp();

        // Deuxième embed : Confirmation de retrait (comme /agents retirer)
        const removeEmbed = new EmbedBuilder()
          .setTitle("🗑️ Retrait d'un agent de la base de donnee")
          .setColor(0xff0000)
          .addFields(
            { name: "Agent :", value: `➜ <@${member.id}>`, inline: false },
            {
              name: "Matricule :",
              value: `➜ ${agent.matricule}`,
              inline: false,
            },
            {
              name: "ID Unique :",
              value: `➜ ${agent.uniqueId}`,
              inline: false,
            },
          )
          .setFooter({ text: `Agent retiré automatiquement suite au départ` })
          .setTimestamp();

        // Envoyer les deux embeds
        if (pingContent) {
          await dossierChannel.send(pingContent).catch(() => {});
        }
        await dossierChannel
          .send({ embeds: [leaveEmbed, removeEmbed] })
          .catch((err) => {
            console.error(
              "Erreur en envoyant les embeds dans le dossier:",
              err,
            );
          });
      }
    }

    // Supprimer l'agent de la base si présent
    if (agent) {
      delete database.agents[member.id];
      delete database.services[member.id];
      saveDatabase();
    }
  } catch (err) {
    console.error("Erreur dans guildMemberRemove (protection):", err);
  }
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ ERREUR: Token Discord non trouve !");
  console.error(
    "Veuillez definir la variable d'environnement DISCORD_TOKEN dans les Secrets de Replit",
  );
  process.exit(1);
}

client
  .login(TOKEN)
  .then(() => {
    console.log("🚀 Connexion au bot en cours...");
  })
  .catch((error) => {
    console.error("❌ Erreur de connexion:", error);
    process.exit(1);
  });

// Nouveau : détecter les liens non whitelistés et DM l'auteur
client.on("messageCreate", async (message) => {
  try {
    if (!message.guild || message.author?.bot) return;

    // Vérifier si le salon est whitelisté
    if (database.config.whitelistChannels?.includes(message.channel.id)) {
      return; // Autoriser tous les liens dans les salons whitelistés
    }

    // Collecter toutes les URLs : contenu, attachments, embeds (url/image/thumbnail)
    const urls = new Set();

    // a) URLs dans le texte (nécessite MessageContent intent activé)
    const urlRegex = /https?:\/\/[^\s<>]+/gi;
    for (const m of message.content.matchAll(urlRegex) || []) {
      if (m[0]) urls.add(m[0]);
    }

    // b) attachments (images, gifs, etc.)
    for (const attachment of message.attachments.values()) {
      if (attachment.url) urls.add(attachment.url);
    }

    // c) embeds (liens partagés, images intégrées)
    for (const embed of message.embeds || []) {
      if (embed.url) urls.add(embed.url);
      if (embed.image && embed.image.url) urls.add(embed.image.url);
      if (embed.thumbnail && embed.thumbnail.url) urls.add(embed.thumbnail.url);
    }

    const gid = message.guild.id;
    const userId = message.author.id;
    database.infractions = database.infractions || {};
    database.infractions[gid] = database.infractions[gid] || {};

    // Paramètres anti-spam
    const BAN_THRESHOLD = 10; // nombre d'infractions pour ban
    const WINDOW_MS = 60 * 1000; // fenêtre temporelle (ms) => 60s

    // Si pas de lien => on considère que la séquence est coupée -> reset des timestamps
    if (urls.size === 0) {
      database.infractions[gid][userId] = [];
      saveDatabase();
      return;
    }

    // Préparer whitelist normalisée
    const whitelist = (database.config.whitelistDomains || []).map((d) =>
      d.replace(/^www\./i, "").toLowerCase(),
    );

    // Vérifier chaque URL, si un domaine n'est pas whitelisté => action
    let foundUnwhitelisted = false;
    for (const rawUrl of urls) {
      try {
        const parsed = new URL(rawUrl);
        const domain = parsed.hostname.replace(/^www\./i, "").toLowerCase();
        
        // Vérifier si le domaine ou un de ses parents est dans la whitelist
        const isWhitelisted = database.config.whitelistDomains.some(whiteDomain => 
          domain === whiteDomain || domain.endsWith(`.${whiteDomain}`)
        );
        
        if (!isWhitelisted) {
          foundUnwhitelisted = true;
          break;
        }
      } catch (e) {
        // URL invalide -> ignorer
      }
    }

    if (foundUnwhitelisted) {
      // Supprimer le message pour que personne (même l'auteur) ne le voie
      await message.delete().catch(() => {});

      // Ajouter timestamp et garder uniquement ceux dans la fenêtre temporelle
      const now = Date.now();
      let arr = database.infractions[gid][userId];

      // compat: si ancienne valeur était un nombre, remplacer par tableau vide
      if (!Array.isArray(arr)) arr = [];

      arr.push(now);
      arr = arr.filter((ts) => now - ts <= WINDOW_MS);
      database.infractions[gid][userId] = arr;
      saveDatabase();

      const current = arr.length;

      // Envoyer DM d'avertissement (sans compteur)
      try {
        await message.author
          .send("Your link is not in the whitelist")
          .catch(() => {});
      } catch (e) {
        // DM bloqué, on ignore
      }

      // Si atteint le seuil dans la fenêtre => ban
      if (current >= BAN_THRESHOLD) {
        try {
          await message.guild.members.ban(userId, {
            reason: `Atteint ${BAN_THRESHOLD} infractions whitelist en ${Math.round(WINDOW_MS / 1000)}s (spam)`,
          });
          try {
            await message.author
              .send(
                `Vous avez été banni du serveur ${message.guild.name} après ${BAN_THRESHOLD} infractions en ${Math.round(WINDOW_MS / 1000)}s.`,
              )
              .catch(() => {});
          } catch (e) {}
          // reset après ban
          database.infractions[gid][userId] = [];
          saveDatabase();
        } catch (banErr) {
          console.error(
            `Erreur en bannissant ${userId} sur guild ${gid}:`,
            banErr,
          );
          const logId = database.config.logChannel;
          if (logId) {
            const logChannel = await client.channels
              .fetch(logId)
              .catch(() => null);
            if (logChannel) {
              await logChannel
                .send({
                  content: `⚠️ Impossible de bannir <@${userId}> après ${BAN_THRESHOLD} infractions (erreur).`,
                })
                .catch(() => {});
            }
          }
        }
      }

      return;
    }

    // Tous les liens sont whitelistés -> reset de la séquence (on ne veut pas accumuler)
    if (
      database.infractions[gid] &&
      database.infractions[gid][userId] &&
      database.infractions[gid][userId].length
    ) {
      database.infractions[gid][userId] = [];
      saveDatabase();
    }
  } catch (err) {
    console.error("Erreur dans messageCreate (whitelist):", err);
  }
});
