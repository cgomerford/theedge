# x9Lab Pro pricing (US dollars)

Pro, billed in US dollars, yearly or monthly. This file is the reference for what was built, how it works, and what is still needed in Stripe.

## The prices

| Plan | Yearly | Monthly | Who |
|---|---|---|---|
| Free | $0 | $0 | Unchanged |
| Founding Pro | **US$45 / year** | **US$4.50 / month** | The first 100 subscribers (either period). They keep their price while continuously subscribed. |
| Standard Pro | **US$60 / year** | **US$8 / month** | Everyone after founding closes. |

- The 100 founding spots are shared: a founder on monthly or yearly both count toward the same 100.
- **Existing subscribers are untouched.** Their plan, price and renewal terms do not change. Nothing in the new code reads, migrates, cancels or reprices an existing subscription. The Stripe webhook is unchanged, so their access keeps working.

## Where the prices live

| What | File |
|---|---|
| Printed prices (`FOUNDING`, `STANDARD`, `FOUNDING_MONTHLY`, `STANDARD_MONTHLY`, `FOUNDING_LIMIT`, `formatPrice`) | `src/lib/pricing.ts` |
| Which plan a new buyer gets (pure logic, tested) | `src/lib/pro-offer.ts` |
| Founding count and Stripe price checks | `src/lib/pro-offer-server.ts` |
| Stripe price IDs (from environment variables, one per plan and period) | `src/lib/stripe.ts` |
| Checkout | `src/app/api/stripe/checkout/route.ts` |
| "What would a new buyer pay right now" (read by buttons) | `src/app/api/stripe/offer/route.ts` |
| Pricing page and FAQ | `src/app/pricing/page.tsx` |
| Unlock buttons inside gated pages | `src/components/pro/ProUnlockButton.tsx`, `ProGateView.tsx`, `UpgradePrompt.tsx` |

The printed prices come from `pricing.ts` in one place. The real charge comes from Stripe.

## How checkout decides what to charge

1. Count founding subscribers (`subscribers.pro_plan = 'founding'` and `is_pro = true`). Fewer than 100 means founding is open.
2. Open means Founding Pro (US$45/yr, US$4.50/mo). Closed means Standard Pro (US$60/yr, US$8/mo).
3. Ask Stripe about that plan's price for the period chosen. It must be **active, USD, the right period (year or month), and exactly $45.00, $60.00, $4.50 or $8.00**. If not, that period's checkout is unavailable. Yearly and monthly are decided separately, so one can be off while the other works.
4. The pricing page sends the plan it showed. If founding filled in the meantime, checkout answers 409 and the page reloads, so nobody is charged a price they did not see.

If anything is missing or wrong, the answer is "not available", never a different amount:

| Situation | Result |
|---|---|
| USD price ID not set | That period's checkout unavailable (503), no button shown |
| Price ID points at the wrong amount, currency or period | Unavailable (503) |
| Founding count cannot be read | Unavailable (503), the price is not guessed |
| Founding has just filled | 409, page reloads with the Standard price |
| Already Pro | 409, no purchase |

## What you must set up in Stripe before this works live

1. In the **live** Stripe account, on the Pro product, create four recurring prices:
   - **US$45.00, every 1 year** (Founding Pro, yearly)
   - **US$60.00, every 1 year** (Standard Pro, yearly)
   - **US$4.50, every 1 month** (Founding Pro, monthly)
   - **US$8.00, every 1 month** (Standard Pro, monthly)
2. Add their IDs in Vercel (Project, Environment Variables, Production):
   - `STRIPE_PRICE_FOUNDING_YEARLY_USD` = the US$45 yearly price ID
   - `STRIPE_PRICE_YEARLY_USD` = the US$60 yearly price ID
   - `STRIPE_PRICE_FOUNDING_MONTHLY_USD` = the US$4.50 monthly price ID
   - `STRIPE_PRICE_MONTHLY_USD` = the US$8 monthly price ID
3. Redeploy. Until a period's prices are set, its buy button stays off on purpose.
4. Leave the older prices **active** in Stripe. People already subscribed on them keep renewing on them.

Already required for any checkout: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Older `STRIPE_PRICE_*` variables are no longer read by checkout and are never a fallback.

## Known limits (be honest about these)

- **The 100-founder cap is checked when checkout starts, not reserved.** If several people start checkout when 99 spots are taken, the total can pass 100 by a few. A founder who cancels frees a spot. Making it exact needs a reservation step or a Stripe-side limit, which is not built.
- **The webhook has not been exercised end to end.** Checkout sessions were created and inspected in the Stripe sandbox (founding yearly USD 45.00, founding monthly USD 4.50). A real test-card payment through to Pro access has not been run.
- **Free access is unchanged.** Free accounts, the free look-a-day and every Pro gate behave as before.

## Partner offer (not built)

Proposed by Jon Anderson: 10% off the first annual invoice ($40.50 on Founding, $54 on Standard) and a 15% commission on that first payment after discount, excluding tax, refunds and chargebacks, with no renewal commission.

**This is not implemented and is not advertised anywhere.** There is no tracking, no partner page and no payout automation. Checkout already accepts Stripe promotion codes, so a discount code could be created by hand in Stripe, but nothing records who referred whom. Do not promise tracking until it is built and tested.

## How it was checked

- Type check clean; all tests pass, including new tests for the price decision, the Stripe price rules and the checkout route (yearly and monthly USD, price-changed, unavailable, already Pro).
- Stripe **sandbox** (test mode, no payments): real sessions came back US$45.00 yearly and US$4.50 monthly, tagged founding. A yearly price in the monthly slot, a wrong price and a missing price all gave "unavailable" with no session created. All four price objects were read back from Stripe and match (US$45, US$60, US$4.50, US$8).
- Pricing page checked on desktop and mobile while logged out.
- Search found no remaining non-dollar prices in the code.

## Still to check

- Production build on the exact commit that gets pushed.
- The logged-in view of the pricing page and buttons.
- One real test-card payment in the sandbox to confirm the webhook grants Pro.
- The "founding closed" view and a US$60 or US$8 checkout (needs 100 founders, or a temporary lower limit in a test). The standard prices exist in the sandbox and match, but no session has been made on them.
