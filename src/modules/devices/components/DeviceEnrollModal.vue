<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAsync } from '@/shared/composables/useAsync'
import type { Installation } from '@/modules/org/types'
import { devicesApi } from '../api'
import {
  SHARING_MODES,
  SHARING_MODE_LABEL,
  type DiscoveryCandidate,
  type EnrollDeviceForm,
  type SharingMode,
} from '../types'

const props = defineProps<{ installations: Installation[] }>()
const emit = defineEmits<{ enrolled: [] }>()

const open = ref(false)

const ip = ref('')
const installationId = ref('')

/** El candidato que el usuario acepta. En BAJA no se elige solo: se pregunta. */
const chosen = ref<DiscoveryCandidate | null>(null)
const serialNumber = ref('')
const model = ref('')
const brand = ref('')
const protocol = ref('')
const sharingMode = ref<SharingMode>('DEDICATED')

const enrolling = ref(false)
const enrollError = ref<Error | null>(null)

const {
  data: discovery,
  pending: probing,
  error: probeError,
  run: probe,
} = useAsync((signal) => devicesApi.discover(ip.value.trim(), installationId.value, signal))

const installationItems = computed(() =>
  props.installations.map((installation) => ({
    label: `${installation.code} · ${installation.name}`,
    value: installation.id,
  })),
)

const sharingItems = SHARING_MODES.map((mode) => ({
  label: SHARING_MODE_LABEL[mode].label,
  value: mode,
}))

const canProbe = computed(() => ip.value.trim() !== '' && installationId.value !== '')
const canEnroll = computed(
  () =>
    serialNumber.value.trim() !== '' && brand.value.trim() !== '' && protocol.value.trim() !== '',
)

/** Rellena el formulario con un candidato, sin decidir por el usuario en BAJA. */
function adopt(candidate: DiscoveryCandidate): void {
  chosen.value = candidate
  brand.value = candidate.brand
  protocol.value = candidate.protocol
  model.value = candidate.model ?? ''
  serialNumber.value = candidate.serialNumber ?? ''
}

watch(discovery, (result) => {
  chosen.value = null
  if (!result || result.alreadyEnrolledAs) return

  // ALTA y MEDIA vienen con `best`: se pre-rellena. BAJA con varios candidatos
  // NO se pre-rellena: elegir el primero por su cuenta es justo lo que no se
  // debe hacer cuando el sondeo no está seguro.
  if (result.best && result.confidence !== 'BAJA') adopt(result.best)
})

function reset(): void {
  ip.value = ''
  chosen.value = null
  serialNumber.value = ''
  model.value = ''
  brand.value = ''
  protocol.value = ''
  sharingMode.value = 'DEDICATED'
  enrollError.value = null
  discovery.value = null
}

watch(open, (isOpen) => {
  if (!isOpen) reset()
})

