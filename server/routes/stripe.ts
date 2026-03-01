import { Router, type Request, type Response } from 'express'
import db from '../../database/db.js'
import adminDb from '../../database/adminDb.js'
import { stripe, STRIPE_PRICE_ID, STRIPE_PREMIUM_PRICE_ID, STRIPE_WEBHOOK_SECRET } from '../config/index.js'
import env from '../config/env.js'
import { syncSubscriptionFromStripe } from '../services/subscription.js'
import { getPlanAllocation, getPricingData, calculateModelCost, calculateSerperQueryCost } from '../helpers/pricing.js'
import { getUserTimezone } from '../services/usage.js'
import { getMonthForUser } from '../helpers/date.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { sendSuccess, sendError } from '../types/api.js'

const router = Router()

// In-flight locks to prevent race conditions on concurrent subscription-intent calls
const subscriptionIntentLocks = new Set<string>()

// ============================================================================
// LOCAL HELPERS
// ============================================================================

const purgeUserFromLeaderboard = async (userId: string) => {
  try {
    const dbInstance = await db.getDb()
    const lbCollection = dbInstance.collection<any>('leaderboard_posts')
    
    const deleteResult = await lbCollection.deleteMany({ userId })
    
    await Promise.all([
      lbCollection.updateMany(
        { likes: userId },
        { $pull: { likes: userId } as any, $inc: { likeCount: -1 } }
      ),
      lbCollection.updateMany(
        { 'comments.userId': userId },
        { $pull: { comments: { userId } } as any }
      ),
      lbCollection.updateMany(
        { 'comments.likes': userId },
        { $pull: { 'comments.$[].likes': userId } as any }
      ),
      lbCollection.updateMany(
        { 'comments.replies.userId': userId },
        { $pull: { 'comments.$[].replies': { userId } } as any }
      ),
    ])
    
    console.log(`[Leaderboard Purge] User ${userId}: removed ${deleteResult.deletedCount} posts, scrubbed interactions`)
  } catch (error: any) {
    console.error('[Leaderboard Purge] Error:', error.message)
  }
}

const incrementDeletedUsers = async () => {
  try {
    await adminDb.metadata.incrementDeletedUsers()
    const stats = await adminDb.metadata.getAdminStats()
    return stats?.deletedUsersCount || 1
  } catch (error: any) {
    console.error('[DeletedUsers] Failed to increment:', error.message)
    return 0
  }
}

const calculateAndRecordOverage = async (userId: string, month: string) => {
  try {
    const user = await db.users.get(userId) as any
    
    if (!user || !user.stripeCustomerId || user.subscriptionStatus !== 'active') {
      console.log(`[Billing] Skipping overage calculation for ${userId}: no active subscription`)
      return { overage: 0, billed: false }
    }
    
    const userUsage = await db.usage.getOrDefault(userId) as any
    
    const FREE_MONTHLY_ALLOCATION = getPlanAllocation(user)
    const pricing = getPricingData()
    const dailyData = userUsage.dailyUsage?.[month] || {}
    let monthlyCost = 0
    
    Object.keys(dailyData).forEach((dateStr: string) => {
      const dayData = dailyData[dateStr]
      if (dayData) {
        if (dayData.models) {
          Object.keys(dayData.models).forEach((modelKey: string) => {
            const modelDayData = dayData.models[modelKey]
            const dayInputTokens = modelDayData.inputTokens || 0
            const dayOutputTokens = modelDayData.outputTokens || 0
            const dayCost = calculateModelCost(modelKey, dayInputTokens, dayOutputTokens, pricing as any)
            monthlyCost += dayCost
          })
        }
        
        const dayQueries = dayData.queries || 0
        if (dayQueries > 0) {
          const queryCost = calculateSerperQueryCost(dayQueries)
          monthlyCost += queryCost
        }
      }
    })
    
    const overage = Math.max(0, monthlyCost - FREE_MONTHLY_ALLOCATION)
    
    const monthlyUsageCost: Record<string, any> = user.monthlyUsageCost || {}
    const monthlyOverageBilled: Record<string, any> = user.monthlyOverageBilled || {}
    
    const existingCost = monthlyUsageCost[month] || 0
    if (existingCost > monthlyCost) {
      console.log(`[Billing] Preserving higher existing monthly cost: $${existingCost.toFixed(4)} > calculated: $${monthlyCost.toFixed(4)}`)
      monthlyCost = existingCost
    }
    monthlyUsageCost[month] = monthlyCost
    const alreadyBilled = monthlyOverageBilled[month] || 0
    
    if (overage > 0 && alreadyBilled < overage) {
      const baseOverage = overage - alreadyBilled
      
      // Charge X such that after Stripe fee (2.9% + $0.30) we net baseOverage
      // X - (0.029 * X + 0.30) = baseOverage  =>  X = (baseOverage + 0.30) / 0.971
      const amountToBill = (baseOverage + 0.30) / 0.971
      
      const amountToBillRounded = Math.round(amountToBill * 100) / 100
      const amountInCents = Math.round(amountToBillRounded * 100)
      
      const stripeFee = (amountToBillRounded * 0.029) + 0.30
      const netAmount = amountToBillRounded - stripeFee
      
      console.log(`[Billing] Overage calculation for ${userId}:`)
      console.log(`  Base overage: $${baseOverage.toFixed(2)}`)
      console.log(`  Amount to charge: $${amountToBillRounded.toFixed(2)}`)
      console.log(`  Stripe fee (2.9% + $0.30): $${stripeFee.toFixed(2)}`)
      console.log(`  Net after fee: $${netAmount.toFixed(2)}`)
      
      await stripe.invoiceItems.create({
        customer: user.stripeCustomerId,
        amount: amountInCents,
        currency: 'usd',
        description: `Overage usage for ${month} ($${monthlyCost.toFixed(2)} total - $${FREE_MONTHLY_ALLOCATION.toFixed(2)} included)`,
        metadata: {
          userId: userId,
          month: month,
          totalCost: monthlyCost.toFixed(2),
          freeAllocation: FREE_MONTHLY_ALLOCATION.toFixed(2),
          baseOverage: baseOverage.toFixed(2),
          amountCharged: amountToBillRounded.toFixed(2),
          stripeFee: stripeFee.toFixed(2),
        },
      })
      
      monthlyOverageBilled[month] = overage
      await db.users.update(userId, { monthlyUsageCost, monthlyOverageBilled })
      
      console.log(`[Billing] Billed $${amountToBill.toFixed(2)} overage for user ${userId} for ${month}`)
      return { overage, billed: true, amountBilled: amountToBill }
    }
    
    await db.users.update(userId, { monthlyUsageCost, monthlyOverageBilled })
    return { overage, billed: false }
  } catch (error: any) {
    console.error(`[Billing] Error calculating overage for ${userId}:`, error)
    return { overage: 0, billed: false, error: error.message }
  }
}

