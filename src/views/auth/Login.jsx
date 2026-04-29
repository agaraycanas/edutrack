import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../../config/firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup
} from 'firebase/auth';

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.error) {
      setError(location.state.error);
    }
  }, [location.state]);

  const ALLOWED_DOMAIN = '@educa.madrid.org';

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      
      if (result.user.email && !result.user.email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
        await auth.signOut();
        setError(`Acceso denegado: Solo se permiten correos de ${ALLOWED_DOMAIN}`);
        return;
      }
      
      navigate('/home');
    } catch (err) {
      console.error("Error Google Auth:", err);
      setError(`Fallo de Auth Google: ${err.message || err.code}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div className="glass-panel animate-fade-in" style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>EduTrack</h1>
          <p style={styles.subtitle}>Gestión Académica Inteligente</p>
        </div>

        <div style={{ width: '100%' }} className="animate-fade-in">
          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              {isSignUp 
                ? 'Para registrarte, utiliza tu cuenta corporativa de EducaMadrid. El registro está limitado a personal docente y alumnos autorizados.'
                : 'Accede de forma segura utilizando tu identidad digital de EducaMadrid.'}
            </p>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button 
            type="button" 
            className="btn-primary" 
            onClick={handleGoogleLogin} 
            disabled={loading}
            style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}
          >
            {loading ? (
               <div className="spinner-small"></div>
            ) : (
              <>
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1c-4.3 0-7.99 2.48-9.78 6.07l3.66 2.84c.87-2.6 3.3-4.53 6.12-4.53z" fill="#fff"/>
                </svg>
                {isSignUp ? 'Registrarse con Google' : 'Entrar con Google'}
              </>
            )}
          </button>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: '600' }}>
              Usa exclusivamente tu cuenta @educa.madrid.org
            </span>
          </div>

          <p style={styles.toggleText}>
            {isSignUp ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'} 
            <button 
              type="button"
              style={styles.toggleLink} 
              onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
            >
              {isSignUp ? 'Entrar' : 'Registrarse'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem',
    background: 'radial-gradient(circle at top left, var(--surface-hover), var(--bg-color))'
  },
  card: {
    width: '100%', maxWidth: '420px', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem'
  },
  header: { textAlign: 'center', marginBottom: '1rem' },
  title: {
    fontSize: '2.5rem', fontWeight: '700',
    background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.2rem'
  },
  subtitle: {
    fontSize: '0.9rem', color: 'var(--text-secondary)', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: '500'
  },
  toggleText: { fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '1.5rem' },
  toggleLink: {
    background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: '600', marginLeft: '0.5rem'
  },
  error: {
    color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(239, 68, 68, 0.2)', width: '100%', textAlign: 'center', fontSize: '0.85rem', marginBottom: '1.5rem'
  }
};
