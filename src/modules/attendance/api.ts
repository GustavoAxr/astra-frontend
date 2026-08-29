import { http } from '@/shared/api/http'
import type {
  Adjustment,
  AttendanceDay,
  AttendanceDayList,
  AttendanceSummary,
  DerivedAttendance,
  Page,
  Punch,
} from './types'

export interface PunchQuery {
  employeeId?: string
  deviceId?: string
  installationId?: string
  from?: string
  to?: string
  /** Código crudo del fabricante, tal cual. Ver `@/domain/device-user-type`. */
  deviceUserType?: string
  page?: number
  limit?: number
}

export interface AttendanceQuery {
  employeeId?: string
  installationId?: string
  from?: string
  to?: string
  status?: string
  page?: number
  limit?: number
}

export const attendanceApi = {
  /** La evidencia. Intocable: el backend solo permite leerla e insertarla. */
  punches: (q: PunchQuery, signal?: AbortSignal) =>
    http.get<Page<Punch>>('/punches', { query: { ...q }, signal }),

  /**
   * Las jornadas calculadas AL VUELO desde las checadas: horas, retardo,
   * llegada anticipada y extra, contra el turno vigente de cada día.
   *
   * Es lo que hay que usar hoy. `attendance()` lee `computed_attendance`, que
   * está vacía porque todavía no hay motor que la escriba, y serviría cero días
   * a quien tiene checadas.
   */
  derived: (employeeId: string, rango: { from?: string; to?: string }, signal?: AbortSignal) =>
    http.get<DerivedAttendance>('/attendance/derived', {
      query: { employeeId, ...rango },
      signal,
    }),

  /**
   * El resumen de toda la plantilla: por día y por persona, del mismo cálculo.
   * Es lo que alimenta las gráficas.
   */
  summary: (
    q: { from?: string; to?: string; legalEntityId?: string; installationId?: string },
    signal?: AbortSignal,
  ) => http.get<AttendanceSummary>('/attendance/summary', { query: { ...q }, signal }),

  /**
   * UN día concreto con toda la plantilla, para cuadrar cuentas diarias.
   * Sale del mismo motor que el resumen, así que no puede sumar distinto.
   */
  day: (
    q: { date: string; legalEntityId?: string; installationId?: string },
    signal?: AbortSignal,
  ) => http.get<AttendanceDayList>('/attendance/day', { query: { ...q }, signal }),

  /**
   * Los permisos de tiempo extra. Cualquier rol puede consultarlos: saber qué
   * se autorizó no es un privilegio, es lo que hace auditable el pago.
   */
  adjustments: (
    q: { employeeId?: string; status?: string; from?: string; to?: string },
    signal?: AbortSignal,
  ) => http.get<Adjustment[]>('/attendance-adjustments', { query: { ...q }, signal }),

  /**
   * Pedir uno. El cuerpo se arma campo por campo: `forbidNonWhitelisted` está
   * activo y un campo de más devuelve 400.
   */
  requestAdjustment: (input: {
    employeeId: string
    workDate: string
    /** `REMOTE_WORK` exige minutos: no hay checadas de donde deducirlos. */
    adjustmentType: 'AUTHORIZE_OVERTIME' | 'REMOTE_WORK'
    proposedMinutes?: number
    reason: string
  }) =>
    http.post<Adjustment>('/attendance-adjustments', {
      employeeId: input.employeeId,
      workDate: input.workDate,
      adjustmentType: input.adjustmentType,
      ...(input.proposedMinutes === undefined ? {} : { proposedMinutes: input.proposedMinutes }),
      reason: input.reason,
    }),

  /**
   * Aprobar o rechazar. El servidor rechaza que alguien apruebe lo que él mismo
   * pidió —y antes que el servidor, una restricción de la base—.
   */
  resolveAdjustment: (id: string, decision: 'approve' | 'reject') =>
    http.post<Adjustment>(`/attendance-adjustments/${id}/${decision}`),

  /** El resultado calculado, solo la versión vigente de cada día. */
  attendance: (q: AttendanceQuery, signal?: AbortSignal) =>
    http.get<Page<AttendanceDay>>('/attendance', { query: { ...q }, signal }),
}
