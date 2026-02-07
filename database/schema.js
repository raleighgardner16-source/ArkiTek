/**
 * MongoDB Schema Definitions for Arktek
 * 
 * This file defines the schema structure for all collections.
 * We're splitting the monolithic usage.json into separate collections
 * to enable efficient queries and avoid the 16MB document limit.
 * 
 * Collections:
 * - users: Core user info and aggregated totals
 * - prompts: Individual prompt documents with responses (one per prompt)
 * - usage_daily: Daily usage statistics per user
 * - usage_monthly: Monthly usage statistics per user  
 * - purchases: Individual purchase records
 * - judge_context: Judge conversation context (max 5 per user)
 * - leaderboard_posts: Public posts for voting/leaderboard
 * - metadata: App-wide statistics and admin tracking
 * - admins: Admin user list
 */

// Note: Using native MongoDB driver, not Mongoose, for more control
// Schema is documented here for reference; indexes are created in migration

/**
 * USERS COLLECTION
 * 
 * Stores core user info and aggregated totals.
 * Updated incrementally, never needs full rewrite.
 * 
 * Index: { _id: 1 } (default)
 * Index: { email: 1 } (unique, for auth)
 * Index: { stripeCustomerId: 1 } (sparse, for Stripe lookups)
 */
export const usersSchema = {
  _id: 'string',              // username/userId (e.g., "raleighgardner")
  email: 'string',            // user email
  password: 'string',         // hashed password (if using local auth)
  stripeCustomerId: 'string', // Stripe customer ID (optional)
  subscriptionStatus: 'string', // 'active', 'canceled', 'past_due', etc.
  subscriptionId: 'string',   // Stripe subscription ID
  createdAt: 'Date',
  lastActiveAt: 'Date',
  
  // Aggregated totals (updated incrementally)
  stats: {
    totalTokens: 'number',
    totalInputTokens: 'number',
    totalOutputTokens: 'number',
    totalQueries: 'number',    // Serper search queries
    totalPrompts: 'number',
    
    // Provider-level aggregates
    providers: {
      // e.g., "xai": { totalTokens, totalInputTokens, totalOutputTokens }
    },
    
    // Model-level aggregates
    models: {
      // e.g., "xai-grok-4-1-fast-reasoning": { totalTokens, totalPrompts, ... }
    }
  },
  
  // Purchased credits tracking
  purchasedCredits: {
    total: 'number',          // Total ever purchased
    remaining: 'number',      // Currently available
  },
  
  // User's saved/bookmarked posts from leaderboard
  savedPosts: ['string'],     // Array of leaderboard post IDs
  
  // User status tracking
  status: 'string',           // 'active', 'inactive', 'canceled'
  lastLoginAt: 'Date',        // Last login timestamp
  canceledAt: 'Date',         // When subscription was canceled (if applicable)
}

/**
 * PROMPTS COLLECTION
 * 
 * One document per prompt. This is the main collection that was causing
 * the size problem. Now each prompt is independent.
 * 
 * Index: { userId: 1, timestamp: -1 } (for recent prompts query)
 * Index: { userId: 1, category: 1 } (for category filtering)
 * Index: { userId: 1, "responses.modelName": 1 } (for model filtering)
 * Index: { timestamp: -1 } (for global recent queries)
 */
export const promptsSchema = {
  _id: 'ObjectId',            // MongoDB auto-generated
  
  userId: 'string',           // Foreign key to users._id
  text: 'string',             // The original prompt text
  category: 'string',         // e.g., "Science", "Technology"
  timestamp: 'Date',          // When prompt was submitted
  
  // Responses from LLMs (bounded array, typically 1-6 items)
  responses: [{
    modelName: 'string',      // e.g., "openai-gpt-5.2"
    actualModelName: 'string',
    originalModelName: 'string',
    text: 'string',           // Response text
    error: 'boolean',
    tokens: {
      input: 'number',
      output: 'number',
      total: 'number',
      reasoningTokens: 'number',
      provider: 'string',
      model: 'string',
      source: 'string'
    }
  }],
  
  // Judge summary (if multi-model comparison)
  summary: {
    text: 'string',
    consensus: 'number',      // 0-100
    summary: 'string',
    agreements: ['string'],
    disagreements: ['string'],
    singleModel: 'boolean'
  },
  
  // RAG pipeline data (bounded arrays)
  facts: [{
    fact: 'string',
    source_quote: 'string'
  }],
  
  sources: [{
    title: 'string',
    link: 'string',
    snippet: 'string'
  }],
  
  // Metadata
  searchQuery: 'string',      // If web search was performed
  wasSearched: 'boolean'
}

