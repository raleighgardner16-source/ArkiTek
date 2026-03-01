import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, User } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, zIndex } from '../../utils/styles'
import { sx, layout } from '../../utils/styles'
import { useStore } from '../../store/useStore'

interface FollowersListModalProps {
  showFollowersList: string | null
  setShowFollowersList: (val: string | null) => void
  followersListData: any[]
  loadingFollowersList: boolean
  currentUser: any
  currentTheme: any
  s: any
  clearViewingProfile: () => void
}

const FollowersListModal = ({
  showFollowersList,
  setShowFollowersList,
  followersListData,
  loadingFollowersList,
  currentUser,
  currentTheme,
  s,
  clearViewingProfile,
}: FollowersListModalProps) => {
  return (
    <AnimatePresence>
      {showFollowersList && (
        <div
          onClick={() => setShowFollowersList(null)}
          style={sx(layout.fixedFill, layout.center, {
            zIndex: zIndex.modal,
            background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
          })}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            style={sx(s.modal, {
              padding: spacing['3xl'],
              maxWidth: '400px',
              width: 'calc(100% - 40px)',
              maxHeight: '70vh',
              overflowY: 'auto',
              position: 'relative',
            })}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl }}>
              <h3 style={{ margin: 0, color: currentTheme.text, fontSize: fontSize['3xl'], textTransform: 'capitalize' }}>
                {showFollowersList}
              </h3>
              <button
                onClick={() => setShowFollowersList(null)}
                style={{ background: 'none', border: 'none', color: currentTheme.textSecondary, cursor: 'pointer', padding: spacing.xs }}
              >
                <X size={18} />
              </button>
            </div>
            {loadingFollowersList ? (
              <p style={{ color: currentTheme.textSecondary, textAlign: 'center', padding: '20px 0' }}>Loading...</p>
            ) : followersListData.length === 0 ? (
              <p style={{ color: currentTheme.textSecondary, textAlign: 'center', padding: '20px 0', fontSize: fontSize.lg }}>
                No {showFollowersList} yet
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                {followersListData.map((person) => (
                  <div
                    key={person.userId}
                    onClick={() => {
                      setShowFollowersList(null)
                      if (person.userId === currentUser?.id) {
                        clearViewingProfile()
                      } else {
                        const setViewingProfile = useStore.getState().setViewingProfile
                        const setActiveTab = useStore.getState().setActiveTab
                        setViewingProfile({ userId: person.userId, username: person.username })
                        setActiveTab('statistics')
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: spacing.lg,
                      padding: '10px 12px', borderRadius: radius.lg, cursor: 'pointer',
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                    }}
                  >
                    <div style={{
                      width: '40px', height: '40px', borderRadius: radius.circle,
                      background: person.profileImage ? 'none' : currentTheme.accentGradient,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', flexShrink: 0,
                    }}>
                      {person.profileImage ? (
                        <img src={person.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <User size={18} color="#fff" />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: currentTheme.text, fontSize: fontSize.lg, fontWeight: fontWeight.medium, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {person.username}
                      </p>
                      {person.bio && (
                        <p style={{ color: currentTheme.textSecondary, fontSize: '0.78rem', margin: `${spacing['2xs']} 0 0 0`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {person.bio}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default FollowersListModal
