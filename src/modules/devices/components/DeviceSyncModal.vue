<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import { todayLocal } from '@/shared/date'
import { devicesApi } from '../api'
import type { Device, SyncOutcome } from '../types'

const props = defineProps<{ device: Device }>()
const emit = defineEmits<{ synced: [] }>()
const aviso = useAviso()

const open = defineModel<boolean>('open', { default: false })

const username = ref('admin')
const password = ref('')
const working = ref(false)
const error = ref<Error | null>(null)

/**
 * DESDE DÓNDE SE LEE.
 *
 * Por omisión, desde la marca de agua: es lo correcto en el día a día y lo que
 * hace que un corte de tres días se recupere solo.
 *
 * Las otras dos existen porque la marca AVANZA con cada lectura completa. Si
 * las checadas se borran de la base, el reloj las sigue teniendo pero ya no las
 * ofrece —para él están entregadas— y cada clic solo traería lo ocurrido desde
 * la vez anterior. Releer NO duplica: la clave de cada checada es determinista
 * y una repetida se cuenta como «ya estaba».
 *
 * La marca se queda un par de minutos por detrás del momento de leer, a
 * propósito: el equipo tarda unos segundos en indexar un evento y una marca
 * puesta en «ahora» se los saltaría para siempre. Ver `isapi.reader.ts`.
 */
type Alcance = 'marca' | 'fecha' | 'todo'

const ALCANCES = [
  { label: 'Desde la última lectura', value: 'marca' },
  { label: 'Desde una fecha', value: 'fecha' },
  { label: 'Todo lo que tenga el reloj', value: 'todo' },
]

/**
 * «Todo» es una fecha muy anterior a cualquier equipo instalado, no un valor
 * mágico en la API: el servidor sigue recibiendo una fecha y nada más, que es
 * más fácil de razonar que un caso especial escondido.
 */
const PRINCIPIO_DE_LOS_TIEMPOS = '2000-01-01'

const alcance = ref<Alcance>('marca')
const desde = ref(todayLocal().slice(0, 8) + '01')

const desdeQueMandar = computed(() => {
  if (alcance.value === 'todo') return PRINCIPIO_DE_LOS_TIEMPOS
  if (alcance.value === 'fecha') return desde.value
  return undefined
})

/** Lo acumulado en esta sesión de lectura, no solo la última llamada. */
const total = ref({ batches: 0, inserted: 0, duplicates: 0, unmatched: 0 })
const last = ref<SyncOutcome | null>(null)
const vueltas = ref(0)

const canRead = computed(() => username.value.trim() !== '' && password.value !== '')
const started = computed(() => last.value !== null)

/**
 * CUÁNTAS VUELTAS SEGUIDAS COMO MUCHO.
 *
 * Cada llamada trae hasta trescientos eventos. Con treinta vueltas se recogen
 * nueve mil de un solo clic, que es más de lo que guarda un equipo de estos. El
 * tope existe para que un reloj que contestara `hasMore` para siempre —por un
 * error suyo o nuestro— no dejara la pantalla girando sin fin.
 */
const VUELTAS_MAXIMAS = 30

watch(open, (isOpen) => {
  if (isOpen) return
  // La contraseña del equipo se olvida al cerrar: no vive más que lo necesario.
  password.value = ''
  error.value = null
  last.value = null
  vueltas.value = 0
  alcance.value = 'marca'
  total.value = { batches: 0, inserted: 0, duplicates: 0, unmatched: 0 }
})

/**
 * Lee hasta que el equipo diga que no queda nada.
 *
 * UN CLIC, NO QUINCE. El servidor devuelve como mucho unos trescientos eventos
 * por llamada —el reloj pagina de treinta en treinta— y antes había que pulsar
 * «seguir leyendo» hasta que la etiqueta cambiara. Con tres mil eventos eso son
 * once pulsaciones seguidas mirando una pantalla, que no es trabajo de nadie.
 */
