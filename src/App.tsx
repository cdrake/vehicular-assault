import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Race from './pages/Race'

export default function App() {
  return (
      <Routes>
        <Route path="/"      element={<Home  />} />
        <Route path="race"   element={<Race />} />
      </Routes>
  )
}
