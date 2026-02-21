/**
 * Backfill Embeddings Script
 * 
 * Generates vector embeddings for all existing conversation_history documents
 * that don't have an embedding yet. Run this once after deploying the embedding system.
 * 
 * Usage:
 *   node scripts/backfill-embeddings.js
 * 
 * Requirements:
 *   - MONGODB_URI and DB_NAME in .env
 *   - OPENAI_API_KEY in .env
 *   - The conversation_embedding_index must be created in Atlas AFTER this script runs
 * 
 * Rate limits:
 *   - Processes in batches of 10 with 1-second delays to avoid OpenAI rate limits
 *   - Safe to re-run (skips documents that already have embeddings)
 */

import { MongoClient } from 'mongodb'
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.DB_NAME || 'Arkitek'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is required in .env')
  process.exit(1)
}

const BATCH_SIZE = 10
const DELAY_MS = 1000 // 1 second between batches

async function generateEmbedding(text) {
  const truncated = text.length > 32000 ? text.substring(0, 32000) : text

  const response = await axios.post(
    'https://api.openai.com/v1/embeddings',
    {
      model: 'text-embedding-3-small',
      input: truncated,
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  )

  return response.data?.data?.[0]?.embedding || null
}

function buildEmbeddingText(doc) {
  let text = `User prompt: ${doc.originalPrompt}`

  if (doc.summary?.text) {
    text += `\nSummary: ${doc.summary.text.substring(0, 500)}`
  } else if (doc.responses?.length > 0) {
    const firstResponse = doc.responses[0]?.text || doc.responses[0]?.modelResponse || ''
    if (firstResponse) {
      text += `\nResponse: ${firstResponse.substring(0, 500)}`
    }
  }

  return text
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log('🔗 Connecting to MongoDB...')
  const client = new MongoClient(MONGODB_URI)
  await client.connect()
  const db = client.db(DB_NAME)
  const collection = db.collection('conversation_history')

  // Find all documents without embeddings
  const docsWithoutEmbeddings = await collection
    .find({ embedding: { $exists: false } })
    .project({ _id: 1, originalPrompt: 1, responses: 1, summary: 1 })
    .toArray()

  const total = docsWithoutEmbeddings.length
  console.log(`📊 Found ${total} conversations without embeddings`)

  if (total === 0) {
    console.log('✅ All conversations already have embeddings!')
    await client.close()
    return
  }

  let processed = 0
  let failed = 0
  let totalTokens = 0

  // Process in batches
  for (let i = 0; i < docsWithoutEmbeddings.length; i += BATCH_SIZE) {
    const batch = docsWithoutEmbeddings.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (doc) => {
        const embeddingText = buildEmbeddingText(doc)
        const embedding = await generateEmbedding(embeddingText)

        if (embedding) {
          await collection.updateOne(
            { _id: doc._id },
            { $set: { embedding, embeddingText } }
          )
          return { id: doc._id, success: true }
        }
        return { id: doc._id, success: false }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        processed++
      } else {
        failed++
        if (result.status === 'rejected') {
          console.error(`  ❌ Failed: ${result.reason?.message || 'Unknown error'}`)
        }
      }
    }

    const pct = Math.round(((i + batch.length) / total) * 100)
    console.log(`  📝 Progress: ${i + batch.length}/${total} (${pct}%) — ${processed} embedded, ${failed} failed`)

    // Rate limit delay between batches
    if (i + BATCH_SIZE < docsWithoutEmbeddings.length) {
      await sleep(DELAY_MS)
    }
  }

  console.log('\n============================================')
  console.log(`✅ Backfill complete!`)
  console.log(`   Total:     ${total}`)
  console.log(`   Embedded:  ${processed}`)
  console.log(`   Failed:    ${failed}`)
  console.log('============================================')
  console.log('\n📌 Next step: Create the Vector Search index in MongoDB Atlas.')
  console.log('   See the instructions provided in your setup guide.')

  await client.close()
}

main().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})

