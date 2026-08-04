/**
 * Herramientas reutilizables para construir las tablas de la plataforma.
 *
 * Permite crear:
 * - Renderizadores completos de tablas.
 * - Columnas de texto.
 * - Columnas con título y descripción.
 * - Imágenes.
 * - Fechas.
 * - Enlaces.
 * - Badges.
 * - Cantidades de imágenes.
 * - Controles de orden.
 * - Botones de acciones.
 */

/* ==========================================================
   TABLE RENDERER
========================================================== */

export function createTableRenderer({
  body,
  columns,

  getRowId = defaultGetRowId,
  rowIdPrefix = '',

  getRowClassName = null,
  getRowDataset = null,

  onRowClick = null,
  onRendered = null
} = {}) {
  const tableBody = resolveRequiredElement(body, 'cuerpo de la tabla')

  if (!Array.isArray(columns) || columns.length === 0)
    throw new TypeError('createTableRenderer requiere al menos una columna.')

  /**
   * Compatible directamente con listController:
   *
   * render({
   *   items,
   *   allItems,
   *   controller
   * })
   */
  return function renderTable({
    items = [],
    allItems = items,
    controller = null
  } = {}) {
    const visibleItems = Array.isArray(items) ? items : []

    const completeItems = Array.isArray(allItems) ? allItems : []

    tableBody.replaceChildren()

    const fragment = document.createDocumentFragment()

    visibleItems.forEach((item, index) => {
      const rowContext = {
        item,
        index,

        items: visibleItems,

        allItems: completeItems,

        controller,

        body: tableBody
      }

      const row = createRow(item, rowContext)

      fragment.appendChild(row)
    })

    tableBody.appendChild(fragment)

    if (typeof onRendered === 'function')
      onRendered({
        items: visibleItems,

        allItems: completeItems,

        controller,

        body: tableBody
      })
  }

  /* ========================================================
     ROW
  ======================================================== */

  function createRow(item, context) {
    const row = document.createElement('tr')

    const rowId = getRowId(item, context)

    if (rowId !== null && rowId !== undefined) {
      row.dataset.itemId = String(rowId)

      if (rowIdPrefix) row.id = `${rowIdPrefix}${rowId}`
    }

    if (typeof getRowClassName === 'function')
      applyClassNames(row, getRowClassName(item, context))

    if (typeof getRowDataset === 'function')
      applyDataset(row, getRowDataset(item, context))

    columns.forEach((column, columnIndex) => {
      const columnContext = {
        ...context,

        row,
        column,
        columnIndex
      }

      const cell = renderColumn(column, item, columnContext)

      row.appendChild(cell)
    })

    if (typeof onRowClick === 'function') {
      row.addEventListener('click', (event) => {
        onRowClick(item, {
          ...context,
          row,
          event
        })
      })
    }

    return row
  }
}

/* ==========================================================
   COLUMN
========================================================== */

export function createColumn({
  render,

  className = '',
  colSpan = null,
  rowSpan = null,

  headers = null,
  dataset = null
} = {}) {
  if (typeof render !== 'function')
    throw new TypeError('La columna requiere una función render.')

  return {
    render,
    className,
    colSpan,
    rowSpan,
    headers,
    dataset
  }
}

function renderColumn(column, item, context) {
  /*
   * También se permite pasar directamente una función:
   *
   * columns: [
   *   (item) => item.titulo
   * ]
   */
  if (typeof column === 'function') {
    const result = column(item, context)

    if (result instanceof HTMLTableCellElement) return result

    const cell = document.createElement('td')

    appendContent(cell, result)

    return cell
  }

  if (!column || typeof column.render !== 'function')
    throw new TypeError('La configuración de una columna no es válida.')

  const result = column.render(item, context)

  if (result instanceof HTMLTableCellElement) return result

  const cell = document.createElement('td')

  applyClassNames(cell, resolveValue(column.className, item, context))

  const colSpan = resolveValue(column.colSpan, item, context)

  const rowSpan = resolveValue(column.rowSpan, item, context)

  const headers = resolveValue(column.headers, item, context)

  if (Number.isInteger(colSpan) && colSpan > 0) cell.colSpan = colSpan

  if (Number.isInteger(rowSpan) && rowSpan > 0) cell.rowSpan = rowSpan

  if (headers) cell.headers = String(headers)

  const dataset = resolveValue(column.dataset, item, context)

  applyDataset(cell, dataset)

  appendContent(cell, result)

  return cell
}

/* ==========================================================
   TEXT COLUMN
========================================================== */

