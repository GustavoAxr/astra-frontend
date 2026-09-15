<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { devicesApi } from '@/modules/devices/api'
import { padronApi } from '@/modules/padron/api'
import type { EmployeeDetail } from '../types'

/**
 * DAR DE ALTA EN EL RELOJ A ALGUIEN QUE YA EXISTE EN ASTRA.
 *
 * ══ POR QUÉ HACÍA FALTA ══
 *
 * Hasta ahora el ÚNICO sitio de toda la aplicación desde el que alguien podía
 * llegar al reloj era la casilla del formulario de alta. Una casilla de un solo
 * intento: si ese paso fallaba —y falló, por un 400 del servidor—, la persona
 * quedaba creada en Astra, sin número en el equipo y sin ninguna forma de
 * arreglarlo desde la interfaz. El propio mensaje de error decía «puedes darlo
 * de alta después desde su expediente», y eso no era verdad.
 *
 * Tampoco valía la pantalla del padrón: ahí se empuja a quien YA está
 * vinculado, no se vincula a quien no lo está.
 *
 * ══ LO QUE NO TOCA LA RED ══
 *
 * El número libre sale de la última lectura del equipo y la escritura se encola
 * para el agente. Por eso esto funciona con el reloj apagado y sin pedir su
 * contraseña: el servidor no lo ve, y quien escribe es el agente con las suyas.
 *
 * ══ LA CLAVE SE ENSEÑA UNA VEZ ══
 *
 * No se guarda en ningún sitio, ni aquí ni en el servidor. Si se cierra esta
 * ventana sin apuntarla, se acabó — y la única salida es volver a generarla.
 * Por eso el diálogo se queda abierto enseñándola en vez de cerrarse solo.
 */
const props = defineProps<{ persona: EmployeeDetail }>()
const emit = defineEmits<{ enrolado: [] }>()
const open = defineModel<boolean>('open', { required: true })

/**
 * Los relojes son de la BASE, no de la empresa. Se pregunta por la de su
 * adscripción vigente: enrolarlo en el reloj de otra nave le daría acceso a una
 * puerta por la que no pasa.
 */
const baseId = computed(() => props.persona.current?.installationId ?? undefined)
const devices = useAsync((signal) => devicesApi.list(baseId.value, signal))

const deviceId = ref('')
const conClave = ref(true)
const enviando = ref(false)
const error = ref<Error | null>(null)

/** Lo que salió, y solo se enseña una vez: el número y la clave. */
const resultado = ref<{ externalUserId: string; pin: string | null } | null>(null)

/**
 * CUÁNTOS DÍGITOS TIENE LA CLAVE. Es una política de la empresa —la misma para
 * todos, o nadie sabe cuántos teclear en la puerta—, así que se lee la que se
 * recordó en el alta en vez de preguntar otra vez.
 */
const LONGITUDES = [
  { label: '4 dígitos', value: 4 },
  { label: '6 dígitos', value: 6 },
  { label: '8 dígitos', value: 8 },
]
const CLAVE_GUARDADA = 'astra.longitudDeClave'

function longitudRecordada(): number {
  try {
    const guardada = Number(localStorage.getItem(CLAVE_GUARDADA))
    return LONGITUDES.some((l) => l.value === guardada) ? guardada : 6
  } catch {
    return 6
  }
}

const claveLongitud = ref(longitudRecordada())

const deviceItems = computed(() =>
  (devices.data.value ?? [])
    .filter((d) => d.isActive)
    .map((d) => ({
      label: `${[d.brand, d.model].filter(Boolean).join(' ') || d.serialNumber} · ${d.serialNumber}`,
      value: d.id,
    })),
)

watch(open, (abierto) => {
  if (!abierto) return
  deviceId.value = ''
  conClave.value = true
  claveLongitud.value = longitudRecordada()
  resultado.value = null
  error.value = null
  void devices.run()
})

