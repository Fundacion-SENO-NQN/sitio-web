export default interface Historia {
  date: number
  contenido: TarjetaHistoria[]
}

export interface TarjetaHistoria {
  titulo: string
  contenido: string
}
