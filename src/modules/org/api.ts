import { http } from '@/shared/api/http'
import type {
  CreateInstallationForm,
  CreateLegalEntityForm,
  Dependencies,
  Installation,
  LegalEntity,
  UpdateInstallationForm,
  UpdateLegalEntityForm,
  Department,
  DepartmentForm,
  Position,
  PositionForm,
} from './types'

export const orgApi = {
  /**
   * Arreglo plano, sin paginar. Trae solo lo que el usuario alcanza: el
   * filtrado lo hace RLS en la base, no un parámetro que mandemos.
   */
  /**
   * Las inactivas **no salen** por omisión. Sin el interruptor que pide
   * `incluirInactivas`, desactivar sería un viaje sin regreso desde la interfaz.
   */
  legalEntities: (incluirInactivas = false, signal?: AbortSignal) =>
    http.get<LegalEntity[]>('/legal-entities', {
      query: { incluirInactivas: incluirInactivas ? true : undefined },
      signal,
    }),

  createLegalEntity: (form: CreateLegalEntityForm) =>
    http.post<LegalEntity>('/legal-entities', {
      businessName: form.businessName.trim(),
      // El servidor lo normaliza a mayúsculas: se manda lo que escribió la
      // persona y se deja que el servidor mande sobre la forma final.
      taxId: form.taxId.trim(),
      countryCode: form.countryCode,
      timezone: form.timezone,
    }),

  /** Solo lo que cambió. Un campo de más devuelve 400. */
  updateLegalEntity: (id: string, changes: UpdateLegalEntityForm) =>
    http.patch<LegalEntity>(`/legal-entities/${id}`, changes),

  legalEntityDependencies: (id: string, signal?: AbortSignal) =>
    http.get<Dependencies>(`/legal-entities/${id}/dependencies`, { signal }),

  deleteLegalEntity: (id: string) => http.delete<void>(`/legal-entities/${id}`),

  /**
   * Arreglo plano, acotado por RLS. Las inactivas no salen salvo que se pidan,
   * igual que en razones sociales.
   */
  installations: (
    options: { incluirInactivas?: boolean; legalEntityId?: string } = {},
    signal?: AbortSignal,
  ) =>
    http.get<Installation[]>('/installations', {
      query: {
        incluirInactivas: options.incluirInactivas ? true : undefined,
        legalEntityId: options.legalEntityId,
      },
      signal,
    }),

  createInstallation: (form: CreateInstallationForm) =>
    http.post<Installation>('/installations', toCreateInstallationDto(form)),

  /** Solo lo que cambió. `code` no está: es inmutable tras el alta. */
  updateInstallation: (id: string, changes: UpdateInstallationForm) =>
    http.patch<Installation>(`/installations/${id}`, changes),

  installationDependencies: (id: string, signal?: AbortSignal) =>
    http.get<Dependencies>(`/installations/${id}/dependencies`, { signal }),

  deleteInstallation: (id: string) =>
    http.delete<{ borrada: boolean; arrastro: unknown[] }>(`/installations/${id}`),
  // ── Catálogos de la organización ────────────────────────────────────────

  /**
   * Departamentos. `employeeCount` viene con las adscripciones VIGENTES, que es
   * lo que hace falta para saber si se puede retirar sin dejar gente colgando.
   */
  departments: (legalEntityId: string | undefined, signal?: AbortSignal) =>
    http.get<Department[]>('/departments', { query: { legalEntityId }, signal }),

  createDepartment: (legalEntityId: string, form: DepartmentForm) =>
    http.post<Department>('/departments', {
      legalEntityId,
      name: form.name.trim(),
      ...(form.costCenter.trim() ? { costCenter: form.costCenter.trim() } : {}),
    }),

  updateDepartment: (id: string, form: DepartmentForm) =>
    http.patch<Department>(`/departments/${id}`, {
      name: form.name.trim(),
      ...(form.costCenter.trim() ? { costCenter: form.costCenter.trim() } : {}),
    }),

  setDepartmentActive: (id: string, isActive: boolean) =>
    http.patch<Department>(`/departments/${id}`, { isActive }),

  departmentDependencies: (id: string) => http.get<Dependencies>(`/departments/${id}/dependencies`),

  removeDepartment: (id: string) => http.delete<void>(`/departments/${id}`),

  positions: (legalEntityId: string | undefined, signal?: AbortSignal) =>
    http.get<Position[]>('/positions', { query: { legalEntityId }, signal }),

  createPosition: (legalEntityId: string, form: PositionForm) =>
    http.post<Position>('/positions', {
      legalEntityId,
      name: form.name.trim(),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
    }),

  updatePosition: (id: string, form: PositionForm) =>
    http.patch<Position>(`/positions/${id}`, {
      name: form.name.trim(),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
    }),

  setPositionActive: (id: string, isActive: boolean) =>
    http.patch<Position>(`/positions/${id}`, { isActive }),

  positionDependencies: (id: string) => http.get<Dependencies>(`/positions/${id}/dependencies`),

  removePosition: (id: string) => http.delete<void>(`/positions/${id}`),
}

/**
 * Campo por campo, y los opcionales vacíos **no se mandan**. La geocerca va
 * plana: mandar el objeto `geofence` que devuelve el GET es 400 seguro.
 */
function toCreateInstallationDto(
  form: CreateInstallationForm,
): Record<string, unknown> {
  const dto: Record<string, unknown> = {
    legalEntityId: form.legalEntityId,
    name: form.name.trim(),
    timezone: form.timezone,
  }

  const address = form.address.trim()
  if (address !== '') dto.address = address

  const latitude = Number(form.latitude)
  const longitude = Number(form.longitude)
  if (form.latitude.trim() !== '' && !Number.isNaN(latitude)) dto.latitude = latitude
  if (form.longitude.trim() !== '' && !Number.isNaN(longitude)) dto.longitude = longitude

  const radius = Number(form.geofenceRadiusMeters)
  if (form.geofenceRadiusMeters.trim() !== '' && !Number.isNaN(radius)) {
    dto.geofenceRadiusMeters = radius
  }

  /*
   * El área solo viaja si tiene forma. Con menos de tres puntos no hay
   * superficie que encerrar, y mandar dos vértices sería pedirle al servidor
   * que rechace algo que la pantalla ya sabía que estaba a medias.
   */
  if (form.geofencePolygon.length >= 3) {
    dto.geofencePolygon = form.geofencePolygon
  }

  return dto
}
