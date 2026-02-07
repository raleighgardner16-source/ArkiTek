/**
 * SERVER MIGRATION GUIDE
 * 
 * This file shows the before/after code changes needed to migrate
 * server.js from JSON files to MongoDB.
 * 
 * DO NOT run this file - it's documentation only.
 */

// ============================================================================
// STEP 1: UPDATE IMPORTS
// ============================================================================

// BEFORE (remove these):
/*
const USAGE_FILE = path.join(__dirname, 'ADMIN', 'usage.json')

const readUsage = () => {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const data = fs.readFileSync(USAGE_FILE, 'utf8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Error reading usage file:', error)
  }
  return {}
}

const writeUsage = (usage) => {
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2))
  } catch (error) {
    console.error('Error writing usage file:', error)
  }
}
*/

// AFTER (add these):
import db from './database/db.js'

// Initialize database connection on server start
await db.connect()

// Graceful shutdown
process.on('SIGINT', async () => {
  await db.close()
  process.exit(0)
})


// ============================================================================
// STEP 2: REPLACE trackUsage FUNCTION
// ============================================================================

// BEFORE (entire function - ~100 lines):
/*
const trackUsage = (userId, provider, model, inputTokens, outputTokens) => {
  const usage = readUsage()
  if (!usage[userId]) {
    usage[userId] = { ... }
  }
  
  const userUsage = usage[userId]
  const currentMonth = getCurrentMonth()
  const today = new Date().toISOString().split('T')[0]
  const tokensUsed = inputTokens + outputTokens
  
  // Update totals
  userUsage.totalTokens += tokensUsed
  userUsage.totalInputTokens = (userUsage.totalInputTokens || 0) + inputTokens
  // ... many more lines ...
  
  writeUsage(usage)
}
*/

// AFTER (one line):
const trackUsage = db.trackUsage


// ============================================================================
// STEP 3: REPLACE trackPrompt FUNCTION
// ============================================================================

// BEFORE:
/*
const trackPrompt = (userId, promptText, category, ...) => {
  const usage = readUsage()
  // ... long function ...
  writeUsage(usage)
}
*/

// AFTER:
const trackPrompt = async (userId, promptText, category, responses, summary, facts, sources) => {
  // Save prompt to database
  await db.prompts.save(userId, {
    text: promptText,
    category,
    responses,
    summary,
    facts,
    sources,
    timestamp: new Date()
  })
  
  // Update prompt count
  await db.trackPrompt(userId)
}


// ============================================================================
// STEP 4: REPLACE /api/stats/:userId ENDPOINT
// ============================================================================

// BEFORE:
/*
app.get('/api/stats/:userId', (req, res) => {
  const { userId } = req.params
  const usage = readUsage()
  const userUsage = usage[userId]
  
  if (!userUsage) {
    return res.json({
      totalTokens: 0,
      totalPrompts: 0,
      // ... defaults ...
    })
  }
  
  // Calculate everything from the massive JSON object
  // ... 100+ lines of data processing ...
  
  res.json(userStats)
})
*/

// AFTER:
app.get('/api/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    
    // Get user with stats
    const user = await db.users.get(userId)
    if (!user) {
      return res.json({
        totalTokens: 0,
        totalPrompts: 0,
        freeUsagePercentage: 100,
        // ... defaults ...
      })
    }
    
    // Get current month usage
    const currentMonth = new Date().toISOString().slice(0, 7)
    const monthlyUsage = await db.usage.getMonthly(userId, currentMonth)
    
    // Get category stats
    const categoryStats = await db.prompts.getCategoryStats(userId)
    
    // Get recent prompts for each category
    const categorizedPrompts = {}
    for (const cat of categoryStats) {
      categorizedPrompts[cat._id] = await db.prompts.getByCategory(userId, cat._id, 8)
    }
    
    res.json({
      totalTokens: user.stats.totalTokens,
      totalPrompts: user.stats.totalPrompts,
      totalInputTokens: user.stats.totalInputTokens,
      totalOutputTokens: user.stats.totalOutputTokens,
      totalQueries: user.stats.totalQueries,
      
      monthlyTokens: monthlyUsage?.tokens || 0,
      monthlyPrompts: monthlyUsage?.prompts || 0,
      
      providers: user.stats.providers,
      models: user.stats.models,
      
      categorizedPrompts,
      categoryStats,
      
      purchasedCredits: user.purchasedCredits,
      freeUsagePercentage: calculateFreeUsagePercentage(user)
    })
  } catch (error) {
    console.error('[Stats] Error:', error)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})


// ============================================================================
// STEP 5: REPLACE /api/judge/context ENDPOINT
// ============================================================================

// BEFORE:
/*
app.get('/api/judge/context', (req, res) => {
  const { userId } = req.query
  const usage = readUsage()
  const context = usage[userId]?.judgeConversationContext || []
  res.json({ context })
})
*/

// AFTER:
app.get('/api/judge/context', async (req, res) => {
  try {
    const { userId } = req.query
    const context = await db.judgeContext.get(userId)
    res.json({ context })
  } catch (error) {
    console.error('[Judge Context] Error:', error)
    res.status(500).json({ error: 'Failed to get context' })
  }
})


// ============================================================================
// STEP 6: REPLACE /api/judge/clear-context ENDPOINT
// ============================================================================

// BEFORE:
/*
app.post('/api/judge/clear-context', (req, res) => {
  const { userId } = req.body
  const usage = readUsage()
  if (usage[userId]?.judgeConversationContext) {
    usage[userId].judgeConversationContext = []
    writeUsage(usage)
  }
  res.json({ success: true })
})
*/

