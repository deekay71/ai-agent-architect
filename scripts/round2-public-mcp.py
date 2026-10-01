#!/usr/bin/env python3
"""Public-only Unity broker. Hidden evaluation is a separate host operation."""
import sys,json,hashlib,subprocess,time,xml.etree.ElementTree as ET
from pathlib import Path
project=Path(sys.argv[1]).resolve();receipts=Path(sys.argv[2]).resolve();protocol=json.loads(Path(sys.argv[3]).read_text());task_id=sys.argv[4];session=int(sys.argv[5]);protocol_hash='sha256:'+hashlib.sha256(Path(sys.argv[3]).read_bytes()).hexdigest()
task=next(t for t in protocol['tasks'] if t['id']==task_id);index=0
editor=protocol['pins']['editorBinary']
def snapshot():
 files=[f for root in ['Assets','Packages','ProjectSettings'] for f in (project/root).rglob('*') if f.is_file() and f.suffix!='.meta']
 return 'sha256:'+hashlib.sha256(b''.join(str(f.relative_to(project)).encode()+f.read_bytes() for f in sorted(files))).hexdigest()
def call(args):
 global index
 index+=1;out=receipts/str(index);out.mkdir(parents=True,exist_ok=False)
 action=args.get('action','test');record={'protocolDigest':protocol_hash,'taskId':task_id,'session':session,'callIndex':index,'action':action,'backend':'batchmode','sourceBefore':snapshot()}
 log=out/'unity.log';xml=out/'tests.xml';cmd=[editor,'-batchmode','-nographics','-projectPath',str(project),'-logFile',str(log)]
 if action=='build-assets' and task_id=='T3':cmd+=['-quit','-executeMethod','Round2Assets.Build']
 elif action in ['test','self-test']:cmd+=['-runTests','-testPlatform','EditMode','-testFilter',task['publicFilters'][session-1] if action=='test' else 'AgentTests','-testResults',str(xml)]
 else:raise ValueError('ACTION_NOT_ALLOWED')
 started=time.monotonic();result=subprocess.run(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=240);record.update(exitCode=result.returncode,elapsedMs=int((time.monotonic()-started)*1000),sourceAfter=snapshot())
 if action in ['test','self-test']:
  if not xml.exists():record.update(classification='infrastructure',error='missing-public-test-xml')
  else:
   root=ET.parse(xml).getroot();tests=[{'id':t.get('id'),'name':t.get('fullname'),'result':t.get('result'),'message':(t.findtext('failure/message') or '')[:1200]} for t in root.findall('.//test-case')]
   record.update(tests=tests,xmlDigest='sha256:'+hashlib.sha256(xml.read_bytes()).hexdigest(),classification='pass' if tests and all(t['result']=='Passed' for t in tests) else 'model' if tests else 'infrastructure')
 else:record.update(classification='pass' if result.returncode==0 else 'model')
 (out/'receipt.json').write_text(json.dumps(record,indent=2)+'\n');return record
for line in sys.stdin:
 try:
  req=json.loads(line);method=req.get('method');rid=req.get('id')
  if rid is None:continue
  if method=='initialize':result={'protocolVersion':'2024-11-05','capabilities':{'tools':{}},'serverInfo':{'name':'round2-public','version':'1'}}
  elif method=='tools/list':result={'tools':[{'name':'unity_compile_test','description':'Public Unity tests or build-assets (T3 only). No hidden feedback.','inputSchema':{'type':'object','properties':{'action':{'type':'string','enum':['test','self-test','build-assets']}},'additionalProperties':False}}]}
  elif method=='tools/call':
   if req['params']['name']!='unity_compile_test':raise ValueError('UNKNOWN_TOOL')
   record=call(req['params'].get('arguments',{}));result={'content':[{'type':'text','text':json.dumps(record)}],'isError':record['classification']=='infrastructure'}
  elif method=='ping':result={}
  else:raise ValueError('UNKNOWN_METHOD')
  print(json.dumps({'jsonrpc':'2.0','id':rid,'result':result}),flush=True)
 except Exception as e:
  print(json.dumps({'jsonrpc':'2.0','id':req.get('id') if 'req' in locals() else None,'error':{'code':-32000,'message':str(e)[:500]}}),flush=True)
