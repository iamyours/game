import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
const out=process.env.ARCADE_STABILITY_EVIDENCE_DIR || 'evidence/arcade/stability';
await mkdir(out,{recursive:true});
const report={passed:false,status:'NOT_RUN',scope:'Real Creator/Box2D lifecycle stress with injected head hits and HP refills; not manual combat, projectile collision or G1',listenerCoverage:'NOT_MEASURED',errors:[],restarts:[],samples:[]};
const save=()=>writeFile(out+'/verification.json',JSON.stringify(report,null,2)+'\n');
if(!process.env.ARCADE_URL && !existsSync('build/web-desktop/index.html')){
 report.status='BLOCKED';report.reason='Current Creator Web build missing';await save();console.error(report.reason);process.exit(2);
}
const durationMs=Number(process.env.ARCADE_STRESS_DURATION_MS || 900000);
if(!Number.isFinite(durationMs)||durationMs<1000)throw new Error('Invalid stress duration');
let browser;
try{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs');
 browser=await chromium.launch({headless:process.env.HEADED!=='1',executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:810}});page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(process.env.ARCADE_URL || 'http://127.0.0.1:7458/');
 await page.waitForFunction(async()=>{if(!window.System)return false;const cc=await System.import('cc');const lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');if(!lab?.snapshot().arcade?.enemyId)return false;window.arcadeStress={lab,cc};return true;});
 report.runtime=await page.evaluate(()=>({version:window.arcadeStress.cc.VERSION,backend:window.arcadeStress.cc.PhysicsSystem2D.instance.physicsWorld.constructor.name}));
 assert.equal(report.runtime.version,'3.8.8');assert.equal(report.runtime.backend,'b2PhysicsWorld');
 for(let i=0;i<30;i++){
  const previous=await page.evaluate(()=>{const {lab}=window.arcadeStress,old=lab.snapshot().rig.resetCount;lab.resetRagdolls();return old;});
  await page.waitForFunction(old=>{const {lab}=window.arcadeStress;return lab.snapshot().rig.resetCount>old&&lab.snapshot().arcade.enemyId!==null;},previous);
  await page.waitForTimeout(800);
  const s=await page.evaluate(()=>window.arcadeStress.lab.snapshot());assert.ok(s.nativeCounts,'Native Box2D counts are required');
  assert.ok(s.rig.ragdolls.every(a=>a.finite));assert.equal(s.arcade.score,0);
  report.restarts.push({native:s.nativeCounts,pool:s.projectilePoolSize});
 }
 assert.equal(new Set(report.restarts.map(r=>r.native.joints)).size,1,'重开关节数应回到同一基线');
 assert.ok(Math.max(...report.restarts.map(r=>r.native.bodies))-Math.min(...report.restarts.map(r=>r.native.bodies))<=1,'重开刚体不持续增长');
 const started=Date.now();let injectedId=1000000;
 while(Date.now()-started<durationMs){
  const s=await page.evaluate(shotId=>{
   const {lab}=window.arcadeStress;lab.combatStates.get('PlayerRagdoll').hp=lab.config.player.hp;
   const enemy=lab.arcade.current;
   if(enemy){const head=enemy.actor.bodies.get('head'),point={x:head.node.worldPosition.x/32,y:head.node.worldPosition.y/32};
    // Isolate lifecycle churn. This explicit hit injection does not test arrow collision.
    lab.hitResolver.resolve({shotId,stepId:lab.physics.steps,attackerId:'PlayerRagdoll',targetId:enemy.actor.id,partId:'head',pointM:point,normal:{x:-1,y:0},incomingVelocityMps:{x:18,y:0},arrow:lab.config.arrows[0],source:'sweep',fraction:0.5},head);
   }
   return lab.snapshot();
  },injectedId++);
  assert.ok(s.nativeCounts);assert.ok(s.nativeCounts.bodies<=110);assert.ok(s.rig.ragdolls.every(a=>a.finite));
  if(report.samples.length>=1000)report.samples.shift();
  report.samples.push({elapsedMs:Date.now()-started,native:s.nativeCounts,arcade:s.arcade,pool:s.projectilePoolSize});
  if(report.samples.length%30===0)await save();
  await page.waitForTimeout(1000);
 }
 report.diagnostics=await page.evaluate(()=>window.arcadeStress.lab.snapshot().diagnostics);
 report.durationMs=Date.now()-started;report.status='MEASURED_LIFECYCLE_CHECKS_PASSED';report.passed=true;
 assert.deepEqual(report.errors,[]);
} catch(error){report.status='FAILED';report.failure=String(error);process.exitCode=1;}
finally{await save();await browser?.close();}
