import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.text();
  console.log("[circle-webhook] received", {
    headers: Object.fromEntries(request.headers.entries()),
    bodyPreview: body.slice(0, 500),
  });
  return NextResponse.json({ received: true }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}