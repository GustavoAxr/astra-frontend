import { http } from '@/shared/api/http'
import type { UnmatchedPunch, UnmatchedPunchCount } from './types'

export const punchesApi = {
  unmatched: (deviceId: string | undefined, signal?: AbortSignal) =>
    http.get<UnmatchedPunch[]>('/unmatched-punches', { query: { deviceId }, signal }),

  /** RLS ya lo acota: el número que ve cada quien es el suyo. */
  unmatchedCount: (signal?: AbortSignal) =>
    http.get<UnmatchedPunchCount>('/unmatched-punches/count', { signal }),
}
