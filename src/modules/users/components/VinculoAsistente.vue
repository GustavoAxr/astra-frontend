<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import QRCode from 'qrcode'
import { useAviso } from '@/shared/ui/aviso'
import { useAuthStore } from '@/modules/auth/store'
import { asistenteApi, type VinculoDelAsistente } from '../api-asistente'

/**
 * EL TELEGRAM DE UNA CUENTA, dentro de su propia tarjeta.
 *
 * ══ POR QUÉ AQUÍ Y NO EN UNA PANTALLA APARTE ══
 *
 * Un chat ligado es una concesión de acceso: desde él se pueden consultar
 * faltas y asistencias de la plantilla. Vive donde viven las demás concesiones
 * —al lado de los roles de esa persona— porque el día que alguien se va, el
 * sitio al que se entra a quitarle cosas es este, y lo que no esté aquí se
 * queda puesto.
 *
 * ══ POR QUÉ UN ENLACE Y NO UN NÚMERO ══
 *
 * Antes se tecleaba un teléfono y salía un código por WhatsApp. Dos problemas:
 * unos dígitos se teclean mal —y un error de captura ligaba la cuenta de
 * dirección al teléfono de un desconocido— y el código viaja por un canal que
 * alguien puede leer por encima del hombro.
 *
 * Ahora Astra genera un enlace y quien lo toca queda ligado — su identidad la
 * pone Telegram, no un campo de texto.
 *
 * ══ TRES VÍAS, Y CADA UNA ES PARA UNA SITUACIÓN ══
 *
 *  · **QR** — la persona está delante. Apunta la cámara y le abre Telegram. El
 *    secreto va de esta pantalla a su teléfono y no pasa por ningún sitio más;
 *    es la más segura de las tres y no hace falta explicarle nada a nadie.
 *  · **Copiar** — la persona no está. Se lo mandas por donde ya hables con ella.
 *  · **Correo** — igual, pero sin salir de aquí. El secreto queda escrito en un
 *    buzón, que es la contrapartida; por eso el enlace dura media hora.
 *
 * Ninguna sustituye a las otras y por eso están las tres: en una nave hay gente
 * sin lector de QR, gente que no lee el correo y gente que está justo enfrente.
 *
 * ══ LO QUE NO HACE FALTA HACER AL DESACTIVAR A ALGUIEN ══
 *
 * Nada. El servidor exige `users.is_active` para resolver un chat entrante, así
 * que desactivar la cuenta apaga su Telegram EN EL ACTO, y reactivarla lo
 * devuelve. El vínculo no se revoca: deja de valer mientras la cuenta esté
 * apagada. Por eso aquí se pinta atenuado en vez de desaparecer — sigue ahí, y
 * hay que poder verlo.
 */
const props = defineProps<{
  userId: string
  userName: string
  /** El vínculo vivo de esa cuenta, si tiene. */
  vinculo: VinculoDelAsistente | null
  /** La cuenta está desactivada: el vínculo existe pero no vale. */
  activo: boolean
  /** Los roles de esa cuenta. Deciden si el asistente le va a contestar. */
  roles: readonly string[]
}>()
const emit = defineEmits<{ cambio: [] }>()
const aviso = useAviso()
const auth = useAuthStore()

/**
 * QUIÉN REPARTE ESTE ACCESO. No es quien ve esta pantalla.
 *
 * La pantalla es de `manageUsers` —dirección del grupo, dirección de la
 * empresa y soporte—, pero dar acceso al asistente es SOLO de la dirección de
 * la empresa.
 *
 * Usar el asistente y repartirlo son cosas distintas: RRHH pregunta, pero no
 * reparte. Y soporte y la dirección del grupo ven la tarjeta de cada persona y
 * NO ven esta parte. Oculta, no protege: el servidor contesta 403 igual. Si
 * esta línea se quedara vieja, el peor síntoma es un botón de más.
 */
const puedeRepartir = computed(() => auth.can('manageAssistantLinks'))

/**
 * A QUIÉN LE CONTESTA EL ASISTENTE. Espejo de `ROLES_QUE_PREGUNTAN` en el
 * backend, y **solo para avisar**: aquí no se impide ligar nada.
 *
 * Ligar es una cosa y preguntar es otra, y las hacen roles distintos a
 * propósito: RRHH pregunta pero no reparte accesos; soporte reparte accesos
 * pero no pregunta —entra a varios clientes y en un chat no hay forma de
 * saber a cuál—. Sin este aviso, ligar la cuenta de un supervisor decía «ya
 * puede preguntarle a Astra» y luego el asistente callaba para siempre sin
 * explicar por qué, que es la peor forma de negar un permiso.
 *
 * Si el backend cambia su lista, esto se queda viejo y el único síntoma es un
 * aviso de más o de menos.
 */
