<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAsync } from '@/shared/composables/useAsync'
import { todayLocal } from '@/shared/date'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { useAuthStore } from '@/modules/auth/store'
import { employeesApi } from '@/modules/employees/api'
import { attendanceApi } from '../api'
import { ADJUSTMENT_STATUS, ADJUSTMENT_TYPE, type Adjustment } from '../types'

/**
 * Permisos de tiempo extra: quién los pide y quién los firma.
 *
 * POR QUÉ EXISTE ESTA PANTALLA
 * El endpoint llevaba desde el principio y no había por dónde usarlo: en la
 * base había CERO permisos, con cuarenta y una personas en un turno que exige
 * autorizarlo. O sea, todo el tiempo extra del sistema estaba —y sigue
 * estando— «sin autorizar», no porque nadie lo mereciera sino porque no había
 * forma de firmarlo.
 *
 * LA SEPARACIÓN DE FIRMAS ES EL PUNTO
 * Un supervisor pide; RRHH o el administrador aprueban. Nadie aprueba lo suyo,
 * y eso no lo sostiene esta pantalla: lo impide una restricción de la base
 * (`approved_by <> requested_by`). Aquí solo se oculta el botón para no
 * ofrecer algo que va a fallar.
 */

const auth = useAuthStore()

/** Espejo de los `@Roles` del backend; oculta lo que no aplica, no protege. */
const puedeAprobar = computed(() => auth.can('approveOvertime'))
const puedePedir = computed(() => auth.can('requestOvertime'))

type Filtro = 'PENDING' | 'APPROVED' | 'REJECTED' | 'TODOS'

const FILTROS = [
  { label: 'Pendientes', value: 'PENDING' },
  { label: 'Aprobados', value: 'APPROVED' },
  { label: 'Rechazados', value: 'REJECTED' },
  { label: 'Todos', value: 'TODOS' },
]

/** Se entra a firmar lo que está esperando: ese es el trabajo de esta pantalla. */
const filtro = ref<Filtro>('PENDING')

const permisos = useAsync((signal) =>
  attendanceApi.adjustments(
    { status: filtro.value === 'TODOS' ? undefined : filtro.value },
    signal,
  ),
)

const filas = computed(() => permisos.data.value ?? [])
const pendientes = computed(() => filas.value.filter((p) => p.status === 'PENDING').length)

// ── Pedir uno ────────────────────────────────────────────────────────────

const formAbierto = ref(false)

/**
 * Qué se está capturando. Son dos cosas distintas y conviene elegir antes de
 * llenar nada:
 *
 *   · «en sitio» autoriza horas que EL RELOJ YA MIDIÓ —se quedó de más y hay
 *     checadas que lo prueban—; el tope puede ir vacío;
 *   · «fuera de sede» AÑADE horas que no tienen checada ninguna, así que los
 *     minutos son obligatorios: no hay de dónde deducirlos.
 */
type TipoDePermiso = 'AUTHORIZE_OVERTIME' | 'REMOTE_WORK'

const TIPOS = [
  { label: 'Tiempo extra en sitio', value: 'AUTHORIZE_OVERTIME' },
  { label: 'Trabajo fuera de sede', value: 'REMOTE_WORK' },
]

const tipo = ref<TipoDePermiso>('AUTHORIZE_OVERTIME')
const esRemoto = computed(() => tipo.value === 'REMOTE_WORK')

const empleadoId = ref('')
const fecha = ref(todayLocal())
const minutos = ref<number | undefined>(undefined)
const motivo = ref('')
const guardando = ref(false)
const errorAlPedir = ref<Error | null>(null)

const empleados = useAsync((signal) => employeesApi.list({ page: 1, limit: 100 }, signal))

const empleadoItems = computed(() =>
  (empleados.data.value?.data ?? []).map((e) => ({
    label: `${e.employeeCode} · ${[e.firstName, e.lastName, e.secondLastName].filter(Boolean).join(' ')}`,
    value: e.id,
  })),
)

/** El motivo es obligatorio y con razón: nadie defiende un permiso sin motivo. */
const puedeGuardar = computed(
  () =>
    empleadoId.value !== '' &&
    fecha.value !== '' &&
    motivo.value.trim().length >= 5 &&
    // Sin checadas que midan nada, unos minutos vacíos serían un permiso para
    // pagar una cantidad que nadie escribió.
    (!esRemoto.value || (minutos.value !== undefined && minutos.value > 0)),
)

function abrirFormulario(): void {
  errorAlPedir.value = null
  tipo.value = 'AUTHORIZE_OVERTIME'
  empleadoId.value = ''
  fecha.value = todayLocal()
  minutos.value = undefined
  motivo.value = ''
  formAbierto.value = true
  if (!empleados.loaded.value) void empleados.run()
}

