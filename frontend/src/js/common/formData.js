/**
 * Herramientas generales para construir y validar:
 *
 * - FormData para eventos, noticias, miembros y logros.
 * - Objetos JSON para usuarios, roles y otros recursos.
 *
 * La validación específica de tamaño y formato de imágenes
 * permanece en imagePicker.js.
 */

/* ==========================================================
   BUILDERS
========================================================== */

/**
 * Crea una función que construye FormData usando un esquema.
 *
 * Ejemplo:
 *
 * const build = createFormDataBuilder({
 *   fields: {
 *     titulo: textField({
 *       required: true
 *     })
 *   },
 *
 *   files: {
 *     images: fileField({
 *       multiple: true
 *     })
 *   }
 * })
 */
export function createFormDataBuilder({
  fields = {},
  files = {},

  validate = null,
  beforeBuild = null,
  afterBuild = null
} = {}) {
  validateBuilderConfiguration({
    fields,
    files,
    validate,
    beforeBuild,
    afterBuild
  })

  return function buildFormData(data = {}, context = {}) {
    validateDataObject(data)

    const normalizedFields = normalizeFields({
      data,
      fields,
      context
    })

    const normalizedFiles = normalizeFileFields({
      data,
      files,
      context
    })

    const details = {
      data,
      context,

      values: normalizedFields.values,

      fileValues: normalizedFiles.values
    }

    beforeBuild?.(details)

    validate?.(details)

    const formData = new FormData()

    appendNormalizedFields(formData, normalizedFields.entries)

    appendNormalizedFiles(formData, normalizedFiles.entries)

    afterBuild?.(formData, details)

    return formData
  }
}

/**
 * Crea un constructor de objetos JSON usando los mismos
 * tipos de campos.
 */
export function createJsonBuilder({
  fields = {},

  validate = null,
  beforeBuild = null,
  afterBuild = null
} = {}) {
  validateBuilderConfiguration({
    fields,
    files: {},
    validate,
    beforeBuild,
    afterBuild
  })

  return function buildJson(data = {}, context = {}) {
    validateDataObject(data)

    const normalized = normalizeFields({
      data,
      fields,
      context
    })

    const details = {
      data,
      context,
      values: normalized.values,

      fileValues: {}
    }

    beforeBuild?.(details)

    validate?.(details)

    const result = {}

    normalized.entries.forEach(({ name, value, include }) => {
      if (!include) {
        return
      }

      result[name] = value
    })

    const transformed = afterBuild?.(result, details)

    return transformed ?? result
  }
}

/* ==========================================================
   FIELD DEFINITIONS
========================================================== */

export function textField({
  name = null,

  required = false,
  requiredMessage = 'Este campo es requerido.',

  trim = true,

  minLength = null,
  minLengthMessage = null,

  maxLength = null,
  maxLengthMessage = null,

  omitEmpty = false,

  transform = null,
  validate = null
} = {}) {
  return {
    type: 'text',

    name,
    required,
    requiredMessage,

    trim,

    minLength,
    minLengthMessage,

    maxLength,
    maxLengthMessage,

    omitEmpty,

    transform,
    validate
  }
}

export function urlField({
  protocols = ['http:', 'https:'],

  invalidMessage = 'La URL debe comenzar con http:// o https://.',

  ...options
} = {}) {
  return {
    ...textField(options),

    type: 'url',
    protocols,
    invalidMessage
  }
}

export function integerField({
  name = null,

  required = false,
  requiredMessage = 'Este número es requerido.',

  min = null,
  max = null,

  invalidMessage = 'El número no es válido.',

  minMessage = null,
  maxMessage = null,

  omitEmpty = false,
  emptyValue = '',

  transform = null,
  validate = null
} = {}) {
  return {
    type: 'integer',

    name,

    required,
    requiredMessage,

    min,
    max,

    invalidMessage,
    minMessage,
    maxMessage,

    omitEmpty,
    emptyValue,

    transform,
    validate
  }
}

export function numberField({
  name = null,

  required = false,
  requiredMessage = 'Este número es requerido.',

  min = null,
  max = null,

  invalidMessage = 'El número no es válido.',

  minMessage = null,
  maxMessage = null,

  omitEmpty = false,
  emptyValue = '',

  transform = null,
  validate = null
} = {}) {
  return {
    type: 'number',

    name,

    required,
    requiredMessage,

    min,
    max,

    invalidMessage,
    minMessage,
    maxMessage,

    omitEmpty,
    emptyValue,

    transform,
    validate
  }
}

