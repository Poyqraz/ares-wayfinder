#!/usr/bin/env python3
"""Download official Three Forks PDS records and export tube-related rover drop
positions, never mislabeling a rover position as the ground tube coordinate.
Standard-library only, internet access required when running on a local computer.
"""
import csv, hashlib, json, pathlib, re, urllib.request, xml.etree.ElementTree as ET

ROOT=pathlib.Path(__file__).resolve().parent
RAW=ROOT/'m0_source'; RAW.mkdir(exist_ok=True)
BASE='https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/miscellaneous/sample_metadata/'
FILES=['sample_tube_locations.csv','sample_tube_locations.xml','sample_tube_identifiers.csv','sample_tube_identifiers.xml','sample_tube_targets.csv','sample_tube_targets.xml']
SAMPLES=[('Malay','M2020-00337-08',653),('Mageik','M2020-00579-17',655),('Crosswind Lake','M2020-00639-21',661),('Roubion','M2020-00164-02',666),('Coulettes','M2020-00271-06',668),('Montdenier','M2020-00190-03',672),('Bearwallow','M2020-00516-15',675),('Skyland','M2020-00495-12',680),('Atsah','M2020-00374-10',682),('Amalik Witness','M2020-00586-18',690)]

def get(name):
    url=BASE+name
    req=urllib.request.Request(url,headers={'User-Agent':'ARES1-Hackathon-Science-QA/1.0'})
    data=urllib.request.urlopen(req,timeout=60).read()
    if not data:raise ValueError('Empty response '+url)
    (RAW/name).write_bytes(data)
    return data

def norm(v):return re.sub(r'[^a-z0-9]+','_',str(v).lower()).strip('_')

def label_columns(path):
    root=ET.parse(path).getroot()
    tables=root.findall('.//{*}Table_Delimited') + root.findall('.//{*}Table_Character')
    if len(tables)!=1:raise ValueError(f'Expected exactly one PDS table, found {len(tables)} in {path.name}')
    fields=tables[0].findall('.//{*}Field_Delimited')+tables[0].findall('.//{*}Field_Character')
    fields=sorted(fields,key=lambda x:int(x.findtext('./{*}field_number') or 9999))
    names=[(f.findtext('./{*}name') or '').strip() for f in fields]
    if not names or any(not x for x in names):raise ValueError('Unrecognized PDS field schema')
    return names

def parse_table(stem):
    names=label_columns(RAW/(stem+'.xml'))
    rows=list(csv.reader((RAW/(stem+'.csv')).open(encoding='utf-8-sig',newline='')))
    rows=[row for row in rows if row]
    if rows and [norm(x) for x in rows[0]]==[norm(x) for x in names]: rows.pop(0)
    if any(len(row)!=len(names) for row in rows):
        raise ValueError(f'{stem}: row-width mismatch. PDS label: {names}; first row: {rows[:1]}')
    return [dict(zip(names,row)) for row in rows],names

def search_field(row,*terms):
    for k,v in row.items():
        n=norm(k)
        if all(term in n for term in terms):return v
    return ''

def search_column(names,*terms):
    return [x for x in names if all(term in norm(x) for term in terms)]

def locate_sample(row,locations):
    serialized=' '.join(str(v) for v in row.values()).lower()
    for name,ident,sol in SAMPLES:
        if ident.lower() in serialized or name.lower() in serialized:
            return (name,ident,sol)
    # Strict Sol matching only if unique event sol identified in field name.
    cols=[v for k,v in row.items() if 'drop_sol' in norm(k) or norm(k)=='sol']
    for v in cols:
        if str(v).strip().isdigit():
            matches=[s for s in SAMPLES if int(v)==s[2]]
            if len(matches)==1:return matches[0]
    return None

def main():
    files=[]
    for f in FILES:
        data=get(f);files.append({'filename':f,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'url':BASE+f})
    locations,lcols=parse_table('sample_tube_locations')
    identifiers,icols=parse_table('sample_tube_identifiers')
    targets,tcols=parse_table('sample_tube_targets')
    print('LOCATION FIELDS:',lcols)
    print('IDENTIFIER FIELDS:',icols)
    print('TARGET FIELDS:',tcols)
    # Publish source values unmodified for human inspection. Never invent a tube position.
    report={'download':'SUCCESS','source_files':files,'location_columns':lcols,'location_rows':len(locations),
      'identifier_rows':len(identifiers),'target_rows':len(targets),
      'interpretation':'The PDS Help explicitly states latitude/longitude/elevation in this table describe the ROVER AT DROP events, not each tube centroid.',
      'individual_tube_coordinate_status':'not proven by PDS sample_tube_locations.csv alone',
      'requirements_for_exact_tube_coordinates':['PDS local DEM/RZS product for each tube','tube glove/seal target coordinates in local frame','corresponding PLACES rover pose and frame transformation','georeferenced tube centroid and documented error bounds']}
    (ROOT/'m0_download_audit.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf8')
    out=ROOT/'m0_pds_locations_annotated.csv'
    cols=['row_num','matched_sample_name','sample_id','depot_drop_sol','raw_source_record_json','coordinate_semantics','source_url','coordinate_confidence']
    with out.open('w',newline='',encoding='utf8') as f:
        writer=csv.DictWriter(f,fieldnames=cols);writer.writeheader()
        for i,row in enumerate(locations,1):
            sample=locate_sample(row,locations)
            writer.writerow({'row_num':i,'matched_sample_name':sample[0] if sample else '',
               'sample_id':sample[1] if sample else '', 'depot_drop_sol':sample[2] if sample else '',
               'raw_source_record_json':json.dumps(row,ensure_ascii=False),'coordinate_semantics':'ROVER position during tube drop, not verified tube center',
               'source_url':BASE+'sample_tube_locations.csv','coordinate_confidence':'HIGH for raw published record; LOW for tube itself'})
    matched=[r for r in locations if locate_sample(r,locations)]
    if len(matched)!=10:print(f'ATTENTION: {len(matched)}/{len(SAMPLES)} record(s) matched by name/ID/sol. Inspect m0_pds_locations_annotated.csv before use.')
    print('WROTE:',out)
    print('IMPORTANT: This is NOT an exact 10-tube-coordinate GeoJSON.')

if __name__=='__main__': main()