async function read(): Promise<void> {
  if (!canRead.value || working.value) return
  working.value = true
  error.value = null
  vueltas.value = 0

  try {
    for (let i = 0; i < VUELTAS_MAXIMAS; i += 1) {
      const outcome = await devicesApi.sync(props.device.id, {
        username: username.value.trim(),
        password: password.value,
        /*
         * El «desde» va SOLO en la primera vuelta. En las siguientes manda la
         * marca que el servidor acaba de guardar; repetirlo reiniciaría el
         * recorrido desde el principio en cada vuelta y no avanzaría nunca.
         */
        ...(i === 0 && desdeQueMandar.value ? { desde: desdeQueMandar.value } : {}),
      })

      last.value = outcome
      vueltas.value = i + 1
      total.value = {
        batches: total.value.batches + outcome.batches,
        inserted: total.value.inserted + outcome.inserted,
        duplicates: total.value.duplicates + outcome.duplicates,
        unmatched: total.value.unmatched + outcome.unmatched,
      }

      if (!outcome.hasMore) break
    }

    /*
     * El aviso, aunque el resultado ya se pinta en el modal: leer tres mil
     * eventos son varias vueltas y quien lo lanzó se va a otra pestaña. Al
     * volver, el detalle sigue ahí; el aviso es para el que NO estaba mirando.
     */
    aviso.hecho(
      `Reloj leído · ${total.value.inserted} checadas nuevas`,
      total.value.unmatched > 0
        ? `${total.value.unmatched} sin dueño, quedan en conciliación.`
        : undefined,
    )
    emit('synced')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    working.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Leer las checadas del reloj"
    :description="device.serialNumber"
  >
    <template #body>
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Usuario del reloj">
            <UInput v-model="username" autocomplete="off" class="w-full" />
          </UFormField>
          <UFormField label="Contraseña del reloj">
            <UInput v-model="password" type="password" autocomplete="off" class="w-full" />
          </UFormField>
        </div>
        <p class="text-dimmed text-xs">
          Son las credenciales del equipo, no las tuyas. No se guardan.
        </p>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Qué leer">
            <USelectMenu v-model="alcance" :items="ALCANCES" value-key="value" class="w-full" />
          </UFormField>
          <UFormField v-if="alcance === 'fecha'" label="Desde el día">
            <UInput v-model="desde" type="date" :max="todayLocal()" class="w-full" />
          </UFormField>
        </div>

        <!--
          Lo que hace cada opción, dicho antes de pulsar. «Releer» asusta si uno
          no sabe que no duplica, y es justo lo que hay que hacer para recuperar
          checadas borradas.
        -->
        <p v-if="alcance === 'marca'" class="text-dimmed text-xs">
          Continúa desde donde quedó la última vez. Es lo normal: un corte de tres días se recupera
          solo.
        </p>
        <p v-else class="text-muted text-xs">
          Se ignora la última lectura y se vuelve a leer
          {{ alcance === 'todo' ? 'todo el histórico del equipo' : `desde el ${desde}` }}. Sirve
          para recuperar checadas borradas de la base: el reloj las sigue teniendo.
          <span class="text-dimmed">
            No se duplica nada — lo que ya esté se cuenta como repetido.
          </span>
        </p>

        <div v-if="started && last" class="bg-elevated/50 space-y-1 rounded-lg p-3 text-sm">
          <p class="text-highlighted font-medium">
            {{ last.watermarkLabel ?? 'Sin marca todavía' }}
          </p>
          <p class="text-muted">
            {{ total.inserted }} checadas registradas · {{ total.unmatched }} de gente sin enrolar ·
            {{ total.duplicates }} repetidas que ya estaban
          </p>
          <p class="text-dimmed text-xs">
            {{ vueltas }} {{ vueltas === 1 ? 'lectura' : 'lecturas' }} · {{ total.batches }} tramos
          </p>
          <!--
            Si tras agotar las vueltas TODAVÍA queda, se dice: callarlo dejaría
            creer que el equipo está al día cuando no lo está.
          -->
          <p v-if="last.hasMore" class="text-warning text-xs">
            Quedan más eventos en el equipo. Pulsa otra vez para seguir leyendo.
          </p>
          <p v-else class="text-success text-xs">
            No quedan eventos por leer: el equipo está al día.
          </p>
        </div>

        <!--
          Las checadas de gente que no está enrolada no se pierden: esperan en la
          bandeja hasta que se concilie el padrón. Decirlo evita que alguien
          piense que la lectura falló.
        -->
        <UAlert
          v-if="started && total.unmatched > 0 && total.inserted === 0"
          icon="i-lucide-info"
          color="info"
          title="Todas fueron a la bandeja de sin dueño"
          description="Es lo esperado mientras nadie del padrón esté enrolado. En cuanto concilies el padrón del reloj, esas checadas se resuelven solas."
        >
          <template #actions>
            <UButton :to="{ name: 'unmatched-punches' }" label="Ver la bandeja" />
          </template>
        </UAlert>

        <ApiErrorAlert :error="error" :fields="['username', 'password']" />

        <div class="flex justify-end gap-2">
          <UButton label="Cerrar" @click="open = false" />
          <UButton
            :label="
              working
                ? `Leyendo… (${vueltas})`
                : started && last?.hasMore
                  ? 'Seguir leyendo'
                  : started
                    ? 'Leer otra vez'
                    : 'Leer checadas'
            "
            icon="i-lucide-download"
            :loading="working"
            :disabled="!canRead"
            @click="read"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
