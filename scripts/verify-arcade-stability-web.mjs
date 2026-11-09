import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
const out=process.env.ARCADE_STABILITY_EVIDENCE_DIR || 'evidence/arcade/stability';
await mkdir(out,{recursive:true});
const report={passed:false,status:'NOT_RUN',scope:'Real Creator/Box2D lifecycle stress with injected head hits and HP refills; not manual combat, projectile collision or G1',listenerCoverage:'Cocos callbacks owned by lab + projectile pool; browser/OS excluded',errors:[],restarts:[],samples:[]};
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
 const snapshot = () => page.evaluate(async()=>{const cc=await System.import('cc');const lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');return lab?.snapshot() ?? null;});
 const waitSnapshot = async(predicate, timeout=18000) => { const end=Date.now()+timeout; while(Date.now()<end){ const value=await snapshot(); if(predicate(value)) return value; await page.waitForTimeout(30); } throw Error(`snapshot wait timed out: ${JSON.stringify(await snapshot())}`); };
 await page.goto(process.env.ARCADE_URL || 'http://127.0.0.1:7458/');
 const readyEnd=Date.now()+18000; while(Date.now()<readyEnd){ const ready=await page.evaluate(async()=>{const cc=await System.import('cc');const lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');return Boolean(lab?.snapshot().arcade?.enemyId && cc.PhysicsSystem2D.instance.physicsWorld.constructor.name === 'b2PhysicsWorld');}); if(ready) break; await page.waitForTimeout(30); }
 report.runtime=await page.evaluate(async()=>{const cc=await System.import('cc');const world=cc.PhysicsSystem2D.instance.physicsWorld;return {version:cc.VERSION,backend:world.constructor.name};});
 assert.equal(report.runtime.version,'3.8.8');assert.equal(report.runtime.backend,'b2PhysicsWorld');
 for(let i=0;i<30;i++){
  const previous=await page.evaluate(async()=>{const cc=await System.import('cc');const lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');const old=lab.snapshot().rig.resetCount;lab.resetRagdolls();return old;});
  await waitSnapshot(s=>s?.rig?.resetCount>previous&&s.arcade?.enemyId!==null);
  await page.waitForTimeout(800);
  const s=await snapshot();assert.ok(s.nativeCounts,'Native Box2D counts are required');
  assert.ok(s.rig.ragdolls.every(a=>a.finite));assert.equal(s.arcade.score,0);
  report.restarts.push({native:s.nativeCounts,pool:s.projectilePoolSize,listeners:s.listenerCounts});
  if(s.listenerCounts.contacts!==null)assert.equal(s.listenerCounts.contacts,s.projectilePoolSize,'箭池每槽仅一个实际接触监听');
 }
 assert.equal(new Set(report.restarts.map(r=>r.native.joints)).size,1,'重开关节数应回到同一基线');
 assert.ok(Math.max(...report.restarts.map(r=>r.native.bodies))-Math.min(...report.restarts.map(r=>r.native.bodies))<=1,'重开刚体不持续增长');
 const globals=report.restarts.map(r=>r.listeners.globals);
 if(globals.every(n=>n!==null))assert.equal(new Set(globals).size,1,'重开不叠加全局监听');
 else report.listenerCoverage='UNAVAILABLE: backend callback tables not exposed';
 if(report.restarts.some(r=>r.listeners.cocosTotal===null))report.listenerCoverage='PARTIAL: some Cocos callback tables unavailable';
 const started=Date.now();let injectedId=1000000;
 while(Date.now()-started<durationMs){
  const s=await page.evaluate(async shotId=>{
   const cc=await System.import('cc');const lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');lab.combatStates.get('PlayerRagdoll').hp=lab.config.player.hp;
   const enemy=lab.arcade.current;
   if(enemy){const head=enemy.actor.bodies.get('head'),point={x:head.node.worldPosition.x/32,y:head.node.worldPosition.y/32};
    // Isolate lifecycle churn. This explicit hit injection does not test arrow collision.
    lab.hitResolver.resolve({shotId,stepId:lab.physics.steps,attackerId:'PlayerRagdoll',targetId:enemy.actor.id,partId:'head',pointM:point,normal:{x:-1,y:0},incomingVelocityMps:{x:18,y:0},arrow:lab.config.arrows[0],source:'sweep',fraction:0.5},head);
   }
   return lab.snapshot();
  },injectedId++);
  assert.ok(s.nativeCounts);assert.ok(s.nativeCounts.bodies<=110);assert.ok(s.rig.ragdolls.every(a=>a.finite));
  if(report.samples.length>=1000)report.samples.shift();
  report.samples.push({elapsedMs:Date.now()-started,native:s.nativeCounts,arcade:s.arcade,pool:s.projectilePoolSize,listeners:s.listenerCounts});
  if(s.listenerCounts.contacts!==null)assert.equal(s.listenerCounts.contacts,s.projectilePoolSize);
  if(report.samples.length%30===0)await save();
  await page.waitForTimeout(1000);
 }
 report.diagnostics=(await snapshot()).diagnostics;
 report.durationMs=Date.now()-started;
 report.disposal=await page.evaluate(async()=>{
  const cc=await System.import('cc');const scene=cc.director.getScene();const lab=scene?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');
  lab.node.destroy();
  await new Promise(resolve=>setTimeout(resolve,250));
  const world=cc.PhysicsSystem2D.instance.physicsWorld, raw=world._world ?? world.impl?._world;
  return {listeners:lab.listenerCounts(),bodies:raw.GetBodyCount(),
   joints:raw.GetJointCount()};
 });
 if(report.disposal.listeners.cocosTotal!==null)assert.equal(report.disposal.listeners.cocosTotal,0);
 assert.equal(report.disposal.joints,0);assert.ok(report.disposal.bodies<=1,'销毁场景后仅允许Box2D内部ground body');
report.status='MEASURED_LIFECYCLE_CHECKS_PASSED';report.passed=true;
 assert.deepEqual(report.errors,[]);
} catch(error){report.passed=false;report.status='FAILED';report.failure=String(error);process.exitCode=1;}
finally{await save();await browser?.close();}
