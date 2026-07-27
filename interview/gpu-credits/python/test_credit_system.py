"""GPU Credit System — test suite.

Single source of truth for every runner: pytest, the terminal runner in this
file, and the browser bench (bench.py / bench.html).

    pytest interview/gpu-credits/python
    python3 interview/gpu-credits/python/test_credit_system.py [solution.py]
"""

from __future__ import annotations

import importlib.util
import inspect
import io
import linecache
import json
import os
import sys
import time
import traceback
from contextlib import redirect_stdout
from dataclasses import dataclass, field
from typing import Any, Callable, List, Optional

HERE = os.path.dirname(os.path.abspath(__file__))


# --------------------------------------------------------------------------
# harness
# --------------------------------------------------------------------------

class CheckFailed(AssertionError):
    """One assertion inside a case did not hold."""

    def __init__(self, label: str, actual: Any, expected: Any):
        super().__init__(f"{label}\n  expected: {expected!r}\n  actual:   {actual!r}")
        self.label = label
        self.actual = actual
        self.expected = expected


class Harness:
    """What every case is handed: a factory plus three checks."""

    def __init__(self, credit_system: type):
        self.credit_system = credit_system

    def new(self):
        """A fresh CreditSystem."""
        return self.credit_system()

    def eq(self, actual, expected, label):
        if actual != expected:
            raise CheckFailed(label, actual, expected)

    def ok(self, actual, label):
        if bool(actual) is not True:
            raise CheckFailed(label, actual, True)

    def no(self, actual, label):
        if bool(actual) is not False:
            raise CheckFailed(label, actual, False)


@dataclass
class Case:
    name: str
    fn: Callable[[Harness], None]
    budget_ms: Optional[int] = None


@dataclass
class Suite:
    name: str
    why: str
    optional: bool = False
    cases: List[Case] = field(default_factory=list)

    def case(self, name: str, budget_ms: Optional[int] = None):
        def register(fn):
            self.cases.append(Case(name, fn, budget_ms))
            return fn

        return register


SUITES: List[Suite] = []


def suite(name: str, why: str, optional: bool = False) -> Suite:
    s = Suite(name, why, optional)
    SUITES.append(s)
    return s


# --------------------------------------------------------------------------
# grants and queries
# --------------------------------------------------------------------------

grants = suite("Grants and queries", "A grant contributes to the balance only inside its own window.")


@grants.case("empty system reports zero at any time")
def _(h):
    s = h.new()
    h.eq(s.get_available_credits(0), 0, "balance at 0")
    h.eq(s.get_available_credits(-50), 0, "balance at -50")
    h.eq(s.get_available_credits(10**9), 0, "balance at 1e9")


@grants.case("single grant is active on [start, end)")
def _(h):
    s = h.new()
    s.add_grant("g1", 100, 10, 20)
    h.eq(s.get_available_credits(9), 0, "before start")
    h.eq(s.get_available_credits(10), 100, "at start")
    h.eq(s.get_available_credits(19), 100, "last active tick")
    h.eq(s.get_available_credits(20), 0, "at end (exclusive)")
    h.eq(s.get_available_credits(21), 0, "after end")


@grants.case("overlapping grants add up")
def _(h):
    s = h.new()
    s.add_grant("a", 100, 0, 10)
    s.add_grant("b", 50, 5, 20)
    h.eq(s.get_available_credits(4), 100, "only a active")
    h.eq(s.get_available_credits(5), 150, "both active")
    h.eq(s.get_available_credits(9), 150, "both active")
    h.eq(s.get_available_credits(10), 50, "only b active")
    h.eq(s.get_available_credits(19), 50, "only b active")
    h.eq(s.get_available_credits(20), 0, "none active")


@grants.case("grants added out of chronological order")
def _(h):
    s = h.new()
    s.add_grant("late", 10, 100, 200)
    s.add_grant("early", 20, 0, 50)
    s.add_grant("middle", 30, 40, 120)
    h.eq(s.get_available_credits(10), 20, "early only")
    h.eq(s.get_available_credits(45), 50, "early + middle")
    h.eq(s.get_available_credits(60), 30, "middle only")
    h.eq(s.get_available_credits(110), 40, "middle + late")
    h.eq(s.get_available_credits(150), 10, "late only")
    h.eq(s.get_available_credits(250), 0, "nothing left")


