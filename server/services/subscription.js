import db from '../../database/db.js'
import { resend, FROM_EMAIL, APP_NAME, APP_URL, stripe } from '../config/index.js'
import { getPlanAllocation } from '../helpers/pricing.js'
import { getUserTimezone } from './usage.js'
import { getMonthForUser } from '../helpers/date.js'
import { isAdmin } from '../middleware/requireAdmin.js'

// Track which users have already been sent a usage-exhausted email this month (prevents spam)
const usageExhaustedEmailsSent = new Map() // key: `${userId}-${month}`, value: true

const sendUsageExhaustedEmail = async (userId, user, planAllocation, monthlyCost) => {
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
    console.log(`[Usage Email] Sent usage exhaustion email to ${user.email} (${user.plan} plan, spent $${monthlyCost.toFixed(2)}/$${planAllocation.toFixed(2)})`)
  } catch (err) {
    console.error(`[Usage Email] Error sending to ${user.email}:`, err.message)
  }
}

// Helper function to check if user has active subscription
const checkSubscriptionStatus = async (userId) => {
  if (!userId) {
    console.log('[Subscription Check] No user ID provided')
    return { hasAccess: false, reason: 'No user ID provided' }
  }

  // Admins always have access regardless of subscription status
  if (isAdmin(userId)) {
    console.log(`[Subscription Check] Admin bypass for user ${userId}`)
    return { hasAccess: true }
  }

  const user = await db.users.get(userId)

  if (!user) {
    console.log(`[Subscription Check] User not found: ${userId}`)
    return { hasAccess: false, reason: 'User not found' }
  }

  // Check subscription status
  const status = user.subscriptionStatus || 'inactive'
  console.log(`[Subscription Check] User ${userId} status: ${status}, customerId: ${user.stripeCustomerId || 'none'}, subscriptionId: ${user.stripeSubscriptionId || 'none'}`)

  if (status === 'active' || status === 'trialing') {
    // Check if subscription hasn't expired
    if (user.subscriptionRenewalDate) {
      const endDate = new Date(user.subscriptionRenewalDate)
      const now = new Date()
      if (endDate < now) {
        console.log(`[Subscription Check] Subscription expired for user ${userId}: ${endDate} < ${now}`)
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
    ])
    const monthlyCost = userStatsDoc?.monthlyUsageCost?.[currentMonth] || 0
    const purchasedCreditsRemaining = userUsage.purchasedCredits?.remaining || 0
    const totalBudget = planAllocation + purchasedCreditsRemaining

    if (monthlyCost >= totalBudget) {
      // Send usage exhaustion email (async, non-blocking)
      sendUsageExhaustedEmail(userId, user, planAllocation, monthlyCost).catch(err => {
        console.error(`[Usage Email] Failed to send exhaustion email for ${userId}:`, err.message)
      })

      const planName = isFreePlan ? 'free plan' : (user.plan === 'premium' ? 'premium plan' : 'pro plan')
      if (isFreePlan) {
        return { hasAccess: false, reason: 'Your free plan monthly usage has been reached. Upgrade your plan to get more usage.', usageExhausted: true, planType: 'free' }
      } else {
        return { hasAccess: false, reason: `Your ${planName} monthly usage has been reached. Purchase additional credits or upgrade your plan for more usage.`, usageExhausted: true, planType: user.plan || 'pro' }
      }
    }

    console.log(`[Subscription Check] Access granted for user ${userId}`)
    return { hasAccess: true }
  }

  // Canceled/paused users still have full access until their paid period ends
  if (status === 'canceled' || status === 'paused') {
    if (user.subscriptionRenewalDate) {
      const endDate = new Date(user.subscriptionRenewalDate)
      const now = new Date()
      if (endDate > now) {
        console.log(`[Subscription Check] Access granted for ${status} user ${userId} — paid period ends ${endDate.toISOString()}`)
        return { hasAccess: true }
      }
    }
    console.log(`[Subscription Check] Access denied - subscription ${status} and paid period ended for user ${userId}`)
    return { hasAccess: false, reason: `Your subscription has been ${status}. Please resubscribe to send prompts.` }
  }

  console.log(`[Subscription Check] Access denied for user ${userId}: status is ${status}`)
  return { hasAccess: false, reason: `Subscription status: ${status}` }
}

