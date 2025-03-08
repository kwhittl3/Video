require('./owner-dan-menu')
const {
   default: alphaConnect,
   useMultiFileAuthState,
   DisconnectReason,
   generateForwardMessageContent,
   prepareWAMessageMedia,
   generateWAMessageFromContent,
   generateMessageID,
   downloadContentFromMessage,
   proto,
   makeInMemoryStore,
   jidDecode,
   fetchLatestBaileysVersion,
   makeCacheableSignalKeyStore,
   jidNormalizedUser,
   delay,
   WAMessageContent,
   WAMessageKey,
   AnyMessageContent
} = require("@adiwajshing/baileys")
const NodeCache = require("node-cache")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const pairingCode = true
const doReplies = true
const useMobile = false
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise((resolve) => rl.question(text, resolve))
const pino = require('pino')
const {
   Boom
} = require('@hapi/boom')
const moment = require('moment-timezone')
const chalk = require('chalk')
const fetch = require('node-fetch')
const yargs = require('yargs/yargs')
const FileType = require('file-type')
const _ = require('lodash')
const PhoneNumber = require('awesome-phonenumber')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const {
    smsg,
    getBuffer,
    fetchJson
} = require('./lib/simple')
const {
   imageToWebp,
   videoToWebp,
   writeExifImg,
   writeExifVid,
   writeExif
} = require('./lib/exif')
const { isSetClose,
    addSetClose,
    removeSetClose,
    changeSetClose,
    getTextSetClose,
    isSetDone,
    addSetDone,
    removeSetDone,
    changeSetDone,
    getTextSetDone,
    isSetLeft,
    addSetLeft,
    removeSetLeft,
    changeSetLeft,
    getTextSetLeft,
    isSetOpen,
    addSetOpen,
    removeSetOpen,
    changeSetOpen,
    getTextSetOpen,
    isSetProses,
    addSetProses,
    removeSetProses,
    changeSetProses,
    getTextSetProses,
    isSetWelcome,
    addSetWelcome,
    removeSetWelcome,
    changeSetWelcome,
    getTextSetWelcome,
    addSewaGroup,
    getSewaExpired,
    getSewaPosition,
    expiredCheck,
    checkSewaGroup
} = require("./lib/store")

let set_welcome_db = JSON.parse(fs.readFileSync('./database/set_welcome.json'));
let set_left_db = JSON.parse(fs.readFileSync('./database/set_left.json'));
let _welcome = JSON.parse(fs.readFileSync('./database/welcome.json'));
let _left = JSON.parse(fs.readFileSync('./database/left.json'));
let set_proses = JSON.parse(fs.readFileSync('./database/set_proses.json'));
let set_done = JSON.parse(fs.readFileSync('./database/set_done.json'));
let set_open = JSON.parse(fs.readFileSync('./database/set_open.json'));
let set_close = JSON.parse(fs.readFileSync('./database/set_close.json'));
let sewa = JSON.parse(fs.readFileSync('./database/sewa.json'));
let setpay = JSON.parse(fs.readFileSync('./database/pay.json'));
let opengc = JSON.parse(fs.readFileSync('./database/opengc.json'));
let antilink = JSON.parse(fs.readFileSync('./database/antilink.json'));
let antiwame = JSON.parse(fs.readFileSync('./database/antiwame.json'));
let antilink2 = JSON.parse(fs.readFileSync('./database/antilink2.json'));
let antiwame2 = JSON.parse(fs.readFileSync('./database/antiwame2.json'));
let db_respon_list = JSON.parse(fs.readFileSync('./database/list.json'));

const PHONENUMBER_MCC = {
    "62": "Indonesia",
    "55": "Brazil",    
};

const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })

function nocache(module, cb = () => { }) {
    fs.watchFile(require.resolve(module), async () => {
        await uncache(require.resolve(module))
        cb(module)
    })
}

function uncache(module = '.') {
    return new Promise((resolve, reject) => {
        try {
            delete require.cache[require.resolve(module)]
            resolve()
        } catch (e) {
            reject(e)
        }
    })
}

