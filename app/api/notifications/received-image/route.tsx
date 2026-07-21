import { ImageResponse } from "next/og";

/**
 * GET /api/notifications/received-image
 *
 * Renders the "money received" WhatsApp notification as a branded square
 * PNG card. Twilio/Meta fetch this URL directly (mediaUrl / image.link),
 * so it must be a plain, unauthenticated GET — the params it reads back
 * (amount/token/sender/balances) aren't secrets, they're just display data
 * the webhook handler already computed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const amount = searchParams.get("amount") ?? "0";
  const token = searchParams.get("token") ?? "";
  const sender = searchParams.get("sender") ?? "an external wallet";
  const balanceLines = (searchParams.get("balances") ?? "")
    .split(",")
    .map((line) => line.trim())
    .filter(Boolean);

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
      { width: 1080, height: 1080 },
    );
  } catch (err) {
    console.error("[received-image] render failed", err);
    return new Response("Failed to generate the image", { status: 500 });
  }
}
