import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ui from '@nuxt/ui/vue-plugin'

import App from './App.vue'
import router from '@/app/router'
import { escucharInstalacion } from '@/modules/remoto/instalacion'

/*
 * ANTES DE MONTAR NADA. El navegador dispara `beforeinstallprompt` una sola
 * vez y temprano; si no hay nadie escuchando en ese instante, el aviso se
 * pierde y el botón de instalar no aparece nunca. Estaba dentro de un
 * componente que se monta mucho después.
 */
escucharInstalacion()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ui)

app.mount('#app')
