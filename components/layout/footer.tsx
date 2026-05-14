import Link from "next/link";
import { BrandMark } from "@/components/ui/brand-mark";
import { SITE } from "@/lib/data/site";

export function Footer() {
  return (
    <footer className="bg-ink-900 text-surface-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-12 px-6 py-1  2 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-5">
          <BrandMark />
          <p className="max-w-sm text-sm text-surface-50/50">
            Money, by message. Built for the way people already talk.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm sm:grid-cols-3">
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

      <div className="border-t border-surface-50/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 text-xs text-surface-50/40">
          <span>© {new Date().getFullYear()} Tella</span>
          <span className="font-mono">v0.2</span>
        </div>
      </div>
    </footer>
  );
}
