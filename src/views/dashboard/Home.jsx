import DashboardLayout from '../../layouts/DashboardLayout';

export default function Home() {
  return (
    <div className="animate-fade-in">
      <h1 style={{ marginBottom: '2rem' }}>Dashboard General</h1>
      
      <div style={styles.grid}>
        {/* Tarjeta 1 */}
        <div className="glass-panel" style={styles.card}>
          <h3 style={styles.cardTitle}>Total Programaciones</h3>
          <p style={styles.cardNumber}>0</p>
        </div>

        {/* Tarjeta 2 */}
        <div className="glass-panel" style={styles.card}>
          <h3 style={styles.cardTitle}>Horas Impartidas</h3>
          <p style={styles.cardNumber}>0h</p>
        </div>

        {/* Tarjeta 3 */}
        <div className="glass-panel" style={styles.card}>
          <h3 style={styles.cardTitle}>Desviación Global</h3>
          <p style={{...styles.cardNumber, color: 'var(--accent-primary)'}}>0%</p>
        </div>
      </div>

      <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem' }}>
        <h2>Actividad Reciente</h2>
        <p style={{ marginTop: '1rem' }}>No hay datos para mostrar por el momento. Conectaremos esto a Firestore en la siguiente fase.</p>
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
    fontSize: '2.5rem',
    fontWeight: '700',
    color: 'var(--text-primary)'
  }
};
