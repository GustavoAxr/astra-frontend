import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import basicSsl from '@vitejs/plugin-basic-ssl'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import ui from '@nuxt/ui/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Variantes por defecto del proyecto, verificadas contra el tema de @nuxt/ui 4.11
// (son los únicos componentes que declaran `variants.variant.ghost` / `.soft`).
//
// - `ghost`: botones y contenedores. Fondo transparente, se pinta al hover.
// - `soft`:  campos de formulario. `bg-elevated/50` fijo, para que el campo se
//            distinga del fondo sin llegar a tener borde.
const ghost = { defaultVariants: { variant: 'ghost' } } as const
const soft = { defaultVariants: { variant: 'soft' } } as const

/**
 * QUÉ ICONOS HAY QUE METER EN EL PAQUETE.
 *
 * Recorre `src/` y recoge cada `i-lucide-…` que aparezca escrito. Se hace aquí,
 * al compilar, y no a mano en una lista: una lista a mano se queda corta el día
 * que alguien añade una pantalla, y el síntoma —un icono que no aparece— no se
 * parece en nada a la causa.
 *
 * FUNCIONA PORQUE NINGÚN NOMBRE SE CONSTRUYE EN TIEMPO DE EJECUCIÓN. Están los
 * 111 escritos enteros. Si algún día alguien escribe `i-lucide-${'${'}algo}`, este
 * barrido no lo verá y ese icono volverá a pedirse a internet —o sea, a no
 * aparecer—. Es el precio de no depender de un servicio ajeno, y es barato:
 * escribir el nombre completo.
 */
function iconosUsados(): string[] {
  const raiz = fileURLToPath(new URL('./src', import.meta.url))
  const extensiones = new Set(['.vue', '.ts', '.tsx'])
  const encontrados = new Set<string>()

  const recorrer = (dir: string): void => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, entrada.name)
      if (entrada.isDirectory()) {
        recorrer(ruta)
      } else if (extensiones.has(extname(entrada.name))) {
        for (const m of readFileSync(ruta, 'utf8').matchAll(/i-lucide-[a-z0-9-]+/g)) {
          encontrados.add(`lucide:${m[0].slice('i-lucide-'.length)}`)
        }
      }
    }
  }
  recorrer(raiz)

  return [...encontrados].sort()
}

// https://vite.dev/config/
/**
 * SEGURO DE DESPLIEGUE: en producción la API se nombra entera.
 *
 * El front vive en un servidor (Oracle, Monterrey) y la API en otro (Contabo,
 * Francia). El nginx del front no reenvía nada, así que una URL relativa como
 * la `"/api"` del desarrollo no falla de forma visible: cae en el `index.html`
 * del SPA y devuelve **200 con HTML**. La aplicación entonces no se cae, hace
 * algo peor — cierra la sesión sola y contesta «la petición no se pudo
 * completar» a todo, sin una sola línea en el registro del servidor, porque
 * ninguna petición llegó a salir del dominio.
 *
 * Pasó al publicar un paquete construido con el `.env` de desarrollo. Esto lo
 * convierte en un build que falla, que es donde se tiene que ver.
 */
