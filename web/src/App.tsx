import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import Activity from './pages/Activity'
import Chat from './pages/Chat'
import Dashboard from './pages/Dashboard'
import DocumentDetail from './pages/DocumentDetail'
import Documents from './pages/Documents'
import Login from './pages/Login'
import Settings from './pages/Settings'
import Sources from './pages/Sources'
import Paste from './pages/Paste'
import Upload from './pages/Upload'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/documents/:id" element={<DocumentDetail />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/paste" element={<Paste />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
