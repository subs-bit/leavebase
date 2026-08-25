# LeaveBase Design System — "Prism Glass"

Derived from three sources: the Prismix Studios mark, the three reference UIs in `DESIGN_INSP/`,
and the functional needs of a leave-management tool.

---

## 1. What the references actually share

| | Ref 1 (violet dashboard) | Ref 2 (pastel clay) | Ref 3 (gradient glass) |
|---|---|---|---|
| Canvas | lavender mist, not white | warm cream | pink→blue gradient mesh |
| Cards | white, r≈20, soft diffuse shadow | pastel fills, r≈24, clay shadow | frosted glass, r≈20 |
| Hero | saturated violet gradient panel | peach panel w/ illustration | 3 vivid gradient tiles |
| Accent | one hot pink against the violet | 5 pastels, one per category | cyan + magenta against pink |
| Nav | dark violet icon rail | tinted sidebar, full labels | glass sidebar + pill tabs |
| Data | line chart in the hero | bars + donut, pastel-coded | mini bar sparkline |
| Type | geometric sans, heavy numerals | rounded geometric, heavy numerals | geometric, mixed weight numerals |

**The shared DNA — this is the brief:**

1. **The canvas is never pure white.** It is a soft tinted mist. White is reserved for cards, so
   elevation reads without heavy shadows.
2. **Generous radii.** 16–28px on cards, pill-shaped controls. Nothing is sharp.
3. **Shadows are large, soft and low-opacity** — diffuse ambient light, never a hard drop shadow.
4. **One saturated gradient hero per screen**, everything else calm. Colour is a scarce resource
   spent on the one thing that matters.
5. **Categories are colour-coded pastels** — a tinted surface with a saturated icon chip on it.
6. **Numerals are the loudest thing on the page.** Big, extra-bold, tightly tracked.

## 2. Brand extraction

The Prismix mark is a ring that travels **cyan → blue → violet → magenta** around a black core,
with a cyan-to-violet triangle inside. That is literally a prism splitting light — and it hands us a
ready-made three-stop accent system.

```
Ring sample points        Role in LeaveBase
─────────────────────────────────────────────────────────
#2FD3F0  prism cyan       accent · Casual Leave · info
#2C74C7  prism blue       accent · Paternity · links
#6C4BF6  prism violet     PRIMARY · Privileged Leave · brand
#C062D9  prism magenta    accent · Maternity · highlights
#0B0A14  core black       dark-mode canvas · display text
```

Violet is primary because it is the mark's centre of gravity *and* the anchor colour of Ref 1.
Cyan and magenta are the two ends of the prism and are used as the gradient terminals.

### Signature gradient

```css
--prism-arc: linear-gradient(135deg, #2FD3F0 0%, #6C4BF6 52%, #C062D9 100%);
```

Used on: the hero balance panel, the active nav indicator, primary buttons on hover, progress
fills at 100%, and the login page aura. **Never on body text or on more than one element per view.**

## 3. Colour tokens

### Neutrals — lavender-tinted, not grey

The tint is what makes the UI feel like the references instead of a Bootstrap admin panel.

```
--ink-900  #14121F   headings, big numerals
--ink-700  #3B3550   body text
--ink-500  #6B6486   secondary text, labels
--ink-400  #928CA8   placeholder, disabled
--ink-200  #DEDBEA   borders, dividers
--ink-100  #ECEAF4   subtle fills, track backgrounds
--ink-50   #F5F4FA   hover fills

--canvas   #EEEDF7   the app background (lavender mist)
--surface  #FFFFFF   cards
--surface-2 #FAFAFD  nested/inset surfaces
```

### Semantic

```
success  #10B981   approved, credited, positive delta
warning  #F59E0B   pending, expiring soon, LOP risk
danger   #E11D48   rejected, absconding, negative balance
info     #2FD3F0   informational, policy notes
```

### Leave-type palette

Every leave type owns a hue. Used consistently on chips, calendar blocks, balance rings, charts,
and request rows — so a colour alone identifies the type across the whole product.

| Type | Ink (icon/text) | Tint (surface) | Rationale |
|---|---|---|---|
| Casual (CL) | `#0EA5C4` cyan | `#E3F8FD` | light, everyday |
| Sick (SL) | `#FB7185` coral | `#FFE9EE` | warm, bodily — not alarm red |
| Privileged (PL) | `#6C4BF6` violet | `#EEEAFF` | the brand type; the "real" holiday |
| Maternity | `#C062D9` magenta | `#FBEBFE` | prism terminal |
| Paternity | `#4F7DF0` blue | `#E8EFFE` | prism terminal |
| Comp-off | `#10B981` emerald | `#E4F8F0` | earned, positive |
| LOP / LWP | `#F59E0B` amber | `#FEF3E2` | caution, costs money |

Rejected/absconding red is deliberately *not* in this palette so alarm states never collide with a
leave type.

### Status palette

```
DRAFT      ink-400  on ink-100
PENDING    #B45309  on #FEF3E2   (amber)
PENDING_HOD #7C3AED on #EEEAFF   (violet — escalated)
APPROVED   #047857  on #E4F8F0   (emerald)
REJECTED   #BE123C  on #FFE4EA   (rose)
CANCELLED  #64748B  on #F1F5F9   (slate)
WITHDRAWN  #64748B  on #F1F5F9
EXPIRED    #92400E  on #FEF3E2
```

## 4. Dark mode

Not an inversion — a re-lighting. The canvas becomes the logo's core black, cards lift to a
slightly blue-violet charcoal, and the prism colours **gain** saturation because they now glow.

