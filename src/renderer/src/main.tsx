import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ProveedorIdioma } from './i18n'
import './estilos.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorIdioma>
      <App />
    </ProveedorIdioma>
  </StrictMode>,
)
