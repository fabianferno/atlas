/**
 * `@atlas/kit` — the public surface.
 *
 * Graph Track 1 asks for "reusable tooling/infrastructure, not a single
 * end-user app", and prd §4 P1 says the Studio should be "a client of the kit,
 * not a wrapper around a private codebase". That was an assertion while these
 * modules lived at `web/src/lib/kit`: nothing outside the Next app could import
 * them, and nothing proved they did not depend on it. Extracting them made the
 * dependency real and, in two places, made it point the right way — `UiDoc` was
 * declared in the app's seed file and consumed here, and `seedToA2ui` read the
 * app's fixed demo clock out of a module import instead of taking a parameter.
 *
 * Both are fixed. This package imports nothing from the application.
 *
 * NOT PUBLISHED YET. `pnpm --filter @atlas/kit build` produces `dist/`, and
 * `npm publish` is a human's call to make, not a build step — so prd §14 #2
 * stays ◐ until someone runs it. The extraction is the part that was missing;
 * the publish is one command against a registry account this repo does not hold.
 */

// The seams. Every workstream binds to these signatures.
export * from "./contracts/api";
export * from "./contracts/catalog";
export * from "./contracts/manifest";
export * from "./contracts/policy";

// Plan → resolve → fan out → compose. The pipeline, in order.
export * from "./kit/planner";
export * from "./kit/resolver";
export * from "./kit/sources";
export * from "./kit/gateway";
export * from "./kit/fanout";
export * from "./kit/shapes";
export * from "./kit/composer";
export * from "./kit/a2ui";

// Event-driven triggers, and the offline draft shape.
export * from "./kit/substreams";
export * from "./kit/ui-doc";
export { default as seedToA2ui } from "./kit/seed-to-a2ui";

// Inference is exported for its sanitizers as much as its client: anything that
// puts indexer strings near a model needs `sanitizeForPrompt` (prd §7).
export * from "./kit/inference";
