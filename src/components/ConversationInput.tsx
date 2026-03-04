import React from 'react'
import { motion } from 'framer-motion'
import { Send, ChevronDown, Globe, FileText, Search, Square, MessageSquarePlus, Info, Coins } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx, createStyles } from '../utils/styles'

interface CouncilFollowUpInputProps {
  councilFollowUpInput: string
  setCouncilFollowUpInput: (v: string) => void
  councilFollowUpSending: boolean
  handleSendCouncilFollowUp: () => void
  setIsCouncilColumnInputFocused: (v: boolean) => void
  theme: string
  currentTheme: any
}

export function CouncilFollowUpInput({
  councilFollowUpInput,
  setCouncilFollowUpInput,
  councilFollowUpSending,
  handleSendCouncilFollowUp,
  setIsCouncilColumnInputFocused,
  theme,
  currentTheme,
}: CouncilFollowUpInputProps) {
  const s = createStyles(currentTheme)
  return (
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
        padding: `5px ${spacing.sm} 5px 14px`,
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
  )
}

interface ConversationInputProps {
  showConversationInput: boolean
  summaryInitialSources: any[]
  summaryConvoSources: Record<number, any[]>
  showSummaryConvoSources: Record<string, boolean>
  setShowSummaryConvoSources: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  summary: any
  isSendingConvo: boolean
  isSearchingInConvo: boolean
  conversationInput: string
  setConversationInput: (v: string) => void
  convoTextareaRef: React.RefObject<HTMLTextAreaElement>
  adjustConvoTextarea: () => void
  handleSendConversation: () => void
  showSingleModelConvoInput: boolean
  singleModelInitialSources: any[]
  singleConvoSources: Record<number, any[]>
  showSingleConvoSources: Record<string, boolean>
  setShowSingleConvoSources: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  singleModelConvoHistory: any[]
  inlineResponseLabel: string
  isSearchingInSingleConvo: boolean
  isSendingSingleConvo: boolean
  singleModelConvoInput: string
  setSingleModelConvoInput: (v: string) => void
  singleConvoTextareaRef: React.RefObject<HTMLTextAreaElement>
  adjustSingleConvoTextarea: () => void
  handleSendSingleModelConvo: () => void
  singleConvoAbortControllerRef: React.MutableRefObject<AbortController | null>
  getProviderDisplayName: (name: string) => string
  primaryResponse: any
  theme: string
  currentTheme: any
  responses: any[]
  allModels: any[]
  lastSubmittedPrompt: string
  handleNewChat: () => void
  tokenData: any[]
  setShowSingleTokenUsage: (v: boolean) => void
  showClearTooltip: boolean
  setShowClearTooltip: (v: boolean) => void
}

