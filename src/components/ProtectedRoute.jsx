import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export function ProtectedRoute({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [domainError, setDomainError] = useState(false);
  const location = useLocation();

  const ALLOWED_DOMAIN = '@educa.madrid.org';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          // Validar dominio
          if (currentUser.email && !currentUser.email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
            console.warn("Intento de acceso con dominio no permitido:", currentUser.email);
            await signOut(auth);
            setDomainError(true);
            setLoading(false);
            return;
          }

          setUser(currentUser);
          const docRef = doc(db, 'usuarios', currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserProfile(docSnap.data());
          } else {
            setUserProfile(null);
          }
        } else {
          setUser(null);
          setUserProfile(null);
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
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        color: '#64748b',
        fontWeight: '500'
      }}>
        Cargando EduTrack...
      </div>
    );
  }

  if (domainError) {
    return <Navigate to="/login" state={{ from: location, error: 'dominio' }} replace />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Si no hay perfil en Firestore, obligamos a pasar por registro/completar perfil si no está ya allí
  // Nota: Deberíamos tener una ruta de "espera de aprobación" o "registro"
  if (!userProfile && location.pathname !== '/register' && location.pathname !== '/onboarding') {
    // Si no tiene perfil, es que se acaba de registrar con Firebase pero no ha completado el proceso de EduTrack
    // O está esperando aprobación del primer rol.
    // Para simplificar, si no hay perfil lo mandamos a login para que se registre o reintente
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
