<script setup lang="ts">
import { computed, ref } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAsync } from '@/shared/composables/useAsync'
import { useAviso } from '@/shared/ui/aviso'
import { remotoApi } from '@/modules/remoto/api'
import { WHATSAPP_ACTIVO } from '@/shared/config/funciones'
import type { EmployeeDetail } from '../types'

/**
 * CHECAR DESDE SU EQUIPO: en qué estado está esta persona.
 *
 * TELÉFONO O COMPUTADORA, Y UNO SOLO. Obligar a poner la aplicación de la
 * empresa en el teléfono PERSONAL es donde esto se atascaba: mucha gente no
 * quiere, y quien trabaja desde casa ya tiene una computadora delante ocho
 * horas al día. Vale cualquiera de los dos — pero uno, y lo impone el servidor:
 * dar uno de alta revoca el anterior.
 *
 * ══ TRES PUERTAS, Y SE DICEN LAS TRES ══
 *
 * Para que alguien pueda checar desde su equipo hacen falta tres cosas, y
 * ninguna de ellas es evidente desde fuera:
 *
 *   1. Su adscripción tiene que decir «a distancia». Es LO ÚNICO que lo
 *      habilita, y sin ello la página pública le contesta que no puede.
 *   2. Tiene que tener un WhatsApp CONFIRMADO: ahí le llega el código con el
 *      que da de alta el aparato. HOY NO —WhatsApp está apagado, ver
 *      `WHATSAPP_ACTIVO`— y por eso este camino no se pinta: el código viaja
 *      dentro del enlace que se manda por correo.
 *   3. Tiene que dar de alta el equipo, una vez, desde el enlace.
 *
 * LA PRIMERA NO SE TRATA AQUÍ: esta tarjeta solo se pinta si la adscripción ya
 * dice «a distancia» —quien la pinta es el expediente—. Para el caso contrario
 * no había nada que ofrecer, y un párrafo explicando por qué la tarjeta está
 * vacía ocupaba tanto como la tarjeta llena; ahora eso se lee en el globo del
 * distintivo, junto a las adscripciones.
 *
 * Las otras dos sí: se enseñan en orden y se dice cuál falta. La alternativa
 * —un «no puede checar» a secas— deja a RRHH probando cosas: ya pasó con el
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

const tieneWhatsapp = computed(
  () => props.persona.whatsappNumber !== null && props.persona.whatsappOptIn,
)

/** Los que siguen valiendo. Un revocado se queda en la lista, apagado. */
const vigentes = computed(() => (telefonos.data.value ?? []).filter((t) => t.revokedAt === null))

const enlace = computed(() => `${window.location.origin}/remoto/${props.persona.legalEntityId}`)

const revocando = ref<string | null>(null)

/** El modal que explica qué va a pasar antes de mandar el correo. */
const invitando = ref(false)
const mandando = ref(false)
const renovando = ref<string | null>(null)

/**
 * A dónde mandar el enlace, si no es el correo del expediente.
 *
 * Vacío = al suyo. Existe por el caso que puso el cliente: «no tengo el correo
 * de la empresa en el teléfono, mándamelo a este otro». Sin esto esa persona se
 * queda sin poder checar, o RRHH le cambia el correo del EXPEDIENTE para
 * resolver un envío — que es peor: mueve un dato permanente por una razón de un
 * día. Queda registrado a dónde fue.
 */
const correoAlterno = ref('')

/**
 * Un equipo que vence dentro de dos semanas ya se puede renovar.
 *
 * El aviso de la una de la mañana lo anuncia con una semana; aquí se ofrece con
 * dos, para que quien entra al expediente por otra cosa pueda resolverlo de
 * paso en vez de esperar el correo.
 */
const DIAS_PARA_OFRECER_RENOVAR = 14
function porVencer(iso: string): boolean {
  return (new Date(iso).getTime() - Date.now()) / 86_400_000 <= DIAS_PARA_OFRECER_RENOVAR
}

