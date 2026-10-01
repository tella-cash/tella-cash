"use client";

import {
  ArrowLeft02Icon,
  Attachment02Icon,
  BatteryCharging01Icon,
  Mic01Icon,
  SendIcon,
  SignalFull02Icon,
  StickerIcon,
  TelegramIcon,
  WhatsappIcon,
  Wifi02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckCheck,
  ChevronLeft,
  Mic,
  Paperclip,
  Phone,
  SendHorizontal,
  Video,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import phoneFrame from "@/public/figma/how-it-works/phone-reference/phone-node.png";
import telegramWallpaper from "@/public/figma/how-it-works/telegram/raw-1.png";
import tellaLogo from "@/public/icons/Tella logo v2.svg";

type Platform = "whatsapp" | "telegram";

const conversations = {
  whatsapp: {
    command: "Send 5 USDC to Chuks",
    confirmation: "Yes",
    response: "Send 5 USDC to Chus Okafor? Reply yes to confirm",
    recipient: "Folake Adeyemi",
    amount: "$25.00",
    reference: "tx_4P7M2N",
    status: "Confirmed",
  },
  telegram: {
    command: "/send 50 USDC to Amara",
    confirmation: "Confirm",
    response: "Amara Okafor in Lagos will receive 50 USDC. Confirm transfer?",
    recipient: "Amara Okafor",
    amount: "50.00",
    reference: "tx_8K2L9F",
    status: "Delivered",
  },
} as const;

const enter = {
  initial: { opacity: 0, transform: "translateY(8px) scale(0.97)" },
  animate: { opacity: 1, transform: "translateY(0) scale(1)" },
  exit: { opacity: 0, transform: "translateY(-4px) scale(0.98)" },
  transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const },
};

const reducedEnter = {
  initial: { opacity: 0, transform: "translateY(0) scale(1)" },
  animate: { opacity: 1, transform: "translateY(0) scale(1)" },
  exit: { opacity: 0, transform: "translateY(0) scale(1)" },
  transition: { duration: 0.12, ease: [0.16, 1, 0.3, 1] as const },
};

