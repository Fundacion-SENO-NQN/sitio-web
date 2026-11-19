import { resolveElement } from './dom.js'

export const DEFAULT_AUTOSAVE_PREFIX = 'seno_form_draft:'

const IGNORED_INPUT_TYPES = new Set([
  'file',
  'password',
  'submit',
  'button',
  'reset',
  'image'
])

/* ==========================================================
   FORM SERIALIZATION & DESERIALIZATION
========================================================== */

export function serializeFormValues(form, { ignoreFields = [] } = {}) {
  const formElement = resolveElement(form)
  if (!formElement || !formElement.elements) return {}

  const ignored = new Set(ignoreFields)
  const values = {}
  const checkboxGroups = new Map()
  const radioNames = new Set()

  for (const control of formElement.elements) {
    if (!isSerializableControl(control, ignored)) continue

    const key = getControlKey(control)

    if (control.type === 'checkbox') {
      if (!checkboxGroups.has(key)) {
        checkboxGroups.set(key, [])
      }
      checkboxGroups.get(key).push(control)
      continue
    }

    if (control.type === 'radio') {
      radioNames.add(key)
      if (control.checked) {
        values[key] = control.value
      } else if (!(key in values)) {
        values[key] = null
      }
      continue
    }

    if (control.tagName === 'SELECT' && control.multiple) {
      values[key] = [...control.options]
        .filter((option) => option.selected)
        .map((option) => option.value)
      continue
    }

    values[key] = control.value ?? ''
  }

  for (const [key, checkboxes] of checkboxGroups.entries()) {
    if (checkboxes.length === 1) {
      values[key] = Boolean(checkboxes[0].checked)
    } else {
      values[key] = checkboxes
        .filter((cb) => cb.checked)
        .map((cb) => cb.value)
    }
  }

  return values
}

export function deserializeFormValues(form, values = {}, { ignoreFields = [] } = {}) {
  const formElement = resolveElement(form)
  if (!formElement || !formElement.elements || !values || typeof values !== 'object') {
    return
  }

  const ignored = new Set(ignoreFields)
  const checkboxGroups = new Map()

  for (const control of formElement.elements) {
    if (!isSerializableControl(control, ignored)) continue

    const key = getControlKey(control)
    if (!Object.hasOwn(values, key)) continue

    const savedValue = values[key]

    if (control.type === 'checkbox') {
      if (!checkboxGroups.has(key)) {
        checkboxGroups.set(key, [])
      }
      checkboxGroups.get(key).push(control)
      continue
    }

    if (control.type === 'radio') {
      control.checked =
        savedValue !== null &&
        savedValue !== undefined &&
        String(control.value) === String(savedValue)
      continue
    }

    if (control.tagName === 'SELECT' && control.multiple) {
      const selectedSet = new Set(
        Array.isArray(savedValue) ? savedValue.map(String) : []
      )
      for (const option of control.options) {
        option.selected = selectedSet.has(option.value)
      }
      continue
    }

    if (savedValue !== null && savedValue !== undefined) {
      control.value = String(savedValue)
    }
  }

  for (const [key, checkboxes] of checkboxGroups.entries()) {
    const savedValue = values[key]
    if (checkboxes.length === 1 && typeof savedValue === 'boolean') {
      checkboxes[0].checked = savedValue
    } else {
      const selectedSet = new Set(
        Array.isArray(savedValue)
          ? savedValue.map(String)
          : savedValue
            ? [String(savedValue)]
            : []
      )
      checkboxes.forEach((cb) => {
        cb.checked = selectedSet.has(String(cb.value))
      })
    }
  }
}

function getControlKey(control) {
  return control.dataset?.autosaveKey || control.name || ''
}

function isSerializableControl(control, ignored) {
  if (!control || typeof control !== 'object') return false
  if (control.dataset?.autosave === 'false') return false

  const type = String(control.type ?? '').toLowerCase()
  if (IGNORED_INPUT_TYPES.has(type)) return false

  const key = getControlKey(control)
  if (!key || ignored.has(key)) return false

  return true
}

/* ==========================================================
   FORM AUTOSAVE CONTROLLER
========================================================== */

export function createFormAutosaveController({
  key,
  form,
  storageKeyPrefix = DEFAULT_AUTOSAVE_PREFIX,
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  isEnabled = () => true,
  getExtraState = null,
  applyExtraState = null,
  ignoreFields = [],
  onSave = null,
  onRestore = null,
  onClear = null
} = {}) {
  if (!key || typeof key !== 'string') {
    throw new TypeError('createFormAutosaveController requires a valid string "key".')
  }

  const formElement = resolveElement(form)
  if (!formElement) {
    throw new Error(`Could not find form element for autosave "${key}".`)
  }

  const storageKey = `${storageKeyPrefix}${key}`
  let eventController = null
  let restoring = false

  function initialize() {
    if (eventController) return controller

    eventController = new AbortController()
    const { signal } = eventController

    const handleFormMutation = () => {
      if (restoring || !isEnabled()) return
      save()
    }

    formElement.addEventListener('input', handleFormMutation, { signal })
    formElement.addEventListener('change', handleFormMutation, { signal })

    return controller
  }

  function destroy() {
    eventController?.abort()
    eventController = null
  }

  function save() {
    if (!storage || restoring) return null

    try {
      const fields = serializeFormValues(formElement, { ignoreFields })
      const extra =
        typeof getExtraState === 'function'
          ? getExtraState({ form: formElement, fields })
          : undefined

      const draft = {
        fields,
        extra,
        updatedAt: Date.now()
      }

      storage.setItem(storageKey, JSON.stringify(draft))

      if (typeof onSave === 'function') {
        onSave({ draft, form: formElement })
      }

      return draft
    } catch (error) {
      console.warn(`No se pudo guardar el borrador de "${key}":`, error)
      return null
    }
  }

  function getDraft() {
    if (!storage) return null

    try {
      const raw = storage.getItem(storageKey)
      if (!raw) return null

      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null

      return parsed
    } catch {
      return null
    }
  }

  function hasDraft() {
    return Boolean(getDraft())
  }

  function restore() {
    const draft = getDraft()
    if (!draft) return false

    restoring = true
    try {
      if (draft.fields && typeof draft.fields === 'object') {
        deserializeFormValues(formElement, draft.fields, { ignoreFields })
      }

      if (typeof applyExtraState === 'function' && draft.extra !== undefined) {
        applyExtraState(draft.extra, {
          form: formElement,
          fields: draft.fields ?? {},
          draft
        })
      }

      if (typeof onRestore === 'function') {
        onRestore({ draft, form: formElement })
      }

      return true
    } catch (error) {
      console.warn(`No se pudo restaurar el borrador de "${key}":`, error)
      return false
    } finally {
      restoring = false
    }
  }

  function clear() {
    if (!storage) return

    try {
      storage.removeItem(storageKey)
      if (typeof onClear === 'function') {
        onClear({ form: formElement })
      }
    } catch (error) {
      console.warn(`No se pudo limpiar el borrador de "${key}":`, error)
    }
  }

  const controller = {
    key,
    storageKey,
    initialize,
    destroy,
    save,
    restore,
    clear,
    hasDraft,
    getDraft
  }

  return controller
}