@grants.case("empty window is never active")
def _(h):
    s = h.new()
    s.add_grant("zero", 100, 5, 5)
    h.eq(s.get_available_credits(4), 0, "before")
    h.eq(s.get_available_credits(5), 0, "at start == end")
    h.eq(s.get_available_credits(6), 0, "after")


# --------------------------------------------------------------------------
# consuming credits
# --------------------------------------------------------------------------

consuming = suite("Consuming credits", "A consumption succeeds only if the credits are available at that timestamp.")


@consuming.case("successful consumption reduces the balance from that time on")
def _(h):
    s = h.new()
    s.add_grant("g1", 100, 0, 10)
    h.ok(s.consume_credits(5, 30), "consume 30 at t=5")
    h.eq(s.get_available_credits(5), 70, "balance at consume time")
    h.eq(s.get_available_credits(9), 70, "balance after consume time")
    h.eq(s.get_available_credits(10), 0, "grant expired")


@consuming.case("a consumption does not affect earlier timestamps")
def _(h):
    s = h.new()
    s.add_grant("g1", 100, 0, 10)
    h.ok(s.consume_credits(5, 30), "consume 30 at t=5")
    h.eq(s.get_available_credits(0), 100, "balance at t=0")
    h.eq(s.get_available_credits(4), 100, "balance just before the consumption")
    h.eq(s.get_available_credits(5), 70, "balance at consume time")


@consuming.case("repeated consumptions accumulate")
def _(h):
    s = h.new()
    s.add_grant("g1", 100, 0, 100)
    h.ok(s.consume_credits(10, 40), "consume 40 at t=10")
    h.ok(s.consume_credits(20, 25), "consume 25 at t=20")
    h.ok(s.consume_credits(30, 35), "consume 35 at t=30")
    h.eq(s.get_available_credits(9), 100, "before any consumption")
    h.eq(s.get_available_credits(10), 60, "after the first")
    h.eq(s.get_available_credits(20), 35, "after the second")
    h.eq(s.get_available_credits(30), 0, "after the third")
    h.eq(s.get_available_credits(99), 0, "still drained")


@consuming.case("consumption spanning several active grants")
def _(h):
    s = h.new()
    s.add_grant("a", 40, 0, 50)
    s.add_grant("b", 60, 0, 50)
    h.ok(s.consume_credits(10, 90), "consume 90 at t=10")
    h.eq(s.get_available_credits(10), 10, "remainder")
    h.eq(s.get_available_credits(9), 100, "untouched before")


@consuming.case("consumption of more than available is refused and changes nothing")
def _(h):
    s = h.new()
    s.add_grant("g1", 100, 0, 10)
    h.no(s.consume_credits(5, 101), "consume 101 at t=5")
    h.eq(s.get_available_credits(5), 100, "balance untouched")
    h.eq(s.get_available_credits(0), 100, "balance untouched at start")


@consuming.case("consumption outside every window is refused")
def _(h):
    s = h.new()
    s.add_grant("g1", 100, 10, 20)
    h.no(s.consume_credits(9, 1), "just before the window")
    h.no(s.consume_credits(20, 1), "at the exclusive end")
    h.no(s.consume_credits(999, 1), "far after the window")
    h.eq(s.get_available_credits(15), 100, "balance untouched")


@consuming.case("consumption of the exact remaining balance succeeds")
def _(h):
    s = h.new()
    s.add_grant("a", 30, 0, 10)
    s.add_grant("b", 70, 0, 10)
    h.ok(s.consume_credits(5, 100), "consume all 100")
    h.eq(s.get_available_credits(5), 0, "drained")
    h.no(s.consume_credits(6, 1), "nothing left")


# --------------------------------------------------------------------------
# allocation policy
# --------------------------------------------------------------------------

allocation = suite("Allocation policy", "Credits are drawn from the soonest-expiring active grant first.")


@allocation.case("soonest-expiring grant is drained first")
def _(h):
    s = h.new()
    s.add_grant("long", 100, 0, 100)
    s.add_grant("short", 100, 0, 20)
    h.ok(s.consume_credits(5, 100), "consume 100 at t=5")
    h.eq(s.get_available_credits(5), 100, "half the pool is gone")
    h.eq(s.get_available_credits(19), 100, "still one grant standing")
    h.eq(s.get_available_credits(20), 100, "short grant expired, long one intact")
    h.eq(s.get_available_credits(99), 100, "long grant untouched")


