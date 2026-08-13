export default interface Evento {
  id: number
  created_at: string

  titulo: string
  descripcion: string
  orden: number

  lugar: string | null
  fecha: string | null
  horario: string | null

  cant_img: number

  url_id: number | null
  url: string | null
  url_titulo: string | null
}
