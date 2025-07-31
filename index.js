const express = require('express');
const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const { Boom } = require('@hapi/boom');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

let qrCodeImageUrl = null;
let sessionReady = false;

// Auth state stored in session.json
const { state, saveState } = useSingleFileAuthState('./session.json');

// Start WhatsApp socket
const startSock = () => {
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  // Listen for connection updates
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        qrCodeImageUrl = await qrcode.toDataURL(qr); // convert QR to base64 image
        console.log("📲 QR Code generated");
      } catch (err) {
        console.error("❌ Failed to generate QR:", err);
      }
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;
      console.log("⚠️ Connection closed. Reconnecting:", shouldReconnect);
      if (shouldReconnect) startSock();
    }

    if (connection === 'open') {
      sessionReady = true;
      qrCodeImageUrl = null; // clear QR
      console.log('✅ WhatsApp Connected');
    }
  });

  // Save session credentials on update
  sock.ev.on('creds.update', saveState);

  // Listen for messages (optional for logging)
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.key.fromMe) {
      console.log("📩 Message from:", msg.key.remoteJid, "->", msg.message?.conversation);
    }
  });

  // Attach to global
  global.sock = sock;
};

// Start the socket
startSock();

// GET QR Code and connection status
app.get('/connect', (req, res) => {
  if (sessionReady) {
    return res.json({ status: 'connected' });
  } else if (qrCodeImageUrl) {
    return res.json({ status: 'disconnected', qr: qrCodeImageUrl });
  } else {
    return res.json({ status: 'pending' });
  }
});

// POST to send message
app.post('/send', async (req, res) => {
  const { numbers, message } = req.body;

  if (!sessionReady || !global.sock) {
    return res.status(400).json({ error: 'WhatsApp not connected' });
  }

  if (!numbers || !Array.isArray(numbers) || numbers.length === 0 || !message) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const results = [];

  for (let number of numbers.slice(0, 50)) {
    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;

    try {
      await global.sock.sendMessage(jid, { text: message });
      results.push({ number, status: 'sent' });
    } catch (error) {
      results.push({ number, status: 'failed', error: error.message });
    }
  }

  res.json({ status: 'ok', results });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