async function pedir(): Promise<void> {
  if (!puedeGuardar.value || guardando.value) return
  guardando.value = true
  errorAlPedir.value = null

  try {
    await attendanceApi.requestAdjustment({
      employeeId: empleadoId.value,
      workDate: fecha.value,
      adjustmentType: tipo.value,
      proposedMinutes: minutos.value,
      reason: motivo.value.trim(),
    })
    formAbierto.value = false
    await permisos.run()
  } catch (error) {
    errorAlPedir.value = error instanceof Error ? error : new Error(String(error))
  } finally {
    guardando.value = false
  }
}

// ── Firmar ───────────────────────────────────────────────────────────────

const resolviendo = ref<string | null>(null)
const errorAlFirmar = ref<Error | null>(null)

async function firmar(p: Adjustment, decision: 'approve' | 'reject'): Promise<void> {
  if (resolviendo.value) return
  resolviendo.value = p.id
  errorAlFirmar.value = null

  try {
    await attendanceApi.resolveAdjustment(p.id, decision)
    await permisos.run()
  } catch (error) {
    errorAlFirmar.value = error instanceof Error ? error : new Error(String(error))
  } finally {
    resolviendo.value = null
  }
}

/**
 * Si lo pidió quien está mirando, no se le ofrece firmarlo. El servidor lo
 * rechazaría igual; esto solo evita ofrecer un botón que siempre falla.
 */
const esMio = (p: Adjustment): boolean => p.requestedBy === auth.user?.id

const fechaLarga = new Intl.DateTimeFormat('es-MX', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
function dia(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return fechaLarga.format(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1))
}

const sello = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' })
const cuando = (iso: string | null): string => (iso ? sello.format(new Date(iso)) : '—')

