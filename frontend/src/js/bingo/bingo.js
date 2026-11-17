import { createPlatformCrudModule } from '../common/crudModule.js'
import { createQuotesEditorController } from '../common/quotes.js'
import {
  createBingo,
  deleteBingo,
  getBingoById,
  getBingos,
  patchBingo
} from '../common/resources.js'
import { formatLatePaymentNotice, getMonthName } from './constants.js'
import { bingoFieldSelectors } from './dom.js'
import { buildBingoFormData } from './formData.js'
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
    locality(a, b) {
      return compareLocale(a.locality, b.locality)
    },
    startMonth(a, b) {
      return Number(a.start_month) - Number(b.start_month)
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

    clear(form) {
      form.reset()

      const defaultMonth = new Date().getMonth() + 1
      const startMonthSelect = form.elements.namedItem('start_month')
      const noticeSelect = form.elements.namedItem('late_payment_notice')

      if (startMonthSelect) {
        startMonthSelect.value = String(defaultMonth)
      }

      if (noticeSelect) {
        noticeSelect.value = '0'
      }

      bingoQuotesEditor.reset({ startMonth: defaultMonth })
    },

    populate(form, bingo) {
      setFieldValue(form, 'nro_bingo', bingo.nro_bingo)
      setFieldValue(form, 'name', bingo.name)
      setFieldValue(form, 'last_name', bingo.last_name)
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
    },

    buildPayload({ form }) {
      return buildBingoFormData({
        nroBingo: getFieldValue(form, 'nro_bingo'),
        name: getFieldValue(form, 'name'),
        lastName: getFieldValue(form, 'last_name'),
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

  onInit() {
    bingoQuotesEditor.initialize()
  }
})

/* ==========================================================
   HELPERS
========================================================== */

function compareLocale(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'es-AR', {
    sensitivity: 'base'
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
