import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const lock=JSON.parse(readFileSync(join(root,'configs/engine-source.lock.json'),'utf8'));
const outputIndex=process.argv.indexOf('--output');
const output=outputIndex<0?null:process.argv[outputIndex+1];
if(outputIndex>=0&&!output)throw new Error('--output requires a path');
const report={scope:'Project API typing against declarations generated from pinned official engine source; NOT editor import/build/runtime/G1',status:'BLOCKED',engineVersion:lock.version};
function done(code){if(output){const target=resolve(root,output);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report,null,2));process.exitCode=code;}
try{
 if(!process.env.COCOS_ENGINE_SOURCE)throw new Error('Set COCOS_ENGINE_SOURCE to the pinned official 3.8.8 checkout; do not fabricate temp/tsconfig.cocos.json.');
 const engine=resolve(process.env.COCOS_ENGINE_SOURCE),declaration=join(engine,'bin/.declarations/cc.d.ts');
 if(!existsSync(declaration))throw new Error('Official generated bin/.declarations/cc.d.ts missing; run the official build:declaration command.');
 const sourceRevision=execFileSync('git',['-C',engine,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(sourceRevision!==lock.commit)throw new Error('Engine checkout does not match the pinned official commit.');
 const externalRevision=execFileSync('git',['-C',join(engine,'native/external'),'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(externalRevision!==lock.external.commit)throw new Error('Engine external checkout differs from the official 3.8.8 configuration.');
 if(JSON.parse(readFileSync(join(engine,'package.json'),'utf8')).version!==lock.version)throw new Error('Engine package version mismatch.');
 if(JSON.parse(readFileSync(join(root,'configs/engine.lock.json'),'utf8')).patch!==lock.version)throw new Error('Project engine lock differs.');
 const source=readFileSync(declaration);
 if(!source.toString().startsWith('declare module "cc"'))throw new Error('Unexpected generated declaration format.');
 const cache=join(root,'.cache/engine-source-check');mkdirSync(cache,{recursive:true});
 const config=join(cache,'tsconfig.json');
 writeFileSync(config,JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'Bundler',strict:true,noEmit:true,experimentalDecorators:true,types:[],lib:['ES2022','DOM'],skipLibCheck:true},files:[declaration],include:[join(root,'assets/scripts/**/*.ts')]},null,2)+'\n');
 const result=spawnSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--project',config,'--pretty','false'],{cwd:root,encoding:'utf8'});
 if(result.error)throw result.error;
 Object.assign(report,{status:result.status===0?'PASS_API_TYPING':'FAILED_API_TYPING',sourceRevision,externalRevision,declarationSha256:createHash('sha256').update(source).digest('hex'),skipLibCheck:true,exitCode:result.status,diagnostics:(result.stdout??'')+(result.stderr??'')});
 done(result.status??1);
}catch(error){report.reason=String(error);done(2);}
