import { cookies } from "next/headers";
import { ADMIN_THEME_COOKIE, parseAdminTheme } from "@/lib/admin/theme";
import { ThemeRoot } from "./_components/theme";

export const metadata = {
  title: "Tella admin",
  robots: { index: false, follow: false, nocache: true },
  other: { referrer: "no-referrer" },
};

/**
 * Wraps the dashboard and its sign-in page in the element the admin theme
 * hangs off.
 *
 * The preference is read from a cookie here, on the server, so the page
 * arrives already in the right theme. It is deliberately not on <html>: that
 * element belongs to the root layout the whole site shares, and reading a
 * cookie there would make every marketing page render per request.
 *
 * This is not an access check. Who may see the dashboard is decided in
 * page.tsx, where the session cookie is verified.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = parseAdminTheme(jar.get(ADMIN_THEME_COOKIE)?.value);

  return <ThemeRoot initial={theme}>{children}</ThemeRoot>;
}
