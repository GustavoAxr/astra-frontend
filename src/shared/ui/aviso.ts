// Importado a mano y no por auto-import: `auto-imports.d.ts` no está en el
// `include` del tsconfig, así que en un `.ts` suelto el nombre no existe para
// el compilador aunque sí exista en tiempo de ejecución.
import { useToast } from '@nuxt/ui/composables/useToast'
import { ApiError } from '@/shared/api/errors'

/**
 * LOS AVISOS DE LA APLICACIÓN, dichos siempre igual.
 *
 * Existe para que «Turno guardado» y «Se guardó el turno» y «Turno actualizado
 * correctamente» no acaben conviviendo en la misma aplicación. Quien usa Astra
 * ocho horas al día aprende a reconocer un aviso por su forma, y tres formas
 * distintas para el mismo hecho le obligan a leerlos todos.
 *
 * LA REGLA: el título dice QUÉ PASÓ en dos o tres palabras, y la descripción
 * solo aparece cuando añade algo que el título no puede decir. Un aviso con
 * descripción redundante es ruido con dos líneas en vez de una.
 */
export function useAviso() {
  const toast = useToast()

  /**
   * Los errores duran más que los aciertos.
   *
   * Un «guardado» se lee de reojo; un fallo hay que leerlo entero, y muchas
   * veces copiar. Cuatro segundos alcanzan para lo primero y se quedan cortos
   * para lo segundo.
   */
  const DURACION_DEL_FALLO = 10_000

  return {
    creado(que: string, detalle?: string) {
      toast.add({
        title: `${que} creado`,
        description: detalle,
        icon: 'i-lucide-circle-check-big',
        color: 'success',
      })
    },

    actualizado(que: string, detalle?: string) {
      toast.add({
        title: `${que} actualizado`,
        description: detalle,
        icon: 'i-lucide-check',
        color: 'success',
      })
    },

    borrado(que: string, detalle?: string) {
      toast.add({
        title: `${que} borrado`,
        description: detalle,
        icon: 'i-lucide-trash-2',
        color: 'neutral',
      })
    },

    /** Para lo que salió bien pero no encaja en creado/actualizado/borrado. */
    hecho(titulo: string, detalle?: string) {
      toast.add({
        title: titulo,
        description: detalle,
        icon: 'i-lucide-check',
        color: 'success',
      })
    },

    aviso(titulo: string, detalle?: string) {
      toast.add({
        title: titulo,
        description: detalle,
        icon: 'i-lucide-triangle-alert',
        color: 'warning',
        duration: DURACION_DEL_FALLO,
      })
    },

    /**
     * Traduce el fallo a algo accionable, y distingue los casos que se atienden
     * de forma distinta.
     *
     * `quePasaba` es lo que se estaba intentando —«guardar el turno»— y va en
     * el título. Sin eso, tres avisos idénticos que dicen «No se pudo» dejan a
     * quien los ve sin saber cuál de las tres cosas que hizo falló.
     */
    fallo(causa: unknown, quePasaba: string) {
      if (causa instanceof ApiError) {
        if (causa.status === 403) {
          toast.add({
            title: 'No tienes permiso para eso',
            description: causa.message,
            icon: 'i-lucide-shield-x',
            color: 'error',
            duration: DURACION_DEL_FALLO,
          })
          return
        }

        if (causa.status === 404) {
          /*
           * 404 es también la respuesta a algo de otra empresa: el servidor
           * no confirma que exista. Por eso se dice «no encuentro», nunca «no
           * tienes acceso» — decirlo confirmaría que existe.
           */
          toast.add({
            title: 'Eso ya no está',
            description: causa.message,
            icon: 'i-lucide-search-x',
            color: 'warning',
            duration: DURACION_DEL_FALLO,
          })
          return
        }

        toast.add({
          title: `No se pudo ${quePasaba}`,
          // El `requestId` va en la descripción porque es lo único que permite
          // encontrar esa petición en la bitácora del servidor.
          description: causa.requestId
            ? `${causa.message} · ref. ${causa.requestId.slice(0, 8)}`
            : causa.message,
          icon: 'i-lucide-circle-x',
          color: 'error',
          duration: DURACION_DEL_FALLO,
        })
        return
      }

      toast.add({
        title: `No se pudo ${quePasaba}`,
        description: causa instanceof Error ? causa.message : String(causa),
        icon: 'i-lucide-circle-x',
        color: 'error',
        duration: DURACION_DEL_FALLO,
      })
    },
  }
}
