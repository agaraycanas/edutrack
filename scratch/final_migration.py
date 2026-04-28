import xml.etree.ElementTree as ET
import json
from datetime import datetime, timedelta
import unicodedata

def normalize_string(s):
    if not s: return ""
    # Normalize to NFC to handle different ways of representing accented chars
    s = unicodedata.normalize('NFC', s)
    # Map '-' to 'Festivo' as per user instruction
    if s == '-': return 'festivo'
    # Lowercase and remove accents for comparison
    s = s.lower()
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
               if unicodedata.category(c) != 'Mn')
    return s.strip()

def parse_xml(file_path):
    tree = ET.parse(file_path)
    root = tree.getroot()
    
    holidays = []
    for festivo in root.findall('festivo'):
        name = festivo.get('causa')
        date_str = festivo.text.strip()
        
        # Convert YY-M-D to YYYY-MM-DD
        parts = date_str.split('-')
        year = int(parts[0]) + 2000
        month = int(parts[1])
        day = int(parts[2])
        date_obj = datetime(year, month, day)
        
        holidays.append({'name': name, 'date': date_obj})
    
    holidays.sort(key=lambda x: x['date'])
    
    grouped = []
    if not holidays:
        return grouped
        
    current_group = holidays[0]
    start_date = holidays[0]['date']
    end_date = holidays[0]['date']
    
    for i in range(1, len(holidays)):
        h = holidays[i]
        is_next_day = h['date'] == end_date + timedelta(days=1)
        is_weekend_gap = False
        if not is_next_day:
            gap = (h['date'] - end_date).days
            if gap <= 3: # allow gap of up to 3 days if it's the same name (covers weekend)
                is_weekend_gap = True
        
        if h['name'] == current_group['name'] and (is_next_day or is_weekend_gap):
            end_date = h['date']
        else:
            grouped.append({
                'nombre': current_group['name'],
                'startDate': start_date.strftime('%Y-%m-%d'),
                'endDate': end_date.strftime('%Y-%m-%d') if end_date != start_date else None
            })
            current_group = h
            start_date = h['date']
            end_date = h['date']
            
    grouped.append({
        'nombre': current_group['name'],
        'startDate': start_date.strftime('%Y-%m-%d'),
        'endDate': end_date.strftime('%Y-%m-%d') if end_date != start_date else None
    })
    
    return grouped

def parse_firestore_json(file_path):
    # Try different encodings
    for encoding in ['utf-8', 'latin-1', 'windows-1252']:
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                data = json.load(f)
                break
        except:
            continue
    else:
        return []
        
    records = []
    for doc in data.get('documents', []):
        fields = doc.get('fields', {})
        record = {
            'nombre': fields.get('nombre', {}).get('stringValue', ''),
            'startDate': fields.get('startDate', {}).get('stringValue', ''),
            'endDate': fields.get('endDate', {}).get('stringValue', None)
        }
        if record['endDate'] == 'null': # Sometimes it comes as string 'null'
            record['endDate'] = None
        # Handle actual nullValue
        if 'nullValue' in fields.get('endDate', {}):
            record['endDate'] = None
            
        records.append(record)
    return records

def dates_match(xml_start, fs_start, xml_end, fs_end):
    # Tolerate 1-day shift (FS = XML - 1 day)
    try:
        xml_start_dt = datetime.strptime(xml_start, '%Y-%m-%d')
        fs_start_dt = datetime.strptime(fs_start, '%Y-%m-%d')
        
        start_matches = (xml_start_dt == fs_start_dt) or (xml_start_dt == fs_start_dt + timedelta(days=1))
        
        if not xml_end and not fs_end:
            return start_matches
        
        if xml_end and fs_end:
            xml_end_dt = datetime.strptime(xml_end, '%Y-%m-%d')
            fs_end_dt = datetime.strptime(fs_end, '%Y-%m-%d')
            end_matches = (xml_end_dt == fs_end_dt) or (xml_end_dt == fs_end_dt + timedelta(days=1))
            return start_matches and end_matches
    except:
        return False
        
    return False

xml_file = r'd:\curro\web\edutrack\legacy\programaciones\dat\festivos.xml'
fs_file = r'C:\Users\Ax\.gemini\antigravity\brain\18ecf3c0-4e07-430f-9648-513c57353482\.system_generated\steps\450\output.txt'

xml_holidays = parse_xml(xml_file)
fs_holidays = parse_firestore_json(fs_file)

print(f"Total XML grouped holidays: {len(xml_holidays)}")
print(f"Total Firestore holidays: {len(fs_holidays)}")

missing = []
for xh in xml_holidays:
    found = False
    norm_xh_name = normalize_string(xh['nombre'])
    
    for fh in fs_holidays:
        norm_fh_name = normalize_string(fh['nombre'])
        
        if norm_xh_name == norm_fh_name and dates_match(xh['startDate'], fh['startDate'], xh['endDate'], fh['endDate']):
            found = True
            break
            
    if not found:
        missing.append(xh)

print(f"\nMissing holidays: {len(missing)}")
for m in missing:
    print(f"Name: {m['nombre']}, Start: {m['startDate']}, End: {m['endDate']}")

# Generate the JSON for mass import or just print it
if missing:
    import_data = []
    for m in missing:
        # Prepare for Firestore
        # Normalize name for storage if it was '-'
        name = m['nombre']
        if name == '-': name = 'Festivo'
        
        import_data.append({
            'nombre': name,
            'startDate': m['startDate'],
            'endDate': m['endDate'],
            'iesId': 'ies_rey_fernando',
            'updatedAt': datetime.utcnow().isoformat() + 'Z'
        })
    
    with open(r'd:\curro\web\edutrack\scratch\missing_holidays.json', 'w', encoding='utf-8') as f:
        json.dump(import_data, f, indent=2, ensure_ascii=False)
    print(f"\nSaved {len(import_data)} missing holidays to scratch\missing_holidays.json")
