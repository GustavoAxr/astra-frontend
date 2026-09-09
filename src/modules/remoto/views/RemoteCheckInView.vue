<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError } from '@/shared/api/errors'
import { remotoApi } from '../api'
import {
  guardarTelefono,
  leerTelefono,
  marcarConLlave,
  olvidarTelefono,
  recordarEmpresa,
} from '../telefono-guardado'
import {
  activarLlave as activarLlaveEnElServidor,
  firmarChecada,
  loQuePasoConLaLlave,
  sePuedeUsarLlave,
} from '../llave'
import { colaDisponible, encolar, pendientes, sacar } from '../cola-de-checadas'

/**
 * CHECAR DESDE CASA.
 *
 * Quien abre esto no tiene cuenta en Astra y no está en ningún centro de
 * trabajo: está en su comedor, con su teléfono, y lo único que quiere es dejar
 * constancia de que empezó. Por eso la pantalla no lleva armazón, ni menú, ni
 * selector de empresa — igual que el cartel de la contingencia, y por la misma
 * razón.
 *
 * LA DIFERENCIA CON EL CARTEL, que es toda la pantalla: aquí el teléfono se DA
 * DE ALTA una vez y a partir de entonces checa de un toque. En la contingencia
 * hay que teclear el número cada vez porque el aparato es compartido —está
 * pegado a una puerta y lo usan treinta personas—; este es de una sola persona,
 * y pedirle su número todos los días sería tratarlo como si no lo fuera.
 *
 * SIN MAPA, como el cartel. La ubicación se manda y se guarda, pero aquí no hay
 * área contra la cual medirla: pintar un punto solo gastaría datos y batería
 * para enseñar algo sobre lo que nadie puede actuar.
 */
const route = useRoute()
const entityId = String(route.params.entityId ?? '')

type Paso = 'checar' | 'numero' | 'codigo'

const paso = ref<Paso>('numero')
const enviando = ref(false)
const error = ref<string | null>(null)

/** El token del teléfono, si este ya estaba dado de alta. */
const token = ref<string | null>(null)

/** Si este teléfono ya firma con huella. Lo impone el servidor; aquí se recuerda. */
const conLlave = ref(false)
/** Si el aparato PUEDE tener huella. Sin esto no se ofrece activarla. */
const puedeLlave = ref(false)
const activando = ref(false)

/** Checadas que se pulsaron sin red y siguen esperando. */
const enEspera = ref(0)
/** Lo que se le dice a alguien cuya checada quedó en la cola. */
const guardadaSinRed = ref(false)

const clave = ref('')
const codigo = ref('')
const etiqueta = ref('')
const pendiente = ref<{ nonce: string; enviadoA: string; nombre: string } | null>(null)

const listo = ref<{
  hora: string
  nombre: string
  comprobante: boolean
  firmada: boolean
} | null>(null)

const puedePedir = computed(() => clave.value.trim().length >= 1 && !enviando.value)
const puedeConfirmar = computed(() => /^\d{6}$/.test(codigo.value) && !enviando.value)

onMounted(async () => {
  /*
   * Se recuerda la empresa AUNQUE el teléfono no esté dado de alta todavía.
   * Quien abre el enlace, instala el icono y solo entonces teclea su número
   * tiene que poder volver por el icono — y en ese momento aún no hay token.
   */
  recordarEmpresa(entityId)

  const guardado = leerTelefono(entityId)
  if (guardado !== null) {
    token.value = guardado.token
    conLlave.value = guardado.conLlave === true
    paso.value = 'checar'
  }

  puedeLlave.value = await sePuedeUsarLlave()

  /*
   * Y lo primero de todo: sacar lo que se quedó atrapado sin red. Se hace al
   * abrir y no al recuperar la conexión porque una pantalla que nadie mira no
   * recupera nada: el navegador de un teléfono con la aplicación cerrada no
   * ejecuta este código.
   */
  await vaciarCola()
})

/**
 * MANDA LO QUE QUEDÓ ATRAPADO SIN RED.
 *
 * Va una a una y en orden. Si una falla por red, se para: insistir con las
 * demás solo gastaría batería para fallar igual. Si falla por otra cosa —el
 * teléfono se revocó mientras tanto— se saca de la cola, porque reintentarla
 * mañana daría el mismo error para siempre.
 */
