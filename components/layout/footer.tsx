import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { SITE } from "@/lib/data/site";

/**
 * Footer
 *
 * Dark green footer slab, pulled below the final CTA section. We keep the
 * link set deliberately small — it's a marketing site, not a portal — and
 * give the brand mark plenty of breathing room as a sign-off.
 */
export function Footer() {
  return (
    <footer className="bg-upay-950 text-cream-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-16 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <BrandLogo variant="light" />
          <p className="max-w-sm text-sm text-cream-50/60">
            The fastest way to turn USDC into Naira — no exchange account, no
            app. Just a WhatsApp message.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm sm:grid-cols-4">
            <li>
              <Link
                href={SITE.termsUrl}
                className="text-cream-50/70 hover:text-cream-50"
              >
                Terms
              </Link>
            </li>
            <li>
              <Link
                href={SITE.privacyUrl}
                className="text-cream-50/70 hover:text-cream-50"
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                href="/ambassadors"
                className="text-cream-50/70 hover:text-cream-50"
              >
                Ambassadors
              </Link>
            </li>
            <li>
              <a
                href={SITE.twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cream-50/70 hover:text-cream-50"
              >
                Twitter
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-cream-50/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 text-xs text-cream-50/50">
          <span>© {new Date().getFullYear()} UPAY. All rights reserved.</span>
          <span>Built with care.</span>
        </div>
      </div>
    </footer>
  );
}
