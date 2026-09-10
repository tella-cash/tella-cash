/**
 * offerBeneficiarySave tests. Runner-free — run with `npm test`.
 *
 * There was no test here at all, and the bug this file now pins is exactly
 * what that cost: the offer used to be one try/catch around a sendam-ai POST,
 * a row write and a message, and any of the three failing meant the user was
 * simply never asked. No error, no retry, no record that a question was owed —
 * just a log line nobody was reading.
 *
 * So what is pinned is which failure still produces a question. That is the
 * whole design of the function, it is invisible from the outside, and it is
 * the kind of branch that regresses silently because the symptom IS silence.
 */
import { offerBeneficiarySave, type BeneficiaryOfferDeps } from "./offer";
import type { Beneficiary, tellaUser } from "@/lib/supabase/types";

const failures: string[] = [];
let passed = 0;
let total = 0;

function check(name: string, actual: unknown, expected: unknown) {
  total++;
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failures.push(
      `  ✗ ${name}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`,
    );
  }
}

const USER = { id: "user-1" } as tellaUser;

const RECIPIENT = {
  address: "0x1111111111111111111111111111111111111111",
  userId: null,
  whatsappNumber: null,
  label: "Chidi",
};

const SAVED = { id: "b1", label: "Chidi" } as Beneficiary;

interface Recorded {
  offers: number;
  messages: string[];
}

/** Deps that all succeed, plus a record of what they were asked to do. */
function workingDeps(overrides: Partial<BeneficiaryOfferDeps> = {}): {
  deps: BeneficiaryOfferDeps;
  recorded: Recorded;
} {
  const recorded: Recorded = { offers: 0, messages: [] };
  const deps: BeneficiaryOfferDeps = {
    findSaved: async () => null,
    recordOffer: async () => {
      recorded.offers++;
      return {} as Awaited<ReturnType<BeneficiaryOfferDeps["recordOffer"]>>;
    },
    notify: async ({ body }) => {
      recorded.messages.push(body);
      return 1;
    },
    ...overrides,
  };
  return { deps, recorded };
}

async function run() {
  /* ---------- the happy path ---------- */
  {
    const { deps, recorded } = workingDeps();
    const outcome = await offerBeneficiarySave({ user: USER, recipient: RECIPIENT, deps });
    check("a new recipient is offered", outcome, "offered");
    check("one row is written", recorded.offers, 1);
    check(
      "the question names the recipient",
      recorded.messages[0],
      "Want to save Chidi as a beneficiary? Reply *yes* or *no*.",
    );
  }

  /* ---------- already saved ---------- */
  {
    const { deps, recorded } = workingDeps({ findSaved: async () => SAVED });
    const outcome = await offerBeneficiarySave({ user: USER, recipient: RECIPIENT, deps });
    check("an already-saved recipient is not offered", outcome, "already_saved");
    check("and no row is written", recorded.offers, 0);
    check("and nothing is said", recorded.messages.length, 0);
  }

  /* ---------- the duplicate check fails: FAIL OPEN ----------
   *
   * The single most important case in this file. "I could not tell whether
   * they are already saved" is not a reason to stay silent — the worst case
   * of asking anyway is a name collision, which the save path already handles
   * by asking for a different one. The old code treated this throw as a
   * reason to skip the question entirely, and because findBeneficiaryByAddress
   * used maybeSingle(), a user with the same address saved twice hit that
   * throw on every subsequent send to that address.
   */
  {
    const { deps, recorded } = workingDeps({
      findSaved: async () => {
        throw new Error("supabase is having a moment");
      },
    });
    const outcome = await offerBeneficiarySave({ user: USER, recipient: RECIPIENT, deps });
    check("a failed duplicate check still asks", outcome, "offered");
    check("and still writes the row", recorded.offers, 1);
    check("and still sends the question", recorded.messages.length, 1);
  }

  /* ---------- the row write fails: FAIL CLOSED ----------
   *
   * The one step that must succeed. Without the row a "yes" has nowhere to
   * land, so asking would be worse than not asking.
   */
  {
    const { deps, recorded } = workingDeps({
      recordOffer: async () => {
        throw new Error("insert failed");
      },
    });
    const outcome = await offerBeneficiarySave({ user: USER, recipient: RECIPIENT, deps });
    check("a failed row write does not ask", outcome, "not_recorded");
    check("and says nothing", recorded.messages.length, 0);
  }

  /* ---------- delivery ---------- */
  {
    const { deps } = workingDeps({
      notify: async () => {
        throw new Error("meta 500");
      },
    });
    check(
      "a thrown delivery is reported, not swallowed as success",
      await offerBeneficiarySave({ user: USER, recipient: RECIPIENT, deps }),
      "not_delivered",
    );
  }
  {
    // notifyUser resolves with a COUNT, and zero means every channel refused.
    // Returning "offered" here would report a question nobody received.
    const { deps } = workingDeps({ notify: async () => 0 });
    check(
      "reaching zero channels is not an offer",
      await offerBeneficiarySave({ user: USER, recipient: RECIPIENT, deps }),
      "not_delivered",
    );
  }

  console.log(`beneficiary-offer: ${passed}/${total} passed`);
  if (failures.length) {
    console.error("\nFailures:\n" + failures.join("\n"));
    process.exit(1);
  }
}

void run();
