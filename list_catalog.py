import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('c:/Users/Alberto/Desktop/Edutrack/serviceAccountKey.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

studies = db.collection('oferta_educativa').get()
for study in studies:
    data = study.to_dict()
    print(f"ID: {study.id} | Nombre: {data.get('nombre')} | Tipo: {data.get('tipo')}")
    asignaturas = data.get('asignaturas', [])
    for asig in asignaturas:
        print(f"  - [{asig.get('curso')}º] {asig.get('sigla')}: {asig.get('nombre')}")
    print("-" * 40)
