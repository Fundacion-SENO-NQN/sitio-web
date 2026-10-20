import { donationImagesApi } from '../common/resources.js'
import { request } from '../common/api.js'
import { createImagePicker } from '../common/imagePicker.js'
import { requireElement } from '../common/dom.js'
import { showToast } from '../common/toast.js'

const $ = (selector) => requireElement(selector, selector)
const form = $('#uploadForm')
const uploadButton = $('#btnUpload')
const clearButton = $('#btnClearImages')
const overlay = $('#modal-carga')
const status = $('#instagramStatus')
const account = $('#instagramAccount')
const connect = $('#instagramConnect')
const disconnect = $('#instagramDisconnect')
const publish = $('#publishInstagram')
const comments = $('#instagramComments')
const title = $('#donationTitle')
const description = $('#donationDescription')
let uploading = false
let connected = false

const titlePlaceholder = `Agradecemos a XXXXXXX su donación. ❤️`

title.placeholder = titlePlaceholder

const descriptionDefault = `Toda ayuda, por pequeña que parezca, puede hacer una gran diferencia.

📲 Si querés colaborar comunicate con nosotros:
https://wa.me/2994564725

📍 San Carlos 1330 - Neuquén Capital

#FundaciónSENO #Solidaridad #AyudarHaceBien #Neuquén #Comunidad`

description.value = descriptionDefault

const picker = createImagePicker({
  input: '#images',
  dropZone: '#dropZone',
  selectedContainer: '#previewContainer',
  multiple: true,
  maxFiles: 10,
  maxFileSize: 12 * 1024 * 1024,
  allowedTypes: new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif'
  ]),
  allowedExtensions: new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']),
  hiddenClass: 'hidden',
  draggingClass: 'drag',
  disabledClass: 'disabled',
  previewClass: 'preview',
  previewNumberClass: 'previewNumber',
  onChange: updateButton
})
picker.initialize()
document.getElementById('modal-carga-global')?.remove()
overlay.hidden = true
updateButton()

function updateButton() {
  uploadButton.disabled = uploading || picker.count === 0
  uploadButton.textContent = uploading
    ? 'Subiendo y publicando...'
    : `Subir ${picker.count || ''} ${picker.count === 1 ? 'imagen' : 'imágenes'}`
  clearButton.disabled = uploading || picker.count === 0
}
function updateComments() {
  comments.disabled = !connected || !publish.checked || uploading
}

async function loadInstagram() {
  status.textContent = 'Consultando conexión...'
  connect.disabled = true
  try {
    const data = await request('/instagram/status', { globalLoading: false })
    connected = data.connected
    status.textContent = data.connected
      ? 'Conectado'
      : data.error || 'No conectado'
    account.textContent = data.username
      ? `Cuenta: @${data.username}`
      : 'Cuenta: —'
    connect.textContent = data.connected
      ? 'Cambiar cuenta'
      : 'Conectar Instagram'
    connect.disabled = false
    disconnect.hidden = !data.connected
    publish.disabled = !data.connected
    if (!data.connected) publish.checked = false
    updateComments()
  } catch (error) {
    connected = false
    publish.checked = false
    publish.disabled = true
    updateComments()
    status.textContent = error.message || 'No se pudo consultar Instagram'
  }
}
connect.addEventListener('click', async () => {
  if (uploading) return
  connect.disabled = true
  try {
    const { url } = await request('/instagram/connect', {
      method: 'POST',
      globalLoading: false
    })
    window.location.assign(url)
  } catch (error) {
    showToast(error.message, 'error')
    connect.disabled = false
  }
})
disconnect.addEventListener('click', async () => {
  if (
    uploading ||
    !window.confirm('¿Desconectar la cuenta de Instagram de la plataforma?')
  )
    return
  try {
    await request('/instagram/disconnect', {
      method: 'DELETE',
      globalLoading: false
    })
    await loadInstagram()
  } catch (error) {
    showToast(error.message, 'error')
  }
})
publish.addEventListener('change', updateComments)
for (const [input, counter, limit] of [
  [title, $('#titleCount'), 120],
  [description, $('#descriptionCount'), 1200]
]) {
  counter.textContent = `${input.value.length}/${limit}`
  input.addEventListener('input', () => {
    counter.textContent = `${input.value.length}/${limit}`
  })
}
clearButton.addEventListener('click', () => {
  if (!uploading) picker.reset()
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (uploading) return
  let files
  try {
    files = [...picker.validate()]
    picker.requireFiles('Seleccioná al menos una imagen.')
    if (publish.checked && !`${title.value}${description.value}`.trim()) {
      throw new Error('Ingresá un título o una descripción para Instagram.')
    }
  } catch (error) {
    showToast(error.message, 'warning')
    return
  }
  const requestId = crypto.randomUUID()
  uploading = true
  picker.setDisabled(true)
  overlay.hidden = false
  updateComments()
  updateButton()
  try {
    const result = await donationImagesApi.uploadBatch(files, {
      title: title.value,
      description: description.value,
      publishInstagram: publish.checked,
      commentsEnabled: comments.checked,
      requestId
    })
    if (
      result.instagram_status === 'published' ||
      result.instagram_status === 'skipped'
    ) {
      picker.reset()
      showToast(
        result.message ||
          (result.instagram_status === 'published'
            ? `${result.website_uploaded} imágenes cargadas y publicadas en Instagram.`
            : `${result.website_uploaded} imágenes cargadas en la web.`),
        result.message ? 'warning' : 'success'
      )
    } else {
      // A failed or uncertain Meta response may still have published a post.
      picker.reset()
      showToast(
        `${result.website_uploaded} imágenes cargadas en la web. ${result.message || 'Revisá Instagram antes de repetir el envío.'}`,
        'error'
      )
    }
  } catch (error) {
    try {
      const result = await donationImagesApi.batchStatus(requestId)
      picker.reset()
      showToast(
        `Estado del envío: ${result.status}. ${result.website_count} imágenes en la web. ${result.message || 'Revisá Instagram antes de repetir.'}`,
        'error'
      )
    } catch {
      showToast(
        `No se confirmó el resultado. Código de envío: ${requestId}. Revisá la web e Instagram antes de repetir.`,
        'error'
      )
    }
  } finally {
    uploading = false
    picker.setDisabled(false)
    overlay.hidden = true
    updateComments()
    updateButton()
  }
})

const oauthResult = new URL(location.href).searchParams.get('instagram')
if (oauthResult) {
  showToast(
    oauthResult === 'connected'
      ? 'Instagram conectado.'
      : 'No se completó la conexión con Instagram.',
    oauthResult === 'connected' ? 'success' : 'error'
  )
  history.replaceState({}, '', location.pathname)
}
loadInstagram()
