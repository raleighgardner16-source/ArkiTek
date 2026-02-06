# Stripe Subscription Setup Guide

This guide will help you set up Stripe to accept $25/month subscription payments from your users.

## Prerequisites

1. A Stripe account (sign up at https://stripe.com)
2. Access to your Stripe Dashboard

## Step 1: Get Your Stripe API Keys

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com)
2. Go to **Developers** → **API keys**
3. Copy your **Secret key** (starts with `sk_`)
4. Copy your **Publishable key** (starts with `pk_`) - you may need this later for frontend integration

## Step 2: Create a Product and Price in Stripe

1. In Stripe Dashboard, go to **Products** → **Add product**
2. Fill in the product details:
   - **Name**: ArkiTek Monthly Subscription
   - **Description**: Monthly subscription to ArkiTek AI platform
   - **Pricing model**: Standard pricing
   - **Price**: $25.00 USD
   - **Billing period**: Monthly
3. Click **Save product**
4. Copy the **Price ID** (starts with `price_`) - you'll need this for the `STRIPE_PRICE_ID` environment variable

## Step 3: Set Up Webhook Endpoint

Webhooks allow Stripe to notify your server about subscription events (payments, cancellations, etc.).

### For Local Development:

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Run: `stripe listen --forward-to localhost:3001/api/stripe/webhook`
3. Copy the webhook signing secret (starts with `whsec_`) - you'll need this for `STRIPE_WEBHOOK_SECRET`

### For Production:

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Enter your endpoint URL: `https://yourdomain.com/api/stripe/webhook`
4. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret** (starts with `whsec_`)

## Step 4: Configure Environment Variables

Add these variables to your `.env` file in the project root:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_... # Your Stripe secret key
STRIPE_PRICE_ID=price_... # The Price ID from Step 2
STRIPE_WEBHOOK_SECRET=whsec_... # The webhook signing secret from Step 3
```

**Important**: 
- Use `sk_test_...` for testing (test mode)
- Use `sk_live_...` for production (live mode)
- Make sure your `.env` file is in `.gitignore` and never commit it to version control

## Step 5: Install Dependencies

Run the following command to install the Stripe SDK:

```bash
npm install
```

This will install the `stripe` package that was added to `package.json`.

## Step 6: Test the Integration

1. Start your backend server: `npm run dev:server`
2. Start your frontend: `npm run dev`
3. Sign up or log in to your app
4. Go to Settings → Subscription
5. Click "Subscribe Now - $25/month"
6. Use Stripe test card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits

## Step 7: Verify Webhook Events

Check your server logs to see webhook events being processed. You should see logs like:
- `[Stripe] Checkout completed for user: username`
- `[Stripe] Subscription created for user: username, status: active`

## Production Deployment Checklist

Before going live:

- [ ] Switch to live API keys in your `.env` file
- [ ] Set up production webhook endpoint in Stripe Dashboard
- [ ] Update webhook URL to your production domain
- [ ] Test subscription flow end-to-end with real payment method
- [ ] Verify subscription cancellation works correctly
- [ ] Test subscription renewal
- [ ] Set up email notifications in Stripe Dashboard (optional but recommended)

## Troubleshooting

### Webhook signature verification fails
- Make sure `STRIPE_WEBHOOK_SECRET` matches the signing secret from your webhook endpoint
- For local development, use the secret from `stripe listen` command

### Subscription status not updating
- Check webhook logs in Stripe Dashboard → Developers → Webhooks → [Your endpoint] → Logs
- Verify webhook events are being received by your server
- Check server logs for any errors

### Checkout session not creating
- Verify `STRIPE_SECRET_KEY` is correct
- Verify `STRIPE_PRICE_ID` matches an active price in your Stripe Dashboard
- Check that the price is set to recurring (monthly)

## API Endpoints

The following endpoints have been added:

- `GET /api/stripe/subscription-status?userId=...` - Get user's subscription status
- `POST /api/stripe/create-checkout-session` - Create Stripe Checkout session
- `POST /api/stripe/create-portal-session` - Create Stripe Customer Portal session
- `POST /api/stripe/webhook` - Handle Stripe webhook events

## User Subscription Fields

Each user now has the following subscription-related fields in `ADMIN/users.json`:

- `stripeCustomerId` - Stripe customer ID
- `stripeSubscriptionId` - Stripe subscription ID
- `subscriptionStatus` - 'active', 'inactive', 'canceled', 'past_due'
- `subscriptionEndDate` - ISO date string of when subscription ends/renews

## Protected Routes

The following routes now require an active subscription:

- `POST /api/llm` - LLM API calls (summary calls are exempt)
- `POST /api/rag` - RAG pipeline calls

Users without an active subscription will receive a 403 error with a message prompting them to subscribe.

