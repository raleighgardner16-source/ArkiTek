import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from './store/useStore'
import WelcomeScreen from './components/WelcomeScreen'
import BackgroundScene from './components/BackgroundScene'
import ResponseComparison from './components/ResponseComparison'
import NavigationBar from './components/NavigationBar'
import MainView from './components/MainView'
import SettingsView from './components/SettingsView'
import LeaderboardView from './components/LeaderboardView'
import StatisticsView from './components/StatisticsView'
import SummaryWindow from './components/SummaryWindow'
import AuthView from './components/AuthView'
import AdminView from './components/AdminView'
import FactsAndSourcesWindow from './components/FactsAndSourcesWindow'
import TokenUsageWindow from './components/TokenUsageWindow'
import CostBreakdownWindow from './components/CostBreakdownWindow'
import CategoryDetectionWindow from './components/CategoryDetectionWindow'
import UsageIndicator from './components/UsageIndicator'
import { callLLM, getAllModels, searchWithSerper } from './services/llmProviders'
import { detectCategory } from './utils/categoryDetector'
import axios from 'axios'

function App() {
  const showWelcome = useStore((state) => state.showWelcome)
  const currentUser = useStore((state) => state.currentUser)
  const setGpt4oMiniResponse = useStore((state) => state.setGpt4oMiniResponse)
  // Check pathname synchronously on initialization
  const [isAdminRoute, setIsAdminRoute] = useState(() => {
    const path = window.location.pathname
    const hash = window.location.hash
    const isAdmin = path === '/admin' || path === '/admin/' || hash === '#/admin'
    console.log('[App] 🔍 Initial route check:', { 
      path, 
      hash, 
      isAdmin,
      fullUrl: window.location.href 
    })
    return isAdmin
  })
  const activeTab = useStore((state) => state.activeTab || 'home')
  
  // Listen for navigation changes
  useEffect(() => {
    const checkAdminRoute = () => {
      const path = window.location.pathname
      const hash = window.location.hash
      const isAdmin = path === '/admin' || path === '/admin/' || hash === '#/admin'
      console.log('[App] 🔍 Route changed:', { path, hash, isAdmin, fullUrl: window.location.href })
      setIsAdminRoute(isAdmin)
    }
    
    // Check immediately in case pathname changed after initial render
    checkAdminRoute()
    
    // Listen for browser back/forward navigation
    window.addEventListener('popstate', checkAdminRoute)
    // Also listen for hash changes (in case using hash routing)
    window.addEventListener('hashchange', checkAdminRoute)
    
    return () => {
      window.removeEventListener('popstate', checkAdminRoute)
      window.removeEventListener('hashchange', checkAdminRoute)
    }
  }, [])
  const selectedModels = useStore((state) => state.selectedModels)
  const currentPrompt = useStore((state) => state.currentPrompt)
  const setCurrentPrompt = useStore((state) => state.setCurrentPrompt)
  const addResponse = useStore((state) => state.addResponse)
  const clearResponses = useStore((state) => state.clearResponses)
  
  // Clear all responses and windows
  const clearAllWindows = () => {
    try {
      clearResponses()
      setShowTokenUsageWindow(false)
      setShowCostBreakdownWindow(false)
      setShowCategoryDetectionWindow(false)
      setShowFactsWindow(false) // Close facts/sources window
      setQueryCount(0)
      // Minimize summary window (summary is already cleared by clearResponses)
      const setSummaryMinimized = useStore.getState().setSummaryMinimized
      if (setSummaryMinimized) {
        setSummaryMinimized(true)
      }
    } catch (error) {
      console.error('[clearAllWindows] Error clearing windows:', error)
      // Don't let errors crash the page
    }
  }
  const updateStats = useStore((state) => state.updateStats)
  const setVrMode = useStore((state) => state.setVrMode)
  const vrMode = useStore((state) => state.vrMode)
  const ratings = useStore((state) => state.ratings)
  const setCategory = useStore((state) => state.setCategory)
  const shouldSubmit = useStore((state) => state.shouldSubmit)
  const clearSubmit = useStore((state) => state.clearSubmit)
  const setSummary = useStore((state) => state.setSummary)
  const clearSelectedModels = useStore((state) => state.clearSelectedModels)
  const ragDebugData = useStore((state) => state.ragDebugData)
  const setRAGDebugData = useStore((state) => state.setRAGDebugData)
  const clearRAGDebugData = useStore((state) => state.clearRAGDebugData)
  const gpt4oMiniResponse = useStore((state) => state.gpt4oMiniResponse)
  const setIsSearchingWeb = useStore((state) => state.setIsSearchingWeb)

  const [isLoading, setIsLoading] = useState(false)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [currentCategory, setCurrentCategory] = useState('general')
  const [tokenUsageData, setTokenUsageData] = useState([])
  const [showTokenUsageWindow, setShowTokenUsageWindow] = useState(false)
  const [showCostBreakdownWindow, setShowCostBreakdownWindow] = useState(false)
  const [queryCount, setQueryCount] = useState(0)
  const [categoryDetectionData, setCategoryDetectionData] = useState(null)
  const [showCategoryDetectionWindow, setShowCategoryDetectionWindow] = useState(false)
  const showFactsWindow = useStore((state) => state.showFactsWindow)
  const setShowFactsWindow = useStore((state) => state.setShowFactsWindow)

  // Clear selected models when navigating to home page from another tab
  const prevActiveTab = React.useRef(activeTab)
  useEffect(() => {
    // Only clear if we're navigating TO home FROM another tab (not on initial load)
    if (activeTab === 'home' && prevActiveTab.current !== 'home' && prevActiveTab.current !== undefined && currentUser) {
      clearSelectedModels()
    }
    prevActiveTab.current = activeTab
  }, [activeTab, currentUser, clearSelectedModels])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Toggle VR mode with 'V' key
      if (e.key && typeof e.key === 'string' && e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.metaKey) {
        setVrMode(!vrMode)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [vrMode, setVrMode])

  // Handle prompt submission
  const handlePromptSubmit = async () => {
    if (!currentPrompt.trim() || selectedModels.length === 0) {
      console.log('[handlePromptSubmit] Skipping - no prompt or no models selected')
      return
    }
    
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

    setIsLoading(true)
    clearResponses()
    clearRAGDebugData() // Clear previous debug data

    try {

    // Detect category and determine if web search is needed using Gemini 2.5 Flash Lite
    // This is the FIRST step - Gemini 2.5 Flash Lite determines if a query is needed
    let category = 'General Knowledge/Other'
    let needsSearch = false
    let detectionResult = null // Declare outside try block so it's accessible later
    let categoryDetectionTokens = null // Store tokens from category detection - declared outside try block
    try {
      detectionResult = await detectCategory(currentPrompt)
      category = detectionResult.category || 'General Knowledge/Other'
      needsSearch = detectionResult.needsSearch || false
      categoryDetectionTokens = detectionResult.tokens || null // Store tokens from category detection
      console.log('[Category Detection] Tokens received:', categoryDetectionTokens)
      
      // Store full detection data for display in the category detection window
      if (detectionResult) {
        setCategoryDetectionData({
          prompt: detectionResult.prompt || '',
          response: detectionResult.rawResponse || '',
          category: detectionResult.category || category,
          needsSearch: detectionResult.needsSearch !== undefined ? detectionResult.needsSearch : needsSearch,
          recommendedModelType: detectionResult.recommendedModelType || 'versatile'
        })
        setShowCategoryDetectionWindow(true)
      }
      
      // Store raw response for display in the temporary window (backward compatibility)
      if (detectionResult?.rawResponse) {
        setGpt4oMiniResponse(detectionResult.rawResponse)
      }
      
      console.log('[Category Detection] Gemini 2.5 Flash Lite determined:', { category, needsSearch })
      console.log('[Category Detection] Query needed:', needsSearch ? 'YES - Will use RAG pipeline with Serper' : 'NO - Will use direct LLM calls')
    } catch (error) {
      console.error('[Category Detection] Error:', error)
      category = 'General Knowledge/Other'
      needsSearch = false
      detectionResult = null // Set to null if detection fails
    }
    setCurrentCategory(category)
    setCategory(Date.now().toString(), category)

    let responses = []
    let summary = null
    let ragData = null // Store RAG data for token collection

    // If web search is needed (needsSearch === true), use RAG pipeline
    // The RAG pipeline will perform Serper query → Refiner → Council → Judge
    if (needsSearch) {
      console.log('[RAG Pipeline] needsSearch=true, using RAG pipeline with Serper query')
      setIsSearchingWeb(true) // Show "Searching the web..." indicator
      try {
        const userId = currentUser?.id || null
        console.log('[handlePromptSubmit] RAG Pipeline - Models to use:', modelsToUse)
        const ragResponse = await axios.post('http://localhost:3001/api/rag', {
          query: currentPrompt,
          selectedModels: modelsToUse,
          userId: userId
        })

        ragData = ragResponse.data

        // Track query count (1 query per RAG pipeline call)
        setQueryCount(1)

        // Log search results for debugging
        console.log('[RAG Pipeline] Search results received:', ragData.search_results?.length || 0)
        console.log('[RAG Pipeline] Refined data points:', ragData.refined_data?.data_points?.length || 0)
        console.log('[RAG Pipeline] Facts with citations:', ragData.refined_data?.facts_with_citations?.length || 0)
        console.log('[RAG Pipeline] Debug data present:', !!ragData.debug_data)
        console.log('[RAG Pipeline] Debug data keys:', ragData.debug_data ? Object.keys(ragData.debug_data) : 'none')
        
        // Log refiner tokens from backend
        console.log('[RAG Pipeline] Refiner tokens from backend:', {
          hasRefinerTokens: !!ragData.refiner_tokens,
          refinerTokens: ragData.refiner_tokens,
          hasJudgeFinalizationTokens: !!ragData.judge_finalization_tokens,
          judgeFinalizationTokens: ragData.judge_finalization_tokens
        })
        
        if (!ragData.search_results || ragData.search_results.length === 0) {
          console.warn('[RAG Pipeline] WARNING: No search results returned from Serper!')
        }

        // Store comprehensive debug data for display
        const debugDataToStore = {
          categoryDetection: detectionResult ? {
            prompt: detectionResult.prompt || '[Category Detection Prompt]',
            response: detectionResult.rawResponse || 'No response',
            category: detectionResult.category || category,
            needsSearch: detectionResult.needsSearch !== undefined ? detectionResult.needsSearch : needsSearch
          } : {
            prompt: '[Category Detection Prompt]',
            response: 'No response - detection failed',
            category: category,
            needsSearch: needsSearch
          },
          ...ragData.debug_data
        }
        
        console.log('[RAG Pipeline] Storing debug data:', {
          hasSearch: !!debugDataToStore.search,
          hasRefiner: !!debugDataToStore.refiner,
          hasCouncil: !!debugDataToStore.council,
          hasJudge: !!debugDataToStore.judgeFinalization,
          searchResultsCount: debugDataToStore.search?.results?.length || 0,
          refinerFactsCount: debugDataToStore.refiner?.primary?.facts_with_citations?.length || 0,
          councilCount: debugDataToStore.council?.length || 0
        })
        
        console.log('[RAG Pipeline] Full debug data structure:', JSON.stringify(debugDataToStore, null, 2).substring(0, 1000))
        
        setRAGDebugData(debugDataToStore)
        console.log('[RAG Pipeline] Debug data stored in state')

        // Add council responses
        ragData.council_responses.forEach((councilResponse) => {
          if (!councilResponse.error && councilResponse.response) {
            const actualModel = councilResponse.actual_model_name || councilResponse.model_name
            const originalModel = councilResponse.original_model_name || councilResponse.model_name
            
            console.log(`[RAG Pipeline] Model verification for ${councilResponse.model_name}:`)
            console.log(`  - User Selected: ${originalModel}`)
            console.log(`  - API Called: ${actualModel}`)
            console.log(`  - Mapping: ${originalModel === actualModel ? 'NONE (passed through as-is)' : `${originalModel} → ${actualModel}`}`)
            
            // Ensure response is a string - handle objects and arrays
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
              // Try to extract text from object
              responseText = councilResponse.response.text || councilResponse.response.content || councilResponse.response.message || JSON.stringify(councilResponse.response)
            } else {
              responseText = String(councilResponse.response || '')
            }
            
            responses.push({
              id: `${councilResponse.model_name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              modelName: councilResponse.model_name, // User-friendly name
              actualModelName: actualModel, // Actual API model name
              originalModelName: originalModel, // Original user selection
              text: responseText,
              error: false,
              tokens: councilResponse.tokens || null, // Token information from RAG pipeline
            })
          }
        })

        // Set judge analysis as summary (format as text for SummaryWindow)
        // Only set summary if judge_analysis exists AND we have 2+ models
        if (ragData.judge_analysis && modelsToUse.length >= 2) {
          const judge = ragData.judge_analysis
          let summaryText = ''
          
          // Consensus score at the top
          if (judge.consensus !== null && judge.consensus !== undefined) {
            summaryText += `CONSENSUS: ${judge.consensus}%\n\n`
          }
          
          // Summary section
          if (judge.summary) {
            summaryText += `SUMMARY:\n${judge.summary}\n\n`
          }
          
          // Agreements section
          if (judge.agreements && judge.agreements.length > 0) {
            summaryText += `AGREEMENTS:\n${judge.agreements.map(a => `• ${a}`).join('\n')}\n\n`
          } else {
            summaryText += `AGREEMENTS:\nNone identified.\n\n`
          }
          
          // Disagreements section
          if (judge.disagreements && judge.disagreements.length > 0) {
            summaryText += `DISAGREEMENTS:\n${judge.disagreements.map(d => `• ${d}`).join('\n')}`
          } else {
            summaryText += `DISAGREEMENTS:\nNone identified.`
          }
          
          summary = {
            text: summaryText || judge.summary || 'No summary available',
            summary: judge.summary,
            consensus: judge.consensus,
            agreements: judge.agreements || [],
            disagreements: judge.disagreements || []
          }
        } else if (modelsToUse.length === 1) {
          // Explicitly set no summary message when only 1 model is used
          summary = {
            text: 'No summary since there is only one model response.',
            summary: null,
            agreements: [],
            disagreements: [],
            singleModel: true
          }
        }

        console.log(`[RAG Pipeline] Received ${responses.length} council responses`)
        setIsSearchingWeb(false) // Clear searching indicator when RAG completes successfully
      } catch (ragError) {
        console.error('[RAG Pipeline] Error:', ragError)
        const errorDetails = {
          message: ragError.message,
          response: ragError.response?.data,
          status: ragError.response?.status,
          statusText: ragError.response?.statusText,
          config: {
            url: ragError.config?.url,
            method: ragError.config?.method,
            data: ragError.config?.data
          }
        }
        console.error('[RAG Pipeline] Error details:', JSON.stringify(errorDetails, null, 2))
        console.error('[RAG Pipeline] Full error object:', ragError)
        
        // If it's a subscription error (403), don't fall back to direct LLM calls
        // They will also fail with the same error
        if (ragError.response?.status === 403 || ragError.response?.data?.subscriptionRequired) {
          console.log('[RAG Pipeline] Subscription required - not falling back to direct LLM calls')
          // Clear any partial responses from failed RAG attempt
          responses = []
          summary = null
          setIsSearchingWeb(false)
          // Re-throw the error so it's caught by the outer try-catch and handled properly
          throw ragError
        }
        
        // Clear any partial responses from failed RAG attempt
        responses = []
        summary = null
        // Fallback to direct LLM calls if RAG fails (only for non-subscription errors)
        console.log('[RAG Pipeline] Falling back to direct LLM calls')
        needsSearch = false // Set to false so we use direct LLM calls
        setIsSearchingWeb(false) // Clear searching indicator when RAG fails
      }
    }

    // If no search needed (needsSearch === false) OR RAG pipeline failed (responses.length === 0), use direct LLM calls
    // No Serper query will be made - models use their training data only
    if (!needsSearch || (needsSearch && responses.length === 0)) {
      // Reset query count if no search was performed
      setQueryCount(0)
      console.log('[Direct LLM] needsSearch=false or RAG failed, using direct LLM calls (no Serper query)')
      console.log('[Direct LLM] Selected models:', modelsToUse)
      
      const responsePromises = modelsToUse.map(async (modelId) => {
        const firstDashIndex = modelId.indexOf('-')
        if (firstDashIndex === -1) {
          console.error(`[Direct LLM] Invalid modelId format: ${modelId}`)
        return {
          id: `${modelId}-${Date.now()}`,
          modelName: modelId,
            text: `Error: Invalid model ID format`,
            error: true,
          }
        }
        
        const providerKey = modelId.substring(0, firstDashIndex)
        const model = modelId.substring(firstDashIndex + 1)
        
        try {
          const userId = currentUser?.id || null
          const llmResponse = await callLLM(providerKey, model, currentPrompt, userId)
          
          // Handle both old format (string) and new format (object with model info)
          const responseText = typeof llmResponse === 'string' ? llmResponse : llmResponse.text
          const actualModel = typeof llmResponse === 'object' ? llmResponse.model : modelId
          const originalModel = typeof llmResponse === 'object' ? llmResponse.originalModel : modelId
          
          console.log(`[Direct LLM] Model verification for ${modelId}:`)
          console.log(`  - User Selected: ${originalModel}`)
          console.log(`  - API Called: ${actualModel}`)
          console.log(`  - Mapping: ${originalModel === actualModel ? 'NONE (passed through as-is)' : `${originalModel} → ${actualModel}`}`)
          
          return {
            id: `${modelId}-${Date.now()}`,
            modelName: modelId, // Keep user-friendly name for display
            actualModelName: actualModel, // Store actual API model name
            originalModelName: originalModel, // Store original user selection
            text: responseText,
            error: false,
            tokens: typeof llmResponse === 'object' ? llmResponse.tokens : null, // Token information
          }
      } catch (error) {
          console.error(`[Direct LLM] Error calling ${modelId}:`, error)
        return {
          id: `${modelId}-${Date.now()}`,
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
    }

    // Add all responses to the store
    responses.forEach((response) => {
      console.log(`[Response] Adding response from ${response.modelName}, error: ${response.error}`)
      addResponse(response)
    })

    // Helper function to collect all token data
    const collectTokenData = (directJudgeTokens = null) => {
      const tokenData = []
      
      // Add category detection tokens (Gemini 2.5 Flash Lite - always called first)
      if (categoryDetectionTokens) {
        console.log('[Token Collection] Adding category detection tokens:', categoryDetectionTokens)
        tokenData.push({
          modelName: 'gemini-2.5-flash-lite (Category Detection)',
          tokens: categoryDetectionTokens
        })
      }
      
      // Add council response tokens
      responses.forEach(r => {
        if (r.tokens) {
          tokenData.push({
            modelName: r.modelName,
            tokens: r.tokens
          })
        }
      })
      
      // Add refiner and judge tokens from RAG pipeline (if RAG was used)
      if (ragData) {
        console.log('[Token Collection] RAG data present, checking refiner tokens:', {
          hasRefinerTokens: !!ragData.refiner_tokens,
          refinerTokensKeys: ragData.refiner_tokens ? Object.keys(ragData.refiner_tokens) : [],
          primary: ragData.refiner_tokens?.primary,
          backup: ragData.refiner_tokens?.backup,
          judge_selection: ragData.refiner_tokens?.judge_selection,
          judge_finalization: ragData.judge_finalization_tokens
        })
        
        // Primary refiner (Gemini)
        if (ragData.refiner_tokens?.primary) {
          console.log('[Token Collection] Adding primary refiner tokens:', ragData.refiner_tokens.primary)
          tokenData.push({
            modelName: 'gemini-2.5-flash-lite (Refiner)',
            tokens: ragData.refiner_tokens.primary
          })
        } else {
          console.warn('[Token Collection] ⚠️ Primary refiner tokens missing from ragData.refiner_tokens')
        }
        
        // Backup refiner (GPT-4o-mini)
        if (ragData.refiner_tokens?.backup) {
          console.log('[Token Collection] Adding backup refiner tokens:', ragData.refiner_tokens.backup)
          tokenData.push({
            modelName: 'gpt-4o-mini (Refiner)',
            tokens: ragData.refiner_tokens.backup
          })
        }
        
        // Judge refiner selection (xAI/Grok)
        if (ragData.refiner_tokens?.judge_selection) {
          console.log('[Token Collection] Adding judge refiner selection tokens:', ragData.refiner_tokens.judge_selection)
          tokenData.push({
            modelName: 'grok-4-1-fast-reasoning (Judge - Refiner Selection)',
            tokens: ragData.refiner_tokens.judge_selection
          })
        }
        
        // Judge finalization (xAI/Grok) from RAG pipeline
        if (ragData.judge_finalization_tokens) {
          console.log('[Token Collection] Adding judge finalization tokens:', ragData.judge_finalization_tokens)
          tokenData.push({
            modelName: 'grok-4-1-fast-reasoning (Judge - Finalization)',
            tokens: ragData.judge_finalization_tokens
          })
        }
      } else {
        console.log('[Token Collection] No RAG data present, skipping refiner/judge tokens')
      }
      
      // Add judge tokens from direct LLM path (when RAG wasn't used but summary was generated)
      if (directJudgeTokens) {
        tokenData.push(directJudgeTokens)
      }
      
      return tokenData
    }
    
    // Collect initial token data (before summary generation)
    let tokenData = collectTokenData()
    
    // Show token usage window with initial data
    if (tokenData.length > 0) {
      setTokenUsageData(tokenData)
      setShowTokenUsageWindow(true)
      setShowCostBreakdownWindow(true)
    }
    
    // Set summary if available (from RAG pipeline)
    // When summary appears, ensure it's visible (not minimized) so user sees it first
    if (summary) {
      setSummary(summary)
      // If summary is from multiple models, make sure it's visible
      if (!summary.singleModel) {
        const setSummaryMinimized = useStore.getState().setSummaryMinimized
        if (setSummaryMinimized) {
          setSummaryMinimized(false) // Show summary window
        }
      }
    }

    // Stop showing "fetching responses" loading, will show "working on summary" if needed
    // Note: setIsLoading(false) is now in the finally block to ensure it's always called

    // Track prompt submission (one per submission, regardless of models)
    if (currentUser?.id) {
      try {
        console.log('[Prompt Tracking] Tracking prompt for user:', currentUser.id)
        const response = await axios.post('http://localhost:3001/api/stats/prompt', {
          userId: currentUser.id,
          promptText: currentPrompt,
          category: category,
        })
        console.log('[Prompt Tracking] Prompt tracked successfully:', response.data)
        // Trigger stats refresh after tracking prompt
        useStore.getState().triggerStatsRefresh()
      } catch (error) {
        console.error('[Prompt Tracking] Error tracking prompt:', error)
        console.error('[Prompt Tracking] Error details:', error.response?.data || error.message)
      }
    } else {
      console.warn('[Prompt Tracking] No user ID available, skipping prompt tracking')
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

    // Generate summary using Grok if we have valid responses (API key is in backend)
    // Skip if RAG pipeline already provided a summary
    // Only generate summary if 2+ models were used (no point summarizing a single response)
    const validResponses = responses.filter((r) => !r.error && r.text)
    console.log('[Summary] Valid responses:', validResponses.length)
    
    // If only 1 model was used and no summary was set, set the no summary message
    if (validResponses.length === 1 && !summary) {
      summary = {
        text: 'No summary since there is only one model response.',
        summary: null,
        agreements: [],
        disagreements: [],
        singleModel: true
      }
    } else if (validResponses.length >= 2 && !summary) {
      console.log('[Summary] Starting Grok summarization (2+ models detected)...')
      setIsGeneratingSummary(true)
      try {
        // Build the summary prompt (matches judge finalization prompt)
        const responsesText = validResponses
          .map((r) => `\n--- ${r.modelName}'s response ---\n${r.text}\n`)
          .join('')
        
        const summaryPrompt =  `You are an expert judge analyzing multiple AI model responses. Your task is to:

        1. Calculate a consensus score (0-100%) based on how much the models agree
        2. Provide a summary of the council's responses
        3. Identify where the models agree
        4. Identify where the models disagree or contradict each other
        
        Original User Query: "${currentPrompt}"
        
        Council Model Responses:
        ${responsesText}
        
        Please analyze these responses and provide ONLY these four sections in this exact format:
        - **Consensus of Agreement**: [A single number from 0-100 representing the percentage of agreement between all models]
        - **SUMMARY**: A concise summary of what the council models collectively determined
        - **AGREEMENTS**: List specific points where models agree (bullet points, one per line starting with - or •)
        - **DISAGREEMENTS**: List specific points where models disagree or contradict (bullet points, one per line starting with - or •). If there are no disagreements, write "None identified."
        
        Format your response clearly with these four sections only.`

              // Use Grok's best summarizing model (grok-4-1-fast-reasoning for reasoning/summarization)
              const grokModel = 'grok-4-1-fast-reasoning' // Best for summarization and reasoning tasks
              console.log('[Summary] Calling Grok with model:', grokModel)
              const userId = currentUser?.id || null
              // Pass isSummary=true to indicate this is a summary call, not a user prompt
              const summaryResponse = await callLLM('xai', grokModel, summaryPrompt, userId, true)
              const rawSummaryText = typeof summaryResponse === 'string' ? summaryResponse : summaryResponse.text
              const summaryTokens = typeof summaryResponse === 'object' ? summaryResponse.tokens : null
        console.log('[Summary] Grok response received, length:', rawSummaryText?.length)
        
        // Parse the response to extract sections (Consensus, Summary, Agreements, Disagreements)
        // More flexible consensus matching - handles various formats like "Consensus: 85", "**Consensus**: 85%", "[85]", etc.
        const consensusMatch = rawSummaryText.match(/(?:Consensus|consensus)[:\-]?\s*(?:\[|\*\*)?\s*(\d+)\s*(?:%|]|\*\*)?/i)
        const summaryMatch = rawSummaryText.match(/(?:Summary)[:\-]?\s*(.+?)(?=\n\n|\n(?:Agreements|Disagreements|Consensus)|$)/is)
        const agreementsMatch = rawSummaryText.match(/(?:Agreements)[:\-]?\s*(.+?)(?=\n\n|\n(?:Disagreements|Summary|Consensus)|$)/is)
        const disagreementsMatch = rawSummaryText.match(/(?:Disagreements)[:\-]?\s*(.+?)(?=\n\n|\n(?:Summary|Agreements|Consensus)|$)/is)
        
        // Extract consensus score (0-100)
        let consensus = null
        if (consensusMatch) {
          const score = parseInt(consensusMatch[1], 10)
          consensus = Math.max(0, Math.min(100, score)) // Clamp between 0-100
          console.log(`[Summary] Extracted consensus score: ${consensus}%`)
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
              console.log(`[Summary] Extracted consensus score (fallback pattern): ${consensus}%`)
              break
            }
          }
          
          if (!consensus) {
            console.log(`[Summary] Warning: Could not extract consensus score from response. Content preview: ${rawSummaryText.substring(0, 500)}`)
          }
        }
        
        // Extract summary
        let parsedSummary = summaryMatch ? summaryMatch[1].trim() : rawSummaryText.split(/\n\n/)[0].trim()
        
        // Extract agreements and disagreements as arrays
        const agreements = agreementsMatch 
          ? agreementsMatch[1].split('\n').filter(l => l.trim() && !l.match(/^[-•*]\s*$/)).map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(l => l && !l.toLowerCase().includes('none identified'))
          : []
        
        const disagreements = disagreementsMatch 
          ? disagreementsMatch[1].split('\n').filter(l => l.trim() && !l.match(/^[-•*]\s*$/)).map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(l => l && !l.toLowerCase().includes('none identified'))
          : []
        
        // Format the summary text
        let formattedSummaryText = ''
        
        // Consensus score at the top
        if (consensus !== null && consensus !== undefined) {
          formattedSummaryText += `CONSENSUS: ${consensus}%\n\n`
        }
        
        // Summary section
        if (parsedSummary) {
          formattedSummaryText += `SUMMARY:\n${parsedSummary}\n\n`
        }
        
        // Agreements section
        if (agreements && agreements.length > 0) {
          formattedSummaryText += `AGREEMENTS:\n${agreements.map(a => `• ${a}`).join('\n')}\n\n`
        } else {
          formattedSummaryText += `AGREEMENTS:\nNone identified.\n\n`
        }
        
        // Disagreements section
        if (disagreements && disagreements.length > 0) {
          formattedSummaryText += `DISAGREEMENTS:\n${disagreements.map(d => `• ${d}`).join('\n')}`
        } else {
          formattedSummaryText += `DISAGREEMENTS:\nNone identified.`
        }
        
        // Collect judge tokens and update token data
        if (summaryTokens) {
          const directJudgeTokens = {
            modelName: 'grok-4-1-fast-reasoning (Judge - Finalization)',
            tokens: summaryTokens
          }
          // Re-collect token data including the judge tokens
          tokenData = collectTokenData(directJudgeTokens)
          // Update token usage window with new data
          if (tokenData.length > 0) {
            setTokenUsageData(tokenData)
            setShowTokenUsageWindow(true)
          }
        }
        
        setSummary({
          text: formattedSummaryText || rawSummaryText,
          summary: parsedSummary,
          consensus: consensus,
          agreements: agreements,
          disagreements: disagreements,
          timestamp: Date.now(),
        })
        // Ensure summary window is visible when it first appears
        const setSummaryMinimized = useStore.getState().setSummaryMinimized
        if (setSummaryMinimized) {
          setSummaryMinimized(false) // Show summary window
        }
        console.log('[Summary] Summary set in store')
      } catch (error) {
        console.error('[Summary] Error generating summary with Grok:', error)
        console.error('[Summary] Error details:', error.message, error.response?.data)
        // Show a user-friendly error message
        setSummary({
          text: `Error generating summary: ${error.message}. Please check your Grok API key and try again.`,
          timestamp: Date.now(),
          error: true,
        })
      } finally {
        setIsGeneratingSummary(false)
      }
    } else if (validResponses.length === 1) {
      // Only 1 model - ensure no summary message is set
      setIsGeneratingSummary(false)
      if (!summary) {
        setSummary({
          text: 'No summary since there is only one model response.',
          summary: null,
          agreements: [],
          disagreements: [],
          singleModel: true
        })
      }
    } else {
      setIsGeneratingSummary(false)
    }

    setCurrentPrompt('')
    } catch (error) {
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

  // Handle admin route separately - must be checked before other renders
  // This early return prevents the normal app from rendering
  // AdminView will handle login if user is not logged in
  if (isAdminRoute) {
    console.log('[App] ✅ Admin route detected!', { 
      path: window.location.pathname, 
      currentUser: currentUser?.id,
      isAdminRoute 
    })
    
    // Show admin view - it will handle login modal if not logged in, and check admin status
    console.log('[App] ✅ Rendering AdminView')
    return (
      <div style={{ width: '100vw', height: '100vh', background: 'rgba(0, 0, 0, 0.95)' }}>
        <AdminView />
      </div>
    )
  }
  
  console.log('[App] ❌ Not admin route, path:', window.location.pathname, 'isAdminRoute:', isAdminRoute)

  // Show auth view if not logged in (regular routes)
  if (!currentUser) {
    return <AuthView />
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <AnimatePresence>
        {showWelcome && <WelcomeScreen key="welcome" />}
      </AnimatePresence>

      {!showWelcome && (
        <>
          <NavigationBar />
          {/* Usage Indicator - Shows on all pages */}
          {!isAdminRoute && <UsageIndicator />}
          <BackgroundScene />

          {/* Loading Indicator */}
          {(isLoading || isGeneratingSummary) && (
            <div
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 200,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.9)',
                  border: '1px solid rgba(0, 255, 255, 0.3)',
                  borderRadius: '12px',
                  padding: '30px 50px',
                }}
              >
                <div
                  style={{
                    width: '50px',
                    height: '50px',
                    border: '3px solid rgba(0, 255, 255, 0.3)',
                    borderTop: '3px solid #00FFFF',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 20px',
                  }}
                />
                <p
                  style={{
                    color: '#ffffff',
                    fontSize: '1.1rem',
                    background: 'linear-gradient(90deg, #00FFFF, #00FF00)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {isGeneratingSummary 
                    ? 'Working on summary...' 
                    : `Fetching responses from ${selectedModels.length} model(s)...`}
                </p>
              </div>
            </div>
          )}

                {/* Main Content Area - Show based on active tab */}
                {/* Note: AdminView is handled in early return above, so this should never render AdminView */}
                {activeTab === 'home' && <MainView onClearAll={clearAllWindows} />}
                {activeTab === 'leaderboard' && <LeaderboardView />}
                {activeTab === 'settings' && <SettingsView />}
                {activeTab === 'statistics' && <StatisticsView />}

                {/* Response Comparison - Only show on home tab (not on admin route) */}
                {!isAdminRoute && activeTab === 'home' && <ResponseComparison />}

                {/* Summary Window - Shows on all tabs except admin */}
                {!isAdminRoute && <SummaryWindow />}
              {!isAdminRoute && ragDebugData && (
                <>
                  {showFactsWindow && (
                    <FactsAndSourcesWindow
                      debugData={ragDebugData}
                      onClose={() => setShowFactsWindow(false)}
                    />
                  )}
                </>
              )}
              {/* Token Usage Window */}
              <TokenUsageWindow
                isOpen={showTokenUsageWindow}
                onClose={() => setShowTokenUsageWindow(false)}
                tokenData={tokenUsageData}
              />
              <CostBreakdownWindow
                isOpen={showCostBreakdownWindow}
                onClose={() => setShowCostBreakdownWindow(false)}
                tokenData={tokenUsageData}
                queryCount={queryCount}
              />
              {/* Category Detection Window */}
              <CategoryDetectionWindow
                isOpen={showCategoryDetectionWindow}
                onClose={() => setShowCategoryDetectionWindow(false)}
                detectionData={categoryDetectionData}
              />
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

