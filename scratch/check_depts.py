
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.ApplicationDefault()
firebase_admin.initialize_app(cred, {
    'projectId': 'edutrack-803e0',
})

db = firestore.client()

def check_departamentos():
    collections = ['ies_asignaturas', 'ies_estudios', 'usuarios']
    for coll_name in collections:
        print(f"Checking collection: {coll_name}")
        docs = db.collection(coll_name).stream()
        count = 0
        for doc in docs:
            data = doc.to_dict()
            dept = data.get('departamento')
            if dept == 'Informática':
                print(f"Found 'Informática' in {coll_name}/{doc.id}")
                count += 1
        print(f"Total found in {coll_name}: {count}")

if __name__ == "__main__":
    check_departamentos()