export function booleanField({
  name = null,

  required = false,

  omitEmpty = false,
  emptyValue = false,

  transform = null,
  validate = null
} = {}) {
  return {
    type: 'boolean',

    name,
    required,

    omitEmpty,
    emptyValue,

    transform,
    validate
  }
}

export function arrayField({
  name = null,

  required = false,
  requiredMessage = 'Debe seleccionarse al menos un elemento.',

  minItems = null,
  maxItems = null,

  minItemsMessage = null,
  maxItemsMessage = null,

  unique = false,

  itemTransform = null,
  itemValidate = null,

  omitEmpty = false,

  /**
   * FormData:
   * - repeat: agrega varias veces el mismo campo.
   * - json: agrega JSON.stringify(array).
   */
  formDataMode = 'repeat',

  transform = null,
  validate = null
} = {}) {
  return {
    type: 'array',

    name,

    required,
    requiredMessage,

    minItems,
    maxItems,

    minItemsMessage,
    maxItemsMessage,

    unique,

    itemTransform,
    itemValidate,

    omitEmpty,
    formDataMode,

    transform,
    validate
  }
}

export function enumField({
  values,

  name = null,

  required = false,
  requiredMessage = 'Debe seleccionarse una opción.',

  invalidMessage = 'La opción seleccionada no es válida.',

  omitEmpty = false,

  transform = null,
  validate = null
} = {}) {
  if (!Array.isArray(values))
    throw new TypeError('enumField requiere un arreglo de valores.')

  return {
    type: 'enum',

    values,

    name,

    required,
    requiredMessage,

    invalidMessage,
    omitEmpty,

    transform,
    validate
  }
}

export function rawField({
  name = null,

  required = false,
  requiredMessage = 'Este campo es requerido.',

  omitNull = false,

  /**
   * Forma de enviarlo mediante FormData:
   * - string
   * - json
   */
  formDataMode = 'string',

  transform = null,
  validate = null
} = {}) {
  return {
    type: 'raw',

    name,

    required,
    requiredMessage,

    omitNull,
    formDataMode,

    transform,
    validate
  }
}

/* ==========================================================
   FILE FIELD
========================================================== */

export function fileField({
  name = null,

  multiple = false,

  required = false,
  requiredMessage = 'Debe seleccionarse un archivo.',

  minFiles = null,
  maxFiles = null,

  minFilesMessage = null,
  maxFilesMessage = null,

  omitEmpty = true,

  validate = null
} = {}) {
  return {
    type: 'file',

    name,

    multiple,

    required,
    requiredMessage,

    minFiles,
    maxFiles,

    minFilesMessage,
    maxFilesMessage,

    omitEmpty,
    validate
  }
}

/* ==========================================================
   NORMALIZE FIELDS
========================================================== */

function normalizeFields({ data, fields, context }) {
  const entries = []
  const values = {}

  for (const [sourceName, descriptor] of Object.entries(fields)) {
    validateFieldDescriptor(sourceName, descriptor)

    const name = descriptor.name ?? sourceName

    const rawValue = data[sourceName]

    const fieldContext = {
      data,
      context,

      sourceName,
      name,

      descriptor
    }

    const normalized = normalizeFieldValue(rawValue, descriptor, fieldContext)

    values[sourceName] = normalized.value

    entries.push({
      sourceName,
      name,

      value: normalized.value,

      include: normalized.include,

      descriptor
    })
  }

  return {
    entries,
    values
  }
}

function normalizeFieldValue(rawValue, descriptor, context) {
  let result

  switch (descriptor.type) {
    case 'text':
      result = normalizeText(rawValue, descriptor, context)

      break

    case 'url':
      result = normalizeUrl(rawValue, descriptor, context)

      break

    case 'integer':
      result = normalizeNumber(rawValue, descriptor, context, true)

      break

    case 'number':
      result = normalizeNumber(rawValue, descriptor, context, false)

      break

    case 'boolean':
      result = normalizeBoolean(rawValue, descriptor, context)

      break

    case 'array':
      result = normalizeArray(rawValue, descriptor, context)

      break

    case 'enum':
      result = normalizeEnum(rawValue, descriptor, context)

      break

    case 'raw':
      result = normalizeRaw(rawValue, descriptor, context)

      break

    default:
      throw new TypeError(`El tipo de campo "${descriptor.type}" no es válido.`)
  }

  if (result.include && typeof descriptor.transform === 'function')
    result.value = descriptor.transform(result.value, context)

  if (result.include && typeof descriptor.validate === 'function')
    descriptor.validate(result.value, context)

  return result
}

