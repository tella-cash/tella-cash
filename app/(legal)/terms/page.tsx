import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · Tella",
  description:
    "The terms that govern your use of Tella — a WhatsApp-based interface for sending USDC and receiving Naira.",
};

const LAST_UPDATED = "May 14, 2026";

export default function TermsPage() {
  return (
    <div className="legal-prose">
      <header className="mb-12 border-b border-ink-200 pb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-500">
          Legal
        </p>
        <h1 className="mt-2 font-display text-5xl text-ink-900">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-ink-500">
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <Section title="1. Who we are">
        <p>
          Tella (&ldquo;Tella,&rdquo; &ldquo;UPay,&rdquo; &ldquo;we,&rdquo;
          &ldquo;us&rdquo;) is a messaging-based interface that lets you hold,
          send, and receive digital dollars (USDC) and convert between USDC and
          Nigerian Naira (NGN) through a WhatsApp chat. These Terms of Service
          (&ldquo;Terms&rdquo;) form a binding agreement between you and{" "}
          <Placeholder>[Legal Entity Name, registration number, address]</Placeholder>
          .
        </p>
        <p>
          By messaging our WhatsApp number, creating a wallet, or otherwise
          using the Service, you agree to these Terms and to our{" "}
          <a href="/privacy" className="legal-link">
            Privacy Policy
          </a>
          . If you do not agree, do not use the Service.
        </p>
      </Section>

      <Section title="2. Eligibility">
        <p>You may use Tella only if you:</p>
        <ul>
          <li>
            are at least 18 years old and have full legal capacity to enter a
            contract;
          </li>
          <li>
            are not located in, or a resident of, a jurisdiction subject to
            comprehensive sanctions, and are not on any sanctions or
            prohibited-party list;
          </li>
          <li>
            access the Service for lawful, personal purposes (or with proper
            authorization on behalf of a business that you can bind); and
          </li>
          <li>
            comply with all applicable laws of Nigeria and the jurisdiction in
            which you reside, including tax, anti-money-laundering, and
            foreign-exchange laws.
          </li>
        </ul>
        <p>
          We may refuse, suspend, or terminate access at our discretion,
          including for failed verification or suspected misuse.
        </p>
      </Section>

      <Section title="3. The Service">
        <p>Through WhatsApp messages, Tella lets you:</p>
        <ul>
          <li>
            create a non-custodial or custodial wallet (as described in-product)
            backed by our wallet infrastructure provider;
          </li>
          <li>send USDC to other wallets you specify;</li>
          <li>
            receive USDC and have the equivalent value reflected in your
            balance;
          </li>
          <li>
            convert between USDC and NGN at quoted rates, where supported; and
          </li>
          <li>
            view balances, transaction history, and recent counterparties.
          </li>
        </ul>
        <p>
          Tella is an <strong>interface</strong>. The underlying movement of
          digital assets occurs on public blockchains and through third-party
          providers (including our wallet, messaging, and FX/settlement
          partners). We do not control blockchains, and once a blockchain
          transaction is broadcast it is generally <strong>irreversible</strong>
          .
        </p>
      </Section>

      <Section title="4. Verification (KYC)">
        <p>
          To comply with Nigerian and international anti-money-laundering
          requirements, we may require you to provide and verify identity
          information before, during, or after onboarding — including your
          legal name, date of birth, phone number, BVN/NIN where applicable,
          and a government-issued ID. You authorize us and our verification
          providers to verify the information you submit. We may pause or
          decline transactions while verification is in progress.
        </p>
      </Section>

      <Section title="5. Sending and confirmation">
        <p>
          Most actions require a confirmation step — typing back to confirm,
          tapping a confirmation link, or entering a PIN. You are responsible
          for:
        </p>
        <ul>
          <li>
            the accuracy of every detail you submit, including amounts,
            recipient names, wallet addresses, and instructions written in
            natural language;
          </li>
          <li>
            reviewing the on-screen summary before confirming — once you
            confirm, the transaction will be submitted and is generally
            irreversible; and
          </li>
          <li>
            keeping your WhatsApp account, device, and PIN secure. We treat any
            instruction sent from your verified WhatsApp number, and confirmed
            via the required factor, as authorized by you.
          </li>
        </ul>
        <p>
          Quoted FX rates are valid only for the short window shown in chat. We
          may decline, delay, or reverse a transaction where required by law,
          where we suspect fraud, or where settlement at the quoted rate is no
          longer possible.
        </p>
      </Section>

      <Section title="6. Fees">
        <p>
          Tella may charge a spread on FX conversions and/or a flat fee for
          certain transactions. Network/gas fees may also apply on-chain. Fees
          and applicable rates are shown in chat before you confirm. We may
          change our fees at any time on prospective transactions.
        </p>
      </Section>

      <Section title="7. Acceptable use">
        <p>You must not use Tella to:</p>
        <ul>
          <li>
            violate any law, regulation, or third-party right, including
            sanctions, securities, or tax laws;
          </li>
          <li>
            fund, facilitate, or receive proceeds from fraud, money laundering,
            terrorism financing, ransomware, gambling where prohibited, or
            illegal goods or services;
          </li>
          <li>
            impersonate another person, provide false information, or
            circumvent our verification, geographic, or risk controls;
          </li>
          <li>
            attempt to reverse engineer, scrape, overload, or interfere with
            the Service, our infrastructure, or our messaging partner; or
          </li>
          <li>resell access to the Service without our written consent.</li>
        </ul>
      </Section>

      <Section title="8. Risks you accept">
        <p>
          Digital assets and cross-border payments carry real risk. By using
          Tella you acknowledge that:
        </p>
        <ul>
          <li>
            the value of USDC and NGN can change, and exchange rates fluctuate;
          </li>
          <li>
            blockchain transactions are typically irreversible — a typo,
            phishing message, or mistaken address can result in permanent loss;
          </li>
          <li>
            WhatsApp, blockchain networks, and partner services may experience
            outages, delays, or congestion outside our control;
          </li>
          <li>
            regulatory changes in Nigeria or elsewhere may force us to
            suspend, limit, or stop offering the Service to you with little
            notice; and
          </li>
          <li>
            messaging-based interfaces depend on natural-language
            understanding. You agree to review the on-screen confirmation
            rather than relying on Tella&rsquo;s interpretation of an ambiguous
            instruction.
          </li>
        </ul>
      </Section>

      <Section title="9. Third-party services">
        <p>
          Tella relies on third parties, including (without limitation) Meta /
          WhatsApp for messaging, Circle for wallet and USDC infrastructure,
          Twilio for messaging delivery, and our FX/settlement and identity
          partners. Their terms and privacy practices govern your interaction
          with them. We are not responsible for outages, errors, or actions of
          third parties, except as required by law.
        </p>
      </Section>

      <Section title="10. Disclaimers">
        <p>
          The Service is provided <strong>&ldquo;as is&rdquo;</strong> and
          <strong> &ldquo;as available.&rdquo;</strong> To the maximum extent
          permitted by law we disclaim all warranties, express or implied,
          including merchantability, fitness for a particular purpose, and
          non-infringement. We do not warrant that the Service will be
          uninterrupted, error-free, or secure, or that any rate or quote will
          remain available.
        </p>
        <p>
          Nothing in Tella is financial, investment, tax, or legal advice. You
          are responsible for your own tax reporting and compliance.
        </p>
      </Section>

      <Section title="11. Limitation of liability">
        <p>
          To the maximum extent permitted by law, we and our affiliates,
          officers, employees, and partners are not liable for any indirect,
          incidental, special, consequential, or punitive damages, or for loss
          of profits, revenues, data, or goodwill, arising out of or related
          to your use of the Service. Our total aggregate liability for any
          claim arising under or related to these Terms is capped at the
          greater of (a) the fees you paid us in the three months immediately
          before the event giving rise to the claim, or (b){" "}
          <Placeholder>[NGN amount, e.g. ₦50,000]</Placeholder>.
        </p>
      </Section>

      <Section title="12. Indemnity">
        <p>
          You agree to defend, indemnify, and hold harmless Tella and its
          affiliates from any claim, loss, or expense (including reasonable
          legal fees) arising out of your breach of these Terms, your misuse of
          the Service, or your violation of law or any third-party right.
        </p>
      </Section>

      <Section title="13. Suspension and termination">
        <p>
          You may stop using Tella at any time. We may suspend or terminate
          your access — and freeze pending balances or transactions — if we
          reasonably believe you have violated these Terms, applicable law, or
          our risk policies, or if required by a regulator or partner. Where
          lawful, we will return any remaining balance through a method we
          designate.
        </p>
      </Section>

      <Section title="14. Changes to these Terms">
        <p>
          We may update these Terms from time to time. If a change is material
          we will notify you in-chat or by another reasonable means before it
          takes effect. Continuing to use the Service after the effective date
          means you accept the updated Terms.
        </p>
      </Section>

      <Section title="15. Governing law and disputes">
        <p>
          These Terms are governed by the laws of the{" "}
          <Placeholder>[Federal Republic of Nigeria / other jurisdiction]</Placeholder>
          , without regard to conflict-of-laws principles. Any dispute will be
          resolved exclusively by the competent courts of{" "}
          <Placeholder>[Lagos, Nigeria]</Placeholder>, except where mandatory
          law in your place of residence grants you a different forum. The
          parties will attempt to resolve disputes in good faith for 30 days
          before commencing formal proceedings.
        </p>
      </Section>

      <Section title="16. Contact">
        <p>
          Questions about these Terms? Reach us at{" "}
          <a
            href="mailto:legal@example.com"
            className="legal-link"
          >
            <Placeholder>[legal@yourdomain.com]</Placeholder>
          </a>
          .
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
