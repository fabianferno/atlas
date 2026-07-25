/**
 * Suite entry point.
 *
 *   cd web && pnpm dlx tsx src/lib/agency/all.test.ts
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
