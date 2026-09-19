<script setup lang="ts">
import CredencialDeChecado from './CredencialDeChecado.vue'
import TelefonosRemotos from './TelefonosRemotos.vue'
import type { EmployeeDetail, EmployeeEnrollment } from '../types'

/**
 * CON QUÉ REGISTRA SU JORNADA ESTA PERSONA. Las tres vías, en una tarjeta.
 *
 * ══ POR QUÉ JUNTAS ══
 *
 * Eran tres tarjetas repartidas por el expediente —el reloj de la nave, la
 * credencial de la puerta y el equipo de trabajo remoto— y son tres respuestas
 * a UNA sola pregunta. Separadas, había que recorrer la pantalla entera para
 * saber si alguien puede fichar, y cada una gastaba título, borde y aire para
 * decir dos renglones.
 *
 * ══ LA TERCERA SE PINTA AUNQUE NO APLIQUE ══
 *
 * A quien trabaja en sitio se le enseña igual, apagada y con un «no aplica».
 * No es relleno: es la respuesta a «¿por qué a este no le sale lo de checar
 * desde casa?», que antes no estaba en ninguna parte —la tarjeta sencillamente
 * no aparecía— y mandaba a RRHH a buscar un interruptor que no existe. El
 * interruptor es la adscripción, y se dice dónde está.
 */
defineProps<{
  persona: EmployeeDetail
  /** Su adscripción de hoy es a distancia. Es lo único que habilita la tercera vía. */
  esRemota: boolean
  /** Qué número tiene en el reloj, si tiene alguno. */
  enElReloj: EmployeeEnrollment | null
  puedeEnrolar: boolean
  puedeVerCredencial: boolean
  puedeDarAcceso: boolean
  puedeRevocarRemoto: boolean
}>()

defineEmits<{ enrolar: [] }>()
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="text-highlighted font-semibold">Cómo checa</h2>
    </template>

    <div class="divide-default divide-y">
      <!-- El reloj de la nave. -->
      <div class="flex items-start gap-3 pb-4">
        <UIcon name="i-lucide-scan-line" class="text-primary mt-0.5 size-4 shrink-0" />
        <div class="min-w-0 flex-1 space-y-2">
          <p class="text-highlighted text-sm">Reloj de la nave</p>
          <p v-if="enElReloj" class="text-muted text-xs">
            Número <span class="font-mono">{{ enElReloj.externalUserId }}</span>
            <template v-if="enElReloj.deviceLabel"> · {{ enElReloj.deviceLabel }}</template>
          </p>
          <!--
            Sin número en ningún reloj no pasa por la puerta ni checa en la
            nave. A quien trabaja a distancia se le ofrece igual —puede pisar la
            nave cualquier día— pero sin urgencia.
          -->
          <template v-else>
            <p class="text-muted text-xs">
              No está dado de alta en ningún reloj, así que hoy no puede pasar por la puerta ni
              checar en la nave.
              <template v-if="esRemota">
                Trabaja a distancia, así que puede que no haga falta — pero el día que pise la nave,
                sí.
              </template>
            </p>
            <UButton
              v-if="puedeEnrolar"
              label="Darlo de alta en el reloj"
              icon="i-lucide-id-card"
              size="xs"
              @click="$emit('enrolar')"
            />
          </template>
        </div>
        <UBadge
          :label="enElReloj ? 'Enrolado' : 'Sin número'"
          :color="enElReloj ? 'success' : 'warning'"
          size="sm"
          class="shrink-0"
        />
      </div>

      <!-- El teléfono en la puerta, con su geocerca. -->
      <div v-if="puedeVerCredencial" class="py-4">
        <CredencialDeChecado :persona="persona" :puede-dar-acceso="puedeDarAcceso" />
      </div>

      <!-- Y el equipo de casa, solo para quien tiene esa adscripción. -->
      <div class="pt-4">
        <TelefonosRemotos v-if="esRemota" :persona="persona" :puede-revocar="puedeRevocarRemoto" />
        <div v-else class="flex items-start gap-3">
          <UIcon name="i-lucide-house" class="text-dimmed mt-0.5 size-4 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-dimmed text-sm">Desde su equipo, a distancia</p>
            <p class="text-dimmed mt-1 text-xs">
              Su adscripción es en sitio. Para habilitarlo, cámbiala a «A distancia» arriba, en
              Adscripciones.
            </p>
          </div>
          <UBadge label="No aplica" color="neutral" size="sm" class="shrink-0" />
        </div>
      </div>
    </div>
  </UCard>
</template>
