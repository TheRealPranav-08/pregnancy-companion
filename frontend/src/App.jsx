import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Guidance from './pages/Guidance'
import MoodCheck from './pages/MoodCheck'
import KickTracker from './pages/KickTracker'
import Journal from './pages/Journal'
import Login from './pages/Login'
import Signup from './pages/Signup'
import StageSelect from './pages/StageSelect'
import PostnatalCare from './pages/PostnatalCare'
import AuraChat from './pages/AuraChat'
import './index.css'

function AppLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const hideNavbar = ['/login', '/signup', '/stage-select'].includes(location.pathname)
  return (
    <div className="app-layout">
      {user && !hideNavbar && <Navbar />}
      <main className="main-content" style={hideNavbar ? { marginLeft: 0, maxWidth: '100%' } : undefined}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/stage-select" element={<ProtectedRoute><StageSelect /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/guidance" element={<ProtectedRoute><Guidance /></ProtectedRoute>} />
          <Route path="/mood" element={<ProtectedRoute><MoodCheck /></ProtectedRoute>} />
          <Route path="/kicks" element={<ProtectedRoute><KickTracker /></ProtectedRoute>} />
          <Route path="/journal" element={<ProtectedRoute><Journal /></ProtectedRoute>} />
          <Route path="/postnatal" element={<ProtectedRoute><PostnatalCare /></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><AuraChat /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </BrowserRouter>
  )
}