export function createTextColumn({
  value,

  formatter = null,

  emptyText = '—',

  className = '',
  textClassName = '',

  tag = 'span',

  title = false,
  maxLength = null
} = {}) {
  return createColumn({
    className,

    render(item, context) {
      const rawValue = resolveAccessor(value, item, context)

      const formattedValue =
        typeof formatter === 'function'
          ? formatter(rawValue, item, context)
          : rawValue

      const hasValue =
        formattedValue !== null &&
        formattedValue !== undefined &&
        String(formattedValue).trim() !== ''

      const completeText = hasValue ? String(formattedValue) : String(emptyText)

      const visibleText = Number.isInteger(maxLength)
        ? truncateText(completeText, maxLength)
        : completeText

      const element = document.createElement(tag)

      applyClassNames(element, textClassName)

      element.textContent = visibleText

      if (!hasValue) element.classList.add('sin-dato')

      if (title || visibleText !== completeText) element.title = completeText

      return element
    }
  })
}

/* ==========================================================
   TITLE AND DESCRIPTION
========================================================== */

export function createPrimaryTextColumn({
  title,
  description,

  className = '',
  containerClassName = '',
  titleClassName = '',
  descriptionClassName = '',

  emptyDescription = '',

  maxDescriptionLength = null
} = {}) {
  return createColumn({
    className,

    render(item, context) {
      const container = document.createElement('div')

      applyClassNames(container, containerClassName)

      const titleElement = document.createElement('strong')

      applyClassNames(titleElement, titleClassName)

      const titleValue = resolveAccessor(title, item, context)

      titleElement.textContent = String(titleValue ?? '')

      const descriptionElement = document.createElement('p')

      applyClassNames(descriptionElement, descriptionClassName)

      const descriptionValue = resolveAccessor(description, item, context)

      const completeDescription = String(descriptionValue ?? emptyDescription)

      descriptionElement.textContent = Number.isInteger(maxDescriptionLength)
        ? truncateText(completeDescription, maxDescriptionLength)
        : completeDescription

      if (descriptionElement.textContent !== completeDescription)
        descriptionElement.title = completeDescription

      container.append(titleElement, descriptionElement)

      return container
    }
  })
}

/* ==========================================================
   IMAGE COLUMN
========================================================== */

export function createImageColumn({
  src,
  alt = 'Imagen',

  className = '',
  imageClassName = '',
  errorClassName = '',

  loading = 'lazy',
  decoding = 'async',

  cacheBust = false,

  width = null,
  height = null
} = {}) {
  return createColumn({
    className,

    render(item, context) {
      const source = resolveAccessor(src, item, context)

      if (!source) return createEmptyValue('Sin imagen')

      const image = document.createElement('img')

      image.src = cacheBust
        ? addQueryParameter(String(source), 'admin', Date.now())
        : String(source)

      image.alt = String(resolveAccessor(alt, item, context) ?? 'Imagen')

      image.loading = loading
      image.decoding = decoding

      applyClassNames(image, imageClassName)

      if (Number.isFinite(width)) image.width = width

      if (Number.isFinite(height)) image.height = height

      image.addEventListener(
        'error',
        () => {
          image.removeAttribute('src')

          image.alt = 'Imagen no disponible'

          applyClassNames(image, errorClassName)

          image.dataset.error = 'true'
        },
        {
          once: true
        }
      )

      return image
    }
  })
}

/* ==========================================================
   DATE COLUMN
========================================================== */

export function createDateColumn({
  value,

  formatter = formatDate,

  emptyText = 'Sin fecha',

  className = '',
  timeClassName = '',

  includeDateTimeAttribute = true
} = {}) {
  return createColumn({
    className,

    render(item, context) {
      const rawValue = resolveAccessor(value, item, context)

      if (
        rawValue === null ||
        rawValue === undefined ||
        String(rawValue).trim() === ''
      )
        return createEmptyValue(emptyText)

      const formatted = formatter(rawValue, item, context)

      if (!formatted) return createEmptyValue(emptyText)

      const time = document.createElement('time')

      applyClassNames(time, timeClassName)

      time.textContent = formatted

      if (includeDateTimeAttribute) time.dateTime = String(rawValue)

      return time
    }
  })
}

/* ==========================================================
   IMAGE COUNT COLUMN
========================================================== */

export function createImageCountColumn({
  value = (item) => item.cant_img,

  className = 'cantidad-imagenes',

  singular = 'imagen',

  plural = 'imágenes'
} = {}) {
  return createColumn({
    className,

    render(item, context) {
      const rawValue = resolveAccessor(value, item, context)

      const count = Math.max(0, Number(rawValue) || 0)

      return count === 1 ? `1 ${singular}` : `${count} ${plural}`
    }
  })
}

/* ==========================================================
   LINK COLUMN
========================================================== */