/** Con un solo reloj en su base no hay nada que elegir: se elige solo. */
watch(deviceItems, (items) => {
  const unico = items.length === 1 ? items[0] : null
  if (deviceId.value === '' && unico) deviceId.value = unico.value
})

async function enrolar(): Promise<void> {
  if (deviceId.value === '' || enviando.value) return
  enviando.value = true
  error.value = null
  try {
    resultado.value = await padronApi.enroll(deviceId.value, {
      employeeId: props.persona.id,
      conClave: conClave.value,
      claveLongitud: claveLongitud.value,
    })
    try {
      localStorage.setItem(CLAVE_GUARDADA, String(claveLongitud.value))
    } catch {
      // Que no se pueda recordar no es motivo para no dar de alta a nadie.
    }
    emit('enrolado')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Darlo de alta en el reloj">
    <template #body>
      <!-- YA ESTÁ: el número y la clave, que no se vuelven a ver. -->
      <div v-if="resultado" class="space-y-4">
        <div class="border-default space-y-3 border p-4">
          <p class="text-muted text-sm">
            Quedó dado de alta con el número
            <strong class="text-highlighted font-mono">{{ resultado.externalUserId }}</strong
            >.
          </p>
          <div v-if="resultado.pin" class="space-y-1">
            <p class="text-muted text-xs tracking-wide uppercase">Su clave de puerta</p>
            <p class="text-highlighted font-mono text-3xl">{{ resultado.pin }}</p>
            <p class="text-warning text-xs">
              Apúntala ahora. No se guarda en ningún sitio y no se puede volver a ver.
            </p>
          </div>
        </div>

        <p class="text-dimmed text-xs">
          La orden quedó en cola. La aplica el agente de la nave en su siguiente ciclo; si el reloj
          está apagado, espera a que encienda. En su expediente se ve en qué quedó.
        </p>

        <div class="flex justify-end">
          <UButton label="Ya la apunté" @click="open = false" />
        </div>
      </div>

      <div v-else class="space-y-4">
        <p class="text-muted text-sm">
          <strong>{{ persona.firstName }}</strong> existe en Astra pero no tiene número en ningún
          reloj, así que hoy no puede pasar por la puerta.
        </p>

        <UFormField label="En qué reloj" required>
          <USelectMenu
            v-model="deviceId"
            :items="deviceItems"
            value-key="value"
            :loading="devices.pending.value"
            class="w-full"
          />
        </UFormField>

        <p v-if="!devices.pending.value && deviceItems.length === 0" class="text-warning text-sm">
          Su base no tiene ningún reloj activo. Da uno de alta en Equipos, o cámbiale la adscripción
          a una base que sí lo tenga.
        </p>

        <UCheckbox
          v-model="conClave"
          label="Generarle una clave de puerta"
          description="Es lo único con lo que puede checar HOY: la huella solo se da de alta con el dedo delante del aparato. La clave se enseña UNA vez y no se guarda."
        />

        <UFormField v-if="conClave" label="Dígitos de la clave">
          <USelectMenu
            v-model="claveLongitud"
            :items="LONGITUDES"
            value-key="value"
            class="w-full sm:w-48"
          />
        </UFormField>

        <ApiErrorAlert :error="error" />

        <!--
          El número libre sale de la ÚLTIMA LECTURA del equipo. Si alguien se dio
          de alta tecleando en el propio reloj después de esa lectura, su número
          no consta aquí. Se dice, porque la salida —pedir lectura— está a un
          clic en el padrón y nadie la busca si no sabe que hace falta.
        -->
        <p class="text-dimmed text-xs">
          Se le asigna el siguiente número libre según la última lectura del equipo. Si desde
          entonces alguien se dio de alta tecleando en el propio reloj, pide antes una lectura nueva
          desde el padrón.
        </p>

        <div class="flex justify-end gap-2">
          <UButton label="Cancelar" :disabled="enviando" @click="open = false" />
          <UButton
            label="Darlo de alta"
            icon="i-lucide-id-card"
            :loading="enviando"
            :disabled="deviceId === ''"
            @click="enrolar"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
