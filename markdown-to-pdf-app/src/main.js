import { createApp } from 'vue'
import { Quasar } from 'quasar'
import App from './App.vue'
import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'
import './style.css'

const app = createApp(App)
app.use(Quasar, {
  plugins: {}
})

app.mount('#app')
