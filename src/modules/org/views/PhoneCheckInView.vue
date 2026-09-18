<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { WebAuthnError, startAuthentication } from '@simplewebauthn/browser'
import { loQuePasoConLaHuella, sePuedeUsarHuella } from '@/shared/huella'
import {
  checarSinReloj,
  type BaseVistaDesdeElTelefono,
  type PermisoParaChecar,
} from '../checar-sin-reloj'
import { ApiError } from '@/shared/api/errors'
import { olvidarQuienSoy, quienSoy, recordarQuienSoy } from '../quien-soy'

/**
 * CHECAR DESDE EL TELÉFONO CUANDO EL RELOJ ESTÁ MUERTO.
 *
 * Quien abre esto no tiene cuenta, está de pie en la puerta de una nave, con
 * una mano ocupada y con gente detrás en la fila. Todo lo de esta pantalla sale
 * de ahí: un solo dato que teclear, botones grandes, y el resultado en una
 * frase que se lee de un vistazo.
 *
 * NO LLEVA EL ARMAZÓN DE LA APLICACIÓN —ni menú, ni selector de empresa, ni
 * barra— porque no es la aplicación: es un formulario de una sola cosa. Meterlo
 * dentro del armazón le enseñaría a un operario un menú que no puede abrir.
 *
 * SIN MAPA A PROPÓSITO. La comprobación la hace el servidor con el área
 * dibujada; pintar aquí un mapa costaría datos, batería y segundos para
 * enseñarle a alguien un punto sobre el que no puede hacer nada.
 *
 * ══ AHORA HAY QUE PROBAR QUIÉN ERES, NO SOLO DÓNDE ESTÁS ══
 *
 * El área dice dónde está el teléfono; nunca dijo quién lo sostiene. Con solo
 * el número —que va escrito en el gafete— quien ya estaba dentro fichaba por el
 * compañero que no llegó. Así que quien tenga credencial registrada la presenta
 * aquí: la huella de su propio teléfono, o su PIN.
 *
 * Quien todavía no se ha registrado sigue checando como hasta hoy. El día que
 * esto se enciende, la planta entera tiene que poder seguir fichando.
 *
 * Y EL NOMBRE APARECE AL FINAL, con la checada ya hecha. Antes salía en cuanto
 * se tecleaba un número, y eso convertía el cartel en un directorio.
 *
 * ══ Y NO VUELVE A PEDIR EL NÚMERO ══
 *
 * La primera vez sí; a partir de ahí este teléfono se acuerda. Pedirlo cada día
 * tenía sentido cuando la contingencia era un aparato compartido pegado a la
 * puerta, y dejó de tenerlo en cuanto cada quien llega con el suyo y con su
 * credencial. Lo que se recuerda es el número y el nombre —ni el PIN ni nada
 * con lo que se pueda checar—, así que un teléfono perdido no ficha por nadie.
 */
const route = useRoute()
const entityId = String(route.params.entityId ?? '')
const installationId = String(route.params.installationId ?? '')

const cargando = ref(true)
const base = ref<BaseVistaDesdeElTelefono | null>(null)
const errorAlAbrir = ref<string | null>(null)

const clave = ref('')
const permiso = ref<PermisoParaChecar | null>(null)
const enviando = ref(false)
const error = ref<string | null>(null)
const listo = ref<{ hora: string; nombre: string } | null>(null)

const pin = ref('')
/**
 * Tiene huella pero pidió teclear su PIN.
 *
 * Existe porque los lectores fallan: un dedo mojado, una funda, el frío. Sin
 * esta salida, quien registró la huella se queda fuera de su propio trabajo por
 * un sensor sucio — y la alternativa a la que recurriría es pedirle a un
 * compañero que le fiche, que es justo lo que todo esto viene a impedir.
 */
const conPin = ref(false)

/** Qué le toca hacer ahora mismo a quien está delante. */
const pideAhora = computed<'HUELLA' | 'PIN' | 'NADA'>(() => {
  if (permiso.value === null) return 'NADA'
  if (permiso.value.pide === 'HUELLA' && !conPin.value) return 'HUELLA'
  if (permiso.value.pide === 'HUELLA' && conPin.value) return 'PIN'
  return permiso.value.pide
})

const puedeChecar = computed(
  () => !enviando.value && (pideAhora.value !== 'PIN' || /^\d{4,6}$/.test(pin.value)),
)

const puedeIdentificar = computed(() => clave.value.trim().length >= 1 && !enviando.value)

/** Lo que este teléfono recuerda de su dueño, si ya checó alguna vez. */
const yo = ref(quienSoy(entityId))

/** Si el aparato puede firmar. Sin esto no se ofrece: lleva a un diálogo vacío. */
const puedeFirmar = ref(false)