/* ==========================================================
   TEXT
========================================================== */

function normalizeText(rawValue, descriptor, context) {
  let value = String(rawValue ?? '')

  if (descriptor.trim) value = value.trim()

  const required = resolveBooleanOption(descriptor.required, context)

  if (!value) {
    if (required)
      throw new Error(resolveMessage(descriptor.requiredMessage, context))

    return {
      value: '',
      include: !descriptor.omitEmpty
    }
  }

  if (
    Number.isInteger(descriptor.minLength) &&
    value.length < descriptor.minLength
  )
    throw new Error(
      resolveMessage(descriptor.minLengthMessage, context) ??
        `El campo debe tener al menos ${descriptor.minLength} caracteres.`
    )

  if (
    Number.isInteger(descriptor.maxLength) &&
    value.length > descriptor.maxLength
  )
    throw new Error(
      resolveMessage(descriptor.maxLengthMessage, context) ??
        `El campo no puede superar los ${descriptor.maxLength} caracteres.`
    )

  return {
    value,
    include: true
  }
}

/* ==========================================================
   URL
========================================================== */

function normalizeUrl(rawValue, descriptor, context) {
  const result = normalizeText(rawValue, descriptor, context)

  if (!result.include || !result.value) return result

  let parsedUrl

  try {
    parsedUrl = new URL(result.value)
  } catch {
    throw new Error(resolveMessage(descriptor.invalidMessage, context))
  }

  if (!descriptor.protocols.includes(parsedUrl.protocol))
    throw new Error(resolveMessage(descriptor.invalidMessage, context))

  return result
}

/* ==========================================================
   NUMBERS
========================================================== */

function normalizeNumber(rawValue, descriptor, context, integer) {
  const empty =
    rawValue === null ||
    rawValue === undefined ||
    String(rawValue).trim() === ''

  const required = resolveBooleanOption(descriptor.required, context)

  if (empty) {
    if (required)
      throw new Error(resolveMessage(descriptor.requiredMessage, context))

    return {
      value: descriptor.emptyValue,

      include: !descriptor.omitEmpty
    }
  }

  const value = Number(rawValue)

  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)))
    throw new Error(resolveMessage(descriptor.invalidMessage, context))

  if (descriptor.min !== null && value < descriptor.min)
    throw new Error(
      resolveMessage(descriptor.minMessage, context) ??
        `El valor mínimo permitido es ${descriptor.min}.`
    )

  if (descriptor.max !== null && value > descriptor.max)
    throw new Error(
      resolveMessage(descriptor.maxMessage, context) ??
        `El valor máximo permitido es ${descriptor.max}.`
    )

  return {
    value,
    include: true
  }
}

/* ==========================================================
   BOOLEAN
========================================================== */

function normalizeBoolean(rawValue, descriptor, context) {
  const empty = rawValue === null || rawValue === undefined || rawValue === ''

  const required = resolveBooleanOption(descriptor.required, context)

  if (empty) {
    if (required) throw new Error('Este campo es requerido.')

    return {
      value: descriptor.emptyValue,

      include: !descriptor.omitEmpty
    }
  }

  return {
    value: parseBoolean(rawValue),

    include: true
  }
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value

  if (value === 1 || value === '1') return true

  if (value === 0 || value === '0') return false

  const normalized = String(value).trim().toLowerCase()

  if (
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'si' ||
    normalized === 'sí' ||
    normalized === 'on'
  )
    return true

  if (normalized === 'false' || normalized === 'no' || normalized === 'off')
    return false

  return Boolean(value)
}

/* ==========================================================
   ARRAY
========================================================== */

