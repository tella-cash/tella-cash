interface IncomingMessage {
  fromNumber: string;
  text: string;
  profileName?: string;
}

export async function handleIncomingMessage(
  message: IncomingMessage,
): Promise<string> {
  const text = message.text.trim().toLowerCase();
  const name = message.profileName?.split(" ")[0] ?? "there";

  if (!text) {
    return `Hi ${name}! Send me a message like "send 5k to chuks" or "how much did i spend this week" to get started.`;
  }

  if (text === "ping") return "pong ✓";

  if (text.includes("help") || text === "hi" || text === "hello") {
    return [
      `Hey ${name} 👋 I'm U-Pay.`,
      "",
      "Try one of these:",
      '• "send 5k to chuks"',
      '• "how much did i spend last week?"',
      '• "what\'s my balance?"',
      "",
      "I'll always confirm before moving any money.",
    ].join("\n");
  }

  return `I got your message: "${message.text}". (LLM not wired up yet.)`;
}