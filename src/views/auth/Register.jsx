import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../config/firebase';
import { collection, getDocs, setDoc, doc, addDoc, deleteDoc } from 'firebase/firestore';

export default function Register() {
  const [formData, setFormData] = useState({
    nombre: '',
    apellidos: '',
    iesId: '',
    rolSolicitado: 'profesor'
  });
  const [iesList, setIesList] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchIES = async () => {
      const querySnapshot = await getDocs(collection(db, 'ies'));
      const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const validIds = ['ies_rey_fernando', 'ies_prueba'];
      
      // 1. Borrar duplicados antiguos
      for (const item of list) {
        if (!validIds.includes(item.id)) {
          await deleteDoc(doc(db, 'ies', item.id));
        }
      }

      // 2. Asegurar que los básicos existen
      const defaultIES = [
        { id: 'ies_rey_fernando', nombre: 'IES Rey Fernando VI' },
        { id: 'ies_prueba', nombre: 'IES PRUEBA' }
      ];
      for (const ies of defaultIES) {
        await setDoc(doc(db, 'ies', ies.id), { nombre: ies.nombre });
      }

      // 3. Volver a cargar la lista limpia
      const updatedSnapshot = await getDocs(collection(db, 'ies'));
      setIesList(updatedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchIES();
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const email = auth.currentUser?.email;
    const isEducaMadrid = email?.endsWith('@educa.madrid.org');
    const isDevBypass = email === 'alberto.garay.canas@gmail.com';

    if (!isEducaMadrid && !isDevBypass) {
      setError('Solo se permiten correos @educa.madrid.org');
      setLoading(false);
      return;
    }

    try {
      const isAdminSupremo = email === 'alberto.garay.canas@gmail.com';
      
      // 1. Guardar perfil de usuario
      await setDoc(doc(db, 'usuarios', auth.currentUser.uid), {
        nombre: formData.nombre,
        apellidos: formData.apellidos,
        email: email,
        foto: auth.currentUser.photoURL,
        roles: isAdminSupremo ? [{ iesId: formData.iesId, rol: 'admin', estado: 'activo' }] : [], 
        createdAt: new Date()
      });

      // 2. Crear solicitud de rol (Solo si NO es admin supremo)
      if (!isAdminSupremo) {
        await addDoc(collection(db, 'solicitudes'), {
          userId: auth.currentUser.uid,
          userName: `${formData.nombre} ${formData.apellidos}`,
          userEmail: email,
          iesId: formData.iesId,
          iesNombre: iesList.find(i => i.id === formData.iesId)?.nombre,
          rol: formData.rolSolicitado,
          estado: 'pendiente',
          createdAt: new Date()
        });
        alert('Solicitud enviada. Un responsable debe aprobar tu acceso.');
      } else {
        alert('¡Bienvenido, Admin Supremo! Tu cuenta ha sido activada automáticamente.');
      }

      navigate('/home');
    } catch (err) {
      console.error(err);
      setError('Error al procesar el registro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <form className="glass-panel animate-fade-in" style={styles.card} onSubmit={handleRegister}>
        <h1 style={styles.title}>Completar Perfil</h1>
        <p style={{ marginBottom: '2rem', textAlign: 'center' }}>Identificado como: <b>{auth.currentUser?.email}</b></p>
        
        {error && <div className="error-msg" style={styles.error}>{error}</div>}

        <div style={styles.field}>
          <label>Nombre</label>
          <input 
            type="text" 
            className="input-field" 
            required 
            value={formData.nombre}
            onChange={e => setFormData({...formData, nombre: e.target.value})}
          />
        </div>

        <div style={styles.field}>
          <label>Apellidos</label>
          <input 
            type="text" 
            className="input-field" 
            required 
            value={formData.apellidos}
            onChange={e => setFormData({...formData, apellidos: e.target.value})}
          />
        </div>

        <div style={styles.field}>
          <label>Centro Educativo (IES)</label>
          <select 
            className="input-field" 
            required 
            value={formData.iesId}
            onChange={e => setFormData({...formData, iesId: e.target.value})}
          >
            <option value="">Selecciona un IES...</option>
            {iesList.map(ies => (
              <option key={ies.id} value={ies.id}>{ies.nombre}</option>
            ))}
          </select>
        </div>

        <div style={styles.field}>
          <label>Rol solicitado</label>
          <select 
            className="input-field" 
            required 
            value={formData.rolSolicitado}
            onChange={e => setFormData({...formData, rolSolicitado: e.target.value})}
          >
            <option value="profesor">Profesor</option>
            <option value="jefe_departamento">Jefe de Departamento</option>
            <option value="jefe_estudios">Jefe de Estudios</option>
            <option value="admin">Administrador (Supremo)</option>
          </select>
        </div>

        <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
          {loading ? 'Procesando...' : 'Enviar Solicitud'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem'
  },
  card: {
    width: '100%', maxWidth: '500px', padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem'
  },
  title: {
    fontSize: '2rem', fontWeight: '700', textAlign: 'center', marginBottom: '1rem'
  },
  field: {
    display: 'flex', flexDirection: 'column', gap: '0.5rem'
  },
  error: {
    color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.5rem', textAlign: 'center'
  }
};
