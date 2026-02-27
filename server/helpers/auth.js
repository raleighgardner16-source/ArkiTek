import crypto from 'crypto'
import { disposableDomains } from '../config/index.js'

const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex')
}

const canonicalizeEmail = (email) => {
  const [local, domain] = email.toLowerCase().trim().split('@')
  const googleDomains = ['gmail.com', 'googlemail.com']
  if (googleDomains.includes(domain)) {
    const cleaned = local.split('+')[0].replace(/\./g, '')
    return `${cleaned}@${domain}`
  }
  const cleaned = local.split('+')[0]
  return `${cleaned}@${domain}`
}

const isDisposableEmail = (email) => {
  const domain = email.split('@')[1]?.toLowerCase()
  return disposableDomains.includes(domain)
}

export { hashPassword, canonicalizeEmail, isDisposableEmail }
