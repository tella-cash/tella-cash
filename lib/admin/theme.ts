/**
 * The admin dashboard's theme preference, and nothing else.
 *
 * Kept in a cookie rather than localStorage so the server can read it and
 * render the right theme in the first response: no flash of the wrong one,
 * and no inline script to prevent it.
 *
 * The cookie is scoped to /admin. It holds nothing sensitive, but the confirm,
 * security and panic routes are sent as few cookies as possible on principle
 * (proxy.ts strips the admin session from them by name), and a path scope
 * means this one never reaches them at all.
 */

export const ADMIN_THEME_COOKIE = "tella_admin_theme";
export const ADMIN_THEME_PATH = "/admin";

export const ADMIN_THEMES = ["system", "light", "dark"] as const;
export type AdminTheme = (typeof ADMIN_THEMES)[number];

/** Anything unrecognised follows the device, which is the default. */
export function parseAdminTheme(value: string | undefined): AdminTheme {
  return (ADMIN_THEMES as readonly string[]).includes(value ?? "")
    ? (value as AdminTheme)
    : "system";
}
