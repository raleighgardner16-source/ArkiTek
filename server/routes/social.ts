import { Router, type Request, type Response } from 'express'
import db from '../../database/db.js'
import { createNotification } from './notifications.js'
import { createLogger } from '../config/logger.js'
import { sendSuccess, sendError } from '../types/api.js'

const log = createLogger('social')
export const profileRouter = Router()
export const usersRouter = Router()

// ==================== PROFILE ENDPOINTS ====================

// Get a user's public profile (visible to other users)
profileRouter.get('/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string
    const viewerId = req.userId

    const [user, userUsage, userPosts]: any[] = await Promise.all([
      db.users.get(userId),
      db.usage.getOrDefault(userId),
      db.leaderboardPosts.getByUser(userId),
    ])

    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    const totalLikes = userPosts.reduce((sum: number, p: any) => sum + (p.likes?.length || 0), 0)

    // Count total comments by this user across all posts
    const dbInstance = await db.getDb()
    const allPostsForComments = await dbInstance.collection<any>('leaderboard_posts').find({
      $or: [
        { 'comments.userId': userId },
        { 'comments.replies.userId': userId },
      ]
    }).toArray()
    let totalComments = 0
    allPostsForComments.forEach((prompt: any) => {
      (prompt.comments || []).forEach((comment: any) => {
        if (comment.userId === userId) totalComments++
        ;(comment.replies || []).forEach((reply: any) => {
          if (reply.userId === userId) totalComments++
        })
      })
    })

    const followers = user.followers || []
    const following = user.following || []
    const isFollowing = viewerId ? followers.includes(viewerId) : false
    const hasRequestedFollow = viewerId ? (user.followRequests || []).includes(viewerId) : false

    sendSuccess(res, {
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
      posts: await Promise.all(userPosts.map(async (p: any) => {
        // Collect user IDs from comments/replies for enrichment
        const commentUserIds = new Set<string>()
        for (const c of (p.comments || [])) {
          commentUserIds.add(c.userId)
          for (const r of (c.replies || [])) commentUserIds.add(r.userId)
        }
        const commentUsers = commentUserIds.size > 0
          ? await dbInstance.collection<any>('users').find({ _id: { $in: [...commentUserIds] } }).project({ _id: 1, profileImage: 1 }).toArray()
          : []
        const cuMap: Record<string, any> = {}
        for (const cu of commentUsers) cuMap[cu._id] = cu
        
        return {
          id: p._id,
          promptText: p.promptText,
          category: p.category,
          likeCount: p.likes?.length || 0,
          likes: p.likes || [],
          createdAt: p.createdAt,
          comments: (p.comments || []).map((c: any) => ({
            ...c,
            profileImage: cuMap[c.userId]?.profileImage || null,
            replies: (c.replies || []).map((r: any) => ({
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
  } catch (error: any) {
    log.error({ err: error }, 'Error fetching public profile')
    sendError(res, 'Failed to fetch profile')
  }
})

// Update user profile (bio, profileImage, isAnonymous, isPrivate)
profileRouter.put('/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { bio, profileImage, isAnonymous, isPrivate } = req.body

    const user: any = await db.users.get(userId)

    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    const updates: Record<string, any> = {}
    if (bio !== undefined) {
      updates.bio = (bio || '').substring(0, 300)
    }
    if (profileImage !== undefined) {
      if (profileImage && profileImage.length > 500000) {
        return sendError(res, 'Profile image too large. Please use a smaller image.', 400)
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
          await dbInstance.collection<any>('users').updateOne({ _id: requesterId }, {
            $addToSet: { following: userId },
            $pull: { sentFollowRequests: userId } as any,
          })
        }
        updates.followRequests = []
        updates.followers = [...new Set([...(user.followers || []), ...user.followRequests])]
        await dbInstance.collection<any>('users').updateOne({ _id: userId }, {
          $set: { followRequests: [], followers: updates.followers },
        })
        log.info({ userId, count: user.followRequests.length }, 'Auto-approved pending follow requests (switched to public)')
      }
    }

    await db.users.update(userId, updates)

    log.info({ userId, updates: Object.keys(updates) }, 'Updated profile')
    sendSuccess(res, { ...updates })
  } catch (error: any) {
    log.error({ err: error }, 'Error updating profile')
    sendError(res, 'Failed to update profile')
  }
})

// ==================== USERS / SOCIAL ENDPOINTS ====================

// Search users by username — must be registered before param routes
usersRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query
    if (!q || (q as string).trim().length < 1) {
      return sendSuccess(res, { users: [] })
    }

    const query = (q as string).trim().toLowerCase()
    const allUsers: any[] = await db.users.getAll()
    const results: any[] = []

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

    results.sort((a: any, b: any) => {
      const aExact = a.username.toLowerCase() === query
      const bExact = b.username.toLowerCase() === query
      if (aExact && !bExact) return -1
      if (!aExact && bExact) return 1
      return b.followersCount - a.followersCount
    })

    sendSuccess(res, { users: results })
  } catch (error: any) {
    log.error({ err: error }, 'Error searching users')
    sendError(res, 'Failed to search users')
  }
})

// Follow a user (or send a follow request if target is private)
usersRouter.post('/:targetUserId/follow', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.targetUserId as string
    const userId = req.userId!

    if (!targetUserId) {
      return sendError(res, 'targetUserId is required', 400)
    }
    if (userId === targetUserId) {
      return sendError(res, 'You cannot follow yourself', 400)
    }

    const [currentUser, targetUser]: any[] = await Promise.all([
      db.users.get(userId),
      db.users.get(targetUserId),
    ])

    if (!currentUser || !targetUser) {
      return sendError(res, 'User not found', 404)
    }

    if ((currentUser.following || []).includes(targetUserId)) {
      return sendSuccess(res, { status: 'following', alreadyFollowing: true })
    }

    const dbInst = await db.getDb()

    // If target account is private, create a follow request instead
    if (targetUser.isPrivate) {
      if ((targetUser.followRequests || []).includes(userId)) {
        return sendSuccess(res, { status: 'requested', alreadyRequested: true })
      }

      await Promise.all([
        dbInst.collection<any>('users').updateOne({ _id: targetUserId }, { $addToSet: { followRequests: userId } }),
        dbInst.collection<any>('users').updateOne({ _id: userId }, { $addToSet: { sentFollowRequests: targetUserId } }),
      ])

      createNotification({
        userId: targetUserId,
        type: 'follow_request',
        fromUserId: userId,
        fromUsername: currentUser.username || 'Someone',
        fromProfileImage: currentUser.profileImage || null,
      })

      log.info({ userId, targetUserId }, 'Follow request sent to private account')
      return sendSuccess(res, { status: 'requested' })
    }

    // Public account — follow directly
    await Promise.all([
      dbInst.collection<any>('users').updateOne({ _id: userId }, { $addToSet: { following: targetUserId } }),
      dbInst.collection<any>('users').updateOne({ _id: targetUserId }, { $addToSet: { followers: userId } }),
    ])

    createNotification({
      userId: targetUserId,
      type: 'follow',
      fromUserId: userId,
      fromUsername: currentUser.username || 'Someone',
      fromProfileImage: currentUser.profileImage || null,
    })

    const updatedTarget: any = await db.users.get(targetUserId)
    const updatedCurrent: any = await db.users.get(userId)
    log.info({ userId, targetUserId }, 'User followed')
    sendSuccess(res, {
      status: 'following',
      followersCount: (updatedTarget?.followers || []).length,
      followingCount: (updatedCurrent?.following || []).length,
    })
  } catch (error: any) {
    log.error({ err: error }, 'Error following user')
    sendError(res, 'Failed to follow user')
  }
})

// Unfollow a user (or cancel a pending follow request)
usersRouter.post('/:targetUserId/unfollow', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.targetUserId as string
    const userId = req.userId!

    if (!targetUserId) {
      return sendError(res, 'targetUserId is required', 400)
    }

    const dbInst = await db.getDb()
    await Promise.all([
      dbInst.collection<any>('users').updateOne({ _id: userId }, {
        $pull: { following: targetUserId, sentFollowRequests: targetUserId } as any,
      }),
      dbInst.collection<any>('users').updateOne({ _id: targetUserId }, {
        $pull: { followers: userId, followRequests: userId } as any,
      }),
    ])

    const [updatedTarget, updatedCurrent]: any[] = await Promise.all([
      db.users.get(targetUserId),
      db.users.get(userId),
    ])

    log.info({ userId, targetUserId }, 'User unfollowed/cancelled request')
    sendSuccess(res, {
      followersCount: (updatedTarget?.followers || []).length,
      followingCount: (updatedCurrent?.following || []).length,
    })
  } catch (error: any) {
    log.error({ err: error }, 'Error unfollowing user')
    sendError(res, 'Failed to unfollow user')
  }
})

