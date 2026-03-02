/**
 * TypeScript interfaces for all MongoDB document shapes.
 *
 * These correspond 1-to-1 with the collections documented in schema.ts
 * and are used as generic type parameters on MongoDB collection accessors
 * throughout the db / adminDb modules.
 */

import type { ObjectId } from 'mongodb'

// ============================================================================
// ARKITEK DATABASE — Core entities
// ============================================================================

export interface UserDoc {
  _id: string
  email: string
  canonicalEmail: string
  password: string | null
  firstName: string | null
  lastName: string | null
  username: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  subscriptionStatus: 'active' | 'canceled' | 'paused' | 'past_due' | 'inactive' | 'trialing' | 'pending_verification' | 'incomplete' | string
  subscriptionRenewalDate: Date | string | null
  subscriptionStartedDate?: Date | string | null
  subscriptionPausedDate?: Date | string | null
  createdAt: Date | string
  lastActiveAt: Date | string
  purchasedCredits: {
    total: number
    remaining: number
  }
  emailVerified: boolean
  signupIp: string | null
  deviceFingerprint: string | null
  plan: 'free_trial' | 'pro' | 'premium' | null
  bio: string
  profileImage: string | null
  isAnonymous: boolean
  isPrivate: boolean
  timezone?: string | null
  modelPreferences?: Record<string, unknown> | null
  followers?: string[]
  following?: string[]
  [key: string]: unknown
}

export interface UsedTrialDoc {
  _id?: ObjectId
  canonicalEmail: string
  email?: string
  signupIp: string | null
  deviceFingerprint: string | null
  remainingAllocation?: number
  deletionMonth?: string
  recordedAt: Date
}

// ============================================================================
// Relationships & Social
// ============================================================================

export interface RelationshipDoc {
  _id?: ObjectId
  fromUserId: string
  toUserId: string
  type: 'follow' | 'follow_request'
  createdAt: Date
}

export interface SubscriptionEventDoc {
  _id?: ObjectId
  userId: string
  date: string
  reason: string
  createdAt: Date
}

// ============================================================================
// Stats & Usage
// ============================================================================

export interface MonthlyUsageEntry {
  tokens?: number
  inputTokens?: number
  outputTokens?: number
  queries?: number
  prompts?: number
}

export interface DailyUsageEntry {
  inputTokens?: number
  outputTokens?: number
  queries?: number
  prompts?: number
  categories?: Record<string, boolean>
  models: Record<string, { inputTokens: number; outputTokens: number }>
  [key: string]: unknown
}

export interface ProviderStats {
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  totalQueries: number
  monthlyTokens: Record<string, number>
  monthlyInputTokens: Record<string, number>
  monthlyOutputTokens: Record<string, number>
  monthlyQueries: Record<string, number>
}

export interface ModelStats {
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  totalQueries: number
  totalPrompts: number
  provider: string
  model: string
  pricing?: unknown
}

export interface PromptHistoryEntry {
  text: string
  category: string
  timestamp: string
  responses?: Array<{
    modelName: string
    actualModelName?: string
    originalModelName?: string
    text: string
    error: boolean
    tokens?: unknown
  }>
  summary?: {
    text: string
    consensus?: number | null
    summary?: string
    agreements?: string[]
    disagreements?: string[]
    singleModel?: boolean
  }
  facts?: Array<{ fact: string; source_quote: string | null }>
  sources?: Array<{ title: string; link: string; snippet: string }>
}

export interface UsageDataDoc {
  _id: string
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  totalQueries: number
  totalPrompts: number
  monthlyUsage: Record<string, MonthlyUsageEntry>
  dailyUsage: Record<string, Record<string, DailyUsageEntry>>
  providers: Record<string, ProviderStats>
  models: Record<string, ModelStats>
  promptHistory: Array<PromptHistoryEntry | Record<string, unknown>>
  categories: Record<string, number>
  categoryPrompts: Record<string, Array<PromptHistoryEntry | Record<string, unknown>>>
  ratings: Record<string, unknown>
  modelWins: Record<string, { provider: string; model: string; responseId: string }>
  lastActiveAt: string | null
  streakDays: number
  judgeConversationContext: Array<Record<string, unknown>>
  modelConversationContext?: Record<string, Array<Record<string, unknown>>>
  purchasedCredits: { total: number; remaining: number }
  dailyChallengesClaimed: Record<string, unknown>
  councilPrompts?: number
  debatePrompts?: number
  updatedAt?: Date
}

export interface UserStatsDoc {
  _id: string
  userId: string
  monthlyUsageCost: Record<string, number>
  monthlyOverageBilled: Record<string, number>
  stats: {
    totalTokens: number
    totalInputTokens: number
    totalOutputTokens: number
    totalQueries: number
    totalPrompts: number
    providers: Record<string, { totalTokens: number; totalInputTokens: number; totalOutputTokens: number }>
    models: Record<string, { totalTokens: number; totalInputTokens: number; totalOutputTokens: number; totalPrompts: number; provider?: string; model?: string }>
  }
  updatedAt?: Date
}

// ============================================================================
// Prompts
// ============================================================================

export interface TokenInfo {
  input: number
  output: number
  total: number
  reasoningTokens?: number
  provider?: string
  model?: string
  source?: string
}

export interface PromptResponse {
  modelName: string
  actualModelName?: string
  originalModelName?: string
  text: string
  error?: boolean
  tokens?: TokenInfo | null
}

