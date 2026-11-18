import {useEffect, useState} from 'react'

export default function MarketPulse() {
  const [motion, setMotion] = useState<string>()
  useEffect(() => {
    let mounted = true
    void import('./market-tools-motion.html?raw').then(({default: html}) => {
      if (mounted) setMotion(html)
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  return (
    <div className="market-pulse" aria-hidden="true">
      {motion && <iframe
        className="market-pulse-frame"
        title="تصویر متحرک ابزارهای تریدر شو"
        sandbox="allow-scripts"
        tabIndex={-1}
        srcDoc={motion}
      />}
    </div>
  )
}
