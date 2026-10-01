#!/usr/bin/env python3
"""Fixed-project Unity MCP broker: public candidate in, private result out."""
import hashlib, json, subprocess, sys, time, uuid
import xml.etree.ElementTree as ET
from pathlib import Path

TASK_ROOT = Path('Assets/WalkingSkeleton/Tasks')
UNITY = Path.home() / '.unity/bin/unity'
EDITOR = '/Applications/Unity/Hub/Editor/6000.0.84f1/Unity.app'

def sha(file): return hashlib.sha256(file.read_bytes()).hexdigest()
def digest(value): return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
def within(root, value):
    try: value.relative_to(root); return True
    except ValueError: return False
def tree(project):
    for name in ('Assets', 'Packages', 'ProjectSettings'):
        base = project / name
        if not base.is_dir() or base.is_symlink(): raise ValueError('required project folder missing or linked')
        if any(p.is_symlink() for p in base.rglob('*')): raise ValueError('symlink rejected')
def snapshot(project, target):
    rows=[]
    for name in ('Assets', 'Packages', 'ProjectSettings'):
        for p in sorted((project/name).rglob('*')):
            if p.is_symlink(): raise ValueError('symlink rejected')
            if p.is_file() and p != target and p.suffix != '.meta': rows.append((p.relative_to(project).as_posix(), sha(p)))
    return digest(rows)
def validate(public, target, evaluation):
    public,target,evaluation=public.resolve(),target.resolve(),evaluation.resolve()
    if not public.is_dir() or not evaluation.is_dir() or public == evaluation or within(public,evaluation) or within(evaluation,public): raise ValueError('invalid project roots')
    tree(public); tree(evaluation)
    if not target.is_file() or target.is_symlink() or target.suffix != '.cs' or not within(public/TASK_ROOT,target): raise ValueError('invalid public target')
    private_target=evaluation/target.relative_to(public)
    if not private_target.is_file() or private_target.is_symlink(): raise ValueError('private evaluation target missing or linked')
    return public,target,evaluation,private_target
def write_receipt(run_dir, receipt):
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir/'receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf8')
def invoke(public,target,public_before,evaluation,private_target,private_before,output,test_filter,expected,call_index=0):
    run_dir=output/str(uuid.uuid4()); run_dir.mkdir(parents=True); source_sha=sha(target)
    base={'runId':run_dir.name,'callIndex':call_index,'backend':{'label':'unity-cli','cli':str(UNITY),'cliVersion':'1.0.0-beta.8','editor':EDITOR,'editorVersion':'6000.0.84f1','fallback':'none'},'sourceSha256':source_sha,'protectedBeforeDigest':digest([public_before,private_before]),'testFilter':test_filter,'expectedTestCount':expected,'tests':[],'compileErrors':[]}
    for name in ('unity.stdout.log','unity.stderr.log'): (run_dir/name).write_bytes(b'')
    if snapshot(public,target)!=public_before or snapshot(evaluation,private_target)!=private_before:
        receipt={**base,'outcome':'infrastructure','error':'protected project changed','elapsedSeconds':0,'actualTestCount':0,'commandDigest':None,'xmlDigest':None,'logDigest':None,'protectedAfterDigest':None}; write_receipt(run_dir,receipt); return receipt
    source=target.read_text(encoding='utf8')
    if any(x in source for x in ('System.IO','System.Reflection','System.Diagnostics','DllImport','InitializeOnLoad','UnityEditor','Application.OpenURL','System.Net')):
        receipt={**base,'outcome':'model','error':'Target uses an API outside this microtask scope','elapsedSeconds':0,'actualTestCount':0,'commandDigest':None,'xmlDigest':None,'logDigest':None,'protectedAfterDigest':digest([snapshot(public,target),snapshot(evaluation,private_target)])}; write_receipt(run_dir,receipt); return receipt
    # Sole transfer across the public/private boundary; no hidden bytes are returned.
    private_target.write_bytes(target.read_bytes())
    xml,log=run_dir/'tests.xml',run_dir/'editor.log'
    command=[str(UNITY),'--non-interactive','--no-banner','test',str(evaluation),'--mode','EditMode','--filter',test_filter,'--output',str(xml),'--editor-path',EDITOR,'--timeout','180','--retries','0','--','-nographics','-runSynchronously','-logFile',str(log)]
    start=time.monotonic(); result=None; startup_error=None
    def raw(value): return value if isinstance(value,bytes) else (value or '').encode()
    try: result=subprocess.run(command,capture_output=True,timeout=195)
    except subprocess.TimeoutExpired as timeout:
        # Preserve partial process output even when the pinned Editor times out.
        (run_dir/'unity.stdout.log').write_bytes(raw(timeout.stdout))
        (run_dir/'unity.stderr.log').write_bytes(raw(timeout.stderr))
    except OSError as failure:
        startup_error=str(failure)
        (run_dir/'startup-error.json').write_text(json.dumps({'error':startup_error}),encoding='utf8')
    if result is not None:
        (run_dir/'unity.stdout.log').write_bytes(raw(getattr(result,'stdout',None)))
        (run_dir/'unity.stderr.log').write_bytes(raw(getattr(result,'stderr',None)))
    errors=[]; tests=[]
    if log.exists(): errors=[line[:500] for line in log.read_text(errors='replace').splitlines() if 'error CS' in line][:12]
    malformed=False
    if xml.exists():
        try: tests=[{'name':x.get('fullname'),'result':x.get('result'),'message':(x.findtext('failure/message') or '')[:1000]} for x in ET.parse(xml).iter('test-case')]
        except ET.ParseError: malformed=True
    after=digest([snapshot(public,target),snapshot(evaluation,private_target)])
    count_ok=len(tests)==expected
    if result is None or malformed: outcome='infrastructure'
    elif result.returncode==0 and count_ok and all(x['result']=='Passed' for x in tests): outcome='pass'
    elif errors or (count_ok and any(x['result']=='Failed' for x in tests)): outcome='model'
    else: outcome='infrastructure'
    if after != base['protectedBeforeDigest']: outcome='infrastructure'; errors.append('Protected project changed during Unity execution')
    receipt={**base,'outcome':outcome,'exitCode':None if result is None else result.returncode,'tests':tests,'actualTestCount':len(tests),'compileErrors':errors,'elapsedSeconds':round(time.monotonic()-start,3),'commandDigest':digest(command),'xmlDigest':sha(xml) if xml.exists() else None,'logDigest':sha(log) if log.exists() else None,'protectedAfterDigest':after,**({'error':'Unity startup error: '+startup_error} if startup_error else {})}
    write_receipt(run_dir,receipt); return receipt
