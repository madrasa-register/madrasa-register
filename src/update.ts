import { Capacitor } from '@capacitor/core'
import { tr } from './ui'
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

// ---- share the app -----------------------------------------------------------------

/** The permanent download link; falls back to the public repository when this is not a release build. */
export const SHARE_URL = DOWNLOAD_URL || 'https://github.com/madrasa-register/madrasa-register/releases/latest/download/madrasa-register.apk'

export function shareText() {
  return tr(
    'مدرسہ رجسٹر — مکاتب اور مدارس کے لیے مفت ایپ: داخلہ، حاضری، امتحان، نتیجہ کارڈ، فیس اور تعلیمی کیلنڈر، انٹرنیٹ کے بغیر بھی۔ ڈاؤن لوڈ کریں:',
    'Madrasa Register — a free app for maktabs and madrasas: admission, attendance, exams, result cards, fees and the school calendar, works offline too. Download:',
    'سجل المدرسة — تطبيق مجاني للمكاتب والمدارس: القبول والحضور والامتحانات وبطاقات النتائج والرسوم والتقويم الدراسي، ويعمل دون إنترنت. للتنزيل:',
  )
}

/** Opens the phone's share sheet (WhatsApp, SMS …); in a browser without sharing, copies the text. */
export async function shareApp(): Promise<'shared' | 'copied' | 'failed'> {
  const text = shareText()
  const title = tr('مدرسہ رجسٹر', 'Madrasa Register', 'سجل المدرسة')
  try {
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share')
      await Share.share({ title, text: `${text}\n${SHARE_URL}`, dialogTitle: tr('شیئر کریں', 'Share', 'مشاركة') })
      return 'shared'
    }
    if (navigator.share) { await navigator.share({ title, text: `${text}\n${SHARE_URL}` }); return 'shared' }
    await navigator.clipboard.writeText(`${text}\n${SHARE_URL}`)
    return 'copied'
  } catch (e: any) {
    // the user closing the share sheet is not an error
    if (e?.name === 'AbortError' || /cancel/i.test(e?.message ?? '')) return 'shared'
    try { await navigator.clipboard.writeText(`${text}\n${SHARE_URL}`); return 'copied' } catch { return 'failed' }
  }
}
