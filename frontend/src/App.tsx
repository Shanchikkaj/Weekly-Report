import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ProtectedRoute, RoleRoute, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ReportList } from './pages/ReportList';
import { ReportForm } from './pages/ReportForm';
import { ReportDetail } from './pages/ReportDetail';
import { ManagerDashboard } from './pages/ManagerDashboard';
import { ManagerReview } from './pages/ManagerReview';
import { MemberProfile } from './pages/MemberProfile';
import { ProjectManagement } from './pages/ProjectManagement';
import { UserManagement } from './pages/UserManagement';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas flex flex-col text-primary">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  if (user?.role === 'manager') {
    return <Navigate to="/manager/dashboard" replace />;
  }
  return <Navigate to="/reports" replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Team Member & Core Pages */}
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <ReportList />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/reports/new"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <ReportForm />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/reports/:id"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <ReportDetail />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/reports/:id/edit"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <ReportForm />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Manager Protected Routes */}
          <Route
            path="/manager/dashboard"
            element={
              <RoleRoute allowedRoles={['manager']}>
                <AppLayout>
                  <ManagerDashboard />
                </AppLayout>
              </RoleRoute>
            }
          />

          <Route
            path="/manager/review/:id"
            element={
              <RoleRoute allowedRoles={['manager']}>
                <AppLayout>
                  <ManagerReview />
                </AppLayout>
              </RoleRoute>
            }
          />

          <Route
            path="/manager/members/:userId"
            element={
              <RoleRoute allowedRoles={['manager']}>
                <AppLayout>
                  <MemberProfile />
                </AppLayout>
              </RoleRoute>
            }
          />

          <Route
            path="/manager/projects"
            element={
              <RoleRoute allowedRoles={['manager']}>
                <AppLayout>
                  <ProjectManagement />
                </AppLayout>
              </RoleRoute>
            }
          />

          <Route
            path="/manager/users"
            element={
              <RoleRoute allowedRoles={['manager']}>
                <AppLayout>
                  <UserManagement />
                </AppLayout>
              </RoleRoute>
            }
          />

          {/* Fallback & Redirection */}
          <Route path="/" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
