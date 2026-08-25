# Policy → Rule Catalogue

Every enforceable statement in *Prismix Studios Leave Policy* (effective 01-Jul-2026) mapped to a
rule ID. Rules are implemented in `src/lib/policy/` and each carries its `ruleId` + `clause` into
the UI, so any block or warning the user sees can quote the section that caused it.

Legend: **HARD** = request cannot be submitted · **SOFT** = warns, submission allowed ·
**AUTO** = system acts without user input · **CFG** = value lives in Policy Settings.

---

## §3 Policy Year

| ID | Rule | Kind |
|---|---|---|
| `YEAR.FY` | Leave year runs **1 April → 31 March**. All entitlement, accrual, carry-forward and lapse computations key off this window. | AUTO |
| `YEAR.EFFECTIVE` | Policy effective **01-Jul-2026**. Requests dated before this are read-only historical records. | AUTO |

> **Drafting note carried into the product.** §4–§6 say "calendar year" while §3 defines the policy
> year as the financial year and §4 says CL lapses on 31 March. LeaveBase resolves this in favour of
> §3 — *leave year = financial year* — and surfaces the note on the Policy Settings screen so HR can
> see the interpretation that was made rather than discovering it in a balance dispute.

## §2 Scope & Eligibility

| ID | Rule | Kind |
|---|---|---|
| `SCOPE.PAYROLL` | Applies to full-time, part-time, fixed-term/contract, and full-time consultants on direct payroll. Third-party/agency/vendor personnel are out of scope and cannot hold a LeaveBase account with leave entitlement. | HARD |

## §4 Casual Leave

| ID | Rule | Kind |
|---|---|---|
| `CL.ENTITLE` | **6 days** per leave year (CFG — see drafting note below), **pro-rata** to period of service in that year. | AUTO · CFG |
| `CL.NO_CF` | Cannot be carried forward. | AUTO |
| `CL.LAPSE` | Unused CL lapses automatically on 31 March. | AUTO |
| `CL.NO_ENCASH` | Non-encashable. | HARD |
| `CL.RECOVERY` | On exit, CL availed in excess of pro-rata entitlement is recovered in full & final settlement. | AUTO |
| `CL.PURPOSE` | For casual/general/unforeseen reasons — *not* long vacations. Enforced softly as a nudge toward PL beyond a configurable run length. | SOFT · CFG |

> **Drafting note.** §4 reads "Six (04) Casual Leaves" — word and numeral disagree. Confirmed with
> the organisation as **6**; stored as a Policy Setting so it can be corrected without a code change.

## §5 Sick Leave

| ID | Rule | Kind |
|---|---|---|
| `SL.ENTITLE` | **6 days** per leave year, pro-rata to tenure. | AUTO · CFG |
| `SL.MEDICAL_DOC` | More than **2 consecutive** SL days requires medical documents submitted to HR. | HARD (to approve) |
| `SL.DOC_FAILURE` | If documents are not furnished, the leave is **deducted from PL** instead. | AUTO |
| `SL.CF_UNLIMITED` | Carried forward to subsequent years without limit. | AUTO |
| `SL.NO_CASH` | Non-cashable during employment or on separation. | HARD |
| `SL.NO_PRIOR_APPROVAL` | SL is the only type exempt from the advance-application requirement (§15) — it may be applied retrospectively. | AUTO |

## §6 Privileged Leave

| ID | Rule | Kind |
|---|---|---|
| `PL.ENTITLE` | **15 days** per leave year. | AUTO · CFG |
| `PL.CONFIRMED_ONLY` | Employees on probation are **not entitled** to PL until confirmation. | HARD |
| `PL.NOTICE_15` | For **up to 3 consecutive** PL days: apply and be approved **≥15 days in advance**. | HARD |
| `PL.NOTICE_30` | For **more than 3 consecutive** PL days: apply **≥30 days in advance**. | HARD |
| `PL.DUAL_APPROVAL` | More than 3 consecutive PL days requires approval by **both** Reporting Manager **and** Head of Department. | AUTO |
| `PL.INTERVENING` | Intervening declared holidays and weekly offs are counted as part of PL. | AUTO |
| `PL.CARRY_FWD` | Unutilised PL carries forward. | AUTO |
| `PL.CAP_30` | Accumulated PL may **never exceed 30 days** at any time. Excess lapses automatically; the quota is held at 30. | AUTO |
| `PL.NO_CASH` | Not cashable under any circumstances. | HARD |

## §7 Leave Accrual

