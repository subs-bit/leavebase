# Going live

Getting LeaveBase from your laptop to a URL your team can use, with your real people in it.
Budget about an hour. Nothing here needs a card.

---

## 1. Create the database (10 min)

Any Postgres works. [Neon](https://neon.tech) has a free tier that suits a studio of this size.

1. Create a project. Region: pick the one nearest your team (`ap-south-1` for Mumbai).
2. Copy the **pooled** connection string. It looks like:
   ```
   postgresql://user:password@ep-xxx-pooler.ap-south-1.aws.neon.tech/neondb?sslmode=require
   ```
   Use the *pooled* host — serverless functions open many short connections and will exhaust a
   direct connection limit.

## 2. Switch the app to Postgres (2 min)

```bash
node scripts/db-provider.mjs postgres
```

Then put the connection string in `.env`:

```
DATABASE_URL="postgresql://…?sslmode=require"
```

Create the tables:

```bash
npx prisma generate
npx prisma db push
```

`db push` is right for now — it makes the database match the schema without a migration history.
Once real leave data exists and you start changing the schema, move to `prisma migrate` so changes
are versioned and reversible.

Check it worked:

```bash
npm run dev
```

Open http://localhost:3000 — an empty database sends you to **/setup**.

## 3. Deploy (15 min)

```bash
git init
git add -A
git commit -m "LeaveBase"
```

Push to a **private** GitHub repository — this will hold employee records.

Then on [vercel.com](https://vercel.com):

1. **Add New → Project**, import the repository.
2. Framework preset: Next.js (detected automatically).
3. **Environment Variables** → add `DATABASE_URL` with the same Postgres string.
4. Deploy.

Vercel runs `npm run build`, which runs `prisma generate` first — no extra configuration needed.

### If you'd rather not use Vercel

Any Node host works — Railway, Render, Fly, a VPS. The app is a standard Next.js server:

```bash
npm ci
npm run build
npm start          # listens on $PORT, default 3000
```

Requirements: Node 20+, `DATABASE_URL`, and **HTTPS**. Session cookies are set `Secure` in
production, so they will not be sent over plain HTTP and nobody will be able to stay signed in.

## 4. Claim the instance (2 min)

Visit your new URL. Because the database is empty, you land on **/setup**.

Create your own administrator account and list your departments. That page stops working the
instant the first account exists, so nobody else can mint an admin.

## 5. Load your people (20 min)

**Employees → Import.** Download the template, fill it from your existing records, upload it.

You'll get a row-by-row preview — created, updated, or skipped with the reason — and **nothing is
written until you confirm**. Rows with errors are skipped; the rest still import, so you can fix
the spreadsheet and run the same file again. Re-importing updates people rather than duplicating
them, because rows are matched on email.

The columns that matter most:

| Column | Why it matters |
|---|---|
| `email` | The sign-in identity and the key used to match on re-import. |
| `joindate` | Drives pro-rata accrual (§7). |
| `status` + `confirmdate` | A confirmed employee accrues Privileged Leave; a probationer does not (§6). |
| `manageremail` | Sets the approval chain. Blank means their leave routes to HR. |
| `gender` | Gates maternity and paternity eligibility (§9, §10). |
| `openingcl` / `openingsl` / `openingpl` | Balances they already hold today. |

**Opening balances are the ones to get right.** Enter the balance each person has left **today** —
literally the number in your current spreadsheet. LeaveBase works out what §7 accrual it would have
posted for the elapsed quarters and writes the *difference* as an `OPENING` entry, so once the
import finishes the balance reads exactly what you typed. Check a few against your sheet; they
should match to the day.

What this does not carry over is *history*: their **used** figure starts at zero, because LeaveBase
has no record of the leave they took before it existed. The remaining balance is right, which is
what approvals depend on. If you want the used figures to look right too, record past leave as
requests, or note it on the person's record — but for a trial the balance is the part that matters.

## 6. Set up the year (10 min)

- **Settings → Holidays** — add your holiday list for the year. This drives the §8 intervening-days
  rule and decides which days can earn a comp-off, so it must be right before people start applying.
- **Settings → Policy values** — confirm the numbers, especially Casual Leave (the source PDF says
  "Six (04)"; it currently reads 6).
- **Employees** — check each person's reporting manager. This is the single most common thing to
  get wrong, and it silently misroutes every approval.
- **Settings → Policy values → Weekly offs** — confirm Saturday/Sunday matches how your studio
  actually works. Production units on a six-day week need this changed.

## 7. Hand out access

For each person: **Employees → open them → Edit → Reset password**. You get a temporary password,
shown once. Pass it on however you normally share things internally.

They sign in, LeaveBase forces them to choose their own password, and they land on their dashboard.

A good first message to the team:

> LeaveBase is live at <your-url>. Sign in with your work email and the temporary password I've
> sent you — it'll ask you to set your own. Apply for leave there from now on rather than email.
> It shows you what your balance will be before you submit, and tells you which part of the leave
> policy applies.

---

## What to watch in the first week

| Thing | Where |
|---|---|
| Are approvals reaching the right person? | Settings → Audit log |
| Do balances match your old records? | Reports → Export CSV, compare against your sheet |
| Is anything being blocked that shouldn't be? | Ask the team — every block names its clause |
| Is the §8 sandwich rule behaving? | Watch the first long weekend someone books around |

## Backups

Neon keeps automatic point-in-time backups on the free tier. Take your own snapshot before
anything significant (a bulk import, a policy change, year-end rollover):

```bash
pg_dump "$DATABASE_URL" > leavebase-backup-$(date +%F).sql
```

Before year-end rollover in particular, take one. That job lapses Casual Leave and caps Privileged
Leave — correct, but not something you want to undo by hand.

## Security notes

- Sessions are opaque random tokens in the `Session` table, checked server-side on every request.
  There is no JWT and no signing secret to leak. Revoking access is deleting a row, which is what
  deactivating an employee does.
- Passwords are bcrypt hashed. Temporary passwords are shown exactly once and cannot be read back.
- Sign-in is throttled per IP and email — see `src/lib/rate-limit.ts` for the limits and their
  honest caveat on serverless.
- Keep the GitHub repository **private**. It contains no credentials, but the demo seed contains
  names, and your commits will be near your real data.
- The only route that can create an administrator without being signed in is `/setup`, and it
  refuses to work once any account exists.

## Things this doesn't do yet

Worth knowing before you rely on it:

- **No email.** Notifications appear inside the app only. If someone doesn't sign in, they won't
  know a request is waiting. Everything needed to add email is centralised in
  `src/lib/services/activity.ts`.
- **No file uploads.** Medical certificates (§5) and maternity documents (§9) are recorded as a
  declaration and a reference, not an attachment.
- **Maintenance jobs are manual or on-sign-in.** Accrual and comp-off expiry run whenever someone
  signs in, which is enough while people use it daily. Year-end rollover is a button in Settings —
  put a reminder in your calendar for 1 April.
- **No bulk approve.** Deliberate for now; §18 asks managers to weigh each request on its merits.
