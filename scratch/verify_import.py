import json
import subprocess
from datetime import datetime

def get_firestore_data():
    cmd = [
        "mcp-invoke", "firebase-mcp-server", "firestore_list_documents",
        "--parent", "projects/edutrack-803e0/databases/(default)/documents",
        "--collectionId", "festivos"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        # The output might be formatted as a string with the file path
        if "The output was large and was saved to:" in result.stdout:
            path = result.stdout.split("file:///")[1].strip()
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return json.loads(result.stdout)
    except:
        print("Error parsing Firestore output")
        return None

def main():
    # Use the latest snapshot I just got if possible, or run it.
    # Since I just did a lot of adds, better to get a fresh one.
    print("Fetching fresh data from Firestore...")
    data = get_firestore_data()
    if not data: return

    documents = data.get('documents', [])
    print(f"Total documents found: {len(documents)}")
    
    # Group by year for better visibility
    by_year = {}
    for doc in documents:
        fields = doc.get('fields', {})
        name = fields.get('nombre', {}).get('stringValue', 'Unknown')
        start = fields.get('startDate', {}).get('stringValue', 'Unknown')
        end = fields.get('endDate', {}).get('stringValue', None)
        
        year = start.split('-')[0]
        if year not in by_year:
            by_year[year] = []
        by_year[year].append((start, end, name))

    for year in sorted(by_year.keys()):
        print(f"\n--- Year {year} ---")
        for start, end, name in sorted(by_year[year]):
            period = f"{start}"
            if end and end != 'null':
                period += f" to {end}"
            print(f"  {period}: {name}")

if __name__ == "__main__":
    main()
