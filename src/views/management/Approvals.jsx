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
        
        // 1. Traer solicitudes según permisos
        let q;
        if (activeRole === 'superadmin') {
          q = query(
            collection(db, 'solicitudes'), 
            where('estado', '==', 'pendiente')
          );
        } else {
          q = query(
            collection(db, 'solicitudes'), 
            where('estado', '==', 'pendiente'),
            where('iesId', '==', activeIesId)
          );
        }
        
        const querySnapshot = await getDocs(q);
        const allSolicitudes = querySnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

        // 2. Traer staff activo del centro para verificar jerarquía
        let centerStaff = [];
        if (activeRole !== 'superadmin') {
          const staffQuery = query(
            collection(db, 'usuarios'),
            where('iesIds', 'array-contains', activeIesId)
          );
          const usersSnapshot = await getDocs(staffQuery);
          centerStaff = usersSnapshot.docs
            .map(doc => doc.data())
            .filter(u => u.roles?.some(r => r.iesId === activeIesId && r.estado === 'activo'));
        }

        // 3. Filtrar según jerarquía inteligente
        const filtered = allSolicitudes.filter(sol => {
          if (sol.rol?.toLowerCase() === 'alumno') return false;
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
        const roleLabel = roleLabels[solicitud.rol] || solicitud.rol;

        await updateDoc(userRef, {
          roles: arrayUnion({
            iesId: solicitud.iesId,
            iesNombre: solicitud.iesNombre,
            rol: solicitud.rol,
            departamento: solicitud.departamento || null,
            estado: 'activo'
          }),
          iesIds: arrayUnion(solicitud.iesId)
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
                <p>Nos complace informarte que tu solicitud para el rol de <b>${roleLabel}</b> ${solicitud.departamento ? `en el departamento de <b>${solicitud.departamento}</b>` : ''} en el centro <b>${solicitud.iesNombre}</b> ha sido aprobada.</p>
                <p>Ya puedes acceder a la plataforma y comenzar a utilizar todas las funciones disponibles para tu perfil.</p>
                <div style="margin: 30px 0;">
                  <a href="https://edutrack-803e0.firebaseapp.com/login" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Acceder a EduTrack</a>
                </div>
                <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
                <p>https://edutrack-803e0.firebaseapp.com/login</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #777;">Este es un correo automático, por favor no respondas a este mensaje.</p>
              </div>
            `
          }
        });
      } else {
        await updateDoc(solRef, { estado: 'denegada' });
        
        // Enviar correo de notificación de denegación
        await addDoc(collection(db, 'mail'), {
          to: solicitud.userEmail,
          message: {
            subject: 'Estado de tu solicitud en EduTrack',
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2>Hola ${solicitud.userName},</h2>
                <p>Lamentamos informarte que tu solicitud de acceso a la plataforma <b>EduTrack</b> ha sido denegada por los responsables del centro.</p>
                <p>Si crees que esto se trata de un error, por favor ponte en contacto con la jefatura de estudios de tu centro educativo.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #777;">Este es un correo automático, por favor no respondas a este mensaje.</p>
              </div>
            `
          }
        });
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
        <div style={{ overflowY: 'auto', maxHeight: '70vh' }}>
          <div style={styles.list}>
          {solicitudes.map(sol => (
            <div key={sol.id} className="glass-panel" style={styles.card}>
              <div style={{ ...styles.info, flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sol.userName}
                </h3>
                <p style={{ margin: '5px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sol.userEmail}
                </p>
                <div style={{ ...styles.badgeContainer, flexWrap: 'wrap' }}>
                  <span className={`role-theme-${sol.rol}`} style={styles.badge}>
                    {(roleLabels[sol.rol] || sol.rol).toUpperCase()}
                  </span>
                  {sol.departamento && (
                    <span style={styles.deptBadge}>
                      DEPT: {sol.departamento.toUpperCase()}
                    </span>
                  )}
                  <span style={styles.iesBadge}>{sol.iesNombre}</span>
                </div>
              </div>
              <div style={{ ...styles.actions, flexShrink: 0 }}>
                <button 
                  className="btn-primary" 
                  style={{ 
                    background: '#10b981', 
                    padding: '0.5rem 1rem', 
                    fontSize: '0.85rem',
                    minWidth: '90px'
                  }} 
                  onClick={() => handleAction(sol, 'accept')}
                >
                  Aceptar
                </button>
                <button 
                  className="btn-primary" 
                  style={{ 
                    background: '#ef4444', 
                    padding: '0.5rem 1rem', 
                    fontSize: '0.85rem',
                    minWidth: '90px'
                  }} 
                  onClick={() => handleAction(sol, 'deny')}
                >
                  Denegar
                </button>
              </div>
            </div>
          ))}
          </div>
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

const roleLabels = {
  superadmin: 'Súperadmin',
  jefe_estudios: 'Jefe de Estudios',
  jefe_departamento: 'Jefe de Depto.',
  profesor: 'Profesor',
  // alumno: 'Alumno'
};

const styles = {
  list: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  card: {
    padding: '1.5rem', 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    gap: '1.5rem',
    flexWrap: 'wrap'
  },
  info: { 
    display: 'flex', 
    flexDirection: 'column', 
    gap: '0.2rem',
    flex: '1 1 300px',
    minWidth: 0
  },
  badgeContainer: { 
    display: 'flex', 
    gap: '10px', 
    marginTop: '10px',
    flexWrap: 'wrap'
  },
  badge: {
    padding: '4px 12px', borderRadius: '50px', fontSize: '0.7rem', fontWeight: '700', color: 'white', backgroundColor: 'var(--active-role-color)', whiteSpace: 'nowrap'
  },
  iesBadge: {
    padding: '4px 12px', borderRadius: '50px', fontSize: '0.7rem', fontWeight: '600', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', whiteSpace: 'nowrap'
  },
  deptBadge: {
    padding: '4px 12px', borderRadius: '50px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--accent-secondary)', backgroundColor: 'rgba(99, 102, 241, 0.1)', border: '1px solid var(--accent-secondary)', whiteSpace: 'nowrap'
  },
  actions: { 
    display: 'flex', 
    gap: '0.75rem',
    flex: '0 0 auto'
  }
};
