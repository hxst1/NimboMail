/// <reference types="vite/client" />
import type { NieblaApi } from '../../preload'

declare global {
  interface Window {
    niebla: NieblaApi
  }
}
