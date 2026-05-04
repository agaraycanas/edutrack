import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, getDocs, updateDoc } from 'firebase/firestore';
import { useNavigate, Link, Outlet, useLocation } from 'react-router-dom';
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
    navigate('/home');
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

  const location = useLocation();

  const SidebarItem = ({ to, icon, label, badge, roles = ['all'] }) => {
    // Si el rol activo no está permitido para este ítem, no lo mostramos
    if (!roles.includes('all') && !roles.includes(activeRole)) return null;

    const isActive = location.pathname === to;
    
    return (
      <div className="nav-item-container" style={{ 
        width: '100%', 
        display: 'flex', 
        justifyContent: isSidebarOpen ? 'flex-start' : 'center',
        position: 'relative'
      }}>
        <Link 
          to={to} 
          className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
          style={{
            ...styles.navItem,
            ...(isActive ? styles.navItemActive : {}),
            ...(isSidebarOpen ? {} : { 
              width: '42px',
              height: '42px',
              padding: 0,
              margin: '4px 0',
              justifyContent: 'center',
              borderRadius: '10px'
            })
          }}
        >
          <div style={{ 
            position: 'relative', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            width: isSidebarOpen ? '18px' : '100%',
            height: isSidebarOpen ? '18px' : '100%'
          }}>
            {icon}
            {badge > 0 && <span style={styles.badge}>{badge}</span>}
          </div>
          {isSidebarOpen && <span>{label}</span>}
        </Link>
        {!isSidebarOpen && (
          <div className="sidebar-tooltip">
            {label}
            {badge > 0 ? ` (${badge})` : ''}
          </div>
        )}
      </div>
    );
  };

  const getRoleLabel = (role) => {
    const roleId = typeof role === 'string' ? role : role.rol;
    const labels = {
      superadmin: 'Súperadmin',
      jefe_estudios: 'Jefe de Estudios',
      jefe_departamento: 'Jefe de Dpto.',
      profesor: 'Profesor'
    };
    
    return labels[roleId] || roleId;
  };

  const styles = {
    layout: {
      display: 'flex',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-color)'
    },
    sidebar: {
      backgroundColor: 'var(--surface-color)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      zIndex: 50,
      position: 'fixed',
      height: '100vh',
      left: 0,
      top: 0
    },
    sidebarHeader: {
      padding: '1.25rem 1rem',
      borderBottom: '1px solid var(--border-color)',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: isSidebarOpen ? 'flex-start' : 'center'
    },
    logoText: {
      fontSize: '1.25rem',
      fontWeight: '700',
      color: 'var(--text-primary)',
      whiteSpace: 'nowrap'
    },
    nav: {
      flex: 1,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem'
    },
    navItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.625rem 0.75rem',
      color: 'var(--text-secondary)',
      textDecoration: 'none',
      fontSize: '0.875rem',
      fontWeight: '500',
      borderRadius: '8px',
      transition: 'all 0.2s ease',
      position: 'relative'
    },
    navItemActive: {
      backgroundColor: 'var(--active-role-bg)',
      color: 'var(--active-role-color)'
    },
    badge: {
      position: 'absolute',
      top: '-6px',
      right: '-6px',
      backgroundColor: '#ef4444',
      color: 'white',
      fontSize: '10px',
      fontWeight: '700',
      padding: '2px 5px',
      borderRadius: '10px',
      minWidth: '18px',
      textAlign: 'center',
      border: '2px solid var(--surface-color)',
      zIndex: 2
    },
    mainContent: {
      flex: 1,
      minWidth: 0,
      marginLeft: isSidebarOpen ? '14rem' : '4.5rem',
      transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh'
    },
    navbar: {
      height: '64px',
      backgroundColor: 'var(--glass-bg)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 1.5rem',
      position: 'sticky',
      top: 0,
      zIndex: 40
    },
    navbarRight: {
      display: 'flex',
      alignItems: 'center',
      gap: '1.25rem'
    },
    userProfile: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.4rem 0.6rem',
      borderRadius: '12px',
      transition: 'background-color 0.2s ease'
    },
    avatar: {
      width: '36px',
      height: '36px',
      borderRadius: '10px',
      objectFit: 'cover',
      border: '2px solid var(--active-role-bg)'
    },
    userInfo: {
      display: 'flex',
      flexDirection: 'column'
    },
    userName: {
      fontSize: '0.875rem',
      fontWeight: '600',
      color: 'var(--text-primary)'
    },
    roleSelect: {
      fontSize: '0.75rem',
      color: 'var(--text-secondary)',
      border: 'none',
      backgroundColor: 'transparent',
      padding: 0,
      cursor: 'pointer',
      outline: 'none',
      fontWeight: '500'
    },
    logoutButton: {
      padding: '0.5rem 1rem',
      fontSize: '0.875rem',
      height: '36px'
    },
    pageContent: {
      padding: '1.5rem',
      flex: 1,
      overflowX: 'auto',
      overflowY: 'auto',
      minWidth: 0
    },
    iconButton: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '8px',
      transition: 'background-color 0.2s ease'
    }
  };

  return (
    <div className={`role-theme-${activeRole}`} style={styles.layout}>
      {/* Sidebar */}
      <aside style={{
        ...styles.sidebar, 
        width: isSidebarOpen ? '14rem' : '4.5rem',
        overflow: isSidebarOpen ? 'hidden' : 'visible'
      }}>
        <div style={styles.sidebarHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <button 
              style={{...styles.iconButton, padding: '4px', color: 'var(--text-primary)'}} 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={isSidebarOpen ? "Contraer menú" : "Expandir menú"}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
            {isSidebarOpen && <span style={styles.logoText}>EduTrack</span>}
          </div>
        </div>
        
        <nav style={{
          ...styles.nav, 
          padding: isSidebarOpen ? '1.25rem 0.6rem' : '1.25rem 0',
          alignItems: isSidebarOpen ? 'stretch' : 'center',
          overflowY: isSidebarOpen ? 'auto' : 'visible',
          overflowX: isSidebarOpen ? 'hidden' : 'visible'
        }}>
          {/* GRUPO 1: Administración */}
          <div className="nav-group" style={{ 
            backgroundColor: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            padding: isSidebarOpen ? '0.5rem' : '0.5rem 0'
          }}>
            {isSidebarOpen && <div className="nav-group-title">Gestión</div>}
            <SidebarItem 
              to="/home" 
              label="Inicio" 
              icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>} 
            />
            <SidebarItem 
              to="/users" 
              label="Usuarios" 
              icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>} 
            />
            <SidebarItem 
              to="/approvals" 
              label="Solicitudes" 
              badge={pendingCount}
              roles={['superadmin', 'jefe_estudios', 'jefe_departamento']}
              icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>} 
            />
          </div>

          {/* GRUPO 2: Estructura Académica */}
          {(activeRole === 'jefe_estudios' || activeRole === 'jefe_departamento') && (
            <div className="nav-group" style={{ 
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              padding: isSidebarOpen ? '0.5rem' : '0.5rem 0'
            }}>
              {isSidebarOpen && <div className="nav-group-title">Académico</div>}
              <SidebarItem 
                to="/departments" 
                label="Departamentos" 
                roles={['jefe_estudios']}
                icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>} 
              />
              <SidebarItem 
                to="/studies" 
                label="Estudios" 
                roles={['jefe_estudios']}
                icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>} 
              />
              <SidebarItem 
                to="/subjects" 
                label="Asignaturas" 
                roles={['jefe_estudios', 'jefe_departamento']}
                icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>} 
              />
              <SidebarItem 
                to="/teaching-assignments" 
                label="Imparticiones" 
                roles={['jefe_departamento']}
                icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>} 
              />
            </div>
          )}

          {/* GRUPO 3: Organización */}
          {(activeRole === 'jefe_estudios' || activeRole === 'jefe_departamento') && (
            <div className="nav-group" style={{ 
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              padding: isSidebarOpen ? '0.5rem' : '0.5rem 0'
            }}>
              {isSidebarOpen && <div className="nav-group-title">Organización</div>}
              <SidebarItem 
                to="/academic-years" 
                label="Curso Académico" 
                roles={['jefe_estudios']}
                icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>} 
              />
              <SidebarItem 
                to="/groups" 
                label="Grupos" 
                roles={['jefe_estudios', 'jefe_departamento']}
                icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>} 
              />
              <SidebarItem 
                to="/holidays" 
                label="Festivos" 
                roles={['jefe_estudios']}
                icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>} 
              />
            </div>
          )}

          {/* GRUPO EXTRA: Docencia (Para profesores) */}
          {activeRole === 'profesor' && (
            <div className="nav-group" style={{ 
              backgroundColor: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              padding: isSidebarOpen ? '0.5rem' : '0.5rem 0'
            }}>
              {isSidebarOpen && <div className="nav-group-title">Mi Docencia</div>}
              <SidebarItem 
                to="/profesor/horarios" 
                label="Horarios" 
                icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>} 
              />
              <SidebarItem 
                to="/profesor/programaciones" 
                label="Programaciones" 
                icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>} 
              />
              <SidebarItem 
                to="/profesor/ausencias" 
                label="Ausencias" 
                icon={<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>} 
              />
            </div>
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
                    {userProfile?.roles?.filter(r => r.estado === 'activo' && r.rol?.toLowerCase() !== 'alumno').map(r => (
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
        <main id="main-content" style={styles.pageContent}>
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

