# Arktek Database Migration

This guide explains how to migrate from JSON file storage to MongoDB.

## Why Migrate?

Your current `usage.json` file has several scalability issues:

| Problem | Impact | Solution |
|---------|--------|----------|
| Single 16MB document limit | Crashes at ~3,000 prompts per user | One document per prompt |
| Full file read/write on every operation | Slow, uses excessive memory | Atomic updates |
| No query capability | Must load all data to filter | MongoDB indexes |
| Concurrent write conflicts | Data loss | MongoDB transactions |
| No date range queries | Must scan all prompts | Indexed timestamps |

## Database Schema

### Collections

```
users               - Core user data + aggregated stats
prompts             - One document per prompt (the main fix!)
usage_daily         - Daily usage statistics  
usage_monthly       - Monthly usage statistics
purchases           - Individual purchase records
judge_context       - Judge conversation context
```

### Document Sizes (Estimated)

| Collection | Docs/User | Doc Size | Total/User |
|------------|-----------|----------|------------|
| users | 1 | ~5KB | 5KB |
| prompts | ~3,000 | ~2KB | 6MB |
| usage_daily | ~365/year | ~500B | 180KB |
| usage_monthly | ~12/year | ~300B | 3.6KB |
| purchases | ~10 | ~200B | 2KB |
| judge_context | 1 | ~5KB | 5KB |

**Total per user: ~6.2MB** (vs 16MB limit risk)

## Installation

### 1. Install MongoDB

**macOS:**
```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

**Ubuntu/Debian:**
```bash
# Import MongoDB public key
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -

# Add repository
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
```

**Docker:**
```bash
docker run -d --name mongodb -p 27017:27017 \
  -v mongodb_data:/data/db \
  mongo:7.0
```

### 2. Install Node.js Driver

```bash
cd /Users/raleighgardner/Desktop/OG
npm install mongodb
```

### 3. Configure Environment

Add to your `.env` file:

```env
MONGODB_URI=mongodb://localhost:27017
DB_NAME=arktek
```

## Running the Migration

### Step 1: Backup Your Data

```bash
cp ADMIN/usage.json ADMIN/usage.json.backup
cp ADMIN/users.json ADMIN/users.json.backup
```

### Step 2: Preview Migration (Dry Run)

```bash
node database/migrate.js --dry-run
```

This shows what would be migrated without making changes.

### Step 3: Run Full Migration

```bash
node database/migrate.js
```

### Step 4: Verify Migration

```bash
node database/migrate.js --verify
```

### Migration Options

```bash
# Full migration
node database/migrate.js

# Dry run (preview only)
node database/migrate.js --dry-run

# Verify existing migration
node database/migrate.js --verify

# Migrate single user (for testing)
node database/migrate.js --user=raleighgardner
```

## Updating server.js

See `server-migration-guide.js` for detailed before/after code examples.

### Quick Start

1. Add import at top of server.js:
```javascript
import db from './database/db.js'
```

2. Connect on startup:
```javascript
// After creating Express app
await db.connect()
```

3. Replace `readUsage()`/`writeUsage()` patterns:

**Before:**
```javascript
const usage = readUsage()
const userData = usage[userId]
userData.totalTokens += tokens
writeUsage(usage)
```

**After:**
```javascript
await db.users.updateStats(userId, { totalTokens: tokens })
```

4. Replace `trackUsage()`:

**Before:**
```javascript
trackUsage(userId, provider, model, inputTokens, outputTokens)
```

**After:**
```javascript
await db.trackUsage(userId, provider, model, inputTokens, outputTokens)
```

## Database API Reference

### Users

```javascript
// Get user
const user = await db.users.get('username')

// Create user  
await db.users.create('username', { email: 'user@email.com', password: 'hashed' })

// Update stats (atomic increment)
await db.users.updateStats('username', { 
  totalTokens: 100,
  totalPrompts: 1 
})

// Update Stripe info
await db.users.updateStripe('username', { 
  stripeCustomerId: 'cus_xxx' 
})

// Delete user and all data
await db.users.delete('username')
```

### Prompts

```javascript
// Save new prompt
const promptId = await db.prompts.save('username', {
  text: 'What is AI?',
  category: 'Technology',
  responses: [...],
  summary: {...},
  facts: [...],
  sources: [...]
})

// Get recent prompts
const recent = await db.prompts.getRecent('username', 20)

// Get by category
const techPrompts = await db.prompts.getByCategory('username', 'Technology')

// Get by date range
const thisWeek = await db.prompts.getByDateRange('username', 
  '2026-02-01', 
  '2026-02-07'
)

// Get by model used
const gptPrompts = await db.prompts.getByModel('username', 'openai-gpt-5.2')