// Accept a follow request
usersRouter.post('/:targetUserId/follow/accept', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.userId!
    const { requesterId } = req.body

    if (!requesterId) {
      return sendError(res, 'requesterId is required', 400)
    }

    const owner: any = await db.users.get(targetUserId)
    if (!owner) {
      return sendError(res, 'User not found', 404)
    }

    if (!owner.followRequests || !owner.followRequests.includes(requesterId)) {
      return sendError(res, 'No pending follow request from this user', 400)
    }

    const dbInst = await db.getDb()
    await Promise.all([
      dbInst.collection<any>('users').updateOne({ _id: targetUserId }, {
        $pull: { followRequests: requesterId } as any,
        $addToSet: { followers: requesterId },
      }),
      dbInst.collection<any>('users').updateOne({ _id: requesterId }, {
        $pull: { sentFollowRequests: targetUserId } as any,
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

    const updatedOwner: any = await db.users.get(targetUserId)
    log.info({ targetUserId, requesterId }, 'Accepted follow request')
    sendSuccess(res, { followersCount: (updatedOwner?.followers || []).length })
  } catch (error: any) {
    log.error({ err: error }, 'Error accepting follow request')
    sendError(res, 'Failed to accept follow request')
  }
})

// Deny a follow request
usersRouter.post('/:targetUserId/follow/deny', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.userId!
    const { requesterId } = req.body

    if (!requesterId) {
      return sendError(res, 'requesterId is required', 400)
    }

    const dbInst = await db.getDb()
    await Promise.all([
      dbInst.collection<any>('users').updateOne({ _id: targetUserId }, { $pull: { followRequests: requesterId } as any }),
      dbInst.collection<any>('users').updateOne({ _id: requesterId }, { $pull: { sentFollowRequests: targetUserId } as any }),
    ])

    log.info({ targetUserId, requesterId }, 'Denied follow request')
    sendSuccess(res, {})
  } catch (error: any) {
    log.error({ err: error }, 'Error denying follow request')
    sendError(res, 'Failed to deny follow request')
  }
})

