import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
type Theme = 'light' | 'dark'
const ThemeContext = createContext<{theme: Theme; toggle: () => void}>({theme:'light',toggle:()=>{}})
export function ThemeProvider({children}:{children:ReactNode}) {
  const [theme,setTheme] = useState<Theme>(() => { try { return localStorage.getItem('tradersho-theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' } })
  useEffect(() => { document.documentElement.dataset.theme=theme; document.documentElement.style.colorScheme=theme; document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#ffffff':'#061a32'); try {localStorage.setItem('tradersho-theme',theme)} catch {} },[theme])
  return <ThemeContext.Provider value={{theme,toggle:()=>setTheme(t=>t==='light'?'dark':'light')}}>{children}</ThemeContext.Provider>
}
export const useTheme = () => useContext(ThemeContext)
export function ThemeToggle(){ const {theme,toggle}=useTheme(); return <button className="icon-button theme-toggle" onClick={toggle} aria-label={theme==='light'?'فعال کردن حالت تیره':'فعال کردن حالت روشن'} title={theme==='light'?'حالت تیره':'حالت روشن'}>{theme==='light'?<Moon size={20}/>:<Sun size={20}/>}</button> }
