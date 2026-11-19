import { resolveElement } from './dom.js'
import {
  getCachedModuleSettings,
  loadModuleSettings,
  saveModuleSettings
} from './profileSettings.js'

/* ==========================================================
   TABLE COLUMN VISIBILITY CONTROLLER

   Modular controller that manages which table columns are
   displayed and persists the selection to the user's profile.
========================================================== */

export function slugifyColumnKey(label, fallbackIndex = 0) {
  const slug = String(label ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return slug || `col_${fallbackIndex}`
}

export function discoverTableColumns(tableOrWrapper) {
  const root = resolveElement(tableOrWrapper)
  if (!root) return []

  const headerCells = [...root.querySelectorAll('thead th')]

  return headerCells.map((th, index) => {
    const label =
      th.dataset.colLabel?.trim() ||
      th.textContent?.trim() ||
      `Columna ${index + 1}`

    const key =
      th.dataset.colKey?.trim() ||
      th.dataset.sortKey?.trim() ||
      slugifyColumnKey(label, index)

    const isActions =
      key.toLowerCase() === 'acciones' ||
      label.trim().toLowerCase() === 'acciones'

    const fixed = th.dataset.colFixed === 'true' || isActions
    const defaultVisible = th.dataset.colDefaultVisible !== 'false'

    th.dataset.colIndex = String(index)
    th.dataset.colKey = key
    th.dataset.colLabel = label
    if (fixed) {
      th.dataset.colFixed = 'true'
    }

    return {
      index,
      key,
      label,
      fixed,
      defaultVisible,
      headerElement: th
    }
  })
}

export function createTableColumnsController({
  moduleKey,
  container = null,
  tableWrapper = null,
  tableBody = null,
  columns: customColumns = null,
  minVisibleToggleable = 1,
  wideColumnThreshold = 7,
  hiddenClass = 'oculto',
  hiddenColumnClass = 'columna-oculta',
  loadSettings = (key) => loadModuleSettings(key),
  getCachedSettings = (key) => getCachedModuleSettings(key),
  saveSettings = (key, data) => saveModuleSettings(key, data),
  onChange = null
} = {}) {
  if (!moduleKey || typeof moduleKey !== 'string') {
    throw new TypeError(
      'createTableColumnsController requires a valid string "moduleKey".'
    )
  }

  const selectorRoot = resolveElement(
    container ?? `[data-column-selector="${moduleKey}"]`
  )
  const wrapperElement = resolveElement(
    tableWrapper ?? `#tabla-wrapper-${moduleKey}`
  )
  const bodyElement = resolveElement(tableBody ?? `#tbody-${moduleKey}`)
  const tableElement =
    wrapperElement?.querySelector('table') ??
    bodyElement?.closest('table') ??
    null

  const toggleButton =
    selectorRoot?.querySelector('[data-column-selector-toggle]') ?? null
  const badgeElement =
    selectorRoot?.querySelector('[data-column-selector-badge]') ?? null
  const menuElement =
    selectorRoot?.querySelector('[data-column-selector-menu]') ?? null
  const listElement =
    selectorRoot?.querySelector('[data-column-selector-list]') ?? null
  const resetButton =
    selectorRoot?.querySelector('[data-column-selector-reset]') ?? null

  let discoveredColumns = []
  let visibleKeys = new Set()
  let eventController = null
  let menuOpen = false
  let initialized = false

  function resolveColumns() {
    if (Array.isArray(customColumns) && customColumns.length > 0) {
      return customColumns.map((col, index) => ({
        index,
        key: col.key || col.sortKey || slugifyColumnKey(col.label, index),
        label: col.label || `Columna ${index + 1}`,
        fixed:
          Boolean(col.fixed) ||
          String(col.label ?? '')
            .trim()
            .toLowerCase() === 'acciones',
        defaultVisible: col.defaultVisible !== false,
        headerElement:
          tableElement?.querySelector(`thead th[data-col-index="${index}"]`) ??
          tableElement?.querySelectorAll('thead th')?.[index] ??
          null
      }))
    }

    return discoverTableColumns(tableElement ?? wrapperElement)
  }

  function getDefaultVisibleKeys(cols = discoveredColumns) {
    const keys = new Set()
    cols.forEach((col) => {
      if (col.fixed || col.defaultVisible) {
        keys.add(col.key)
      }
    })
    return keys
  }

  function normalizeVisibleKeys(candidateKeys, cols = discoveredColumns) {
    if (!Array.isArray(candidateKeys)) {
      return getDefaultVisibleKeys(cols)
    }

    const validKeySet = new Set(cols.map((col) => col.key))
    const normalized = new Set()

    candidateKeys.forEach((key) => {
      const strKey = String(key)
      if (validKeySet.has(strKey)) {
        normalized.add(strKey)
      }
    })

    // Fixed columns must always remain visible
    cols.forEach((col) => {
      if (col.fixed) {
        normalized.add(col.key)
      }
    })

    // Ensure at least `minVisibleToggleable` toggleable columns are visible
    const toggleableCols = cols.filter((col) => !col.fixed)
    const visibleToggleableCount = toggleableCols.filter((col) =>
      normalized.has(col.key)
    ).length

    if (toggleableCols.length > 0 && visibleToggleableCount < minVisibleToggleable) {
      for (const col of toggleableCols) {
        normalized.add(col.key)
        const currentCount = toggleableCols.filter((c) =>
          normalized.has(c.key)
        ).length
        if (currentCount >= minVisibleToggleable) break
      }
    }

    return normalized
  }

  async function initialize() {
    if (initialized) return controller
    initialized = true

    discoveredColumns = resolveColumns()
    visibleKeys = getDefaultVisibleKeys(discoveredColumns)

    // 1. Apply cached profile settings immediately if available
    const cached = getCachedSettings?.(moduleKey)
    if (cached && Array.isArray(cached.visibleColumns)) {
      visibleKeys = normalizeVisibleKeys(
        cached.visibleColumns,
        discoveredColumns
      )
    }

    renderMenuOptions()
    applyToTable()
    registerEvents()

    // 2. Synchronize asynchronously with remote profile settings
    try {
      const remoteSection = await loadSettings?.(moduleKey)
      if (remoteSection && Array.isArray(remoteSection.visibleColumns)) {
        visibleKeys = normalizeVisibleKeys(
          remoteSection.visibleColumns,
          discoveredColumns
        )
        updateMenuControls()
        applyToTable()
      }
    } catch {
      // Fallback to cached/default state already applied
    }

    return controller
  }

  function destroy() {
    eventController?.abort()
    eventController = null
    initialized = false
    menuOpen = false
  }

  function registerEvents() {
    if (eventController) {
      eventController.abort()
    }

    eventController = new AbortController()
    const { signal } = eventController

    toggleButton?.addEventListener(
      'click',
      () => {
        setMenuOpen(!menuOpen)
      },
      { signal }
    )

    resetButton?.addEventListener(
      'click',
      () => {
        void resetToDefaults()
      },
      { signal }
    )

    if ( typeof document !== 'undefined' ) {
      document.addEventListener(
        'click',
        (event) => {
          if (
            menuOpen &&
            selectorRoot &&
            event.target instanceof Node &&
            !selectorRoot.contains(event.target)
          ) {
            setMenuOpen(false)
          }
        },
        { signal }
      )

      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key === 'Escape' && menuOpen) {
            event.preventDefault()
            setMenuOpen(false)
            toggleButton?.focus()
          }
        },
        { signal }
      )
    }
  }

  function setMenuOpen(open) {
    menuOpen = Boolean(open)
    menuElement?.classList.toggle(hiddenClass, !menuOpen)
    toggleButton?.setAttribute('aria-expanded', String(menuOpen))
  }

  function renderMenuOptions() {
    if (!listElement) return

    listElement.replaceChildren()
    const fragment = document.createDocumentFragment()

    const toggleableColumns = discoveredColumns.filter((col) => !col.fixed)

    toggleableColumns.forEach((col) => {
      const label = document.createElement('label')
      label.className = 'columnSelector__item'

      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'columnSelector__checkbox'
      checkbox.value = col.key
      checkbox.dataset.colKey = col.key
      checkbox.checked = visibleKeys.has(col.key)

      checkbox.addEventListener('change', () => {
        void setColumnVisible(col.key, checkbox.checked)
      })

      const text = document.createElement('span')
      text.className = 'columnSelector__label'
      text.textContent = col.label

      label.append(checkbox, text)
      fragment.appendChild(label)
    })

    listElement.appendChild(fragment)
    updateMenuControls()
  }

  function updateMenuControls() {
    const toggleableColumns = discoveredColumns.filter((col) => !col.fixed)
    const visibleToggleableCount = toggleableColumns.filter((col) =>
      visibleKeys.has(col.key)
    ).length
    const totalToggleableCount = toggleableColumns.length

    if (badgeElement) {
      badgeElement.textContent =
        totalToggleableCount > 0
          ? `${visibleToggleableCount}/${totalToggleableCount}`
          : ''
    }

    if (resetButton) {
      const defaultKeys = getDefaultVisibleKeys(discoveredColumns)
      const isDefault =
        defaultKeys.size === visibleKeys.size &&
        [...defaultKeys].every((k) => visibleKeys.has(k))
      resetButton.disabled = isDefault
    }

    if (!listElement) return

    const checkboxes = [
      ...listElement.querySelectorAll('input[type="checkbox"][data-col-key]')
    ]

    checkboxes.forEach((checkbox) => {
      const key = checkbox.dataset.colKey
      const checked = visibleKeys.has(key)
      checkbox.checked = checked

      // Prevent unchecking the last remaining visible toggleable column
      checkbox.disabled =
        checked && visibleToggleableCount <= minVisibleToggleable
    })
  }

  function applyToHeaders() {
    discoveredColumns.forEach((col) => {
      const visible = col.fixed || visibleKeys.has(col.key)
      const th =
        col.headerElement ??
        tableElement?.querySelector(`thead th[data-col-index="${col.index}"]`)

      if (th) {
        th.hidden = !visible
        th.classList.toggle(hiddenColumnClass, !visible)
      }
    })
  }

  function applyToBody() {
    const targetBody =
      bodyElement ?? tableElement?.querySelector('tbody') ?? null
    if (!targetBody) return

    discoveredColumns.forEach((col) => {
      const visible = col.fixed || visibleKeys.has(col.key)
      const cells = targetBody.querySelectorAll(
        `td[data-col-index="${col.index}"]`
      )

      cells.forEach((cell) => {
        cell.hidden = !visible
        cell.classList.toggle(hiddenColumnClass, !visible)
      })
    })
  }

  function applyToTable() {
    applyToHeaders()
    applyToBody()

    if (tableElement) {
      const visibleCount = discoveredColumns.filter(
        (col) => col.fixed || visibleKeys.has(col.key)
      ).length
      const isWide = visibleCount > wideColumnThreshold

      tableElement.classList.toggle('tableWide', isWide)
      tableElement.classList.toggle('tablaComponente__table--ancha', isWide)
      if (!isWide) {
        tableElement.style.minWidth = '100%'
      } else {
        tableElement.style.removeProperty('min-width')
      }
    }
  }

  async function persistVisibleColumns() {
    const visibleList = discoveredColumns
      .filter((col) => col.fixed || visibleKeys.has(col.key))
      .map((col) => col.key)

    if (typeof onChange === 'function') {
      onChange({
        visibleColumns: visibleList,
        controller
      })
    }

    await saveSettings?.(moduleKey, {
      visibleColumns: visibleList
    })
  }

  async function setColumnVisible(key, visible) {
    const col = discoveredColumns.find((c) => c.key === key)
    if (!col || col.fixed) return false

    const nextKeys = new Set(visibleKeys)

    if (visible) {
      nextKeys.add(key)
    } else {
      const toggleableCols = discoveredColumns.filter((c) => !c.fixed)
      const currentVisibleToggleable = toggleableCols.filter((c) =>
        nextKeys.has(c.key)
      ).length

      if (currentVisibleToggleable <= minVisibleToggleable) {
        updateMenuControls()
        return false
      }

      nextKeys.delete(key)
    }

    visibleKeys = nextKeys
    updateMenuControls()
    applyToTable()
    await persistVisibleColumns()
    return true
  }

  async function setVisibleColumns(keys) {
    visibleKeys = normalizeVisibleKeys(keys, discoveredColumns)
    updateMenuControls()
    applyToTable()
    await persistVisibleColumns()
    return getVisibleColumns()
  }

  async function resetToDefaults() {
    visibleKeys = getDefaultVisibleKeys(discoveredColumns)
    updateMenuControls()
    applyToTable()
    await persistVisibleColumns()
    return getVisibleColumns()
  }

  function isColumnVisible(keyOrIndex) {
    const col =
      typeof keyOrIndex === 'number'
        ? discoveredColumns.find((c) => c.index === keyOrIndex)
        : discoveredColumns.find((c) => c.key === String(keyOrIndex))

    if (!col) return true
    return col.fixed || visibleKeys.has(col.key)
  }

  function getVisibleColumns() {
    return discoveredColumns
      .filter((col) => col.fixed || visibleKeys.has(col.key))
      .map((col) => col.key)
  }

  function getColumns() {
    return discoveredColumns.map((col) => ({
      index: col.index,
      key: col.key,
      label: col.label,
      fixed: col.fixed,
      visible: col.fixed || visibleKeys.has(col.key)
    }))
  }

  const controller = {
    moduleKey,
    initialize,
    destroy,
    applyToTable,
    applyToHeaders,
    applyToBody,
    setColumnVisible,
    setVisibleColumns,
    resetToDefaults,
    isColumnVisible,
    getVisibleColumns,
    getColumns,
    setMenuOpen
  }

  return controller
}
