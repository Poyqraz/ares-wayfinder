#!/usr/bin/env python3
"""ARES-1: Download original NASA PDS4 MEDA pressure CSV+label, validate, export numeric observations.
Uses only Python standard library.  Internet connection needed for first run.
No fake measurement values and no implicit assumptions about undocumented columns.
"""
import csv, json, re, hashlib, urllib.request, pathlib, xml.etree.ElementTree as ET
from collections import Counter
ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'meda_source'
OUT.mkdir(parents=True,exist_ok=True)
BASE = 'https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0420_0539/sol_0516/'
STEM = 'WE__0516___________DER_PS__________________P01'

def download(name):
    target=OUT / name
    u=BASE+name
    req=urllib.request.Request(u,headers={'User-Agent':'ARES1-Science-QA/1.0'})
    with urllib.request.urlopen(req, timeout=45) as response, target.open('wb') as handle:
        while True:
            chunk=response.read(256*1024)
            if not chunk:break
            handle.write(chunk)
    return target,u

def name(el,child):
    t=el.findtext('./{*}'+child)
    return (t or '').strip()

def parse_label(xml_path):
    root=ET.parse(xml_path).getroot()
    tables=root.findall('.//{*}Table_Delimited')
    if len(tables)!=1: raise ValueError(f'Expected 1 PDS4 delimited table, found {len(tables)}')
    table=tables[0]
    fields=table.findall('.//{*}Field_Delimited')
    columns=[{'name':name(f,'name'),'unit':name(f,'unit'), 'field_number':name(f,'field_number')} for f in fields]
    if not columns or not all(v['name'] for v in columns): raise ValueError('Could not read field definitions from the label')
    return columns,table

def norm(s):return re.sub(r'[^a-z0-9]+','_',s.lower()).strip('_')

def main():
    raw,url=download(STEM+'.CSV')
    label,label_url=download(STEM+'.xml')
    cols,table=parse_label(label)
    delim=name(table,'field_delimiter')
    delimiter={'Comma':',','comma':',','Tab':'\t','tab':'\t','Semicolon':';','semicolon':';'}.get(delim,',')
    fieldnames=[c['name'] for c in cols]
    with raw.open('r',encoding='utf-8-sig',newline='') as f:
        r=csv.reader(f,delimiter=delimiter)
        records=list(r)
    records=[row for row in records if row]
    if not records:raise ValueError('PDS pressure CSV has zero rows')
    # Some products include a single header even though PDS4 Delimited convention usually does not.
    if [norm(x) for x in records[0]] == [norm(x) for x in fieldnames]: records=records[1:]
    bad_width=[i for i,row in enumerate(records,1) if len(row)!=len(cols)]
    if bad_width:raise ValueError(f'Invalid row widths at lines {bad_width[:8]}: expected {len(cols)} cols')
    pressure_candidates=[c for c in cols if 'press' in norm(c['name']) and 'uncert' not in norm(c['name']) and 'err' not in norm(c['name']) and 'flag' not in norm(c['name']) and 'quality' not in norm(c['name'])]
    pa=[c for c in pressure_candidates if norm(c['unit']) in {'pa','pascal','pascals'}]
    if len(pa)!=1:
        # Stop explicitly rather than silently mapping the wrong data channel.
        raise ValueError('Could not uniquely identify pressure in Pa from XML: '+repr(pressure_candidates))
    pidx=fieldnames.index(pa[0]['name'])
    norm_names=[norm(c) for c in fieldnames]
    def idx(*candidates):
        for desired in candidates:
            if desired in norm_names:return norm_names.index(desired)
        for desired in candidates:
            match=[i for i,v in enumerate(norm_names) if desired in v]
            if len(match)==1:return match[0]
        return None
    utc_i=idx('utc','utc_time','earth_time','scet')
    lmst_i=idx('lmst','local_mean_solar_time')
    ltst_i=idx('ltst','local_true_solar_time')
    unc_i=idx('pressure_uncertainty','pressure_uncertainty_pa','uncertainty')
    target=OUT/'meda_sol0516_der_ps_tidy.csv'
    valid,missing,out_of_plausible=[],0,0
    with target.open('w',encoding='utf-8',newline='') as f:
        w=csv.writer(f);w.writerow(['mission','sol','record_index','utc','lmst','ltst','pressure_pa','pressure_uncertainty_pa','data_status','source_pds_url'])
        for i,row in enumerate(records,1):
            try:v=float(row[pidx])
            except (ValueError,IndexError):missing+=1;continue
            if not (100<=v<=1500):out_of_plausible+=1;continue
            valid.append(v)
            w.writerow(['ARES-1',516,i,row[utc_i] if utc_i is not None else '',row[lmst_i] if lmst_i is not None else '',row[ltst_i] if ltst_i is not None else '',v,row[unc_i] if unc_i is not None else '', 'NASA_PDS_DERIVED_MEASUREMENT',url])
    if not valid:raise ValueError('No valid pressure measurements. Review PDS4 label, raw data and flags.')
    report={
        'status':'downloaded_parsed_basic_QA_passed','source':url,'label':label_url,
        'raw_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),
        'sol':516,'source_rows':len(records),'valid_pressure_rows':len(valid),
        'missing_or_nonnumeric_rows':missing,'physically_implausible_rows':out_of_plausible,
        'pressure_min_pa':min(valid),'pressure_max_pa':max(valid), 'pressure_mean_pa':sum(valid)/len(valid),
        'label_columns':cols,'pressure_column':pa[0]['name'], 'confidence':'high_original_source; provisional until sensor quality flags reviewed',
        'caveat':'Plausibility filter 100-1500 Pa is a sanity check, not a flight safety limit; sensor flags must be interpreted using PDS SIS.'
    }
    (OUT/'meda_sol0516_ingestion_report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
    print('SUCCESS:',len(valid),'real measured pressure records; output:',target)

if __name__ == '__main__':main()
