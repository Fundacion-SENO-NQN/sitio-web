import { eventos, eventosFiltrados } from './eventos.js'

import { abrirModalEditarEvento } from './modal.js'

import { abrirModalEliminarEvento } from './delete.js'

import { moverEventoArriba, moverEventoAbajo } from './order.js'

const IMG_URL = (
  import.meta.env.PUBLIC_IMG_URL ??
  'https://pub-508ef05ca2d548c1b336a8b1f0f31c83.r2.dev'
).replace(/\/+$/, '')

const tablaBody = document.getElementById('tabla-eventos-body')

/* ==========================================================
   RENDER PRINCIPAL
========================================================== */

export function renderEventos() {
  if (!tablaBody) {
    return
  }

  tablaBody.replaceChildren()

  const eventosOrdenados = [...eventos].sort(
    (eventoA, eventoB) => eventoA.orden - eventoB.orden
  )

  const ordenMinimo = eventosOrdenados[0]?.orden ?? 0

  const ordenMaximo = eventosOrdenados.at(-1)?.orden ?? 0

  const fragment = document.createDocumentFragment()

  for (const evento of eventosFiltrados) {
    const fila = crearFilaEvento(evento, ordenMinimo, ordenMaximo)

    fragment.appendChild(fila)
  }

  tablaBody.appendChild(fragment)
}

/* ==========================================================
   FILA
========================================================== */

function crearFilaEvento(evento, ordenMinimo, ordenMaximo) {
  const fila = document.createElement('tr')

  fila.dataset.eventoId = String(evento.id)

  fila.appendChild(crearCeldaOrden(evento, ordenMinimo, ordenMaximo))

  fila.appendChild(crearCeldaImagen(evento))

  fila.appendChild(crearCeldaInformacion(evento))

  fila.appendChild(crearCeldaFechaHorario(evento))

  fila.appendChild(crearCeldaLugar(evento))

  fila.appendChild(crearCeldaCantidadImagenes(evento))

  fila.appendChild(crearCeldaEnlace(evento))

  fila.appendChild(crearCeldaAcciones(evento))

  return fila
}

/* ==========================================================
   ORDEN
========================================================== */

function crearCeldaOrden(evento, ordenMinimo, ordenMaximo) {
  const celda = document.createElement('td')

  const contenedor = document.createElement('div')

  contenedor.className = 'orden-evento'

  const numero = document.createElement('span')

  numero.className = 'numero-orden'

  /*
   * La base de datos comienza en orden 0, pero para los
   * administradores se muestra desde 1.
   */
  numero.textContent = String(evento.orden + 1)

  const botones = document.createElement('div')

  botones.className = 'botones-orden'

  const botonSubir = crearBotonOrden({
    simbolo: '↑',
    label: `Subir el evento ${evento.titulo}`,
    disabled: evento.orden === ordenMinimo,
    action: () => {
      moverEventoArriba(evento.id)
    }
  })

  const botonBajar = crearBotonOrden({
    simbolo: '↓',
    label: `Bajar el evento ${evento.titulo}`,
    disabled: evento.orden === ordenMaximo,
    action: () => {
      moverEventoAbajo(evento.id)
    }
  })

  botones.append(botonSubir, botonBajar)

  contenedor.append(numero, botones)

  celda.appendChild(contenedor)

  return celda
}

function crearBotonOrden({ simbolo, label, disabled, action }) {
  const boton = document.createElement('button')

  boton.type = 'button'
  boton.className = 'boton-orden'
  boton.textContent = simbolo
  boton.disabled = disabled

  boton.setAttribute('aria-label', label)

  boton.addEventListener('click', action)

  return boton
}

/* ==========================================================
   IMAGEN
========================================================== */

function crearCeldaImagen(evento) {
  const celda = document.createElement('td')

  const imagen = document.createElement('img')

  imagen.className = 'imagen-evento-tabla'

  imagen.src = `${IMG_URL}/img_eventos/${evento.id}/0.avif`

  imagen.alt = `Imagen principal de ${evento.titulo}`

  imagen.loading = 'lazy'
  imagen.decoding = 'async'

  imagen.addEventListener(
    'error',
    () => {
      /*
       * Evita que el navegador vuelva a solicitar
       * indefinidamente una imagen que no existe.
       */
      imagen.removeAttribute('src')

      imagen.classList.add('imagen-evento-error')

      imagen.alt = 'Imagen no disponible'
    },
    {
      once: true
    }
  )

  celda.appendChild(imagen)

  return celda
}

