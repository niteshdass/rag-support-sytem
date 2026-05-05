import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute() {
  const { isAuthed, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isAuthed) return <Navigate to="/login" replace />;
  return <Outlet />;
}
