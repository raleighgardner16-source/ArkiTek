import React, { useEffect, useState, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from './store/useStore'
import WelcomeScreen from './components/WelcomeScreen'
import ResponseComparison from './components/ResponseComparison'
import NavigationBar from './components/NavigationBar'
import MainView from './components/MainView'
import SettingsView from './components/SettingsView'
import LeaderboardView from './components/LeaderboardView'
import StatisticsView from './components/StatisticsView'
import SummaryWindow from './components/SummaryWindow'
import AuthView from './components/AuthView'
import SubscriptionGate from './components/SubscriptionGate'
import AdminView from './components/AdminView'
import SavedConversationsView from './components/SavedConversationsView'
// TokenUsageWindow is now rendered inside ResponseComparison (council panel tab)
import LandingPage from './components/LandingPage'
import TermsOfService from './components/TermsOfService'
import PrivacyPolicy from './components/PrivacyPolicy'
import { callLLM, callLLMStream, getAllModels, searchWithSerper } from './services/llmProviders'
import { streamFetch } from './utils/streamFetch'
import { detectCategory } from './utils/categoryDetector'
import { getTheme } from './utils/theme'
import axios from 'axios'
import { API_URL } from './utils/config'

// Map full API model names to short friendly names for the judge summary
const getShortModelName = (modelName) => {
  if (!modelName) return modelName
  const lower = modelName.toLowerCase()
  if (lower.includes('openai') || lower.includes('gpt') || lower.includes('o3') || lower.includes('o4')) return 'ChatGPT'
  if (lower.includes('claude') || lower.includes('anthropic')) return 'Claude'
  if (lower.includes('gemini') || lower.includes('google')) return 'Gemini'
  if (lower.includes('grok') || lower.includes('xai')) return 'Grok'
  if (lower.includes('llama') || lower.includes('meta')) return 'Llama'
  if (lower.includes('mistral')) return 'Mistral'
  if (lower.includes('deepseek')) return 'DeepSeek'
  return modelName
}

function App() {
  // Track store hydration from localStorage — prevents flash of wrong page on load
  const [hasHydrated, setHasHydrated] = useState(useStore.persist.hasHydrated())
  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHasHydrated(true))
    return unsub
  }, [])

  const showWelcome = useStore((state) => state.showWelcome)
  const currentUser = useStore((state) => state.currentUser)
  const clearCurrentUser = useStore((state) => state.clearCurrentUser)
  const setGeminiDetectionResponse = useStore((state) => state.setGeminiDetectionResponse)
  const theme = useStore((state) => state.theme || 'dark')
  const currentTheme = getTheme(theme)
  // Check pathname synchronously on initialization
  const [isAdminRoute, setIsAdminRoute] = useState(() => {
    const path = window.location.pathname
    const hash = window.location.hash
    return path === '/admin' || path === '/admin/' || hash === '#/admin'
  })

  // Public page routing for non-logged-in users
  // Determines which public page to show: 'landing', 'signin', 'signup', 'terms', 'privacy'
  const [publicPage, setPublicPage] = useState(() => {
    const path = window.location.pathname
    const hash = window.location.hash
    // Hash-based routes that need AuthView to render (verify-email, reset-password)
    if (hash.startsWith('#verify-email') || hash.startsWith('#reset-password')) return 'signin'
    if (path === '/signin' || path === '/login') return 'signin'
    if (path === '/signup' || path === '/register') return 'signup'
    if (path === '/terms' || path === '/terms-of-service') return 'terms'
    if (path === '/privacy' || path === '/privacy-policy') return 'privacy'
    return 'landing'
  })

  // Plan pre-selected from landing page (e.g. clicking a pricing card)
  const [landingPlan, setLandingPlan] = useState(null)

  // Navigate between public pages (updates URL and state)
  // Optional `plan` param lets the landing page pre-select free_trial or pro
  const navigatePublic = (page, plan) => {
    if (plan) setLandingPlan(plan)
    setPublicPage(page)
    const pathMap = {
      landing: '/',
      signin: '/signin',
      signup: '/signup',
      terms: '/terms',
      privacy: '/privacy',
    }
    window.history.pushState({}, '', pathMap[page] || '/')
    window.scrollTo(0, 0)
  }

  const activeTab = useStore((state) => state.activeTab || 'home')
  const setActiveTab = useStore((state) => state.setActiveTab)
  
  // Listen for navigation changes
  useEffect(() => {
    const checkRoutes = () => {
      const path = window.location.pathname
      const hash = window.location.hash
      setIsAdminRoute(path === '/admin' || path === '/admin/' || hash === '#/admin')
      
      // Hash-based routes that need AuthView (verify-email, reset-password)
      if (hash.startsWith('#verify-email') || hash.startsWith('#reset-password')) {
        setPublicPage('signin')
      }
      // Update public page based on URL
      else if (path === '/signin' || path === '/login') setPublicPage('signin')
      else if (path === '/signup' || path === '/register') setPublicPage('signup')
      else if (path === '/terms' || path === '/terms-of-service') setPublicPage('terms')
      else if (path === '/privacy' || path === '/privacy-policy') setPublicPage('privacy')
      else if (path === '/' || path === '') setPublicPage('landing')
    }
    
    // Check immediately in case pathname changed after initial render
    checkRoutes()
    
    // Listen for browser back/forward navigation
    window.addEventListener('popstate', checkRoutes)
    // Also listen for hash changes (in case using hash routing)
    window.addEventListener('hashchange', checkRoutes)
    
    return () => {
      window.removeEventListener('popstate', checkRoutes)
      window.removeEventListener('hashchange', checkRoutes)
    }
  }, [])

  // Handle #verify-email links even when a user is already logged in.
  // This fixes the case where the user opens a verification link on a device
  // that still has an old/different account cached in localStorage.
  // We sign out the stale session so AuthView can process the verification token.
  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#verify-email') && currentUser) {
      console.log('[App] Verification link detected while logged in — signing out stale session to process verification')
      clearCurrentUser()
      // publicPage will be set to 'signin' by the route checker, which renders AuthView
      // AuthView's own useEffect will pick up the #verify-email hash and call handleVerifyEmail
    }
  }, []) // Run once on mount

  // Sync user's timezone to the server on mount (for already-logged-in users)
  // This ensures date bucketing uses the user's local timezone even if they
  // signed up before this feature was added, or their timezone changed.
  useEffect(() => {
    if (!currentUser?.id) return
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return
    axios.post(`${API_URL}/api/auth/update-timezone`, { userId: currentUser.id, timezone: tz })
      .catch(() => {}) // Silently ignore — not critical
  }, [currentUser?.id])

  const selectedModels = useStore((state) => state.selectedModels)
  const currentPrompt = useStore((state) => state.currentPrompt)
  const lastSubmittedPrompt = useStore((state) => state.lastSubmittedPrompt || '')
  const setCurrentPrompt = useStore((state) => state.setCurrentPrompt)
  const setLastSubmittedPrompt = useStore((state) => state.setLastSubmittedPrompt)
  const setLastSubmittedCategory = useStore((state) => state.setLastSubmittedCategory)
  const addResponse = useStore((state) => state.addResponse)
  const updateResponse = useStore((state) => state.updateResponse)
  const clearResponses = useStore((state) => state.clearResponses)
  
  // Clear all responses and windows
  const clearAllWindows = () => {
    try {
      clearResponses()
      // queryCount is now cleared automatically by clearResponses() in the store
      // Minimize summary window (summary is already cleared by clearResponses)
      const setSummaryMinimized = useStore.getState().setSummaryMinimized
      if (setSummaryMinimized) {
        setSummaryMinimized(true)
      }
      // Clear judge and model conversation context
      if (currentUser?.id) {
        axios.post(`${API_URL}/api/judge/clear-context`, {
          userId: currentUser.id
        }).catch(err => console.error('[Clear Context] Error:', err))
        axios.post(`${API_URL}/api/model/clear-context`, {
          userId: currentUser.id
        }).catch(err => console.error('[Clear Model Context] Error:', err))
      }
    } catch (error) {
      console.error('[clearAllWindows] Error clearing windows:', error)
      // Don't let errors crash the page
    }
  }
  const updateStats = useStore((state) => state.updateStats)
  const ratings = useStore((state) => state.ratings)
  const setCategory = useStore((state) => state.setCategory)
  const shouldSubmit = useStore((state) => state.shouldSubmit)
  const clearSubmit = useStore((state) => state.clearSubmit)
  const shouldGenerateSummary = useStore((state) => state.shouldGenerateSummary)
  const clearGenerateSummary = useStore((state) => state.clearGenerateSummary)
  const setSummary = useStore((state) => state.setSummary)
  const setIsSearchingWeb = useStore((state) => state.setIsSearchingWeb)
  const setSearchSources = useStore((state) => state.setSearchSources)
  const setRAGDebugData = useStore((state) => state.setRAGDebugData)
  const currentHistoryId = useStore((state) => state.currentHistoryId)
  const setCurrentHistoryId = useStore((state) => state.setCurrentHistoryId)
  const setQueryCount = useStore((state) => state.setQueryCount)

  const [isLoading, setIsLoading] = useState(false)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [currentCategory, setCurrentCategory] = useState('general')
  const [isUserAdmin, setIsUserAdmin] = useState(false)
  const storeResponses = useStore((state) => state.responses)
  const storeTokenData = useStore((state) => state.tokenData)

  // Abort controller for cancelling in-flight prompt submissions
  const abortControllerRef = useRef(null)

  const handleCancelPrompt = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)
    setIsSearchingWeb(false)
    setIsGeneratingSummary(false)
    // Reset the page back to the initial state
    clearResponses()
    setSummary(null)
    setCurrentPrompt('')
    setLastSubmittedPrompt('')
    setLastSubmittedCategory('')
    clearGenerateSummary()
  }

  // Manual summary generation: user chooses when to trigger summary after reviewing council responses.
  const handleGenerateSummary = async () => {
    if (isLoading || isGeneratingSummary) return

    const responsesForSummary = (useStore.getState().responses || []).filter((r) => !r.error && r.text)
    if (responsesForSummary.length < 2) return

    const promptForSummary = lastSubmittedPrompt || useStore.getState().lastSubmittedPrompt || ''
    if (!promptForSummary.trim()) return

    setIsGeneratingSummary(true)
    try {
      const responsesText = responsesForSummary
        .map((r) => `\n--- ${getShortModelName(r.modelName)}'s response ---\n${r.text}\n`)
        .join('')

      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      const summaryPrompt = `Today is ${today}. This is the real, current date. You are an expert judge analyzing multiple AI model responses to a user's question.

Original User Query: "${promptForSummary}"

Council Model Responses:
${responsesText}

Please analyze these responses and provide ONLY these five sections in this exact format:

Consensus: [0-100]
Summary: [2-3 substantial paragraphs]
Agreements: [3-5 bullet points]
Contradictions: [only factual contradictions, or "None identified — all models are in factual agreement."]
Differences: [notable non-contradictory differences]

Important: Only include each section label followed by a colon and content.`

      const userId = currentUser?.id || null
      const summarySourcesSnapshot = Array.isArray(useStore.getState().searchSources)
        ? [...useStore.getState().searchSources]
        : []

      setSummary({
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

      const setSummaryMinimizedEarly = useStore.getState().setSummaryMinimized
      if (setSummaryMinimizedEarly) setSummaryMinimizedEarly(false)

      const summaryFinalData = await streamFetch(`${API_URL}/api/summary/stream`, {
        prompt: summaryPrompt,
        userId,
      }, {
        onToken: (token) => {
          useStore.getState().appendSummaryText(token)
        },
        onStatus: () => {},
        onError: (message) => {
          console.error('[Summary Stream] Error:', message)
        },
      })

      const rawSummaryText = summaryFinalData?.text || useStore.getState().summary?.text || ''
      const summaryTokens = summaryFinalData?.tokens || null

      // Parse and format summary sections (matches the prior styled structure),
      // while guaranteeing consensus is displayed with a % sign.
      const normalizedText = rawSummaryText
        .replace(/\*\*(SUMMARY|Summary|AGREEMENTS|Agreements|CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements|DIFFERENCES|Differences|CONSENSUS|Consensus)\*\*[:\-]?/gi, '\n$1:')
        .replace(/\*(SUMMARY|Summary|AGREEMENTS|Agreements|CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements|DIFFERENCES|Differences|CONSENSUS|Consensus)\*[:\-]?/gi, '\n$1:')

      const consensusMatch = normalizedText.match(/(?:Consensus|consensus)[:\-]?\s*(?:\[|\*\*)?\s*(\d+)\s*(?:%|]|\*\*)?/i)
      const summaryMatch = normalizedText.match(/(?:Summary|SUMMARY)[:\-]?\s*([\s\S]+?)(?=\n\s*(?:AGREEMENTS|Agreements)[:\-]|\n\s*(?:CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements)[:\-]|\n\s*(?:DIFFERENCES|Differences)[:\-]|$)/i)
      const agreementsMatch = normalizedText.match(/(?:AGREEMENTS|Agreements)[:\-]?\s*([\s\S]+?)(?=\n\s*(?:CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements)[:\-]|\n\s*(?:DIFFERENCES|Differences)[:\-]|$)/i)
      const contradictionsMatch = normalizedText.match(/(?:CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements)[:\-]?\s*([\s\S]+?)(?=\n\s*(?:DIFFERENCES|Differences)[:\-]|$)/i)
      const differencesMatch = normalizedText.match(/(?:DIFFERENCES|Differences)[:\-]?\s*([\s\S]+)$/i)

      let consensus = null
      if (consensusMatch) {
        const score = parseInt(consensusMatch[1], 10)
        if (!Number.isNaN(score)) consensus = Math.max(0, Math.min(100, score))
      }

      const parsedSummary = (summaryMatch ? summaryMatch[1] : rawSummaryText)
        .replace(/^(?:\*\*)?(?:Summary|SUMMARY)[:\-]?\s*\*?\*?\s*/i, '')
        .replace(/^:\s*/, '')
        .trim()

      const toBulletArray = (text) => {
        if (!text) return []
        return text
          .split('\n')
          .map(l => l.replace(/^[-•*]\s*/, '').trim())
          .filter(Boolean)
      }

      const agreements = toBulletArray((agreementsMatch?.[1] || '').trim())
      const contradictions = toBulletArray((contradictionsMatch?.[1] || '').trim())
      const differences = toBulletArray((differencesMatch?.[1] || '').trim())

      let formattedSummaryText = ''
      if (consensus !== null) {
        formattedSummaryText += `## CONSENSUS: ${consensus}%\n\n`
      }
      if (parsedSummary) {
        formattedSummaryText += `## SUMMARY\n${parsedSummary}\n\n`
      }
      formattedSummaryText += `## AGREEMENTS\n${agreements.length ? agreements.map(a => `- ${a}`).join('\n') : 'None identified.'}\n\n`
      formattedSummaryText += `## CONTRADICTIONS\n${contradictions.length ? contradictions.map(c => `- ${c}`).join('\n') : 'None identified — all models are in factual agreement.'}\n\n`
      formattedSummaryText += `## DIFFERENCES\n${differences.length ? differences.map(d => `- ${d}`).join('\n') : 'None identified.'}`
      const finalSummaryText = formattedSummaryText || rawSummaryText

      setSummary((prev) => ({
        ...(prev || {}),
        text: finalSummaryText,
        summary: parsedSummary || finalSummaryText,
        consensus,
        agreements,
        disagreements: contradictions,
        differences,
        timestamp: Date.now(),
        singleModel: false,
        prompt: summaryPrompt,
        originalPrompt: promptForSummary,
        sources: summarySourcesSnapshot,
      }))

      // Merge judge tokens into the token table and backend totals.
      if (summaryTokens) {
        useStore.getState().mergeTokenData('Judge Model', {
          input: summaryTokens.input || 0,
          output: summaryTokens.output || 0,
          total: summaryTokens.total || ((summaryTokens.input || 0) + (summaryTokens.output || 0)),
        }, true)

        if (currentUser?.id && (summaryTokens.total || 0) > 0) {
          await axios.post(`${API_URL}/api/stats/token-update`, {
            userId: currentUser.id,
            promptTokens: summaryTokens.total,
          }).catch(() => {})
          useStore.getState().triggerStatsRefresh()
        }
      }

      if (currentUser?.id && rawSummaryText) {
        axios.post(`${API_URL}/api/judge/store-initial-summary`, {
          userId: currentUser.id,
          summaryText: rawSummaryText,
          originalPrompt: summaryPrompt,
        }).catch(err => {
          console.error('[Summary] Error storing initial summary:', err)
        })
      }
    } catch (error) {
      console.error('[Summary] Error generating summary:', error.message)
      setSummary({
        text: `Error generating summary: ${error.message}. Please try again.`,
        timestamp: Date.now(),
        error: true,
        originalPrompt: useStore.getState().lastSubmittedPrompt || '',
        sources: [],
      })
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  // Check if current user is an admin (admins bypass subscription gate)
  useEffect(() => {
    if (currentUser?.id) {
      axios.get(`${API_URL}/api/admin/check`, { params: { userId: currentUser.id } })
        .then(res => setIsUserAdmin(res.data.isAdmin === true))
        .catch(() => setIsUserAdmin(false))
    } else {
      setIsUserAdmin(false)
    }
  }, [currentUser?.id])

  // Track previous tab (selected models are intentionally preserved across tab changes)
  const prevActiveTab = React.useRef(activeTab)
  useEffect(() => {
    prevActiveTab.current = activeTab
  }, [activeTab])

  // Handle prompt submission
  const handlePromptSubmit = async () => {
    if (!currentPrompt.trim() || selectedModels.length === 0) return
    clearGenerateSummary()
    
    // Save the prompt BEFORE clearing responses (for voting button)
    const savedPrompt = currentPrompt.trim()
    setLastSubmittedPrompt(savedPrompt)
    
    // Deduplicate selectedModels to prevent duplicate responses
    const uniqueModels = [...new Set(selectedModels)]
    if (uniqueModels.length !== selectedModels.length) {
      console.warn('[handlePromptSubmit] Found duplicate models, deduplicating:', {
        original: selectedModels,
        deduplicated: uniqueModels
      })
    }
    
    // Use deduplicated models
    const modelsToUse = uniqueModels

    // Cancel any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setIsLoading(true)

    // Finalize the previous history entry before clearing (regenerates embedding with full conversation)
    if (currentHistoryId && currentUser?.id) {
      axios.post(`${API_URL}/api/history/finalize`, {
        historyId: currentHistoryId,
        userId: currentUser.id,
      }).catch(err => console.error('[History] Error finalizing previous entry:', err.message))
    }

    clearResponses()
    
    // Clear judge and model conversation context when starting a new prompt from main page
    if (currentUser?.id) {
      axios.post(`${API_URL}/api/judge/clear-context`, {
        userId: currentUser.id
      }).catch(err => console.error('[Clear Context] Error:', err))
      axios.post(`${API_URL}/api/model/clear-context`, {
        userId: currentUser.id
      }).catch(err => console.error('[Clear Model Context] Error:', err))
    }

    try {

    // Detect category and determine if web search is needed using Gemini 2.5 Flash Lite
    // This is the FIRST step - Gemini 2.5 Flash Lite determines if a query is needed
    let category = 'General Knowledge/Other'
    let needsSearch = false
    let needsContext = false
    let detectionResult = null // Declare outside try block so it's accessible later
    let categoryDetectionTokens = null // Store tokens from category detection - declared outside try block
    try {
      detectionResult = await detectCategory(currentPrompt)
      category = detectionResult.category || 'General Knowledge/Other'
      needsSearch = detectionResult.needsSearch || false
      needsContext = detectionResult.needsContext || false
      categoryDetectionTokens = detectionResult.tokens || null
      
      // Store raw response for display
      if (detectionResult?.rawResponse) {
        setGeminiDetectionResponse(detectionResult.rawResponse)
      }
    } catch (error) {
      console.error('[Category Detection] Error:', error)
      category = 'General Knowledge/Other'
      needsSearch = false
      detectionResult = null // Set to null if detection fails
    }
    setCurrentCategory(category)
    setCategory(Date.now().toString(), category)
    setLastSubmittedCategory(category) // Save category for voting button

    let responses = []
    let summary = null
    let ragData = null // Store RAG data for token collection
    let ragResponsesAlreadyInStore = false

    // If web search is needed (needsSearch === true), use RAG pipeline
    // The RAG pipeline will perform Serper query → Refiner → Council → Judge
    if (needsSearch) {
      setIsSearchingWeb(true)
      try {
        const userId = currentUser?.id || null
        const responseIds = {}
        const ragResponsesByModel = {}
        const normalizeCouncilResponse = (councilResponse) => {
          const actualModel = councilResponse.actual_model_name || councilResponse.model_name
          const originalModel = councilResponse.original_model_name || councilResponse.model_name

          let responseText = ''
          if (typeof councilResponse.response === 'string') {
            responseText = councilResponse.response
          } else if (Array.isArray(councilResponse.response)) {
            responseText = councilResponse.response.map(item => {
              if (typeof item === 'string') return item
              if (item && typeof item === 'object' && item.text) return item.text
              return JSON.stringify(item)
            }).join(' ')
          } else if (councilResponse.response && typeof councilResponse.response === 'object') {
            responseText = councilResponse.response.text || councilResponse.response.content || councilResponse.response.message || JSON.stringify(councilResponse.response)
          } else {
            responseText = String(councilResponse.response || '')
          }

          return {
            id: responseIds[councilResponse.model_name] || `${councilResponse.model_name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            modelName: councilResponse.model_name,
            actualModelName: actualModel,
            originalModelName: originalModel,
            text: responseText,
            error: !!councilResponse.error,
            tokens: councilResponse.tokens || null,
            isStreaming: false,
          }
        }

        // Add placeholder cards immediately so council columns can stream in for RAG path too
        modelsToUse.forEach((modelId) => {
          const id = `${modelId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
          responseIds[modelId] = id
          addResponse({
            id,
            modelName: modelId,
            actualModelName: modelId,
            originalModelName: modelId,
            text: '',
            error: false,
            tokens: null,
            isStreaming: true,
          })
        })
        ragResponsesAlreadyInStore = true

        const ragFinalData = await streamFetch(`${API_URL}/api/rag/stream`, {
          query: currentPrompt,
          selectedModels: modelsToUse,
          userId: userId,
          needsContext: needsContext
        }, {
          onToken: () => {},
          onStatus: () => {},
          onEvent: (event) => {
            if (!event || !event.type) return

            if (event.type === 'search_results') {
              if (Array.isArray(event.search_results) && event.search_results.length > 0) {
                setSearchSources(event.search_results)
              }
              return
            }

            if (event.type === 'model_token') {
              const responseId = responseIds[event.model_name]
              if (!responseId || !event.content) return
              updateResponse(responseId, {
                text: (useStore.getState().responses.find(r => r.id === responseId)?.text || '') + event.content,
                isStreaming: true,
                actualModelName: event.actual_model_name || event.model_name,
                originalModelName: event.original_model_name || event.model_name,
              })
              return
            }

            if (event.type === 'model_done') {
              const normalized = normalizeCouncilResponse(event)
              ragResponsesByModel[normalized.modelName] = normalized
              updateResponse(normalized.id, {
                text: normalized.text,
                error: normalized.error,
                tokens: normalized.tokens,
                actualModelName: normalized.actualModelName,
                originalModelName: normalized.originalModelName,
                isStreaming: false,
              })
              return
            }

            if (event.type === 'model_error') {
              const responseId = responseIds[event.model_name]
              if (!responseId) return
              updateResponse(responseId, {
                text: `Error: ${event.error || 'Unknown model error'}`,
                error: true,
                isStreaming: false,
              })
            }
          },
          onError: (message) => {
            console.error('[RAG Stream] Error:', message)
          },
          signal: abortController.signal,
        })

        ragData = ragFinalData || {}

        // Track query count (1 query per RAG pipeline call)
        setQueryCount(1)
        
        // Store debug data for PipelineDebugWindow
        setRAGDebugData({
          search: ragData.search_results ? {
            query: currentPrompt,
            results: ragData.search_results
          } : null,
          refiner: null,
          categoryDetection: {
            category: category,
            needsSearch: needsSearch,
            needsContext: needsContext,
            prompt: detectionResult?.prompt || null,
            response: detectionResult?.rawResponse || null,
          },
          memoryContext: ragData.memory_context || null,
        })

        // Store sources for display in ResponseComparison
        if (ragData.search_results && Array.isArray(ragData.search_results) && ragData.search_results.length > 0) {
          setSearchSources(ragData.search_results)
        } else {
          console.warn('[RAG Pipeline] No search results returned from Serper')
          setSearchSources(null)
        }

        // Build final ordered responses from streamed model completions (fallback to done payload if needed)
        if (Array.isArray(ragData.council_responses)) {
          ragData.council_responses.forEach((councilResponse) => {
            const normalized = normalizeCouncilResponse(councilResponse)
            ragResponsesByModel[normalized.modelName] = normalized
            updateResponse(normalized.id, {
              text: normalized.text,
              error: normalized.error,
              tokens: normalized.tokens,
              actualModelName: normalized.actualModelName,
              originalModelName: normalized.originalModelName,
              isStreaming: false,
            })
          })
        }

        responses = modelsToUse.map((modelId) => {
          if (ragResponsesByModel[modelId]) return ragResponsesByModel[modelId]
          const responseId = responseIds[modelId]
          return {
            id: responseId,
            modelName: modelId,
            actualModelName: modelId,
            originalModelName: modelId,
            text: useStore.getState().responses.find(r => r.id === responseId)?.text || '',
            error: false,
            tokens: null,
            isStreaming: false,
          }
        })
        // Summary will be generated via streaming endpoint after council responses are collected
        // (handled below in the streaming summary generation section)

        setIsSearchingWeb(false)
      } catch (ragError) {
        // If aborted by user, re-throw so outer catch handles it cleanly
        if (ragError.name === 'AbortError' || ragError.code === 'ERR_CANCELED' || abortController.signal.aborted) {
          throw ragError
        }
        console.error('[RAG Pipeline] Error:', ragError.message, ragError.response?.status)
        
        // If it's a subscription error (403), don't fall back to direct LLM calls
        // They will also fail with the same error
        if (ragError.response?.status === 403 || ragError.response?.data?.subscriptionRequired || /HTTP 403/.test(ragError.message) || /subscription required/i.test(ragError.message)) {
          // Clear any partial responses from failed RAG attempt
          responses = []
          summary = null
          if (ragResponsesAlreadyInStore) {
            clearResponses()
          }
          setIsSearchingWeb(false)
          // Re-throw the error so it's caught by the outer try-catch and handled properly
          throw ragError
        }
        
        // Clear any partial responses from failed RAG attempt
        responses = []
        summary = null
        if (ragResponsesAlreadyInStore) {
          clearResponses()
        }
        // Fallback to direct LLM calls if RAG fails (only for non-subscription errors)
        needsSearch = false
        setIsSearchingWeb(false) // Clear searching indicator when RAG fails
      }
    }

    // If no search needed (needsSearch === false) OR RAG pipeline failed (responses.length === 0), use direct LLM calls
    // No Serper query will be made - models use their training data only
    if (!needsSearch || (needsSearch && responses.length === 0)) {
      setQueryCount(0)
      
      // Retrieve memory context for the non-search path when needsContext is true.
      // In the RAG pipeline path, this is done inside the pipeline. For direct LLM calls,
      // we need to do it here so models still get relevant past conversation context.
      let memoryContextData = null
      let memoryPrefix = ''
      if (needsContext && currentUser?.id) {
        try {
          console.log('[Memory] Retrieving embedded context for non-search prompt...')
          const memResponse = await axios.post(`${API_URL}/api/memory/retrieve`, {
            userId: currentUser.id,
            prompt: currentPrompt,
            needsContext: true
          })
          memoryContextData = memResponse.data
          memoryPrefix = memResponse.data?.contextString || ''
          if (memoryPrefix) {
            console.log(`[Memory] Injecting ${memResponse.data.items.length} past conversations into direct LLM prompts`)
          }
        } catch (memErr) {
          console.error('[Memory] Error retrieving context:', memErr.message)
        }
      }

      // Store debug data for non-search path (includes memory context if retrieved)
      if (!ragData) {
        setRAGDebugData({
          search: null,
          refiner: null,
          categoryDetection: {
            category: category,
            needsSearch: needsSearch,
            needsContext: needsContext,
            prompt: detectionResult?.prompt || null,
            response: detectionResult?.rawResponse || null,
          },
          memoryContext: memoryContextData || null,
        })
      }
      
      // Build the prompt with memory context prepended (if available)
      const todayDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      const dateGroundedPrompt = `Today is ${todayDate}. This is the real, current date.\n\nUser Query: ${currentPrompt}`
      const enhancedPrompt = memoryPrefix
        ? `${memoryPrefix}\n${dateGroundedPrompt}`
        : dateGroundedPrompt

      // Phase 2 Streaming: Add placeholder responses immediately, then stream tokens into them
      const responseIds = {}
      modelsToUse.forEach((modelId) => {
        const id = `${modelId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        responseIds[modelId] = id
        // Add placeholder response to store immediately so cards appear
        addResponse({
          id,
          modelName: modelId,
          actualModelName: modelId,
          originalModelName: modelId,
          text: '',
          error: false,
          tokens: null,
          isStreaming: true,
        })
      })

      // Council panel stays hidden until user clicks "Show Council" button

      // Stream all models in parallel
      const responsePromises = modelsToUse.map(async (modelId) => {
        const firstDashIndex = modelId.indexOf('-')
        if (firstDashIndex === -1) {
          console.error(`[Direct LLM Stream] Invalid modelId format: ${modelId}`)
          updateResponse(responseIds[modelId], {
            text: 'Error: Invalid model ID format',
            error: true,
            isStreaming: false,
          })
          return {
            id: responseIds[modelId],
            modelName: modelId,
            text: 'Error: Invalid model ID format',
            error: true,
          }
        }
        
        const providerKey = modelId.substring(0, firstDashIndex)
        const model = modelId.substring(firstDashIndex + 1)
        const responseId = responseIds[modelId]
        
        try {
          const userId = currentUser?.id || null
          const llmResponse = await callLLMStream(providerKey, model, enhancedPrompt, userId, false, (token) => {
            // Update the response text incrementally as tokens arrive
            updateResponse(responseId, {
              text: (useStore.getState().responses.find(r => r.id === responseId)?.text || '') + token,
            })
          }, abortController.signal)
          
          const responseText = llmResponse.text
          const actualModel = llmResponse.model || modelId
          const originalModel = llmResponse.originalModel || modelId
          
          // Finalize the response with metadata
          updateResponse(responseId, {
            text: responseText,
            actualModelName: actualModel,
            originalModelName: originalModel,
            tokens: llmResponse.tokens || null,
            isStreaming: false,
          })
          
          return {
            id: responseId,
            modelName: modelId,
            actualModelName: actualModel,
            originalModelName: originalModel,
            text: responseText,
            error: false,
            tokens: llmResponse.tokens || null,
          }
        } catch (error) {
          // If aborted by user, don't write error to UI
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return { id: responseId, modelName: modelId, text: '', error: false, aborted: true }
          }
          console.error(`[Direct LLM Stream] Error calling ${modelId}:`, error)
          updateResponse(responseId, {
            text: `Error: ${error.message}`,
            error: true,
            isStreaming: false,
          })
          return {
            id: responseId,
            modelName: modelId,
            actualModelName: modelId,
            originalModelName: modelId,
            text: `Error: ${error.message}`,
            error: true,
          }
        }
      })

      const directResponses = await Promise.all(responsePromises)
      responses = directResponses
    } else {
      // RAG streaming path already wrote placeholder cards and streamed updates into the store
      if (!ragResponsesAlreadyInStore) {
        responses.forEach((response) => addResponse(response))
      }
      // Council panel stays hidden until user clicks "Show Council" button
    }

    // All model responses have been retrieved — stop showing "Loading Council of LLMs responses..."
    // Summary generation below will set isGeneratingSummary to true for the next phase
    setIsLoading(false)

    // For RAG path, responses are already added above
    // For direct path, responses are already in the store via addResponse + updateResponse

    // Helper function to collect all token data
    // Includes all model calls for display. Pipeline calls (category detection) are flagged
    // with isPipeline so the Token Usage Window can show them separately without counting them.
    const collectTokenData = (directJudgeTokens = null) => {
      const tokenData = []
      
      // Add category detection tokens (shown in window but NOT counted in stats)
      if (categoryDetectionTokens) {
        tokenData.push({
          modelName: 'Category Detection (Refiner)',
          tokens: categoryDetectionTokens,
          isPipeline: true // Flag so Token Usage Window can display separately
        })
      }
      
      // Add council response tokens (these include full input + output)
      responses.forEach(r => {
        if (r.tokens) {
          tokenData.push({
            modelName: r.modelName,
            tokens: r.tokens
          })
        }
      })
      
      // No refiner tokens — models read raw sources directly (refiner removed for source processing)
      
      // Add judge tokens from direct LLM path (when RAG wasn't used but summary was generated)
      if (directJudgeTokens) {
        tokenData.push(directJudgeTokens)
      }
      
      return tokenData
    }
    
    // Collect initial token data (before summary generation)
    let tokenData = collectTokenData()
    
    // Stop showing "fetching responses" loading, will show "working on summary" if needed
    // Note: setIsLoading(false) is now in the finally block to ensure it's always called

    // Track prompt submission (one per submission, regardless of models)
    if (currentUser?.id) {
      try {
        // Prepare facts and sources from RAG data
        let facts = null
        let sources = null
        
        if (ragData) {
          // No refiner facts — models read raw sources directly
          // facts remain null
          
          // Extract search results (sources)
          if (ragData.search_results && Array.isArray(ragData.search_results)) {
            sources = ragData.search_results.map(s => ({
              title: s.title,
              link: s.link,
              snippet: s.snippet,
            }))
          }
        }
        
        const response = await axios.post(`${API_URL}/api/stats/prompt`, {
          userId: currentUser.id,
          promptText: currentPrompt,
          category: category,
          responses: responses.length > 0 ? responses : null,
          summary: summary || null,
          facts: facts,
          sources: sources,
        })
        // Trigger stats refresh after tracking prompt
        useStore.getState().triggerStatsRefresh()
      } catch (error) {
        console.error('[Prompt Tracking] Error:', error.message)
      }
    }

    // Update stats
    const modelNames = modelsToUse.map((id) => {
      // Split modelId: format is "providerKey-modelName"
      const firstDashIndex = id.indexOf('-')
      const providerKey = id.substring(0, firstDashIndex)
      const model = id.substring(firstDashIndex + 1)
      return `${providerKey}-${model}`
    })
    updateStats(currentPrompt, modelNames, category, ratings)

    // Generate summary using Gemini 3 Flash via streaming (user sees tokens appear in real-time)
    // Only generate summary if 2+ models were used (no point summarizing a single response)
    const validResponses = responses.filter((r) => !r.error && r.text)
    
    // If only 1 model was used, don't create a summary - just show the response in ResponseComparison
    // Skip summary creation for single model responses
    // Manual mode: summary is generated only when user clicks "Generate Summary" in MainView.
    if (false && validResponses.length >= 2 && !summary) {
      setIsGeneratingSummary(true)
      try {
        // Build the summary prompt (matches judge finalization prompt)
        // Use short friendly names (ChatGPT, Claude, Gemini, Grok) so the judge summary reads cleanly
        const responsesText = validResponses
          .map((r) => `\n--- ${getShortModelName(r.modelName)}'s response ---\n${r.text}\n`)
          .join('')
        
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        const summaryPrompt =  `Today is ${today}. This is the real, current date. You are an expert judge analyzing multiple AI model responses to a user's question.

        Original User Query: "${currentPrompt}"
        
        Council Model Responses:
        ${responsesText}
        
        Please analyze these responses and provide ONLY these five sections in this exact format (do NOT include section headers in the content itself):
        
        Consensus: [A single number from 0-100 representing the percentage of agreement between all models]
        
        Summary: [Write a thorough, explanatory summary that synthesizes what the council collectively determined. Do not just state conclusions — explain the reasoning, key details, and context behind them. When referencing models, use ONLY their short names: ChatGPT, Claude, Gemini, Grok. Do NOT use version numbers or full model identifiers like "GPT-4.1" or "Claude 4.5 Sonnet" or "Gemini 3 Flash" or "Grok 4-1 Fast". The summary should give the reader a complete understanding of the topic without needing to read the individual model responses. Aim for 2-3 substantial paragraphs.]
        
        Agreements: [List at least 3-5 specific, substantive points where models agree, one per line, each starting with a dash]
        
        Contradictions: [ONLY list factual contradictions where Model A and Model B make claims that CANNOT BOTH BE TRUE. Example: "Gemini states the date is November 7, but Claude states it is November 5 — these are contradictory." If one model mentions something another does not, that is NOT a contradiction. If models suggest different examples, products, or details, those are NOT contradictions. If models differ in tone, depth, or structure, those are NOT contradictions. If there are no factual contradictions, write: "None identified — all models are in factual agreement."]
        
        Differences: [List notable differences in how the models responded. This includes: details or topics one model covered that others omitted, different examples or recommendations given, varying levels of depth or specificity, different tones or approaches, and any unique angles or perspectives. These are NOT contradictions — just interesting variations. Each difference should start with a dash and name which models are involved.]
        
        Important: Only include the section label followed by a colon, then the content. Do NOT repeat section headers within the content. Do NOT use markdown formatting like ** for section headers.`

              // Use Gemini 3 Flash via streaming summary endpoint
              const userId = currentUser?.id || null
              
              // Set an initial empty summary so the window appears and starts showing text
              setSummary({
                text: '',
                summary: '',
                consensus: null,
                agreements: [],
                disagreements: [],
                timestamp: Date.now(),
                singleModel: false,
                prompt: summaryPrompt,
                originalPrompt: currentPrompt,
                isStreaming: true,
              })
              // Make sure summary window is visible immediately
              const setSummaryMinimizedEarly = useStore.getState().setSummaryMinimized
              if (setSummaryMinimizedEarly) setSummaryMinimizedEarly(false)
              
              const summaryFinalData = await streamFetch(`${API_URL}/api/summary/stream`, {
                prompt: summaryPrompt,
                userId,
              }, {
                onToken: (token) => {
                  // Stream tokens directly into the summary text
                  useStore.getState().appendSummaryText(token)
                },
                onStatus: () => {},
                onError: (message) => {
                  console.error('[Summary Stream] Error:', message)
                },
                signal: abortController.signal,
              })

              const rawSummaryText = summaryFinalData?.text || useStore.getState().summary?.text || ''
              const summaryTokens = summaryFinalData?.tokens || null
        
        // Parse the response to extract sections (Consensus, Summary, Agreements, Disagreements)
        // More flexible consensus matching - handles various formats like "Consensus: 85", "**Consensus**: 85%", "[85]", etc.
        const consensusMatch = rawSummaryText.match(/(?:Consensus|consensus)[:\-]?\s*(?:\[|\*\*)?\s*(\d+)\s*(?:%|]|\*\*)?/i)
        
        // Split the text by section headers to get clean boundaries
        // First, normalize the text to handle markdown formatting
        const normalizedText = rawSummaryText
          .replace(/\*\*(SUMMARY|Summary|AGREEMENTS|Agreements|CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements|DIFFERENCES|Differences|CONSENSUS|Consensus)\*\*[:\-]?/gi, '\n$1:')
          .replace(/\*(SUMMARY|Summary|AGREEMENTS|Agreements|CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements|DIFFERENCES|Differences|CONSENSUS|Consensus)\*[:\-]?/gi, '\n$1:')
        
        // Extract sections using more robust patterns with greedy capture up to next section
        // Use [\s\S] instead of . to match across newlines
        const summaryMatch = normalizedText.match(/(?:Summary|SUMMARY)[:\-]?\s*([\s\S]+?)(?=\n\s*(?:AGREEMENTS|Agreements)[:\-]|\n\s*(?:CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements)[:\-]|\n\s*(?:DIFFERENCES|Differences)[:\-]|$)/i)
        const agreementsMatch = normalizedText.match(/(?:AGREEMENTS|Agreements)[:\-]?\s*([\s\S]+?)(?=\n\s*(?:CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements)[:\-]|\n\s*(?:DIFFERENCES|Differences)[:\-]|$)/i)
        const disagreementsMatch = normalizedText.match(/(?:CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements)[:\-]?\s*([\s\S]+?)(?=\n\s*(?:DIFFERENCES|Differences)[:\-]|$)/i)
        const differencesMatch = normalizedText.match(/(?:DIFFERENCES|Differences)[:\-]?\s*([\s\S]+)$/i)
        
        // Extract consensus score (0-100)
        let consensus = null
        if (consensusMatch) {
          const score = parseInt(consensusMatch[1], 10)
          consensus = Math.max(0, Math.min(100, score))
        } else {
          // Try more flexible patterns
          const patterns = [
            /consensus[:\-]?\s*(\d+)\s*%/i,
            /consensus[:\-]?\s*\[(\d+)\]/i,
            /consensus[:\-]?\s*(\d+)/i,
            /(\d+)\s*%\s*consensus/i,
            /consensus.*?(\d+)/i
          ]
          
          for (const pattern of patterns) {
            const match = rawSummaryText.match(pattern)
            if (match) {
              const score = parseInt(match[1], 10)
              consensus = Math.max(0, Math.min(100, score))
              break
            }
          }
          
          if (!consensus) {
            console.warn('[Summary] Could not extract consensus score from response')
          }
        }
        
        // Extract summary - clean up any markdown formatting or section headers that might be included
        let parsedSummary = summaryMatch ? summaryMatch[1].trim() : rawSummaryText.split(/\n\n/)[0].trim()
        // Remove any section headers, markdown, or leading colons that might have been captured
        parsedSummary = parsedSummary
          .replace(/^(?:\*\*)?(?:Summary|SUMMARY)[:\-]?\s*\*?\*?\s*/i, '')
          .replace(/^:\s*/, '') // Remove leading colon
          .trim()
        
        // Extract agreements and disagreements as arrays
        // Clean up the extracted text to remove any section headers, markdown, or nested bullets
        let agreementsText = agreementsMatch ? agreementsMatch[1].trim() : ''
        // Remove section headers if they were captured
        agreementsText = agreementsText
          .replace(/^(?:\*\*)?(?:AGREEMENTS|Agreements)[:\-]?\s*\*?\*?\s*/i, '')
          .trim()
        // Remove any duplicate section markers that might appear in the content
        agreementsText = agreementsText.replace(/\n\s*(?:\*\*)?(?:AGREEMENTS|Agreements)[:\-]?\s*\*?\*?\s*/gi, '\n')
        
        let agreements = agreementsText
          ? agreementsText.split('\n').filter(l => {
              const trimmed = l.trim()
              // Filter out empty lines, section headers, standalone bullets, and "none identified"
              return trimmed && 
                     !trimmed.match(/^[-•*•]\s*$/) && 
                     !trimmed.match(/^(?:\*\*)?(?:AGREEMENTS|Agreements)[:\-]?\s*\*?\*?$/i) &&
                     !trimmed.match(/^:\s*$/) && // Filter out lines that are just ":"
                     !trimmed.toLowerCase().includes('none identified')
            }).map(l => {
              // Clean up nested bullets (e.g., "• - • text" becomes "text")
              let cleaned = l.replace(/^[-•*•]\s*[-•*•]\s*/, '').replace(/^[-•*•]\s*/, '').trim()
              // Remove any remaining markdown formatting
              cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '')
              return cleaned
            }).filter(l => l) // Remove any empty strings after cleaning
          : []
        
        let disagreementsText = disagreementsMatch ? disagreementsMatch[1].trim() : ''
        // Remove section headers if they were captured
        disagreementsText = disagreementsText
          .replace(/^(?:\*\*)?(?:CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements)[:\-]?\s*\*?\*?\s*/i, '')
          .trim()
        // Remove any duplicate section markers that might appear in the content
        disagreementsText = disagreementsText.replace(/\n\s*(?:\*\*)?(?:CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements)[:\-]?\s*\*?\*?\s*/gi, '\n')
        
        const rawDisagreements = disagreementsText
          ? disagreementsText.split('\n').filter(l => {
              const trimmed = l.trim()
              // Filter out empty lines, section headers, standalone bullets, "none identified", and instruction text
              return trimmed && 
                     !trimmed.match(/^[-•*•]\s*$/) && 
                     !trimmed.match(/^(?:\*\*)?(?:CONTRADICTIONS|Contradictions|DISAGREEMENTS|Disagreements)[:\-]?\s*\*?\*?$/i) &&
                     !trimmed.match(/^:\s*$/) &&
                     !trimmed.match(/^\(.*\)$/) && // Filter parenthesized instruction text
                     !trimmed.toLowerCase().startsWith('none identified') &&
                     !trimmed.toLowerCase().includes('this section is mandatory') &&
                     !trimmed.toLowerCase().includes('you must') &&
                     !trimmed.toLowerCase().includes('look for:')
            }).map(l => {
              // Clean up nested bullets (e.g., "• - • text" becomes "text")
              let cleaned = l.replace(/^[-•*•]\s*[-•*•]\s*/, '').replace(/^[-•*•]\s*/, '').trim()
              // Remove any remaining markdown formatting
              cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '')
              return cleaned
            }).filter(l => l && l.length >= 5) // Remove any empty or too-short strings after cleaning
          : []
        
        // Extract differences section
        let differencesText = differencesMatch ? differencesMatch[1].trim() : ''
        differencesText = differencesText
          .replace(/^(?:\*\*)?(?:DIFFERENCES|Differences)[:\-]?\s*\*?\*?\s*/i, '')
          .trim()
        differencesText = differencesText.replace(/\n\s*(?:\*\*)?(?:DIFFERENCES|Differences)[:\-]?\s*\*?\*?\s*/gi, '\n')
        
        let differences = differencesText
          ? differencesText.split('\n').filter(l => {
              const trimmed = l.trim()
              return trimmed && 
                     !trimmed.match(/^[-•*•]\s*$/) && 
                     !trimmed.match(/^(?:\*\*)?(?:DIFFERENCES|Differences)[:\-]?\s*\*?\*?$/i) &&
                     !trimmed.match(/^:\s*$/) &&
                     !trimmed.toLowerCase().startsWith('none identified') &&
                     !trimmed.toLowerCase().startsWith('no notable')
            }).map(l => {
              let cleaned = l.replace(/^[-•*•]\s*[-•*•]\s*/, '').replace(/^[-•*•]\s*/, '').trim()
              cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '')
              return cleaned
            }).filter(l => l && l.length >= 5)
          : []

        // Post-processing: Filter out "disagreements" that are actually coverage differences, not contradictions.
        let disagreements = rawDisagreements.filter(d => {
          const isOmission = /\b(?:omits?|omitted|(?:does|do|did|is|are|were?) not (?:mention|include|address|cite|reference|provide|name|specify|list)|not mentioned|not included|not referenced|not cited|not addressed|left out|leaves? out|without (?:mentioning|citing|referencing|naming)|absent from|refrain(?:s)? from|a detail (?:omitted|absent|missing|not))\b/i.test(d)
          const isDetailDiff = /\b(?:more (?:detail|detailed|specific|structured|informal|clinical|conversational|comprehensive|general|predictive|neutral|cautious|thorough|extensive)|less (?:detail|specific|thorough)|greater (?:detail|depth|specificity)|deeper|broader|level of detail|varying (?:levels?|degrees?)|different (?:tone|style|structure|framing|approach|perspective|level)|general (?:descriptions?|terms?|categories?|statements?))\b/i.test(d)
          const isToneDiff = /\b(?:adopts?\s+(?:a\s+)?(?:more\s+)?(?:\w+\s+)?tone|(?:conversational|informal|clinical|formal|neutral|empathetic|structured|predictive|cautious)\s+(?:tone|style|approach)|uses?\s+(?:a\s+)?(?:\w+\s+)?analogy)\b/i.test(d)
          const isFocusDiff = /\b(?:emphasiz(?:es?|ing)|focus(?:es|ing)?\s+(?:on|more|instead|primarily)|prioritiz(?:es?|ing)|centers?\s+on)\b.*\b(?:while|whereas|but|however)\b.*\b(?:emphasiz|focus|prioritiz|centers?|provid|takes?|us(?:es?|ing))\b/i.test(d)
          const isExtraDetail = /\b(?:lists?\s+specific|provides?\s+specific|names?\s+specific|cites?\s+specific|identifies?\s+specific|includes?\s+specific)\b.*\b(?:while|whereas|but)\b/i.test(d) || /\b(?:while|whereas)\b.*\b(?:the other(?:s|\s+models?)?)\b.*\b(?:do not|don'?t|refrain|avoid|only|simply|use more general)\b/i.test(d)
          if (isOmission || isDetailDiff || isToneDiff || isFocusDiff || isExtraDetail) {
            console.log(`[Judge Filter] Removed non-contradiction: "${d.substring(0, 80)}..."`)
            return false
          }
          return true
        })
        
        // Post-process: replace any full model names with short friendly names
        const shortenModelNames = (text) => {
          if (!text) return text
          return text
            // OpenAI variants
            .replace(/GPT[-\s]?4\.1/gi, 'ChatGPT')
            .replace(/GPT[-\s]?4o[-\s]?mini/gi, 'ChatGPT')
            .replace(/GPT[-\s]?5\.2/gi, 'ChatGPT')
            .replace(/GPT[-\s]?5[-\s]?mini/gi, 'ChatGPT')
            .replace(/OpenAI[-\s]?gpt[-\s]?[\d.]+[-\w]*/gi, 'ChatGPT')
            .replace(/openai[-\s]gpt[-\s][\d.]+/gi, 'ChatGPT')
            // Anthropic variants
            .replace(/Claude\s+4\.5\s+Sonnet/gi, 'Claude')
            .replace(/Claude\s+4\.5\s+Opus/gi, 'Claude')
            .replace(/Claude\s+4\s+Sonnet/gi, 'Claude')
            .replace(/anthropic[-\s]claude[-\s][\d.]+[-\w]*/gi, 'Claude')
            // Google variants
            .replace(/Gemini\s+3\s+Flash/gi, 'Gemini')
            .replace(/Gemini\s+3\s+Pro/gi, 'Gemini')
            .replace(/Gemini\s+2\.5\s+Flash[-\s]?Lite/gi, 'Gemini')
            .replace(/google[-\s]gemini[-\s][\d.]+[-\w]*/gi, 'Gemini')
            // xAI variants
            .replace(/Grok\s+4[-\s]?1[-\s]?fast[-\s]?(?:non[-\s]?)?reasoning/gi, 'Grok')
            .replace(/Grok[-\s]?4[-\s]?1[-\s]?fast/gi, 'Grok')
            .replace(/xai[-\s]grok[-\s][\d.]+[-\w]*/gi, 'Grok')
        }
        parsedSummary = shortenModelNames(parsedSummary)
        agreements = agreements.map(a => shortenModelNames(a))
        disagreements = disagreements.map(d => shortenModelNames(d))
        differences = differences.map(d => shortenModelNames(d))

        // Format the summary text using markdown for proper rendering
        let formattedSummaryText = ''
        
        // Consensus score at the top
        if (consensus !== null && consensus !== undefined) {
          formattedSummaryText += `## CONSENSUS: ${consensus}%\n\n`
        }
        
        // Summary section
        if (parsedSummary) {
          formattedSummaryText += `## SUMMARY\n${parsedSummary}\n\n`
        }
        
        // Agreements section
        if (agreements && agreements.length > 0) {
          formattedSummaryText += `## AGREEMENTS\n${agreements.map(a => `- ${a}`).join('\n')}\n\n`
        } else {
          formattedSummaryText += `## AGREEMENTS\nNone identified.\n\n`
        }
        
        // Contradictions section
        if (disagreements && disagreements.length > 0) {
          formattedSummaryText += `## CONTRADICTIONS\n${disagreements.map(d => `- ${d}`).join('\n')}\n\n`
        } else {
          formattedSummaryText += `## CONTRADICTIONS\nNone identified — all models are in factual agreement.\n\n`
        }
        
        // Differences section
        formattedSummaryText += `## DIFFERENCES\n${differences && differences.length > 0 ? differences.map(d => `- ${d}`).join('\n') : 'None identified.'}`
        
        // Collect judge tokens and update token data
        if (summaryTokens) {
          const directJudgeTokens = {
            modelName: 'Judge Model',
            tokens: summaryTokens,
            isJudge: true
          }
          // Re-collect token data including the judge tokens
          tokenData = collectTokenData(directJudgeTokens)
        }
        
        setSummary({
          text: formattedSummaryText || rawSummaryText,
          summary: parsedSummary,
          consensus: consensus,
          agreements: agreements,
          disagreements: disagreements,
          differences: differences,
          timestamp: Date.now(),
          singleModel: false,
          prompt: summaryPrompt, // Include the prompt sent to Gemini
          originalPrompt: currentPrompt, // The user's original question
        })
        
        // Store initial summary in conversation context
        // The backend will automatically summarize the raw judge response and store it
        if (currentUser?.id && rawSummaryText) {
          axios.post(`${API_URL}/api/judge/store-initial-summary`, {
            userId: currentUser.id,
            summaryText: rawSummaryText, // Raw judge response (not formatted)
            originalPrompt: summaryPrompt
          }).catch(err => {
            console.error('[Summary] Error storing initial summary:', err)
          })
        }
        
        // Ensure summary window is visible when it first appears
        const setSummaryMinimized = useStore.getState().setSummaryMinimized
        if (setSummaryMinimized) {
          setSummaryMinimized(false) // Show summary window
        }
      } catch (error) {
        console.error('[Summary] Error generating summary:', error.message)
        // Show a user-friendly error message
        setSummary({
          text: `Error generating summary: ${error.message}. Please check your Google API key and try again.`,
          timestamp: Date.now(),
          error: true,
          originalPrompt: currentPrompt, // The user's original question
        })
      } finally {
        setIsGeneratingSummary(false)
      }
    } else if (validResponses.length === 1) {
      // Only 1 model - don't create a summary window
      setIsGeneratingSummary(false)
      // Clear any existing summary for single model
      if (summary?.singleModel) {
        const clearSummary = useStore.getState().clearSummary
        if (clearSummary) {
          clearSummary()
        }
      }
    } else {
      setIsGeneratingSummary(false)
    }

    // Save token data to store (includes council + judge/summary tokens; excludes pipeline/category detection)
    useStore.getState().setTokenData(tokenData)

    // Send the EXACT token total from the Token Usage Window to the backend.
    // This is the ONLY place the user-visible token counter gets updated.
    // Excludes pipeline tokens (category detection) — matches what the user sees.
    if (currentUser?.id && tokenData.length > 0) {
      try {
        const promptTokens = tokenData
          .filter(item => !item.isPipeline && !item.tokens?.isPipeline)
          .reduce((sum, item) => {
            const t = item.tokens || {}
            return sum + (t.total || ((t.input || 0) + (t.output || 0)))
          }, 0)
        
        if (promptTokens > 0) {
          await axios.post(`${API_URL}/api/stats/token-update`, {
            userId: currentUser.id,
            promptTokens,
          })
          // Refresh stats display so the counter updates immediately
          useStore.getState().triggerStatsRefresh()
          console.log(`[Token Update] Sent ${promptTokens} tokens to backend`)
        }
      } catch (error) {
        console.error('[Token Update] Error sending token total:', error.message)
      }
    }

    // Auto-save this conversation to history (Year → Month → Day browsable in History tab)
    if (currentUser?.id) {
      try {
        const currentSummary = useStore.getState().summary
        const currentResponses = useStore.getState().responses || responses
        const searchSrcs = useStore.getState().searchSources
        
        const autoSaveResponse = await axios.post(`${API_URL}/api/history/auto-save`, {
          userId: currentUser.id,
          originalPrompt: savedPrompt,
          category: category || 'General',
          responses: currentResponses.map(r => ({
            modelName: r.modelName || r.actualModelName || 'Unknown',
            actualModelName: r.actualModelName || r.modelName || 'Unknown',
            text: r.text || '',
            error: r.error || false,
            tokens: r.tokens || null,
          })),
          summary: currentSummary ? {
            text: currentSummary.text || '',
            consensus: currentSummary.consensus || null,
            agreements: currentSummary.agreements || [],
            disagreements: currentSummary.disagreements || [],
            singleModel: currentSummary.singleModel || false,
            modelName: currentSummary.modelName || null,
          } : null,
          sources: searchSrcs || (ragData?.search_results) || [],
          facts: [], // No refiner — models read raw sources directly
        })
        // Store the historyId so follow-up conversations can update this entry
        if (autoSaveResponse.data?.historyId) {
          setCurrentHistoryId(autoSaveResponse.data.historyId)
          console.log('[History] Auto-saved conversation to history, tracking:', autoSaveResponse.data.historyId)
        } else {
          console.log('[History] Auto-saved conversation to history')
        }
      } catch (error) {
        console.error('[History] Error auto-saving:', error.message)
      }
    }

    // Clear the prompt input (lastSubmittedPrompt was already saved at the beginning)
    setCurrentPrompt('')
    } catch (error) {
      // If the user cancelled the request, handle gracefully
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED' || abortController.signal.aborted) {
        console.log('[handlePromptSubmit] Request cancelled by user')
        return
      }

      // Catch any unhandled errors to prevent the page from going black
      console.error('[handlePromptSubmit] Unhandled error:', error)
      console.error('[handlePromptSubmit] Error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status
      })
      
      // Show error message to user
      const errorMessage = error.response?.data?.error || error.message || 'An unexpected error occurred. Please try again.'
      
      // Add error response to show user what went wrong
      addResponse({
        id: `error-${Date.now()}`,
        modelName: 'Error',
        actualModelName: 'Error',
        originalModelName: 'Error',
        text: `Error: ${errorMessage}`,
        error: true,
      })
      
      // If it's a subscription error, show a helpful message
      if (error.response?.status === 403 || error.response?.data?.subscriptionRequired) {
        addResponse({
          id: `subscription-error-${Date.now()}`,
          modelName: 'Subscription Required',
          actualModelName: 'Subscription Required',
          originalModelName: 'Subscription Required',
          text: 'Active subscription required. Please subscribe to use this service. You can manage your subscription in Settings.',
          error: true,
        })
      }
    } finally {
      // Clear the abort controller ref
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null
      }
      // Always clear loading state, even if an error occurred
      setIsLoading(false)
      setIsSearchingWeb(false)
      setIsGeneratingSummary(false)
    }
  }

  // Listen for prompt submission
  useEffect(() => {
    if (shouldSubmit && currentPrompt && selectedModels.length > 0) {
      handlePromptSubmit()
      clearSubmit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldSubmit]) // Only depend on shouldSubmit to prevent double-firing when selectedModels changes

  useEffect(() => {
    if (!shouldGenerateSummary) return
    handleGenerateSummary().finally(() => {
      clearGenerateSummary()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldGenerateSummary])

  // Update body background and text color based on theme
  // MUST be before any conditional returns to follow Rules of Hooks
  useEffect(() => {
    document.body.style.background = currentTheme.background
    document.body.style.color = currentTheme.text
  }, [theme, currentTheme])

  // Wait for store hydration from localStorage before rendering anything
  // This prevents the flash of AuthView/SubscriptionGate on page load for logged-in users
  if (!hasHydrated) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(255, 255, 255, 0.1)',
          borderTopColor: 'rgba(255, 255, 255, 0.6)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Handle admin route separately - must be checked before other renders
  // This early return prevents the normal app from rendering
  // AdminView will handle login if user is not logged in
  if (isAdminRoute) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: 'rgba(0, 0, 0, 0.95)' }}>
        <AdminView />
      </div>
    )
  }

  // Show public pages if not logged in
  if (!currentUser) {
    // Terms and Privacy are always accessible (even needed by Stripe)
    if (publicPage === 'terms') return <TermsOfService onNavigate={navigatePublic} />
    if (publicPage === 'privacy') return <PrivacyPolicy onNavigate={navigatePublic} />
    // Auth views (sign in / sign up)
    if (publicPage === 'signin' || publicPage === 'signup' || publicPage === 'select-plan') {
      return <AuthView initialView={publicPage} initialPlan={landingPlan} onNavigate={navigatePublic} />
    }
    // Default: Landing page
    return <LandingPage onNavigate={navigatePublic} />
  }

  // Logged-in users on terms/privacy pages — still show those pages
  if (publicPage === 'terms') return <TermsOfService onNavigate={(page) => { if (page === 'landing') { navigatePublic('landing'); } else { navigatePublic(page); } }} />
  if (publicPage === 'privacy') return <PrivacyPolicy onNavigate={(page) => { if (page === 'landing') { navigatePublic('landing'); } else { navigatePublic(page); } }} />

  // If a logged-in user somehow lands on /signin, /signup, or /, redirect them to the app
  if (publicPage === 'signin' || publicPage === 'signup' || publicPage === 'landing') {
    // Reset URL to / for the app
    if (window.location.pathname !== '/' && window.location.pathname !== '/admin') {
      window.history.replaceState({}, '', '/')
    }
  }

  // Subscription logic:
  // - 'inactive' / 'incomplete' / 'past_due' → SubscriptionGate (must subscribe/fix payment)
  // - 'canceled' / 'paused' within paid period (before renewalDate) → full access with warning banner
  // - 'canceled' / 'paused' past paid period → restricted mode (can view stats/saved/own profile, no prompts)
  // - 'active' / 'trialing' → full access
  // Admins always bypass
  const subStatus = currentUser.subscriptionStatus
  const isWithinPaidPeriod = currentUser.subscriptionRenewalDate && new Date(currentUser.subscriptionRenewalDate) > new Date()
  const isCanceledOrPaused = subStatus === 'canceled' || subStatus === 'paused'
  
  // Users with pending email verification → log them out so they see the verification flow
  if (subStatus === 'pending_verification' && !isUserAdmin) {
    // Clear user so they see AuthView (where they can sign in and see verification-pending)
    clearCurrentUser()
    return null
  }

  // Users who never subscribed, have incomplete signup, or failed payment → SubscriptionGate
  const needsSubscriptionGate = !isCanceledOrPaused && subStatus !== 'active' && subStatus !== 'trialing'
  
  if (needsSubscriptionGate && !isUserAdmin) {
    return <SubscriptionGate currentUser={currentUser} />
  }
  
  // Canceled/paused users PAST their paid period → restricted mode
  const subscriptionRestricted = isCanceledOrPaused && !isWithinPaidPeriod && !isUserAdmin
  // Canceled/paused users WITHIN their paid period → full access but show a warning
  const subscriptionExpiring = isCanceledOrPaused && isWithinPaidPeriod && !isUserAdmin
  // Paused users past their paid period → lock the prompt box (they still had access until period ended)
  const subscriptionPaused = subStatus === 'paused' && !isWithinPaidPeriod && !isUserAdmin

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: currentTheme.background }}>
      <AnimatePresence>
        {showWelcome && <WelcomeScreen key="welcome" />}
      </AnimatePresence>

      {!showWelcome && (
        <>
          <NavigationBar />

          {/* Subscription Restricted Banner - only for users past their paid period */}
          {subscriptionRestricted && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                position: 'fixed',
                top: '70px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 300,
                padding: '12px 24px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(255, 59, 48, 0.15), rgba(255, 59, 48, 0.08))',
                border: '1px solid rgba(255, 59, 48, 0.4)',
                backdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                maxWidth: '600px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              }}
            >
              <span style={{ fontSize: '0.9rem', color: '#ff6b6b', lineHeight: '1.4' }}>
                {`Your subscription has ${subStatus === 'paused' ? 'been paused' : 'expired'}. You can view your profile, saved conversations, and settings, but prompts and the full Prompt Feed are unavailable.`}
              </span>
              <motion.button
                onClick={() => setActiveTab('settings')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: '6px 16px',
                  background: currentTheme.accentGradient,
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Resubscribe
              </motion.button>
            </motion.div>
          )}

                {/* Main Content Area - Show based on active tab */}
                {/* Note: AdminView is handled in early return above, so this should never render AdminView */}
                {activeTab === 'home' && <MainView onClearAll={clearAllWindows} subscriptionRestricted={subscriptionRestricted} subscriptionPaused={subscriptionPaused} subscriptionExpiring={subscriptionExpiring} subscriptionRenewalDate={currentUser.subscriptionRenewalDate} isLoading={isLoading} isGeneratingSummary={isGeneratingSummary} onCancelPrompt={handleCancelPrompt} />}
                {activeTab === 'leaderboard' && <LeaderboardView subscriptionRestricted={subscriptionRestricted} />}
                {activeTab === 'saved' && <SavedConversationsView />}
                {activeTab === 'settings' && <SettingsView />}
                {activeTab === 'statistics' && <StatisticsView />}

                {/* Response Comparison - Only show on home tab (not on admin route) */}
                {!isAdminRoute && activeTab === 'home' && <ResponseComparison />}

                {/* Summary Window - Shows on all tabs except admin */}
                {!isAdminRoute && <SummaryWindow />}

                {/* Token Usage is now shown inside the Council panel (ResponseComparison) as a tab */}

        </>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

    </div>
  )
}

export default App

