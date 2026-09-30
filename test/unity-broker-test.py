"""Offline checks of the fixed Unity broker; never starts Unity or a model."""
import contextlib, importlib.util, io, json, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('broker', Path(__file__).resolve().parents[1]/'scripts/unity-test-mcp.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
class BrokerTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);r=Path(self.tmp.name)
  self.public=r/'public';self.private=r/'private';self.out=r/'output'
  for p in (self.public,self.private):
   for f in ('Assets/WalkingSkeleton/Tasks','Packages','ProjectSettings'): (p/f).mkdir(parents=True)
   (p/'Assets/WalkingSkeleton/Tasks/Clamp.cs').write_text('class Clamp {}')
  self.target=self.public/b.TASK_ROOT/'Clamp.cs';self.hidden=self.private/b.TASK_ROOT/'Clamp.cs'
  self.pb=b.snapshot(self.public,self.target);self.eb=b.snapshot(self.private,self.hidden)
 def invoke(self,xml=None,code=0):
  def run(cmd,**kwargs):
   self.assertEqual(cmd[cmd.index('--filter')+1],'Pinned.Filter')
   if xml is not None: Path(cmd[cmd.index('--output')+1]).write_text(xml)
   Path(cmd[cmd.index('-logFile')+1]).write_text('Unity log')
   return SimpleNamespace(returncode=code)
  with patch.object(b.subprocess,'run',run): return b.invoke(self.public,self.target,self.pb,self.private,self.hidden,self.eb,self.out,'Pinned.Filter',1)
 def test_pass_binds_source_and_protected_trees(self):
  r=self.invoke('<root><test-case fullname="Pinned.Filter" result="Passed"/></root>')
  self.assertEqual(r['outcome'],'pass');self.assertEqual(r['sourceSha256'],b.sha(self.target));self.assertEqual(r['protectedBeforeDigest'],r['protectedAfterDigest'])
  self.assertEqual(len(r['xmlDigest']),64);self.assertTrue((self.out/r['runId']/'receipt.json').is_file())
 def test_missing_xml_is_infrastructure(self): self.assertEqual(self.invoke(None,6)['outcome'],'infrastructure')
 def test_wrong_count_is_infrastructure(self): self.assertEqual(self.invoke('<root/>')['outcome'],'infrastructure')
 def test_assertion_failure_is_model(self): self.assertEqual(self.invoke('<root><test-case result="Failed"/></root>',8)['outcome'],'model')
 def test_protected_edit_does_not_dispatch(self):
  (self.public/'Packages/changed.json').write_text('{}')
  with patch.object(b.subprocess,'run') as run:
   r=self.invoke();self.assertEqual(r['outcome'],'infrastructure');run.assert_not_called()
 def test_custom_args_and_second_call_rejected(self):
  req=lambda n,args:{} if n==0 else {'jsonrpc':'2.0','id':n,'method':'tools/call','params':{'name':'unity_compile_test','arguments':args}}
  lines='\n'.join(json.dumps(req(n,a)) for n,a in [(1,{'project':'escape'}),(2,{}),(3,{})])
  out=io.StringIO()
  with patch.object(b.sys,'stdin',io.StringIO(lines)),contextlib.redirect_stdout(out),patch.object(b,'invoke',return_value={'outcome':'pass'}) as invoke:
   b.serve(self.public,self.target,self.pb,self.out,self.private,'Pinned.Filter',1,1)
   self.assertEqual(invoke.call_count,1)
  rows=[json.loads(x) for x in out.getvalue().splitlines()];self.assertIn('error',rows[0]);self.assertIn('result',rows[1]);self.assertIn('error',rows[2])
if __name__=='__main__': unittest.main()
