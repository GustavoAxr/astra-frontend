<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAsync } from '@/shared/composables/useAsync'
import { todayLocal } from '@/shared/date'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import { useLegalEntityFilter } from '@/modules/org/store'
import { attendanceApi } from '../api'
import type { PendingOvertimePerson } from '../types'

const aviso = useAviso()

/**
 * La bandeja del tiempo extra QUE MIDIÓ EL RELOJ.
 *
 * Es lo que faltaba entre el motor y los permisos: cuando alguien se queda de
 * más y su turno exige autorización, el cálculo lo marca como «trabajado sin
 * autorizar» y ahí moría. RRHH entraba a los permisos y no veía nada, porque
 * nadie había pedido nada — lo pidió el reloj.
 *
 * SE AGRUPA POR PERSONA porque así se decide: «a Alejandro se le pagan sus
 * horas de agosto». Ver cuarenta días sueltos de doce personas mezclados
 * obliga a reconstruir mentalmente a quién pertenece cada uno.
 *
 * EL UMBRAL YA VIENE APLICADO por el motor. Un día en el que alguien se quedó
 * doce minutos de más no aparece si su turno cuenta el extra desde veinte, y
 * eso se DICE en pantalla: una lista sin explicación de por qué falta un día
 * parece un dato perdido.
 */

const emit = defineEmits<{ resuelto: [] }>()

const { selectedId } = storeToRefs(useLegalEntityFilter())