const ROLES_QUE_PREGUNTAN = ['ADMIN_EMPRESA', 'RRHH']

const contesta = computed(() => props.roles.some((r) => ROLES_QUE_PREGUNTAN.includes(r)))

const trabajando = ref(false)
/** El enlace recién generado. Solo vive en pantalla: no se guarda en claro. */
const enlace = ref<string | null>(null)
const copiado = ref(false)
const verQr = ref(false)
const lienzo = ref<HTMLCanvasElement | null>(null)

/**
 * Abre un alta y enseña el enlace.
 *
 * Si ya había una a medias, la REVOCA primero. Es el caso normal, no el raro:
 * el enlace solo vive mientras dura la pantalla —lleva el secreto dentro y el
 * servidor guarda su hash, así que no puede volver a enseñarlo—, y en cuanto
 * alguien recarga se queda con un alta que no puede usar ni ver. Sin esto, la
 * única salida era cancelar y volver a empezar, y la pantalla decía «genera
 * otro» sin ofrecer ningún sitio donde hacerlo.
 *
 * Se revoca en vez de reusar porque el secreto anterior es irrecuperable: no
 * hay nada que reusar.
 */
async function abrirAlta(porCorreo = false): Promise<void> {
  if (trabajando.value) return
  trabajando.value = true
  try {
    if (props.vinculo !== null && props.vinculo.verifiedAt === null) {
      await asistenteApi.revocar(props.vinculo.id)
    }
    const alta = await asistenteApi.crear(props.userId, porCorreo)
    enlace.value = alta.enlace
    copiado.value = false
    verQr.value = false

    if (porCorreo) {
      /*
       * Se dice si SALIÓ o no, nunca «ya se lo mandamos» a secas. El alta se
       * crea igual aunque el correo falle —el enlace está aquí para copiarlo—
       * y dar por enviado lo que no salió deja a alguien esperando un correo
       * que no existe. Ya pasó una vez en esta casa con el despachador.
       */
      if (alta.correoEncolado) {
        aviso.hecho(
          'Enlace enviado',
          `A ${alta.correoA}. Vale media hora y un solo uso.`,
        )
      } else {
        /*
         * Se dice que NO salió, nunca «ya se lo mandamos». El alta se creó
         * igual —el enlace está en pantalla— y dar por enviado lo que no salió
         * deja a alguien esperando un correo que no existe.
         */
        aviso.aviso(
          'El correo no salió',
          'El alta sí quedó: cópiale el enlace o enséñale el QR.',
        )
      }
    }

    emit('cambio')
  } catch (e) {
    aviso.fallo(e, 'generar el enlace')
  } finally {
    trabajando.value = false
  }
}

/**
 * El QR se dibuja en el momento y no se guarda: es una función del enlace, y el
 * enlace ya lo tiene esta pantalla.
 */
