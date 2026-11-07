# Stripe setup for US dollar Pro pricing

What you need to do, in order. Nothing here is automatic: the code is ready, but each buy button stays **off** until its price is created and its ID is in Vercel (steps 2 and 3). That is deliberate, so nobody can be charged a wrong price.

The prices:

| Plan | Yearly | Monthly | Who |
|---|---|---|---|
| Founding Pro | US$45 | US$4.50 | First 100 subscribers (either period) |
| Standard Pro | US$60 | US$8 | Everyone after |

That is **four prices** to create. Founders keep their price while they stay subscribed.

---

## 0. Before you start

- Stripe is still **blocked pending business verification** (see `CLAUDE.md`). You can do all of this in **test mode** now and repeat it in **live mode** once Stripe approves the account.
- Stripe has a **Test mode / Live mode** switch (top of the dashboard). Prices, keys and webhooks are separate in each mode. Do the steps below once per mode.
- Never paste secret keys into chat, git or a file in the repo. They go only in Vercel's Environment Variables (and your local `.env.local`, which is gitignored).

---

## 1. Get the code live

The pricing change is committed on a local branch called `pricing-usd` (one commit). Push only that commit:

```
git push origin pricing-usd:main
```

Do **not** run a plain `git push` from `main` for this: that would also send 24 unrelated Pitch Shape commits.

Vercel deploys automatically from `main`. With no USD price IDs set yet (step 3), the pricing page shows the prices but the buy buttons are hidden. That is expected.

---

## 2. Create the four prices in Stripe

In the Stripe dashboard:

1. Open **Product catalogue** (or **Products**).
2. Open your existing Pro product, or click **Add product** and name it `x9Lab Pro`.
3. Under **Pricing**, click **Add another price** and create each of these. For all four: pricing model **Standard pricing**, currency **USD**, **Recurring**.

   | Amount | Billing period | Description (optional) |
   |---|---|---|
   | **45.00** | Yearly | `Founding Pro yearly` |
   | **60.00** | Yearly | `Standard Pro yearly` |
   | **4.50** | Monthly | `Founding Pro monthly` |
   | **8.00** | Monthly | `Standard Pro monthly` |

4. Open each price and copy its **Price ID**. It starts with `price_`. Keep track of which is which.

The amount and period must be **exactly** as in the table, in USD. The app checks each one against Stripe before it allows a purchase. A price that is wrong (wrong amount, wrong currency, wrong period, archived) makes that button show as unavailable instead of charging the wrong thing. For example, putting the yearly price's ID in a monthly setting is caught and the monthly button stays off.

### Leave the old prices alone

Do **not** delete or archive any existing price. People already subscribed keep renewing on the price they signed up on, and the webhook keeps their access working. The app simply stops selling the old prices to new people.

---

## 3. Add the price IDs in Vercel

1. Vercel dashboard, your project, **Settings**, **Environment Variables**.
2. Add these four (Production, and Preview if you test there):

| Name | Value |
|---|---|
| `STRIPE_PRICE_FOUNDING_YEARLY_USD` | the `price_...` ID of the **US$45 yearly** price |
| `STRIPE_PRICE_YEARLY_USD` | the `price_...` ID of the **US$60 yearly** price |
| `STRIPE_PRICE_FOUNDING_MONTHLY_USD` | the `price_...` ID of the **US$4.50 monthly** price |
| `STRIPE_PRICE_MONTHLY_USD` | the `price_...` ID of the **US$8 monthly** price |

3. Confirm these also exist (they should from before):

| Name | What it is |
|---|---|
| `STRIPE_SECRET_KEY` | Secret key (`sk_live_...` in live, `sk_test_...` in test) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_...`) from step 4 |

4. **Redeploy** (Deployments, the latest one, Redeploy). Vercel only reads new variables on a new deployment.

Live and test use different keys and price IDs. Keep each mode's values together: a live key with a test price ID will not work, and the app will show checkout as unavailable.

---

## 4. Webhook (grants Pro after payment)

Pro is switched on **only** by the webhook after Stripe confirms payment. Without it, people pay and do not get Pro.

1. Stripe dashboard, **Developers**, **Webhooks**, **Add endpoint**.
2. Endpoint URL: `https://xlab9.com/api/stripe/webhook`
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Save, then open the endpoint and click **Reveal** under **Signing secret**. Copy the `whsec_...` value.
5. Put it in Vercel as `STRIPE_WEBHOOK_SECRET` (step 3) and redeploy.

