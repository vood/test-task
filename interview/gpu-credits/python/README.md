# GPU Credit Bench — Python

The `CreditSystem` design exercise in Python: a spec, an empty interface, and
33 assertions across 7 suites. Nothing here reveals an approach — the tests
describe behavior only.

## In the browser

```bash
python3 interview/gpu-credits/python/bench.py
```

Opens `http://127.0.0.1:8765`. Editor on the left, spec and results on the
right, **⌘/Ctrl + Enter** to run. Your code runs in the interpreter you launched
the bench with, in a throwaway subprocess with a 30-second timeout — an infinite
loop costs you one run, not the bench. Standard library only, nothing to install,
works offline.

`bench.html` is the same page with no server behind it: double-click it and the
runtime (Pyodide) downloads once, ~10 MB, then Python runs inside the tab. Handy
on a machine where you would rather not run a local server; it needs internet on
first load.

Either way: your code autosaves to the browser, the stopwatch starts on your
first keystroke with a 45-minute target, **show test** on any result reveals what
that case asserted, `print()` lands in the **Output** tab, and **skip scale**
drops the timed case while you are still getting correctness right.

## In the terminal

```bash
pytest interview/gpu-credits/python                              # solution.py
CREDIT_SOLUTION=my_attempt.py pytest interview/gpu-credits/python # any file

python3 interview/gpu-credits/python/test_credit_system.py                   # no pytest needed
python3 interview/gpu-credits/python/test_credit_system.py my_attempt.py
python3 interview/gpu-credits/python/test_credit_system.py --skip-optional
```

Your file must define a top-level `class CreditSystem`.

## Files

| File | What it is |
| --- | --- |
| `solution.py` | Empty stub to fill in |
| `test_credit_system.py` | The suites — one source of truth for pytest, the terminal runner, and both benches |
| `bench.py` | Local server bench; `--build PATH` regenerates the standalone page |
| `bench.template.html` | Bench UI; the suite is inlined into it at build time |
| `bench.html` | Standalone bench (generated) |

Editing the suite? `bench.py` inlines `test_credit_system.py` on every request,
so the served bench is always current. Rebuild the standalone copy with:

```bash
python3 interview/gpu-credits/python/bench.py --build interview/gpu-credits/python/bench.html
```

## Suites

| Suite | What it pins down |
| --- | --- |
| Grants and queries | Window arithmetic, overlap, `[start, end)` boundaries |
| Consuming credits | Success, refusal, exact-balance draws |
| Allocation policy | Soonest-expiry-first draw order |
| Out-of-order arrivals | Late grants and late consumptions rewriting the past |
| Refusals and atomicity | A late request that would starve an accepted one |
| Edge cases | Zero amounts, boundary timestamps, negative time |
| Scale | 1000 grants + 1000 shuffled consumptions under 5s |

The JavaScript version of the same exercise is one directory up.
