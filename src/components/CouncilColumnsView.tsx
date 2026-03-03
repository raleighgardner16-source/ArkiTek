import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Search, Globe, Send, Maximize2, X, Trophy } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'
import { spacing, fontSize, fontWeight, radius, transition, layout, sx, createStyles } from '../utils/styles'
import { getModelShortLabel } from '../utils/modelNames'

interface Props {
  showCouncilColumns: boolean
  isLoading: boolean
  isGeneratingSummary: boolean
  isSearchingWeb?: boolean
  onCancelPrompt?: (() => void) | null
  theme: string
  currentTheme: any
  summaryInitializing: boolean
  showCouncilReviewPhase: boolean
  canToggleResultViews: boolean
  resultViewMode: string
  councilColumnCount: number
  councilDisplayResponses: any[]
  councilGutterHover: string | null
  setCouncilGutterHover: (v: string | null) => void
  leftGutterRef: React.RefObject<HTMLDivElement>
  rightGutterRef: React.RefObject<HTMLDivElement>
  lastSubmittedPrompt: string
  getProviderDisplayName: (name: string) => string
  showCouncilColumnSources: Record<string, boolean>
  setShowCouncilColumnSources: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  councilColumnConvoHistory: Record<string, any[]>
  councilColumnConvoSending: Record<string, boolean>
  councilColumnConvoSearching: Record<string, boolean>
  councilColumnConvoSources: Record<string, any[]>
  showCouncilColumnConvoSources: Record<string, boolean>
  setShowCouncilColumnConvoSources: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  councilColumnConvoInputs: Record<string, string>
  setCouncilColumnConvoInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
  handleSendCouncilColumnConvo: (response: any) => void
  councilFollowUpInput: string
  setCouncilFollowUpInput: (v: string) => void
  councilFollowUpSending: boolean
  handleSendCouncilFollowUp: () => void
  responses: any[]
  setIsCouncilColumnInputFocused: (v: boolean) => void
  currentPromptFavorite: string | null
  onPickFavorite: (responseId: string) => void
  isReopenedHistoryChat: boolean
}

