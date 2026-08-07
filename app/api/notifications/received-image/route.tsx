import { ImageResponse } from "next/og";

/**
 * GET /api/notifications/received-image
 *
 * Renders the "money received" WhatsApp notification as a branded square
 * PNG card. Twilio/Meta fetch this URL directly (mediaUrl / image.link),
 * so it must be a plain, unauthenticated GET — the params it reads back
 * (amount/token/sender/balances) aren't secrets, they're just display data
 * the webhook handler already computed.
 *
 * Unauthenticated plus "renders a 1080×1080 PNG" is an amplification vector:
 * padded params made a single request burn 6.5 seconds of CPU and return
 * 100KB, and Vercel bills active CPU time. Every input is length-capped and
 * the response is cacheable, so a repeat costs the CDN and not a function.
 */

// Generous next to any real value (a formatted amount, a token symbol, a
// WhatsApp profile name) and small enough that rendering stays bounded.
const MAX_FIELD = 64;
const MAX_BALANCE_LINES = 8;

function clamp(value: string | null, fallback: string): string | null {
  if (value === null) return fallback;
  // Over-long input is rejected rather than silently truncated — a caller
  // sending 4KB of padding is not a caller whose image we want to render.
  if (value.length > MAX_FIELD) return null;
  return value;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const amount = clamp(searchParams.get("amount"), "0");
  const token = clamp(searchParams.get("token"), "");
  const sender = clamp(searchParams.get("sender"), "an external wallet");
  const rawBalances = searchParams.get("balances") ?? "";

  if (amount === null || token === null || sender === null) {
    return new Response(`Each parameter must be ${MAX_FIELD} characters or fewer`, {
      status: 400,
    });
  }

  const balanceLines = rawBalances
    .split(",")
    .map((line) => line.trim())
    .filter(Boolean);

  if (
    balanceLines.length > MAX_BALANCE_LINES ||
    balanceLines.some((line) => line.length > MAX_FIELD)
  ) {
    return new Response(
      `At most ${MAX_BALANCE_LINES} balance lines of ${MAX_FIELD} characters each`,
      { status: 400 },
    );
  }

  try {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#0B1120",
            padding: "72px",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#5EEAD4" }}>
            tella
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: 100 }}>
            <div style={{ display: "flex", fontSize: 56, color: "#FFFFFF" }}>💰 Received</div>
            <div style={{ display: "flex", fontSize: 88, fontWeight: 700, color: "#FFFFFF", marginTop: 12 }}>
              {amount} {token}
            </div>
            <div style={{ display: "flex", fontSize: 40, color: "#94A3B8", marginTop: 24 }}>
              From {sender}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              width: "100%",
              height: 2,
              backgroundColor: "#1E293B",
              marginTop: 72,
              marginBottom: 48,
            }}
          />

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 32, color: "#64748B" }}>Your balance</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 16 }}>
              {balanceLines.length > 0 ? (
                balanceLines.map((line) => (
                  <div key={line} style={{ display: "flex", fontSize: 44, color: "#E2E8F0", marginTop: 8 }}>
                    {line}
                  </div>
                ))
              ) : (
                <div style={{ display: "flex", fontSize: 44, color: "#E2E8F0", marginTop: 8 }}>—</div>
              )}
            </div>
          </div>
        </div>
      ),
      {
        width: 1080,
        height: 1080,
        headers: {
          // The image is a pure function of its query string, so the same
          // URL is always the same PNG. Twilio and Meta each fetch it at
          // least once, and a retry or a repeated notification should hit
          // the CDN rather than re-render.
          "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
        },
      },
    );
  } catch (err) {
    console.error("[received-image] render failed", err);
    return new Response("Failed to generate the image", { status: 500 });
  }
}
