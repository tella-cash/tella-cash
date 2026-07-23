/**
 * Conversational reply pools.
 *
 * Each intent maps to several phrasings; `pickReply` chooses one at random
 * so the bot doesn't repeat itself and feel robotic. These are presentation
 * strings only — no money-moving logic lives here. `{name}` and `{address}`
 * are interpolated per message.
 */

export type ReplyVars = { name?: string; address?: string };

function fill(template: string, vars: ReplyVars): string {
  return template
    .replace(/\{name\}/g, vars.name?.trim() || "there")
    .replace(/\{address\}/g, vars.address ?? "");
}

/** Pick a random entry from a non-empty pool and interpolate vars. */
export function pickReply(pool: readonly string[], vars: ReplyVars = {}): string {
  const choice = pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
  return fill(choice, vars);
}

export const REPLIES = {
  greeting: [
    "Hey {name}! 👋\n\nWhat can I do for you? You can check your *balance*, grab your *address*, or *send* USDC.",
    "Hi {name}! 😊 Good to see you.\n\nAsk me for your balance, your wallet address, or say something like *send 5 usdc to +234…*",
    "Yo {name}! 👋 I'm right here.\n\nWant your balance, your deposit address, or to send some USDC?",
    "Hello {name}! 🌟\n\nI can show your *balance*, share your *address*, or move *USDC* for you. What's up?",
    "Hey there {name}! Ready when you are.\n\nTry: *balance* · *my address* · *send 5 to +234…*",
  ],

  help: [
    "Here's what I can do, {name} 👇\n\n• *Balance* — \"what's my balance?\"\n• *Address* — \"what's my address?\"\n• *Send* — \"send 5 usdc to +234…\"\n• *Send to a wallet* — \"send 5 usdc to 0x…\"\n• *Faucet* — \"faucet usdc\" (testnet tokens)",
    "Happy to help, {name}! These all work:\n\n• \"balance\"\n• \"my address\"\n• \"send 5 usdc to +234…\"\n• \"send 5 usdc to 0x…\"\n• \"faucet\" (grab testnet tokens)",
    "No problem {name} — here are your options:\n\n💰 Check balance\n📥 Get your address\n💸 Send USDC to a number or 0x address\n🚿 Faucet — grab testnet tokens\n\nJust type what you want to do.",
    "I've got you, {name}. Things you can ask:\n\n• *What's my balance?*\n• *What's my address?*\n• *Send 5000 to +234…*\n• *Faucet usdc* — get testnet tokens",
    "Here's the menu, {name} 📋\n\n• Balance → see your funds\n• Address → receive USDC\n• Send → \"send 5 usdc to +234…\"\n• Faucet → \"faucet usdc\" for testnet tokens\n\nWhat would you like?",
  ],

  about: [
    "I'm *tella*, your money companion right here in WhatsApp 💚\n\nI hold a USDC wallet for you so you can send and receive money just by texting — no app to download, no seed phrases.",
    "Great question, {name}! *tella* lets you send and receive *USDC* over WhatsApp.\n\nYou get a real wallet, but you talk to it in plain language — like \"send 5 to +234…\".",
    "*tella* is a chat-native wallet 💸\n\nI manage a secure USDC wallet for you and handle the blockchain bits behind the scenes. You just message me.",
    "I'm tella — think of me as a friend who happens to hold your USDC 👛\n\nSend, receive, check your balance… all from this chat.",
    "tella = money over WhatsApp, {name} 🚀\n\nNo app, no jargon. You get a USDC wallet and I handle the rest. Ask me \"how does this work?\" to learn more.",
  ],

  howItWorks: [
    "Here's the gist, {name} ✨\n\n1️⃣ You get a USDC wallet (already set up)\n2️⃣ Fund it by sending USDC to your address\n3️⃣ Send to anyone with \"send 5 usdc to +234…\"\n4️⃣ Approve each send with your PIN — done!",
    "Simple flow 👇\n\n• Tell me to send → I prepare it\n• You tap the link and confirm with your PIN\n• I move the USDC on Arc and send you the receipt\n\nYou approve every single send. Always.",
    "It works like texting money, {name}:\n\n📥 Receive at your address\n💸 Send by number or 0x address\n🔐 Confirm with your PIN\n\nThat's it — no apps, no seed phrases.",
    "Behind the scenes I run a real USDC wallet for you on Arc. You just chat.\n\nEvery send needs your PIN confirmation, so nothing moves without you.",
  ],

  fees: [
    "tella doesn't charge you to chat or hold USDC, {name} 🙌\n\nSends pay a small network fee on Arc, and I handle that automatically — no surprises.",
    "No subscription, no hidden charges 💚\n\nThe only cost is the tiny Arc network fee on a send, which is taken care of for you.",
    "Good news — using tella is free. Sending USDC has a small blockchain network fee, but it's handled behind the scenes.",
    "I don't add fees on top, {name}. Network fees on Arc are minimal and managed for you when you send.",
  ],

  security: [
    "Totally fair to ask, {name} 🔐\n\nEvery send needs *your* PIN confirmation in the browser — I can't move funds on my own. Nothing leaves your wallet without you approving it.",
    "Your safety matters 💚\n\n• You approve every send with a PIN\n• Confirmations happen on a secure page, not in chat\n• I never ask for your full PIN over WhatsApp",
    "Security first, {name}. No send goes through until you tap the confirm link and enter your PIN. A \"yes\" in chat alone never moves money.",
    "I take this seriously 🛡️\n\nMoney only moves after you confirm with your PIN on the secure page. If something ever looks off, just reply *no* to cancel.",
  ],

  thanks: [
    "Anytime, {name}! 💚",
    "You're welcome! 🙌 Anything else?",
    "Of course, {name} 😊 I'm here whenever you need me.",
    "No problem at all! Let me know if you want to send or check your balance.",
    "Happy to help! 🌟",
  ],

  goodbye: [
    "See you, {name}! 👋 I'm here whenever you need me.",
    "Take care! 💚 Just message me anytime.",
    "Bye for now, {name} 👋 Your wallet's safe with me.",
    "Catch you later! Ping me whenever.",
  ],

  affirm: [
    "👍 Great! What would you like to do — *balance*, *address*, or a *send*?",
    "Cool, {name}! Tell me the next move: check balance, get your address, or send USDC.",
    "Got it 😊 Say the word — \"balance\", \"my address\", or \"send 5 to +234…\".",
    "Alright! I'm ready when you are, {name}.",
  ],

  cancelNothing: [
    "Nothing to cancel right now, {name} 🙂 You're all set.",
    "No pending action to stop — you're good!",
    "Nothing in progress, {name}. Want to start a send or check your balance?",
    "All clear — there's nothing waiting to be cancelled.",
  ],

  sendHelp: [
    "I can send USDC for you, {name}! Just tell me the amount and who to:\n\n• *send 5 usdc to +234…* (a phone number)\n• *send 5 usdc to 0x…* (a wallet address)",
    "Happy to send that 💸 I just need it in this shape:\n\n*send 5 usdc to +234…*\nor\n*send 5 usdc to 0x…*",
    "To send, give me an amount and a destination, {name}:\n\n\"send 10 usdc to +234…\"\n\"send 10 usdc to 0x…\"",
    "Almost! Try it like this:\n\n*send <amount> usdc to <number, 0x address, or saved name>*\n\ne.g. \"send 5 usdc to +234801…\"",
    "Sure thing! Tell me how much and to whom:\n\n• by number → \"send 5 usdc to +234…\"\n• by wallet → \"send 5 usdc to 0x…\"",
  ],

  unknown: [
    "I'm not totally sure what you meant there, {name} 🤔\n\nI can help with your *balance*, your *address*, or a *send*. Try one of those?",
    "Hmm, I didn't quite catch that 😅\n\nYou can say: *balance* · *my address* · *send 5 usdc to +234…*",
    "Not sure how to help with that one, {name}. Here's what I'm good at:\n\n💰 balance · 📥 address · 💸 send USDC",
    "I might've missed that 🙈 Want to check your *balance*, get your *address*, or *send* some USDC?",
    "Let me point you the right way, {name} 👇\n\n• \"what's my balance?\"\n• \"what's my address?\"\n• \"send 5 usdc to +234…\"",
    "I didn't understand that, but I'm still here 😊 Try *balance*, *address*, or *send 5 to +234…*.",
  ],

  empty: [
    "Did you mean to send something, {name}? 🙂 Try \"balance\" or \"send 5 usdc to +234…\".",
    "I'm here! Say \"my address\", \"balance\", or \"send 5 to +234…\".",
    "Looks like an empty message 😄 What can I do for you, {name}?",
    "Ready when you are! Try \"balance\" or \"send 5 usdc to +234…\".",
  ],

  // The address itself is sent as its own follow-up message (see
  // handler.ts's `followUp` field) — nothing else in that bubble, so a
  // long-press → Copy grabs exactly the address and nothing else.
  address: [
    "Here's your tella wallet address, {name} 📥 Tap and hold the message below to copy it.\n\nSend USDC here on Arc to top up.",
    "Your address for receiving USDC — tap and hold the next message to copy it.\n\nAnything sent here on Arc lands in your wallet, {name}.",
    "Got it 👇 Tap and hold the message below to copy your address.\n\nShare it freely to get paid.",
    "Your wallet address is coming up next, {name} — tap and hold it to copy.\n\nFund up by sending USDC to it on Arc.",
  ],

  walletPending: [
    "Your wallet's still being set up, {name} ⏳ Give it a moment and ask again.",
    "Almost there — your wallet is still provisioning. Try again in a few seconds!",
    "Hang tight, {name}! I'm still setting up your wallet. Ask me again shortly.",
  ],

  walletNotReady: [
    "Your wallet isn't ready just yet, {name}. I'll have another go at setting it up shortly.",
    "Looks like your wallet still needs setting up — I'll retry automatically. Try again in a bit.",
    "Give me a moment, {name} — your wallet isn't active yet. I'll sort it out.",
  ],

  balanceIntro: [
    "Here's what you've got, {name} 💰",
    "Your balance:",
    "You're holding:",
    "Here's your wallet right now, {name}:",
    "Current balance 👇",
  ],

  // Same deal as `address` — the address ships as its own follow-up
  // message so it's cleanly copyable on its own.
  balanceEmpty: [
    "Your wallet's empty right now, {name} 👀 Fund it by sending USDC to the address below — tap and hold to copy it.",
    "Nothing in your wallet yet! Top up by sending USDC to the address coming up next.",
    "You're at zero for now, {name}. Send USDC to the address below to fund up — tap and hold to copy.",
    "Empty wallet 👛 Add USDC by sending to the address below.",
  ],

  balanceError: [
    "I couldn't fetch your balance just now, {name}. Try again in a moment?",
    "Hmm, balance check failed — give it another try shortly.",
    "Something went wrong getting your balance, {name}. One more try in a sec?",
  ],

  faucetSuccess: [
    "✓ Sent, {name}! Testnet tokens are on the way to your wallet — check your *balance* in a moment.",
    "Done! 🚿 That should land in your wallet shortly, {name}. Try *balance* in a bit to see it.",
    "Requested! Give the network a moment, then check your *balance*, {name}.",
  ],

  faucetInvalidAsset: [
    "I can only send *native gas*, *USDC*, or *EURC* from the testnet faucet, {name}. Which one would you like?",
    "That's not one the faucet offers, {name} — pick *native*, *USDC*, or *EURC*.",
    "Not a faucet option, {name}. Try *native* (gas), *USDC*, or *EURC*.",
  ],

  faucetRateLimited: [
    "Looks like you've already tapped the faucet recently, {name} — try again later.",
    "The faucet's on cooldown for your wallet right now. Give it a while and try again.",
    "Already claimed recently, {name}! The faucet resets after a bit — try again later.",
  ],

  faucetError: [
    "The faucet didn't come through just now, {name}. Try again in a moment?",
    "Hmm, that faucet request failed — give it another try shortly.",
    "Something went wrong requesting testnet tokens, {name}. One more try in a sec?",
  ],

  faucetWebFallback: [
    "I can't tap the faucet for you directly, {name} — but you can grab testnet tokens yourself 🚿\n\n1. Open https://faucet.circle.com\n2. Pick *Arc Testnet*\n3. Paste your address (next message — tap and hold to copy)",
    "The faucet isn't answering me, {name}, but it'll answer *you*: head to https://faucet.circle.com, choose *Arc Testnet*, and paste in your address — I'll send it right after this so you can copy it.",
    "No luck from here, {name} — use Circle's faucet page instead: https://faucet.circle.com\n\nSelect *Arc Testnet* and drop in your wallet address (coming up next, tap and hold to copy).",
  ],
} as const;