const CouncilColumnsView = ({
  showCouncilColumns,
  isLoading,
  isGeneratingSummary,
  isSearchingWeb = false,
  onCancelPrompt,
  theme,
  currentTheme,
  summaryInitializing,
  showCouncilReviewPhase,
  canToggleResultViews,
  resultViewMode,
  councilColumnCount,
  councilDisplayResponses,
  councilGutterHover,
  setCouncilGutterHover,
  leftGutterRef,
  rightGutterRef,
  lastSubmittedPrompt,
  getProviderDisplayName,
  showCouncilColumnSources,
  setShowCouncilColumnSources,
  councilColumnConvoHistory,
  councilColumnConvoSending,
  councilColumnConvoSearching,
  councilColumnConvoSources,
  showCouncilColumnConvoSources,
  setShowCouncilColumnConvoSources,
  councilColumnConvoInputs,
  setCouncilColumnConvoInputs,
  handleSendCouncilColumnConvo,
  councilFollowUpInput,
  setCouncilFollowUpInput,
  councilFollowUpSending,
  handleSendCouncilFollowUp,
  responses,
  setIsCouncilColumnInputFocused,
  currentPromptFavorite,
  onPickFavorite,
  isReopenedHistoryChat,
}: Props) => {
  const s = createStyles(currentTheme)
  const [maximizedCouncilResponseId, setMaximizedCouncilResponseId] = useState<string | null>(null)
  const maximizedCouncilResponse = maximizedCouncilResponseId
    ? councilDisplayResponses.find(r => r.id === maximizedCouncilResponseId) || null
    : null

  return (
    <>
      {/* Phase 2: Council Columns - multi-model streaming responses */}
      {showCouncilColumns && (
        <>
          {isLoading && !isGeneratingSummary && (
            <div style={sx(layout.center, { marginBottom: spacing.xl })}>
              <motion.button
                onClick={() => { if (onCancelPrompt) onCancelPrompt() }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={sx(layout.flexRow, {
                  padding: `${spacing.md} 14px`,
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid #ef4444',
                  borderRadius: radius.lg,
                  color: theme === 'light' ? '#dc2626' : '#fff',
                  fontSize: '0.82rem',
                  fontWeight: fontWeight.semibold,
                  cursor: 'pointer',
                })}
                title="Cancel"
              >
                Cancel
              </motion.button>
            </div>
          )}
          {/* Loading Summary indicator at top center */}
          {(isGeneratingSummary || summaryInitializing) && (
            <div style={sx(layout.flexCol, { alignItems: 'center', gap: spacing.lg, marginBottom: spacing['4xl'] })}>
              {isGeneratingSummary && (
                <motion.button
                  onClick={() => { if (onCancelPrompt) onCancelPrompt() }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={sx(layout.flexRow, {
                    padding: `${spacing.md} 14px`,
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid #ef4444',
                    borderRadius: radius.lg,
                    color: theme === 'light' ? '#dc2626' : '#fff',
                    cursor: 'pointer',
                    transition: transition.normal,
                    fontSize: '0.82rem',
                    fontWeight: fontWeight.semibold,
                  })}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  title="Cancel"
                >
                  Cancel
                </motion.button>
              )}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                style={sx(layout.flexRow, {
                  gap: spacing.lg,
                  padding: `10px ${spacing['3xl']}`,
                  background: currentTheme.buttonBackground,
                  borderRadius: radius.xl,
                  border: `1px solid ${currentTheme.borderLight}`,
                })}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  style={{
                    width: '18px',
                    height: '18px',
                    border: `2px solid ${currentTheme.borderLight}`,
                    borderTop: `2px solid ${currentTheme.accent}`,
                    borderRadius: radius.circle,
                    flexShrink: 0,
                  }}
                />
                <span style={sx(s.gradientText, {
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.medium,
                })}>
                  Loading Summary...
                </span>
              </motion.div>
            </div>
          )}

          {/* Real-time web search indicator when a search query is used for the prompt */}
          {isSearchingWeb && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={sx(layout.flexRow, {
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                marginBottom: spacing.lg,
                padding: `${spacing.sm} ${spacing.lg}`,
                background: `${currentTheme.accent}12`,
                border: `1px solid ${currentTheme.accent}30`,
                borderRadius: radius.lg,
                alignSelf: 'center',
              })}
            >
              <Search size={16} color={currentTheme.accent} />
              <span style={{ color: currentTheme.accent, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>Searching the web</span>
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ color: currentTheme.accent, fontSize: fontSize.sm }}
              >
                ...
              </motion.span>
            </motion.div>
          )}

          {/* Council Response Columns with scroll gutters */}
          <div style={{
            display: 'flex',
            width: '100%',
            flex: 1,
            minHeight: 0,
          }}>
            {/* Left scroll gutter */}
            <div
              ref={leftGutterRef}
              onMouseEnter={() => setCouncilGutterHover('left')}
              onMouseLeave={() => setCouncilGutterHover(null)}
              style={sx(layout.center, {
                flex: 1,
                minWidth: 0,
                cursor: 'ns-resize',
                transition: 'opacity 0.2s ease',
              })}
            >
              {councilGutterHover === 'left' && (
                <div style={sx(layout.flexCol, {
                  alignItems: 'center',
                  gap: spacing.sm,
                  opacity: 0.5,
                  pointerEvents: 'none',
                })}>
                  <ChevronUp size={16} color={currentTheme.textMuted} />
                  <div style={{
                    width: '2px',
                    height: '40px',
                    borderRadius: '1px',
                    background: `linear-gradient(to bottom, ${currentTheme.textMuted}, transparent)`,
                  }} />
                  <ChevronDown size={16} color={currentTheme.textMuted} />
                </div>
              )}
            </div>

            <div style={sx(layout.center, {
              alignItems: 'stretch',
              width: councilColumnCount <= 2 ? '800px' : councilColumnCount === 3 ? '1000px' : '1200px',
              maxWidth: '100%',
              flex: '0 0 auto',
              minHeight: 0,
              height: '100%',
              gap: spacing.none,
              overflow: 'hidden',
            })}>
            {councilDisplayResponses.map((response, index, arr) => (
              <React.Fragment key={response.id}>
                {index > 0 && (
                  <div style={{
                    width: '1px',
                    background: 'rgba(255, 255, 255, 0.15)',
                    flexShrink: 0,
                    alignSelf: 'stretch',
                  }} />
                )}
                <div className="council-column-scroll" style={{
                  flex: 1,
                  padding: `0 ${spacing.xl} 60px`,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  overscrollBehaviorY: 'contain',
                  minWidth: 0,
                  height: '100%',
                  maxWidth: arr.length === 1 ? '800px' : 'none',
                }}>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    {lastSubmittedPrompt && (
                      <div style={{
                        marginBottom: spacing.lg,
                        padding: `10px ${spacing.lg}`,
                        background: currentTheme.buttonBackground,
                        border: `1px solid ${currentTheme.borderLight}`,
                        borderRadius: radius.lg,
                      }}>
                        <div style={{
                          fontSize: '0.68rem',
                          fontWeight: fontWeight.bold,
                          color: currentTheme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.6px',
                          marginBottom: spacing.xs,
                        }}>
                          Prompt
                        </div>
                        <p style={{
                          margin: 0,
                          color: currentTheme.text,
                          fontSize: '0.82rem',
                          lineHeight: '1.45',
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }}>
                          {lastSubmittedPrompt}
                        </p>
                      </div>
                    )}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: spacing.xs,
                      marginBottom: spacing.lg,
                      paddingBottom: spacing.md,
                      borderBottom: `1px solid ${currentTheme.borderLight}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs }}>
                        {!isReopenedHistoryChat && !response.isStreaming && response.text && responses.length > 1 && (
                          <button
                            onClick={() => onPickFavorite(response.id)}
                            style={{
                              background: currentPromptFavorite === response.id ? currentTheme.accentSecondary : currentTheme.buttonBackground,
                              border: `1px solid ${currentPromptFavorite === response.id ? currentTheme.accentSecondary : currentTheme.borderLight}`,
                              borderRadius: radius.sm,
                              padding: `${spacing['2xs']} ${spacing.sm}`,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: spacing['2xs'],
                              color: currentPromptFavorite === response.id ? '#fff' : currentTheme.textSecondary,
                              fontSize: fontSize['2xs'],
                              fontWeight: currentPromptFavorite === response.id ? fontWeight.semibold : fontWeight.normal,
                              transition: transition.normal,
                              flexShrink: 0,
                            }}
                          >
                            <Trophy size={11} fill={currentPromptFavorite === response.id ? '#fff' : 'transparent'} />
                            Favorite
                          </button>
                        )}
                        <button
                          onClick={() => setMaximizedCouncilResponseId(response.id)}
                          title="Expand response"
                          style={sx(layout.center, {
                            width: '24px',
                            height: '24px',
                            borderRadius: radius.sm,
                            border: `1px solid ${currentTheme.borderLight}`,
                            background: currentTheme.buttonBackground,
                            color: currentTheme.textSecondary,
                            cursor: 'pointer',
                            flexShrink: 0,
                            transition: transition.normal,
                          })}
                        >
                          <Maximize2 size={13} />
                        </button>
                      </div>
                      {response.debateRole ? (
                        <div style={sx(layout.flexCol, { gap: spacing.px })}>
                          <div style={{
                            fontSize: '0.75rem',
                            fontWeight: fontWeight.bold,
                            color: currentTheme.accent,
                            textTransform: 'uppercase',
                            letterSpacing: '0.8px',
                          }}>
                            {response.debateRole.label}
                          </div>
                          <div style={{
                            fontSize: fontSize['2xs'],
                            fontWeight: fontWeight.medium,
                            color: currentTheme.textMuted,
                          }}>
                            {getProviderDisplayName(response.modelName)}
                            {getModelShortLabel(response.modelName) && (
                              <span style={{ opacity: 0.6 }}>{' '}({getModelShortLabel(response.modelName)})</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: fontWeight.bold,
                          color: currentTheme.accent,
                          textTransform: 'uppercase',
                          letterSpacing: '0.8px',
                        }}>
                          {getProviderDisplayName(response.modelName)}
                          {getModelShortLabel(response.modelName) && (
                            <span style={{ color: currentTheme.textMuted, fontWeight: fontWeight.normal, textTransform: 'none', letterSpacing: 'normal' }}>
                              {' '}({getModelShortLabel(response.modelName)})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontSize: arr.length > 3 ? fontSize.md : fontSize.base,
                      color: currentTheme.textSecondary,
                      lineHeight: '1.7',
                    }}>
                      {response.text ? (
                        <MarkdownRenderer content={response.text} theme={currentTheme} fontSize={arr.length > 3 ? '0.8rem' : '0.85rem'} lineHeight="1.7" />
                      ) : (
                        <motion.div
                          style={sx(layout.flexRow, { gap: spacing.md, padding: `${spacing.md} 0` })}
                        >
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            style={{
                              width: '14px',
                              height: '14px',
                              border: `2px solid ${currentTheme.borderLight}`,
                              borderTop: `2px solid ${currentTheme.accent}`,
                              borderRadius: radius.circle,
                            }}
                          />
                          <span style={{ fontSize: fontSize.md, color: currentTheme.textMuted, fontStyle: 'italic' }}>
                            Waiting for response...
                          </span>
                        </motion.div>
                      )}
                    </div>
                    {(showCouncilReviewPhase || (canToggleResultViews && resultViewMode === 'council') || (!response.isStreaming && response.text)) && (
                      <div style={{ marginTop: '14px', borderTop: `1px solid ${currentTheme.borderLight}`, paddingTop: spacing.lg }}>
                        {/* Initial prompt sources */}
                        {(() => {
                          const initialSources = Array.isArray(response.sources) ? response.sources : []
                          if (initialSources.length === 0) return null
                          return (
                            <div style={{ marginBottom: '10px' }}>
                              <button
                                onClick={() => setShowCouncilColumnSources(prev => ({ ...prev, [response.id]: !prev[response.id] }))}
                                style={sx(layout.flexRow, {
                                  gap: spacing.sm,
                                  padding: '5px 10px',
                                  background: showCouncilColumnSources[response.id] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                                  border: `1px solid ${showCouncilColumnSources[response.id] ? currentTheme.accent : currentTheme.borderLight}`,
                                  borderRadius: radius.md,
                                  color: currentTheme.accent,
                                  fontSize: '0.75rem',
                                  fontWeight: fontWeight.medium,
                                  cursor: 'pointer',
                                  transition: transition.normal,
                                })}
                              >
                                <Globe size={12} />
                                Sources ({initialSources.length})
                                <ChevronDown size={12} style={{ transform: showCouncilColumnSources[response.id] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                              </button>
                              {showCouncilColumnSources[response.id] && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  style={sx(layout.flexCol, { marginTop: spacing.sm, marginBottom: spacing.md, gap: spacing.xs, maxHeight: '180px', overflowY: 'auto' })}
                                >
                                  {initialSources.map((source: any, sIdx: number) => (
                                    <a
                                      key={sIdx}
                                      href={source.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: 'block',
                                        padding: `${spacing.sm} 10px`,
                                        background: currentTheme.buttonBackground,
                                        border: `1px solid ${currentTheme.borderLight}`,
                                        borderRadius: radius.sm,
                                        textDecoration: 'none',
                                        transition: 'border-color 0.2s',
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                                    >
                                      <div style={{ fontSize: '0.75rem', fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {source.title}
                                      </div>
                                      <div style={{ fontSize: fontSize['2xs'], color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {source.link}
                                      </div>
                                      {source.snippet && (
                                        <div style={{ fontSize: fontSize.xs, color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                          {source.snippet}
                                        </div>
                                      )}
                                    </a>
                                  ))}
                                </motion.div>
                              )}
                            </div>
                          )
                        })()}
                        {(councilColumnConvoHistory[response.id] || []).map((turn, turnIdx) => {
                          const turnSourceKey = `${response.id}-${turnIdx}`
                          const turnSources = councilColumnConvoSources[turnSourceKey] || []
                          const isLastTurn = turnIdx === (councilColumnConvoHistory[response.id] || []).length - 1
                          return (
                          <div key={`${response.id}-turn-${turnIdx}`} style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: '0.4px' }}>You</div>
                            <div style={{
                              marginBottom: spacing.md,
                              padding: `${spacing.md} 10px`,
                              borderRadius: radius.lg,
                              border: theme === 'light' ? '1px solid rgba(0, 0, 0, 0.15)' : '1px solid rgba(255, 255, 255, 0.35)',
                              background: theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.08)',
                            }}>
                              <div style={{ fontSize: fontSize.md, color: theme === 'light' ? '#111111' : currentTheme.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                {turn.user}
                              </div>
                            </div>
                            {isLastTurn && councilColumnConvoSearching[response.id] && (
                              <motion.div
                                initial={{ opacity: 0, y: 3 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={sx(layout.flexRow, {
                                  gap: spacing.sm,
                                  marginBottom: spacing.md,
                                  padding: '5px 10px',
                                  background: currentTheme.buttonBackground,
                                  borderRadius: radius['2xl'],
                                  width: 'fit-content',
                                })}
                              >
                                <Search size={12} color={currentTheme.accent} />
                                <span style={sx(s.gradientText, {
                                  fontSize: '0.75rem',
                                })}>
                                  Searching the web
                                </span>
                                <motion.span
                                  animate={{ opacity: [1, 0.3, 1] }}
                                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                                  style={sx(s.gradientText)}
                                >
                                  ...
                                </motion.span>
                              </motion.div>
                            )}
                            <div style={{ fontSize: fontSize.xs, color: currentTheme.accent, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                              {response.debateRole ? `${response.debateRole.label} · ${getProviderDisplayName(response.modelName)}` : getProviderDisplayName(response.modelName)}
                              {!response.debateRole && getModelShortLabel(response.modelName) && (
                                <span style={{ color: currentTheme.textMuted, fontWeight: fontWeight.normal, textTransform: 'none', letterSpacing: 'normal' }}>
                                  {' '}({getModelShortLabel(response.modelName)})
                                </span>
                              )}
                            </div>
                            {turn.assistant ? (
                              <div style={{ fontSize: fontSize.md, color: currentTheme.textSecondary, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                <MarkdownRenderer
                                  content={turn.assistant}
                                  theme={currentTheme}
                                  fontSize="0.8rem"
                                  lineHeight="1.6"
                                />
                              </div>
                            ) : (
                              <div style={{ fontSize: fontSize.md, color: currentTheme.textSecondary, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                {councilColumnConvoSending[response.id] ? 'Thinking...' : ''}
                              </div>
                            )}
                            {turnSources.length > 0 && (
                              <div style={{ marginTop: spacing.md }}>
                                <button
                                  onClick={() => setShowCouncilColumnConvoSources(prev => ({ ...prev, [turnSourceKey]: !prev[turnSourceKey] }))}
                                  style={sx(layout.flexRow, {
                                    gap: spacing.sm,
                                    padding: `${spacing.xs} ${spacing.md}`,
                                    background: showCouncilColumnConvoSources[turnSourceKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                                    border: `1px solid ${showCouncilColumnConvoSources[turnSourceKey] ? currentTheme.accent : currentTheme.borderLight}`,
                                    borderRadius: radius.md,
                                    color: currentTheme.accent,
                                    fontSize: fontSize.xs,
                                    fontWeight: fontWeight.medium,
                                    cursor: 'pointer',
                                    transition: transition.normal,
                                  })}
                                >
                                  <Globe size={11} />
                                  Sources ({turnSources.length})
                                  <ChevronDown size={11} style={{ transform: showCouncilColumnConvoSources[turnSourceKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                                </button>
                                {showCouncilColumnConvoSources[turnSourceKey] && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    style={sx(layout.flexCol, { marginTop: '5px', marginBottom: spacing.sm, gap: '3px', maxHeight: '160px', overflowY: 'auto' })}
                                  >
                                    {turnSources.map((source, sIdx) => (
                                      <a
                                        key={sIdx}
                                        href={source.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          display: 'block',
                                          padding: '5px 8px',
                                          background: currentTheme.buttonBackground,
                                          border: `1px solid ${currentTheme.borderLight}`,
                                          borderRadius: radius.sm,
                                          textDecoration: 'none',
                                          transition: 'border-color 0.2s',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                                      >
                                        <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {source.title}
                                        </div>
                                        <div style={{ fontSize: '0.6rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {source.link}
                                        </div>
                                        {source.snippet && (
                                          <div style={{ fontSize: fontSize['2xs'], color: currentTheme.textSecondary, marginTop: '2px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {source.snippet}
                                          </div>
                                        )}
                                      </a>
                                    ))}
                                  </motion.div>
                                )}
                              </div>
                            )}
                          </div>
                          )
                        })}
                        <textarea
                          data-local-enter-handler="true"
                          value={councilColumnConvoInputs[response.id] || ''}
                          onChange={(e) => setCouncilColumnConvoInputs(prev => ({ ...prev, [response.id]: e.target.value }))}
                          onFocus={() => setIsCouncilColumnInputFocused(true)}
                          onBlur={() => setIsCouncilColumnInputFocused(false)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              e.stopPropagation()
                              handleSendCouncilColumnConvo(response)
                            }
                          }}
                          placeholder={`Continue conversation with ${getProviderDisplayName(response.modelName)}...`}
                          disabled={!!councilColumnConvoSending[response.id]}
                          style={{
                            width: '100%',
                            minHeight: '44px',
                            maxHeight: '120px',
                            padding: `10px ${spacing.lg}`,
                            background: currentTheme.buttonBackground,
                            border: `1px solid ${currentTheme.borderLight}`,
                            borderRadius: radius.lg,
                            color: currentTheme.text,
                            fontSize: '0.82rem',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            outline: 'none',
                            lineHeight: '1.4',
                          }}
                        />
                      </div>
                    )}
                  </motion.div>
                </div>
              </React.Fragment>
            ))}
            </div>

            {/* Right scroll gutter */}
            <div
              ref={rightGutterRef}
              onMouseEnter={() => setCouncilGutterHover('right')}
              onMouseLeave={() => setCouncilGutterHover(null)}
              style={sx(layout.center, {
                flex: 1,
                minWidth: 0,
                cursor: 'ns-resize',
                transition: 'opacity 0.2s ease',
              })}
            >
              {councilGutterHover === 'right' && (
                <div style={sx(layout.flexCol, {
                  alignItems: 'center',
                  gap: spacing.sm,
                  opacity: 0.5,
                  pointerEvents: 'none',
                })}>
                  <ChevronUp size={16} color={currentTheme.textMuted} />
                  <div style={{
                    width: '2px',
                    height: '40px',
                    borderRadius: '1px',
                    background: `linear-gradient(to bottom, ${currentTheme.textMuted}, transparent)`,
                  }} />
                  <ChevronDown size={16} color={currentTheme.textMuted} />
                </div>
              )}
            </div>
          </div>

        </>
      )}

      {/* Unified council follow-up input — fixed at bottom, sends to ALL models */}
      {showCouncilColumns && !isLoading && !isGeneratingSummary && responses.filter(r => !r.error && r.text && !r.isStreaming).length >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: `${spacing.md} ${spacing['2xl']} 14px`,
            background: theme === 'light'
              ? 'linear-gradient(to top, rgba(255,255,255,0.98) 65%, rgba(255,255,255,0))'
              : 'linear-gradient(to top, rgba(10,10,15,0.98) 65%, rgba(10,10,15,0))',
            zIndex: 25,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={sx(layout.flexRow, {
            gap: spacing.md,
            width: '100%',
            maxWidth: '520px',
            background: currentTheme.buttonBackground,
            border: `1px solid ${currentTheme.borderLight}`,
            borderRadius: radius.xl,
            padding: '5px 6px 5px 14px',
            boxShadow: theme === 'light'
              ? '0 2px 12px rgba(0,0,0,0.08)'
              : '0 2px 16px rgba(0,0,0,0.4)',
            pointerEvents: 'auto',
          })}>
            <input
              data-local-enter-handler="true"
              type="text"
              value={councilFollowUpInput}
              onChange={(e) => setCouncilFollowUpInput(e.target.value)}
              onFocus={() => setIsCouncilColumnInputFocused(true)}
              onBlur={() => setIsCouncilColumnInputFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  e.stopPropagation()
                  handleSendCouncilFollowUp()
                }
              }}
              placeholder="Ask the council a follow-up..."
              disabled={councilFollowUpSending}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: currentTheme.text,
                fontSize: fontSize.md,
                fontFamily: 'inherit',
                padding: '5px 0',
              }}
            />
            <motion.button
              onClick={handleSendCouncilFollowUp}
              disabled={!councilFollowUpInput.trim() || councilFollowUpSending}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.93 }}
              style={sx(layout.center, {
                width: '28px',
                height: '28px',
                borderRadius: radius.md,
                border: 'none',
                background: councilFollowUpInput.trim() && !councilFollowUpSending
                  ? currentTheme.accentGradient
                  : 'transparent',
                color: councilFollowUpInput.trim() && !councilFollowUpSending
                  ? '#ffffff'
                  : currentTheme.textMuted,
                cursor: councilFollowUpInput.trim() && !councilFollowUpSending ? 'pointer' : 'default',
                opacity: councilFollowUpInput.trim() && !councilFollowUpSending ? 1 : 0.4,
                transition: transition.normal,
                flexShrink: 0,
              })}
            >
              {councilFollowUpSending ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  style={{
                    width: '13px',
                    height: '13px',
                    border: `2px solid ${currentTheme.borderLight}`,
                    borderTop: `2px solid ${currentTheme.accent}`,
                    borderRadius: radius.circle,
                  }}
                />
              ) : (
                <Send size={13} />
              )}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Expanded Council Column Response Popup */}
      <AnimatePresence>
        {maximizedCouncilResponse && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMaximizedCouncilResponseId(null)}
            style={sx(layout.fixedFill, layout.center, {
              zIndex: 900,
              background: theme === 'light' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.72)',
              backdropFilter: 'blur(4px)',
            })}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                width: 'min(900px, calc(100vw - 48px))',
                maxHeight: '82vh',
                overflowY: 'auto',
                background: currentTheme.backgroundOverlay,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '14px',
                padding: '22px',
                boxShadow: theme === 'light'
                  ? '0 10px 40px rgba(0, 0, 0, 0.18)'
                  : '0 10px 40px rgba(0, 0, 0, 0.6)',
              }}
            >
              <button
                onClick={() => setMaximizedCouncilResponseId(null)}
                title="Close"
                style={{
                  position: 'absolute',
                  top: '14px',
                  right: '14px',
                  background: 'rgba(255, 0, 0, 0.08)',
                  border: '1px solid rgba(255, 0, 0, 0.3)',
                  borderRadius: radius.md,
                  padding: spacing.sm,
                  color: currentTheme.error,
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>

              <div style={{ marginBottom: '14px', paddingRight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg }}>
                {maximizedCouncilResponse.debateRole ? (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <h3
                        style={sx(s.gradientText, {
                          margin: 0,
                          fontSize: '1.25rem',
                          fontWeight: fontWeight.bold,
                        })}
                      >
                        {maximizedCouncilResponse.debateRole.label}
                      </h3>
                      <span style={{
                        fontSize: fontSize.md,
                        color: currentTheme.textMuted,
                        fontWeight: fontWeight.medium,
                      }}>
                        {getProviderDisplayName(maximizedCouncilResponse.modelName)}
                        {getModelShortLabel(maximizedCouncilResponse.modelName) && (
                          <span style={{ opacity: 0.6 }}>{' '}({getModelShortLabel(maximizedCouncilResponse.modelName)})</span>
                        )}
                      </span>
                    </div>
                  </>
                ) : (
                  <h3
                    style={sx(s.gradientText, {
                      margin: 0,
                      fontSize: '1.25rem',
                      fontWeight: fontWeight.bold,
                    })}
                  >
                    {getProviderDisplayName(maximizedCouncilResponse.modelName)}
                    {getModelShortLabel(maximizedCouncilResponse.modelName) && (
                      <span style={{ color: currentTheme.textMuted, fontWeight: fontWeight.normal, fontSize: fontSize.lg }}>
                        {' '}({getModelShortLabel(maximizedCouncilResponse.modelName)})
                      </span>
                    )}
                  </h3>
                )}
                {!isReopenedHistoryChat && !maximizedCouncilResponse.isStreaming && maximizedCouncilResponse.text && responses.length > 1 && (
                  <button
                    onClick={() => onPickFavorite(maximizedCouncilResponse.id)}
                    style={{
                      background: currentPromptFavorite === maximizedCouncilResponse.id ? currentTheme.accentSecondary : currentTheme.buttonBackground,
                      border: `1px solid ${currentPromptFavorite === maximizedCouncilResponse.id ? currentTheme.accentSecondary : currentTheme.borderLight}`,
                      borderRadius: radius.md,
                      padding: `${spacing.xs} ${spacing.lg}`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.xs,
                      color: currentPromptFavorite === maximizedCouncilResponse.id ? '#fff' : currentTheme.textSecondary,
                      fontSize: fontSize.sm,
                      fontWeight: currentPromptFavorite === maximizedCouncilResponse.id ? fontWeight.semibold : fontWeight.normal,
                      transition: transition.normal,
                      flexShrink: 0,
                    }}
                  >
                    <Trophy size={14} fill={currentPromptFavorite === maximizedCouncilResponse.id ? '#fff' : 'transparent'} />
                    Favorite Response
                  </button>
                )}
              </div>

              <MarkdownRenderer
                content={typeof maximizedCouncilResponse.text === 'string' ? maximizedCouncilResponse.text : String(maximizedCouncilResponse.text || '')}
                theme={currentTheme}
                fontSize="1rem"
                lineHeight="1.8"
              />

              {Array.isArray(maximizedCouncilResponse.sources) && maximizedCouncilResponse.sources.length > 0 && (() => {
                const initialSourceKey = `${maximizedCouncilResponse.id}_initial`
                return (
                  <div style={{ marginTop: '14px', borderTop: `1px solid ${currentTheme.borderLight}`, paddingTop: spacing.lg }}>
                    <button
                      onClick={() => setShowCouncilColumnConvoSources(prev => ({ ...prev, [initialSourceKey]: !prev[initialSourceKey] }))}
                      style={sx(layout.flexRow, {
                        gap: spacing.sm,
                        padding: '5px 10px',
                        background: showCouncilColumnConvoSources[initialSourceKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                        border: `1px solid ${showCouncilColumnConvoSources[initialSourceKey] ? currentTheme.accent : currentTheme.borderLight}`,
                        borderRadius: radius.md,
                        color: currentTheme.accent,
                        fontSize: '0.75rem',
                        fontWeight: fontWeight.medium,
                        cursor: 'pointer',
                        transition: transition.normal,
                      })}
                    >
                      <Globe size={12} />
                      Sources ({maximizedCouncilResponse.sources.length})
                      <ChevronDown size={12} style={{ transform: showCouncilColumnConvoSources[initialSourceKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                    </button>
                    {showCouncilColumnConvoSources[initialSourceKey] && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={sx(layout.flexCol, { marginTop: spacing.sm, gap: spacing.sm, maxHeight: '220px', overflowY: 'auto' })}
                      >
                        {maximizedCouncilResponse.sources.map((source: any, sIdx: number) => (
                          <a
                            key={sIdx}
                            href={source.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'block',
                              padding: `${spacing.md} ${spacing.lg}`,
                              background: currentTheme.buttonBackground,
                              border: `1px solid ${currentTheme.borderLight}`,
                              borderRadius: radius.md,
                              textDecoration: 'none',
                              transition: 'border-color 0.2s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                          >
                            <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {source.title}
                            </div>
                            <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {source.link}
                            </div>
                            {source.snippet && (
                              <div style={{ fontSize: '0.75rem', color: currentTheme.textSecondary, marginTop: spacing.xs, lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {source.snippet}
                              </div>
                            )}
                          </a>
                        ))}
                      </motion.div>
                    )}
                  </div>
                )
              })()}

              <div style={{ marginTop: spacing.xl, borderTop: `1px solid ${currentTheme.borderLight}`, paddingTop: spacing.lg }}>
                {(councilColumnConvoHistory[maximizedCouncilResponse.id] || []).map((turn, turnIdx) => {
                  const turnSourceKey = `${maximizedCouncilResponse.id}-${turnIdx}`
                  const turnSources = councilColumnConvoSources[turnSourceKey] || []
                  const isLastTurn = turnIdx === (councilColumnConvoHistory[maximizedCouncilResponse.id] || []).length - 1
                  return (
                    <div key={`${maximizedCouncilResponse.id}-modal-turn-${turnIdx}`} style={{ marginBottom: spacing.lg }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{
                          maxWidth: '80%',
                          padding: `${spacing.md} 10px`,
                          borderRadius: radius.lg,
                          border: theme === 'light' ? '1px solid rgba(0, 0, 0, 0.15)' : '1px solid rgba(255, 255, 255, 0.35)',
                          background: theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.08)',
                        }}>
                          <div style={{ fontSize: fontSize.md, color: theme === 'light' ? '#111111' : currentTheme.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {turn.user}
                          </div>
                        </div>
                      </div>

                      {isLastTurn && councilColumnConvoSearching[maximizedCouncilResponse.id] && (
                        <motion.div
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          style={sx(layout.flexRow, {
                            gap: spacing.sm,
                            margin: `${spacing.md} 0 ${spacing.sm}`,
                            padding: '5px 10px',
                            background: currentTheme.buttonBackground,
                            borderRadius: radius['2xl'],
                            width: 'fit-content',
                          })}
                        >
                          <Search size={12} color={currentTheme.accent} />
                          <span style={sx(s.gradientText, {
                            fontSize: '0.75rem',
                          })}>
                            Searching the web
                          </span>
                          <motion.span
                            animate={{ opacity: [1, 0.3, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                            style={sx(s.gradientText)}
                          >
                            ...
                          </motion.span>
                        </motion.div>
                      )}

                      <div style={{ marginTop: spacing.sm, fontSize: fontSize.xl, color: currentTheme.textSecondary, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        <MarkdownRenderer content={turn.assistant || ''} theme={currentTheme} fontSize="0.95rem" lineHeight="1.7" />
                      </div>

                      {turnSources.length > 0 && (
                        <div style={{ marginTop: spacing.md }}>
                          <button
                            onClick={() => setShowCouncilColumnConvoSources(prev => ({ ...prev, [turnSourceKey]: !prev[turnSourceKey] }))}
                            style={sx(layout.flexRow, {
                              gap: spacing.sm,
                              padding: '5px 10px',
                              background: showCouncilColumnConvoSources[turnSourceKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                              border: `1px solid ${showCouncilColumnConvoSources[turnSourceKey] ? currentTheme.accent : currentTheme.borderLight}`,
                              borderRadius: radius.md,
                              color: currentTheme.accent,
                              fontSize: '0.75rem',
                              fontWeight: fontWeight.medium,
                              cursor: 'pointer',
                              transition: transition.normal,
                            })}
                          >
                            <Globe size={12} />
                            Sources ({turnSources.length})
                            <ChevronDown size={12} style={{ transform: showCouncilColumnConvoSources[turnSourceKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                          </button>
                          {showCouncilColumnConvoSources[turnSourceKey] && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              style={sx(layout.flexCol, { marginTop: spacing.sm, gap: spacing.xs, maxHeight: '170px', overflowY: 'auto' })}
                            >
                              {turnSources.map((source, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={source.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'block',
                                    padding: `${spacing.sm} 10px`,
                                    background: currentTheme.buttonBackground,
                                    border: `1px solid ${currentTheme.borderLight}`,
                                    borderRadius: radius.sm,
                                    textDecoration: 'none',
                                  }}
                                >
                                  <div style={{ fontSize: '0.75rem', fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {source.title}
                                  </div>
                                  <div style={{ fontSize: fontSize['2xs'], color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {source.link}
                                  </div>
                                  {source.snippet && (
                                    <div style={{ fontSize: fontSize.xs, color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                      {source.snippet}
                                    </div>
                                  )}
                                </a>
                              ))}
                            </motion.div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                <textarea
                  data-local-enter-handler="true"
                  value={councilColumnConvoInputs[maximizedCouncilResponse.id] || ''}
                  onChange={(e) => setCouncilColumnConvoInputs(prev => ({ ...prev, [maximizedCouncilResponse.id]: e.target.value }))}
                  onFocus={() => setIsCouncilColumnInputFocused(true)}
                  onBlur={() => setIsCouncilColumnInputFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      e.stopPropagation()
                      handleSendCouncilColumnConvo(maximizedCouncilResponse)
                    }
                  }}
                  placeholder={`Continue conversation with ${getProviderDisplayName(maximizedCouncilResponse.modelName)}...`}
                  disabled={!!councilColumnConvoSending[maximizedCouncilResponse.id]}
                  style={{
                    width: '100%',
                    minHeight: '46px',
                    maxHeight: '130px',
                    padding: `10px ${spacing.lg}`,
                    marginTop: spacing.md,
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: radius.lg,
                    color: currentTheme.text,
                    fontSize: fontSize.base,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    outline: 'none',
                    lineHeight: '1.45',
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default CouncilColumnsView
