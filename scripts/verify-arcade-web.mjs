import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.ARCADE_EVIDENCE_DIR || 'evidence/arcade/runtime'; await mkdir(out, {recursive:true});
if (!process.env.ARCADE_URL && !existsSync('build/web-desktop/index.html')) {
 await writeFile(out+'/verification.json', JSON.stringify({passed:false,status:'BLOCKED',reason:'Current Creator Web build missing; import and build this revision first.'},null,2)+'\n');
 console.error('BLOCKED: current Creator Web build missing'); process.exit(2);
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs');
const browser = await chromium.launch({headless:process.env.HEADED !== '1',executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page = await browser.newPage({viewport:{width:1440,height:810}});
const report={passed:false,scope:'Native arcade loop, AI fire and isolated fatal-head hit injection; not manual aim or G1 acceptance',errors:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
try {
 await page.goto(process.env.ARCADE_URL || 'http://127.0.0.1:7458/');
 await page.waitForFunction(async()=>{
  if(!window.System)return false; const cc=await System.import('cc');const lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');
  if(!lab?.snapshot().arcade)return false;window.arcadeTest={lab,cc};return true;
 });
 await page.waitForFunction(()=>window.arcadeTest.lab.snapshot().arcade.enemyShots>0,null,{timeout:18000});
 report.initial=await page.evaluate(()=>window.arcadeTest.lab.snapshot());
 report.runtime=await page.evaluate(()=>({version:window.arcadeTest.cc.VERSION,backend:window.arcadeTest.cc.PhysicsSystem2D.instance.physicsWorld.constructor.name}));
 assert.equal(report.runtime.version,'3.8.8');assert.equal(report.runtime.backend,'b2PhysicsWorld');
 await page.waitForFunction(()=>window.arcadeTest.lab.snapshot().combat.find(a=>a.id==='PlayerRagdoll').hits>0,null,{timeout:45000});
 report.actualEnemyHit=await page.evaluate(()=>window.arcadeTest.lab.snapshot());
 assert.ok(report.actualEnemyHit.combat.find(a=>a.id==='PlayerRagdoll').hp<100,'真实敌箭必须实际命中并扣血');
 const resetCount=report.actualEnemyHit.rig.resetCount;
 await page.evaluate(()=>window.arcadeTest.lab.resetRagdolls());
 await page.waitForFunction(old=>window.arcadeTest.lab.snapshot().rig.resetCount>old&&window.arcadeTest.lab.snapshot().arcade.enemyId,resetCount);
 report.disarm=await page.evaluate(()=>{
  const {lab,cc}=window.arcadeTest;cc.director.pause();const enemy=lab.arcade.current;
  const body=enemy.actor.bodies.get('rightForearm'),point={x:body.node.worldPosition.x/32,y:body.node.worldPosition.y/32};
  for(const shotId of [899998,899999])lab.hitResolver.resolve({shotId,stepId:lab.physics.steps,attackerId:'PlayerRagdoll',targetId:enemy.actor.id,partId:'rightForearm',pointM:point,
   normal:{x:-1,y:0},incomingVelocityMps:{x:18,y:0},arrow:lab.config.arrows[0],source:'sweep',fraction:0.5},body);
  const before=lab.arcade.snapshot;lab.arcade.afterStep();const after=lab.arcade.snapshot;
  cc.director.resume();return {before,after};
 });
 assert.equal(report.disarm.after.armed,false);assert.equal(report.disarm.after.score,0);assert.equal(report.disarm.after.dropCount,1);
 report.fatal=await page.evaluate(()=>{
  const {lab,cc}=window.arcadeTest;cc.director.pause();const enemy=lab.arcade.current,head=enemy.actor.bodies.get('head');
  const point={x:head.node.worldPosition.x/32,y:head.node.worldPosition.y/32};
  lab.hitResolver.resolve({shotId:900000,stepId:lab.physics.steps,attackerId:'PlayerRagdoll',targetId:enemy.actor.id,partId:'head',pointM:point,
   normal:{x:-1,y:0},incomingVelocityMps:{x:18,y:0},arrow:lab.config.arrows[0],source:'sweep',fraction:0.5},head);
  lab.arcade.afterStep();
  const result={id:enemy.actor.id,hp:lab.combatStates.get(enemy.actor.id).hp,neckPresent:enemy.actor.joints.has('neck'),platformDynamic:enemy.platform.getComponent(cc.RigidBody2D).type===cc.ERigidBody2DType.Dynamic,score:lab.arcade.score,dropCount:lab.arcade.snapshot.dropCount};
  lab.arcade.afterStep();result.scoreAfterDuplicate=lab.arcade.score;cc.director.resume();return result;
 });
 assert.equal(report.fatal.dropCount,1);assert.equal(report.fatal.hp,0);assert.equal(report.fatal.platformDynamic,true);assert.equal(report.fatal.neckPresent,false);assert.equal(report.fatal.scoreAfterDuplicate,report.fatal.score);
 await page.waitForFunction(old=>window.arcadeTest.lab.snapshot().arcade.enemyId && window.arcadeTest.lab.snapshot().arcade.enemyId!==old,report.fatal.id,{timeout:8000});
 report.respawn=await page.evaluate(()=>window.arcadeTest.lab.snapshot());
 assert.equal(report.respawn.arcade.score,report.fatal.score);
 await page.waitForTimeout(4000);
 report.cleanup=await page.evaluate(()=>window.arcadeTest.lab.snapshot());
 assert.ok(report.cleanup.rig.ragdolls.every(a=>a.id!==report.fatal.id),'旧尸体应从逻辑列表与工厂回收');
 await page.screenshot({path:out+'/battle.png'});
 assert.deepEqual(report.errors,[]);report.passed=true;
} catch(e){report.failure=String(e);throw e;} finally {await writeFile(out+'/verification.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
