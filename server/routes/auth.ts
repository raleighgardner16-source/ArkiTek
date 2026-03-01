import { Router, type Request, type Response } from 'express'
import crypto from 'crypto'
import db from '../../database/db.js'
import adminDb from '../../database/adminDb.js'
import { stripe, resend, APP_NAME, FROM_EMAIL, APP_URL, MAX_FREE_TRIALS_PER_IP } from '../config/index.js'
import { hashPassword, verifyPassword, generateToken, canonicalizeEmail, isDisposableEmail } from '../helpers/auth.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { getMonthForUser } from '../helpers/date.js'
import { getUserTimezone } from '../services/usage.js'
import { getPlanAllocation } from '../helpers/pricing.js'
import { sendSuccess, sendError } from '../types/api.js'

const router = Router()

const passwordResetTokens = new Map()
const emailVerificationTokens = new Map()

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

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, username, email: rawEmail, password, plan, fingerprint, timezone } = req.body

    if (!firstName || !lastName || !username || !rawEmail || !password) {
      return sendError(res, 'All fields are required', 400)
    }

    const isFreeTrial = plan === 'free_trial'
    const isPremium = plan === 'premium'

    if (password.length < 8) {
      return sendError(res, 'Password must be at least 8 characters', 400)
    }

    // Normalize email to prevent case-sensitivity issues (e.g. "Test@Gmail.COM" vs "test@gmail.com")
    const email = rawEmail.toLowerCase().trim()
    // Canonicalize email to detect alias abuse (e.g. john+trial1@gmail.com → john@gmail.com)
    const canonical = canonicalizeEmail(email)

    console.log('[Auth] Signup attempt for username:', username, '| plan:', plan)

    // ==================== FREE TRIAL ABUSE PREVENTION ====================
    if (isFreeTrial) {
      // 1. Block disposable/temporary email domains (mailinator, guerrillamail, etc.)
      if (isDisposableEmail(email)) {
        console.log('[Auth] ❌ Blocked disposable email:', email)
        return sendError(res, 'Please use a permanent email address to sign up. Temporary email services are not allowed.', 400)
      }

      // 2. Check canonical email — block only if ACTIVE user exists (deleted users in used_trials can re-signup with reduced allocation)
      const existingCanonical: any = await db.users.getByCanonicalEmail(canonical)
      if (existingCanonical && existingCanonical.plan === 'free_trial' && existingCanonical.username) {
        // Active user (has username) — block
        console.log('[Auth] ❌ Canonical email already has active free plan:', canonical)
        return sendError(res, 'A free plan account already exists with this email address.', 400)
      }

      // 3. IP-based rate limiting — max N free plan signups per IP (allows shared households)
      const signupIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
      const trialCountFromIp = await db.users.countFreeTrialsByIp(signupIp)
      if (trialCountFromIp >= MAX_FREE_TRIALS_PER_IP) {
        console.log(`[Auth] ❌ IP ${signupIp} exceeded free plan limit (${trialCountFromIp}/${MAX_FREE_TRIALS_PER_IP})`)
        return sendError(res, 'Free plan limit reached for this network. You\'ve already used the free plan on this device or network. Please subscribe to a Pro plan to continue.', 400)
      }

      // 4. Device fingerprint — no longer blocks; returning users can re-signup and get remaining allocation back
    }

    // ==================== STANDARD DUPLICATE CHECKS ====================
    const existingUser = await db.users.getByUsername(username)
    if (existingUser) {
      return sendError(res, 'Username already exists', 400)
    }
    
    const existingEmail = await db.users.getByEmail(email)
    if (existingEmail) {
      return sendError(res, 'Email already registered', 400)
    }

    // ==================== CREATE USER ====================
    const hashedPassword = await hashPassword(password)
    const userId = crypto.randomUUID()
    const signupIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
    
    // Both free plan and pro start as pending_verification (must verify email first)
    // Free plan: pending_verification → trialing (after email verified, $1.00/month allocation)
    // Pro: pending_verification → inactive (after email verified) → active (after payment)
    const initialStatus = 'pending_verification'
    
    await db.users.create(userId, {
      email,
      canonicalEmail: canonical,
      password: hashedPassword,
      firstName,
      lastName,
      username,
      subscriptionStatus: initialStatus,
      signupIp,
      deviceFingerprint: fingerprint || null,
      emailVerified: false,
      plan: isFreeTrial ? 'free_trial' : (isPremium ? 'premium' : 'pro'),
      timezone: timezone || null,
    })
    console.log('[Auth] User created in MongoDB:', userId, '| status:', initialStatus)

    // Create usage_data and user_stats docs in MongoDB
    await db.usage.create(userId, {})
    await db.userStats.getOrCreate(userId)

    // Returning free trial user: apply carried-over remaining allocation (not full $1)
    let returningUserMessage: string | null = null
    if (isFreeTrial) {
      const usedTrialRecord = await db.users.getUsedTrialForReturningUser(canonical, fingerprint || null, signupIp)
      if (usedTrialRecord && (usedTrialRecord.remainingAllocation ?? 0) > 0) {
        const remaining = Math.max(0, Math.min(1, usedTrialRecord.remainingAllocation ?? 0))
        const tz = timezone || 'America/New_York'
        const currentMonth = getMonthForUser(tz)
        const prechargedCost = Math.max(0, 1.00 - remaining)
        await db.userStats.addMonthlyCost(userId, currentMonth, prechargedCost)
        returningUserMessage = `Welcome back! Your remaining $${remaining.toFixed(2)} from when you left has been restored.`
        console.log(`[Auth] Returning free trial user: applied $${remaining.toFixed(2)} remaining (precharged $${prechargedCost.toFixed(2)})`)
      }
    }

    // ==================== EMAIL VERIFICATION (all plans) ====================
    // Both free plan AND pro plans require email verification before proceeding
    const verifyToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Store token in memory + MongoDB
    emailVerificationTokens.set(verifyToken, { userId, email, expiresAt })
    try {
      await db.emailVerifications.create({
        token: verifyToken,
        userId,
        email,
        expiresAt,
        createdAt: new Date(),
        used: false,
      })
    } catch (dbErr) {
      console.error('[Auth] Error saving verification token to DB:', dbErr)
    }

    // Send verification email
    const verifyLink = `${APP_URL}/verify-email?token=${verifyToken}`
    const emailPurpose = isFreeTrial
      ? 'Please verify your email address to activate your free plan.'
      : 'Please verify your email address to complete your account setup.'
    try {
      if (resend) {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: `${APP_NAME} — Verify Your Email`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
              <h2 style="color: #333; margin-bottom: 24px;">Verify Your Email</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                Hi ${firstName},
              </p>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                Thanks for signing up for ${APP_NAME}! ${emailPurpose}
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${verifyLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #5dade2, #48c9b0); color: #000; font-weight: bold; font-size: 16px; text-decoration: none; border-radius: 8px;">
                  Verify Email Address
                </a>
              </div>
              <p style="color: #888; font-size: 14px; line-height: 1.6;">
                This link expires in 24 hours. If the button doesn't work, copy and paste this link:
              </p>
              <p style="color: #5dade2; font-size: 13px; word-break: break-all;">
                ${verifyLink}
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
              <p style="color: #999; font-size: 13px;">
                If you didn't sign up for ${APP_NAME}, you can safely ignore this email.
              </p>
            </div>
          `,
        })
        console.log('[Auth] Verification email sent to:', email)
      } else {
        console.warn('[Auth] Resend not configured — verification email NOT sent. Token:', `${verifyToken.substring(0, 8)  }...`)
      }
    } catch (emailErr) {
      console.error('[Auth] Failed to send verification email:', emailErr)
      // Don't fail signup — user can resend verification later
    }

    const signupMessage = isFreeTrial
      ? 'Account created! Please check your email to verify your account and activate your free plan.'
      : 'Account created! Please check your email to verify your account.'

    return sendSuccess(res, {
      requiresVerification: true,
      message: signupMessage,
      returningUserMessage: returningUserMessage || undefined,
      user: {
        id: userId,
        firstName,
        lastName,
        username,
        email,
        subscriptionStatus: 'pending_verification',
        subscriptionRenewalDate: null,
        plan: isFreeTrial ? 'free_trial' : (isPremium ? 'premium' : 'pro'),
        emailVerified: false,
      },
    })
  } catch (error: any) {
    console.error('[Auth] Signup error:', error)
    sendError(res, 'An error occurred during signup. Please try again.')
  }
})

router.post('/signin', async (req: Request, res: Response) => {
  try {
    const { username, password, timezone } = req.body

    if (!username || !password) {
      return sendError(res, 'Username and password are required', 400)
    }

    // Get user from MongoDB by username field (not _id)
    const dbUser: any = await db.users.getByUsername(username)
    
    if (!dbUser) {
      console.log('[Auth] User not found in MongoDB:', username)
      return sendError(res, 'Username not found. Please check your username or sign up.', 401)
    }

    const { valid, needsRehash } = await verifyPassword(password, dbUser.password)

    if (!valid) {
      console.log('[Auth] Password mismatch for user:', username)
      return sendError(res, 'Invalid password. Please check your password and try again.', 401)
    }

    // Use the actual _id (UUID for new users, username for legacy users)
    const userId = dbUser._id

    // Lazily migrate legacy SHA-256 hashes to bcrypt
    if (needsRehash) {
      const bcryptHash = await hashPassword(password)
      await db.users.update(userId, { password: bcryptHash })
      console.log('[Auth] Migrated password hash to bcrypt for user:', username)
    }

    // Update last active and timezone in MongoDB
    const loginDate = new Date()
    const updateFields: any = { lastActiveAt: loginDate }
    if (timezone) updateFields.timezone = timezone
    await db.users.update(userId, updateFields)
    
    console.log('[Auth] Successful sign in for user:', username, '(id:', userId, ')')
    
    // Check if this user still needs email verification
    const needsVerification = dbUser.subscriptionStatus === 'pending_verification' && !dbUser.emailVerified

    const token = generateToken(userId)
    
    sendSuccess(res, {
      requiresVerification: needsVerification,
      token,
      user: {
        id: dbUser._id,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        username: dbUser.username,
        email: dbUser.email,
        subscriptionStatus: dbUser.subscriptionStatus || 'inactive',
        subscriptionRenewalDate: dbUser.subscriptionRenewalDate || null,
        stripeSubscriptionId: dbUser.stripeSubscriptionId || null,
        emailVerified: dbUser.emailVerified || false,
        plan: dbUser.plan || null,
        modelPreferences: dbUser.modelPreferences || null,
      },
    })
  } catch (error: any) {
    console.error('[Auth] Sign in error:', error)
    sendError(res, 'An error occurred during sign in. Please try again.')
  }
})

router.post('/update-timezone', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { timezone } = req.body
    if (!userId || !timezone) {
      return sendError(res, 'Authentication and timezone are required', 400)
    }
    await db.users.update(userId, { timezone })
    sendSuccess(res, {})
  } catch (error: any) {
    console.error('[Auth] Update timezone error:', error)
    sendError(res, 'Failed to update timezone')
  }
})

// ============================================================================
// FORGOT USERNAME / FORGOT PASSWORD
// ============================================================================

router.post('/forgot-username', async (req: Request, res: Response) => {
  try {
    const { email } = req.body
    if (!email) {
      return sendError(res, 'Email is required', 400)
    }

    console.log('[Auth] Forgot username request for email:', email)

    // Look up user by email
    const dbUser: any = await db.users.getByEmail(email.toLowerCase().trim())

    // Always return success (don't reveal whether the email exists)
    if (!dbUser) {
      console.log('[Auth] No user found for email:', email)
      return sendSuccess(res, { message: 'If an account exists with that email, your username has been sent.' })
    }

    // Send email with username
    try {
      if (!resend) {
        console.error('[Auth] Resend not configured — cannot send email')
        return sendError(res, 'Email service not configured')
      }
      await resend.emails.send({
        from: FROM_EMAIL,
        to: dbUser.email,
        subject: `${APP_NAME} — Your Username`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #333; margin-bottom: 24px;">Username Reminder</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Hi ${dbUser.firstName || 'there'},
            </p>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              You requested your username for your ${APP_NAME} account. Here it is:
            </p>
            <div style="background: #f0f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
              <p style="font-size: 24px; font-weight: bold; color: #1a1a2e; margin: 0;">${dbUser.username}</p>
            </div>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              If you didn't request this, you can safely ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="color: #999; font-size: 13px;">
              This email was sent by ${APP_NAME}. Please do not reply to this email.
            </p>
          </div>
        `,
      })
      console.log('[Auth] Username reminder email sent to:', dbUser.email)
    } catch (emailErr) {
      console.error('[Auth] Failed to send username email:', emailErr)
      return sendError(res, 'Failed to send email. Please try again later.')
    }

    sendSuccess(res, { message: 'If an account exists with that email, your username has been sent.' })
  } catch (error: any) {
    console.error('[Auth] Forgot username error:', error)
    sendError(res, 'An error occurred. Please try again.')
  }
})

