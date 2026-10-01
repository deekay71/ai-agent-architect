from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,shutil,xml.etree.ElementTree as ET
root=Path('.local/walking-skeleton-live-47-20261001');out=Path('docs/evidence/walking-skeleton-20261001-47');report=json.loads((root/'report.json').read_text());memory=json.loads((root/'memory-snapshot.json').read_text());manifest=[];rows=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
assert report['stoppedReason'] is None
for arm in ['A','C']:
 for row in report[arm.lower()]:
  task=row['taskId'];dst=out/arm/task;dst.mkdir(parents=True)
  candidates=list((root/arm/task/'artifacts').glob('*/unity/*/receipt.json'));assert len(candidates)==1
  bp=candidates[0];broker=json.loads(bp.read_text());native=bp.parent.parent.parent
  events=[json.loads(l) for l in (native/'app-server.events.ndjson').read_text().splitlines() if l]
  ends=[e for e in events if e.get('method')=='turn/completed'];assert len(ends)==1 and ends[0]['params']['turn']['status']=='completed'
  turn=ends[0]['params']['turn']['id'];thread=ends[0]['params']['threadId']
  receipts=row['receipts'];nr=receipts[-1];assert nr['status']=='completed' and not nr['overshootRisk']
  usage=[e['params']['tokenUsage']['total'] for e in events if e.get('method')=='thread/tokenUsage/updated' and e['params'].get('turnId')==turn][-1]
  assert all(usage[k]==nr['usage'][k] for k in ['inputTokens','cachedInputTokens','outputTokens'])
  micros=sum((r['usage']['inputTokens']-r['usage']['cachedInputTokens'])*50+r['usage']['cachedInputTokens']*5+r['usage']['outputTokens']*(250 if r['model']=='gpt-6-sol' else 300) for r in receipts)
  assert micros==row['creditMicros'] and micros<=3000000
  assert all(r['status']=='completed' for r in receipts)
  assert hashlib.sha256(nr['source'].encode()).hexdigest()==broker['sourceSha256']
  assert broker['exitCode']==0 and broker['outcome']=='pass' and broker['actualTestCount']==broker['expectedTestCount']==3
  assert broker['protectedBeforeDigest']==broker['protectedAfterDigest']
  xml=bp.parent/'tests.xml';assert sha(xml)==broker['xmlDigest'];assert sha(bp.parent/'editor.log')==broker['logDigest']
  tests=[dict(e.attrib) for e in ET.parse(xml).iter('test-case')];assert len(tests)==3 and all(t['result']=='Passed' for t in tests)
  assert sorted(t['fullname'] for t in tests)==sorted(t['name'] for t in broker['tests'])
  calls=[e['params']['item'] for e in events if e.get('method')=='item/completed' and e.get('params',{}).get('item',{}).get('type')=='mcpToolCall']
  assert len(calls)==1 and all(c.get('server')=='unity_public' and c.get('tool')=='unity_compile_test' and c['status']=='completed' and c.get('error') is None for c in calls)
  assert (native/'app-server.version.stdout.log').read_text().strip()=='codex-cli 0.159.0'
  promoted=[n for n in memory['nodes'] if n.get('kind')=='claim' and n.get('label')=='unity-observation:'+row['evidenceId'] and n.get('status',{}).get('lifecycle')=='approved' and n.get('status',{}).get('validity')=='valid']
  if arm=='A':assert len(promoted)==1
  for filename in ['receipt.json','tests.xml']:shutil.copyfile(bp.parent/filename,dst/filename)
  save(dst/'native-receipt.json',nr)
  save(dst/'model-stages.json',receipts)
  audit={'arm':arm,'taskId':task,'status':'pass','exitCode':broker['exitCode'],'xml':str(dst/'tests.xml'),'xmlSha256':sha(xml),'testIds':[{'id':t['id'],'fullname':t['fullname'],'result':t['result']} for t in tests],'creditMicrosSettled':micros,'creditsSettled':micros/1000000,'rawTokens':sum(r['usage']['inputTokens']+r['usage']['outputTokens'] for r in receipts),'nativeTurnCompleted':{'threadId':thread,'turnId':turn,'status':'completed'},'nativeUsageMatchesFinalEvent':True,'backend':broker['backend'],'mcpAudit':[{'itemId':c['id'],'server':c['server'],'tool':c['tool'],'status':c['status'],'error':c.get('error')} for c in calls],'sourceAndXmlDigestsMatch':True,'protectedFilesUnchanged':True,'memoryPromoted':arm=='A','memoryNodeIds':[n['id'] for n in promoted],'softStopActivated':False,'hookAdmissionLogPresent':(native/'tool-admission.hook-events.ndjson').exists()}
  save(dst/'audit.json',audit);rows.append(audit)
  for f in native.rglob('*'):
   if f.is_file() and f.suffix in ['.json','.ndjson','.log','.xml','.flag']:manifest.append({'path':str(f),'bytes':f.stat().st_size,'sha256':sha(f)})
assert len(rows)==4
for task in ['integer-clamp','cell-bounds']:
 pair=[r for r in rows if r['taskId']==task];assert [t['fullname'] for t in pair[0]['testIds']]==[t['fullname'] for t in pair[1]['testIds']]
for name in ['report.json','memory-snapshot.json','lock.json']:
 shutil.copyfile(root/name,out/name)
for f in root.glob('evidence-*.json'):shutil.copyfile(f,out/f.name)
shutil.copyfile('.local/walking-skeleton-47-tests.log',out/'offline-tests.log')
shutil.copyfile('.local/walking-skeleton-live-47-quota-history.ndjson',out/'quota-history.ndjson')
for f in root.glob('call-*.json'):shutil.copyfile(f,out/f.name)
save(out/'raw-artifact-manifest.json',manifest)
result={'recordedAt':datetime.now(timezone.utc).isoformat(),'walkingSkeletonAcceptance':'pass','scope':'two microtasks A then C; functional end-to-end acceptance, not Brain effectiveness comparison','offlineTests':{'passed':33,'failed':0},'rows':rows,'settledCredits':sum(r['creditMicrosSettled'] for r in rows)/1000000,'rawTokens':sum(r['rawTokens'] for r in rows),'modelCalls':8,'manualOwnerFixes':0,'quota':{'turnStartWeeklyUsedPercent':44,'modelBatchBeforeUsedPercent':45,'modelBatchAfterUsedPercent':45,'turnEndWeeklyUsedPercent':None,'hardStopUsedPercent':47,'fiveHourUsedPercent':None,'reset':'2026-10-07T03:23:01Z','measurementCaveat':'Rounded shared-account snapshots; cannot isolate concurrent Codex activity.'},'limitations':['No task reached credit reserve or cap; live soft-stop behavior was not exercised.','Per-tool hook admission log was absent in all four runs; MCP completion events are present and successful. Hook-level enforcement is not attested by this live run.','Two microtasks establish the pipeline only; no conclusion about Brain versus ordinary Codex.'],'next':'Stop. Scene/prefab spike and batch2 planning after reset 07/10 in a new session.'}
save(out/'result.json',result)
print(json.dumps({'audit':'pass','tasks':len(rows),'credits':result['settledCredits'],'rawTokens':result['rawTokens'],'memoryClaims':sum(r['memoryPromoted'] for r in rows),'hookLogPresent':[r['hookAdmissionLogPresent'] for r in rows]},ensure_ascii=False))
