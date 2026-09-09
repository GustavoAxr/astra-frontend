/** Fila de `GET /punches`: la evidencia tal como llegó del equipo. */
export interface Punch {
  id: string
  /*
   * Un marcaje SIEMPRE tiene dueño y por eso no es opcional: en la base
   * `employee_id` es NOT NULL con foránea RESTRICT. Lo que llega del reloj sin
   * dueño no está en esta lista — está en la bandeja de conciliación, que es
   * otra pantalla («Marcajes sin dueño»).
   */
  employeeId: string
  employeeCode: string
  employeeName: string
  deviceId: string | null
  serialNumber: string | null
  /** Marca y modelo. El número de serie no lo reconoce nadie de memoria. */
  deviceBrand: string | null
  deviceModel: string | null
  installationId: string | null
  punchTime: string
  receivedAt: string | null
  /** Casi siempre `UNKNOWN`. Ver `@/domain/punch`. */
  punchType: string
  source: string | null
  /** Puede venir `MULTI:*`. Ver `@/domain/verification`. */
  verificationMethod: string | null
  trustLevel: number | null
  geoLat: number | null
  geoLng: number | null
  clockOffsetMs: number | null
  /**
   * Cómo clasificaba el EQUIPO a esa persona en ese instante. Código crudo del
   * fabricante; `null` = no consta, que no es «normal».
   * Ver `@/domain/device-user-type`.
   */
  deviceUserType: string | null
  /**
   * **La carga cruda, tal como la mandó el equipo.** Todo lo demás son
   * conclusiones nuestras a partir de esto.
   *
   * Ya viene filtrada por la regla 5: si el equipo mandó una foto o una
   * plantilla, la clave aparece con el valor marcado como retirado.
   */
  raw: Record<string, unknown> | null
}

/** Fila de `GET /attendance`: lo que el motor concluyó, no la evidencia. */
export interface AttendanceDay {
  id: string
  employeeId: string
  employeeCode: string | null
  employeeName: string | null
  workDate: string
  version: number
  isCurrent: boolean
  shiftPolicyId: string | null
  firstIn: string | null
  lastOut: string | null
  scheduledMinutes: number
  workedMinutes: number
  breakMinutes: number
  regularMinutes: number
  overtimeDoubleMinutes: number
  overtimeTripleMinutes: number
  unapprovedOvertimeMinutes: number
  delayMinutes: number
  earlyLeaveMinutes: number
  isRestDay: boolean
  holidayWorked: boolean
  sundayPremium: boolean
  status: string
  anomalies: unknown
  computedAt: string
}

export interface Page<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

/** Estados que declara el CHECK de `computed_attendance`. */
const STATUS: Record<
  string,
  { label: string; color: 'success' | 'warning' | 'error' | 'neutral' }
> = {
  ON_TIME: { label: 'A tiempo', color: 'success' },
  LATE: { label: 'Retardo', color: 'warning' },
  ABSENT: { label: 'Falta', color: 'error' },
  /*
   * NO ES UNA FALTA y por eso no va en rojo. El reloj no reportó a nadie de su
   * instalación ese día: la ausencia de marcaje no prueba una ausencia de
   * persona. Se pinta como algo que revisar, que es lo que es.
   */
  NO_DATA: { label: 'Sin datos del reloj', color: 'warning' },
  REST: { label: 'Descanso', color: 'neutral' },
  HOLIDAY: { label: 'Festivo', color: 'neutral' },
  VACATION: { label: 'Vacaciones', color: 'neutral' },
  INCAPACITY: { label: 'Incapacidad', color: 'neutral' },
  PERMISSION: { label: 'Permiso', color: 'neutral' },
  INCOMPLETE: { label: 'Incompleto', color: 'warning' },
  NO_SCHEDULE: { label: 'Sin turno asignado', color: 'error' },
  SUSPENDED: { label: 'Suspensión', color: 'neutral' },
  // Lo trae la migración 019: trabajó, pero no donde está el reloj —comisión o
  // capacitación—. No es «a tiempo» (nadie midió su hora) ni «permiso» (sí
  // trabajó), y por eso necesitaba estado propio.
  OFFSITE: { label: 'Fuera de sede', color: 'success' },
}

export function attendanceStatusLook(status: string) {
  // Un estado nuevo se pinta con su código, sin inventarle significado.
  return STATUS[status] ?? { label: status, color: 'neutral' as const }
}

export const ATTENDANCE_STATUSES = Object.keys(STATUS)

/**
 * Una jornada CALCULADA al vuelo desde las checadas.
 *
 * Distinta de `AttendanceDay`, que sale de `computed_attendance` —la tabla que
 * guardaría el resultado con versión y aprobación, y que hoy está vacía—. Esta
 * se deriva de la evidencia cada vez, así que siempre concuerda con ella.
 */
