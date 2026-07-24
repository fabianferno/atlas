/**
 * A ~60 line test harness with no dependencies.
 *
 * Why not vitest: the agency layer must typecheck with `tsc --noEmit` against
 * the repo's installed dependencies, and adding a test runner to package.json
 * mid-hackathon means a lockfile change every other agent has to merge. This
 * imports nothing, so `pnpm dlx tsx src/lib/agency/all.test.ts` runs the suite
 * on a clean checkout, and dropping in a real runner later is a find-replace.
 */

export interface TestFailure {
  suite: string;
  name: string;
  error: string;
}

const failures: TestFailure[] = [];
let passed = 0;
let currentSuite = "";

export function describe(name: string, body: () => void): void {
  const previous = currentSuite;
  currentSuite = previous ? `${previous} > ${name}` : name;
  body();
  currentSuite = previous;
}

export function it(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
  } catch (err) {
    failures.push({
      suite: currentSuite,
      name,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Async variant — the journal and signer paths are promise-based. */
const pending: Promise<void>[] = [];

export function itAsync(name: string, body: () => Promise<void>): void {
  const suite = currentSuite;
  pending.push(
    body().then(
      () => {
        passed += 1;
      },
      (err: unknown) => {
        failures.push({
          suite,
          name,
          error: err instanceof Error ? err.message : String(err),
        });
      },
    ),
  );
}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${message ?? "values differ"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

export function assertThrows(body: () => unknown, message: string): void {
  try {
    body();
  } catch {
    return;
  }
  throw new Error(`${message}: expected a throw, got none`);
}

export async function assertRejects(body: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await body();
  } catch {
    return;
  }
  throw new Error(`${message}: expected a rejection, got none`);
}

/** Awaits every async test, prints the report, and sets the exit code. */
export async function report(): Promise<void> {
  await Promise.all(pending);
  for (const f of failures) {
    console.error(`FAIL  ${f.suite} > ${f.name}\n      ${f.error}`);
  }
  const total = passed + failures.length;
  console.log(`\n${passed}/${total} passing${failures.length ? `, ${failures.length} FAILING` : ""}`);
  if (failures.length > 0) process.exitCode = 1;
}