@allocation.case("overflow spills into the later-expiring grant")
def _(h):
    s = h.new()
    s.add_grant("long", 100, 0, 100)
    s.add_grant("short", 100, 0, 20)
    h.ok(s.consume_credits(5, 130), "consume 130 at t=5")
    h.eq(s.get_available_credits(5), 70, "remaining across both")
    h.eq(s.get_available_credits(20), 70, "short expired, long keeps 70")
    h.eq(s.get_available_credits(99), 70, "long grant balance")


@allocation.case("expiry order wins over grant start order")
def _(h):
    s = h.new()
    s.add_grant("first", 50, 0, 90)
    s.add_grant("second", 50, 10, 30)
    h.ok(s.consume_credits(20, 50), "consume 50 at t=20")
    h.eq(s.get_available_credits(20), 50, "half the pool is gone")
    h.eq(s.get_available_credits(30), 50, "second expired, first intact")
    h.eq(s.get_available_credits(89), 50, "first still full")


@allocation.case("three-deep expiry ladder")
def _(h):
    s = h.new()
    s.add_grant("c", 10, 0, 300)
    s.add_grant("a", 10, 0, 100)
    s.add_grant("b", 10, 0, 200)
    h.ok(s.consume_credits(1, 15), "consume 15 at t=1")
    h.eq(s.get_available_credits(1), 15, "total remaining")
    h.eq(s.get_available_credits(100), 15, "a expired but was already empty")
    h.eq(s.get_available_credits(200), 10, "b expired holding 5")
    h.eq(s.get_available_credits(299), 10, "c untouched")


# --------------------------------------------------------------------------
# out-of-order arrivals
# --------------------------------------------------------------------------

late = suite(
    "Out-of-order arrivals",
    "State always reflects the events processed so far, replayed in timestamp order.",
)


@late.case("a grant arriving after a query is still visible in the past")
def _(h):
    s = h.new()
    h.eq(s.get_available_credits(5), 0, "nothing known yet")
    s.add_grant("g1", 100, 0, 10)
    h.eq(s.get_available_credits(5), 100, "grant now known")


@late.case("a late consumption re-routes an earlier allocation")
def _(h):
    s = h.new()
    s.add_grant("g1", 100, 0, 10)
    s.add_grant("g2", 100, 0, 50)
    h.ok(s.consume_credits(20, 100), "consume 100 at t=20")
    h.eq(s.get_available_credits(20), 0, "g2 drained")
    h.eq(s.get_available_credits(5), 200, "both grants intact at t=5")

    h.ok(s.consume_credits(5, 100), "late consumption of 100 at t=5")
    h.eq(s.get_available_credits(4), 200, "before both consumptions")
    h.eq(s.get_available_credits(5), 100, "after the t=5 consumption")
    h.eq(s.get_available_credits(9), 100, "g1 empty, g2 not yet consumed")
    h.eq(s.get_available_credits(10), 100, "g1 expired, g2 still full")
    h.eq(s.get_available_credits(20), 0, "g2 consumed at t=20")
    h.eq(s.get_available_credits(49), 0, "still drained")


@late.case("a late grant funds an already-accepted consumption")
def _(h):
    s = h.new()
    s.add_grant("g1", 60, 0, 100)
    h.ok(s.consume_credits(50, 60), "consume 60 at t=50")
    h.eq(s.get_available_credits(50), 0, "drained")
    s.add_grant("g2", 40, 0, 100)
    h.eq(s.get_available_credits(49), 100, "both grants visible before the consumption")
    h.eq(s.get_available_credits(50), 40, "g2 covers the rest")


@late.case("interleaved out-of-order consumptions")
def _(h):
    s = h.new()
    s.add_grant("a", 50, 0, 40)
    s.add_grant("b", 50, 20, 80)
    h.ok(s.consume_credits(30, 20), "consume 20 at t=30")
    h.ok(s.consume_credits(10, 20), "late consumption of 20 at t=10")
    h.ok(s.consume_credits(25, 20), "late consumption of 20 at t=25")
    h.eq(s.get_available_credits(9), 50, "only a active, untouched")
    h.eq(s.get_available_credits(10), 30, "a after the t=10 consumption")
    h.eq(s.get_available_credits(20), 80, "b joins the pool")
    h.eq(s.get_available_credits(25), 60, "after the t=25 consumption")
    h.eq(s.get_available_credits(30), 40, "after the t=30 consumption")
    h.eq(s.get_available_credits(40), 40, "a expired empty, b holds the rest")
    h.eq(s.get_available_credits(79), 40, "b balance")
    h.eq(s.get_available_credits(80), 0, "b expired")


