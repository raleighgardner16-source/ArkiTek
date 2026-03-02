import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface Stats {
  totalPrompts: number
  promptsByModel: Record<string, number>
  promptsByCategory: Record<string, number>
}

export interface StoreState {
  // Welcome screen
  showWelcome: boolean
  setShowWelcome: (show: boolean) => void

  // API Keys
  apiKeys: Record<string, string>
  setApiKey: (provider: string, key: string) => void

  // Selected models
  selectedModels: string[]
  setSelectedModels: (models: string[]) => void
  clearSelectedModels: () => void

  // Auto Smart provider preferences (which providers have Auto Smart enabled)
  autoSmartProviders: Record<string, any>
  setAutoSmartProviders: (providersOrFn: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void
  clearAutoSmartProviders: () => void

  // Current prompt
  currentPrompt: string
  setCurrentPrompt: (prompt: string) => void

  // Last submitted prompt and category (for voting button - persists until new prompt is sent)
  lastSubmittedPrompt: string
  lastSubmittedCategory: string
  setLastSubmittedPrompt: (prompt: string) => void
  setLastSubmittedCategory: (category: string) => void
  clearLastSubmittedPrompt: () => void

  // Responses
  responses: any[]
  addResponse: (response: any) => void
  updateResponse: (responseId: string, updates: any) => void
  removeResponse: (responseId: string) => void
  clearResponses: () => void

  // Favorite model pick (per prompt session)
  currentPromptFavorite: string | null
  setCurrentPromptFavorite: (responseId: string | null) => void
  currentPromptSessionId: string | null
  setCurrentPromptSessionId: (id: string | null) => void

  // Categories
  categories: Record<string, string>
  setCategory: (promptId: string, category: string) => void

  // Stats
  stats: Stats
  updateStats: (prompt: string, models: string[], category: string) => void

  // Active tab
  activeTab: string
  setActiveTab: (tab: string) => void

  // Submission trigger
  shouldSubmit: boolean
  triggerSubmit: () => void
  clearSubmit: () => void
  shouldGenerateSummary: boolean
  triggerGenerateSummary: () => void
  clearGenerateSummary: () => void

  // Summary
  summary: any
  setSummary: (summaryOrFn: any) => void
  appendSummaryText: (token: string) => void
  clearSummary: () => void

  // RAG Debug data (temporary)
  ragDebugData: any
  setRAGDebugData: (data: any) => void
  clearRAGDebugData: () => void

  // Search sources (from RAG pipeline)
  searchSources: any
  setSearchSources: (sources: any) => void
  clearSearchSources: () => void

  // Pipeline debug window visibility (separate from data so closing it doesn't affect facts window)
  showPipelineDebugWindow: boolean
  setShowPipelineDebugWindow: (show: boolean) => void

  // GPT-4o-mini response for category detection display
  geminiDetectionResponse: any
  setGeminiDetectionResponse: (response: any) => void
  clearGeminiDetectionResponse: () => void
  isSummaryMinimized: boolean
  setSummaryMinimized: (minimized: boolean) => void

  // Web search loading state
  isSearchingWeb: boolean
  setIsSearchingWeb: (searching: boolean) => void

  // Full token data (all models including refiner, category detection, judge)
  tokenData: any[]
  setTokenData: (data: any[]) => void
  appendTokenData: (entry: any) => void
  mergeTokenData: (modelName: string, newTokens: any, isJudge?: boolean) => void
  clearTokenData: () => void

  // Search query count (Serper queries for this prompt)
  queryCount: number
  setQueryCount: (count: number) => void
  incrementQueryCount: () => void

  // Facts window visibility
  showFactsWindow: boolean
  setShowFactsWindow: (show: boolean) => void

  // Auth token (JWT)
  authToken: string | null
  setAuthToken: (token: string | null) => void

  // Current user
  currentUser: any
  setCurrentUser: (user: any) => void
  clearCurrentUser: () => void

  // Stats refresh trigger
  statsRefreshTrigger: number
  triggerStatsRefresh: () => void

  // Leaderboard/prompt-feed refresh trigger (used to sync deletions across views)
  leaderboardRefreshTrigger: number
  triggerLeaderboardRefresh: () => void

  // History refresh trigger (refetch when follow-ups are added to a continued conversation)
  historyRefreshTrigger: number
  triggerHistoryRefresh: () => void

  // Winning prompts from Prompt Feed Favorites (shared across views for badge display)
  winningPrompts: any[]
  setWinningPrompts: (prompts: any[]) => void

  // Notification badge count for profile tab (social interactions)
  notificationCount: number
  setNotificationCount: (count: number) => void

  // Unread message count for messaging badge
  unreadMessageCount: number
  setUnreadMessageCount: (count: number) => void

  // Navigation bar expanded state
  isNavExpanded: boolean
  setNavExpanded: (expanded: boolean) => void

  // Active history entry ID (tracks the current conversation for live updates)
  currentHistoryId: string | null
  setCurrentHistoryId: (id: string | null) => void
  clearCurrentHistoryId: () => void

  // Council column follow-up conversation history (per response) — used when continuing from history
  councilColumnConvoHistory: Record<string, any[]>
  setCouncilColumnConvoHistory: (fnOrObj: Record<string, any[]> | ((prev: Record<string, any[]>) => Record<string, any[]>)) => void

  // Council responses panel visibility
  showCouncilPanel: boolean
  setShowCouncilPanel: (show: boolean) => void
  toggleCouncilPanel: () => void

  // Viewing another user's profile (null = own profile)
  viewingProfile: { userId: string; username: string } | null
  setViewingProfile: (profile: { userId: string; username: string } | null) => void
  clearViewingProfile: () => void

  // Prompt mode: 'general' or 'debate'
  promptMode: string
  setPromptMode: (mode: string) => void

  // Debate mode role assignments: { [modelId]: roleKey }
  modelRoles: Record<string, string>
  setModelRole: (modelId: string, roleKey: string) => void
  clearModelRoles: () => void

  // Theme: 'light' or 'dark'
  theme: string
  setTheme: (theme: string) => void
  toggleTheme: () => void
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Welcome screen
      showWelcome: false, // Temporarily disabled to debug black screen
      setShowWelcome: (show: boolean) => set({ showWelcome: show }),

      // API Keys
      apiKeys: {},
      setApiKey: (provider: string, key: string) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        })),

      // Selected models
      selectedModels: [],
      setSelectedModels: (models: string[]) => set({ selectedModels: models }),
      clearSelectedModels: () => set({ selectedModels: [] }),

      // Auto Smart provider preferences (which providers have Auto Smart enabled)
      autoSmartProviders: {},
      setAutoSmartProviders: (providersOrFn: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => {
        if (typeof providersOrFn === 'function') {
          set((state) => ({ autoSmartProviders: providersOrFn(state.autoSmartProviders) }))
        } else {
          set({ autoSmartProviders: providersOrFn })
        }
      },
      clearAutoSmartProviders: () => set({ autoSmartProviders: {} }),

      // Current prompt
      currentPrompt: '',
      setCurrentPrompt: (prompt: string) => set({ currentPrompt: prompt }),
      
      // Last submitted prompt and category (for voting button - persists until new prompt is sent)
      lastSubmittedPrompt: '',
      lastSubmittedCategory: '',
      setLastSubmittedPrompt: (prompt: string) => set({ lastSubmittedPrompt: prompt }),
      setLastSubmittedCategory: (category: string) => set({ lastSubmittedCategory: category }),
      // Clear both together - only called when truly needed (e.g., user explicitly clears all)
      clearLastSubmittedPrompt: () => set({ lastSubmittedPrompt: '', lastSubmittedCategory: '' }),

      // Responses
      responses: [],
      addResponse: (response: any) =>
        set((state) => ({
          responses: [...state.responses, response],
        })),
      updateResponse: (responseId: string, updates: any) =>
        set((state) => ({
          responses: state.responses.map((res: any) =>
            res.id === responseId ? { ...res, ...updates } : res
          ),
        })),
      removeResponse: (responseId: string) =>
        set((state) => ({
          responses: state.responses.filter((res: any) => res.id !== responseId),
        })),
      clearResponses: () => {
        // Batch into a single set() so subscribers see one atomic update —
        // prevents intermediate renders where e.g. responses is [] but summary
        // still holds its old value (which kept hasActiveConversation true and
        // hid the mode-toggle buttons after "New Chat").
        set({
          responses: [],
          summary: null,
          geminiDetectionResponse: null,
          ragDebugData: null,
          searchSources: null,
          tokenData: [],
          queryCount: 0,
          showFactsWindow: true,
          showPipelineDebugWindow: true,
          currentHistoryId: null,
          councilColumnConvoHistory: {},
          currentPromptFavorite: null,
          currentPromptSessionId: Date.now().toString(),
        })
        // Note: lastSubmittedPrompt is NOT cleared here - it's managed by handlePromptSubmit
        // It will be set before clearResponses is called, so it persists for the voting button
      },

      // Favorite model pick (per prompt session)
      currentPromptFavorite: null,
      setCurrentPromptFavorite: (responseId: string | null) => set({ currentPromptFavorite: responseId }),
      currentPromptSessionId: null,
      setCurrentPromptSessionId: (id: string | null) => set({ currentPromptSessionId: id }),

      // Categories
      categories: {},
      setCategory: (promptId: string, category: string) =>
        set((state) => ({
          categories: { ...state.categories, [promptId]: category },
        })),

      // Stats
      stats: {
        totalPrompts: 0,
        promptsByModel: {},
        promptsByCategory: {},
      },
      updateStats: (prompt: string, models: string[], category: string) => {
        const currentStats = get().stats
        const newStats: Stats = {
          totalPrompts: currentStats.totalPrompts + 1,
          promptsByModel: { ...currentStats.promptsByModel },
          promptsByCategory: { ...currentStats.promptsByCategory },
        }

        models.forEach((model) => {
          newStats.promptsByModel[model] =
            (newStats.promptsByModel[model] || 0) + 1
        })

        newStats.promptsByCategory[category] =
          (newStats.promptsByCategory[category] || 0) + 1

        set({ stats: newStats })
      },

      // Active tab
      activeTab: 'home',
      setActiveTab: (tab: string) => set({ activeTab: tab }),

      // Submission trigger
      shouldSubmit: false,
      triggerSubmit: () => set({ shouldSubmit: true }),
      clearSubmit: () => set({ shouldSubmit: false }),
      shouldGenerateSummary: false,
      triggerGenerateSummary: () => set({ shouldGenerateSummary: true }),
      clearGenerateSummary: () => set({ shouldGenerateSummary: false }),

      // Summary
      summary: null,
      setSummary: (summaryOrFn: any) => {
        if (typeof summaryOrFn === 'function') {
          set((state) => ({ summary: summaryOrFn(state.summary) }))
        } else {
          set({ summary: summaryOrFn })
        }
      },
      appendSummaryText: (token: string) => set((state) => {
        if (!state.summary) return {}
        return { summary: { ...state.summary, text: (state.summary.text || '') + token } }
      }),
      clearSummary: () => set({ summary: null }),
      
      // RAG Debug data (temporary)
      ragDebugData: null,
      setRAGDebugData: (data: any) => set({ ragDebugData: data }),
      clearRAGDebugData: () => set({ ragDebugData: null }),
      
      // Search sources (from RAG pipeline)
      searchSources: null,
      setSearchSources: (sources: any) => set({ searchSources: sources }),
      clearSearchSources: () => set({ searchSources: null }),
      
      // Pipeline debug window visibility (separate from data so closing it doesn't affect facts window)
      showPipelineDebugWindow: true,
      setShowPipelineDebugWindow: (show: boolean) => set({ showPipelineDebugWindow: show }),

      // GPT-4o-mini response for category detection display
      geminiDetectionResponse: null,
      setGeminiDetectionResponse: (response: any) => set({ geminiDetectionResponse: response }),
      clearGeminiDetectionResponse: () => set({ geminiDetectionResponse: null }),
      isSummaryMinimized: false,
      setSummaryMinimized: (minimized: boolean) => set({ isSummaryMinimized: minimized }),
      
      // Web search loading state
      isSearchingWeb: false,
      setIsSearchingWeb: (searching: boolean) => set({ isSearchingWeb: searching }),
      
      // Full token data (all models including refiner, category detection, judge)
      tokenData: [],
      setTokenData: (data: any[]) => set({ tokenData: data }),
      appendTokenData: (entry: any) => set((state) => ({ tokenData: [...state.tokenData, entry] })),
      // Merge follow-up token data into the existing entry for the same model
      // instead of creating a separate "(follow-up)" row
      mergeTokenData: (modelName: string, newTokens: any, isJudge: boolean = false) => set((state) => {
        const tokenData = [...state.tokenData]
        // Find the existing entry for this model (match by modelName or tokens.model)
        const idx = tokenData.findIndex((item: any) => {
          if (isJudge) return item.isJudge
          return item.modelName === modelName || item.tokens?.model === modelName
        })
        if (idx !== -1) {
          // Merge: add new tokens to existing entry
          const existing = { ...tokenData[idx] }
          existing.tokens = {
            ...existing.tokens,
            input: (existing.tokens?.input || 0) + (newTokens.input || 0),
            output: (existing.tokens?.output || 0) + (newTokens.output || 0),
            inputTokens: (existing.tokens?.inputTokens || 0) + (newTokens.input || 0),
            outputTokens: (existing.tokens?.outputTokens || 0) + (newTokens.output || 0),
            total: (existing.tokens?.total || 0) + (newTokens.total || 0),
          }
          tokenData[idx] = existing
          return { tokenData }
        }
        // Fallback: if no matching entry found, append as new (shouldn't happen normally)
        return { tokenData: [...state.tokenData, { modelName, tokens: newTokens, isJudge }] }
      }),
      clearTokenData: () => set({ tokenData: [] }),

      // Search query count (Serper queries for this prompt)
      queryCount: 0,
      setQueryCount: (count: number) => set({ queryCount: count }),
      incrementQueryCount: () => set((state) => ({ queryCount: state.queryCount + 1 })),

      // Facts window visibility
      showFactsWindow: true,
      setShowFactsWindow: (show: boolean) => set({ showFactsWindow: show }),

      // Auth token (JWT)
      authToken: null,
      setAuthToken: (token: string | null) => set({ authToken: token }),

      // Current user
      currentUser: null,
      setCurrentUser: (user: any) => set({ currentUser: user }),
      clearCurrentUser: () => set({ currentUser: null, authToken: null, selectedModels: [], autoSmartProviders: {} }),

      // Stats refresh trigger
      statsRefreshTrigger: 0,
      triggerStatsRefresh: () => set((state) => ({ statsRefreshTrigger: state.statsRefreshTrigger + 1 })),

      // Leaderboard/prompt-feed refresh trigger (used to sync deletions across views)
      leaderboardRefreshTrigger: 0,
      triggerLeaderboardRefresh: () => set((state) => ({ leaderboardRefreshTrigger: state.leaderboardRefreshTrigger + 1 })),

      // History refresh trigger (refetch when follow-ups are added to a continued conversation)
      historyRefreshTrigger: 0,
      triggerHistoryRefresh: () => set((state) => ({ historyRefreshTrigger: state.historyRefreshTrigger + 1 })),

      // Winning prompts from Prompt Feed Favorites (shared across views for badge display)
      winningPrompts: [],
      setWinningPrompts: (prompts: any[]) => set({ winningPrompts: prompts }),

      // Notification badge count for profile tab (social interactions)
      notificationCount: 0,
      setNotificationCount: (count: number) => set({ notificationCount: count }),

      // Unread message count for messaging badge
      unreadMessageCount: 0,
      setUnreadMessageCount: (count: number) => set({ unreadMessageCount: count }),

      // Navigation bar expanded state
      isNavExpanded: true,
      setNavExpanded: (expanded: boolean) => set({ isNavExpanded: expanded }),

      // Active history entry ID (tracks the current conversation for live updates)
      currentHistoryId: null,
      setCurrentHistoryId: (id: string | null) => set({ currentHistoryId: id }),
      clearCurrentHistoryId: () => set({ currentHistoryId: null }),

      // Council column follow-up conversation history (per response) — used when continuing from history
      councilColumnConvoHistory: {},
      setCouncilColumnConvoHistory: (fnOrObj: Record<string, any[]> | ((prev: Record<string, any[]>) => Record<string, any[]>)) =>
        set((state) => ({
          councilColumnConvoHistory: typeof fnOrObj === 'function'
            ? fnOrObj(state.councilColumnConvoHistory)
            : fnOrObj,
        })),

      // Council responses panel visibility
      showCouncilPanel: false,
      setShowCouncilPanel: (show: boolean) => set({ showCouncilPanel: show }),
      toggleCouncilPanel: () => set((state) => ({ showCouncilPanel: !state.showCouncilPanel })),

      // Viewing another user's profile (null = own profile)
      viewingProfile: null, // { userId, username }
      setViewingProfile: (profile: { userId: string; username: string } | null) => set({ viewingProfile: profile }),
      clearViewingProfile: () => set({ viewingProfile: null }),

      // Prompt mode: 'general' or 'debate'
      promptMode: 'general',
      setPromptMode: (mode: string) => set({ promptMode: mode }),

      // Debate mode role assignments: { [modelId]: roleKey }
      modelRoles: {},
      setModelRole: (modelId: string, roleKey: string) =>
        set((state) => ({
          modelRoles: { ...state.modelRoles, [modelId]: roleKey },
        })),
      clearModelRoles: () => set({ modelRoles: {} }),

      // Theme: 'light' or 'dark'
      theme: 'dark',
      setTheme: (theme: string) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'arktek-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist essential state — exclude large/transient data to prevent
      // localStorage bloat (5MB limit) and stale data across sessions
      partialize: (state) => ({
        authToken: state.authToken,
        currentUser: state.currentUser,
        theme: state.theme,
        activeTab: state.activeTab,
        apiKeys: state.apiKeys,
        selectedModels: state.selectedModels,
        autoSmartProviders: state.autoSmartProviders,
        promptMode: state.promptMode,
        modelRoles: state.modelRoles,
        isNavExpanded: state.isNavExpanded,
      }),
    }
  )
)
