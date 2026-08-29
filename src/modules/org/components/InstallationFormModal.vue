<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { timezoneItems, timezoneOffset } from '@/shared/ui/timezones'
import { orgApi } from '../api'
import { installationPlan } from '../installation-plan'
import type { Installation, LegalEntity, UpdateInstallationForm } from '../types'

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
const submitting = ref(false)
const error = ref<Error | null>(null)

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

      // Un `undefined` suelto viajaría como campo desconocido: se descarta.
      for (const key of Object.keys(changes) as (keyof UpdateInstallationForm)[]) {
        if (changes[key] === undefined) delete changes[key]
      }

      if (Object.keys(changes).length > 0) await orgApi.updateInstallation(current.id, changes)
    } else {
      await orgApi.createInstallation({
        legalEntityId: plan.legalEntityId,
        name: name.value,
        timezone: timezone.value,
        address: address.value,
        latitude: latitude.value,
        longitude: longitude.value,
        geofenceRadiusMeters: radius.value,
      })
    }

    open.value = false
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
          La geocerca es para la checada por teléfono, que todavía no existe.
          El dato se captura desde ahora; no hace falta un mapa para eso.
        -->
        <fieldset class="border-default rounded-lg border p-3">
          <legend class="text-muted px-1 text-xs font-medium tracking-wide uppercase">
            Geocerca
          </legend>
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
            Entre 10 y 5000 metros. Sirve para la checada por teléfono, que aún no existe.
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
  </UModal>
</template>
