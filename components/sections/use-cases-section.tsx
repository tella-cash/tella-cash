import {
  ArrowRight01Icon,
  Briefcase01Icon,
  ShoppingBag01Icon,
  TrendingUpIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import type { ReactNode } from "react";

interface UseCaseItemProps {
  image: string;
  imageAlt: string;
  imagePosition?: string;
  title: string;
  description: string;
  children: ReactNode;
}

function UseCaseItem({
  image,
  imageAlt,
  imagePosition = "center",
  title,
  description,
  children,
}: UseCaseItemProps) {
  return (
    <article className="flex min-w-0 flex-col gap-2.5">
      <div className="relative flex h-[430px] items-end justify-center overflow-hidden p-4 sm:h-[500px] sm:p-5">
        <Image
          src={image}
          alt={imageAlt}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
          style={{ objectPosition: imagePosition }}
        />
        {children}
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-bold leading-7 text-[#111827]">{title}</h3>
        <p className="text-base leading-[1.6] text-[#6b7280]">{description}</p>
      </div>
    </article>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs leading-5">
      <span className="text-[#94a3b8]">{label}</span>
      <span className="font-semibold text-[#334155]">{children}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full bg-[#e2e8f0]" aria-hidden="true" />;
}

function TransactionCard({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-10 w-full max-w-[300px] rounded-[20px] bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
      {children}
    </div>
  );
}

function CardHeading({
  label,
  icon,
  iconColor,
  iconBackground,
}: {
  label: string;
  icon: typeof Briefcase01Icon;
  iconColor: string;
  iconBackground: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: iconBackground, color: iconColor }}
      >
        <HugeiconsIcon icon={icon} size={16} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold text-[#0f172a]">{label}</span>
    </div>
  );
}

function CardFooter({
  label,
  pill,
  pillClassName,
  completed = false,
}: {
  label: string;
  pill: string;
  pillClassName: string;
  completed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-[11px] font-semibold leading-4">
      <span className="flex items-center gap-1 text-[#64748b]">
        {label}
        {completed ? (
          <span className="flex size-3.5 items-center justify-center rounded-full bg-[#10b981] text-[9px] text-white">
            ✓
          </span>
        ) : null}
      </span>
      <span className={`rounded-full px-2.5 py-1 ${pillClassName}`}>{pill}</span>
    </div>
  );
}

export function UseCasesSection() {
  return (
    <section id="use-cases" className="scroll-mt-24 bg-white px-4 pb-[60px] pt-10 font-geist sm:px-8 lg:px-[72px]">
      <div className="mx-auto max-w-[1296px]">
        <div className="text-center">
          <h2 className="text-[32px] font-medium leading-[1.22] tracking-[-0.02em] text-[#0f172a] sm:text-4xl sm:leading-[44px]">
            Move money directly from chat
          </h2>
          <p className="mt-2 text-lg leading-7 text-[#64748b] sm:text-xl sm:leading-[30px]">
            How Tellecash becomes part of everyday life
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
          <UseCaseItem
            image="/figma/use-cases/freelancer.png"
            imageAlt="Freelancer working at a desk"
            imagePosition="center 44%"
            title="Freelancers"
            description="Get paid by international clients in USDC and convert to Naira."
          >
            <TransactionCard>
              <CardHeading
                label="Freelance Invoice"
                icon={Briefcase01Icon}
                iconColor="#0057ff"
                iconBackground="#e6eeff"
              />
              <div className="mt-3 space-y-2.5 rounded-2xl border border-[#f1f5f9] bg-[#f8fafc] p-[18px]">
                <DetailRow label="Sender">Acme Studio</DetailRow>
                <Divider />
                <DetailRow label="Status">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-[#10b981]" /> Cleared
                  </span>
                </DetailRow>
              </div>
              <div className="mt-3">
                <p className="text-[13px] leading-5 text-[#64748b]">Client payment received</p>
                <p className="mt-0.5 text-[32px] font-bold leading-10 tracking-[-0.03em] text-[#10b981]">+850 USDC</p>
              </div>
              <CardFooter label="Invoice #042" pill="USDC Network" pillClassName="bg-[#eff6ff] text-[#0057ff]" />
            </TransactionCard>
          </UseCaseItem>

          <UseCaseItem
            image="/figma/use-cases/remote-workers.png"
            imageAlt="Remote worker using a laptop"
            imagePosition="center 38%"
            title="Remote Workers"
            description="Receive salary from anywhere in the world, instantly and securely."
          >
            <TransactionCard>
              <CardHeading
                label="Payroll Deposit"
                icon={TrendingUpIcon}
                iconColor="#059669"
                iconBackground="#e6fbf3"
              />
              <div className="mt-3 space-y-2.5 rounded-2xl border border-[#f1f5f9] bg-[#f8fafc] p-[18px]">
                <DetailRow label="Employer">RemoteCo Inc.</DetailRow>
                <Divider />
                <DetailRow label="Period">August Payroll</DetailRow>
              </div>
              <div className="mt-3">
                <p className="text-[13px] leading-5 text-[#64748b]">Salary received</p>
                <p className="mt-0.5 text-[32px] font-bold leading-10 tracking-[-0.03em] text-[#10b981]">+2,400 USDC</p>
              </div>
              <CardFooter label="Paid by RemoteCo" pill="Direct Deposit" pillClassName="bg-[#ecfdf5] text-[#059669]" />
            </TransactionCard>
          </UseCaseItem>

          <UseCaseItem
            image="/figma/use-cases/friends-family.png"
            imageAlt="Family sharing a moment together"
            imagePosition="center 42%"
            title="Friends & Family"
            description="Send money home or split expenses with friends — right from chat."
          >
            <TransactionCard>
              <CardHeading label="Peer Transfer" icon={UserIcon} iconColor="#9333ea" iconBackground="#f3e8ff" />
              <div className="mt-3 rounded-2xl border border-[#f1f5f9] bg-[#f8fafc] p-[18px]">
                <div className="flex items-center justify-between text-xs font-semibold text-[#334155]">
                  <span>London</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.8} aria-hidden="true" />
                  <span>Lagos</span>
                </div>
                <div className="my-2.5 h-px w-full bg-[#e2e8f0]" aria-hidden="true" />
                <DetailRow label="From"><span className="text-[#9333ea]">Mum</span></DetailRow>
              </div>
              <div className="mt-3">
                <p className="text-[13px] leading-5 text-[#64748b]">You received 150 USDC</p>
                <p className="mt-0.5 text-[32px] font-bold leading-10 tracking-[-0.03em] text-[#10b981]">+150 USDC</p>
              </div>
              <CardFooter label="Completed" pill="Instant" pillClassName="bg-[#faf5ff] text-[#9333ea]" completed />
            </TransactionCard>
          </UseCaseItem>

          <UseCaseItem
            image="/figma/use-cases/businesses.png"
            imageAlt="Business owner serving a customer"
            imagePosition="center 46%"
            title="Businesses"
            description="Accept stablecoin payments and manage business cash flow with ease."
          >
            <TransactionCard>
              <CardHeading
                label="Merchant Sale"
                icon={ShoppingBag01Icon}
                iconColor="#ea580c"
                iconBackground="#ffedd5"
              />
              <div className="mt-3 space-y-2.5 rounded-2xl border border-[#f1f5f9] bg-[#f8fafc] p-[18px]">
                <DetailRow label="Customer">Daniel K.</DetailRow>
                <Divider />
                <DetailRow label="Order ID"><span className="text-[#ea580c]">#1048</span></DetailRow>
              </div>
              <div className="mt-3">
                <p className="text-[13px] leading-5 text-[#64748b]">Payment received</p>
                <p className="mt-0.5 text-[32px] font-bold leading-10 tracking-[-0.03em] text-[#0f172a]">320 USDC</p>
              </div>
              <CardFooter label="Order Paid" pill="Storefront" pillClassName="bg-[#fff7ed] text-[#ea580c]" />
            </TransactionCard>
          </UseCaseItem>
        </div>
      </div>
    </section>
  );
}