// ============================================================================
// STRIPE ROUTES (mounted at /api/stripe)
// ============================================================================

// GET /api/stripe/payment-method
router.get('/payment-method', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    
    const user = await db.users.get(userId as string) as any
    
    if (!user) {
      return sendError(res, 'User not found', 404)
    }
    
    if (!user.stripeCustomerId) {
      return sendSuccess(res, { paymentMethod: null, message: 'No Stripe customer ID' })
    }
    
    const customer = await stripe.customers.retrieve(user.stripeCustomerId, {
      expand: ['invoice_settings.default_payment_method']
    })
    
    let paymentMethod = null
    
    if ((customer as any).invoice_settings?.default_payment_method) {
      const pm = (customer as any).invoice_settings.default_payment_method
      paymentMethod = {
        id: pm.id,
        brand: pm.card?.brand || 'unknown',
        last4: pm.card?.last4 || '****',
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
      }
    } else {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
        limit: 1,
      })
      
      if (paymentMethods.data.length > 0) {
        const pm = paymentMethods.data[0]
        paymentMethod = {
          id: pm.id,
          brand: pm.card?.brand || 'unknown',
          last4: pm.card?.last4 || '****',
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
        }
      }
    }
    
    sendSuccess(res, { paymentMethod })
    
  } catch (error: any) {
    console.error('[Stripe] Error fetching payment method:', error)
    sendError(res, 'Failed to fetch payment method')
  }
})

// POST /api/stripe/setup-card
router.post('/setup-card', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    
    const user = await db.users.get(userId as string) as any
    
    if (!user) {
      return sendError(res, 'User not found', 404)
    }
    
    let customerId = user.stripeCustomerId
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.displayName || userId,
        metadata: {
          userId: userId as string
        }
      })
      customerId = customer.id
      
      await db.users.update(userId as string, { stripeCustomerId: customerId })
      console.log(`[Stripe] Created new customer ${customerId} for user ${userId}`)
    }
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'setup',
      success_url: `${req.headers.origin || 'http://localhost:3000'}/?card_added=success`,
      cancel_url: `${req.headers.origin || 'http://localhost:3000'}/`,
      metadata: {
        userId: userId as string,
        type: 'add_card'
      }
    })
    
    console.log(`[Stripe] Created setup session ${session.id} for user ${userId}`)
    
    sendSuccess(res, { sessionId: session.id, url: session.url })
    
  } catch (error: any) {
    console.error('[Stripe] Error creating setup session:', error)
    sendError(res, 'Failed to create card setup session')
  }
})

// GET /api/stripe/saved-cards
router.get('/saved-cards', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId

    const user = await db.users.get(userId as string) as any
    if (!user || !user.stripeCustomerId) {
      return sendSuccess(res, { cards: [] })
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    })

    const cards = paymentMethods.data.map(pm => ({
      id: pm.id,
      brand: pm.card!.brand,
      last4: pm.card!.last4,
      expMonth: pm.card!.exp_month,
      expYear: pm.card!.exp_year,
    }))

    sendSuccess(res, { cards })
  } catch (error: any) {
    console.error('[Stripe] Error fetching saved cards:', error)
    sendError(res, 'Failed to fetch saved cards')
  }
})

