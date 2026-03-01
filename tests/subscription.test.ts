import { describe, it, expect, vi, beforeEach } from 'vitest'
import db from '../database/db.js'
import adminDb from '../database/adminDb.js'

const mockDb = vi.mocked(db)
const mockAdminDb = vi.mocked(adminDb)

describe('checkSubscriptionStatus', () => {
  let checkSubscriptionStatus: typeof import('../server/services/subscription.js').checkSubscriptionStatus
  let usageExhaustedEmailsSent: typeof import('../server/services/subscription.js').usageExhaustedEmailsSent

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../server/services/subscription.js')
    checkSubscriptionStatus = mod.checkSubscriptionStatus
    usageExhaustedEmailsSent = mod.usageExhaustedEmailsSent
    usageExhaustedEmailsSent.clear()
  })

  it('denies access when no userId provided', async () => {
    const result = await checkSubscriptionStatus(undefined)
    expect(result.hasAccess).toBe(false)
    expect(result.reason).toContain('No user ID')
  })

  it('grants access to admins regardless of subscription', async () => {
    mockAdminDb.admins.isAdmin.mockResolvedValue(true as any)
    const result = await checkSubscriptionStatus('admin-user')
    expect(result.hasAccess).toBe(true)
  })

  it('denies access when user not found', async () => {
    mockAdminDb.admins.isAdmin.mockResolvedValue(false as any)
    mockDb.users.get.mockResolvedValue(null)
    const result = await checkSubscriptionStatus('missing-user')
    expect(result.hasAccess).toBe(false)
    expect(result.reason).toContain('User not found')
  })

  it('grants access for active subscription within renewal date', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    mockAdminDb.admins.isAdmin.mockResolvedValue(false as any)
    mockDb.users.get.mockResolvedValue({
      _id: 'user-1',
      subscriptionStatus: 'active',
      subscriptionRenewalDate: futureDate,
      plan: 'pro',
      stripeSubscriptionId: 'sub_123',
    } as any)
    mockDb.userStats.get.mockResolvedValue({ monthlyUsageCost: {} } as any)
    mockDb.usage.getOrDefault.mockResolvedValue({ purchasedCredits: { remaining: 0 } } as any)

    const result = await checkSubscriptionStatus('user-1')
    expect(result.hasAccess).toBe(true)
  })

  it('denies access when subscription has expired', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    mockAdminDb.admins.isAdmin.mockResolvedValue(false as any)
    mockDb.users.get.mockResolvedValue({
      _id: 'user-1',
      subscriptionStatus: 'active',
      subscriptionRenewalDate: pastDate,
    } as any)

    const result = await checkSubscriptionStatus('user-1')
    expect(result.hasAccess).toBe(false)
    expect(result.reason).toContain('expired')
  })

  it('denies access when usage exceeds plan allocation', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    mockAdminDb.admins.isAdmin.mockResolvedValue(false as any)
    mockDb.users.get.mockResolvedValue({
      _id: 'user-1',
      subscriptionStatus: 'active',
      subscriptionRenewalDate: futureDate,
      plan: 'pro',
      stripeSubscriptionId: 'sub_123',
    } as any)

    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    mockDb.userStats.get.mockResolvedValue({
      monthlyUsageCost: { [currentMonth]: 10.00 },
    } as any)
    mockDb.usage.getOrDefault.mockResolvedValue({ purchasedCredits: { remaining: 0 } } as any)

    const result = await checkSubscriptionStatus('user-1')
    expect(result.hasAccess).toBe(false)
    expect(result.usageExhausted).toBe(true)
  })

  it('grants access when purchased credits cover overage', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    mockAdminDb.admins.isAdmin.mockResolvedValue(false as any)
    mockDb.users.get.mockResolvedValue({
      _id: 'user-1',
      subscriptionStatus: 'active',
      subscriptionRenewalDate: futureDate,
      plan: 'pro',
      stripeSubscriptionId: 'sub_123',
    } as any)

    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    mockDb.userStats.get.mockResolvedValue({
      monthlyUsageCost: { [currentMonth]: 9.00 },
    } as any)
    mockDb.usage.getOrDefault.mockResolvedValue({ purchasedCredits: { remaining: 5.00 } } as any)

    const result = await checkSubscriptionStatus('user-1')
    expect(result.hasAccess).toBe(true)
  })

  it('grants access for canceled user within paid period', async () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    mockAdminDb.admins.isAdmin.mockResolvedValue(false as any)
    mockDb.users.get.mockResolvedValue({
      _id: 'user-1',
      subscriptionStatus: 'canceled',
      subscriptionRenewalDate: futureDate,
    } as any)

    const result = await checkSubscriptionStatus('user-1')
    expect(result.hasAccess).toBe(true)
  })

  it('denies access for canceled user past paid period', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    mockAdminDb.admins.isAdmin.mockResolvedValue(false as any)
    mockDb.users.get.mockResolvedValue({
      _id: 'user-1',
      subscriptionStatus: 'canceled',
      subscriptionRenewalDate: pastDate,
    } as any)

    const result = await checkSubscriptionStatus('user-1')
    expect(result.hasAccess).toBe(false)
    expect(result.reason).toContain('canceled')
  })

  it('grants access for paused user within paid period', async () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    mockAdminDb.admins.isAdmin.mockResolvedValue(false as any)
    mockDb.users.get.mockResolvedValue({
      _id: 'user-1',
      subscriptionStatus: 'paused',
      subscriptionRenewalDate: futureDate,
    } as any)

    const result = await checkSubscriptionStatus('user-1')
    expect(result.hasAccess).toBe(true)
  })

  it('denies access for inactive status', async () => {
    mockAdminDb.admins.isAdmin.mockResolvedValue(false as any)
    mockDb.users.get.mockResolvedValue({
      _id: 'user-1',
      subscriptionStatus: 'inactive',
    } as any)

    const result = await checkSubscriptionStatus('user-1')
    expect(result.hasAccess).toBe(false)
  })

  it('returns usageExhausted for free plan when budget exceeded', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    mockAdminDb.admins.isAdmin.mockResolvedValue(false as any)
    mockDb.users.get.mockResolvedValue({
      _id: 'user-1',
      subscriptionStatus: 'trialing',
      subscriptionRenewalDate: futureDate,
      plan: 'free_trial',
    } as any)

    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    mockDb.userStats.get.mockResolvedValue({
      monthlyUsageCost: { [currentMonth]: 2.00 },
    } as any)
    mockDb.usage.getOrDefault.mockResolvedValue({ purchasedCredits: { remaining: 0 } } as any)

    const result = await checkSubscriptionStatus('user-1')
    expect(result.hasAccess).toBe(false)
    expect(result.usageExhausted).toBe(true)
    expect(result.planType).toBe('free')
  })
})
