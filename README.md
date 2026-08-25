# LeaveBase

Leave management for **Prismix Studios**, built to enforce the company Leave Policy
(effective 1 July 2026) rather than merely store leave requests.

The distinguishing idea: the policy is not documentation that sits beside the app — it is a rule
engine at the centre of it. Every block, warning and deduction the user sees carries the clause
that caused it, and the same function that previews a request is the one that judges it at
submission, so the preview can never disagree with the decision.

---

## Running it

**To try it with demo data** — 26 fictional Prismix staff, leave already in flight:

```bash
npm install
npm run demo
npm run dev
```

Sign in with any address below; the password for every demo account is `prismix`.

| Email | Role | What it shows |
|---|---|---|
| `vatsal.sheth@prismixstudios.com` | Administrator (CEO) | Everything, including Settings |
| `ashish.parpani@prismixstudios.com` | HR | Directory, reports, adjustments, absence records |
| `arjun.nair@prismixstudios.com` | Head of Department | Second-level approval on long Privileged Leave |
| `sneha.menon@prismixstudios.com` | Reporting Manager | Approval inbox and team view |
| `aryan.gupta@prismixstudios.com` | Employee | A §8 sandwich leave and a day of Loss of Pay |
| `meera.iyer@prismixstudios.com` | Employee on probation | No Privileged Leave, plus an open absence flag |

The demo world is set at **24 August 2026**, inside leave year 2026-27.

**To start empty and put your own people in:**

```bash
npm install
npm run setup
npm run dev
```

An empty database sends you to **/setup**, where you create the first administrator. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full path to a live URL with your real team on it.

`npm run db:reset` wipes back to empty; `npm run db:reset:demo` wipes and reloads the demo.

## Who can do what

| Role | Can do |
|---|---|
| **Employee** | Apply; withdraw their own pending request; cancel their own *future* approved leave; see their balances and ledger |
| **Reporting Manager** | + approval inbox for direct reports, team balances, comp-off claims |
| **Head of Department** | + second-level approval on Privileged Leave beyond the short-run boundary (§6); sees the whole department |
| **HR** | + add, edit and deactivate employees; import from CSV; balance adjustments; confirm and exit; record unauthorised absence; reports; override any approval |
| **Administrator** | + policy values, holidays, departments, maintenance jobs, audit log; the only role that can grant HR or Administrator |

Approvals are not decided by role alone — the chain is **derived per request**. Privileged Leave
longer than the short-run boundary routes to the manager *then* the head of department (§6);
maternity routes to HR (§9); a head of department's own leave goes to HR rather than to someone who
reports to them; leave while serving notice needs both manager and HOD (§17).

Two guards worth knowing: an administrator cannot be demoted or deactivated if they are the last
one, and an employee cannot be deactivated while people still report to them or requests still
await their decision — the app names who and what, rather than silently orphaning approvals.

### Other commands

```bash
npm run build        # production build
npm run check        # typecheck + 54 rule-engine assertions
npm run db:studio    # browse the database
node scripts/db-provider.mjs postgres   # switch the datasource for deployment
```

---

## Architecture

```
src/lib/policy/      the rule engine — pure functions, no database, no React
  config.ts            every number the policy states, as editable settings
  types.ts             leave types, roles, statuses and their presentation metadata
  leave-year.ts        §3 financial-year maths, §7 quarterly pro-rata accrual, carry-forward
  calendar.ts          working-day classification and the §8 sandwich rule
  balance.ts           ledger → balance
  routing.ts           who must approve, in what order
  evaluate.ts          the judge: takes a draft, returns findings with clause references

src/lib/services/    the database layer that feeds the engine and writes its results
src/app/             Next.js App Router — one route per surface
src/components/      the design system in code
docs/                DESIGN_SYSTEM.md and POLICY_SPEC.md
```

**The engine never touches the database.** `evaluateRequest()` is a pure function taking a draft
plus everything it could need to judge it. That is what lets the identical call run in the
application form as the user types (via `/api/evaluate`) and again on the server at submission.

**Balances are derived, never stored.** A balance is the sum of an append-only ledger, where every
entry carries a rule id, an actor and a timestamp. That is what makes the number defensible when
an employee disputes it six months later, and it is why cancelling leave credits days back rather
than editing a counter.

**Accrual is idempotent.** `runAccrual()` compares what *should* have accrued by today against what
the ledger holds and posts only the difference. Running it twice is a no-op, which is why it runs
opportunistically on sign-in instead of depending on a scheduler.

---

## What the policy engine enforces

Every clause is mapped to a rule id in [`docs/POLICY_SPEC.md`](docs/POLICY_SPEC.md). The ones that
carry the most weight:

- **§8 intervening days** — leave immediately before *and* after a weekly off or holiday absorbs
  the days between, and they come out of the balance. Evaluated across request boundaries, so an
  approved leave ending Friday plus a new request starting Monday charges the weekend to the new
  request — and never charges the same day twice.
- **§6 notice periods** — up to 3 consecutive days of Privileged Leave needs 15 days' notice; more
  than that needs 30 days *and* the Head of Department. Both are hard blocks, with the earliest
  qualifying start date shown.
- **§7 accrual** — quarterly and pro-rata, with Privileged Leave credited only from confirmation.
  Rounding is applied to the cumulative total rather than per quarter, so the four quarters always
  sum to exactly the annual grant.
- **§5 medical proof** — beyond two consecutive sick days without documents, the leave is charged
  to Privileged Leave instead of Sick Leave.
- **§13 Loss of Pay** — insufficient balance never blocks a request; it splits the shortfall into
  unpaid days and says so before submission.
- **§11 comp-off** — credits are tracked individually because each carries its own 20-day expiry.
  The soonest-expiring credit is always spent first.
- **§4/§6 lapse** — Casual Leave lapses at year end; Privileged Leave is held at a 30-day ceiling.

### Two decisions worth knowing about

**The Casual Leave count.** §4 of the source PDF reads "Six (04) Casual Leaves" — the word and the
numeral disagree. Confirmed as **6**, and held as a Policy Setting so HR can correct it without a
code change. Surfaced openly on the in-app policy page rather than buried.

**"Calendar year" vs the policy year.** §4–6 say "calendar year" while §3 defines the policy year as
the financial year and §4 has Casual Leave lapsing on 31 March. LeaveBase follows §3 throughout —
all entitlement runs April to March.

### One place the policy needed more than the app could infer

§12 treats six consecutive working days of unauthorised absence as absconding. Absence cannot be
inferred from missing leave records — a working day with no leave on it describes everyone who
simply came to work. So absence is **recorded** by a manager or HR (Employees → an employee →
Record unauthorised absence), and the detector reads those records for consecutive runs.

It raises a flag; it never terminates anyone. §12 says absconding "will result in automatic
termination", but that is a decision for a human with the full picture.

---

## Design

The visual language is documented in [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — "Prism
Glass", derived from the three reference UIs and the Prismix mark, whose ring travels
cyan → blue → violet → magenta and hands the product a ready-made accent system.

The short version: a lavender-tinted canvas so white cards read as elevation without heavy shadow;
generous radii; one saturated gradient per screen and no more; every leave type owns a hue used
consistently across chips, calendar, rings and charts; numerals are the loudest thing on the page.
Dark mode is a re-lighting rather than an inversion. There is a list of explicitly banned
anti-patterns at the end of that document.

## Notes and limits

- **SQLite** for local running. `node scripts/db-provider.mjs postgres` switches the datasource;
  no application code changes, because no query uses a dialect-specific feature.
- **Sessions** are opaque random tokens in the database, checked server-side and carried in an
  httpOnly cookie. There is no JWT and no signing secret to leak — revoking access is deleting a
  row. Passwords are bcrypt hashed; sign-in is rate-limited. Serve it over HTTPS: cookies are set
  `Secure` in production and will not survive plain HTTP.
- **Migrating balances.** When you add or import someone you can enter the balance your existing
  records show *today*; LeaveBase reconciles it against the accrual it has already computed, so the
  figure shown afterwards is exactly what you typed. Their *used* total still starts at zero — the
  remaining balance is what approvals depend on, and that is correct from day one.
- **No email.** The policy names email as the application channel; LeaveBase supersedes it while
  preserving the intent — every decision produces an immutable, timestamped, exportable record,
  which is the "record of each approval" §18 asks for. Wiring real email means calling a provider
  from `src/lib/services/activity.ts`, where notifications are already centralised.
- **Medical documents** are recorded as a declaration and a reference, not a file upload.
