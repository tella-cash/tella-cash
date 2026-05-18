import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Tella",
  description:
    "How Tella collects, uses, and protects your information when you send and receive money through WhatsApp.",
};

const LAST_UPDATED = "May 14, 2026";

export default function PrivacyPage() {
  return (
    <div className="legal-prose">
      <header className="mb-12 border-b border-ink-200 pb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-500">
          Legal
        </p>
        <h1 className="mt-2 font-display text-5xl text-ink-900">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-ink-500">
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <Section title="1. Overview">
        <p>
          This Privacy Policy explains how{" "}
          <Placeholder>[Legal Entity Name]</Placeholder> (&ldquo;Tella,&rdquo;
          &ldquo;tella,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) collects,
          uses, shares, and protects personal information when you use our
          WhatsApp-based money interface and our website at{" "}
          <Placeholder>[tella.app]</Placeholder> (the &ldquo;Service&rdquo;).
          It applies in addition to our{" "}
          <a href="/terms" className="legal-link">
            Terms of Service
          </a>
          .
        </p>
        <p>
          We follow the Nigeria Data Protection Act 2023 (NDPA) and, where
          applicable, the GDPR, in our role as a data controller. If you
          interact with us through WhatsApp, Meta also processes your messages
          under its own policy.
        </p>
      </Section>

      <Section title="2. Information we collect">
        <p>
          <strong>You give us:</strong>
        </p>
        <ul>
          <li>
            <strong>Account & contact:</strong> your WhatsApp phone number,
            display name, and any name or label you set in chat.
          </li>
          <li>
            <strong>Identity verification:</strong> where required for
            compliance, your full legal name, date of birth, residential
            address, BVN/NIN, government ID details and images, and a selfie
            for liveness check. Collected through our identity-verification
            partner.
          </li>
          <li>
            <strong>Transaction instructions:</strong> the messages you send
            us — including amounts, recipient names or addresses, memos, and
            natural-language phrases like &ldquo;send him the same as last
            week.&rdquo;
          </li>
          <li>
            <strong>Payment details:</strong> bank-account details where you
            cash out to NGN, and wallet addresses you send to or receive from.
          </li>
          <li>
            <strong>PIN / authentication:</strong> a PIN or other factor you
            set, stored only as a salted hash.
          </li>
          <li>
            <strong>Support:</strong> anything you tell us when you contact
            support.
          </li>
        </ul>

        <p>
          <strong>We collect automatically:</strong>
        </p>
        <ul>
          <li>
            <strong>Usage & device data</strong> from our confirmation web
            pages: IP address, approximate location derived from IP, browser
            and OS, timestamps, and pages visited.
          </li>
          <li>
            <strong>Transaction metadata:</strong> on-chain transaction hashes,
            block timestamps, balances, and counterparty addresses (public
            blockchain data).
          </li>
          <li>
            <strong>Cookies & similar:</strong> strictly-necessary cookies on
            the confirmation flow to secure your session; we do not use
            advertising cookies.
          </li>
        </ul>

        <p>
          <strong>From third parties:</strong> we receive verification
          outcomes from our KYC provider, settlement data from our FX partner,
          and messaging metadata (e.g. delivery state) from Meta / WhatsApp
          and Twilio.
        </p>
      </Section>

      <Section title="3. Why we use it (and the legal basis)">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-500">
              <th className="py-2 pr-4 font-medium">Purpose</th>
              <th className="py-2 font-medium">Legal basis (NDPA / GDPR)</th>
            </tr>
          </thead>
          <tbody className="text-ink-700">
            <tr className="border-b border-ink-200/60 align-top">
              <td className="py-3 pr-4">
                Run the Service — create wallets, parse your messages, quote
                and settle transactions, show balances.
              </td>
              <td className="py-3">Performance of a contract with you.</td>
            </tr>
            <tr className="border-b border-ink-200/60 align-top">
              <td className="py-3 pr-4">
                Identity verification, sanctions / AML screening, fraud
                detection, transaction monitoring, and record-keeping.
              </td>
              <td className="py-3">
                Compliance with a legal obligation; legitimate interest in
                preventing fraud and financial crime.
              </td>
            </tr>
            <tr className="border-b border-ink-200/60 align-top">
              <td className="py-3 pr-4">
                Customer support, debugging, and improving the Service.
              </td>
              <td className="py-3">
                Legitimate interest in operating and improving the Service.
              </td>
            </tr>
            <tr className="border-b border-ink-200/60 align-top">
              <td className="py-3 pr-4">
                Sending you transactional messages on WhatsApp (confirmations,
                alerts).
              </td>
              <td className="py-3">Performance of a contract.</td>
            </tr>
            <tr className="align-top">
              <td className="py-3 pr-4">
                Sending product updates or marketing.
              </td>
              <td className="py-3">Your consent — you can withdraw at any time.</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="4. Who we share it with">
        <p>We share personal information only as needed:</p>
        <ul>
          <li>
            <strong>Service providers / processors</strong> acting on our
            instructions, including:
            <ul>
              <li>
                <strong>Meta Platforms (WhatsApp Business)</strong> — messaging
                delivery.
              </li>
              <li>
                <strong>Twilio</strong> — messaging infrastructure.
              </li>
              <li>
                <strong>Circle</strong> — wallet creation, USDC custody, and
                blockchain settlement.
              </li>
              <li>
                <strong>Supabase</strong> — application database and
                authentication infrastructure.
              </li>
              <li>
                <Placeholder>[KYC provider, FX/settlement partner, analytics]</Placeholder>
                .
              </li>
            </ul>
          </li>
          <li>
            <strong>Public blockchains.</strong> Wallet addresses and
            transaction amounts are written to public ledgers that anyone can
            view. They are not anonymous.
          </li>
          <li>
            <strong>Regulators, courts, law enforcement</strong> where we are
            legally required to disclose, or to protect rights, safety, or
            property.
          </li>
          <li>
            <strong>Successors</strong> in a merger, acquisition, or
            reorganisation — subject to this Policy.
          </li>
        </ul>
        <p>We do not sell your personal information.</p>
      </Section>

      <Section title="5. International transfers">
        <p>
          Some of our processors operate outside Nigeria (for example, in the
          United States or the European Union). Where personal data is
          transferred outside Nigeria, we rely on lawful transfer mechanisms
          under the NDPA, including adequacy decisions or contractual
          safeguards with the recipient.
        </p>
      </Section>

      <Section title="6. How long we keep it">
        <p>
          We keep personal information for as long as your account is active
          and for as long as we are required to keep records under applicable
          financial-services law — typically <strong>at least five years</strong>
          {" "}after the end of the relationship or the date of a transaction,
          whichever is later. We may retain limited records longer where
          needed to defend legal claims or comply with regulators.
        </p>
        <p>
          On-chain data we have submitted (transaction hashes, addresses,
          amounts) cannot be deleted by us — that is a property of public
          blockchains, not a choice we make.
        </p>
      </Section>

      <Section title="7. How we protect it">
        <p>
          We use encryption in transit (TLS), encryption at rest for sensitive
          fields, hashed PINs, scoped database access, audit logging, and
          short-lived confirmation tokens to reduce the risk of unauthorised
          access. No system is perfectly secure — keep your WhatsApp account
          and device protected, and never share your PIN or confirmation link
          with anyone.
        </p>
      </Section>

      <Section title="8. Your rights">
        <p>
          Subject to the NDPA (and, where applicable, the GDPR), you have the
          right to:
        </p>
        <ul>
          <li>access the personal information we hold about you;</li>
          <li>have inaccurate or incomplete information corrected;</li>
          <li>
            request deletion of your personal information, where we are not
            required to keep it;
          </li>
          <li>
            object to or restrict certain processing, including direct
            marketing;
          </li>
          <li>request portability of information you provided to us; and</li>
          <li>withdraw consent where we relied on it.</li>
        </ul>
        <p>
          To exercise these rights, message us in chat or email{" "}
          <a href="mailto:privacy@example.com" className="legal-link">
            <Placeholder>[privacy@yourdomain.com]</Placeholder>
          </a>
          . For a deletion request specifically, see our{" "}
          <a href="/data-deletion" className="legal-link">
            Data Deletion page
          </a>
          . You can also lodge a complaint with the{" "}
          <strong>Nigeria Data Protection Commission (NDPC)</strong>.
        </p>
      </Section>

      <Section title="9. Children">
        <p>
          Tella is not intended for anyone under 18. We do not knowingly
          collect personal information from children. If you believe a child
          has given us personal information, contact us and we will delete it.
        </p>
      </Section>

      <Section title="10. Changes to this Policy">
        <p>
          We may update this Policy from time to time. If a change is
          material, we will notify you in-chat or by another reasonable means
          before it takes effect. The &ldquo;Last updated&rdquo; date at the
          top of this page always reflects the current version.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          For privacy questions or to exercise your rights, contact our Data
          Protection Officer at{" "}
          <a href="mailto:privacy@example.com" className="legal-link">
            <Placeholder>[privacy@yourdomain.com]</Placeholder>
          </a>
          , or by post at{" "}
          <Placeholder>[Registered office address]</Placeholder>.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl text-ink-900">{title}</h2>
      <div className="mt-3 space-y-4 text-ink-700">{children}</div>
    </section>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-accent-50 px-1.5 py-0.5 font-mono text-[0.8em] text-accent-700">
      {children}
    </span>
  );
}
