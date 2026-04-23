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
        if current.weekday() < 5:
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
        teacher_file_name = filename[12:-4] 
        absences = load_teacher_absences(teacher_file_name)
        
        try:
            tree = ET.parse(fpath)
            for asignatura in tree.getroot().findall('asignatura'):
                group_id = asignatura.get('grupo')
                subject_name = asignatura.get('nombre')
                prog_info = prog_db.get((group_id, subject_name))
                
                if not prog_info or prog_info['profe'] != teacher_file_name:
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
                    'teacher': prog_info['profe'],
                    'module': generate_acronym(subject_name),
                    'deviation': total_deviation,
                    'last_update': last_update if last_update > datetime.date(2000,1,1) else datetime.date(1900, 1, 1)
                })
        except Exception:
            continue

    # Ordenación: Fecha (antigua a moderna), luego Grupo
    results.sort(key=lambda x: (x['last_update'], x['group']))

    # Generación HTML
    html_content = """
    <html>
    <head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; color: #333; background-color: #f4f7f6; }
        h2 { color: #0056b3; border-bottom: 2px solid #007bff; display: inline-block; padding-bottom: 5px; }
        table { border-collapse: collapse; width: 100%; max-width: 900px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
        th { background-color: #007bff; color: white; text-align: left; padding: 14px; font-size: 0.85em; text-transform: uppercase; letter-spacing: 1px; }
        td { border-bottom: 1px solid #eee; padding: 12px 14px; font-size: 0.95em; }
        tr:last-child td { border-bottom: none; }
        tr:nth-child(even) { background-color: #fcfcfc; }
        tr:hover { background-color: #f1f7ff; }
        .pos { color: #28a745; font-weight: bold; }
        .neg { color: #dc3545; font-weight: bold; }
        .date { font-family: 'Courier New', monospace; color: #666; font-weight: bold; }
        .teacher { font-weight: 600; color: #444; }
    </style>
    </head>
    <body>
    <h2>Informe de Seguimiento de Programación</h2>
    <table>
        <tr>
            <th>GRUPO</th>
            <th>PROFESOR</th>
            <th>MÓDULO</th>
            <th>DESV.</th>
            <th>ACTUALIZADO</th>
        </tr>
    """
    for r in results:
        color_class = "pos" if r['deviation'] > 0 else "neg" if r['deviation'] < 0 else ""
        sign = "+" if r['deviation'] > 0 else ""
        date_str = r['last_update'].strftime('%Y-%m-%d') if r['last_update'] > datetime.date(1900,1,1) else "Pendiente"
        
        html_content += f"""
        <tr>
            <td>{r['group']}</td>
            <td class="teacher">{r['teacher']}</td>
            <td>{r['module']}</td>
            <td class="{color_class}">{sign}{r['deviation']:.0f}</td>
            <td class="date">{date_str}</td>
        </tr>"""
    
    html_content += "</table><p style='font-size: 0.8em; color: #777; margin-top: 20px;'>Ordenado por fecha de actualización ascendente (más antiguos primero).</p></body></html>"
    
    try:
        with open("resultado_seguimiento.html", "w", encoding="utf-8") as f:
            f.write(html_content)
        print(f"Éxito: Se ha generado 'resultado_seguimiento.html' con {len(results)} registros.")
    except Exception as e:
        print(f"Error al escribir el archivo: {e}")

if __name__ == "__main__":
    main()
