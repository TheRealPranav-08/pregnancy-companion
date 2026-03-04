import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Guidance from './pages/Guidance'
import MoodCheck from './pages/MoodCheck'
import KickTracker from './pages/KickTracker'
import Journal from './pages/Journal'
import './index.css'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/guidance" element={<Guidance />} />
            <Route path="/mood" element={<MoodCheck />} />
            <Route path="/kicks" element={<KickTracker />} />
            <Route path="/journal" element={<Journal />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
