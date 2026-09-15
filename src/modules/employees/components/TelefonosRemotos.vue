<script setup lang="ts">
import { computed, ref } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAsync } from '@/shared/composables/useAsync'
import { useAviso } from '@/shared/ui/aviso'
import { remotoApi } from '@/modules/remoto/api'
import type { EmployeeDetail } from '../types'

/**
 * CHECAR DESDE EL TELÉFONO: en qué estado está esta persona.
 *
 * ══ TRES PUERTAS, Y SE DICEN LAS TRES ══
 *
 * Para que alguien pueda checar desde su teléfono hacen falta tres cosas, y
 * ninguna de ellas es evidente desde fuera:
 *
 *   1. Su adscripción tiene que decir «a distancia». Es LO ÚNICO que lo
 *      habilita, y sin ello la página pública le contesta que no puede.
 *   2. Tiene que tener un WhatsApp CONFIRMADO: ahí le llega el código con el
 *      que da de alta el aparato.
 *   3. Tiene que dar de alta el teléfono, una vez, desde el enlace.
 *
 * Esta tarjeta las enseña en orden y dice cuál falta. La alternativa —un
 * «no puede checar» a secas— deja a RRHH probando cosas: ya pasó con el
 * acceso al asistente.
 *
 * ══ Y EL ENLACE ES DE LA EMPRESA, NO DE LA PERSONA ══
 *
 * Se comparte igual para todos; lo que identifica es su número de empleado más
 * el código que le llega. Se dice con todas las letras para que nadie crea que
 * está repartiendo una llave personal.
 */
const props = defineProps<{ persona: EmployeeDetail; puedeRevocar: boolean }>()
const aviso = useAviso()

const telefonos = useAsync((signal) => remotoApi.telefonos(props.persona.id, signal))
void telefonos.run()

const esRemota = computed(() => props.persona.current?.workMode === 'REMOTE')
const tieneWhatsapp = computed(
  () => props.persona.whatsappNumber !== null && props.persona.whatsappOptIn,
)

/** Los que siguen valiendo. Un revocado se queda en la lista, apagado. */
const vigentes = computed(() => (telefonos.data.value ?? []).filter((t) => t.revokedAt === null))

const enlace = computed(() => `${window.location.origin}/remoto/${props.persona.legalEntityId}`)

const revocando = ref<string | null>(null)

async function revocar(id: string): Promise<void> {
  revocando.value = id
  try {
    await remotoApi.revocar(id)
    aviso.hecho('Teléfono revocado', 'Desde ese aparato ya no se puede checar.')
    await telefonos.run()
  } catch (e) {
    aviso.fallo(e, 'revocar el teléfono')
  } finally {
    revocando.value = null
  }
}

async function copiarEnlace(): Promise<void> {
  try {
    await navigator.clipboard.writeText(enlace.value)
    aviso.hecho('Enlace copiado')
  } catch {
    // Sin portapapeles —un navegador viejo, o sin permiso— el enlace sigue a
    // la vista para copiarlo a mano. No es un fallo que haya que gritar.
    aviso.aviso('No pude copiar', 'Selecciona el enlace y cópialo a mano.')
  }
}

