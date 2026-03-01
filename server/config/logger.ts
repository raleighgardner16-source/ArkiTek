import pino from 'pino'
import env from './env.js'

const isProduction = env.NODE_ENV === 'production'
const isTest = env.NODE_ENV === 'test'

const logger = pino({
  level: env.LOG_LEVEL || (isTest ? 'silent' : isProduction ? 'info' : 'debug'),

  transport: !isProduction && !isTest
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,

  formatters: {
    level(label) {
      return { level: label }
    },
  },

  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },

  redact: isProduction
    ? { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[REDACTED]' }
    : undefined,
})

export function createLogger(component: string) {
  return logger.child({ component })
}

export default logger
