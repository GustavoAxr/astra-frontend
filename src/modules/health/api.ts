import { http } from '@/shared/api/http'
import type { DeviceSyncState } from './types'

export const healthApi = {
  syncState: (signal?: AbortSignal) =>
    http.get<DeviceSyncState[]>('/devices/sync-state', { signal }),
}
