/**
 * Add Admin Script
 * Adds a user to the admin list in MongoDB.
 * 
 * Usage: node add-admin.js USERNAME
 * Example: node add-admin.js raleighgardner
 */

import dotenv from 'dotenv'
dotenv.config()

import db from './database/db.js'

async function addAdmin() {
  const username = process.argv[2]
  
  if (!username) {
    console.error('❌ Usage: node add-admin.js USERNAME')
    console.error('   Example: node add-admin.js raleighgardner')
    process.exit(1)
  }
  
  console.log(`\n👑 Adding "${username}" as admin...`)
  
  try {
    await db.connect()
    
    // Check if user exists
    const user = await db.users.get(username)
    if (!user) {
      console.error(`❌ User "${username}" not found in database.`)
      console.error('   Make sure to sign up first, then run this script.')
      process.exit(1)
    }
    
    // Add to admin list
    await db.admins.add(username)
    
    // Verify
    const isAdmin = await db.admins.isAdmin(username)
    if (isAdmin) {
      console.log(`✅ "${username}" is now an admin!`)
      console.log('\n   You can now access the admin dashboard at /admin')
    } else {
      console.error('❌ Failed to add admin')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await db.close()
    process.exit(0)
  }
}

addAdmin()

