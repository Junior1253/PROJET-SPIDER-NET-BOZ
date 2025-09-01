const express = require("express");
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode");

const app = express();
const port = process.env.PORT || 3000;

app.get("/", async (req, res) => {
    const { state, saveCreds } = await useMultiFileAuthState("session");
    const sock = makeWASocket({ auth: state });

    sock.ev.on("connection.update", async (update) => {
        const { qr, connection } = update;

        if (qr) {
            const qrImage = await qrcode.toDataURL(qr);
            res.send(`<h1>Scanne ce QR Code avec WhatsApp</h1><img src="${qrImage}" />`);
        }

        if (connection === "open") {
            res.send("✅ Session ID générée avec succès !");
        }
    });

    sock.ev.on("creds.update", saveCreds);
});

app.listen(port, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${port}`);
});
