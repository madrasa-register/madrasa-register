import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-nastaliq-urdu/arabic-400.css'
import '@fontsource/noto-nastaliq-urdu/arabic-700.css'
import '@fontsource/amiri/arabic-400.css'
import '@fontsource/amiri/arabic-700.css'
import '@fontsource/amiri/latin-400.css'
import '@fontsource/amiri/latin-700.css'
import '@fontsource/source-sans-3/latin-400.css'
import '@fontsource/source-sans-3/latin-600.css'
import './index.css'
import { openDb, startWatching, subscribe } from './db/db'
import { bumpVersion, setLang, lang } from './ui'
import App from './App'
import { loadStoredUrduFont } from './fonts'

setLang(lang)
const root = createRoot(document.getElementById('root')!)
root.render(<div className="boot">مدرسہ رجسٹر کھل رہا ہے…</div>)

Promise.all([openDb(), loadStoredUrduFont()])
  .then(() => {
    startWatching()
    subscribe(bumpVersion)
    root.render(<StrictMode><App /></StrictMode>)
  })
  .catch((e) => {
    console.error(e)
    root.render(<div className="boot err">ڈیٹا بیس نہیں کھل سکا — Database could not open.<br /><small dir="ltr">{String(e)}</small></div>)
  })