export function MessagingPlatformDemo() {
  const [platform, setPlatform] = useState<Platform>("whatsapp");
  const reduceMotion = useReducedMotion();

  return (
    <Tabs
      value={platform}
      onValueChange={(value) => setPlatform(value as Platform)}
      variant="pill"
      className="flex flex-col items-center [--color-primary-foreground:#003eb5]"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={platform}
          initial={{ opacity: 0, transform: reduceMotion ? "translateY(0)" : "translateY(6px)" }}
          animate={{ opacity: 1, transform: "translateY(0)" }}
          exit={{ opacity: 0, transform: reduceMotion ? "translateY(0)" : "translateY(-4px)" }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <PhoneConversation platform={platform} />
        </motion.div>
      </AnimatePresence>

      <TabsList
        className="mt-6 rounded-[43px] bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
        wrapperClassName="w-auto"
      >
        <TabsTrigger
          value="whatsapp"
          className="gap-2 px-3 py-3 text-base font-normal leading-6 text-black transition-[transform,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
          indicatorClassName="bg-[#e6eeff] shadow-none"
        >
          <HugeiconsIcon icon={WhatsappIcon} size={24} strokeWidth={1.8} aria-hidden="true" />
          WhatsApp
        </TabsTrigger>
        <TabsTrigger
          value="telegram"
          className="gap-2 px-3 py-3 text-base font-normal leading-6 text-black transition-[transform,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
          indicatorClassName="bg-[#e6eeff] shadow-none"
        >
          <HugeiconsIcon icon={TelegramIcon} size={24} strokeWidth={1.8} aria-hidden="true" />
          Telegram
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function PhoneConversation({ platform }: { platform: Platform }) {
  const reduceMotion = useReducedMotion();
  const conversation = conversations[platform];
  const [phase, setPhase] = useState(0);
  const [composerText, setComposerText] = useState("");
  const visiblePhase = reduceMotion ? 7 : phase;
  const turnMotion = reduceMotion ? reducedEnter : enter;

  useEffect(() => {
    if (reduceMotion) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let cancelled = false;

    const schedule = (callback: () => void, delay: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!cancelled) callback();
      }, delay);
      timers.add(timer);
    };

    const typeIntoComposer = (text: string, startDelay: number, done: () => void) => {
      let index = 0;
      schedule(() => {
        const typeNext = () => {
          index += 1;
          setComposerText(text.slice(0, index));
          if (index < text.length) {
            schedule(typeNext, 38);
          } else {
            schedule(done, 320);
          }
        };
        typeNext();
      }, startDelay);
    };

    const runCycle = () => {
      setComposerText("");
      setPhase(0);

      typeIntoComposer(conversation.command, 350, () => {
        setComposerText("");
        setPhase(1);
        schedule(() => setPhase(2), 550);
        schedule(() => setPhase(3), 1300);
        schedule(() => {
          setPhase(4);
          typeIntoComposer(conversation.confirmation, 0, () => {
            setComposerText("");
            setPhase(5);
            schedule(() => setPhase(6), 450);
            schedule(() => {
              setPhase(7);
              schedule(runCycle, 5000);
            }, 1100);
          });
        }, 2500);
      });
    };

    runCycle();

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [conversation.command, conversation.confirmation, reduceMotion]);

  return (
    <div
      className="relative isolate h-[453px] w-[222px]"
      data-phone-demo={platform}
    >
      <Image
        src={phoneFrame}
        alt=""
        fill
        sizes="222px"
        className="pointer-events-none z-0 object-contain"
      />

      <div className="absolute bottom-[10px] left-[10px] right-[9px] top-[10px] z-10 flex overflow-hidden rounded-[35px] bg-[#0b141a] font-sans">
        <div className="flex min-w-0 flex-1 flex-col">
          <PhoneStatusBar platform={platform} />
          <ChatHeader platform={platform} />

          <div
            className={`relative flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden px-2 pb-1.5 pt-2 ${
              platform === "whatsapp"
                ? "bg-[#071417] bg-[url('/whatsapp-bg.png')] bg-cover bg-center"
                : "bg-black"
            }`}
          >
            {platform === "telegram" ? (
              <>
                <Image
                  src={telegramWallpaper}
                  alt=""
                  fill
                  sizes="203px"
                  className="pointer-events-none object-cover opacity-95"
                  style={{ objectPosition: "center 48%" }}
                />
                <div className="pointer-events-none absolute inset-0 bg-black/10" aria-hidden="true" />
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black via-black/90 to-transparent"
                  aria-hidden="true"
                />
                <TelegramServiceMarkers />
              </>
            ) : null}
            <AnimatePresence initial={false}>
              {visiblePhase >= 1 ? (
                <ChatBubble key="command" side="out" platform={platform} reduceMotion={Boolean(reduceMotion)}>
                  {conversation.command}
                </ChatBubble>
              ) : null}
              {visiblePhase === 2 ? (
                <TypingBubble key="typing-one" platform={platform} reduceMotion={Boolean(reduceMotion)} />
              ) : null}
              {visiblePhase >= 3 ? (
                <ChatBubble key="response" side="in" platform={platform} reduceMotion={Boolean(reduceMotion)}>
                  {conversation.response}
                </ChatBubble>
              ) : null}
              {visiblePhase >= 5 ? (
                <ChatBubble key="confirmation" side="out" platform={platform} reduceMotion={Boolean(reduceMotion)}>
                  {conversation.confirmation}
                </ChatBubble>
              ) : null}
              {visiblePhase === 6 ? (
                <TypingBubble key="typing-two" platform={platform} reduceMotion={Boolean(reduceMotion)} />
              ) : null}
              {visiblePhase >= 7 ? (
                <Receipt
                  key="receipt"
                  platform={platform}
                  amount={conversation.amount}
                  recipient={conversation.recipient}
                  reference={conversation.reference}
                  status={conversation.status}
                  motionProps={turnMotion}
                />
              ) : null}
            </AnimatePresence>
          </div>

          <Composer platform={platform} text={composerText} />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 bg-no-repeat"
        style={{
          backgroundImage: `url(${phoneFrame.src})`,
          backgroundOrigin: "border-box",
          backgroundSize: "100% 100%",
          maskClip: "content-box, border-box",
          maskComposite: "exclude",
          maskImage: "linear-gradient(#000 0 0), linear-gradient(#000 0 0)",
          padding: 10,
          WebkitMaskClip: "content-box, border-box",
          WebkitMaskComposite: "xor",
          WebkitMaskImage: "linear-gradient(#000 0 0), linear-gradient(#000 0 0)",
        }}
      />
    </div>
  );
}

function PhoneStatusBar({ platform }: { platform: Platform }) {
  if (platform === "telegram") {
    return (
      <div className="relative flex h-[23px] shrink-0 items-center justify-between bg-black px-3 pt-0.5 text-[7.5px] font-semibold text-white">
        <span>18:14</span>
        <span className="absolute left-1/2 top-[3px] flex h-[12px] -translate-x-1/2 items-center gap-1 rounded-full bg-[#0a84ff] px-1.5 text-[5.5px] font-bold tracking-[0.02em]">
          <HugeiconsIcon icon={TelegramIcon} size={8} strokeWidth={2} aria-hidden="true" />
          TELEGRAM
        </span>
        <span className="flex items-center gap-1 text-white">
          <HugeiconsIcon icon={SignalFull02Icon} size={9} strokeWidth={2} aria-hidden="true" />
          <HugeiconsIcon icon={Wifi02Icon} size={10} strokeWidth={2} aria-hidden="true" />
          <HugeiconsIcon icon={BatteryCharging01Icon} size={12} strokeWidth={2} aria-hidden="true" />
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex h-[27px] shrink-0 items-center justify-between bg-[#111b21] px-[18px] pt-1 text-[8px] font-semibold text-white">
      <span>23:59</span>
      <span className="absolute left-1/2 top-[5px] h-[17px] w-[62px] -translate-x-1/2 rounded-full bg-black" />
      <span className="flex items-center gap-1">
        <HugeiconsIcon icon={SignalFull02Icon} size={9} strokeWidth={2} aria-hidden="true" />
        <HugeiconsIcon icon={Wifi02Icon} size={10} strokeWidth={2} aria-hidden="true" />
        <span className="flex items-center gap-0.5 rounded-[3px] bg-white px-1 py-px text-[6px] leading-none text-black ring-1 ring-black/10">
          100 <HugeiconsIcon icon={BatteryCharging01Icon} size={7} strokeWidth={2} aria-hidden="true" />
        </span>
      </span>
    </div>
  );
}

function ChatHeader({ platform }: { platform: Platform }) {
  if (platform === "telegram") {
    return (
      <div className="relative h-[34px] shrink-0 bg-black text-white">
        <span className="absolute left-1 top-[5px] grid h-[23px] w-[31px] place-items-center rounded-full border border-[#3a3a3c] bg-[#1c1c1e] shadow-[0_1px_2px_rgba(0,0,0,0.33)]">
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} strokeWidth={2} aria-hidden="true" />
        </span>

        <span className="absolute left-1/2 top-[5px] flex h-[23px] w-[93px] -translate-x-1/2 flex-col items-center justify-center rounded-full border border-[#3a3a3c] bg-[#1c1c1e] shadow-[0_1px_2px_rgba(0,0,0,0.33)]">
          <span className="text-[8px] font-semibold leading-[9px]">Tella Cash</span>
          <span className="text-[6px] leading-[7px] text-[#929296]">last seen 14/09/26</span>
        </span>

        <span className="absolute right-[5px] top-[4px] grid size-[25px] place-items-center rounded-full border border-[#3a3a3c] bg-[#1062ff] shadow-[0_1px_2px_rgba(0,0,0,0.33)]">
          <Image src={tellaLogo} alt="Tella" width={19} height={19} className="size-[19px]" />
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-[44px] shrink-0 items-center gap-1.5 bg-[#1f2c34] px-2 text-white">
      <span className="flex items-center text-[9px] font-medium">
        <ChevronLeft size={16} strokeWidth={2.2} />
        1
      </span>
      <Image src={tellaLogo} alt="Tella" width={24} height={24} className="size-6 shrink-0" />
      <div className="min-w-0 flex-1 leading-none">
        <div className="flex items-center gap-0.5">
          <span className="text-[11px] font-semibold">Tella</span>
          <span className="grid size-2.5 place-items-center rounded-full bg-[#25d366] text-[7px] text-white">
            ✓
          </span>
        </div>
        <span className="text-[7px] text-white/55">Online</span>
      </div>
      <span className="flex items-center gap-3">
        <Video size={15} strokeWidth={1.8} />
        <Phone size={14} strokeWidth={1.8} />
      </span>
    </div>
  );
}

function TelegramServiceMarkers() {
  return (
    <div className="relative z-10 mb-0.5 flex items-center justify-center text-center text-white">
      <span className="rounded-full bg-[#181823] px-2 py-1 text-[6.5px] font-medium leading-none shadow-[0_1px_2px_rgba(0,0,0,0.33)]">
        September 14
      </span>
    </div>
  );
}

function ChatBubble({
  side,
  platform,
  reduceMotion,
  children,
}: {
  side: "in" | "out";
  platform: Platform;
  reduceMotion: boolean;
  children: string;
}) {
  const outgoing = side === "out";
  const whatsapp = platform === "whatsapp";

  return (
    <motion.div {...(reduceMotion ? reducedEnter : enter)} className={`relative z-10 flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-[9px] px-2.5 py-2 text-[9px] leading-[1.4] shadow-sm ${
          outgoing
            ? whatsapp
              ? "rounded-br-[3px] bg-[#005c4b] text-white"
              : "rounded-br-[3px] bg-[#0a84ff] text-white"
            : whatsapp
              ? "rounded-bl-[3px] bg-[#202c33] text-white"
              : "rounded-bl-[3px] border border-[#3a3a3c] bg-[#1c1c1e] text-white"
        }`}
      >
        {children}
        <span className={`ml-2 whitespace-nowrap text-[7px] ${outgoing ? "text-white/70" : whatsapp ? "text-white/55" : "text-[#74859b]"}`}>
          9:14 {outgoing ? <CheckCheck className="ml-0.5 inline" size={9} strokeWidth={2} /> : null}
        </span>
      </div>
    </motion.div>
  );
}

function TypingBubble({ platform, reduceMotion }: { platform: Platform; reduceMotion: boolean }) {
  const whatsapp = platform === "whatsapp";

  return (
    <motion.div {...(reduceMotion ? reducedEnter : enter)} className="relative z-10 flex justify-start">
      <div className={`flex items-center gap-1 rounded-[9px] rounded-bl-[3px] px-2.5 py-2 shadow-sm ${whatsapp ? "bg-[#202c33]" : "border border-[#3a3a3c] bg-[#1c1c1e]"}`}>
        {[0, 140, 280].map((delay) => (
          <span
            key={delay}
            className={`size-1 rounded-full ${whatsapp ? "bg-[#8f9ca3]" : "bg-[#929296]"}`}
            style={{ animation: `typing-dots 1.1s ${delay}ms infinite cubic-bezier(0.77, 0, 0.175, 1)` }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function Receipt({
  platform,
  amount,
  recipient,
  reference,
  status,
  motionProps,
}: {
  platform: Platform;
  amount: string;
  recipient: string;
  reference: string;
  status: string;
  motionProps: typeof enter;
}) {
  const whatsapp = platform === "whatsapp";

  return (
    <motion.div
      {...motionProps}
      className={`relative z-10 rounded-[10px] rounded-bl-[3px] p-2.5 shadow-sm ${
        whatsapp ? "bg-[#202c33] text-white" : "border border-[#3a3a3c] bg-[#1c1c1e] text-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[8px] font-medium uppercase tracking-[0.08em] ${whatsapp ? "text-white/70" : "text-[#929296]"}`}>
          Sent
        </span>
        <span className={`rounded-full px-1.5 py-0.5 text-[7px] font-semibold ${whatsapp ? "bg-[#effcf7] text-[#15916b]" : "bg-[#0a84ff]/20 text-[#70b8ff]"}`}>
          ✓ {status}
        </span>
      </div>
      <p className={`mt-1 text-[21px] leading-6 tracking-[-0.03em] ${whatsapp ? "font-display" : "font-semibold"}`}>
        {amount} <span className={`text-[8px] font-medium ${whatsapp ? "text-white/75" : "text-[#929296]"}`}>USDC</span>
      </p>
      <p className={`mt-1 text-[8px] ${whatsapp ? "text-white/75" : "text-[#929296]"}`}>to {recipient}</p>
      <div className={`mt-1.5 flex items-center justify-between text-[7px] ${whatsapp ? "text-white/55" : "text-[#636366]"}`}>
        <span>{reference}</span>
        <span>9:14</span>
      </div>
    </motion.div>
  );
}

function Composer({ platform, text }: { platform: Platform; text: string }) {
  if (platform === "telegram") {
    return (
      <div className="relative h-[45px] shrink-0 bg-black px-1 pb-[7px] pt-1">
        <div className="flex items-center gap-1.5">
          <span className="grid size-[22px] shrink-0 place-items-center rounded-full border border-[#3a3a3c] bg-[#1c1c1e] text-white shadow-[0_1px_2px_rgba(0,0,0,0.33)]">
            <HugeiconsIcon icon={Attachment02Icon} size={14} strokeWidth={1.9} aria-hidden="true" />
          </span>

          <div className="flex h-[22px] min-w-0 flex-1 items-center gap-1 rounded-full border border-[#3a3a3c] bg-[#1c1c1e] px-2 text-[8px] text-[#929296] shadow-[0_1px_2px_rgba(0,0,0,0.33)]">
            <span className="min-w-0 flex-1 truncate">{text || "Message"}</span>
            {text ? (
              <span className="h-3 w-px animate-pulse bg-current opacity-60" />
            ) : (
              <HugeiconsIcon icon={StickerIcon} size={12} strokeWidth={1.8} aria-hidden="true" />
            )}
          </div>

          <span className={`grid size-[22px] shrink-0 place-items-center rounded-full border text-white shadow-[0_1px_2px_rgba(0,0,0,0.33)] ${text ? "border-[#0a84ff] bg-[#0a84ff]" : "border-[#3a3a3c] bg-[#1c1c1e]"}`}>
            <HugeiconsIcon icon={text ? SendIcon : Mic01Icon} size={14} strokeWidth={2} aria-hidden="true" />
          </span>
        </div>

        <span className="absolute bottom-[2px] left-1/2 h-[2px] w-[72px] -translate-x-1/2 rounded-full bg-white" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex h-[42px] shrink-0 items-center gap-1.5 bg-[#111b21] px-1.5 pb-1.5 pt-1">
      <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-[#202c33] px-2 text-[8px] text-white/75">
        <Paperclip size={11} className="shrink-0 opacity-65" />
        <span className="min-w-0 flex-1 truncate">{text || "Message"}</span>
        {text ? <span className="h-3 w-px animate-pulse bg-current opacity-60" /> : <Mic size={11} className="shrink-0 opacity-65" />}
      </div>
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#00a884] text-white" aria-hidden="true">
        {text ? <SendHorizontal size={12} fill="currentColor" /> : <Mic size={12} />}
      </span>
    </div>
  );
}
