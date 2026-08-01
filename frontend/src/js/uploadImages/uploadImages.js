import { uploadDonationImage } from '../common/api.js'
import { showToast } from '../common/toast.js'

const input = document.getElementById('images')

const form = document.getElementById('uploadForm')

const previewContainer = document.getElementById('previewContainer')

const button = document.getElementById('btnUpload')

const dropZone = document.getElementById('dropZone')
const modalCarga = document.getElementById('modal-carga')

modalCarga.style.display = 'none'

let files = []

input.onchange = () => {
  files = [...input.files]

  renderPreview()
}

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault()

  dropZone.classList.add('drag')
})

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag')
})

dropZone.addEventListener('drop', (e) => {
  e.preventDefault()

  dropZone.classList.remove('drag')

  files = [...e.dataTransfer.files]

  renderPreview()
})

function renderPreview() {
  previewContainer.innerHTML = ''

  button.disabled = files.length === 0

  files.forEach((file, index) => {
    const card = document.createElement('div')

    card.className = 'preview'

    const img = document.createElement('img')

    img.src = URL.createObjectURL(file)

    const remove = document.createElement('button')

    remove.className = 'remove'

    remove.textContent = '✕'

    remove.onclick = () => {
      files.splice(index, 1)

      renderPreview()
    }

    card.append(img, remove)

    previewContainer.appendChild(card)
  })
}

form.onsubmit = async (e) => {
  e.preventDefault()
  if (files.length === 0) return

  modalCarga.style.display = 'flex'
  console.log('hola')
  try {
    button.disabled = true
    button.textContent = 'Subiendo...'

    await uploadDonationImage(files[0])

    showToast('Imagen cargada existosamente.')

    files = []

    input.value = ''

    renderPreview()
  } catch (err) {
    console.error(err)
    showToast(err.message)
  } finally {
    button.disabled = true
    button.textContent = 'Subir imagen'
    modalCarga.style.display = 'none'
  }
}