// AFTER:
app.post('/api/judge/clear-context', async (req, res) => {
  try {
    const { userId } = req.body
    await db.judgeContext.clear(userId)
    res.json({ success: true })
  } catch (error) {
    console.error('[Judge Context] Error clearing:', error)
    res.status(500).json({ error: 'Failed to clear context' })
  }
})


// ============================================================================
// STEP 7: REPLACE storeJudgeContext FUNCTION
// ============================================================================

// BEFORE:
/*
const storeJudgeContext = async (userId, grokResponse, originalPrompt = null) => {
  const usage = readUsage()
  // ... complex logic ...
  writeUsage(usage)
}
*/

// AFTER:
const storeJudgeContext = async (userId, grokResponse, originalPrompt = null) => {
  await db.judgeContext.add(userId, {
    response: grokResponse,
    originalPrompt,
    isFull: true
  })
}


// ============================================================================
// STEP 8: REPLACE /api/stripe/buy-usage ENDPOINT
// ============================================================================

// BEFORE:
/*
app.post('/api/stripe/buy-usage', async (req, res) => {
  // ... payment processing ...
  
  const usage = readUsage()
  if (!usage[userId].purchasedCredits) {
    usage[userId].purchasedCredits = { total: 0, remaining: 0, purchases: [] }
  }
  usage[userId].purchasedCredits.total += amount
  usage[userId].purchasedCredits.remaining += amount
  usage[userId].purchasedCredits.purchases.push({
    timestamp: new Date().toISOString(),
    amount,
    fee,
    total,
    paymentIntentId: paymentIntent.id,
  })
  writeUsage(usage)
  
  res.json({ success: true })
})
*/

// AFTER:
app.post('/api/stripe/buy-usage', async (req, res) => {
  try {
    const { userId, amount, fee, total } = req.body
    
    // ... payment processing (same as before) ...
    
    if (paymentIntent.status === 'succeeded') {
      // Save purchase record (automatically updates user credits)
      await db.purchases.save(userId, {
        amount,
        fee,
        total,
        paymentIntentId: paymentIntent.id,
        status: 'succeeded'
      })
      
      res.json({ success: true, message: 'Credits purchased!' })
    }
  } catch (error) {
    console.error('[Stripe] Error:', error)
    res.status(500).json({ error: 'Purchase failed' })
  }
})


// ============================================================================
// STEP 9: REPLACE DELETE ACCOUNT ENDPOINT
// ============================================================================

// BEFORE:
/*
app.delete('/api/auth/account', (req, res) => {
  const { userId } = req.body
  
  const users = readUsers()
  const usage = readUsage()
  
  delete users[userId]
  delete usage[userId]
  
  writeUsers(users)
  writeUsage(usage)
  
  res.json({ success: true })
})
*/

// AFTER:
app.delete('/api/auth/account', async (req, res) => {
  try {
    const { userId } = req.body
    
    // Delete from users.json (keep for auth until fully migrated)
    const users = readUsers()
    delete users[userId]
    writeUsers(users)
    
    // Delete all data from MongoDB
    await db.users.delete(userId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('[Account Delete] Error:', error)
    res.status(500).json({ error: 'Failed to delete account' })
  }
})


// ============================================================================
// STEP 10: UPDATE RAG PIPELINE PROMPT STORAGE
// ============================================================================

// In the RAG pipeline, when storing prompt results:

// BEFORE:
/*
// In processRAGPipeline or similar:
trackPrompt(userId, query, category, responses, judgeSummary, refinedFacts, sources)
*/

// AFTER:
// In processRAGPipeline or similar:
await db.prompts.save(userId, {
  text: query,
  category,
  responses,
  summary: judgeSummary,
  facts: refinedFacts,
  sources,
  searchQuery: searchQuery,
  timestamp: new Date()
})
await db.trackPrompt(userId)


// ============================================================================
// COMMON PATTERNS - QUICK REFERENCE
// ============================================================================

// Pattern 1: Reading user data
// BEFORE: const usage = readUsage(); const userData = usage[userId]
// AFTER:  const userData = await db.users.get(userId)

// Pattern 2: Updating totals
// BEFORE: usage[userId].totalTokens += tokens; writeUsage(usage)
// AFTER:  await db.users.updateStats(userId, { totalTokens: tokens })

// Pattern 3: Getting recent prompts
// BEFORE: usage[userId].promptHistory.slice(-20)
// AFTER:  await db.prompts.getRecent(userId, 20)

// Pattern 4: Adding a prompt
// BEFORE: usage[userId].promptHistory.push(prompt); writeUsage(usage)
// AFTER:  await db.prompts.save(userId, prompt)

// Pattern 5: Checking if user exists
// BEFORE: if (usage[userId]) { ... }
// AFTER:  if (await db.users.exists(userId)) { ... }

// Pattern 6: Getting monthly usage
// BEFORE: usage[userId].monthlyUsage['2026-02']
// AFTER:  await db.usage.getMonthly(userId, '2026-02')


// ============================================================================
// NOTES
// ============================================================================

/*
IMPORTANT CONSIDERATIONS:

1. ASYNC/AWAIT: All database operations are now async. You need to:
   - Add 'async' to route handlers
   - Add 'await' before db calls
   - Use try/catch for error handling

2. TRANSACTIONS: For operations that need atomicity across collections,
   use MongoDB transactions. The migration script shows an example.

3. CACHING: For frequently accessed data (like user stats), consider
   adding a Redis cache layer later for better performance.

4. INDEXING: Indexes are created during migration. If you add new
   query patterns, add indexes in schema.js and run migration again.

5. BACKUP: Always backup usage.json before running migration.
   The migration is idempotent but better safe than sorry.

6. TESTING: Run with --dry-run first to see what would be migrated
   without actually making changes.

7. ROLLBACK: If something goes wrong, you still have the original
   JSON files. The migration doesn't delete them.
*/