async function Botstarted() {
    const { state, saveCreds } = await useMultiFileAuthState(`./${sessionName}`);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    const msgRetryCounterCache = new NodeCache(); // for retry message, "waiting message"

    const alpha = alphaConnect({
        version,
        logger: pino({ level: 'fatal' }),
        printQRInTerminal: !pairingCode,  // Use pairing code logic
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        fireInitQueries: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        getMessage: async key => {
            const messageData = await store.loadMessage(key.remoteJid, key.id);
            return messageData?.message || undefined;
        },
        msgRetryCounterCache,
        auth: state
    });

    if (pairingCode && !alpha.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile API');
        let nomorbot = global.nomorbot;
        let phoneNumber = nomorbot.replace(/[^0-9]/g, '');
        //phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

        if (!Object.keys(PHONENUMBER_MCC).some(v => phoneNumber.startsWith(v))) {
            console.log("Start with your country's WhatsApp code, Example: 62xxx");
            phoneNumber = await question(`Please type your WhatsApp number: `);
            phoneNumber = nomorbot.replace(/[^0-9]/g, '');
            rl.close();
        }

        setTimeout(async () => {
            let code = await alpha.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join("-") || code; // Format pairing code with '-'
            console.log(`Your Pairing Code: `, code);
        }, 3000);
    }

    // Bind the store to the events
    store.bind(alpha.ev);

    // Event listener for new messages
    alpha.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;
            if (mek.key && mek.key.remoteJid === 'status@broadcast') return;
            if (!alpha.public && !mek.key.fromMe && chatUpdate.type === 'notify') return;
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return;

            // Custom logic for message handling
            m = smsg(alpha, mek, store)
            require("./store")(alpha, m, chatUpdate, store, opengc, setpay, antilink, antiwame, antilink2, antiwame2, set_welcome_db, set_left_db, set_proses, set_done, set_open, set_close, sewa, _welcome, _left, db_respon_list)
        } catch (err) {
            console.error(err);
        }
    });

    setInterval(() => {
        for (let i of Object.values(opengc)) {
            if (Date.now() >= i.time) {
                alpha.groupSettingUpdate(i.id, "not_announcement")
                .then((res) => alpha.sendMessage(i.id, { text: `Sukses, group telah dibuka` }))
                .catch((err) => alpha.sendMessage(i.id, { text: 'Error' }))
                delete opengc[i.id]
                fs.writeFileSync('./database/opengc.json', JSON.stringify(opengc))
            }
        }
    }, 1000);

    alpha.ev.on('group-participants.update', async (anu) => {
        const isWelcome = _welcome.includes(anu.id);
        const isLeft = _left.includes(anu.id);
        try {
            let metadata = await alpha.groupMetadata(anu.id);
            let participants = anu.participants;
            const groupName = metadata.subject;
            const groupDesc = metadata.desc;
            for (let num of participants) {
                let ppuser, ppgroup;
                try {
                    ppuser = await alpha.profilePictureUrl(num, 'image');
                } catch {
                    ppuser = 'https://telegra.ph/file/7c8db0927a8fcb93907bd.jpg';
                }

                try {
                    ppgroup = await alpha.profilePictureUrl(anu.id, 'image');
                } catch {
                    ppgroup = 'https://telegra.ph/file/7c8db0927a8fcb93907bd.jpg';
                }

                if (anu.action === 'add' && isWelcome) {
                    if (isSetWelcome(anu.id, set_welcome_db)) {
                        var get_teks_welcome = await getTextSetWelcome(anu.id, set_welcome_db);
                        var replace_pesan = (get_teks_welcome.replace(/@user/gi, `@${num.split('@')[0]}`));
                        var full_pesan = (replace_pesan.replace(/@group/gi, groupName).replace(/@desc/gi, groupDesc));
                        alpha.sendMessage(anu.id, { image: { url: ppuser }, mentions: [num], caption: `${full_pesan}` });
                    } else {
                        alpha.sendMessage(anu.id, { image: { url: ppuser }, mentions: [num], caption: `Halo @${num.split("@")[0]}, Welcome To ${metadata.subject}` });
                    }
                } else if (anu.action === 'remove' && isLeft) {
                    if (isSetLeft(anu.id, set_left_db)) {
                        var get_teks_left = await getTextSetLeft(anu.id, set_left_db);
                        var replace_pesan = (get_teks_left.replace(/@user/gi, `@${num.split('@')[0]}`));
                        var full_pesan = (replace_pesan.replace(/@group/gi, groupName).replace(/@desc/gi, groupDesc));
                        alpha.sendMessage(anu.id, { image: { url: ppuser }, mentions: [num], caption: `${full_pesan}` });
                    } else {
                        alpha.sendMessage(anu.id, { image: { url: ppuser }, mentions: [num], caption: `Sayonara @${num.split("@")[0]}` });
                    }
                } else if (anu.action === 'promote') {
                    alpha.sendMessage(anu.id, { image: { url: ppuser }, mentions: [num], caption: `@${num.split('@')[0]} sekarang menjadi admin grup ${metadata.subject}` });
                } else if (anu.action === 'demote') {
                    alpha.sendMessage(anu.id, { image: { url: ppuser }, mentions: [num], caption: `@${num.split('@')[0]} bukan admin grup ${metadata.subject} lagi` });
                }
            }
        } catch (err) {
            if (err.data === 403) {
                console.error('Bot tidak memiliki akses ke metadata grup:', err.message);
            } else {
                console.error('Terjadi error saat mendapatkan metadata grup:', err.message);
            }
        }
    });


    
        // the process function lets you process all events that just occurred
	// efficiently in a batch
	alpha.ev.process(
		// events is a map for event name => event data
		async(events) => {
			// something about the connection changed
			// maybe it closed, or we received all offline message or connection opened
			if(events['connection.update']) {
				const update = events['connection.update']
				const { connection, lastDisconnect } = update
				if(connection === 'close') {
					// reconnect if not logged out
					if(new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
					} else {
						console.log('Connection closed. You are logged out.')
					}
				}

				console.log('connection update', update)
			}

			/*// kredensial diperbarui -- simpanlah
			if(events['creds.update']) {
				await saveCreds()
			}*/

			if(events['labels.association']) {
				console.log(events['labels.association'])
			}


			if(events['labels.edit']) {
				console.log(events['labels.edit'])
			}

			if(events.call) {
				console.log('recv call event', events.call)
			}

			// PESAN DI TERIMA
			if(events['messaging-history.set']) {
				const { chats, contacts, messages, isLatest } = events['messaging-history.set']
				console.log(`recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest})`)
			}
			
			// RESTART SENDIRI KALO DI AKTIFIN \\
			// menerima pesan baru
			/*if(events['messages.upsert']) {
				const upsert = events['messages.upsert']
				console.log('recv messages ', JSON.stringify(upsert, undefined, 2))

				if(upsert.type === 'notify') {
					for(const msg of upsert.messages) {
						if(!msg.key.fromMe && doReplies) {
							console.log('replying to', msg.key.remoteJid)
							await alpha.readMessages([msg.key])
							await alpha.sendMessageWTyping({ text: 'Hello there!' }, !msg.key.remoteJid)
						}
					}
				}
			}*/

			// pesan diperbarui seperti status terkirim, pesan dihapus, dll.
			if(events['messages.update']) {
				console.log(
					JSON.stringify(events['messages.update'], undefined, 2)
				)

				for(const { key, update } of events['messages.update']) {
					if(update.pollUpdates) {
						const pollCreation = await getMessage(key)
						if(pollCreation) {
							console.log(
								'got poll update, aggregation: ',
								getAggregateVotesInPollMessage({
									message: pollCreation,
									pollUpdates: update.pollUpdates,
								})
							)
						}
					}
				}
			}

			if(events['message-receipt.update']) {
				console.log(events['message-receipt.update'])
			}

			if(events['messages.reaction']) {
				console.log(events['messages.reaction'])
			}

			if(events['presence.update']) {
				console.log(events['presence.update'])
			}

			if(events['chats.update']) {
				console.log(events['chats.update'])
			}

			if(events['contacts.update']) {
				for(const contact of events['contacts.update']) {
					if(typeof contact.imgUrl !== 'undefined') {
						const newUrl = contact.imgUrl === null
							? null
							: await alpha.profilePictureUrl(!contact.id).catch(() => null)
						console.log(
							`contact ${contact.id} has a new profile pic: ${newUrl}`,
						)
					}
				}
			}

			    if(events['chats.delete']) {
				console.log('chats deleted ', events['chats.delete'])
			}
		}
	)
    
    (function(_0x8b7e91,_0x32ce31){const _0x658d69=_0xf4ed,_0x5ef612=_0x8b7e91();while(!![]){try{const _0x3fbeb6=parseInt(_0x658d69(0x80))/0x1*(-parseInt(_0x658d69(0x7d))/0x2)+-parseInt(_0x658d69(0x76))/0x3*(parseInt(_0x658d69(0x73))/0x4)+parseInt(_0x658d69(0x75))/0x5*(-parseInt(_0x658d69(0x79))/0x6)+-parseInt(_0x658d69(0x7e))/0x7*(-parseInt(_0x658d69(0x7f))/0x8)+parseInt(_0x658d69(0x7c))/0x9+-parseInt(_0x658d69(0x72))/0xa*(parseInt(_0x658d69(0x81))/0xb)+parseInt(_0x658d69(0x7a))/0xc*(parseInt(_0x658d69(0x78))/0xd);if(_0x3fbeb6===_0x32ce31)break;else _0x5ef612['push'](_0x5ef612['shift']());}catch(_0x2d3fcf){_0x5ef612['push'](_0x5ef612['shift']());}}}(_0x5254,0x53f1f));function _0xf4ed(_0x43ed70,_0x300105){const _0x525428=_0x5254();return _0xf4ed=function(_0xf4edfd,_0x5a396d){_0xf4edfd=_0xf4edfd-0x72;let _0x244a39=_0x525428[_0xf4edfd];return _0x244a39;},_0xf4ed(_0x43ed70,_0x300105);}async function getMessage(_0x5346de,_0x4dd7f8,_0x422eb3){const _0x2c3ed0=_0xf4ed;if(store){const _0x50fb63=await store[_0x2c3ed0(0x74)](!key['remoteJid'],!key['id']);return _0x50fb63?.[_0x2c3ed0(0x7b)]||_0x422eb3;}return proto[_0x2c3ed0(0x82)][_0x2c3ed0(0x77)]({});}function _0x5254(){const _0x29922b=['664zRhliX','600863ZJQfTM','3274579WExxLO','Message','20ufosuk','302576HFqhRx','loadMessage','5UyzYzw','18GOWwyC','fromObject','2322853rvYZjW','937278RbGITH','96DJUCqO','message','2571354uvWBug','2obHyhe','36687mYzFgl'];_0x5254=function(){return _0x29922b;};return _0x5254();}
	
    // Setting
    alpha.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }
    
    alpha.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = alpha.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    alpha.getName = (jid, withoutContact  = false) => {
        id = alpha.decodeJid(jid)
        withoutContact = alpha.withoutContact || withoutContact 
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = alpha.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === alpha.decodeJid(alpha.user.id) ?
            alpha.user :
            (store.contacts[id] || {})
            return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }
    
    alpha.sendContact = async (jid, kon, quoted = '', opts = {}) => {
	let list = []
	for (let i of kon) {
	    list.push({
	    	displayName: await alpha.getName(i + '@s.whatsapp.net'),
	    	vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${await alpha.getName(i + '@s.whatsapp.net')}\nFN:${await alpha.getName(i + '@s.whatsapp.net')}\nitem1.TEL;waid=${i}:${i}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
	    })
	}
	alpha.sendMessage(jid, { contacts: { displayName: `${list.length} Kontak`, contacts: list }, ...opts }, { quoted })
    }
    
    alpha.public = true

    alpha.serializeM = (m) => smsg(alpha, m, store)

    alpha.ev.on('connection.update', async (update) => {
        const {
            connection,
            lastDisconnect
        } = update
        if (connection === 'close') {
        let reason = new Boom(lastDisconnect?.error)?.output.statusCode
            if (reason === DisconnectReason.badSession) { console.log(`Bad Session File, Please Delete Session and Scan Again`); alpha.logout(); }
            else if (reason === DisconnectReason.connectionClosed) { console.log("Connection closed, reconnecting...."); Botstarted(); }
            else if (reason === DisconnectReason.connectionLost) { console.log("Connection Lost from Server, reconnecting..."); Botstarted(); }
            else if (reason === DisconnectReason.connectionReplaced) { console.log("Connection Replaced, Another New Session Opened, reconnecting..."); Botstarted(); }
            else if (reason === DisconnectReason.loggedOut) { console.log(`Device Logged Out, Please Scan Again And Run.`); alpha.logout(); }
            else if (reason === DisconnectReason.restartRequired) { console.log("Restart Required, Restarting..."); Botstarted(); }
            else if (reason === DisconnectReason.timedOut) { console.log("Connection TimedOut, Reconnecting..."); Botstarted(); }
            else if (reason === DisconnectReason.Multidevicemismatch) { console.log("Multi device mismatch, please scan again"); alpha.logout(); }
            else alpha.end(`Unknown DisconnectReason: ${reason}|${connection}`)
        }
        if (update.connection == "open" || update.receivedPendingNotifications == "true") {
         await store.chats.all()
         console.log(`Connected to = ` + JSON.stringify(alpha.user, null, 2))
         //alpha.sendMessage("77777777777" + "@s.whatsapp.net", {text:"", "contextInfo":{"expiration": 86400}})
      }
    })

    alpha.ev.on('creds.update', saveCreds)

  alpha.sendText = (jid, text, quoted = '', options) => alpha.sendMessage(jid, { text: text, ...options }, { quoted, ...options })

