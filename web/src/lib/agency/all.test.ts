/**
 * Suite entry point.
 *
 *   cd web && pnpm exec tsc --noEmit && pnpm dlx tsx src/lib/agency/all.test.ts
 *
 * Both halves, always. `tsx` strips types and runs — it never type-checks — so
 * the suite alone will happily go green on code that does not compile, and the
 * reason this harness exists at all is that the agency layer must typecheck
 * with `tsc --noEmit` against the repo's installed dependencies. Running the
 * check first means a type error stops the run instead of shipping behind 140
 * passing tests.
 *
 * Exits non-zero on failure, so it drops straight into CI.
 */
import { report } from "./harness.test";
import "./policy.test";
import "./journal.test";
import "./signer.test";
import "./triggers.test";
import "./session.test";
import "./stream-runner.test";
import "../kit/shapes.test";
import "../kit/substreams-leak.test";
import "../coverage/registry.test";
import "../coverage/gap.test";

void report();
