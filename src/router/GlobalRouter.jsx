import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from '../views/auth/Login'
import Home from '../views/dashboard/Home'
import Register from '../views/auth/Register'
import Approvals from '../views/management/Approvals'
import Users from '../views/management/Users'
import AcademicYears from '../views/management/AcademicYears'
import Departments from '../views/management/Departments'
import Studies from '../views/management/Studies'
import Groups from '../views/management/Groups'
import Subjects from '../views/management/Subjects'
import TeachingAssignments from '../views/management/TeachingAssignments'
import DashboardLayout from '../layouts/DashboardLayout'
import { ProtectedRoute } from '../components/ProtectedRoute'

export function GlobalRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Dashboard Routes with Shared Layout */}
        <Route element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route path="/home" element={<Home />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/users" element={<Users />} />
          <Route path="/academic-years" element={<AcademicYears />} />
          <Route path="/departments" element={<Departments />} />
          <Route path="/studies" element={<Studies />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/subjects" element={<Subjects />} />
          <Route path="/teaching-assignments" element={<TeachingAssignments />} />
        </Route>

        <Route path="/register" element={
          <ProtectedRoute>
            <Register />
          </ProtectedRoute>
        } />

        <Route path="/" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
