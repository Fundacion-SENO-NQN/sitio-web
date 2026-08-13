/**
 * Generic controller for administration lists.
 *
 * Handles:
 * - Initial API loading
 * - Refreshing
 * - Search
 * - Sorting
 * - Loading, error, empty and ready states
 * - Item counters
 * - Create and retry buttons
 * - Access to original and filtered records
 */
export function createListController({
  load,
  render,

  searchInput = null,
  countElement = null,

  loadingElement = null,
  errorElement = null,
  emptyElement = null,
  tableElement = null,

  retryButton = null,
  createButtons = [],

  onCreate = null,
  onError = null,
  onLoaded = null,

  searchValues = defaultSearchValues,

  sorters = {
    order: compareOrder
  },

  defaultSort = 'order',
  defaultAscending = true,

  sortButtons = {},

  normalizeItems = defaultNormalizeItems,

  messages = {},

  hiddenClass = 'oculto',
  locale = 'es-AR',

  singular = 'elemento',
  plural = 'elementos'
}) {
  if (typeof load !== 'function')
    throw new TypeError('createListController requires a load function.')

  if (typeof render !== 'function')
    throw new TypeError('createListController requires a render function.')

  const elements = {
    searchInput: resolveElement(searchInput),

    countElement: resolveElement(countElement),

    loadingElement: resolveElement(loadingElement),

    errorElement: resolveElement(errorElement),

    emptyElement: resolveElement(emptyElement),

    tableElement: resolveElement(tableElement),

    retryButton: resolveElement(retryButton),

    createButtons: resolveElements(createButtons),

    sortButtons: resolveSortButtons(sortButtons)
  }

  const emptyTitle = elements.emptyElement?.querySelector('h2') ?? null

  const emptyDescription = elements.emptyElement?.querySelector('p') ?? null

  const normalizedMessages = {
    emptyTitle: messages.emptyTitle ?? `No hay ${plural}`,

    emptyDescription:
      messages.emptyDescription ?? `Todavía no hay ${plural} cargados.`,

    noResultsTitle: messages.noResultsTitle ?? `No se encontraron ${plural}`,

    noResultsDescription:
      messages.noResultsDescription ??
      'Probá buscar utilizando otras palabras.',

    loadError: messages.loadError ?? `No se pudieron cargar los ${plural}.`
  }

  const state = {
    items: [],
    filteredItems: [],

    query: '',

    sort: defaultSort,

    ascending: defaultAscending,

    loading: false,
    error: null,
    initialized: false
  }

  let pendingRefresh = null

  const eventController = new AbortController()

  const eventOptions = {
    signal: eventController.signal
  }

  const controller = {
    initialize,
    destroy,

    refresh,
    applyFilters,

    setSort,
    toggleSort,

    setItems,
    getById,

    get items() {
      return state.items
    },

    get filteredItems() {
      return state.filteredItems
    },

    get loading() {
      return state.loading
    },

    get error() {
      return state.error
    },

    get query() {
      return state.query
    },

    get currentSort() {
      return state.sort
    },

    get ascending() {
      return state.ascending
    }
  }

  return controller

  /* ========================================================
     INITIALIZATION
  ======================================================== */

  async function initialize() {
    if (state.initialized) return controller

    state.initialized = true

    registerEvents()
    updateSortButtons()

    await refresh()

    return controller
  }

  function registerEvents() {
    elements.searchInput?.addEventListener('input', applyFilters, eventOptions)

    elements.retryButton?.addEventListener(
      'click',
      () => {
        refresh()
      },
      eventOptions
    )

    if (typeof onCreate === 'function')
      elements.createButtons.forEach((button) => {
        button.addEventListener('click', onCreate, eventOptions)
      })

    for (const [sortName, button] of Object.entries(elements.sortButtons)) {
      button.addEventListener(
        'click',
        () => {
          toggleSort(sortName)
        },
        eventOptions
      )

      button.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return

          event.preventDefault()

          toggleSort(sortName)
        },
        eventOptions
      )
    }
  }

  function destroy() {
    eventController.abort()

    state.initialized = false
  }

  /* ========================================================
     LOADING
  ======================================================== */

  function refresh({ showLoading = true } = {}) {
    /*
     * If two modules request a refresh simultaneously,
     * they share the same request instead of duplicating it.
     */
    if (pendingRefresh) return pendingRefresh

    pendingRefresh = performRefresh(showLoading).finally(() => {
      pendingRefresh = null
    })

    return pendingRefresh
  }

  async function performRefresh(showLoading) {
    state.loading = true
    state.error = null

    if (showLoading) showState('loading')

    try {
      const response = await load()

      state.items = normalizeItems(response)

      applyFilters()

      if (typeof onLoaded === 'function')
        await onLoaded(state.items, controller)

      return state.items
    } catch (error) {
      console.error(normalizedMessages.loadError, error)

      state.items = []
      state.filteredItems = []
      state.error = error

      updateCount()
      clearRenderedList()
      showState('error')

      if (typeof onError === 'function') onError(error, controller)

      throw error
    } finally {
      state.loading = false
    }
  }

  /* ========================================================
     FILTERING
  ======================================================== */

  function applyFilters() {
    state.query = normalizeSearchText(elements.searchInput?.value ?? '', locale)

    state.filteredItems = state.items.filter((item) => {
      if (!state.query) return true

      const values = searchValues(item)

      return normalizeSearchValues(values, locale).some((value) =>
        value.includes(state.query)
      )
    })

    sortFilteredItems()
    updateCount()

    render({
      items: state.filteredItems,

      allItems: state.items,

      controller
    })

    updateVisualState()

    return state.filteredItems
  }

  /* ========================================================
     SORTING
  ======================================================== */

  function setSort(sortName, ascending = true) {
    if (typeof sorters[sortName] !== 'function')
      throw new Error(`The sorter "${sortName}" is not configured.`)

    state.sort = sortName
    state.ascending = ascending

    updateSortButtons()
    applyFilters()
  }

  function toggleSort(sortName) {
    if (state.sort === sortName) state.ascending = !state.ascending
    else {
      state.sort = sortName
      state.ascending = true
    }

    updateSortButtons()
    applyFilters()
  }

  function sortFilteredItems() {
    const comparator = sorters[state.sort]

    if (typeof comparator !== 'function') return

    state.filteredItems.sort((first, second) => {
      const result = comparator(first, second)

      return state.ascending ? result : -result
    })
  }

  function updateSortButtons() {
    for (const [sortName, button] of Object.entries(elements.sortButtons)) {
      const active = state.sort === sortName

      button.classList.toggle('activo', active)

      button.setAttribute('aria-pressed', String(active))

      if (active) {
        button.dataset.direction = state.ascending ? 'asc' : 'desc'

        button.setAttribute(
          'aria-label',
          state.ascending ? 'Orden ascendente' : 'Orden descendente'
        )
      } else {
        delete button.dataset.direction
      }
    }
  }

  /* ========================================================
     LOCAL STATE
  ======================================================== */

  function setItems(items) {
    state.items = normalizeItems(items)

    applyFilters()
  }

  function getById(id) {
    const normalizedId = Number(id)

    return state.items.find((item) => Number(item.id) === normalizedId)
  }

  /* ========================================================
     VISUAL STATES
  ======================================================== */

  function updateVisualState() {
    if (state.items.length === 0) {
      setEmptyContent('empty')
      showState('empty')

      return
    }

    if (state.filteredItems.length === 0) {
      setEmptyContent('no-results')

      showState('empty')

      return
    }

    showState('ready')
  }

  function showState(currentState) {
    hideElement(elements.loadingElement)

    hideElement(elements.errorElement)

    hideElement(elements.emptyElement)

    hideElement(elements.tableElement)

    switch (currentState) {
      case 'loading':
        showElement(elements.loadingElement)

        break

      case 'error':
        showElement(elements.errorElement)

        break

      case 'empty':
        showElement(elements.emptyElement)

        break

      case 'ready':
        showElement(elements.tableElement)

        break
    }
  }

  function setEmptyContent(mode) {
    const noResults = mode === 'no-results'

    if (emptyTitle)
      emptyTitle.textContent = noResults
        ? normalizedMessages.noResultsTitle
        : normalizedMessages.emptyTitle

    if (emptyDescription)
      emptyDescription.textContent = noResults
        ? normalizedMessages.noResultsDescription
        : normalizedMessages.emptyDescription

    /*
     * The "create first item" button should not appear
     * when the collection has items but the search has
     * no matches.
     */
    elements.createButtons.forEach((button) => {
      if (elements.emptyElement?.contains(button))
        button.classList.toggle(hiddenClass, noResults)
    })
  }

  function clearRenderedList() {
    render({
      items: [],
      allItems: [],
      controller
    })
  }

  /* ========================================================
     COUNT
  ======================================================== */

  function updateCount() {
    if (!elements.countElement) return

    const total = state.items.length

    const visible = state.filteredItems.length

    const hasSearch = Boolean(state.query)

    if (hasSearch && visible !== total) {
      elements.countElement.textContent = `${visible} de ${total} ${plural}`

      return
    }

    elements.countElement.textContent =
      total === 1 ? `1 ${singular}` : `${total} ${plural}`
  }

  /* ========================================================
     DOM HELPERS
  ======================================================== */

  function showElement(element) {
    element?.classList.remove(hiddenClass)
  }

  function hideElement(element) {
    element?.classList.add(hiddenClass)
  }
}

