import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export default function DashboardLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [activeRole, setActiveRole] = useState(localStorage.getItem('activeRole') || 'profesor');
  const navigate = useNavigate();

  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
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
            // Si el rol ya es correcto, aseguramos que el IES ID esté en localStorage
            const currentRoleData = data.roles.find(r => r.rol === activeRole);
            if (currentRoleData) {
              localStorage.setItem('activeIesId', currentRoleData.iesId);
            }
          }
        }
      }
    };
    fetchProfile();
  }, [activeRole]);

  useEffect(() => {
    if (!auth.currentUser || activeRole === 'profesor') {
      setPendingCount(0);
      return;
    }

    const q = query(
      collection(db, 'solicitudes'),
      where('estado', '==', 'pendiente')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const activeIesId = localStorage.getItem('activeIesId');
      const allSols = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Para la badge necesitamos la jerarquía exacta
      let centerStaff = [];
      if (activeRole !== 'superadmin') {
        const usersSnapshot = await getDocs(collection(db, 'usuarios'));
        centerStaff = usersSnapshot.docs
          .map(doc => doc.data())
          .filter(u => u.roles?.some(r => r.iesId === activeIesId && r.estado === 'activo'));
      }

      const filtered = allSols.filter(sol => {
        if (activeRole === 'superadmin') return true;
        if (sol.iesId !== activeIesId) return false;

        if (activeRole === 'jefe_departamento') {
          const myDept = userProfile?.roles?.find(r => r.rol === 'jefe_departamento' && r.iesId === activeIesId)?.departamento;
          return sol.rol === 'profesor' && sol.departamento === myDept;
        }

        if (activeRole === 'jefe_estudios') {
          if (sol.rol === 'jefe_departamento') return true;
          if (sol.rol === 'profesor') {
            const hasJefeDept = centerStaff.some(u => 
              u.roles?.some(r => r.rol === 'jefe_departamento' && r.iesId === activeIesId && r.departamento === sol.departamento && r.estado === 'activo')
            );
            return !hasJefeDept;
          }
        }

        if (activeRole === 'admin') {
          if (sol.rol === 'jefe_estudios') return true;
          if (sol.rol === 'jefe_departamento') {
            const hasJefeEstudios = centerStaff.some(u => u.roles?.some(r => r.rol === 'jefe_estudios' && r.iesId === activeIesId && r.estado === 'activo'));
            return !hasJefeEstudios;
          }
          if (sol.rol === 'profesor') {
            const hasJefeEstudios = centerStaff.some(u => u.roles?.some(r => r.rol === 'jefe_estudios' && r.iesId === activeIesId && r.estado === 'activo'));
            const hasJefeDept = centerStaff.some(u => u.roles?.some(r => r.rol === 'jefe_departamento' && r.iesId === activeIesId && r.departamento === sol.departamento && r.estado === 'activo'));
            return !hasJefeEstudios && !hasJefeDept;
          }
        }
        return false;
      });

      setPendingCount(filtered.length);
    });

    return () => unsubscribe();
  }, [auth.currentUser, activeRole, userProfile]);

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

  const getRoleLabel = (roleId) => {
    const labels = {
      superadmin: 'Super Administrador',
      admin: 'Administrador',
      jefe_estudios: 'Jefe de Estudios',
      jefe_departamento: 'Jefe de Depto.',
      profesor: 'Profesor'
    };
    return labels[roleId] || roleId;
  };

  return (
    <div className={`role-theme-${activeRole}`} style={styles.layout}>
      {/* Sidebar */}
      <aside style={{...styles.sidebar, width: isSidebarOpen ? '250px' : '70px'}}>
        <div style={styles.sidebarHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <div style={styles.logoIcon}>ET</div>
            {isSidebarOpen && <span style={styles.logoText}>EduTrack</span>}
          </div>
        </div>
        
        <nav style={styles.nav}>
          <a href="/home" style={styles.navItem}>
             <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
             {isSidebarOpen && <span>Inicio</span>}
          </a>
          
          {activeRole !== 'profesor' && (
            <a href="/approvals" style={styles.navItem}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                {pendingCount > 0 && <span style={styles.badge}>{pendingCount}</span>}
              </div>
              {isSidebarOpen && <span>Solicitudes</span>}
            </a>
          )}
        </nav>

      </aside>

      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Navbar */}
        <header style={styles.navbar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button style={styles.iconButton} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
            <div style={{ borderLeft: '2px solid var(--active-role-color)', paddingLeft: '1rem', fontWeight: '600' }}>
                {userProfile?.roles?.find(r => r.rol === activeRole)?.iesNombre || 'IES Rey Fernando VI'}
            </div>
          </div>
          
          <div style={styles.navbarRight}>
            <div style={styles.userProfile}>
              <img 
                src={auth.currentUser?.photoURL || 'https://via.placeholder.com/40'} 
                alt="Avatar" 
                style={styles.avatar} 
              />
              <div style={styles.userInfo}>
                <span style={styles.userName}>{userProfile ? `${userProfile.nombre} ${userProfile.apellidos}` : 'Usuario'}</span>
                <select 
                  style={styles.roleSelect} 
                  value={activeRole}
                  onChange={(e) => {
                    const selectedOption = e.target.options[e.target.selectedIndex];
                    handleRoleChange(e.target.value, selectedOption.getAttribute('data-ies'));
                  }}
                >
                  {/* Si el usuario tiene roles reales, los mostramos. Si no (o es dev bypass), mostramos todos para pruebas */}
                  {userProfile?.roles?.length > 0 ? (
                    userProfile.roles.filter(r => r.estado === 'activo').map(r => (
                      <option key={(r.rol || 'rol') + (r.iesId || 'ies')} value={r.rol} data-ies={r.iesId}>
                        {getRoleLabel(r.rol)} ({r.iesId})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="profesor">Profesor</option>
                      <option value="jefe_departamento">Jefe de Depto.</option>
                      <option value="jefe_estudios">Jefe de Estudios</option>
                      <option value="admin">Administrador</option>
                    </>
                  )}
                </select>
              </div>
            </div>
            <button className="btn-primary" style={styles.logoutButton} onClick={handleLogout}>
              Salir
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main style={styles.pageContent}>
          {children}
        </main>
      </div>
    </div>
  );
}

const styles = {
  layout: {
    display: 'flex', minHeight: '100vh', width: '100%', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)', fontFamily: 'var(--font-family)', textAlign: 'left'
  },
  sidebar: {
    backgroundColor: 'var(--surface-color)', borderRight: '1px solid var(--border-color)', transition: 'width 0.3s ease', display: 'flex', flexDirection: 'column', overflow: 'hidden'
  },
  sidebarHeader: {
    height: '64px', display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid var(--border-color)',
  },
  logoIcon: {
    width: '32px', height: '32px', background: 'linear-gradient(135deg, var(--active-role-color), var(--accent-secondary))', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px', color: 'white', flexShrink: 0
  },
  logoText: {
    fontWeight: '700', fontSize: '1.25rem', whiteSpace: 'nowrap'
  },
  nav: {
    padding: '20px 10px', display: 'flex', flexDirection: 'column', gap: '10px'
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: '15px', padding: '12px 10px', color: 'var(--text-primary)', borderRadius: '8px', textDecoration: 'none', transition: 'background 0.2s', whiteSpace: 'nowrap', overflow: 'hidden'
  },
  badge: {
    position: 'absolute', top: '-5px', right: '-8px', backgroundColor: '#ef4444', color: 'white', fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px', border: '2px solid var(--surface-color)', minWidth: '18px', textAlign: 'center'
  },
  mainContent: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden'
  },
  navbar: {
    height: '64px', backgroundColor: 'var(--surface-color)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px',
  },
  navbarRight: {
    display: 'flex', alignItems: 'center', gap: '1.5rem'
  },
  userProfile: {
    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '5px 12px', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)'
  },
  avatar: {
    width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--active-role-color)'
  },
  userInfo: {
    display: 'flex', flexDirection: 'column', gap: '2px'
  },
  userName: {
    fontSize: '0.9rem', fontWeight: '600'
  },
  roleSelect: {
    background: 'transparent', border: 'none', color: 'var(--active-role-color)', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', padding: 0, outline: 'none'
  },
  iconButton: {
    background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', padding: '8px', borderRadius: '4px'
  },
  logoutButton: {
    padding: '6px 12px', fontSize: '0.875rem'
  },
  pageContent: {
    flex: 1, padding: '2rem', overflowY: 'auto'
  }
};
