import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Eye, HelpCircle, ChevronDown, ChevronUp, Info, Zap, Send, Globe, Settings, Brain, Gavel, Workflow } from 'lucide-react'
import { spacing, fontSize, fontWeight, radius, zIndex, transition, layout, sx } from '../utils/styles'

// Friendly provider name mapping
const providerDisplayName = (provider: string): string => {
  const map = {
    openai: 'ChatGPT (OpenAI)',
    anthropic: 'Claude (Anthropic)',
    google: 'Gemini (Google)',
    xai: 'Grok (xAI)',
    mistral: 'Mistral',
  }
  return (map as Record<string, string>)[provider] || provider.charAt(0).toUpperCase() + provider.slice(1)
}

interface Props {
  isOpen: boolean
  onClose: () => void
  tokenData: any[]
  inline?: boolean
}

const TokenUsageWindow = ({ isOpen, onClose, tokenData, inline = false }: Props) => {
  const [showExplainer, setShowExplainer] = useState(false)

  if (!isOpen || !tokenData || tokenData.length === 0) return null

  // Separate pipeline (category detection), judge, cancelled summary, and regular counted items
  const pipelineItems = tokenData.filter(item => item.isPipeline)
  const judgeItems = tokenData.filter(item => item.isJudge)
  const cancelledSummaryItems = tokenData.filter(item => item.isCancelledSummary)
  const countedItems = tokenData.filter(item => !item.isPipeline && !item.isJudge && !item.isCancelledSummary)

  // Group COUNTED tokens by provider and aggregate totals
  const groupedByProvider: Record<string, any> = {}
  countedItems.forEach((item: any) => {
    if (!item.tokens) return
    const provider = item.tokens.provider || 'unknown'
    if (!groupedByProvider[provider]) {
      groupedByProvider[provider] = {
        totalInput: 0,
        totalOutput: 0,
        totalReasoning: 0,
        totalTokens: 0,
        models: []
      }
    }
    const input = item.tokens.input || 0
    const output = item.tokens.output || 0
    const reasoning = item.tokens.reasoningTokens || 0
    const total = input + output
    
    groupedByProvider[provider].totalInput += input
    groupedByProvider[provider].totalOutput += output
    groupedByProvider[provider].totalReasoning += reasoning
    groupedByProvider[provider].totalTokens += total
    groupedByProvider[provider].models.push({
      model: item.modelName || item.tokens.model || 'unknown',
      input,
      output,
      reasoning,
      total,
      source: item.tokens.source || 'unknown',
      breakdown: item.tokens.breakdown || null
    })
  })

  // Calculate totals (counted items + judge — excludes pipeline)
  const allCountedItems = [...countedItems, ...judgeItems]
  const totalInput = allCountedItems.reduce((sum, item) => sum + (item.tokens?.input || 0), 0)
  const totalOutput = allCountedItems.reduce((sum, item) => sum + (item.tokens?.output || 0), 0)
  const totalReasoning = allCountedItems.reduce((sum, item) => sum + (item.tokens?.reasoningTokens || 0), 0)
  const totalTokens = totalInput + totalOutput

  // Judge totals (for separate display section)
  const judgeTotalInput = judgeItems.reduce((sum, item) => sum + (item.tokens?.input || 0), 0)
  const judgeTotalOutput = judgeItems.reduce((sum, item) => sum + (item.tokens?.output || 0), 0)
  const judgeTotalTokens = judgeTotalInput + judgeTotalOutput

  // Pipeline totals (for display only — not counted in stats)
  const pipelineTotalInput = pipelineItems.reduce((sum, item) => sum + (item.tokens?.input || 0), 0)
  const pipelineTotalOutput = pipelineItems.reduce((sum, item) => sum + (item.tokens?.output || 0), 0)
  const pipelineTotalTokens = pipelineTotalInput + pipelineTotalOutput

  // Calculate aggregate breakdown (across all counted models that have breakdown data)
  const hasAnyBreakdown = countedItems.some(item => item.tokens?.breakdown)
  let totalUserPrompt = 0
  let totalSourceContext = 0
  let totalSystemOverhead = 0
  let modelsWithSources = 0

  if (hasAnyBreakdown) {
    countedItems.forEach(item => {
      if (item.tokens?.breakdown) {
        totalUserPrompt += item.tokens.breakdown.userPrompt || 0
        totalSourceContext += item.tokens.breakdown.sourceContext || 0
        totalSystemOverhead += item.tokens.breakdown.systemOverhead || 0
        modelsWithSources++
      }
    })
  }

  const singleUserPromptEstimate = hasAnyBreakdown && modelsWithSources > 0
    ? Math.round(totalUserPrompt / modelsWithSources)
    : 0

  // Reusable breakdown section for per-model cards
  const renderModelBreakdown = (breakdown: any) => {
    if (!breakdown) return null
    return (
      <div style={{
        marginTop: spacing.md,
        padding: `${spacing.md} 10px`,
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: radius.sm,
        border: '1px solid rgba(255, 255, 255, 0.06)',
        fontSize: fontSize.xs,
      }}>
        <div style={{ color: '#888', fontWeight: fontWeight.semibold, marginBottom: spacing.sm, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Input Breakdown
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.sm }}>
          <div>
            <div style={sx(layout.flexRow, { color: '#48c9b0', marginBottom: spacing['2xs'], gap: '3px' })}>
              <Send size={9} /> Your Prompt
            </div>
            <div style={{ color: '#fff' }}>~{(breakdown.userPrompt || 0).toLocaleString()}</div>
          </div>
          <div>
            <div style={sx(layout.flexRow, { color: '#e67e22', marginBottom: spacing['2xs'], gap: '3px' })}>
              <Globe size={9} /> Web Sources
            </div>
            <div style={{ color: '#fff' }}>~{(breakdown.sourceContext || 0).toLocaleString()}</div>
          </div>
          <div>
            <div style={sx(layout.flexRow, { color: '#888', marginBottom: spacing['2xs'], gap: '3px' })}>
              <Settings size={9} /> System Instructions
            </div>
            <div style={{ color: '#fff' }}>~{(breakdown.systemOverhead || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>
    )
  }

  // The "What are tokens?" explainer component
  const renderTokenExplainer = () => (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        background: 'rgba(93, 173, 226, 0.04)',
        border: '1px solid rgba(93, 173, 226, 0.15)',
        borderRadius: radius.lg,
        padding: `14px ${spacing.xl}`,
        marginBottom: spacing.xl,
        overflow: 'hidden',
      }}
    >
      <div style={{ fontSize: '0.78rem', color: '#ccc', lineHeight: '1.65' }}>
        <div style={{ color: '#5dade2', fontWeight: fontWeight.bold, fontSize: '0.82rem', marginBottom: '10px' }}>
          What are tokens?
        </div>
        <p style={{ margin: '0 0 10px 0' }}>
          Tokens are the units AI models use to read and write text. Think of them like word fragments — 
          the word <span style={{ color: '#48c9b0', fontWeight: fontWeight.semibold }}>"hello"</span> is 1 token, 
          but <span style={{ color: '#48c9b0', fontWeight: fontWeight.semibold }}>"capabilities"</span> might be 2-3 tokens. 
          On average, <strong style={{ color: '#fff' }}>1 token ≈ ¾ of a word</strong>.
        </p>

        <div style={{ color: '#5dade2', fontWeight: fontWeight.bold, fontSize: '0.82rem', marginBottom: spacing.md, marginTop: '14px' }}>
          Why does "hey there" use 100+ input tokens?
        </div>
        <p style={{ margin: `0 0 ${spacing.md} 0` }}>
          Your actual message is only a few tokens, but every prompt sent to an AI model also includes behind-the-scenes context:
        </p>
        <div style={sx(layout.flexCol, { gap: spacing.sm, marginLeft: spacing.xs, marginBottom: '10px' })}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md }}>
            <Settings size={13} color="#888" style={{ marginTop: spacing['2xs'], flexShrink: 0 }} />
            <span><strong style={{ color: '#fff' }}>System instructions</strong> — tells the model the current date, how to format its answer, and general behavior guidelines.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md }}>
            <Globe size={13} color="#e67e22" style={{ marginTop: spacing['2xs'], flexShrink: 0 }} />
            <span><strong style={{ color: '#e67e22' }}>Web sources</strong> — if a search was performed, scraped web content is included so the model can reference real-time information. This is often the largest chunk.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md }}>
            <Send size={13} color="#48c9b0" style={{ marginTop: spacing['2xs'], flexShrink: 0 }} />
            <span><strong style={{ color: '#48c9b0' }}>Your prompt</strong> — the actual text you typed, usually only a small fraction of the total.</span>
          </div>
        </div>
        <p style={{ margin: '0 0 0 0', color: '#999', fontSize: '0.72rem' }}>
          This is the same way ChatGPT, Claude, and every other AI app works — they all send system instructions behind the scenes. We just show you the breakdown for full transparency.
        </p>

        <div style={{ color: '#5dade2', fontWeight: fontWeight.bold, fontSize: '0.82rem', marginBottom: spacing.md, marginTop: '14px' }}>
          Input vs. Output vs. Reasoning
        </div>
        <div style={sx(layout.flexCol, { gap: spacing.xs, marginLeft: spacing.xs })}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md }}>
            <span style={{ color: '#5dade2', fontWeight: fontWeight.bold, minWidth: '52px' }}>Input</span>
            <span>— everything sent <em>to</em> the model (your prompt + system instructions + web sources).</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md }}>
            <span style={{ color: '#48c9b0', fontWeight: fontWeight.bold, minWidth: '52px' }}>Output</span>
            <span>— the model's response back to you.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md }}>
            <span style={{ color: '#FFD700', fontWeight: fontWeight.bold, minWidth: '52px' }}>Reasoning</span>
            <span>— some models "think" before answering. These internal thinking tokens are separate from the visible response.</span>
          </div>
        </div>
      </div>
    </motion.div>
  )

  // If inline mode, render without modal overlay
  if (inline) {
    const inlinePipelineItems = tokenData.filter(item => item.isPipeline)
    const inlineJudgeItems = tokenData.filter(item => item.isJudge)
    const inlineCancelledSummaryItems = tokenData.filter(item => item.isCancelledSummary)
    const inlineCountedItems = tokenData.filter(item => !item.isPipeline && !item.isJudge && !item.isCancelledSummary)

    const inlineGrouped: Record<string, any> = {}
    inlineCountedItems.forEach((item: any) => {
      if (!item.tokens) return
      const provider = item.tokens.provider || 'unknown'
      if (!inlineGrouped[provider]) {
        inlineGrouped[provider] = {
          totalInput: 0,
          totalOutput: 0,
          totalReasoning: 0,
          totalTokens: 0,
          models: []
        }
      }
      inlineGrouped[provider].totalInput += item.tokens.inputTokens || item.tokens.input || 0
      inlineGrouped[provider].totalOutput += item.tokens.outputTokens || item.tokens.output || 0
      inlineGrouped[provider].totalReasoning += item.tokens.reasoningTokens || 0
      inlineGrouped[provider].totalTokens += (item.tokens.inputTokens || item.tokens.input || 0) + (item.tokens.outputTokens || item.tokens.output || 0)
      inlineGrouped[provider].models.push(item)
    })

    const inlineJudgeTotalInput = inlineJudgeItems.reduce((sum, item) => sum + (item.tokens?.inputTokens || item.tokens?.input || 0), 0)
    const inlineJudgeTotalOutput = inlineJudgeItems.reduce((sum, item) => sum + (item.tokens?.outputTokens || item.tokens?.output || 0), 0)
    const inlineJudgeTotalTokens = inlineJudgeTotalInput + inlineJudgeTotalOutput

    const inlineAllCounted = [...inlineCountedItems, ...inlineJudgeItems]
    const inlineTotalTokens = inlineAllCounted.reduce((sum, item) => sum + (item.tokens?.inputTokens || item.tokens?.input || 0) + (item.tokens?.outputTokens || item.tokens?.output || 0), 0)
    const inlineTotalReasoning = inlineAllCounted.reduce((sum, item) => sum + (item.tokens?.reasoningTokens || 0), 0)

    return (
      <div style={{ padding: spacing.xl }}>
        <div style={sx(layout.spaceBetween, { marginBottom: spacing.lg })}>
          <h3 style={{ color: '#5dade2', fontSize: fontSize['4xl'], margin: 0, fontWeight: fontWeight.bold }}>
            Prompt Token Usage
          </h3>
          <button
            onClick={() => setShowExplainer(!showExplainer)}
            style={sx(layout.flexRow, {
              background: showExplainer ? 'rgba(93, 173, 226, 0.15)' : 'rgba(93, 173, 226, 0.08)',
              border: '1px solid rgba(93, 173, 226, 0.25)',
              borderRadius: radius.md,
              padding: '5px 10px',
              color: '#5dade2',
              cursor: 'pointer',
              gap: '5px',
              fontSize: '0.72rem',
              fontWeight: fontWeight.semibold,
              transition: transition.normal,
            })}
          >
            <HelpCircle size={13} />
            {showExplainer ? 'Hide Guide' : 'What are tokens?'}
          </button>
        </div>

        <AnimatePresence>
          {showExplainer && renderTokenExplainer()}
        </AnimatePresence>

        <div style={{ marginBottom: spacing.xl }}>
          <div style={{ display: 'flex', gap: spacing.xl, marginBottom: spacing.xl, flexWrap: 'wrap' }}>
            <div style={{ color: '#aaaaaa', fontSize: fontSize.lg }}>
              <strong style={{ color: '#5dade2' }}>Total Tokens:</strong> {inlineTotalTokens.toLocaleString()}
            </div>
            {inlineTotalReasoning > 0 && (
              <div style={{ color: '#aaaaaa', fontSize: fontSize.lg }}>
                <strong style={{ color: '#ffaa00' }}>Reasoning Tokens:</strong> {inlineTotalReasoning.toLocaleString()}
              </div>
            )}
          </div>
          {Object.entries(inlineGrouped).map(([provider, data]) => (
            <div key={provider} style={{ marginBottom: spacing['2xl'], padding: spacing.lg, background: 'rgba(93, 173, 226, 0.05)', borderRadius: radius.md, border: '1px solid rgba(93, 173, 226, 0.2)' }}>
              <h4 style={{ color: '#5dade2', fontSize: fontSize['2xl'], margin: `0 0 ${spacing.lg} 0`, fontWeight: fontWeight.semibold }}>
                {providerDisplayName(provider)}
              </h4>
              <div style={{ display: 'flex', gap: spacing.xl, marginBottom: spacing.lg, flexWrap: 'wrap', fontSize: fontSize.base, color: '#aaaaaa' }}>
                <div><strong style={{ color: '#5dade2' }}>Input:</strong> {data.totalInput.toLocaleString()}</div>
                <div><strong style={{ color: '#48c9b0' }}>Output:</strong> {data.totalOutput.toLocaleString()}</div>
                {data.totalReasoning > 0 && (
                  <div><strong style={{ color: '#ffaa00' }}>Reasoning:</strong> {data.totalReasoning.toLocaleString()}</div>
                )}
                <div><strong style={{ color: '#ffffff' }}>Total:</strong> {data.totalTokens.toLocaleString()}</div>
              </div>
              {data.models.map((item: any, idx: number) => (
                <div key={idx} style={{ marginLeft: spacing.lg, marginBottom: spacing.md, fontSize: fontSize.md, color: '#cccccc' }}>
                  {item.modelName}: {((item.tokens?.inputTokens || item.tokens?.input || 0) + (item.tokens?.outputTokens || item.tokens?.output || 0)).toLocaleString()} tokens
                  {item.tokens?.reasoningTokens > 0 && ` (+${item.tokens.reasoningTokens.toLocaleString()} reasoning)`}
                </div>
              ))}
            </div>
          ))}
          {inlineJudgeItems.length > 0 && inlineJudgeTotalTokens > 0 && (
            <div style={{ marginBottom: spacing['2xl'], padding: spacing.lg, background: 'rgba(168, 85, 247, 0.05)', borderRadius: radius.md, border: '1px solid rgba(168, 85, 247, 0.2)' }}>
              <h4 style={{ color: '#a855f7', fontSize: fontSize['2xl'], margin: `0 0 ${spacing.lg} 0`, fontWeight: fontWeight.semibold }}>
                Judge Model
              </h4>
              <div style={{ display: 'flex', gap: spacing.xl, marginBottom: spacing.xs, flexWrap: 'wrap', fontSize: fontSize.base, color: '#aaaaaa' }}>
                <div><strong style={{ color: '#a855f7' }}>Input:</strong> {inlineJudgeTotalInput.toLocaleString()}</div>
                <div><strong style={{ color: '#48c9b0' }}>Output:</strong> {inlineJudgeTotalOutput.toLocaleString()}</div>
                <div><strong style={{ color: '#ffffff' }}>Total:</strong> {inlineJudgeTotalTokens.toLocaleString()}</div>
              </div>
            </div>
          )}
          {inlineCancelledSummaryItems.length > 0 && (
            <div style={{ marginBottom: spacing['2xl'], padding: spacing.lg, background: 'rgba(239, 68, 68, 0.05)', borderRadius: radius.md, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }}>
                <h4 style={{ color: '#ef4444', fontSize: fontSize['2xl'], margin: 0, fontWeight: fontWeight.semibold }}>
                  Cancelled Summary Model Tokens
                </h4>
                <span style={{ fontSize: fontSize['2xs'], color: '#ef4444', background: 'rgba(239, 68, 68, 0.15)', padding: `${spacing['2xs']} ${spacing.sm}`, borderRadius: radius.xs, fontWeight: fontWeight.semibold }}>
                  Cancelled
                </span>
              </div>
              <div style={{ fontSize: fontSize.sm, color: '#999', lineHeight: '1.4' }}>
                Summary generation was cancelled. Tokens consumed before cancellation are still counted toward your usage.
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={sx(layout.fixedFill, layout.center, {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: zIndex.modal,
            backdropFilter: 'blur(4px)',
          })}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(0, 0, 0, 0.95)',
              border: '2px solid #5dade2',
              borderRadius: radius['2xl'],
              padding: spacing['3xl'],
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: '0 8px 32px rgba(93, 173, 226, 0.3)',
            }}
          >
            {/* Header */}
            <div style={sx(layout.spaceBetween, { marginBottom: spacing.sm })}>
              <div>
                <h2 style={{ color: '#5dade2', fontSize: fontSize['6xl'], margin: 0, fontWeight: fontWeight.bold }}>
                  Prompt Token Usage
                </h2>
                <p style={{ color: '#888', fontSize: '0.75rem', margin: `${spacing.xs} 0 0 0` }}>
                  A breakdown of how many tokens were used for this prompt
                </p>
              </div>
              <button
                onClick={onClose}
                style={sx(layout.center, {
                  background: 'transparent',
                  border: 'none',
                  color: '#ff6b6b',
                  cursor: 'pointer',
                  padding: spacing.md,
                  borderRadius: radius.md,
                  transition: 'background 0.2s',
                })}
                onMouseEnter={(e) => (e.target as HTMLElement).style.background = 'rgba(255, 107, 107, 0.2)'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'transparent'}
                title="Close"
              >
                <X size={24} />
              </button>
            </div>

            {/* "What are tokens?" toggle */}
            <button
              onClick={() => setShowExplainer(!showExplainer)}
              style={sx(layout.center, {
                background: showExplainer ? 'rgba(93, 173, 226, 0.12)' : 'rgba(93, 173, 226, 0.06)',
                border: '1px solid rgba(93, 173, 226, 0.2)',
                borderRadius: radius.md,
                padding: `${spacing.md} 14px`,
                color: '#5dade2',
                cursor: 'pointer',
                gap: spacing.sm,
                fontSize: '0.78rem',
                fontWeight: fontWeight.semibold,
                transition: transition.normal,
                marginBottom: spacing.xl,
                width: '100%',
              })}
            >
              <HelpCircle size={14} />
              {showExplainer ? 'Hide Guide' : 'What are tokens? Why is my count higher than expected?'}
              {showExplainer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <AnimatePresence>
              {showExplainer && renderTokenExplainer()}
            </AnimatePresence>

            {/* Token breakdown — shows what makes up input tokens */}
            {hasAnyBreakdown ? (
              <div style={{
                background: 'rgba(93, 173, 226, 0.06)',
                border: '1px solid rgba(93, 173, 226, 0.2)',
                borderRadius: radius.xl,
                padding: '14px',
                marginBottom: spacing.xl,
              }}>
                <div style={sx(layout.flexRow, { gap: spacing.sm, marginBottom: spacing.xs })}>
                  <Eye size={14} color="#5dade2" />
                  <span style={{ color: '#5dade2', fontWeight: fontWeight.bold, fontSize: fontSize.md, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Where Your Tokens Went
                  </span>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#777', marginBottom: '10px', lineHeight: '1.4' }}>
                  Every prompt includes more than just your message. Here's the full picture:
                </div>
                <div style={sx(layout.flexCol, { gap: spacing.sm, fontSize: fontSize.md })}>
                  <div style={sx(layout.spaceBetween)}>
                    <span style={sx(layout.flexRow, { color: '#aaa', gap: '5px' })}>
                      <Send size={11} color="#48c9b0" />
                      Your Prompt
                      <span style={{ color: '#666', fontSize: fontSize['2xs'] }}>— what you typed</span>
                    </span>
                    <span style={{ color: '#48c9b0', fontWeight: fontWeight.semibold }}>~{singleUserPromptEstimate.toLocaleString()}</span>
                  </div>
                  <div style={sx(layout.spaceBetween)}>
                    <span style={sx(layout.flexRow, { color: '#aaa', gap: '5px' })}>
                      <Globe size={11} color="#e67e22" />
                      Web Sources
                      <span style={{ color: '#666', fontSize: fontSize['2xs'] }}>— scraped search results</span>
                    </span>
                    <span style={{ color: '#e67e22', fontWeight: fontWeight.semibold }}>~{totalSourceContext.toLocaleString()}</span>
                  </div>
                  <div style={sx(layout.spaceBetween)}>
                    <span style={sx(layout.flexRow, { color: '#aaa', gap: '5px' })}>
                      <Settings size={11} color="#888" />
                      System Instructions
                      <span style={{ color: '#666', fontSize: fontSize['2xs'] }}>— date, formatting rules</span>
                    </span>
                    <span style={{ color: '#fff', fontWeight: fontWeight.semibold }}>~{totalSystemOverhead.toLocaleString()}</span>
                  </div>
                  <div style={sx(layout.spaceBetween)}>
                    <span style={sx(layout.flexRow, { color: '#aaa', gap: '5px' })}>
                      <Zap size={11} color="#48c9b0" />
                      Model Response
                      <span style={{ color: '#666', fontSize: fontSize['2xs'] }}>— the AI's answer</span>
                    </span>
                    <span style={{ color: '#fff', fontWeight: fontWeight.semibold }}>{totalOutput.toLocaleString()}</span>
                  </div>
                  {totalReasoning > 0 && (
                    <div style={sx(layout.spaceBetween)}>
                      <span style={sx(layout.flexRow, { color: '#aaa', gap: '5px' })}>
                        <Brain size={11} color="#FFD700" />
                        Reasoning
                        <span style={{ color: '#666', fontSize: fontSize['2xs'] }}>— model's internal thinking</span>
                      </span>
                      <span style={{ color: '#FFD700', fontWeight: fontWeight.semibold }}>{totalReasoning.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={sx(layout.spaceBetween, { borderTop: '1px solid rgba(93, 173, 226, 0.2)', paddingTop: spacing.sm, marginTop: spacing['2xs'] })}>
                    <span style={{ color: '#5dade2', fontWeight: fontWeight.semibold }}>Total (across {modelsWithSources} model{modelsWithSources !== 1 ? 's' : ''})</span>
                    <span style={{ color: '#5dade2', fontWeight: fontWeight.bold, fontSize: fontSize.lg }}>{totalTokens.toLocaleString()}</span>
                  </div>
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.68rem', color: '#777', lineHeight: '1.4' }}>
                  <span style={{ color: '#e67e22', fontWeight: fontWeight.semibold }}>Not included above:</span> Internal pipeline tokens (like category detection and search query generation) run behind the scenes and are not counted toward your stats.
                </div>
              </div>
            ) : (
              <div style={{
                background: 'rgba(93, 173, 226, 0.06)',
                border: '1px solid rgba(93, 173, 226, 0.2)',
                borderRadius: radius.lg,
                padding: `${spacing.lg} 14px`,
                marginBottom: spacing.xl,
                fontSize: '0.78rem',
                color: '#ccc',
                lineHeight: '1.5',
              }}>
                <div style={sx(layout.flexRow, { gap: spacing.sm, marginBottom: spacing.sm })}>
                  <Info size={13} color="#5dade2" />
                  <span style={{ color: '#5dade2', fontWeight: fontWeight.semibold }}>No web sources used</span>
                </div>
                <p style={{ margin: 0 }}>
                  Your token count includes your prompt, system instructions (date, formatting rules sent with every request), and the model's response. 
                  Even a short message like "hey there" will use 100+ input tokens because of these behind-the-scenes instructions — this is normal and how all AI apps work.
                </p>
              </div>
            )}

            {/* Total API Usage bar */}
            <div
              style={{
                background: 'rgba(93, 173, 226, 0.1)',
                border: '1px solid rgba(93, 173, 226, 0.3)',
                borderRadius: radius.xl,
                padding: spacing.xl,
                marginBottom: spacing['2xl'],
              }}
            >
              <h3 style={{ color: '#5dade2', fontSize: fontSize['2xl'], margin: `0 0 ${spacing.xs} 0`, fontWeight: fontWeight.bold }}>
                Total Usage
              </h3>
              <p style={{ color: '#777', fontSize: fontSize.xs, margin: `0 0 ${spacing.lg} 0` }}>
                Combined tokens across all models for this prompt
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: totalReasoning > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: spacing.lg }}>
                <div>
                  <div style={sx(layout.flexRow, { color: '#888', fontSize: '0.78rem', marginBottom: spacing.xs, gap: spacing.xs })}>
                    Sent to AI
                  </div>
                  <div style={{ color: '#fff', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold }}>
                    {totalInput.toLocaleString()}
                  </div>
                  <div style={{ color: '#666', fontSize: '0.6rem' }}>input tokens</div>
                </div>
                <div>
                  <div style={sx(layout.flexRow, { color: '#888', fontSize: '0.78rem', marginBottom: spacing.xs, gap: spacing.xs })}>
                    AI Response
                  </div>
                  <div style={{ color: '#fff', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold }}>
                    {totalOutput.toLocaleString()}
                  </div>
                  <div style={{ color: '#666', fontSize: '0.6rem' }}>output tokens</div>
                </div>
                {totalReasoning > 0 && (
                  <div>
                    <div style={sx(layout.flexRow, { color: '#888', fontSize: '0.78rem', marginBottom: spacing.xs, gap: spacing.xs })}>
                      Thinking
                    </div>
                    <div style={{ color: '#FFD700', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold }}>
                      {totalReasoning.toLocaleString()}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.6rem' }}>reasoning tokens</div>
                  </div>
                )}
                <div>
                  <div style={{ color: '#5dade2', fontSize: '0.78rem', marginBottom: spacing.xs, fontWeight: fontWeight.semibold }}>
                    Grand Total
                  </div>
                  <div style={{ color: '#5dade2', fontSize: fontSize['4xl'], fontWeight: fontWeight.bold }}>
                    {totalTokens.toLocaleString()}
                  </div>
                  <div style={{ color: '#666', fontSize: '0.6rem' }}>tokens</div>
                </div>
              </div>
            </div>

            {/* Per-Model Breakdown heading */}
            {Object.keys(groupedByProvider).length > 0 && (
              <div style={sx(layout.flexRow, { gap: spacing.sm, marginBottom: spacing.lg })}>
                <span style={{ color: '#888', fontSize: '0.75rem', fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Per-Model Breakdown
                </span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
              </div>
            )}

            {/* By Provider */}
            {Object.entries(groupedByProvider).map(([provider, providerData]) => (
              <div
                key={provider}
                style={{
                  background: 'rgba(93, 173, 226, 0.05)',
                  border: '1px solid rgba(93, 173, 226, 0.2)',
                  borderRadius: radius.xl,
                  padding: spacing.xl,
                  marginBottom: spacing.xl,
                }}
              >
                <div style={sx(layout.spaceBetween, { marginBottom: spacing.lg })}>
                  <h3 style={{ color: '#5dade2', fontSize: fontSize['2xl'], margin: 0, fontWeight: fontWeight.bold }}>
                    {providerDisplayName(provider)}
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: providerData.totalReasoning > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: spacing.lg, fontSize: fontSize.base }}>
                    <div>
                      <div style={{ color: '#888', fontSize: fontSize.xs, marginBottom: spacing['2xs'] }}>Input</div>
                      <div style={{ color: '#fff', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold }}>
                        {providerData.totalInput.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#888', fontSize: fontSize.xs, marginBottom: spacing['2xs'] }}>Output</div>
                      <div style={{ color: '#fff', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold }}>
                        {providerData.totalOutput.toLocaleString()}
                      </div>
                    </div>
                    {providerData.totalReasoning > 0 && (
                      <div>
                        <div style={{ color: '#888', fontSize: fontSize.xs, marginBottom: spacing['2xs'] }}>Reasoning</div>
                        <div style={{ color: '#FFD700', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold }}>
                          {providerData.totalReasoning.toLocaleString()}
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ color: '#888', fontSize: fontSize.xs, marginBottom: spacing['2xs'] }}>Total</div>
                      <div style={{ color: '#5dade2', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold }}>
                        {providerData.totalTokens.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={sx(layout.flexCol, { gap: spacing.md })}>
                  {providerData.models.map((modelData: any, index: number) => (
                    <div
                      key={index}
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(93, 173, 226, 0.1)',
                        borderRadius: radius.md,
                        padding: '10px',
                        fontSize: fontSize.md,
                      }}
                    >
                      <div style={sx(layout.spaceBetween, { marginBottom: spacing.sm })}>
                        <div style={{ color: '#fff', fontWeight: fontWeight.medium }}>
                          {modelData.model}
                        </div>
                        <div style={{ 
                          color: modelData.source === 'api_response' ? '#48c9b0' : '#888', 
                          fontSize: fontSize.xs,
                          background: modelData.source === 'api_response' ? 'rgba(72, 201, 176, 0.15)' : 'rgba(93, 173, 226, 0.1)',
                          padding: `${spacing['2xs']} ${spacing.sm}`,
                          borderRadius: radius.xs,
                        }}>
                          {modelData.source === 'api_response' ? 'Exact (from API)' : 'Estimated'}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: modelData.reasoning > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: spacing.sm, fontSize: '0.75rem' }}>
                        <div>
                          <div style={{ color: '#888', marginBottom: spacing['2xs'] }}>Input</div>
                          <div style={{ color: '#fff' }}>{modelData.input.toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ color: '#888', marginBottom: spacing['2xs'] }}>Output</div>
                          <div style={{ color: '#fff' }}>{modelData.output.toLocaleString()}</div>
                        </div>
                        {modelData.reasoning > 0 && (
                          <div>
                            <div style={{ color: '#888', marginBottom: spacing['2xs'] }}>Reasoning</div>
                            <div style={{ color: '#FFD700', fontWeight: fontWeight.bold }}>
                              {modelData.reasoning.toLocaleString()}
                            </div>
                          </div>
                        )}
                        <div>
                          <div style={{ color: '#888', marginBottom: spacing['2xs'] }}>Total</div>
                          <div style={{ color: '#5dade2', fontWeight: fontWeight.bold }}>
                            {modelData.total.toLocaleString()}
                          </div>
                        </div>
                      </div>
                      {/* Per-model input breakdown */}
                      {renderModelBreakdown(modelData.breakdown)}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Judge Model (counted in stats but shown separately) */}
            {judgeItems.length > 0 && (
              <div
                style={{
                  background: 'rgba(168, 85, 247, 0.05)',
                  border: '1px solid rgba(168, 85, 247, 0.2)',
                  borderRadius: radius.xl,
                  padding: spacing.xl,
                  marginBottom: spacing.xl,
                }}
              >
                <div style={sx(layout.spaceBetween, { marginBottom: spacing.md })}>
                  <div style={sx(layout.flexRow, { gap: spacing.md })}>
                    <Gavel size={16} color="#a855f7" />
                    <h3 style={{ color: '#a855f7', fontSize: fontSize['2xl'], margin: 0, fontWeight: fontWeight.bold }}>
                      Judge Model
                    </h3>
                    <span style={{
                      fontSize: fontSize['2xs'],
                      color: '#a855f7',
                      background: 'rgba(168, 85, 247, 0.15)',
                      padding: `${spacing['2xs']} ${spacing.md}`,
                      borderRadius: radius.xs,
                      fontWeight: fontWeight.semibold,
                    }}>
                      Counted
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.lg, fontSize: fontSize.base }}>
                    <div>
                      <div style={{ color: '#888', fontSize: fontSize.xs, marginBottom: spacing['2xs'] }}>Input</div>
                      <div style={{ color: '#fff', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold }}>
                        {judgeTotalInput.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#888', fontSize: fontSize.xs, marginBottom: spacing['2xs'] }}>Output</div>
                      <div style={{ color: '#fff', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold }}>
                        {judgeTotalOutput.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#888', fontSize: fontSize.xs, marginBottom: spacing['2xs'] }}>Total</div>
                      <div style={{ color: '#a855f7', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold }}>
                        {judgeTotalTokens.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#999', lineHeight: '1.4' }}>
                  When you use multiple models, a judge model reads all their responses and creates the summary, agreements, and contradictions. These tokens are part of your total usage.
                </div>
              </div>
            )}

            {/* Cancelled Summary */}
            {cancelledSummaryItems.length > 0 && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: radius.xl,
                  padding: spacing.xl,
                  marginBottom: spacing.xl,
                }}
              >
                <div style={sx(layout.flexRow, { gap: spacing.md, marginBottom: spacing.md })}>
                  <h3 style={{ color: '#ef4444', fontSize: fontSize['2xl'], margin: 0, fontWeight: fontWeight.bold }}>
                    Cancelled Summary Model Tokens
                  </h3>
                  <span style={{
                    fontSize: fontSize['2xs'],
                    color: '#ef4444',
                    background: 'rgba(239, 68, 68, 0.15)',
                    padding: `${spacing['2xs']} ${spacing.md}`,
                    borderRadius: radius.xs,
                    fontWeight: fontWeight.semibold,
                  }}>
                    Cancelled
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#999', lineHeight: '1.4' }}>
                  The summary generation was cancelled before completion. Tokens consumed before cancellation are still counted toward your usage on the server.
                </div>
              </div>
            )}

            {/* Pipeline / Internal Models (not counted in stats) */}
            {pipelineItems.length > 0 && (
              <div
                style={{
                  background: 'rgba(255, 170, 0, 0.05)',
                  border: '1px solid rgba(255, 170, 0, 0.2)',
                  borderRadius: radius.xl,
                  padding: spacing.xl,
                  marginBottom: spacing.xl,
                }}
              >
                <div style={sx(layout.spaceBetween, { marginBottom: spacing.md })}>
                  <div style={sx(layout.flexRow, { gap: spacing.md })}>
                    <Workflow size={16} color="#ffaa00" />
                    <h3 style={{ color: '#ffaa00', fontSize: fontSize['2xl'], margin: 0, fontWeight: fontWeight.bold }}>
                      Behind the Scenes
                    </h3>
                    <span style={{
                      fontSize: fontSize['2xs'],
                      color: '#ffaa00',
                      background: 'rgba(255, 170, 0, 0.15)',
                      padding: `${spacing['2xs']} ${spacing.md}`,
                      borderRadius: radius.xs,
                      fontWeight: fontWeight.semibold,
                    }}>
                      Not Counted
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.lg, fontSize: fontSize.base }}>
                    <div>
                      <div style={{ color: '#888', fontSize: fontSize.xs, marginBottom: spacing['2xs'] }}>Input</div>
                      <div style={{ color: '#ccc', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold }}>
                        {pipelineTotalInput.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#888', fontSize: fontSize.xs, marginBottom: spacing['2xs'] }}>Output</div>
                      <div style={{ color: '#ccc', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold }}>
                        {pipelineTotalOutput.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#888', fontSize: fontSize.xs, marginBottom: spacing['2xs'] }}>Total</div>
                      <div style={{ color: '#ffaa00', fontSize: fontSize['2xl'], fontWeight: fontWeight.bold }}>
                        {pipelineTotalTokens.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#999', lineHeight: '1.4', marginBottom: '10px' }}>
                  These small AI calls happen automatically to figure out what kind of question you asked and generate better search queries. They're free — not counted toward your token stats.
                </div>
                <div style={sx(layout.flexCol, { gap: spacing.md })}>
                  {pipelineItems.map((item, index) => (
                    <div
                      key={`pipeline-${index}`}
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 170, 0, 0.1)',
                        borderRadius: radius.md,
                        padding: '10px',
                        fontSize: fontSize.md,
                      }}
                    >
                      <div style={sx(layout.spaceBetween, { marginBottom: spacing.sm })}>
                        <div style={{ color: '#ffaa00', fontWeight: fontWeight.medium }}>
                          {item.modelName || item.tokens?.model || 'Unknown'}
                        </div>
                        <div style={{ 
                          color: '#ffaa00',
                          fontSize: fontSize['2xs'],
                          background: 'rgba(255, 170, 0, 0.12)',
                          padding: `${spacing['2xs']} ${spacing.sm}`,
                          borderRadius: radius.xs,
                        }}>
                          Free
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.sm, fontSize: '0.75rem' }}>
                        <div>
                          <div style={{ color: '#888', marginBottom: spacing['2xs'] }}>Input</div>
                          <div style={{ color: '#ccc' }}>{(item.tokens?.input || 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ color: '#888', marginBottom: spacing['2xs'] }}>Output</div>
                          <div style={{ color: '#ccc' }}>{(item.tokens?.output || 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ color: '#888', marginBottom: spacing['2xs'] }}>Total</div>
                          <div style={{ color: '#ffaa00', fontWeight: fontWeight.bold }}>
                            {((item.tokens?.input || 0) + (item.tokens?.output || 0)).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default TokenUsageWindow
