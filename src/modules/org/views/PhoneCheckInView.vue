<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { WebAuthnError, startAuthentication } from '@simplewebauthn/browser'

import { ApiError } from '@/shared/api/errors'
import { loQuePasoConLaHuella, sePuedeUsarHuella } from '@/shared/huella'
import AstraLogo from '@/shared/ui/AstraLogo.vue'
import GuiaDeInstalacion from '@/modules/remoto/components/GuiaDeInstalacion.vue'
import {
  checarSinReloj,
  type BaseVistaDesdeElTelefono,
  type EstadoDeLaPuerta,
} from '../checar-sin-reloj'
import { recordarMiBase } from '../mi-base'

/**
 * CHECAR DESDE EL TELÉFONO, EN LA PUERTA.
 *
 * Quien abre esto no tiene cuenta, está de pie en la entrada de una nave, con
 * una mano ocupada y con gente detrás en la fila. Todo lo de esta pantalla sale
 * de ahí: UNA sola cosa que hacer, botones grandes, y el resultado en una frase
 * que se lee de un vistazo.
 *
 * NO LLEVA EL ARMAZÓN DE LA APLICACIÓN —ni menú, ni selector de empresa, ni
 * barra— porque no es la aplicación: es un formulario de una sola cosa. Meterlo
 * dentro del armazón le enseñaría a un operario un menú que no puede abrir.
 *
 * ══ SE PRUEBA QUIÉN ERES, NO SOLO DÓNDE ESTÁS ══
 *
 * El área dice dónde está el teléfono; nunca dijo quién lo sostiene. Con solo el
 * número de empleado —que va escrito en el gafete— quien ya estaba dentro
 * fichaba por el compañero que no llegó. Ahora hay dos caminos y los dos son
 * suyos: la cara o la huella de su propio teléfono, o el código que inventó.
 *
 * EL NÚMERO DE EMPLEADO YA NO SE PIDE EN NINGUNO DE LOS DOS. Era un dato
 * público haciendo de credencial.
 *
 * ══ SIN MAPA, A PROPÓSITO ══
 *
 * La comprobación la hace el servidor con el área dibujada; pintar aquí un mapa
 * costaría datos, batería y segundos para enseñarle a alguien un punto sobre el
 * que no puede hacer nada.
 */
const route = useRoute()
const entityId = String(route.params.entityId ?? '')
const installationId = String(route.params.installationId ?? '')

const cargando = ref(true)
const base = ref<BaseVistaDesdeElTelefono | null>(null)
const errorAlAbrir = ref<string | null>(null)

const enviando = ref(false)
const error = ref<string | null>(null)
const listo = ref<{ hora: string; nombre: string; puerta: EstadoDeLaPuerta } | null>(null)

/**
 * LO QUE SE DICE DE LA PUERTA, y solo cuando hay algo que decir.
 *
 * `NO_CONFIGURADA` es el caso normal —ese sitio no acciona ningún imán— y
 * anunciarlo sería ruido en la pantalla de todos los días. `PEDIDA` tampoco se
 * pinta: la puerta se abre sola delante de esa persona y no hace falta contarlo.
 *
 * Los otros tres sí, porque la persona está delante de algo que no se movió y
 * cada uno manda a hacer una cosa distinta.
 */
const loDeLaPuerta = computed<string | null>(() => {
  switch (listo.value?.puerta) {
    case 'RELOJ_APAGADO':
      return 'La puerta no se abrió: el reloj de esta entrada está apagado. Tu checada sí quedó registrada.'
    case 'NO_SE_PUDO':
      return 'La puerta no se abrió. Tu checada sí quedó registrada.'
    case 'SIN_AREA':
      return 'La puerta no se abre desde aquí hasta que se dibuje el área de esta base. Tu checada sí quedó registrada — avísale a sistemas.'
    default:
      return null
  }
})

/** Si el aparato puede firmar. Sin esto no se ofrece: lleva a un diálogo vacío. */
const puedeFirmar = ref(false)

/**
 * UNA SOLA COSA EN LA PANTALLA, y el código detrás de un enlace.
 *
 * Tener las dos a la vista convertía una pantalla de un solo gesto en una
 * decisión: quien llega con prisa no tiene que elegir entre dos caminos, tiene
 * que fichar. Se enseña el que no obliga a teclear nada, y el otro se guarda
 * para el día en que el lector no lee, o para el aparato que no puede firmar.
 */
const conMiCodigo = ref(false)
const codigo = ref('')

const puedeConCodigo = computed(() => /^\d{4,6}$/.test(codigo.value) && !enviando.value)

