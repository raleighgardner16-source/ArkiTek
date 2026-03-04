import { describe, it, expect } from 'vitest'
import {
  usersSchema,
  weeklyLeaderboardSchema,
  metadataSchema,
  adminsSchema,
  expensesSchema,
} from '../database/schema.js'

describe('database schemas', () => {
  describe('usersSchema', () => {
    it('defines _id as string', () => {
      expect(usersSchema._id).toBe('string')
    })

    it('defines email as string', () => {
      expect(usersSchema.email).toBe('string')
    })

    it('defines password as string', () => {
      expect(usersSchema.password).toBe('string')
    })

    it('has subscription fields', () => {
      expect(usersSchema).toHaveProperty('subscriptionStatus')
      expect(usersSchema).toHaveProperty('stripeCustomerId')
    })

    it('has profile fields', () => {
      expect(usersSchema).toHaveProperty('firstName')
      expect(usersSchema).toHaveProperty('username')
    })
  })

  describe('weeklyLeaderboardSchema', () => {
    it('has required fields', () => {
      expect(weeklyLeaderboardSchema).toHaveProperty('weekStart')
      expect(weeklyLeaderboardSchema).toHaveProperty('providerRankings')
      expect(weeklyLeaderboardSchema).toHaveProperty('finalized')
    })
  })

  describe('metadataSchema', () => {
    it('has _id field', () => {
      expect(metadataSchema).toHaveProperty('_id')
    })
  })

  describe('adminsSchema', () => {
    it('has _id and adminIds fields', () => {
      expect(adminsSchema).toHaveProperty('_id')
      expect(adminsSchema).toHaveProperty('admins')
    })
  })

  describe('expensesSchema', () => {
    it('has cost-tracking fields', () => {
      expect(expensesSchema).toHaveProperty('_id')
    })
  })
})
