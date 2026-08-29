import { http } from '@/shared/api/http'
import type { Agent, AgentEnrollment, EnrollAgentForm } from './types'

export const agentsApi = {
  list: (signal?: AbortSignal) => http.get<Agent[]>('/agents', { signal }),

  enroll: (form: EnrollAgentForm) =>
    http.post<AgentEnrollment>('/agents', {
      installationId: form.installationId,
      agentCode: form.agentCode.trim().toUpperCase(),
    }),
}
