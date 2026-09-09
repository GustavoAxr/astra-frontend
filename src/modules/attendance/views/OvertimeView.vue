<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAsync } from '@/shared/composables/useAsync'
import { useLegalEntityFilter } from '@/modules/org/store'
import { devicesApi } from '@/modules/devices/api'
import { NINGUNO, sinNinguno } from '@/shared/ui/select-none'
import { todayLocal } from '@/shared/date'
import { nombreCompleto } from '@/shared/text'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { useAuthStore } from '@/modules/auth/store'
import { employeesApi } from '@/modules/employees/api'
import { attendanceApi } from '../api'
import DetectedOvertimeInbox from '../components/DetectedOvertimeInbox.vue'
import { ADJUSTMENT_STATUS, ADJUSTMENT_TYPE, PAPEL_DE_FIRMA, type Adjustment } from '../types'
import { firmasQueFaltan, puedeFirmar } from '../overtime-approval'

const aviso = useAviso()

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

/** La razón social de la barra superior. Filtro de comodidad, no alcance. */
const { selectedId } = storeToRefs(useLegalEntityFilter())

/**
 * EL RELOJ, cuando hay más de uno.
 *
 * Filtra por quién está ENROLADO en ese equipo, no por de dónde salió la
 * checada: una solicitud de tiempo extra no tiene reloj, la tiene la persona.
 * Con un solo equipo el desplegable se esconde.
 */
const relojId = ref<string>(NINGUNO)
const relojes = useAsync((signal) => devicesApi.list(undefined, signal))
void relojes.run()

const relojItems = computed(() => [
  { label: 'Todos los relojes', value: NINGUNO },
  ...(relojes.data.value ?? [])
    .filter((d) => selectedId.value === null || d.legalEntityId === selectedId.value)
    .map((d) => ({
      label: [d.brand, d.model].filter(Boolean).join(' ') || d.serialNumber,
      value: d.id,
    })),
])

const hayVariosRelojes = computed(() => relojItems.value.length > 2)

