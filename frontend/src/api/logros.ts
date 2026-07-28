import { api } from './client'
import type Logro from '../data/interfaces/Logro'

export function getLogros() {
  return api<Logro[]>('/logros')
}

export function getLogro(id: number) {
  return api<Logro>(`/logros/${id}`)
}

export function getLogrosFav() {
  return api<Logro[]>('/logros_fav')
}
