import xml.etree.ElementTree as ET
import datetime
import glob
import os

# Configuración
FESTIVOS_FILE = "festivos.xml"
PROGRAMACIONES_FILE = "programaciones.xml"
TRACKING_PATTERN = "seguimiento-*.xml"

def parse_date(date_str):
    if not date_str:
        return None
    try:
        parts = date_str.split('-')
        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
        if y < 100: y += 2000
        return datetime.date(y, m, d)
    except (ValueError, IndexError):
        return None

def load_holidays(filepath):
    holidays = set()
    if os.path.exists(filepath):
        try:
            tree = ET.parse(filepath)
            for festivo in tree.getroot().findall('festivo'):
                d = parse_date(festivo.text)
                if d: holidays.add(d)
        except Exception: pass
    return holidays

def load_teacher_absences(teacher_name):
    """Carga las faltas del archivo faltas-Nombre.xml"""
    absences = set()
    filepath = f"faltas-{teacher_name}.xml"
    if os.path.exists(filepath):
        try:
            tree = ET.parse(filepath)
            for falta in tree.getroot().findall('falta'):
                d = parse_date(falta.text)
                if d: absences.add(d)
        except Exception: pass
    return absences

def load_programaciones(filepath):
    db = {}
    if not os.path.exists(filepath): return db
    try:
        tree = ET.parse(filepath)
        root = tree.getroot()
        for dept in root.findall('departamento'):
            for curso in dept.findall('curso'):
                course_name = curso.get('nombre')
                for asignatura in curso.findall('asignatura'):
                    subject_name = asignatura.get('nombre')
                    grupo = asignatura.find('grupo')
                    if grupo is None: continue
                    
                    group_id = grupo.get('id')
                    profe = grupo.get('profe')
                    
                    week_schedule = []
                    for day in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']:
                        val = grupo.get(day)
                        week_schedule.append(int(val) if val else 0)
                    
                    topics = {t.get('n'): float(t.get('horas')) for t in asignatura.findall('tema') if t.get('n') and t.get('horas')}
                    
                    db[(group_id, subject_name)] = {
                        'group_acronym': course_name,
                        'profe': profe,
                        'schedule': week_schedule,
                        'topics': topics
                    }
    except Exception: pass
    return db

def get_teaching_minutes(start_date, end_date, schedule, holidays, absences):
    total_sessions = 0
    current = start_date
    while current <= end_date:
        if current.weekday() < 5: # Lunes a Viernes
            if current not in holidays and current not in absences:
                total_sessions += schedule[current.weekday()]
        current += datetime.timedelta(days=1)
    return total_sessions * 55

def generate_acronym(name):
    stop_words = {'de', 'la', 'en', 'y', 'a', 'los', 'las', 'del', 'al', 'el'}
    words = [w for w in name.split() if w.lower() not in stop_words]
    if not words: return "UNK"
    return "".join([w[0].upper() for w in words]) if len(words) > 1 else words[0][:3].upper()

def main():
    holidays = load_holidays(FESTIVOS_FILE)
    prog_db = load_programaciones(PROGRAMACIONES_FILE)
    results = [] 
    
    files = glob.glob(TRACKING_PATTERN)
    for fpath in files:
        filename = os.path.basename(fpath)
        teacher_name = filename[12:-4] # Extraer "Alberto" de "seguimiento-Alberto.xml"
        absences = load_teacher_absences(teacher_name)
        
        try:
            tree = ET.parse(fpath)
            for asignatura in tree.getroot().findall('asignatura'):
                group_id = asignatura.get('grupo')
                subject_name = asignatura.get('nombre')
                prog_info = prog_db.get((group_id, subject_name))
                
                if not prog_info or prog_info['profe'] != teacher_name:
                    continue
                
                total_deviation = 0
                last_update = datetime.date(2000, 1, 1)
                
                for tema in asignatura.findall('tema'):
                    fini = parse_date(tema.get('fini'))
                    ffin = parse_date(tema.get('ffin'))
                    
                    if fini and fini > last_update: last_update = fini
                    if ffin and ffin > last_update: last_update = ffin
                    
                    if fini and ffin:
                        actual_min = get_teaching_minutes(fini, ffin, prog_info['schedule'], holidays, absences)
                        actual_hours = round(actual_min / 60)
                        target_hours = prog_info['topics'].get(tema.get('n'), 0)
                        total_deviation += (target_hours - actual_hours)
                
                results.append({
                    'group': prog_info['group_acronym'],
                    'module': generate_acronym(subject_name),
                    'deviation': total_deviation,
                    'last_update': last_update if last_update > datetime.date(2000,1,1) else None
                })
        except Exception: continue

    results.sort(key=lambda x: (x['group'], x['module']))

    # Generación HTML con nuevo formato
    html_content = """
    <html>
    <head>
    <meta charset="UTF-8">
    <style>
        body { font-family: sans-serif; padding: 20px; }
        table { border-collapse: collapse; width: 100%; max-width: 800px; }
        th { background-color: #007bff; color: white; text-align: left; padding: 10px; }
        td { border: 1px solid #ddd; padding: 10px; }
        tr:nth-child(even) { background-color: #f2f2f2; }
        .pos { color: #28a745; font-weight: bold; }
        .neg { color: #dc3545; font-weight: bold; }
    </style>
    </head>
    <body>
    <h2>Informe de Seguimiento de Programación</h2>
    <table>
        <tr>
            <th>GRUPO</th>
            <th>MÓDULO</th>
            <th>DESV.</th>
            <th>ACTUALIZADO</th>
        </tr>
    """
    for r in results:
        color = "pos" if r['deviation'] > 0 else "neg" if r['deviation'] < 0 else ""
        sign = "+" if r['deviation'] > 0 else ""
        date_str = r['last_update'].strftime('%Y-%m-%d') if r['last_update'] else "---"
        
        html_content += f"""
        <tr>
            <td>{r['group']}</td>
            <td>{r['module']}</td>
            <td class="{color}">{sign}{r['deviation']:.0f}</td>
            <td>{date_str}</td>
        </tr>"""
    
    html_content += "</table></body></html>"
    
    with open("resultado_seguimiento.html", "w", encoding="utf-8") as f:
        f.write(html_content)
    print("Informe generado: resultado_seguimiento.html")

if __name__ == "__main__":
    main()