async function vaciarCola(): Promise<void> {
  if (!(await colaDisponible())) return

  let cola
  try {
    cola = await pendientes()
  } catch {
    return
  }

  const mias = cola.filter((c) => c.entityId === entityId)
  enEspera.value = mias.length

  for (const p of mias) {
    if (token.value === null) return
    try {
      await remotoApi.checar(entityId, {
        token: token.value,
        lat: p.lat,
        lng: p.lng,
        accuracyMeters: p.accuracyMeters,
      })
      await sacar(p.id)
      enEspera.value -= 1
    } catch (e) {
      if (e instanceof ApiError) {
        /*
         * El servidor contestó: la checada llegó y no la quiso. Reintentarla
         * dará el mismo resultado mañana, así que se saca. La excepción es un
         * 5xx, que sí es transitorio.
         */
        if (e.status < 500) {
          await sacar(p.id)
          enEspera.value -= 1
        }
        return
      }
      /* Sin respuesta = sigue sin haber red. Se deja todo como está. */
      return
    }
  }
}

async function pedirCodigo(): Promise<void> {
  enviando.value = true
  error.value = null
  try {
    pendiente.value = await remotoApi.pedirCodigo(entityId, clave.value.trim())
    paso.value = 'codigo'
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude mandarte el código'
  } finally {
    enviando.value = false
  }
}

async function confirmar(): Promise<void> {
  if (pendiente.value === null) return
  enviando.value = true
  error.value = null
  try {
    const alta = await remotoApi.darDeAltaTelefono(entityId, {
      nonce: pendiente.value.nonce,
      codigo: codigo.value,
      etiqueta: etiqueta.value.trim() || undefined,
    })
    token.value = alta.token
    conLlave.value = false
    guardarTelefono(entityId, { token: alta.token, venceEl: alta.venceEl })
    recordarEmpresa(entityId)
    paso.value = 'checar'
    codigo.value = ''
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude dar de alta el teléfono'
  } finally {
    enviando.value = false
  }
}

/**
 * El GPS del navegador, envuelto para poder esperarlo con `await`.
 *
 * Mismo aviso de origen seguro que el cartel, y por el mismo motivo: sin https
 * el navegador NI SIQUIERA PREGUNTA, falla con el mismo código que si la
 * persona hubiera dicho que no. Sin este texto, alguien se va a los ajustes a
 * buscar un permiso que nadie le pidió.
 *
 * `enableHighAccuracy` aquí importa menos que en la nave —no hay borde que
 * acertar— pero se deja: si un día alguien tiene que revisar una checada, un
 * margen de 20 m dice mucho más que uno de 3 km.
 */