function hhmm(min: number | null): string {
  if (min === null) return 'Lo que salga del día'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

watch(filtro, () => void permisos.run(), { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <PageHeader
      title="Permisos de tiempo extra"
      description="Un supervisor los pide y otra persona los firma. Sirven para las horas de más que midió el reloj y para el trabajo hecho fuera de la sede, que no pasó por él. Solo los aprobados cuentan."
      :count="permisos.loaded.value ? `${filas.length}` : undefined"
    >
      <template #actions>
        <USelectMenu v-model="filtro" :items="FILTROS" value-key="value" class="w-40" />
        <UButton
          v-if="puedePedir"
          icon="i-lucide-plus"
          label="Pedir permiso"
          @click="abrirFormulario"
        />
      </template>
    </PageHeader>

    <ApiErrorAlert :error="permisos.error.value" />
    <ApiErrorAlert :error="errorAlFirmar" />

    <div v-if="permisos.pending.value && !permisos.loaded.value" class="text-muted text-sm">
      Cargando…
    </div>

    <EmptyState
      v-else-if="filas.length === 0"
      icon="i-lucide-file-check"
      :title="filtro === 'PENDING' ? 'No hay nada que firmar' : 'No hay permisos que mostrar'"
      :description="
        filtro === 'PENDING'
          ? 'Cuando alguien pida autorización para trabajar fuera de jornada, aparecerá aquí.'
          : 'Cambia el filtro para ver los de otro estado.'
      "
    />

    <ul v-else class="space-y-2">
      <li
        v-for="p in filas"
        :key="p.id"
        class="border-default bg-elevated/20 rounded-xl border px-4 py-3"
        :class="p.status === 'PENDING' ? 'border-warning/40' : ''"
      >
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :label="ADJUSTMENT_STATUS[p.status]?.label ?? p.status"
            :color="ADJUSTMENT_STATUS[p.status]?.color ?? 'neutral'"
            size="sm"
          />
          <!--
            El tipo va junto al estado porque cambia lo que significa el
            permiso: uno firma horas que el reloj midió, el otro añade horas que
            no tienen checada. Quien aprueba necesita saber cuál está firmando.
          -->
          <UBadge
            :label="ADJUSTMENT_TYPE[p.adjustmentType]?.label ?? p.adjustmentType"
            :icon="ADJUSTMENT_TYPE[p.adjustmentType]?.icon"
            :color="p.adjustmentType === 'REMOTE_WORK' ? 'info' : 'neutral'"
            size="sm"
          />
          <span class="text-dimmed font-mono text-xs">{{ p.employeeCode }}</span>
          <span class="text-highlighted font-medium">{{ p.employeeName }}</span>
          <span class="text-muted text-sm capitalize">· {{ dia(p.workDate) }}</span>

          <!--
            El tope es la cifra que decide cuánto se paga, así que va destacada
            y no escondida entre el texto. Sin tope se autoriza lo que haya
            salido ese día, y eso también hay que poder leerlo de un vistazo.
          -->
          <span
            class="ml-auto text-sm"
            :class="p.proposedMinutes === null ? 'text-warning' : 'text-highlighted'"
          >
            {{ hhmm(p.proposedMinutes) }}
            <span v-if="p.adjustmentType === 'REMOTE_WORK'" class="text-dimmed text-xs">
              trabajadas
            </span>
          </span>
        </div>

        <p class="text-muted mt-1.5 text-sm">{{ p.reason }}</p>

        <div class="text-dimmed mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>Pedido por {{ p.requestedByName ?? '—' }} · {{ cuando(p.requestedAt) }}</span>
          <span v-if="p.approvedAt">
            {{ p.status === 'APPROVED' ? 'Aprobado' : 'Rechazado' }} por
            {{ p.approvedByName ?? '—' }} · {{ cuando(p.approvedAt) }}
          </span>

          <!--
            Firmar es de dos personas. Quien lo pidió no ve los botones; el
            servidor y la base lo impiden igual si alguien lo intenta por otro
            camino.
          -->
          <template v-if="p.status === 'PENDING' && puedeAprobar && !esMio(p)">
            <div class="ml-auto flex gap-1">
              <UButton
                icon="i-lucide-x"
                label="Rechazar"
                size="xs"
                color="error"
                :loading="resolviendo === p.id"
                @click="firmar(p, 'reject')"
              />
              <UButton
                icon="i-lucide-check"
                label="Aprobar"
                size="xs"
                color="success"
                :loading="resolviendo === p.id"
                @click="firmar(p, 'approve')"
              />
            </div>
          </template>
          <span v-else-if="p.status === 'PENDING' && esMio(p)" class="text-dimmed ml-auto">
            Lo pediste tú: tiene que firmarlo otra persona.
          </span>
          <span v-else-if="p.status === 'PENDING' && !puedeAprobar" class="text-dimmed ml-auto">
            Esperando la firma de Recursos Humanos.
          </span>
        </div>
      </li>
    </ul>

    <p v-if="pendientes > 0 && filtro !== 'PENDING'" class="text-warning text-sm">
      Hay {{ pendientes }} {{ pendientes === 1 ? 'permiso pendiente' : 'permisos pendientes' }} de
      firma en esta lista.
    </p>

    <!-- Pedir uno -->
    <UModal v-model:open="formAbierto" title="Pedir permiso de tiempo extra">
      <template #body>
        <form class="space-y-4" @submit.prevent="pedir">
          <UFormField
            label="Qué se autoriza"
            :help="
              esRemoto
                ? 'Horas trabajadas que NO pasaron por el reloj. Suman al tiempo extra y se quedan fuera de la jornada corrida: no dirán que estuvo de más en la oficina.'
                : 'Horas que el reloj YA midió y que exceden su jornada.'
            "
          >
            <USelectMenu v-model="tipo" :items="TIPOS" value-key="value" class="w-full" />
          </UFormField>

          <UFormField label="Persona" required>
            <USelectMenu
              v-model="empleadoId"
              :items="empleadoItems"
              value-key="value"
              placeholder="Busca por clave o nombre"
              searchable
              :loading="empleados.pending.value"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Día que se autoriza" required>
              <UInput v-model="fecha" type="date" class="w-full" />
            </UFormField>

            <UFormField
              :label="esRemoto ? 'Minutos trabajados' : 'Tope en minutos'"
              :required="esRemoto"
              :help="
                esRemoto
                  ? 'Obligatorio: no hay checadas de donde deducirlo.'
                  : 'Vacío autoriza lo que haya salido ese día.'
              "
            >
              <UInput
                v-model.number="minutos"
                type="number"
                min="1"
                :max="24 * 60"
                :placeholder="esRemoto ? 'Por ejemplo, 120' : 'Sin tope'"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            label="Motivo"
            required
            help="Se lee seis meses después, cuando alguien pregunta por qué se pagaron esas horas."
          >
            <UTextarea
              v-model="motivo"
              :rows="3"
              placeholder="Inventario de fin de mes, autorizado por dirección."
              class="w-full"
            />
          </UFormField>

          <ApiErrorAlert :error="errorAlPedir" />

          <p class="text-dimmed text-xs">
            Queda pendiente hasta que lo firme otra persona —ni siquiera quien lo captura puede
            aprobar lo suyo—.
            <template v-if="esRemoto">
              Hasta entonces esas horas no aparecen en ningún cálculo: sin checadas, lo único que
              las sostiene es la firma.
            </template>
            <template v-else>
              Mientras tanto, esas horas siguen contando como trabajadas sin autorizar.
            </template>
          </p>

          <div class="flex justify-end gap-2">
            <UButton label="Cancelar" @click="formAbierto = false" />
            <UButton
              type="submit"
              label="Pedir"
              icon="i-lucide-send"
              :loading="guardando"
              :disabled="!puedeGuardar"
            />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
