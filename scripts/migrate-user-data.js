/**
 * One-time migration script: move orphaned usage data from an old user ID to the current one.
 *
 * Old ID (deleted account): b6a60d6e-d07c-49a0-815e-d60c172d0bc2
 * New ID (current account):  71c37f47-73e8-45c5-a064-7edf03d9bcb3
 *
 * Run:  node scripts/migrate-user-data.js
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config()

const OLD_ID = 'b6a60d6e-d07c-49a0-815e-d60c172d0bc2'
const NEW_ID = '71c37f47-73e8-45c5-a064-7edf03d9bcb3'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.DB_NAME || 'Arkitek'

async function migrate() {
  const client = new MongoClient(MONGODB_URI)
  try {
    await client.connect()
    const db = client.db(DB_NAME)
    console.log(`Connected to ${DB_NAME}`)

    // ── usage_data migration ──────────────────────────────────────────
    const usageCol = db.collection('usage_data')
    const oldUsage = await usageCol.findOne({ _id: OLD_ID })
    const newUsage = await usageCol.findOne({ _id: NEW_ID })

    if (!oldUsage) {
      console.log('No usage_data document found for old ID — nothing to migrate.')
    } else {
      console.log('\n── usage_data (old) ──')
      console.log(`  totalTokens: ${oldUsage.totalTokens ?? 0}`)
      console.log(`  totalPrompts: ${oldUsage.totalPrompts ?? 0}`)
      console.log(`  totalInputTokens: ${oldUsage.totalInputTokens ?? 0}`)
      console.log(`  totalOutputTokens: ${oldUsage.totalOutputTokens ?? 0}`)
      console.log(`  streakDays: ${oldUsage.streakDays ?? 0}`)
      console.log(`  earnedBadges: ${(oldUsage.earnedBadges || []).length}`)

      // Build merged document: old data as base, overlay with any non-empty new data
      const { _id: _oldId, updatedAt: _oldUpdated, ...oldData } = oldUsage
      const { _id: _newId, updatedAt: _newUpdated, ...newData } = newUsage || {}

      // For scalar counters, take the larger (old has real data, new is mostly 0)
      const merged = { ...oldData }

      // Preserve any non-zero values from the new doc (in case user generated new activity)
      for (const key of ['totalTokens', 'totalInputTokens', 'totalOutputTokens', 'totalQueries', 'totalPrompts', 'councilPrompts', 'debatePrompts', 'streakDays']) {
        const oldVal = oldData[key] || 0
        const newVal = newData[key] || 0
        merged[key] = Math.max(oldVal, newVal)
      }

      // For objects (monthlyUsage, dailyUsage, models, providers, categories, etc.)
      // merge keys from both, preferring the one with more data
      for (const key of ['monthlyUsage', 'dailyUsage', 'models', 'providers', 'categories', 'categoryPrompts', 'ratings']) {
        const oldObj = oldData[key] || {}
        const newObj = newData[key] || {}
        merged[key] = { ...oldObj, ...newObj }
      }

      // Arrays: concatenate unique entries
      for (const key of ['promptHistory', 'earnedBadges']) {
        const oldArr = oldData[key] || []
        const newArr = newData[key] || []
        if (key === 'earnedBadges') {
          // Deduplicate by badge id/name
          const seen = new Set()
          merged[key] = [...oldArr, ...newArr].filter(b => {
            const id = typeof b === 'string' ? b : (b.id || b.name || JSON.stringify(b))
            if (seen.has(id)) return false
            seen.add(id)
            return true
          })
        } else {
          merged[key] = [...oldArr, ...newArr]
        }
      }

      // Keep complex objects from old if new doesn't have them
      for (const key of ['judgeConversationContext', 'modelConversationContext', 'purchasedCredits']) {
        if (oldData[key] && !newData[key]) {
          merged[key] = oldData[key]
        } else if (newData[key]) {
          merged[key] = newData[key]
        }
      }

      merged.updatedAt = new Date()

      // Write merged data to new user's document
      await usageCol.replaceOne(
        { _id: NEW_ID },
        { _id: NEW_ID, ...merged },
        { upsert: true }
      )
      console.log(`\n✅ usage_data migrated to ${NEW_ID}`)

      // Delete orphaned old document
      await usageCol.deleteOne({ _id: OLD_ID })
      console.log(`🗑️  Deleted orphaned usage_data for ${OLD_ID}`)
    }

    // ── user_stats migration ──────────────────────────────────────────
    const statsCol = db.collection('user_stats')
    const oldStats = await statsCol.findOne({ _id: OLD_ID })
    const newStats = await statsCol.findOne({ _id: NEW_ID })

    if (!oldStats) {
      console.log('\nNo user_stats document found for old ID — nothing to migrate.')
    } else {
      console.log('\n── user_stats (old) ──')
      console.log(`  monthlyUsageCost keys: ${Object.keys(oldStats.monthlyUsageCost || {}).join(', ') || 'none'}`)
      console.log(`  stats.totalTokens: ${oldStats.stats?.totalTokens ?? 'n/a'}`)

      const { _id: _oldId2, ...oldStatsData } = oldStats
      const { _id: _newId2, ...newStatsData } = newStats || {}

      // Merge: prefer old data for populated fields, overlay new data on top
      const mergedStats = { ...oldStatsData }

      // Merge monthly cost maps
      for (const key of ['monthlyUsageCost', 'monthlyOverageBilled']) {
        mergedStats[key] = { ...(oldStatsData[key] || {}), ...(newStatsData[key] || {}) }
      }

      // Merge nested stats object
      if (oldStatsData.stats || newStatsData.stats) {
        const os = oldStatsData.stats || {}
        const ns = newStatsData.stats || {}
        mergedStats.stats = { ...os }
        for (const k of ['totalTokens', 'totalInputTokens', 'totalOutputTokens', 'totalQueries', 'totalPrompts']) {
          mergedStats.stats[k] = Math.max(os[k] || 0, ns[k] || 0)
        }
        // Merge providers and models within stats
        if (os.providers || ns.providers) {
          mergedStats.stats.providers = { ...(os.providers || {}), ...(ns.providers || {}) }
        }
        if (os.models || ns.models) {
          mergedStats.stats.models = { ...(os.models || {}), ...(ns.models || {}) }
        }
      }

      mergedStats.updatedAt = new Date()

      await statsCol.replaceOne(
        { _id: NEW_ID },
        { _id: NEW_ID, ...mergedStats },
        { upsert: true }
      )
      console.log(`✅ user_stats migrated to ${NEW_ID}`)

      await statsCol.deleteOne({ _id: OLD_ID })
      console.log(`🗑️  Deleted orphaned user_stats for ${OLD_ID}`)
    }

    // ── Verify ────────────────────────────────────────────────────────
    const verifyUsage = await usageCol.findOne({ _id: NEW_ID })
    const verifyStats = await statsCol.findOne({ _id: NEW_ID })
    console.log('\n── Verification ──')
    console.log(`usage_data  → totalTokens: ${verifyUsage?.totalTokens ?? 0}, totalPrompts: ${verifyUsage?.totalPrompts ?? 0}, badges: ${(verifyUsage?.earnedBadges || []).length}`)
    console.log(`user_stats  → monthlyUsageCost keys: ${Object.keys(verifyStats?.monthlyUsageCost || {}).join(', ') || 'none'}`)

    // Confirm orphans are gone
    const orphanUsage = await usageCol.findOne({ _id: OLD_ID })
    const orphanStats = await statsCol.findOne({ _id: OLD_ID })
    console.log(`\nOrphaned usage_data (${OLD_ID}): ${orphanUsage ? '⚠️  STILL EXISTS' : '✅ deleted'}`)
    console.log(`Orphaned user_stats (${OLD_ID}): ${orphanStats ? '⚠️  STILL EXISTS' : '✅ deleted'}`)

    console.log('\n🎉 Migration complete!')
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  } finally {
    await client.close()
  }
}

migrate()
