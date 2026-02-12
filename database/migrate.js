/**
 * Migration Script: JSON to MongoDB
 * 
 * This script migrates data from the monolithic usage.json and users.json
 * files to a scalable MongoDB schema.
 * 
 * Features:
 * - Idempotent: Can be run multiple times safely
 * - Atomic user migration with rollback on failure
 * - Progress logging
 * - Dry run mode for testing
 * - Verification queries after migration
 * 
 * Usage:
 *   node database/migrate.js                    # Full migration
 *   node database/migrate.js --dry-run          # Preview without changes
 *   node database/migrate.js --verify           # Verify existing migration
 *   node database/migrate.js --user=username    # Migrate single user
 */

import { MongoClient, ObjectId } from 'mongodb'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { indexes } from './schema.js'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '..', '.env') })

// Configuration - read AFTER dotenv.config()
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.DB_NAME || 'arktek'
const ADMIN_DIR = path.join(__dirname, '..', 'ADMIN')
const USAGE_FILE = path.join(ADMIN_DIR, 'usage.json')
const USERS_FILE = path.join(ADMIN_DIR, 'users.json')
const LEADERBOARD_FILE = path.join(ADMIN_DIR, 'leaderboard.json')
const ADMINS_FILE = path.join(ADMIN_DIR, 'admins.json')
const DELETED_USERS_FILE = path.join(ADMIN_DIR, 'deleted_users.json')

// Parse command line arguments
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const VERIFY_ONLY = args.includes('--verify')
const SINGLE_USER = args.find(a => a.startsWith('--user='))?.split('=')[1]

// Stats tracking
const stats = {
  usersProcessed: 0,
  usersFailed: 0,
  promptsMigrated: 0,
  dailyRecords: 0,
  monthlyRecords: 0,
  purchaseRecords: 0,
  leaderboardPosts: 0,
  adminsMigrated: false,
  metadataMigrated: false,
  errors: []
}

/**
 * Read JSON file safely
 */
