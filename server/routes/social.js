import { Router } from 'express'
import db from '../../database/db.js'
import { createNotification } from './notifications.js'

export const profileRouter = Router()
export const usersRouter = Router()

// ==================== PROFILE ENDPOINTS ====================

// Get a user's public profile (visible to other users)
profileRouter.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const viewerId = req.userId

    const [user, userUsage, userPosts] = await Promise.all([
      db.users.get(userId),
      db.usage.getOrDefault(userId),
      db.leaderboardPosts.getByUser(userId),
    ])

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const totalLikes = userPosts.reduce((sum, p) => sum + (p.likes?.length || 0), 0)

    // Count total comments by this user across all posts
    const dbInstance = await db.getDb()
    const allPostsForComments = await dbInstance.collection('leaderboard_posts').find({
      $or: [
        { 'comments.userId': userId },
        { 'comments.replies.userId': userId },
      ]
    }).toArray()
    let totalComments = 0
    allPostsForComments.forEach(prompt => {
      (prompt.comments || []).forEach(comment => {
        if (comment.userId === userId) totalComments++
        ;(comment.replies || []).forEach(reply => {
          if (reply.userId === userId) totalComments++
        })
      })
    })

    const followers = user.followers || []
    const following = user.following || []
    const isFollowing = viewerId ? followers.includes(viewerId) : false
    const hasRequestedFollow = viewerId ? (user.followRequests || []).includes(viewerId) : false

    res.json({
      userId,
      username: user.isAnonymous ? 'Anonymous' : (user.username || 'Anonymous'),
      firstName: user.isAnonymous ? null : (user.firstName || null),
      bio: user.bio || '',
      profileImage: user.profileImage || null,
      isAnonymous: user.isAnonymous || false,
      isPrivate: user.isPrivate || false,
      createdAt: user.createdAt || null,
      followersCount: followers.length,
      followingCount: following.length,
      isFollowing,
      hasRequestedFollow,
      earnedBadges: userUsage.earnedBadges || [],
      leaderboard: {
        totalPosts: userPosts.length,
        totalLikes,
        totalComments,
      },
      posts: await Promise.all(userPosts.map(async p => {
        // Collect user IDs from comments/replies for enrichment
        const commentUserIds = new Set()
        for (const c of (p.comments || [])) {
          commentUserIds.add(c.userId)
          for (const r of (c.replies || [])) commentUserIds.add(r.userId)
        }
        const commentUsers = commentUserIds.size > 0
          ? await dbInstance.collection('users').find({ _id: { $in: [...commentUserIds] } }).project({ _id: 1, profileImage: 1 }).toArray()
          : []
        const cuMap = {}
        for (const cu of commentUsers) cuMap[cu._id] = cu
        
        return {
          id: p._id,
          promptText: p.promptText,
          category: p.category,
          likeCount: p.likes?.length || 0,
          likes: p.likes || [],
          createdAt: p.createdAt,
          comments: (p.comments || []).map(c => ({
            ...c,
            profileImage: cuMap[c.userId]?.profileImage || null,
            replies: (c.replies || []).map(r => ({
              ...r,
              profileImage: cuMap[r.userId]?.profileImage || null,
            })),
          })),
          responses: p.responses || [],
          summary: p.summary || null,
          sources: p.sources || [],
          facts: p.facts || [],
        }
      })),
    })
  } catch (error) {
    console.error('[Profile] Error fetching public profile:', error)
    res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// Update user profile (bio, profileImage, isAnonymous, isPrivate)
profileRouter.put('/:userId', async (req, res) => {
  try {
    const userId = req.userId
    const { bio, profileImage, isAnonymous, isPrivate } = req.body

    const user = await db.users.get(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const updates = {}
    if (bio !== undefined) {
      updates.bio = (bio || '').substring(0, 300)
    }
    if (profileImage !== undefined) {
      if (profileImage && profileImage.length > 500000) {
        return res.status(400).json({ error: 'Profile image too large. Please use a smaller image.' })
      }
      updates.profileImage = profileImage
    }
    if (isAnonymous !== undefined) {
      updates.isAnonymous = !!isAnonymous
    }
    if (isPrivate !== undefined) {
      const wasPrivate = !!user.isPrivate
      updates.isPrivate = !!isPrivate
      if (wasPrivate && !updates.isPrivate && user.followRequests && user.followRequests.length > 0) {
        const dbInstance = await db.getDb()
        for (const requesterId of user.followRequests) {
          await dbInstance.collection('users').updateOne({ _id: requesterId }, {
            $addToSet: { following: userId },
            $pull: { sentFollowRequests: userId },
          })
        }
        updates.followRequests = []
        updates.followers = [...new Set([...(user.followers || []), ...user.followRequests])]
        await dbInstance.collection('users').updateOne({ _id: userId }, {
          $set: { followRequests: [], followers: updates.followers },
        })
        console.log(`[Profile] Auto-approved ${user.followRequests.length} pending follow requests for ${userId} (switched to public)`)
      }
    }

    await db.users.update(userId, updates)

    console.log(`[Profile] Updated profile for user ${userId}:`, Object.keys(updates))
    res.json({ success: true, ...updates })
  } catch (error) {
    console.error('[Profile] Error updating profile:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// ==================== USERS / SOCIAL ENDPOINTS ====================

// Search users by username — must be registered before param routes
usersRouter.get('/search', async (req, res) => {
  try {
    const { q } = req.query
    if (!q || q.trim().length < 1) {
      return res.json({ users: [] })
    }

    const query = q.trim().toLowerCase()
    const allUsers = await db.users.getAll()
    const results = []

    for (const user of allUsers) {
      if (user.isAnonymous) continue
      const username = (user.username || '').toLowerCase()
      const firstName = (user.firstName || '').toLowerCase()
      const lastName = (user.lastName || '').toLowerCase()
      if (username.includes(query) || firstName.includes(query) || lastName.includes(query)) {
        results.push({
          userId: user._id,
          username: user.username || 'Anonymous',
          firstName: user.firstName || null,
          profileImage: user.profileImage || null,
          bio: (user.bio || '').substring(0, 100),
          followersCount: (user.followers || []).length,
        })
      }
      if (results.length >= 20) break
    }

    results.sort((a, b) => {
      const aExact = a.username.toLowerCase() === query
      const bExact = b.username.toLowerCase() === query
      if (aExact && !bExact) return -1
      if (!aExact && bExact) return 1
      return b.followersCount - a.followersCount
    })

    res.json({ users: results })
  } catch (error) {
    console.error('[Search] Error searching users:', error)
    res.status(500).json({ error: 'Failed to search users' })
  }
})

// Follow a user (or send a follow request if target is private)
usersRouter.post('/:targetUserId/follow', async (req, res) => {
  try {
    const { targetUserId } = req.params
    const userId = req.userId

    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId is required' })
    }
    if (userId === targetUserId) {
      return res.status(400).json({ error: 'You cannot follow yourself' })
    }

    const [currentUser, targetUser] = await Promise.all([
      db.users.get(userId),
      db.users.get(targetUserId),
    ])

    if (!currentUser || !targetUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    if ((currentUser.following || []).includes(targetUserId)) {
      return res.json({ success: true, status: 'following', alreadyFollowing: true })
    }

    const dbInst = await db.getDb()

    // If target account is private, create a follow request instead
    if (targetUser.isPrivate) {
      if ((targetUser.followRequests || []).includes(userId)) {
        return res.json({ success: true, status: 'requested', alreadyRequested: true })
      }

      await Promise.all([
        dbInst.collection('users').updateOne({ _id: targetUserId }, { $addToSet: { followRequests: userId } }),
        dbInst.collection('users').updateOne({ _id: userId }, { $addToSet: { sentFollowRequests: targetUserId } }),
      ])

      createNotification({
        userId: targetUserId,
        type: 'follow_request',
        fromUserId: userId,
        fromUsername: currentUser.username || 'Someone',
        fromProfileImage: currentUser.profileImage || null,
      })

      console.log(`[Social] User ${userId} sent follow request to private account ${targetUserId}`)
      return res.json({ success: true, status: 'requested' })
    }

    // Public account — follow directly
    await Promise.all([
      dbInst.collection('users').updateOne({ _id: userId }, { $addToSet: { following: targetUserId } }),
      dbInst.collection('users').updateOne({ _id: targetUserId }, { $addToSet: { followers: userId } }),
    ])

    createNotification({
      userId: targetUserId,
      type: 'follow',
      fromUserId: userId,
      fromUsername: currentUser.username || 'Someone',
      fromProfileImage: currentUser.profileImage || null,
    })

    const updatedTarget = await db.users.get(targetUserId)
    const updatedCurrent = await db.users.get(userId)
    console.log(`[Social] User ${userId} followed ${targetUserId}`)
    res.json({
      success: true,
      status: 'following',
      followersCount: (updatedTarget?.followers || []).length,
      followingCount: (updatedCurrent?.following || []).length,
    })
  } catch (error) {
    console.error('[Social] Error following user:', error)
    res.status(500).json({ error: 'Failed to follow user' })
  }
})

// Unfollow a user (or cancel a pending follow request)
usersRouter.post('/:targetUserId/unfollow', async (req, res) => {
  try {
    const { targetUserId } = req.params
    const userId = req.userId

    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId is required' })
    }

    const dbInst = await db.getDb()
    await Promise.all([
      dbInst.collection('users').updateOne({ _id: userId }, {
        $pull: { following: targetUserId, sentFollowRequests: targetUserId },
      }),
      dbInst.collection('users').updateOne({ _id: targetUserId }, {
        $pull: { followers: userId, followRequests: userId },
      }),
    ])

    const [updatedTarget, updatedCurrent] = await Promise.all([
      db.users.get(targetUserId),
      db.users.get(userId),
    ])

    console.log(`[Social] User ${userId} unfollowed/cancelled request to ${targetUserId}`)
    res.json({
      success: true,
      followersCount: (updatedTarget?.followers || []).length,
      followingCount: (updatedCurrent?.following || []).length,
    })
  } catch (error) {
    console.error('[Social] Error unfollowing user:', error)
    res.status(500).json({ error: 'Failed to unfollow user' })
  }
})

// Accept a follow request
usersRouter.post('/:targetUserId/follow/accept', async (req, res) => {
  try {
    const targetUserId = req.userId
    const { requesterId } = req.body

    if (!requesterId) {
      return res.status(400).json({ error: 'requesterId is required' })
    }

    const owner = await db.users.get(targetUserId)
    if (!owner) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!owner.followRequests || !owner.followRequests.includes(requesterId)) {
      return res.status(400).json({ error: 'No pending follow request from this user' })
    }

    const dbInst = await db.getDb()
    await Promise.all([
      dbInst.collection('users').updateOne({ _id: targetUserId }, {
        $pull: { followRequests: requesterId },
        $addToSet: { followers: requesterId },
      }),
      dbInst.collection('users').updateOne({ _id: requesterId }, {
        $pull: { sentFollowRequests: targetUserId },
        $addToSet: { following: targetUserId },
      }),
    ])

    createNotification({
      userId: requesterId,
      type: 'follow_accepted',
      fromUserId: targetUserId,
      fromUsername: owner.username || 'Someone',
      fromProfileImage: owner.profileImage || null,
    })

    const updatedOwner = await db.users.get(targetUserId)
    console.log(`[Social] User ${targetUserId} accepted follow request from ${requesterId}`)
    res.json({ success: true, followersCount: (updatedOwner?.followers || []).length })
  } catch (error) {
    console.error('[Social] Error accepting follow request:', error)
    res.status(500).json({ error: 'Failed to accept follow request' })
  }
})

// Deny a follow request
usersRouter.post('/:targetUserId/follow/deny', async (req, res) => {
  try {
    const targetUserId = req.userId
    const { requesterId } = req.body

    if (!requesterId) {
      return res.status(400).json({ error: 'requesterId is required' })
    }

    const dbInst = await db.getDb()
    await Promise.all([
      dbInst.collection('users').updateOne({ _id: targetUserId }, { $pull: { followRequests: requesterId } }),
      dbInst.collection('users').updateOne({ _id: requesterId }, { $pull: { sentFollowRequests: targetUserId } }),
    ])

    console.log(`[Social] User ${targetUserId} denied follow request from ${requesterId}`)
    res.json({ success: true })
  } catch (error) {
    console.error('[Social] Error denying follow request:', error)
    res.status(500).json({ error: 'Failed to deny follow request' })
  }
})

// Get pending follow requests for a user
usersRouter.get('/:userId/follow-requests', async (req, res) => {
  try {
    const userId = req.userId
    const user = await db.users.get(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const requestIds = user.followRequests || []
    const dbInst = await db.getDb()
    const requestUsers = requestIds.length > 0
      ? await dbInst.collection('users').find({ _id: { $in: requestIds } }).toArray()
      : []
    const ruMap = {}
    for (const ru of requestUsers) ruMap[ru._id] = ru

    const requests = requestIds.map(rId => {
      const r = ruMap[rId]
      return r ? {
        userId: rId,
        username: r.isAnonymous ? 'Anonymous' : (r.username || 'Anonymous'),
        profileImage: r.profileImage || null,
        bio: (r.bio || '').substring(0, 100),
      } : null
    }).filter(Boolean)

    res.json({ requests })
  } catch (error) {
    console.error('[Social] Error fetching follow requests:', error)
    res.status(500).json({ error: 'Failed to fetch follow requests' })
  }
})

// Get followers list
usersRouter.get('/:userId/followers', async (req, res) => {
  try {
    const { userId } = req.params
    const user = await db.users.get(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const followerIds = user.followers || []
    const dbInst = await db.getDb()
    const followerDocs = followerIds.length > 0
      ? await dbInst.collection('users').find({ _id: { $in: followerIds } }).toArray()
      : []
    const fMap = {}
    for (const fd of followerDocs) fMap[fd._id] = fd

    const followers = followerIds.map(fId => {
      const f = fMap[fId]
      return f ? {
        userId: fId,
        username: f.isAnonymous ? 'Anonymous' : (f.username || 'Anonymous'),
        profileImage: f.profileImage || null,
        bio: (f.bio || '').substring(0, 100),
      } : null
    }).filter(Boolean)

    res.json({ followers })
  } catch (error) {
    console.error('[Social] Error fetching followers:', error)
    res.status(500).json({ error: 'Failed to fetch followers' })
  }
})

// Get following list
usersRouter.get('/:userId/following', async (req, res) => {
  try {
    const { userId } = req.params
    const user = await db.users.get(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const followingIds = user.following || []
    const dbInst = await db.getDb()
    const followingDocs = followingIds.length > 0
      ? await dbInst.collection('users').find({ _id: { $in: followingIds } }).toArray()
      : []
    const fMap = {}
    for (const fd of followingDocs) fMap[fd._id] = fd

    const following = followingIds.map(fId => {
      const f = fMap[fId]
      return f ? {
        userId: fId,
        username: f.isAnonymous ? 'Anonymous' : (f.username || 'Anonymous'),
        profileImage: f.profileImage || null,
        bio: (f.bio || '').substring(0, 100),
      } : null
    }).filter(Boolean)

    res.json({ following })
  } catch (error) {
    console.error('[Social] Error fetching following:', error)
    res.status(500).json({ error: 'Failed to fetch following' })
  }
})
