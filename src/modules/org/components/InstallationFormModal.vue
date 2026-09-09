<script setup lang="ts">
import { computed, defineAsyncComponent, h, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { timezoneItems, timezoneOffset } from '@/shared/ui/timezones'
import { orgApi } from '../api'
import { useAviso } from '@/shared/ui/aviso'
import { installationPlan } from '../installation-plan'
import type {
  GeoPoint,
  Installation,
  LegalEntity,
  UpdateInstallationForm,
} from '../types'
/**
 * El editor se baja aparte, y solo al abrir este formulario.
 *
 * Se lleva dentro a Leaflet, que son unos 150 KB. Yendo con el resto de la
 * pantalla, esos 150 KB los pagaba TODO EL MUNDO al entrar en Organización
 * —para mirar razones sociales, para renombrar un puesto—, y el mapa lo abre
 * una persona cada muchos días. Aquí se piden cuando de verdad hacen falta, y
 * van en paralelo con las primeras imágenes.
 */
const CartelParaChecar = defineAsyncComponent(() => import('./CartelParaChecar.vue'))

const GeofenceEditor = defineAsyncComponent({
  loader: () => import('./GeofenceEditor.vue'),
  /*
   * Un hueco de la misma altura que el mapa mientras baja. Sin él, el
   * formulario crece de golpe al llegar el editor y lo que estabas leyendo se
   * te va de debajo del cursor.
   */
  loadingComponent: () =>
    h('div', { class: 'ring-default bg-elevated/50 h-96 w-full rounded-lg ring-1' }),
  delay: 0,
})

const props = defineProps<{
  /** La empresa de contexto. Al clonar es la de ORIGEN, no la de destino. */
  legalEntity: LegalEntity
  /** Al editar, la base que se edita. Al clonar, la que sirve de molde. */
  installation?: Installation | null
  /**
   * Clonar: se copia todo de `installation` y se pregunta a qué razón social
   * va. La clave puede repetirse porque es única DENTRO de cada empresa, que
   * es justo lo que hace útil clonar entre empresas.
   */
  clone?: boolean
  /** Solo hace falta al clonar: las empresas entre las que se puede elegir. */
  legalEntities?: LegalEntity[]
  /**
   * Las bases que ya existen, para avisar de una clave repetida antes de
   * mandarla. El backend responde a la colisión con un 500 genérico —la
   * restricción `UNIQUE` sin traducir—, así que aquí no hay red que valga:
   * o se comprueba antes, o la persona ve «Error al consultar la base de datos».
   */
  existing?: Installation[]
}>()
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })

const FIELDS = [
  'legalEntityId',
  'name',
  'timezone',
  'address',
  'latitude',
  'longitude',
  'geofenceRadiusMeters',
] as const

const DEFAULT_RADIUS = '75'

const name = ref('')
const timezone = ref('America/Mexico_City')
const address = ref('')
const latitude = ref('')
const longitude = ref('')
const radius = ref(DEFAULT_RADIUS)

/**
 * El área dibujada. Manda sobre el radio cuando tiene tres o más esquinas.
 *
 * Se guarda aparte del radio y no lo sustituye: una base puede seguir con su
 * círculo, y obligar a redibujar todas para poder actualizar el sistema sería
 * garantizar que nadie lo actualice.
 */
const poligono = ref<GeoPoint[]>([])

/**
 * Dónde abrir el mapa. El centro capturado si lo hay; si no, la primera esquina
 * del área. Sin ninguno de los dos, el editor abre en su punto por omisión: es
 * preferible a un mapa del océano.
 */
const centroDelMapa = computed<GeoPoint | null>(() => {
  const lat = Number(latitude.value)
  const lng = Number(longitude.value)
  if (latitude.value.trim() !== '' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return { lat, lng }
  }
  return poligono.value[0] ?? null
})
const aviso = useAviso()

const submitting = ref(false)
const error = ref<Error | null>(null)

/**
 * La base ya guardada, para enseñar su cartel sin cerrar el formulario.
 *
 * El QR es una propiedad de la base como su domicilio: existe desde que la base
 * existe y no caduca. Enseñarlo AQUÍ, en el momento de guardar, es lo que
 * evita que el día de la avería alguien tenga que ir a buscar dónde se genera.
 */
const guardada = ref<Installation | null>(null)

const editing = computed(() => props.installation != null && props.clone !== true)
const cloning = computed(() => props.clone === true)