/* ==========================================================
   INFORMACIÓN PRINCIPAL
========================================================== */

function crearCeldaInformacion(evento) {
  const celda = document.createElement('td')

  const contenedor = document.createElement('div')

  contenedor.className = 'info-evento'

  const titulo = document.createElement('strong')

  titulo.textContent = evento.titulo

  const descripcion = document.createElement('p')

  descripcion.textContent = evento.descripcion

  contenedor.append(titulo, descripcion)

  celda.appendChild(contenedor)

  return celda
}

/* ==========================================================
   FECHA Y HORARIO
========================================================== */

function crearCeldaFechaHorario(evento) {
  const celda = document.createElement('td')

  const contenedor = document.createElement('div')

  contenedor.className = 'fecha-horario-evento'

  const fecha = document.createElement('span')

  fecha.textContent = evento.fecha || 'Sin fecha'

  if (!evento.fecha) {
    fecha.classList.add('sin-dato')
  }

  const horario = document.createElement('small')

  horario.textContent = evento.horario || 'Sin horario'

  if (!evento.horario) {
    horario.classList.add('sin-dato')
  }

  contenedor.append(fecha, horario)

  celda.appendChild(contenedor)

  return celda
}

/* ==========================================================
   LUGAR
========================================================== */

function crearCeldaLugar(evento) {
  const celda = document.createElement('td')

  celda.className = 'lugar-evento'

  if (evento.lugar) {
    celda.textContent = evento.lugar
  } else {
    celda.textContent = 'Sin lugar'

    celda.classList.add('sin-dato')
  }

  return celda
}

/* ==========================================================
   CANTIDAD DE IMÁGENES
========================================================== */

function crearCeldaCantidadImagenes(evento) {
  const celda = document.createElement('td')

  celda.className = 'cantidad-imagenes'

  const cantidad = Number(evento.cant_img) || 0

  celda.textContent = cantidad === 1 ? '1 imagen' : `${cantidad} imágenes`

  return celda
}

/* ==========================================================
   ENLACE
========================================================== */

function crearCeldaEnlace(evento) {
  const celda = document.createElement('td')

  if (!evento.url) {
    celda.textContent = 'Sin enlace'

    celda.classList.add('sin-dato')

    return celda
  }

  const enlace = document.createElement('a')

  enlace.className = 'enlace-tabla'

  enlace.href = evento.url
  enlace.target = '_blank'
  enlace.rel = 'noopener noreferrer'

  enlace.textContent = evento.url_titulo || 'Abrir enlace'

  enlace.setAttribute(
    'aria-label',
    `Abrir ${enlace.textContent} en una nueva pestaña`
  )

  celda.appendChild(enlace)

  return celda
}

/* ==========================================================
   ACCIONES
========================================================== */

function crearCeldaAcciones(evento) {
  const celda = document.createElement('td')

  const contenedor = document.createElement('div')

  contenedor.className = 'acciones-evento'

  const botonEditar = document.createElement('button')

  botonEditar.type = 'button'

  botonEditar.className = 'boton-tabla boton-editar'

  botonEditar.textContent = 'Editar'

  botonEditar.setAttribute('aria-label', `Editar el evento ${evento.titulo}`)

  botonEditar.addEventListener('click', () => {
    abrirModalEditarEvento(evento)
  })

  const botonEliminar = document.createElement('button')

  botonEliminar.type = 'button'

  botonEliminar.className = 'boton-tabla boton-eliminar'

  botonEliminar.textContent = 'Eliminar'

  botonEliminar.setAttribute(
    'aria-label',
    `Eliminar el evento ${evento.titulo}`
  )

  botonEliminar.addEventListener('click', () => {
    abrirModalEliminarEvento(evento)
  })

  contenedor.append(botonEditar, botonEliminar)

  celda.appendChild(contenedor)

  return celda
}
