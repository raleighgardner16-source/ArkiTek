import type { Response } from 'express'

// ============================================================================
// API RESPONSE ENVELOPES
// ============================================================================

/** Every success response carries `success: true` plus optional payload fields */
export interface ApiSuccessResponse<T extends Record<string, unknown> = Record<string, never>> {
  success: true
  message?: string
}

/** Intersection type that spreads payload at root level for backward compat */
export type ApiSuccess<T extends Record<string, unknown> = Record<string, never>> =
  ApiSuccessResponse<T> & T

/** Every error response carries `success: false` and an `error` string */
export interface ApiErrorResponse {
  success: false
  error: string
  /** Machine-readable code for programmatic error handling */
  code?: string
  /** Extra metadata (subscriptionRequired, needsCheckout, etc.) */
  [key: string]: unknown
}

/** Discriminated union — consumers can narrow on `success` */
export type ApiResponse<T extends Record<string, unknown> = Record<string, never>> =
  ApiSuccess<T> | ApiErrorResponse

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

/**
 * Send a standardized success response.
 * Payload fields are spread at the root level alongside `success: true`.
 */
export function sendSuccess<T extends Record<string, unknown>>(
  res: Response,
  data?: T,
  statusCode = 200,
): void {
  res.status(statusCode).json({ success: true as const, ...data })
}

/**
 * Send a standardized error response.
 * Extra metadata (e.g. `subscriptionRequired`, `needsCheckout`) can be passed via `extra`.
 */
export function sendError(
  res: Response,
  error: string,
  statusCode = 500,
  extra?: Record<string, unknown>,
): void {
  res.status(statusCode).json({ success: false as const, error, ...extra })
}
