import * as Sentry from '@sentry/node'
import env from './env.js'
import { createLogger } from './logger.js'

const log = createLogger('sentry')
const isEnabled = !!env.SENTRY_DSN

if (isEnabled) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV || 'development',
    enabled: env.NODE_ENV !== 'test',

    tracesSampleRate: env.NODE_ENV === 'production' ? 0.2 : 1.0,

    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization
        delete event.request.headers.cookie
      }
      return event
    },

    ignoreErrors: [
      'ECONNRESET',
      'EPIPE',
      'Request aborted',
      'socket hang up',
    ],
  })

  log.info('Error tracking initialized')
} else {
  log.info('Disabled (no SENTRY_DSN configured)')
}

export { Sentry, isEnabled }
