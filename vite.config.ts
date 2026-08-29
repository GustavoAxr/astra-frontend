import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import ui from '@nuxt/ui/vite'

// Variantes por defecto del proyecto, verificadas contra el tema de @nuxt/ui 4.11
// (son los únicos componentes que declaran `variants.variant.ghost` / `.soft`).
//
// - `ghost`: botones y contenedores. Fondo transparente, se pinta al hover.
// - `soft`:  campos de formulario. `bg-elevated/50` fijo, para que el campo se
//            distinga del fondo sin llegar a tener borde.
const ghost = { defaultVariants: { variant: 'ghost' } } as const
const soft = { defaultVariants: { variant: 'soft' } } as const

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    ui({
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
            content:
              'z-[60] h-auto max-w-xs items-start px-2.5 py-1.5 leading-snug shadow-md',
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
  },
})