If you already created this endpoint earlier, just check the three events are ticked and the URL is right.

---

## 5. Customer portal (cancel and manage)

The "Manage subscription" button opens Stripe's customer portal.

1. Stripe dashboard, **Settings**, **Billing**, **Customer portal**.
2. Turn the portal **on**.
3. Allow **Cancel subscription** (the site promises cancel any time, keeping access to the end of the paid period, so choose "at end of billing period").
4. Save.

---

## 6. Database column for the founding count

The "first 100" count reads `subscribers.pro_plan`. If that column does not exist, the app cannot count founders and **withholds checkout** rather than guess.

1. Supabase dashboard, **SQL Editor**.
2. Open `scripts/sql/add_stripe_columns.sql` from the repo, paste it in, and run it.
3. It is safe to run if the columns already exist.

---

## 7. Test it before telling anyone

Do this in **test mode** first.

1. Sign in to the site with a free account.
2. Open `/pricing`. You should see **Founding Pro: US$45 a year or US$4.50 a month** and two buttons. If you see "Checkout is not open right now", or only one button, a step between 2 and 6 is missing or wrong for that period.
3. Click the yearly button. Stripe's page should show **US$45.00 per year**. Go back and click the monthly one: it should show **US$4.50 per month**.
4. Pay with Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
5. You should land on the success page, and within a few seconds your account should show Pro (the pricing page says "You're on Pro").
6. In Stripe, **Developers, Webhooks**, open the endpoint and check the `checkout.session.completed` delivery shows a green 200.
7. Click **Manage subscription** and confirm the portal opens. Cancel the test subscription there.

If step 5 never shows Pro, the webhook is the usual cause: wrong URL, wrong signing secret, or the events not ticked.

Test-mode payments are not real money. Do not make a live purchase to test.

---

## 8. Going live

When Stripe approves the account:

1. Switch the dashboard to **Live mode**.
2. Repeat step 2 (create the four prices), step 4 (webhook with the live signing secret), and step 5 (portal).
3. In Vercel, **Production** environment, replace the values with the **live** ones:
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FOUNDING_YEARLY_USD`, `STRIPE_PRICE_YEARLY_USD`, `STRIPE_PRICE_FOUNDING_MONTHLY_USD`, `STRIPE_PRICE_MONTHLY_USD`.
4. Redeploy.
5. Check `/pricing` shows both buttons. Do one real purchase yourself only if you are happy to refund it from the Stripe dashboard.

---

## Things to know

- **The 100-founder limit is not exact.** It is checked when someone starts checkout, not reserved. If several people start at once when 99 spots are taken, a few extra can get the founding price. A founder who cancels frees a spot. If you want it exact, that needs a separate piece of work.
- **When founding fills**, the page and checkout switch to US$60 a year or US$8 a month on their own. Anyone who had the founding button open gets a page reload instead of being charged the new price unseen.
- **The local test prices** I made in your Stripe **test** account (US$45 and US$60 yearly, US$4.50 and US$8 monthly, nicknamed "sandbox") are already in your local `.env.local`. They exist only in test mode and do nothing in production. You can archive them in the dashboard once you have made your own.
- **Partner offer (10% off the first year, 15% commission):** not built and not advertised. Stripe promotion codes are already switched on at checkout, so a discount code can be made by hand, but nothing tracks who referred whom or pays commission. Do not promise partners tracking until it exists.
- **Quick reference of what the app reads:**

| Setting | Where | Used for |
|---|---|---|
| `STRIPE_SECRET_KEY` | Vercel | Talking to Stripe |
| `STRIPE_WEBHOOK_SECRET` | Vercel | Verifying webhook calls |
| `STRIPE_PRICE_FOUNDING_YEARLY_USD` | Vercel | US$45 yearly price |
| `STRIPE_PRICE_YEARLY_USD` | Vercel | US$60 yearly price |
| `STRIPE_PRICE_FOUNDING_MONTHLY_USD` | Vercel | US$4.50 monthly price |
| `STRIPE_PRICE_MONTHLY_USD` | Vercel | US$8 monthly price |
| `subscribers.pro_plan` column | Supabase | Counting founders |
| Webhook endpoint | Stripe | Granting and removing Pro |
| Customer portal | Stripe | Cancelling and managing |

More detail on how checkout decides and what was tested is in `PRICING_USD.md`.
