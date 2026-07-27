# GPU Credit Bench

A practice environment for the `CreditSystem` design exercise: a spec, an empty
interface, and 33 assertions across 7 suites. Nothing here reveals an approach —
the tests describe behavior only.

## In the browser

Open `bench.html` (a single self-contained file — double-click works, no server,
no network). Write JavaScript in the left pane, press **⌘/Ctrl + Enter**, read the
results on the right.

- The spec and the interface live in the **Spec** tab.
- Your code autosaves to the browser, so a reload or an accidental infinite loop
  costs you nothing.
- The stopwatch starts on your first keystroke; the target mark is 45 minutes.
- **Show test** on any result reveals that case's source when you want to see
  exactly what was asserted.
- **Skip scale** drops the timed case while you are still getting correctness right.

`index.html` is the same page with the tests loaded from `tests.js`; it needs a
static server (`npx serve interview/gpu-credits`). Use it when editing the tests,
then rebuild the standalone copy:

```bash
node interview/gpu-credits/build-artifact.mjs
```

## In the terminal

```bash
node interview/gpu-credits/run-tests.mjs                 # runs solution.js
node interview/gpu-credits/run-tests.mjs my-attempt.js   # runs any file
node interview/gpu-credits/run-tests.mjs --skip-optional # correctness only
```

The file must define a top-level `class CreditSystem`. No dependencies, no build.

## Files

| File | What it is |
| --- | --- |
| `bench.html` | Standalone browser bench (generated) |
| `index.html` | Bench source, loads `tests.js` separately |
| `tests.js` | The suites — single source of truth for both runners |
| `run-tests.mjs` | Terminal runner |
| `solution.js` | Empty stub to fill in |
| `build-artifact.mjs` | Inlines `tests.js` into `bench.html` |

## Suites

| Suite | What it pins down |
| --- | --- |
| Grants and queries | Window arithmetic, overlap, `[start, end)` boundaries |
| Consuming credits | Success, refusal, exact-balance draws |
| Allocation policy | Soonest-expiry-first draw order |
| Out-of-order arrivals | Late grants and late consumptions rewriting the past |
| Refusals and atomicity | A late request that would starve an accepted one |
| Edge cases | Zero amounts, boundary timestamps, negative time |
| Scale | 2000 grants + 2000 shuffled consumptions under 5s |
