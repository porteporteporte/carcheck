import { useState } from 'react'
import { VinLookup } from './components/VinLookup'

export default function App() {
  const [page] = useState('vin')

  return (
    <>
      <div className="topbar">
        <div className="logo">TrustAuto</div>
        <button className={'nav-tab ' + (page === 'vin' ? 'active' : '')}>VIN / Посилання</button>
      </div>

      <div>
        {page === 'vin' && <VinLookup />}
      </div>
    </>
  )
}
