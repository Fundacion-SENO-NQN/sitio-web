import { createPlatformCrudModule } from '../common/crudModule.js'
import { createQuotesEditorController } from '../common/quotes.js'
import {
  createBingo,
  deleteBingo,
  getBingoById,
  getBingos,
  patchBingo
} from '../common/resources.js'
import {
  compareQuotesProgress,
  formatLatePaymentNotice,
  getAvailableStartMonthOptions,
  getDefaultStartMonth,
  getMonthName
} from './constants.js'
import { bingoFieldSelectors } from './dom.js'
import { buildBingoFormData, findDuplicateBingoNumber } from './formData.js'
import { createBingoColumns } from './table.js'

/* ==========================================================
   QUOTES EDITOR (MODAL)
========================================================== */

export const bingoQuotesEditor = createQuotesEditorController({
  container: bingoFieldSelectors.quotesEditor,
  startMonthInput: bingoFieldSelectors.startMonth
})

/* ==========================================================
   BINGO CRUD MODULE
========================================================== */

export const bingoModule = createPlatformCrudModule({
  servicio: 'bingo',
  servicioPlural: 'bingos',

  api: {
    list: getBingos,
    get: getBingoById,
    create: createBingo,
    update: patchBingo,
    remove: deleteBingo
  },

  searchValues(bingo) {
    return [
      bingo.nro_bingo,
      bingo.name,
      bingo.last_name,
      `${bingo.name ?? ''} ${bingo.last_name ?? ''}`.trim(),
      bingo.seller,
      bingo.phone,
      bingo.address,
      bingo.neighborhood,
      bingo.locality,
      bingo.collection_locate,
      bingo.collection_date,
      getMonthName(bingo.start_month),
      formatLatePaymentNotice(bingo.late_payment_notice)
    ]
  },

  sorters: {
    nroBingo(a, b) {
      return Number(a.nro_bingo) - Number(b.nro_bingo)
    },
    name(a, b) {
      return compareLocale(a.name, b.name)
    },
    lastName(a, b) {
      return compareLocale(a.last_name, b.last_name)
    },
    seller(a, b) {
      return compareLocale(a.seller, b.seller)
    },
    locality(a, b) {
      return compareLocale(a.locality, b.locality)
    },
    startMonth(a, b) {
      return Number(a.start_month) - Number(b.start_month)
    },
    quotes(a, b) {
      const diff = compareQuotesProgress(a, b)
      return diff !== 0 ? diff : Number(a.nro_bingo) - Number(b.nro_bingo)
    }
  },

  defaultSort: 'nroBingo',
  defaultAscending: true,

  messages: {
    emptyTitle: 'No hay bingos registrados',
    emptyDescription: 'Creá el primer número de bingo para comenzar.',
    noResultsTitle: 'No se encontraron bingos',
    noResultsDescription: 'Probá buscar con otro número, nombre o localidad.',
    loadError: 'No se pudieron cargar los bingos.'
  },

  createColumns: ({ onEdit, onDelete }) =>
    createBingoColumns({ onEdit, onDelete }),

  modalOptions: {
    createTitle: 'Nuevo bingo',
    editTitle: 'Editar bingo',
    createButtonText: 'Guardar bingo',
    editButtonText: 'Guardar cambios',
    focusElement: bingoFieldSelectors.nroBingo,

    autosave: {
      key: 'bingo',
      getExtraState() {
        return {
          quote: bingoQuotesEditor.getValue()
        }
      },
      applyExtraState(extra, { fields }) {
        const startMonth =
          Number(fields?.start_month) || getDefaultStartMonth()
        bingoQuotesEditor.setValue(extra?.quote ?? 0, {
          startMonth
        })
      },
      onRestore({ form }) {
        validateBingoNumberField(form)
      }
    },

    validate({ form, item }) {
      const check = validateBingoNumberField(form, item)
      if (!check.valid) {
        throw new Error(check.message)
      }
    },

    clear(form) {
      form.reset()
      clearBingoNumberError(form)

      const defaultMonth = getDefaultStartMonth()
      const startMonthSelect = form.elements.namedItem('start_month')
      const noticeSelect = form.elements.namedItem('late_payment_notice')

      if (startMonthSelect) {
        setStartMonthSelectOptions(
          startMonthSelect,
          getAvailableStartMonthOptions({ editing: false })
        )
        startMonthSelect.value = String(defaultMonth)
      }

      if (noticeSelect) {
        noticeSelect.value = '0'
      }

      bingoQuotesEditor.reset({ startMonth: defaultMonth })
    },

    populate(form, bingo) {
      const startMonthSelect = form.elements.namedItem('start_month')

      if (startMonthSelect) {
        setStartMonthSelectOptions(
          startMonthSelect,
          getAvailableStartMonthOptions({ editing: true })
        )
      }

      setFieldValue(form, 'nro_bingo', bingo.nro_bingo)
      setFieldValue(form, 'name', bingo.name)
      setFieldValue(form, 'last_name', bingo.last_name)
      setFieldValue(form, 'seller', bingo.seller)
      setFieldValue(form, 'phone', bingo.phone)
      setFieldValue(form, 'address', bingo.address)
      setFieldValue(form, 'neighborhood', bingo.neighborhood)
      setFieldValue(form, 'locality', bingo.locality)
      setFieldValue(form, 'collection_locate', bingo.collection_locate)
      setFieldValue(form, 'collection_date', bingo.collection_date)
      setFieldValue(form, 'start_month', bingo.start_month)
      setFieldValue(
        form,
        'late_payment_notice',
        bingo.late_payment_notice ?? 0
      )

      bingoQuotesEditor.setValue(bingo.quote, {
        startMonth: bingo.start_month,
        createdAt: bingo.created_at
      })

      validateBingoNumberField(form, bingo)
    },

    buildPayload({ form }) {
      return buildBingoFormData({
        nroBingo: getFieldValue(form, 'nro_bingo'),
        name: getFieldValue(form, 'name'),
        lastName: getFieldValue(form, 'last_name'),
        seller: getFieldValue(form, 'seller'),
        phone: getFieldValue(form, 'phone'),
        address: getFieldValue(form, 'address'),
        neighborhood: getFieldValue(form, 'neighborhood'),
        locality: getFieldValue(form, 'locality'),
        collectionLocate: getFieldValue(form, 'collection_locate'),
        collectionDate: getFieldValue(form, 'collection_date'),
        startMonth: getFieldValue(form, 'start_month'),
        quote: bingoQuotesEditor.getValue(),
        latePaymentNotice: getFieldValue(form, 'late_payment_notice')
      })
    }
  },

  deleteOptions: {
    defaultText: 'El número de bingo será eliminado permanentemente.',
    getName(bingo) {
      return `bingo n.º ${bingo.nro_bingo} (${bingo.name} ${bingo.last_name})`
    },
    buildConfirmationText(bingo) {
      return `Vas a eliminar el bingo n.º ${bingo.nro_bingo} asignado a ${bingo.name} ${bingo.last_name}.`
    }
  },

  onInit({ formModal }) {
    bingoQuotesEditor.initialize()

    const nroInput = formModal?.form?.elements?.namedItem('nro_bingo')
    nroInput?.addEventListener('input', () => {
      validateBingoNumberField(formModal.form, formModal.editingItem)
    })
  }
})

