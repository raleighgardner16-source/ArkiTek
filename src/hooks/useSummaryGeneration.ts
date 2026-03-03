import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { streamFetch } from '../utils/streamFetch'
import { parseSummaryResponse } from '../utils/summaryParser'
import { getShortModelName } from '../utils/modelNames'
import { API_URL, API_PREFIX } from '../utils/config'
import api from '../utils/api'

function buildSummaryPrompt(
  originalPrompt: string,
  responses: any[],
  isDebate: boolean,
): string {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const responsesText = isDebate
    ? responses
        .map((r) => `\n--- ${r.debateRole?.label || 'Respondent'}'s argument ---\n${r.text}\n`)
        .join('')
    : responses
        .map((r) => `\n--- ${getShortModelName(r.modelName)}'s response ---\n${r.text}\n`)
        .join('')

  if (isDebate) {
    return `Today is ${today}. This is the real, current date. You are an expert judge evaluating a structured debate between multiple perspectives on a user's question. Each response was written from a specific assigned role/perspective.

Original User Query: "${originalPrompt}"

Debate Responses:
${responsesText}

Please analyze this debate and provide ONLY these sections in this exact format:

Debate Overview: [2-3 substantial paragraphs synthesizing the debate — what was discussed, how each role approached the topic, and what the collective debate reveals. Give the reader a complete understanding without needing to read individual responses.]
Strongest Arguments: [3-5 bullet points identifying the most compelling arguments made across all roles, each starting with a dash and naming which role made the point]
Key Tensions: [List the fundamental disagreements or opposing viewpoints between the roles. These are expected and by design — name which roles clashed and on what. Each starting with a dash.]

Important: Only include each section label followed by a colon and content. Do NOT use markdown formatting like ** for section headers.`
  }

  return `Today is ${today}. This is the real, current date. You are an expert judge analyzing multiple AI model responses to a user's question.

Original User Query: "${originalPrompt}"

Council Model Responses:
${responsesText}

Please analyze these responses and provide ONLY these five sections in this exact format:

Consensus: [0-100]
Summary: [2-3 substantial paragraphs]
Agreements: [3-5 bullet points]
Contradictions: [only factual contradictions, or "None identified — all models are in factual agreement."]
Differences: [notable non-contradictory differences]

Important: Only include each section label followed by a colon and content.`
}