function apiAbsolutaEnProduccion() {
  return {
    name: 'astra:api-absoluta-en-produccion',
    apply: 'build' as const,
    configResolved(config: { mode: string; env: Record<string, string> }) {
      if (config.mode !== 'production') return

      const url = config.env.VITE_API_URL ?? ''
      if (/^https?:\/\//.test(url)) return

      throw new Error(
        `VITE_API_URL vale ${JSON.stringify(url)} y un build de producción necesita la ` +
          'dirección completa de la API (https://…). Ponla en .env.production, que gana ' +
          'sobre .env y no se commitea. Con una ruta relativa las llamadas caen en el ' +
          'index.html del propio front: 200, HTML, y la sesión se cierra sola.',
      )
    },
  }
}

export default defineConfig({
  plugins: [
    apiAbsolutaEnProduccion(),
    /*
     * Certificado propio para el servidor de desarrollo.
     *
     * No lo firma nadie conocido, así que el teléfono enseña un aviso la
     * primera vez y hay que entrar de todas formas. A cambio, la página pasa a
     * ser un origen seguro y el navegador SÍ pregunta por la ubicación, que es
     * lo único que impedía probar la checada de contingencia en un teléfono de
     * verdad.
     */
    basicSsl(),
    /*
     * LA PANTALLA DE CHECAR A DISTANCIA, INSTALABLE.
     *
     * POR QUÉ HACE FALTA, Y NO ES COMODIDAD
     * 1. El front vive en un servidor que puede caer (capa gratuita). Sin
     *    service worker, si ese servidor está muerto a las ocho de la mañana
     *    nadie que trabaje desde casa puede checar, y eso es nómina. Con él, el
     *    caparazón carga de la caché del propio teléfono y solo hace falta que
     *    conteste la API, que vive en otro servidor.
     * 2. **iOS solo entrega notificaciones push a una web instalada en la
     *    pantalla de inicio.** Sin esto no hay recordatorios en iPhone, y punto.
     * 3. Un icono en la pantalla de inicio es lo que convierte «abre esta URL»
     *    en «dale al botón verde».
     *
     * EL ALCANCE ES `/remoto`, NO TODA ASTRA
     * El manifiesto acota la aplicación instalada a la pantalla de checar. Las
     * pantallas de administración no tienen nada que hacer en un icono del
     * teléfono de un operario, y una pantalla de nómina cacheada en un aparato
     * personal es justo lo que no queremos.
     *
     * EL SERVICE WORKER, EN CAMBIO, VA EN LA RAÍZ, y es a propósito: un worker
     * registrado en `/remoto/` NO puede servir `/assets/*`, que es donde vive
     * todo el JavaScript. Con el alcance acotado, el caparazón no se podría
     * cargar sin red — que es justo lo único que se le pide.
     */
    VitePWA({
      /*
       * `autoUpdate` y no `prompt`. Preguntar «¿quieres actualizar?» a alguien
       * que abrió la aplicación para checar y llega tarde es ponerle un
       * obstáculo delante; y una versión vieja de una pantalla que registra
       * jornada no es algo que convenga dejar a su elección.
       */
      registerType: 'autoUpdate',
      /*
       * LOS ICONOS VIVEN EN `/iconos/`, NO EN `/remoto/`.
       *
       * `public/remoto/` creaba una CARPETA REAL con el mismo nombre que la
       * ruta de la aplicación. nginx la encontraba antes que el reenvío de la
       * página única y contestaba a `/remoto` con un 301 hacia `/remoto/` —
       * justo la dirección que el manifiesto declara como `start_url`. Una
       * redirección ahí rompe la comprobación de alcance de la aplicación
       * instalada, que es lo único que sostiene el icono de la pantalla de
       * inicio.
       */
      includeAssets: ['iconos/apple-touch-icon.png', 'iconos/icono.svg'],
      manifest: {
        id: '/remoto',
        name: 'Astra · Checar a distancia',
        /* Lo que cabe debajo del icono en un teléfono: doce caracteres. */
        short_name: 'Checar',
        description: 'Registra tu jornada desde donde trabajas.',
        lang: 'es-MX',
        dir: 'ltr',
        /*
         * `/remoto` sin empresa: la pantalla recuerda la última y redirige. El
         * manifiesto es un archivo estático y no puede llevar dentro el
         * identificador de una razón social.
         */
        start_url: '/remoto',
        scope: '/remoto',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#059669',
        theme_color: '#059669',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: '/iconos/icono-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/iconos/icono-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          /*
           * `maskable` aparte y con el dibujo encogido al 72 %: Android recorta
           * el icono a la forma que tenga el lanzador —círculo, cuadrado con
           * esquinas, gota— y sin margen se come el tejado de la casa.
           */
          {
            src: '/iconos/icono-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        /*
         * PRECARGA MÍNIMA, A PROPÓSITO.
         *
         * Lo cómodo sería precargar `**\/*.js`, pero eso baja a un teléfono con
         * datos móviles el paquete ENTERO de Astra —mapas, editor de geocercas,
         * pantallas de nómina— para una pantalla que tiene un botón. Aquí solo
         * entra el caparazón; los trozos de JavaScript que la pantalla use de
         * verdad se quedan cacheados al pasar por ellos, con la regla de abajo.
         */
        globPatterns: ['index.html', 'favicon.{ico,svg}', 'iconos/*.{png,svg}'],
        navigateFallback: '/index.html',
        /*
         * Y SOLO PARA `/remoto`. Sin esta lista, el worker contestaría con el
         * caparazón cacheado a CUALQUIER navegación de Astra estando sin red, y
         * quien abriera la pantalla de empleados vería una aplicación que
         * arranca y luego falla en cada llamada. Es peor que un error del
         * navegador: parece que funciona.
         */
        navigateFallbackAllowlist: [/^\/remoto/],
        runtimeCaching: [
          {
            /*
             * Los nombres llevan hash: un archivo de `/assets/` nunca cambia de
             * contenido sin cambiar de nombre, así que `CacheFirst` no puede
             * servir nada viejo. Es lo que hace que la segunda visita —y la
             * visita con el servidor caído— tengan JavaScript.
             */
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'astra-assets',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            /*
             * LA API NO SE CACHEA NUNCA, Y SE DICE EN VOZ ALTA.
             *
             * Workbox no cachearía estas llamadas de todos modos —son de otro
             * origen y ninguna regla las toca—, pero dejarlo escrito es lo que
             * impide que un día alguien añada una regla amplia «para que vaya
             * más rápido» y una checada se sirva de la caché. Una checada
             * cacheada es una jornada que no ocurrió.
             */
            urlPattern: ({ url }) => /\/(remote|contingency|auth)\//.test(url.pathname),
            handler: 'NetworkOnly',
          },
        ],
        /* Que la versión nueva mande desde el primer instante. */
        clientsClaim: true,
        skipWaiting: true,
      },
      /*
       * Activo también en desarrollo: sin esto, la única forma de comprobar que
       * la instalación y el modo sin red funcionan sería desplegando.
       */
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
    }),
    vue(),
    vueJsx(),
    vueDevTools(),
    ui({
      /*
       * LOS ICONOS SE EMPAQUETAN, NO SE PIDEN A INTERNET.
       *
       * Nuxt UI empaqueta por omisión SOLO SUS PROPIOS iconos —el chevrón, la
       * equis, el más— y los de la aplicación los resuelve en tiempo de
       * ejecución contra `api.iconify.design`. En desarrollo no se nota; en
       * producción la CSP bloquea esa llamada y el menú entero se queda sin
       * iconos, sin ningún error en la página.
       *
       * Depender de esa API sería malo aunque la CSP la dejara pasar:
       *   · la pantalla de checar es una PWA que tiene que funcionar sin red, y
       *     unos iconos que se piden a un tercero no están ahí cuando no hay
       *     señal;
       *   · cada visita le contaría a un servidor ajeno qué iconos usa Astra,
       *     que es tanto como decirle qué pantallas existen;
       *   · y el día que ese servicio esté caído, lo está para todos.
       *
       * La lista sale de `iconosUsados()`, que barre `src/` al compilar. Se
       * probó antes la opción `scan: true` de la propia biblioteca —que hace
       * eso mismo— y NO empaquetó nada: está marcada como experimental y aquí
       * no surtió efecto. Comprobado buscando el trazado de un icono concreto
       * dentro de `dist/`.
       *
       * Solo entran los que se usan, no la colección entera (568 KB). El tope
       * de tamaño está para que, si un día alguien mete media colección sin
       * darse cuenta, el build FALLE en vez de engordar en silencio.
       */
      icon: {
        clientBundle: {
          icons: iconosUsados(),
          sizeLimitKb: 256,
        },
      },
      ui: {
        colors: {
          primary: 'emerald',
          neutral: 'slate',
          success: 'emerald',
          error: 'red',
        },

        // Botones y botones-icono (UButton es también el botón de icono).
        // `activeVariant` es el estado del enlace activo del menú: en ghost
        // sería indistinguible del resto, así que sube a `soft`. Va aquí y no
        // en la plantilla, como todo lo demás.
        button: {
          defaultVariants: { variant: 'ghost', activeVariant: 'soft' },
          slots: { base: 'cursor-pointer' },
        },

        // UAlert no tiene ghost (solid · outline · soft · subtle): se usa la
        // más plana, que es `subtle`.
        alert: { defaultVariants: { variant: 'subtle' } },

        /*
         * ESCALA DE CAPAS
         *
         * Nuxt UI no declara z-index en NINGUNA de sus capas flotantes: todas
         * se apoyan en el orden del portal dentro de `body`. Eso funciona hasta
         * que un elemento de la página tiene z-index propio —la barra superior
         * tenía `z-10`— y entonces se pinta encima del diálogo y queda clicable
         * a través de él.
         *
         * Arreglarlo componente por componente rompe otra cosa: al subir el
         * modal a z-50, los desplegables que se abren DENTRO de él quedaron
         * detrás. Por eso va una escala completa y no un parche:
         *
         *   z-20  barra superior de la aplicación (en AppLayout)
         *   z-50  diálogos: modal, slideover, drawer
         *   z-60  lo que se abre DESDE un diálogo: desplegables, menús,
         *         globos y sugerencias. Tiene que ganarle al diálogo.
         *   z-70  avisos emergentes: siempre visibles, incluso sobre todo lo
         *         anterior.
         *
         * Si mañana algo aparece detrás de otra cosa, el arreglo es mover su
         * nivel AQUÍ, no añadir un z-index suelto en una plantilla.
         */
        modal: { slots: { overlay: 'z-50', content: 'z-50' } },
        slideover: { slots: { overlay: 'z-50', content: 'z-50' } },
        drawer: { slots: { overlay: 'z-50', content: 'z-50' } },

        selectMenu: { defaultVariants: { variant: 'soft' }, slots: { content: 'z-[60]' } },
        inputMenu: { defaultVariants: { variant: 'soft' }, slots: { content: 'z-[60]' } },
        select: { defaultVariants: { variant: 'soft' }, slots: { content: 'z-[60]' } },
        popover: { slots: { content: 'z-[60]' } },
        /*
         * El tema por omisión del globo trae `h-6` —altura fija— y `truncate`
         * EN EL PROPIO TEXTO. Sirve para un atajo de teclado de tres palabras,
         * pero aquí se usa justo para enseñar lo que no cabe: con esos dos
         * ajustes, el globo recortaría el texto que viene a enseñar entero.
         *
         * Se le deja crecer hasta un ancho cómodo y partir en varias líneas.
         */
        tooltip: {
          slots: {
            content: 'z-[60] h-auto max-w-xs items-start px-2.5 py-1.5 leading-snug shadow-md',
            text: 'overflow-visible text-clip whitespace-normal break-words',
          },
        },
        dropdownMenu: { slots: { content: 'z-[60]' } },
        contextMenu: { slots: { content: 'z-[60]' } },
        commandPalette: { slots: { content: 'z-[60]' } },

        toast: { slots: { root: 'z-[70]' } },

        // Campos de formulario: ligeramente sombreados.
        input: soft,
        inputDate: soft,
        inputNumber: soft,
        inputTags: soft,
        inputTime: soft,
        pinInput: soft,
        textarea: soft,

        // Contenedores.
        pageCard: ghost,
        blogPost: ghost,

        // UPagination reenvía `variant` a sus botones. La página activa se
        // deja en `soft` porque en ghost sería indistinguible del resto.
        pagination: { defaultVariants: { variant: 'ghost', activeVariant: 'soft' } },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Sin esto, si el 5173 está ocupado Vite se muda al 5174 en silencio — y el
    // 5174 no está en CORS_ORIGINS del backend, así que la sesión deja de
    // funcionar por un motivo que no aparece en ninguna parte. Mejor que falle.
    strictPort: true,
    host: '0.0.0.0',
    /*
     * LA API SALE POR EL MISMO SITIO QUE LA PANTALLA.
     *
     * Sin esto, la página en `https://` y la API en `http://` son contenido
     * mixto y el navegador bloquea la llamada sin preguntar. Y el HTTPS no es
     * un capricho: **los teléfonos no entregan la ubicación fuera de un origen
     * seguro**, así que sin candado la checada de contingencia no existe.
     *
     * Pasando por aquí, la API hereda el candado del servidor de desarrollo y
     * no hace falta ponerle certificado a Nest. De paso desaparecen CORS y el
     * lío de la cookie entre `localhost` y una IP: todo es el mismo origen.
     *
     * Solo afecta a desarrollo. En producción `VITE_API_URL` vuelve a ser una
     * dirección absoluta, o el mismo camino lo hace el proxy de delante.
     */
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: false,
        rewrite: (ruta) => ruta.replace(/^\/api/, ''),
      },
    },
  },
})