async function renovar(id: string): Promise<void> {
  renovando.value = id
  try {
    const r = await remotoApi.renovar(id)
    aviso.hecho('Equipo renovado', `Ahora vence el ${soloDia.format(new Date(r.venceEl))}.`)
    await telefonos.run()
  } catch (e) {
    aviso.fallo(e, 'renovar el equipo')
  } finally {
    renovando.value = null
  }
}

/**
 * LOS TRES PASOS, TAL CUAL LOS VA A LEER LA OTRA PERSONA.
 *
 * Se enseñan aquí ANTES de mandar el correo, y no es adorno: quien lo manda
 * tiene que poder explicárselo por teléfono sin abrir el buzón ajeno —«te va a
 * llegar un enlace, ábrelo en el celular»—. Un botón que manda un correo cuyo
 * contenido nadie de este lado conoce deja a RRHH sin poder ayudar cuando esa
 * persona pregunte.
 */
const PASOS = [
  'Abre el enlace EN EL EQUIPO con el que va a checar todos los días: su teléfono o su computadora, el que prefiera. Queda dado de alta ese, y solo ese.',
  'Confirma con su huella o su cara cuando el equipo se lo pida. Es lo que impide que alguien cheque por él.',
  'Si es un teléfono, lo añade a su pantalla de inicio cuando se lo indiquemos: así entra de un toque y no busca el correo cada día.',
]

async function mandarInvitacion(): Promise<void> {
  if (mandando.value) return
  mandando.value = true
  try {
    const r = await remotoApi.invitarPorCorreo(
      props.persona.id,
      correoAlterno.value.trim() || undefined,
    )
    aviso.hecho(
      `Enlace enviado a ${r.enviadoA}`,
      'Caduca en 48 horas y sirve una sola vez. Si se le pasa, vuelve a mandarlo.',
    )
    invitando.value = false
    correoAlterno.value = ''
  } catch (e) {
    aviso.fallo(e, 'mandar el enlace')
  } finally {
    mandando.value = false
  }
}

