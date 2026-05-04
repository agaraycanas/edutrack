
import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {
        'projectId': 'edutrack-803e0',
    })

db = firestore.client()

def cleanup_departments():
    old_name = "Informática"
    new_name = "Informática y Comunicaciones"
    ies_id = "ies_rey_fernando"

    print(f"Starting cleanup for {ies_id}...")

    # 1. Update ies_estudios
    studies_ref = db.collection('ies_estudios').where('iesId', '==', ies_id).stream()
    for doc in studies_ref:
        data = doc.to_dict()
        if 'departamentos' in data and old_name in data['departamentos']:
            new_depts = [new_name if d == old_name else d for d in data['departamentos']]
            # Deduplicate
            new_depts = list(set(new_depts))
            print(f"Updating study {doc.id} ({data.get('nombre')}): {data['departamentos']} -> {new_depts}")
            doc.reference.update({'departamentos': new_depts})

    # 2. Update ies_asignaturas
    subjects_ref = db.collection('ies_asignaturas').where('iesId', '==', ies_id).where('departamento', '==', old_name).stream()
    count = 0
    for doc in subjects_ref:
        print(f"Updating subject {doc.id} ({doc.to_dict().get('nombre')})")
        doc.reference.update({'departamento': new_name})
        count += 1
    print(f"Updated {count} subjects.")

    # 3. Update users roles
    users_ref = db.collection('usuarios').where('iesIds', 'array_contains', ies_id).stream()
    for doc in users_ref:
        data = doc.to_dict()
        roles = data.get('roles', [])
        changed = False
        new_roles = []
        for r in roles:
            if r.get('iesId') == ies_id and r.get('departamento') == old_name:
                r['departamento'] = new_name
                changed = True
            new_roles.append(r)
        
        if changed:
            print(f"Updating user {doc.id} roles")
            doc.reference.update({'roles': new_roles})

    print("Cleanup finished.")

if __name__ == "__main__":
    cleanup_departments()
