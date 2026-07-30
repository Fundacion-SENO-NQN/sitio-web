const API = 'https://sitio-web-fundacion-seno.fly.dev:8080'

if (!API) {
  throw new Error(
    'PUBLIC_API_URL is not configured. Add it to the environment variables.',
  )
}

const BASE_URL = API.replace(/\/+$/, '')

function token() {
  return localStorage.getItem('token')
}

async function request(url, options = {}) {
  const headers = {
    Authorization: `Bearer ${token()}`,
    ...(options.headers ?? {}),
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const response = await fetch(BASE_URL + url, {
    ...options,
    headers,
  })
  if (!response.ok) {
    let message = response.statusText

    try {
      message = await response.text()
    } catch {}

    throw new Error(message)
  }

  if (response.status === 204) return null

  const contentType = response.headers.get('content-type')

  if (!contentType) {
    return null
  }

  if (contentType.includes('application/json')) {
    return await response.json()
  }

  return await response.text()
}

//*
//* USERS
//*

export async function getUsers() {
  return await request('/users')
}

export async function getUser(id) {
  return await request(`/users/${id}`)
}

export async function createUser(user) {
  return await request('/users', {
    method: 'POST',
    body: JSON.stringify(user),
  })
}

export async function updateUser(id, user) {
  return await request(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(user),
  })
}

export async function deleteUser(id) {
  return await request(`/users/${id}`, {
    method: 'DELETE',
  })
}

export async function setUserActive(id, active) {
  return await request(`/user/state/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(active),
  })
}

export async function changePassword(id, password) {
  return await request(`/users/password/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(password),
  })
}

//*
//* ROLES
//*

export async function getRoles() {
  return await request('/roles-services')
}

export async function getRole(id) {
  return await request(`/roles/${id}`)
}

export async function createRole(role) {
  return await request('/roles-services', {
    method: 'POST',
    body: JSON.stringify(role),
  })
}

export async function updateRole(id, role) {
  return await request(`/roles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(role),
  })
}

export async function deleteRole(id) {
  return await request(`/roles/${id}`, {
    method: 'DELETE',
  })
}

export async function getServices() {
  return await request('/services')
}

//*
//* IMAGES DONATIONS
//*

export async function uploadDonationImage(file) {
  const formData = new FormData()

  formData.append('image', file)

  return await request('/img_donacion', {
    method: 'PUT',
    body: formData,
  })
}

//*
//* LOGROS
//*

export async function getAchievements() {
  return await request('/logros')
}

export async function getAchievement(id) {
  return await request(`/logros/${id}`)
}

export async function createAchievement(formData) {
  return await request('/logros', {
    method: 'POST',
    body: formData,
  })
}

export async function updateAchievement(id, formData) {
  return await request(`/logros/${id}`, {
    method: 'PATCH',
    body: formData,
  })
}

export async function deleteAchievement(id) {
  return await request(`/logros/${id}`, {
    method: 'DELETE',
  })
}

export async function changeAchievementsOrder(order) {
  return await request('/logros/order', {
    method: 'PUT',
    body: JSON.stringify(order),
  })
}

//*
//* FEATURED ACHIEVEMENTS
//*

export async function getFeaturedAchievements() {
  return await request('/logros_fav')
}

export async function getFeaturedAchievement(id) {
  return await request(`/logros_fav/${id}`)
}

export async function createFeaturedAchievement(logro_id, orden) {
  return await request('/logros_fav', {
    method: 'POST',
    body: JSON.stringify({
      logro_id,
      orden,
    }),
  })
}

export async function deleteFeaturedAchievement(id) {
  return await request(`/logros_fav/${id}`, {
    method: 'DELETE',
  })
}

export async function replaceFeaturedAchievements(logros) {
  return await request('/logros_fav', {
    method: 'PUT',
    body: JSON.stringify(logros),
  })
}

//*
//* MEMBERS
//*

export function getMembers() {
  return request('/equipo')
}

export function getMember(id) {
  return request(`/equipo/${id}`)
}

export function createMember(formData) {
  return request('/equipo', {
    method: 'POST',
    body: formData,
  })
}

export function updateMember(id, formData) {
  return request(`/equipo/${id}`, {
    method: 'PATCH',
    body: formData,
  })
}

export function deleteMember(id) {
  return request(`/equipo/${id}`, {
    method: 'DELETE',
  })
}

export function changeMembersOrder(items) {
  return request('/equipo/order', {
    method: 'PUT',
    body: JSON.stringify(items),
  })
}
