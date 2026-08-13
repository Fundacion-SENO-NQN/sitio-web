export default interface Historia {
  date: string
  contenido: TarjetaHistoria[]
}

export interface TarjetaHistoria {
  titulo: string
  contenido: string
}
