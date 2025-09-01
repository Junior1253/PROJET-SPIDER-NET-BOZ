import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import sqlite3 from "sqlite3";

// --- Base de données pour garder les avertissements ---
const db = new sqlite3.Database("./warnings.db");
db.run("CREATE TABLE IF NOT EXISTS warnings (user TEXT, count INTEGER)");

// --- Config ---
const FORBIDDEN_WORDS = ["insulte1", "insulte2", "motinterdit"]; // ⚠️ Mets tes vrais mots-clés ici
const GROUP_ADMINS = ["225000000000@s.whatsapp.net"]; // ⚠️ Mets les numéros des admins ici
let podcastMode = false;
let podcastSource = null;
let podcastGroups = new Set();

// --- Fonction pour démarrer le bot ---
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session");
  const sock = makeWASocket({ auth: state });

  sock.ev.on("creds.update", saveCreds);

  // --- Gestion des messages ---
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.key.remoteJid) return;
    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    // ✅ Commande: activer podcast
    if (text.startsWith("!podcast on")) {
      podcastMode = true;
      podcastSource = from;
      podcastGroups.add(from);
      await sock.sendMessage(from, { text: "🎙️ Mode podcast activé. Ce groupe est la source." });
      return;
    }

    // ✅ Commande: ajouter un groupe au podcast
    if (text.startsWith("!podcast add")) {
      podcastGroups.add(from);
      await sock.sendMessage(from, { text: "✅ Ce groupe reçoit maintenant le podcast." });
      return;
    }

    // ✅ Commande: désactiver podcast
    if (text.startsWith("!podcast off")) {
      podcastMode = false;
      podcastSource = null;
      podcastGroups.clear();
      await sock.sendMessage(from, { text: "🛑 Mode podcast désactivé." });
      return;
    }

    // 🎙️ Transfert des messages en mode podcast
    if (podcastMode && from === podcastSource) {
      for (let group of podcastGroups) {
        if (group !== from) {
          await sock.sendMessage(group, { text: `📢 ${text}` });
        }
      }
    }

    // ✅ Commande: résumé du règlement
    if (text.startsWith("!reglement")) {
      await sock.sendMessage(from, { text: "📜 Règlement: pas d'insultes, pas de liens, respect mutuel." });
      return;
    }

    // ✅ Anti-liens
    if (text.includes("http://") || text.includes("https://") || text.includes("wa.me/")) {
      await sock.sendMessage(from, { text: "🚫 Les liens ne sont pas autorisés." });
      await sock.sendMessage(from, { delete: msg.key }); // suppression
      return;
    }

    // ✅ Détection de mots interdits
    for (let word of FORBIDDEN_WORDS) {
      if (text.toLowerCase().includes(word.toLowerCase())) {
        db.get("SELECT count FROM warnings WHERE user = ?", [msg.key.participant], async (err, row) => {
          if (!row) {
            db.run("INSERT INTO warnings (user, count) VALUES (?, ?)", [msg.key.participant, 1]);
            await sock.sendMessage(from, { text: `⚠️ @${msg.key.participant.split("@")[0]} avertissement 1/3`, mentions: [msg.key.participant] });
          } else if (row.count < 2) {
            db.run("UPDATE warnings SET count = ? WHERE user = ?", [row.count + 1, msg.key.participant]);
            await sock.sendMessage(from, { text: `⚠️ @${msg.key.participant.split("@")[0]} avertissement ${row.count + 1}/3`, mentions: [msg.key.participant] });
          } else {
            db.run("DELETE FROM warnings WHERE user = ?", [msg.key.participant]);
            await sock.groupParticipantsUpdate(from, [msg.key.participant], "remove");
            await sock.sendMessage(from, { text: `🚨 @${msg.key.participant.split("@")[0]} a été expulsé après 3 avertissements.`, mentions: [msg.key.participant] });
            for (let admin of GROUP_ADMINS) {
              await sock.sendMessage(admin, { text: `🚨 L'utilisateur ${msg.key.participant} a été banni pour non-respect du règlement.` });
            }
          }
        });
      }
    }

    // ✅ Suppression des autres bots (si nom contient "bot")
    if (text.toLowerCase().includes("bot")) {
      await sock.sendMessage(from, { text: "🤖 Les autres bots ne sont pas autorisés ici." });
      await sock.sendMessage(from, { delete: msg.key });
    }
  });

  // --- Gestion des nouveaux arrivants ---
  sock.ev.on("group-participants.update", async (update) => {
    if (update.action === "add") {
      for (let participant of update.participants) {
        await sock.sendMessage(update.id, { text: `👋 Bienvenue @${participant.split("@")[0]} ! Voici le règlement : 📜 pas d'insultes, pas de liens, respect mutuel.`, mentions: [participant] });
      }
    }
  });

  // --- Gestion de la connexion ---
  sock.ev.on("connection.update", (update) => {
    if (update.connection === "close" && update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
      startBot();
    }
  });
}

startBot();
