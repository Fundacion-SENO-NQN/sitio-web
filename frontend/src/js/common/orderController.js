import { showToast } from './toast.js'

/**
 * Controlador reutilizable para listas ordenables.
 *
 * Funciona con cualquier entidad que tenga:
 *
 * {
 *   id: number,
 *   orden: number
 * }
 *
 * Se encarga de:
 * - Mover un elemento hacia arriba.
 * - Mover un elemento hacia abajo.
 * - Intercambiar dos posiciones.
 * - Bloquear cambios simultáneos.
 * - Actualización optimista del estado local.
 * - Revertir cambios cuando falla la petición.
 * - Recargar la lista desde el backend.
 * - Mostrar mensajes de éxito o error.
 */
export function createOrderController({
  listController = null,
  getItems = null,

  changeOrder,
  refresh = null,

  idKey = 'id',
  orderKey = 'orden',

  optimistic = true,
  refreshAfterChange = true,
  refreshAfterError = true,

  successMessage = null,

  errorMessage = 'No se pudo cambiar el orden.',

  setLoading = null,

  onBeforeChange = null,
  onChanged = null,
  onError = null,

  notify = showToast
} = {}) {
  validateConfiguration({
    listController,
    getItems,
    changeOrder,
    refresh,
    setLoading,
    onBeforeChange,
    onChanged,
    onError,
    notify
  })

  let changing = false

  const controller = {
    moveUp,
    moveDown,
    move,
    swap,

    canMoveUp,
    canMoveDown,

    getOrderedItems,
    getItemById,

    get changing() {
      return changing
    }
  }

  return controller

  /* ========================================================
     MOVE UP
  ======================================================== */

  async function moveUp(id) {
    return move(id, -1)
  }

  /* ========================================================
     MOVE DOWN
  ======================================================== */

  async function moveDown(id) {
    return move(id, 1)
  }

  /* ========================================================
     GENERIC MOVE
  ======================================================== */

  async function move(id, direction) {
    if (changing) return false

    if (direction !== -1 && direction !== 1)
      throw new TypeError('La dirección debe ser -1 o 1.')

    const orderedItems = getOrderedItems()

    const normalizedId = normalizeId(id)

    const currentIndex = orderedItems.findIndex(
      (item) => normalizeId(item[idKey]) === normalizedId
    )

    if (currentIndex === -1) return false

    const targetIndex = currentIndex + direction

    if (targetIndex < 0 || targetIndex >= orderedItems.length) return false

    const currentItem = orderedItems[currentIndex]

    const targetItem = orderedItems[targetIndex]

    return swap(currentItem, targetItem)
  }

  /* ========================================================
     SWAP
  ======================================================== */

  async function swap(firstItem, secondItem) {
    if (changing || !firstItem || !secondItem) return false

    const firstId = normalizeId(firstItem[idKey])

    const secondId = normalizeId(secondItem[idKey])

    if (firstId === secondId) return false

    const firstPreviousOrder = normalizeOrder(firstItem[orderKey])

    const secondPreviousOrder = normalizeOrder(secondItem[orderKey])

    if (firstPreviousOrder === secondPreviousOrder)
      throw new Error('Los dos elementos tienen la misma posición.')

    const changes = [
      {
        [idKey]: firstId,

        [orderKey]: secondPreviousOrder
      },
      {
        [idKey]: secondId,

        [orderKey]: firstPreviousOrder
      }
    ]

    changing = true

    await updateLoading(true)

    try {
      if (typeof onBeforeChange === 'function')
        await onBeforeChange({
          firstItem,
          secondItem,
          changes,
          controller
        })

      /*
       * Actualización optimista.
       *
       * Los objetos pertenecen al estado de listController,
       * por lo que modificar sus órdenes actualiza también
       * la colección principal.
       */
      if (optimistic)
        applyLocalSwap(
          firstItem,
          secondItem,
          secondPreviousOrder,
          firstPreviousOrder
        )

      await changeOrder(changes)

      /*
       * Cuando optimistic es false, actualizamos el estado
       * local después de que el backend confirme el cambio.
       */
      if (!optimistic)
        applyLocalSwap(
          firstItem,
          secondItem,
          secondPreviousOrder,
          firstPreviousOrder
        )

      if (refreshAfterChange && typeof refresh === 'function')
        await refresh({
          showLoading: false
        })
      else
        /*
         * Si no recargamos desde el servidor, solicitamos
         * al listController que vuelva a filtrar y renderizar.
         */
        listController?.applyFilters?.()

      if (successMessage)
        notify(
          resolveMessage(successMessage, {
            firstItem,
            secondItem,
            changes
          }),
          'success'
        )

      if (typeof onChanged === 'function')
        await onChanged({
          firstItem,
          secondItem,
          changes,
          controller
        })

      return true
    } catch (error) {
      /*
       * Restauramos el estado previo únicamente cuando ya
       * se había aplicado el cambio local.
       */
      if (optimistic)
        restoreLocalOrders(
          firstItem,
          secondItem,
          firstPreviousOrder,
          secondPreviousOrder
        )

      console.error(errorMessage, error)

      notify(error instanceof Error ? error.message : errorMessage, 'error')

      if (refreshAfterError && typeof refresh === 'function')
        try {
          await refresh({
            showLoading: false
          })
        } catch (refreshError) {
          console.error(
            'No se pudo recuperar el orden desde el servidor:',
            refreshError
          )
        }
      else listController?.applyFilters?.()

      if (typeof onError === 'function')
        await onError({
          error,
          firstItem,
          secondItem,
          controller
        })

      return false
    } finally {
      changing = false

      await updateLoading(false)
    }
  }

  /* ========================================================
     CAN MOVE
  ======================================================== */

  function canMoveUp(id) {
    const orderedItems = getOrderedItems()

    const index = findItemIndex(orderedItems, id)

    return index > 0
  }

  function canMoveDown(id) {
    const orderedItems = getOrderedItems()

    const index = findItemIndex(orderedItems, id)

    return index >= 0 && index < orderedItems.length - 1
  }

  /* ========================================================
     ITEMS
  ======================================================== */

  function getOrderedItems() {
    const items = resolveItems()

    return [...items].sort(
      (first, second) =>
        normalizeOrder(first[orderKey]) - normalizeOrder(second[orderKey])
    )
  }

  function getItemById(id) {
    const normalizedId = normalizeId(id)

    return resolveItems().find(
      (item) => normalizeId(item[idKey]) === normalizedId
    )
  }

  function resolveItems() {
    let items

    if (typeof getItems === 'function') items = getItems()
    else items = listController?.items

    return Array.isArray(items) ? items : []
  }

  /* ========================================================
     LOADING
  ======================================================== */

  async function updateLoading(value) {
    if (typeof setLoading === 'function')
      await setLoading(Boolean(value), controller)
  }
}