/**
 * USAGE_DAILY COLLECTION
 * 
 * Daily aggregated statistics. One document per user per day.
 * Enables efficient date range queries without loading prompt history.
 * 
 * Index: { userId: 1, date: -1 } (compound for user+date queries)
 * Index: { date: -1 } (for admin dashboards)
 */
export const usageDailySchema = {
  _id: 'ObjectId',
  
  userId: 'string',           // Foreign key to users._id
  date: 'string',             // YYYY-MM-DD format
  
  inputTokens: 'number',
  outputTokens: 'number',
  queries: 'number',          // Serper queries for this day
  prompts: 'number',          // Number of prompts this day
  
  // Per-model breakdown for this day
  models: {
    // e.g., "xai-grok-4-1-fast-reasoning": { inputTokens, outputTokens }
  }
}

/**
 * USAGE_MONTHLY COLLECTION
 * 
 * Monthly aggregated statistics. One document per user per month.
 * Used for billing calculations and usage dashboards.
 * 
 * Index: { userId: 1, month: -1 } (compound for user+month queries)
 */
export const usageMonthlySchema = {
  _id: 'ObjectId',
  
  userId: 'string',           // Foreign key to users._id
  month: 'string',            // YYYY-MM format
  
  tokens: 'number',
  inputTokens: 'number',
  outputTokens: 'number',
  queries: 'number',
  prompts: 'number',
  
  // Provider breakdown for this month
  providers: {
    // e.g., "xai": { tokens, inputTokens, outputTokens }
  }
}

/**
 * PURCHASES COLLECTION
 * 
 * Individual purchase records. One document per purchase.
 * 
 * Index: { userId: 1, timestamp: -1 } (for user purchase history)
 * Index: { paymentIntentId: 1 } (unique, for Stripe webhook reconciliation)
 */
export const purchasesSchema = {
  _id: 'ObjectId',
  
  userId: 'string',           // Foreign key to users._id
  timestamp: 'Date',
  
  amount: 'number',           // USD amount purchased
  fee: 'number',              // Transaction fee
  total: 'number',            // Total charged
  
  paymentIntentId: 'string',  // Stripe payment intent ID
  status: 'string'            // 'succeeded', 'failed', 'pending'
}

/**
 * JUDGE_CONTEXT COLLECTION
 * 
 * Stores the last 5 conversation exchanges for judge model context.
 * One document per user.
 * 
 * Index: { userId: 1 } (unique)
 */
export const judgeContextSchema = {
  _id: 'string',              // Same as userId for easy lookup
  
  userId: 'string',
  
  // Array of up to 5 context items (FIFO)
  context: [{
    response: 'string',       // Full response (only for most recent)
    summary: 'string',        // Summarized response
    tokens: 'number',
    originalPrompt: 'string',
    timestamp: 'Date',
    isFull: 'boolean'
  }]
}

/**
 * LEADERBOARD_POSTS COLLECTION
 * 
 * Public prompt posts for the leaderboard/voting feature.
 * One document per submitted post.
 * 
 * Index: { createdAt: -1 } (for recent posts)
 * Index: { userId: 1 } (for user's posts)
 * Index: { likeCount: -1 } (for top liked)
 * Index: { category: 1, likeCount: -1 } (for category filtering)
 */
