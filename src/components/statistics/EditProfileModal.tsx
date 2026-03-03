import type React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Camera } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, zIndex } from '../../utils/styles'
import { sx, layout } from '../../utils/styles'

interface EditProfileModalProps {
  showEditProfile: boolean
  savingProfile: boolean
  currentTheme: any
  s: any
  editBio: string
  setEditBio: (bio: string) => void
  editIsPrivate: boolean
  setEditIsPrivate: (val: boolean) => void
  editShowOnLeaderboard: boolean
  setEditShowOnLeaderboard: (val: boolean) => void
  editProfileImage: string | null
  setEditProfileImage: (img: string | null) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handleImageUpload: (e: any) => void
  handleSaveProfile: () => void
  setShowEditProfile: (show: boolean) => void
}

const EditProfileModal = ({
  showEditProfile,
  savingProfile,
  currentTheme,
  s,
  editBio,
  setEditBio,
  editIsPrivate,
  setEditIsPrivate,
  editShowOnLeaderboard,
  setEditShowOnLeaderboard,
  editProfileImage,
  setEditProfileImage,
  fileInputRef,
  handleImageUpload,
  handleSaveProfile,
  setShowEditProfile,
}: EditProfileModalProps) => {
  return (
    <AnimatePresence>
      {showEditProfile && (
        <div
          onClick={() => !savingProfile && setShowEditProfile(false)}
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
              maxWidth: '480px',
              width: 'calc(100% - 40px)',
              maxHeight: '85vh',
              overflowY: 'auto',
              position: 'relative',
            })}
          >
            <h2 style={{
              fontSize: fontSize['5xl'], margin: `0 0 ${spacing['2xl']} 0`,
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Edit Profile
            </h2>

            {/* Profile image */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.lg, marginBottom: spacing['2xl'] }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100px', height: '100px', borderRadius: radius.circle,
                  background: editProfileImage ? 'none' : currentTheme.accentGradient,
                  border: `3px solid ${currentTheme.accent}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', cursor: 'pointer', position: 'relative',
                }}
              >
                {editProfileImage ? (
                  <img src={editProfileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <User size={40} color="#fff" />
                )}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'rgba(0,0,0,0.5)', padding: '4px 0',
                  display: 'flex', justifyContent: 'center',
                }}>
                  <Camera size={14} color="#fff" />
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
              <div style={{ display: 'flex', gap: spacing.md }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '6px 14px', background: 'transparent',
                    border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.md,
                    color: currentTheme.accent, fontSize: fontSize.md, cursor: 'pointer',
                  }}
                >
                  Upload Photo
                </button>
                {editProfileImage && (
                  <button
                    onClick={() => setEditProfileImage(null)}
                    style={{
                      padding: '6px 14px', background: 'transparent',
                      border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.md,
                      color: currentTheme.error, fontSize: fontSize.md, cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Bio */}
            <div style={{ marginBottom: spacing.xl }}>
              <label style={{
                color: currentTheme.textSecondary, fontSize: '0.75rem', fontWeight: fontWeight.medium,
                textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: spacing.sm,
              }}>Bio</label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Tell people about yourself..."
                maxLength={300}
                style={{
                  width: '100%', minHeight: '80px', padding: '10px 12px',
                  background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: radius.lg, color: currentTheme.text, fontSize: fontSize.lg,
                  lineHeight: '1.5', resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => { (e.target as HTMLElement).style.borderColor = currentTheme.accent }}
                onBlur={(e) => { (e.target as HTMLElement).style.borderColor = currentTheme.borderLight }}
              />
              <p style={{ color: currentTheme.textMuted || currentTheme.textSecondary, fontSize: '0.72rem', margin: `${spacing.xs} 0 0 0`, textAlign: 'right' }}>
                {editBio.length}/300
              </p>
            </div>

            {/* Private Account toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px', background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.lg, marginBottom: spacing.lg,
            }}>
              <div style={{ marginRight: spacing.lg }}>
                <p style={{ color: currentTheme.text, fontSize: fontSize.lg, fontWeight: fontWeight.medium, margin: 0 }}>Private Profile</p>
                <p style={{ color: currentTheme.textSecondary, fontSize: '0.78rem', margin: `${spacing['2xs']} 0 0 0` }}>
                  Others won't be able to view your stats, badges, or activity when they click on your profile from the leaderboard
                </p>
              </div>
              <button
                onClick={() => setEditIsPrivate(!editIsPrivate)}
                style={{
                  width: '44px', height: '24px', borderRadius: radius.xl, border: 'none', cursor: 'pointer',
                  background: editIsPrivate ? currentTheme.accent : (currentTheme.borderLight || '#444'),
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <div style={{
                  width: '20px', height: '20px', borderRadius: radius.circle, background: '#fff',
                  position: 'absolute', top: '2px',
                  left: editIsPrivate ? '22px' : '2px',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>

            {/* Leaderboard Visibility */}
            <div style={{
              padding: '12px 14px', background: currentTheme.buttonBackground,
              border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.lg, marginBottom: spacing['2xl'],
            }}>
              <p style={{ color: currentTheme.text, fontSize: fontSize.lg, fontWeight: fontWeight.medium, margin: `0 0 ${spacing.md} 0` }}>Leaderboard Visibility</p>
              <p style={{ color: currentTheme.textSecondary, fontSize: '0.78rem', margin: `0 0 ${spacing.lg} 0` }}>
                Choose whether you appear on the global leaderboard rankings
              </p>
              <div style={{ display: 'flex', gap: spacing.md }}>
                <button
                  onClick={() => setEditShowOnLeaderboard(true)}
                  style={{
                    flex: 1, padding: `${spacing.md} ${spacing.lg}`,
                    background: editShowOnLeaderboard ? `${currentTheme.accent}18` : 'transparent',
                    border: `1.5px solid ${editShowOnLeaderboard ? currentTheme.accent : (currentTheme.borderLight || '#444')}`,
                    borderRadius: radius.lg, cursor: 'pointer',
                    color: editShowOnLeaderboard ? currentTheme.accent : currentTheme.textSecondary,
                    fontSize: fontSize.lg, fontWeight: editShowOnLeaderboard ? fontWeight.semibold : fontWeight.normal,
                    transition: 'all 0.2s',
                  }}
                >
                  Show
                </button>
                <button
                  onClick={() => setEditShowOnLeaderboard(false)}
                  style={{
                    flex: 1, padding: `${spacing.md} ${spacing.lg}`,
                    background: !editShowOnLeaderboard ? `${currentTheme.accent}18` : 'transparent',
                    border: `1.5px solid ${!editShowOnLeaderboard ? currentTheme.accent : (currentTheme.borderLight || '#444')}`,
                    borderRadius: radius.lg, cursor: 'pointer',
                    color: !editShowOnLeaderboard ? currentTheme.accent : currentTheme.textSecondary,
                    fontSize: fontSize.lg, fontWeight: !editShowOnLeaderboard ? fontWeight.semibold : fontWeight.normal,
                    transition: 'all 0.2s',
                  }}
                >
                  Do Not Show
                </button>
              </div>
            </div>

            {/* Save / Cancel */}
            <div style={{ display: 'flex', gap: spacing.lg }}>
              <motion.button
                onClick={() => setShowEditProfile(false)}
                whileHover={{ scale: 1.02 }}
                style={{
                  flex: 1, padding: '10px', background: 'transparent',
                  border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.lg,
                  color: currentTheme.textSecondary, fontSize: fontSize.lg, cursor: 'pointer',
                }}
              >
                Cancel
              </motion.button>
              <motion.button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                whileHover={{ scale: 1.02 }}
                style={{
                  flex: 1, padding: '10px', background: currentTheme.accentGradient,
                  border: 'none', borderRadius: radius.lg, color: '#fff',
                  fontSize: fontSize.lg, fontWeight: fontWeight.semibold, cursor: savingProfile ? 'wait' : 'pointer',
                  opacity: savingProfile ? 0.7 : 1,
                }}
              >
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default EditProfileModal
