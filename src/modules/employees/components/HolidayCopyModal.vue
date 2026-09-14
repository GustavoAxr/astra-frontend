<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAsync } from '@/shared/composables/useAsync'
import { useAviso } from '@/shared/ui/aviso'
import { useLegalEntityFilter } from '@/modules/org/store'
import { employeesApi } from '../api'
import { planearCopia, type Decision, type FilaCopia } from '../copiar-festivos'

/**
 * TRAER A ESTE AÑO LOS FESTIVOS DE OTRO.
 *
 * El año de destino es EL QUE SE ESTÁ MIRANDO, no uno que se elija aquí: se
 * pulsa el botón estando en 2027 porque 2027 está vacío. Lo único que se elige
 * es de dónde traerlos.
 *
 * No hay un endpoint que copie un año entero, y no hace falta: la copia se
 * arma con las altas de siempre —una por festivo— y así cada fila falla o entra
 * por su cuenta. Un lote todo-o-nada obligaría a repetir los diez por uno malo.
 */
const props = defineProps<{
  /** El año que se está mirando. Aquí es donde caen las copias. */
  destino: number
  /** La razón social del filtro de arriba. `null` = todas las que se alcanzan. */
  legalEntityId: string | null
}>()
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const aviso = useAviso()
const filtro = useLegalEntityFilter()

/** De qué año se traen. El anterior es lo que se quiere casi siempre. */
const origen = ref(props.destino - 1)

const añosOrigen = computed(() =>
  Array.from({ length: 5 }, (_, i) => props.destino - 3 + i)
    .filter((año) => año !== props.destino)
    .map((año) => ({ label: String(año), value: año })),
)

/**
 * Los dos años a la vez: sin los del destino no se puede saber qué choca, y
 * pedirlos por separado dejaría la pantalla decidiendo con medio dato.
 */
const datos = useAsync(async (signal) => {
  const entidad = props.legalEntityId ?? undefined
  const [deOrigen, deDestino] = await Promise.all([
    employeesApi.holidays(origen.value, entidad, signal),
    employeesApi.holidays(props.destino, entidad, signal),
  ])
  return { deOrigen, deDestino }
})

const filas = ref<FilaCopia[]>([])
const trabajando = ref(false)
const resumen = ref<{ copiados: number; reemplazados: number; fallidos: number } | null>(null)

watch(datos.data, (d) => {
  filas.value = d ? planearCopia(d.deOrigen, d.deDestino, props.destino) : []
  resumen.value = null
})

/** Los de ley del año de origen, que no se copian. Se dicen para que no se echen de menos. */
const deLeyEnOrigen = computed(
  () => (datos.data.value?.deOrigen ?? []).filter((h) => h.legalEntityId === null).length,
)

const variasEmpresas = computed(() => new Set(filas.value.map((f) => f.legalEntityId)).size > 1)

const yaEscrita = (fila: FilaCopia): boolean =>
  fila.resultado === 'copiado' || fila.resultado === 'reemplazado'

const porEscribir = computed(
  () => filas.value.filter((f) => f.decision !== 'omitir' && !yaEscrita(f)).length,
)

function nombreEmpresa(id: string): string {
  return filtro.entities.find((e) => e.id === id)?.businessName ?? 'Otra razón social'
}

/**
 * Qué se puede hacer con esta fila, dicho con el resultado y no con el verbo.
 *
 * Cuando hay choque, «quedarse con este» y «dejar el que ya está» son las dos
 * únicas salidas: el índice único `(razón social, día)` no admite los dos. Con
 * un festivo DE LEY sí caben ambos —son índices distintos— y por eso ahí sí se
 * ofrece quedarse con los dos, que es lo que hace falta para una posada encima
 * de la Navidad.
 */
function opciones(fila: FilaCopia): { label: string; value: Decision }[] {
  if (fila.fecha === null) return []

  if (fila.choque !== null) {
    return [
      { label: 'Dejar el que ya está', value: 'omitir' },
      { label: 'Quedarme con este', value: 'reemplazar' },
    ]
  }

  if (fila.deLey !== null) {
    return [
      { label: 'No copiarlo', value: 'omitir' },
      { label: 'Copiarlo igual: quedan los dos', value: 'copiar' },
    ]
  }

  return [
    { label: 'Copiar', value: 'copiar' },
    { label: 'No copiar', value: 'omitir' },
  ]
}

/**
 * «Copiar todos» NO PISA NADA: las filas que chocan se quedan como estaban.
 *
 * Un botón de masa que además reemplaza es la forma de perder de un clic lo que
 * alguien capturó a mano en el año de destino. Cada choque se decide uno a uno,
 * que es justo lo que se vino a hacer aquí.
 */
