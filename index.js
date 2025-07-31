import express from 'express'
import makeWASocket, { useSingleFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import qrcode from 'qrcode'
import cors from 'cors'
import { Boom } from '@hapi/boom'
import { unlinkSync } from 'fs'

const { state, saveState } = useSingleFileAuthState('./session.json')

const app = express()
app.use(cors())
app.use(express.json())

let sock = null
let isConnected = false
let qrData = null

async function startSock() {
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  })

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      qrData = qr
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        startSock()
      } else {
        isConnected = false
        try {
          unlinkSync('./session.json')
        } catch {}
      }
    } else if (connection === 'open') {
      isConnected = true
      qrData = null
    }
  })

  sock.ev.on('creds.update', saveState)
}

startSock()

app.get('/', (req, res) => {
  res.send('WhatsBulk Backend Running ✅')
})

app.get('/connect', async (req, res) => {
  if (isConnected) {
    return res.json({ status: 'connected' })
  } else if (qrData) {
    try {
      const qrImage = await qrcode.toDataURL(qrData)
      return res.json({ status: 'pending', qr: qrImage })
    } catch (err) {
      return res.status(500).json({ error: 'QR generation failed' })
    }
  } else {
    return res.json({ status: 'starting' })
  }
})

app.post('/send', async (req, res) => {
  if (!isConnected || !sock) {
    return res.status(400).json({ error: 'Not connected' })
  }

  const { numbers, message } = req.body
  if (!Array.isArray(numbers) || !message) {
    return res.status(400).json({ error: 'Invalid input' })
  }

  try {
    for (const number of numbers) {
      const jid = number.includes('@s.whatsapp.net') ? number : number + '@s.whatsapp.net'
      await sock.sendMessage(jid, { text: message })
    }

    res.json({ status: 'messages sent' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message', detail: err.message })
  }
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log(`✅ Server running on ${PORT}`)
})