export function createLinkColumn({
  href,
  text = 'Abrir enlace',

  emptyText = 'Sin enlace',

  className = '',
  linkClassName = 'enlace-tabla',

  target = '_blank',
  rel = 'noopener noreferrer',

  ariaLabel = null
} = {}) {
  return createColumn({
    className,

    render(item, context) {
      const url = resolveAccessor(href, item, context)

      if (!url) return createEmptyValue(emptyText)

      const link = document.createElement('a')

      link.href = String(url)

      const linkText = resolveAccessor(text, item, context)

      link.textContent = String(linkText || 'Abrir enlace')

      applyClassNames(link, linkClassName)

      if (target) link.target = target

      if (rel) link.rel = rel

      const resolvedAriaLabel = resolveAccessor(ariaLabel, item, context)

      link.setAttribute(
        'aria-label',
        String(resolvedAriaLabel || `${link.textContent} en una nueva pestaña`)
      )

      link.addEventListener('click', (event) => {
        event.stopPropagation()
      })

      return link
    }
  })
}

/* ==========================================================
   BADGE COLUMN
========================================================== */

export function createBadgeColumn({
  value,

  className = '',
  badgeClassName = '',

  getBadgeClassName = null,

  emptyText = '—'
} = {}) {
  return createColumn({
    className,

    render(item, context) {
      const rawValue = resolveAccessor(value, item, context)

      const badge = document.createElement('span')

      applyClassNames(badge, badgeClassName)

      if (typeof getBadgeClassName === 'function')
        applyClassNames(badge, getBadgeClassName(rawValue, item, context))

      const hasValue =
        rawValue !== null &&
        rawValue !== undefined &&
        String(rawValue).trim() !== ''

      badge.textContent = hasValue ? String(rawValue) : String(emptyText)

      return badge
    }
  })
}

/* ==========================================================
   ORDER COLUMN
========================================================== */

export function createOrderColumn({
  orderController,

  getPosition = (item) => Number(item.orden) + 1,

  getLabel = defaultGetItemName,

  className = '',
  containerClassName = 'orden-elemento',

  positionClassName = 'numero-orden',

  buttonsClassName = 'botones-orden',

  buttonClassName = 'boton-orden',

  upText = '↑',
  downText = '↓',

  upAriaLabel = (item) => `Subir ${defaultGetItemName(item)}`,

  downAriaLabel = (item) => `Bajar ${defaultGetItemName(item)}`
} = {}) {
  if (!orderController)
    throw new TypeError('createOrderColumn requiere orderController.')

  return createColumn({
    className,

    render(item, context) {
      const container = document.createElement('div')

      applyClassNames(container, containerClassName)

      const position = document.createElement('span')

      applyClassNames(position, positionClassName)

      position.textContent = String(getPosition(item, context))

      const buttons = document.createElement('div')

      applyClassNames(buttons, buttonsClassName)

      const upButton = createTableButton({
        text: upText,

        className: buttonClassName,

        ariaLabel: resolveAccessor(upAriaLabel, item, context),

        disabled: !orderController.canMoveUp(item.id),

        async onClick() {
          await orderController.moveUp(item.id)
        }
      })

      const downButton = createTableButton({
        text: downText,

        className: buttonClassName,

        ariaLabel: resolveAccessor(downAriaLabel, item, context),

        disabled: !orderController.canMoveDown(item.id),

        async onClick() {
          await orderController.moveDown(item.id)
        }
      })

      buttons.append(upButton, downButton)

      container.append(position, buttons)

      return container
    }
  })
}

/* ==========================================================
   ACTIONS COLUMN
========================================================== */

export function createActionsColumn({
  actions,

  className = '',

  containerClassName = 'acciones-tabla',

  buttonClassName = 'boton-tabla'
} = {}) {
  if (!Array.isArray(actions) || actions.length === 0)
    throw new TypeError('createActionsColumn requiere acciones.')

  return createColumn({
    className,

    render(item, context) {
      const container = document.createElement('div')

      applyClassNames(container, containerClassName)

      actions.forEach((action) => {
        const hidden = Boolean(resolveValue(action.hidden, item, context))

        if (hidden) return

        const button = createTableButton({
          text: action.text,

          className: [
            buttonClassName,

            resolveValue(action.className, item, context)
          ],

          ariaLabel: resolveAccessor(action.ariaLabel, item, context),

          title: resolveAccessor(action.title, item, context),

          disabled: Boolean(resolveValue(action.disabled, item, context)),

          onClick(event) {
            return action.onClick?.(item, {
              ...context,
              event,
              button
            })
          }
        })

        container.appendChild(button)
      })

      return container
    }
  })
}

/* ==========================================================
   BUTTON
========================================================== */

export function createTableButton({
  text = '',
  className = '',

  ariaLabel = '',
  title = '',

  disabled = false,

  onClick = null,

  type = 'button'
} = {}) {
  const button = document.createElement('button')

  button.type = type
  button.textContent = String(text ?? '')

  button.disabled = Boolean(disabled)

  applyClassNames(button, className)

  if (ariaLabel) button.setAttribute('aria-label', String(ariaLabel))

  if (title) button.title = String(title)

  if (typeof onClick === 'function')
    button.addEventListener('click', async (event) => {
      event.stopPropagation()

      await onClick(event, button)
    })

  return button
}

