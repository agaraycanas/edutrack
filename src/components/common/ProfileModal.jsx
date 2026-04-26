import { useState, useEffect } from 'react';
import { auth, db, storage } from '../../config/firebase';
import { updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Modal from './Modal';

export default function ProfileModal({ isOpen, onClose, userProfile, onUpdate }) {
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [foto, setFoto] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('general'); // 'general' or 'password'

  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    if (userProfile) {
      setNombre(userProfile.nombre || '');
      setApellidos(userProfile.apellidos || '');
      setFoto(userProfile.foto || '');
    }
  }, [userProfile, isOpen]);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Update Firestore
      const userRef = doc(db, 'usuarios', auth.currentUser.uid);
      await updateDoc(userRef, {
        nombre,
        apellidos,
        foto
      });

      // Update Auth Profile (display name)
      await updateProfile(auth.currentUser, {
        displayName: `${nombre} ${apellidos}`,
        photoURL: foto
      });

      showMessage('Perfil actualizado correctamente');
      if (onUpdate) onUpdate();
      // No cerramos automáticamente para que vea el resultado si quiere seguir editando
      // O podemos cerrar después de un delay
      setTimeout(onClose, 2000);
    } catch (error) {
      console.error(error);
      showMessage('Error al actualizar el perfil: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validar tipo y tamaño (opcional pero recomendado)
    if (!file.type.startsWith('image/')) {
      showMessage('Por favor, selecciona una imagen válida', 'error');
      return;
    }

    setUploading(true);
    console.log('Iniciando subida de imagen...', file.name);
    try {
      const storageRef = ref(storage, `profiles/${auth.currentUser.uid}`);
      console.log('Referencia de storage creada:', storageRef.fullPath);
      
      const uploadTask = await uploadBytes(storageRef, file);
      console.log('Imagen subida con éxito:', uploadTask);
      
      const downloadURL = await getDownloadURL(storageRef);
      console.log('URL de descarga obtenida:', downloadURL);
      
      setFoto(downloadURL);
      showMessage('Imagen subida correctamente. No olvides guardar los cambios para aplicarlos.');
    } catch (error) {
      console.error('Error detallado en handleImageUpload:', error);
      let errorMsg = 'Error al subir la imagen';
      if (error.code === 'storage/unauthorized') errorMsg = 'Error: No tienes permiso para subir archivos (revisa las reglas de Storage)';
      if (error.code === 'storage/canceled') errorMsg = 'Subida cancelada';
      showMessage(errorMsg, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showMessage('Las contraseñas no coinciden', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showMessage('La contraseña debe tener al menos 6 caracteres', 'error');
      return;
    }

    setLoading(true);
    try {
      // Re-authenticate first
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      await updatePassword(auth.currentUser, newPassword);
      showMessage('Contraseña actualizada correctamente');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setActiveTab('general'), 2000);
    } catch (error) {
      console.error(error);
      showMessage('Error: verifica tu contraseña actual.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Gestionar Perfil"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading || uploading}>Cancelar</button>
          <button 
            type="button" 
            className="btn-primary" 
            disabled={loading || uploading} 
            onClick={activeTab === 'general' ? handleUpdateProfile : handleChangePassword}
          >
            {uploading ? 'Subiendo...' : (loading ? 'Guardando...' : (activeTab === 'general' ? 'Guardar Cambios' : 'Cambiar Contraseña'))}
          </button>
        </>
      }
    >
      <div style={styles.container}>
        {message.text && (
          <div style={{
            ...styles.message,
            backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            color: message.type === 'success' ? '#10b981' : '#ef4444',
            borderColor: message.type === 'success' ? '#10b981' : '#ef4444'
          }}>
            {message.text}
          </div>
        )}
        <div style={styles.tabs}>
          <button 
            style={{ ...styles.tab, ...(activeTab === 'general' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('general')}
          >
            Datos Personales
          </button>
          <button 
            style={{ ...styles.tab, ...(activeTab === 'password' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('password')}
          >
            Seguridad
          </button>
        </div>

        {activeTab === 'general' ? (
          <div style={styles.form}>
            <div style={styles.avatarSection}>
              <label className="avatar-label" style={styles.avatarLabel} title="Haz clic para cambiar tu avatar">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageUpload} 
                  style={{ display: 'none' }}
                />
                <div style={styles.avatarWrapper}>
                  <img 
                    src={foto || `https://ui-avatars.com/api/?name=${nombre}+${apellidos?.split(' ')[0]}&background=random&color=fff`} 
                    alt="Vista previa" 
                    className="avatar-preview"
                    style={{
                      ...styles.avatarPreview,
                      opacity: uploading ? 0.5 : 1
                    }}
                  />
                  {uploading && (
                    <div style={styles.avatarSpinner}>
                      <div className="spinner-small"></div>
                    </div>
                  )}
                  <div className="avatar-overlay" style={styles.avatarOverlay}>
                    <span>Cambiar</span>
                  </div>
                </div>
              </label>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Haz clic sobre la imagen para cambiar tu avatar
                </p>
              </div>
            </div>
            
            <div style={styles.formGrid}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={nombre} 
                  onChange={(e) => setNombre(e.target.value)} 
                  required 
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Apellidos</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={apellidos} 
                  onChange={(e) => setApellidos(e.target.value)} 
                  required 
                />
              </div>
            </div>
          </div>
        ) : (
          <div style={styles.form}>
            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
              <label className="form-label">Contraseña Actual</label>
              <input 
                type="password" 
                className="input-field" 
                value={currentPassword} 
                onChange={(e) => setCurrentPassword(e.target.value)} 
                required 
              />
            </div>
            <div style={styles.formGrid}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nueva Contraseña</label>
                <input 
                  type="password" 
                  className="input-field" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  required 
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Confirmar Nueva</label>
                <input 
                  type="password" 
                  className="input-field" 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  required 
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  message: {
    padding: '1rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid',
    fontSize: '0.9rem',
    textAlign: 'center',
    marginBottom: '0.5rem',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    marginBottom: '1rem',
  },
  tab: {
    padding: '0.75rem 1.5rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: '500',
    transition: 'all 0.2s ease',
  },
  activeTab: {
    color: 'var(--primary-color)',
    borderBottomColor: 'var(--primary-color)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
  },
  avatarSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  avatarLabel: {
    cursor: 'pointer',
    borderRadius: '50%',
    overflow: 'hidden',
    transition: 'transform 0.2s ease',
  },
  avatarWrapper: {
    position: 'relative',
    width: '100px',
    height: '100px',
  },
  avatarPreview: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '3px solid var(--active-role-color)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    transition: 'all 0.3s ease',
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    opacity: 0,
    transition: 'opacity 0.2s ease',
    borderRadius: '50%',
  },
  avatarSpinner: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  }
};
