import {
  createActionsColumn,
  createCustomColumn,
  createDateColumn,
  createImageColumn,
  createPrimaryTextColumn,
  createTableRenderer
} from '../common/table.js'

const IMG_URL = (import.meta.env.PUBLIC_IMG_URL ?? '').replace(/\/+$/, '')

export function createDonationMethodsTable({ body, openEdit, openDelete }) {
  return createTableRenderer({
    body,

    rowIdPrefix: 'donation-method-',

    columns: [
      createImageColumn({
        src: getDonationMethodIconUrl,
        alt: () => '',

        className: 'methodIconCell',
        imageClassName: 'methodIconImage',
        errorClassName: 'methodIconImage--error',

        width: 64,
        height: 64
      }),

      createPrimaryTextColumn({
        title: 'nombre',
        description: 'descripcion',

        className: 'methodMainCell',
        containerClassName: 'methodMain',
        titleClassName: 'methodName',
        descriptionClassName: 'methodDescription',

        maxDescriptionLength: 180
      }),

      createCustomColumn({
        className: 'methodInformationCell',

        render(method) {
          return createInformationSummary(method.informacion)
        }
      }),

      createDateColumn({
        value: 'updated_at',

        className: 'methodDateCell',

        emptyText: 'Sin fecha'
      }),

      createActionsColumn({
        className: 'methodActionsCell',

        containerClassName: 'methodActions',

        buttonClassName: 'tableActionButton',

        actions: [
          {
            text: 'Editar',

            className: 'tableActionButton--edit',

            ariaLabel: (method) => `Editar método ${method.nombre}`,

            onClick(method) {
              openEdit(method)
            }
          },

          {
            text: 'Eliminar',

            className: 'tableActionButton--delete',

            ariaLabel: (method) => `Eliminar método ${method.nombre}`,

            onClick(method) {
              openDelete(method)
            }
          }
        ]
      })
    ]
  })
}

export function getDonationMethodIconUrl(method) {
  if (!IMG_URL) {
    return ''
  }

  const version = encodeURIComponent(
    method?.updated_at ?? method?.created_at ?? ''
  )

  return (
    `${IMG_URL}/img_metodos_donacion/` +
    `${method.id}.svg` +
    (version ? `?v=${version}` : '')
  )
}

function createInformationSummary(information) {
  const items = Array.isArray(information) ? information : []

  if (items.length === 0) {
    const empty = document.createElement('span')

    empty.className = 'methodInformationEmpty'

    empty.textContent = 'Sin datos adicionales'

    return empty
  }

  const container = document.createElement('div')

  container.className = 'methodInformation'

  const list = document.createElement('dl')

  list.className = 'methodInformationList'

  items.forEach((item) => {
    const row = document.createElement('div')

    const title = document.createElement('dt')

    title.textContent = String(item.titulo ?? '')

    const value = document.createElement('dd')

    value.textContent = String(item.valor ?? '')

    row.append(title, value)
    list.appendChild(row)
  })

  const count = document.createElement('span')

  count.className = 'methodInformationCount'

  count.textContent = items.length === 1 ? '1 dato' : `${items.length} datos`

  container.append(list, count)

  return container
}
