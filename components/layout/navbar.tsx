import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { CtaButton } from "@/components/ui/cta-button";
import { NAV_LINKS, SITE } from "@/lib/data/site";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-upay-900/5 bg-cream-50/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" aria-label="UPAY — home">
          <BrandLogo />
        </Link>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-8 text-sm text-ink-700">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="transition-colors hover:text-upay-900"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <CtaButton href={SITE.whatsappLink} target="_blank" rel="noopener">
          Try it out
        </CtaButton>
      </div>
    </header>
  );
}
