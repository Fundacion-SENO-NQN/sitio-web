import { createCrudApi, request, validateFormData, validateId } from './api.js'

/* ==========================================================
   USERS
========================================================== */

export const usersApi = createCrudApi({
  basePath: '/users',
  hasOrder: false
})

usersApi.setActive = (id, active) => {
  validateId(id)

  return request(`/user/state/${id}`, {
    method: 'PATCH',
    body: Boolean(active)
  })
}

usersApi.changePassword = (id, password) => {
  validateId(id)

  return request(`/users/password/${id}`, {
    method: 'PATCH',
    body: { password }
  })
}

/* ==========================================================
   ROLES
========================================================== */

export const rolesApi = createCrudApi({
  basePath: '/roles',

  listPath: '/roles-services',

  createPath: '/roles-services',

  itemPath: (id) => `/roles/${id}`,

  hasOrder: false
})

rolesApi.getServices = () => request('/services')

/* ==========================================================
   ACHIEVEMENTS
========================================================== */

export const achievementsApi = createCrudApi({
  basePath: '/logros',
  orderMethod: 'PUT'
})

/* ==========================================================
   FEATURED ACHIEVEMENTS
========================================================== */

export const featuredAchievementsApi = {
  list() {
    return request('/logros_fav')
  },

  get(id) {
    validateId(id)

    return request(`/logros_fav/${id}`)
  },

  create({ logro_id, orden }) {
    return request('/logros_fav', {
      method: 'POST',
      body: {
        logro_id,
        orden
      }
    })
  },

  remove(id) {
    validateId(id)

    return request(`/logros_fav/${id}`, {
      method: 'DELETE'
    })
  },

  replace(items) {
    if (!Array.isArray(items))
      throw new TypeError('Los logros destacados deben ser un arreglo.')

    return request('/logros_fav', {
      method: 'PUT',
      body: items
    })
  }
}

/* ==========================================================
   MEMBERS
========================================================== */

export const membersApi = createCrudApi({
  basePath: '/equipo',
  orderMethod: 'PUT'
})

/* ==========================================================
   EVENTS
========================================================== */

export const eventsApi = createCrudApi({
  basePath: '/eventos',
  orderMethod: 'PUT'
})

/* ==========================================================
   NEWS
========================================================== */

export const newsApi = createCrudApi({
  basePath: '/noticias',
  orderMethod: 'PATCH'
})

/* ==========================================================
   DONATION IMAGES
========================================================== */

export const donationImagesApi = {
  upload(file) {
    if (!(file instanceof File))
      throw new TypeError('Debe proporcionarse una imagen.')

    const formData = new FormData()

    formData.append('image', file, file.name)

    return request('/donaciones/img', {
      method: 'PUT',
      body: formData
    })
  }
}

/* ==========================================================
   OPTIONAL COMPATIBILITY EXPORTS
========================================================== */

/*
 * These aliases let you migrate the current files gradually.
 * Existing imports can continue working while each page is
 * refactored.
 */

/* Users */

export const getUsers = usersApi.list

export const getUser = usersApi.get

export const createUser = usersApi.create

export const updateUser = usersApi.update

export const deleteUser = usersApi.remove

export const setUserActive = usersApi.setActive

export const changePassword = usersApi.changePassword

/* Roles */

export const getRoles = rolesApi.list

export const getRole = rolesApi.get

export const createRole = rolesApi.create

export const updateRole = rolesApi.update

export const deleteRole = rolesApi.remove

export const getServices = rolesApi.getServices

/* Achievements */

export const getAchievements = achievementsApi.list

export const getAchievement = achievementsApi.get

export const createAchievement = achievementsApi.create

export const updateAchievement = achievementsApi.update

export const deleteAchievement = achievementsApi.remove

export const changeAchievementsOrder = achievementsApi.changeOrder

/* Featured achievements */

export const getFeaturedAchievements = featuredAchievementsApi.list

export const getFeaturedAchievement = featuredAchievementsApi.get

export const createFeaturedAchievement = (logro_id, orden) =>
  featuredAchievementsApi.create({
    logro_id,
    orden
  })

export const deleteFeaturedAchievement = featuredAchievementsApi.remove

export const replaceFeaturedAchievements = featuredAchievementsApi.replace

/* Members */

export const getMembers = membersApi.list

export const getMember = membersApi.get

export const createMember = membersApi.create

export const updateMember = membersApi.update

export const deleteMember = membersApi.remove

export const changeMembersOrder = membersApi.changeOrder

/* Events */

export const getEventos = eventsApi.list

export const getEventoById = eventsApi.get

export function createEvento(formData) {
  validateFormData(formData)

  return eventsApi.create(formData)
}

export function patchEvento(id, formData) {
  validateFormData(formData)

  return eventsApi.update(id, formData)
}

export const deleteEvento = eventsApi.remove

export const changeOrderEventos = eventsApi.changeOrder

/* News */

export const getNoticias = newsApi.list

export const getNoticiaById = newsApi.get

export function createNoticia(formData) {
  validateFormData(formData)

  return newsApi.create(formData)
}

export function patchNoticia(id, formData) {
  validateFormData(formData)

  return newsApi.update(id, formData)
}

export const deleteNoticia = newsApi.remove

export const changeOrderNoticias = newsApi.changeOrder

/* Donation images */

export const uploadDonationImage = donationImagesApi.upload

/* ==========================================================
   DONATION PAYMENT METHODS
========================================================== */

export const donationMethodsApi = createCrudApi({
  basePath: '/metodos_donacion',
  hasOrder: false
})

export const getDonationMethods = donationMethodsApi.list

export const getDonationMethod = donationMethodsApi.get

export const createDonationMethod = donationMethodsApi.create

export const updateDonationMethod = donationMethodsApi.update

export const deleteDonationMethod = donationMethodsApi.remove
