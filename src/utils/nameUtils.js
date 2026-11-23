const LOWERCASE_PARTICLES = new Set([
  'de', 'del', 'la', 'las', 'los', 'y', 'e', 'i',
  'da', 'do', 'dos', 'das', 'van', 'von'
]);

const capitalizeToken = (token) => {
  if (!token) return '';
  // Preservar abreviatura Mª / M.ª
  if (/^m\.?ª$/i.test(token)) {
    return token.includes('.') ? 'M.ª' : 'Mª';
  }
  // Capitalizar respetando guiones y puntos (ej: García-López, M.José)
  return token
    .split(/([-.'’])/)
    .map((part) => {
      if (!part || /^[-.'’]$/.test(part)) return part;
      if (/^mª$/i.test(part)) return 'Mª';
      return (
        part.charAt(0).toLocaleUpperCase('es-ES') +
        part.slice(1).toLocaleLowerCase('es-ES')
      );
    })
    .join('');
};

/**
 * Normaliza nombres y apellidos en español a formato Title Case,
 * limpiando espacios sobrantes y manteniendo partículas en minúscula.
 */
export const normalizePersonName = (raw, { isSurname = false } = {}) => {
  if (!raw || typeof raw !== 'string') return '';

  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('es-ES');
      if (LOWERCASE_PARTICLES.has(lower) && (isSurname || index > 0)) {
        return lower;
      }
      return capitalizeToken(word);
    })
    .join(' ');
};

/**
 * Devuelve "Nombre PrimerApellido" respetando partículas iniciales del apellido
 * (ej: "Elena de Vega", "Alberto Garay", "Gregorio Ferreras").
 */
export const formatShortName = (nombre, apellidos) => {
  const cleanNombre = normalizePersonName(nombre || '');
  const cleanApellidos = normalizePersonName(apellidos || '', { isSurname: true });
  const surnameList = cleanApellidos ? cleanApellidos.split(' ') : [];

  const firstSurnameParts = [];
  let i = 0;
  while (i < surnameList.length && LOWERCASE_PARTICLES.has(surnameList[i].toLocaleLowerCase('es-ES'))) {
    firstSurnameParts.push(surnameList[i]);
    i++;
  }
  if (i < surnameList.length) {
    firstSurnameParts.push(surnameList[i]);
  }

  return `${cleanNombre} ${firstSurnameParts.join(' ')}`.trim();
};

/**
 * Ordena usuarios alfabéticamente por "apellido1 apellido2, nombre".
 */
export const compareUsersAlphabetically = (a, b) => {
  const keyA = `${(a.apellidos || '').trim()}, ${(a.nombre || '').trim()}`;
  const keyB = `${(b.apellidos || '').trim()}, ${(b.nombre || '').trim()}`;
  return keyA.localeCompare(keyB, 'es', { sensitivity: 'base' });
};

/**
 * Comprueba si una URL de foto corresponde a una foto real de usuario
 * (y no a un placeholder genérico o avatar autogenerado de iniciales).
 */
export const hasRealPhoto = (user) => {
  const url = user?.foto || user?.avatar || '';
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  if (lower.includes('via.placeholder.com')) return false;
  if (lower.includes('ui-avatars.com')) return false;
  return true;
};

export const getUserInitials = (nombre, apellidos) => {
  const n = (nombre || '').trim().charAt(0);
  const a = (apellidos || '').trim().charAt(0);
  return `${n}${a}`.toLocaleUpperCase('es-ES') || '?';
};
