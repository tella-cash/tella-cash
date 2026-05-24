import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion · Tella",
  description:
    "How to request deletion of your personal data from Tella, what gets removed, and what we are required to keep.",
};

const LAST_UPDATED = "May 14, 2026";

export default function DataDeletionPage() {
  return (
    <div className="legal-prose">
      <header className="mb-12 border-b border-ink-200 pb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-500">
          Legal
        </p>
        <h1 className="mt-2 font-display text-5xl text-ink-900">
          Data Deletion
        </h1>
        <p className="mt-3 text-sm text-ink-500">
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <Section title="You can ask us to delete your data">
        <p>
          You have the right to request deletion of the personal information
          we hold about you. This page explains how to do that, what we remove,
          and what we&rsquo;re required to keep.
        </p>
        <p>
          For the full picture of what we collect and why, see our{" "}
          <a href="/privacy" className="legal-link">
            Privacy Policy
          </a>
          .
        </p>
      </Section>

      <Section title="How to request deletion">
        <p>Pick whichever is easier — both reach the same team.</p>
        <ol className="list-decimal pl-5 space-y-4">
          <li>
            <strong>From WhatsApp.</strong> Open your Tella chat and send the
            message:
            <div className="mt-2 rounded-md bg-ink-900 px-4 py-3 font-mono text-sm text-surface-50">
              delete my data
            </div>
            <p className="mt-2">
              We&rsquo;ll reply to confirm your identity and walk you through
              the next steps.
            </p>
          </li>
          <li>
            <strong>By email.</strong> Email{" "}
            <a
              href="mailto:privacy@example.com"
              className="legal-link"
            >
              <Placeholder>[privacy@yourdomain.com]</Placeholder>
            </a>{" "}
            from the email address linked to your account, or — if you only
            ever used WhatsApp — include the phone number registered with
            Tella so we can verify it&rsquo;s really you. Use the subject
            line <em>&ldquo;Data deletion request&rdquo;</em>.
          </li>
        </ol>
      </Section>

      <Section title="What we delete">
        <p>
          Once we&rsquo;ve verified the request, we delete or irreversibly
          anonymise:
        </p>
        <ul>
          <li>your profile, display name, and any labels or memos you saved;</li>
          <li>
            your saved payment details (bank-account details for NGN cash-out);
          </li>
          <li>
            your saved recipients and any contextual memory the assistant has
            built up from your chats;
          </li>
          <li>
            your authentication factors (PIN hash, session tokens, confirmation
            tokens); and
          </li>
          <li>support conversations and ticket history.</li>
        </ul>
      </Section>

      <Section title="What we have to keep (and why)">
        <p>
          We&rsquo;re a money-movement service. Nigerian and international
          anti-money-laundering law requires us to retain certain records even
          after you close your account — typically for at least{" "}
          <strong>five years</strong> after our relationship ends or the last
          transaction occurred.
        </p>
        <p>What stays, in a restricted-access archive:</p>
        <ul>
          <li>
            transaction records — amounts, timestamps, on-chain hashes,
            counterparty wallet addresses, FX rates, and fees;
          </li>
          <li>
            identity-verification records, including the documents you
            submitted for KYC and the verification outcome; and
          </li>
          <li>
            sanctions-screening and fraud-investigation records relevant to
            you.
          </li>
        </ul>
        <p>
          We also <strong>cannot delete on-chain data</strong>. Transactions
          your wallet has signed are recorded on a public blockchain and are
          outside our control. We do not delete or alter the public ledger
          for anyone.
        </p>
      </Section>

      <Section title="How long it takes">
        <p>
          We aim to action a verified deletion request within{" "}
          <strong>30 days</strong>. Complex cases — for example, an open
          dispute or an active sanctions investigation — may take longer; if
          so, we&rsquo;ll tell you why and give you an updated timeline.
        </p>
      </Section>

      <Section title="If you used Tella through WhatsApp">
        <p>
          Tella receives your messages through the WhatsApp Business Platform
          operated by Meta. Deleting your data with us does not delete your
          WhatsApp message history on your own device, nor does it remove
          anything from Meta&rsquo;s systems. To manage your data on
          WhatsApp / Meta:
        </p>
        <ul>
          <li>
            Delete the Tella chat from your WhatsApp app; and
          </li>
          <li>
            Visit{" "}
            <a
              href="https://accountscenter.facebook.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="legal-link"
            >
              Meta&rsquo;s Accounts Center
            </a>{" "}
            for Meta-side controls.
          </li>
        </ul>
      </Section>

      <Section title="Confirmation">
        <p>
          When deletion is complete we&rsquo;ll send you a confirmation
          message (and email, if we have one on file). After that, we
          won&rsquo;t be able to recover anything we removed.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          For anything about this process, contact our Data Protection
          Officer at{" "}
          <a href="mailto:privacy@example.com" className="legal-link">
            <Placeholder>[privacy@yourdomain.com]</Placeholder>
          </a>
          . You also have the right to lodge a complaint with the{" "}
          <strong>Nigeria Data Protection Commission (NDPC)</strong> if
          you&rsquo;re unhappy with how we&rsquo;ve handled your request.
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
