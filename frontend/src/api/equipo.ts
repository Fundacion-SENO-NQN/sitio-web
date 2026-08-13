import { api } from './client'
import type Equipo from '../data/interfaces/Equipo'

export function getEquipo() {
  return api<Equipo[]>('/equipo')
}

export function getMiembro(id: number) {
  return api<Equipo>(`/equipo/${id}`)
}