const permisos = useAsync((signal) =>
  attendanceApi.adjustments(
    {
      status: filtro.value === 'TODOS' ? undefined : filtro.value,
      legalEntityId: selectedId.value ?? undefined,
      deviceId: sinNinguno(relojId.value) || undefined,
    },
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

/**
 * Las dos clases de horas que se pueden pedir.
 *
 * «Fuera de sede» —trabajo desde casa o en un cliente— lo puede pedir cualquiera
 * que pueda pedir, incluida la gerencia. Antes estaba reservado a RRHH y
 * dirección porque una sola firma cerraba el permiso y son horas SIN CHECADA que
 * las respalde; con las dos firmas ese control lo hace la aprobación, no el rol
 * de quien redacta. El jefe de área es justo quien sabe que su gente trabajó
 * desde casa; lo que no puede es autorizarlo.
 */
const TIPOS = [
  { label: 'Tiempo extra en sitio', value: 'AUTHORIZE_OVERTIME' },
  { label: 'Fuera de sitio · home office', value: 'REMOTE_WORK' },
]

const tipo = ref<TipoDePermiso>('AUTHORIZE_OVERTIME')
const esRemoto = computed(() => tipo.value === 'REMOTE_WORK')

const empleadoId = ref('')
const fecha = ref(todayLocal())

/**
 * LA FRANJA, no los minutos sueltos.
 *
 * Una solicitud dice «de 18:00 a 22:00», no «240 minutos»: es la hora la que se
 * negocia con el trabajador y la que después se contrasta con sus checadas. Los
 * minutos los calcula el servidor a partir de las dos horas, para que no puedan
 * decir cosas distintas.
 */
const horaInicio = ref('18:00')
const horaFin = ref('22:00')

const minutosDeLaFranja = computed(() => {
  const aMin = (h: string): number => {
    const [hh, mm] = h.split(':').map(Number)
    return (hh ?? 0) * 60 + (mm ?? 0)
  }
  const i = aMin(horaInicio.value)
  const f = aMin(horaFin.value)
  // De 22:00 a 02:00 son cuatro horas, no menos veinte: cruza la medianoche.
  return f > i ? f - i : f + 24 * 60 - i
})

const minutos = ref<number | undefined>(undefined)
const motivo = ref('')
const guardando = ref(false)
const errorAlPedir = ref<Error | null>(null)

const empleados = useAsync((signal) => employeesApi.list({ page: 1, limit: 100 }, signal))

const empleadoItems = computed(() =>
  (empleados.data.value?.data ?? []).map((e) => ({
    label: `${e.employeeCode} · ${nombreCompleto(e)}`,
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
    minutosDeLaFranja.value > 0,
)

function abrirFormulario(): void {
  errorAlPedir.value = null
  tipo.value = 'AUTHORIZE_OVERTIME'
  empleadoId.value = ''
  fecha.value = todayLocal()
  horaInicio.value = '18:00'
  horaFin.value = '22:00'
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
      requestedStart: horaInicio.value,
      requestedEnd: horaFin.value,
      reason: motivo.value.trim(),
    })
    formAbierto.value = false
    aviso.hecho('Permiso solicitado', 'Queda pendiente de firma.')
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

/** Rechazar abre un diálogo: sin motivo por escrito no se rechaza nada. */
const rechazando = ref<Adjustment | null>(null)
const motivoDelRechazo = ref('')

function pedirMotivo(p: Adjustment): void {
  motivoDelRechazo.value = ''
  rechazando.value = p
}

async function confirmarRechazo(): Promise<void> {
  const p = rechazando.value
  if (!p || motivoDelRechazo.value.trim().length < 5) return
  await firmar(p, 'reject', motivoDelRechazo.value.trim())
  rechazando.value = null
}

async function firmar(p: Adjustment, decision: 'approve' | 'reject', note?: string): Promise<void> {
  if (resolviendo.value) return
  resolviendo.value = p.id
  errorAlFirmar.value = null

  try {
    await attendanceApi.resolveAdjustment(p.id, decision, note)
    aviso.hecho(decision === 'approve' ? 'Permiso aprobado' : 'Permiso rechazado', p.employeeName ?? undefined)
    await permisos.run()
  } catch (error) {
    errorAlFirmar.value = error instanceof Error ? error : new Error(String(error))
  } finally {
    resolviendo.value = null
  }
}

/** La firma de un papel concreto, si está puesta. */
const firmaDe = (p: Adjustment, papel: string) => p.approvals.find((f) => f.kind === papel)

const descargando = ref<string | null>(null)

async function descargar(p: Adjustment): Promise<void> {
  if (descargando.value) return
  descargando.value = p.id
  errorAlFirmar.value = null
  try {
    await attendanceApi.descargarSolicitud(p.id)
  } catch (error) {
    errorAlFirmar.value = error instanceof Error ? error : new Error(String(error))
  } finally {
    descargando.value = null
  }
}

/**
 * Si quien mira puede firmar ESTA solicitud, y si no, por qué.
 *
 * Antes solo se preguntaba «¿la pediste tú?», así que RRHH seguía viendo
 * «Aprobar» sobre una que ya había firmado: la pulsaba y le respondía un error.
 * Ahora se hacen las mismas preguntas que el servidor.
 */
const firmabilidad = (p: Adjustment) =>
  puedeFirmar(p, { id: auth.user?.id ?? '', roles: auth.roles })

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

watch([filtro, selectedId, relojId], () => void permisos.run(), { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <PageHeader
      title="Permisos de tiempo extra"
      description="Un supervisor los pide y otra persona los firma. Sirven para las horas de más que midió el reloj y para el trabajo hecho fuera de la sede, que no pasó por él. Solo los aprobados cuentan."
      :count="permisos.loaded.value ? `${filas.length}` : undefined"
    >
      <template #actions>
        <!--
          Solo con más de un equipo: un desplegable de una opción ocupa sitio y
          no ayuda. La razón social se elige arriba, en la barra de la
          aplicación, y desde ahí acota también esta lista.
        -->
        <USelectMenu
          v-if="hayVariosRelojes"
          v-model="relojId"
          :items="relojItems"
          value-key="value"
          icon="i-lucide-alarm-clock"
          class="w-52"
        />
        <USelectMenu v-model="filtro" :items="FILTROS" value-key="value" class="w-40" />
        <UButton
          v-if="puedePedir"
          icon="i-lucide-plus"
          label="Pedir permiso"
          @click="abrirFormulario"
        />
      </template>
    </PageHeader>

    <!--
      Primero lo que el reloj ya midió y nadie ha resuelto: es el trabajo real
      de esta pantalla y lo que había quedado invisible. Los permisos que
      alguien pidió a mano van debajo, que son muchos menos.
    -->
    <DetectedOvertimeInbox v-if="puedeAprobar" @resuelto="permisos.run()" />

    <ApiErrorAlert :error="permisos.error.value" />
    <ApiErrorAlert :error="errorAlFirmar" />

    <h2 class="text-highlighted pt-2 font-medium">Permisos pedidos y firmados</h2>

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

        <p v-if="p.requestedStart && p.requestedEnd" class="text-muted mt-1 text-sm">
          De {{ p.requestedStart.slice(0, 5) }} a {{ p.requestedEnd.slice(0, 5) }}
        </p>

        <p class="text-muted mt-1.5 text-sm">{{ p.reason }}</p>

        <!--
          LAS FIRMAS, cada una con su nombre. Se pintan también las que FALTAN:
          ver el hueco es lo que hace evidente que la solicitud todavía no está
          completa. Si la ausente no apareciera, una a medias se leería igual
          que una autorizada.
        -->
        <div v-if="p.requestedBy" class="mt-2 flex flex-wrap gap-4">
          <div v-for="papel in ['RRHH', 'DIRECCION']" :key="papel" class="min-w-[13rem]">
            <p class="text-dimmed text-xs">{{ PAPEL_DE_FIRMA[papel] }}</p>
            <template v-if="firmaDe(p, papel)">
              <p
                class="text-sm font-medium"
                :class="firmaDe(p, papel)!.decision === 'APPROVED' ? 'text-success' : 'text-error'"
              >
                {{ firmaDe(p, papel)!.decision === 'APPROVED' ? 'Autoriza' : 'No autoriza' }}
                <span class="text-muted font-normal">
                  · {{ firmaDe(p, papel)!.decidedByName ?? '—' }}
                </span>
              </p>
              <p v-if="firmaDe(p, papel)!.note" class="text-dimmed text-xs italic">
                «{{ firmaDe(p, papel)!.note }}»
              </p>
            </template>
            <p v-else class="text-warning text-sm">Pendiente de firma</p>
          </div>
        </div>

        <!--
          El motivo del rechazo se lee aquí y no en un registro escondido: es lo
          que se le contesta a la persona cuando pregunta por qué no le pagaron
          esas horas.
        -->
        <p v-if="p.resolutionNote" class="text-error mt-1 text-sm">
          <UIcon name="i-lucide-message-square-quote" class="inline size-3.5" />
          {{ p.resolutionNote }}
        </p>

        <div class="text-dimmed mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span v-if="p.requestedBy">
            Pedido por {{ p.requestedByName ?? '—' }} · {{ cuando(p.requestedAt) }}
          </span>
          <!-- Sin quien lo pida: lo midió el reloj y RRHH solo decidió. -->
          <span v-else>Detectado por el reloj · {{ cuando(p.requestedAt) }}</span>
          <span v-if="p.approvedAt">
            {{ p.status === 'APPROVED' ? 'Aprobado' : 'Rechazado' }} por
            {{ p.approvedByName ?? '—' }} · {{ cuando(p.approvedAt) }}
          </span>

          <!--
            El documento se puede bajar SIEMPRE, no solo al final: así es como
            circula. RRHH firma y el papel va a Dirección con esa firma puesta.
          -->
          <UButton
            icon="i-lucide-file-down"
            label="Solicitud en PDF"
            size="xs"
            :loading="descargando === p.id"
            @click="descargar(p)"
          />

          <!--
            Firmar es de dos personas. Quien lo pidió no ve los botones; el
            servidor y la base lo impiden igual si alguien lo intenta por otro
            camino.
          -->
          <div v-if="firmabilidad(p).puede" class="ml-auto flex gap-1">
            <UButton
              icon="i-lucide-x"
              label="Rechazar"
              size="xs"
              color="error"
              :loading="resolviendo === p.id"
              @click="pedirMotivo(p)"
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

          <!--
            Cuando no se puede firmar se dice POR QUÉ, en el mismo hueco donde
            irían los botones. Un espacio en blanco donde antes había un botón
            se lee como un fallo de la pantalla.
          -->
          <span
            v-else-if="p.status === 'PENDING' && firmabilidad(p).motivo"
            class="text-dimmed ml-auto"
          >
            {{ firmabilidad(p).motivo }}
          </span>
          <span v-else-if="p.status === 'PENDING'" class="text-dimmed ml-auto">
            Esperando firma de
            {{
              firmasQueFaltan(p)
                .map((f) => PAPEL_DE_FIRMA[f])
                .join(' y ')
            }}.
          </span>
        </div>
      </li>
    </ul>

    <p v-if="pendientes > 0 && filtro !== 'PENDING'" class="text-warning text-sm">
      Hay {{ pendientes }} {{ pendientes === 1 ? 'permiso pendiente' : 'permisos pendientes' }} de
      firma en esta lista.
    </p>

    <!-- Rechazar un permiso: siempre con motivo. -->
    <UModal
      :open="rechazando !== null"
      title="Por qué no se autoriza"
      @update:open="
        (v: boolean) => {
          if (!v) rechazando = null
        }
      "
    >
      <template #body>
        <div v-if="rechazando" class="space-y-4">
          <p class="text-muted text-sm">
            {{ rechazando.employeeName }} · {{ dia(rechazando.workDate) }} ·
            {{ hhmm(rechazando.proposedMinutes) }}
          </p>

          <UFormField
            label="Motivo"
            required
            help="Queda guardado con el rechazo y es lo que se le lee a la persona cuando pregunte."
          >
            <UTextarea
              v-model="motivoDelRechazo"
              :rows="3"
              placeholder="No había trabajo asignado fuera de jornada ese día."
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton label="Cancelar" @click="rechazando = null" />
            <UButton
              label="Rechazar"
              color="error"
              icon="i-lucide-x"
              :disabled="motivoDelRechazo.trim().length < 5"
              :loading="resolviendo !== null"
              @click="confirmarRechazo"
            />
          </div>
        </div>
      </template>
    </UModal>

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

            <UFormField label="De" required>
              <UInput v-model="horaInicio" type="time" class="w-full" />
            </UFormField>

            <UFormField label="A" required :help="`Son ${hhmm(minutosDeLaFranja)}.`">
              <UInput v-model="horaFin" type="time" class="w-full" />
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