function todas(decision: 'copiar' | 'omitir'): void {
  for (const fila of filas.value) {
    if (fila.fecha === null || yaEscrita(fila)) continue
    if (decision === 'copiar' && fila.choque !== null) continue
    fila.decision = decision
  }
}

async function copiar(): Promise<void> {
  if (trabajando.value || porEscribir.value === 0) return
  trabajando.value = true

  let copiados = 0
  let reemplazados = 0
  let fallidos = 0

  for (const fila of filas.value) {
    // Lo que ya entró no se vuelve a intentar: reintentar tras un fallo parcial
    // no puede acabar en festivos duplicados.
    if (yaEscrita(fila)) continue

    if (fila.fecha === null || fila.decision === 'omitir') {
      fila.resultado = 'omitido'
      continue
    }

    try {
      if (fila.decision === 'reemplazar' && fila.choque !== null) {
        /*
         * Se corrige el que ya estaba en vez de borrarlo y crear otro: el día
         * nunca queda sin festivo, y solo se manda lo que de verdad cambia
         * —`forbidNonWhitelisted` está activo y un campo idéntico no aporta—.
         */
        const cambios: { name?: string; isMandatoryRest?: boolean } = {}
        if (fila.choque.name !== fila.origen.name) cambios.name = fila.origen.name
        if (fila.choque.isMandatoryRest !== fila.origen.isMandatoryRest) {
          cambios.isMandatoryRest = fila.origen.isMandatoryRest
        }
        if (Object.keys(cambios).length > 0) {
          await employeesApi.actualizarFestivo(fila.choque.id, cambios)
        }
        fila.resultado = 'reemplazado'
        reemplazados += 1
      } else {
        await employeesApi.crearFestivo({
          legalEntityId: fila.legalEntityId,
          holidayDate: fila.fecha,
          name: fila.origen.name,
          isMandatoryRest: fila.origen.isMandatoryRest,
        })
        fila.resultado = 'copiado'
        copiados += 1
      }
    } catch (causa) {
      fila.resultado = 'error'
      fila.detalle = causa instanceof Error ? causa.message : String(causa)
      fallidos += 1
    }
  }

  resumen.value = { copiados, reemplazados, fallidos }
  const escritos = copiados + reemplazados

  // Si algo falló, el aviso es de aviso y no de acierto: «listo» con 3 de 10
  // fuera es mentira, y el detalle está en su renglón.
  if (fallidos > 0) {
    aviso.aviso(`${escritos} guardados, ${fallidos} con problema`, 'El motivo está en su renglón.')
  } else if (escritos > 0) {
    aviso.hecho(
      `${escritos} ${escritos === 1 ? 'día festivo' : 'días festivos'} en ${props.destino}`,
      `Copiados de ${origen.value}.`,
    )
  }

  trabajando.value = false
  emit('saved')
}

function elegirOrigen(año: number): void {
  origen.value = año
  void datos.run()
}

watch(
  open,
  (abierto) => {
    if (!abierto) return
    origen.value = props.destino - 1
    filas.value = []
    resumen.value = null
    // Los nombres de las razones sociales: la petición está cacheada en el
    // store, así que no sale una nueva por abrir el modal.
    void filtro.load()
    void datos.run()
  },
  { immediate: true },
)