// Sync subscription status from Stripe API (with retry for incomplete → active transitions)
// Also searches by email to recover from duplicate-customer race conditions
const syncSubscriptionFromStripe = async (userId, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
  try {
    const user = await db.users.get(userId)
    
    if (!user || !user.stripeCustomerId) {
      return { synced: false, reason: 'No Stripe customer ID' }
    }

    let subscriptions = await stripe.subscriptions.list({
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
            console.log(`[Stripe] Found active subscription on alternate customer ${cust.id} (was using ${user.stripeCustomerId}) for user ${userId}`)
            const renewalDate = new Date(activeSub.current_period_end * 1000).toISOString()
            const updateFields = {
              stripeCustomerId: cust.id,
              stripeSubscriptionId: activeSub.id,
              subscriptionStatus: activeSub.status,
              subscriptionRenewalDate: renewalDate,
            }
            if (!user.subscriptionStartedDate) {
              updateFields.subscriptionStartedDate = new Date().toISOString()
            }
            await db.users.update(userId, updateFields)
            console.log(`[Stripe] Recovered subscription for user ${userId}: customer=${cust.id}, sub=${activeSub.id}, status=${activeSub.status}`)
            return { synced: true, status: activeSub.status, subscriptionId: activeSub.id, endDate: renewalDate }
          }
          for (const sub of custSubs.data) {
            if (sub.status === 'incomplete') {
              try {
                const expandedSub = await stripe.subscriptions.retrieve(sub.id, { expand: ['latest_invoice.payment_intent'] })
                const pi = expandedSub.latest_invoice?.payment_intent
                if (pi && pi.status === 'succeeded') {
                  console.log(`[Stripe] Found paid-but-incomplete subscription on alternate customer ${cust.id} for user ${userId}`)
                  const renewalDate = new Date(expandedSub.current_period_end * 1000).toISOString()
                  const updateFields = {
                    stripeCustomerId: cust.id,
                    stripeSubscriptionId: sub.id,
                    subscriptionStatus: 'active',
                    subscriptionRenewalDate: renewalDate,
                  }
                  if (!user.subscriptionStartedDate) {
                    updateFields.subscriptionStartedDate = new Date().toISOString()
                  }
                  await db.users.update(userId, updateFields)
                  console.log(`[Stripe] Recovered (force-active) subscription for user ${userId}: customer=${cust.id}, sub=${sub.id}`)
                  return { synced: true, status: 'active', subscriptionId: sub.id, endDate: renewalDate }
                }
              } catch (e) {
                // Skip this sub if we can't expand it
              }
            }
          }
        }
      } catch (emailSearchErr) {
        console.warn(`[Stripe] Email-based customer search failed for ${userId}:`, emailSearchErr.message)
      }
    }

    if (subscriptions.data.length === 0) {
      if (user.subscriptionStatus !== 'inactive') {
        await db.users.update(userId, { subscriptionStatus: 'inactive', stripeSubscriptionId: null, subscriptionRenewalDate: null })
        console.log(`[Stripe] Synced subscription status to inactive for user: ${userId}`)
        return { synced: true, status: 'inactive' }
      }
      return { synced: false, reason: 'No subscriptions in Stripe' }
    }

    const activeSubscription = subscriptions.data.find(sub => sub.status === 'active')
      const trialingSubscription = subscriptions.data.find(sub => sub.status === 'trialing')
      const subscription = activeSubscription || trialingSubscription || subscriptions.data[0]

      if (subscription.status === 'incomplete' && attempt < retries) {
        console.log(`[Stripe] Subscription still incomplete for ${userId}, retrying in 2s... (attempt ${attempt}/${retries})`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        continue
      }

      if (subscription.status === 'incomplete') {
        try {
          const expandedSub = await stripe.subscriptions.retrieve(subscription.id, {
            expand: ['latest_invoice.payment_intent'],
          })
          const pi = expandedSub.latest_invoice?.payment_intent
          if (pi && pi.status === 'succeeded') {
            console.log(`[Stripe] Payment succeeded but sub still incomplete for ${userId}. Treating as active.`)
            const oldStatus = user.subscriptionStatus
            const renewalDate = new Date(expandedSub.current_period_end * 1000).toISOString()
            const updateFields = {
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: 'active',
              subscriptionRenewalDate: renewalDate,
            }
            if (!user.subscriptionStartedDate) {
              updateFields.subscriptionStartedDate = new Date().toISOString()
            }
            await db.users.update(userId, updateFields)
            if (oldStatus !== 'active') {
              console.log(`[Stripe] Force-synced subscription for user ${userId}: ${oldStatus} → active`)
            }
            return { synced: true, status: 'active', subscriptionId: subscription.id, endDate: renewalDate }
          }
        } catch (expandErr) {
          console.warn(`[Stripe] Could not expand subscription for ${userId}:`, expandErr.message)
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
      console.log(`[Stripe] Synced subscription status from Stripe for user ${userId}: ${oldStatus} → ${subscription.status}`)
    }
    
    return { 
      synced: true, 
      status: subscription.status,
      subscriptionId: subscription.id,
        endDate: renewalDate
    }
  } catch (error) {
      console.error(`[Stripe] Error syncing subscription from Stripe for user ${userId} (attempt ${attempt}):`, error)
      if (attempt === retries) {
    return { synced: false, error: error.message }
  }
    }
  }
  return { synced: false, reason: 'Retries exhausted' }
}

// Async version that syncs with Stripe before denying access
const checkSubscriptionStatusAsync = async (userId) => {
  const result = await checkSubscriptionStatus(userId)
  
  // If access is granted, return immediately
  if (result.hasAccess) return result
  
  // If access denied and user has a Stripe customer ID, sync from Stripe before final denial
  const user = await db.users.get(userId)
  if (user && user.stripeCustomerId) {
    console.log(`[Subscription Check] Access denied locally for ${userId}, syncing from Stripe before final denial...`)
    const syncResult = await syncSubscriptionFromStripe(userId, 1)
    if (syncResult.synced && (syncResult.status === 'active' || syncResult.status === 'trialing')) {
      console.log(`[Subscription Check] Stripe sync restored access for ${userId}: ${syncResult.status}`)
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