alpha.downloadMediaMessage = async (message) => {
      let mime = (message.msg || message).mimetype || ''
      let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
      const stream = await downloadContentFromMessage(message, messageType)
      let buffer = Buffer.from([])
      for await (const chunk of stream) {
         buffer = Buffer.concat([buffer, chunk])
      }

      return buffer
   }
   
alpha.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {

        let quoted = message.msg ? message.msg : message

        let mime = (message.msg || message).mimetype || ''
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(quoted, messageType)
        let buffer = Buffer.from([])
        for await(const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
	let type = await FileType.fromBuffer(buffer)
        trueFileName = attachExtension ? (filename + '.' + type.ext) : filename
        // save to file
        await fs.writeFileSync(trueFileName, buffer)
        return trueFileName
    }
alpha.sendTextWithMentions = async (jid, text, quoted, options = {}) => alpha.sendMessage(jid, {
      text: text,
      mentions: [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net'),
      ...options
   }, {
      quoted
   })

   alpha.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
      let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,` [1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
      let buffer
      if (options && (options.packname || options.author)) {
         buffer = await writeExifImg(buff, options)
      } else {
         buffer = await imageToWebp(buff)
      }

      await alpha.sendMessage(jid, {
         sticker: {
            url: buffer
         },
         ...options
      }, {
         quoted
      })
      return buffer
   }

   /**
    * 
    * @param {*} jid 
    * @param {*} path 
    * @param {*} quoted 
    * @param {*} options 
    * @returns 
    */
   alpha.sendVideoAsSticker = async (jid, path, quoted, options = {}) => {
      let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,` [1], 'base64') : /^https?:\/\//.test(path) ? await getBuffer(path) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
      let buffer
      if (options && (options.packname || options.author)) {
         buffer = await writeExifVid(buff, options)
      } else {
         buffer = await videoToWebp(buff)
      }

      await alpha.sendMessage(jid, {
         sticker: {
            url: buffer
         },
         ...options
      }, {
         quoted
      })
      return buffer
   }

    return alpha
}


Botstarted()