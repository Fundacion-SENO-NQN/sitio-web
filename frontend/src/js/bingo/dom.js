import { getModuleSelectors } from '../common/crudModule.js'

export const bingoSelectors = Object.freeze({
  ...getModuleSelectors('bingo', 'bingos'),
  showCancelled: '#mostrar-cancelados-bingo'
})

export const bingoFieldSelectors = Object.freeze({
  nroBingo: '#bingo-nro_bingo',
  name: '#bingo-name',
  lastName: '#bingo-last_name',
  seller: '#bingo-seller',
  cancelled: '#bingo-cancelled',
  phone: '#bingo-phone',
  address: '#bingo-address',
  neighborhood: '#bingo-neighborhood',
  locality: '#bingo-locality',
  collectionLocate: '#bingo-collection_locate',
  collectionDate: '#bingo-collection_date',
  startMonth: '#bingo-start_month',
  latePaymentNotice: '#bingo-late_payment_notice',
  quotesEditor: '[data-cuotas-editor="bingo"]'
})
