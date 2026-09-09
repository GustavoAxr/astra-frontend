/**
 * LAS CHECADAS QUE NO PUDIERON SALIR.
 *
 * POR QUÉ EXISTE
 * Quien trabaja desde casa checa desde donde tiene red, y a veces no la tiene:
 * un pueblo con cobertura irregular, el metro, un corte del proveedor. Sin
 * cola, esa jornada simplemente no se registra y la persona se entera al
 * cobrar. Con cola, la checada se guarda con la HORA EN QUE SE PULSÓ y sale en
 * cuanto vuelva la red.
 *
 * POR QUÉ EN INDEXEDDB Y NO EN `localStorage`
 * Porque `localStorage` es síncrono y tiene un tope de unos cinco megas
 * compartido con todo lo demás del dominio; pero sobre todo porque una escritura
 * a medias en `localStorage` deja una cadena rota que al leerla revienta el
 * JSON. IndexedDB escribe en transacciones: una checada está o no está.
 *
 * LO QUE ESTA COLA NO ARREGLA, Y HAY QUE DECIRLO
 * La hora la pone el teléfono, y el teléfono miente si le cambian el reloj. El
 * servidor guarda las dos —`punch_time` es lo que se declara, `received_at` es
 * lo suyo— y para una checada encolada la diferencia entre ambas es justo el
 * tiempo que estuvo sin red. Una separación de tres días es una checada que
 * hay que mirar, no una que hay que creerse.
 */

const BASE = 'astra-remoto'
const ALMACEN = 'pendientes'
const VERSION = 1

export interface ChecadaPendiente {
  /** Se genera al encolar y NO cambia. Es lo que evita mandarla dos veces. */
  id: string
  entityId: string
  /** Cuándo se pulsó el botón, no cuándo se logró mandar. */
  cuando: string
  lat: number
  lng: number
  accuracyMeters?: number
  /**
   * Cuántas veces se ha intentado. Sirve para rendirse: una checada que lleva
   * veinte intentos fallidos no va a salir por insistir, y conviene que la
   * persona lo sepa en vez de creerla registrada.
   */
  intentos: number
}

/**
 * LA FIRMA NO SE ENCOLA, Y ES DELIBERADO.
 *
 * Una firma de passkey responde a un reto que pide el servidor y que vive
 * cinco minutos. Guardarla para mandarla mañana no serviría de nada —el reto
 * habría vencido— y guardar la INTENCIÓN de firmar tampoco: la huella hay que
 * ponerla en el momento, que es todo el sentido de esto.
 *
 * Consecuencia, escrita aquí para que nadie la descubra por sorpresa: un
 * teléfono con llave puede encolar la checada, pero al salir de la cola entra
 * SIN firmar y con la confianza baja de siempre. Es honesto: nadie verificó
 * que fuera esa persona en ese instante.
 */

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BASE, VERSION)
    peticion.onupgradeneeded = () => {
      const db = peticion.result
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'id' })
      }
    }
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(peticion.error ?? new Error('IndexedDB'))
  })
}

function transaccion<T>(
  modo: IDBTransactionMode,
  fn: (almacen: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolver, rechazar) => {
        const tx = db.transaction(ALMACEN, modo)
        const peticion = fn(tx.objectStore(ALMACEN))
        peticion.onsuccess = () => resolver(peticion.result)
        peticion.onerror = () => rechazar(peticion.error ?? new Error('IndexedDB'))
        tx.oncomplete = () => db.close()
      }),
  )
}

export async function encolar(
  checada: Omit<ChecadaPendiente, 'id' | 'intentos'>,
): Promise<ChecadaPendiente> {
  const pendiente: ChecadaPendiente = {
    ...checada,
    id: crypto.randomUUID(),
    intentos: 0,
  }
  await transaccion('readwrite', (a) => a.add(pendiente))
  return pendiente
}

export function pendientes(): Promise<ChecadaPendiente[]> {
  return transaccion<ChecadaPendiente[]>('readonly', (a) => a.getAll())
}

export function sacar(id: string): Promise<undefined> {
  return transaccion('readwrite', (a) => a.delete(id))
}

export function contarIntento(p: ChecadaPendiente): Promise<IDBValidKey> {
  return transaccion('readwrite', (a) => a.put({ ...p, intentos: p.intentos + 1 }))
}

/**
 * ¿Se puede usar la cola en este navegador?
 *
 * En modo privado de algunos navegadores `indexedDB` existe pero falla al
 * abrir. Preguntarlo antes evita prometerle a alguien que su checada quedó
 * guardada cuando no quedó en ninguna parte.
 */
export async function colaDisponible(): Promise<boolean> {
  try {
    const db = await abrir()
    db.close()
    return true
  } catch {
    return false
  }
}