export function useSummaryGeneration({ isLoading }: { isLoading: boolean }) {
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const shouldGenerateSummary = useStore((state) => state.shouldGenerateSummary)
  const summaryAbortRef = useRef<AbortController | null>(null)

  const handleGenerateSummary = async () => {
    if (isLoading || isGeneratingSummary) return

    const store = useStore.getState()
    const responsesForSummary = (store.responses || []).filter((r: any) => !r.error && r.text)
    if (responsesForSummary.length < 2) return

    const promptForSummary = store.lastSubmittedPrompt || ''
    if (!promptForSummary.trim()) return

    if (summaryAbortRef.current) {
      summaryAbortRef.current.abort()
    }
    const abortController = new AbortController()
    summaryAbortRef.current = abortController

    setIsGeneratingSummary(true)
    const isDebateSummary = store.promptMode === 'debate'

    try {
      const summaryPrompt = buildSummaryPrompt(promptForSummary, responsesForSummary, isDebateSummary)

      const summarySourcesSnapshot = Array.isArray(store.searchSources)
        ? [...store.searchSources]
        : []

      store.setSummary({
        text: '',
        summary: '',
        consensus: null,
        agreements: [],
        disagreements: [],
        differences: [],
        timestamp: Date.now(),
        singleModel: false,
        prompt: summaryPrompt,
        originalPrompt: promptForSummary,
        sources: summarySourcesSnapshot,
        isStreaming: true,
      })

      store.setSummaryMinimized(false)

      const summaryFinalData = await streamFetch(
        `${API_URL}${API_PREFIX}/summary/stream`,
        { prompt: summaryPrompt },
        {
          onToken: (token) => {
            useStore.getState().appendSummaryText(token)
          },
          onStatus: () => {},
          onError: (message) => {
            console.error('[Summary Stream] Error:', message)
          },
          signal: abortController.signal,
        },
      )

      const rawSummaryText = summaryFinalData?.text || useStore.getState().summary?.text || ''
      const summaryTokens = summaryFinalData?.tokens || null

      const parsed = parseSummaryResponse(rawSummaryText, isDebateSummary)
      const finalSummaryText = parsed.formattedText || rawSummaryText

      useStore.getState().setSummary((prev: any) => ({
        ...(prev || {}),
        text: finalSummaryText,
        summary: parsed.summary || finalSummaryText,
        consensus: parsed.consensus,
        agreements: parsed.agreements,
        disagreements: parsed.contradictions,
        differences: parsed.differences,
        timestamp: Date.now(),
        singleModel: false,
        prompt: summaryPrompt,
        originalPrompt: promptForSummary,
        sources: summarySourcesSnapshot,
        isStreaming: false,
      }))

      // Merge judge tokens into the token table and backend totals
      if (summaryTokens) {
        useStore.getState().mergeTokenData(
          'Judge Model',
          {
            ...summaryTokens,
            input: summaryTokens.input || 0,
            output: summaryTokens.output || 0,
            total: summaryTokens.total || (summaryTokens.input || 0) + (summaryTokens.output || 0),
          },
          true,
        )

        const currentUser = useStore.getState().currentUser
        if (currentUser?.id && (summaryTokens.total || 0) > 0) {
          useStore.getState().triggerStatsRefresh()
        }
      }

      // Skip all persistence if the user cancelled mid-summary
      if (abortController.signal.aborted) {
        console.log('[Summary] Generation cancelled — skipping history save')
        useStore.getState().setSummary(null)
        return
      }

      // Store initial summary in conversation context
      const currentUser = useStore.getState().currentUser
      if (currentUser?.id && rawSummaryText) {
        api
          .post('/judge/store-initial-summary', {
            summaryText: rawSummaryText,
            originalPrompt: summaryPrompt,
          })
          .catch((err) => {
            console.error('[Summary] Error storing initial summary:', err)
          })
      }

      // Update the saved history entry with the summary
      const activeHistoryId = useStore.getState().currentHistoryId
      if (activeHistoryId && currentUser?.id) {
        api
          .post('/history/update-summary', {
            historyId: activeHistoryId,
            summary: {
              text: finalSummaryText || rawSummaryText,
              consensus: parsed.consensus,
              agreements: parsed.agreements,
              disagreements: parsed.contradictions,
              differences: parsed.differences,
              singleModel: false,
            },
          })
          .catch((err) => {
            console.error('[History] Error updating summary in history:', err)
          })
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        console.log('[Summary] Generation cancelled by user')
        useStore.getState().setSummary(null)
        return
      }
      console.error('[Summary] Error generating summary:', error.message)
      useStore.getState().setSummary({
        text: `Error generating summary: ${error.message}. Please try again.`,
        timestamp: Date.now(),
        error: true,
        originalPrompt: useStore.getState().lastSubmittedPrompt || '',
        sources: [],
      })
    } finally {
      if (summaryAbortRef.current === abortController) {
        summaryAbortRef.current = null
      }
      setIsGeneratingSummary(false)
    }
  }

  // Auto-trigger when the store flag is set (user clicked "Generate Summary")
  useEffect(() => {
    if (!shouldGenerateSummary) return
    handleGenerateSummary().finally(() => {
      useStore.getState().clearGenerateSummary()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldGenerateSummary])

  const cancelSummary = () => {
    if (summaryAbortRef.current) {
      summaryAbortRef.current.abort()
      summaryAbortRef.current = null
    }
    setIsGeneratingSummary(false)
  }

  const resetSummaryState = () => setIsGeneratingSummary(false)

  return { isGeneratingSummary, handleGenerateSummary, cancelSummary, resetSummaryState }
}
