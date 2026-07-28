import { api } from './client'
import type CuentaPago from '../data/interfaces/CuentaPago'

export function getCuentasPago() {
  return api<CuentaPago[]>('/metodos_donacion')
}

export function getCuentaPago(id: number) {
  return api<CuentaPago>(`/metodos_donacion/${id}`)
}
