/** Lo que devuelve cada fila de `GET /employees`. */
export interface Employee {
  id: string
  legalEntityId: string
  employeeCode: string
  firstName: string
  lastName: string
  secondLastName: string | null
  /** Pueden faltar: no todos los expedientes llegan completos el primer día. */
  curp: string | null
  rfc: string | null
  nss: string | null
  birthDate: string | null
  whatsappNumber: string | null
  whatsappOptIn: boolean
  whatsappVerified: boolean
  isActive: boolean
  /**
   * Vigencia de hoy. `null` = sin base ni turno asignados, y eso hay que verlo
   * en la lista: sin turno no se le puede calcular asistencia.
   */
  current: {
    installationId: string
    installationCode: string
    shiftPolicyId: string
    shiftCode: string
    shiftName: string
    departmentId: string | null
    departmentName: string | null
    positionId: string | null
    positionName: string | null
  } | null
}

/**
 * Filtros de `GET /employees`, tal como los declara Swagger.
 *
 * `legalEntityId` es uno más de la lista, no el alcance de la sesión: el
 * alcance lo aplica RLS. Un id que el usuario no alcanza devuelve cero filas,
 * no un error.
 */
export interface EmployeeQuery {
  page?: number
  limit?: number
  legalEntityId?: string
  installationId?: string
  search?: string
  onlyActive?: boolean
}

/** Bloque de horario dentro del ciclo de un turno. */
export interface ShiftSegment {
  id: string
  cycleDay: number
  sequence: number
  segmentName: string | null
  isRestDay: boolean
  startTime: string | null
  durationMinutes: number | null
  graceInMinutes: number
  graceOutMinutes: number
  earlyInToleranceMinutes: number
  breakMinutes: number
  breakIsPaid: boolean
  breakAutoDeduct: boolean
}

/**
 * Un turno y su ciclo. **Esto es lo que permite saber si alguien llegó tarde**:
 * sin `startTime` y `graceInMinutes` no hay contra qué comparar una checada.
 *
 * El ciclo NO es la semana: un 4x3 dura 7 días, pero un 14x14 dura 28. Por eso
 * los bloques van por `cycleDay`, no por día de la semana.
 */
export interface ShiftPolicy {
  id: string
  legalEntityId: string
  code: string
  name: string
  scheduleMode: string
  cycleType: string
  cycleLengthDays: number
  journeyType: string
  targetMinutesPerCycle: number | null
  roundingMinutes: number
  /** Hacia dónde redondea: al más cercano, siempre arriba o siempre abajo. */
  roundingMode: string
  minOvertimeMinutes: number
  overtimeRequiresApproval: boolean
  /**
   * A qué día se imputa la jornada. `SEGMENT_START` hace que un 20:00 → 05:00
   * pertenezca al día en que empezó; `CALENDAR_DAY` la parte por la medianoche.
   */
  workdayAnchor: string
  isActive: boolean
  segments: ShiftSegment[]
}

/** Una vigencia del empleado: dónde, con qué turno y desde cuándo. */
export interface Assignment {
  id: string
  installationId: string
  shiftPolicyId: string
  cycleStartDate: string
  /** Del catálogo de puestos. Antes era texto libre; ver `@/modules/org/types`. */
  positionId: string | null
  /**
   * Del catálogo. `null` = sin departamento, que es un caso válido.
   *
   * No es opcional: el servidor lo devuelve siempre. Estaba como `?` y esa
   * marca escondía que la consulta ni siquiera lo pedía — el dato se guardaba
   * y se perdía al releerlo, así que parecía que no se guardaba.
   */
  departmentId: string | null
  /** Resuelto por el servidor, para no cruzar el catálogo en cada pantalla. */
  departmentName: string | null
  validFrom: string
  validTo: string | null
  reason: string
}

/** `GET /employees/:id`: el expediente con su historia. */
export interface EmployeeDetail extends Employee {
  currentAssignment: Assignment | null
  assignments: Assignment[]
  employmentPeriods: { from: string; to: string | null }[]
}