// POST /api/stripe/charge-saved-card
router.post('/charge-saved-card', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { paymentMethodId, amount } = req.body
    
    if (!paymentMethodId || !amount || amount <= 0) {
      return sendError(res, 'paymentMethodId and valid amount are required', 400)
    }
    if (amount < 1 || amount > 500) {
      return sendError(res, 'Amount must be between $1 and $500', 400)
    }
    
    const user = await db.users.get(userId as string) as any
    if (!user || !user.stripeCustomerId) {
      return sendError(res, 'User not found or no Stripe customer', 404)
    }

    const TRANSACTION_FEE_PERCENT = 3.5
    const calculatedFee = Math.round(amount * (TRANSACTION_FEE_PERCENT / 100) * 100) / 100
    const calculatedTotal = amount + calculatedFee
    const totalCents = Math.round(calculatedTotal * 100)

    console.log(`[Buy Usage] Charging saved card ${paymentMethodId} for user ${userId}: $${calculatedTotal.toFixed(2)}`)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: user.stripeCustomerId,
      payment_method: paymentMethodId,
      payment_method_types: ['card'],
      confirm: true,
      off_session: true,
      description: `Usage credits purchase: $${amount.toFixed(2)}`,
      metadata: {
        userId: userId as string,
        usageAmount: amount.toString(),
        fee: calculatedFee.toFixed(2),
        type: 'usage_purchase',
      },
    })

    if (paymentIntent.status === 'succeeded') {
      const userUsage = await db.usage.getOrDefault(userId as string) as any
      const purchasedCredits = userUsage.purchasedCredits || { total: 0, remaining: 0, purchases: [] }
      purchasedCredits.total += amount
      purchasedCredits.remaining += amount
      purchasedCredits.purchases = purchasedCredits.purchases || []
      purchasedCredits.purchases.push({
        amount,
        fee: calculatedFee,
        total: calculatedTotal,
        paymentIntentId: paymentIntent.id,
        date: new Date().toISOString(),
      })
      await db.usage.update(userId as string, { purchasedCredits })

      console.log(`[Buy Usage] Added $${amount.toFixed(2)} credits to user ${userId} via saved card`)
      sendSuccess(res, { creditsAdded: amount, paymentIntentId: paymentIntent.id })
    } else {
      sendError(res, `Payment status: ${paymentIntent.status}. Please try again.`, 400)
    }
  } catch (error: any) {
    console.error('[Buy Usage] Error charging saved card:', error)
    if (error.code === 'authentication_required') {
      sendError(res, 'This card requires authentication. Please use a new card instead.', 400)
    } else {
      sendError(res, error.message || 'Failed to charge saved card. Please try again.')
    }
  }
})

// DELETE /api/stripe/saved-cards/:paymentMethodId
router.delete('/saved-cards/:paymentMethodId', requireAuth, async (req: Request, res: Response) => {
  try {
    const paymentMethodId = req.params.paymentMethodId as string
    await stripe.paymentMethods.detach(paymentMethodId)
    console.log(`[Stripe] Detached payment method ${paymentMethodId}`)
    sendSuccess(res)
  } catch (error: any) {
    console.error('[Stripe] Error removing saved card:', error)
    sendError(res, 'Failed to remove card')
  }
})

// POST /api/stripe/create-usage-intent
router.post('/create-usage-intent', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { amount, saveCard } = req.body

    if (!amount || amount <= 0) {
      return sendError(res, 'Valid amount is required', 400)
    }
    
    if (amount < 1 || amount > 500) {
      return sendError(res, 'Amount must be between $1 and $500', 400)
    }

    const user = await db.users.get(userId as string) as any

    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    let customerId = user.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || userId as string,
        metadata: { userId: userId as string },
      })
      customerId = customer.id
      await db.users.update(userId as string, { stripeCustomerId: customerId })
    }
    
    const TRANSACTION_FEE_PERCENT = 3.5
    const calculatedFee = Math.round(amount * (TRANSACTION_FEE_PERCENT / 100) * 100) / 100
    const calculatedTotal = amount + calculatedFee
    const totalCents = Math.round(calculatedTotal * 100)
    
    console.log(`[Buy Usage] Creating PaymentIntent for user ${userId}: $${amount} + $${calculatedFee.toFixed(2)} fee = $${calculatedTotal.toFixed(2)} (saveCard: ${!!saveCard})`)
    
    const piOptions: any = {
      amount: totalCents,
      currency: 'usd',
      payment_method_types: ['card'],
      description: `Usage credits purchase: $${amount.toFixed(2)}`,
      metadata: {
        userId: userId as string,
        stripeCustomerId: customerId,
        usageAmount: amount.toString(),
        fee: calculatedFee.toFixed(2),
        type: 'usage_purchase',
      },
    }

    if (saveCard) {
      piOptions.customer = customerId
      piOptions.setup_future_usage = 'off_session'
    }

    const paymentIntent = await stripe.paymentIntents.create(piOptions)

    sendSuccess(res, {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (error: any) {
    console.error('[Buy Usage] Error creating usage intent:', error)
    sendError(res, 'Failed to initialize payment. Please try again.')
  }
})