@late.case("consumptions arriving in reverse order")
def _(h):
    s = h.new()
    s.add_grant("g", 100, 0, 100)
    h.ok(s.consume_credits(80, 25), "consume at t=80")
    h.ok(s.consume_credits(60, 25), "consume at t=60")
    h.ok(s.consume_credits(40, 25), "consume at t=40")
    h.ok(s.consume_credits(20, 25), "consume at t=20")
    h.eq(s.get_available_credits(19), 100, "before all")
    h.eq(s.get_available_credits(20), 75, "one applied")
    h.eq(s.get_available_credits(40), 50, "two applied")
    h.eq(s.get_available_credits(60), 25, "three applied")
    h.eq(s.get_available_credits(80), 0, "four applied")


# --------------------------------------------------------------------------
# refusals and atomicity
# --------------------------------------------------------------------------

refusals = suite(
    "Refusals and atomicity",
    "A consumption is accepted only if every accepted consumption still holds after the replay.",
)


@refusals.case("a late consumption that would starve an accepted one is refused")
def _(h):
    s = h.new()
    s.add_grant("g1", 100, 0, 10)
    h.ok(s.consume_credits(8, 60), "consume 60 at t=8")
    h.no(s.consume_credits(2, 60), "late consumption of 60 at t=2 would starve it")
    h.eq(s.get_available_credits(2), 100, "state untouched at t=2")
    h.eq(s.get_available_credits(8), 40, "state untouched at t=8")


@refusals.case("a late consumption that fits is accepted")
def _(h):
    s = h.new()
    s.add_grant("g1", 100, 0, 10)
    h.ok(s.consume_credits(8, 60), "consume 60 at t=8")
    h.ok(s.consume_credits(2, 40), "late consumption of 40 at t=2 still fits")
    h.eq(s.get_available_credits(1), 100, "before both")
    h.eq(s.get_available_credits(2), 60, "after the t=2 consumption")
    h.eq(s.get_available_credits(8), 0, "after both")


@refusals.case("a refused consumption is dropped, not retried")
def _(h):
    s = h.new()
    h.no(s.consume_credits(5, 80), "no grants yet")
    s.add_grant("g1", 100, 0, 10)
    h.eq(s.get_available_credits(5), 100, "a refused consumption never applies")


@refusals.case("a refused consumption leaves later requests unaffected")
def _(h):
    s = h.new()
    s.add_grant("g1", 50, 0, 10)
    h.no(s.consume_credits(5, 80), "too large")
    h.ok(s.consume_credits(5, 50), "exactly available")
    h.eq(s.get_available_credits(5), 0, "drained once, not twice")


@refusals.case("expiry window is respected across a late consumption")
def _(h):
    s = h.new()
    s.add_grant("early", 50, 0, 20)
    s.add_grant("late", 50, 20, 40)
    h.ok(s.consume_credits(30, 50), "drain the late grant")
    h.no(s.consume_credits(10, 60), "the early grant only holds 50")
    h.ok(s.consume_credits(10, 50), "the early grant exactly covers it")
    h.eq(s.get_available_credits(10), 0, "early drained")
    h.eq(s.get_available_credits(25), 50, "late grant not yet consumed")
    h.eq(s.get_available_credits(30), 0, "late drained")


# --------------------------------------------------------------------------
# edge cases
# --------------------------------------------------------------------------

edges = suite("Edge cases", "Boundaries, zero amounts, and odd-but-legal inputs.")


@edges.case("consuming zero always succeeds and changes nothing")
def _(h):
    s = h.new()
    s.add_grant("g1", 10, 0, 10)
    h.ok(s.consume_credits(5, 0), "zero inside a window")
    h.ok(s.consume_credits(500, 0), "zero outside every window")
    h.eq(s.get_available_credits(5), 10, "balance untouched")


