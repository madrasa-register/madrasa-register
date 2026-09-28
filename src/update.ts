// Tells the user when a newer version is published on the permanent download link.
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? 'dev'
const REPO: string = import.meta.env.VITE_RELEASE_REPO ?? ''
export const DOWNLOAD_URL = REPO ? `https://github.com/${REPO}/releases/latest/download/madrasa-register.apk` : ''

const build = (v: string) => Number(v.replace(/^v/, '').split('.').pop()) || 0

/** Returns the newer version name, or null when this is the newest (or offline / not a release build). */
export async function checkForUpdate(): Promise<string | null> {
  if (!REPO || APP_VERSION === 'dev') return null
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    if (!r.ok) return null
    const tag: string = (await r.json()).tag_name ?? ''
    return build(tag) > build(APP_VERSION) ? tag.replace(/^v/, '') : null
  } catch { return null }
}