// POST /api/stripe/confirm-usage-purchase
router.post('/confirm-usage-purchase', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { paymentIntentId, amount } = req.body

    if (!paymentIntentId || !amount) {
      return sendError(res, 'paymentIntentId and amount are required', 400)
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (paymentIntent.status !== 'succeeded') {
      return sendError(res, 'Payment has not been completed.', 400)
    }

    if (paymentIntent.metadata?.userId !== userId || paymentIntent.metadata?.type !== 'usage_purchase') {
      return sendError(res, 'Payment verification failed.', 400)
    }
    
    const usageAmount = parseFloat(paymentIntent.metadata.usageAmount)
    const calculatedFee = parseFloat(paymentIntent.metadata.fee)
    const calculatedTotal = usageAmount + calculatedFee
    
    const userUsage = await db.usage.getOrDefault(userId as string) as any
    const purchasedCredits = userUsage.purchasedCredits || { total: 0, remaining: 0, purchases: [] }

    const alreadyProcessed = purchasedCredits.purchases?.some(
      (p: any) => p.paymentIntentId === paymentIntentId
    )
    if (alreadyProcessed) {
      return sendSuccess(res, {
        message: 'Purchase already processed',
        creditsAdded: usageAmount,
        newBalance: purchasedCredits.remaining,
      })
    }
    
    purchasedCredits.total += usageAmount
    purchasedCredits.remaining += usageAmount
    purchasedCredits.purchases.push({
      amount: usageAmount,
      fee: calculatedFee,
      total: calculatedTotal,
      paymentIntentId: paymentIntentId,
      timestamp: new Date().toISOString(),
    })
    
    await db.usage.update(userId as string, { purchasedCredits })
    
    console.log(`[Buy Usage] Added $${usageAmount} credits to user ${userId}. New balance: $${purchasedCredits.remaining}`)
    
    sendSuccess(res, {
      message: `Successfully purchased $${usageAmount.toFixed(2)} in usage credits`,
      creditsAdded: usageAmount,
      newBalance: purchasedCredits.remaining,
      paymentIntentId,
    })
    
  } catch (error: any) {
    console.error('[Buy Usage] Error:', error)
    
    if (error.type === 'StripeCardError') {
      return sendError(res, error.message || 'Card declined', 400)
    }
    
    sendError(res, 'Failed to process payment. Please try again.')
  }
})

// GET /api/stripe/subscription-status
router.get('/subscription-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { sync } = req.query

    const user = await db.users.get(userId as string) as any

    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    const shouldSync = sync === 'true' || (user.stripeCustomerId && (!user.subscriptionStatus || user.subscriptionStatus === 'inactive'))
    
    if (shouldSync) {
      const syncResult = await syncSubscriptionFromStripe(userId as string)
      if (syncResult.synced) {
        const updatedUser = await db.users.get(userId as string) as any
        return sendSuccess(res, {
          subscriptionStatus: updatedUser.subscriptionStatus || 'inactive',
          subscriptionRenewalDate: updatedUser.subscriptionRenewalDate || null,
          hasActiveSubscription: updatedUser.subscriptionStatus === 'active',
          plan: updatedUser.plan || null,
          stripeSubscriptionId: updatedUser.stripeSubscriptionId || null,
          synced: true,
        })
      }
    }

    sendSuccess(res, {
      subscriptionStatus: user.subscriptionStatus || 'inactive',
      subscriptionRenewalDate: user.subscriptionRenewalDate || null,
      hasActiveSubscription: user.subscriptionStatus === 'active',
      plan: user.plan || null,
      stripeSubscriptionId: user.stripeSubscriptionId || null,
      synced: false,
    })
  } catch (error: any) {
    console.error('[Stripe] Error getting subscription status:', error)
    sendError(res, 'Failed to get subscription status')
  }
})

// GET /api/stripe/config
router.get('/config', (req: Request, res: Response) => {
  const publishableKey = env.STRIPE_PUBLISHABLE_KEY
  if (!publishableKey) {
    return sendError(res, 'Stripe publishable key not configured')
  }
  sendSuccess(res, { publishableKey })
})