/* ==========================================================
   HELPERS
========================================================== */

export function validateBingoNumberField(
  form,
  editingItem = bingoModule?.formModal?.editingItem ?? null,
  items = bingoModule?.listController?.items ?? []
) {
  const nroInput = form?.elements?.namedItem('nro_bingo')
  if (!nroInput) {
    return { valid: true, conflict: null, message: '' }
  }

  const errorElement =
    form?.querySelector('[data-field-error="nro_bingo"]') ??
    document.querySelector('#bingo-nro_bingo-error')

  const conflict = findDuplicateBingoNumber(
    nroInput.value,
    items,
    editingItem?.id
  )

  if (conflict) {
    const holder = `${conflict.name ?? ''} ${conflict.last_name ?? ''}`.trim()
    const message = holder
      ? `El número de bingo ${conflict.nro_bingo} ya está en uso (${holder}).`
      : `El número de bingo ${conflict.nro_bingo} ya está en uso.`

    nroInput.setAttribute('aria-invalid', 'true')
    nroInput.classList?.add('invalid')
    nroInput.setCustomValidity?.(message)

    if (errorElement) {
      errorElement.textContent = message
    }

    return { valid: false, conflict, message }
  }

  clearBingoNumberError(form)
  return { valid: true, conflict: null, message: '' }
}

function clearBingoNumberError(form) {
  const nroInput = form?.elements?.namedItem('nro_bingo')
  const errorElement =
    form?.querySelector('[data-field-error="nro_bingo"]') ??
    document.querySelector('#bingo-nro_bingo-error')

  if (nroInput) {
    nroInput.removeAttribute('aria-invalid')
    nroInput.classList?.remove('invalid')
    nroInput.setCustomValidity?.('')
  }

  if (errorElement) {
    errorElement.textContent = ''
  }
}

function compareLocale(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'es-AR', {
    sensitivity: 'base'
  })
}

function setStartMonthSelectOptions(selectElement, options) {
  if (!selectElement || !('innerHTML' in selectElement)) return

  selectElement.innerHTML = ''

  options.forEach(({ value, label }) => {
    const option = document.createElement('option')
    option.value = String(value)
    option.textContent = label
    selectElement.appendChild(option)
  })
}

function setFieldValue(form, fieldName, value) {
  const control = form.elements.namedItem(fieldName)

  if (control && 'value' in control) {
    control.value = value !== null && value !== undefined ? String(value) : ''
  }
}

function getFieldValue(form, fieldName) {
  const control = form.elements.namedItem(fieldName)

  return control && 'value' in control ? control.value : ''
}

/* ==========================================================
   BOOTSTRAP
========================================================== */

bingoModule.initialize()