/*
 * `Department` y `Position` viven en `@/modules/org/types`: son catálogos de la
 * organización, no del expediente. Se reexportan aquí porque la adscripción los
 * necesita y así quien lee este módulo no tiene que saber dónde están.
 */
export type { Department, Position } from '@/modules/org/types'

export interface CreateEmployeeForm {
  legalEntityId: string
  /**
   * Solo lo manda el alta desde el PADRÓN DEL RELOJ, y ahí no lo escribe
   * nadie: es `EMP-` + el número con el que la persona está enrolada. En
   * cualquier otra alta se omite y lo genera el servidor.
   */
  employeeCode?: string
  firstName: string
  lastName: string
  secondLastName: string
  curp: string
  rfc: string
  nss: string
  birthDate: string
  whatsappNumber: string
}

/** Motivos que acepta el backend. `HIRED` es el de una contratación nueva. */
export const ASSIGNMENT_REASONS = [
  'HIRED',
  'TRANSFERRED',
  'SHIFT_CHANGE',
  'PROMOTED',
  'TEMPORARY_COVER',
  'SEASONAL',
  'REHIRED',
  'OTHER',
] as const

export type AssignmentReason = (typeof ASSIGNMENT_REASONS)[number]

export const ASSIGNMENT_REASON_LABEL: Record<AssignmentReason, string> = {
  HIRED: 'Contratación',
  TRANSFERRED: 'Cambio de instalación',
  SHIFT_CHANGE: 'Cambio de turno',
  PROMOTED: 'Promoción',
  TEMPORARY_COVER: 'Cobertura temporal',
  SEASONAL: 'Estacional',
  REHIRED: 'Recontratación',
  OTHER: 'Otro',
}

export interface AssignmentForm {
  installationId: string
  shiftPolicyId: string
  departmentId: string
  positionId: string
  validFrom: string
  cycleStartDate: string
  reason: AssignmentReason
}

/**
 * Un movimiento en la relación laboral. Distinto de una excepción: un evento
 * cambia el ESTADO del vínculo (contratado, baja, suspensión); una excepción
 * justifica días sin alterarlo — quien está de vacaciones sigue contratado.
 */
export const EMPLOYMENT_EVENTS = [
  'HIRED',
  'TERMINATED',
  'RESIGNED',
  'SUSPENDED',
  'REINSTATED',
] as const

export type EmploymentEventType = (typeof EMPLOYMENT_EVENTS)[number]

export const EMPLOYMENT_EVENT_LABEL: Record<EmploymentEventType, string> = {
  HIRED: 'Contratación',
  TERMINATED: 'Baja por despido',
  RESIGNED: 'Renuncia',
  SUSPENDED: 'Suspensión',
  REINSTATED: 'Reingreso',
}

export interface EmploymentEvent {
  id: string
  employeeId: string
  eventType: string
  effectiveDate: string
  notes: string | null
  createdBy: string | null
  createdAt: string
}

export interface ExceptionType {
  id: string
  legalEntityId: string | null
  code: string
  name: string
  /** Se paga aunque no se trabaje. */
  isPaid: boolean
  /** Cuenta como jornada trabajada para el cálculo. Es otra cosa que `isPaid`. */
  countsAsWorked: boolean
  requiresDocument: boolean
  priority: number
}

/** Fila de `GET /holidays`. `legalEntityId: null` = del calendario nacional. */
export interface Holiday {
  id: string
  legalEntityId: string | null
  countryCode: string
  holidayDate: string
  name: string
  /** Descanso obligatorio por ley: trabajarlo se paga distinto. */
  isMandatoryRest: boolean
}

export interface EmployeeException {
  id: string
  employeeId: string
  employeeCode: string | null
  employeeName: string | null
  exceptionTypeId: string
  exceptionCode: string
  exceptionName: string
  isPaid: boolean
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  documentRef: string | null
  approvedBy: string | null
  approvedAt: string | null
  createdAt: string
}

export interface UpdateEmployeeForm {
  firstName?: string
  lastName?: string
  secondLastName?: string
  curp?: string
  rfc?: string
  nss?: string
  birthDate?: string
  whatsappNumber?: string
  isActive?: boolean
}
