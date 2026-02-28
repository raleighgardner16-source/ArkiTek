import React from 'react'
import { motion } from 'framer-motion'
import { Send, ChevronDown, Globe, FileText, Search, Square, MessageSquarePlus, Info, Coins } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'

export function CouncilFollowUpInput({
  councilFollowUpInput,
  setCouncilFollowUpInput,
  councilFollowUpSending,
  handleSendCouncilFollowUp,
  setIsCouncilColumnInputFocused,
  theme,
  currentTheme,
}) {
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
        padding: '8px 20px 14px',
        background: theme === 'light'
          ? 'linear-gradient(to top, rgba(255,255,255,0.98) 65%, rgba(255,255,255,0))'
          : 'linear-gradient(to top, rgba(10,10,15,0.98) 65%, rgba(10,10,15,0))',
        zIndex: 25,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        maxWidth: '520px',
        background: currentTheme.buttonBackground,
        border: `1px solid ${currentTheme.borderLight}`,
        borderRadius: '12px',
        padding: '5px 6px 5px 14px',
        boxShadow: theme === 'light'
          ? '0 2px 12px rgba(0,0,0,0.08)'
          : '0 2px 16px rgba(0,0,0,0.4)',
        pointerEvents: 'auto',
      }}>
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
            fontSize: '0.8rem',
            fontFamily: 'inherit',
            padding: '5px 0',
          }}
        />
        <motion.button
          onClick={handleSendCouncilFollowUp}
          disabled={!councilFollowUpInput.trim() || councilFollowUpSending}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.93 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            border: 'none',
            background: councilFollowUpInput.trim() && !councilFollowUpSending
              ? currentTheme.accentGradient
              : 'transparent',
            color: councilFollowUpInput.trim() && !councilFollowUpSending
              ? '#ffffff'
              : currentTheme.textMuted,
            cursor: councilFollowUpInput.trim() && !councilFollowUpSending ? 'pointer' : 'default',
            opacity: councilFollowUpInput.trim() && !councilFollowUpSending ? 1 : 0.4,
            transition: 'all 0.2s ease',
            flexShrink: 0,
          }}
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
                borderRadius: '50%',
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
}) {
  return (
    <>
      {/* Summary Initial Sources */}
      {showConversationInput && (() => {
        if (!summaryInitialSources || summaryInitialSources.length === 0) return null
        const toggleKey = 'summary_initial'
        return (
          <div style={{ marginTop: '8px', marginBottom: '4px' }}>
            <button
              onClick={() => setShowSummaryConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                background: showSummaryConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                border: `1px solid ${showSummaryConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                borderRadius: '8px', color: currentTheme.accent, fontSize: '0.8rem', fontWeight: '500',
                cursor: 'pointer', transition: 'all 0.2s ease',
              }}
            >
              <Globe size={14} />
              Sources ({summaryInitialSources.length})
              <ChevronDown size={14} style={{ transform: showSummaryConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </button>
            {showSummaryConvoSources[toggleKey] && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}
              >
                {summaryInitialSources.map((source, sIdx) => (
                  <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', padding: '8px 12px', background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: '8px', textDecoration: 'none', transition: 'border-color 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                  >
                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                    <div style={{ fontSize: '0.7rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                    {source.snippet && (<div style={{ fontSize: '0.75rem', color: currentTheme.textSecondary, marginTop: '4px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
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
          <div style={{ marginTop: '8px', marginBottom: '4px' }}>
            <button
              onClick={() => setShowSingleConvoSources(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                background: showSingleConvoSources[toggleKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                border: `1px solid ${showSingleConvoSources[toggleKey] ? currentTheme.accent : currentTheme.borderLight}`,
                borderRadius: '8px', color: currentTheme.accent, fontSize: '0.8rem', fontWeight: '500',
                cursor: 'pointer', transition: 'all 0.2s ease',
              }}
            >
              <Globe size={14} />
              Sources ({singleModelInitialSources.length})
              <ChevronDown size={14} style={{ transform: showSingleConvoSources[toggleKey] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </button>
            {showSingleConvoSources[toggleKey] && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}
              >
                {singleModelInitialSources.map((source, sIdx) => (
                  <a key={sIdx} href={source.link} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', padding: '8px 12px', background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: '8px', textDecoration: 'none', transition: 'border-color 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                  >
                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                    <div style={{ fontSize: '0.7rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                    {source.snippet && (<div style={{ fontSize: '0.75rem', color: currentTheme.textSecondary, marginTop: '4px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
                  </a>
                ))}
              </motion.div>
            )}
          </div>
        )
      })()}

      {/* Summary Conversation History */}
      {summary?.conversationHistory && summary.conversationHistory.length > 0 && (
        summary.conversationHistory.map((exchange, idx) => (
          <React.Fragment key={`convo-${idx}`}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{
                maxWidth: '75%',
                background: currentTheme.buttonBackground,
                border: `1px solid ${currentTheme.borderLight}`,
                borderRadius: '16px 16px 4px 16px',
                padding: '12px 18px',
              }}>
                <div style={{
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  color: currentTheme.text,
                  marginBottom: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  You
                </div>
                <p style={{
                  color: currentTheme.text,
                  lineHeight: '1.6',
                  fontSize: '1rem',
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
                <div style={{ padding: '4px 0 0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <button
                      onClick={() => setShowSummaryConvoSources(prev => ({ ...prev, [toggleKey]: false }))}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 10px',
                        background: !showSourcesTab ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                        border: `1px solid ${!showSourcesTab ? currentTheme.accent : currentTheme.borderLight}`,
                        borderRadius: '8px',
                        color: !showSourcesTab ? currentTheme.accent : currentTheme.textSecondary,
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <FileText size={12} />
                      Response
                    </button>
                    {hasTurnSources && (
                      <button
                        onClick={() => setShowSummaryConvoSources(prev => ({ ...prev, [toggleKey]: true }))}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 10px',
                          background: showSourcesTab ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                          border: `1px solid ${showSourcesTab ? currentTheme.accent : currentTheme.borderLight}`,
                          borderRadius: '8px',
                          color: showSourcesTab ? currentTheme.accent : currentTheme.textSecondary,
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
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
                      style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}
                    >
                      {turnSources.map((source, sIdx) => (
                        <a
                          key={sIdx}
                          href={source.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'block',
                            padding: '6px 10px',
                            background: currentTheme.buttonBackground,
                            border: `1px solid ${currentTheme.borderLight}`,
                            borderRadius: '6px',
                            textDecoration: 'none',
                            transition: 'border-color 0.2s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                        >
                          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                          <div style={{ fontSize: '0.65rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                          {source.snippet && (<div style={{ fontSize: '0.7rem', color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            maxWidth: '85%',
          }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            style={{
              width: '16px',
              height: '16px',
              border: `2px solid ${currentTheme.borderLight}`,
              borderTop: `2px solid ${currentTheme.accent}`,
              borderRadius: '50%',
              flexShrink: 0,
            }}
          />
          <span style={{
            fontSize: '0.85rem',
            color: currentTheme.textMuted,
            fontStyle: 'italic',
          }}>
            Loading summary model's response...
          </span>
        </motion.div>
      )}

      {/* Summary Conversation Input */}
      {showConversationInput && (
        <div style={{ padding: '8px 0 0 0' }}>
          {isSearchingInConvo && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px',
                padding: '6px 12px',
                background: currentTheme.buttonBackground,
                borderRadius: '20px',
                width: 'fit-content',
              }}
            >
              <Search size={14} color={currentTheme.accent} />
              <span style={{
                fontSize: '0.85rem',
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
                  padding: '12px 48px 12px 18px',
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '24px',
                  color: currentTheme.text,
                  fontSize: '0.95rem',
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
                style={{
                  position: 'absolute',
                  right: '8px',
                  bottom: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: conversationInput.trim() && !isSendingConvo ? currentTheme.accent : currentTheme.textMuted,
                  cursor: conversationInput.trim() && !isSendingConvo ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
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
                borderRadius: '16px 16px 4px 16px',
                padding: '12px 18px',
              }}>
                <div style={{
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  color: currentTheme.text,
                  marginBottom: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  You
                </div>
                <p style={{
                  color: currentTheme.text,
                  lineHeight: '1.6',
                  fontSize: '1rem',
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
                <div style={{ padding: '4px 0 0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <button
                      onClick={() => setShowSingleConvoSources(prev => ({ ...prev, [toggleKey]: false }))}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 10px',
                        background: !showSourcesTab ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                        border: `1px solid ${!showSourcesTab ? currentTheme.accent : currentTheme.borderLight}`,
                        borderRadius: '8px',
                        color: !showSourcesTab ? currentTheme.accent : currentTheme.textSecondary,
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <FileText size={12} />
                      {inlineResponseLabel || 'Response'}
                    </button>
                    {hasTurnSources && (
                      <button
                        onClick={() => setShowSingleConvoSources(prev => ({ ...prev, [toggleKey]: true }))}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 10px',
                          background: showSourcesTab ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                          border: `1px solid ${showSourcesTab ? currentTheme.accent : currentTheme.borderLight}`,
                          borderRadius: '8px',
                          color: showSourcesTab ? currentTheme.accent : currentTheme.textSecondary,
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
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
                      style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}
                    >
                      {turnSources.map((source, sIdx) => (
                        <a
                          key={sIdx}
                          href={source.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'block', padding: '6px 10px', background: currentTheme.buttonBackground, border: `1px solid ${currentTheme.borderLight}`, borderRadius: '6px', textDecoration: 'none', transition: 'border-color 0.2s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                        >
                          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
                          <div style={{ fontSize: '0.65rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.link}</div>
                          {source.snippet && (<div style={{ fontSize: '0.7rem', color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.snippet}</div>)}
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            background: currentTheme.buttonBackground,
            borderRadius: '20px',
            width: 'fit-content',
            marginBottom: '4px',
          }}
        >
          <Search size={14} color={currentTheme.accent} />
          <span style={{
            fontSize: '0.85rem',
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            maxWidth: '85%',
          }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            style={{
              width: '16px',
              height: '16px',
              border: `2px solid ${currentTheme.borderLight}`,
              borderTop: `2px solid ${currentTheme.accent}`,
              borderRadius: '50%',
              flexShrink: 0,
            }}
          />
          <span style={{
            fontSize: '0.85rem',
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
        <div style={{ padding: '8px 0 0 0' }}>
          {(responses.length > 0 && lastSubmittedPrompt) && (
            <div style={{ display: 'flex', justifyContent: 'stretch', gap: '6px', marginBottom: '8px', width: '100%' }}>
              <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                <motion.button
                  onClick={handleNewChat}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    background: theme === 'light' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.12)',
                    border: theme === 'light' ? '1px solid rgba(200, 200, 200, 0.8)' : '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '12px',
                    color: theme === 'light' ? '#333' : '#ffffff',
                    fontSize: '0.7rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    height: '28px',
                  }}
                  whileHover={{
                    background: theme === 'light' ? 'rgba(240, 240, 240, 1)' : 'rgba(255, 255, 255, 0.2)',
                  }}
                  whileTap={{ scale: 0.96 }}
                >
                  <MessageSquarePlus size={12} />
                  New Chat
                </motion.button>
                <div
                  style={{ position: 'absolute', top: '-6px', right: '-6px', cursor: 'help', zIndex: 10 }}
                  onMouseEnter={() => setShowClearTooltip(true)}
                  onMouseLeave={() => setShowClearTooltip(false)}
                >
                  <Info size={10} color={currentTheme.textMuted} />
                  {showClearTooltip && (
                    <div style={{
                      position: 'absolute',
                      bottom: '16px',
                      right: 0,
                      background: currentTheme.backgroundOverlay,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '8px',
                      padding: '6px 10px',
                      fontSize: '0.7rem',
                      color: currentTheme.textSecondary,
                      width: '180px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      zIndex: 100,
                    }}>
                      Start a new chat and clear the current conversation.
                    </div>
                  )}
                </div>
              </div>

              {tokenData && tokenData.length > 0 && (
                <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                  <motion.button
                    onClick={() => setShowSingleTokenUsage(true)}
                    style={{
                      flex: 1,
                      padding: '4px 6px',
                      background: currentTheme.buttonBackground,
                      border: `1px solid ${currentTheme.borderLight}`,
                      borderRadius: '12px',
                      color: currentTheme.accent,
                      fontSize: '0.7rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap',
                      height: '28px',
                    }}
                    whileHover={{
                      background: currentTheme.buttonBackgroundHover,
                    }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <Coins size={12} />
                    Model Usage Window
                  </motion.button>
                </div>
              )}

            </div>
          )}

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
                  padding: '12px 48px 12px 18px',
                  background: currentTheme.buttonBackground,
                  border: `1px solid ${currentTheme.borderLight}`,
                  borderRadius: '24px',
                  color: currentTheme.text,
                  fontSize: '0.95rem',
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
                style={{
                  position: 'absolute',
                  right: '8px',
                  bottom: '8px',
                  background: isSendingSingleConvo ? '#ef4444' : 'transparent',
                  border: isSendingSingleConvo ? 'none' : 'none',
                  color: isSendingSingleConvo ? '#fff' : ((!singleModelConvoInput.trim() || isSendingSingleConvo) ? currentTheme.textMuted : currentTheme.accent),
                  cursor: (!isSendingSingleConvo && !singleModelConvoInput.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: isSendingSingleConvo ? '26px' : 'auto',
                  height: isSendingSingleConvo ? '26px' : 'auto',
                  padding: isSendingSingleConvo ? '0' : '6px',
                  borderRadius: isSendingSingleConvo ? '8px' : '50%',
                  opacity: (!isSendingSingleConvo && !singleModelConvoInput.trim()) ? 0.4 : 1,
                }}
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