/** A qué empresa va la copia. Se pide siempre: clonar sin decidir destino no existe. */
const targetEntityId = ref('')

const entityItems = computed(() =>
  (props.legalEntities ?? []).map((entity) => ({
    label: entity.businessName + (entity.id === props.legalEntity.id ? ' (la misma)' : ''),
    value: entity.id,
  })),
)


const zones = timezoneItems()

/** El código es único DENTRO de su razón social, no globalmente. */

const radiusError = computed(() => {
  if (radius.value.trim() === '') return undefined
  const value = Number(radius.value)
  if (Number.isNaN(value)) return 'Tiene que ser un número.'
  if (value < 10 || value > 5000) return 'Entre 10 y 5000 metros.'
  return undefined
})

const valid = computed(
  () =>
    name.value.trim() !== '' &&
    (!cloning.value || targetEntityId.value !== '') &&
    radiusError.value === undefined,
)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const current = props.installation
    name.value = current?.name ?? ''
    timezone.value = current?.timezone ?? props.legalEntity.timezone
    address.value = current?.address ?? ''
    // La respuesta trae la geocerca ANIDADA; el formulario la maneja plana.
    latitude.value = current?.geofence ? String(current.geofence.center.lat) : ''
    longitude.value = current?.geofence ? String(current.geofence.center.lng) : ''
    radius.value = current?.geofence ? String(current.geofence.radiusMeters) : DEFAULT_RADIUS
    poligono.value = current?.geofence?.polygon ?? []
    // Al clonar no se elige destino por omisión: que la persona lo diga.
    targetEntityId.value = ''
    error.value = null
  },
  { immediate: true },
)

function numberOrUndefined(value: string): number | undefined {
  const clean = value.trim()
  if (clean === '') return undefined
  const parsed = Number(clean)
  return Number.isNaN(parsed) ? undefined : parsed
}

