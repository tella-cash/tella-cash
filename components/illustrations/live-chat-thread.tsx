"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Single message turn in the looping thread. `kind` controls render shape:
 *   - `bubble`: a chat bubble with text
 *   - `typing`: the three-dot typing indicator (no text)
 *   - `receipt`: the success-state transaction card
 */
type Turn =
  | { kind: "bubble"; side: "in" | "out"; text: string; time: string }
  | { kind: "typing"; side: "in" | "out" }
  | {
      kind: "receipt";
      amount: string;
      recipient: string;
      reference: string;
      time: string;
    };

/**
 * Scripted conversation. The hero's job is to show the product working
 * in 10 seconds — keep it tight, end on a successful transfer so the
 * loop concludes on a high note rather than mid-thought.
 *
 * Timing per turn: each Turn stays visible for `displayMs` after it
 * appears, then the next Turn renders. Typing indicators have shorter
 * dwell so the rhythm feels conversational, not mechanical.
 */
const SCRIPT: { turn: Turn; displayMs: number }[] = [
  {
    turn: { kind: "bubble", side: "out", text: "send 5 to chuks", time: "9:14" },
    displayMs: 1400,
  },
  { turn: { kind: "typing", side: "in" }, displayMs: 900 },
  {
    turn: {
      kind: "bubble",
      side: "in",
      text: "Send 5 USDC to Chuks Okafor? Reply yes to confirm.",
      time: "9:14",
    },
    displayMs: 2200,
  },
  {
    turn: { kind: "bubble", side: "out", text: "yes", time: "9:14" },
    displayMs: 1100,
  },
  { turn: { kind: "typing", side: "in" }, displayMs: 700 },
  {
    turn: {
      kind: "receipt",
      amount: "5.00",
      recipient: "Chuks Okafor",
      reference: "tx_8K2L9F",
      time: "9:14",
    },
    displayMs: 3500,
  },
];

const LOOP_GAP_MS = 1200; // pause after the last turn before resetting

/**
 * LiveChatThread
 *
 * Auto-plays the scripted conversation on a loop. Drives turn-by-turn
 * progression with a single setTimeout chain rather than a heavyweight
 * timeline library — the interaction is linear and short, so a state
 * machine of arrays beats anything more abstract.
 *
 * AnimatePresence handles the enter/exit animation per turn so messages
 * slide up into view rather than just appearing. The scrollable container
 * auto-scrolls to bottom whenever a new turn is appended.
 */
export function LiveChatThread() {
  const [visibleTurns, setVisibleTurns] = useState<Turn[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timeouts: ReturnType<typeof setTimeout>[] = [];

    function runScript() {
      if (cancelled) return;
      setVisibleTurns([]);

      let cumulativeDelay = 200;
      SCRIPT.forEach(({ turn, displayMs }, idx) => {
        const t = setTimeout(() => {
          if (cancelled) return;
          setVisibleTurns((prev) => {
            // Replace trailing typing indicator from same side with the
            // incoming bubble — feels more natural than two stacked.
            const last = prev[prev.length - 1];
            if (
              last?.kind === "typing" &&
              turn.kind === "bubble" &&
              last.side === turn.side
            ) {
              return [...prev.slice(0, -1), turn];
            }
            if (
              last?.kind === "typing" &&
              turn.kind === "receipt"
            ) {
              return [...prev.slice(0, -1), turn];
            }
            return [...prev, turn];
          });
          // Schedule next loop iteration after the last turn finishes
          if (idx === SCRIPT.length - 1) {
            const restart = setTimeout(runScript, displayMs + LOOP_GAP_MS);
            timeouts.push(restart);
          }
        }, cumulativeDelay);
        timeouts.push(t);
        cumulativeDelay += displayMs;
      });
    }

    runScript();

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* WhatsApp-style header */}
      <div className="flex items-center gap-3 border-b border-ink-200/40 bg-surface-50 px-4 pb-3 pt-12">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-accent-500 text-xs font-semibold text-white">
          U
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-medium text-ink-900">UPay</p>
          <p className="flex items-center gap-1 text-[10px] text-ink-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            online
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col justify-end gap-2 overflow-hidden bg-surface-100 p-3">
        <AnimatePresence initial={false}>
          {visibleTurns.map((turn, idx) => (
            <TurnView key={`${idx}-${turn.kind}`} turn={turn} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Single turn renderer. Branches on `kind` and returns the matching shape.
 * Pulled out so the parent stays focused on orchestration.
 */
function TurnView({ turn }: { turn: Turn }) {
  if (turn.kind === "typing") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className={`flex ${turn.side === "out" ? "justify-end" : "justify-start"}`}
      >
        <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-3 py-2.5 shadow-sm">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="inline-block h-1.5 w-1.5 rounded-full bg-ink-400"
              style={{
                animation: `typing-dots 1.2s infinite ${delay}ms ease-in-out`,
              }}
            />
          ))}
        </div>
      </motion.div>
    );
  }

  if (turn.kind === "receipt") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex justify-start"
      >
        <div className="w-[82%] rounded-2xl rounded-bl-md bg-white p-3 shadow-sm ring-1 ring-ink-200/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
              Sent
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
              ✓ Confirmed
            </span>
          </div>
          <p className="mt-1.5 font-display text-2xl leading-none text-ink-900">
            ${turn.amount} <span className="text-base text-ink-500">USDC</span>
          </p>
          <p className="mt-1 text-[11px] text-ink-500">to {turn.recipient}</p>
          <p className="mt-2 font-mono text-[9px] text-ink-300">
            {turn.reference} · {turn.time}
          </p>
        </div>
      </motion.div>
    );
  }

  // Bubble
  const isOut = turn.side === "out";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`flex ${isOut ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-[12px] leading-snug ${
          isOut
            ? "rounded-br-md bg-accent-500 text-white"
            : "rounded-bl-md bg-white text-ink-900"
        }`}
      >
        <div>{turn.text}</div>
        <div
          className={`mt-0.5 text-right text-[9px] ${
            isOut ? "text-white/60" : "text-ink-400"
          }`}
        >
          {turn.time}
          {isOut && <span className="ml-1">✓✓</span>}
        </div>
      </div>
    </motion.div>
  );
}
