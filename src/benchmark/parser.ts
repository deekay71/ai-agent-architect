import { createHash } from 'node:crypto';

export interface CSharpDeclaration { id: string; path: string; kind: 'class' | 'interface' | 'method'; name: string; line: number; assertion: 'explicit'; sourceDigest: string }
export interface CSharpReference { path: string; name: string; line: number; syntax: 'qualified-call' | 'type-name'; assertion: 'inferred'; targetCandidates: string[]; semanticBinding: 'unverified' }
export interface CSharpSpike { parser: 'bounded-csharp-syntax/1'; declarations: CSharpDeclaration[]; references: CSharpReference[]; limitations: string[] }
export const rawDigest = (value: string | Uint8Array): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;

/** Preserve offsets/newlines while masking comments and ordinary/verbatim strings. This is deliberately not a C# compiler. */
export function maskCSharp(source: string): string {
  if (/"""/.test(source) || /^\s*#/m.test(source)) throw new Error('Unsupported C# raw string or preprocessor directive');
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|@"(?:""|[^"])*"|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, s => s.replace(/[^\n]/g, ' '));
}
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;
export function parseCSharpFixture(files: readonly { path: string; content: string }[]): CSharpSpike {
  const declarations: CSharpDeclaration[] = [];
  const masked = files.map(file => ({ ...file, clean: maskCSharp(file.content) }));
  for (const file of masked) {
    for (const m of file.clean.matchAll(/\b(class|interface)\s+([A-Za-z_]\w*)/g)) {
      declarations.push({ id: `${file.path}:${m.index}:${m[2]}`, path: file.path, kind: m[1] as 'class' | 'interface', name: m[2]!, line: lineAt(file.clean, m.index), assertion: 'explicit', sourceDigest: rawDigest(file.content) });
    }
    // Supported subset: public/private/etc simple return types and method names. Constructors are not reported as methods.
    for (const m of file.clean.matchAll(/(?:\b(?:public|private|protected|internal|static|virtual|override|async)\s+)+[A-Za-z_]\w*(?:[<>\[\]?., ]*)\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:\{|;|=>)/g)) {
      declarations.push({ id: `${file.path}:${m.index}:${m[1]}`, path: file.path, kind: 'method', name: m[1]!, line: lineAt(file.clean, m.index), assertion: 'explicit', sourceDigest: rawDigest(file.content) });
    }
  }
  // Interface members may omit access modifiers; the bounded fixture subset has no nested interface bodies.
  for (const file of masked) for (const block of file.clean.matchAll(/\binterface\s+[A-Za-z_]\w*\s*\{([^{}]*)\}/g)) {
    const body=block[1]!,offset=block.index+block[0].indexOf('{')+1;
    for(const member of body.matchAll(/\b[A-Za-z_]\w*\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*;/g)) {
      const index=offset+member.index;
      declarations.push({id:`${file.path}:${index}:${member[1]}`,path:file.path,kind:'method',name:member[1]!,line:lineAt(file.clean,index),assertion:'explicit',sourceDigest:rawDigest(file.content)});
    }
  }
  const references: CSharpReference[] = [];
  for (const file of masked) {
    for (const m of file.clean.matchAll(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/g)) references.push({ path: file.path, name: `${m[1]}.${m[2]}`, line: lineAt(file.clean, m.index), syntax: 'qualified-call', assertion: 'inferred', targetCandidates: declarations.filter(d => d.kind === 'method' && d.name === m[2]).map(d => d.id), semanticBinding: 'unverified' });
    for (const m of file.clean.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)) {
      const candidates = declarations.filter(d => d.kind !== 'method' && d.name === m[0]);
      if (candidates.length && !new RegExp(`(?:class|interface)\\s+$`).test(file.clean.slice(Math.max(0, m.index - 20), m.index))) references.push({ path: file.path, name: m[0], line: lineAt(file.clean, m.index), syntax: 'type-name', assertion: 'inferred', targetCandidates: candidates.map(d => d.id), semanticBinding: 'unverified' });
    }
  }
  return { parser: 'bounded-csharp-syntax/1', declarations, references, limitations: ['No Roslyn compilation, namespace/type binding, overload resolution, extension methods or dynamic dispatch.', 'Method references are name candidates only; they never become explicit dependency edges.', 'Fixture subset only; raw strings and preprocessor directives fail closed; generics/attributes/records are not claimed complete.', 'C# compile and Android build are unmeasured; syntax extraction is not either check.'] };
}
