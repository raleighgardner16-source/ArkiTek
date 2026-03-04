/**
 * One-time migration: extract modelWins from usage_data documents
 * into the new model_wins collection (one document per vote).
 *
 * Safe to run multiple times — uses a unique index on (userId, promptSessionId)
 * so duplicates are silently skipped.
 *
 * Run:  npx tsx scripts/migrate-model-wins.ts
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.DB_NAME || 'Arkitek'

async function migrate(): Promise<void> {
  const client = new MongoClient(MONGODB_URI)
  try {
    await client.connect()
    const db = client.db(DB_NAME)
    console.log(`Connected to ${DB_NAME}`)

    const usageCol = db.collection('usage_data')
    const winsCol = db.collection('model_wins')

    await winsCol.createIndex(
      { userId: 1, promptSessionId: 1 },
      { unique: true },
    )
    await winsCol.createIndex({ userId: 1, timestamp: -1 })
    await winsCol.createIndex({ timestamp: -1 })
    console.log('Indexes ensured on model_wins')

    const cursor = usageCol.find(
      { modelWins: { $exists: true, $ne: {} } },
      { projection: { _id: 1, modelWins: 1 } },
    )

    let usersProcessed = 0
    let winsInserted = 0
    let winsDuplicate = 0

    for await (const doc of cursor) {
      const userId = doc._id as string
      const wins = (doc as any).modelWins || {}
      const entries = Object.entries(wins)

      if (entries.length === 0) continue

      const docs = entries.map(([sessionId, win]: [string, any]) => ({
        userId,
        promptSessionId: sessionId,
        provider: win.provider,
        model: win.model,
        responseId: win.responseId,
        timestamp: new Date(parseInt(sessionId, 10) || Date.now()),
      }))

      try {
        const result = await winsCol.insertMany(docs, { ordered: false })
        winsInserted += result.insertedCount
      } catch (err: any) {
        if (err.code === 11000) {
          const inserted = err.result?.insertedCount ?? 0
          winsInserted += inserted
          winsDuplicate += entries.length - inserted
        } else {
          throw err
        }
      }

      usersProcessed++
      if (usersProcessed % 100 === 0) {
        console.log(`  ... processed ${usersProcessed} users, ${winsInserted} wins inserted`)
      }
    }

    console.log(`\nMigration complete:`)
    console.log(`  Users processed: ${usersProcessed}`)
    console.log(`  Wins inserted:   ${winsInserted}`)
    console.log(`  Duplicates skipped: ${winsDuplicate}`)

    const totalInNewCol = await winsCol.countDocuments()
    console.log(`  Total docs in model_wins: ${totalInNewCol}`)
  } finally {
    await client.close()
    console.log('Connection closed')
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