export default function ConversationInput({
  showConversationInput,
  summaryInitialSources,
  summaryConvoSources,
  showSummaryConvoSources,
  setShowSummaryConvoSources,
  summary,
  isSendingConvo,
  isSearchingInConvo,
  conversationInput,
  setConversationInput,
  convoTextareaRef,
  adjustConvoTextarea,
  handleSendConversation,
  showSingleModelConvoInput,
  singleModelInitialSources,
  singleConvoSources,
  showSingleConvoSources,
  setShowSingleConvoSources,
  singleModelConvoHistory,
  inlineResponseLabel,
  isSearchingInSingleConvo,
  isSendingSingleConvo,
  singleModelConvoInput,
  setSingleModelConvoInput,
  singleConvoTextareaRef,
  adjustSingleConvoTextarea,
  handleSendSingleModelConvo,
  singleConvoAbortControllerRef,
  getProviderDisplayName,
  primaryResponse,
  theme,
  currentTheme,
  responses,
  allModels,
  lastSubmittedPrompt,
  handleNewChat,
  tokenData,
  setShowSingleTokenUsage,
  showClearTooltip,
  setShowClearTooltip,
}: ConversationInputProps) {
  const s = createStyles(currentTheme)
  return (
    <>
      {/* Summary Initial Sources */}
      {showConversationInput && (() => {
        if (!summaryInitialSources || summaryInitialSources.length === 0) return null
        const toggleKey = 'summary_initial'
        return (
          <div style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
            <button
              onClick={() => setShowSummaryConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
              style={sx(layout.flexRow, {
                gap: spacing.sm, padding: `${spacing.sm} ${spacing.lg}`,
                background: showSummaryConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                border: `1px solid ${showSummaryConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                borderRadius: radius.md, color: currentTheme.accent, fontSize: fontSize.md, fontWeight: fontWeight.medium,
                cursor: 'pointer', transition: transition.normal,
              })}
            >
              <Globe size={14} />
              Sources ({summaryInitialSources.length})
              <ChevronDown size={14} style={{ transform: showSummaryConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </button>
            {showSummaryConvoSources[toggleKey] && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={sx(layout.flexCol, { marginTop: spacing.md, gap: spacing.sm, maxHeight: '200px', overflowY: 'auto' })}
              >
                {summaryInitialSources.map((source, sIdx) => (
                  <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', padding: `${spacing.md} ${spacing.lg}`, background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.md, textDecoration: 'none', transition: 'border-color 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                  >
                    <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                    <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                    {source.snippet && (<div style={{ fontSize: '0.75rem', color: currentTheme.textSecondary, marginTop: spacing.xs, lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                  </a>
                ))}
              </motion.div>
            )}
          </div>
        )
      })()}

      {/* Single-model Initial Sources */}
      {showSingleModelConvoInput && (() => {
        if (!singleModelInitialSources || singleModelInitialSources.length === 0) return null
        const toggleKey = 'single_initial'
        return (
          <div style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
            <button
              onClick={() => setShowSingleConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
              style={sx(layout.flexRow, {
                gap: spacing.sm, padding: `${spacing.sm} ${spacing.lg}`,
                background: showSingleConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                border: `1px solid ${showSingleConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                borderRadius: radius.md, color: currentTheme.accent, fontSize: fontSize.md, fontWeight: fontWeight.medium,
                cursor: 'pointer', transition: transition.normal,
              })}
            >
              <Globe size={14} />
              Sources ({singleModelInitialSources.length})
              <ChevronDown size={14} style={{ transform: showSingleConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </button>
            {showSingleConvoSources[toggleKey] && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={sx(layout.flexCol, { marginTop: spacing.md, gap: spacing.sm, maxHeight: '200px', overflowY: 'auto' })}
              >
                {singleModelInitialSources.map((source, sIdx) => (
                  <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', padding: `${spacing.md} ${spacing.lg}`, background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.md, textDecoration: 'none', transition: 'border-color 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                  >
                    <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                    <div style={{ fontSize: fontSize.xs, color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                    {source.snippet && (<div style={{ fontSize: '0.75rem', color: currentTheme.textSecondary, marginTop: spacing.xs, lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                  </a>
                ))}
              </motion.div>
            )}
          </div>
        )
      })()}

      {/* Summary Conversation History */}
      {summary?.conversationHistory && summary.conversationHistory.length > 0 && (
        summary.conversationHistory.map((exchange: any, idx: number) => (
          <React.Fragment key={`convo-${idx}`}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{
                maxWidth: '75%',
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: `${radius['2xl']} ${radius['2xl']} ${radius.xs} ${radius['2xl']}`,
                padding: `${spacing.lg} 18px`,
              }}>
                <div style={{
                  fontSize: fontSize.xs,
                  fontWeight: fontWeight.semibold,
                  color: currentTheme.text,
                  marginBottom: spacing.xs,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  You
                </div>
                <p style={{
                  color: currentTheme.text,
                  lineHeight: '1.6',
                  fontSize: fontSize['2xl'],
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                }}>
                  {exchange.user}
                </p>
              </div>
            </div>

            {(() => {
              const turnSources = summaryConvoSources[idx] || []
              const hasTurnSources = turnSources.length > 0
              const toggleKey = `summary_${idx}`
              const showSourcesTab = hasTurnSources && !!showSummaryConvoSources[toggleKey]

              return (
                <div style={{ padding: `${spacing.xs} 0 0 ${spacing.xs}` }}>
                  <div style={sx(layout.flexRow, { gap: spacing.md, marginBottom: '10px' })}>
                    <button
                      onClick={() => setShowSummaryConvoSources(prev => ({ ...prev, [toggleKey]: false }))}
                      style={sx(layout.flexRow, {
                        gap: spacing.sm,
                        padding: '5px 10px',
                        background: !showSourcesTab ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                        border: `1px solid ${!showSourcesTab ? currentTheme.accent : currentTheme.borderLight}`,
                        borderRadius: radius.md,
                        color: !showSourcesTab ? currentTheme.accent : currentTheme.textSecondary,
                        fontSize: '0.75rem',
                        fontWeight: fontWeight.semibold,
                        cursor: 'pointer',
                        transition: transition.normal,
                      })}
                    >
                      <FileText size={12} />
                      Response
                    </button>
                    {hasTurnSources && (
                      <button
                        onClick={() => setShowSummaryConvoSources(prev => ({ ...prev, [toggleKey]: true }))}
                        style={sx(layout.flexRow, {
                          gap: spacing.sm,
                          padding: '5px 10px',
                          background: showSourcesTab ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                          border: `1px solid ${showSourcesTab ? currentTheme.accent : currentTheme.borderLight}`,
                          borderRadius: radius.md,
                          color: showSourcesTab ? currentTheme.accent : currentTheme.textSecondary,
                          fontSize: '0.75rem',
                          fontWeight: fontWeight.semibold,
                          cursor: 'pointer',
                          transition: transition.normal,
                        })}
                      >
                        <Globe size={12} />
                        Sources ({turnSources.length})
                      </button>
                    )}
                  </div>

                  {!showSourcesTab ? (
                    <MarkdownRenderer content={exchange.assistant || exchange.judge} theme={currentTheme} fontSize="1rem" lineHeight="1.85" />
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 2 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={sx(layout.flexCol, { gap: spacing.xs, maxHeight: '180px', overflowY: 'auto' })}
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
                            transition: 'border-color 0.2s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                        >
                          <div style={{ fontSize: '0.75rem', fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                          <div style={{ fontSize: fontSize['2xs'], color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                          {source.snippet && (<div style={{ fontSize: fontSize.xs, color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                        </a>
                      ))}
                    </motion.div>
                  )}
                </div>
              )
            })()}
          </React.Fragment>
        ))
      )}

      {/* Summary Fetching Response Indicator */}
      {isSendingConvo && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={sx(layout.flexRow, {
            gap: '10px',
            padding: `${spacing.lg} ${spacing.xl}`,
            maxWidth: '85%',
          })}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            style={{
              width: '16px',
              height: '16px',
              border: `2px solid ${currentTheme.borderLight}`,
              borderTop: `2px solid ${currentTheme.accent}`,
              borderRadius: radius.circle,
              flexShrink: 0,
            }}
          />
          <span style={{
            fontSize: fontSize.base,
            color: currentTheme.textMuted,
            fontStyle: 'italic',
          }}>
            Loading summary model's response...
          </span>
        </motion.div>
      )}

      {/* Summary Conversation Input */}
      {showConversationInput && (
        <div style={{ padding: `${spacing.md} 0 0 0` }}>
          {isSearchingInConvo && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              style={sx(layout.flexRow, {
                gap: spacing.sm,
                marginBottom: '10px',
                padding: `${spacing.sm} ${spacing.lg}`,
                background: currentTheme.buttonBackground,
                borderRadius: radius['3xl'],
                width: 'fit-content',
              })}
            >
              <Search size={14} color={currentTheme.accent} />
              <span style={{
                fontSize: fontSize.base,
                color: currentTheme.text,
                background: currentTheme.accentGradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Searching the web
              </span>
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  background: currentTheme.accentGradient,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                ...
              </motion.span>
            </motion.div>
          )}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                ref={convoTextareaRef}
                value={conversationInput}
                onChange={(e) => {
                  setConversationInput(e.target.value)
                  adjustConvoTextarea()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendConversation()
                  }
                }}
                placeholder="Continue conversation with Judge Model..."
                disabled={isSendingConvo}
                style={{
                  width: '100%',
                  minHeight: '48px',
                  maxHeight: '150px',
                  padding: `${spacing.lg} 48px ${spacing.lg} 18px`,
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '24px',
                  color: currentTheme.text,
                  fontSize: fontSize.xl,
                  resize: 'none',
                  fontFamily: 'inherit',
                  outline: 'none',
                  lineHeight: '1.5',
                  overflow: 'hidden',
                }}
              />
              <motion.button
                onClick={handleSendConversation}
                disabled={!conversationInput.trim() || isSendingConvo}
                style={sx(layout.center, {
                  position: 'absolute',
                  right: spacing.md,
                  bottom: spacing.md,
                  background: 'transparent',
                  border: 'none',
                  color: conversationInput.trim() && !isSendingConvo ? currentTheme.accent : currentTheme.textMuted,
                  cursor: conversationInput.trim() && !isSendingConvo ? 'pointer' : 'not-allowed',
                  transition: transition.normal,
                })}
                whileHover={conversationInput.trim() && !isSendingConvo ? { scale: 1.1 } : {}}
                whileTap={conversationInput.trim() && !isSendingConvo ? { scale: 0.95 } : {}}
              >
                <Send size={16} />
              </motion.button>
            </div>
          </div>
        </div>
      )}

      {/* Single-model Conversation History */}
      {showSingleModelConvoInput && singleModelConvoHistory.length > 0 && (
        singleModelConvoHistory.map((exchange, idx) => (
          <React.Fragment key={`single-convo-${idx}`}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{
                maxWidth: '75%',
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: `${radius['2xl']} ${radius['2xl']} ${radius.xs} ${radius['2xl']}`,
                padding: `${spacing.lg} 18px`,
              }}>
                <div style={{
                  fontSize: fontSize.xs,
                  fontWeight: fontWeight.semibold,
                  color: currentTheme.text,
                  marginBottom: spacing.xs,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  You
                </div>
                <p style={{
                  color: currentTheme.text,
                  lineHeight: '1.6',
                  fontSize: fontSize['2xl'],
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                }}>
                  {exchange.user}
                </p>
              </div>
            </div>

            {(() => {
              const turnSources = singleConvoSources[idx] || []
              const hasTurnSources = turnSources.length > 0
              const toggleKey = `single_${idx}`
              const showSourcesTab = hasTurnSources && !!showSingleConvoSources[toggleKey]

              return (
                <div style={{ padding: `${spacing.xs} 0 0 ${spacing.xs}` }}>
                  <div style={sx(layout.flexRow, { gap: spacing.md, marginBottom: '10px' })}>
                    <button
                      onClick={() => setShowSingleConvoSources(prev => ({ ...prev, [toggleKey]: false }))}
                      style={sx(layout.flexRow, {
                        gap: spacing.sm,
                        padding: '5px 10px',
                        background: !showSourcesTab ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                        border: `1px solid ${!showSourcesTab ? currentTheme.accent : currentTheme.borderLight}`,
                        borderRadius: radius.md,
                        color: !showSourcesTab ? currentTheme.accent : currentTheme.textSecondary,
                        fontSize: '0.75rem',
                        fontWeight: fontWeight.semibold,
                        cursor: 'pointer',
                        transition: transition.normal,
                      })}
                    >
                      <FileText size={12} />
                      {inlineResponseLabel || 'Response'}
                    </button>
                    {hasTurnSources && (
                      <button
                        onClick={() => setShowSingleConvoSources(prev => ({ ...prev, [toggleKey]: true }))}
                        style={sx(layout.flexRow, {
                          gap: spacing.sm,
                          padding: '5px 10px',
                          background: showSourcesTab ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                          border: `1px solid ${showSourcesTab ? currentTheme.accent : currentTheme.borderLight}`,
                          borderRadius: radius.md,
                          color: showSourcesTab ? currentTheme.accent : currentTheme.textSecondary,
                          fontSize: '0.75rem',
                          fontWeight: fontWeight.semibold,
                          cursor: 'pointer',
                          transition: transition.normal,
                        })}
                      >
                        <Globe size={12} />
                        Sources ({turnSources.length})
                      </button>
                    )}
                  </div>

                  {!showSourcesTab ? (
                    <MarkdownRenderer content={exchange.assistant} theme={currentTheme} fontSize="1rem" lineHeight="1.85" />
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 2 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={sx(layout.flexCol, { gap: spacing.xs, maxHeight: '180px', overflowY: 'auto' })}
                    >
                      {turnSources.map((source, sIdx) => (
                        <a
                          key={sIdx}
                          href={source.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'block', padding: `${spacing.sm} 10px`, background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: radius.sm, textDecoration: 'none', transition: 'border-color 0.2s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                        >
                          <div style={{ fontSize: '0.75rem', fontWeight: fontWeight.semibold, color: currentTheme.accent, marginBottom: spacing['2xs'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                          <div style={{ fontSize: fontSize['2xs'], color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                          {source.snippet && (<div style={{ fontSize: fontSize.xs, color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                        </a>
                      ))}
                    </motion.div>
                  )}
                </div>
              )
            })()}
          </React.Fragment>
        ))
      )}

      {/* Single-model Web Search Indicator */}
      {isSearchingInSingleConvo && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          style={sx(layout.flexRow, {
            gap: spacing.sm,
            padding: `${spacing.sm} ${spacing.lg}`,
            background: currentTheme.buttonBackground,
            borderRadius: radius['3xl'],
            width: 'fit-content',
            marginBottom: spacing.xs,
          })}
        >
          <Search size={14} color={currentTheme.accent} />
          <span style={{
            fontSize: fontSize.base,
            color: currentTheme.text,
            background: currentTheme.accentGradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Searching the web
          </span>
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              background: currentTheme.accentGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            ...
          </motion.span>
        </motion.div>
      )}

      {/* Single-model Fetching Response Indicator */}
      {isSendingSingleConvo && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={sx(layout.flexRow, {
            gap: '10px',
            padding: `${spacing.lg} ${spacing.xl}`,
            maxWidth: '85%',
          })}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            style={{
              width: '16px',
              height: '16px',
              border: `2px solid ${currentTheme.borderLight}`,
              borderTop: `2px solid ${currentTheme.accent}`,
              borderRadius: radius.circle,
              flexShrink: 0,
            }}
          />
          <span style={{
            fontSize: fontSize.base,
            color: currentTheme.textMuted,
            fontStyle: 'italic',
          }}>
            {responses.length === 1
              ? `Loading ${allModels.find(m => m.id === responses[0]?.modelName)?.providerName || 'model'}'s response...`
              : 'Loading response...'}
          </span>
        </motion.div>
      )}

      {/* Single-model Conversation Input + Action Buttons */}
      {showSingleModelConvoInput && (
        <div style={{ padding: `${spacing.md} 0 0 0` }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                ref={singleConvoTextareaRef}
                value={singleModelConvoInput}
                onChange={(e) => {
                  setSingleModelConvoInput(e.target.value)
                  adjustSingleConvoTextarea()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendSingleModelConvo()
                  }
                }}
                placeholder={`Continue conversation with ${getProviderDisplayName(primaryResponse?.modelName)}...`}
                disabled={isSendingSingleConvo}
                style={{
                  width: '100%',
                  minHeight: '48px',
                  maxHeight: '150px',
                  padding: `${spacing.lg} 48px ${spacing.lg} 18px`,
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '24px',
                  color: currentTheme.text,
                  fontSize: fontSize.xl,
                  resize: 'none',
                  fontFamily: 'inherit',
                  outline: 'none',
                  lineHeight: '1.5',
                  overflow: 'hidden',
                }}
              />
              <motion.button
                onClick={() => {
                  if (isSendingSingleConvo) {
                    if (singleConvoAbortControllerRef.current) {
                      singleConvoAbortControllerRef.current.abort()
                    }
                  } else {
                    handleSendSingleModelConvo()
                  }
                }}
                disabled={!isSendingSingleConvo && !singleModelConvoInput.trim()}
                style={sx(layout.center, {
                  position: 'absolute',
                  right: spacing.md,
                  bottom: spacing.md,
                  background: isSendingSingleConvo ? '#ef4444' : 'transparent',
                  border: 'none',
                  color: isSendingSingleConvo ? '#fff' : ((!singleModelConvoInput.trim() || isSendingSingleConvo) ? currentTheme.textMuted : currentTheme.accent),
                  cursor: (!isSendingSingleConvo && !singleModelConvoInput.trim()) ? 'not-allowed' : 'pointer',
                  width: isSendingSingleConvo ? '26px' : 'auto',
                  height: isSendingSingleConvo ? '26px' : 'auto',
                  padding: isSendingSingleConvo ? '0' : spacing.sm,
                  borderRadius: isSendingSingleConvo ? radius.md : radius.circle,
                  opacity: (!isSendingSingleConvo && !singleModelConvoInput.trim()) ? 0.4 : 1,
                })}
                whileHover={isSendingSingleConvo ? { scale: 1.05 } : (singleModelConvoInput.trim() ? { scale: 1.1 } : {})}
                whileTap={isSendingSingleConvo ? { scale: 0.95 } : (singleModelConvoInput.trim() ? { scale: 0.95 } : {})}
                title={isSendingSingleConvo ? 'Pause' : 'Send'}
              >
                {isSendingSingleConvo ? <Square size={12} fill="#fff" /> : <Send size={16} />}
              </motion.button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
