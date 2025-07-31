const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const { makeInMemoryStore, makeWASocket, useSingleFileAuthState } = require('@whiskeysockets/baileys');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const { state, saveState } = useSingleFileAuthState('./session.json');
let client = null;
let qr = null;
let status = 'disconnected';

async function connectToWhatsApp() {
    client = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: { level: 'silent' }
    });

    client.ev.on('connection.update', (update) => {
        const { connection, qr: qrCode } = update;
        if (qrCode) {
            qr = qrCode;
            status = 'pending';
        }
        if (connection === 'open') {
            status = 'connected';
            qr = null;
        }
        if (connection === 'close') {
            status = 'disconnected';
            setTimeout(connectToWhatsApp, 5000);
        }
    });

    client.ev.on('creds.update', saveState);
}

connectToWhatsApp();

app.get('/qr', async (req, res) => {
    if (qr) {
        const qrImage = await qrcode.toDataURL(qr);
        res.json({ qr: qrImage });
    } else {
        res.status(404).json({ error: 'QR not available' });
    }
});

app.get('/status', (req, res) => {
    res.json({ status });
});

app.post('/send', async (req, res) => {
    if (status !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }

    const { numbers, message } = req.body;
    if (!numbers || !message) {
        return res.status(400).json({ error: 'Numbers and message are required' });
    }

    try {
        const results = [];
        for (const number of numbers) {
            const formattedNumber = number.includes('@') ? number : `${number}@s.whatsapp.net`;
            try {
                await client.sendMessage(formattedNumber, { text: message });
                results.push({ number, status: 'success' });
            } catch (error) {
                results.push({ number, status: 'error', error: error.message });
            }
        }
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
