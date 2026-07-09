import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // a dev szerver a helyi hálózaton is elérhető legyen (a Pi-n fut,
    // a böngésző egy másik gépen), ne csak localhost-on
    host: true,
  },
})
