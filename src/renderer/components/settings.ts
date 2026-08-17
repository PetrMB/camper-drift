import type { AccountConfig, ProbeResult, PublicSettings } from '../../shared/types'
import type { AccountSuggestion } from '../../preload/index'

export interface SettingsView {
  el: HTMLElement
  refresh(): Promise<void>
}

function div(className: string, text?: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className
  if (text !== undefined) el.textContent = text
  return el
}

function button(label: string, className = 'btn'): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = className
  b.textContent = label
  return b
}

function probeSummary(p: ProbeResult | null): string {
  if (!p) return 'nezjištěno'
  if (!p.exists) return 'složka neexistuje'
  if (!p.hasCredentials) return 'není přihlášení (.credentials.json)'
  const expiry = p.expiresAt
    ? new Date(p.expiresAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
    : '—'
  const state = p.expired ? 'token vypršel' : `platné do ${expiry}`
  return `${state} · ${p.projectCount} projektů · ${p.jsonlCount} transcriptů`
}

export function createSettingsView(onChanged: () => void): SettingsView {
  const root = div('settings')

  const accountsBox = div('field')
  const suggestionsBox = div('field')
  const optionsBox = div('field')
  const diagBox = div('field')

  root.append(
    (() => {
      const h = document.createElement('h2')
      h.className = 't-subheadline'
      h.textContent = 'Nastavení'
      return h
    })(),
    accountsBox,
    suggestionsBox,
    optionsBox,
    diagBox,
  )

  async function renderAccounts(): Promise<void> {
    const accounts: AccountConfig[] = await window.claudeMonitor.accounts.list()
    accountsBox.textContent = ''
    accountsBox.append(div('t-subtitle2', 'Účty'))

    if (accounts.length === 0) {
      accountsBox.append(div('muted t-caption2', 'Zatím žádný účet — přidej ho níže.'))
      return
    }

    for (const account of accounts) {
      const row = div('account-row')
      const grow = div('grow')

      const name = document.createElement('input')
      name.type = 'text'
      name.value = account.label
      name.addEventListener('change', () => {
        void window.claudeMonitor.accounts
          .update(account.id, { label: name.value })
          .then(onChanged)
      })

      grow.append(name, div('muted t-disclaimer', account.configDir))

      const remove = button('Odebrat')
      remove.addEventListener('click', () => {
        void window.claudeMonitor.accounts.remove(account.id).then(() => {
          onChanged()
          void renderAll()
        })
      })

      row.append(grow, remove)
      accountsBox.append(row)
    }
  }

  async function renderSuggestions(): Promise<void> {
    const suggestions: AccountSuggestion[] = await window.claudeMonitor.accounts.suggest()
    suggestionsBox.textContent = ''
    suggestionsBox.append(div('t-subtitle2', 'Přidat účet'))

    const usable = suggestions.filter((s) => s.probe.hasCredentials)
    if (usable.length === 0) {
      suggestionsBox.append(
        div(
          'muted t-caption2',
          'Nenašel jsem další přihlášenou složku. Druhý účet zprovozníš tak, že v Claude Code ' +
            'nastavíš CLAUDE_CONFIG_DIR na jinou složku a přihlásíš se v ní.',
        ),
      )
    }

    for (const s of usable) {
      const card = div('suggestion')
      card.append(div('t-subtitle2', s.label))
      card.append(div('muted t-disclaimer', s.configDir))
      card.append(div('muted t-caption2', probeSummary(s.probe)))
      const add = button('Přidat', 'btn primary')
      add.addEventListener('click', () => {
        void window.claudeMonitor.accounts
          .add({ label: s.label, kind: s.kind, configDir: s.configDir })
          .then((result) => {
            if (!result.ok) {
              card.append(div('detail alert t-caption2', result.error))
              return
            }
            onChanged()
            void renderAll()
          })
      })
      card.append(add)
      suggestionsBox.append(card)
    }

    const pick = button('Vybrat složku ručně…')
    pick.addEventListener('click', () => {
      void window.claudeMonitor.accounts.pickDir().then(async (dir) => {
        if (!dir) return
        const result = await window.claudeMonitor.accounts.add({
          label: '',
          kind: 'work',
          configDir: dir,
        })
        if (!result.ok) {
          suggestionsBox.append(div('detail alert t-caption2', result.error))
          return
        }
        onChanged()
        void renderAll()
      })
    })
    suggestionsBox.append(pick)
  }

  async function renderOptions(): Promise<void> {
    const s: PublicSettings = await window.claudeMonitor.settings.get()
    optionsBox.textContent = ''
    optionsBox.append(div('t-subtitle2', 'Chování'))

    const check = (
      label: string,
      value: boolean,
      apply: (v: boolean) => Promise<unknown>,
    ): HTMLElement => {
      const line = div('checkline t-caption2')
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = value
      input.addEventListener('change', () => {
        void apply(input.checked).then(onChanged)
      })
      const text = document.createElement('span')
      text.textContent = label
      line.append(input, text)
      return line
    }

    optionsBox.append(
      check('Vždy navrchu', s.window.alwaysOnTop, (v) =>
        window.claudeMonitor.window.setAlwaysOnTop(v),
      ),
      check('Notifikace', s.notifications.enabled, (v) =>
        window.claudeMonitor.settings.set({ notifications: { enabled: v } }),
      ),
      check('Upozornit na obnovení limitu', s.notifications.onReset, (v) =>
        window.claudeMonitor.settings.set({ notifications: { onReset: v } }),
      ),
      check('Světlý motiv', s.ui.theme === 'light', (v) =>
        window.claudeMonitor.settings.set({ ui: { theme: v ? 'light' : 'emerald' } }),
      ),
      check('Jen lokální data (žádné dotazy na API)', s.network.disableApi, (v) =>
        window.claudeMonitor.settings.set({ network: { disableApi: v } }),
      ),
    )

    const caField = div('field')
    caField.append(div('muted t-caption2', 'Cesta k PEM s firemním certifikátem (nepovinné)'))
    const caInput = document.createElement('input')
    caInput.type = 'text'
    caInput.placeholder = 'C:\\Temp\\zscaler-root.pem'
    caInput.value = s.network.extraCaPemPath ?? ''
    caInput.addEventListener('change', () => {
      void window.claudeMonitor.settings
        .set({ network: { extraCaPemPath: caInput.value.trim() || null } })
        .then(onChanged)
    })
    caField.append(caInput)
    caField.append(
      div(
        'muted t-disclaimer',
        'Ve výchozím stavu se použije systémové úložiště Windows, kde už Zscaler root je. ' +
          'Tohle vyplň jen když dotaz na API selže na certifikátu.',
      ),
    )
    optionsBox.append(caField)
  }

  function renderDiagnostics(): void {
    diagBox.textContent = ''
    const row = div('btnrow')

    const diag = button('Kopírovat diagnostiku')
    diag.addEventListener('click', () => {
      void window.claudeMonitor.exportDiagnostics().then((text) => {
        void navigator.clipboard.writeText(text)
        diag.textContent = 'Zkopírováno'
        setTimeout(() => {
          diag.textContent = 'Kopírovat diagnostiku'
        }, 1500)
      })
    })

    const back = button('Zpět na widget', 'btn primary')
    back.addEventListener('click', () => {
      void window.claudeMonitor.window.setMode('compact')
      onChanged()
    })

    row.append(back, diag)
    diagBox.append(row)
  }

  async function renderAll(): Promise<void> {
    await renderAccounts()
    await renderSuggestions()
    await renderOptions()
    renderDiagnostics()
  }

  return { el: root, refresh: renderAll }
}
