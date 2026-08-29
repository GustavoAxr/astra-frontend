/**
 * Fila de `GET /agents`. **Aquí no hay ninguna credencial y no debe haberla**:
 * el secreto HMAC se separó del tipo del agente a propósito, así que no existe
 * campo donde quepa. Es la misma frontera que impide guardar huellas.
 */
export interface Agent {
  id: string
  legalEntityId: string
  installationId: string
  agentCode: string
  status: string
  lastHeartbeatAt: string | null
  clockOffsetMs: number | null
  agentVersion: string | null
  /** A cuántas razones sociales atiende. Más de una = tiene relojes compartidos. */
  servedEntityIds: string[]
  servedInstallationIds: string[]
}

/** Respuesta de `POST /agents`. El secreto viaja UNA vez y no se puede volver a pedir. */
export interface AgentEnrollment {
  agent: Agent
  /** 43 caracteres base64url. No se guarda en ningún sitio del navegador. */
  secret: string
  aviso?: string
}

export interface EnrollAgentForm {
  installationId: string
  agentCode: string
}
