import db from '../../database/db.js'
import { resend, FROM_EMAIL, APP_NAME, APP_URL, stripe } from '../config/index.js'
import { getPlanAllocation } from '../helpers/pricing.js'
import { getUserTimezone } from './usage.js'
import { getMonthForUser } from '../helpers/date.js'
import { isAdmin } from '../middleware/requireAdmin.js'
import { createLogger } from '../config/logger.js'

const log = createLogger('subscription')

// Track which users have already been sent a usage-exhausted email this month (prevents spam)
const usageExhaustedEmailsSent = new Map<string, boolean>() // key: `${userId}-${month}`, value: true

const sendUsageExhaustedEmail = async (userId: string, user: any, planAllocation: number, monthlyCost: number) => {
  if (!resend || !user?.email) return
  
  const tz = await getUserTimezone(userId)
  const currentMonth = getMonthForUser(tz)
  const emailKey = `${userId}-${currentMonth}`
  
  // Only send once per user per month
  if (usageExhaustedEmailsSent.has(emailKey)) return
  usageExhaustedEmailsSent.set(emailKey, true)
  
  const isFreePlan = user.plan === 'free_trial' || (user.subscriptionStatus === 'trialing' && !user.stripeSubscriptionId)
  const planName = isFreePlan ? 'Free' : (user.plan === 'premium' ? 'Premium' : 'Pro')
  const firstName = user.firstName || user.username || 'there'
  
  const upgradeMessage = isFreePlan
    ? `<p style="margin: 0 0 16px 0; line-height: 1.6;">To continue using ArkiTek, please <strong>upgrade your plan</strong>. Our Pro plan ($19.95/month) includes $7.50 in monthly usage, and our Premium plan ($49.95/month) includes $25 in monthly usage.</p>
       <a href="${APP_URL}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #48c9b0, #5dade2); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 8px 0;">Upgrade Your Plan</a>`
    : `<p style="margin: 0 0 16px 0; line-height: 1.6;">You can <strong>purchase additional usage credits</strong> in the Profile tab, or <strong>upgrade your plan</strong> for a higher monthly allocation.</p>
       <a href="${APP_URL}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #48c9b0, #5dade2); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 8px 0;">Get More Usage</a>`

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: `${APP_NAME} — Your Monthly Usage Has Been Reached`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0a0a0a; color: #e0e0e0; border-radius: 16px;">
          <h2 style="margin: 0 0 20px 0; color: #ffffff;">Hi ${firstName},</h2>
          <p style="margin: 0 0 16px 0; line-height: 1.6;">Your <strong>${planName} plan</strong> monthly usage of <strong>$${planAllocation.toFixed(2)}</strong> has been reached for this billing period. You've used <strong>$${monthlyCost.toFixed(2)}</strong> so far.</p>
          ${upgradeMessage}
          <p style="margin: 24px 0 0 0; color: #888888; font-size: 0.85rem;">Your usage allocation resets at the start of each billing month.</p>
          <hr style="border: none; border-top: 1px solid #222; margin: 24px 0;" />
          <p style="margin: 0; color: #666666; font-size: 0.8rem;">— The ${APP_NAME} Team</p>
        </div>
      `,
    })
    log.info({ email: user.email, plan: user.plan, monthlyCost, planAllocation }, 'Sent usage exhaustion email')
  } catch (err: any) {
    log.error({ err, email: user.email }, 'Error sending usage exhaustion email')
  }
}

// Helper function to check if user has active subscription
const checkSubscriptionStatus = async (userId: string | undefined): Promise<{ hasAccess: boolean; reason?: string; usageExhausted?: boolean; planType?: string }> => {
  if (!userId) {
    log.debug('No user ID provided for subscription check')
    return { hasAccess: false, reason: 'No user ID provided' }
  }

  // Admins always have access regardless of subscription status
  if (await isAdmin(userId)) {
    log.debug({ userId }, 'Admin bypass for subscription check')
    return { hasAccess: true }
  }

  const user = await db.users.get(userId) as any

  if (!user) {
    log.debug({ userId }, 'User not found for subscription check')
    return { hasAccess: false, reason: 'User not found' }
  }

  // Check subscription status
  const status = user.subscriptionStatus || 'inactive'
  log.debug({ userId, status, customerId: user.stripeCustomerId || 'none', subscriptionId: user.stripeSubscriptionId || 'none' }, 'Subscription check')

  if (status === 'active' || status === 'trialing') {
    // Check if subscription hasn't expired
    if (user.subscriptionRenewalDate) {
      const endDate = new Date(user.subscriptionRenewalDate)
      const now = new Date()
      if (endDate < now) {
        log.info({ userId, endDate: endDate.toISOString() }, 'Subscription expired')
        return { hasAccess: false, reason: 'Subscription has expired' }
      }
    }

    // Enforce usage limits for ALL plans
    const planAllocation = getPlanAllocation(user)
    const isFreePlan = user.plan === 'free_trial' || (status === 'trialing' && !user.stripeSubscriptionId)
    const tz = await getUserTimezone(userId)
    const currentMonth = getMonthForUser(tz)
    const [userStatsDoc, userUsage] = await Promise.all([
      db.userStats.get(userId),
      db.usage.getOrDefault(userId),
    ]) as [any, any]
    const monthlyCost = userStatsDoc?.monthlyUsageCost?.[currentMonth] || 0
    const purchasedCreditsRemaining = userUsage.purchasedCredits?.remaining || 0
    const totalBudget = planAllocation + purchasedCreditsRemaining

    if (monthlyCost >= totalBudget) {
      // Send usage exhaustion email (async, non-blocking)
      sendUsageExhaustedEmail(userId, user, planAllocation, monthlyCost).catch(err => {
        log.error({ err, userId }, 'Failed to send exhaustion email')
      })

      const planName = isFreePlan ? 'free plan' : (user.plan === 'premium' ? 'premium plan' : 'pro plan')
      if (isFreePlan) {
        return { hasAccess: false, reason: 'Your free plan monthly usage has been reached. Upgrade your plan to get more usage.', usageExhausted: true, planType: 'free' }
      } else {
        return { hasAccess: false, reason: `Your ${planName} monthly usage has been reached. Purchase additional credits or upgrade your plan for more usage.`, usageExhausted: true, planType: user.plan || 'pro' }
      }
    }

    log.debug({ userId }, 'Access granted')
    return { hasAccess: true }
  }

  // Canceled/paused users still have full access until their paid period ends
  if (status === 'canceled' || status === 'paused') {
    if (user.subscriptionRenewalDate) {
      const endDate = new Date(user.subscriptionRenewalDate)
      const now = new Date()
      if (endDate > now) {
        log.debug({ userId, status, endDate: endDate.toISOString() }, 'Access granted for canceled/paused user — paid period active')
        return { hasAccess: true }
      }
    }
    log.info({ userId, status }, 'Access denied — subscription canceled/paused and paid period ended')
    return { hasAccess: false, reason: `Your subscription has been ${status}. Please resubscribe to send prompts.` }
  }

  log.info({ userId, status }, 'Access denied')
  return { hasAccess: false, reason: `Subscription status: ${status}` }
}

// Sync subscription status from Stripe API (with retry for incomplete → active transitions)
// Also searches by email to recover from duplicate-customer race conditions
const syncSubscriptionFromStripe = async (userId: string, retries = 3): Promise<{ synced: boolean; reason?: string; status?: string; subscriptionId?: string; endDate?: string; error?: string }> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
  try {
    const user = await db.users.get(userId) as any
    
    if (!user || !user.stripeCustomerId) {
      return { synced: false, reason: 'No Stripe customer ID' }
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'all',
      limit: 10,
    })

    const hasActiveSub = subscriptions.data.some(s => s.status === 'active' || s.status === 'trialing')
    if (!hasActiveSub && user.email) {
      try {
        const allCustomers = await stripe.customers.list({ email: user.email, limit: 20 })
        for (const cust of allCustomers.data) {
          if (cust.id === user.stripeCustomerId) continue
          const custSubs = await stripe.subscriptions.list({ customer: cust.id, status: 'all', limit: 10 })
          const activeSub = custSubs.data.find(s => s.status === 'active' || s.status === 'trialing')
          if (activeSub) {
            log.info({ userId, alternateCustomerId: cust.id, previousCustomerId: user.stripeCustomerId }, 'Found active subscription on alternate customer')
            const renewalDate = new Date(activeSub.current_period_end * 1000).toISOString()
            const updateFields: Record<string, any> = {
              stripeCustomerId: cust.id,
              stripeSubscriptionId: activeSub.id,
              subscriptionStatus: activeSub.status,
              subscriptionRenewalDate: renewalDate,
            }
            if (!user.subscriptionStartedDate) {
              updateFields.subscriptionStartedDate = new Date().toISOString()
            }
            await db.users.update(userId, updateFields)
            log.info({ userId, customerId: cust.id, subscriptionId: activeSub.id, status: activeSub.status }, 'Recovered subscription')
            return { synced: true, status: activeSub.status, subscriptionId: activeSub.id, endDate: renewalDate }
          }
          for (const sub of custSubs.data) {
            if (sub.status === 'incomplete') {
              try {
                const expandedSub = await stripe.subscriptions.retrieve(sub.id, { expand: ['latest_invoice.payment_intent'] })
                const pi = (expandedSub.latest_invoice as any)?.payment_intent
                if (pi && pi.status === 'succeeded') {
                  log.info({ userId, alternateCustomerId: cust.id }, 'Found paid-but-incomplete subscription on alternate customer')
                  const renewalDate = new Date(expandedSub.current_period_end * 1000).toISOString()
                  const updateFields: Record<string, any> = {
                    stripeCustomerId: cust.id,
                    stripeSubscriptionId: sub.id,
                    subscriptionStatus: 'active',
                    subscriptionRenewalDate: renewalDate,
                  }
                  if (!user.subscriptionStartedDate) {
                    updateFields.subscriptionStartedDate = new Date().toISOString()
                  }
                  await db.users.update(userId, updateFields)
                  log.info({ userId, customerId: cust.id, subscriptionId: sub.id }, 'Recovered subscription (force-active)')
                  return { synced: true, status: 'active', subscriptionId: sub.id, endDate: renewalDate }
                }
              } catch (e) {
                // Skip this sub if we can't expand it
              }
            }
          }
        }
      } catch (emailSearchErr) {
        log.warn({ err: emailSearchErr, userId }, 'Email-based customer search failed')
      }
    }

    if (subscriptions.data.length === 0) {
      if (user.subscriptionStatus !== 'inactive') {
        await db.users.update(userId, { subscriptionStatus: 'inactive', stripeSubscriptionId: null, subscriptionRenewalDate: null })
        log.info({ userId }, 'Synced subscription status to inactive')
        return { synced: true, status: 'inactive' }
      }
      return { synced: false, reason: 'No subscriptions in Stripe' }
    }

    const activeSubscription = subscriptions.data.find(sub => sub.status === 'active')
      const trialingSubscription = subscriptions.data.find(sub => sub.status === 'trialing')
      const subscription = activeSubscription || trialingSubscription || subscriptions.data[0]

      if (subscription.status === 'incomplete' && attempt < retries) {
        log.info({ userId, attempt, retries }, 'Subscription still incomplete, retrying')
        await new Promise(resolve => setTimeout(resolve, 2000))
        continue
      }

      if (subscription.status === 'incomplete') {
        try {
          const expandedSub = await stripe.subscriptions.retrieve(subscription.id, {
            expand: ['latest_invoice.payment_intent'],
          })
          const pi = (expandedSub.latest_invoice as any)?.payment_intent
          if (pi && pi.status === 'succeeded') {
            log.info({ userId }, 'Payment succeeded but sub still incomplete — treating as active')
            const oldStatus = user.subscriptionStatus
            const renewalDate = new Date(expandedSub.current_period_end * 1000).toISOString()
            const updateFields: Record<string, any> = {
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: 'active',
              subscriptionRenewalDate: renewalDate,
            }
            if (!user.subscriptionStartedDate) {
              updateFields.subscriptionStartedDate = new Date().toISOString()
            }
            await db.users.update(userId, updateFields)
            if (oldStatus !== 'active') {
              log.info({ userId, oldStatus }, 'Force-synced subscription')
            }
            return { synced: true, status: 'active', subscriptionId: subscription.id, endDate: renewalDate }
          }
        } catch (expandErr) {
          log.warn({ err: expandErr, userId }, 'Could not expand subscription')
        }
      }

    const oldStatus = user.subscriptionStatus
    const renewalDate = new Date(subscription.current_period_end * 1000).toISOString()
    await db.users.update(userId, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionRenewalDate: renewalDate,
    })
    
    if (oldStatus !== subscription.status) {
      log.info({ userId, oldStatus, newStatus: subscription.status }, 'Synced subscription status from Stripe')
    }
    
    return { 
      synced: true, 
      status: subscription.status,
      subscriptionId: subscription.id,
        endDate: renewalDate
    }
  } catch (error: any) {
      log.error({ err: error, userId, attempt }, 'Error syncing subscription from Stripe')
      if (attempt === retries) {
    return { synced: false, error: error.message }
  }
    }
  }
  return { synced: false, reason: 'Retries exhausted' }
}

// Async version that syncs with Stripe before denying access
const checkSubscriptionStatusAsync = async (userId: string): Promise<{ hasAccess: boolean; reason?: string; usageExhausted?: boolean; planType?: string }> => {
  const result = await checkSubscriptionStatus(userId)
  
  // If access is granted, return immediately
  if (result.hasAccess) return result
  
  // If access denied and user has a Stripe customer ID, sync from Stripe before final denial
  const user = await db.users.get(userId) as any
  if (user && user.stripeCustomerId) {
    log.debug({ userId }, 'Access denied locally, syncing from Stripe before final denial')
    const syncResult = await syncSubscriptionFromStripe(userId, 1)
    if (syncResult.synced && (syncResult.status === 'active' || syncResult.status === 'trialing')) {
      log.info({ userId, status: syncResult.status }, 'Stripe sync restored access')
      return { hasAccess: true }
    }
  }
  
  return result
}

export {
  usageExhaustedEmailsSent,
  sendUsageExhaustedEmail,
  checkSubscriptionStatus,
  checkSubscriptionStatusAsync,
  syncSubscriptionFromStripe,
}
