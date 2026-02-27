import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const useStore = create(
  persist(
    (set, get) => ({
      // Welcome screen
      showWelcome: false, // Temporarily disabled to debug black screen
      setShowWelcome: (show) => set({ showWelcome: show }),

      // API Keys
      apiKeys: {},
      setApiKey: (provider, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        })),

      // Selected models
      selectedModels: [],
      setSelectedModels: (models) => set({ selectedModels: models }),
      clearSelectedModels: () => set({ selectedModels: [] }),

      // Auto Smart provider preferences (which providers have Auto Smart enabled)
      autoSmartProviders: {},
      setAutoSmartProviders: (providersOrFn) => {
        if (typeof providersOrFn === 'function') {
          set((state) => ({ autoSmartProviders: providersOrFn(state.autoSmartProviders) }))
        } else {
          set({ autoSmartProviders: providersOrFn })
        }
      },
      clearAutoSmartProviders: () => set({ autoSmartProviders: {} }),

      // Current prompt
      currentPrompt: '',
      setCurrentPrompt: (prompt) => set({ currentPrompt: prompt }),
      
      // Last submitted prompt and category (for voting button - persists until new prompt is sent)
      lastSubmittedPrompt: '',
      lastSubmittedCategory: '',
      setLastSubmittedPrompt: (prompt) => set({ lastSubmittedPrompt: prompt }),
      setLastSubmittedCategory: (category) => set({ lastSubmittedCategory: category }),
      // Clear both together - only called when truly needed (e.g., user explicitly clears all)
      clearLastSubmittedPrompt: () => set({ lastSubmittedPrompt: '', lastSubmittedCategory: '' }),

      // Responses
      responses: [],
      addResponse: (response) =>
        set((state) => ({
          responses: [...state.responses, response],
        })),
      updateResponse: (responseId, updates) =>
        set((state) => ({
          responses: state.responses.map((res) =>
            res.id === responseId ? { ...res, ...updates } : res
          ),
        })),
      removeResponse: (responseId) =>
        set((state) => ({
          responses: state.responses.filter((res) => res.id !== responseId),
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
        })
        // Note: lastSubmittedPrompt is NOT cleared here - it's managed by handlePromptSubmit
        // It will be set before clearResponses is called, so it persists for the voting button
      },

      // Ratings
      ratings: {},
      setRating: (responseId, rating) =>
        set((state) => ({
          ratings: { ...state.ratings, [responseId]: rating },
        })),

      // Categories
      categories: {},
      setCategory: (promptId, category) =>
        set((state) => ({
          categories: { ...state.categories, [promptId]: category },
        })),

      // Stats
      stats: {
        totalPrompts: 0,
        promptsByModel: {},
        promptsByCategory: {},
        totalRatings: 0,
        averageRating: 0,
      },
      updateStats: (prompt, models, category, ratings) => {
        const currentStats = get().stats
        const newStats = {
          totalPrompts: currentStats.totalPrompts + 1,
          promptsByModel: { ...currentStats.promptsByModel },
          promptsByCategory: { ...currentStats.promptsByCategory },
          totalRatings: currentStats.totalRatings + Object.keys(ratings).length,
        }

        models.forEach((model) => {
          newStats.promptsByModel[model] =
            (newStats.promptsByModel[model] || 0) + 1
        })

        newStats.promptsByCategory[category] =
          (newStats.promptsByCategory[category] || 0) + 1

        const allRatings = Object.values(ratings)
        const totalRating = allRatings.reduce((sum, r) => sum + r, 0)
        const avgRating =
          allRatings.length > 0 ? totalRating / allRatings.length : 0
        newStats.averageRating =
          (currentStats.averageRating * currentStats.totalRatings +
            totalRating) /
          (currentStats.totalRatings + allRatings.length)

        set({ stats: newStats })
      },

      // Active tab
      activeTab: 'home',
      setActiveTab: (tab) => set({ activeTab: tab }),

      // Submission trigger
      shouldSubmit: false,
      triggerSubmit: () => set({ shouldSubmit: true }),
      clearSubmit: () => set({ shouldSubmit: false }),
      shouldGenerateSummary: false,
      triggerGenerateSummary: () => set({ shouldGenerateSummary: true }),
      clearGenerateSummary: () => set({ shouldGenerateSummary: false }),

      // Summary
      summary: null,
      setSummary: (summaryOrFn) => {
        if (typeof summaryOrFn === 'function') {
          set((state) => ({ summary: summaryOrFn(state.summary) }))
        } else {
          set({ summary: summaryOrFn })
        }
      },
      appendSummaryText: (token) => set((state) => {
        if (!state.summary) return {}
        return { summary: { ...state.summary, text: (state.summary.text || '') + token } }
      }),
      clearSummary: () => set({ summary: null }),
      
      // RAG Debug data (temporary)
      ragDebugData: null,
      setRAGDebugData: (data) => set({ ragDebugData: data }),
      clearRAGDebugData: () => set({ ragDebugData: null }),
      
      // Search sources (from RAG pipeline)
      searchSources: null,
      setSearchSources: (sources) => set({ searchSources: sources }),
      clearSearchSources: () => set({ searchSources: null }),
      
      // Pipeline debug window visibility (separate from data so closing it doesn't affect facts window)
      showPipelineDebugWindow: true,
      setShowPipelineDebugWindow: (show) => set({ showPipelineDebugWindow: show }),

      // GPT-4o-mini response for category detection display
      geminiDetectionResponse: null,
      setGeminiDetectionResponse: (response) => set({ geminiDetectionResponse: response }),
      clearGeminiDetectionResponse: () => set({ geminiDetectionResponse: null }),
      isSummaryMinimized: false,
      setSummaryMinimized: (minimized) => set({ isSummaryMinimized: minimized }),
      
      // Web search loading state
      isSearchingWeb: false,
      setIsSearchingWeb: (searching) => set({ isSearchingWeb: searching }),
      
      // Full token data (all models including refiner, category detection, judge)
      tokenData: [],
      setTokenData: (data) => set({ tokenData: data }),
      appendTokenData: (entry) => set((state) => ({ tokenData: [...state.tokenData, entry] })),
      // Merge follow-up token data into the existing entry for the same model
      // instead of creating a separate "(follow-up)" row
      mergeTokenData: (modelName, newTokens, isJudge = false) => set((state) => {
        const tokenData = [...state.tokenData]
        // Find the existing entry for this model (match by modelName or tokens.model)
        const idx = tokenData.findIndex(item => {
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
      setQueryCount: (count) => set({ queryCount: count }),
      incrementQueryCount: () => set((state) => ({ queryCount: state.queryCount + 1 })),

      // Facts window visibility
      showFactsWindow: true,
      setShowFactsWindow: (show) => set({ showFactsWindow: show }),

      // Current user
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      clearCurrentUser: () => set({ currentUser: null, selectedModels: [], autoSmartProviders: {} }),

      // Stats refresh trigger
      statsRefreshTrigger: 0,
      triggerStatsRefresh: () => set((state) => ({ statsRefreshTrigger: state.statsRefreshTrigger + 1 })),

      // Leaderboard/prompt-feed refresh trigger (used to sync deletions across views)
      leaderboardRefreshTrigger: 0,
      triggerLeaderboardRefresh: () => set((state) => ({ leaderboardRefreshTrigger: state.leaderboardRefreshTrigger + 1 })),

      // Winning prompts from Prompt Feed Favorites (shared across views for badge display)
      winningPrompts: [],
      setWinningPrompts: (prompts) => set({ winningPrompts: prompts }),

      // Notification badge count for profile tab (social interactions)
      notificationCount: 0,
      setNotificationCount: (count) => set({ notificationCount: count }),

      // Navigation bar expanded state
      isNavExpanded: false,
      setNavExpanded: (expanded) => set({ isNavExpanded: expanded }),

      // Active history entry ID (tracks the current conversation for live updates)
      currentHistoryId: null,
      setCurrentHistoryId: (id) => set({ currentHistoryId: id }),
      clearCurrentHistoryId: () => set({ currentHistoryId: null }),

      // Council responses panel visibility
      showCouncilPanel: false,
      setShowCouncilPanel: (show) => set({ showCouncilPanel: show }),
      toggleCouncilPanel: () => set((state) => ({ showCouncilPanel: !state.showCouncilPanel })),

      // Viewing another user's profile (null = own profile)
      viewingProfile: null, // { userId, username }
      setViewingProfile: (profile) => set({ viewingProfile: profile }),
      clearViewingProfile: () => set({ viewingProfile: null }),

      // Prompt mode: 'general' or 'debate'
      promptMode: 'general',
      setPromptMode: (mode) => set({ promptMode: mode }),

      // Debate mode role assignments: { [modelId]: roleKey }
      modelRoles: {},
      setModelRole: (modelId, roleKey) =>
        set((state) => ({
          modelRoles: { ...state.modelRoles, [modelId]: roleKey },
        })),
      clearModelRoles: () => set({ modelRoles: {} }),

      // Theme: 'light' or 'dark'
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'arktek-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist essential state — exclude large/transient data to prevent
      // localStorage bloat (5MB limit) and stale data across sessions
      partialize: (state) => ({
        currentUser: state.currentUser,
        theme: state.theme,
        activeTab: state.activeTab,
        apiKeys: state.apiKeys,
        selectedModels: state.selectedModels,
        autoSmartProviders: state.autoSmartProviders,
        promptMode: state.promptMode,
        modelRoles: state.modelRoles,
      }),
    }
  )
)