/* ==========================================================
   DEFAULT FUNCTIONS
========================================================== */

function defaultNormalizeItems(response) {
  return Array.isArray(response) ? [...response] : []
}

function defaultSearchValues(item) {
  if (!item || typeof item !== 'object') {
    return []
  }

  return Object.values(item)
}

function compareOrder(first, second) {
  return Number(first?.orden) - Number(second?.orden)
}

/* ==========================================================
   SEARCH HELPERS
========================================================== */

function normalizeSearchValues(values, locale) {
  const normalizedValues = Array.isArray(values) ? values : [values]

  return normalizedValues
    .filter((value) => value !== null && value !== undefined)
    .map((value) => normalizeSearchText(value, locale))
}

function normalizeSearchText(value, locale) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase(locale)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/* ==========================================================
   ELEMENT RESOLUTION
========================================================== */

function resolveElement(value) {
  if (!value) {
    return null
  }

  if (value instanceof Element) {
    return value
  }

  if (typeof value === 'string') {
    return document.querySelector(value)
  }

  return null
}

function resolveElements(values) {
  if (!values) {
    return []
  }

  if (typeof values === 'string') {
    return [...document.querySelectorAll(values)]
  }

  if (values instanceof Element) {
    return [values]
  }

  if (values instanceof NodeList || Array.isArray(values)) {
    return [...values].map(resolveElement).filter(Boolean)
  }

  return []
}

function resolveSortButtons(sortButtons) {
  const result = {}

  for (const [name, value] of Object.entries(sortButtons ?? {})) {
    const element = resolveElement(value)

    if (element) {
      result[name] = element
    }
  }

  return result
}

function getElementClass(element) {
  if (!element || element.classList.length === 0) {
    return '__not-found__'
  }

  return element.classList[0]
}
