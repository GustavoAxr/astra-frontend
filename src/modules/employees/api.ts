import { http } from '@/shared/api/http'
import type { Paginated } from '@/shared/api/pagination'
import type {
  AssignmentForm,
  CreateEmployeeForm,
  Department,
  Employee,
  EmployeeDetail,
  EmployeeException,
  EmployeeQuery,
  EmploymentEvent,
  ExceptionType,
  Holiday,
  ShiftPolicy,
  UpdateEmployeeForm,
} from './types'

export const employeesApi = {
  list: (query: EmployeeQuery, signal?: AbortSignal) =>
    http.get<Paginated<Employee>>('/employees', { query: toListQuery(query), signal }),

  get: (id: string, signal?: AbortSignal) =>
    http.get<EmployeeDetail>(`/employees/${id}`, { signal }),

  create: (form: CreateEmployeeForm) => http.post<Employee>('/employees', toCreateDto(form)),

  /**
   * Abre una vigencia nueva y cierra la anterior el día previo, en una sola
   * transacción del backend. Es lo que le da turno —y por tanto hora de
   * entrada— a la persona.
   */
  assign: (employeeId: string, form: AssignmentForm) =>
    http.post<unknown>(`/employees/${employeeId}/assignments`, toAssignmentDto(form)),

  /** Baja: el backend la desactiva, no la borra. La historia se conserva. */
  deactivate: (id: string) => http.delete<void>(`/employees/${id}`),

  /**
   * Turnos con sus bloques. Sin esto no se puede asignar horario, y sin horario
   * no hay forma de saber si alguien llegó tarde.
   */
  shiftPolicies: (legalEntityId: string | undefined, signal?: AbortSignal) =>
    http.get<ShiftPolicy[]>('/shift-policies', { query: { legalEntityId }, signal }),

  departments: (signal?: AbortSignal) => http.get<Department[]>('/departments', { signal }),

  /** Solo los campos que cambiaron. `isActive: true` reactiva. */
  update: (id: string, changes: UpdateEmployeeForm) =>
    http.patch<Employee>(`/employees/${id}`, changes),

  events: (employeeId: string, signal?: AbortSignal) =>
    http.get<EmploymentEvent[]>(`/employees/${employeeId}/events`, { signal }),

  addEvent: (
    employeeId: string,
    input: { eventType: string; effectiveDate: string; notes?: string },
  ) =>
    http.post<EmploymentEvent>(`/employees/${employeeId}/events`, {
      eventType: input.eventType,
      effectiveDate: input.effectiveDate,
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    }),

  exceptionTypes: (signal?: AbortSignal) =>
    http.get<ExceptionType[]>('/exception-types', { signal }),

  exceptions: (q: { employeeId?: string; from?: string; to?: string }, signal?: AbortSignal) =>
    http.get<EmployeeException[]>('/employee-exceptions', { query: { ...q }, signal }),

  addException: (input: {
    employeeId: string
    exceptionTypeId: string
    startDate: string
    endDate: string
    documentRef?: string
  }) =>
    http.post<EmployeeException>('/employee-exceptions', {
      employeeId: input.employeeId,
      exceptionTypeId: input.exceptionTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      ...(input.documentRef?.trim() ? { documentRef: input.documentRef.trim() } : {}),
    }),

  removeException: (id: string) => http.delete<void>(`/employee-exceptions/${id}`),

  /** Festivos del calendario. `year` omitido = los del año en curso del servidor. */
  holidays: (year: number | undefined, signal?: AbortSignal) =>
    http.get<Holiday[]>('/holidays', { query: { year }, signal }),
}

/** Campo por campo. Los opcionales vacíos no se mandan: sobrar es 400. */
function toCreateDto(form: CreateEmployeeForm): Record<string, string> {
  const dto: Record<string, string> = {
    legalEntityId: form.legalEntityId,
    ...(form.employeeCode ? { employeeCode: form.employeeCode } : {}),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
  }

  const opcionales: [keyof CreateEmployeeForm, string][] = [
    ['secondLastName', 'secondLastName'],
    ['curp', 'curp'],
    ['rfc', 'rfc'],
    ['nss', 'nss'],
    ['birthDate', 'birthDate'],
    ['whatsappNumber', 'whatsappNumber'],
  ]

  for (const [campo, clave] of opcionales) {
    const valor = String(form[campo] ?? '').trim()
    if (valor !== '') dto[clave] = valor
  }

  return dto
}

function toAssignmentDto(form: AssignmentForm): Record<string, string> {
  const dto: Record<string, string> = {
    installationId: form.installationId,
    shiftPolicyId: form.shiftPolicyId,
    cycleStartDate: form.cycleStartDate,
    validFrom: form.validFrom,
    reason: form.reason,
  }

  // Sin departamento es un caso válido, no un dato que falte: hay clientes que
  // no organizan así, y obligarlos a inventar uno es lo que llena la base de
  // basura.
  if (form.departmentId !== '') dto.departmentId = form.departmentId
  // Igual que el departamento: sin puesto es un caso válido, no un dato que falte.
  if (form.positionId !== '') dto.positionId = form.positionId

  return dto
}

/**
 * Campo por campo, como los cuerpos. Los vacíos no se mandan: `buildUrl` los
 * descarta, y así un filtro sin valor no viaja como la cadena "undefined".
 */
function toListQuery(query: EmployeeQuery): Record<string, string | number | boolean | undefined> {
  return {
    page: query.page,
    limit: query.limit,
    legalEntityId: query.legalEntityId,
    installationId: query.installationId,
    search: query.search,
    onlyActive: query.onlyActive,
  }
}
