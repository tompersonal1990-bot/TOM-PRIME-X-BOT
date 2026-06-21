/**
 * Tom Bot - A WhatsApp Bot (Multi-Pairing Enabled)
 * Copyright (c) 2024 Professor
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, sleep, reSize } = require('./lib/myfunc')

// === 🔥 EXPRESS SERVER INTEGRATION FOR MULTI-PAIRING ===
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('TOM PRIME X BOT PAIRING SERVER IS RUNNING ✅');
});

// === 🔥 GLOBAL FETCH FIX FOR BAILEYS ===
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
global.fetch = fetch;

const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { rmSync, existsSync } = require('fs')

const store = require('./lib/lightweight_store')
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Memory optimization & monitoring
setInterval(() => { if (global.gc) global.gc() }, 60_000)
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 450) { process.exit(1) }
}, 30_000)

let owner = JSON.parse(fs.readFileSync('./data/owner.json'))
global.botname = "TOM BOT"
global.themeemoji = "•"
global.autoBio = true;

// === 🔥 VCARD CONFIGURATION ===
const LOCK_PIC = "https://i.postimg.cc/pVF8rw2m/IMG-20260329-WA0128.jpg";
const LOCK_NAME = "—͞To፝֟ᴍㅤᏴꫝ֟፝ʙ延ㅤᥫᩣ";
const LOCK_NUM = "8801889428254";
const LOCK_JID = LOCK_NUM + '@s.whatsapp.net';
const WP_CHANNEL = "https://whatsapp.com/channel/0029VbBItW060eBXTB93HT1Q";
let thumbCache = null;
let vcardCache = `BEGIN:VCARD\nVERSION:3.0\nFN:${LOCK_NAME}\nTEL;type=CELL;type=VOICE;waid=${LOCK_NUM}:${LOCK_NUM}\nEND:VCARD`;

async function getBufferVcard(url) {
  try { const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 }); return res.data; } catch (e) { return null; }
}

// === 🔥 DYNAMIC IMPORT TO FIX ERR_REQUIRE_ESM PERMANENTLY ===
async function startXeonBotInc(sessionPath = './session', isCustomPair = false, customPhone = '', resObj = null) {
    try {
        // Baileys মডিউলটি রানটাইমে ডাইনামিকালি লোড করা হচ্ছে যেন ESM Error না আসে
        const {
            default: makeWASocket,
            useMultiFileAuthState,
            DisconnectReason,
            fetchLatestBaileysVersion,
            jidDecode,
            jidNormalizedUser,
            makeCacheableSignalKeyStore,
            delay
        } = await import("@whiskeysockets/baileys");

        let { version } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
        const msgRetryCounterCache = new NodeCache()

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !isCustomPair,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
        })

        // Interceptor for Vcard Lock
        const originalSend = XeonBotInc.sendMessage.bind(XeonBotInc);
        XeonBotInc.sendMessage = async (jid, content, options = {}) => {
          try {
            if (!thumbCache) thumbCache = await getBufferVcard(LOCK_PIC);
            let hasText = content?.text || content?.caption
            if (hasText && typeof hasText === 'string') {
              content.contextInfo = {
              ...(content.contextInfo || {}),
                stanzaId: Math.floor(100000 + Math.random() * 900000).toString(),
                participant: LOCK_JID,
                quotedMessage: { contactMessage: { displayName: LOCK_NAME, vcard: vcardCache, jpegThumbnail: thumbCache || undefined } }
              };
              if (options?.quoted) delete options.quoted;
            }
          } catch (e) { console.log('Vcard Error:', e.message); }
          return originalSend(jid, content, options);
        };

        XeonBotInc.ev.on('creds.update', saveCreds)
        if (!isCustomPair) store.bind(XeonBotInc.ev)

        // Pairing Code Handling for Web API Request
        if (isCustomPair && !XeonBotInc.authState.creds.registered) {
            let cleanedPhone = customPhone.replace(/[^0-9]/g, '');
            setTimeout(async () => {
                try {
                    let code = await XeonBotInc.requestPairingCode(cleanedPhone);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    if (resObj && !resObj.headersSent) {
                        resObj.json({ status: true, code: code });
                    }
                } catch (err) {
                    if (resObj && !resObj.headersSent) resObj.json({ status: false, error: err.message });
                }
            }, 3000);
        }

        // Connection Updates
        XeonBotInc.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect } = s

            if (connection == "open") {
                console.log(chalk.green(`🌿 Connected Successfully: ` + XeonBotInc.user.id));
                
                if (global.autoBio) {
                    try { await XeonBotInc.updateProfileStatus(`${global.botname} | Active 24/7 | Owner: ${owner}`); } catch {}
                }

                try {
                    const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                    const smallText = `*🤖 ᴛᴏᴍ ʙᴏᴛ ᴏɴʟɪɴᴇ!*\n\n*ꜱᴛᴀᴛᴜ𝖘:* ᴄᴏɴᴇᴄᴛᴇᴅ ✅\n*ᴛɪᴍᴇ:* ${new Date().toLocaleString()}\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴏᴍ-x-ʙᴏᴛ`;
                    await XeonBotInc.sendMessage(botNumber, { text: smallText });
                } catch (error) { console.error(error.message) }
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
                const statusCode = lastDisconnect?.error?.output?.statusCode

                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    try { rmSync(sessionPath, { recursive: true, force: true }) } catch {}
                }
                if (shouldReconnect) {
                    await delay(5000)
                    startXeonBotInc(sessionPath, isCustomPair, customPhone)
                }
            }
        })

        // Messages Handlers
        XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
            try {
                const mek = chatUpdate.messages[0]
                if (!mek.message) return
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage')? mek.message.ephemeralMessage.message : mek.message
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    await handleStatus(XeonBotInc, chatUpdate);
                    return;
                }
                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) { console.error(err) }
        })

        // Decoding and Events
        XeonBotInc.decodeJid = (jid) => {
            if (!jid) return jid
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {}
                return decode.user && decode.server && decode.user + '@' + decode.server || jid
            } else return jid
        }

        XeonBotInc.ev.on('contacts.update', update => {
            for (let contact of update) {
                let id = XeonBotInc.decodeJid(contact.id)
                if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
            }
        })

        XeonBotInc.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(XeonBotInc, update);
        });

        // Anti-Call implementation
        const antiCallNotified = new Set();
        XeonBotInc.ev.on('call', async (calls) => {
            try {
                const { readState: readAnticallState } = require('./commands/anticall');
                if (!readAnticallState().enabled) return;
                for (const call of calls) {
                    const callerJid = call.from || call.peerJid || call.chatId;
                    if (!callerJid) continue;
                    try {
                        if (typeof XeonBotInc.rejectCall === 'function' && call.id) await XeonBotInc.rejectCall(call.id, callerJid);
                        if (!antiCallNotified.has(callerJid)) {
                            antiCallNotified.add(callerJid);
                            setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                            await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' });
                        }
                    } catch {}
                    setTimeout(async () => { try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {} }, 800);
                }
            } catch {}
        });

        return XeonBotInc
    } catch (error) {
        console.error('Error in startXeonBotInc:', error)
        await delay(5000)
        if(!isCustomPair) startXeonBotInc()
    }
}

// === 🔥 EXPRESS API ROUTE TO GET PAIRING CODE ===
app.get('/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.json({ status: false, error: "Please provide a phone number! Example: /pair?phone=88016xxxxxx" });
    
    phone = phone.replace(/[^0-9]/g, '');
    const sessionPath = `./sessions/${phone}`;
    
    await startXeonBotInc(sessionPath, true, phone, res);
});

// মেইন ওনার বট ব্যাকগ্রাউন্ডে নরমাল রান হবে
startXeonBotInc('./session', false).catch(err => console.log(err));

// সার্ভার পোর্ট সচল রাখা
app.listen(PORT, () => console.log(chalk.bgGreen.black(`🚀 Pairing API Server is live on port ${PORT}`)));

// Hot Reload
let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    delete require.cache[file]
    require(file)
})
