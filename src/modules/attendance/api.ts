import { http } from '@/shared/api/http'
import { downloadFile } from '@/shared/api/download'
import type {
  Adjustment,
  AttendanceDay,
  PendingOvertime,
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
  /** Filtro de comodidad; el alcance lo aplica RLS en el servidor. */
  legalEntityId?: string
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
  legalEntityId?: string
  /** La gente ENROLADA en ese reloj, no las checadas que salieron de él. */
  deviceId?: string
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
    q: {
      from?: string
      to?: string
      legalEntityId?: string
      installationId?: string
      /** La gente ENROLADA en ese reloj, no las checadas que salieron de él. */
      deviceId?: string
    },
    signal?: AbortSignal,
  ) => http.get<AttendanceSummary>('/attendance/summary', { query: { ...q }, signal }),

  /**
   * UN día concreto con toda la plantilla, para cuadrar cuentas diarias.
   * Sale del mismo motor que el resumen, así que no puede sumar distinto.
   */
  day: (
    q: {
      date: string
      legalEntityId?: string
      installationId?: string
      deviceId?: string
    },
    signal?: AbortSignal,
  ) => http.get<AttendanceDayList>('/attendance/day', { query: { ...q }, signal }),

  /**
   * Los permisos de tiempo extra. Cualquier rol puede consultarlos: saber qué
   * se autorizó no es un privilegio, es lo que hace auditable el pago.
   */
  adjustments: (
    q: {
      employeeId?: string
      status?: string
      from?: string
      to?: string
      legalEntityId?: string
      /** La gente enrolada en ese reloj. */
      deviceId?: string
    },
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
    /** «de 18:00 a 22:00». Cuando van las dos, los minutos los calcula el servidor. */
    requestedStart?: string
    requestedEnd?: string
    reason: string
  }) =>
    http.post<Adjustment>('/attendance-adjustments', {
      employeeId: input.employeeId,
      workDate: input.workDate,
      adjustmentType: input.adjustmentType,
      ...(input.proposedMinutes === undefined ? {} : { proposedMinutes: input.proposedMinutes }),
      ...(input.requestedStart === undefined ? {} : { requestedStart: input.requestedStart }),
      ...(input.requestedEnd === undefined ? {} : { requestedEnd: input.requestedEnd }),
      reason: input.reason,
    }),

  /**
   * El PDF de una solicitud. Sale en CUALQUIER estado —pendiente, autorizada o
   * rechazada— porque así circula: RRHH firma y el papel va a Dirección con esa
   * firma puesta.
   */
  descargarSolicitud: (id: string) => downloadFile(`/reports/overtime-requests/${id}`),

  /**
   * Aprobar o rechazar. El servidor rechaza que alguien apruebe lo que él mismo
   * pidió —y antes que el servidor, una restricción de la base—. Al rechazar,
   * la nota es obligatoria.
   */
  resolveAdjustment: (id: string, decision: 'approve' | 'reject', note?: string) =>
    http.post<Adjustment>(
      `/attendance-adjustments/${id}/${decision}`,
      note === undefined ? {} : { note },
    ),

  /**
   * El tiempo extra que detectó el reloj y nadie ha resuelto, por persona.
   * El umbral de cada turno ya viene aplicado por el motor.
   */
  pendingOvertime: (
    q: {
      from?: string
      to?: string
      legalEntityId?: string
      installationId?: string
      /** La gente ENROLADA en ese reloj, no las checadas que salieron de él. */
      deviceId?: string
    },
    signal?: AbortSignal,
  ) => http.get<PendingOvertime>('/attendance/pending-overtime', { query: { ...q }, signal }),

  /**
   * Aceptar o rechazar de golpe los días detectados de una persona.
   *
   * Solo viajan las FECHAS: cuántos minutos tenía cada día lo recalcula el
   * servidor. Es dinero de nómina y no puede depender de lo que mande esta
   * pantalla.
   */
  resolveDetected: (input: {
    employeeId: string
    workDates: string[]
    status: 'APPROVED' | 'REJECTED'
    note?: string
  }) =>
    http.post<{ resueltos: number }>('/attendance-adjustments/detected', {
      employeeId: input.employeeId,
      workDates: input.workDates,
      status: input.status,
      ...(input.note === undefined ? {} : { note: input.note }),
    }),

  /** El resultado calculado, solo la versión vigente de cada día. */
  attendance: (q: AttendanceQuery, signal?: AbortSignal) =>
    http.get<Page<AttendanceDay>>('/attendance', { query: { ...q }, signal }),
}