function ubicacion(): Promise<GeolocationPosition> {
  return new Promise((resolver, rechazar) => {
    if (!window.isSecureContext) {
      rechazar(
        new Error(
          'Esta página se abrió sin candado (http). Los teléfonos solo dan la ' +
            'ubicación en páginas seguras (https): avisa a sistemas.',
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

/**
 * ACTIVAR LA HUELLA EN ESTE TELÉFONO.
 *
 * Se dice ANTES lo que implica —a partir de aquí no se puede checar sin ella—
 * porque es irreversible desde el teléfono: quitarla exige que Recursos
 * Humanos revoque el aparato. Enterarse después sería una trampa.
 */
async function activarHuella(): Promise<void> {
  if (token.value === null) return
  activando.value = true
  error.value = null
  try {
    await activarLlaveEnElServidor(entityId, token.value)
    conLlave.value = true
    marcarConLlave(entityId)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : loQuePasoConLaLlave(e)
  } finally {
    activando.value = false
  }
}

async function checar(): Promise<void> {
  if (token.value === null) return
  enviando.value = true
  error.value = null
  guardadaSinRed.value = false

  try {
    const pos = await ubicacion()

    /*
     * LA HUELLA VA ANTES QUE EL ENVÍO, y el orden importa: si se pidiera
     * después, alguien podría quedarse mirando «mandando…» mientras el
     * teléfono espera un dedo que nadie ve que hace falta.
     */
    const firma = conLlave.value
      ? await firmarChecada(entityId, token.value)
      : undefined

    const r = await remotoApi.checar(entityId, {
      token: token.value,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyMeters: Math.round(pos.coords.accuracy),
      firma,
    })
    listo.value = {
      nombre: r.nombre,
      comprobante: r.comprobante,
      firmada: r.firmada,
      hora: new Date(r.cuando).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.message
      /*
       * 403 y 404 significan que este teléfono ya no sirve: se revocó, se
       * venció, o a esa persona le quitaron el trabajo remoto. Se OLVIDA el
       * token y se vuelve al principio, porque insistir con él no lo va a
       * arreglar y dejarlo guardado haría que mañana pase lo mismo.
       */
      if (e.status === 403 || e.status === 404) {
        olvidarTelefono(entityId)
        token.value = null
        paso.value = 'numero'
      }
    } else if (esFalloDeLlave(e)) {
      error.value = loQuePasoConLaLlave(e)
    } else if (e instanceof TypeError) {
      /*
       * SIN RED: `fetch` falla con `TypeError` y sin respuesta. Es el ÚNICO
       * caso en que la checada se encola, y se distingue a propósito de un
       * error del servidor: si el servidor contestó, la checada llegó y fue
       * rechazada; guardarla para reintentarla sería prometer algo que no va a
       * pasar.
       */
      await guardarParaDespues()
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

/** Un fallo del diálogo de la huella, que se cuenta distinto de todo lo demás. */
function esFalloDeLlave(e: unknown): boolean {
  return (
    e instanceof Error &&
    ['NotAllowedError', 'InvalidStateError', 'NotSupportedError', 'AbortError'].includes(
      e.name,
    )
  )
}

/**
 * La checada se queda en el teléfono hasta que vuelva la red.
 *
 * Se guarda la HORA EN QUE SE PULSÓ, no la del envío: es la única que dice algo
 * de la jornada de esa persona. El servidor conserva las dos y la diferencia
 * entre ambas es exactamente el tiempo que estuvo sin cobertura.
 */
async function guardarParaDespues(): Promise<void> {
  if (!(await colaDisponible())) {
    error.value =
      'No hay conexión y este navegador no puede guardar la checada. ' +
      'Vuelve a intentarlo cuando tengas señal.'
    return
  }
  try {
    const pos = await ubicacion()
    await encolar({
      entityId,
      cuando: new Date().toISOString(),
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyMeters: Math.round(pos.coords.accuracy),
    })
    enEspera.value += 1
    guardadaSinRed.value = true
  } catch {
    error.value =
      'No hay conexión y no pude guardar la checada. Vuelve a intentarlo con señal.'
  }
}

function otraVez(): void {
  listo.value = null
  error.value = null
  guardadaSinRed.value = false
}

/** Para cuando alguien cambia de teléfono o quiere quitar este de en medio. */
function olvidarEsteTelefono(): void {
  olvidarTelefono(entityId)
  token.value = null
  pendiente.value = null
  clave.value = ''
  codigo.value = ''
  listo.value = null
  error.value = null
  conLlave.value = false
  guardadaSinRed.value = false
  paso.value = 'numero'
}
</script>

<template>
  <div class="bg-default text-default min-h-dvh px-4 py-8">
    <div class="mx-auto w-full max-w-sm space-y-6">
      <header class="space-y-1 text-center">
        <UIcon name="i-lucide-house" class="text-primary size-10" />
        <h1 class="text-highlighted text-xl font-semibold">Checar a distancia</h1>
      </header>

      <!--
        SIN RED: la checada quedó guardada en el teléfono. Se dice con las
        mismas palabras que la registrada y con un color distinto, porque son
        dos cosas distintas y confundirlas es lo peor que puede pasar aquí:
        alguien que cree haber checado y no checó.
      -->
      <template v-if="guardadaSinRed">
        <div class="border-warning/40 bg-warning/10 space-y-2 rounded-xl border p-6 text-center">
          <UIcon name="i-lucide-cloud-off" class="text-warning size-12" />
          <p class="text-highlighted text-lg font-semibold">Guardada en este teléfono</p>
          <p class="text-default text-sm">
            No hay conexión ahora mismo. Se mandará sola en cuanto vuelva la señal, con
            la hora en que le diste al botón.
          </p>
          <p class="text-muted text-xs">
            Abre esta pantalla otra vez cuando tengas red para que salga.
          </p>
        </div>
        <UButton label="Listo" icon="i-lucide-check" size="xl" block @click="otraVez" />
      </template>

      <!-- Ya checó. -->
      <template v-else-if="listo">
        <div class="border-success/40 bg-success/10 space-y-2 rounded-xl border p-6 text-center">
          <UIcon name="i-lucide-circle-check-big" class="text-success size-12" />
          <p class="text-highlighted text-lg font-semibold">Quedó registrada</p>
          <p class="text-default text-sm">{{ listo.nombre }} · {{ listo.hora }}</p>
          <!--
            Se dice si salió el acuse, y se dice cuando NO salió.
            El acuse es lo que permite a alguien darse cuenta de que checaron
            por él; que falte no es un detalle menor y callarlo sería esconder
            justo la parte que protege a esa persona.
          -->
          <p v-if="listo.comprobante" class="text-muted text-xs">
            Te mandamos el comprobante por correo.
          </p>
          <p v-else class="text-warning text-xs">
            No tienes correo en tu expediente, así que no hay comprobante. Pídele a
            Recursos Humanos que lo capture.
          </p>
          <!--
            Se dice que fue con huella. No es un adorno: es la diferencia entre
            una checada que cuenta sola y una que un supervisor tiene que
            aprobar, y quien la hizo tiene derecho a saber en cuál está.
          -->
          <p v-if="listo.firmada" class="text-muted text-xs">
            <UIcon name="i-lucide-fingerprint" class="size-3 align-[-2px]" />
            Firmada con tu huella.
          </p>
        </div>
        <UButton label="Listo" icon="i-lucide-check" size="xl" block @click="otraVez" />
      </template>

      <!-- El caso de todos los días: un botón. -->
      <template v-else-if="paso === 'checar'">
        <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

        <UButton
          :label="conLlave ? 'Checar con mi huella' : 'Checar ahora'"
          :icon="conLlave ? 'i-lucide-fingerprint' : 'i-lucide-map-pin'"
          size="xl"
          block
          :loading="enviando"
          @click="checar"
        />

        <!--
          Lo que quedó esperando señal. Se pinta SIEMPRE que haya algo, y no
          solo justo después de encolarlo: alguien que cerró la aplicación y
          vuelve al día siguiente tiene que ver que aquello sigue sin salir.
        -->
        <p v-if="enEspera > 0" class="text-warning text-center text-xs">
          <UIcon name="i-lucide-cloud-off" class="size-3 align-[-2px]" />
          {{ enEspera }} checada(s) esperando señal para mandarse.
        </p>

        <p class="text-dimmed text-center text-xs">
          Este teléfono ya está dado de alta. Se guarda desde dónde checas y te llega un
          comprobante por correo cada vez.
        </p>

        <!--
          ACTIVAR LA HUELLA. Se ofrece solo si el aparato puede —preguntar por
          una huella a un navegador sin lector manda a un diálogo que termina
          en nada— y se dice lo que implica ANTES, porque desde el teléfono no
          hay vuelta atrás: quitarla exige que RRHH revoque el aparato.
        -->
        <div
          v-if="!conLlave && puedeLlave"
          class="border-default bg-elevated/50 space-y-3 rounded-xl border p-5"
        >
          <p class="text-highlighted text-sm font-semibold">
            <UIcon name="i-lucide-fingerprint" class="size-4 align-[-3px]" />
            Checa con tu huella
          </p>
          <p class="text-muted text-xs">
            Tu checada pasa a valer por sí sola, sin que nadie tenga que aprobarla. Y si
            alguien se lleva tu teléfono, no puede checar por ti.
          </p>
          <p class="text-dimmed text-xs">
            Una vez activada, este teléfono ya no podrá checar sin tu huella. Para
            quitarla hay que hablar con Recursos Humanos.
          </p>
          <UButton
            label="Activar mi huella"
            icon="i-lucide-fingerprint"
            size="lg"
            block
            :loading="activando"
            @click="activarHuella"
          />
        </div>
        <UButton label="Este no es mi teléfono" size="lg" block @click="olvidarEsteTelefono" />
      </template>

      <!-- Alta, paso 2: el código que llegó por WhatsApp. -->
      <template v-else-if="paso === 'codigo' && pendiente">
        <div class="border-default bg-elevated/50 rounded-xl border p-5 text-center">
          <p class="text-muted text-xs tracking-wide uppercase">Le mandamos un código a</p>
          <p class="text-highlighted mt-1 text-lg font-semibold">
            {{ pendiente.enviadoA }}
          </p>
          <p class="text-muted mt-1 text-sm">{{ pendiente.nombre }}</p>
        </div>

        <form class="space-y-4" @submit.prevent="confirmar">
          <UFormField label="El código" help="Seis cifras. Dura diez minutos.">
            <UInput
              v-model="codigo"
              placeholder="000000"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              size="xl"
              class="w-full"
            />
          </UFormField>

          <!--
            La etiqueta es opcional pero se pide AQUÍ y no después: es el único
            momento en que la persona sabe desde qué aparato está dando de alta.
            Sin ella, revocar un teléfono perdido desde Astra es elegir entre
            tres renglones idénticos.
          -->
          <UFormField
            label="¿Cómo se llama este teléfono?"
            help="Opcional. Sirve para reconocerlo si algún día hay que darlo de baja."
          >
            <UInput v-model="etiqueta" placeholder="Mi celular" size="xl" class="w-full" />
          </UFormField>

          <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

          <UButton
            type="submit"
            label="Dar de alta este teléfono"
            icon="i-lucide-smartphone"
            size="xl"
            block
            :disabled="!puedeConfirmar"
            :loading="enviando"
          />
        </form>

        <UButton label="Volver" size="lg" block @click="olvidarEsteTelefono" />
      </template>

      <!-- Alta, paso 1: quién eres. -->
      <template v-else>
        <form class="space-y-4" @submit.prevent="pedirCodigo">
          <UFormField
            label="Tu número de empleado"
            help="El mismo que usas en el reloj. También vale tu clave de Astra."
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
            label="Mandarme el código"
            icon="i-lucide-message-circle"
            size="xl"
            block
            :disabled="!puedePedir"
            :loading="enviando"
          />
          <p class="text-dimmed text-center text-xs">
            Te llega por WhatsApp al número de tu expediente. Solo hace falta una vez:
            después este teléfono checa de un toque.
          </p>
        </form>
      </template>
    </div>
  </div>
</template>
