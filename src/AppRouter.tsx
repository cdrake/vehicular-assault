import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import App from './App'
import Customize from './pages/Customize'
import VFX from './pages/VFX'
import { HavokSamplePage } from './pages/HavokSamplePage'

const AppRouter: React.FC = () => {
  return (
    <BrowserRouter basename="/vehicular-assault">
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/customize" element={<Customize />} />
        <Route path="/vfx" element={<VFX />} />
        <Route path="/havok" element={<HavokSamplePage/>} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRouter
