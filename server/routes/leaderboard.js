import { Router } from 'express'
import db from '../../database/db.js'
import { createNotification } from './notifications.js'

const router = Router()

// ==================== LEADERBOARD ENDPOINTS ====================

// Submit a prompt to the leaderboard
router.post('/submit', async (req, res) => {
  const userId = req.userId
  console.log('[Leaderboard] Submit endpoint hit:', { userId, hasPromptText: !!req.body?.promptText })
  try {
    const { promptText, category, responses, summary, facts, sources, description, visibility } = req.body
    
    if (!promptText || !promptText.trim()) {
      console.log('[Leaderboard] Missing required fields:', { promptText: !!promptText })
      return res.status(400).json({ error: 'promptText is required' })
    }
    
    const user = await db.users.get(userId)
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Check for duplicate submission (same user, same prompt text)
    const userPosts = await db.leaderboardPosts.getByUser(userId)
    const normalizedPrompt = promptText.trim().toLowerCase()
    const isDuplicate = userPosts.some(
      p => p.promptText && p.promptText.trim().toLowerCase() === normalizedPrompt
    )
    if (isDuplicate) {
      return res.status(409).json({ error: 'You have already posted this prompt to the leaderboard', alreadyPosted: true })
    }
    
    const postData = {
      userId,
      username: user.username || 'Anonymous',
      promptText: promptText.trim(),
      category: category || 'General Knowledge/Other',
      visibility: visibility || 'public',
    }
    
    if (responses && Array.isArray(responses)) postData.responses = responses
    if (summary) postData.summary = summary
    if (facts && Array.isArray(facts)) postData.facts = facts
    if (sources && Array.isArray(sources)) postData.sources = sources
    if (description && typeof description === 'string' && description.trim()) {
      postData.description = description.trim()
    }
    
    const promptId = await db.leaderboardPosts.submit(postData)
    
    console.log(`[Leaderboard] Prompt submitted by user ${userId}: ${promptId}`)
    res.json({ success: true, promptId })
  } catch (error) {
    console.error('[Leaderboard] Error submitting prompt:', error)
    res.status(500).json({ error: 'Failed to submit prompt to leaderboard' })
  }
})

// Get all leaderboard prompts (sorted by likes)
// Supports query parameters:
// - ?filter=today - Today's favorites (all prompts from today)
// - ?filter=alltime - All time favorites (top 15 most liked)
// - ?filter=profile&userId=xxx - User's profile (all prompts by user)
// - ?filter=fyp&userId=xxx - For you prompts (mix of recent + popular; excludes user's own if userId provided)
// - ?filter=myfeed&userId=xxx - Posts from users the current user follows, sorted by recency
// - ?filter=browse&userId=xxx - Posts from users the current user does NOT follow (discovery feed)
router.get('/', async (req, res) => {
  try {
    const { filter } = req.query
    const userId = req.userId
    
    // Load all posts from DB + build users map for enrichment
    const dbInstance = await db.getDb()
    const allPosts = await dbInstance.collection('leaderboard_posts').find({}).sort({ createdAt: -1 }).toArray()
    const allUsers = await db.users.getAll()
    const usersMap = {}
    for (const u of allUsers) usersMap[u._id] = u
    
    // Map prompts with user info, profile images on comments/replies, and like count
    let prompts = allPosts.map(prompt => {
      const user = usersMap[prompt.userId]
      const enrichedComments = (prompt.comments || []).map(comment => {
        const commenter = usersMap[comment.userId]
        return {
          ...comment,
          profileImage: commenter?.profileImage || null,
          replies: (comment.replies || []).map(reply => {
            const replier = usersMap[reply.userId]
            return { ...reply, profileImage: replier?.profileImage || null }
          }),
        }
      })
      return {
        ...prompt,
        id: prompt._id,
        username: user?.isAnonymous ? 'Anonymous' : (user?.username || 'Anonymous'),
        profileImage: user?.profileImage || null,
        likeCount: prompt.likes?.length || prompt.likeCount || 0,
        comments: enrichedComments,
      }
    })
    
    // Filter out followers-only posts for non-followers
    if (userId) {
      const viewer = usersMap[userId]
      prompts = prompts.filter(prompt => {
        if (prompt.visibility !== 'followers') return true
        if (prompt.userId === userId) return true
        return (viewer?.following || []).includes(prompt.userId)
      })
    } else {
      prompts = prompts.filter(prompt => prompt.visibility !== 'followers')
    }

    // Apply filters based on query parameter
    if (filter === 'today') {
      // Today's Favorites: All prompts from today
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayEnd = new Date(today)
      todayEnd.setHours(23, 59, 59, 999)
      
      prompts = prompts.filter(prompt => {
        const promptDate = new Date(prompt.createdAt)
        return promptDate >= today && promptDate <= todayEnd
      })
      
      // Sort by like count (descending), then by creation date (newest first)
      prompts.sort((a, b) => {
        if (b.likeCount !== a.likeCount) {
          return b.likeCount - a.likeCount
        }
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
    } else if (filter === 'alltime') {
      // All Time Favorites: Top 15 most liked prompts of all time
      prompts.sort((a, b) => {
        if (b.likeCount !== a.likeCount) {
          return b.likeCount - a.likeCount
        }
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
      
      // Take only top 15
      prompts = prompts.slice(0, 15)
    } else if (filter === 'fyp') {
      // For You: Mix of recency + likes, optionally exclude user's own prompts
      if (userId) {
        prompts = prompts.filter(prompt => prompt.userId !== userId)
      }

      prompts = prompts
        .map((prompt) => {
          const createdAt = new Date(prompt.createdAt).getTime()
          const hoursSince = Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60))
          const recencyBoost = Math.max(0, (48 - hoursSince) / 48) // boost for ~2 days
          const score = (prompt.likeCount || 0) * 2 + recencyBoost

          return { ...prompt, score }
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          return new Date(b.createdAt) - new Date(a.createdAt)
        })
    } else if (filter === 'myfeed' && userId) {
      // My Feed: Posts from users the current user follows, sorted by recency
      const currentUser = usersMap[userId]
      const followingList = currentUser?.following || []

      prompts = prompts.filter(prompt => prompt.userId === userId || followingList.includes(prompt.userId))

      prompts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    } else if (filter === 'browse' && userId) {
      // Browse: Discovery feed — posts from users the current user does NOT follow (and not their own)
      const currentUser = usersMap[userId]
      const followingList = currentUser?.following || []
      const excludeSet = new Set([...followingList, userId])

      prompts = prompts.filter(prompt => !excludeSet.has(prompt.userId))

      prompts = prompts
        .map((prompt) => {
          const createdAt = new Date(prompt.createdAt).getTime()
          const hoursSince = Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60))
          const recencyBoost = Math.max(0, (48 - hoursSince) / 48)
          const score = (prompt.likeCount || 0) * 2 + recencyBoost
          return { ...prompt, score }
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          return new Date(b.createdAt) - new Date(a.createdAt)
        })
    } else if (filter === 'profile' && userId) {
      // My Profile: All prompts submitted by the user
      prompts = prompts.filter(prompt => prompt.userId === userId)
      
      // Sort by creation date (newest first)
      prompts.sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
    } else {
      // Default: Sort by like count (descending), then by creation date (newest first)
      prompts.sort((a, b) => {
        if (b.likeCount !== a.likeCount) {
          return b.likeCount - a.likeCount
        }
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
    }
    
    res.json({ prompts })
  } catch (error) {
    console.error('[Leaderboard] Error fetching leaderboard:', error)
    res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }
})

// Like/unlike a prompt
router.post('/like', async (req, res) => {
  try {
    const userId = req.userId
    const { promptId } = req.body
    
    if (!promptId) {
      return res.status(400).json({ error: 'promptId is required' })
    }
    
    const result = await db.leaderboardPosts.toggleLike(promptId, userId)
    
    if (result.liked) {
      console.log(`[Leaderboard] User ${userId} liked prompt ${promptId}`)
      const liker = await db.users.get(userId)
      const dbInstance = await db.getDb()
      const post = await dbInstance.collection('leaderboard_posts').findOne({ _id: promptId })
      if (post && post.userId !== userId) {
        createNotification({
          userId: post.userId,
          type: 'like',
          fromUserId: userId,
          fromUsername: liker?.username || 'Someone',
          fromProfileImage: liker?.profileImage || null,
          promptId,
          promptText: (post.promptText || '').substring(0, 80),
        })
      }
    } else {
      console.log(`[Leaderboard] User ${userId} unliked prompt ${promptId}`)
    }
    
    res.json({ 
      success: true, 
      liked: result.liked,
      likeCount: result.likeCount 
    })
  } catch (error) {
    console.error('[Leaderboard] Error liking prompt:', error)
    res.status(500).json({ error: 'Failed to like/unlike prompt' })
  }
})

// Delete a prompt (only by owner)
router.delete('/delete/:promptId', async (req, res) => {
  try {
    const { promptId } = req.params
    const userId = req.userId
    
    if (!promptId) {
      return res.status(400).json({ error: 'promptId is required' })
    }
    
    const deleted = await db.leaderboardPosts.delete(promptId, userId)
    
    if (!deleted) {
      return res.status(404).json({ error: 'Prompt not found or you can only delete your own prompts' })
    }
    
    console.log(`[Leaderboard] User ${userId} deleted prompt ${promptId}`)
    
    res.json({ 
      success: true, 
      message: 'Prompt deleted successfully' 
    })
  } catch (error) {
    console.error('[Leaderboard] Error deleting prompt:', error)
    res.status(500).json({ error: 'Failed to delete prompt' })
  }
})

// Get user leaderboard stats (wins, notifications)
router.get('/user-stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const user = await db.users.get(userId)
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    const dbInstance = await db.getDb()
    const allPosts = await dbInstance.collection('leaderboard_posts').find({}).toArray()
    
    // Get all prompts by this user
    const userPrompts = allPosts.filter(p => p.userId === userId)
    
    // Calculate wins (prompts that were #1 at some point or currently #1)
    const sortedByLikes = [...allPosts].sort((a, b) => {
      const aLikes = a.likes?.length || 0
      const bLikes = b.likes?.length || 0
      if (bLikes !== aLikes) return bLikes - aLikes
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
    
    const wins = []
    userPrompts.forEach(prompt => {
      const promptLikes = prompt.likes?.length || 0
      // Check if this prompt is currently #1 or was #1
      if (sortedByLikes[0]?._id === prompt._id && promptLikes > 0) {
        wins.push({
          promptId: prompt._id,
          promptText: prompt.promptText,
          promptTextShort: prompt.promptText.substring(0, 80) + (prompt.promptText.length > 80 ? '...' : ''),
          category: prompt.category || 'General Knowledge/Other',
          likes: promptLikes,
          date: prompt.createdAt,
        })
      }
    })
    
    // Get recent notifications (likes on user's prompts)
    const notifications = []
    userPrompts.forEach(prompt => {
      const recentLikes = prompt.likes || []
      if (recentLikes.length > 0) {
        // Get the most recent like timestamp (we'll use createdAt as approximation)
        notifications.push({
          type: 'like',
          promptId: prompt._id,
          promptText: prompt.promptText.substring(0, 50) + '...',
          count: recentLikes.length,
          timestamp: prompt.createdAt,
        })
      }
    })
    
    // Sort notifications by timestamp (most recent first)
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    
    // Count total comments and replies made by this user across all prompts
    let totalComments = 0
    allPosts.forEach(prompt => {
      (prompt.comments || []).forEach(comment => {
        if (comment.userId === userId) totalComments++
        ;(comment.replies || []).forEach(reply => {
          if (reply.userId === userId) totalComments++
        })
      })
    })
    
    res.json({
      wins: wins.sort((a, b) => new Date(b.date) - new Date(a.date)),
      winCount: wins.length,
      notifications: notifications.slice(0, 10), // Last 10 notifications
      totalLikes: userPrompts.reduce((sum, p) => sum + (p.likes?.length || 0), 0),
      totalPrompts: userPrompts.length,
      totalComments,
    })
  } catch (error) {
    console.error('[Leaderboard] Error fetching user stats:', error)
    res.status(500).json({ error: 'Failed to fetch user stats' })
  }
})

// ==================== COMMENT ENDPOINTS ====================

// Add a comment to a prompt
router.post('/comment', async (req, res) => {
  try {
    const userId = req.userId
    const { promptId, commentText } = req.body
    
    if (!promptId || !commentText || !commentText.trim()) {
      return res.status(400).json({ error: 'promptId and commentText are required' })
    }
    
    const user = await db.users.get(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    const commentId = await db.leaderboardPosts.addComment(promptId, {
      userId,
      username: user.username || 'Anonymous',
      text: commentText.trim(),
    })
    
    const comment = {
      id: commentId,
      userId,
      username: user.username || 'Anonymous',
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
      replies: [],
    }
    
    // Notify prompt owner about the comment
    const dbInst = await db.getDb()
    const post = await dbInst.collection('leaderboard_posts').findOne({ _id: promptId })
    if (post && post.userId !== userId) {
      createNotification({
        userId: post.userId,
        type: 'comment',
        fromUserId: userId,
        fromUsername: user.username || 'Someone',
        fromProfileImage: user.profileImage || null,
        promptId,
        promptText: (post.promptText || '').substring(0, 80),
        commentText: commentText.trim().substring(0, 120),
      })
    }
    
    console.log(`[Leaderboard] Comment added by user ${userId} on prompt ${promptId}`)
    res.json({ success: true, comment })
  } catch (error) {
    console.error('[Leaderboard] Error adding comment:', error)
    res.status(500).json({ error: 'Failed to add comment' })
  }
})

// Reply to a comment
router.post('/comment/reply', async (req, res) => {
  try {
    const userId = req.userId
    const { promptId, commentId, replyText } = req.body
    
    if (!promptId || !commentId || !replyText || !replyText.trim()) {
      return res.status(400).json({ error: 'promptId, commentId, and replyText are required' })
    }
    
    const user = await db.users.get(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    const replyId = await db.leaderboardPosts.addReply(promptId, commentId, {
      userId,
      username: user.username || 'Anonymous',
      text: replyText.trim(),
    })
    
    const reply = { id: replyId, userId, username: user.username || 'Anonymous', text: replyText.trim(), createdAt: new Date().toISOString() }
    
    // Notify the original commenter about the reply
    const dbInstance = await db.getDb()
    const post = await dbInstance.collection('leaderboard_posts').findOne({ _id: promptId })
    if (post) {
      const comment = (post.comments || []).find(c => c.id === commentId)
      if (comment && comment.userId !== userId) {
        createNotification({
          userId: comment.userId,
          type: 'reply',
          fromUserId: userId,
          fromUsername: user.username || 'Someone',
          fromProfileImage: user.profileImage || null,
          promptId,
          promptText: (post.promptText || '').substring(0, 80),
          commentText: replyText.trim().substring(0, 120),
        })
      }
    }
    
    console.log(`[Leaderboard] Reply added by user ${userId} to comment ${commentId}`)
    res.json({ success: true, reply })
  } catch (error) {
    console.error('[Leaderboard] Error adding reply:', error)
    res.status(500).json({ error: 'Failed to add reply' })
  }
})

// Delete a reply (only by owner)
router.delete('/comment/reply/delete/:replyId', async (req, res) => {
  try {
    const { replyId } = req.params
    const userId = req.userId
    const { promptId, commentId } = req.body
    
    if (!promptId || !commentId || !replyId) {
      return res.status(400).json({ error: 'promptId, commentId, and replyId are required' })
    }
    
    const dbInstance = await db.getDb()
    const post = await dbInstance.collection('leaderboard_posts').findOne({ _id: promptId })
    
    if (!post || !post.comments) {
      return res.status(404).json({ error: 'Prompt not found' })
    }
    
    const comment = post.comments.find(c => c.id === commentId)
    if (!comment || !comment.replies) {
      return res.status(404).json({ error: 'Comment not found' })
    }
    
    const reply = comment.replies.find(r => r.id === replyId)
    if (!reply) {
      return res.status(404).json({ error: 'Reply not found' })
    }
    
    if (reply.userId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own replies' })
    }
    
    await dbInstance.collection('leaderboard_posts').updateOne(
      { _id: promptId, 'comments.id': commentId },
      { $pull: { 'comments.$.replies': { id: replyId } } }
    )
    
    console.log(`[Leaderboard] User ${userId} deleted reply ${replyId}`)
    
    res.json({ 
      success: true, 
      message: 'Reply deleted successfully' 
    })
  } catch (error) {
    console.error('[Leaderboard] Error deleting reply:', error)
    res.status(500).json({ error: 'Failed to delete reply' })
  }
})

// Delete a comment (only by owner)
router.delete('/comment/delete/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params
    const userId = req.userId
    const { promptId } = req.body
    
    if (!promptId || !commentId) {
      return res.status(400).json({ error: 'promptId and commentId are required' })
    }
    
    const deleted = await db.leaderboardPosts.deleteComment(promptId, commentId, userId)
    
    if (!deleted) {
      return res.status(404).json({ error: 'Comment not found or not owned by you' })
    }
    
    console.log(`[Leaderboard] User ${userId} deleted comment ${commentId}`)
    
    res.json({ 
      success: true, 
      message: 'Comment deleted successfully' 
    })
  } catch (error) {
    console.error('[Leaderboard] Error deleting comment:', error)
    res.status(500).json({ error: 'Failed to delete comment' })
  }
})

// Like/unlike a comment
router.post('/comment/like', async (req, res) => {
  try {
    const userId = req.userId
    const { promptId, commentId } = req.body
    
    if (!promptId || !commentId) {
      return res.status(400).json({ error: 'promptId and commentId are required' })
    }
    
    const result = await db.leaderboardPosts.toggleCommentLike(promptId, commentId, userId)
    
    console.log(`[Leaderboard] User ${userId} ${result.liked ? 'liked' : 'unliked'} comment ${commentId}`)
    
    res.json({ 
      success: true, 
      liked: result.liked,
      likeCount: result.likeCount 
    })
  } catch (error) {
    console.error('[Leaderboard] Error liking comment:', error)
    res.status(500).json({ error: 'Failed to like/unlike comment' })
  }
})

export default router