const sello = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const cuando = (iso: string | null): string => (iso ? sello.format(new Date(iso)) : '—')
const soloDia = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-highlighted font-semibold">Checar desde el teléfono</h2>
        <UBadge
          :label="esRemota ? 'A distancia' : 'En sitio'"
          :color="esRemota ? 'success' : 'neutral'"
          size="sm"
        />
        <span v-if="esRemota" class="text-muted ml-auto text-sm">
          {{ vigentes.length }} {{ vigentes.length === 1 ? 'teléfono' : 'teléfonos' }}
        </span>
      </div>
    </template>

    <!--
      NO ES REMOTA: se dice qué hacer, no solo que no puede. El interruptor está
      en otra pantalla y sin esta línea hay que adivinar en cuál.
    -->
    <div v-if="!esRemota" class="text-muted space-y-2 text-sm">
      <p>
        Esta persona checa en el reloj de su instalación. Para que pueda hacerlo desde su teléfono
        —desde casa o donde esté— cámbiale la adscripción a
        <strong>«A distancia»</strong> con el botón <strong>Cambiar</strong> de arriba.
      </p>
      <p class="text-dimmed">
        Checar a distancia no usa geocerca: quien trabaja desde casa no está dentro de ninguna. Lo
        que respalda cada checada es el acuse que le llega a su correo.
      </p>
    </div>

    <div v-else class="space-y-4">
      <!--
        LAS DOS COSAS QUE LE FALTAN PARA PODER DARSE DE ALTA, en orden y con el
        estado a la vista. Si el WhatsApp no está confirmado, el código no sale
        del servidor y la persona se queda dándole al botón sin entender nada.
      -->
      <div class="border-default flex flex-wrap items-center gap-x-6 gap-y-1 border p-3 text-sm">
        <span class="text-muted">
          Su número:
          <span class="text-default font-mono">{{ persona.employeeCode }}</span>
        </span>
        <span :class="tieneWhatsapp ? 'text-muted' : 'text-warning'">
          WhatsApp confirmado:
          <strong>{{ tieneWhatsapp ? 'sí' : 'no' }}</strong>
        </span>
        <span v-if="!tieneWhatsapp" class="text-warning text-xs">
          Sin un WhatsApp confirmado en su expediente no se le puede mandar el código.
        </span>
      </div>

      <div class="space-y-1">
        <p class="text-muted text-sm">
          Pásale este enlace. Es <strong>el mismo para toda la empresa</strong>: lo que lo
          identifica a él es su número de empleado y el código que le llega por WhatsApp.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <code class="border-default bg-elevated/40 border px-2 py-1 text-xs">{{ enlace }}</code>
          <UButton label="Copiar" icon="i-lucide-copy" size="xs" @click="copiarEnlace" />
        </div>
      </div>

      <ApiErrorAlert :error="telefonos.error.value" />

      <p v-if="telefonos.pending.value && !telefonos.loaded.value" class="text-muted text-sm">
        Un momento…
      </p>

      <p
        v-else-if="!(telefonos.data.value ?? []).length"
        class="border-default text-muted border border-dashed p-4 text-center text-sm"
      >
        Todavía no ha dado de alta ningún teléfono.
      </p>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-muted border-default border-b text-left text-xs">
            <th class="py-1">Dado de alta</th>
            <th class="py-1">Última vez</th>
            <th class="py-1">Vence</th>
            <th class="py-1"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="t in telefonos.data.value ?? []"
            :key="t.id"
            class="border-default border-b last:border-0"
            :class="t.revokedAt ? 'opacity-50' : ''"
          >
            <td class="py-1.5">
              {{ cuando(t.verifiedAt) }}
              <span v-if="t.label" class="text-dimmed">· {{ t.label }}</span>
            </td>
            <td class="text-muted py-1.5">{{ cuando(t.lastUsedAt) }}</td>
            <td class="text-muted py-1.5">{{ soloDia.format(new Date(t.expiresAt)) }}</td>
            <td class="py-1.5 text-right">
              <UBadge v-if="t.revokedAt" label="Revocado" color="neutral" size="sm" />
              <UButton
                v-else-if="puedeRevocar"
                label="Revocar"
                icon="i-lucide-shield-x"
                color="error"
                size="xs"
                :loading="revocando === t.id"
                @click="revocar(t.id)"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <!--
        REVOCAR NO BORRA. Hay que poder seguir viendo desde qué aparato entró
        una checada de hace tres meses, aunque ese teléfono ya no valga.
      -->
      <p v-if="(telefonos.data.value ?? []).length" class="text-dimmed text-xs">
        Revocar no borra el aparato: deja de poder checar, y las checadas que ya hizo siguen
        constando con su origen.
      </p>
    </div>
  </UCard>
</template>
