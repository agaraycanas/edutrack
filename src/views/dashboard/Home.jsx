import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { calcularHorasReales, normalizeDate } from '../../utils/timeCalculations';
import { loadMetricsForAssignments } from '../../utils/metricsLoader';


const formatShortName = (nombre, apellidos) => {
  const name = nombre || '';
  const surnameList = (apellidos || '').trim().split(/\s+/);
  const particles = ['de', 'la', 'del', 'las', 'los'];
  let firstSurnameParts = [];
  let i = 0;
  while (i < surnameList.length && particles.includes(surnameList[i].toLowerCase())) {
    firstSurnameParts.push(surnameList[i]);
    i++;
  }
  if (i < surnameList.length) firstSurnameParts.push(surnameList[i]);
  return `${name} ${firstSurnameParts.join(' ')}`.trim();
};

const getImparticionMetrics = (imp, temas, horario, academicYear, festivos, ausencias) => {
  const todayIso = new Date().toISOString().split('T')[0];
  return calcularMetricasSeguimiento(temas, horario, academicYear, festivos, ausencias, todayIso);
};

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    imparticiones: [],
    profesoresCount: 0,
    pendientesCount: 0,
    totalUsuarios: 0,
    totalIes: 0,
    departamentosCount: 0,
    alertasCount: 0,
    progresoGlobal: 0,
    topDelays: [],
    deptStats: [],
    inactivosCount: 0,
    ausenciasHoyCentro: 0,
    gruposCount: 0,
    estudiosCount: 0,
    asignaturasCount: 0,
    academicYearsCount: 0,
    festivosCount: 0
  });
  const [status, setStatus] = useState({
    isHoliday: false,
    holidayName: '',
    isAbsence: false,
    absenceReason: '',
    isWeekend: false
  });
  const [error, setError] = useState(null);

  const activeRole = localStorage.getItem('activeRole') || 'profesor';
  const activeIesId = localStorage.getItem('activeIesId');
  const navigate = useNavigate();

  const today = new Date();
  const dateStr = today.toLocaleDateString('es-ES', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
  const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  
  // Persistencia de scroll para volver al mismo sitio
  useEffect(() => {
    const savedScroll = sessionStorage.getItem('home_scroll_pos');
    const mainContent = document.getElementById('main-content');
    if (savedScroll && !loading && mainContent) {
      setTimeout(() => {
        mainContent.scrollTo(0, parseInt(savedScroll));
        sessionStorage.removeItem('home_scroll_pos');
      }, 100);
    }
  }, [loading]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const activeIesId = localStorage.getItem('activeIesId');
      
      try {
        const user = auth.currentUser;
        if (!user || !activeIesId) return;

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const t = now.getTime();
        const todayIso = now.toISOString().split('T')[0];

        const isTodayInRange = (range) => {
          const s = normalizeDate(range.startDate);
          const e = range.endDate ? normalizeDate(range.endDate) : s;
          if (!s || !e) return false;
          s.setHours(0,0,0,0);
          e.setHours(0,0,0,0);
          return t >= s.getTime() && t <= e.getTime();
        };

        // 1. Parallel fetch top-level common data
        const [academicYearsSnap, festivosSnap, ausenciasSnap] = await Promise.all([
          getDocs(query(collection(db, 'cursos_academicos'), where('iesId', '==', activeIesId))),
          getDocs(query(collection(db, 'festivos'), where('iesId', '==', activeIesId))),
          getDocs(query(collection(db, 'profesor_ausencias'), where('iesId', '==', activeIesId)))
        ]);

        const academicYears = academicYearsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        academicYears.sort((a, b) => (b.añoInicio || 0) - (a.añoInicio || 0));

        // Find current academic year based on date
        const currentYearStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
        const currentYearDoc = academicYears.find(y => y.añoInicio === currentYearStart) || academicYears[0];
        const currentYearId = currentYearDoc ? currentYearDoc.id : null;
        const currentYearLabel = currentYearDoc ? currentYearDoc.nombre : null;

        const allFestivos = festivosSnap.docs.map(d => d.data());
        const allAusencias = ausenciasSnap.docs.map(d => d.data());


        // 2. Fetch Today Status for the logged-in user
        let newStatus = {
          isHoliday: false,
          holidayName: '',
          isAbsence: false,
          absenceReason: '',
          isWeekend: [0, 6].includes(now.getDay())
        };

        const holidayFound = allFestivos.find(f => isTodayInRange(f));
        if (holidayFound) {
          newStatus.isHoliday = true;
          newStatus.holidayName = holidayFound.nombre;
        }

        const absenceFound = allAusencias.find(a => a.userId === user.uid && isTodayInRange(a));
        if (absenceFound) {
          newStatus.isAbsence = true;
          newStatus.absenceReason = absenceFound.motivo;
        }
        setStatus(newStatus);

        let dData = { 
          imparticiones: [], 
          profesoresCount: 0, 
          pendientesCount: 0, 
          totalUsuarios: 0, 
          totalIes: 0,
          departamentosCount: 0,
          alertasCount: 0,
          progresoGlobal: 0,
          topDelays: [],
          deptStats: [],
          inactivosCount: 0,
          ausenciasHoyCentro: allAusencias.filter(a => isTodayInRange(a)).length,
          gruposCount: 0,
          estudiosCount: 0,
          asignaturasCount: 0,
          academicYearsCount: academicYears.length,
          festivosCount: allFestivos.length
        };

        // Helper to sort imparticiones consistently
        const sortImparticiones = (list) => {
          return [...list].sort((a, b) => {
            const dateA = a.lastUpdate ? a.lastUpdate.getTime() : 0;
            const dateB = b.lastUpdate ? b.lastUpdate.getTime() : 0;
            if (dateA !== dateB) {
              if (dateA === 0) return -1;
              if (dateB === 0) return 1;
              return dateA - dateB;
            }
            const devA = parseFloat(a.desviacion) || 0;
            const devB = parseFloat(b.desviacion) || 0;
            return devB - devA;
          });
        };

        // Fetch multiple imparticiones metrics efficiently
        const getMetricsForAssignments = async (assigns, usersList = []) => {
          if (assigns.length === 0) return [];

          const currentYear = academicYears[0]; // Assuming current year is first
          const results = await loadMetricsForAssignments(activeIesId, assigns, currentYear);

          return results.map(imp => {
            const prof = usersList.find(u => u.id === imp.usuarioId);
            return { 
              ...imp, 
              profNombre: prof ? `${prof.nombre} ${prof.apellidos || ''}` : (imp.profesorNombre || 'Profesor'),
              profDisplayName: prof ? formatShortName(prof.nombre, prof.apellidos) : (imp.profesorNombre || 'Profesor'),
              profFoto: prof?.foto || prof?.avatar || imp.profFoto
            };
          });
        };


        if (activeRole === 'profesor') {
          const qI = query(collection(db, 'ies_imparticiones'), where('usuarioId', '==', user.uid), where('iesId', '==', activeIesId));
          const snapI = await getDocs(qI);
          let assigns = snapI.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          if (currentYearId) {
            assigns = assigns.filter(a => a.cursoAcademicoId === currentYearId || a.cursoAcademicoLabel === currentYearLabel);
          }
          const results = await getMetricsForAssignments(assigns, [{ id: user.uid, email: user.email }]);
          dData.imparticiones = sortImparticiones(results);
        }

        if (activeRole === 'jefe_departamento') {
          const [userSnap, snapAllUsers] = await Promise.all([
            getDocs(query(collection(db, 'usuarios'), where('email', '==', user.email))),
            getDocs(query(collection(db, 'usuarios'), where('iesIds', 'array-contains', activeIesId)))
          ]);
          
          const userData = userSnap.docs[0]?.data();
          const myDept = userData?.roles?.find(r => r.iesId === activeIesId && r.rol === 'jefe_departamento')?.departamento;

          if (myDept) {
            const allUsers = snapAllUsers.docs.map(d => ({ id: d.id, ...d.data() }));
            // Only count professors that have a role in this department in the current IES
            const deptProfs = allUsers.filter(u => u.roles?.some(r => r.iesId === activeIesId && r.departamento === myDept));
            dData.profesoresCount = deptProfs.length;

            // Important: Filter imparticiones by current academic year
            let qDeptI = query(

              collection(db, 'ies_imparticiones'), 
              where('iesId', '==', activeIesId), 
              where('departamento', '==', myDept)
            );
            
            const snapDeptI = await getDocs(qDeptI);
            let assigns = snapDeptI.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Filter by year ID (primary) or label (backup)
            if (currentYearId) {
              assigns = assigns.filter(a => a.cursoAcademicoId === currentYearId || a.cursoAcademicoLabel === currentYearLabel);
            }

            // Use grupoNombre to deduplicate, as group IDs might be inconsistent or duplicated across years/migrations
            const uniqueGroupNames = new Set(assigns.map(a => a.grupoNombre).filter(name => !!name));
            dData.gruposCount = uniqueGroupNames.size;


            
            const results = await getMetricsForAssignments(assigns, deptProfs);
            dData.imparticiones = sortImparticiones(results);
          }
        }

        if (activeRole === 'jefe_estudios' || activeRole === 'superadmin') {
          const [deptsSnap, studiesSnap, subjectsSnap, groupsSnap, festivosSnap] = await Promise.all([
            getDocs(query(collection(db, 'departamentos'), where('iesId', '==', activeIesId))),
            getDocs(query(collection(db, 'ies_estudios'), where('iesId', '==', activeIesId))),
            getDocs(query(collection(db, 'ies_asignaturas'), where('iesId', '==', activeIesId))),
            getDocs(query(collection(db, 'ies_grupos'), where('iesId', '==', activeIesId))),
            getDocs(query(collection(db, 'festivos'), where('iesId', '==', activeIesId)))
          ]);

          // Calculate current academic year boundaries for festivos
          const startDateStr = `${currentYearStart}-09-01`;
          const endDateStr = `${currentYearStart + 1}-08-31`;



          // Refine Festivos count: Deduplicate and filter by current academic year
          const uniqueFestivos = new Set();
          festivosSnap.docs.forEach(doc => {
            const d = doc.data();
            if (d.startDate >= startDateStr && d.startDate <= endDateStr) {
              // Deduplicate by date and name
              uniqueFestivos.add(`${d.startDate}_${d.nombre}`);
            }
          });

          const currentYearGroups = groupsSnap.docs.filter(doc => {
            const d = doc.data();
            // Count groups for current year strictly by academic year ID
            return d.cursoAcademicoId === currentYearId;
          });

          dData.departamentosCount = deptsSnap.size;
          dData.estudiosCount = studiesSnap.size;
          dData.asignaturasCount = subjectsSnap.size;
          dData.gruposCount = currentYearGroups.length;
          dData.academicYearsCount = academicYears.length;

          dData.festivosCount = uniqueFestivos.size;
          
          if (activeRole === 'superadmin') {
            const snapIes = await getDocs(collection(db, 'ies'));
            const snapU = await getDocs(collection(db, 'usuarios'));
            dData.totalUsuarios = snapU.docs.length;
            dData.totalIes = snapIes.docs.length;
          }
        }

        setDashboardData(dData);
      } catch (err) {
        console.error("Error in dashboard fetchData:", err);
        setError("Error al cargar los datos del panel.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeRole, activeIesId]);

  if (loading) return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Cargando panel...</div>;

  return (
    <div className="animate-fade-in">
      <style>{`
        @media (max-width: 1024px) {
          .dashboard-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 640px) {
          .dashboard-grid {
            grid-template-columns: 1fr !important;
            gap: 1rem !important;
          }
          .bubble-card {
            padding: 1.25rem !important;
          }
          .bubble-number {
            font-size: 1.8rem !important;
          }
        }
      `}</style>
      <div className="glass-panel" style={{ marginBottom: '2rem', padding: '2.5rem', borderLeft: '6px solid var(--accent-primary)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '700' }}>
            Estado de hoy
          </p>
          <h1 style={{ fontSize: '2.8rem', fontWeight: '900', marginBottom: '1.5rem', letterSpacing: '-1px' }}>{capitalizedDate}</h1>
          
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {status.isWeekend && (
              <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}>
                Fin de semana
              </span>
            )}
            {status.isHoliday && (
              <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ff6b6b', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.6rem 1.2rem', fontSize: '0.9rem', fontWeight: '700' }}>
                Festivo: {status.holidayName}
              </span>
            )}
            {status.isAbsence && (
              <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '0.6rem 1.2rem', fontSize: '0.9rem', fontWeight: '700' }}>
                Ausencia registrada: {status.absenceReason}
              </span>
            )}
            {!status.isHoliday && !status.isAbsence && !status.isWeekend && (
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.6rem 1.2rem', fontSize: '0.9rem', fontWeight: '700' }}>
                Día lectivo normal
              </span>
            )}
          </div>
        </div>
        <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: '400px', height: '400px', background: 'radial-gradient(circle, var(--accent-primary) 0%, transparent 70%)', opacity: 0.05, filter: 'blur(40px)', pointerEvents: 'none' }}></div>
      </div>

      <h2 style={{ marginBottom: '2rem', fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.5px' }}>Panel de Control</h2>
      
      {activeRole === 'profesor' && (
        <div style={styles.grid}>
          {dashboardData.imparticiones.length === 0 ? (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', gridColumn: '1 / -1' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>No tienes imparticiones asignadas actualmente.</p>
            </div>
          ) : (
            dashboardData.imparticiones.map(imp => (
              <div key={imp.id} className="glass-panel card-hover" style={styles.card} onClick={() => navigate(`/profesor/programaciones/${imp.id}/seguimiento`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={styles.siglaBadge}>{imp.asignaturaSigla}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', fontWeight: '700' }}>{imp.grupoNombre}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                      {imp.departamento || 'Sin Dept.'}
                    </span>
                  </div>
                </div>
                <h3 style={styles.cardTitle}>{imp.asignaturaNombre}</h3>
                
                <div style={{ margin: '1rem 0' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.4rem' }}>Tema Teórico Actual</p>
                  <p style={{ fontWeight: '700', fontSize: '1.1rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={imp.temaActual}>
                    {imp.temaActual}
                  </p>
                </div>

                <div style={{ marginTop: 'auto' }}>
                  <div style={styles.statRow}>
                    <span style={{ fontSize: '0.9rem' }}>Progreso Teórico (Hoy):</span>
                    <span style={{ fontWeight: '900', color: 'var(--accent-primary)', fontSize: '1.2rem' }}>{imp.progreso}%</span>
                  </div>
                  <div style={{...styles.progressBarBg, height: '8px', margin: '8px 0'}}>
                    <div style={{...styles.progressBarFill, width: `${imp.progreso}%`}} />
                  </div>
                  <div style={styles.statRow}>
                    <span style={{ fontSize: '0.9rem' }}>Desviación Global:</span>
                    <span style={{ 
                      fontWeight: '900', 
                      fontSize: '1.2rem',
                      color: imp.desviacion > 0 ? '#ef4444' : (imp.desviacion < 0 ? '#10b981' : 'var(--text-secondary)') 
                    }}>
                      {imp.desviacion > 0 ? `+${imp.desviacion}h` : `${imp.desviacion}h`}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem', fontWeight: '500' }}>
                    Última actualización: {imp.lastUpdate ? imp.lastUpdate.toLocaleDateString() : 'Nunca'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeRole === 'jefe_departamento' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={{ ...styles.grid, gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="glass-panel card-hover" style={{ ...styles.statCard, cursor: 'pointer' }} onClick={() => navigate('/users')}>
              <div style={styles.statIcon}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div>
              <div>
                <h3 style={styles.cardTitle}>Profesores</h3>
                <p style={styles.cardNumber}>{dashboardData.profesoresCount}</p>
              </div>
            </div>
            <div className="glass-panel card-hover" style={{ ...styles.statCard, cursor: 'pointer' }} onClick={() => navigate('/groups')}>
              <div style={{...styles.statIcon, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)'}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div>
              <div>
                <h3 style={styles.cardTitle}>Grupos</h3>
                <p style={styles.cardNumber}>{dashboardData.gruposCount}</p>
              </div>
            </div>
            <div className="glass-panel card-hover" style={{ ...styles.statCard, cursor: 'pointer' }} onClick={() => navigate('/teaching-assignments')}>
              <div style={{...styles.statIcon, color: '#10b981', background: 'rgba(16, 185, 129, 0.1)'}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg></div>
              <div>
                <h3 style={styles.cardTitle}>Imparticiones</h3>
                <p style={styles.cardNumber}>{dashboardData.imparticiones.length}</p>
              </div>
            </div>
          </div>
          
          <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: '800' }}>Seguimiento de Programaciones</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.8rem', borderRadius: '8px' }}>
                Ordenado por más tiempo sin actualizar
              </span>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Profesor</th>
                    <th style={styles.th}>Asig./grupo</th>
                    <th style={{...styles.th, textAlign: 'center'}}>Desviación</th>
                    <th style={{...styles.th, textAlign: 'right'}}>Última Act.</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.imparticiones.map(imp => (
                    <tr 
                      key={imp.id} 
                      className="row-hover" 
                      style={{ ...styles.tr, cursor: 'pointer' }}
                      onClick={() => {
                        const mainContent = document.getElementById('main-content');
                        if (mainContent) sessionStorage.setItem('home_scroll_pos', mainContent.scrollTop);
                        navigate(`/profesor/programaciones/${imp.id}/seguimiento?readOnly=true`);
                      }}
                    >
                      <td style={{ ...styles.td, paddingLeft: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <img 
                            src={imp.profFoto && imp.profFoto !== 'undefined' && imp.profFoto !== '' ? imp.profFoto : `https://ui-avatars.com/api/?name=${encodeURIComponent(imp.profNombre)}+${encodeURIComponent(imp.profApellidos || '')}&background=6366f1&color=fff&size=128`} 
                            style={{ width: '28px', height: '28px', borderRadius: '8px', objectFit: 'cover', background: 'var(--bg-secondary)' }} 
                            alt=""
                            onError={(e) => {
                              e.target.onerror = null;
                              const name = imp.profNombre || 'P';
                              const sur = imp.profApellidos || '';
                              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}+${encodeURIComponent(sur)}&background=6366f1&color=fff&size=128`;
                            }}
                          />
                          <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>
                            {imp.profDisplayName || imp.profNombre}
                          </span>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{imp.asignaturaSigla}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>{imp.grupoNombre}</span>
                        </div>
                      </td>
                      <td style={{...styles.td, textAlign: 'center'}}>
                        <span style={{ 
                          padding: '0.4rem 0.8rem', 
                          borderRadius: '8px', 
                          fontSize: '0.9rem',
                          fontWeight: '800',
                          background: imp.desviacion > 0 ? 'rgba(239, 68, 68, 0.15)' : (imp.desviacion < 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)'),
                          color: imp.desviacion > 0 ? '#ff6b6b' : (imp.desviacion < 0 ? '#34d399' : 'var(--text-secondary)')
                        }}>
                          {imp.desviacion > 0 ? `+${imp.desviacion}h` : `${imp.desviacion}h`}
                        </span>
                      </td>
                      <td style={{...styles.td, textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {imp.lastUpdate ? imp.lastUpdate.toLocaleDateString() : 'Nunca'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {(activeRole === 'jefe_estudios' || activeRole === 'superadmin') && (
        <div className="dashboard-grid" style={styles.bubbleGrid}>
          {/* 1. Departamentos */}

          <div className="glass-panel card-hover" style={styles.bubbleCard} onClick={() => navigate('/departments')}>
            <div style={{...styles.statIcon, background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <div>
              <p style={styles.bubbleNumber}>{dashboardData.departamentosCount}</p>
              <h3 style={styles.bubbleTitle}>Departamentos</h3>
            </div>
          </div>

          {/* 2. Estudios */}
          <div className="glass-panel card-hover" style={styles.bubbleCard} onClick={() => navigate('/studies')}>
            <div style={{...styles.statIcon, background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
            </div>
            <div>
              <p style={styles.bubbleNumber}>{dashboardData.estudiosCount}</p>
              <h3 style={styles.bubbleTitle}>Estudios</h3>
            </div>
          </div>

          {/* 3. Asignaturas */}
          <div className="glass-panel card-hover" style={styles.bubbleCard} onClick={() => navigate('/subjects')}>
            <div style={{...styles.statIcon, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            </div>
            <div>
              <p style={styles.bubbleNumber}>{dashboardData.asignaturasCount}</p>
              <h3 style={styles.bubbleTitle}>Asignaturas</h3>
            </div>
          </div>

          {/* 4. Cursos Académicos */}
          <div className="glass-panel card-hover" style={styles.bubbleCard} onClick={() => navigate('/academic-years')}>
            <div style={{...styles.statIcon, background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </div>
            <div>
              <p style={styles.bubbleNumber}>{dashboardData.academicYearsCount}</p>
              <h3 style={styles.bubbleTitle}>Cursos Académicos</h3>
            </div>
          </div>

          {/* 5. Grupos */}
          <div className="glass-panel card-hover" style={styles.bubbleCard} onClick={() => navigate('/groups')}>
            <div style={{...styles.statIcon, background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <div>
              <p style={styles.bubbleNumber}>{dashboardData.gruposCount}</p>
              <h3 style={styles.bubbleTitle}>Grupos</h3>
            </div>
          </div>

          {/* 6. Festivos */}
          <div className="glass-panel card-hover" style={styles.bubbleCard} onClick={() => navigate('/holidays')}>
            <div style={{...styles.statIcon, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </div>
            <div>
              <p style={styles.bubbleNumber}>{dashboardData.festivosCount}</p>
              <h3 style={styles.bubbleTitle}>Festivos</h3>
            </div>
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem', opacity: 0.8 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Actividad Reciente</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
          El registro de logs de actividad se habilitará tras la configuración del sistema de auditoría.
        </p>
      </div>
    </div>
  );
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '1.5rem',
    marginBottom: '2rem',
  },
  bubbleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '1.5rem',
    marginBottom: '2rem',
  },
  adminFlexGrid: {
    display: 'flex',
    gap: '2rem',
    flexWrap: 'wrap',
    marginTop: '2rem'
  },
  card: {
    padding: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    borderRadius: '24px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
  },
  statCard: {
    padding: '1.5rem 2rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    borderRadius: '20px'
  },
  statIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '14px',
    background: 'rgba(99, 102, 241, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent-primary)'
  },
  cardTitle: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  cardNumber: {
    fontSize: '2.5rem',
    fontWeight: '900',
    color: 'var(--text-primary)',
    lineHeight: '1',
    margin: '0.5rem 0'
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
    marginTop: '0.5rem',
    color: 'var(--text-secondary)'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '0.5rem'
  },
  th: {
    textAlign: 'left',
    padding: '1rem 0.5rem',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    color: 'var(--text-secondary)',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  td: {
    padding: '0.1rem 0.5rem',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    fontSize: '0.85rem'
  },
  tr: {
    transition: 'all 0.2s'
  },
  siglaBadge: {
    background: 'rgba(99, 102, 241, 0.15)',
    color: 'var(--accent-primary)',
    padding: '0.5rem 1rem',
    borderRadius: '12px',
    fontSize: '1.5rem',
    fontWeight: '900',
    letterSpacing: '1px'
  },
  progressBarBg: {
    width: '100%',
    height: '8px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '10px',
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--accent-primary), #818cf8)',
    borderRadius: '10px'
  },
  bubbleCard: {
    padding: '2rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    borderRadius: '24px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  bubbleNumber: {
    fontSize: '2.2rem',
    fontWeight: '900',
    color: 'var(--text-primary)',
    lineHeight: '1',
    marginBottom: '0.2rem'
  },
  bubbleTitle: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  }
};
