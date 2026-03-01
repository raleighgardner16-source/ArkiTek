import { describe, it, expect } from 'vitest'
import { canonicalizeEmail, isDisposableEmail } from '../server/helpers/auth.js'

describe('canonicalizeEmail', () => {
  it('lowercases the entire email', () => {
    expect(canonicalizeEmail('John@Example.COM')).toBe('john@example.com')
  })

  it('removes dots from Gmail local part', () => {
    expect(canonicalizeEmail('j.o.h.n@gmail.com')).toBe('john@gmail.com')
  })

  it('removes dots from googlemail.com', () => {
    expect(canonicalizeEmail('j.o.h.n@googlemail.com')).toBe('john@googlemail.com')
  })

  it('strips plus-addressing for Gmail', () => {
    expect(canonicalizeEmail('john+tag@gmail.com')).toBe('john@gmail.com')
  })

  it('strips plus-addressing for non-Gmail domains', () => {
    expect(canonicalizeEmail('user+tag@example.com')).toBe('user@example.com')
  })

  it('does NOT remove dots for non-Gmail domains', () => {
    expect(canonicalizeEmail('j.o.h.n@example.com')).toBe('j.o.h.n@example.com')
  })

  it('trims whitespace', () => {
    expect(canonicalizeEmail('  user@example.com  ')).toBe('user@example.com')
  })

  it('handles both dots and plus for Gmail', () => {
    expect(canonicalizeEmail('j.o.hn+newsletter@gmail.com')).toBe('john@gmail.com')
  })
})

describe('isDisposableEmail', () => {
  it('returns true for known disposable domains', () => {
    // mailinator.com is in virtually all disposable email lists
    expect(isDisposableEmail('test@mailinator.com')).toBe(true)
  })

  it('returns false for legitimate domains', () => {
    expect(isDisposableEmail('user@gmail.com')).toBe(false)
    expect(isDisposableEmail('user@outlook.com')).toBe(false)
  })

  it('is case insensitive on domain', () => {
    expect(isDisposableEmail('test@MAILINATOR.COM')).toBe(true)
  })
})