/* ==========================================================
   LOCAL STATE
========================================================== */

function applyLocalSwap(
  firstItem,
  secondItem,
  firstNewOrder,
  secondNewOrder,
  orderKey = 'orden'
) {
  firstItem[orderKey] = firstNewOrder

  secondItem[orderKey] = secondNewOrder
}

function restoreLocalOrders(
  firstItem,
  secondItem,
  firstPreviousOrder,
  secondPreviousOrder,
  orderKey = 'orden'
) {
  firstItem[orderKey] = firstPreviousOrder

  secondItem[orderKey] = secondPreviousOrder
}

/* ==========================================================
   VALIDATION
========================================================== */

function normalizeId(value) {
  const id = Number(value)

  if (!Number.isInteger(id) || id <= 0)
    throw new TypeError('El elemento no tiene un id válido.')

  return id
}

function normalizeOrder(value) {
  const order = Number(value)

  if (!Number.isInteger(order) || order < 0)
    throw new TypeError('El elemento no tiene un orden válido.')

  return order
}

function findItemIndex(items, id) {
  const normalizedId = normalizeId(id)

  return items.findIndex((item) => normalizeId(item.id) === normalizedId)
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validateConfiguration({
  listController,
  getItems,
  changeOrder,
  refresh,
  setLoading,
  onBeforeChange,
  onChanged,
  onError,
  notify
}) {
  if (!listController && typeof getItems !== 'function')
    throw new TypeError('Debe proporcionarse listController o getItems.')

  if (typeof changeOrder !== 'function')
    throw new TypeError('changeOrder debe ser una función.')

  const optionalFunctions = {
    refresh,
    setLoading,
    onBeforeChange,
    onChanged,
    onError
  }

  for (const [name, value] of Object.entries(optionalFunctions)) {
    if (value !== null && value !== undefined && typeof value !== 'function')
      throw new TypeError(`${name} debe ser una función.`)
  }

  if (typeof notify !== 'function')
    throw new TypeError('notify debe ser una función.')
}

/* ==========================================================
   MESSAGE
========================================================== */

function resolveMessage(message, context) {
  if (typeof message === 'function') return message(context)

  return message
}