/** Un mes hacia atrás: lo que cabe en una quincena de nómina y su anterior. */
const hasta = ref(todayLocal())
const desde = ref(
  new Date(Date.parse(`${todayLocal()}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10),
)

const pendientes = useAsync((signal) =>
  attendanceApi.pendingOvertime(
    { from: desde.value, to: hasta.value, legalEntityId: selectedId.value ?? undefined },
    signal,
  ),
)

const personas = computed(() => pendientes.data.value?.people ?? [])
const totales = computed(() => pendientes.data.value?.totals)

/** Quién está desplegado. Se abre sola si hay una sola persona. */
const abiertas = ref(new Set<string>())

function alternar(id: string): void {
  const copia = new Set(abiertas.value)
  if (copia.has(id)) copia.delete(id)
  else copia.add(id)
  abiertas.value = copia
}

/**
 * Los días marcados de cada persona.
 *
 * Vacío significa «todos los suyos», no «ninguno»: quien entra a esta pantalla
 * viene a aceptar el bloque, y obligar a marcar treinta casillas para lo normal
 * sería trabajo inventado. Marcar sirve para lo excepcional: aceptar unos días
 * y rechazar otros.
 */
const marcados = ref(new Map<string, Set<string>>())

function diasElegidos(p: PendingOvertimePerson): string[] {
  const suyos = marcados.value.get(p.employeeId)
  if (!suyos || suyos.size === 0) return p.days.map((d) => d.workDate)
  return p.days.filter((d) => suyos.has(d.workDate)).map((d) => d.workDate)
}

function estaMarcado(employeeId: string, fecha: string): boolean {
  return marcados.value.get(employeeId)?.has(fecha) ?? false
}

function alternarDia(employeeId: string, fecha: string): void {
  const copia = new Map(marcados.value)
  const suyos = new Set(copia.get(employeeId) ?? [])
  if (suyos.has(fecha)) suyos.delete(fecha)
  else suyos.add(fecha)
  copia.set(employeeId, suyos)
  marcados.value = copia
}

const hayMarcados = (employeeId: string): boolean => (marcados.value.get(employeeId)?.size ?? 0) > 0

/** Minutos de lo que se va a firmar, para decirlo antes de firmarlo. */
function minutosElegidos(p: PendingOvertimePerson): number {
  const elegidos = new Set(diasElegidos(p))
  return p.days.filter((d) => elegidos.has(d.workDate)).reduce((suma, d) => suma + d.minutes, 0)
}

// ── Firmar ───────────────────────────────────────────────────────────────

const trabajando = ref<string | null>(null)
const error = ref<Error | null>(null)

/** El rechazo abre un diálogo: sin motivo no se puede rechazar. */
const rechazando = ref<{ persona: PendingOvertimePerson; dias: string[] } | null>(null)
const motivo = ref('')

async function aceptar(p: PendingOvertimePerson): Promise<void> {
  await resolver(p, diasElegidos(p), 'APPROVED')
}

function pedirMotivo(p: PendingOvertimePerson): void {
  motivo.value = ''
  rechazando.value = { persona: p, dias: diasElegidos(p) }
}

async function confirmarRechazo(): Promise<void> {
  const pendiente = rechazando.value
  if (!pendiente || motivo.value.trim().length < 5) return
  await resolver(pendiente.persona, pendiente.dias, 'REJECTED', motivo.value.trim())
  rechazando.value = null
}

async function resolver(
  p: PendingOvertimePerson,
  workDates: string[],
  status: 'APPROVED' | 'REJECTED',
  note?: string,
): Promise<void> {
  if (trabajando.value || workDates.length === 0) return
  trabajando.value = p.employeeId
  error.value = null

  try {
    await attendanceApi.resolveDetected({
      employeeId: p.employeeId,
      workDates,
      status,
      note,
    })
    marcados.value = new Map()
    // El plural se calcula: «1 día» y «3 días» los lee la misma persona.
    const dias = `${workDates.length} ${workDates.length === 1 ? 'día' : 'días'}`
    aviso.hecho(
      status === 'APPROVED' ? 'Tiempo extra aprobado' : 'Tiempo extra rechazado',
      `${p.employeeName} · ${dias}`,
    )
    await pendientes.run()
    // La otra lista de la pantalla acaba de cambiar: ahí aparecen ya firmados.
    emit('resuelto')
  } catch (fallo) {
    error.value = fallo instanceof Error ? fallo : new Error(String(fallo))
  } finally {
    trabajando.value = null
  }
}

// ── Formato ──────────────────────────────────────────────────────────────

function hhmm(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

const fechaLarga = new Intl.DateTimeFormat('es-MX', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
function dia(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return fechaLarga.format(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1))
}

const hora = new Intl.DateTimeFormat('es-MX', { timeStyle: 'short' })
const reloj = (iso: string | null): string => (iso ? hora.format(new Date(iso)) : '—')

/** Los umbrales que hay en juego, para explicar qué días NO están en la lista. */
const umbrales = computed(() => {
  const vistos = new Set<number>()
  for (const p of personas.value) for (const d of p.days) vistos.add(d.thresholdMinutes)
  return [...vistos].sort((a, b) => a - b)
})

watch([desde, hasta, selectedId], () => void pendientes.run(), { immediate: true })

defineExpose({ recargar: () => void pendientes.run() })
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="font-medium">Detectado por el reloj</h2>
        <span v-if="totales && totales.people > 0" class="text-warning text-sm">
          {{ hhmm(totales.minutes) }} de {{ totales.people }}
          {{ totales.people === 1 ? 'persona' : 'personas' }} · {{ totales.days }}
          {{ totales.days === 1 ? 'día' : 'días' }}
        </span>
        <div class="ml-auto flex items-center gap-2">
          <UInput v-model="desde" type="date" class="w-36" />
          <UInput v-model="hasta" type="date" class="w-36" />
        </div>
      </div>
    </template>

    <ApiErrorAlert :error="pendientes.error.value" />
    <ApiErrorAlert :error="error" />

    <div v-if="pendientes.pending.value && !pendientes.loaded.value" class="text-muted text-sm">
      Calculando…
    </div>

    <p v-else-if="personas.length === 0" class="text-muted text-sm">
      Nadie tiene horas de más pendientes de resolver en este periodo.
      <span v-if="umbrales.length" class="text-dimmed">
        El tiempo extra empieza a contar a partir de
        {{ umbrales.join(' y ') }} minutos, según el turno de cada quien.
      </span>
    </p>

    <template v-else>
      <ul class="space-y-2">
        <li
          v-for="p in personas"
          :key="p.employeeId"
          class="border-default bg-elevated/20 overflow-hidden rounded-xl border"
        >
          <div class="flex flex-wrap items-center gap-2 px-4 py-3">
            <UButton
              :icon="
                abiertas.has(p.employeeId) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
              "
              square
              size="xs"
              :aria-label="`Ver los días de ${p.employeeName}`"
              @click="alternar(p.employeeId)"
            />
            <span class="text-dimmed font-mono text-xs">{{ p.employeeCode }}</span>
            <span class="text-highlighted font-medium">{{ p.employeeName }}</span>
            <span v-if="p.legalEntityName" class="text-dimmed text-xs">
              · {{ p.legalEntityName }}
            </span>

            <span class="text-warning ml-auto text-sm">
              {{ hhmm(p.totalMinutes) }}
              <span class="text-dimmed text-xs">
                en {{ p.days.length }} {{ p.days.length === 1 ? 'día' : 'días' }}
              </span>
            </span>

            <!--
              Lo que se va a firmar se dice ANTES de firmarlo. Con días marcados
              el botón cambia de texto: «aceptar 2 días» y «aceptar todo» no son
              lo mismo y no se pueden parecer.
            -->
            <div class="flex gap-1">
              <UButton
                icon="i-lucide-x"
                :label="
                  hayMarcados(p.employeeId) ? `Rechazar ${diasElegidos(p).length}` : 'Rechazar todo'
                "
                size="xs"
                color="error"
                :loading="trabajando === p.employeeId"
                @click="pedirMotivo(p)"
              />
              <UButton
                icon="i-lucide-check"
                :label="
                  hayMarcados(p.employeeId)
                    ? `Aceptar ${diasElegidos(p).length} (${hhmm(minutosElegidos(p))})`
                    : `Aceptar todo (${hhmm(p.totalMinutes)})`
                "
                size="xs"
                color="success"
                :loading="trabajando === p.employeeId"
                @click="aceptar(p)"
              />
            </div>
          </div>

          <!-- El detalle de cada día: de dónde salen esos minutos. -->
          <div v-if="abiertas.has(p.employeeId)" class="border-default border-t px-4 py-2">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-dimmed text-left text-xs">
                  <th class="w-8 py-1"></th>
                  <th class="py-1 font-medium">Día</th>
                  <th class="py-1 font-medium">Turno</th>
                  <th class="py-1 font-medium">Primera / última</th>
                  <th class="py-1 text-right font-medium">Trabajado</th>
                  <th class="py-1 text-right font-medium">De más</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="d in p.days"
                  :key="d.workDate"
                  class="border-default border-t"
                  :class="estaMarcado(p.employeeId, d.workDate) ? 'bg-elevated/40' : ''"
                >
                  <td class="py-1.5">
                    <UCheckbox
                      :model-value="estaMarcado(p.employeeId, d.workDate)"
                      :aria-label="`Elegir el ${d.workDate}`"
                      @update:model-value="alternarDia(p.employeeId, d.workDate)"
                    />
                  </td>
                  <td class="py-1.5 capitalize">
                    {{ dia(d.workDate) }}
                    <!-- Trabajar en descanso cuenta entero: no hay umbral que valga. -->
                    <UBadge
                      v-if="d.isRestDay"
                      label="Descanso"
                      color="neutral"
                      size="sm"
                      class="ml-1"
                    />
                  </td>
                  <td class="text-muted py-1.5 text-xs">
                    <span v-if="d.expectedStart">
                      {{ reloj(d.expectedStart) }} → {{ reloj(d.expectedEnd) }}
                    </span>
                    <span v-else class="text-dimmed">sin horario</span>
                  </td>
                  <td class="text-muted py-1.5 text-xs">
                    {{ reloj(d.firstPunch) }} → {{ reloj(d.lastPunch) }}
                    <span v-if="d.punchCount > 2" class="text-dimmed"> ({{ d.punchCount }}) </span>
                  </td>
                  <td class="py-1.5 text-right">{{ hhmm(d.workedMinutes) }}</td>
                  <td class="text-warning py-1.5 text-right font-medium">
                    {{ hhmm(d.minutes) }}
                  </td>
                </tr>
              </tbody>
            </table>

            <p class="text-dimmed mt-2 text-xs">
              Marca días sueltos solo si vas a decidir distinto en cada uno. Sin nada marcado, los
              botones actúan sobre los {{ p.days.length }} días.
            </p>
          </div>
        </li>
      </ul>

      <p v-if="umbrales.length" class="text-dimmed mt-3 text-xs">
        Solo aparece lo que cuenta como tiempo extra: el exceso por debajo de
        {{ umbrales.join(' o ') }} minutos —según el turno de cada quien— no genera horas y por eso
        no está en esta lista. El umbral se cambia en cada turno.
      </p>
    </template>

    <!--
      Rechazar SIEMPRE pide motivo. No pagar unas horas que alguien trabajó sin
      dejar por escrito el porqué no se sostiene cuando esa persona pregunta.
    -->
    <UModal
      :open="rechazando !== null"
      title="Por qué no se autorizan"
      @update:open="
        (v: boolean) => {
          if (!v) rechazando = null
        }
      "
    >
      <template #body>
        <div v-if="rechazando" class="space-y-4">
          <p class="text-muted text-sm">
            {{ rechazando.persona.employeeName }} ·
            {{ rechazando.dias.length }}
            {{ rechazando.dias.length === 1 ? 'día' : 'días' }}
          </p>

          <UFormField
            label="Motivo"
            required
            help="Queda guardado con el rechazo y es lo que se le lee a la persona cuando pregunte."
          >
            <UTextarea
              v-model="motivo"
              :rows="3"
              placeholder="Se quedó por decisión propia, sin trabajo asignado fuera de jornada."
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton label="Cancelar" @click="rechazando = null" />
            <UButton
              label="Rechazar"
              color="error"
              icon="i-lucide-x"
              :disabled="motivo.trim().length < 5"
              :loading="trabajando !== null"
              @click="confirmarRechazo"
            />
          </div>
        </div>
      </template>
    </UModal>
  </UCard>
</template>