export interface DerivedDay {
  workDate: string
  status: string
  shiftCode: string | null
  shiftName: string | null
  isRestDay: boolean
  /** Lo que el turno esperaba ese día. Nulo si no había turno. */
  expectedStart: string | null
  expectedEnd: string | null
  scheduledMinutes: number
  /**
   * La PRIMERA y la ÚLTIMA del día, no «entrada» y «salida»: el equipo manda
   * `punchType: UNKNOWN` y decidir cuál es cuál sería inventar (regla 1).
   */
  firstPunch: string | null
  lastPunch: string | null
  punchCount: number
  workedMinutes: number
  breakMinutes: number
  lateMinutes: number
  earlyArrivalMinutes: number
  earlyLeaveMinutes: number
  /** Tiempo extra que CUENTA: o no hacía falta permiso, o ya lo tiene. */
  overtimeMinutes: number
  /**
   * Trabajado de más que NO cuenta porque nadie lo autorizó. Se enseña aparte
   * en vez de descartarlo: la persona estuvo ahí y la evidencia lo dice.
   */
  unapprovedOvertimeMinutes: number
  /** Extra al doble y al triple, repartida por SEMANA según `legal_rules`. */
  overtimeDoubleMinutes: number
  overtimeTripleMinutes: number
  /** RRHH ya evaluó ese tiempo extra y decidió que no se paga. */
  overtimeRejected: boolean
  /** El motivo del rechazo, tal como lo escribió quien firmó. */
  overtimeRejectionNote: string | null
  /**
   * Trabajo autorizado FUERA de la sede: horas que no pasaron por el reloj
   * —desde casa, en un cliente—. Van sumadas en `overtimeMinutes` y aparte de
   * `workedMinutes`, que sigue siendo lo que dice la evidencia.
   */
  remoteMinutes: number
  workedOnRestDay: boolean
  /** Ese día tiene permiso de RRHH ya aprobado. */
  authorized: boolean
  /**
   * La incidencia que cubre el día —vacaciones, incapacidad, permiso…—. Un día
   * con incidencia NUNCA es falta: es la regla que trajo la migración 019.
   */
  exceptionCode: string | null
  exceptionName: string | null
  exceptionIsPaid: boolean
  exceptionCountsAsWorked: boolean
  exceptionDocumentRef: string | null
  /** El festivo que cae ese día, se haya trabajado o no. */
  holidayName: string | null
  holidayWorked: boolean
  sundayPremium: boolean
  /** Lo que hay que mirar a mano. Vacío es que no hay nada raro. */
  anomalies: string[]
}

export interface DerivedAttendance {
  from: string
  to: string
  data: DerivedDay[]
  totals: {
    workedMinutes: number
    scheduledMinutes: number
    lateMinutes: number
    overtimeMinutes: number
    unapprovedOvertimeMinutes: number
    /** Ya incluido en `overtimeMinutes`; se informa aparte. */
    remoteMinutes: number
    absentDays: number
    lateDays: number
    onTimeDays: number
    incompleteDays: number
    workedDays: number
    /** Días que su turno marcaba de trabajo. El denominador de todo. */
    workDays: number
    attendedDays: number
    /** Días en los que SE PUEDE decir si llegó tarde. */
    measurableDays: number
    /*
     * NULO cuando no hay denominador, no cero. Un periodo sin días laborables
     * no tiene «0 % de puntualidad»: no tiene puntualidad, y pintar un cero
     * acusaría a alguien de algo que no ocurrió.
     */
    attendanceRate: number | null
    punctualityRate: number | null
    /** Puede pasar de 100: son horas trabajadas contra programadas. */
    hoursRate: number | null
  }
}

/** Un día del periodo, sumando a TODA la plantilla del filtro. */
export interface SummaryDay {
  date: string
  onTime: number
  late: number
  absent: number
  /**
   * El reloj no reportó a NADIE ese día. No son faltas: son días que nadie
   * midió, y sumarlos con las faltas convierte un corte de luz en una sanción.
   */
  noData: number
  incomplete: number
  rest: number
  /**
   * Sin adscripción vigente ese día. Se cuenta aparte y hay que enseñarlo: si
   * se callara, una gráfica con cuarenta y dos personas mostraría tres y
   * parecería que faltan datos en vez de que falta asignarles turno.
   */
  noSchedule: number
  /** Festivo. Aparte del descanso: no es lo mismo ni se paga igual. */
  holiday: number
  /** Vacaciones, incapacidad, permiso o suspensión. */
  incidence: number
  /** Comisión o capacitación. */
  offsite: number
  workedMinutes: number
  scheduledMinutes: number
  lateMinutes: number
  overtimeMinutes: number
  unapprovedOvertimeMinutes: number
  remoteMinutes: number
}

export interface SummaryEmployee {
  employeeId: string
  employeeCode: string
  employeeName: string
  workedMinutes: number
  scheduledMinutes: number
  lateDays: number
  lateMinutes: number
  absentDays: number
  incompleteDays: number
  /** Días cubiertos por una incidencia de RRHH. Nunca son faltas. */
  incidenceDays: number
  offsiteDays: number
  overtimeMinutes: number
  unapprovedOvertimeMinutes: number
  remoteMinutes: number
}

