import xml.etree.ElementTree as ET
import json
from datetime import datetime, timedelta

def parse_xml_days(file_path):
    tree = ET.parse(file_path)
    root = tree.getroot()
    days = []
    for festivo in root.findall('festivo'):
        date_str = festivo.text.strip()
        parts = date_str.split('-')
        year = int(parts[0]) + 2000
        month = int(parts[1])
        day = int(parts[2])
        date_obj = datetime(year, month, day)
        days.append(date_obj.strftime('%Y-%m-%d'))
    return set(days)

def parse_firestore_days(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    fs_days = set()
    for doc in data.get('documents', []):
        fields = doc['fields']
        start = fields['startDate']['stringValue']
        end = fields.get('endDate', {}).get('stringValue', None)
        if 'nullValue' in fields.get('endDate', {}): end = None
        
        start_dt = datetime.strptime(start, '%Y-%m-%d')
        if end:
            end_dt = datetime.strptime(end, '%Y-%m-%d')
            curr = start_dt
            while curr <= end_dt:
                fs_days.add(curr.strftime('%Y-%m-%d'))
                curr += timedelta(days=1)
        else:
            fs_days.add(start_dt.strftime('%Y-%m-%d'))
            
    return fs_days

xml_days = parse_xml_days(r'd:\curro\web\edutrack\legacy\programaciones\dat\festivos.xml')
fs_days = parse_firestore_days(r'C:\Users\Ax\.gemini\antigravity\brain\18ecf3c0-4e07-430f-9648-513c57353482\.system_generated\steps\450\output.txt')

# Check with 1-day tolerance (Shifted)
shifted_fs_days = set()
for d in fs_days:
    dt = datetime.strptime(d, '%Y-%m-%d')
    shifted_fs_days.add((dt + timedelta(days=1)).strftime('%Y-%m-%d'))

missing = xml_days - shifted_fs_days
extra = shifted_fs_days - xml_days

print(f"XML days: {len(xml_days)}")
print(f"FS days: {len(fs_days)}")
print(f"Missing days (XML but not in FS+1): {len(missing)}")
print(f"Extra days (FS+1 but not in XML): {len(extra)}")

if missing:
    print("\n--- Missing Days ---")
    for m in sorted(list(missing)):
        print(m)