// Pagination
const { prompts, total, totalPages } = await db.prompts.getPaginated('username', 1, 20)
```

### Usage Statistics

```javascript
// Update daily usage
await db.usage.updateDaily('username', '2026-02-05', {
  inputTokens: 1000,
  outputTokens: 500,
  prompts: 1
})

// Update monthly usage
await db.usage.updateMonthly('username', '2026-02', {
  tokens: 1500,
  prompts: 1,
  provider: 'openai'
})

// Get monthly summary
const monthly = await db.usage.getMonthly('username', '2026-02')

// Get daily range
const daily = await db.usage.getDailyRange('username', '2026-02-01', '2026-02-07')

// Get full usage summary
const summary = await db.usage.getSummary('username')
```

### Purchases

```javascript
// Save purchase
await db.purchases.save('username', {
  amount: 25,
  fee: 1.25,
  total: 26.25,
  paymentIntentId: 'pi_xxx'
})

// Get history
const history = await db.purchases.getHistory('username')

// Get remaining credits
const credits = await db.purchases.getRemainingCredits('username')
```

### Judge Context

```javascript
// Get context
const context = await db.judgeContext.get('username')

// Add context (FIFO, max 5)
await db.judgeContext.add('username', {
  response: 'Grok response text...',
  originalPrompt: 'User question',
  isFull: true
})

// Clear context
await db.judgeContext.clear('username')
```

### Combined Tracking

```javascript
// Track token usage (updates all relevant collections)
await db.trackUsage('username', 'openai', 'gpt-5.2', 1000, 500)

// Track prompt submission
await db.trackPrompt('username')

// Track search query
await db.trackQuery('username')
```

## Verification Queries

After migration, run these in MongoDB shell (`mongosh`) to verify:

```javascript
// Connect
use arktek

// Check document counts
db.users.countDocuments()
db.prompts.countDocuments()
db.usage_daily.countDocuments()
db.usage_monthly.countDocuments()
db.purchases.countDocuments()

// Check specific user
db.users.findOne({ _id: 'raleighgardner' })

// Check prompts for user
db.prompts.find({ userId: 'raleighgardner' }).count()

// Check token totals match
db.users.aggregate([
  { $group: { _id: null, total: { $sum: '$stats.totalTokens' } } }
])

// Check indexes exist
db.prompts.getIndexes()

// Sample prompt document
db.prompts.findOne({ userId: 'raleighgardner' }, { text: 1, category: 1, timestamp: 1 })
```

## Rollback

If something goes wrong:

1. Stop the server
2. Restore JSON backups:
```bash
cp ADMIN/usage.json.backup ADMIN/usage.json
cp ADMIN/users.json.backup ADMIN/users.json
```
3. Remove db import from server.js
4. Restart with JSON mode

MongoDB data remains intact and can be re-verified later.

## Performance Comparison

| Operation | JSON File | MongoDB |
|-----------|-----------|---------|
| Get user stats | 50-200ms | 1-5ms |
| Add prompt | 100-500ms | 5-10ms |
| Get recent 20 prompts | 50-200ms | 2-5ms |
| Query by category | 100-500ms | 3-8ms |
| Query by date range | 100-500ms | 3-8ms |
| Update token count | 100-500ms | 2-5ms |

## Troubleshooting

### Connection Failed

```
Error: connect ECONNREFUSED 127.0.0.1:27017
```

MongoDB isn't running. Start it:
```bash
# macOS
brew services start mongodb-community@7.0

# Linux
sudo systemctl start mongod

# Docker
docker start mongodb
```

### Permission Denied

```
Error: EACCES: permission denied
```

Check MongoDB data directory permissions:
```bash
sudo chown -R mongodb:mongodb /var/lib/mongodb
```

### Duplicate Key Error

```
E11000 duplicate key error
```

This means the migration was partially run. Use `--verify` to check status, or drop collections and re-migrate:
```javascript
use arktek
db.dropDatabase()
```

### Memory Issues

If migration crashes on large datasets:
```bash
# Increase Node memory limit
NODE_OPTIONS=--max-old-space-size=4096 node database/migrate.js
```

## Next Steps

After migration is complete:

1. ✅ Run verification queries
2. ✅ Update server.js with new db layer
3. ✅ Test all API endpoints
4. ⏳ Monitor for a week with JSON backup
5. ⏳ Remove JSON file operations from server.js
6. ⏳ Delete backup files (optional)

## Files

```
database/
├── README.md                    # This file
├── schema.js                    # Collection schemas and index definitions
├── migrate.js                   # Migration script
├── db.js                        # Database access layer
└── server-migration-guide.js    # Before/after code examples
```

