import { registerEvents } from './events.js'
import { loadUsers, loadRoles, loadServices } from './data.js'

init()

async function init() {
  registerEvents()

  await Promise.all([loadUsers(), loadRoles(), loadServices()])
}
