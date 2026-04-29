import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, getDocs, updateDoc } from 'firebase/firestore';
import { useNavigate, Link, Outlet } from 'react-router-dom';
import ProfileModal from '../components/common/ProfileModal';

export default function DashboardLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [activeRole, setActiveRole] = useState(localStorage.getItem('activeRole') || 'profesor');
  const navigate = useNavigate();

  const [pendingCount, setPendingCount] = useState(0);
  const [centerStaff, setCenterStaff] = useState([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const fetchProfile = async () => {
    if (auth.currentUser) {
      const docSnap = await getDoc(doc(db, 'usuarios', auth.currentUser.uid));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserProfile(data);
        // Si el rol activo no está en sus roles, poner el primero disponible o profesor por defecto
        if (data.roles && data.roles.length > 0 && !data.roles.some(r => r.rol === activeRole)) {
          const firstRole = data.roles[0];
          setActiveRole(firstRole.rol);
          localStorage.setItem('activeRole', firstRole.rol);
          localStorage.setItem('activeIesId', firstRole.iesId);
        } else if (data.roles && data.roles.length > 0) {
          // Migración: Si no tiene iesIds, lo creamos a partir de sus roles
          if (!data.iesIds && data.roles) {
            const ids = [...new Set(data.roles.map(r => r.iesId))].filter(Boolean);
            await updateDoc(doc(db, 'usuarios', auth.currentUser.uid), { iesIds: ids });
            data.iesIds = ids;
          }

          const currentRoleData = data.roles.find(r => r.rol === activeRole);
          if (currentRoleData) {
            localStorage.setItem('activeIesId', currentRoleData.iesId);
          }
        }
      }
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [activeRole]);

  // Listener para el staff del centro (necesario para la jerarquía de la badge)
  useEffect(() => {
    if (!auth.currentUser || activeRole === 'profesor' || activeRole === 'superadmin') {
      setCenterStaff([]);
      return;
    }

    const activeIesId = localStorage.getItem('activeIesId');
    const q = query(
      collection(db, 'usuarios'),
      where('iesIds', 'array-contains', activeIesId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const staff = snapshot.docs
        .map(doc => doc.data())
        .filter(u => u.roles?.some(r => r.iesId === activeIesId && r.estado === 'activo'));
      setCenterStaff(staff);
    });

    return () => unsubscribe();
  }, [activeRole]);

  // Listener para solicitudes
  useEffect(() => {
    if (!auth.currentUser || activeRole === 'profesor') {
      setPendingCount(0);
      return;
    }

    const activeIesId = localStorage.getItem('activeIesId');
    let q;
    if (activeRole === 'superadmin') {
      q = query(collection(db, 'solicitudes'), where('estado', '==', 'pendiente'));
    } else {
      q = query(
        collection(db, 'solicitudes'),
        where('estado', '==', 'pendiente'),
        where('iesId', '==', activeIesId)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allSols = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const filtered = allSols.filter(sol => {
        if (activeRole === 'superadmin') return true;
        
        // Jefe de Departamento: Solo ve a sus profesores
        if (activeRole === 'jefe_departamento') {
          const myDept = userProfile?.roles?.find(r => r.rol === 'jefe_departamento' && r.iesId === activeIesId)?.departamento;
          return sol.rol === 'profesor' && sol.departamento === myDept;
        }

        // Jefe de Estudios:
        if (activeRole === 'jefe_estudios') {
          if (sol.rol === 'jefe_departamento') return true;
          if (sol.rol === 'profesor') {
            const hasJefeDept = centerStaff.some(u => 
              u.roles?.some(r => r.rol === 'jefe_departamento' && r.iesId === activeIesId && r.departamento === sol.departamento && r.estado === 'activo')
            );
            return !hasJefeDept;
          }
        }
        return false;
      });

      setPendingCount(filtered.length);
    });

    return () => unsubscribe();
  }, [auth.currentUser, activeRole, userProfile, centerStaff]);

  const handleRoleChange = (newRole, newIesId) => {
    setActiveRole(newRole);
    localStorage.setItem('activeRole', newRole);
    if (newIesId) {
      localStorage.setItem('activeIesId', newIesId);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('activeRole');
      navigate('/login');
    } catch (error) {
      console.error('Error al cerrar sesión', error);
    }
  };

  const getRoleLabel = (role) => {
    const roleId = typeof role === 'string' ? role : role.rol;
    const labels = {
      superadmin: 'Súperadmin',
      jefe_estudios: 'Jefe de Estudios',
      jefe_departamento: 'Jefe de Dpto.',
      profesor: 'Profesor',
      alumno: 'Alumno'
    };
    
    return labels[roleId] || roleId;
  };

  return (
    <div className={`role-theme-${activeRole}`} style={styles.layout}>
      {/* Sidebar */}
      <aside style={{...styles.sidebar, width: isSidebarOpen ? '14rem' : '4.5rem'}}>
        <div style={styles.sidebarHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <button 
              style={{...styles.iconButton, padding: '4px', color: 'var(--text-primary)'}} 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={isSidebarOpen ? "Contraer menú" : "Expandir menú"}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
            {isSidebarOpen && <span style={styles.logoText}>EduTrack</span>}
          </div>
        </div>
        
        <nav style={styles.nav}>
          <Link to="/home" style={styles.navItem}>
             <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
             {isSidebarOpen && <span>Inicio</span>}
          </Link>

          <Link to="/users" style={styles.navItem}>
             <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
             {isSidebarOpen && <span>Usuarios</span>}
          </Link>

          {activeRole === 'profesor' && (
            <>
              <Link to="/profesor/horarios" style={styles.navItem}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                {isSidebarOpen && <span>Horarios</span>}
              </Link>
              <Link to="/profesor/programaciones" style={styles.navItem}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                {isSidebarOpen && <span>Programaciones</span>}
              </Link>
              <Link to="/profesor/ausencias" style={styles.navItem}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                {isSidebarOpen && <span>Ausencias</span>}
              </Link>
            </>
          )}

          
          {activeRole !== 'profesor' && (
            <Link to="/approvals" style={styles.navItem}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                {pendingCount > 0 && <span style={styles.badge}>{pendingCount}</span>}
              </div>
              {isSidebarOpen && <span>Solicitudes</span>}
            </Link>
          )}

          {activeRole === 'jefe_estudios' && (
            <>
              <Link to="/academic-years" style={styles.navItem}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                {isSidebarOpen && <span>Curso Académico</span>}
              </Link>
              <Link to="/departments" style={styles.navItem}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                {isSidebarOpen && <span>Departamentos</span>}
              </Link>
              <Link to="/studies" style={styles.navItem}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                {isSidebarOpen && <span>Estudios</span>}
              </Link>
              <Link to="/holidays" style={styles.navItem}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                {isSidebarOpen && <span>Festivos</span>}
              </Link>
            </>
          )}

          {(activeRole === 'jefe_departamento' || activeRole === 'jefe_estudios') && (
            <>
              <Link to="/groups" style={styles.navItem}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                {isSidebarOpen && <span>Grupos</span>}
              </Link>
              <Link to="/subjects" style={styles.navItem}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                {isSidebarOpen && <span>Asignaturas</span>}
              </Link>
              {activeRole === 'jefe_departamento' && (
                <Link to="/teaching-assignments" style={styles.navItem}>
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
                  {isSidebarOpen && <span>Imparticiones</span>}
                </Link>
              )}
            </>
          )}
        </nav>

      </aside>

      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Navbar */}
        <header style={styles.navbar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {!isSidebarOpen && (
              <div style={{ fontWeight: '700', fontSize: '1.25rem', color: 'var(--text-primary)', marginRight: '0.5rem' }}>EduTrack</div>
            )}
            <div style={{ borderLeft: '2px solid var(--active-role-color)', height: '24px' }}></div>
          </div>
          
          <div style={styles.navbarRight}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {activeRole === 'jefe_departamento' && userProfile?.roles?.find(r => r.rol === 'jefe_departamento' && r.iesId === localStorage.getItem('activeIesId'))?.departamento && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '500', marginRight: '0.5rem' }}>
                  {userProfile.roles.find(r => r.rol === 'jefe_departamento' && r.iesId === localStorage.getItem('activeIesId')).departamento}
                </div>
              )}
              <div 
                className="user-profile-clickable"
                style={{ ...styles.userProfile, cursor: 'pointer' }}
                onClick={() => setIsProfileModalOpen(true)}
                title="Editar mi perfil"
              >
                <img 
                  src={userProfile?.foto || `https://ui-avatars.com/api/?name=${userProfile?.nombre}+${userProfile?.apellidos?.split(' ')[0]}&background=random&color=fff`} 
                  alt="Avatar" 
                  style={styles.avatar}
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${userProfile?.nombre}+${userProfile?.apellidos?.split(' ')[0]}&background=random&color=fff`;
                  }}
                />
                <div style={styles.userInfo}>
                  <span style={styles.userName}>{userProfile ? `${userProfile.nombre} ${userProfile.apellidos}` : 'Usuario'}</span>
                  <select 
                    style={styles.roleSelect} 
                    value={activeRole}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const selectedOption = e.target.options[e.target.selectedIndex];
                      handleRoleChange(e.target.value, selectedOption.getAttribute('data-ies'));
                    }}
                  >
                    {userProfile?.roles?.filter(r => r.estado === 'activo').map(r => (
                      <option key={(r.rol || 'rol') + (r.iesId || 'ies')} value={r.rol} data-ies={r.iesId}>
                        {getRoleLabel(r)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <button className="btn-primary" style={styles.logoutButton} onClick={handleLogout}>
              Salir
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main style={styles.pageContent}>
          {children || <Outlet />}
        </main>
      </div>

      <ProfileModal 
        isOpen={isProfileModalOpen} 
        onClose={() => setIsProfileModalOpen(false)} 
        userProfile={userProfile}
        onUpdate={fetchProfile}
      />
    </div>
  );
}

const styles = {
  layout: {
    display: 'flex', 
    height: '100vh', 
    width: '100%', 
    backgroundColor: 'var(--bg-color)', 
    color: 'var(--text-primary)', 
    fontFamily: 'var(--font-family)', 
    textAlign: 'left',
    overflow: 'hidden'
  },
  sidebar: {
    backgroundColor: 'var(--surface-color)', 
    borderRight: '1px solid var(--border-color)', 
    transition: 'width 0.3s ease', 
    display: 'flex', 
    flexDirection: 'column', 
    height: '100vh',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    overflowY: 'auto'
  },
  sidebarHeader: {
    height: '3.5rem', display: 'flex', alignItems: 'center', padding: '0 1.25rem', borderBottom: '1px solid var(--border-color)',
  },
  logoText: {
    fontWeight: '700', fontSize: '1.1rem', whiteSpace: 'nowrap'
  },
  nav: {
    padding: '1.25rem 0.6rem', display: 'flex', flexDirection: 'column', gap: '0.6rem'
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.75rem 0.6rem', color: 'var(--text-primary)', borderRadius: '8px', textDecoration: 'none', transition: 'background 0.2s', whiteSpace: 'nowrap', overflow: 'hidden'
  },
  badge: {
    position: 'absolute', top: '-5px', right: '-8px', backgroundColor: '#ef4444', color: 'white', fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px', border: '2px solid var(--surface-color)', minWidth: '18px', textAlign: 'center'
  },
  mainContent: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0
  },
  navbar: {
    height: '3.5rem', 
    backgroundColor: 'var(--surface-color)', 
    borderBottom: '1px solid var(--border-color)', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: '0 1.25rem',
    position: 'sticky',
    top: 0,
    zIndex: 50,
    flexShrink: 0
  },
  navbarRight: {
    display: 'flex', alignItems: 'center', gap: '1.5rem'
  },
  userProfile: {
    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '5px 12px', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)'
  },
  avatar: {
    width: '1.8rem', height: '1.8rem', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--active-role-color)'
  },
  userInfo: {
    display: 'flex', flexDirection: 'column', gap: '2px'
  },
  userName: {
    fontSize: '0.95rem', fontWeight: '600'
  },
  roleSelect: {
    background: 'transparent', border: 'none', color: 'var(--active-role-color)', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', padding: 0, outline: 'none'
  },
  iconButton: {
    background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', padding: '8px', borderRadius: '4px'
  },
  logoutButton: {
    padding: '6px 12px', fontSize: '0.875rem'
  },
  pageContent: {
    flex: 1, padding: '1.5rem', overflowY: 'auto'
  }
};
