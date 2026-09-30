import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../../config/firebase';
import { 
  sendSignInLinkToEmail, 
  isSignInWithEmailLink, 
  signInWithEmailLink,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function Login() {
  const [authMode, setAuthMode] = useState('magic_link'); // 'magic_link' (default) | 'password' | 'reset_password' | 'set_new_password'
  const [userInput, setUserInput] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetAccountEmail, setResetAccountEmail] = useState('');
  const [resetCode, setResetCode] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [sentToEmail, setSentToEmail] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [verifyingLink, setVerifyingLink] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const authAttemptedRef = useRef(false);
  const magicLinkUrlRef = useRef(window.location.href);

  const navigate = useNavigate();
  const location = useLocation();

  const ALLOWED_DOMAIN = '@educa.madrid.org';

  // Helper para normalizar y validar el usuario/correo
  const formatEducaEmail = (rawInput) => {
    if (!rawInput) return { email: null, error: 'Por favor, introduce tu usuario o correo de EducaMadrid.' };
    
    let clean = rawInput.trim().toLowerCase();
    
    // Si no tiene @, autocompletamos con @educa.madrid.org
    if (!clean.includes('@')) {
      clean = `${clean}${ALLOWED_DOMAIN}`;
    }

    // Validación estricta de dominio
    if (!clean.endsWith(ALLOWED_DOMAIN)) {
      return { 
        email: null, 
        error: `Acceso restringido: Solo se permiten cuentas oficiales ${ALLOWED_DOMAIN}. Otros dominios no están autorizados.` 
      };
    }

    return { email: clean, error: null };
  };

  // Manejar mensajes de error que vengan de redirecciones
  useEffect(() => {
    if (location.state?.error) {
      if (location.state.error === 'unregistered') {
        setError('Tu cuenta de EducaMadrid no está registrada en EduTrack. Por favor, completa tu registro para activar tu perfil.');
      } else if (location.state.error === 'dominio') {
        setError(`Acceso denegado: Solo se permiten correos de ${ALLOWED_DOMAIN}`);
      } else {
        setError(location.state.error);
      }
    }
  }, [location.state]);

  // Detectar y procesar parámetros de URL (Enlace Mágico o Restablecimiento de Contraseña)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const mode = searchParams.get('mode');
    const oobCode = searchParams.get('oobCode');

    // Caso A: Viene de un correo para Establecer / Restablecer Contraseña
    if (mode === 'resetPassword' && oobCode && !authAttemptedRef.current) {
      authAttemptedRef.current = true;
      setVerifyingLink(true);
      verifyPasswordResetCode(auth, oobCode)
        .then((accountEmail) => {
          setResetAccountEmail(accountEmail);
          setResetCode(oobCode);
          setAuthMode('set_new_password');
          setVerifyingLink(false);
        })
        .catch((err) => {
          console.error("Error verificando código de contraseña:", err);
          setError('El enlace para crear o cambiar la contraseña ha caducado o ya fue utilizado. Por favor, solicita uno nuevo.');
          setVerifyingLink(false);
        });
      return;
    }

    // Caso B: Viene de un Enlace Mágico sin contraseña
    if (isSignInWithEmailLink(auth, window.location.href) && !authAttemptedRef.current) {
      authAttemptedRef.current = true;
      magicLinkUrlRef.current = window.location.href;
      
      let savedEmail = window.localStorage.getItem('emailForSignIn');
      if (!savedEmail) {
        setNeedsEmailConfirmation(true);
      } else {
        processEmailLinkSignIn(savedEmail, window.location.href);
      }
    }
  }, []);

  const processEmailLinkSignIn = async (emailToUse, targetUrl) => {
    setVerifyingLink(true);
    setError(null);
    try {
      const { email: cleanEmail, error: formatErr } = formatEducaEmail(emailToUse);
      if (formatErr) {
        setError(formatErr);
        setVerifyingLink(false);
        setNeedsEmailConfirmation(true);
        return;
      }

      const urlToUse = targetUrl || magicLinkUrlRef.current || window.location.href;
      const result = await signInWithEmailLink(auth, cleanEmail, urlToUse);
      window.localStorage.removeItem('emailForSignIn');
      
      // Limpiar URL
      window.history.replaceState({}, document.title, window.location.pathname);

      if (result.user.email && !result.user.email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
        await auth.signOut();
        setError(`Acceso denegado: Solo se permiten correos de ${ALLOWED_DOMAIN}`);
        setVerifyingLink(false);
        return;
      }

      // Redirección según perfil existente
      const docRef = doc(db, 'usuarios', result.user.uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        navigate('/home');
      } else {
        navigate('/register');
      }
    } catch (err) {
      console.error("Error al validar enlace:", err);
      let msg = 'El enlace de acceso ha caducado, no es válido o ya fue utilizado. Por favor, solicita uno nuevo.';
      if (err.code === 'auth/invalid-action-code') {
        msg = 'Este enlace ya fue utilizado o ha sido invalidado por una solicitud posterior. Solicita un nuevo enlace.';
      }
      setError(msg);
      setVerifyingLink(false);
      setNeedsEmailConfirmation(false);
    }
  };

  // MODO 1: Enviar Enlace Mágico por Correo (Por defecto)
  const handleSendMagicLink = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { email: cleanEmail, error: formatErr } = formatEducaEmail(userInput);
    if (formatErr) {
      setError(formatErr);
      setLoading(false);
      return;
    }

    const actionCodeSettings = {
      url: window.location.origin + '/login',
      handleCodeInApp: true,
    };

    try {
      await sendSignInLinkToEmail(auth, cleanEmail, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', cleanEmail);
      setSentToEmail(cleanEmail);
      setEmailSent(true);
    } catch (err) {
      console.error("Error enviando enlace:", err);
      setError(`Error al enviar el correo: ${err.message || 'Inténtalo de nuevo en unos minutos.'}`);
    } finally {
      setLoading(false);
    }
  };

  // MODO 2: Login tradicional con Contraseña
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { email: cleanEmail, error: formatErr } = formatEducaEmail(userInput);
    if (formatErr) {
      setError(formatErr);
      setLoading(false);
      return;
    }

    try {
      const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
      
      if (result.user.email && !result.user.email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
        await auth.signOut();
        setError(`Acceso denegado: Solo se permiten correos de ${ALLOWED_DOMAIN}`);
        setLoading(false);
        return;
      }

      const docRef = doc(db, 'usuarios', result.user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        navigate('/home');
      } else {
        navigate('/register');
      }
    } catch (err) {
      console.error("Error login contraseña:", err);
      let msg = 'Usuario o contraseña incorrectos.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        msg = 'Credenciales no válidas. Si aún no has creado contraseña, pulsa en "¿Crear / Olvidé mi contraseña?".';
      } else if (err.code === 'auth/wrong-password') {
        msg = 'Contraseña incorrecta. Puedes restablecerla abajo.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Demasiados intentos fallidos. Inténtalo más tarde o usa el enlace por correo.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // MODO 3: Enviar correo para Crear / Recuperar Contraseña
  const handleSendResetPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { email: cleanEmail, error: formatErr } = formatEducaEmail(userInput);
    if (formatErr) {
      setError(formatErr);
      setLoading(false);
      return;
    }

    const actionCodeSettings = {
      url: window.location.origin + '/login',
      handleCodeInApp: true,
    };

    try {
      await sendPasswordResetEmail(auth, cleanEmail, actionCodeSettings);
      setSentToEmail(cleanEmail);
      setResetEmailSent(true);
    } catch (err) {
      console.error("Error reset password:", err);
      setError(`Error al enviar el correo: ${err.message || 'Comprueba los datos introducidos.'}`);
    } finally {
      setLoading(false);
    }
  };

  // MODO 4: Guardar nueva contraseña directamente en la web
  const handleSaveNewPassword = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(auth, resetCode, newPassword);
      
      // Auto login con la nueva contraseña
      const result = await signInWithEmailAndPassword(auth, resetAccountEmail, newPassword);
      window.history.replaceState({}, document.title, window.location.pathname);

      const docRef = doc(db, 'usuarios', result.user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        navigate('/home');
      } else {
        navigate('/register');
      }
    } catch (err) {
      console.error("Error guardando nueva clave:", err);
      setError(`Error al guardar la contraseña: ${err.message || 'El enlace ha caducado. Vuelve a solicitarlo.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmEmailSubmit = (e) => {
    e.preventDefault();
    if (!confirmInput.trim()) {
      setError('Por favor, introduce tu usuario o correo.');
      return;
    }
    processEmailLinkSignIn(confirmInput, magicLinkUrlRef.current);
  };

  // 1. Pantalla de carga mientras se valida enlace
  if (verifyingLink) {
    return (
      <div style={styles.container}>
        <div className="glass-panel animate-fade-in" style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>EduTrack</h1>
            <p style={styles.subtitle}>Gestión Académica</p>
          </div>
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div className="spinner-small" style={{ margin: '0 auto 1.5rem', width: '32px', height: '32px' }}></div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Verificando enlace...</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Conectando de forma segura con tu cuenta.</p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Pantalla para definir nueva contraseña directamente en EduTrack
  if (authMode === 'set_new_password') {
    return (
      <div style={styles.container}>
        <div className="glass-panel animate-fade-in" style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>EduTrack</h1>
            <p style={styles.subtitle}>Definir Contraseña</p>
          </div>

          <div style={{ width: '100%' }}>
            <div style={{ 
              background: 'var(--surface-hover)', 
              padding: '0.75rem 1rem', 
              borderRadius: 'var(--radius-md)', 
              marginBottom: '1.2rem',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cuenta:</span>
              <div style={{ fontWeight: '600', color: 'var(--accent-primary)', marginTop: '2px' }}>{resetAccountEmail}</div>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <form onSubmit={handleSaveNewPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={styles.label}>Nueva Contraseña (mínimo 6 caracteres)</label>
                <input 
                  type="password" 
                  className="input-field" 
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                  style={{ width: '100%', padding: '0.85rem' }}
                />
              </div>

              <div>
                <label style={styles.label}>Repite la Nueva Contraseña</label>
                <input 
                  type="password" 
                  className="input-field" 
                  placeholder="••••••••"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.85rem' }}
                />
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                disabled={loading}
                style={{ width: '100%', padding: '1rem', marginTop: '0.5rem' }}
              >
                {loading ? <div className="spinner-small"></div> : 'Guardar Contraseña y Entrar'}
              </button>
            </form>

            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <button 
                type="button" 
                onClick={() => { setAuthMode('password'); setError(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                ← Cancelar e ir a Inicio de Sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Pantalla si se abrió el enlace en otro navegador/dispositivo
  if (needsEmailConfirmation) {
    return (
      <div style={styles.container}>
        <div className="glass-panel animate-fade-in" style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>EduTrack</h1>
            <p style={styles.subtitle}>Confirmación de Acceso</p>
          </div>

          <div style={{ width: '100%' }}>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', textAlign: 'center', lineHeight: '1.5' }}>
              Has abierto el enlace en un navegador o dispositivo nuevo. Introduce tu usuario o correo de EducaMadrid para entrar.
            </p>

            {error && <div style={styles.error}>{error}</div>}

            <form onSubmit={handleConfirmEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={styles.label}>Usuario o Correo de EducaMadrid</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="tu_usuario o tu_usuario@educa.madrid.org"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  required
                  autoFocus
                  style={{ width: '100%' }}
                />
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                style={{ width: '100%', padding: '1rem', marginTop: '0.5rem' }}
              >
                Completar Acceso
              </button>
            </form>

            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <button 
                type="button" 
                onClick={() => { setNeedsEmailConfirmation(false); setError(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                ← Volver a la pantalla principal
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. Pantalla de Enlace Mágico Enviado
  if (emailSent) {
    return (
      <div style={styles.container}>
        <div className="glass-panel animate-fade-in" style={styles.card}>
          <div style={styles.header}>
            <div style={{ 
              width: '64px', 
              height: '64px', 
              borderRadius: '50%', 
              background: 'rgba(99, 102, 241, 0.15)', 
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            <h1 style={{ ...styles.title, fontSize: '2rem' }}>¡Enlace Enviado!</h1>
            <p style={styles.subtitle}>Revisa tu buzón de EducaMadrid</p>
          </div>

          <div style={{ width: '100%', textAlign: 'center' }}>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.8rem', lineHeight: '1.5' }}>
              Hemos enviado el enlace de acceso directo a:
            </p>
            <div style={{ 
              background: 'var(--surface-hover)', 
              padding: '0.75rem 1rem', 
              borderRadius: 'var(--radius-md)', 
              fontWeight: '600',
              color: 'var(--accent-primary)',
              wordBreak: 'break-all',
              marginBottom: '1.2rem'
            }}>
              {sentToEmail}
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '1.8rem' }}>
              Abre el correo y pulsa en el enlace para entrar directamente. Si no lo encuentras, revisa tu carpeta de correo no deseado.
            </p>

            <button 
              type="button" 
              className="btn-primary" 
              onClick={() => { setEmailSent(false); setError(null); }}
              style={{ width: '100%', padding: '0.85rem', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            >
              Volver / Solicitar nuevo enlace
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5. Pantalla de Correo para Crear/Restablecer Contraseña Enviado
  if (resetEmailSent) {
    return (
      <div style={styles.container}>
        <div className="glass-panel animate-fade-in" style={styles.card}>
          <div style={styles.header}>
            <div style={{ 
              width: '64px', 
              height: '64px', 
              borderRadius: '50%', 
              background: 'rgba(34, 197, 94, 0.15)', 
              color: '#22c55e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h1 style={{ ...styles.title, fontSize: '1.8rem' }}>Correo Enviado</h1>
            <p style={styles.subtitle}>Definir Contraseña</p>
          </div>

          <div style={{ width: '100%', textAlign: 'center' }}>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.8rem', lineHeight: '1.5' }}>
              Hemos enviado las instrucciones para establecer tu contraseña a:
            </p>
            <div style={{ 
              background: 'var(--surface-hover)', 
              padding: '0.75rem 1rem', 
              borderRadius: 'var(--radius-md)', 
              fontWeight: '600',
              color: 'var(--accent-primary)',
              wordBreak: 'break-all',
              marginBottom: '1.2rem'
            }}>
              {sentToEmail}
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '1.8rem' }}>
              Abre el enlace recibido en tu correo para definir tu contraseña y entrarás automáticamente a EduTrack.
            </p>

            <button 
              type="button" 
              className="btn-primary" 
              onClick={() => { setResetEmailSent(false); setAuthMode('password'); setError(null); }}
              style={{ width: '100%', padding: '0.85rem' }}
            >
              Ir a Iniciar Sesión con Contraseña
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 6. Pantalla Principal de Login
  return (
    <div style={styles.container}>
      <div className="glass-panel animate-fade-in" style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>EduTrack</h1>
          <p style={styles.subtitle}>Gestión Académica Inteligente</p>
        </div>

        {/* Pestañas de modo de acceso: Enlace por Correo (1º y defecto) | Contraseña (2º) */}
        <div style={styles.tabContainer}>
          <button 
            type="button"
            style={{ 
              ...styles.tabButton, 
              borderBottomColor: authMode === 'magic_link' ? 'var(--accent-primary)' : 'transparent',
              color: authMode === 'magic_link' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontWeight: authMode === 'magic_link' ? '600' : '400'
            }}
            onClick={() => { setAuthMode('magic_link'); setError(null); }}
          >
            Enlace por Correo
          </button>
          <button 
            type="button"
            style={{ 
              ...styles.tabButton, 
              borderBottomColor: authMode === 'password' ? 'var(--accent-primary)' : 'transparent',
              color: authMode === 'password' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontWeight: authMode === 'password' ? '600' : '400'
            }}
            onClick={() => { setAuthMode('password'); setError(null); }}
          >
            Contraseña
          </button>
        </div>

        <div style={{ width: '100%' }} className="animate-fade-in">
          {error && <div style={styles.error}>{error}</div>}

          {/* MODO 1: ENLACE MÁGICO POR CORREO (PREDETERMINADO) */}
          {authMode === 'magic_link' && (
            <form onSubmit={handleSendMagicLink} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: '1.5' }}>
                Accede de forma rápida y segura sin contraseñas. Te enviaremos un enlace de acceso directo a tu buzón oficial de EducaMadrid.
              </p>

              <div>
                <label style={styles.label}>Usuario o Correo de EducaMadrid</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="tu_usuario o tu_usuario@educa.madrid.org"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  required
                  autoFocus
                  style={{ width: '100%', padding: '0.85rem' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem', display: 'block' }}>
                  * Si introduces solo tu nombre de usuario, se añadirá automáticamente @educa.madrid.org
                </span>
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                disabled={loading}
                style={{ width: '100%', padding: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {loading ? (
                  <div className="spinner-small"></div>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                      <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    Enviar Enlace de Acceso
                  </>
                )}
              </button>
            </form>
          )}

          {/* MODO 2: CONTRASEÑA */}
          {authMode === 'password' && (
            <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div>
                <label style={styles.label}>Usuario o Correo de EducaMadrid</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="tu_usuario o tu_usuario@educa.madrid.org"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  required
                  autoFocus
                  style={{ width: '100%', padding: '0.85rem' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={styles.label}>Contraseña</label>
                  <button 
                    type="button"
                    onClick={() => { setAuthMode('reset_password'); setError(null); }}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    ¿Crear / Olvidé mi contraseña?
                  </button>
                </div>
                <input 
                  type="password" 
                  className="input-field" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.85rem' }}
                />
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                disabled={loading}
                style={{ width: '100%', padding: '1rem', fontSize: '1rem', marginTop: '0.5rem' }}
              >
                {loading ? <div className="spinner-small"></div> : 'Entrar a EduTrack'}
              </button>
            </form>
          )}

          {/* MODO 3: CREAR / RECUPERAR CONTRASEÑA */}
          {authMode === 'reset_password' && (
            <form onSubmit={handleSendResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.4rem' }}>Establecer Contraseña</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  Si antes entrabas con Google o quieres definir una clave, te enviaremos un correo para que la crees ahora mismo.
                </p>
              </div>

              <div>
                <label style={styles.label}>Usuario o Correo de EducaMadrid</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="tu_usuario o tu_usuario@educa.madrid.org"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  required
                  autoFocus
                  style={{ width: '100%', padding: '0.85rem' }}
                />
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                disabled={loading}
                style={{ width: '100%', padding: '1rem', fontSize: '1rem' }}
              >
                {loading ? <div className="spinner-small"></div> : 'Enviar Correo para Crear Contraseña'}
              </button>

              <button 
                type="button" 
                onClick={() => { setAuthMode('password'); setError(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                ← Volver al login con contraseña
              </button>
            </form>
          )}

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--accent-primary)', fontWeight: '600' }}>
              Válido exclusivamente para cuentas @educa.madrid.org
            </span>
          </div>
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
    width: '100%', maxWidth: '440px', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.2rem'
  },
  header: { textAlign: 'center', marginBottom: '0.2rem' },
  title: {
    fontSize: '2.5rem', fontWeight: '700',
    background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.2rem'
  },
  subtitle: {
    fontSize: '0.85rem', color: 'var(--text-secondary)', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: '500'
  },
  tabContainer: {
    display: 'flex', width: '100%', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem'
  },
  tabButton: {
    flex: 1, padding: '0.75rem', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontSize: '0.95rem', transition: 'all 0.2s'
  },
  label: {
    display: 'block', fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '0.4rem'
  },
  error: {
    color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(239, 68, 68, 0.2)', width: '100%', textAlign: 'center', fontSize: '0.85rem', marginBottom: '1.2rem'
  }
};