/**
 * UNA SOLA COSA EN LA PANTALLA, y el número detrás de un enlace.
 *
 * Tener las dos a la vista convertía una pantalla de un solo gesto en una
 * decisión: quien llega con prisa no tiene que elegir entre dos caminos, tiene
 * que fichar. Así que se enseña el que prueba quién es y el otro se guarda.
 *
 * NO SE BORRA, y conviene saber por qué: lo necesitan quien registró PIN en vez
 * de huella, quien todavía no se ha registrado —hoy, casi toda la planta— y el
 * aparato que no puede firmar. Borrarlo el día que se enciende esto dejaría a
 * esa gente sin poder fichar en su propio trabajo.
 */
const conMiNumero = ref(false)

onMounted(async () => {
  puedeFirmar.value = await sePuedeUsarHuella()

  try {
    base.value = await checarSinReloj.mirar(entityId, installationId)
  } catch (e) {
    errorAlAbrir.value = e instanceof ApiError ? e.message : 'No encuentro esta base'
    return
  } finally {
    cargando.value = false
  }

  /*
   * Con memoria, se pide el permiso SOLO, nada más abrir. Así la pantalla ya
   * aparece en el paso de la huella o del PIN y quien llega no teclea nada.
   *
   * Se hace aquí y no al pulsar porque el navegador solo abre el diálogo de la
   * huella si viene de un toque reciente: si al pulsar «checar» hubiera que
   * esperar antes a esta llamada, ese toque se gastaría por el camino.
   */
  if (yo.value !== null) {
    clave.value = yo.value.employeeCode
    await identificar()
  }
})

async function identificar(): Promise<void> {
  enviando.value = true
  error.value = null
  try {
    permiso.value = await checarSinReloj.identificar(entityId, installationId, clave.value.trim())
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude comprobar tu clave'
  } finally {
    enviando.value = false
  }
}

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
     *
     * `localhost` es la excepción de la regla y por eso en el portátil de quien
     * programa esto funciona sin darse cuenta de nada.
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

async function checar(): Promise<void> {
  if (permiso.value === null) return
  enviando.value = true
  error.value = null

  try {
    /*
     * LA HUELLA SE PIDE PRIMERO, ANTES QUE LA UBICACIÓN, y el orden importa:
     * el navegador solo abre el diálogo de la huella si viene de un toque
     * reciente de la persona. Esperar antes a que el GPS conteste —que puede
     * tardar veinte segundos bajo un techo de lámina— gasta ese permiso y el
     * diálogo ya no sale.
     */
    const firma =
      pideAhora.value === 'HUELLA' && permiso.value.opciones !== undefined
        ? await startAuthentication({ optionsJSON: permiso.value.opciones })
        : undefined

    const pos = await ubicacion()
    const r = await checarSinReloj.checar(entityId, installationId, {
      nonce: permiso.value.nonce,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyMeters: Math.round(pos.coords.accuracy),
      ...(firma ? { firma } : {}),
      ...(pideAhora.value === 'PIN' ? { pin: pin.value } : {}),
    })
    /* Este teléfono ya sabe de quién es: la próxima vez no pregunta nada. */
    recordarQuienSoy(entityId, {
      employeeCode: clave.value.trim(),
      nombreCorto: r.nombreCorto,
    })
    yo.value = quienSoy(entityId)

    listo.value = {
      /* El nombre viene de la respuesta: es lo único que lo dice, y solo ahora. */
      nombre: r.nombreCorto,
      hora: new Date(r.cuando).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.message
      /*
       * UN PIN EQUIVOCADO NO MANDA AL PRINCIPIO. Llega con 401 y a propósito:
       * el servidor lo comprueba ANTES de escribir nada, así que el permiso
       * sigue vivo y la persona solo tiene que volver a teclear su PIN. Con una
       * fila detrás, obligarla a repetir también su número es media fila más.
       */
      if (e.status === 401) pin.value = ''
      // Un permiso gastado o vencido sí: eso no se arregla reintentando, y la
      // pantalla lo dice sola volviendo atrás.
      else if (e.status === 409 || e.status === 400) volverAEmpezar()
    } else if (e instanceof WebAuthnError) {
      // La huella no salió: se dice en palabras y se deja intentarlo otra vez
      // sin perder el permiso — el reto sigue vivo hasta que el servidor lo gasta.
      error.value = loQuePasoConLaHuella(e)
    } else if (e instanceof Error && !('code' in e)) {
      // Los que lanza esta pantalla ya traen escrito qué pasa y qué hacer.
      error.value = e.message
    } else {
      error.value =
        'No pude leer tu ubicación. Acepta el permiso de ubicación y vuelve a intentarlo'
    }
  } finally {
    enviando.value = false
  }
}

