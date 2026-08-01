export function buildMemberFormData(data) {
  const formData = new FormData()

  formData.append('nombre', data.nombre.trim())

  formData.append('apellido', data.apellido.trim())

  formData.append('puesto', data.puesto.trim())

  formData.append('descripcion', data.descripcion.trim())

  if (data.image instanceof File) {
    formData.append('image', data.image)
  }

  return formData
}
