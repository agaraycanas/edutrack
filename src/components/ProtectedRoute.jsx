import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export function ProtectedRoute({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        setUser(currentUser);
        if (currentUser) {
          const docRef = doc(db, 'usuarios', currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserProfile(docSnap.data());
          } else {
            setUserProfile(null);
          }
        }
      } catch (error) {
        console.error("Error al cargar perfil en ProtectedRoute:", error);
      } finally {
        setLoading(false);
      }
    });
    
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        backgroundColor: 'var(--bg-color)',
        gap: '1rem'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: 'var(--accent-primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <h2 style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: '400' }}>Cargando EduTrack...</h2>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Si está en /register no hacemos nada más
  if (location.pathname === '/register') {
    return children;
  }

  // Si no tiene perfil, le mandamos a registrarse
  if (!userProfile) {
    return <Navigate to="/register" replace />;
  }

  // Verificar si tiene al menos un rol ACTIVO
  const hasActiveRole = userProfile.roles?.some(role => role.estado === 'activo');
  
  // Si no tiene ningún rol activo y no está en /register, redirigir a /register
  // donde se le mostrará el estado de "Pendiente" o el formulario
  if (!hasActiveRole && location.pathname !== '/register') {
    return <Navigate to="/register" replace />;
  }

  return children;
}
