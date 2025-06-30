import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import App from './App'
import Customize from './pages/Customize'

const AppRouter: React.FC = () => {
  return (
    <BrowserRouter basename="/vehicular-assault">
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/customize" element={<Customize />} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRouter
