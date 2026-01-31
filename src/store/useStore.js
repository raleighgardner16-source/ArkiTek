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

      // Current prompt
      currentPrompt: '',
      setCurrentPrompt: (prompt) => set({ currentPrompt: prompt }),

      // Responses
      responses: [],
      addResponse: (response) =>
        set((state) => ({
          responses: [...state.responses, response],
        })),
      removeResponse: (responseId) =>
        set((state) => ({
          responses: state.responses.filter((res) => res.id !== responseId),
        })),
      clearResponses: () => {
        set({ responses: [] })
        // Also clear summary, GPT-4o-mini response, debug data, and reset window states when clearing responses
        set({ summary: null })
        set({ gpt4oMiniResponse: null })
        set({ ragDebugData: null })
        set({ showFactsWindow: true }) // Reset to default state
        set({ showPipelineDebugWindow: true }) // Reset to default state
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

      // Background/UI
      currentBackground: 'default',
      setCurrentBackground: (bg) => set({ currentBackground: bg }),

      // VR Navigation
      vrMode: false,
      setVrMode: (mode) => set({ vrMode: mode }),
      cameraPosition: { x: 0, y: 0, z: 0 },
      setCameraPosition: (pos) => set({ cameraPosition: pos }),

      // Prompt box visibility
      showPromptBox: false,
      setShowPromptBox: (show) => set({ showPromptBox: show }),

      // Active tab
      activeTab: 'home',
      setActiveTab: (tab) => set({ activeTab: tab }),

      // Submission trigger
      shouldSubmit: false,
      triggerSubmit: () => set({ shouldSubmit: true }),
      clearSubmit: () => set({ shouldSubmit: false }),

      // Summary
      summary: null,
      setSummary: (summary) => set({ summary }),
      clearSummary: () => set({ summary: null }),
      
      // RAG Debug data (temporary)
      ragDebugData: null,
      setRAGDebugData: (data) => set({ ragDebugData: data }),
      clearRAGDebugData: () => set({ ragDebugData: null }),
      
      // Pipeline debug window visibility (separate from data so closing it doesn't affect facts window)
      showPipelineDebugWindow: true,
      setShowPipelineDebugWindow: (show) => set({ showPipelineDebugWindow: show }),

      // GPT-4o-mini response for category detection display
      gpt4oMiniResponse: null,
      setGpt4oMiniResponse: (response) => set({ gpt4oMiniResponse: response }),
      clearGpt4oMiniResponse: () => set({ gpt4oMiniResponse: null }),
      isSummaryMinimized: false,
      setSummaryMinimized: (minimized) => set({ isSummaryMinimized: minimized }),
      
      // Web search loading state
      isSearchingWeb: false,
      setIsSearchingWeb: (searching) => set({ isSearchingWeb: searching }),
      
      // Facts window visibility
      showFactsWindow: true,
      setShowFactsWindow: (show) => set({ showFactsWindow: show }),

      // Current user
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      clearCurrentUser: () => set({ currentUser: null }),

      // Stats refresh trigger
      statsRefreshTrigger: 0,
      triggerStatsRefresh: () => set((state) => ({ statsRefreshTrigger: state.statsRefreshTrigger + 1 })),

      // Research mode: 'independent', 'interpretation', or null (none selected)
      researchMode: null,
      setResearchMode: (mode) => set({ researchMode: mode }),
    }),
    {
      name: 'arktek-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

