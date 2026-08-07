import { NextResponse } from "next/server";

/**
 * Read a JSON request body without turning a malformed one into a 500.
 *
 * Every confirm route called `await request.json()` bare, so anything that
 * wasn't valid JSON — a truncated request, a probe, a client bug — threw and
 * surfaced as an unhandled 500. A 500 says "the server is broken"; the
 * server is fine, the request wasn't. It also puts a stack trace in the logs
 * for what is really just noise.
 *
 * Returns either the parsed body or a ready-to-return 400 response, so
 * callers stay one line:
 *
 *   const parsed = await readJson<{ token?: string }>(request);
 *   if (!parsed.ok) return parsed.response;
 *   const body = parsed.body;
 */
export type JsonResult<T> =
  | { ok: true; body: T }
  | { ok: false; response: NextResponse };

export async function readJson<T>(request: Request): Promise<JsonResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      ),
    };
  }

  // `null`, a bare string, and an array all parse as valid JSON but none of
  // them can carry the fields these routes read — destructuring them would
  // fail later and less clearly.
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      ),
    };
  }

  return { ok: true, body: raw as T };
}
