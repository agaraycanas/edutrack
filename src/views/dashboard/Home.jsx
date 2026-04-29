import { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({
    isHoliday: false,
    holidayName: '',
    isAbsence: false,
    absenceReason: '',
    isWeekend: false
  });

  const today = new Date();
  const dateStr = today.toLocaleDateString('es-ES', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
  const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const activeIesId = localStorage.getItem('activeIesId');
        const user = auth.currentUser;
        
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const t = now.getTime();

        const normalizeDate = (d) => {
          if (!d) return null;
          const parts = d.split('-');
          if (parts.length !== 3) return new Date(d);
          const [y, m, d_] = parts;
          const date = new Date(`${y}-${m.padStart(2, '0')}-${d_.padStart(2, '0')}`);
          date.setHours(0,0,0,0);
          return date;
        };

        const isTodayInRange = (range) => {
          const s = normalizeDate(range.startDate);
          const e = range.endDate ? normalizeDate(range.endDate) : s;
          if (!s || !e) return false;
          return t >= s.getTime() && t <= e.getTime();
        };

        let newStatus = {
          isHoliday: false,
          holidayName: '',
          isAbsence: false,
          absenceReason: '',
          isWeekend: [0, 6].includes(now.getDay())
        };

        // 1. Check Holidays
        if (activeIesId) {
          const qF = query(collection(db, 'festivos'), where('iesId', '==', activeIesId));
          const snapF = await getDocs(qF);
          const holidayFound = snapF.docs.find(doc => isTodayInRange(doc.data()));
          if (holidayFound) {
            newStatus.isHoliday = true;
            newStatus.holidayName = holidayFound.data().nombre;
          }
        }

        // 2. Check Absences
        if (user) {
          const qA = query(collection(db, 'profesor_ausencias'), where('userId', '==', user.uid));
          const snapA = await getDocs(qA);
          const absenceFound = snapA.docs.find(doc => isTodayInRange(doc.data()));
          if (absenceFound) {
            newStatus.isAbsence = true;
            newStatus.absenceReason = absenceFound.data().motivo;
          }
        }

        setStatus(newStatus);
      } catch (error) {
        console.error("Error fetching home data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="glass-panel" style={{ marginBottom: '2rem', padding: '2rem', borderLeft: '4px solid var(--accent-primary)' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Estado de hoy
        </p>
        <h1 style={{ fontSize: '2.2rem', fontWeight: '800', marginBottom: '1rem' }}>{capitalizedDate}</h1>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {status.isWeekend && (
            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', padding: '0.5rem 1rem' }}>
              Fin de semana
            </span>
          )}
          {status.isHoliday && (
            <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.5rem 1rem' }}>
              Festivo: {status.holidayName}
            </span>
          )}
          {status.isAbsence && (
            <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '0.5rem 1rem' }}>
              Ausencia registrada: {status.absenceReason}
            </span>
          )}
          {!status.isHoliday && !status.isAbsence && !status.isWeekend && (
            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.5rem 1rem' }}>
              Día lectivo normal
            </span>
          )}
        </div>
      </div>

      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '700' }}>Panel de Control</h2>
      
      <div style={styles.grid}>
        <div className="glass-panel" style={styles.card}>
          <h3 style={styles.cardTitle}>Total Programaciones</h3>
          <p style={styles.cardNumber}>0</p>
        </div>

        <div className="glass-panel" style={styles.card}>
          <h3 style={styles.cardTitle}>Horas Impartidas</h3>
          <p style={styles.cardNumber}>0h</p>
        </div>

        <div className="glass-panel" style={styles.card}>
          <h3 style={styles.cardTitle}>Desviación Global</h3>
          <p style={{...styles.cardNumber, color: 'var(--accent-primary)'}}>0%</p>
        </div>
      </div>

      <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem' }}>Actividad Reciente</h3>
        <p style={{ color: 'var(--text-secondary)' }}>No hay datos para mostrar por el momento. Conectaremos esto a Firestore en la siguiente fase.</p>
      </div>
    </div>
  );
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1.5rem',
  },
  card: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  cardTitle: {
    fontSize: '1rem',
    color: 'var(--text-secondary)',
    fontWeight: '500'
  },
  cardNumber: {
    fontSize: '2rem',
    fontWeight: '700',
    color: 'var(--text-primary)'
  }
};
