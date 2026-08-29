import { http } from '@/shared/api/http'
import type { ShiftPolicy, ShiftSegment } from '@/modules/employees/types'
import type { Dependencies } from '@/modules/org/types'

/**
 * Un bloque tal como se manda al servidor. Sin `id`: al guardar, los bloques se
 * reemplazan enteros. Editar un horario es redibujar la semana, no parchear un
 * campo suelto, y nadie apunta a un bloque concreto.
 */
export interface ShiftSegmentForm {
  cycleDay: number
  sequence: number
  segmentName?: string
  isRestDay: boolean
  startTime?: string
  durationMinutes?: number
  graceInMinutes?: number
  graceOutMinutes?: number
  earlyInToleranceMinutes?: number
  breakMinutes?: number
  breakIsPaid?: boolean
  breakAutoDeduct?: boolean
}

export interface ShiftPolicyForm {
  /* Sin `code`: lo genera el servidor al crear. */
  name: string
  scheduleMode: string
  cycleType: string
  cycleLengthDays: number
  journeyType: string
  targetMinutesPerCycle?: number
  roundingMinutes: number
  roundingMode: string
  minOvertimeMinutes: number
  overtimeRequiresApproval: boolean
  workdayAnchor: string
  segments: ShiftSegmentForm[]
}

/**
 * El cuerpo se arma campo por campo con estos `toXxx`. El backend tiene
 * `forbidNonWhitelisted`: un campo de más devuelve 400. Nunca se reenvía el
 * objeto que vino de un GET, que trae `id`, `isActive` y los `id` de los
 * bloques.
 */
function toSegmentDto(s: ShiftSegmentForm): Record<string, unknown> {
  const base: Record<string, unknown> = {
    cycleDay: s.cycleDay,
    sequence: s.sequence,
    isRestDay: s.isRestDay,
  }
  if (s.segmentName?.trim()) base.segmentName = s.segmentName.trim()
  if (s.isRestDay) return base

  base.startTime = s.startTime
  base.durationMinutes = s.durationMinutes
  base.graceInMinutes = s.graceInMinutes ?? 10
  base.graceOutMinutes = s.graceOutMinutes ?? 10
  base.earlyInToleranceMinutes = s.earlyInToleranceMinutes ?? 0
  base.breakMinutes = s.breakMinutes ?? 0
  base.breakIsPaid = s.breakIsPaid ?? true
  base.breakAutoDeduct = s.breakAutoDeduct ?? false
  return base
}

function toPolicyDto(form: ShiftPolicyForm): Record<string, unknown> {
  const dto: Record<string, unknown> = {
    name: form.name.trim(),
    scheduleMode: form.scheduleMode,
    cycleType: form.cycleType,
    cycleLengthDays: form.cycleLengthDays,
    journeyType: form.journeyType,
    roundingMinutes: form.roundingMinutes,
    roundingMode: form.roundingMode,
    minOvertimeMinutes: form.minOvertimeMinutes,
    overtimeRequiresApproval: form.overtimeRequiresApproval,
    workdayAnchor: form.workdayAnchor,
    segments: form.segments.map(toSegmentDto),
  }
  // Solo viaja donde significa algo: en un turno de horario fijo, un objetivo
  // de minutos por ciclo no quiere decir nada y el servidor lo rechazaría.
  if (form.scheduleMode === 'FLEXIBLE' && form.targetMinutesPerCycle) {
    dto.targetMinutesPerCycle = form.targetMinutesPerCycle
  }
  return dto
}

export const shiftsApi = {
  list: (legalEntityId: string | undefined, incluirInactivos: boolean, signal?: AbortSignal) =>
    http.get<ShiftPolicy[]>('/shift-policies', {
      query: { legalEntityId, incluirInactivos: incluirInactivos ? 'true' : undefined },
      signal,
    }),

  get: (id: string, signal?: AbortSignal) =>
    http.get<ShiftPolicy>(`/shift-policies/${id}`, { signal }),

  create: (legalEntityId: string, form: ShiftPolicyForm) =>
    http.post<ShiftPolicy>('/shift-policies', { legalEntityId, ...toPolicyDto(form) }),

  update: (id: string, form: ShiftPolicyForm) =>
    http.patch<ShiftPolicy>(`/shift-policies/${id}`, toPolicyDto(form)),

  /** Retirar de circulación sin perder el historial. No es borrar. */
  setActive: (id: string, isActive: boolean) =>
    http.patch<ShiftPolicy>(`/shift-policies/${id}`, { isActive }),

  dependencies: (id: string) => http.get<Dependencies>(`/shift-policies/${id}/dependencies`),

  remove: (id: string) => http.delete<void>(`/shift-policies/${id}`),
}

/** Los bloques guardados, de vuelta al formulario. */
export function toForm(policy: ShiftPolicy): ShiftPolicyForm {
  return {
    name: policy.name,
    scheduleMode: policy.scheduleMode,
    cycleType: policy.cycleType,
    cycleLengthDays: policy.cycleLengthDays,
    journeyType: policy.journeyType,
    targetMinutesPerCycle: policy.targetMinutesPerCycle ?? undefined,
    roundingMinutes: policy.roundingMinutes,
    roundingMode: policy.roundingMode,
    minOvertimeMinutes: policy.minOvertimeMinutes,
    overtimeRequiresApproval: policy.overtimeRequiresApproval,
    workdayAnchor: policy.workdayAnchor,
    segments: policy.segments.map((s: ShiftSegment) => ({
      cycleDay: s.cycleDay,
      sequence: s.sequence,
      segmentName: s.segmentName ?? undefined,
      isRestDay: s.isRestDay,
      // La base guarda `HH:MM:SS`; el campo de hora del navegador quiere `HH:MM`.
      startTime: s.startTime?.slice(0, 5),
      durationMinutes: s.durationMinutes ?? undefined,
      graceInMinutes: s.graceInMinutes,
      graceOutMinutes: s.graceOutMinutes,
      earlyInToleranceMinutes: s.earlyInToleranceMinutes,
      breakMinutes: s.breakMinutes,
      breakIsPaid: s.breakIsPaid,
      breakAutoDeduct: s.breakAutoDeduct,
    })),
  }
}