/**
 * CHECAR SIN TECLEAR NADA.
 *
 * El teléfono enseña las credenciales que tiene de este sitio, la persona pone
 * su cara o su huella, y esa firma dice quién es. El número de empleado no hace
 * falta en ningún momento — y es lo correcto: un número que va escrito en el
 * gafete nunca demostró nada, y aquí hay algo que sí.
 *
 * Si el aparato no tiene ninguna credencial guardada, el diálogo se cierra sin
 * nada y se dice qué hacer: teclear el número, que es el camino de siempre.
 */
async function checarSinNumero(): Promise<void> {
  enviando.value = true
  error.value = null

  try {
    /*
     * El reto se pide ANTES de la ubicación por lo mismo de siempre: el
     * navegador solo abre el diálogo de la firma si viene de un toque reciente,
     * y esperar al GPS —hasta veinte segundos— se lo come.
     */
    const reto = await checarSinReloj.retoSinNumero(entityId, installationId)
    const firma = await startAuthentication({ optionsJSON: reto.opciones })

    const pos = await ubicacion()
    const r = await checarSinReloj.checarConHuella(entityId, installationId, {
      nonce: reto.nonce,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyMeters: Math.round(pos.coords.accuracy),
      firma,
    })

    listo.value = {
      nombre: r.nombreCorto,
      hora: new Date(r.cuando).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.message
    } else if (e instanceof WebAuthnError) {
      error.value = loQuePasoConLaHuella(e)
    } else if (e instanceof Error && !('code' in e)) {
      error.value = e.message
    } else {
      error.value =
        'No pude leer tu ubicación. Acepta el permiso de ubicación y vuelve a intentarlo'
    }
  } finally {
    enviando.value = false
  }
}

/** Vuelve al número, sin borrar el mensaje que explica por qué. */
function volverAEmpezar(): void {
  permiso.value = null
  pin.value = ''
  conPin.value = false
}

/**
 * «No soy yo» / «Checar otra persona»: se olvida el dueño de este teléfono.
 *
 * Olvidar es lo correcto aunque suene drástico: si alguien pulsa esto es porque
 * el aparato cambió de manos —o lo prestó un rato—, y dejar el número anterior
 * puesto haría que la próxima persona empiece con el nombre de otra en la
 * pantalla. Volver a recordarlo cuesta teclear el número una vez.
 */
function otraPersona(): void {
  listo.value = null
  clave.value = ''
  error.value = null
  olvidarQuienSoy(entityId)
  yo.value = null
  volverAEmpezar()
}
</script>