async function submit(): Promise<void> {
  if (!valid.value || submitting.value) return
  submitting.value = true
  error.value = null

  const plan = installationPlan({
    installation: props.installation,
    clone: cloning.value,
    contextEntityId: props.legalEntity.id,
    targetEntityId: targetEntityId.value,
  })

  try {
    if (plan.op === 'update') {
      const current = props.installation!
      const changes: UpdateInstallationForm = {}

      if (name.value.trim() !== current.name) changes.name = name.value.trim()
      if (timezone.value !== current.timezone) changes.timezone = timezone.value
      if (address.value.trim() !== (current.address ?? '')) changes.address = address.value.trim()

      const lat = numberOrUndefined(latitude.value)
      const lng = numberOrUndefined(longitude.value)
      const rad = numberOrUndefined(radius.value)
      if (lat !== current.geofence?.center.lat) changes.latitude = lat
      if (lng !== current.geofence?.center.lng) changes.longitude = lng
      if (rad !== current.geofence?.radiusMeters) changes.geofenceRadiusMeters = rad

      /*
       * El área se manda si cambió, y una lista VACÍA es un cambio legítimo:
       * significa «borra el dibujo y vuelve al círculo». Por eso se compara el
       * contenido y no se descarta por estar vacía como el resto.
       */
      const antes = JSON.stringify(current.geofence?.polygon ?? [])
      if (JSON.stringify(poligono.value) !== antes) {
        changes.geofencePolygon = poligono.value
      }

      // Un `undefined` suelto viajaría como campo desconocido: se descarta.
      for (const key of Object.keys(changes) as (keyof UpdateInstallationForm)[]) {
        if (changes[key] === undefined) delete changes[key]
      }

      guardada.value =
        Object.keys(changes).length > 0
          ? await orgApi.updateInstallation(current.id, changes)
          : current
    } else {
      guardada.value = await orgApi.createInstallation({
        legalEntityId: plan.legalEntityId,
        name: name.value,
        timezone: timezone.value,
        address: address.value,
        latitude: latitude.value,
        longitude: longitude.value,
        geofenceRadiusMeters: radius.value,
        geofencePolygon: poligono.value,
      })
    }

    /*
     * NO SE CIERRA AL GUARDAR: se queda enseñando el cartel de esa base.
     *
     * Cerrar de golpe era lo cómodo de programar y lo peor de usar — quien
     * acaba de dar de alta una base es exactamente quien puede imprimir su
     * cartel y pegarlo, y en ese momento tiene la impresora a mano y la cabeza
     * en esa base. La lista de atrás ya está actualizada por el `saved`.
     */
    if (guardada.value) {
      if (editing.value) aviso.actualizado(guardada.value.name)
      else aviso.creado(guardada.value.name, 'Su cartel para checar ya funciona.')
    }

    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="cloning ? 'Duplicar base' : editing ? 'Editar base' : 'Nueva base'"
    :description="
      cloning
        ? `Copia de ${installation?.code} · ${legalEntity.businessName}`
        : legalEntity.businessName
    "
  >
    <template #body>
      <!--
        EL CARTEL, JUSTO DESPUÉS DE GUARDAR.
        No es una pantalla aparte ni hay que «abrir» nada: la base tiene su QR
        desde que existe, y este es el único momento en que quien la dio de alta
        lo tiene delante con la impresora cerca.
      -->
      <div v-if="guardada" class="space-y-4">
        <UAlert
          color="success"
          icon="i-lucide-circle-check-big"
          :title="`${guardada.name} guardada`"
          description="Su cartel para checar sin reloj ya funciona. Imprímelo y pégalo en la puerta: sirve siempre, no solo cuando el reloj falla."
        />

        <UAlert
          v-if="poligono.length < 3"
          color="warning"
          icon="i-lucide-map-pin-off"
          title="Esta base no tiene área dibujada"
          description="Sin área, una checada desde el teléfono vale desde cualquier parte. Dibújala en el mapa antes de pegar el cartel."
        />

        <CartelParaChecar :installation="guardada" />

        <div class="flex justify-end">
          <UButton label="Listo" @click="open = false" />
        </div>
      </div>

      <template v-else>
      <form class="space-y-4" @submit.prevent="submit">
        <!--
          Solo al duplicar. Es un alta normal con el formulario ya relleno: lo
          único que falta decidir es a qué razón social va la copia.
        -->
        <UFormField v-if="cloning" label="Razón social de destino" required>
          <USelectMenu
            v-model="targetEntityId"
            :items="entityItems"
            value-key="value"
            placeholder="¿A qué empresa va la copia?"
            searchable
            class="w-full"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <!-- El código lo pone el servidor al crear: `ADM-02`, como los que ya hay. -->

          <UFormField label="Nombre" required>
            <UInput v-model="name" placeholder="Sede Central" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Zona horaria" required>
          <USelectMenu
            v-model="timezone"
            :items="zones"
            value-key="value"
            searchable
            class="w-full"
          />
          <template #help>
            <span class="text-dimmed text-xs">
              Ahora mismo {{ timezoneOffset(timezone) }} · puede diferir del de la empresa
            </span>
          </template>
        </UFormField>

        <UFormField label="Domicilio">
          <UInput v-model="address" placeholder="Atasta, Campeche" class="w-full" />
        </UFormField>

        <!--
          La geocerca decide si vale una checada hecha por teléfono cuando el
          reloj está roto. El radio sirve para un patio cuadrado; el ÁREA
          dibujada es lo que hace falta en cuanto la nave es alargada, porque un
          círculo que la cubra entera abarca también la calle de atrás.
        -->
        <fieldset class="border-default rounded-lg border p-3">
          <legend class="text-muted px-1 text-xs font-medium tracking-wide uppercase">
            Geocerca
          </legend>

          <GeofenceEditor
            v-model="poligono"
            :centro="centroDelMapa"
            :radio-metros="Number(radius) || 75"
            class="mb-3"
          />

          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField label="Latitud">
              <UInput v-model="latitude" placeholder="18.6439" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Longitud">
              <UInput v-model="longitude" placeholder="-91.8228" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Radio (m)" :error="radiusError">
              <UInput v-model="radius" placeholder="75" class="w-full font-mono" />
            </UFormField>
          </div>
          <p class="text-dimmed mt-2 text-xs">
            El centro y el radio siguen valiendo mientras no haya área dibujada. Entre 10 y 5000
            metros.
          </p>
        </fieldset>

        <ApiErrorAlert :error="error" :fields="FIELDS" />

        <div class="flex justify-end gap-2 pt-2">
          <UButton label="Cancelar" @click="open = false" />
          <UButton
            type="submit"
            :label="cloning ? 'Crear la copia' : editing ? 'Guardar cambios' : 'Dar de alta'"
            icon="i-lucide-check"
            :loading="submitting"
          />
        </div>
      </form>
      </template>
    </template>
  </UModal>
</template>
