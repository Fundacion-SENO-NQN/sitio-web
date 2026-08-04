export interface InformacionCuentaPago {
  id: number
  titulo: string
  valor: string
  created_at: string
  updated_at: string
}

export default interface CuentaPago {
  id: number
  nombre: string
  descripcion: string
  created_at: string
  updated_at: string
  informacion: InformacionCuentaPago[]
}
