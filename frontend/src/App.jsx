import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import LeadsList from './pages/LeadsList.jsx'
import LeadDetail from './pages/LeadDetail.jsx'
import Campaigns from './pages/Campaigns.jsx'
import Templates from './pages/Templates.jsx'
import Analytics from './pages/Analytics.jsx'
import Import from './pages/Import.jsx'
import Duplicates from './pages/Duplicates.jsx'
import MyTasks from './pages/MyTasks.jsx'

function Shell({ children }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <TopBar />
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Shell>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/leads" element={<LeadsList />} />
                <Route path="/leads/:id" element={<LeadDetail />} />
                <Route path="/campaigns" element={<Campaigns />} />
                <Route path="/templates" element={<Templates />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/import" element={<Import />} />
                <Route path="/duplicates" element={<Duplicates />} />
                <Route path="/my-tasks" element={<MyTasks />} />
              </Routes>
            </Shell>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
