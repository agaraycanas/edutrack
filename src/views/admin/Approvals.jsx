import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import Modal from '../../components/common/Modal';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  doc, 
  updateDoc, 
  addDoc,
  arrayUnion, 
  orderBy 
} from 'firebase/firestore';

export default function Approvals() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    const fetchSolicitudes = async () => {
      setLoading(true);
      try {
        const activeRole = localStorage.getItem('activeRole') || 'profesor';
        const activeIesId = localStorage.getItem('activeIesId');
        
        // 1. Traer todas las solicitudes pendientes
        const q = query(
          collection(db, 'solicitudes'), 
          where('estado', '==', 'pendiente')
        );
        const querySnapshot = await getDocs(q);
        const allSolicitudes = querySnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

        // 2. Traer staff activo del centro para verificar jerarquía
        let centerStaff = [];
        if (activeRole !== 'superadmin') {
          const staffQuery = query(
            collection(db, 'usuarios'),
            where('roles', 'array-contains-any', [
              { iesId: activeIesId, rol: 'admin', estado: 'activo' },
              { iesId: activeIesId, rol: 'jefe_estudios', estado: 'activo' },
              { iesId: activeIesId, rol: 'jefe_departamento', estado: 'activo' }
            ])
          );
          // Nota: array-contains-any con objetos exactos es difícil en Firestore.
          // Mejor traemos todos los usuarios que tengan roles y filtramos en memoria.
          const usersSnapshot = await getDocs(collection(db, 'usuarios'));
          centerStaff = usersSnapshot.docs
            .map(doc => doc.data())
            .filter(u => u.roles?.some(r => r.iesId === activeIesId && r.estado === 'activo'));
        }

        // 3. Filtrar según jerarquía inteligente
        const filtered = allSolicitudes.filter(sol => {
          if (activeRole === 'superadmin') return true;
          if (sol.iesId !== activeIesId) return false;

          // Jefe de Departamento: Solo ve a sus profesores
          if (activeRole === 'jefe_departamento') {
            const myDept = centerStaff.find(u => u.email === auth.currentUser.email)
              ?.roles?.find(r => r.rol === 'jefe_departamento' && r.iesId === activeIesId)?.departamento;
            return sol.rol === 'profesor' && sol.departamento === myDept;
          }

          // Jefe de Estudios:
          if (activeRole === 'jefe_estudios') {
            // Ve jefes de departamento
            if (sol.rol === 'jefe_departamento') return true;
            
            // Ve profesores SI no hay jefe de departamento para ese dept
            if (sol.rol === 'profesor') {
              const hasJefeDept = centerStaff.some(u => 
                u.roles?.some(r => r.rol === 'jefe_departamento' && r.iesId === activeIesId && r.departamento === sol.departamento && r.estado === 'activo')
              );
              return !hasJefeDept;
            }
          }

          // Admin:
          if (activeRole === 'admin') {
            // Ve jefes de estudios
            if (sol.rol === 'jefe_estudios') return true;
            
            // Ve jefes de departamento SI no hay jefe de estudios
            if (sol.rol === 'jefe_departamento') {
              const hasJefeEstudios = centerStaff.some(u => 
                u.roles?.some(r => r.rol === 'jefe_estudios' && r.iesId === activeIesId && r.estado === 'activo')
              );
              return !hasJefeEstudios;
            }

            // Ve profesores SI no hay jefe de estudios Y no hay jefe de departamento para ese dept
            if (sol.rol === 'profesor') {
              const hasJefeEstudios = centerStaff.some(u => 
                u.roles?.some(r => r.rol === 'jefe_estudios' && r.iesId === activeIesId && r.estado === 'activo')
              );
              const hasJefeDept = centerStaff.some(u => 
                u.roles?.some(r => r.rol === 'jefe_departamento' && r.iesId === activeIesId && r.departamento === sol.departamento && r.estado === 'activo')
              );
              return !hasJefeEstudios && !hasJefeDept;
            }
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
            departamento: solicitud.departamento || null,
            estado: 'activo'
          })
        });
        await updateDoc(solRef, { estado: 'aceptada' });

        // Enviar correo de notificación
        await addDoc(collection(db, 'mail'), {
          to: solicitud.userEmail,
          message: {
            subject: '¡Tu acceso a EduTrack ha sido aprobado!',
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2>Hola ${solicitud.userName},</h2>
                <p>Nos complace informarte que tu solicitud para el rol de <b>${solicitud.rol.replace('_', ' ')}</b> ${solicitud.departamento ? `en el departamento de <b>${solicitud.departamento}</b>` : ''} en el centro <b>${solicitud.iesNombre}</b> ha sido aprobada.</p>
                <p>Ya puedes acceder a la plataforma y comenzar a utilizar todas las funciones disponibles para tu perfil.</p>
                <div style="margin: 30px 0;">
                  <a href="${window.location.origin}/login" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Acceder a EduTrack</a>
                </div>
                <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
                <p>${window.location.origin}/login</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #777;">Este es un correo automático, por favor no respondas a este mensaje.</p>
              </div>
            `
          }
        });
      } else {
        await updateDoc(solRef, { estado: 'denegada' });
      }

      setSolicitudes(solicitudes.filter(s => s.id !== solicitud.id));
      setModal({
        isOpen: true,
        title: action === 'accept' ? 'Solicitud Aprobada' : 'Solicitud Denegada',
        message: action === 'accept' 
          ? `Se ha activado el acceso para ${solicitud.userName} y se le ha enviado un correo de confirmación.`
          : `La solicitud de ${solicitud.userName} ha sido denegada.`
      });
    } catch (error) {
      console.error("Error al procesar acción:", error);
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'Hubo un problema al procesar la solicitud. Por favor, inténtalo de nuevo.'
      });
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
                    {sol.rol.replace('_', ' ').toUpperCase()}
                  </span>
                  {sol.departamento && (
                    <span style={styles.deptBadge}>
                      DEPT: {sol.departamento.toUpperCase()}
                    </span>
                  )}
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

      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
      >
        <p>{modal.message}</p>
      </Modal>
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
  deptBadge: {
    padding: '4px 12px', borderRadius: '50px', fontSize: '0.75rem', fontWeight: '700', color: 'var(--accent-secondary)', backgroundColor: 'rgba(99, 102, 241, 0.1)', border: '1px solid var(--accent-secondary)'
  },
  actions: { display: 'flex', gap: '0.5rem' }
};