@edges.case("a zero-amount grant is legal")
def _(h):
    s = h.new()
    s.add_grant("empty", 0, 0, 10)
    h.eq(s.get_available_credits(5), 0, "contributes nothing")
    h.no(s.consume_credits(5, 1), "cannot draw from it")
    h.ok(s.consume_credits(5, 0), "a zero draw is fine")


@edges.case("consumption exactly at a grant boundary")
def _(h):
    s = h.new()
    s.add_grant("g1", 100, 10, 20)
    h.no(s.consume_credits(20, 10), "the end is exclusive")
    h.ok(s.consume_credits(10, 10), "the start is inclusive")
    h.eq(s.get_available_credits(10), 90, "start-time consumption applied")


@edges.case("negative and large timestamps")
def _(h):
    s = h.new()
    s.add_grant("g1", 1000, -1000, 1000)
    s.add_grant("g2", 1000, 0, 10**12)
    h.eq(s.get_available_credits(-999), 1000, "only g1 active")
    h.ok(s.consume_credits(-500, 1000), "consume in negative time")
    h.eq(s.get_available_credits(-500), 0, "g1 drained, g2 not active")
    h.eq(s.get_available_credits(0), 1000, "g2 active and full")
    h.eq(s.get_available_credits(10**11), 1000, "g2 still active")


@edges.case("grants sharing identical windows")
def _(h):
    s = h.new()
    for gid in ("a", "b", "c", "d"):
        s.add_grant(gid, 25, 0, 10)
    h.ok(s.consume_credits(3, 70), "consume 70 at t=3")
    h.eq(s.get_available_credits(3), 30, "remaining")
    h.eq(s.get_available_credits(2), 100, "before the consumption")


@edges.case("many small consumptions against one long grant")
def _(h):
    s = h.new()
    s.add_grant("g", 100, 0, 1000)
    for i in range(100):
        h.ok(s.consume_credits(i, 1), f"consumption #{i}")
    h.eq(s.get_available_credits(0), 99, "after the first")
    h.eq(s.get_available_credits(49), 50, "halfway")
    h.eq(s.get_available_credits(99), 0, "drained")
    h.no(s.consume_credits(500, 1), "nothing left")


# --------------------------------------------------------------------------
# scale
# --------------------------------------------------------------------------

scale = suite(
    "Scale",
    "Should stay responsive as the event log grows. Slow but correct still passes correctness.",
    optional=True,
)


@scale.case("1000 grants and 1000 shuffled consumptions finish under 5s", budget_ms=5000)
def _(h):
    n = 1000
    s = h.new()
    for i in range(n):
        s.add_grant(f"g{i}", 10, i, i + 5)
    # deterministic shuffle of the timestamps 0..n-1
    order = [(i * 977) % n for i in range(n)]
    for t in order:
        h.ok(s.consume_credits(t, 5), f"consume at t={t}")
    h.eq(s.get_available_credits(0), 5, "first window")
    h.eq(s.get_available_credits(n - 1), 45, "last window")
    h.eq(s.get_available_credits(n + 10), 0, "past every window")


# --------------------------------------------------------------------------
# running
# --------------------------------------------------------------------------

