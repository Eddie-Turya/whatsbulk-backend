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
  if (sessions[userId]) {
    return res.json({ message: "Already connected" });
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: userId }),
    puppeteer: { headless: true }
  });

  client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
      res.json({ qr: url });
    });
  });

  client.on('ready', () => {
    console.log(`${userId} is ready`);
    sessions[userId] = client;
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
