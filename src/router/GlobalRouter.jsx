import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from '../views/auth/Login'
import Home from '../views/dashboard/Home'
import Register from '../views/auth/Register'
import Approvals from '../views/admin/Approvals'
import DashboardLayout from '../layouts/DashboardLayout'
import { ProtectedRoute } from '../components/ProtectedRoute'

export function GlobalRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={
          <ProtectedRoute>
            <Register />
          </ProtectedRoute>
        } />
        <Route path="/home" element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        } />
        <Route path="/approvals" element={
          <ProtectedRoute>
            <DashboardLayout>
               <Approvals />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        <Route path="/" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
