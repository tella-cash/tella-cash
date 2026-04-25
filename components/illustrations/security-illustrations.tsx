/**
 * Three illustrated cards for the Security section. Each is a self-contained
 * SVG composition — kept inline rather than separate files because they're
 * relatively small and only used in one place.
 */

/**
 * PasscodeIllustration
 *
 * A stylized passcode keypad with an asterisk-filled input bar above. Conveys
 * "PIN required" without showing a real PIN.
 */
export function PasscodeIllustration() {
  return (
    <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-pago-100 to-cream-100">
      {/* Soft light blob */}
      <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent-300/40 blur-3xl" />

      <div className="relative z-10 w-44 rounded-2xl bg-white p-4 shadow-card">
        {/* Input row */}
        <div className="flex justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="h-3 w-3 rounded-full bg-pago-700"
              style={{ opacity: i < 3 ? 1 : 0.2 }}
            />
          ))}
        </div>
        {/* Keypad */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm font-medium text-ink-900">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map(
            (key, i) => (
              <div
                key={i}
                className="grid h-8 place-items-center rounded-lg bg-cream-100"
              >
                {key}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * CertifiedIllustration
 *
 * A medallion / shield with a checkmark — communicates compliance and audit.
 */
export function CertifiedIllustration() {
  return (
    <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-pago-800 to-pago-950">
      {/* Concentric rings */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 h-full w-full opacity-30"
        aria-hidden="true"
      >
        {[40, 60, 80, 100].map((r) => (
          <circle
            key={r}
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-cream-50"
          />
        ))}
      </svg>

      {/* Medallion */}
      <div className="relative z-10 grid h-28 w-28 place-items-center rounded-full bg-cream-50 shadow-card">
        <svg viewBox="0 0 32 32" className="h-14 w-14">
          {/* Shield */}
          <path
            d="M16 2 4 6v9c0 7 5 13 12 15 7-2 12-8 12-15V6L16 2Z"
            className="fill-pago-100 stroke-pago-800"
            strokeWidth="1.5"
          />
          {/* Check */}
          <path
            d="m10 16 4 4 8-9"
            className="stroke-pago-800"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>

      {/* Tag */}
      <span className="absolute bottom-4 left-4 rounded-full bg-cream-50/15 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-cream-50">
        Audited · Encrypted
      </span>
    </div>
  );
}

/**
 * BiometricIllustration
 *
 * A fingerprint glyph with concentric scanner ring + a small lock chip below
 * to imply "locked chats".
 */
export function BiometricIllustration() {
  return (
    <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-cream-100 to-pago-100">
      <div className="absolute -left-10 -bottom-10 h-44 w-44 rounded-full bg-pago-300/40 blur-3xl" />

      {/* Fingerprint */}
      <svg viewBox="0 0 64 64" className="relative z-10 h-32 w-32">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="text-pago-800"
        >
          {/* Outer arc */}
          <path d="M14 34c0-10 8-18 18-18s18 8 18 18" />
          {/* Inner arcs */}
          <path d="M19 36c0-7 6-13 13-13s13 6 13 13v2" />
          <path d="M24 38c0-4 4-8 8-8s8 4 8 8v6" />
          <path d="M29 40c0-1.5 1.5-3 3-3s3 1.5 3 3v8" />
          {/* Stems / loops */}
          <path d="M16 44c0 0 4 4 8 4" />
          <path d="M48 44c0 0-3 6-10 6" />
          <path d="M30 50c1 1 4 1 6 0" />
        </g>
      </svg>

      {/* Lock chip */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-pago-800 px-3 py-1.5 text-[10px] font-medium text-cream-50">
        <svg viewBox="0 0 16 16" className="h-3 w-3">
          <path
            d="M5 7V5a3 3 0 1 1 6 0v2m-7 0h8v6H4V7Z"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinejoin="round"
          />
        </svg>
        Locked chat
      </div>
    </div>
  );
}
