import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { tellaUser } from "@/lib/supabase/types";
import { getRpConfig } from "./config";
import { listCredentials, type StoredCredential } from "./repository";

const textEncoder = new TextEncoder();

/**
 * Copy bytes into a fresh ArrayBuffer-backed view. `isoBase64URL.toBuffer`
 * returns a `Uint8Array<ArrayBufferLike>`, but the verify API wants a
 * `Uint8Array<ArrayBuffer>` — this narrows it without an unsafe cast.
 */
function toArrayBufferView(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  // `out` is genuinely ArrayBuffer-backed at runtime; the cast just narrows
  // the (overly wide) inferred ArrayBufferLike parameter.
  return out as Uint8Array<ArrayBuffer>;
}

function toTransports(
  transports: string[] | null,
): AuthenticatorTransportFuture[] | undefined {
  return (transports ?? undefined) as AuthenticatorTransportFuture[] | undefined;
}

/**
 * Registration options.
 *
 * `residentKey: "preferred"` lets the authenticator create a discoverable
 * (syncable) passkey — the basis for iCloud Keychain / Google Password
 * Manager sync across the user's devices. `userVerification: "required"`
 * forces a biometric or device-PIN gesture, which is what authorizes the
 * money movement. We omit `authenticatorAttachment` so the browser also
 * offers cross-device (QR-to-phone) and security keys, not just the local
 * platform authenticator.
 */
export async function buildRegistrationOptions(user: tellaUser) {
  const { rpName, rpID } = getRpConfig();
  const existing = await listCredentials(user.id);

  return generateRegistrationOptions({
    rpName,
    rpID,
    userID: textEncoder.encode(user.id),
    userName: user.whatsapp_number,
    userDisplayName: user.profile_name ?? "tella",
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: toTransports(c.transports),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
  });
}

export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
): Promise<VerifiedRegistrationResponse> {
  const { rpID, origin } = getRpConfig();
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
}

export async function buildAuthenticationOptions(user: tellaUser) {
  const { rpID } = getRpConfig();
  const creds = await listCredentials(user.id);

  return generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({
      id: c.credential_id,
      transports: toTransports(c.transports),
    })),
    userVerification: "required",
  });
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credential: StoredCredential,
): Promise<VerifiedAuthenticationResponse> {
  const { rpID, origin } = getRpConfig();
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: credential.credential_id,
      publicKey: toArrayBufferView(isoBase64URL.toBuffer(credential.public_key)),
      counter: Number(credential.counter),
      transports: toTransports(credential.transports),
    },
  });
}

/** Serialize a verified public key (Uint8Array) for text storage. */
export function encodePublicKey(publicKey: Uint8Array<ArrayBuffer>): string {
  return isoBase64URL.fromBuffer(publicKey);
}

/** A short human label for the enrolling device, from the User-Agent. */
export function deviceLabelFromRequest(request: Request): string | null {
  const ua = request.headers.get("user-agent") ?? "";
  if (/iphone|ipad|ios/i.test(ua)) return "iPhone / iPad";
  if (/macintosh|mac os/i.test(ua)) return "Mac";
  if (/android/i.test(ua)) return "Android";
  if (/windows/i.test(ua)) return "Windows";
  if (/linux/i.test(ua)) return "Linux";
  return ua ? ua.slice(0, 60) : null;
}