export const leaderboardPostsSchema = {
  _id: 'string',              // Generated ID (prompt-timestamp-random)
  
  userId: 'string',           // Foreign key to users._id
  username: 'string',         // Display name
  promptText: 'string',       // The prompt text
  category: 'string',         // Category of the prompt
  
  createdAt: 'Date',
  
  // Responses from LLMs (same structure as prompts)
  responses: [{
    modelName: 'string',
    text: 'string',
    tokens: 'object'
  }],
  
  // Judge summary
  summary: {
    text: 'string',
    consensus: 'number',
    agreements: ['string'],
    disagreements: ['string']
  },
  
  // Sources (no facts exposed to users)
  sources: [{
    title: 'string',
    link: 'string',
    snippet: 'string'
  }],
  
  // Voting
  likes: ['string'],          // Array of userIds who liked
  likeCount: 'number',        // Denormalized for sorting
  
  // Comments
  comments: [{
    id: 'string',
    userId: 'string',
    username: 'string',
    text: 'string',
    createdAt: 'Date',
    likes: ['string'],
    likeCount: 'number',
    replies: [{
      id: 'string',
      userId: 'string',
      username: 'string',
      text: 'string',
      createdAt: 'Date'
    }]
  }]
}

/**
 * METADATA COLLECTION
 * 
 * App-wide statistics and admin tracking data.
 * Single document store for various metrics.
 * 
 * No indexes needed (small collection, direct _id lookup)
 */
export const metadataSchema = {
  _id: 'string',              // Key name (e.g., "admin_stats", "app_config")
  
  // For admin_stats document:
  deletedUsersCount: 'number',     // Total accounts deleted
  totalUsersEver: 'number',        // All accounts ever created
  
  // Cached counts (updated periodically or on-demand)
  activeUsersCount: 'number',      // Users with active subscriptions
  canceledUsersCount: 'number',    // Users who canceled
  inactiveUsersCount: 'number',    // Users inactive for 30+ days
  
  // Revenue tracking
  totalRevenue: 'number',          // Total subscription + purchase revenue
  totalPurchaseRevenue: 'number',  // Just extra credit purchases
  
  lastUpdated: 'Date'
}

/**
 * ADMINS COLLECTION
 * 
 * List of admin user IDs.
 * Single document with array of admin userIds.
 * 
 * No indexes needed (small collection)
 */
export const adminsSchema = {
  _id: 'string',              // "admin_list"
  admins: ['string']          // Array of userIds who are admins
}

/**
 * Index definitions for migration script
 */
export const indexes = {
  prompts: [
    { key: { userId: 1, timestamp: -1 } },
    { key: { userId: 1, category: 1 } },
    { key: { userId: 1, 'responses.modelName': 1 } },
    { key: { timestamp: -1 } },
    { key: { category: 1, timestamp: -1 } }
  ],
  
  usage_daily: [
    { key: { userId: 1, date: -1 }, options: { unique: true } },
    { key: { date: -1 } }
  ],
  
  usage_monthly: [
    { key: { userId: 1, month: -1 }, options: { unique: true } }
  ],
  
  purchases: [
    { key: { userId: 1, timestamp: -1 } },
    { key: { paymentIntentId: 1 }, options: { unique: true, sparse: true } }
  ],
  
  judge_context: [
    { key: { userId: 1 }, options: { unique: true } }
  ],
  
  leaderboard_posts: [
    { key: { createdAt: -1 } },                    // Today's posts / recent
    { key: { userId: 1, createdAt: -1 } },         // User's profile posts
    { key: { likeCount: -1, createdAt: -1 } },     // All-time favorites
    { key: { category: 1, likeCount: -1 } },       // Category filtering
    { key: { category: 1, createdAt: -1 } }        // Category + recent
  ],
  
  users: [
    { key: { email: 1 }, options: { unique: true } },
    { key: { stripeCustomerId: 1 }, options: { sparse: true } },
    { key: { status: 1 } },                        // For admin filtering
    { key: { subscriptionStatus: 1 } },            // For subscription filtering
    { key: { lastActiveAt: -1 } }                  // For activity sorting
  ],
  
  metadata: [
    // No indexes needed - direct _id lookup
  ],
  
  admins: [
    // No indexes needed - direct _id lookup
  ]
}