router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body
    if (!email) {
      return sendError(res, 'Email is required', 400)
    }

    console.log('[Auth] Forgot password request for email:', email)

    const dbUser: any = await db.users.getByEmail(email.toLowerCase().trim())

    // Always return success (don't reveal whether the email exists)
    if (!dbUser) {
      console.log('[Auth] No user found for email:', email)
      return sendSuccess(res, { message: 'If an account exists with that email, a reset link has been sent.' })
    }

    // Generate a secure random token (64 hex chars)
    const resetToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

    // Store token in memory and MongoDB
    passwordResetTokens.set(resetToken, {
      userId: dbUser._id,
      email: dbUser.email,
      expiresAt,
    })

    // Also persist to MongoDB (in case server restarts)
    try {
      await db.passwordResets.create({
        token: resetToken,
        userId: dbUser._id,
        email: dbUser.email,
        expiresAt,
        createdAt: new Date(),
        used: false,
      })
    } catch (dbErr) {
      console.error('[Auth] Error persisting reset token to DB:', dbErr)
      // Continue anyway — in-memory token still works
    }

    // Build the reset link (frontend will handle the #reset-password route)
    const resetLink = `${APP_URL}/reset-password?token=${resetToken}`

    // Send email with reset link
    try {
      if (!resend) {
        console.error('[Auth] Resend not configured — cannot send email')
        return sendError(res, 'Email service not configured')
      }
      await resend.emails.send({
        from: FROM_EMAIL,
        to: dbUser.email,
        subject: `${APP_NAME} — Reset Your Password`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #333; margin-bottom: 24px;">Reset Your Password</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Hi ${dbUser.firstName || 'there'},
            </p>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              We received a request to reset the password for your ${APP_NAME} account (<strong>${dbUser.username}</strong>).
            </p>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #5dade2, #48c9b0); color: #000; font-weight: bold; font-size: 16px; text-decoration: none; border-radius: 8px;">
                Reset Password
              </a>
            </div>
            <p style="color: #888; font-size: 14px; line-height: 1.6;">
              If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="color: #5dade2; font-size: 13px; word-break: break-all;">
              ${resetLink}
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="color: #999; font-size: 13px;">
              If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
            <p style="color: #999; font-size: 13px;">
              This email was sent by ${APP_NAME}. Please do not reply to this email.
            </p>
          </div>
        `,
      })
      console.log('[Auth] Password reset email sent to:', dbUser.email)
    } catch (emailErr) {
      console.error('[Auth] Failed to send reset email:', emailErr)
      return sendError(res, 'Failed to send email. Please try again later.')
    }

    sendSuccess(res, { message: 'If an account exists with that email, a reset link has been sent.' })
  } catch (error: any) {
    console.error('[Auth] Forgot password error:', error)
    sendError(res, 'An error occurred. Please try again.')
  }
})

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return sendError(res, 'Token and new password are required', 400)
    }

    if (newPassword.length < 8) {
      return sendError(res, 'Password must be at least 8 characters', 400)
    }

    console.log('[Auth] Password reset attempt with token:', `${token.substring(0, 8)  }...`)

    // Check in-memory first
    let tokenData = passwordResetTokens.get(token)

    // If not in memory, check MongoDB (server may have restarted)
    if (!tokenData) {
      try {
        const dbToken = await db.passwordResets.findByToken(token)
        if (dbToken) {
          tokenData = {
            userId: dbToken.userId,
            email: dbToken.email,
            expiresAt: dbToken.expiresAt,
          }
        }
      } catch (dbErr) {
        console.error('[Auth] Error checking reset token in DB:', dbErr)
      }
    }

    if (!tokenData) {
      return sendError(res, 'Invalid or expired reset link. Please request a new one.', 400)
    }

    // Check if token has expired
    if (new Date() > new Date(tokenData.expiresAt)) {
      // Clean up expired token
      passwordResetTokens.delete(token)
      try {
        await db.passwordResets.deleteByToken(token)
      } catch (dbErr) { /* ignore cleanup errors */ }
      return sendError(res, 'This reset link has expired. Please request a new one.', 400)
    }

    // Update the password
    const hashedPassword = await hashPassword(newPassword)
    const userId = tokenData.userId

    // Update in MongoDB
    await db.users.update(userId, { password: hashedPassword })

    // Invalidate the token (single-use)
    passwordResetTokens.delete(token)
    try {
      await db.passwordResets.markUsed(token)
    } catch (dbErr) {
      console.error('[Auth] Error marking token as used:', dbErr)
    }

    console.log('[Auth] Password successfully reset for user:', userId)
    sendSuccess(res, { message: 'Your password has been reset. You can now sign in with your new password.' })
  } catch (error: any) {
    console.error('[Auth] Reset password error:', error)
    sendError(res, 'An error occurred. Please try again.')
  }
})

// Cleanup expired reset tokens (runs every hour)
setInterval(async () => {
  const now = new Date()
  let cleaned = 0
  for (const [token, data] of passwordResetTokens.entries()) {
    if (now > new Date(data.expiresAt)) {
      passwordResetTokens.delete(token)
      cleaned++
    }
  }
  // Also clean MongoDB
  try {
    const deletedCount = await db.passwordResets.deleteExpiredAndUsed()
    cleaned += deletedCount
  } catch (err) { /* ignore cleanup errors */ }
  if (cleaned > 0) console.log(`[Auth] Cleaned up ${cleaned} expired/used reset tokens`)
  
  // Also clean email verification tokens
  let emailCleaned = 0
  for (const [token, data] of emailVerificationTokens.entries()) {
    if (now > new Date(data.expiresAt)) {
      emailVerificationTokens.delete(token)
      emailCleaned++
    }
  }
  try {
    const deletedCount = await db.emailVerifications.deleteExpiredAndUsed()
    emailCleaned += deletedCount
  } catch (err) { /* ignore cleanup errors */ }
  if (emailCleaned > 0) console.log(`[Auth] Cleaned up ${emailCleaned} expired/used email verification tokens`)
}, 60 * 60 * 1000) // Every hour

// ============================================================================
// EMAIL VERIFICATION
// ============================================================================

router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body

    if (!token) {
      return sendError(res, 'Verification token is required', 400)
    }

    console.log('[Auth] Email verification attempt with token:', `${token.substring(0, 8)  }...`)

    // Check in-memory first
    let tokenData = emailVerificationTokens.get(token)

    // If not in memory, check MongoDB (server may have restarted)
    if (!tokenData) {
      try {
        const dbToken = await db.emailVerifications.findByToken(token)
        if (dbToken) {
          tokenData = {
            userId: dbToken.userId,
            email: dbToken.email,
            expiresAt: dbToken.expiresAt,
          }
        }
      } catch (dbErr) {
        console.error('[Auth] Error checking verification token in DB:', dbErr)
      }
    }

    if (!tokenData) {
      return sendError(res, 'Invalid or expired verification link. Please request a new one.', 400)
    }

    // Check if token has expired
    if (new Date() > new Date(tokenData.expiresAt)) {
      emailVerificationTokens.delete(token)
      try {
        await db.emailVerifications.deleteByToken(token)
      } catch (dbErr) { /* ignore cleanup errors */ }
      return sendError(res, 'This verification link has expired. Please request a new one.', 400)
    }

    const userId = tokenData.userId

    // Get the user to check their plan
    const dbUser: any = await db.users.get(userId)
    if (!dbUser) {
      return sendError(res, 'User not found.', 400)
    }

    const isFreeTrial = dbUser.plan === 'free_trial'

    if (isFreeTrial) {
      // FREE PLAN: Email verified → activate immediately with $1.00/month recurring allocation (no one-time credits)

      await db.users.update(userId, {
        emailVerified: true,
        subscriptionStatus: 'trialing',
        subscriptionStartedDate: new Date(),
      })

      // Invalidate the token (single-use)
      emailVerificationTokens.delete(token)
      try {
        await db.emailVerifications.markUsed(token)
      } catch (dbErr) {
        console.error('[Auth] Error marking verification token as used:', dbErr)
      }

      console.log('[Auth] ✅ Email verified + free plan activated for user:', userId)
      const authToken = generateToken(userId)
      sendSuccess(res, {
        token: authToken,
        message: 'Email verified! Your free plan is now active.',
        user: {
          id: dbUser._id,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          username: dbUser.username,
          email: dbUser.email,
          subscriptionStatus: 'trialing',
          subscriptionRenewalDate: null,
          stripeSubscriptionId: null,
          emailVerified: true,
          plan: 'free_trial',
          modelPreferences: dbUser.modelPreferences || null,
        },
      })
    } else {
      // PAID PLAN (Pro or Premium): Email verified → go to payment (status becomes inactive)
      const userPlan = dbUser.plan || 'pro'
      await db.users.update(userId, {
        emailVerified: true,
        subscriptionStatus: 'inactive',
      })

      // Invalidate the token (single-use)
      emailVerificationTokens.delete(token)
      try {
        await db.emailVerifications.markUsed(token)
      } catch (dbErr) {
        console.error('[Auth] Error marking verification token as used:', dbErr)
      }

      console.log(`[Auth] ✅ Email verified for ${userPlan} user (ready for payment):`, userId)
      const authToken = generateToken(userId)
      sendSuccess(res, {
        token: authToken,
        message: 'Email verified! Setting up your account...',
        user: {
          id: dbUser._id,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          username: dbUser.username,
          email: dbUser.email,
          subscriptionStatus: 'inactive',
          subscriptionRenewalDate: null,
          stripeSubscriptionId: null,
          emailVerified: true,
          plan: userPlan,
          modelPreferences: dbUser.modelPreferences || null,
        },
      })
    }
  } catch (error: any) {
    console.error('[Auth] Email verification error:', error)
    sendError(res, 'An error occurred. Please try again.')
  }
})

// Check verification status — used by the verification-pending page to poll for completion
// When email is verified, returns full user data so the client can auto-login
router.post('/check-verification', async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId || req.userId

    if (!userId) {
      return sendError(res, 'User ID is required', 400)
    }

    const dbUser: any = await db.users.get(userId)
    if (!dbUser) {
      return sendError(res, 'User not found', 404)
    }

    // If email is not yet verified, return pending status
    if (!dbUser.emailVerified || dbUser.subscriptionStatus === 'pending_verification') {
      return sendSuccess(res, { verified: false })
    }

    // Email is verified — return full user data for auto-login
    console.log('[Auth] Verification poll: user', userId, 'is verified, returning user data for auto-login')

    await db.users.update(userId, { lastActiveAt: new Date() })

    const token = generateToken(userId)
    sendSuccess(res, {
      verified: true,
      token,
      user: {
        id: dbUser._id,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        username: dbUser.username,
        email: dbUser.email,
        subscriptionStatus: dbUser.subscriptionStatus || 'inactive',
        subscriptionRenewalDate: dbUser.subscriptionRenewalDate || null,
        stripeSubscriptionId: dbUser.stripeSubscriptionId || null,
        emailVerified: dbUser.emailVerified || false,
        plan: dbUser.plan || null,
        modelPreferences: dbUser.modelPreferences || null,
      },
    })
  } catch (error: any) {
    console.error('[Auth] Check verification error:', error)
    sendError(res, 'An error occurred. Please try again.')
  }
})

router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const { userId, email } = req.body

    if (!userId && !email) {
      return sendError(res, 'userId or email is required', 400)
    }

    // Find the user
    let user: any
    if (userId) {
      user = await db.users.get(userId)
    } else {
      user = await db.users.getByEmail(email.toLowerCase().trim())
    }

    if (!user) {
      // Don't reveal whether user exists
      return sendSuccess(res, { message: 'If an account exists, a new verification email has been sent.' })
    }

    // Only resend for users pending verification
    if (user.emailVerified || user.subscriptionStatus !== 'pending_verification') {
      return sendError(res, 'This account is already verified.', 400)
    }

    // Rate limit: max 1 resend per 2 minutes
    const recentToken = await db.emailVerifications.findRecentForUser(user._id, 2 * 60 * 1000)
    if (recentToken) {
      return sendError(res, 'Please wait a couple minutes before requesting another verification email.', 429)
    }

    // Invalidate old tokens for this user
    await db.emailVerifications.invalidateForUser(user._id)

    // Generate new token
    const verifyToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    emailVerificationTokens.set(verifyToken, { userId: user._id, email: user.email, expiresAt })
    await db.emailVerifications.create({
      token: verifyToken,
      userId: user._id,
      email: user.email,
      expiresAt,
      createdAt: new Date(),
      used: false,
    })

    // Send verification email
    const verifyLink = `${APP_URL}/verify-email?token=${verifyToken}`
    if (resend) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject: `${APP_NAME} — Verify Your Email`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #333; margin-bottom: 24px;">Verify Your Email</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Hi ${user.firstName || 'there'},
            </p>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Here's a new verification link for your ${APP_NAME} account.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verifyLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #5dade2, #48c9b0); color: #000; font-weight: bold; font-size: 16px; text-decoration: none; border-radius: 8px;">
                Verify Email Address
              </a>
            </div>
            <p style="color: #888; font-size: 14px;">This link expires in 24 hours.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="color: #999; font-size: 13px;">
              If you didn't sign up for ${APP_NAME}, you can safely ignore this email.
            </p>
          </div>
        `,
      })
      console.log('[Auth] Resent verification email to:', user.email)
    }

    sendSuccess(res, { message: 'A new verification email has been sent.' })
  } catch (error: any) {
    console.error('[Auth] Resend verification error:', error)
    sendError(res, 'An error occurred. Please try again.')
  }
})