function normalizeArray(rawValue, descriptor, context) {
  let value

  if (rawValue === null || rawValue === undefined) value = []
  else if (Array.isArray(rawValue)) value = [...rawValue]
  else if (rawValue instanceof Set) value = [...rawValue]
  else value = [rawValue]

  if (typeof descriptor.itemTransform === 'function')
    value = value.map((item, index) =>
      descriptor.itemTransform(item, {
        ...context,
        index
      })
    )

  if (descriptor.unique) value = [...new Set(value)]

  const required = resolveBooleanOption(descriptor.required, context)

  if (required && value.length === 0)
    throw new Error(resolveMessage(descriptor.requiredMessage, context))

  if (
    Number.isInteger(descriptor.minItems) &&
    value.length < descriptor.minItems
  )
    throw new Error(
      resolveMessage(descriptor.minItemsMessage, context) ??
        `Debés seleccionar al menos ${descriptor.minItems} elementos.`
    )

  if (
    Number.isInteger(descriptor.maxItems) &&
    value.length > descriptor.maxItems
  )
    throw new Error(
      resolveMessage(descriptor.maxItemsMessage, context) ??
        `Podés seleccionar como máximo ${descriptor.maxItems} elementos.`
    )

  if (typeof descriptor.itemValidate === 'function')
    value.forEach((item, index) => {
      descriptor.itemValidate(item, {
        ...context,
        index
      })
    })

  return {
    value,

    include: value.length > 0 || !descriptor.omitEmpty
  }
}

/* ==========================================================
   ENUM
========================================================== */

function normalizeEnum(rawValue, descriptor, context) {
  const value = rawValue === null || rawValue === undefined ? '' : rawValue

  const required = resolveBooleanOption(descriptor.required, context)

  if (value === '') {
    if (required)
      throw new Error(resolveMessage(descriptor.requiredMessage, context))

    return {
      value: '',
      include: !descriptor.omitEmpty
    }
  }

  if (
    !descriptor.values.some(
      (allowedValue) => String(allowedValue) === String(value)
    )
  )
    throw new Error(resolveMessage(descriptor.invalidMessage, context))

  return {
    value,
    include: true
  }
}

/* ==========================================================
   RAW
========================================================== */

function normalizeRaw(rawValue, descriptor, context) {
  const empty = rawValue === null || rawValue === undefined

  const required = resolveBooleanOption(descriptor.required, context)

  if (empty && required)
    throw new Error(resolveMessage(descriptor.requiredMessage, context))

  return {
    value: rawValue,

    include: !empty || !descriptor.omitNull
  }
}

/* ==========================================================
   FILE NORMALIZATION
========================================================== */

function normalizeFileFields({ data, files, context }) {
  const entries = []
  const values = {}

  for (const [sourceName, descriptor] of Object.entries(files)) {
    if (!descriptor || descriptor.type !== 'file')
      throw new TypeError(`El campo de archivo "${sourceName}" no es válido.`)

    const name = descriptor.name ?? sourceName

    const rawFiles = normalizeFiles(data[sourceName])

    const selectedFiles = descriptor.multiple ? rawFiles : rawFiles.slice(0, 1)

    const fileContext = {
      data,
      context,

      sourceName,
      name,

      descriptor
    }

    validateFileField(selectedFiles, descriptor, fileContext)

    values[sourceName] = descriptor.multiple
      ? selectedFiles
      : (selectedFiles[0] ?? null)

    entries.push({
      sourceName,
      name,

      files: selectedFiles,

      include: selectedFiles.length > 0 || !descriptor.omitEmpty,

      descriptor
    })
  }

  return {
    entries,
    values
  }
}

function validateFileField(files, descriptor, context) {
  const required = resolveBooleanOption(descriptor.required, context)

  if (required && files.length === 0)
    throw new Error(resolveMessage(descriptor.requiredMessage, context))

  if (
    Number.isInteger(descriptor.minFiles) &&
    files.length < descriptor.minFiles
  )
    throw new Error(
      resolveMessage(descriptor.minFilesMessage, context) ??
        `Debés seleccionar al menos ${descriptor.minFiles} archivos.`
    )

  if (
    Number.isInteger(descriptor.maxFiles) &&
    files.length > descriptor.maxFiles
  )
    throw new Error(
      resolveMessage(descriptor.maxFilesMessage, context) ??
        `Podés seleccionar como máximo ${descriptor.maxFiles} archivos.`
    )

  files.forEach((file, index) => {
    if (!isFile(file))
      throw new TypeError(`El archivo ${index + 1} no es válido.`)
  })

  descriptor.validate?.(files, context)
}

/* ==========================================================
   APPEND TO FORM DATA
========================================================== */

