import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../components/common/Modal';
import { auth, db } from '../../config/firebase';
import { signOut } from 'firebase/auth';
import { collection, getDocs, setDoc, doc, addDoc, deleteDoc, query, where } from 'firebase/firestore';


export default function Register() {
  const [formData, setFormData] = useState({
    nombre: '',
    apellidos: '',
    iesId: '',
    rolSolicitado: 'profesor',
    departamento: ''
  });
  const [iesList, setIesList] = useState([]);
  const [deptList, setDeptList] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checkingRequest, setCheckingRequest] = useState(true);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchIES = async () => {
      const querySnapshot = await getDocs(collection(db, 'ies'));
      const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setIesList(list);
    };

    const checkExistingRequest = async () => {
      if (auth.currentUser) {
        const q = query(
          collection(db, 'solicitudes'), 
          where('userId', '==', auth.currentUser.uid),
          where('estado', '==', 'pendiente')
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          setPendingRequest(querySnapshot.docs[0].data());
        }
      }
      setCheckingRequest(false);
    };

    fetchIES();
    checkExistingRequest();
  }, []);

  // Fetch departments when IES changes
  useEffect(() => {
    const fetchDepts = async () => {
      if (!formData.iesId) {
        setDeptList([]);
        return;
      }
      try {
        const q = query(
          collection(db, 'departamentos'),
          where('iesId', '==', formData.iesId)
        );
        const snapshot = await getDocs(q);
        const depts = snapshot.docs.map(doc => doc.data().nombre);
        // Ordenar alfabéticamente
        depts.sort((a, b) => a.localeCompare(b));
        setDeptList(depts);
      } catch (err) {
        console.error("Error fetching departments:", err);
      }
    };
    fetchDepts();
  }, [formData.iesId]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const email = auth.currentUser?.email;

    // Validación de departamento si el rol lo requiere
    if (['profesor', 'jefe_departamento'].includes(formData.rolSolicitado) && !formData.departamento) {
      setError('Debes seleccionar un departamento');
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
        roles: isAdminSupremo ? [{ iesId: formData.iesId, rol: 'superadmin', estado: 'activo' }] : [], 
        iesIds: [formData.iesId],
        createdAt: new Date()
      });

      // 2. Crear solicitud de rol (Solo si NO es superadmin)
      if (!isAdminSupremo) {
        await addDoc(collection(db, 'solicitudes'), {
          userId: auth.currentUser.uid,
          userName: `${formData.nombre} ${formData.apellidos}`,
          userEmail: email,
          iesId: formData.iesId,
          iesNombre: iesList.find(i => i.id === formData.iesId)?.nombre,
          rol: formData.rolSolicitado,
          departamento: ['profesor', 'jefe_departamento'].includes(formData.rolSolicitado) ? formData.departamento : null,
          estado: 'pendiente',
          createdAt: new Date()
        });
        setModal({
          isOpen: true,
          title: 'Solicitud Enviada',
          message: 'Tu solicitud de acceso ha sido enviada correctamente. Un responsable de tu centro debe aprobar tu perfil. Una vez aprobado, recibirás un correo electrónico de confirmación con un enlace directo para acceder a la plataforma.',
          type: 'success'
        });
      } else {
        setModal({
          isOpen: true,
          title: '¡Bienvenido!',
          message: 'Tu cuenta de Súperadmin ha sido activada automáticamente. Ya puedes empezar a gestionar la plataforma.',
          type: 'success'
        });
      }

      navigate('/home');
    } catch (err) {
      console.error(err);
      setError('Error al procesar el registro');
    } finally {
      setLoading(false);
    }
  };

  if (checkingRequest) {
    return <div style={styles.container}><h2>Verificando solicitudes...</h2></div>;
  }

  if (pendingRequest) {
    return (
      <div style={styles.container}>
        <div className="glass-panel animate-fade-in" style={styles.card}>
          <h1 style={styles.title}>Solicitud en Curso</h1>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <p>Hola <b>{auth.currentUser?.email}</b>,</p>
            <p>Ya tienes una solicitud pendiente para el rol de <b>{pendingRequest.rol.replace('_', ' ').toUpperCase()}</b> {pendingRequest.departamento ? `en el departamento de ${pendingRequest.departamento}` : ''} en <b>{pendingRequest.iesNombre}</b>.</p>
            
            <div style={{ padding: '1.5rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--accent-primary)', margin: '0.5rem 0' }}>
              <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                Tu solicitud está siendo revisada por los responsables del centro. Recibirás un correo electrónico de confirmación en cuanto tu cuenta sea activada.
              </p>
            </div>

            <button 
              className="btn-primary" 
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => signOut(auth).then(() => navigate('/login'))}
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            <option value="alumno">Alumno</option>
          </select>
        </div>

        {['profesor', 'jefe_departamento'].includes(formData.rolSolicitado) && (
          <div className="animate-fade-in" style={styles.field}>
            <label>Departamento</label>
            <select 
              className="input-field" 
              required 
              value={formData.departamento}
              onChange={e => setFormData({...formData, departamento: e.target.value})}
            >
              <option value="">Selecciona un departamento...</option>
              {deptList.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        )}

        <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
          {loading ? 'Procesando...' : 'Enviar Solicitud'}
        </button>
      </form>

      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => {
          setModal({ ...modal, isOpen: false });
          navigate('/home');
        }}
        title={modal.title}
      >
        <p>{modal.message}</p>
      </Modal>
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