```
--canvas   #0B0A14      surface #16142099   surface-2 #1E1B2E
--ink-900  #F4F2FF      ink-700 #C9C4E0      ink-500 #8F89A8
--ink-200  #2B2740      ink-100 #211E33
```
Leave-type tints become the ink colour at 14% alpha over the card. Shadows are replaced by
1px `rgba(255,255,255,.06)` top borders — light comes from above, as in the physical world.

## 5. Typography

**Plus Jakarta Sans** throughout — geometric, slightly rounded, with the same friendly-technical
character as the reference UIs and a hint of the logo's geometry. One family, worked hard.

| Role | Size / line | Weight | Tracking |
|---|---|---|---|
| Display (hero numeral) | 44–56 / 1.0 | 800 | −0.03em |
| Stat numeral | 32 / 1.05 | 800 | −0.02em |
| Page title | 26 / 1.2 | 700 | −0.02em |
| Section title | 17 / 1.3 | 700 | −0.01em |
| Card title | 15 / 1.4 | 600 | 0 |
| Body | 14 / 1.55 | 500 | 0 |
| Secondary | 13 / 1.5 | 500 | 0 |
| Label / eyebrow | 11 / 1.2 | 700 | **0.08em, uppercase** |
| Micro | 11 / 1.4 | 600 | 0 |

Rules:
- All numerals use `font-variant-numeric: tabular-nums` so columns and counters never jitter.
- The uppercase tracked label is the system's signature — it appears above every stat and every
  card group, exactly as in Ref 1 ("Primary / Dashboard").
- Never go below 11px. Never use weight 400 — 500 is the floor, because the tinted ink is soft.

## 6. Shape & elevation

```
radius:  xs 8 · sm 12 · md 16 · lg 20 · xl 28 · 2xl 36 · pill 999

shadow-soft   0 1px 2px rgba(20,18,31,.04), 0 8px 24px -10px rgba(20,18,31,.10)
shadow-lift   0 2px 4px rgba(20,18,31,.04), 0 20px 44px -14px rgba(20,18,31,.16)
shadow-glow   0 14px 34px -10px rgba(108,75,246,.45)     ← violet, for primary CTAs only
shadow-inset  inset 0 1px 0 rgba(255,255,255,.7)          ← the "clay" top-light from Ref 2
```

Cards get `shadow-soft` at rest and `shadow-lift` on hover with a −2px translate over 180ms.
Only interactive cards move. Static cards never move.

## 7. Motion

| | duration | easing |
|---|---|---|
| micro (hover, chip) | 140ms | `cubic-bezier(.4,0,.2,1)` |
| standard (card, panel) | 220ms | `cubic-bezier(.32,.72,0,1)` |
| entrance (modal, drawer) | 320ms | `cubic-bezier(.16,1,.3,1)` |
| number count-up | 700ms | ease-out |

Ring/progress fills animate from 0 on mount — the balance rings drawing themselves is the one
piece of delight the product gets. Everything respects `prefers-reduced-motion`.

## 8. Layout

- **Sidebar** 260px expanded / 76px icon-rail (Ref 1's rail, Ref 2's labels). Sticky, own scroll.
- **Content max-width** 1440px, 32px gutters, 24px grid gap.
- **12-column grid** on desktop; cards snap to 3/4/6/8/12.
- **Breakpoints** sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536. Sidebar collapses to a bottom
  tab bar below `lg`.
- **Vertical rhythm** 8px base. Card padding 24px (20px on mobile).

## 9. Component decisions

**Balance ring** — the hero object. An SVG donut with the leave-type colour, a soft `ink-100`
track, the remaining days as an extra-bold numeral in the middle, and entitlement as the caption.
Ring stroke 10px, r=54. This replaces the generic progress bar from the references because a
leave balance is fundamentally *a proportion of a fixed grant*.

**Stat tile** — tinted surface, saturated icon chip top-left (Ref 2's exact move), tracked
uppercase label, extra-bold numeral, delta line at the bottom.

**Request row** — a 4px leave-type colour bar on the leading edge, dates, a duration pill, a
status chip trailing. Rows are the workhorse; they stay quiet.

**Timeline** — vertical connector with node dots for the approval chain. Emerald node = approved,
amber pulse = current, slate = future.

**Calendar** — month grid, each day a rounded cell. Leave appears as a filled bar in type colour;
holidays get a diagonal hatch; weekly offs a `ink-50` fill. Multiple people on one day stack as
up to 3 avatars + overflow count.

**Policy note** — an inline `info`-tinted panel quoting the exact policy clause that governs the
control the user is touching. This is the product's soul: the app never says "not allowed", it
says *why*, and quotes the section.

## 10. Voice

Concise, human, never chirpy. The app is a colleague from HR who knows the policy cold.

- ✅ "You'll be back with 9 days of PL." ❌ "Success! Leave applied! 🎉"
- ✅ "Needs 30 days' notice — you're applying 12 days out. Section 6."
- ❌ "Oops! Something went wrong."

Numbers are always contextualised: never "9", always "9 of 15 remaining".

## 11. Anti-patterns — the things that make an app look vibe-coded

Explicitly banned in this codebase:

1. Pure `#FFF` page background with `#000` text.
2. Default 4px/6px radii mixed with 12px radii in the same view.
3. Emoji as UI icons.
4. Gradient text on anything smaller than 28px.
5. More than one saturated gradient per viewport.
6. `box-shadow: 0 4px 6px rgba(0,0,0,.1)` — the Tailwind default look.
7. Full-width tables with visible grid lines on all four sides.
8. Toasts for things that should be inline state.
9. Loading spinners where a skeleton in the final layout would do.
10. Any status communicated by colour alone — always colour **plus** label or icon.