// POST /api/stripe/create-subscription-intent
router.post('/create-subscription-intent', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string

    if (subscriptionIntentLocks.has(userId)) {
      console.log(`[Stripe] Duplicate create-subscription-intent call blocked for user ${userId}`)
      return sendError(res, 'Subscription initialization already in progress. Please wait.', 409)
    }
    subscriptionIntentLocks.add(userId)

    const user = await db.users.get(userId) as any

    if (!user) {
      subscriptionIntentLocks.delete(userId)
      return sendError(res, 'User not found', 404)
    }

    const priceId = user.plan === 'premium' ? STRIPE_PREMIUM_PRICE_ID : STRIPE_PRICE_ID
    if (!priceId) {
      subscriptionIntentLocks.delete(userId)
      return sendError(res, 'Stripe price ID not configured for this plan')
    }

    let customerId = user.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || userId,
        metadata: {
          userId: userId,
        },
      })
      customerId = customer.id

      const freshUser = await db.users.get(userId) as any
      if (freshUser && !freshUser.stripeCustomerId) {
        await db.users.update(userId, { stripeCustomerId: customerId })
        user.stripeCustomerId = customerId
      } else if (freshUser?.stripeCustomerId) {
        console.log(`[Stripe] Race condition detected: another call already set customer ${freshUser.stripeCustomerId}, discarding ${customerId}`)
        customerId = freshUser.stripeCustomerId
        user.stripeCustomerId = customerId
      }
      console.log(`[Stripe] Created new customer ${customerId} for user ${userId}`)
    }

    if (customerId) {
      const existingSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 10,
      })

      const activeSub = existingSubs.data.find(s => s.status === 'active' || s.status === 'trialing')
      if (activeSub) {
        const activeUpdate: Record<string, any> = {
          subscriptionStatus: activeSub.status,
          stripeSubscriptionId: activeSub.id,
          subscriptionRenewalDate: new Date(activeSub.current_period_end * 1000).toISOString(),
        }
        if (!user.subscriptionStartedDate) {
          activeUpdate.subscriptionStartedDate = new Date().toISOString()
        }
        await db.users.update(userId, activeUpdate)
        console.log(`[Stripe] User ${userId} already has active subscription ${activeSub.id}`)
        subscriptionIntentLocks.delete(userId)
        return sendSuccess(res, { alreadyActive: true, subscriptionId: activeSub.id })
      }

      const incompleteSub = existingSubs.data.find(s => s.status === 'incomplete')
      if (incompleteSub) {
        const expandedSub = await stripe.subscriptions.retrieve(incompleteSub.id, {
          expand: ['latest_invoice.payment_intent'],
        })
        const pi = (expandedSub.latest_invoice as any)?.payment_intent

        if (pi && pi.status === 'succeeded') {
          const incompleteUpdate: Record<string, any> = {
            subscriptionStatus: 'active',
            stripeSubscriptionId: incompleteSub.id,
            subscriptionRenewalDate: new Date(expandedSub.current_period_end * 1000).toISOString(),
          }
          if (!user.subscriptionStartedDate) {
            incompleteUpdate.subscriptionStartedDate = new Date().toISOString()
          }
          await db.users.update(userId, incompleteUpdate)
          console.log(`[Stripe] User ${userId} incomplete sub ${incompleteSub.id} has succeeded PI — force activating`)
          subscriptionIntentLocks.delete(userId)
          return sendSuccess(res, { alreadyActive: true, subscriptionId: incompleteSub.id })
        }

        if (pi && (pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation')) {
          console.log(`[Stripe] Reusing incomplete subscription ${incompleteSub.id} for user ${userId} (PI status: ${pi.status})`)
          
          await db.users.update(userId, {
            stripeSubscriptionId: incompleteSub.id,
            subscriptionStatus: 'incomplete',
          })

          subscriptionIntentLocks.delete(userId)
          return sendSuccess(res, {
            subscriptionId: incompleteSub.id,
            clientSecret: pi.client_secret,
          })
        }

        try {
          await stripe.subscriptions.cancel(incompleteSub.id)
          console.log(`[Stripe] Canceled stale incomplete subscription ${incompleteSub.id}`)
        } catch (cancelErr: any) {
          console.warn(`[Stripe] Could not cancel stale sub:`, cancelErr.message)
        }
      }
    }

    try {
      const existingMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      })
      for (const pm of existingMethods.data) {
        await stripe.paymentMethods.detach(pm.id)
      }
    } catch (detachErr: any) {
      console.warn('[Stripe] Could not detach old payment methods:', detachErr.message)
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        userId: userId,
      },
    })

    const paymentIntent = (subscription.latest_invoice as any).payment_intent

    await db.users.update(userId, { stripeSubscriptionId: subscription.id, subscriptionStatus: 'incomplete' })

    console.log(`[Stripe] Created subscription intent for user ${userId}, sub: ${subscription.id}, PI: ${paymentIntent.id}`)

    subscriptionIntentLocks.delete(userId)
    sendSuccess(res, {
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
    })
  } catch (error: any) {
    const lockUserId = req.userId
    if (lockUserId) subscriptionIntentLocks.delete(lockUserId)
    console.error('[Stripe] Error creating subscription intent:', error)
    sendError(res, 'Failed to create subscription. Please try again.')
  }
})

// POST /api/stripe/confirm-subscription
router.post('/confirm-subscription', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string
    const { subscriptionId } = req.body

    const user = await db.users.get(userId) as any
    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    const subId = subscriptionId || user.stripeSubscriptionId
    if (!subId) {
      return sendError(res, 'No subscription ID found for user', 400)
    }

    const subscription = await stripe.subscriptions.retrieve(subId, {
      expand: ['latest_invoice.payment_intent'],
    })

    console.log(`[Stripe] Confirm-subscription for ${userId}: sub status=${subscription.status}, PI status=${(subscription.latest_invoice as any)?.payment_intent?.status}`)

    const pi = (subscription.latest_invoice as any)?.payment_intent

    if (subscription.status === 'active' || subscription.status === 'trialing') {
      const renewalDate = new Date(subscription.current_period_end * 1000).toISOString()
      await db.users.update(userId, {
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: subscription.id,
        subscriptionRenewalDate: renewalDate,
      })
      console.log(`[Stripe] Subscription ${subId} confirmed active for user ${userId}`)
      return sendSuccess(res, { 
        subscriptionStatus: subscription.status,
        subscriptionRenewalDate: renewalDate,
      })
    }

    if (pi && pi.status === 'succeeded') {
      const renewalDate = new Date(subscription.current_period_end * 1000).toISOString()
      const updateFields: Record<string, any> = {
        subscriptionStatus: 'active',
        stripeSubscriptionId: subscription.id,
        subscriptionRenewalDate: renewalDate,
      }
      if (!user.subscriptionStartedDate) {
        updateFields.subscriptionStartedDate = new Date().toISOString()
      }
      await db.users.update(userId, updateFields)
      console.log(`[Stripe] Payment succeeded for sub ${subId}, force-activating user ${userId}`)
      return sendSuccess(res, { 
        subscriptionStatus: 'active',
        subscriptionRenewalDate: renewalDate,
      })
    }

    return sendError(res, `Subscription is ${subscription.status}, payment is ${pi?.status || 'unknown'}`, 402, {
      subscriptionStatus: subscription.status,
      paymentStatus: pi?.status || 'unknown',
    })
  } catch (error: any) {
    console.error('[Stripe] Error confirming subscription:', error)
    sendError(res, 'Failed to confirm subscription status')
  }
})

