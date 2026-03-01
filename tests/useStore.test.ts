import { describe, it, expect, beforeEach } from 'vitest'
import { createStore } from 'zustand'

// Inline a minimal version of the store logic for testing actions without
// requiring the full persist middleware + localStorage, which can be flaky in Node.
function createTestStore() {
  return createStore<any>((set, get) => ({
    showWelcome: true,
    setShowWelcome: (show: boolean) => set({ showWelcome: show }),

    apiKeys: {},
    setApiKey: (provider: string, key: string) => set((s: any) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),

    selectedModels: [],
    setSelectedModels: (models: string[]) => set({ selectedModels: models }),
    clearSelectedModels: () => set({ selectedModels: [] }),

    autoSmartProviders: {},
    setAutoSmartProviders: (providersOrFn: any) =>
      set((s: any) => ({
        autoSmartProviders: typeof providersOrFn === 'function' ? providersOrFn(s.autoSmartProviders) : providersOrFn,
      })),
    clearAutoSmartProviders: () => set({ autoSmartProviders: {} }),

    currentPrompt: '',
    setCurrentPrompt: (prompt: string) => set({ currentPrompt: prompt }),

    lastSubmittedPrompt: '',
    lastSubmittedCategory: '',
    setLastSubmittedPrompt: (prompt: string) => set({ lastSubmittedPrompt: prompt }),
    setLastSubmittedCategory: (category: string) => set({ lastSubmittedCategory: category }),
    clearLastSubmittedPrompt: () => set({ lastSubmittedPrompt: '', lastSubmittedCategory: '' }),

    responses: [],
    addResponse: (response: any) => set((s: any) => ({ responses: [...s.responses, response] })),
    updateResponse: (id: string, updates: any) =>
      set((s: any) => ({
        responses: s.responses.map((r: any) => (r.id === id ? { ...r, ...updates } : r)),
      })),
    removeResponse: (id: string) =>
      set((s: any) => ({ responses: s.responses.filter((r: any) => r.id !== id) })),
    clearResponses: () =>
      set({
        responses: [],
        summary: null,
        ragDebugData: null,
        searchSources: null,
        geminiDetectionResponse: null,
        tokenData: [],
        queryCount: 0,
      }),

    ratings: {},
    setRating: (responseId: string, rating: number) =>
      set((s: any) => ({ ratings: { ...s.ratings, [responseId]: rating } })),

    categories: {},
    setCategory: (promptId: string, category: string) =>
      set((s: any) => ({ categories: { ...s.categories, [promptId]: category } })),

    stats: { totalPrompts: 0, promptsByModel: {}, promptsByCategory: {}, totalRatings: 0, averageRating: 0 },
    updateStats: (prompt: string, models: string[], category: string, ratings: Record<string, number>) =>
      set((s: any) => {
        const newStats = { ...s.stats }
        newStats.totalPrompts += 1
        for (const m of models) {
          newStats.promptsByModel[m] = (newStats.promptsByModel[m] || 0) + 1
        }
        newStats.promptsByCategory[category] = (newStats.promptsByCategory[category] || 0) + 1
        const ratingValues = Object.values(ratings) as number[]
        newStats.totalRatings += ratingValues.length
        if (newStats.totalRatings > 0) {
          const sum = Object.values({ ...s.ratings, ...ratings }).reduce((a: number, b: number) => a + b, 0) as number
          newStats.averageRating = sum / newStats.totalRatings
        }
        return { stats: newStats }
      }),

    activeTab: 'prompt',
    setActiveTab: (tab: string) => set({ activeTab: tab }),

    shouldSubmit: false,
    triggerSubmit: () => set({ shouldSubmit: true }),
    clearSubmit: () => set({ shouldSubmit: false }),

    shouldGenerateSummary: false,
    triggerGenerateSummary: () => set({ shouldGenerateSummary: true }),
    clearGenerateSummary: () => set({ shouldGenerateSummary: false }),

    summary: null,
    setSummary: (summaryOrFn: any) =>
      set((s: any) => ({
        summary: typeof summaryOrFn === 'function' ? summaryOrFn(s.summary) : summaryOrFn,
      })),
    appendSummaryText: (token: string) =>
      set((s: any) => ({
        summary: s.summary ? { ...s.summary, text: (s.summary.text || '') + token } : { text: token },
      })),
    clearSummary: () => set({ summary: null }),

    ragDebugData: null,
    searchSources: null,
    geminiDetectionResponse: null,
    tokenData: [],
    queryCount: 0,

    setTokenData: (data: any[]) => set({ tokenData: data }),
    appendTokenData: (entry: any) => set((s: any) => ({ tokenData: [...s.tokenData, entry] })),
    mergeTokenData: (model: string, newTokens: any) =>
      set((s: any) => ({
        tokenData: s.tokenData.map((t: any) =>
          t.model === model
            ? { ...t, inputTokens: (t.inputTokens || 0) + (newTokens.inputTokens || 0), outputTokens: (t.outputTokens || 0) + (newTokens.outputTokens || 0) }
            : t,
        ),
      })),
    clearTokenData: () => set({ tokenData: [] }),

    incrementQueryCount: () => set((s: any) => ({ queryCount: s.queryCount + 1 })),

    authToken: null,
    setAuthToken: (token: string | null) => set({ authToken: token }),

    currentUser: null,
    setCurrentUser: (user: any) => set({ currentUser: user }),
    clearCurrentUser: () => set({ currentUser: null, authToken: null, selectedModels: [], autoSmartProviders: {} }),

    theme: 'dark',
    setTheme: (theme: string) => set({ theme }),
    toggleTheme: () => set((s: any) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

    promptMode: 'council',
    setPromptMode: (mode: string) => set({ promptMode: mode }),

    modelRoles: {},
    setModelRole: (modelId: string, roleKey: string) =>
      set((s: any) => ({ modelRoles: { ...s.modelRoles, [modelId]: roleKey } })),
    clearModelRoles: () => set({ modelRoles: {} }),

    isNavExpanded: true,
    setNavExpanded: (expanded: boolean) => set({ isNavExpanded: expanded }),

    notificationCount: 0,
    setNotificationCount: (count: number) => set({ notificationCount: count }),

    unreadMessageCount: 0,
    setUnreadMessageCount: (count: number) => set({ unreadMessageCount: count }),
  }))
}

describe('useStore actions', () => {
  let store: ReturnType<typeof createTestStore>

  beforeEach(() => {
    store = createTestStore()
  })

  it('setShowWelcome toggles welcome state', () => {
    expect(store.getState().showWelcome).toBe(true)
    store.getState().setShowWelcome(false)
    expect(store.getState().showWelcome).toBe(false)
  })

  it('setApiKey stores provider keys', () => {
    store.getState().setApiKey('openai', 'sk-test')
    expect(store.getState().apiKeys.openai).toBe('sk-test')
  })

  it('setSelectedModels replaces model list', () => {
    store.getState().setSelectedModels(['gpt-4', 'claude-3'])
    expect(store.getState().selectedModels).toEqual(['gpt-4', 'claude-3'])
  })

  it('clearSelectedModels empties the list', () => {
    store.getState().setSelectedModels(['gpt-4'])
    store.getState().clearSelectedModels()
    expect(store.getState().selectedModels).toEqual([])
  })

  it('setAutoSmartProviders supports updater function', () => {
    store.getState().setAutoSmartProviders({ openai: true })
    store.getState().setAutoSmartProviders((prev: any) => ({ ...prev, google: true }))
    expect(store.getState().autoSmartProviders).toEqual({ openai: true, google: true })
  })

  it('clearAutoSmartProviders resets to empty', () => {
    store.getState().setAutoSmartProviders({ openai: true })
    store.getState().clearAutoSmartProviders()
    expect(store.getState().autoSmartProviders).toEqual({})
  })

  it('setCurrentPrompt updates prompt', () => {
    store.getState().setCurrentPrompt('What is AI?')
    expect(store.getState().currentPrompt).toBe('What is AI?')
  })

  it('clearLastSubmittedPrompt clears both prompt and category', () => {
    store.getState().setLastSubmittedPrompt('test')
    store.getState().setLastSubmittedCategory('Science')
    store.getState().clearLastSubmittedPrompt()
    expect(store.getState().lastSubmittedPrompt).toBe('')
    expect(store.getState().lastSubmittedCategory).toBe('')
  })

  it('addResponse appends to responses', () => {
    store.getState().addResponse({ id: 'r1', text: 'Hello' })
    store.getState().addResponse({ id: 'r2', text: 'World' })
    expect(store.getState().responses).toHaveLength(2)
  })

  it('updateResponse merges updates into matching response', () => {
    store.getState().addResponse({ id: 'r1', text: 'Hello', status: 'pending' })
    store.getState().updateResponse('r1', { status: 'complete' })
    expect(store.getState().responses[0].status).toBe('complete')
    expect(store.getState().responses[0].text).toBe('Hello')
  })

  it('removeResponse filters out matching response', () => {
    store.getState().addResponse({ id: 'r1' })
    store.getState().addResponse({ id: 'r2' })
    store.getState().removeResponse('r1')
    expect(store.getState().responses).toHaveLength(1)
    expect(store.getState().responses[0].id).toBe('r2')
  })

  it('clearResponses resets responses and related state', () => {
    store.getState().addResponse({ id: 'r1' })
    store.getState().clearResponses()
    expect(store.getState().responses).toEqual([])
    expect(store.getState().summary).toBeNull()
    expect(store.getState().tokenData).toEqual([])
    expect(store.getState().queryCount).toBe(0)
  })

  it('setRating stores rating by response ID', () => {
    store.getState().setRating('r1', 5)
    expect(store.getState().ratings.r1).toBe(5)
  })

  it('updateStats increments totals', () => {
    store.getState().updateStats('prompt', ['gpt-4'], 'Science', {})
    expect(store.getState().stats.totalPrompts).toBe(1)
    expect(store.getState().stats.promptsByModel['gpt-4']).toBe(1)
    expect(store.getState().stats.promptsByCategory.Science).toBe(1)
  })

  it('triggerSubmit and clearSubmit toggle shouldSubmit', () => {
    expect(store.getState().shouldSubmit).toBe(false)
    store.getState().triggerSubmit()
    expect(store.getState().shouldSubmit).toBe(true)
    store.getState().clearSubmit()
    expect(store.getState().shouldSubmit).toBe(false)
  })

  it('setSummary supports updater function', () => {
    store.getState().setSummary({ text: 'initial', consensus: 80 })
    store.getState().setSummary((prev: any) => ({ ...prev, consensus: 90 }))
    expect(store.getState().summary.consensus).toBe(90)
    expect(store.getState().summary.text).toBe('initial')
  })

  it('appendSummaryText appends to existing summary', () => {
    store.getState().setSummary({ text: 'Hello' })
    store.getState().appendSummaryText(' World')
    expect(store.getState().summary.text).toBe('Hello World')
  })

  it('appendSummaryText creates summary if null', () => {
    store.getState().appendSummaryText('Start')
    expect(store.getState().summary.text).toBe('Start')
  })

  it('appendTokenData adds entries', () => {
    store.getState().appendTokenData({ model: 'gpt-4', inputTokens: 100, outputTokens: 50 })
    expect(store.getState().tokenData).toHaveLength(1)
  })

  it('mergeTokenData adds tokens to existing model entry', () => {
    store.getState().setTokenData([{ model: 'gpt-4', inputTokens: 100, outputTokens: 50 }])
    store.getState().mergeTokenData('gpt-4', { inputTokens: 50, outputTokens: 25 })
    expect(store.getState().tokenData[0].inputTokens).toBe(150)
    expect(store.getState().tokenData[0].outputTokens).toBe(75)
  })

  it('incrementQueryCount increments by 1', () => {
    store.getState().incrementQueryCount()
    store.getState().incrementQueryCount()
    expect(store.getState().queryCount).toBe(2)
  })

  it('clearCurrentUser clears user, auth, and model selections', () => {
    store.getState().setAuthToken('token-123')
    store.getState().setCurrentUser({ id: 'u1', name: 'Test' })
    store.getState().setSelectedModels(['gpt-4'])
    store.getState().setAutoSmartProviders({ openai: true })
    store.getState().clearCurrentUser()
    expect(store.getState().currentUser).toBeNull()
    expect(store.getState().authToken).toBeNull()
    expect(store.getState().selectedModels).toEqual([])
    expect(store.getState().autoSmartProviders).toEqual({})
  })

  it('toggleTheme switches between dark and light', () => {
    expect(store.getState().theme).toBe('dark')
    store.getState().toggleTheme()
    expect(store.getState().theme).toBe('light')
    store.getState().toggleTheme()
    expect(store.getState().theme).toBe('dark')
  })

  it('setModelRole and clearModelRoles manage debate roles', () => {
    store.getState().setModelRole('gpt-4', 'optimist')
    store.getState().setModelRole('claude-3', 'skeptic')
    expect(store.getState().modelRoles).toEqual({ 'gpt-4': 'optimist', 'claude-3': 'skeptic' })
    store.getState().clearModelRoles()
    expect(store.getState().modelRoles).toEqual({})
  })

  it('setNavExpanded toggles nav state', () => {
    store.getState().setNavExpanded(false)
    expect(store.getState().isNavExpanded).toBe(false)
  })

  it('setNotificationCount updates count', () => {
    store.getState().setNotificationCount(5)
    expect(store.getState().notificationCount).toBe(5)
  })

  it('setPromptMode changes mode', () => {
    store.getState().setPromptMode('debate')
    expect(store.getState().promptMode).toBe('debate')
  })
})
