/**
 * Database Reset Script
 * Drops ALL collections in the Arkitek MongoDB database for a fresh start.
 * 
 * Usage: node reset-database.js
 */

import dotenv from 'dotenv'
dotenv.config()

import db from '../database/db.js'

async function resetDatabase(): Promise<void> {
  console.log('\n🗑️  ARKITEK DATABASE RESET')
  console.log('═'.repeat(50))
  
  try {
    // Connect to MongoDB
    const database = await db.connect()
    console.log('✅ Connected to MongoDB')
    
    // List all collections
    const collections = await database.listCollections().toArray()
    console.log(`\n📋 Found ${collections.length} collections:`)
    collections.forEach((c: any) => console.log(`   - ${c.name}`))
    
    // Drop each collection
    console.log('\n🗑️  Dropping all collections...')
    for (const collection of collections) {
      await database.collection(collection.name).drop()
      console.log(`   ✅ Dropped: ${collection.name}`)
    }
    
    console.log('\n✅ Database wiped clean!')
    console.log('═'.repeat(50))
    console.log('\n📝 Next steps:')
    console.log('   1. Restart your server (npm run start)')
    console.log('   2. Sign up as a new user in the app')
    console.log('   3. Run: node add-admin.js YOUR_USERNAME')
    console.log('   4. Subscribe through the app with your new Stripe price')
    console.log('')
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
  } finally {
    await db.close()
    process.exit(0)
  }
}

resetDatabase()
