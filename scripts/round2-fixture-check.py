#!/usr/bin/env python3
"""Prepare private grading project; no model calls. CLI fallback is explicitly selected."""
import argparse,json,shutil,subprocess,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--source',default='unity/round2/public');p.add_argument('--platform',choices=['EditMode','PlayMode'],default='EditMode');a=p.parse_args()
repo=Path(__file__).resolve().parent.parent;out=Path(a.output).resolve();project=out/'project'
if project.exists():raise SystemExit('NEW_OUTPUT_REQUIRED')
shutil.copytree(Path(a.source).resolve(),project,ignore=shutil.ignore_patterns('Library','Temp','Logs','obj','.git'))
shutil.copytree(repo/'unity/round2/hidden',project/'Assets/Hidden')
xml=out/'tests.xml';log=out/'unity.log'
cmd=['/Applications/Unity/Hub/Editor/6000.0.84f1/Unity.app/Contents/MacOS/Unity','-batchmode','-nographics','-projectPath',str(project),'-runTests','-testPlatform',a.platform,'-testFilter','HiddenRulesTests' if a.platform=='EditMode' else 'HiddenPlacementTests','-testResults',str(xml),'-logFile',str(log)]
r=subprocess.run(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=240)
summary={'backend':'batchmode-runTests','platform':a.platform,'exitCode':r.returncode,'modelsInvoked':0}
if xml.exists():
 import xml.etree.ElementTree as ET
 root=ET.parse(xml).getroot();summary.update({k:root.attrib.get(k) for k in ['result','total','passed','failed','skipped']});summary['tests']=[{'name':t.attrib['fullname'],'result':t.attrib['result'],'message':(t.findtext('failure/message') or '')[:500]} for t in root.findall('.//test-case')]
else:summary['infrastructure']='missing-xml'
summary['sourceDigest']=hashlib.sha256(b''.join(str(f.relative_to(Path(a.source))).encode()+f.read_bytes() for f in sorted(Path(a.source).rglob('*')) if f.is_file())).hexdigest()
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items() if k!='tests'}))
if not xml.exists():raise SystemExit(1)
