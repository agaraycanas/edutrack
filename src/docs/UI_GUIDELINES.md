# EduTrack UI/UX Guidelines

## 1. Modals & Notifications
- **No Redundant Confirmation Buttons**: Do NOT add "Aceptar", "Entendido", or "OK" buttons in modals that only serve to display a success or information message. The user should close these modals using the "X" button in the header or by clicking the overlay.
- **Action Modals**: Buttons like "Eliminar", "Guardar", or "Cancelar" are only allowed in modals where a choice or data entry is required.
- **Auto-Closing**: If possible, success messages should be shown via Toast notifications rather than blocking modals.

## 2. Icons & Buttons
- **Trash/Delete Icon**:
    - **Class**: Always use `className="btn-delete"`.
    - **SVG Specification**:
        - `viewBox="0 0 24 24"`
        - `width="18"`
        - `height="18"`
        - `strokeWidth="2"`
        - `strokeLinecap="round"`
        - `strokeLinejoin="round"`
    - **SVG Path**: 
      ```html
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      ```
- **Edit Icon**:
    - **Class**: Always use `className="btn-icon"`.
    - **Dimensions**: Use `18x18` for consistency with the delete button.

## 3. Data Integrity & Logic
- **Teaching Assignments Naming**: Use the pattern `YEAR_GROUP_SUBJ_TEACHER_INITIALS` (e.g., `2526_DAW1_LM_AG`). 
    - Teacher initials should be the first letter of the name and the first letter of the first surname.
- **Department Assignments**:
    - Subjects like **EIE** (Empresa e Iniciativa Emprendedora) and **IPE** (Itinerario Personal para la Empleabilidad) MUST be assigned to the **"Formación y Orientación Laboral"** department.
    - Do NOT assign them to "Informática y Comunicaciones".

## 4. Layout & Forms
- **Group/Subject Order**: In forms where both are selected, the **Grupo** selector must come BEFORE the **Asignatura** selector.
- **Dynamic Filtering**: The subject list must be filtered based on the selected group's level and academic year.