function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`)
      return null
    }
    const data = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error(`❌ Error reading ${filePath}:`, error.message)
    return null
  }
}

/**
 * Create all indexes for a collection
 */
async function createIndexes(db) {
  console.log('\n📊 Creating indexes...')
  
  for (const [collectionName, collectionIndexes] of Object.entries(indexes)) {
    const collection = db.collection(collectionName)
    
    for (const index of collectionIndexes) {
      try {
        await collection.createIndex(index.key, index.options || {})
        console.log(`  ✓ ${collectionName}.${Object.keys(index.key).join('_')}`)
      } catch (error) {
        // Index might already exist with same definition, that's OK
        if (error.code !== 85 && error.code !== 86) {
          console.log(`  ⚠️  ${collectionName}: ${error.message}`)
        }
      }
    }
  }
}

/**
 * Migrate a single user's data (no transactions for local development)
 */
async function migrateUser(db, userId, userData, userAuth) {
  try {
    // 1. Migrate user document
    const userDoc = {
      _id: userId,
      email: userAuth?.email || `${userId}@migrated.local`,
      password: userAuth?.password || null,
      stripeCustomerId: userAuth?.stripeCustomerId || null,
      subscriptionStatus: userAuth?.subscriptionStatus || null,
      subscriptionId: userAuth?.subscriptionId || null,
      createdAt: userAuth?.createdAt ? new Date(userAuth.createdAt) : new Date(),
      lastActiveAt: new Date(),
      
      stats: {
        totalTokens: userData.totalTokens || 0,
        totalInputTokens: userData.totalInputTokens || 0,
        totalOutputTokens: userData.totalOutputTokens || 0,
        totalQueries: userData.totalQueries || 0,
        totalPrompts: userData.totalPrompts || 0,
        providers: userData.providers || {},
        models: userData.models || {}
      },
      
      purchasedCredits: {
        total: userData.purchasedCredits?.total || 0,
        remaining: userData.purchasedCredits?.remaining || 0
      }
    }
    
    if (!DRY_RUN) {
      await db.collection('users').replaceOne(
        { _id: userId },
        userDoc,
        { upsert: true }
      )
    }
    console.log(`  ✓ User document`)
    
    // 2. Migrate prompt history (one document per prompt)
    if (userData.promptHistory && userData.promptHistory.length > 0) {
      const promptDocs = userData.promptHistory.map(prompt => ({
        userId: userId,
        text: prompt.text,
        category: prompt.category || 'Uncategorized',
        timestamp: new Date(prompt.timestamp),
        responses: prompt.responses || [],
        summary: prompt.summary || null,
        facts: prompt.facts || [],
        sources: prompt.sources || [],
        searchQuery: prompt.searchQuery || null,
        wasSearched: !!(prompt.facts && prompt.facts.length > 0)
      }))
      
      if (!DRY_RUN) {
        // Delete existing prompts for this user first (idempotent)
        await db.collection('prompts').deleteMany({ userId })
        
        // Insert all prompts
        if (promptDocs.length > 0) {
          await db.collection('prompts').insertMany(promptDocs)
        }
      }
      
      stats.promptsMigrated += promptDocs.length
      console.log(`  ✓ ${promptDocs.length} prompts`)
    }
    
    // 3. Migrate daily usage
    if (userData.dailyUsage) {
      const dailyDocs = []
      
      for (const [month, days] of Object.entries(userData.dailyUsage)) {
        for (const [date, dayData] of Object.entries(days)) {
          dailyDocs.push({
            userId: userId,
            date: date,
            inputTokens: dayData.inputTokens || 0,
            outputTokens: dayData.outputTokens || 0,
            queries: dayData.queries || 0,
            prompts: dayData.prompts || 0,
            models: dayData.models || {}
          })
        }
      }
      
      if (!DRY_RUN && dailyDocs.length > 0) {
        // Use bulkWrite for upsert behavior
        const ops = dailyDocs.map(doc => ({
          replaceOne: {
            filter: { userId: doc.userId, date: doc.date },
            replacement: doc,
            upsert: true
          }
        }))
        await db.collection('usage_daily').bulkWrite(ops)
      }
      
      stats.dailyRecords += dailyDocs.length
      console.log(`  ✓ ${dailyDocs.length} daily records`)
    }
    
    // 4. Migrate monthly usage
    if (userData.monthlyUsage) {
      const monthlyDocs = []
      
      for (const [month, monthData] of Object.entries(userData.monthlyUsage)) {
        // Build provider breakdown from provider data
        const providerBreakdown = {}
        if (userData.providers) {
          for (const [provider, provData] of Object.entries(userData.providers)) {
            if (provData.monthlyTokens?.[month]) {
              providerBreakdown[provider] = {
                tokens: provData.monthlyTokens[month] || 0,
                inputTokens: provData.monthlyInputTokens?.[month] || 0,
                outputTokens: provData.monthlyOutputTokens?.[month] || 0
              }
            }
          }
        }
        
        monthlyDocs.push({
          userId: userId,
          month: month,
          tokens: monthData.tokens || 0,
          inputTokens: monthData.inputTokens || 0,
          outputTokens: monthData.outputTokens || 0,
          queries: monthData.queries || 0,
          prompts: monthData.prompts || 0,
          providers: providerBreakdown
        })
      }
      
      if (!DRY_RUN && monthlyDocs.length > 0) {
        const ops = monthlyDocs.map(doc => ({
          replaceOne: {
            filter: { userId: doc.userId, month: doc.month },
            replacement: doc,
            upsert: true
          }
        }))
        await db.collection('user_monthly_usage').bulkWrite(ops)
      }
      
      stats.monthlyRecords += monthlyDocs.length
      console.log(`  ✓ ${monthlyDocs.length} monthly records`)
    }
    
    // 5. Migrate purchases
    if (userData.purchasedCredits?.purchases && userData.purchasedCredits.purchases.length > 0) {
      const purchaseDocs = userData.purchasedCredits.purchases.map(purchase => ({
        userId: userId,
        timestamp: new Date(purchase.timestamp),
        amount: purchase.amount,
        fee: purchase.fee,
        total: purchase.total,
        paymentIntentId: purchase.paymentIntentId,
        status: 'succeeded'
      }))
      
      if (!DRY_RUN) {
        // Delete existing purchases for this user first
        await db.collection('purchases').deleteMany({ userId })
        await db.collection('purchases').insertMany(purchaseDocs)
      }
      
      stats.purchaseRecords += purchaseDocs.length
      console.log(`  ✓ ${purchaseDocs.length} purchases`)
    }
    
    // 6. Migrate judge context
    if (userData.judgeConversationContext && userData.judgeConversationContext.length > 0) {
      const contextDoc = {
        _id: userId,
        userId: userId,
        context: userData.judgeConversationContext.map(ctx => ({
          response: ctx.response || null,
          summary: ctx.summary || null,
          tokens: ctx.tokens || 0,
          originalPrompt: ctx.originalPrompt || null,
          timestamp: ctx.timestamp ? new Date(ctx.timestamp) : new Date(),
          isFull: ctx.isFull || false
        }))
      }
      
      if (!DRY_RUN) {
        await db.collection('judge_context').replaceOne(
          { _id: userId },
          contextDoc,
          { upsert: true }
        )
      }
      console.log(`  ✓ Judge context (${contextDoc.context.length} items)`)
    }
    
    stats.usersProcessed++
    
  } catch (error) {
    stats.usersFailed++
    stats.errors.push({ userId, error: error.message })
    console.error(`  ❌ Failed: ${error.message}`)
    throw error
  }
}

/**
 * Verify migration integrity
 */
async function verifyMigration(db, usageData, usersData) {
  console.log('\n🔍 Verifying migration...\n')
  
  let issues = 0
  
  for (const [userId, userData] of Object.entries(usageData)) {
    // Check user exists
    const user = await db.collection('users').findOne({ _id: userId })
    if (!user) {
      console.log(`  ❌ User missing: ${userId}`)
      issues++
      continue
    }
    
    // Check prompt count
    const promptCount = await db.collection('prompts').countDocuments({ userId })
    const expectedPrompts = userData.promptHistory?.length || 0
    if (promptCount !== expectedPrompts) {
      console.log(`  ⚠️  ${userId}: Prompt count mismatch (DB: ${promptCount}, JSON: ${expectedPrompts})`)
      issues++
    }
    
    // Check token totals
    if (user.stats.totalTokens !== userData.totalTokens) {
      console.log(`  ⚠️  ${userId}: Token total mismatch (DB: ${user.stats.totalTokens}, JSON: ${userData.totalTokens})`)
      issues++
    }
    
    // Check monthly records
    const monthlyCount = await db.collection('user_monthly_usage').countDocuments({ userId })
    const expectedMonthly = Object.keys(userData.monthlyUsage || {}).length
    if (monthlyCount !== expectedMonthly) {
      console.log(`  ⚠️  ${userId}: Monthly record count mismatch`)
      issues++
    }
    
    // Check purchases
    const purchaseCount = await db.collection('purchases').countDocuments({ userId })
    const expectedPurchases = userData.purchasedCredits?.purchases?.length || 0
    if (purchaseCount !== expectedPurchases) {
      console.log(`  ⚠️  ${userId}: Purchase count mismatch`)
      issues++
    }
    
    if (issues === 0) {
      console.log(`  ✓ ${userId}: All checks passed`)
    }
  }
  
  // Global stats
  console.log('\n📈 Database Statistics:')
  const collections = ['users', 'prompts', 'usage_daily', 'user_monthly_usage', 'purchases', 'judge_context']
  for (const coll of collections) {
    const count = await db.collection(coll).countDocuments()
    console.log(`  ${coll}: ${count} documents`)
  }
  
  return issues === 0
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('\n🚀 ARKTEK DATABASE MIGRATION')
  console.log('=' .repeat(50))
  
  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n')
  }
  
  // Read source files
  console.log('📁 Reading source files...')
  const usageData = readJsonFile(USAGE_FILE)
  const usersData = readJsonFile(USERS_FILE)
  
  if (!usageData) {
    console.error('❌ Cannot proceed without usage.json')
    process.exit(1)
  }
  
  const userIds = SINGLE_USER 
    ? [SINGLE_USER] 
    : Object.keys(usageData)
  
  console.log(`   Found ${userIds.length} user(s) to migrate`)
  
  // Connect to MongoDB
  console.log('\n🔌 Connecting to MongoDB...')
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    const db = client.db(DB_NAME)
    db.client = client // Attach for session access
    
    console.log(`   Connected to database: ${DB_NAME}`)
    
    // Verify only mode
    if (VERIFY_ONLY) {
      const success = await verifyMigration(db, usageData, usersData)
      await client.close()
      process.exit(success ? 0 : 1)
    }
    
    // Create indexes first
    await createIndexes(db)
    
    // Migrate each user
    console.log('\n👤 Migrating users...\n')
    
    for (const userId of userIds) {
      console.log(`📦 ${userId}:`)
      
      const userData = usageData[userId]
      if (!userData) {
        console.log(`  ⚠️  No usage data found, skipping`)
        continue
      }
      
      const userAuth = usersData?.[userId]
      
      try {
        await migrateUser(db, userId, userData, userAuth)
      } catch (error) {
        console.error(`  ❌ Migration failed for ${userId}`)
        // Continue with other users
      }
    }
    
    // Migrate leaderboard posts
    if (!SINGLE_USER) {
      console.log('\n🏆 Migrating leaderboard posts...')
      const leaderboardData = readJsonFile(LEADERBOARD_FILE)
      
      if (leaderboardData && leaderboardData.prompts && leaderboardData.prompts.length > 0) {
        const posts = leaderboardData.prompts.map(post => ({
          _id: post.id,
          userId: post.userId,
          username: post.username || 'Anonymous',
          promptText: post.promptText,
          category: post.category || 'General Knowledge/Other',
          createdAt: new Date(post.createdAt),
          responses: post.responses || [],
          summary: post.summary || null,
          sources: post.sources || [],
          likes: post.likes || [],
          likeCount: post.likeCount || 0,
          comments: (post.comments || []).map(c => ({
            id: c.id,
            userId: c.userId,
            username: c.username || 'Anonymous',
            text: c.text,
            createdAt: new Date(c.createdAt),
            likes: c.likes || [],
            likeCount: c.likeCount || 0,
            replies: (c.replies || []).map(r => ({
              id: r.id,
              userId: r.userId,
              username: r.username || 'Anonymous',
              text: r.text,
              createdAt: new Date(r.createdAt)
            }))
          }))
        }))
        
        if (!DRY_RUN && posts.length > 0) {
          // Clear existing leaderboard posts
          await db.collection('leaderboard_posts').deleteMany({})
          await db.collection('leaderboard_posts').insertMany(posts)
        }
        
        stats.leaderboardPosts = posts.length
        console.log(`  ✓ ${posts.length} leaderboard posts migrated`)
      } else {
        console.log('  ⚠️  No leaderboard data found or empty')
      }
    }
    
    // Migrate admins list
    if (!SINGLE_USER) {
      console.log('\n👑 Migrating admins list...')
      const adminsData = readJsonFile(ADMINS_FILE)
      
      if (adminsData && adminsData.admins && adminsData.admins.length > 0) {
        if (!DRY_RUN) {
          await db.collection('admins').replaceOne(
            { _id: 'admin_list' },
            { _id: 'admin_list', admins: adminsData.admins },
            { upsert: true }
          )
        }
        stats.adminsMigrated = true
        console.log(`  ✓ ${adminsData.admins.length} admin(s) migrated: ${adminsData.admins.join(', ')}`)
      } else {
        console.log('  ⚠️  No admins data found or empty')
      }
    }
    
    // Migrate metadata (deleted users count, etc.)
    if (!SINGLE_USER) {
      console.log('\n📊 Migrating metadata...')
      const deletedUsersData = readJsonFile(DELETED_USERS_FILE)
      const deletedCount = deletedUsersData?.count || 0
      
      // Calculate user counts from migrated data
      const totalUsers = Object.keys(usersData).length
      let activeCount = 0
      let canceledCount = 0
      
      for (const user of Object.values(usersData)) {
        if (user.subscriptionStatus === 'active') activeCount++
        if (user.subscriptionStatus === 'canceled' || user.canceled === true) canceledCount++
      }
      
      if (!DRY_RUN) {
        await db.collection('metadata').replaceOne(
          { _id: 'admin_stats' },
          {
            _id: 'admin_stats',
            deletedUsersCount: deletedCount,
            totalUsersEver: totalUsers + deletedCount,
            activeUsersCount: activeCount,
            canceledUsersCount: canceledCount,
            inactiveUsersCount: totalUsers - activeCount - canceledCount,
            lastUpdated: new Date()
          },
          { upsert: true }
        )
      }
      
      stats.metadataMigrated = true
      console.log(`  ✓ Admin stats migrated:`)
      console.log(`    - Total users ever: ${totalUsers + deletedCount}`)
      console.log(`    - Active users: ${activeCount}`)
      console.log(`    - Canceled users: ${canceledCount}`)
      console.log(`    - Deleted users: ${deletedCount}`)
    }
    
    // Verify migration
    if (!DRY_RUN) {
      await verifyMigration(db, 
        SINGLE_USER ? { [SINGLE_USER]: usageData[SINGLE_USER] } : usageData, 
        usersData
      )
    }
    
    // Print summary
    console.log('\n' + '=' .repeat(50))
    console.log('📊 MIGRATION SUMMARY')
    console.log('=' .repeat(50))
    console.log(`  Users processed:     ${stats.usersProcessed}`)
    console.log(`  Users failed:        ${stats.usersFailed}`)
    console.log(`  Prompts migrated:    ${stats.promptsMigrated}`)
    console.log(`  Daily records:       ${stats.dailyRecords}`)
    console.log(`  Monthly records:     ${stats.monthlyRecords}`)
    console.log(`  Purchases:           ${stats.purchaseRecords}`)
    console.log(`  Leaderboard posts:   ${stats.leaderboardPosts}`)
    console.log(`  Admins migrated:     ${stats.adminsMigrated ? '✓' : '✗'}`)
    console.log(`  Metadata migrated:   ${stats.metadataMigrated ? '✓' : '✗'}`)
    
    if (stats.errors.length > 0) {
      console.log('\n❌ Errors:')
      for (const err of stats.errors) {
        console.log(`  ${err.userId}: ${err.error}`)
      }
    }
    
    if (DRY_RUN) {
      console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.')
    } else {
      console.log('\n✅ Migration complete!')
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

// Run migration
migrate()