// ============================================================================
// ACCOUNT DELETION
// ============================================================================

router.delete('/account', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId

    if (!userId) {
      return sendError(res, 'Authentication required', 401)
    }

    console.log('[Account Deletion] Received delete request for user:', userId)

    // Check if user exists in MongoDB
    const dbUser: any = await db.users.get(userId)
    if (!dbUser) {
      console.log('[Account Deletion] User not found in MongoDB:', userId)
      return sendError(res, 'User not found', 404)
    }

    // Store user info for logging before deletion
    const userInfo = { username: dbUser.username, email: dbUser.email }

    // Preserve free plan abuse prevention data before deletion (email, IP, fingerprint + remaining allocation)
    if (dbUser.plan === 'free_trial') {
      let remainingAllocation = 0
      try {
        const tz = await getUserTimezone(userId)
        const deletionMonth = getMonthForUser(tz)
        const userStatsDoc: any = await db.userStats.get(userId)
        const monthlyCost = userStatsDoc?.monthlyUsageCost?.[deletionMonth] || 0
        remainingAllocation = Math.max(0, 1.00 - monthlyCost)
        await db.users.recordUsedTrial({
          canonicalEmail: dbUser.canonicalEmail || dbUser.email,
          email: dbUser.email,
          signupIp: dbUser.signupIp || null,
          deviceFingerprint: dbUser.deviceFingerprint || null,
          remainingAllocation: Math.round(remainingAllocation * 100) / 100,
          deletionMonth,
        })
        console.log(`[Account Deletion] Recorded used free plan: ${dbUser.email}, remaining: $${remainingAllocation.toFixed(2)}`)
      } catch (err) {
        console.error('[Account Deletion] Error recording used trial:', err)
        await db.users.recordUsedTrial({
          canonicalEmail: dbUser.canonicalEmail || dbUser.email,
          email: dbUser.email,
          signupIp: dbUser.signupIp || null,
          deviceFingerprint: dbUser.deviceFingerprint || null,
          remainingAllocation: 0,
        })
      }
    }

    // Cancel Stripe subscription if active
    if (dbUser.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(dbUser.stripeSubscriptionId)
        console.log(`[Account Deletion] Stripe subscription canceled for user: ${userId}`)
      } catch (stripeError: any) {
        console.error('[Account Deletion] Error canceling Stripe subscription (may already be canceled):', stripeError.message)
      }
    }

    // Delete the Stripe customer record entirely (removes from Stripe dashboard)
    if (dbUser.stripeCustomerId) {
      try {
        await stripe.customers.del(dbUser.stripeCustomerId)
        console.log(`[Account Deletion] Stripe customer deleted for user: ${userId}`)
      } catch (stripeError: any) {
        console.error('[Account Deletion] Error deleting Stripe customer:', stripeError.message)
      }
    }

    // Delete user and ALL associated data from MongoDB (covers every collection)
    await db.users.delete(userId)
    console.log('[Account Deletion] User and all data deleted from MongoDB:', userId, userInfo)

    // Purge all user traces from leaderboard (posts, likes, comments, replies)
    await purgeUserFromLeaderboard(userId)
    console.log('[Account Deletion] User purged from leaderboard cache and MongoDB')

    // Increment deleted users count
    await incrementDeletedUsers()
    console.log('[Account Deletion] Deleted users count incremented')
    
    console.log('[Account Deletion] Account completely removed from MongoDB')
    sendSuccess(res, { message: 'Account deleted successfully' })
  } catch (error: any) {
    console.error('[Account Deletion] Error deleting account:', error)
    sendError(res, 'Failed to delete account')
  }
})

export default router
