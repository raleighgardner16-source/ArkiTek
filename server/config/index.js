import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import Stripe from 'stripe'
import { Resend } from 'resend'

dotenv.config()

const require = createRequire(import.meta.url)
const disposableDomains = require('disposable-email-domains')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')

const SERVER_VERSION = '2026-02-21-v1-judge-filter'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20.acacia',
})

const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || ''
const STRIPE_PREMIUM_PRICE_ID = process.env.STRIPE_PREMIUM_PRICE_ID || ''
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const APP_NAME = 'ArkiTek'
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@arkitek.app'
const APP_URL = process.env.APP_URL || 'http://localhost:3000'

const PORT = process.env.PORT || 3001

const API_KEYS = {
  openai: process.env.OPENAI_API_KEY || '',
  anthropic: process.env.ANTHROPIC_API_KEY || '',
  google: process.env.GOOGLE_API_KEY || '',
  xai: process.env.XAI_API_KEY || '',
  meta: process.env.META_API_KEY || '',
  deepseek: process.env.DEEPSEEK_API_KEY || '',
  mistral: process.env.MISTRAL_API_KEY || '',
  serper: process.env.SERPER_API_KEY || '',
}

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null

const MAX_FREE_TRIALS_PER_IP = 2

const MODEL_MAPPINGS = {
  'claude-4.5-opus': 'claude-opus-4-5-20251101',
  'claude-4.5-sonnet': 'claude-sonnet-4-5-20250929',
  'claude-4.5-haiku': 'claude-haiku-4-5-20251001',
  'gemini-3-pro': 'gemini-3-pro-preview',
  'gemini-3-flash': 'gemini-3-flash-preview',
  'magistral-medium': 'magistral-medium-latest',
  'mistral-medium-3.1': 'mistral-medium-latest',
  'mistral-small-3.2': 'mistral-small-latest',
}

const PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
  meta: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
}

const DAILY_CHALLENGE_REWARD = 0.10

const DAILY_CHALLENGES = [
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
  PROJECT_ROOT,
  disposableDomains,
  DAILY_CHALLENGE_REWARD,
  DAILY_CHALLENGES,
}
