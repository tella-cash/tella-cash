import type { NextConfig } from "next";

/**
 * Baseline response headers.
 *
 * This config was empty, so the app shipped with none of these. The confirm
 * page is the one that matters most: it's a bearer-token URL that authorizes
 * moving money, so it must not be framable, must not leak its own URL in a
 * Referer, and must not be sniffed into a different content type.
 */
const securityHeaders = [
  // The confirm token lives in the URL path. Any outbound request from that
  // page would otherwise hand the token to a third party in the Referer.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // frame-ancestors is the modern control; X-Frame-Options stays for older
  // browsers that ignore CSP. Clickjacking the confirm button is the attack.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Deny the sensor and device APIs the app never uses. publickey-credentials
  // -get is deliberately left as self — removing it breaks WebAuthn, which is
  // the primary confirm path.
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "publickey-credentials-get=(self)",
    ].join(", "),
  },
];

const nextConfig: NextConfig = {
  // Nothing gains from advertising the framework and version.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
