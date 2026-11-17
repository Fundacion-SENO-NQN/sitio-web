import {
  createActionsColumn,
  createBadgeColumn,
  createCustomColumn,
  createTextColumn
} from '../common/table.js'
import { createQuotesColumn } from '../common/quotes.js'
import { formatLatePaymentNotice, getMonthName } from './constants.js'

/* ==========================================================
   BINGO TABLE COLUMNS
========================================================== */

export function createBingoColumns({ onEdit, onDelete } = {}) {
  return [
    createCustomColumn({
      className: 'celda-numero',
      render(item) {
        const badge = document.createElement('span')
        badge.className = 'numero-badge'
        badge.textContent = String(item.nro_bingo ?? '—')
        return badge
      }
    }),

    createTextColumn({
      value: (item) => item.name
    }),

    createTextColumn({
      value: (item) => item.last_name
    }),

    createTextColumn({
      value: (item) => item.phone,
      className: 'celda-nowrap'
    }),

    createTextColumn({
      value: (item) => item.address,
      className: 'celda-texto-largo'
    }),

    createTextColumn({
      value: (item) => item.neighborhood
    }),

    createTextColumn({
      value: (item) => item.locality
    }),

    createTextColumn({
      value: (item) => item.collection_locate,
      className: 'celda-texto-largo'
    }),

    createTextColumn({
      value: (item) => getMonthName(item.start_month),
      className: 'celda-nowrap'
    }),

    createTextColumn({
      value: (item) => item.collection_date,
      className: 'celda-nowrap'
    }),

    createQuotesColumn({
      getQuote: (item) => item.quote,
      getStartMonth: (item) => item.start_month,
      getCreatedAt: (item) => item.created_at
    }),

    createBadgeColumn({
      value: (item) => formatLatePaymentNotice(item.late_payment_notice),
      badgeClassName: 'tableBadge',
      getBadgeClassName: (_, item) =>
        Number(item.late_payment_notice) === 0 ? 'normalBadge' : 'roleBadge'
    }),

    createActionsColumn({
      className: 'celda-acciones',
      containerClassName: 'acciones-tabla',
      actions: [
        {
          text: 'Editar',
          className: 'boton-editar',
          ariaLabel: (item) =>
            `Editar bingo n.º ${item.nro_bingo} de ${item.name} ${item.last_name}`,
          onClick: onEdit
        },
        {
          text: 'Eliminar',
          className: 'boton-eliminar',
          ariaLabel: (item) =>
            `Eliminar bingo n.º ${item.nro_bingo} de ${item.name} ${item.last_name}`,
          onClick: onDelete
        }
      ]
    })
  ]
}
