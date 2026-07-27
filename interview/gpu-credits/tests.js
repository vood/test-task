/* GPU Credit System — test suite.
 * Single source of truth: used by index.html (browser) and run-tests.mjs (node).
 * Each case receives ({ CreditSystem, eq, ok, no }).
 */
(function (root) {
  const SUITES = [
    {
      name: "Grants and queries",
      why: "A grant contributes to the balance only inside its own window.",
      cases: [
        {
          name: "empty system reports zero at any time",
          run: ({ CreditSystem, eq }) => {
            const s = new CreditSystem();
            eq(s.getAvailableCredits(0), 0, "balance at 0");
            eq(s.getAvailableCredits(-50), 0, "balance at -50");
            eq(s.getAvailableCredits(1e9), 0, "balance at 1e9");
          },
        },
        {
          name: "single grant is active on [start, end)",
          run: ({ CreditSystem, eq }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 100, 10, 20);
            eq(s.getAvailableCredits(9), 0, "before start");
            eq(s.getAvailableCredits(10), 100, "at start");
            eq(s.getAvailableCredits(19), 100, "last active tick");
            eq(s.getAvailableCredits(20), 0, "at end (exclusive)");
            eq(s.getAvailableCredits(21), 0, "after end");
          },
        },
        {
          name: "overlapping grants add up",
          run: ({ CreditSystem, eq }) => {
            const s = new CreditSystem();
            s.addGrant("a", 100, 0, 10);
            s.addGrant("b", 50, 5, 20);
            eq(s.getAvailableCredits(4), 100, "only a active");
            eq(s.getAvailableCredits(5), 150, "both active");
            eq(s.getAvailableCredits(9), 150, "both active");
            eq(s.getAvailableCredits(10), 50, "only b active");
            eq(s.getAvailableCredits(19), 50, "only b active");
            eq(s.getAvailableCredits(20), 0, "none active");
          },
        },
        {
          name: "grants added out of chronological order",
          run: ({ CreditSystem, eq }) => {
            const s = new CreditSystem();
            s.addGrant("late", 10, 100, 200);
            s.addGrant("early", 20, 0, 50);
            s.addGrant("middle", 30, 40, 120);
            eq(s.getAvailableCredits(10), 20, "early only");
            eq(s.getAvailableCredits(45), 50, "early + middle");
            eq(s.getAvailableCredits(60), 30, "middle only");
            eq(s.getAvailableCredits(110), 40, "middle + late");
            eq(s.getAvailableCredits(150), 10, "late only");
            eq(s.getAvailableCredits(250), 0, "nothing left");
          },
        },
        {
          name: "empty window is never active",
          run: ({ CreditSystem, eq }) => {
            const s = new CreditSystem();
            s.addGrant("zero", 100, 5, 5);
            eq(s.getAvailableCredits(4), 0, "before");
            eq(s.getAvailableCredits(5), 0, "at start == end");
            eq(s.getAvailableCredits(6), 0, "after");
          },
        },
      ],
    },

    {
      name: "Consuming credits",
      why: "A consume succeeds only if the credits are available at that timestamp.",
      cases: [
        {
          name: "successful consume reduces the balance from that time on",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 100, 0, 10);
            ok(s.consumeCredits(5, 30), "consume 30 at t=5");
            eq(s.getAvailableCredits(5), 70, "balance at consume time");
            eq(s.getAvailableCredits(9), 70, "balance after consume time");
            eq(s.getAvailableCredits(10), 0, "grant expired");
          },
        },
        {
          name: "a consume does not affect earlier timestamps",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 100, 0, 10);
            ok(s.consumeCredits(5, 30), "consume 30 at t=5");
            eq(s.getAvailableCredits(0), 100, "balance at t=0");
            eq(s.getAvailableCredits(4), 100, "balance just before consume");
            eq(s.getAvailableCredits(5), 70, "balance at consume time");
          },
        },
        {
          name: "repeated consumes accumulate",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 100, 0, 100);
            ok(s.consumeCredits(10, 40), "consume 40 at t=10");
            ok(s.consumeCredits(20, 25), "consume 25 at t=20");
            ok(s.consumeCredits(30, 35), "consume 35 at t=30");
            eq(s.getAvailableCredits(9), 100, "before any consume");
            eq(s.getAvailableCredits(10), 60, "after first");
            eq(s.getAvailableCredits(20), 35, "after second");
            eq(s.getAvailableCredits(30), 0, "after third");
            eq(s.getAvailableCredits(99), 0, "still drained");
          },
        },
        {
          name: "consume spanning several active grants",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("a", 40, 0, 50);
            s.addGrant("b", 60, 0, 50);
            ok(s.consumeCredits(10, 90), "consume 90 at t=10");
            eq(s.getAvailableCredits(10), 10, "remainder");
            eq(s.getAvailableCredits(9), 100, "untouched before");
          },
        },
        {
          name: "consume of more than available is refused and changes nothing",
          run: ({ CreditSystem, eq, no }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 100, 0, 10);
            no(s.consumeCredits(5, 101), "consume 101 at t=5");
            eq(s.getAvailableCredits(5), 100, "balance untouched");
            eq(s.getAvailableCredits(0), 100, "balance untouched at start");
          },
        },
        {
          name: "consume outside every window is refused",
          run: ({ CreditSystem, eq, no }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 100, 10, 20);
            no(s.consumeCredits(9, 1), "just before window");
            no(s.consumeCredits(20, 1), "at exclusive end");
            no(s.consumeCredits(999, 1), "far after window");
            eq(s.getAvailableCredits(15), 100, "balance untouched");
          },
        },
        {
          name: "consume of the exact remaining balance succeeds",
          run: ({ CreditSystem, eq, ok, no }) => {
            const s = new CreditSystem();
            s.addGrant("a", 30, 0, 10);
            s.addGrant("b", 70, 0, 10);
            ok(s.consumeCredits(5, 100), "consume all 100");
            eq(s.getAvailableCredits(5), 0, "drained");
            no(s.consumeCredits(6, 1), "nothing left");
          },
        },
      ],
    },

    {
      name: "Allocation policy",
      why: "Credits are drawn from the soonest-expiring active grant first.",
      cases: [
        {
          name: "soonest-expiring grant is drained first",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("long", 100, 0, 100);
            s.addGrant("short", 100, 0, 20);
            ok(s.consumeCredits(5, 100), "consume 100 at t=5");
            eq(s.getAvailableCredits(5), 100, "half the pool is gone");
            eq(s.getAvailableCredits(19), 100, "still one grant standing");
            eq(s.getAvailableCredits(20), 100, "short grant expired, long one intact");
            eq(s.getAvailableCredits(99), 100, "long grant untouched");
          },
        },
        {
          name: "overflow spills into the later-expiring grant",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("long", 100, 0, 100);
            s.addGrant("short", 100, 0, 20);
            ok(s.consumeCredits(5, 130), "consume 130 at t=5");
            eq(s.getAvailableCredits(5), 70, "remaining across both");
            eq(s.getAvailableCredits(20), 70, "short expired, long keeps 70");
            eq(s.getAvailableCredits(99), 70, "long grant balance");
          },
        },
        {
          name: "expiry order wins over grant start order",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("first", 50, 0, 90);
            s.addGrant("second", 50, 10, 30);
            ok(s.consumeCredits(20, 50), "consume 50 at t=20");
            eq(s.getAvailableCredits(20), 50, "half the pool is gone");
            eq(s.getAvailableCredits(30), 50, "second expired, first intact");
            eq(s.getAvailableCredits(89), 50, "first still full");
          },
        },
        {
          name: "three-deep expiry ladder",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("c", 10, 0, 300);
            s.addGrant("a", 10, 0, 100);
            s.addGrant("b", 10, 0, 200);
            ok(s.consumeCredits(1, 15), "consume 15 at t=1");
            eq(s.getAvailableCredits(1), 15, "total remaining");
            eq(s.getAvailableCredits(100), 15, "a expired but was already empty");
            eq(s.getAvailableCredits(200), 10, "b expired holding 5");
            eq(s.getAvailableCredits(299), 10, "c untouched");
          },
        },
      ],
    },

    {
      name: "Out-of-order arrivals",
      why: "State always reflects the events processed so far, replayed in timestamp order.",
      cases: [
        {
          name: "a grant arriving after a query is still visible in the past",
          run: ({ CreditSystem, eq }) => {
            const s = new CreditSystem();
            eq(s.getAvailableCredits(5), 0, "nothing known yet");
            s.addGrant("g1", 100, 0, 10);
            eq(s.getAvailableCredits(5), 100, "grant now known");
          },
        },
        {
          name: "a late consume re-routes an earlier allocation",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 100, 0, 10);
            s.addGrant("g2", 100, 0, 50);
            ok(s.consumeCredits(20, 100), "consume 100 at t=20");
            eq(s.getAvailableCredits(20), 0, "g2 drained");
            eq(s.getAvailableCredits(5), 200, "both grants intact at t=5");

            ok(s.consumeCredits(5, 100), "late consume of 100 at t=5");
            eq(s.getAvailableCredits(4), 200, "before both consumes");
            eq(s.getAvailableCredits(5), 100, "after the t=5 consume");
            eq(s.getAvailableCredits(9), 100, "g1 empty, g2 not yet consumed");
            eq(s.getAvailableCredits(10), 100, "g1 expired, g2 still full");
            eq(s.getAvailableCredits(20), 0, "g2 consumed at t=20");
            eq(s.getAvailableCredits(49), 0, "still drained");
          },
        },
        {
          name: "a late grant funds an already-accepted consume",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 60, 0, 100);
            ok(s.consumeCredits(50, 60), "consume 60 at t=50");
            eq(s.getAvailableCredits(50), 0, "drained");
            s.addGrant("g2", 40, 0, 100);
            eq(s.getAvailableCredits(49), 100, "both grants visible before consume");
            eq(s.getAvailableCredits(50), 40, "g2 covers the rest");
          },
        },
        {
          name: "interleaved out-of-order consumes",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("a", 50, 0, 40);
            s.addGrant("b", 50, 20, 80);
            ok(s.consumeCredits(30, 20), "consume 20 at t=30");
            ok(s.consumeCredits(10, 20), "late consume 20 at t=10");
            ok(s.consumeCredits(25, 20), "late consume 20 at t=25");
            eq(s.getAvailableCredits(9), 50, "only a active, untouched");
            eq(s.getAvailableCredits(10), 30, "a after the t=10 consume");
            eq(s.getAvailableCredits(20), 80, "b joins the pool");
            eq(s.getAvailableCredits(25), 60, "after the t=25 consume");
            eq(s.getAvailableCredits(30), 40, "after the t=30 consume");
            eq(s.getAvailableCredits(40), 40, "a expired empty, b holds the rest");
            eq(s.getAvailableCredits(79), 40, "b balance");
            eq(s.getAvailableCredits(80), 0, "b expired");
          },
        },
        {
          name: "consumes arriving in reverse order",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("g", 100, 0, 100);
            ok(s.consumeCredits(80, 25), "consume at t=80");
            ok(s.consumeCredits(60, 25), "consume at t=60");
            ok(s.consumeCredits(40, 25), "consume at t=40");
            ok(s.consumeCredits(20, 25), "consume at t=20");
            eq(s.getAvailableCredits(19), 100, "before all");
            eq(s.getAvailableCredits(20), 75, "one applied");
            eq(s.getAvailableCredits(40), 50, "two applied");
            eq(s.getAvailableCredits(60), 25, "three applied");
            eq(s.getAvailableCredits(80), 0, "four applied");
          },
        },
      ],
    },

    {
      name: "Refusals and atomicity",
      why: "A consume is accepted only if every accepted consume still holds after the replay.",
      cases: [
        {
          name: "a late consume that would starve an accepted one is refused",
          run: ({ CreditSystem, eq, ok, no }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 100, 0, 10);
            ok(s.consumeCredits(8, 60), "consume 60 at t=8");
            no(s.consumeCredits(2, 60), "late consume 60 at t=2 would starve it");
            eq(s.getAvailableCredits(2), 100, "state untouched at t=2");
            eq(s.getAvailableCredits(8), 40, "state untouched at t=8");
          },
        },
        {
          name: "a late consume that fits is accepted",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 100, 0, 10);
            ok(s.consumeCredits(8, 60), "consume 60 at t=8");
            ok(s.consumeCredits(2, 40), "late consume 40 at t=2 still fits");
            eq(s.getAvailableCredits(1), 100, "before both");
            eq(s.getAvailableCredits(2), 60, "after the t=2 consume");
            eq(s.getAvailableCredits(8), 0, "after both");
          },
        },
        {
          name: "a refused consume is dropped, not retried",
          run: ({ CreditSystem, eq, no }) => {
            const s = new CreditSystem();
            no(s.consumeCredits(5, 80), "no grants yet");
            s.addGrant("g1", 100, 0, 10);
            eq(s.getAvailableCredits(5), 100, "refused consume never applies");
          },
        },
        {
          name: "a refused consume leaves later requests unaffected",
          run: ({ CreditSystem, eq, ok, no }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 50, 0, 10);
            no(s.consumeCredits(5, 80), "too large");
            ok(s.consumeCredits(5, 50), "exactly available");
            eq(s.getAvailableCredits(5), 0, "drained once, not twice");
          },
        },
        {
          name: "expiry window is respected across a late consume",
          run: ({ CreditSystem, eq, ok, no }) => {
            const s = new CreditSystem();
            s.addGrant("early", 50, 0, 20);
            s.addGrant("late", 50, 20, 40);
            ok(s.consumeCredits(30, 50), "drain the late grant");
            no(s.consumeCredits(10, 60), "early grant only holds 50");
            ok(s.consumeCredits(10, 50), "early grant exactly covers it");
            eq(s.getAvailableCredits(10), 0, "early drained");
            eq(s.getAvailableCredits(25), 50, "late grant not yet consumed");
            eq(s.getAvailableCredits(30), 0, "late drained");
          },
        },
      ],
    },

    {
      name: "Edge cases",
      why: "Boundaries, zero amounts, and odd-but-legal inputs.",
      cases: [
        {
          name: "consuming zero always succeeds and changes nothing",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 10, 0, 10);
            ok(s.consumeCredits(5, 0), "zero inside a window");
            ok(s.consumeCredits(500, 0), "zero outside every window");
            eq(s.getAvailableCredits(5), 10, "balance untouched");
          },
        },
        {
          name: "a zero-amount grant is legal",
          run: ({ CreditSystem, eq, ok, no }) => {
            const s = new CreditSystem();
            s.addGrant("empty", 0, 0, 10);
            eq(s.getAvailableCredits(5), 0, "contributes nothing");
            no(s.consumeCredits(5, 1), "cannot draw from it");
            ok(s.consumeCredits(5, 0), "zero draw is fine");
          },
        },
        {
          name: "consume exactly at a grant boundary",
          run: ({ CreditSystem, eq, ok, no }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 100, 10, 20);
            no(s.consumeCredits(20, 10), "end is exclusive");
            ok(s.consumeCredits(10, 10), "start is inclusive");
            eq(s.getAvailableCredits(10), 90, "start-time consume applied");
          },
        },
        {
          name: "negative and large timestamps",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("g1", 1000, -1000, 1000);
            s.addGrant("g2", 1000, 0, 1e12);
            eq(s.getAvailableCredits(-999), 1000, "only g1 active");
            ok(s.consumeCredits(-500, 1000), "consume in negative time");
            eq(s.getAvailableCredits(-500), 0, "g1 drained, g2 not active");
            eq(s.getAvailableCredits(0), 1000, "g2 active and full");
            eq(s.getAvailableCredits(1e11), 1000, "g2 still active");
          },
        },
        {
          name: "grants sharing identical windows",
          run: ({ CreditSystem, eq, ok }) => {
            const s = new CreditSystem();
            s.addGrant("a", 25, 0, 10);
            s.addGrant("b", 25, 0, 10);
            s.addGrant("c", 25, 0, 10);
            s.addGrant("d", 25, 0, 10);
            ok(s.consumeCredits(3, 70), "consume 70 at t=3");
            eq(s.getAvailableCredits(3), 30, "remaining");
            eq(s.getAvailableCredits(2), 100, "before the consume");
          },
        },
        {
          name: "many small consumes against one long grant",
          run: ({ CreditSystem, eq, ok, no }) => {
            const s = new CreditSystem();
            s.addGrant("g", 100, 0, 1000);
            for (let i = 0; i < 100; i++) ok(s.consumeCredits(i, 1), `consume #${i}`);
            eq(s.getAvailableCredits(0), 99, "after the first");
            eq(s.getAvailableCredits(49), 50, "halfway");
            eq(s.getAvailableCredits(99), 0, "drained");
            no(s.consumeCredits(500, 1), "nothing left");
          },
        },
      ],
    },

    {
      name: "Scale",
      why: "Should stay responsive as the event log grows. Slow but correct still passes correctness.",
      optional: true,
      cases: [
        {
          name: "2000 grants and 2000 shuffled consumes finish under 5s",
          budgetMs: 5000,
          run: ({ CreditSystem, eq, ok }) => {
            const N = 2000;
            const s = new CreditSystem();
            for (let i = 0; i < N; i++) s.addGrant("g" + i, 10, i, i + 5);
            // deterministic shuffle of the timestamps 0..N-1
            const order = [];
            for (let i = 0; i < N; i++) order.push((i * 977) % N);
            for (const t of order) ok(s.consumeCredits(t, 5), "consume at t=" + t);
            eq(s.getAvailableCredits(0), 5, "first window");
            eq(s.getAvailableCredits(N - 1), 45, "last window");
            eq(s.getAvailableCredits(N + 10), 0, "past every window");
          },
        },
      ],
    },
  ];

  root.CREDIT_TEST_SUITES = SUITES;
})(typeof globalThis !== "undefined" ? globalThis : this);