def serve(public,target,expected_public,output,evaluation,test_filter,expected_count,max_calls):
    public,target,evaluation,private=validate(public,target,evaluation); output=output.resolve()
    if not test_filter or expected_count<1 or max_calls<0 or snapshot(public,target)!=expected_public: raise ValueError('invalid fixed broker configuration')
    private_snapshot=snapshot(evaluation,private); calls=0
    for line in sys.stdin:
        request=json.loads(line)
        if 'id' not in request: continue
        method=request.get('method'); error=None
        if method=='initialize': result={'protocolVersion':request.get('params',{}).get('protocolVersion','2024-11-05'),'capabilities':{'tools':{}},'serverInfo':{'name':'unity-public-test','version':'2.0.0'}}
        elif method=='tools/list': result={'tools':[{'name':'unity_compile_test','description':'Run fixed hidden Unity tests for the sole public candidate.','inputSchema':{'type':'object','properties':{},'additionalProperties':False}}]}
        elif method=='tools/call' and request.get('params',{}).get('name')=='unity_compile_test' and request.get('params',{}).get('arguments',{})=={}:
            if max_calls and calls>=max_calls: result=None; error={'code':-32000,'message':'Fixed broker call limit reached'}
            else:
                calls+=1; receipt=invoke(public,target,expected_public,evaluation,private,private_snapshot,output,test_filter,expected_count,calls); result={'content':[{'type':'text','text':json.dumps(receipt)}]}
        elif method=='ping': result={}
        else: result=None; error={'code':-32602,'message':'Unknown method or invalid fixed-project tool arguments'}
        response={'jsonrpc':'2.0','id':request['id']}; response['error' if error else 'result']=error or result; print(json.dumps(response),flush=True)
if __name__=='__main__':
    if len(sys.argv)!=9: raise SystemExit('usage: unity-test-mcp.py publicProject target expectedPublicSnapshot output evalProject testFilter expectedCount maxCalls')
    serve(Path(sys.argv[1]),Path(sys.argv[2]),sys.argv[3],Path(sys.argv[4]),Path(sys.argv[5]),sys.argv[6],int(sys.argv[7]),int(sys.argv[8]))