<template>
  <div class="bg-default text-default min-h-dvh px-4 py-8">
    <div class="mx-auto w-full max-w-sm space-y-6">
      <header class="space-y-1 text-center">
        <UIcon name="i-lucide-clock-alert" class="text-warning size-10" />
        <h1 class="text-highlighted text-xl font-semibold">Checar sin reloj</h1>
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
        <UButton
          label="Checar otra persona"
          icon="i-lucide-user-plus"
          size="xl"
          block
          @click="otraPersona"
        />
      </template>

      <!-- Paso 2: falta probar quién es y dónde está. -->
      <template v-else-if="permiso">
        <!--
          SE REPITE EL NÚMERO TECLEADO, NO EL NOMBRE.

          El nombre ya no viaja hasta el final —con él, probar números sacaba la
          plantilla entera—, pero quien está en la puerta necesita confirmar que
          no se equivocó de tecla. El número lo escribió esa persona hace dos
          segundos: repetirlo no le dice a nadie nada que no supiera.
        -->
        <!--
          CON MEMORIA SE SALUDA POR SU NOMBRE, Y NO SE CONTRADICE CON LA REGLA.

          El nombre no viene del servidor: lo guardó ESTE teléfono la última vez
          que esta persona checó de verdad. Teclear números en otro aparato
          sigue sin decir de quién son, que es lo que se quería cerrar.
        -->
        <div class="border-default bg-elevated/50 border p-5 text-center">
          <p class="text-muted text-xs tracking-wide uppercase">
            {{ yo ? 'Vas a checar como' : 'Vas a checar con el número' }}
          </p>
          <p
            class="text-highlighted mt-1 text-lg font-semibold"
            :class="yo?.nombreCorto ? '' : 'font-mono'"
          >
            {{ yo?.nombreCorto || clave.trim() }}
          </p>
        </div>

        <!-- Le toca poner el dedo. -->
        <div
          v-if="pideAhora === 'HUELLA'"
          class="border-default bg-elevated/50 space-y-2 border p-5 text-center"
        >
          <UIcon name="i-lucide-fingerprint" class="text-primary size-8" />
          <p class="text-default text-sm">
            Al darle a checar, <strong>tu teléfono</strong> te va a pedir tu cara o tu huella. No
            tienes que tocar el reloj de la pared.
          </p>
        </div>

        <!-- O teclear su PIN. -->
        <UFormField
          v-else-if="pideAhora === 'PIN'"
          label="Tu PIN"
          help="El que registraste. No es la clave con la que abres la puerta."
        >
          <UInput
            v-model="pin"
            type="password"
            placeholder="····"
            inputmode="numeric"
            autocomplete="off"
            maxlength="6"
            size="xl"
            class="w-full"
          />
        </UFormField>

        <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

        <UButton
          label="Checar aquí"
          icon="i-lucide-map-pin"
          size="xl"
          block
          :disabled="!puedeChecar"
          :loading="enviando"
          @click="checar"
        />
        <p class="text-dimmed text-center text-xs">
          El teléfono va a pedirte permiso para usar tu ubicación. Sin ella no se puede comprobar
          que estás en tu centro de trabajo.
        </p>

        <!--
          LA SALIDA CUANDO EL LECTOR NO LEE. Un dedo mojado, una funda, el frío.
          Sin esto, quien registró su huella se queda fuera de su propio trabajo
          por un sensor sucio — y lo que haría entonces es pedirle a un compañero
          que le fiche, que es justo lo que todo esto viene a impedir.
        -->
        <UButton
          v-if="permiso.tambienPin && !conPin"
          label="Mejor con mi PIN"
          icon="i-lucide-lock-keyhole"
          size="lg"
          block
          @click="
            () => {
              error = null
              conPin = true
            }
          "
        />
        <UButton
          v-else-if="conPin"
          label="Volver a la huella"
          icon="i-lucide-fingerprint"
          size="lg"
          block
          @click="
            () => {
              error = null
              pin = ''
              conPin = false
            }
          "
        />

        <UButton label="No soy yo" size="lg" block @click="otraPersona" />
      </template>

      <!-- Paso 1: quién eres. -->
      <template v-else>
        <!--
          LA CARA O LA HUELLA, PRIMERO Y SIN TECLEAR NADA.

          Quien ya registró su credencial no tiene por qué decirnos su número:
          el teléfono lo demuestra mejor. El formulario de abajo se queda para
          quien todavía no se ha registrado, para quien tiene PIN y para el
          aparato que no puede firmar — por eso esto es un botón y no un muro.
        -->
        <template v-if="puedeFirmar && !conMiNumero">
          <UButton
            label="Checar con mi cara o mi huella"
            icon="i-lucide-scan-face"
            size="xl"
            block
            :loading="enviando"
            @click="checarSinNumero"
          />

          <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

          <p class="text-dimmed text-center text-xs">
            Tu teléfono dice quién eres. No hace falta teclear nada.
          </p>

          <!--
            El otro camino existe, pero no compite: es un renglón pequeño al
            final, para quien registró PIN, para quien todavía no se ha
            registrado y para el día en que la cara no lee.
          -->
          <UButton
            label="No puedo usar mi cara o mi huella"
            size="sm"
            block
            @click="
              () => {
                error = null
                conMiNumero = true
              }
            "
          />
        </template>

        <form v-else class="space-y-4" @submit.prevent="identificar">
          <!--
            DICE «NÚMERO», NO «CLAVE», y la diferencia costó una prueba fallida.
            Con «tu clave del reloj» la primera persona tecleó su clave de
            PUERTA —los cuatro dígitos con los que abre— que Astra no guarda en
            ningún sitio. Lo que sí sabe es el número del padrón, y ese es el
            que hay que pedir, con un ejemplo delante para no dejar dudas.
          -->
          <UFormField
            label="Tu número de empleado"
            help="El que sale en la pantalla del reloj. También vale tu clave de Clocc."
          >
            <UInput
              v-model="clave"
              placeholder="00000001"
              inputmode="numeric"
              autocomplete="off"
              autocapitalize="characters"
              size="xl"
              class="w-full"
            />
          </UFormField>

          <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

          <UButton
            type="submit"
            label="Continuar"
            icon="i-lucide-arrow-right"
            size="xl"
            block
            :disabled="!puedeIdentificar"
            :loading="enviando"
          />
        </form>

        <UButton
          v-if="puedeFirmar && conMiNumero"
          label="Volver a mi cara o mi huella"
          icon="i-lucide-scan-face"
          size="sm"
          block
          @click="
            () => {
              error = null
              conMiNumero = false
            }
          "
        />
      </template>
    </div>
  </div>
</template>