// POST /api/stripe/create-checkout-session
router.post('/create-checkout-session', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string
    const { plan: requestedPlan } = req.body

    const user = await db.users.get(userId) as any

    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    const effectivePlan = requestedPlan === 'premium' ? 'premium' : requestedPlan === 'pro' ? 'pro' : (user.plan === 'premium' ? 'premium' : 'pro')
    const priceId = effectivePlan === 'premium' ? STRIPE_PREMIUM_PRICE_ID : STRIPE_PRICE_ID
    if (!priceId) {
      return sendError(res, 'Stripe price ID not configured for this plan')
    }

    let customerId = user.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: {
          userId: userId,
        },
      })
      customerId = customer.id

      await db.users.update(userId, { stripeCustomerId: customerId })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin || 'http://localhost:3000'}/?subscription=success`,
      cancel_url: `${req.headers.origin || 'http://localhost:3000'}/`,
      metadata: {
        userId: userId,
        plan: effectivePlan,
      },
    })

    sendSuccess(res, { sessionId: session.id, url: session.url })
  } catch (error: any) {
    console.error('[Stripe] Error creating checkout session:', error)
    sendError(res, 'Failed to create checkout session')
  }
})

// POST /api/stripe/upgrade-to-premium
router.post('/upgrade-to-premium', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string

    const user = await db.users.get(userId) as any
    if (!user) {
      return sendError(res, 'User not found', 404)
    }
    if (user.plan === 'premium') {
      return sendError(res, 'You are already on the Premium plan', 400)
    }
    if (!user.stripeSubscriptionId) {
      return sendError(res, 'No active subscription found. Please subscribe first.', 400)
    }
    if (!STRIPE_PREMIUM_PRICE_ID) {
      return sendError(res, 'Premium plan is not configured')
    }

    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId)
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return sendError(res, 'Your subscription is not active. Please resume or resubscribe first.', 400)
    }

    const item = subscription.items?.data?.[0]
    if (!item) {
      return sendError(res, 'Could not find subscription item')
    }

    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [{ id: item.id, price: STRIPE_PREMIUM_PRICE_ID }],
      proration_behavior: 'create_prorations',
    })

    await db.users.update(userId, { plan: 'premium' })
    console.log(`[Stripe] Upgraded user ${userId} to Premium`)

    sendSuccess(res, {
      message: 'Upgraded to Premium! Your new allocation is active now.',
      plan: 'premium',
    })
  } catch (error: any) {
    console.error('[Stripe] Error upgrading to premium:', error)
    sendError(res, error.message || 'Failed to upgrade to Premium. Please try again.')
  }
})

// POST /api/stripe/pause-subscription
router.post('/pause-subscription', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string

    const user = await db.users.get(userId) as any

    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    if (!user.stripeSubscriptionId) {
      return sendError(res, 'No active subscription found', 400)
    }

    let periodEnd = user.subscriptionRenewalDate
    try {
      const stripeSub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId)
      if (stripeSub.current_period_end) {
        periodEnd = new Date(stripeSub.current_period_end * 1000).toISOString()
      }
    } catch (e) {
      console.log(`[Stripe] Could not retrieve subscription for period end, using existing renewalDate`)
    }

    await stripe.subscriptions.cancel(user.stripeSubscriptionId)

    const cancellationHistory = user.cancellationHistory || []
    cancellationHistory.push({
      date: new Date().toISOString(),
      reason: 'user_paused',
    })
    
    await db.users.update(userId, {
      subscriptionStatus: 'paused',
      subscriptionRenewalDate: periodEnd,
      subscriptionPausedDate: new Date().toISOString(),
      cancellationHistory,
    })

    console.log(`[Stripe] Subscription paused for user: ${userId}`)
    sendSuccess(res, { message: 'Subscription paused successfully' })
  } catch (error: any) {
    console.error('[Stripe] Error pausing subscription:', error)
    sendError(res, 'Failed to pause subscription')
  }
})

// POST /api/stripe/resume-subscription
router.post('/resume-subscription', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string

    const user = await db.users.get(userId) as any

    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    if (user.subscriptionStatus !== 'paused' && user.subscriptionStatus !== 'canceled') {
      return sendError(res, 'Subscription is not paused or canceled', 400)
    }

    if (!user.stripeCustomerId) {
      return sendError(res, 'No Stripe customer found. Please re-subscribe.', 400)
    }

    const now = new Date()
    const renewalDate = user.subscriptionRenewalDate ? new Date(user.subscriptionRenewalDate) : null
    const isWithinPaidPeriod = renewalDate && renewalDate > now

    if (isWithinPaidPeriod) {
      console.log(`[Stripe] Resuming within paid period for user ${userId}. Renewal: ${renewalDate.toISOString()}`)

      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
      })

      if (paymentMethods.data.length === 0) {
        console.log(`[Stripe] No saved payment method for ${userId}, falling back to checkout`)
        return sendError(res, 'No payment method on file. Please re-enter your card.', 400, { needsCheckout: true })
      }

      const defaultPaymentMethod = paymentMethods.data[0].id

      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: { default_payment_method: defaultPaymentMethod },
      })

      const trialEndUnix = Math.floor(renewalDate.getTime() / 1000)
      const resumePriceId = user.plan === 'premium' ? STRIPE_PREMIUM_PRICE_ID : STRIPE_PRICE_ID
      const subscription = await stripe.subscriptions.create({
        customer: user.stripeCustomerId,
        items: [{ price: resumePriceId || STRIPE_PRICE_ID }],
        default_payment_method: defaultPaymentMethod,
        trial_end: trialEndUnix,
        metadata: { userId },
      })

      const cancellationHistory = user.cancellationHistory || []
      cancellationHistory.push({
        date: new Date().toISOString(),
        reason: 'user_resumed',
      })

      await db.users.update(userId, {
        subscriptionStatus: 'active',
        stripeSubscriptionId: subscription.id,
        subscriptionPausedDate: null,
        subscriptionRenewalDate: renewalDate.toISOString(),
        subscriptionStartedDate: user.subscriptionStartedDate || new Date().toISOString(),
        cancellationHistory,
      })

      console.log(`[Stripe] Subscription resumed for user ${userId}. New sub: ${subscription.id}, billing starts: ${renewalDate.toISOString()}`)
      return sendSuccess(res, {
        subscriptionStatus: 'active',
        subscriptionRenewalDate: renewalDate.toISOString(),
        message: `Subscription reactivated! Your next billing date is ${renewalDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`,
      })

    } else {
      console.log(`[Stripe] User ${userId} is past paid period, redirecting to checkout`)
      
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
      })

      if (paymentMethods.data.length > 0) {
        const defaultPaymentMethod = paymentMethods.data[0].id

        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: { default_payment_method: defaultPaymentMethod },
        })

        const fallbackPriceId = user.plan === 'premium' ? STRIPE_PREMIUM_PRICE_ID : STRIPE_PRICE_ID
        const subscription = await stripe.subscriptions.create({
          customer: user.stripeCustomerId,
          items: [{ price: fallbackPriceId || STRIPE_PRICE_ID }],
          default_payment_method: defaultPaymentMethod,
          metadata: { userId },
        })

        const pastCancelHistory = user.cancellationHistory || []
        pastCancelHistory.push({
          date: new Date().toISOString(),
          reason: 'user_resumed',
        })

        const subRenewalDate = new Date(subscription.current_period_end * 1000).toISOString()
        await db.users.update(userId, {
          subscriptionStatus: subscription.status,
          stripeSubscriptionId: subscription.id,
          subscriptionPausedDate: null,
          subscriptionRenewalDate: subRenewalDate,
          subscriptionStartedDate: new Date().toISOString(),
          cancellationHistory: pastCancelHistory,
        })

        console.log(`[Stripe] Subscription restarted for user ${userId}. Sub: ${subscription.id}, status: ${subscription.status}`)
        return sendSuccess(res, {
          subscriptionStatus: subscription.status,
          subscriptionRenewalDate: subRenewalDate,
          message: 'Subscription reactivated and payment processed!',
        })
      } else {
        return sendError(res, 'No payment method on file. Please re-enter your card.', 400, { needsCheckout: true })
      }
    }
  } catch (error: any) {
    console.error('[Stripe] Error resuming subscription:', error)
    sendError(res, 'Failed to resume subscription. Please try again.')
  }
})

// POST /api/stripe/cancel-subscription-delete-account
router.post('/cancel-subscription-delete-account', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string

    const user = await db.users.get(userId) as any

    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    if (user.plan === 'free_trial') {
      let remainingAllocation = 0
      try {
        const tz = await getUserTimezone(userId)
        const deletionMonth = getMonthForUser(tz)
        const userStatsDoc = await db.userStats.get(userId) as any
        const monthlyCost = userStatsDoc?.monthlyUsageCost?.[deletionMonth] || 0
        remainingAllocation = Math.max(0, 1.00 - monthlyCost)
        await db.users.recordUsedTrial({
          canonicalEmail: user.canonicalEmail || user.email,
          email: user.email,
          signupIp: user.signupIp || null,
          deviceFingerprint: user.deviceFingerprint || null,
          remainingAllocation: Math.round(remainingAllocation * 100) / 100,
          deletionMonth,
        })
        console.log(`[Stripe] Recorded used free plan: ${user.email}, remaining: $${remainingAllocation.toFixed(2)}`)
      } catch (err: any) {
        console.error('[Stripe] Error recording used trial:', err)
        await db.users.recordUsedTrial({
          canonicalEmail: user.canonicalEmail || user.email,
          email: user.email,
          signupIp: user.signupIp || null,
          deviceFingerprint: user.deviceFingerprint || null,
          remainingAllocation: 0,
        })
      }
    }

    if (user.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId)
        console.log(`[Stripe] Subscription canceled for user: ${userId}`)
      } catch (stripeError: any) {
        console.error('[Stripe] Error canceling subscription (may already be canceled):', stripeError.message)
      }
    }

    if (user.stripeCustomerId) {
      try {
        await stripe.customers.del(user.stripeCustomerId)
        console.log(`[Stripe] Customer deleted from Stripe for user: ${userId}`)
      } catch (stripeError: any) {
        console.error('[Stripe] Error deleting Stripe customer:', stripeError.message)
      }
    }

    try {
      await db.users.delete(userId)
      console.log(`[Stripe] Deleted user ${userId} and all data from MongoDB`)
    } catch (dbErr: any) {
      console.error(`[Stripe] MongoDB cleanup error for ${userId}:`, dbErr.message)
    }

    try {
      await purgeUserFromLeaderboard(userId)
      console.log(`[Stripe] User ${userId} purged from leaderboard cache and MongoDB`)
    } catch (lbErr: any) {
      console.error(`[Stripe] Leaderboard purge error for ${userId}:`, lbErr.message)
    }

    await incrementDeletedUsers()

    console.log(`[Stripe] Account deleted for user: ${userId}`)
    sendSuccess(res, { message: 'Account and subscription deleted successfully' })
  } catch (error: any) {
    console.error('[Stripe] Error canceling subscription and deleting account:', error)
    sendError(res, 'Failed to cancel subscription and delete account')
  }
})

// POST /api/stripe/webhook
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string
  let event: any

  try {
    if (STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body as string | Buffer, sig, STRIPE_WEBHOOK_SECRET)
    } else {
      console.warn('[Stripe] Webhook secret not set, skipping signature verification')
      event = JSON.parse((req.body as Buffer).toString())
    }
  } catch (err: any) {
    console.error('[Stripe] Webhook signature verification failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    const findUserByCustomerId = async (customerId: string) => {
      const dbInstance = await db.getDb()
      const userDoc = await dbInstance.collection<any>('users').findOne({ stripeCustomerId: customerId })
      return userDoc ? (userDoc as any)._id : null
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.metadata?.userId
        const planFromMetadata = session.metadata?.plan

        if (userId) {
          console.log(`[Stripe] Checkout completed for user: ${userId}`)
          if (planFromMetadata && (planFromMetadata === 'pro' || planFromMetadata === 'premium')) {
            await db.users.update(userId, { plan: planFromMetadata })
            console.log(`[Stripe] Updated user ${userId} plan to ${planFromMetadata}`)
          }
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const customerId = subscription.customer

        const userId = await findUserByCustomerId(customerId)

        if (userId) {
          const updateFields: Record<string, any> = {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            subscriptionRenewalDate: new Date(subscription.current_period_end * 1000).toISOString(),
          }
          if (subscription.status === 'active' || subscription.status === 'trialing') {
            const user = await db.users.get(userId) as any
            if (user && !user.subscriptionStartedDate) {
              updateFields.subscriptionStartedDate = new Date().toISOString()
            }
          }

          await db.users.update(userId, updateFields)
          console.log(`[Stripe] Subscription ${event.type} for user: ${userId}, status: ${subscription.status}`)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const customerId = subscription.customer

        const userId = await findUserByCustomerId(customerId)

        if (userId) {
          const user = await db.users.get(userId) as any
          const updateFields: Record<string, any> = {}
          if (user.subscriptionStatus !== 'paused') {
            updateFields.subscriptionStatus = 'canceled'
          }
          if (subscription.current_period_end) {
            const periodEnd = new Date(subscription.current_period_end * 1000)
            if (periodEnd > new Date()) {
              updateFields.subscriptionRenewalDate = periodEnd.toISOString()
            }
          }
          const cancellationHistory = user.cancellationHistory || []
          cancellationHistory.push({
            date: new Date().toISOString(),
            reason: subscription.cancellation_details?.reason || 'subscription_deleted',
          })
          updateFields.cancellationHistory = cancellationHistory

          await db.users.update(userId, updateFields)
          console.log(`[Stripe] Subscription canceled for user: ${userId}, access until: ${updateFields.subscriptionRenewalDate || user.subscriptionRenewalDate || 'none'}`)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        const customerId = invoice.customer

        const userId = await findUserByCustomerId(customerId)

        if (userId && invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription)
          await db.users.update(userId, {
            subscriptionRenewalDate: new Date(subscription.current_period_end * 1000).toISOString(),
            subscriptionStatus: subscription.status,
          })
          console.log(`[Stripe] Payment succeeded for user: ${userId}`)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const customerId = invoice.customer

        const userId = await findUserByCustomerId(customerId)

        if (userId) {
          await db.users.update(userId, { subscriptionStatus: 'past_due' })
          console.log(`[Stripe] Payment failed for user: ${userId}`)
        }
        break
      }

      case 'invoice.upcoming': {
        const invoice = event.data.object
        const customerId = invoice.customer
        const subscriptionId = invoice.subscription

        const userId = await findUserByCustomerId(customerId)

        if (userId && subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId)
            const periodEnd = new Date(subscription.current_period_end * 1000)
            const billingMonth = `${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, '0')}`
            
            console.log(`[Billing] Invoice upcoming for user ${userId}, calculating overage for ${billingMonth}`)
            const result = await calculateAndRecordOverage(userId, billingMonth)
            
            if (result.billed) {
              console.log(`[Billing] Added $${result.amountBilled!.toFixed(2)} overage to upcoming invoice for user ${userId}`)
            }
          } catch (error: any) {
            console.error(`[Billing] Error processing invoice.upcoming for user ${userId}:`, error)
          }
        }
        break
      }

      case 'invoice.finalized': {
        const invoice = event.data.object
        const customerId = invoice.customer

        const userId = await findUserByCustomerId(customerId)

        if (userId && invoice.subscription) {
          try {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription)
            const periodEnd = new Date(subscription.current_period_end * 1000)
            const billingMonth = `${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, '0')}`

            const result = await calculateAndRecordOverage(userId, billingMonth)
            console.log(`[Billing] Invoice finalized for user ${userId}, overage check: $${result.overage.toFixed(2)}`)
          } catch (error: any) {
            console.error(`[Billing] Error processing invoice.finalized for user ${userId}:`, error)
          }
        }
        break
      }

      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`)
    }

    sendSuccess(res, { received: true })
  } catch (error: any) {
    console.error('[Stripe] Error processing webhook:', error)
    sendError(res, 'Webhook processing failed')
  }
})

export default router
