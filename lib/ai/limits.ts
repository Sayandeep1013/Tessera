/**
 * Validation budgets. See docs/specs/06-ai-protocol.md §5.
 * Named constants, never magic numbers at call sites.
 */

/** Maximum operations in a single proposal. */
export const MAX_OPS = 40

/** Maximum individual pixels across all set_pixels operations. */
export const MAX_PIXELS = 400

/** Maximum add_palette_color operations per proposal. */
export const MAX_NEW_COLORS = 4

/** Maximum characters in the user-facing summary. */
export const MAX_SUMMARY = 200

/** Maximum characters in a user instruction. */
export const MAX_INSTRUCTION = 500

/** Maximum request body size for the AI route, in bytes. */
export const MAX_BODY_BYTES = 256 * 1024

/** Our own rate limit: requests per IP per hour. */
export const RATE_LIMIT_PER_HOUR = 20
