import { members, refreshMembers } from './miembros.js'

import { changeMembersOrder } from '../common/api.js'

let changingOrder = false

export async function moveMemberUp(id) {
  if (changingOrder) {
    return
  }

  const orderedMembers = getOrderedMembers()

  const currentIndex = orderedMembers.findIndex((member) => member.id === id)

  if (currentIndex <= 0) {
    return
  }

  const currentMember = orderedMembers[currentIndex]

  const previousMember = orderedMembers[currentIndex - 1]

  await swapMembers(currentMember, previousMember)
}

export async function moveMemberDown(id) {
  if (changingOrder) {
    return
  }

  const orderedMembers = getOrderedMembers()

  const currentIndex = orderedMembers.findIndex((member) => member.id === id)

  if (currentIndex === -1 || currentIndex >= orderedMembers.length - 1) {
    return
  }

  const currentMember = orderedMembers[currentIndex]

  const nextMember = orderedMembers[currentIndex + 1]

  await swapMembers(currentMember, nextMember)
}

function getOrderedMembers() {
  return [...members].sort((memberA, memberB) => memberA.orden - memberB.orden)
}

async function swapMembers(firstMember, secondMember) {
  changingOrder = true

  const firstOrder = firstMember.orden

  const secondOrder = secondMember.orden

  try {
    await changeMembersOrder([
      {
        id: firstMember.id,
        orden: secondOrder,
      },
      {
        id: secondMember.id,
        orden: firstOrder,
      },
    ])

    /*
     * Update local state immediately so the interface
     * feels responsive.
     */
    firstMember.orden = secondOrder
    secondMember.orden = firstOrder

    await refreshMembers()
  } catch (error) {
    console.error('Error changing member order:', error)

    alert(error.message || 'No se pudo cambiar el orden de los miembros.')
  } finally {
    changingOrder = false
  }
}