onMounted(async () => {
  puedeFirmar.value = await sePuedeUsarHuella()

  try {
    base.value = await checarSinReloj.mirar(entityId, installationId)
    /*
     * Se recuerda la base para que el icono de la pantalla de inicio sepa a
     * dónde volver: el manifiesto es estático y su dirección no puede llevar
     * dentro el identificador de una instalación.
     */
    recordarMiBase({ entityId, installationId })
  } catch (e) {
    errorAlAbrir.value = e instanceof ApiError ? e.message : 'No encuentro esta base'
  } finally {
    cargando.value = false
  }
})

/**
 * El GPS del navegador, envuelto para poder esperarlo con `await`.
 *
 * `enableHighAccuracy` pide el chip de GPS y no la posición por antena: la
 * diferencia entre acertar el patio y acertar la colonia. Los 20 segundos son
 * para un teléfono que acaba de encender el GPS bajo un techo de lámina; menos
 * deja fuera justo a quien está dentro de la nave.
 */
function ubicacion(): Promise<GeolocationPosition> {
  return new Promise((resolver, rechazar) => {
    /*
     * SIN HTTPS NO HAY UBICACIÓN, Y EL NAVEGADOR NI SIQUIERA PREGUNTA.
     *
     * Safari y Chrome solo entregan la posición en un origen seguro. Por
     * `http://` a secas —una IP de la red local, por ejemplo— `getCurrentPosition`
     * falla en el acto con el mismo código que si la persona hubiera dicho que
     * no, sin enseñar ningún diálogo. Sin este aviso, quien está en la puerta
     * lee «acepta el permiso», va a los ajustes del teléfono a buscar un
     * permiso que nadie le pidió, y no lo encuentra.
     */
    if (!window.isSecureContext) {
      rechazar(
        new Error(
          'Esta página se abrió sin candado (http). Los teléfonos solo dan la ' +
            'ubicación en páginas seguras (https), así que avisa a sistemas: ' +
            'el enlace del cartel tiene que ser https.',
        ),
      )
      return
    }

    if (!('geolocation' in navigator)) {
      rechazar(new Error('Este teléfono no puede dar su ubicación'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolver, rechazar, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    })
  })
}

/** Lo que salió mal, dicho como toca según de dónde venga. */
function contarElFallo(e: unknown): void {
  if (e instanceof ApiError) {
    error.value = e.message
  } else if (e instanceof WebAuthnError) {
    error.value = loQuePasoConLaHuella(e)
  } else if (e instanceof Error && !('code' in e)) {
    // Los que lanza esta pantalla ya traen escrito qué pasa y qué hacer.
    error.value = e.message
  } else {
    error.value = 'No pude leer tu ubicación. Acepta el permiso de ubicación y vuelve a intentarlo'
  }
}

function registrada(r: { cuando: string; nombreCorto: string; puerta: EstadoDeLaPuerta }): void {
  listo.value = {
    /* El nombre viene de la respuesta: es lo único que lo dice, y solo ahora. */
    nombre: r.nombreCorto,
    hora: new Date(r.cuando).toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    puerta: r.puerta,
  }
}

/**
 * CHECAR SIN TECLEAR NADA.
 *
 * El teléfono enseña las credenciales que tiene de este sitio, la persona pone
 * su cara o su huella, y esa firma dice quién es.
 */
async function checarConMiCara(): Promise<void> {
  enviando.value = true
  error.value = null

  try {
    /*
     * El reto se pide ANTES de la ubicación: el navegador solo abre el diálogo
     * de la firma si viene de un toque reciente, y esperar al GPS —hasta veinte
     * segundos— se lo come.
     */
    const reto = await checarSinReloj.retoSinNumero(entityId, installationId)
    const firma = await startAuthentication({ optionsJSON: reto.opciones })

    const pos = await ubicacion()
    registrada(
      await checarSinReloj.checarConHuella(entityId, installationId, {
        nonce: reto.nonce,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyMeters: Math.round(pos.coords.accuracy),
        firma,
      }),
    )
  } catch (e) {
    contarElFallo(e)
  } finally {
    enviando.value = false
  }
}

/** Checar tecleando el código personal. Ni número de empleado, ni permiso. */
async function checarConMiCodigo(): Promise<void> {
  if (!puedeConCodigo.value) return
  enviando.value = true
  error.value = null

  try {
    const pos = await ubicacion()
    registrada(
      await checarSinReloj.checarConCodigo(entityId, installationId, {
        codigo: codigo.value,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyMeters: Math.round(pos.coords.accuracy),
      }),
    )
    codigo.value = ''
  } catch (e) {
    contarElFallo(e)
    /* Un código equivocado se vuelve a teclear; no se pierde nada más. */
    codigo.value = ''
  } finally {
    enviando.value = false
  }
}

function otraPersona(): void {
  listo.value = null
  codigo.value = ''
  error.value = null
  conMiCodigo.value = false
}
</script>

<template>
  <div class="bg-default text-default flex min-h-dvh flex-col justify-center px-4 py-8">
    <div class="mx-auto w-full max-w-sm space-y-6">
      <!--
        EL LOGOTIPO, CENTRADO Y ARRIBA. Antes había un reloj amarillo de aviso,
        que es el icono de «algo va mal»: esto ya no es la pantalla de cuando se
        rompe el reloj, es por donde ficha la gente todos los días.
      -->
      <header class="space-y-2 text-center">
        <div class="flex items-center justify-center gap-1.5">
          <AstraLogo class="size-8 shrink-0" />
          <span class="marca-astra text-[2rem] leading-none font-semibold tracking-tight">
            CLOCC
          </span>
        </div>
        <p v-if="base" class="text-muted text-sm">{{ base.installationName }}</p>
      </header>

      <p v-if="cargando" class="text-muted text-center text-sm">Un momento…</p>

      <UAlert
        v-else-if="errorAlAbrir"
        color="error"
        icon="i-lucide-circle-x"
        title="No encuentro esta base"
        :description="errorAlAbrir"
      />

      <!-- Ya checó. Se queda enseñando la hora hasta que alguien la quite. -->
      <template v-else-if="listo">
        <div class="border-success/40 bg-success/10 space-y-2 border p-6 text-center">
          <UIcon name="i-lucide-circle-check-big" class="text-success size-12" />
          <p class="text-highlighted text-lg font-semibold">Quedó registrada</p>
          <p class="text-default text-sm">{{ listo.nombre }} · {{ listo.hora }}</p>
        </div>

        <!--
          Se dice cuando la puerta NO se movió. Callarlo deja a alguien
          empujando un imán cerrado y creyendo que el sistema falló entero,
          cuando lo que falló es un extra y su jornada ya quedó registrada.
        -->
        <UAlert
          v-if="loDeLaPuerta"
          color="warning"
          icon="i-lucide-door-closed"
          :description="loDeLaPuerta"
        />
        <UButton label="Listo" icon="i-lucide-check" size="xl" block @click="otraPersona" />

        <!--
          El momento de decirle que lo instale es ESTE: acaba de funcionarle. Si
          nadie se lo dice, mañana vuelve a buscar el cartel y a escanearlo.
        -->
        <GuiaDeInstalacion />
      </template>

      <!-- El código personal, para quien no puede o no quiere poner la cara. -->
      <template v-else-if="conMiCodigo">
        <form class="space-y-4" @submit.prevent="checarConMiCodigo">
          <UFormField
            label="Tu código"
            help="Los números que inventaste al registrarte. No es tu número de empleado."
          >
            <UInput
              v-model="codigo"
              type="password"
              placeholder="······"
              inputmode="numeric"
              autocomplete="off"
              maxlength="6"
              size="xl"
              class="w-full"
            />
          </UFormField>

          <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

          <UButton
            type="submit"
            label="Checar aquí"
            icon="i-lucide-clock"
            size="xl"
            block
            :disabled="!puedeConCodigo"
            :loading="enviando"
          />
        </form>
        <p class="text-dimmed text-center text-xs">
          El teléfono va a pedirte permiso para usar tu ubicación. Sin ella no se puede comprobar
          que estás en tu centro de trabajo.
        </p>

        <UButton
          v-if="puedeFirmar"
          label="Volver a mi cara o mi huella"
          icon="i-lucide-scan-face"
          size="sm"
          block
          @click="
            () => {
              error = null
              conMiCodigo = false
            }
          "
        />
      </template>

      <!-- Lo normal: una sola cosa que hacer. -->
      <template v-else>
        <UButton
          v-if="puedeFirmar"
          label="Checar con mi cara o mi huella"
          icon="i-lucide-scan-face"
          size="xl"
          block
          :loading="enviando"
          @click="checarConMiCara"
        />

        <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

        <p v-if="puedeFirmar" class="text-dimmed text-center text-xs">
          Tu teléfono dice quién eres. No hace falta teclear nada.
        </p>

        <!--
          El otro camino existe, pero no compite: es un renglón pequeño al final.
          En un aparato que no puede firmar es lo único que hay, así que ahí se
          entra directo y sin enlace de por medio.
        -->
        <UButton
          :label="puedeFirmar ? 'No puedo usar mi cara o mi huella' : 'Checar con mi código'"
          :icon="puedeFirmar ? undefined : 'i-lucide-lock-keyhole'"
          :size="puedeFirmar ? 'sm' : 'xl'"
          block
          @click="
            () => {
              error = null
              conMiCodigo = true
            }
          "
        />
      </template>
    </div>
  </div>
</template>
