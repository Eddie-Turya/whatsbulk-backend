const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const QRCode = require("qrcode");
const fs = require("fs");
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

let sock;
let qrCodeData = null;
let isConnected = false;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr } = update;

    if (qr) {
      qrCodeData = await QRCode.toDataURL(qr);
    }

    if (connection === "open") {
      console.log("✅ WhatsApp Connected");
      isConnected = true;
    }

    if (connection === "close") {
      isConnected = false;
      qrCodeData = null;
      if (update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        startSock(); // auto reconnect
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

startSock();

app.get("/connect", async (req, res) => {
  if (isConnected) {
    return res.json({ status: "connected" });
  }
  if (qrCodeData) {
    return res.json({ qr: qrCodeData });
  }
  return res.json({ status: "pending" });
});

app.post("/send", async (req, res) => {
  if (!isConnected) {
    return res.status(400).json({ error: "WhatsApp not connected." });
  }

  const { numbers, message } = req.body;

  if (!Array.isArray(numbers) || !message) {
    return res.status(400).json({ error: "Invalid input." });
  }

  try {
    for (const num of numbers.slice(0, 50)) {
      const jid = num.includes("@s.whatsapp.net") ? num : `${num}@s.whatsapp.net`;
      await sock.sendMessage(jid, { text: message });
    }
    return res.json({ success: true, sent: numbers.length });
  } catch (err) {
    console.error("Send error:", err);
    return res.status(500).json({ error: "Send failed." });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