def load_credit_system_from_path(path: str) -> type:
    """Import CreditSystem out of a .py file."""
    spec = importlib.util.spec_from_file_location("candidate_solution", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses resolve annotations through sys.modules
    spec.loader.exec_module(module)
    if not hasattr(module, "CreditSystem"):
        raise ImportError(f"{os.path.basename(path)} does not define a class named CreditSystem")
    return module.CreditSystem


def load_credit_system_from_source(source: str) -> type:
    """Exec a snippet of code and pull CreditSystem out of it."""
    # registering the source makes tracebacks quote the offending line
    linecache.cache["<solution>"] = (len(source), None, source.splitlines(True), "<solution>")
    namespace: dict = {"__name__": "candidate_solution"}
    exec(compile(source, "<solution>", "exec"), namespace)
    if "CreditSystem" not in namespace:
        raise ImportError("no class named CreditSystem was found in your code")
    return namespace["CreditSystem"]


def format_user_error(err: BaseException) -> str:
    """Traceback trimmed to the frames inside the candidate's own code."""
    if isinstance(err, SyntaxError):
        return "".join(traceback.format_exception_only(type(err), err)).strip()
    frames = [f for f in traceback.extract_tb(err.__traceback__) if f.filename == "<solution>"]
    lines = traceback.format_list(frames) if frames else []
    lines += traceback.format_exception_only(type(err), err)
    return "".join(lines).strip()


def run_case(credit_system: type, case: Case) -> dict:
    started = time.perf_counter()
    error = None
    try:
        case.fn(Harness(credit_system))
    except CheckFailed as failure:
        error = str(failure)
    except Exception as err:  # anything raised by the candidate's code
        error = format_user_error(err)
    ms = (time.perf_counter() - started) * 1000
    if error is None and case.budget_ms and ms > case.budget_ms:
        error = f"over budget\n  budget:   {case.budget_ms}ms\n  actual:   {ms:.0f}ms"
    try:
        source = inspect.getsource(case.fn)
    except (OSError, TypeError):  # source is unavailable when exec'd from a string
        source = ""
    return {
        "name": case.name,
        "ms": ms,
        "timed": case.budget_ms is not None,
        "error": error,
        "source": source,
    }


def run_all(source: str, skip_optional: bool = False) -> str:
    """Run every suite against `source`. Returns a JSON string — used by the bench."""
    captured = io.StringIO()
    try:
        with redirect_stdout(captured):
            credit_system = load_credit_system_from_source(source)
    except Exception as err:
        return json.dumps({"crash": format_user_error(err)})

    report = {"suites": [], "passed": 0, "failed": 0, "logs": ""}
    with redirect_stdout(captured):
        for s in SUITES:
            if s.optional and skip_optional:
                continue
            entry = {"name": s.name, "why": s.why, "cases": []}
            for case in s.cases:
                result = run_case(credit_system, case)
                report["failed" if result["error"] else "passed"] += 1
                entry["cases"].append(result)
            report["suites"].append(entry)
    report["logs"] = captured.getvalue()
    return json.dumps(report)


# --------------------------------------------------------------------------
# pytest entry point — `pytest interview/gpu-credits/python`
# --------------------------------------------------------------------------

try:
    import pytest
except ImportError:  # pytest is optional; the terminal runner below needs nothing
    pytest = None

if pytest is not None:
    _ALL = [(s, c) for s in SUITES for c in s.cases]

    @pytest.fixture(scope="session")
    def credit_system():
        path = os.environ.get("CREDIT_SOLUTION", os.path.join(HERE, "solution.py"))
        return load_credit_system_from_path(path)

    @pytest.mark.parametrize(
        "suite_obj,case",
        _ALL,
        ids=[f"{s.name} :: {c.name}" for s, c in _ALL],
    )
    def test_credit_system(credit_system, suite_obj, case):
        if case.budget_ms:
            started = time.perf_counter()
            case.fn(Harness(credit_system))
            ms = (time.perf_counter() - started) * 1000
            assert ms <= case.budget_ms, f"took {ms:.0f}ms, budget is {case.budget_ms}ms"
        else:
            case.fn(Harness(credit_system))


# --------------------------------------------------------------------------
# terminal runner — `python3 test_credit_system.py [solution.py]`
# --------------------------------------------------------------------------

def _main(argv: List[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    skip_optional = "--skip-optional" in argv
    path = args[0] if args else os.path.join(HERE, "solution.py")

    try:
        credit_system = load_credit_system_from_path(path)
    except Exception as err:
        print(f"Could not load {path}: {err}")
        return 2

    color = sys.stdout.isatty()
    dim = (lambda t: f"\033[2m{t}\033[0m") if color else (lambda t: t)
    green = (lambda t: f"\033[32m{t}\033[0m") if color else (lambda t: t)
    red = (lambda t: f"\033[31m{t}\033[0m") if color else (lambda t: t)
    bold = (lambda t: f"\033[1m{t}\033[0m") if color else (lambda t: t)

    passed = failed = 0
    for s in SUITES:
        if s.optional and skip_optional:
            continue
        print(f"\n{bold(s.name)} {dim('— ' + s.why)}")
        for case in s.cases:
            result = run_case(credit_system, case)
            if result["error"]:
                failed += 1
                print(f"  {red('FAIL')} {case.name}")
                for line in result["error"].splitlines():
                    print(f"       {line}")
            else:
                passed += 1
                timing = dim(f" ({result['ms']:.0f}ms)") if case.budget_ms else ""
                print(f"  {green('PASS')} {case.name}{timing}")

    print(f"\n{passed} passed, {failed} failed\n")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
