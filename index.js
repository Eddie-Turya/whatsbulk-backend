const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const sessions = {};

app.post('/create-session', async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: "Missing userId" });

  if (sessions[userId]) {
    return res.json({ message: "Already connected" });
  }

  let qrSent = false;

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: userId }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer'
      ]
    }
  });

  client.on('qr', async (qr) => {
    if (!qrSent) {
      qrSent = true;
      const qrImage = await qrcode.toDataURL(qr);
      res.json({ qr: qrImage });
    }
  });

  client.on('ready', () => {
    console.log(`✅ WhatsApp connected for ${userId}`);
    sessions[userId] = client;
    if (!qrSent) res.json({ message: "Already connected" });
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Auth failure:', msg);
    res.status(401).json({ error: "Authentication failed" });
  });

  client.initialize();
});

app.post('/send', async (req, res) => {
  const { userId, message, numbers } = req.body;
  const client = sessions[userId];

  if (!client) return res.status(400).json({ error: "Client not connected" });

  try {
    for (let number of numbers) {
      let phone = number.includes('@c.us') ? number : `${number}@c.us`;
      await client.sendMessage(phone, message);
    }
    res.json({ status: "Messages sent" });
  } catch (e) {
    res.status(500).json({ error: "Failed to send messages" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
