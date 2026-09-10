import { TTL_CATALOGO } from '@/shared/api/cache'
import { http } from '@/shared/api/http'
import { CURP_OFICIAL, RFC_OFICIAL } from './identidad'
import { E164, aE164 } from './telefono'
import type { Paginated } from '@/shared/api/pagination'
import type {
  EmployeeDependencies,
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
  /**
   * Escribe su correo de alta en la bandeja de salida.
   *
   * La CLAVE va por parámetro porque no está en la base: se genera al enrolar y
   * se devuelve una sola vez. Este es el único instante en que se puede meter
   * en el correo, y por eso se manda desde aquí y no desde el servidor.
   */
  welcomeEmail: (employeeId: string, clave?: string) =>
    http.post<{ encolado: boolean; motivo?: string }>(
      `/employees/${employeeId}/welcome-email`,
      clave ? { clave } : {},
    ),

  list: (query: EmployeeQuery, signal?: AbortSignal) =>
    http.get<Paginated<Employee>>('/employees', { query: toListQuery(query), signal }),

  get: (id: string, signal?: AbortSignal) =>
    http.get<EmployeeDetail>(`/employees/${id}`, { signal }),

  /** Qué se llevaría por delante el borrado. Se pregunta ANTES de ofrecerlo. */
  dependencies: (id: string, signal?: AbortSignal) =>
    http.get<EmployeeDependencies>(`/employees/${id}/dependencies`, { signal }),

  /**
   * BORRA de verdad, con su historial. No se puede deshacer.
   *
   * El nombre tecleado viaja al servidor y ES ÉL quien lo comprueba: la
   * pantalla se puede saltar, el servidor no.
   */
  purge: (id: string, confirmName: string) =>
    http.delete<void>(`/employees/${id}/permanently`, { confirmName }),

  create: (form: CreateEmployeeForm) => http.post<Employee>('/employees', toCreateDto(form)),

  /**
   * Abre una vigencia nueva y cierra la anterior el día previo, en una sola
   * transacción del backend. Es lo que le da turno —y por tanto hora de
   * entrada— a la persona.
   */
  assign: (employeeId: string, form: AssignmentForm) =>
    http.post<unknown>(`/employees/${employeeId}/assignments`, toAssignmentDto(form)),

  /**
   * La foto del expediente. Sustituye la que hubiera: una por persona.
   *
   * Se manda ya reducida por la pantalla —640 px de lado largo—, que es de
   * sobra para un rostro y evita subir tres megas de cámara de teléfono.
   */
  savePhoto: (id: string, dataUri: string) =>
    http.put<{ uploadedAt: string }>(`/employees/${id}/photo`, { dataUri }),

  /** Baja: el backend la desactiva, no la borra. La historia se conserva. */
  deactivate: (id: string) => http.delete<void>(`/employees/${id}`),

  /**
   * Turnos con sus bloques. Sin esto no se puede asignar horario, y sin horario
   * no hay forma de saber si alguien llegó tarde.
   */
  shiftPolicies: (legalEntityId: string | undefined, signal?: AbortSignal) =>
    http.get<ShiftPolicy[]>('/shift-policies', {
      query: { legalEntityId },
      signal,
      cacheTtlMs: TTL_CATALOGO,
    }),

  departments: (signal?: AbortSignal) =>
    http.get<Department[]>('/departments', { signal, cacheTtlMs: TTL_CATALOGO }),

  /** Solo los campos que cambiaron. `isActive: true` reactiva. */
  update: (id: string, changes: UpdateEmployeeForm) =>
    http.patch<Employee>(`/employees/${id}`, conTelefonoNormalizado(changes)),

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
    http.get<ExceptionType[]>('/exception-types', { signal, cacheTtlMs: TTL_CATALOGO }),

  exceptions: (q: {
      employeeId?: string
      from?: string
      to?: string
      /** Filtro de comodidad; el alcance lo aplica RLS en el servidor. */
      legalEntityId?: string
    },
    signal?: AbortSignal) =>
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
  /**
   * Los del año. Con `legalEntityId` se acota a esa razón social **y a los
   * globales**: un festivo de ley aplica a todas, y esconderlo al filtrar
   * convertiría el filtro en una trampa.
   */
  holidays: (
    year: number | undefined,
    legalEntityId?: string,
    signal?: AbortSignal,
  ) =>
    http.get<Holiday[]>('/holidays', { query: { year, legalEntityId }, signal }),

  /**
   * Alta de un festivo. La razón social es OBLIGATORIA y no admite nulo: uno
   * sin ella es de ley, lo ve todo el mundo, y no se crea desde aquí.
   */
  crearFestivo: (cuerpo: {
    legalEntityId: string
    holidayDate: string
    name: string
    isMandatoryRest: boolean
  }) => http.post<Holiday>('/holidays', cuerpo),

  actualizarFestivo: (
    id: string,
    cambios: { holidayDate?: string; name?: string; isMandatoryRest?: boolean },
  ) => http.patch<Holiday>(`/holidays/${id}`, cambios),

  borrarFestivo: (id: string) => http.delete<void>(`/holidays/${id}`),
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
    ['sex', 'sex'],
    ['whatsappNumber', 'whatsappNumber'],
    ['email', 'email'],
  ]

  for (const [campo, clave] of opcionales) {
    const valor = String(form[campo] ?? '').trim()
    if (valor !== '') dto[clave] = valor
  }

  /*
   * UN CURP A MEDIAS NO SE MANDA.
   *
   * La pantalla los propone armados desde el nombre, y a esa propuesta le
   * faltan siempre las últimas posiciones, que solo están en el documento. El
   * servidor exige el formato oficial completo, así que mandarlo incompleto
   * sería un 400 sobre un valor que ESTA aplicación puso sola. Se omite, y el
   * formulario avisa en pantalla de que se va a guardar vacío.
   */
  // El desplegable manda su centinela cuando no se eligió; el servidor solo
  // admite H o M, y «sin elegir» es no mandar el campo.
  if (dto.sex !== 'H' && dto.sex !== 'M') delete dto.sex

  if (dto.curp && !CURP_OFICIAL.test(dto.curp)) delete dto.curp
  if (dto.rfc && !RFC_OFICIAL.test(dto.rfc)) delete dto.rfc

  /*
   * El teléfono se normaliza AQUÍ, en el único sitio por donde pasa, y no en
   * cada formulario: así ninguno puede olvidarse. Lo que se convierte se
   * enseña en pantalla antes de guardar, no a espaldas de nadie.
   */
  if (dto.whatsappNumber) {
    const e164 = aE164(dto.whatsappNumber)
    if (E164.test(e164)) dto.whatsappNumber = e164
  }

  return dto
}

/**
 * El teléfono, en E.164, también al editar.
 *
 * Editar un expediente pasa por la misma regla del servidor que darlo de alta,
 * y sin esto corregir un nombre en una ficha que ya traía el teléfono en local
 * fallaría por un campo que nadie tocó.
 */
function conTelefonoNormalizado(cambios: UpdateEmployeeForm): UpdateEmployeeForm {
  const numero = cambios.whatsappNumber
  if (typeof numero !== 'string' || numero.trim() === '') return cambios

  const e164 = aE164(numero)
  return E164.test(e164) ? { ...cambios, whatsappNumber: e164 } : cambios
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
    estado: query.estado,
  }
}
