import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import Modal from '../../components/common/Modal';
import { 
  collection, 
  getDocs, 
  getDoc,
  doc, 
  updateDoc, 
  query, 
  where,
  arrayUnion
} from 'firebase/firestore';

const RANKS = {
  superadmin: 100,
  jefe_estudios: 80,
  jefe_departamento: 60,
  profesor: 40,
  // alumno: 20
};

const ROLE_LABELS = {
  superadmin: 'Súperadmin',
  jefe_estudios: 'Jefe de Estudios',
  jefe_departamento: 'Jefe de Depto.',
  profesor: 'Profesor',
  // alumno: 'Alumno' (removed to hide from UI)
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIes, setCurrentIes] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '' });
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  
  const [deptModal, setDeptModal] = useState({ isOpen: false, user: null, newDept: '' });
  const [filterRole, setFilterRole] = useState('all');
  const [filterText, setFilterText] = useState('');
  
  const activeRole = localStorage.getItem('activeRole') || 'profesor';
  const activeIesId = localStorage.getItem('activeIesId');
  const myRank = RANKS[activeRole] || 0;

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (activeIesId) {
          const iesSnap = await getDoc(doc(db, 'ies', activeIesId));
          if (iesSnap.exists()) setCurrentIes(iesSnap.data());
          
          const deptsSnap = await getDocs(query(collection(db, 'departamentos'), where('iesId', '==', activeIesId)));
          const deptsList = deptsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          deptsList.sort((a, b) => a.nombre.localeCompare(b.nombre));
          setDepartments(deptsList);
        }

        let q;
        if (activeRole === 'superadmin') {
          q = collection(db, 'usuarios');
        } else {
          q = query(collection(db, 'usuarios'), where('iesIds', 'array-contains', activeIesId));
        }

        const querySnapshot = await getDocs(q);
        const allUsers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const filtered = allUsers.filter(u => {
          if (activeRole === 'superadmin') return true;
          if (u.email === currentUser?.email) return true; // Siempre verse a uno mismo

          const userRolesInIes = u.roles?.filter(r => r.iesId === activeIesId) || [];
          if (userRolesInIes.length === 0) return false;

          const userMaxRank = Math.max(...userRolesInIes.map(r => RANKS[r.rol] || 0));
          
          // Solo ver usuarios con rango inferior al mío
          return userMaxRank < myRank;
        });

        setUsers(filtered);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeRole, activeIesId, currentUser, myRank]);

  const toggleRole = async (user, roleKey) => {
    const targetRank = RANKS[roleKey];
    
    if (targetRank > myRank && activeRole !== 'superadmin') {
      setModal({
        isOpen: true,
        title: 'Acción no permitida',
        message: 'No puedes asignar roles con un nivel de autoridad superior al tuyo.'
      });
      return;
    }

    const isMe = user.email === currentUser?.email;
    if (isMe) {
      const myMaxRole = user.roles
        .filter(r => r.iesId === activeIesId && r.estado === 'activo' && r.rol?.toLowerCase() !== 'alumno')
        .reduce((max, r) => (RANKS[r.rol] || 0) > (RANKS[max] || 0) ? r.rol : max, 'profesor');
      
      if (roleKey === myMaxRole && user.roles.some(r => r.rol === roleKey && r.iesId === activeIesId)) {
        setModal({
          isOpen: true,
          title: 'Acción no permitida',
          message: 'No puedes eliminar tu rol de mayor autoridad.'
        });
        return;
      }
    }

    try {
      const userRef = doc(db, 'usuarios', user.id);
      let newRoles = [...(user.roles || [])];
      
      const existingRoleIndex = newRoles.findIndex(r => r.rol === roleKey && r.iesId === activeIesId);
      
      if (existingRoleIndex > -1) {
        newRoles.splice(existingRoleIndex, 1);
      } else {
        const iesNombre = user.roles?.find(r => r.iesId === activeIesId)?.iesNombre || currentIes?.nombre || 'IES';
        const currentDept = user.roles?.find(r => r.iesId === activeIesId && r.departamento)?.departamento || null;

        newRoles.push({
          iesId: activeIesId,
          iesNombre,
          rol: roleKey,
          departamento: currentDept,
          estado: 'activo'
        });
      }

      await updateDoc(userRef, { 
        roles: newRoles,
        iesIds: arrayUnion(activeIesId)
      });
      
      setUsers(users.map(u => u.id === user.id ? { ...u, roles: newRoles } : u));
    } catch (error) {
      console.error("Error updating roles:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudieron actualizar los roles.' });
    }
  };

  const checkUserActivity = async (userId, dept) => {
    // TODO: Implementar cuando existan las colecciones de grupos, horarios, faltas, etc.
    // De momento devolvemos false para permitir el cambio, pero dejamos el aviso.
    console.log(`Checking activity for ${userId} in ${dept}`);
    return false; 
  };

  const handleDeptEditRequest = async (user) => {
    const userDept = user.roles?.find(r => r.iesId === activeIesId)?.departamento || '';
    setDeptModal({ isOpen: true, user, newDept: userDept });
  };

  const executeDeptChange = async () => {
    const { user, newDept } = deptModal;
    if (!user) return;

    try {
      const userRef = doc(db, 'usuarios', user.id);
      const newRoles = user.roles.map(r => {
        if (r.iesId === activeIesId) {
          return { ...r, departamento: newDept };
        }
        return r;
      });

      await updateDoc(userRef, { roles: newRoles });
      setUsers(users.map(u => u.id === user.id ? { ...u, roles: newRoles } : u));
      setDeptModal({ isOpen: false, user: null, newDept: '' });
      setModal({ isOpen: true, title: 'Éxito', message: 'Departamento actualizado correctamente.' });
    } catch (error) {
      console.error("Error updating department:", error);
      setModal({ isOpen: true, title: 'Error', message: 'No se pudo actualizar el departamento.' });
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando datos...</div>;

  // 1. Filtrado
  const filteredUsers = users.filter(u => {
    // Filtro de Rol
    if (filterRole !== 'all') {
      const hasRole = u.roles?.some(r => r.rol === filterRole && r.iesId === activeIesId);
      if (!hasRole) return false;
    }

    // Filtro de Texto (nombre, apellidos, email, departamento)
    if (filterText.trim()) {
      const search = filterText.toLowerCase();
      const userDept = (u.roles?.find(r => r.iesId === activeIesId)?.departamento || '').toLowerCase();
      const matchesText = 
        (u.nombre || '').toLowerCase().includes(search) ||
        (u.apellidos || '').toLowerCase().includes(search) ||
        (u.email || '').toLowerCase().includes(search) ||
        userDept.includes(search);
      
      if (!matchesText) return false;
    }

    return true;
  });

  // 2. Ordenación
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const myEmail = currentUser?.email;
    const isMeA = a.email === myEmail;
    const isMeB = b.email === myEmail;
    
    if (isMeA) return -1;
    if (isMeB) return 1;
    
    const apellidosA = (a.apellidos || '').toLowerCase();
    const apellidosB = (b.apellidos || '').toLowerCase();
    if (apellidosA !== apellidosB) return apellidosA.localeCompare(apellidosB);
    
    const nombreA = (a.nombre || '').toLowerCase();
    const nombreB = (b.nombre || '').toLowerCase();
    return nombreA.localeCompare(nombreB);
  });

  return (
    <div className="animate-fade-in" style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
      <style>{`
        .user-avatar-zoom {
          transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .user-avatar-zoom:hover {
          transform: scale(1.15);
          border-color: var(--accent-primary) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          z-index: 10;
        }
      `}</style>
      <h1 style={{ marginBottom: '1.5rem' }}>Gestión de Usuarios</h1>

      {/* Barra de Filtros */}
      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Filtrar por Rol:</label>
          <select 
            className="input-field" 
            style={styles.filterSelect}
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="all">Todos los roles</option>
            {Object.entries(ROLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Buscar usuario:</label>
          <div style={{ position: 'relative', flex: 1 }}>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Nombre, email, depto..." 
              style={styles.filterInput}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            {filterText && (
              <button 
                onClick={() => setFilterText('')}
                style={styles.clearBtn}
                title="Limpiar búsqueda"
              >
                ×
              </button>
            )}
          </div>
        </div>
        
        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', paddingBottom: '5px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {sortedUsers.length} {sortedUsers.length === 1 ? 'usuario encontrado' : 'usuarios encontrados'}
        </div>
      </div>
      
      <div className="glass-panel" style={{ width: '100%', overflow: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: '60px' }}>Foto</th>
              <th style={styles.th}>Nombre</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Departamento</th>
              {Object.keys(ROLE_LABELS).map(roleKey => (
                <th key={roleKey} style={{...styles.th, textAlign: 'center'}}>{ROLE_LABELS[roleKey]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map(user => {
              const userDept = user.roles?.find(r => r.iesId === activeIesId)?.departamento || '';
              const canEditDept = activeRole === 'superadmin' || activeRole === 'jefe_estudios';
              const isMe = user.email === currentUser?.email;
              
              return (
                <tr key={user.id} style={{ ...styles.tr, backgroundColor: isMe ? 'rgba(99, 102, 241, 0.1)' : 'transparent' }}>
                  <td style={styles.td}>
                    <img 
                      src={user.foto || user.avatar || 'https://via.placeholder.com/48'} 
                      className="user-avatar-zoom"
                      style={styles.miniAvatar} 
                      alt="" 
                      onClick={() => setModal({
                        isOpen: true,
                        title: `Foto de ${user.nombre}`,
                        message: <div style={{ textAlign: 'center' }}><img src={user.foto || user.avatar || 'https://via.placeholder.com/200'} style={{ width: '250px', height: '250px', borderRadius: '20px', objectFit: 'cover', border: '4px solid var(--border-color)' }} /></div>
                      })}
                    />
                  </td>
                  <td style={{ ...styles.td, fontWeight: isMe ? '700' : '400' }}>
                    {user.apellidos}, {user.nombre} {isMe && <span style={{ color: 'var(--accent-primary)', fontSize: '0.7rem' }}>(TÚ)</span>}
                  </td>
                  <td style={{ ...styles.td, color: 'var(--text-secondary)', fontSize: '0.85rem' }} title={user.email}>
                    {user.email?.includes('@educa.madrid.org') ? (
                      <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                        {user.email.split('@')[0]}
                      </span>
                    ) : (
                      <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                        {user.email}
                      </span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <span style={{ fontSize: '0.9rem', color: userDept ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {userDept || 'Sin departamento'}
                      </span>
                      {canEditDept && (
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button 
                            onClick={() => handleDeptEditRequest(user)} 
                            className="btn-icon" 
                            title="Editar"
                            style={{ borderRadius: '8px' }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  {Object.keys(ROLE_LABELS).map(roleKey => {
                    const hasRole = user.roles?.some(r => r.rol === roleKey && r.iesId === activeIesId);
                    const canToggle = (RANKS[roleKey] <= myRank || activeRole === 'superadmin');
                    
                    return (
                      <td key={roleKey} style={{...styles.td, textAlign: 'center'}}>
                        <input 
                          type="checkbox" 
                          checked={hasRole}
                          disabled={!canToggle}
                          onChange={() => toggleRole(user, roleKey)}
                          style={styles.checkbox}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal General */}
      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
      >
        {typeof modal.message === 'string' ? <p>{modal.message}</p> : modal.message}
      </Modal>

      {/* Modal de Cambio de Departamento */}
      <Modal
        isOpen={deptModal.isOpen}
        onClose={() => setDeptModal({ ...deptModal, isOpen: false })}
        title="Cambiar Departamento"
        footer={
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              className="btn-primary" 
              style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
              onClick={() => setDeptModal({ ...deptModal, isOpen: false })}
            >
              Cancelar
            </button>
            <button 
              className="btn-primary" 
              style={{ background: 'var(--accent-primary)' }}
              onClick={executeDeptChange}
            >
              Confirmar Cambio
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '8px' }}>
            <p style={{ color: '#ef4444', fontWeight: '700', marginBottom: '0.5rem' }}>⚠️ AVISO IMPORTANTE</p>
            <p style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>
              Cambiar el departamento de un profesor es una acción crítica. Si el profesor ya tiene datos asociados (clases, horarios, faltas) en su departamento actual, estos podrían quedar huérfanos o causar inconsistencias.
            </p>
          </div>
          
          <div>
            <p style={{ marginBottom: '1rem', fontWeight: '600' }}>
              Usuario: <span style={{ color: 'var(--accent-primary)' }}>{deptModal.user?.nombre} {deptModal.user?.apellidos}</span>
            </p>
            
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Selecciona el nuevo departamento:
            </label>
            <select 
              className="input-field"
              value={deptModal.newDept}
              onChange={(e) => setDeptModal({ ...deptModal, newDept: e.target.value })}
            >
              <option value="">Sin departamento</option>
              {departments.map(d => (
                <option key={d.id} value={d.nombre}>{d.nombre}</option>
              ))}
            </select>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            * El sistema verificará automáticamente si el profesor tiene actividad antes de permitir cambios permanentes en futuras versiones.
          </p>
        </div>
      </Modal>
    </div>
  );
}

const styles = {
  table: { width: '100%', borderCollapse: 'collapse', minWidth: '600px' },
  th: { padding: '0.8rem 0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', position: 'sticky', top: 0, backgroundColor: 'var(--surface-color)', zIndex: 10, boxShadow: '0 1px 0 var(--border-color)' },
  td: { padding: '0.8rem 0.5rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem' },
  tr: { transition: 'background 0.2s' },
  miniAvatar: { width: '48px', height: '48px', borderRadius: '12px', objectFit: 'cover', border: '2px solid var(--border-color)', transition: 'transform 0.2s ease, border-color 0.2s ease', cursor: 'pointer' },
  checkbox: { width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--active-role-color)' },
  editBtn: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s'
  },
  filterBar: {
    display: 'flex',
    gap: '2rem',
    marginBottom: '1.5rem',
    padding: '1.2rem',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '16px',
    border: '1px solid var(--border-color)',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    minWidth: '200px'
  },
  filterLabel: {
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)'
  },
  filterSelect: {
    padding: '8px 12px',
    fontSize: '0.9rem',
    background: 'var(--surface-color)',
    borderRadius: '10px'
  },
  filterInput: {
    padding: '8px 12px',
    paddingRight: '30px',
    fontSize: '0.9rem',
    background: 'var(--surface-color)',
    borderRadius: '10px',
    width: '100%'
  },
  clearBtn: {
    position: 'absolute',
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '1.2rem',
    cursor: 'pointer',
    padding: '0 4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
    transition: 'opacity 0.2s'
  }
};
