import { Routes, Route, Outlet } from "react-router-dom"
import Home from "./pages/Home"
import Race from "./pages/Race"

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Outlet />}>
        <Route index element={<Home />} />
        <Route path="race" element={<Race />} />
      </Route>
    </Routes>
  )
}