| ID | Rule | Kind |
|---|---|---|
| `ACCRUAL.QUARTERLY` | PL, CL and SL credit at the **start of each quarter** on a pro-rata basis. Quarters are FY quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar. | AUTO |
| `ACCRUAL.PROBATION` | On probation, only **CL and SL** accrue quarterly. | AUTO |
| `ACCRUAL.PL_ON_CONFIRM` | PL is credited only on successful confirmation, pro-rata for the eligible period. | AUTO |

## §8 General Notes

| ID | Rule | Kind |
|---|---|---|
| `GEN.NO_CLUBBING` | SL, CL and PL **cannot be clubbed**. One request carries exactly one type, and a request may not be contiguous with an approved/pending request of a different type. | HARD |
| `GEN.ADVANCE` | Employee is responsible for applying in advance and obtaining approval (except SL). | HARD |
| `GEN.NO_APPLY_LOP` | Failure to apply ⇒ the day is treated as absence ⇒ Loss of Pay. | AUTO |
| `GEN.SANDWICH` | Where leave is availed **immediately before and immediately after** a weekly off or declared holiday, the intervening day(s) are **also treated as leave** and deducted from balance. | AUTO |

`GEN.SANDWICH` is the single most consequential computation in the product. It is evaluated across
request boundaries: an approved leave ending Friday plus a new request starting Monday sandwiches
the weekend, and the weekend is charged to the *new* request. The day-by-day breakdown shown during
application makes every charged day visible before submission.

## §9 Maternity Leave

| ID | Rule | Kind |
|---|---|---|
| `ML.ELIGIBLE` | Female employees. | HARD |
| `ML.SPLIT` | Max **8 weeks pre-delivery + 18 weeks post-delivery**, or the full **26 weeks post-delivery**. | HARD |
| `ML.NOTICE_90` | HR must be informed in writing **≥3 months** before proceeding on leave. | HARD |
| `ML.MEDICAL_CERT` | Requires medical certificate stating expected date of childbirth. | HARD |
| `ML.INCLUSIVE` | Weekly offs and holidays within the period count as part of maternity leave. | AUTO |
| `ML.NO_CASH` | Non-cashable; paid per the normal payroll cycle. | AUTO |

## §10 Paternity Leave

| ID | Rule | Kind |
|---|---|---|
| `PAT.ENTITLE` | **5 days** for biological fathers, for care of newborn and spouse. | AUTO · CFG |
| `PAT.NO_CASH` | Non-cashable. | HARD |

## §11 Compensatory Leave

| ID | Rule | Kind |
|---|---|---|
| `CO.PRIOR_APPROVAL` | Working a national holiday, declared holiday or weekly off must have **prior Reporting Manager approval** to earn comp-off. | HARD |
| `CO.CLAIM_FIRST` | Employee first raises a **Comp-Off claim** against the day worked; RM approval **credits** the account. | AUTO |
| `CO.EXPIRY_20` | The credit must be availed within **20 days** of the holiday worked, else it lapses. | AUTO · CFG |
| `CO.AVAIL_APPROVAL` | Availing comp leave is itself a request requiring RM approval. | AUTO |
| `CO.MAX_15` | Maximum **15** compensatory offs may be availed in a year. | HARD · CFG |

Comp-off credits are tracked individually (not as a pooled number) because each carries its own
expiry date. The UI always consumes the **soonest-expiring** credit first.

## §12 Unapproved / Unauthorised Absence

| ID | Rule | Kind |
|---|---|---|
| `ABS.LWP` | Absence without approval is treated as Leave Without Pay. | AUTO |
| `ABS.ABSCOND_6` | Uninformed/unauthorised absence for **6 consecutive working days or more** is treated as absconding and results in automatic termination of employment. | AUTO |
| `ABS.NOTICE_RECOVERY` | In absconding cases the company may recover the notice-period shortfall from full & final settlement. | — |

`ABS.ABSCOND_6` is implemented as a detector that raises a high-severity HR alert at **day 4** (early
warning) and flags the absconding threshold at day 6. It never terminates anyone automatically — it
raises the flag and records it; a human acts.

## §13 Loss of Pay

| ID | Rule | Kind |
|---|---|---|
| `LOP.UNAPPROVED` | Any unapproved leave is LOP. | AUTO |
| `LOP.NO_PAY` | During LOP the employee is not entitled to pay or allowances. | AUTO |
| `LOP.NO_BALANCE` | Approved leave taken **without available balance** is LOP. | AUTO |
| `LOP.DISCIPLINARY` | The company may apply LOP as a disciplinary measure regardless of balance. | — (HR manual action) |

## §14 Half-Day Leave

| ID | Rule | Kind |
|---|---|---|
| `HALF.WINDOW` | Half-day leave is either the **first four hours** or the **last four hours** of the workday. | HARD |
| `HALF.VALUE` | Counts as 0.5 day against balance. Only single-day requests may be half-days. | AUTO |

## §15 Procedure for Applying

| ID | Rule | Kind |
|---|---|---|
| `PROC.ADVANCE` | Apply in advance and obtain prior approval for all leave **except SL**. | HARD |
| `PROC.DISCRETION` | Reporting Authorities may approve or reject on professional grounds. | — |
| `PROC.RECORD` | Any absence not applied for and approved is Unauthorised Leave ⇒ LOP. | AUTO |

The policy names email as the channel. LeaveBase supersedes it while preserving the intent: every
decision produces an immutable, timestamped, exportable record — the audit trail *is* the "record of
each approval" §18 asks for.

## §16 Cancellation

| ID | Rule | Kind |
|---|---|---|
| `CANC.BY_MANAGER` | RM or Department Head may cancel already-sanctioned leave in extraordinary situations. | AUTO |
| `CANC.CREDIT_BACK` | Cancellation reverses the ledger debit. | AUTO |
| `CANC.PROCEEDS_ANYWAY` | If the employee proceeds to take cancelled leave, the absence is unauthorised (⇒ §12/§13). | AUTO |
| `CANC.BY_EMPLOYEE` | An employee may withdraw a request while PENDING, or cancel an APPROVED future-dated leave. Past-dated approved leave cannot be self-cancelled. | HARD |

## §17 Settlement on Resignation / Termination

| ID | Rule | Kind |
|---|---|---|
| `EXIT.RECOVERY` | CL or PL availed in excess of pro-rata entitlement is recovered in F&F. | AUTO |
| `EXIT.NO_CASH` | PL, CL and SL are not cashable. | HARD |
| `EXIT.LWD_APPROVAL` | A resigned employee may not avail leave before their last working day without prior RM **and** HOD approval. | HARD |
| `EXIT.NOTICE_ADJUST` | Leave cannot be adjusted against notice period unless approved by HOD, Head HR **and** CEO. | HARD (3-way) |

## §18 Reporting-Manager Guidelines

| ID | Rule | Kind |
|---|---|---|
| `MGR.COVERAGE` | No more than a set number of team members approved for leave on the same day. | SOFT · CFG |
| `MGR.CHECK_BALANCE` | Verify balance and dates proactively to avoid scheduling conflicts. | AUTO (surfaced) |
| `MGR.PROMPT` | Communicate decisions promptly, giving time to plan. | SOFT |
| `MGR.CONSISTENT` | Apply the policy consistently regardless of personal preference. | — |
| `MGR.RECORD` | Keep a record of each approval for accountability. | AUTO |

§18 is realised as decision-support in the approval inbox: before a manager approves, they see the
requester's balance, the coverage impact for those dates, notice-period compliance, and any policy
warnings — the four things §18 asks them to check, computed rather than remembered.

---

## Derived: approval routing

| Condition | Chain |
|---|---|
| Default | Reporting Manager |
| PL > 3 consecutive days (`PL.DUAL_APPROVAL`) | Reporting Manager → HOD |
| Maternity (`ML.*`) | Reporting Manager → HR |
| Comp-off claim (`CO.CLAIM_FIRST`) | Reporting Manager |
| Requester **is** a HOD | HOD's own manager, else HR |
| Requester has no manager (founders) | HR |
| Leave before LWD when resigned (`EXIT.LWD_APPROVAL`) | Reporting Manager → HOD |
| Notice-period adjustment (`EXIT.NOTICE_ADJUST`) | HOD → HR → CEO |

A request is APPROVED only when every level in its chain has approved. Any single rejection
terminates the chain immediately.

## Derived: the balance ledger

Balances are never stored as a mutable number. They are the **sum of an append-only ledger**, which
is what makes a leave system defensible in a dispute. Entry kinds:

```
OPENING       carry-forward brought into the year
ACCRUAL       quarterly pro-rata credit            (§7)
COMP_CREDIT   comp-off earned                      (§11)
AVAIL         debit when a request is approved
CANCEL_CREDIT reversal on cancellation             (§16)
LAPSE         CL year-end, PL over cap, comp-off 20-day expiry
ADJUSTMENT    manual HR correction, reason mandatory
CONVERSION    SL→PL when medical docs not furnished (§5)
```

Every entry stores `ruleId`, actor, timestamp and a human-readable note. The balance shown anywhere
in the UI is `SUM(credits) − SUM(debits)` over the current leave year, computed, never cached
without invalidation.
