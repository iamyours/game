import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
const walk=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(directory,entry.name)):[join(directory,entry.name)]);
let count=0;
for(const file of walk('assets/scripts').filter(file=>file.endsWith('.ts'))){
 const result=ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,experimentalDecorators:true},reportDiagnostics:true});
 const errors=result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error)||[];
 if(errors.length){for(const d of errors)console.error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));process.exitCode=1;}
 count++;
}
console.log(`${count} TypeScript files checked for syntax. NOT Creator typing, build or runtime.`);
