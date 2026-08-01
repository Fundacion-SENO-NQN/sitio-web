export function buildAchievementFormData(data) {
  const form = new FormData()

  form.append('titulo', data.titulo)

  form.append('contenido', data.contenido)

  form.append('orden', data.orden)

  if (data.image) {
    form.append('image', data.image)
  }

  return form
}
