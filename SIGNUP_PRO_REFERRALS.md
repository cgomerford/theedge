# Signup, Pro checkout and referral links: what changed

Branch: `stripe-usd-referrals` (commit `7ab310a`), pushed to GitHub, **not merged into `main`**.
Checks run: TypeScript clean, guard and copy-lint clean, 480 tests passing (27 of them cover this work).
Not yet done: a browser run of the new flow, and any test against Stripe (see "How to test" below).

## 1. What was confirmed about USD

Nothing needed changing. The site is already all dollars: no `£` or GBP anywhere in `src`. The currency comes from the Stripe Price, not from code. Checkout refuses any price that is not active, USD and the exact expected amount.

| Plan | Price |
|---|---|
| Founding (first 100), yearly | $45 |
| Founding, monthly | $4.50 |
| Standard, yearly | $60 |
| Standard, monthly | $8 |

## 2. How signing up straight to Pro works now

Sign-in is passwordless: an emailed link, no password. A Stripe session cannot start until the person is signed in, so the Pro choice rides along inside the emailed link.

1. The visitor opens `/signup` (or `/signup?plan=pro&interval=month`, or `interval=year`).
2. They pick **Free account** or **Pro account**. Pro shows a monthly or yearly toggle with the current price.
3. They enter their email. This is the same signup as before (Turnstile check, rate limit, disposable-email check).
4. They click the emailed link. For a **free** account they land where they always did. For a **Pro** account the link lands on `/pricing/start?interval=...`.
5. `/pricing/start` starts the existing Stripe checkout and sends them to Stripe.
6. After paying they return to `/pricing/success`. The Stripe webhook switches Pro on.
7. If they leave Stripe without paying, they return to `/pricing?checkout=cancelled` with a free account and a short "nothing was charged" notice.

Other cases:
- **An email that already exists** follows the same path (it just gets a sign-in link), so there are no duplicates.
- **A signed-in free user** opening `/signup?plan=pro` goes straight to checkout.
- **A signed-in Pro user** is sent to `/me`.
- **Pro is not available** (a Stripe price is missing or wrong): the Pro option is hidden and only the free signup shows.

## 3. How referral links work

1. A link like `https://xlab9.com/?ref=FRIEND` (any page works) saves `FRIEND` in a cookie named `edge_ref` for 30 days. Only letters, digits, `_` and `-` are kept, up to 40 characters. **The first code a visitor arrives with is kept**; a later link does not overwrite it.
2. At checkout the code is read from the request body, then the cookie, and looked up in Stripe's **active promotion codes**.
   - Found: it is applied as a discount.
   - Not found, or none given: Stripe's normal "add promotion code" box is shown. The two are never sent together.
   - Stripe lookup fails: checkout carries on normally.
3. The code is stored in the checkout session and subscription metadata.
4. The webhook saves it on the subscriber **once**, uppercased, and only while `referral_code` is empty.

## 4. Safety rules kept

- The Stripe webhook is the only writer of `is_pro`, the Stripe columns, and now `referral_code` and `referral_recorded_at`. Signup and checkout never set `is_pro`.
- The webhook **never switches Pro off for a subscriber with no `stripe_customer_id`**, so free or manual Pro accounts cannot be taken away by a Stripe event. This is tested.
- `isPro` is not defaulted anywhere.
- No existing subscriber's data is changed by any of this.

## 5. SQL to run in Supabase (once, before deploying)

Open Supabase, then SQL Editor, paste this and run it. It is safe to run twice and does not change any existing row.

```sql
alter table subscribers add column if not exists referral_code text;
alter table subscribers add column if not exists referral_recorded_at timestamptz;
create index if not exists subscribers_referral_code_idx on subscribers (referral_code);
```

If you forget: Pro still switches on after payment, but the referral is not recorded and the webhook logs an error saying to run this.

To see results later (read-only), run:

```sql
select referral_code, count(*) as signups, count(*) filter (where is_pro) as active_pro
from subscribers where referral_code is not null group by 1 order by 2 desc;
```

Both are also saved in `scripts/sql/add_referral_columns.sql` and `scripts/sql/referral_report.sql`.

## 6. Stripe and Vercel settings

**Vercel Preview environment** must have these six (no new variables were added):

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_FOUNDING_YEARLY_USD`
- `STRIPE_PRICE_YEARLY_USD`
- `STRIPE_PRICE_FOUNDING_MONTHLY_USD`
- `STRIPE_PRICE_MONTHLY_USD`

Use test-mode values on Preview unless you want real charges there.

**Stripe dashboard:**
- Create each referral code: Products, Coupons, make a coupon, then add a promotion code whose text is the code (for example `FRIEND`). The `?ref=` value must match that text.
- The webhook endpoint must listen for `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`.

## 7. How to test (on the branch's Vercel preview, Stripe in test mode)

1. Open `/signup?plan=pro&interval=month&ref=FRIEND` in a private window.
2. Sign up and click the emailed link. You should land on Stripe with the discount applied.
3. Pay with the test card `4242 4242 4242 4242`.
4. Check that Pro is on and `referral_code` is `FRIEND` for that email.
5. Repeat, but leave Stripe: you should see the cancelled notice and have a free account.
6. Try a code Stripe does not know: checkout should show the normal promo box.

Merge to `main` only after these pass. Merging is also when it can go live.

## 8. Files changed

New: `src/lib/referral.ts`, `src/components/ReferralCapture.tsx`, `src/components/signup/PlanChoice.tsx`, `src/components/pro/StartCheckout.tsx`, `src/app/pricing/start/page.tsx`, `scripts/sql/add_referral_columns.sql`, `scripts/sql/referral_report.sql`, plus tests for the referral helper and the webhook.

Edited: `src/app/layout.tsx`, `src/app/signup/page.tsx`, `src/app/pricing/page.tsx` (cancelled notice, FAQ answer on needing an account), `src/app/api/stripe/checkout/route.ts` and its test, `src/app/api/stripe/webhook/route.ts`, `vitest.config.ts`, `scripts/checks/guard-baseline.txt`.

## 9. Wording note

The labels are "Free account" and "Pro account", not "Start free" and "Start Pro". The site's copy-lint bans the word "start" (it reads as start/sit). Say if you want it changed and the lint rule adjusted.