// Get pending follow requests for a user
usersRouter.get('/:userId/follow-requests', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const user: any = await db.users.get(userId)

    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    const requestIds = user.followRequests || []
    const dbInst = await db.getDb()
    const requestUsers = requestIds.length > 0
      ? await dbInst.collection<any>('users').find({ _id: { $in: requestIds } }).toArray()
      : []
    const ruMap: Record<string, any> = {}
    for (const ru of requestUsers) ruMap[ru._id] = ru

    const requests = requestIds.map((rId: any) => {
      const r = ruMap[rId]
      return r ? {
        userId: rId,
        username: r.isAnonymous ? 'Anonymous' : (r.username || 'Anonymous'),
        profileImage: r.profileImage || null,
        bio: (r.bio || '').substring(0, 100),
      } : null
    }).filter(Boolean)

    sendSuccess(res, { requests })
  } catch (error: any) {
    log.error({ err: error }, 'Error fetching follow requests')
    sendError(res, 'Failed to fetch follow requests')
  }
})

// Get followers list
usersRouter.get('/:userId/followers', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string
    const user: any = await db.users.get(userId)

    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    const followerIds = user.followers || []
    const dbInst = await db.getDb()
    const followerDocs = followerIds.length > 0
      ? await dbInst.collection<any>('users').find({ _id: { $in: followerIds } }).toArray()
      : []
    const fMap: Record<string, any> = {}
    for (const fd of followerDocs) fMap[fd._id] = fd

    const followers = followerIds.map((fId: any) => {
      const f = fMap[fId]
      return f ? {
        userId: fId,
        username: f.isAnonymous ? 'Anonymous' : (f.username || 'Anonymous'),
        profileImage: f.profileImage || null,
        bio: (f.bio || '').substring(0, 100),
      } : null
    }).filter(Boolean)

    sendSuccess(res, { followers })
  } catch (error: any) {
    log.error({ err: error }, 'Error fetching followers')
    sendError(res, 'Failed to fetch followers')
  }
})

// Get following list
usersRouter.get('/:userId/following', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string
    const user: any = await db.users.get(userId)

    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    const followingIds = user.following || []
    const dbInst = await db.getDb()
    const followingDocs = followingIds.length > 0
      ? await dbInst.collection<any>('users').find({ _id: { $in: followingIds } }).toArray()
      : []
    const fMap: Record<string, any> = {}
    for (const fd of followingDocs) fMap[fd._id] = fd

    const following = followingIds.map((fId: any) => {
      const f = fMap[fId]
      return f ? {
        userId: fId,
        username: f.isAnonymous ? 'Anonymous' : (f.username || 'Anonymous'),
        profileImage: f.profileImage || null,
        bio: (f.bio || '').substring(0, 100),
      } : null
    }).filter(Boolean)

    sendSuccess(res, { following })
  } catch (error: any) {
    log.error({ err: error }, 'Error fetching following')
    sendError(res, 'Failed to fetch following')
  }
})
