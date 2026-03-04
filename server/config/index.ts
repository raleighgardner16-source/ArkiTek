import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import Stripe from 'stripe'
import { Resend } from 'resend'
import env from './env.js'

const require = createRequire(import.meta.url)
const disposableDomains = require('disposable-email-domains') as string[]

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')

const SERVER_VERSION = '2026-02-21-v1-judge-filter'
const API_VERSION = 'v1'
const API_PREFIX = `/api/${API_VERSION}`

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion,
})

const STRIPE_PRICE_ID = env.STRIPE_PRICE_ID
const STRIPE_PREMIUM_PRICE_ID = env.STRIPE_PREMIUM_PRICE_ID
const STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null
const APP_NAME = 'ArkiTek'
const FROM_EMAIL = env.FROM_EMAIL
const APP_URL = env.APP_URL

const PORT = env.PORT

const API_KEYS: Record<string, string> = {
  openai: env.OPENAI_API_KEY,
  anthropic: env.ANTHROPIC_API_KEY,
  google: env.GOOGLE_API_KEY,
  xai: env.XAI_API_KEY,
  meta: env.META_API_KEY,
  deepseek: env.DEEPSEEK_API_KEY,
  mistral: env.MISTRAL_API_KEY,
  serper: env.SERPER_API_KEY,
}

const ALLOWED_ORIGINS = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null

const MAX_FREE_TRIALS_PER_IP = 2

const JWT_SECRET = env.JWT_SECRET
const JWT_EXPIRY = '7d'

const MODEL_MAPPINGS: Record<string, string> = {
  'claude-4.6-opus': 'claude-opus-4-6',
  'claude-4.6-sonnet': 'claude-sonnet-4-6',
  'claude-4.5-haiku': 'claude-haiku-4-5-20251001',
  'gemini-3.1-pro': 'gemini-3.1-pro-preview',
  'gemini-3-flash': 'gemini-3-flash-preview',
  'magistral-medium': 'magistral-medium-latest',
  'mistral-medium-3.1': 'mistral-medium-latest',
  'mistral-small-3.2': 'mistral-small-latest',
}

const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
  meta: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
}

const ANTHROPIC_DEFAULT_SYSTEM_PROMPT = `Be direct and concise. Match your response length to the complexity of the question — give thorough answers for complex topics but keep simple answers brief. Avoid unnecessary preamble, filler, and restating the question. Use markdown formatting only when it genuinely aids readability.`

const DAILY_CHALLENGE_REWARD = 0.10

export interface DailyChallenge {
  id: string
  title: string
  description: string
  requirement: string
  threshold: number
}

const DAILY_CHALLENGES: DailyChallenge[] = [
  { id: 'send-prompts', title: 'Daily Explorer', description: 'Send at least 3 prompts today', requirement: 'prompts', threshold: 3 },
  { id: 'try-models', title: 'Model Mixer', description: 'Use at least 2 different AI models today', requirement: 'models', threshold: 2 },
  { id: 'streak-keeper', title: 'Streak Keeper', description: 'Keep your daily streak alive', requirement: 'streak', threshold: 1 },
  { id: 'token-burner', title: 'Token Burner', description: 'Use at least 5,000 tokens today', requirement: 'tokens', threshold: 5000 },
  { id: 'category-explorer', title: 'Category Explorer', description: 'Try at least 2 different prompt categories', requirement: 'categories', threshold: 2 },
  { id: 'deep-thinker', title: 'Deep Thinker', description: 'Send at least 5 prompts today', requirement: 'prompts', threshold: 5 },
  { id: 'power-user', title: 'Power User', description: 'Use at least 10,000 tokens today', requirement: 'tokens', threshold: 10000 },
]

export {
  stripe,
  STRIPE_PRICE_ID,
  STRIPE_PREMIUM_PRICE_ID,
  STRIPE_WEBHOOK_SECRET,
  resend,
  APP_NAME,
  FROM_EMAIL,
  APP_URL,
  PORT,
  API_KEYS,
  ALLOWED_ORIGINS,
  MAX_FREE_TRIALS_PER_IP,
  MODEL_MAPPINGS,
  PROVIDER_BASE_URLS,
  SERVER_VERSION,
  API_VERSION,
  API_PREFIX,
  PROJECT_ROOT,
  disposableDomains,
  ANTHROPIC_DEFAULT_SYSTEM_PROMPT,
  DAILY_CHALLENGE_REWARD,
  DAILY_CHALLENGES,
  JWT_SECRET,
  JWT_EXPIRY,
}
