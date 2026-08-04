import {
  arrayField,
  createFormDataBuilder,
  fileField,
  textField
} from '../common/formData.js'

const MAX_ICON_SIZE = 512 * 1024

const buildFormData = createFormDataBuilder({
  fields: {
    nombre: textField({
      required: true,

      requiredMessage: 'El nombre del método es requerido.',

      maxLength: 150,

      maxLengthMessage: 'El nombre no puede superar los 150 caracteres.'
    }),

    descripcion: textField({
      required: true,

      requiredMessage: 'La descripción del método es requerida.',

      maxLength: 2000,

      maxLengthMessage: 'La descripción no puede superar los 2000 caracteres.'
    }),

    informacion: arrayField({
      omitEmpty: false,
      formDataMode: 'json',

      itemTransform(item) {
        const id = Number(item?.id)

        return {
          ...(Number.isInteger(id) && id > 0 ? { id } : {}),

          titulo: String(item?.titulo ?? '').trim(),

          valor: String(item?.valor ?? '').trim()
        }
      },

      itemValidate(item, { index }) {
        if (!item.titulo) {
          throw new Error(`El título del dato ${index + 1} es requerido.`)
        }

        if (!item.valor) {
          throw new Error(`El valor del dato ${index + 1} es requerido.`)
        }

        if (item.titulo.length > 100) {
          throw new Error(
            `El título del dato ${index + 1} no puede superar los 100 caracteres.`
          )
        }

        if (item.valor.length > 500) {
          throw new Error(
            `El valor del dato ${index + 1} no puede superar los 500 caracteres.`
          )
        }
      }
    })
  },

  files: {
    icon: fileField({
      multiple: false,
      maxFiles: 1,
      omitEmpty: true,

      required({ context }) {
        return !context.editing
      },

      requiredMessage: 'Seleccioná un ícono SVG para el método.',

      validate(files) {
        files.forEach(validateSvgIcon)
      }
    })
  },

  validate({ values }) {
    validateUniqueInformationTitles(values.informacion)
  }
})

export function buildDonationMethodFormData(
  { nombre, descripcion, informacion, icon },
  { editing = false } = {}
) {
  return buildFormData(
    {
      nombre,
      descripcion,
      informacion,
      icon
    },
    {
      editing
    }
  )
}

function validateSvgIcon(file) {
  if (!(file instanceof File)) {
    throw new TypeError('El ícono seleccionado no es un archivo válido.')
  }

  const extension = String(file.name)
    .split('.')
    .at(-1)
    ?.toLocaleLowerCase('en-US')

  const validMimeType = file.type === 'image/svg+xml' || file.type === ''

  if (!validMimeType || extension !== 'svg') {
    throw new Error('El ícono debe estar en formato SVG.')
  }

  if (file.size === 0) {
    throw new Error('El archivo SVG está vacío.')
  }

  if (file.size > MAX_ICON_SIZE) {
    throw new Error('El ícono no puede superar los 512 KB.')
  }
}

function validateUniqueInformationTitles(information) {
  const titles = new Set()

  for (const item of information) {
    const normalizedTitle = normalizeText(item.titulo)

    if (titles.has(normalizedTitle)) {
      throw new Error(`El dato “${item.titulo}” está repetido.`)
    }

    titles.add(normalizedTitle)
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
