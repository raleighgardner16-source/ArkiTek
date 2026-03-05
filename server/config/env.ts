import { cleanEnv, str, port, url } from 'envalid'
import dotenv from 'dotenv'

dotenv.config()

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),

  // Database
  MONGODB_URI: str({ default: 'mongodb://localhost:27017', desc: 'MongoDB connection string' }),
  DB_NAME: str({ default: 'Arkitek', desc: 'Primary database name' }),
  ADMIN_DB_NAME: str({ default: 'Arkitek', desc: 'Admin database name' }),

  // Auth
  JWT_SECRET: str({
    devDefault: 'dev-secret-change-in-production',
    desc: 'Secret key for signing JWTs — MUST be set in production',
  }),

  // Server
  PORT: port({ default: 3001 }),
  APP_URL: url({ default: 'http://localhost:3000', desc: 'Public-facing app URL' }),
  ALLOWED_ORIGINS: str({ default: '', desc: 'Comma-separated CORS origins (empty = allow all)' }),

  // LLM provider API keys — at least one should be set for the app to be useful
  OPENAI_API_KEY: str({ default: '', desc: 'OpenAI API key' }),
  ANTHROPIC_API_KEY: str({ default: '', desc: 'Anthropic API key' }),
  GOOGLE_API_KEY: str({ default: '', desc: 'Google AI API key' }),
  XAI_API_KEY: str({ default: '', desc: 'xAI API key' }),
  META_API_KEY: str({ default: '', desc: 'Meta / Groq API key' }),
  DEEPSEEK_API_KEY: str({ default: '', desc: 'DeepSeek API key' }),
  MISTRAL_API_KEY: str({ default: '', desc: 'Mistral API key' }),

  // Search
  SERPER_API_KEY: str({ default: '', desc: 'Serper web search API key' }),

  // Stripe
  STRIPE_SECRET_KEY: str({ default: '', desc: 'Stripe secret key' }),
  STRIPE_PUBLISHABLE_KEY: str({ default: '', desc: 'Stripe publishable key' }),
  STRIPE_PRICE_ID: str({ default: '', desc: 'Stripe price ID for standard plan' }),
  STRIPE_PREMIUM_PRICE_ID: str({ default: '', desc: 'Stripe price ID for premium plan' }),
  STRIPE_EXTRA_AGENT_PRICE_ID: str({ default: '', desc: 'Stripe price ID for $4.95/mo extra agent add-on' }),
  STRIPE_WEBHOOK_SECRET: str({ default: '', desc: 'Stripe webhook signing secret' }),

  // Email
  RESEND_API_KEY: str({ default: '', desc: 'Resend email API key' }),
  FROM_EMAIL: str({ default: 'noreply@arkitek.app', desc: 'Sender email address' }),

  // Error Tracking
  SENTRY_DSN: str({ default: '', desc: 'Sentry DSN for error tracking (leave empty to disable)' }),

  // Logging
  LOG_LEVEL: str({ choices: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], default: '', desc: 'Pino log level (defaults to info in production, debug in development)' }),

  // Deployment
  VERCEL: str({ default: '', desc: 'Set automatically by Vercel when deployed there' }),
})

if (isProduction && !isTest) {
  const warnings: string[] = []

  if (!env.MONGODB_URI || env.MONGODB_URI === 'mongodb://localhost:27017') {
    warnings.push('MONGODB_URI is using localhost default — are you sure this is correct for production?')
  }

  const llmKeys = [env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY, env.GOOGLE_API_KEY]
  if (llmKeys.every(k => !k)) {
    warnings.push('No LLM API keys set (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY). The app will not be able to generate responses.')
  }

  if (!env.STRIPE_SECRET_KEY) {
    warnings.push('STRIPE_SECRET_KEY is not set — payments will not work.')
  }

  if (!env.RESEND_API_KEY) {
    warnings.push('RESEND_API_KEY is not set — email sending is disabled.')
  }

  if (warnings.length > 0) {
    console.warn('\n╔══════════════════════════════════════════════════════════')
    console.warn('║  ⚠️  ENVIRONMENT CONFIGURATION WARNINGS')
    console.warn('╠══════════════════════════════════════════════════════════')
    for (const w of warnings) {
      console.warn(`║  • ${w}`)
    }
    console.warn('╚══════════════════════════════════════════════════════════\n')
  }
}

export default env
