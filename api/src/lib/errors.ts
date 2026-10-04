/**
 * Every failure the API reports on purpose goes through AppError, so the shape
 * a client sees is the same everywhere:
 *
 *   { "error": { "code": "...", "message": "...", "fields": { ... } } }
 *
 * `code` is what clients branch on; `message` is for people and may change.
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly fields: Record<string, string> | undefined

  constructor(
    statusCode: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.fields = fields
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new AppError(400, 'bad_request', message, fields)

export const unauthorized = (message = 'Authentication required.') =>
  new AppError(401, 'unauthorized', message)

/** Wrong credentials, kept separate from a missing or expired token. */
export const invalidCredentials = (message = 'Email or password is incorrect.') =>
  new AppError(401, 'invalid_credentials', message)

export const forbidden = (message = 'You do not have access to this.') =>
  new AppError(403, 'forbidden', message)

export const notFound = (message = 'Not found.') => new AppError(404, 'not_found', message)

export const conflict = (message: string, fields?: Record<string, string>) =>
  new AppError(409, 'conflict', message, fields)

export const validationFailed = (fields: Record<string, string>) =>
  new AppError(422, 'validation_failed', 'Some fields need fixing.', fields)

export const tooManyRequests = (message = 'Too many attempts. Try again shortly.') =>
  new AppError(429, 'too_many_requests', message)
