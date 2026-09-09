<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import { useAsync } from '@/shared/composables/useAsync'
import type { Installation } from '@/modules/org/types'
import type { Agent } from '@/modules/agents/types'
import { devicesApi } from '../api'
import {
  SHARING_MODES,
  SHARING_MODE_LABEL,
  type DiscoveryCandidate,
  type EnrollDeviceForm,
  type SharingMode,
} from '../types'

const props = defineProps<{
  installations: Installation[]
  /** Los agentes de las bases que alcanza quien mira. */
  agents: Agent[]
}>()
const emit = defineEmits<{ enrolled: [] }>()
const aviso = useAviso()

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

/**
 * ¿ESTE EQUIPO ABRE UNA PUERTA?
 *
 * Marcado por omisión porque es lo que hace un control de acceso, y porque
 * equivocarse hacia ese lado no rompe nada: a un checador que no abre nada, un
 * permiso de puerta de más le da igual. Al revés sí duele —la credencial se
 * reconoce, la checada llega y el imán no se suelta—, y el síntoma es
 * invisible: las checadas siguen entrando mientras la persona se queda fuera.
 */
const opensDoor = ref(true)

/**
 * QUÉ AGENTE VA A ATENDER ESTE RELOJ. Vacío = ninguno.
 *
 * No estaba, y era el hueco que obligaba a terminar el alta con `curl`: el
 * servidor reparte las órdenes por agente, así que un reloj sin agente nunca
 * recibe ninguna. No fallaba nada visible —el equipo se veía igual que uno bien
 * puesto—, simplemente no pasaba nada nunca.
 */
const edgeAgentId = ref('')

const enrolling = ref(false)
const enrollError = ref<Error | null>(null)

const {
  data: discovery,
  pending: probing,
  error: probeError,
  run: probe,
} = useAsync((signal) => devicesApi.discover(ip.value.trim(), installationId.value, signal))

/**
 * Solo los agentes DE LA INSTALACIÓN elegida.
 *
 * Un agente atiende un sitio: ofrecerle a alguien el agente de otra base sería
 * ofrecerle una configuración que el servidor va a aceptar y que nunca va a
 * funcionar —el agente no alcanza a ese reloj por la red— sin decir por qué.
 */
const agentItems = computed(() =>
  props.agents
    .filter((a) => a.installationId === installationId.value)
    .map((a) => ({ label: a.agentCode, value: a.id })),
)

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
  opensDoor.value = true
  edgeAgentId.value = ''
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
    opensDoor: opensDoor.value,
    edgeAgentId: edgeAgentId.value,
  }

  try {
    await devicesApi.enroll(form)
    open.value = false
    aviso.creado('Reloj', `${form.ip} · ${form.brand} ${form.model}`.trim())
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

        <!--
          QUÉ AGENTE LO ATIENDE. Sin esto había que terminar el alta con curl.
          El servidor reparte las órdenes por agente: un reloj sin agente no
          recibe ninguna, y no se nota en ningún sitio salvo en que no pasa nada.
        -->
        <UFormField
          label="Agente que lo atiende"
          :help="
            installationId === ''
              ? 'Elige primero la instalación.'
              : agentItems.length === 0
                ? 'Esa base no tiene ningún agente dado de alta. Puedes continuar, pero el reloj no recibirá órdenes hasta que le asignes uno.'
                : 'El microservidor que lee este reloj. Sin agente, el equipo no recibe órdenes.'
          "
        >
          <USelectMenu
            v-model="edgeAgentId"
            :items="agentItems"
            value-key="value"
            :disabled="agentItems.length === 0"
            placeholder="Sin agente"
            class="w-full"
          />
        </UFormField>

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

            <!--
              Lo pregunta porque no todos abren: hay checadores que solo
              registran horarios y no están cableados a nada.
            -->
            <UFormField label="Acceso">
              <UCheckbox v-model="opensDoor" label="Este equipo abre una puerta o un imán" />
              <p class="text-muted mt-1 text-xs">
                {{
                  opensDoor
                    ? 'Se le mandarán permisos de acceso, y el padrón avisará si a alguien le faltan: sin permiso la credencial se reconoce, la checada llega y la puerta no se abre.'
                    : 'Solo registra horarios. No se le mandan permisos ni se le reclaman, porque no tiene ninguna puerta que abrir.'
                }}
              </p>
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
                'opensDoor',
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
