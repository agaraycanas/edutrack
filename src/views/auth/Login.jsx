import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../config/firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      navigate('/home');
    } catch (err) {
      console.error("Error Google Auth:", err);
      setError(`Fallo de Auth Google: ${err.code}`);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/home');
    } catch (err) {
      console.error("Error Email Auth:", err);
      setError(`Error: ${err.code}`);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    setIsForgot(true);
    setResetSent(false);
    setError(null);
  };

  const performPasswordReset = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Por favor, introduce tu correo electrónico');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email, {
        url: window.location.origin + '/login',
      });
      setResetSent(true);
      setError(null);
    } catch (err) {
      console.error("Error Reset Password:", err);
      setError(`Error: ${err.code}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div className="glass-panel animate-fade-in" style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>EduTrack</h1>
          <p>
            {isForgot 
              ? 'Recuperar Contraseña' 
              : (isSignUp ? 'Crear nueva cuenta' : 'Portal para Profesores')}
          </p>
        </div>
        
        {error && <div style={styles.error}>{error}</div>}
        
        {isForgot ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-fade-in">
            {resetSent ? (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={styles.success}>
                  <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>¡Correo enviado!</p>
                  <p style={{ fontSize: '0.8rem' }}>Hemos mandado un enlace de recuperación a <strong>{email}</strong>. Revisa también tu carpeta de spam.</p>
                </div>
                <button 
                  className="btn-primary" 
                  style={{ width: '100%' }}
                  onClick={() => { setIsForgot(false); setResetSent(false); setError(null); }}
                >
                  Volver al inicio de sesión
                </button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.5rem', lineHeight: '1.4' }}>
                  Introduce tu dirección de correo electrónico para recibir un enlace de recuperación.
                </p>
                <form onSubmit={performPasswordReset} style={styles.form}>
                  <div style={styles.inputContainer}>
                    <label style={styles.label}>Correo Electrónico</label>
                    <input 
                      type="email" 
                      placeholder="ejemplo@correo.com" 
                      className="input-field"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
                    {loading ? 'Enviando...' : 'Enviar correo de recuperación'}
                  </button>
                  <button 
                    type="button" 
                    style={styles.cancelButton} 
                    onClick={() => { setIsForgot(false); setError(null); }}
                  >
                    Cancelar
                  </button>
                </form>
              </>
            )}
          </div>
        ) : (
          <div style={{ width: '100%' }} className="animate-fade-in">
            <form onSubmit={handleEmailAuth} style={styles.form}>
              <div style={styles.inputContainer}>
                <label style={styles.label}>Correo Electrónico</label>
                <input 
                  type="email" 
                  placeholder="ejemplo@correo.com" 
                  className="input-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              
              <div style={styles.inputContainer}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={styles.label}>Contraseña</label>
                  {!isSignUp && (
                    <button 
                      type="button" 
                      style={styles.forgotLink} 
                      onClick={handleForgotPassword}
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}
                </div>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  className="input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
                {loading ? 'Cargando...' : (isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión')}
              </button>
            </form>

            <div style={styles.divider}>
              <span style={styles.dividerLine}></span>
              <span style={styles.dividerText}>o continuar con</span>
              <span style={styles.dividerLine}></span>
            </div>

            <button type="button" className="btn-primary" onClick={handleGoogleLogin} style={styles.googleButton}>
              <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: '10px' }}>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1c-4.3 0-7.99 2.48-9.78 6.07l3.66 2.84c.87-2.6 3.3-4.53 6.12-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>

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
        )}
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
  header: { textAlign: 'center' },
  title: {
    fontSize: '2.5rem', fontWeight: '700',
    background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem'
  },
  form: { width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' },
  inputContainer: { display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' },
  label: { fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-secondary)', marginLeft: '0.2rem' },
  divider: {
    width: '100%', display: 'flex', alignItems: 'center', gap: '1rem', margin: '0.5rem 0'
  },
  dividerLine: { flex: 1, height: '1px', background: 'var(--border-color)' },
  dividerText: { fontSize: '0.8rem', color: 'var(--text-secondary)' },
  googleButton: { 
    width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', 
    color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' 
  },
  toggleText: { fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem' },
  toggleLink: {
    background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: '600', marginLeft: '0.5rem'
  },
  cancelButton: {
    background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: '500', fontSize: '0.9rem', marginTop: '0.5rem', alignSelf: 'center'
  },
  error: {
    color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(239, 68, 68, 0.2)', width: '100%', textAlign: 'center', fontSize: '0.85rem'
  },
  success: {
    color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(16, 185, 129, 0.2)', width: '100%', textAlign: 'center', fontSize: '0.85rem'
  },
  forgotLink: {
    background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '500'
  }
};