async function submit(): Promise<void> {
  if (enrolling.value) return
  enrolling.value = true
  enrollError.value = null

  const form: EnrollDeviceForm = {
    installationId: installationId.value,
    ip: ip.value,
    serialNumber: serialNumber.value,
    brand: brand.value,
    protocol: protocol.value,
    model: model.value,
    sharingMode: sharingMode.value,
  }

  try {
    await devicesApi.enroll(form)
    open.value = false
    emit('enrolled')
  } catch (cause) {
    enrollError.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    enrolling.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Dar de alta un reloj" :ui="{ content: 'max-w-2xl' }">
    <UButton icon="i-lucide-plus" label="Dar de alta" />

    <template #body>
      <div class="space-y-5">
        <!-- Paso 1: solo la IP y dónde está. -->
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Instalación">
            <USelectMenu
              v-model="installationId"
              :items="installationItems"
              value-key="value"
              placeholder="¿Dónde está el reloj?"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Dirección IP" hint="Solo red local">
            <UInput v-model="ip" placeholder="192.168.1.66" class="w-full" @keyup.enter="probe" />
          </UFormField>
        </div>

        <UButton
          icon="i-lucide-radar"
          label="Buscar el equipo"
          :loading="probing"
          :disabled="!canProbe"
          @click="probe"
        />

        <p v-if="probing" class="text-muted text-sm">Sondeando {{ ip }}. Tarda unos segundos.</p>

        <ApiErrorAlert :error="probeError" :fields="['ip', 'installationId']" />

        <!-- Paso 2: lo que contestó el sondeo. -->
        <template v-if="discovery && !probing">
          <UAlert
            v-if="discovery.alreadyEnrolledAs"
            icon="i-lucide-info"
            color="info"
            title="Este equipo ya estaba dado de alta"
            :description="`Número de serie ${discovery.alreadyEnrolledAs.serialNumber}.`"
          />

          <template v-else>
            <UAlert
              v-if="!discovery.best"
              icon="i-lucide-search-x"
              color="warning"
              title="Nadie reconoció el equipo"
            >
              <template #description>
                <p>Puedes capturar los datos a mano.</p>
                <!-- Este texto es lo que permite escribir después el sondeador
                     que falta sin volver a la instalación: tiene que copiarse. -->
                <p
                  v-if="discovery.unidentifiedSummary"
                  class="bg-elevated mt-2 rounded p-2 font-mono text-xs select-all"
                >
                  {{ discovery.unidentifiedSummary }}
                </p>
              </template>
            </UAlert>

            <div v-else class="space-y-2">
              <div class="flex items-center gap-2">
                <UBadge
                  :label="`Confianza ${discovery.confidence.toLowerCase()}`"
                  :color="discovery.confidence === 'ALTA' ? 'success' : 'warning'"
                />
                <span v-if="discovery.confidence === 'BAJA'" class="text-muted text-sm">
                  El sondeo no está seguro: elige tú cuál es.
                </span>
              </div>

              <!-- En BAJA se enseñan los candidatos con sus motivos, y se pregunta. -->
              <div class="grid gap-2">
                <button
                  v-for="candidate in discovery.candidates"
                  :key="`${candidate.brand}-${candidate.protocol}-${candidate.port}`"
                  type="button"
                  class="border-default hover:bg-elevated rounded-lg border p-3 text-left"
                  :class="chosen === candidate ? 'border-primary bg-elevated' : ''"
                  @click="adopt(candidate)"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{{ candidate.brand }}</span>
                    <span class="text-muted text-sm">{{
                      candidate.model ?? 'modelo desconocido'
                    }}</span>
                    <UBadge :label="candidate.protocol" color="neutral" class="ml-auto" />
                    <span class="text-dimmed text-xs">{{ candidate.score }}/100</span>
                  </div>
                  <ul class="text-muted mt-1 list-disc pl-4 text-xs">
                    <li v-for="reason in candidate.reasons" :key="reason">{{ reason }}</li>
                  </ul>
                  <p v-if="candidate.requiresCredentials" class="text-dimmed mt-2 text-xs">
                    Pedirá usuario y contraseña al conciliar su padrón.
                  </p>
                </button>
              </div>
            </div>

            <!-- Paso 3: lo que se va a mandar, siempre visible y editable. -->
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Número de serie">
                <UInput v-model="serialNumber" class="w-full" />
              </UFormField>
              <UFormField label="Marca">
                <UInput v-model="brand" class="w-full" />
              </UFormField>
              <UFormField label="Protocolo">
                <UInput v-model="protocol" class="w-full" />
              </UFormField>
              <UFormField label="Modelo" hint="Opcional">
                <UInput v-model="model" class="w-full" />
              </UFormField>
            </div>

            <UFormField label="Compartición">
              <USelectMenu
                v-model="sharingMode"
                :items="sharingItems"
                value-key="value"
                class="w-full sm:w-72"
              />
              <p class="text-muted mt-1 text-xs">{{ SHARING_MODE_LABEL[sharingMode].hint }}</p>
            </UFormField>

            <ApiErrorAlert
              :error="enrollError"
              :fields="[
                'installationId',
                'ip',
                'serialNumber',
                'brand',
                'protocol',
                'model',
                'sharingMode',
              ]"
            />

            <div class="flex justify-end gap-2">
              <UButton label="Cancelar" @click="open = false" />
              <UButton
                label="Dar de alta"
                icon="i-lucide-check"
                :loading="enrolling"
                :disabled="!canEnroll"
                @click="submit"
              />
            </div>
          </template>
        </template>
      </div>
    </template>
  </UModal>
</template>
