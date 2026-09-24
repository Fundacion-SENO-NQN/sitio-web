import {
  cacheProfile,
  clearSession,
  profileRequest,
  type Profile
} from '../api/profile'

class ProfilePage extends HTMLElement {
  private controller: AbortController | null = null
  private busy = false
  private get details() {
    return this.querySelector<HTMLFormElement>('#profile-form')!
  }
  private get passwordForm() {
    return this.querySelector<HTMLFormElement>('#password-form')!
  }
  private get content() {
    return this.querySelector<HTMLElement>('[data-profile-content]')!
  }

  connectedCallback() {
    if (this.controller) return
    if (!localStorage.getItem('token')) {
      window.location.replace('/login/')
      return
    }
    this.controller = new AbortController()
    const { signal } = this.controller
    this.querySelector('[data-retry]')?.addEventListener(
      'click',
      () => void this.load(),
      { signal }
    )
    this.details.addEventListener(
      'submit',
      (event) => void this.saveDetails(event),
      { signal }
    )
    this.passwordForm.addEventListener(
      'submit',
      (event) => void this.savePassword(event),
      { signal }
    )
    this.querySelector('[data-show-passwords]')?.addEventListener(
      'change',
      (event) => {
        const checked = (event.target as HTMLInputElement).checked
        for (const name of [
          'current_password',
          'password',
          'password_confirmation'
        ]) {
          this.input(this.passwordForm, name).type = checked
            ? 'text'
            : 'password'
        }
      },
      { signal }
    )
    // A logout in another tab must not leave a usable form here.
    window.addEventListener(
      'storage',
      (event) => {
        if (
          (!event.key || event.key === 'token') &&
          !localStorage.getItem('token')
        )
          window.location.replace('/login/')
      },
      { signal }
    )
    void this.load()
  }

  disconnectedCallback() {
    this.controller?.abort()
    this.controller = null
  }

  private input(form: HTMLFormElement, name: string) {
    return form.elements.namedItem(name) as HTMLInputElement
  }

  private fill(profile: Profile) {
    for (const key of ['username', 'email', 'name', 'last_name'] as const)
      this.input(this.details, key).value = profile[key]
    this.input(this.passwordForm, 'username').value = profile.username
    this.querySelector('[data-role]')!.textContent = profile.role_name
    cacheProfile(profile)
  }

  private async load() {
    const status = this.querySelector<HTMLElement>('[data-load-status]')!
    const retry = this.querySelector<HTMLButtonElement>('[data-retry]')!
    status.hidden = false
    status.textContent = 'Cargando tu perfil...'
    status.dataset.error = 'false'
    retry.hidden = true
    try {
      const profile = await profileRequest<Profile>('/profile')
      if (!this.isConnected) return
      this.fill(profile)
      this.content.hidden = false
      status.hidden = true
      if (window.location.hash === '#contrasena')
        this.querySelector('#contrasena')?.scrollIntoView()
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'No pudimos cargar tu perfil.'
      status.dataset.error = 'true'
      retry.hidden = false
    } finally {
      document.getElementById('modal-carga-global')?.remove()
    }
  }

  private setBusy(busy: boolean) {
    this.busy = busy
    for (const form of [this.details, this.passwordForm]) {
      form.querySelector('fieldset')!.disabled = busy
      form.setAttribute('aria-busy', String(busy))
    }
  }

  private feedback(form: HTMLFormElement, text: string, error = false) {
    const element = form.querySelector<HTMLElement>('[data-feedback]')!
    element.textContent = text
    element.dataset.error = String(error)
    element.setAttribute('role', error ? 'alert' : 'status')
    element.hidden = !text
    if (text) element.focus()
  }

  private finish(message: string) {
    clearSession()
    this.details.reset()
    this.passwordForm.reset()
    this.content.hidden = true
    const notice = this.querySelector<HTMLElement>('[data-finished]')!
    notice.querySelector('[data-finished-message]')!.textContent = message
    notice.hidden = false
    notice.querySelector<HTMLElement>('h2')!.focus()
  }

  private async saveDetails(event: SubmitEvent) {
    event.preventDefault()
    if (this.busy || !this.details.reportValidity()) return
    const values = Object.fromEntries(new FormData(this.details)) as Record<
      string,
      string
    >
    this.feedback(this.details, '')
    this.setBusy(true)
    try {
      const result = await profileRequest<{
        user: Profile
        reauthenticate: boolean
      }>('/profile', values)
      if (result.reauthenticate) {
        this.finish(
          `Guardamos tus datos y cerramos tus sesiones anteriores. Iniciá sesión con el usuario ${result.user.username} y tu contraseña actual.`
        )
      } else {
        this.fill(result.user)
        this.feedback(this.details, 'Tus datos fueron actualizados.')
      }
    } catch (error) {
      this.feedback(
        this.details,
        error instanceof Error
          ? error.message
          : 'No pudimos guardar los datos.',
        true
      )
    } finally {
      this.input(this.details, 'current_password').value = ''
      this.setBusy(false)
    }
  }

  private async savePassword(event: SubmitEvent) {
    event.preventDefault()
    if (this.busy || !this.passwordForm.reportValidity()) return
    const values = {
      current_password: this.input(this.passwordForm, 'current_password').value,
      password: this.input(this.passwordForm, 'password').value,
      password_confirmation: this.input(
        this.passwordForm,
        'password_confirmation'
      ).value
    }
    const length = [...values.password].length
    if (length < 8 || length > 128) {
      this.feedback(
        this.passwordForm,
        'La nueva contraseña debe tener entre 8 y 128 caracteres.',
        true
      )
      return
    }
    if (values.password !== values.password_confirmation) {
      this.feedback(this.passwordForm, 'Las contraseñas no coinciden.', true)
      return
    }
    if (values.password === values.current_password) {
      this.feedback(
        this.passwordForm,
        'La nueva contraseña debe ser diferente a la actual.',
        true
      )
      return
    }
    this.feedback(this.passwordForm, '')
    this.setBusy(true)
    try {
      await profileRequest<void>('/profile/password', values)
      this.finish(
        'Tu contraseña fue actualizada y cerramos tus sesiones anteriores. Iniciá sesión con tu nueva contraseña.'
      )
    } catch (error) {
      this.feedback(
        this.passwordForm,
        error instanceof Error
          ? error.message
          : 'No pudimos cambiar la contraseña.',
        true
      )
    } finally {
      for (const name of [
        'current_password',
        'password',
        'password_confirmation'
      ]) {
        this.input(this.passwordForm, name).value = ''
        this.input(this.passwordForm, name).type = 'password'
      }
      this.querySelector<HTMLInputElement>('[data-show-passwords]')!.checked =
        false
      this.setBusy(false)
    }
  }
}

if (!customElements.get('profile-page'))
  customElements.define('profile-page', ProfilePage)
