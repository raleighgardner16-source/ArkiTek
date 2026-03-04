import { Zap, MessageSquare, Flame, Trophy, Shield, Swords, Cpu, HelpCircle, Compass } from 'lucide-react'

export const BADGE_CATEGORIES = [
  {
    id: 'tokens',
    name: 'Token Titan',
    icon: Zap,
    description: 'Process tokens to unlock these badges',
    statKey: 'totalTokens',
    unit: 'tokens',
    badges: [
      { name: 'First Spark', threshold: 1000, emoji: '⚡', color: '#FFD700', desc: '1K tokens' },
      { name: 'Kindling', threshold: 10000, emoji: '🔥', color: '#FF8C00', desc: '10K tokens' },
      { name: 'Torch Bearer', threshold: 100000, emoji: '🔦', color: '#FF6347', desc: '100K tokens' },
      { name: 'Inferno', threshold: 1000000, emoji: '🌋', color: '#FF4500', desc: '1M tokens' },
      { name: 'Supernova', threshold: 5000000, emoji: '💥', color: '#DC143C', desc: '5M tokens' },
      { name: 'Cosmic Force', threshold: 10000000, emoji: '🌌', color: '#9400D3', desc: '10M tokens' },
      { name: 'Void Walker', threshold: 25000000, emoji: '🕳️', color: '#6A0DAD', desc: '25M tokens' },
      { name: 'Galactic Mind', threshold: 50000000, emoji: '🪐', color: '#4B0082', desc: '50M tokens' },
      { name: 'Nebula Architect', threshold: 100000000, emoji: '✨', color: '#00CED1', desc: '100M tokens' },
      { name: 'Star Forger', threshold: 250000000, emoji: '⭐', color: '#00BFFF', desc: '250M tokens' },
      { name: 'Dimension Breaker', threshold: 500000000, emoji: '🔮', color: '#5B5EA6', desc: '500M tokens' },
      { name: 'Universal Consciousness', threshold: 1000000000, emoji: '🌀', color: '#7B68EE', desc: '1B tokens' },
    ]
  },
  {
    id: 'prompts',
    name: 'Prompt Pioneer',
    icon: MessageSquare,
    description: 'Send prompts to unlock these badges',
    statKey: 'totalPrompts',
    unit: 'prompts',
    badges: [
      { name: 'First Words', threshold: 1, emoji: '💬', color: '#32CD32', desc: '1 prompt' },
      { name: 'Curious Mind', threshold: 10, emoji: '🧠', color: '#00FA9A', desc: '10 prompts' },
      { name: 'Explorer', threshold: 25, emoji: '🧭', color: '#20B2AA', desc: '25 prompts' },
      { name: 'Trailblazer', threshold: 50, emoji: '🚀', color: '#1E90FF', desc: '50 prompts' },
      { name: 'Pathfinder', threshold: 100, emoji: '🗺️', color: '#4169E1', desc: '100 prompts' },
      { name: 'Wayfinder', threshold: 250, emoji: '🔮', color: '#8A2BE2', desc: '250 prompts' },
      { name: 'Sage', threshold: 500, emoji: '📜', color: '#9370DB', desc: '500 prompts' },
      { name: 'Oracle', threshold: 1000, emoji: '🏛️', color: '#BA55D3', desc: '1K prompts' },
      { name: 'Visionary', threshold: 5000, emoji: '👁️', color: '#FF69B4', desc: '5K prompts' },
      { name: 'Transcendent', threshold: 10000, emoji: '🌟', color: '#FFD700', desc: '10K prompts' },
      { name: 'Enlightened', threshold: 50000, emoji: '🧿', color: '#E0115F', desc: '50K prompts' },
      { name: 'Omniscient', threshold: 100000, emoji: '👑', color: '#FF4500', desc: '100K prompts' },
    ]
  },
  {
    id: 'streaks',
    name: 'Streak Warrior',
    icon: Flame,
    description: 'Maintain daily usage streaks',
    statKey: 'streakDays',
    unit: 'days',
    badges: [
      { name: 'Getting Warm', threshold: 3, emoji: '🕯️', color: '#FFA07A', desc: '3-day streak' },
      { name: 'Week Warrior', threshold: 7, emoji: '⚔️', color: '#FF7F50', desc: '7-day streak' },
      { name: 'Fortnight Force', threshold: 14, emoji: '🛡️', color: '#FF6347', desc: '14-day streak' },
      { name: 'Monthly Machine', threshold: 30, emoji: '⚙️', color: '#FF4500', desc: '30-day streak' },
      { name: 'Iron Will', threshold: 60, emoji: '🔩', color: '#DC143C', desc: '60-day streak' },
      { name: 'Centurion', threshold: 100, emoji: '🏛️', color: '#B22222', desc: '100-day streak' },
      { name: 'Unbreakable', threshold: 150, emoji: '💎', color: '#C41E3A', desc: '150-day streak' },
      { name: 'Legendary', threshold: 200, emoji: '🐉', color: '#8B0000', desc: '200-day streak' },
      { name: 'Eternal Flame', threshold: 365, emoji: '🔥', color: '#FFD700', desc: '365-day streak' },
      { name: 'Immortal', threshold: 500, emoji: '♾️', color: '#9400D3', desc: '500-day streak' },
      { name: 'Titan of Will', threshold: 750, emoji: '🏔️', color: '#4B0082', desc: '750-day streak' },
      { name: 'Unkillable', threshold: 1000, emoji: '💀', color: '#FF0000', desc: '1000-day streak' },
    ]
  },
  // DISABLED: Community Champion and Social Butterfly badge categories temporarily removed (social media features)
  // {
  //   id: 'community',
  //   name: 'Community Champion',
  //   ...
  // },
  // {
  //   id: 'social',
  //   name: 'Social Butterfly',
  //   ...
  // },
  {
    id: 'ratings',
    name: 'Model Champion',
    icon: Trophy,
    description: 'Pick your favorite model response to unlock these badges',
    statKey: 'totalRatings',
    unit: 'wins',
    badges: [
      { name: 'First Pick', threshold: 1, emoji: '🏆', color: '#FFD700', desc: '1 win picked' },
      { name: 'Talent Scout', threshold: 5, emoji: '🔍', color: '#FFA500', desc: '5 wins picked' },
      { name: 'Kingmaker', threshold: 25, emoji: '👑', color: '#FF8C00', desc: '25 wins picked' },
      { name: 'Grand Selector', threshold: 50, emoji: '⚖️', color: '#FF6347', desc: '50 wins picked' },
      { name: 'Champion Maker', threshold: 100, emoji: '🥇', color: '#DC143C', desc: '100 wins picked' },
      { name: 'Elite Judge', threshold: 250, emoji: '🔱', color: '#8B0000', desc: '250 wins picked' },
      { name: 'Supreme Judge', threshold: 500, emoji: '💎', color: '#660000', desc: '500 wins picked' },
      { name: 'Verdict King', threshold: 750, emoji: '🏰', color: '#4A0000', desc: '750 wins picked' },
      { name: 'Grand Arbiter', threshold: 1000, emoji: '⚖️', color: '#330000', desc: '1,000 wins picked' },
      { name: 'The Decider', threshold: 1500, emoji: '🔮', color: '#1A0000', desc: '1,500 wins picked' },
    ]
  },
  {
    id: 'council',
    name: 'Council Mastery',
    icon: Shield,
    description: 'Use the Council of LLMs (3+ models at once)',
    statKey: 'councilPrompts',
    unit: 'assemblies',
    badges: [
      { name: 'First Assembly', threshold: 1, emoji: '🏛️', color: '#2E86C1', desc: '1 council assembly' },
      { name: 'Council Initiate', threshold: 25, emoji: '⚖️', color: '#2874A6', desc: '25 assemblies' },
      { name: 'Grand Councilor', threshold: 100, emoji: '🏆', color: '#21618C', desc: '100 assemblies' },
      { name: 'Senate Leader', threshold: 250, emoji: '👑', color: '#1B4F72', desc: '250 assemblies' },
      { name: 'Council Sovereign', threshold: 1000, emoji: '🔱', color: '#154360', desc: '1K assemblies' },
      { name: 'Council Overlord', threshold: 5000, emoji: '⚡', color: '#0E3B54', desc: '5K assemblies' },
      { name: 'Council Immortal', threshold: 10000, emoji: '💎', color: '#082E44', desc: '10K assemblies' },
      { name: 'Eternal Arbiter', threshold: 25000, emoji: '🌌', color: '#041E2E', desc: '25K assemblies' },
    ]
  },
  {
    id: 'debate',
    name: 'Debate Master',
    icon: Swords,
    description: 'Use Debate Mode to pit models against each other',
    statKey: 'debatePrompts',
    unit: 'debates',
    badges: [
      { name: 'Opening Statement', threshold: 1, emoji: '🎤', color: '#E74C3C', desc: '1 debate' },
      { name: 'Devil\'s Advocate', threshold: 25, emoji: '😈', color: '#C0392B', desc: '25 debates' },
      { name: 'Cross-Examiner', threshold: 100, emoji: '🔍', color: '#A93226', desc: '100 debates' },
      { name: 'Rhetorician', threshold: 250, emoji: '📜', color: '#922B21', desc: '250 debates' },
      { name: 'Master Debater', threshold: 1000, emoji: '🎯', color: '#7B241C', desc: '1K debates' },
      { name: 'Grand Orator', threshold: 5000, emoji: '🏛️', color: '#641E16', desc: '5K debates' },
      { name: 'Supreme Dialectician', threshold: 10000, emoji: '⚔️', color: '#4A1711', desc: '10K debates' },
      { name: 'Eternal Challenger', threshold: 25000, emoji: '🔥', color: '#30100B', desc: '25K debates' },
    ]
  },
  {
    id: 'provider-openai',
    name: 'ChatGPT Explorer',
    icon: Cpu,
    description: 'Send prompts using ChatGPT models',
    statKey: 'provider_openai_prompts',
    unit: 'prompts',
    badges: [
      { name: 'GPT Regular', threshold: 100, emoji: '💬', color: '#1a7f64', desc: '100 prompts' },
      { name: 'GPT Enthusiast', threshold: 500, emoji: '🔥', color: '#0d8c6d', desc: '500 prompts' },
      { name: 'GPT Power User', threshold: 1000, emoji: '⚡', color: '#0a6e55', desc: '1K prompts' },
      { name: 'GPT Expert', threshold: 5000, emoji: '🏆', color: '#085c47', desc: '5K prompts' },
      { name: 'GPT Master', threshold: 10000, emoji: '👑', color: '#064a39', desc: '10K prompts' },
      { name: 'GPT Legend', threshold: 25000, emoji: '🌟', color: '#04382b', desc: '25K prompts' },
    ]
  },
  {
    id: 'provider-anthropic',
    name: 'Claude Explorer',
    icon: Cpu,
    description: 'Send prompts using Claude models',
    statKey: 'provider_anthropic_prompts',
    unit: 'prompts',
    badges: [
      { name: 'Claude Regular', threshold: 100, emoji: '💬', color: '#c4956a', desc: '100 prompts' },
      { name: 'Claude Enthusiast', threshold: 500, emoji: '🔥', color: '#b48560', desc: '500 prompts' },
      { name: 'Claude Power User', threshold: 1000, emoji: '⚡', color: '#a47556', desc: '1K prompts' },
      { name: 'Claude Expert', threshold: 5000, emoji: '🏆', color: '#94654c', desc: '5K prompts' },
      { name: 'Claude Master', threshold: 10000, emoji: '👑', color: '#845542', desc: '10K prompts' },
      { name: 'Claude Legend', threshold: 25000, emoji: '🌟', color: '#744538', desc: '25K prompts' },
    ]
  },
  {
    id: 'provider-google',
    name: 'Gemini Explorer',
    icon: Cpu,
    description: 'Send prompts using Gemini models',
    statKey: 'provider_google_prompts',
    unit: 'prompts',
    badges: [
      { name: 'Gemini Regular', threshold: 100, emoji: '💬', color: '#3B78DB', desc: '100 prompts' },
      { name: 'Gemini Enthusiast', threshold: 500, emoji: '🔥', color: '#346BC2', desc: '500 prompts' },
      { name: 'Gemini Power User', threshold: 1000, emoji: '⚡', color: '#2D5EA9', desc: '1K prompts' },
      { name: 'Gemini Expert', threshold: 5000, emoji: '🏆', color: '#265190', desc: '5K prompts' },
      { name: 'Gemini Master', threshold: 10000, emoji: '👑', color: '#1F4477', desc: '10K prompts' },
      { name: 'Gemini Legend', threshold: 25000, emoji: '🌟', color: '#18375E', desc: '25K prompts' },
    ]
  },
  {
    id: 'provider-xai',
    name: 'Grok Explorer',
    icon: Cpu,
    description: 'Send prompts using Grok models',
    statKey: 'provider_xai_prompts',
    unit: 'prompts',
    badges: [
      { name: 'Grok Regular', threshold: 100, emoji: '💬', color: '#1A91D9', desc: '100 prompts' },
      { name: 'Grok Enthusiast', threshold: 500, emoji: '🔥', color: '#1781C0', desc: '500 prompts' },
      { name: 'Grok Power User', threshold: 1000, emoji: '⚡', color: '#1471A7', desc: '1K prompts' },
      { name: 'Grok Expert', threshold: 5000, emoji: '🏆', color: '#11618E', desc: '5K prompts' },
      { name: 'Grok Master', threshold: 10000, emoji: '👑', color: '#0E5175', desc: '10K prompts' },
      { name: 'Grok Legend', threshold: 25000, emoji: '🌟', color: '#0B415C', desc: '25K prompts' },
    ]
  },
  {
    id: 'category-mastery',
    name: 'Knowledge Spectrum',
    icon: Compass,
    description: 'Have prompts in every category — only counts prompts auto-classified by the AI',
    statKey: 'minOrganicCategoryCount',
    unit: 'min per category',
    badges: [
      { name: 'First in All', threshold: 1, emoji: '🌐', color: '#00ACC1', desc: '1 prompt in every category' },
      { name: 'Well Rounded', threshold: 3, emoji: '🎯', color: '#0097A7', desc: '3 per category' },
      { name: 'Balanced Mind', threshold: 5, emoji: '⚖️', color: '#00838F', desc: '5 per category' },
      { name: 'Category Regular', threshold: 10, emoji: '📚', color: '#006064', desc: '10 per category' },
      { name: 'Knowledge Seeker', threshold: 25, emoji: '🔬', color: '#4527A0', desc: '25 per category' },
      { name: 'Discipline Master', threshold: 50, emoji: '🎓', color: '#311B92', desc: '50 per category' },
      { name: 'Renaissance Mind', threshold: 100, emoji: '🏛️', color: '#1A237E', desc: '100 per category' },
      { name: 'Polymath', threshold: 250, emoji: '🧬', color: '#0D47A1', desc: '250 per category' },
      { name: 'Universal Scholar', threshold: 500, emoji: '🌌', color: '#01579B', desc: '500 per category' },
      { name: 'Omnidisciplinary', threshold: 1000, emoji: '👁️', color: '#004D40', desc: '1K per category' },
    ]
  },
  {
    id: 'secrets',
    name: 'Secret Badges',
    icon: HelpCircle,
    description: 'Hidden achievements waiting to be discovered',
    statKey: 'secret',
    secret: true,
    unit: '',
    badges: [
      { name: 'Night Owl', secretStatKey: 'lateNightPrompts', threshold: 5, emoji: '🦉', color: '#4A148C', desc: 'Send 5 prompts between midnight and 5am' },
      { name: 'Deep Thinker', secretStatKey: 'longPrompts', threshold: 10, emoji: '🧠', color: '#1A237E', desc: 'Send 10 prompts over 500 characters long' },
      { name: 'Time Traveler', secretStatKey: 'revisitedOldConversations', threshold: 1, emoji: '⏳', color: '#5D4037', desc: 'Revisit a conversation older than 30 days' },
      { name: 'Star Collector', secretStatKey: 'starredConversations', threshold: 25, emoji: '⭐', color: '#F9A825', desc: 'Star 25 conversations' },
      { name: 'Speed Demon', secretStatKey: 'maxPromptsInDay', threshold: 50, emoji: '💨', color: '#D50000', desc: 'Send 50 prompts in a single day' },
      { name: 'Fact Checker', secretStatKey: 'factsWindowOpened', threshold: 50, emoji: '🔍', color: '#00695C', desc: 'Open the Facts & Sources window 50 times' },
      { name: 'Marathon Runner', secretStatKey: 'longestConversation', threshold: 30, emoji: '🏃', color: '#1565C0', desc: 'Have a conversation with 30+ messages' },
      { name: 'Treasure Hunter', secretStatKey: 'totalFavorites', threshold: 100, emoji: '💎', color: '#6A1B9A', desc: 'Favorite 100 responses' },
      { name: 'Polyglot', secretStatKey: 'uniqueCategories', threshold: 10, emoji: '🗣️', color: '#00838F', desc: 'Use 10 different prompt categories' },
      { name: 'Conversationalist', secretStatKey: 'multiTurnConversations', threshold: 100, emoji: '💬', color: '#AD1457', desc: 'Have 100 conversations with 5+ messages' },
      { name: 'Weekend Warrior', secretStatKey: 'weekendDaysUsed', threshold: 20, emoji: '🎉', color: '#E65100', desc: 'Send prompts on 20 different weekends' },
      { name: 'Comeback Kid', secretStatKey: 'comebackAfterBreak', threshold: 1, emoji: '🔄', color: '#2E7D32', desc: 'Return after 7+ days of inactivity' },
      { name: 'Model Mixer', secretStatKey: 'uniqueModelsUsed', threshold: 25, emoji: '🎰', color: '#C62828', desc: 'Use 25 different AI models' },
      { name: 'Sharer', secretStatKey: 'totalShares', threshold: 25, emoji: '🔗', color: '#283593', desc: 'Share a prompt 25 times' },
    ],
  },
]

export const formatBadgeNumber = (num: number) => {
  if (num >= 1000000000) return `${(num / 1000000000).toFixed(num % 1000000000 === 0 ? 0 : 1)}B`
  if (num >= 1000000) return `${(num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}K`
  return num.toLocaleString()
}