/* ==========================================================
   CUSTOM CONTENT COLUMN
========================================================== */

export function createCustomColumn({
  render,
  className = '',
  dataset = null
} = {}) {
  return createColumn({
    className,
    dataset,
    render
  })
}

/* ==========================================================
   FORMATTERS
========================================================== */

export function formatDate(
  value,
  {
    locale = 'es-AR',
    timeZone = 'America/Argentina/Buenos_Aires',

    day = '2-digit',
    month = '2-digit',
    year = 'numeric'
  } = {}
) {
  const date = parseDate(value)

  if (!date) return null

  try {
    return new Intl.DateTimeFormat(locale, {
      day,
      month,
      year,
      timeZone
    }).format(date)
  } catch {
    return date.toLocaleDateString(locale)
  }
}

export function formatDateTime(
  value,
  {
    locale = 'es-AR',
    timeZone = 'America/Argentina/Buenos_Aires',

    day = '2-digit',
    month = '2-digit',
    year = 'numeric',

    hour = '2-digit',
    minute = '2-digit',
    hour12 = false
  } = {}
) {
  const date = parseDate(value)

  if (!date) return null

  try {
    return new Intl.DateTimeFormat(locale, {
      day,
      month,
      year,

      hour,
      minute,
      hour12,

      timeZone
    }).format(date)
  } catch {
    return date.toLocaleString(locale)
  }
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value

  if (value === null || value === undefined || String(value).trim() === '')
    return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return null

  return date
}

/* ==========================================================
   TEXT HELPERS
========================================================== */

export function truncateText(value, maxLength = 100) {
  const text = String(value ?? '')

  if (
    !Number.isInteger(maxLength) ||
    maxLength <= 0 ||
    text.length <= maxLength
  )
    return text

  return text.slice(0, maxLength).trimEnd() + '…'
}

function createEmptyValue(text) {
  const element = document.createElement('span')

  element.className = 'sin-dato'

  element.textContent = String(text)

  return element
}

/* ==========================================================
   CONTENT
========================================================== */

function appendContent(parent, content) {
  if (content === null || content === undefined) return

  if (content instanceof Node) {
    parent.appendChild(content)

    return
  }

  if (Array.isArray(content)) {
    content.forEach((item) => {
      appendContent(parent, item)
    })

    return
  }

  parent.appendChild(document.createTextNode(String(content)))
}

/* ==========================================================
   VALUES
========================================================== */

function resolveAccessor(accessor, item, context) {
  // console.log(accessor)
  if (typeof accessor === 'function') return accessor(item, context)
  if (typeof accessor === 'string') return item?.[accessor]
  return accessor
}

function resolveValue(value, item, context) {
  if (typeof value === 'function') return value(item, context)

  return value
}

/* ==========================================================
   CLASS NAMES
========================================================== */

function applyClassNames(element, classNames) {
  normalizeClassNames(classNames).forEach((className) => {
    element.classList.add(className)
  })
}

function normalizeClassNames(classNames) {
  if (!classNames) return []

  if (Array.isArray(classNames))
    return classNames.flatMap(normalizeClassNames).filter(Boolean)

  if (typeof classNames === 'object')
    return Object.entries(classNames)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([className]) => className)

  return String(classNames).split(/\s+/).filter(Boolean)
}

/* ==========================================================
   DATASET
========================================================== */

function applyDataset(element, values) {
  if (!values || typeof values !== 'object') return

  Object.entries(values).forEach(([name, value]) => {
    if (value === null || value === undefined) return

    element.dataset[name] = String(value)
  })
}

/* ==========================================================
   DEFAULT VALUES
========================================================== */

function defaultGetRowId(item) {
  return item?.id
}

function defaultGetItemName(item) {
  return (
    item?.titulo ??
    item?.nombre ??
    item?.username ??
    `elemento ${item?.id ?? ''}`
  )
}

/* ==========================================================
   URL
========================================================== */

function addQueryParameter(url, name, value) {
  const separator = String(url).includes('?') ? '&' : '?'

  return (
    `${url}${separator}` +
    `${encodeURIComponent(name)}=` +
    `${encodeURIComponent(value)}`
  )
}

/* ==========================================================
   DOM
========================================================== */

function resolveRequiredElement(value, description) {
  const element = resolveElement(value)

  if (!element) throw new Error(`No se encontró: ${description}.`)

  return element
}

function resolveElement(value) {
  if (!value) return null

  if (value instanceof Element) return value

  if (typeof value === 'string') return document.querySelector(value)

  return null
}
