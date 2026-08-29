import { createRouter, createWebHistory } from 'vue-router'
import { requireSession } from './guards'
import { routes } from './routes'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(requireSession)

// Red de seguridad. Si algún día un guard o un `import()` de una vista lanza,
// el usuario acaba en una pantalla en blanco y en la consola sale
// `VUE_ROUTER_R0010`. Al menos que quede registrado.
router.onError((error) => {
  console.error('[router] navegación interrumpida', error)
})

export default router