export interface AttendanceSummary {
  from: string
  to: string
  employees: number
  byDay: SummaryDay[]
  byEmployee: SummaryEmployee[]
  totals: {
    workedMinutes: number
    scheduledMinutes: number
    lateMinutes: number
    overtimeMinutes: number
    unapprovedOvertimeMinutes: number
    lateDays: number
    absentDays: number
    onTimeDays: number
  }
}

/** Una persona en UN día concreto: la jornada calculada con quién es. */
export interface DayRow extends DerivedDay {
  employeeId: string
  employeeCode: string
  employeeName: string
}

export interface AttendanceDayList {
  date: string
  employees: number
  data: DayRow[]
  totals: {
    onTime: number
    late: number
    absent: number
    noData: number
    incomplete: number
    rest: number
    noSchedule: number
    holiday: number
    incidence: number
    offsite: number
    workedMinutes: number
    scheduledMinutes: number
    lateMinutes: number
    overtimeMinutes: number
    unapprovedOvertimeMinutes: number
    remoteMinutes: number
  }
}

/**
 * Un permiso de tiempo extra: se pide y **otra persona** lo aprueba.
 *
 * Vive en `attendance_adjustments`. Solo los `APPROVED` cuentan para el
 * cálculo: uno pendiente no autoriza nada, porque si contara bastaría con
 * pedirlo para que las horas se pagaran solas.
 */
export interface Adjustment {
  id: string
  employeeId: string
  employeeCode: string | null
  employeeName: string | null
  workDate: string
  adjustmentType: string
  /** Tope autorizado en minutos. Nulo = lo que haya salido ese día. */
  proposedMinutes: number | null
  reason: string
  /** Por qué se aprobó o se rechazó. Obligatoria al rechazar. */
  resolutionNote: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  /**
   * La franja pedida: «de 18:00 a 22:00». Los minutos por sí solos no dicen a
   * qué hora, y es la hora lo que después se contrasta con las checadas.
   */
  requestedStart: string | null
  requestedEnd: string | null
  /** Nulo = no lo pidió nadie: lo detectó el reloj. */
  requestedBy: string | null
  requestedByName: string | null
  requestedAt: string
  approvedBy: string | null
  approvedByName: string | null
  approvedAt: string | null
  /**
   * Las firmas puestas. Una solicitud pedida por una persona necesita LAS DOS
   * —RRHH y Dirección— para autorizarse; un rechazo de cualquiera la deja sin
   * efecto aunque la otra hubiera firmado.
   */
  approvals: AdjustmentApproval[]
}

export interface AdjustmentApproval {
  id: string
  kind: 'RRHH' | 'DIRECCION'
  decision: 'APPROVED' | 'REJECTED'
  decidedBy: string
  decidedByName: string | null
  decidedAt: string
  note: string | null
}

export const PAPEL_DE_FIRMA: Record<string, string> = {
  RRHH: 'Recursos Humanos',
  DIRECCION: 'Dirección',
}

/**
 * Qué clase de permiso es. Se ven distintos porque significan cosas distintas:
 * uno autoriza horas QUE EL RELOJ YA MIDIÓ; el otro añade horas que no tienen
 * checada ninguna. La segunda pesa más y por eso se pinta aparte.
 */
export const ADJUSTMENT_TYPE: Record<string, { label: string; icon: string }> = {
  AUTHORIZE_OVERTIME: { label: 'Extra en sitio', icon: 'i-lucide-clock' },
  REMOTE_WORK: { label: 'Fuera de sede', icon: 'i-lucide-house' },
}

export const ADJUSTMENT_STATUS: Record<
  string,
  { label: string; color: 'warning' | 'success' | 'error' }
> = {
  PENDING: { label: 'Pendiente', color: 'warning' },
  APPROVED: { label: 'Aprobado', color: 'success' },
  REJECTED: { label: 'Rechazado', color: 'error' },
}

/** Un día con horas de más que midió el reloj y que nadie ha resuelto. */
export interface PendingOvertimeDay {
  workDate: string
  minutes: number
  workedMinutes: number
  scheduledMinutes: number
  firstPunch: string | null
  lastPunch: string | null
  punchCount: number
  shiftCode: string | null
  expectedStart: string | null
  expectedEnd: string | null
  /** El umbral del turno ese día. Explica qué días NO están en la lista. */
  thresholdMinutes: number
  isRestDay: boolean
  status: string
}

export interface PendingOvertimePerson {
  employeeId: string
  employeeCode: string
  employeeName: string
  legalEntityName: string | null
  installationName: string | null
  totalMinutes: number
  days: PendingOvertimeDay[]
}

export interface PendingOvertime {
  from: string
  to: string
  people: PendingOvertimePerson[]
  totals: { people: number; minutes: number; days: number }
}
