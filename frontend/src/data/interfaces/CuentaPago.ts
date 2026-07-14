import type MetodoPago from "./MetodoPago"

export default interface CuentaPago {
  nombre: string
  descripcion: string
  logo: string
  datos: MetodoPago[]
}
