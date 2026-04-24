import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  doc, 
  updateDoc, 
  arrayUnion, 
  orderBy 
} from 'firebase/firestore';

export default function Approvals() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSolicitudes = async () => {
      setLoading(true);
      try {
        // 1. Obtener el rol activo desde localStorage o el perfil
        const activeRole = localStorage.getItem('activeRole') || 'profesor';
        
        // 2. Traer todas las solicitudes pendientes
        const q = query(
          collection(db, 'solicitudes'), 
          where('estado', '==', 'pendiente'),
          orderBy('createdAt', 'asc')
        );
        const querySnapshot = await getDocs(q);
        const allSolicitudes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 3. Filtrar según jerarquía
        const filtered = allSolicitudes.filter(sol => {
          if (activeRole === 'admin') {
            return sol.rol === 'admin' || sol.rol === 'jefe_estudios';
          }
          if (activeRole === 'jefe_estudios') {
            return sol.rol === 'jefe_departamento';
          }
          if (activeRole === 'jefe_departamento') {
            return sol.rol === 'profesor';
          }
          return false;
        });

        setSolicitudes(filtered);
      } catch (error) {
        console.error("Error fetching solicitudes:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSolicitudes();
  }, []);

  const handleAction = async (solicitud, action) => {
    try {
      const solRef = doc(db, 'solicitudes', solicitud.id);
      
      if (action === 'accept') {
        const userRef = doc(db, 'usuarios', solicitud.userId);
        await updateDoc(userRef, {
          roles: arrayUnion({
            iesId: solicitud.iesId,
            iesNombre: solicitud.iesNombre,
            rol: solicitud.rol,
            estado: 'activo'
          })
        });
        await updateDoc(solRef, { estado: 'aceptada' });
      } else {
        await updateDoc(solRef, { estado: 'denegada' });
      }

      setSolicitudes(solicitudes.filter(s => s.id !== solicitud.id));
      alert(action === 'accept' ? 'Solicitud aceptada correctamente' : 'Solicitud denegada');
    } catch (error) {
      console.error("Error al procesar acción:", error);
      alert("Error al procesar la solicitud");
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando solicitudes...</div>;

  return (
    <div className="animate-fade-in">
      <h1 style={{ marginBottom: '2rem' }}>Cola de Aprobaciones</h1>
      
      {solicitudes.length === 0 ? (
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          No hay solicitudes pendientes para tu nivel de autoridad.
        </div>
      ) : (
        <div style={styles.list}>
          {solicitudes.map(sol => (
            <div key={sol.id} className="glass-panel" style={styles.card}>
              <div style={styles.info}>
                <h3 style={{ margin: 0 }}>{sol.userName}</h3>
                <p style={{ margin: '5px 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{sol.userEmail}</p>
                <div style={styles.badgeContainer}>
                  <span className={`role-theme-${sol.rol}`} style={styles.badge}>
                    Solicita: {sol.rol.replace('_', ' ').toUpperCase()}
                  </span>
                  <span style={styles.iesBadge}>{sol.iesNombre}</span>
                </div>
              </div>
              <div style={styles.actions}>
                <button 
                  className="btn-primary" 
                  style={{ backgroundColor: '#10b981' }} 
                  onClick={() => handleAction(sol, 'accept')}
                >
                  Aceptar
                </button>
                <button 
                  className="btn-primary" 
                  style={{ backgroundColor: '#ef4444' }} 
                  onClick={() => handleAction(sol, 'deny')}
                >
                  Denegar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  list: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  card: {
    padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem'
  },
  info: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  badgeContainer: { display: 'flex', gap: '10px', marginTop: '10px' },
  badge: {
    padding: '4px 12px', borderRadius: '50px', fontSize: '0.75rem', fontWeight: '700', color: 'white', backgroundColor: 'var(--active-role-color)'
  },
  iesBadge: {
    padding: '4px 12px', borderRadius: '50px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)'
  },
  actions: { display: 'flex', gap: '0.5rem' }
};