const fecha = new Intl.DateTimeFormat('es-MX', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
/**
 * `2027-01-01` → `vie, 1 ene`.
 *
 * Partida a mano: `new Date('2027-01-01')` la lee como UTC y en México
 * retrocede un día, así que el 1 de enero se pintaría como 31 de diciembre.
 */
function cuando(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return fecha.format(new Date(a ?? 0, (m ?? 1) - 1, d ?? 1))
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Copiar días festivos a ${destino}`"
    :description="`Lo que ya esté capturado en ${destino} se conserva. Si un día choca, lo decides tú.`"
    :ui="{ content: 'max-w-4xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex flex-wrap items-end gap-3">
          <UFormField label="Traer los de">
            <USelectMenu
              :model-value="origen"
              :items="añosOrigen"
              value-key="value"
              class="w-32"
              :disabled="trabajando"
              @update:model-value="elegirOrigen"
            />
          </UFormField>
          <p v-if="datos.loaded.value" class="text-muted pb-2 text-sm">
            {{ filas.length }}
            {{ filas.length === 1 ? 'festivo propio' : 'festivos propios' }} en {{ origen }}.
            <template v-if="deLeyEnOrigen > 0">
              Los {{ deLeyEnOrigen }} de ley no se copian: cada año trae los suyos, y los de
              febrero, marzo y noviembre caen en un lunes distinto.
            </template>
          </p>
        </div>

        <ApiErrorAlert :error="datos.error.value" />

        <p
          v-if="datos.loaded.value && !filas.length"
          class="border-default text-muted rounded-lg border border-dashed p-6 text-center text-sm"
        >
          En {{ origen }} no hay festivos propios de la empresa, solo los de ley. No hay nada que
          traer.
        </p>

        <div v-else-if="filas.length" class="space-y-3">
          <div class="flex items-center gap-2">
            <UButton
              label="Copiar todos"
              size="xs"
              :disabled="trabajando"
              @click="todas('copiar')"
            />
            <UButton label="Ninguno" size="xs" :disabled="trabajando" @click="todas('omitir')" />
            <span class="text-muted text-sm">{{ porEscribir }} de {{ filas.length }}</span>
          </div>

          <div class="border-default max-h-96 overflow-y-auto rounded-lg border">
            <table class="w-full text-sm">
              <thead class="bg-elevated/50 sticky top-0">
                <tr class="text-muted text-left text-xs">
                  <th class="p-2">Día en {{ destino }}</th>
                  <th class="p-2">Motivo</th>
                  <th v-if="variasEmpresas" class="p-2">Razón social</th>
                  <th class="p-2">Qué hay ese día</th>
                  <th class="p-2">Qué hago</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="fila in filas"
                  :key="fila.origen.id"
                  class="border-default border-t"
                  :class="yaEscrita(fila) ? 'opacity-50' : ''"
                >
                  <td class="p-2 whitespace-nowrap">
                    <span v-if="fila.fecha" class="capitalize">{{ cuando(fila.fecha) }}</span>
                    <span v-else class="text-dimmed">—</span>
                  </td>

                  <td class="p-2">
                    {{ fila.origen.name }}
                    <UBadge
                      v-if="fila.origen.isMandatoryRest"
                      label="Obligatorio"
                      color="warning"
                      size="sm"
                      class="ml-1"
                    />
                  </td>

                  <td v-if="variasEmpresas" class="text-muted p-2 text-xs">
                    {{ nombreEmpresa(fila.legalEntityId) }}
                  </td>

                  <td class="p-2 text-xs">
                    <span v-if="fila.fecha === null" class="text-warning">
                      El 29 de febrero no existe en {{ destino }}. Captúralo a mano en el día que
                      toque.
                    </span>
                    <span v-else-if="fila.choque" class="text-warning">
                      Ya tienes uno ese día: «{{ fila.choque.name }}»
                    </span>
                    <span v-else-if="fila.deLey" class="text-muted">
                      Ese día ya es festivo de ley: «{{ fila.deLey.name }}»
                    </span>
                    <span v-else class="text-dimmed">Libre</span>
                  </td>

                  <td class="p-2">
                    <UBadge
                      v-if="fila.resultado === 'copiado'"
                      label="Copiado"
                      color="success"
                      size="sm"
                    />
                    <UBadge
                      v-else-if="fila.resultado === 'reemplazado'"
                      label="Corregido"
                      color="success"
                      size="sm"
                    />
                    <span v-else-if="fila.fecha === null" class="text-dimmed text-xs">
                      No se puede
                    </span>
                    <USelectMenu
                      v-else
                      v-model="fila.decision"
                      :items="opciones(fila)"
                      value-key="value"
                      size="xs"
                      class="w-52"
                      :disabled="trabajando"
                    />
                    <p v-if="fila.resultado === 'error'" class="text-error mt-1 text-xs">
                      {{ fila.detalle }}
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <UAlert
          v-if="resumen"
          :icon="resumen.fallidos > 0 ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'"
          :color="resumen.fallidos > 0 ? 'warning' : 'success'"
          :title="`${resumen.copiados + resumen.reemplazados} en el calendario de ${destino}`"
        >
          <template #description>
            <p v-if="resumen.reemplazados > 0">
              {{ resumen.reemplazados }}
              {{ resumen.reemplazados === 1 ? 'ya existía' : 'ya existían' }} ese día y
              {{ resumen.reemplazados === 1 ? 'se corrigió' : 'se corrigieron' }} con el nombre de
              {{ origen }}.
            </p>
            <p v-if="resumen.fallidos > 0">
              {{ resumen.fallidos }} no {{ resumen.fallidos === 1 ? 'entró' : 'entraron' }}: el
              motivo está en su renglón.
            </p>
          </template>
        </UAlert>

        <div class="flex justify-end gap-2 pt-2">
          <UButton label="Cerrar" :disabled="trabajando" @click="open = false" />
          <UButton
            :label="`Copiar ${porEscribir}`"
            icon="i-lucide-copy"
            :loading="trabajando"
            :disabled="porEscribir === 0"
            @click="copiar"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
