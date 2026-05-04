import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { calcularHorasReales } from '../../utils/timeCalculations';

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
    ausenciasHoyCentro: 0
  });
  const [status, setStatus] = useState({
    isHoliday: false,
    holidayName: '',
    isAbsence: false,
    absenceReason: '',
    isWeekend: false
  });

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
      try {
        const user = auth.currentUser;
        if (!user) return;

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const t = now.getTime();
        const todayIso = now.toISOString().split('T')[0];

        const normalizeDate = (d) => {
          if (!d) return null;
          let date;
          if (d && typeof d.toDate === 'function') date = d.toDate();
          else if (d && d.seconds) date = new Date(d.seconds * 1000);
          else if (typeof d === 'string') {
            if (d.includes('-')) {
              const [p1, p2, p3] = d.split('-');
              if (p1.length === 4) date = new Date(Number(p1), Number(p2) - 1, Number(p3));
              else date = new Date(Number(p3), Number(p2) - 1, Number(p1));
            } else if (d.includes('/')) {
              const [p1, p2, p3] = d.split('/');
              date = new Date(Number(p3), Number(p2) - 1, Number(p1));
            } else {
              date = new Date(d);
            }
          } else {
            date = new Date(d);
          }
          date.setHours(0,0,0,0);
          return date;
        };

        const isTodayInRange = (range) => {
          const s = normalizeDate(range.startDate);
          const e = range.endDate ? normalizeDate(range.endDate) : s;
          if (!s || !e) return false;
          return t >= s.getTime() && t <= e.getTime();
        };

        // 1. Fetch Today Status (Holidays & Absences)
        let newStatus = {
          isHoliday: false,
          holidayName: '',
          isAbsence: false,
          absenceReason: '',
          isWeekend: [0, 6].includes(now.getDay())
        };

        if (activeIesId) {
          const qF = query(collection(db, 'festivos'), where('iesId', '==', activeIesId));
          const snapF = await getDocs(qF);
          const holidayFound = snapF.docs.find(doc => isTodayInRange(doc.data()));
          if (holidayFound) {
            newStatus.isHoliday = true;
            newStatus.holidayName = holidayFound.data().nombre;
          }
        }

        const qA = query(collection(db, 'profesor_ausencias'), where('userId', '==', user.uid));
        const snapA = await getDocs(qA);
        const absenceFound = snapA.docs.find(doc => isTodayInRange(doc.data()));
        if (absenceFound) {
          newStatus.isAbsence = true;
          newStatus.absenceReason = absenceFound.data().motivo;
        }
        setStatus(newStatus);

        // 2. Common Data for calculations
        const academicYearsSnap = await getDocs(query(collection(db, 'cursos_academicos'), where('iesId', '==', activeIesId)));
        const academicYears = academicYearsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

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
          ausenciasHoyCentro: 0
        };

        // Helper to calculate metrics for an imparticion
        const getImparticionMetrics = (imp, prog, horario, ay) => {
          if (!prog || !ay) return { desviacion: 0, progreso: 0, temaActual: 'Sin programación', lastUpdate: null };
          
          const duracionSesion = ay.duracionSesion || 55;
          let hEst = 0;
          try {
            hEst = calcularHorasReales(ay.fechaInicioClases, todayIso, horario, duracionSesion);
          } catch(e) {}

          let totalHours = prog.temas?.reduce((acc, t) => acc + (t.horasEstimadas || 0), 0) || 0;
          let totalDev = 0;
          let currentThemeName = 'No iniciado';
          let cumulative = 0;
          let lastUpdate = prog.updatedAt ? new Date(prog.updatedAt.seconds * 1000) : null;

          if (prog.temas) {
            prog.temas.forEach(t => {
              if (t.fechaInicio && t.fechaFin && horario) {
                try {
                  const hRealTema = calcularHorasReales(t.fechaInicio, t.fechaFin, horario, duracionSesion);
                  totalDev += (hRealTema - (Number(t.horasEstimadas) || 0));
                  
                  const dFin = new Date(t.fechaFin);
                  if (!lastUpdate || dFin > lastUpdate) lastUpdate = dFin;
                } catch (err) {}
              }
              
              const tHours = Number(t.horasEstimadas) || 0;
              if (currentThemeName === 'No iniciado' && cumulative + tHours > hEst) {
                currentThemeName = t.nombre;
              }
              cumulative += tHours;
            });
          }

          const progreso = totalHours > 0 ? Math.min(100, Math.round((hEst / totalHours) * 100)) : 0;
          return {
            desviacion: totalDev,
            progreso,
            temaActual: currentThemeName,
            lastUpdate
          };
        };

        if (activeRole === 'profesor') {
          const qI = query(collection(db, 'ies_imparticiones'), where('usuarioId', '==', user.uid), where('iesId', '==', activeIesId));
          const snapI = await getDocs(qI);
          const assigns = snapI.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          const metricsPromises = assigns.map(async (imp) => {
            const pSnap = await getDoc(doc(db, 'profesor_programaciones', imp.id));
            const hSnap = await getDoc(doc(db, 'profesor_horarios', imp.id));
            const ay = academicYears.find(y => y.id === imp.cursoAcademicoId || y.nombre === imp.cursoAcademicoLabel);
            
            const metrics = getImparticionMetrics(imp, pSnap.data(), hSnap.data(), ay);
            return { ...imp, ...metrics };
          });
          
          dData.imparticiones = await Promise.all(metricsPromises);
        }

        if (activeRole === 'jefe_departamento') {
          const userSnap = await getDocs(query(collection(db, 'usuarios'), where('email', '==', user.email)));
          const userData = userSnap.docs[0]?.data();
          const myDept = userData?.roles?.find(r => r.iesId === activeIesId && r.rol === 'jefe_departamento')?.departamento;

          if (myDept) {
            const qProf = query(collection(db, 'usuarios'), where('iesIds', 'array-contains', activeIesId));
            const snapProf = await getDocs(qProf);
            const deptProfs = snapProf.docs.filter(d => d.data().roles?.some(r => r.iesId === activeIesId && r.departamento === myDept));
            dData.profesoresCount = deptProfs.length;

            const qDeptI = query(collection(db, 'ies_imparticiones'), where('iesId', '==', activeIesId), where('departamento', '==', myDept));
            const snapDeptI = await getDocs(qDeptI);
            
            const metricsPromises = snapDeptI.docs.map(async (docSnap) => {
              const imp = { id: docSnap.id, ...docSnap.data() };
              const profDoc = deptProfs.find(p => p.id === imp.usuarioId);
              const prof = profDoc?.data();
              const pSnap = await getDoc(doc(db, 'profesor_programaciones', imp.id));
              const hSnap = await getDoc(doc(db, 'profesor_horarios', imp.id));
              const ay = academicYears.find(y => y.id === imp.cursoAcademicoId || y.nombre === imp.cursoAcademicoLabel);
              
              const metrics = getImparticionMetrics(imp, pSnap.data(), hSnap.data(), ay);
              return { 
                ...imp, 
                ...metrics, 
                profFoto: prof?.foto || prof?.avatar,
                profNombre: `${prof?.nombre || 'Profesor'} ${prof?.apellidos || ''}`
              };
            });
            
            dData.imparticiones = (await Promise.all(metricsPromises)).sort((a, b) => {
              const dateA = a.lastUpdate ? a.lastUpdate.getTime() : 0;
              const dateB = b.lastUpdate ? b.lastUpdate.getTime() : 0;
              return dateA - dateB;
            });
          }
        }

        if (activeRole === 'jefe_estudios' || activeRole === 'superadmin') {
          const deptsSnap = await getDocs(query(collection(db, 'departamentos'), where('iesId', '==', activeIesId)));
          const depts = deptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          dData.departamentosCount = depts.length;

          const qAllI = query(collection(db, 'ies_imparticiones'), where('iesId', '==', activeIesId));
          const snapAllI = await getDocs(qAllI);
          const allAssigns = snapAllI.docs.map(d => ({ id: d.id, ...d.data() }));

          // Fetch all teachers to get names/photos and check absences
          const qAllU = query(collection(db, 'usuarios'), where('iesIds', 'array-contains', activeIesId));
          const snapAllU = await getDocs(qAllU);
          const allUsers = snapAllU.docs.map(d => ({ id: d.id, ...d.data() }));

          const qAusHoy = query(collection(db, 'profesor_ausencias'), where('iesId', '==', activeIesId));
          const snapAus = await getDocs(qAusHoy);
          dData.ausenciasHoyCentro = snapAus.docs.filter(doc => isTodayInRange(doc.data())).length;

          let totalProgreso = 0;
          let countAlerts = 0;
          let countInactivos = 0;
          const deptMap = {}; // { deptName: { totalProg: 0, count: 0 } }
          
          const globalMetricsPromises = allAssigns.map(async (imp) => {
            const pSnap = await getDoc(doc(db, 'profesor_programaciones', imp.id));
            const hSnap = await getDoc(doc(db, 'profesor_horarios', imp.id));
            const ay = academicYears.find(y => y.id === imp.cursoAcademicoId || y.nombre === imp.cursoAcademicoLabel);
            const prof = allUsers.find(u => u.id === imp.usuarioId);
            
            const pData = pSnap.data();
            const metrics = getImparticionMetrics(imp, pData, hSnap.data(), ay);
            
            if (metrics.desviacion > 5) countAlerts++;
            totalProgreso += metrics.progreso;

            // Inactivity check (> 7 days)
            if (pData?.updatedAt) {
              const lastUp = pData.updatedAt.toDate();
              const diffDays = (now.getTime() - lastUp.getTime()) / (1000 * 3600 * 24);
              if (diffDays > 7) countInactivos++;
            } else {
              countInactivos++; // Never updated
            }

            // Dept stats
            const dName = imp.departamento || 'Sin asignar';
            if (!deptMap[dName]) deptMap[dName] = { totalProg: 0, count: 0 };
            deptMap[dName].totalProg += metrics.progreso;
            deptMap[dName].count += 1;

            return { 
              ...imp, 
              ...metrics, 
              profNombre: prof ? `${prof.nombre} ${prof.apellidos || ''}` : 'Desconocido',
              profFoto: prof?.foto || prof?.avatar 
            };
          });

          const allMetrics = await Promise.all(globalMetricsPromises);
          
          dData.alertasCount = countAlerts;
          dData.inactivosCount = countInactivos;
          dData.progresoGlobal = allAssigns.length > 0 ? Math.round(totalProgreso / allAssigns.length) : 0;
          
          dData.topDelays = allMetrics
            .filter(m => m.desviacion > 0)
            .sort((a, b) => b.desviacion - a.desviacion)
            .slice(0, 5);

          dData.deptStats = Object.keys(deptMap).map(name => ({
            name,
            avgProgreso: Math.round(deptMap[name].totalProg / deptMap[name].count)
          })).sort((a, b) => b.avgProgreso - a.avgProgreso);

          if (activeRole === 'superadmin') {
            const snapU = await getDocs(collection(db, 'usuarios'));
            dData.totalUsuarios = snapU.docs.length;
            const snapIes = await getDocs(collection(db, 'ies'));
            dData.totalIes = snapIes.docs.length;
          }
        }

        setDashboardData(dData);
      } catch (error) {
        console.error("Error fetching home data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeRole, activeIesId]);

  if (loading) return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Cargando panel...</div>;

  return (
    <div className="animate-fade-in">
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
                  <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', fontWeight: '700' }}>{imp.grupoNombre}</span>
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
          <div style={styles.grid}>
            <div className="glass-panel" style={styles.statCard}>
              <div style={styles.statIcon}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div>
              <div>
                <h3 style={styles.cardTitle}>Profesores</h3>
                <p style={styles.cardNumber}>{dashboardData.profesoresCount}</p>
              </div>
            </div>
            <div className="glass-panel" style={styles.statCard}>
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
                    <th style={styles.th}>Asignatura / Grupo</th>
                    <th style={{...styles.th, textAlign: 'center'}}>Desviación</th>
                    <th style={{...styles.th, textAlign: 'center'}}>Progreso</th>
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
                      <td style={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <img src={imp.profFoto || 'https://via.placeholder.com/36'} style={{ width: '36px', height: '36px', borderRadius: '10px', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)' }} alt="" />
                          <span style={{ fontWeight: '600' }}>{imp.profNombre}</span>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{imp.asignaturaSigla}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{imp.grupoNombre}</div>
                      </td>
                      <td style={{...styles.td, textAlign: 'center'}}>
                        <span style={{ 
                          padding: '0.4rem 0.8rem', 
                          borderRadius: '8px', 
                          fontSize: '0.9rem',
                          fontWeight: '800',
                          background: imp.desviacion > 5 ? 'rgba(239, 68, 68, 0.15)' : (imp.desviacion < 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)'),
                          color: imp.desviacion > 5 ? '#ff6b6b' : (imp.desviacion < 0 ? '#34d399' : 'var(--text-secondary)')
                        }}>
                          {imp.desviacion > 0 ? `+${imp.desviacion}h` : `${imp.desviacion}h`}
                        </span>
                      </td>
                      <td style={{...styles.td, textAlign: 'center'}}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                          <div style={{...styles.progressBarBg, width: '60px', height: '4px', margin: 0}}>
                            <div style={{...styles.progressBarFill, width: `${imp.progreso}%`}} />
                          </div>
                          <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>{imp.progreso}%</span>
                        </div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={styles.grid}>
            <div className="glass-panel card-hover" style={styles.card} onClick={() => navigate('/management/approvals')}>
              <h3 style={styles.cardTitle}>Solicitudes de Acceso</h3>
              <p style={{...styles.cardNumber, color: dashboardData.pendientesCount > 0 ? 'var(--accent-primary)' : 'var(--text-primary)'}}>
                {dashboardData.pendientesCount}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dashboardData.pendientesCount > 0 ? '#fbbf24' : '#10b981' }}></span>
                Pendientes de aprobación
              </div>
            </div>

            <div className="glass-panel" style={styles.card}>
              <h3 style={styles.cardTitle}>Alertas Críticas</h3>
              <p style={{...styles.cardNumber, color: dashboardData.alertasCount > 0 ? '#ef4444' : '#10b981'}}>
                {dashboardData.alertasCount}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Imparticiones con {'>'}5h retraso</p>
            </div>

            <div className="glass-panel" style={styles.card}>
              <h3 style={styles.cardTitle}>Seguimiento Inactivo</h3>
              <p style={{...styles.cardNumber, color: dashboardData.inactivosCount > (dashboardData.profesoresCount * 0.2) ? '#f59e0b' : 'var(--text-primary)'}}>
                {dashboardData.inactivosCount}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Profesores sin actualizar en {'>'}7 días</p>
            </div>

            <div className="glass-panel" style={styles.card}>
              <h3 style={styles.cardTitle}>Ausencias Hoy</h3>
              <p style={{...styles.cardNumber, color: dashboardData.ausenciasHoyCentro > 0 ? '#fbbf24' : 'var(--text-primary)'}}>
                {dashboardData.ausenciasHoyCentro}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Profesores ausentes en el centro</p>
            </div>
          </div>

          <div style={styles.adminFlexGrid}>
            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', flex: 1.5 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.5rem' }}>Top 5 Retrasos (Críticos)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {dashboardData.topDelays.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No hay imparticiones con retraso significativo.</p>
                ) : (
                  dashboardData.topDelays.map(imp => (
                    <div 
                      key={imp.id} 
                      className="card-hover"
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '1rem', 
                        padding: '1rem', 
                        background: 'rgba(255,255,255,0.03)', 
                        borderRadius: '16px',
                        cursor: 'pointer' 
                      }}
                      onClick={() => {
                        const mainContent = document.getElementById('main-content');
                        if (mainContent) sessionStorage.setItem('home_scroll_pos', mainContent.scrollTop);
                        navigate(`/profesor/programaciones/${imp.id}/seguimiento?readOnly=true`);
                      }}
                    >
                      <img src={imp.profFoto || 'https://via.placeholder.com/40'} style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'cover' }} alt="" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>{imp.profNombre}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{imp.asignaturaSigla} - {imp.grupoNombre}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#ef4444', fontWeight: '900', fontSize: '1.1rem' }}>+{imp.desviacion}h</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Desviación</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', flex: 1 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1.5rem' }}>Progreso por Departamento</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                {dashboardData.deptStats.map(dept => (
                  <div key={dept.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: '600' }}>{dept.name}</span>
                      <span style={{ fontWeight: '800', color: 'var(--accent-primary)' }}>{dept.avgProgreso}%</span>
                    </div>
                    <div style={{...styles.progressBarBg, height: '4px'}}>
                      <div style={{...styles.progressBarFill, width: `${dept.avgProgreso}%`}} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1rem' }}>Resumen Ejecutivo del Centro</h3>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--accent-primary)' }}>{dashboardData.progresoGlobal}%</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Progreso Medio</p>
              </div>
              <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
              <div>
                <p style={{ fontSize: '2rem', fontWeight: '900', color: dashboardData.alertasCount > 0 ? '#ef4444' : '#10b981' }}>{dashboardData.alertasCount}</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Alertas Críticas</p>
              </div>
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '2rem',
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
    padding: '1.2rem 0.5rem',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    fontSize: '0.95rem'
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
  }
};