async function alternarQr(): Promise<void> {
  verQr.value = !verQr.value
  if (!verQr.value || enlace.value === null) return

  await nextTick()
  if (lienzo.value === null) return

  await QRCode.toCanvas(lienzo.value, enlace.value, {
    width: 180,
    margin: 1,
    // Negro sobre blanco fijo, sin seguir el tema: un QR claro sobre fondo
    // oscuro no lo lee ninguna cámara.
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
}

async function copiar(): Promise<void> {
  if (enlace.value === null) return
  try {
    await navigator.clipboard.writeText(enlace.value)
    copiado.value = true
    aviso.hecho(
      'Enlace copiado',
      contesta.value
        ? `Pásaselo a ${props.userName}. Vale media hora y una sola vez.`
        : `Pásaselo a ${props.userName}. Ojo: por su rol, el asistente no le contestará.`,
    )
  } catch {
    // Sin permiso de portapapeles —o sin HTTPS— queda el enlace a la vista
    // para copiarlo a mano. No es un fallo que merezca un aviso rojo.
    copiado.value = true
  }
}

async function revocar(): Promise<void> {
  if (props.vinculo === null || trabajando.value) return
  trabajando.value = true
  try {
    await asistenteApi.revocar(props.vinculo.id)
    aviso.borrado('Acceso por Telegram', props.userName)
    enlace.value = null
    emit('cambio')
  } catch (e) {
    aviso.fallo(e, 'quitar el acceso')
  } finally {
    trabajando.value = false
  }
}
</script>

<template>
  <!--
    SIN PERMISO NO SE PINTA NADA, ni siquiera el chip de quien ya está ligado.
    Enseñar «tiene Telegram» a quien no puede tocarlo es contar una concesión
    de acceso a alguien que no la administra.
  -->
  <div v-if="puedeRepartir" class="mt-2 flex flex-wrap items-center gap-2">
    <!-- Ligado y confirmado: contesta. -->
    <template v-if="vinculo && vinculo.verifiedAt">
      <span
        class="border-default bg-elevated/50 inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-2.5 text-xs"
        :class="activo ? '' : 'opacity-60'"
      >
        <UIcon name="i-lucide-send" class="size-3" />
        <span class="font-mono">{{ vinculo.displayName ?? 'Telegram' }}</span>
        <!--
          Se dice que está en pausa en vez de esconderlo. El vínculo sigue ahí y
          vuelve solo al reactivar la cuenta; esconderlo haría creer que hay que
          volver a ligarlo.
        -->
        <span v-if="!activo" class="text-muted">· en pausa</span>
        <!--
          El rol pesa MÁS que la desactivación y por eso se pinta igual: una
          cuenta en pausa vuelve sola al reactivarla, pero un supervisor ligado
          no va a contestar nunca aunque esté activo. Sin esto, el vínculo se ve
          idéntico al de un administrador y nadie entiende el silencio.
        -->
        <span v-if="!contesta" class="text-warning">· su rol no pregunta</span>
        <UButton
          icon="i-lucide-x"
          size="xs"
          square
          aria-label="Quitar el acceso por Telegram"
          :disabled="trabajando"
          @click="revocar"
        />
      </span>
    </template>

    <!-- Alta abierta y sin tocar: el enlace existe pero nadie lo ha usado. -->
    <template v-else-if="vinculo">
      <span
        class="border-warning/40 bg-warning/10 inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs"
      >
        <UIcon name="i-lucide-link" class="size-3" />
        <span class="text-muted">Enlace sin usar</span>
      </span>

      <!--
        EL ENLACE SOLO SE VE UNA VEZ, mientras dura esta pantalla. Lleva el
        secreto dentro, así que el servidor guarda su hash y no puede volver a
        enseñarlo: si se pierde, se genera otro. Es el mismo trato que una
        contraseña.
      -->
      <template v-if="enlace">
        <UInput
          :model-value="enlace"
          readonly
          size="xs"
          class="w-72 font-mono"
          @focus="(e: FocusEvent) => (e.target as HTMLInputElement).select()"
        />
        <UButton
          :label="copiado ? 'Copiado' : 'Copiar'"
          :icon="copiado ? 'i-lucide-check' : 'i-lucide-copy'"
          size="xs"
          @click="copiar"
        />
        <UButton
          :label="verQr ? 'Ocultar QR' : 'Ver QR'"
          icon="i-lucide-qr-code"
          size="xs"
          @click="alternarQr"
        />
      </template>
      <!--
        SIN ENLACE A LA VISTA. Pasa siempre que se recarga la pantalla: el
        secreto no se guarda en claro, así que el servidor no puede volver a
        enseñarlo. Lo único útil aquí es generar otro, y por eso es lo que se
        ofrece — antes solo decía «genera otro» sin dónde.
      -->
      <template v-else>
        <span class="text-dimmed text-xs">
          El enlace de antes ya no se puede volver a ver.
        </span>
        <UButton
          label="Mandar otro por correo"
          icon="i-lucide-refresh-cw"
          size="xs"
          :loading="trabajando"
          @click="abrirAlta(true)"
        />
        <UButton
          label="Sin correo"
          icon="i-lucide-qr-code"
          size="xs"
          :disabled="trabajando"
          @click="abrirAlta(false)"
        />
      </template>

      <UButton
        label="Cancelar"
        size="xs"
        :disabled="trabajando"
        @click="revocar"
      />

      <!--
        EL QR EN SU PROPIA LÍNEA. Es para que alguien apunte el teléfono a esta
        pantalla, así que necesita tamaño: metido entre los botones sería
        ilegible justo para lo único que sirve.
      -->
      <div v-if="verQr && enlace" class="basis-full pt-2">
        <canvas ref="lienzo" class="rounded bg-white p-2" />
        <p class="text-dimmed mt-1 text-xs">
          Apunta la cámara desde el teléfono donde tengas Telegram.
        </p>
      </div>
    </template>

    <!-- Sin nada. -->
    <template v-else>
      <!--
        EL BOTÓN NORMAL MANDA EL CORREO. El enlace sale al buzón registrado de
        esa persona y a ningún otro sitio: nadie tiene que copiarlo ni pegarlo
        en otro chat, que es donde se pierden y donde acaban reenviados.
      -->
      <UButton
        label="Dar acceso por Telegram"
        icon="i-lucide-send"
        size="xs"
        :loading="trabajando"
        @click="abrirAlta(true)"
      />
      <!--
        Y la salida para cuando la persona está delante: se genera sin llenarle
        el buzón y se le enseña el QR.
      -->
      <UButton
        label="Sin correo, se lo doy en mano"
        icon="i-lucide-qr-code"
        size="xs"
        :disabled="trabajando"
        @click="abrirAlta(false)"
      />
    </template>
  </div>
</template>