function appendNormalizedFields(formData, entries) {
  entries.forEach(({ name, value, include, descriptor }) => {
    if (!include) return

    if (descriptor.type === 'array')
      appendArray(formData, name, value, descriptor.formDataMode)

    return

    if (descriptor.type === 'raw' && descriptor.formDataMode === 'json')
      formData.append(name, JSON.stringify(value))

    return

    formData.append(name, serializeFormDataValue(value))
  })
}

function appendArray(formData, name, values, mode) {
  if (mode === 'json') {
    formData.append(name, JSON.stringify(values))

    return
  }

  values.forEach((value) => {
    formData.append(name, serializeFormDataValue(value))
  })
}

function appendNormalizedFiles(formData, entries) {
  entries.forEach(({ name, files, include }) => {
    if (!include) return

    files.forEach((file) => {
      formData.append(name, file, file.name)
    })
  })
}

function serializeFormDataValue(value) {
  if (value === null || value === undefined) return ''

  if (typeof value === 'boolean') return value ? 'true' : 'false'

  return String(value)
}

/* ==========================================================
   READ HTML FORM
========================================================== */

/**
 * Convierte un formulario HTML en un objeto simple.
 *
 * Los archivos permanecen como File o File[].
 */
export function readFormValues(form) {
  const element = resolveForm(form)

  const formData = new FormData(element)

  const result = {}

  for (const [name, value] of formData.entries()) {
    if (Object.prototype.hasOwnProperty.call(result, name)) {
      if (!Array.isArray(result[name])) result[name] = [result[name]]

      result[name].push(value)
    } else result[name] = value
  }

  /*
   * Los checkbox sin marcar no aparecen en FormData.
   * Los agregamos como false cuando tienen name.
   */
  element
    .querySelectorAll('input[type="checkbox"][name]')
    .forEach((checkbox) => {
      if (!Object.prototype.hasOwnProperty.call(result, checkbox.name))
        result[checkbox.name] = false
      else if (!Array.isArray(result[checkbox.name]))
        result[checkbox.name] = checkbox.checked
    })

  return result
}

/* ==========================================================
   PUBLIC CLEANING HELPERS
========================================================== */

export function cleanRequiredText(value, message = 'Este campo es requerido.') {
  const cleaned = String(value ?? '').trim()

  if (!cleaned) throw new Error(message)

  return cleaned
}

export function cleanOptionalText(value) {
  return String(value ?? '').trim()
}

export function isValidHttpUrl(value) {
  try {
    const url = new URL(value)

    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/* ==========================================================
   HELPERS
========================================================== */

function normalizeFiles(value) {
  if (value === null || value === undefined || value === '') return []

  if (isFile(value)) return [value]

  if (typeof FileList !== 'undefined' && value instanceof FileList)
    return [...value]

  if (Array.isArray(value)) return value.filter(Boolean)

  throw new TypeError('La lista de archivos no es válida.')
}

function isFile(value) {
  return typeof File !== 'undefined' && value instanceof File
}

function resolveBooleanOption(value, context) {
  if (typeof value === 'function') return Boolean(value(context))

  return Boolean(value)
}

function resolveMessage(message, context) {
  if (typeof message === 'function') return message(context)

  return message
}

function validateDataObject(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new TypeError('Los datos del formulario no son válidos.')
}

function validateFieldDescriptor(sourceName, descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || !descriptor.type)
    throw new TypeError(
      `La configuración del campo "${sourceName}" no es válida.`
    )
}

function validateBuilderConfiguration({
  fields,
  files,
  validate,
  beforeBuild,
  afterBuild
}) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields))
    throw new TypeError('fields debe ser un objeto.')

  if (!files || typeof files !== 'object' || Array.isArray(files))
    throw new TypeError('files debe ser un objeto.')

  const callbacks = {
    validate,
    beforeBuild,
    afterBuild
  }

  for (const [name, callback] of Object.entries(callbacks)) {
    if (
      callback !== null &&
      callback !== undefined &&
      typeof callback !== 'function'
    )
      throw new TypeError(`${name} debe ser una función.`)
  }
}

function resolveForm(value) {
  if (
    typeof HTMLFormElement !== 'undefined' &&
    value instanceof HTMLFormElement
  )
    return value

  if (typeof value === 'string') {
    const element = document.querySelector(value)

    if (element instanceof HTMLFormElement) return element
  }

  throw new TypeError('No se encontró un formulario válido.')
}
