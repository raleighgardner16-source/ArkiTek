import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Search, Globe, Send, Maximize2, X } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'

const CouncilColumnsView = ({
  showCouncilColumns,
  isLoading,
  isGeneratingSummary,
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
}) => {
  const [maximizedCouncilResponseId, setMaximizedCouncilResponseId] = useState(null)
  const maximizedCouncilResponse = maximizedCouncilResponseId
    ? councilDisplayResponses.find(r => r.id === maximizedCouncilResponseId) || null
    : null

  return (
    <>
      {/* Phase 2: Council Columns - multi-model streaming responses */}
      {showCouncilColumns && (
        <>
          {isLoading && !isGeneratingSummary && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <motion.button
                onClick={() => { if (onCancelPrompt) onCancelPrompt() }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: theme === 'light' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid #ef4444',
                  borderRadius: '10px',
                  color: theme === 'light' ? '#dc2626' : '#fff',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
                title="Cancel"
              >
                Cancel
              </motion.button>
            </div>
          )}
          {/* Loading Summary indicator at top center */}
          {(isGeneratingSummary || summaryInitializing) && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '30px' }}>
              {isGeneratingSummary && (
                <motion.button
                  onClick={() => { if (onCancelPrompt) onCancelPrompt() }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 14px',
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid #ef4444',
                    borderRadius: '10px',
                    color: theme === 'light' ? '#dc2626' : '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                  }}
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 24px',
                  background: currentTheme.buttonBackground,
                  borderRadius: '12px',
                  border: `1px solid ${currentTheme.borderLight}`,
                }}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  style={{
                    width: '18px',
                    height: '18px',
                    border: `2px solid ${currentTheme.borderLight}`,
                    borderTop: `2px solid ${currentTheme.accent}`,
                    borderRadius: '50%',
                    flexShrink: 0,
                  }}
                />
                <span style={{
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  background: currentTheme.accentGradient,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  Loading Summary...
                </span>
              </motion.div>
            </div>
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
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'ns-resize',
                transition: 'opacity 0.2s ease',
              }}
            >
              {councilGutterHover === 'left' && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: 0.5,
                  pointerEvents: 'none',
                }}>
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

            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'stretch',
              width: councilColumnCount <= 2 ? '800px' : councilColumnCount === 3 ? '1000px' : '1200px',
              maxWidth: '100%',
              flex: '0 0 auto',
              minHeight: 0,
              height: '100%',
              gap: '0',
              overflow: 'hidden',
            }}>
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
                  padding: '0 16px 60px',
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
                        marginBottom: '12px',
                        padding: '10px 12px',
                        background: currentTheme.buttonBackground,
                        border: `1px solid ${currentTheme.borderLight}`,
                        borderRadius: '10px',
                      }}>
                        <div style={{
                          fontSize: '0.68rem',
                          fontWeight: '700',
                          color: currentTheme.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.6px',
                          marginBottom: '4px',
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
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      marginBottom: '12px',
                      paddingBottom: '8px',
                      borderBottom: `1px solid ${currentTheme.borderLight}`,
                      minHeight: '32px',
                    }}>
                      {response.debateRole ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                          <div style={{
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            color: currentTheme.accent,
                            textTransform: 'uppercase',
                            letterSpacing: '0.8px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {response.debateRole.label}
                          </div>
                          <div style={{
                            fontSize: '0.65rem',
                            fontWeight: '500',
                            color: currentTheme.textMuted,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {getProviderDisplayName(response.modelName)}
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          color: currentTheme.accent,
                          textTransform: 'uppercase',
                          letterSpacing: '0.8px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {getProviderDisplayName(response.modelName)}
                        </div>
                      )}
                      <button
                        onClick={() => setMaximizedCouncilResponseId(response.id)}
                        title="Expand response"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          border: `1px solid ${currentTheme.borderLight}`,
                          background: currentTheme.buttonBackground,
                          color: currentTheme.textSecondary,
                          cursor: 'pointer',
                          flexShrink: 0,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <Maximize2 size={13} />
                      </button>
                    </div>
                    <div style={{
                      fontSize: arr.length > 3 ? '0.8rem' : '0.85rem',
                      color: currentTheme.textSecondary,
                      lineHeight: '1.7',
                    }}>
                      {response.text ? (
                        <MarkdownRenderer content={response.text} theme={currentTheme} fontSize={arr.length > 3 ? '0.8rem' : '0.85rem'} lineHeight="1.7" />
                      ) : (
                        <motion.div
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}
                        >
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            style={{
                              width: '14px',
                              height: '14px',
                              border: `2px solid ${currentTheme.borderLight}`,
                              borderTop: `2px solid ${currentTheme.accent}`,
                              borderRadius: '50%',
                            }}
                          />
                          <span style={{ fontSize: '0.8rem', color: currentTheme.textMuted, fontStyle: 'italic' }}>
                            Waiting for response...
                          </span>
                        </motion.div>
                      )}
                    </div>
                    {(showCouncilReviewPhase || (canToggleResultViews && resultViewMode === 'council') || (!response.isStreaming && response.text)) && (
                      <div style={{ marginTop: '14px', borderTop: `1px solid ${currentTheme.borderLight}`, paddingTop: '12px' }}>
                        {/* Initial prompt sources */}
                        {(() => {
                          const initialSources = Array.isArray(response.sources) ? response.sources : []
                          if (initialSources.length === 0) return null
                          return (
                            <div style={{ marginBottom: '10px' }}>
                              <button
                                onClick={() => setShowCouncilColumnSources(prev => ({ ...prev, [response.id]: !prev[response.id] }))}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '5px 10px',
                                  background: showCouncilColumnSources[response.id] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                                  border: `1px solid ${showCouncilColumnSources[response.id] ? currentTheme.accent : currentTheme.borderLight}`,
                                  borderRadius: '8px',
                                  color: currentTheme.accent,
                                  fontSize: '0.75rem',
                                  fontWeight: '500',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
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
                                  style={{ marginTop: '6px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}
                                >
                                  {initialSources.map((source, sIdx) => (
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
                                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {source.title}
                                      </div>
                                      <div style={{ fontSize: '0.65rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {source.link}
                                      </div>
                                      {source.snippet && (
                                        <div style={{ fontSize: '0.7rem', color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
                            <div style={{ fontSize: '0.7rem', color: currentTheme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>You</div>
                            <div style={{
                              marginBottom: '8px',
                              padding: '8px 10px',
                              borderRadius: '10px',
                              border: theme === 'light' ? '1px solid rgba(0, 0, 0, 0.15)' : '1px solid rgba(255, 255, 255, 0.35)',
                              background: theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.08)',
                            }}>
                              <div style={{ fontSize: '0.8rem', color: theme === 'light' ? '#111111' : currentTheme.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                {turn.user}
                              </div>
                            </div>
                            {isLastTurn && councilColumnConvoSearching[response.id] && (
                              <motion.div
                                initial={{ opacity: 0, y: 3 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  marginBottom: '8px',
                                  padding: '5px 10px',
                                  background: currentTheme.buttonBackground,
                                  borderRadius: '16px',
                                  width: 'fit-content',
                                }}
                              >
                                <Search size={12} color={currentTheme.accent} />
                                <span style={{
                                  fontSize: '0.75rem',
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
                            <div style={{ fontSize: '0.7rem', color: currentTheme.accent, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                              {response.debateRole ? `${response.debateRole.label} · ${getProviderDisplayName(response.modelName)}` : getProviderDisplayName(response.modelName)}
                            </div>
                            {turn.assistant ? (
                              <div style={{ fontSize: '0.8rem', color: currentTheme.textSecondary, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                <MarkdownRenderer
                                  content={turn.assistant}
                                  theme={currentTheme}
                                  fontSize="0.8rem"
                                  lineHeight="1.6"
                                />
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.8rem', color: currentTheme.textSecondary, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                {councilColumnConvoSending[response.id] ? 'Thinking...' : ''}
                              </div>
                            )}
                            {turnSources.length > 0 && (
                              <div style={{ marginTop: '8px' }}>
                                <button
                                  onClick={() => setShowCouncilColumnConvoSources(prev => ({ ...prev, [turnSourceKey]: !prev[turnSourceKey] }))}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 8px',
                                    background: showCouncilColumnConvoSources[turnSourceKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                                    border: `1px solid ${showCouncilColumnConvoSources[turnSourceKey] ? currentTheme.accent : currentTheme.borderLight}`,
                                    borderRadius: '8px',
                                    color: currentTheme.accent,
                                    fontSize: '0.7rem',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                  }}
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
                                    style={{ marginTop: '5px', marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '160px', overflowY: 'auto' }}
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
                                          borderRadius: '6px',
                                          textDecoration: 'none',
                                          transition: 'border-color 0.2s',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                                      >
                                        <div style={{ fontSize: '0.7rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {source.title}
                                        </div>
                                        <div style={{ fontSize: '0.6rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {source.link}
                                        </div>
                                        {source.snippet && (
                                          <div style={{ fontSize: '0.65rem', color: currentTheme.textSecondary, marginTop: '2px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
                            padding: '10px 12px',
                            background: currentTheme.buttonBackground,
                            border: `1px solid ${currentTheme.borderLight}`,
                            borderRadius: '10px',
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
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'ns-resize',
                transition: 'opacity 0.2s ease',
              }}
            >
              {councilGutterHover === 'right' && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: 0.5,
                  pointerEvents: 'none',
                }}>
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
      )}

      {/* Expanded Council Column Response Popup */}
      <AnimatePresence>
        {maximizedCouncilResponse && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMaximizedCouncilResponseId(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: theme === 'light' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.72)',
              backdropFilter: 'blur(4px)',
            }}
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
                  borderRadius: '8px',
                  padding: '6px',
                  color: '#ff6b6b',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>

              <div style={{ marginBottom: '14px', paddingRight: '36px' }}>
                {maximizedCouncilResponse.debateRole ? (
                  <>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '1.25rem',
                        fontWeight: '700',
                        background: currentTheme.accentGradient,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
                    >
                      {maximizedCouncilResponse.debateRole.label}
                    </h3>
                    <span style={{
                      fontSize: '0.8rem',
                      color: currentTheme.textMuted,
                      fontWeight: '500',
                    }}>
                      {getProviderDisplayName(maximizedCouncilResponse.modelName)}
                    </span>
                  </>
                ) : (
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '1.25rem',
                      fontWeight: '700',
                      background: currentTheme.accentGradient,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    {getProviderDisplayName(maximizedCouncilResponse.modelName)}
                  </h3>
                )}
              </div>

              <MarkdownRenderer
                content={typeof maximizedCouncilResponse.text === 'string' ? maximizedCouncilResponse.text : String(maximizedCouncilResponse.text || '')}
                theme={currentTheme}
                fontSize="1rem"
                lineHeight="1.8"
              />

              {Array.isArray(maximizedCouncilResponse.sources) && maximizedCouncilResponse.sources.length > 0 && (
                <div style={{ marginTop: '14px', borderTop: `1px solid ${currentTheme.borderLight}`, paddingTop: '12px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px',
                    color: currentTheme.accent,
                    fontSize: '0.85rem',
                    fontWeight: '600',
                  }}>
                    <Globe size={14} />
                    Sources ({maximizedCouncilResponse.sources.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                    {maximizedCouncilResponse.sources.map((source, sIdx) => (
                      <a
                        key={sIdx}
                        href={source.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'block',
                          padding: '8px 12px',
                          background: currentTheme.buttonBackground,
                          border: `1px solid ${currentTheme.borderLight}`,
                          borderRadius: '8px',
                          textDecoration: 'none',
                          transition: 'border-color 0.2s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = currentTheme.accent }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = currentTheme.borderLight }}
                      >
                        <div style={{ fontSize: '0.8rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {source.title}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {source.link}
                        </div>
                        {source.snippet && (
                          <div style={{ fontSize: '0.75rem', color: currentTheme.textSecondary, marginTop: '4px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {source.snippet}
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: '16px', borderTop: `1px solid ${currentTheme.borderLight}`, paddingTop: '12px' }}>
                {(councilColumnConvoHistory[maximizedCouncilResponse.id] || []).map((turn, turnIdx) => {
                  const turnSourceKey = `${maximizedCouncilResponse.id}-${turnIdx}`
                  const turnSources = councilColumnConvoSources[turnSourceKey] || []
                  const isLastTurn = turnIdx === (councilColumnConvoHistory[maximizedCouncilResponse.id] || []).length - 1
                  return (
                    <div key={`${maximizedCouncilResponse.id}-modal-turn-${turnIdx}`} style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{
                          maxWidth: '80%',
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: theme === 'light' ? '1px solid rgba(0, 0, 0, 0.15)' : '1px solid rgba(255, 255, 255, 0.35)',
                          background: theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.08)',
                        }}>
                          <div style={{ fontSize: '0.8rem', color: theme === 'light' ? '#111111' : currentTheme.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {turn.user}
                          </div>
                        </div>
                      </div>

                      {isLastTurn && councilColumnConvoSearching[maximizedCouncilResponse.id] && (
                        <motion.div
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            margin: '8px 0 6px',
                            padding: '5px 10px',
                            background: currentTheme.buttonBackground,
                            borderRadius: '16px',
                            width: 'fit-content',
                          }}
                        >
                          <Search size={12} color={currentTheme.accent} />
                          <span style={{
                            fontSize: '0.75rem',
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

                      <div style={{ marginTop: '6px', fontSize: '0.95rem', color: currentTheme.textSecondary, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        <MarkdownRenderer content={turn.assistant || ''} theme={currentTheme} fontSize="0.95rem" lineHeight="1.7" />
                      </div>

                      {turnSources.length > 0 && (
                        <div style={{ marginTop: '8px' }}>
                          <button
                            onClick={() => setShowCouncilColumnConvoSources(prev => ({ ...prev, [turnSourceKey]: !prev[turnSourceKey] }))}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 10px',
                              background: showCouncilColumnConvoSources[turnSourceKey] ? `${currentTheme.accent}15` : currentTheme.buttonBackground,
                              border: `1px solid ${showCouncilColumnConvoSources[turnSourceKey] ? currentTheme.accent : currentTheme.borderLight}`,
                              borderRadius: '8px',
                              color: currentTheme.accent,
                              fontSize: '0.75rem',
                              fontWeight: '500',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
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
                              style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '170px', overflowY: 'auto' }}
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
                                  }}
                                >
                                  <div style={{ fontSize: '0.75rem', fontWeight: '600', color: currentTheme.accent, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {source.title}
                                  </div>
                                  <div style={{ fontSize: '0.65rem', color: currentTheme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {source.link}
                                  </div>
                                  {source.snippet && (
                                    <div style={{ fontSize: '0.7rem', color: currentTheme.textSecondary, marginTop: '3px', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
                    padding: '10px 12px',
                    marginTop: '8px',
                    background: currentTheme.buttonBackground,
                    border: `1px solid ${currentTheme.borderLight}`,
                    borderRadius: '10px',
                    color: currentTheme.text,
                    fontSize: '0.85rem',
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
