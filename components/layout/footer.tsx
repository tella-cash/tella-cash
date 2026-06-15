import Link from "next/link";
import { BrandMark } from "@/components/ui/brand-mark";
import { SITE } from "@/lib/data/site";

export function Footer() {
  return (
    <footer className="bg-ink-900 py-16 text-surface-50">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-12 px-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-6">
          <BrandMark />
          <p className="max-w-md text-base md:text-lg leading-relaxed text-surface-50/60">
            Money, by message. Built for the way people already talk.
          </p>
          <p className="text-base text-surface-50/50">
            Tella is a service operated by {SITE.legalName}.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-12 gap-y-4 text-base sm:grid-cols-3">
            <li>
              <Link
                href={SITE.termsUrl}
                className="text-surface-50/60 transition-colors hover:text-surface-50"
              >
                Terms
              </Link>
            </li>
            <li>
              <Link
                href={SITE.privacyUrl}
                className="text-surface-50/60 transition-colors hover:text-surface-50"
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                href={SITE.dataDeletionUrl}
                className="text-surface-50/60 transition-colors hover:text-surface-50"
              >
                Data Deletion
              </Link>
            </li>
            <li>
              <a
                href={SITE.twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-surface-50/60 transition-colors hover:text-surface-50"
              >
                Twitter
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className="mt-12 border-t border-surface-50/10">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 pt-8 text-sm text-surface-50/40">
          <span>
            © {new Date().getFullYear()} {SITE.legalName}. All rights reserved.
          </span>
          <span className="font-mono">v0.2</span>
        </div>
      </div>
    </footer>
  );
}