export interface PromptSummary {
  text: string
  consensus?: number | null
  summary?: string
  agreements?: string[]
  disagreements?: string[]
  differences?: string[]
  singleModel?: boolean
  modelName?: string | null
}

export interface PromptFact {
  fact: string
  source_quote?: string | null
}

export interface PromptSource {
  title: string
  link: string
  snippet: string
}

export interface PromptDoc {
  _id: ObjectId
  userId: string
  text: string
  category: string
  timestamp: Date
  responses: PromptResponse[]
  summary: PromptSummary | null
  facts: PromptFact[]
  sources: PromptSource[]
  searchQuery: string | null
  wasSearched: boolean
}

// ============================================================================
// Purchases
// ============================================================================

export interface PurchaseDoc {
  _id?: ObjectId
  userId: string
  timestamp: Date
  amount: number
  fee: number
  total: number
  paymentIntentId: string
  status: 'succeeded' | 'failed' | 'pending'
}

// ============================================================================
// Judge Context
// ============================================================================

export interface JudgeContextItem {
  response: string | null
  summary: string | null
  tokens: number
  originalPrompt: string | null
  timestamp: Date
  isFull: boolean
}

export interface JudgeContextDoc {
  _id: string
  userId: string
  context: JudgeContextItem[]
}

// ============================================================================
// Leaderboard Posts
// ============================================================================

export interface PostReply {
  id: string
  userId: string
  username: string
  text: string
  createdAt: Date
  profileImage?: string | null
}

export interface PostComment {
  id: string
  userId: string
  username: string
  text: string
  createdAt: Date
  likes: string[]
  likeCount: number
  replies: PostReply[]
  profileImage?: string | null
}

export interface LeaderboardPostDoc {
  _id: string
  userId: string
  username: string
  promptText: string
  category: string
  createdAt: Date
  responses: PromptResponse[]
  summary: PromptSummary | null
  sources: PromptSource[]
  likes: string[]
  likeCount: number
  comments: PostComment[]
  visibility?: 'public' | 'followers'
}

// ============================================================================
// Conversation History
// ============================================================================

export interface ConversationTurn {
  type: string
  modelName: string
  user: string
  assistant: string
  timestamp: Date
  sources?: PromptSource[]
}

export interface ConversationHistoryDoc {
  _id: string
  userId: string
  title: string
  originalPrompt: string
  category: string
  promptMode: string
  savedAt: Date
  updatedAt?: Date
  finalizedAt?: Date
  starred?: boolean
  responses: PromptResponse[]
  summary: PromptSummary | null
  sources: PromptSource[]
  facts: PromptFact[]
  conversationTurns?: ConversationTurn[]
  embedding?: number[]
  embeddingText?: string
}

// ============================================================================
// Auth tokens
// ============================================================================

export interface EmailVerificationDoc {
  _id?: ObjectId
  token: string
  userId: string
  email: string
  expiresAt: Date
  createdAt: Date
  used: boolean
}

export interface PasswordResetDoc {
  _id?: ObjectId
  token: string
  userId: string
  email: string
  expiresAt: Date
  createdAt: Date
  used: boolean
}

// ============================================================================
// Notifications
// ============================================================================

export interface NotificationDoc {
  _id: string
  userId: string
  type?: string
  title?: string
  message?: string
  fromUserId?: string
  fromUsername?: string
  createdAt: Date
  read: boolean
  [key: string]: unknown
}

// ============================================================================
// Messaging
// ============================================================================

export interface ConversationParticipant {
  userId: string
  username: string
  profileImage: string | null
}

export interface ConversationDoc {
  _id: string
  type: 'dm' | 'group'
  name: string | null
  description: string | null
  participants: ConversationParticipant[]
  createdBy: string
  createdAt: string
  lastMessage: string | null
  lastMessageAt: string
  lastMessageBy: string | null
}

export interface MessageDoc {
  _id: string
  conversationId: string
  senderId: string
  senderUsername: string
  senderProfileImage: string | null
  text: string
  createdAt: string
  readBy: string[]
}

// ============================================================================
// ADMIN DATABASE entities
// ============================================================================

export interface AdminListDoc {
  _id: string
  admins: string[]
}

export interface MetadataDoc {
  _id: string
  deletedUsersCount?: number
  totalUsersEver?: number
  activeUsersCount?: number
  canceledUsersCount?: number
  inactiveUsersCount?: number
  totalRevenue?: number
  totalPurchaseRevenue?: number
  lastUpdated?: Date
  [key: string]: unknown
}

export interface ExpenseDoc {
  _id: string
  stripeFees: number
  openaiCost: number
  anthropicCost: number
  googleCost: number
  xaiCost: number
  serperCost: number
  resendCost: number
  mongoDbCost: number
  vercelCost: number
  domainCost: number
  metaCost?: number
  deepseekCost?: number
  mistralCost?: number
  railwayCost?: number
  lastUpdated: Date
}

// ============================================================================
// Helper types for method signatures
// ============================================================================

/** Fields that can be passed to db.users.create() */
export type UserCreateInput = Partial<UserDoc> & Pick<UserDoc, 'email' | 'password'> & { username?: string }

/** Fields that can be $set on a user */
export type UserUpdateInput = Partial<Omit<UserDoc, '_id'>>
