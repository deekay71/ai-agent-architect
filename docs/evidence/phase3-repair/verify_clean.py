from pathlib import Path
import datetime, hashlib, json, os, platform, re, shutil, subprocess, tempfile, time

repo = Path(__file__).resolve().parents[3]
evidence = repo.parent / 'outputs/phase3-repair-2026-09-30'
evidence.mkdir(parents=True, exist_ok=True)
run_id = 'clean-repair-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
clean = Path(tempfile.mkdtemp(prefix='ai-agent-architect-' + run_id + '-'))
sha = lambda b: 'sha256:' + hashlib.sha256(b).hexdigest()
def manifest(root):
    files = [p for d in ['src', 'test', 'fixtures', 'scripts'] for p in (root/d).rglob('*') if p.is_file()]
    files += [root/p for p in ['package.json','pnpm-lock.yaml','tsconfig.json']]
    pins = {str(p.relative_to(root)):sha(p.read_bytes()) for p in sorted(files)}
    return {'manifestAlgorithm':'sha256 of canonical sorted path->raw SHA256 JSON', 'digest':sha(json.dumps(pins,sort_keys=True,separators=(',',':')).encode()), 'files':pins}
def save(suffix, value):
    p=evidence/(run_id+'-'+suffix+'.json'); p.write_text(json.dumps(value,indent=2)+'\n'); return str(p)
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
before = manifest(repo); save('source-before',before)
for name in before['files']:
    source=repo/name; dest=clean/name; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(source,dest)
copied=manifest(clean); save('source-copied',copied)
assert before==copied
results={}
for name,args in [('install',['./scripts/dev.sh','install','--frozen-lockfile','--ignore-scripts']),('check',['./scripts/dev.sh','check'])]:
    log=evidence/(run_id+'-'+name+'.log'); start=time.monotonic()
    with log.open('w') as f: result=subprocess.run(args,cwd=clean,stdout=f,stderr=subprocess.STDOUT)
    results[name]={'command':args,'exitCode':result.returncode,'seconds':round(time.monotonic()-start,3),'log':str(log)}
    save('execution-results',results)
    if result.returncode: break
after=manifest(repo); copied_after=manifest(clean); save('source-after',after)
pins={str(p.relative_to(clean)):sha(p.read_bytes()) for p in sorted((clean/'dist').rglob('*.js'))}
built={'digest':sha(json.dumps(pins,sort_keys=True,separators=(',',':')).encode()),'files':pins};save('built-js',built)
log=Path(results.get('check',{}).get('log','/dev/null')).read_text()
counts={k:int(v) for k,v in re.findall(r'(?:ℹ|#) (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)',log)}
summary={'schemaVersion':'clean-source-verification/1','runId':run_id,'startedAt':started,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'repositoryRoot':str(repo),'cleanRoot':str(clean),'os':platform.platform(),'machine':platform.machine(),
 'sourceDigest':before['digest'],'sourceFileCount':len(before['files']),'sourceUnchanged':before==after==copied_after,
 **results,'testCounts':counts,'builtJsDigest':built['digest'],'builtJsFileCount':len(pins),
 'scope':'Independent fresh copy, frozen dependency install, local tests only, no model calls',
 'passed':before==after==copied_after and results.get('check',{}).get('exitCode')==0 and counts.get('fail')==0 and counts.get('pass',0)>0}
save('summary',summary)
print(json.dumps(summary,indent=2))
raise SystemExit(0 if summary['passed'] else 1)
