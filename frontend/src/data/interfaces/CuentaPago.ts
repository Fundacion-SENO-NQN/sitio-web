import type MetodoPago from "./MetodoPago"

export default interface CuentaPago {
  id: number
  nombre: string
  descripcion: string
  informacion: MetodoPago[]
}