async function revocar(id: string): Promise<void> {
  revocando.value = id
  try {
    await remotoApi.revocar(id)
    aviso.hecho('Equipo revocado', 'Desde ese aparato ya no se puede checar.')
    await telefonos.run()
  } catch (e) {
    aviso.fallo(e, 'revocar el equipo')
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
  <!--
    UNA FILA, NO UNA TARJETA.

    Esto y la credencial de la puerta son dos respuestas a la MISMA pregunta
    —¿con qué registra su jornada?— y viven dentro de «Cómo checa», que pone el
    marco. Un borde y un título propios aquí serían un marco dentro de otro.
  -->
  <div class="flex items-start gap-3">
    <UIcon name="i-lucide-house" class="text-primary mt-0.5 size-4 shrink-0" />

    <div class="min-w-0 flex-1 space-y-4">
      <p class="text-highlighted text-sm">Desde su equipo, a distancia</p>
      <!--
        LAS DOS COSAS QUE LE FALTAN PARA PODER DARSE DE ALTA, en orden y con el
        estado a la vista. Si el WhatsApp no está confirmado, el código no sale
        del servidor y la persona se queda dándole al botón sin entender nada.
      -->
      <!--
        EL CAMINO CORTO, ARRIBA. Mandar el correo es lo que RRHH viene a hacer
        aquí; el enlace común de abajo es el repuesto para quien no tiene correo
        o lo perdió. Con el repuesto primero, nadie usaba el camino bueno.
      -->
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          label="Habilitar chequeo remoto"
          icon="i-lucide-mail"
          :disabled="!puedeRevocar"
          @click="invitando = true"
        />
        <span class="text-muted text-sm">
          Le manda un correo con su enlace. Caduca en 48 horas y sirve una vez.
        </span>
      </div>

      <div class="border-default flex flex-wrap items-center gap-x-6 gap-y-1 border p-3 text-sm">
        <span class="text-muted">
          Su número:
          <span class="text-default font-mono">{{ persona.employeeCode }}</span>
        </span>
        <template v-if="WHATSAPP_ACTIVO">
          <span :class="tieneWhatsapp ? 'text-muted' : 'text-warning'">
            WhatsApp confirmado:
            <strong>{{ tieneWhatsapp ? 'sí' : 'no' }}</strong>
          </span>
          <span v-if="!tieneWhatsapp" class="text-warning text-xs">
            Sin un WhatsApp confirmado en su expediente no se le puede mandar el código.
          </span>
        </template>
      </div>

      <!--
        EL ENLACE COMÚN SOLO SIRVE CON WHATSAPP, y por eso se esconde con él.

        Es la puerta de «teclea tu número de empleado y te mando un código»: sin
        WhatsApp ese código no sale del servidor, así que pasárselo a alguien
        sería mandarlo a una pantalla que no puede terminar. El camino que sí
        funciona es el botón de arriba, que manda un enlace con el código ya
        dentro.
      -->
      <div v-if="WHATSAPP_ACTIVO" class="space-y-1">
        <p class="text-muted text-sm">
          Pásale este enlace. Es <strong>el mismo para toda la empresa</strong>: lo que lo
          identifica a él es su número de empleado y el código que le llega por WhatsApp.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <code class="border-default bg-elevated/40 border px-2 py-1 text-xs">{{ enlace }}</code>
          <UButton label="Copiar" icon="i-lucide-copy" size="xs" @click="copiarEnlace" />
        </div>
      </div>

      <!--
        DE BAJA: EL ALTA SE PAUSA, NO SE PIERDE.

        La tabla de abajo enseñaba el equipo como vigente y con su botón de
        revocar mientras la persona estaba dada de baja, sin decir en ningún
        sitio que esos días no puede checar. Y lo contrario también confundía:
        alguien podía revocarlo «porque ya no sirve» cuando lo único que hacía
        falta era reactivar a la persona.

        Las dos cosas son ciertas a la vez y las dos hay que decirlas: hoy no
        checa, y el alta sigue entera.
      -->
      <UAlert v-if="!persona.isActive" icon="i-lucide-pause" color="warning">
        <template #description>
          Está dado de baja, así que <strong>estos días no puede checar</strong> desde ningún
          equipo. Su alta NO se pierde: en cuanto lo reactives vuelve a funcionar sola, sin mandarle
          otro enlace.
        </template>
      </UAlert>

      <ApiErrorAlert :error="telefonos.error.value" />

      <p v-if="telefonos.pending.value && !telefonos.loaded.value" class="text-muted text-sm">
        Un momento…
      </p>

      <p
        v-else-if="!(telefonos.data.value ?? []).length"
        class="border-default text-muted border border-dashed p-4 text-center text-sm"
      >
        Todavía no ha dado de alta ningún equipo.
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
            <td class="py-1.5" :class="porVencer(t.expiresAt) ? 'text-warning' : 'text-muted'">
              {{ soloDia.format(new Date(t.expiresAt)) }}
            </td>
            <td class="py-1.5 text-right">
              <UBadge v-if="t.revokedAt" label="Revocado" color="neutral" size="sm" />
              <template v-else-if="puedeRevocar">
                <!--
                  RENOVAR SOLO CUANDO SE ACERCA. Un botón que está siempre se
                  pulsa por costumbre y convierte los noventa días en
                  permanentes, que es lo contrario de tener vigencia.
                -->
                <UButton
                  v-if="porVencer(t.expiresAt)"
                  label="Renovar"
                  icon="i-lucide-refresh-cw"
                  size="xs"
                  :loading="renovando === t.id"
                  @click="renovar(t.id)"
                />
                <UButton
                  label="Revocar"
                  icon="i-lucide-shield-x"
                  color="error"
                  size="xs"
                  :loading="revocando === t.id"
                  @click="revocar(t.id)"
                />
              </template>
            </td>
          </tr>
        </tbody>
      </table>

      <!--
        REVOCAR NO BORRA. Hay que poder seguir viendo desde qué aparato entró
        una checada de hace tres meses, aunque ese equipo ya no valga.
      -->
      <p v-if="(telefonos.data.value ?? []).length" class="text-dimmed text-xs">
        Revocar no borra el aparato: deja de poder checar, y las checadas que ya hizo siguen
        constando con su origen.
      </p>
    </div>

    <UModal v-model:open="invitando" title="Habilitar chequeo remoto">
      <template #body>
        <div class="space-y-4">
          <p class="text-muted text-sm">
            Le vamos a mandar a <strong>{{ persona.firstName }}</strong> un correo con un enlace
            propio. Esto es lo que va a leer:
          </p>

          <ol class="text-default border-default space-y-2 border p-4 text-sm">
            <li v-for="(paso, i) in PASOS" :key="i" class="flex gap-2">
              <span class="text-dimmed font-mono">{{ i + 1 }}.</span>
              <span>{{ paso }}</span>
            </li>
          </ol>

          <!--
            LO QUE MÁS SE MALENTIENDE, DICHO ANTES DE MANDARLO.

            Ya no es «que no lo abra en la computadora» —la computadora vale—,
            sino que el alta se queda EN EL APARATO QUE ABRE EL ENLACE, y que
            ese aparato es UNO. Quien pulsa este botón tiene que poder decírselo
            por teléfono: si lo abre en el equipo equivocado, el enlace se gastó
            y hay que mandarle otro.
          -->
          <UAlert icon="i-lucide-monitor-smartphone" color="warning">
            <template #description>
              El enlace <strong>caduca en 48 horas y sirve una sola vez</strong>, y da de alta
              <strong>el equipo en el que se abra</strong> — su teléfono o su computadora, el que él
              prefiera. Si lo abre en otro, se gastó y habrá que mandarle otro.
            </template>
          </UAlert>

          <!--
            Y LO QUE LE PASA AL ANTERIOR, dicho aquí y no descubierto el lunes.
            Solo se pinta si hay algo que tirar: decírselo a quien no tiene
            ninguno sería inventarle un problema.
          -->
          <UAlert v-if="vigentes.length > 0" icon="i-lucide-replace" color="warning">
            <template #description>
              Ya tiene <strong>{{ vigentes.length }}</strong>
              {{ vigentes.length === 1 ? 'equipo dado de alta' : 'equipos dados de alta' }}. En
              cuanto dé de alta el nuevo, {{ vigentes.length === 1 ? 'ese deja' : 'esos dejan' }}
              de poder checar: es un equipo por persona.
            </template>
          </UAlert>

          <!--
            EL CORREO ALTERNATIVO, para «no tengo el de la empresa en el
            teléfono». NO cambia su expediente: vale para este envío y nada
            más. Se dice, porque si no alguien va a creer que sí lo cambió.
          -->
          <UFormField
            label="Mandarlo a otro correo"
            help="Opcional. Vacío = al correo de su expediente. No cambia su expediente: vale solo para este envío, y queda registrado a dónde fue."
          >
            <UInput
              v-model="correoAlterno"
              type="email"
              :placeholder="persona.email ?? 'fermin.jimenez@gmail.com'"
              class="w-full"
            />
          </UFormField>

          <p v-if="!persona.email && !correoAlterno.trim()" class="text-error text-sm">
            No tiene correo en su expediente. Escribe arriba a dónde mandarlo, o captúraselo con
            «Editar».
          </p>

          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancelar" :disabled="mandando" @click="invitando = false" />
            <UButton
              label="Mandar el enlace"
              icon="i-lucide-send"
              :loading="mandando"
              :disabled="!persona.email && !correoAlterno.trim()"
              @click="mandarInvitacion"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UBadge
      :label="
        vigentes.length === 0
          ? 'Sin equipo'
          : `${vigentes.length} ${vigentes.length === 1 ? 'equipo' : 'equipos'}`
      "
      :color="vigentes.length === 0 ? 'neutral' : 'success'"
      size="sm"
      class="shrink-0"
    />
  </div>
</template>
