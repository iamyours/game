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
const snapshot = () => page.evaluate(async()=>{const cc=await System.import('cc');const lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');return lab?.snapshot() ?? null;});
const waitSnapshot = async(predicate, timeout=18000) => { const end=Date.now()+timeout; while(Date.now()<end){ const value=await snapshot(); if(predicate(value)) return value; await page.waitForTimeout(30); } throw Error(`snapshot wait timed out: ${JSON.stringify(await snapshot())}`); };
page.on('pageerror',e=>report.errors.push(String(e)));
try {
 await page.goto(process.env.ARCADE_URL || 'http://127.0.0.1:7458/');
 await page.waitForFunction(async()=>{
  if(!window.System)return false; const cc=await System.import('cc');const lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');
  return Boolean(lab?.snapshot().arcade);
 });
 await waitSnapshot(s=>s?.arcade?.enemyShots>0,18000);
 report.initial=await snapshot();
 report.runtime=await page.evaluate(async()=>{const cc=await System.import('cc');return {version:cc.VERSION,backend:cc.PhysicsSystem2D.instance.physicsWorld.constructor.name};});
 assert.equal(report.runtime.version,'3.8.8');assert.equal(report.runtime.backend,'b2PhysicsWorld');
 await waitSnapshot(s=>s?.combat?.find(a=>a.id==='PlayerRagdoll')?.hits>0,45000);
 report.actualEnemyHit=await snapshot();
 assert.ok(report.actualEnemyHit.combat.find(a=>a.id==='PlayerRagdoll').hp<100,'真实敌箭必须实际命中并扣血');
 const resetCount=report.actualEnemyHit.rig.resetCount;
 await page.evaluate(async()=>{const cc=await System.import('cc');const lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');lab.resetRagdolls();});
 await waitSnapshot(s=>s?.rig?.resetCount>resetCount&&Boolean(s.arcade?.enemyId));
 report.disarm=await page.evaluate(async()=>{
  const cc=await System.import('cc');const lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');cc.director.pause();const enemy=lab.arcade.current;
  const body=enemy.actor.bodies.get('rightForearm'),point={x:body.node.worldPosition.x/32,y:body.node.worldPosition.y/32};
  for(const shotId of [899998,899999])lab.hitResolver.resolve({shotId,stepId:lab.physics.steps,attackerId:'PlayerRagdoll',targetId:enemy.actor.id,partId:'rightForearm',pointM:point,
   normal:{x:-1,y:0},incomingVelocityMps:{x:18,y:0},arrow:lab.config.arrows[0],source:'sweep',fraction:0.5},body);
  const before=lab.arcade.snapshot;lab.arcade.afterStep();const after=lab.arcade.snapshot;
  cc.director.resume();return {before,after};
 });
 assert.equal(report.disarm.after.armed,false);assert.equal(report.disarm.after.score,0);assert.equal(report.disarm.after.dropCount,1);
 report.fatal=await page.evaluate(async()=>{
  const cc=await System.import('cc');const lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');cc.director.pause();const enemy=lab.arcade.current,head=enemy.actor.bodies.get('head');
  const point={x:head.node.worldPosition.x/32,y:head.node.worldPosition.y/32};
  const sprite = enemy.actor.bodyNodes.get('head').getChildByName('Skin_head')?.getComponent(cc.Sprite);
  const beforeTint = sprite ? [sprite.color.r,sprite.color.g,sprite.color.b,sprite.color.a] : null;
  lab.hitResolver.resolve({shotId:900000,stepId:lab.physics.steps,attackerId:'PlayerRagdoll',targetId:enemy.actor.id,partId:'head',pointM:point,
   normal:{x:-1,y:0},incomingVelocityMps:{x:18,y:0},arrow:lab.config.arrows[0],source:'sweep',fraction:0.5},head);
  lab.arcade.afterStep();
  const result={id:enemy.actor.id,hp:lab.combatStates.get(enemy.actor.id).hp,neckPresent:enemy.actor.joints.has('neck'),platformDynamic:enemy.platform.getComponent(cc.RigidBody2D).type===cc.ERigidBody2DType.Dynamic,score:lab.arcade.score,dropCount:lab.arcade.snapshot.dropCount};
  result.beforeTint=beforeTint;result.afterTint=sprite ? [sprite.color.r,sprite.color.g,sprite.color.b,sprite.color.a] : null;
  lab.arcade.afterStep();result.scoreAfterDuplicate=lab.arcade.score;cc.director.resume();return result;
 });
 assert.equal(report.fatal.dropCount,1);assert.equal(report.fatal.hp,0);assert.equal(report.fatal.platformDynamic,true);assert.equal(report.fatal.neckPresent,true,'头部暴击后保留颈关节');assert.equal(report.fatal.scoreAfterDuplicate,report.fatal.score);
 assert.deepEqual(report.fatal.afterTint,report.fatal.beforeTint,'短受击反馈不遗留伤色');
 await waitSnapshot(s=>Boolean(s?.arcade?.enemyId)&&s.arcade.enemyId!==report.fatal.id,8000);
 report.respawn=await snapshot();
 assert.equal(report.respawn.arcade.score,report.fatal.score);
 await page.waitForFunction(async id=>{
  const cc=await System.import('cc'),lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');
  const enemy=lab?.arcade.enemies.find(e=>e.actor.id===id);
  const a=enemy?.actor.root.getComponent(cc.UIOpacity)?.opacity,b=enemy?.platform.getComponent(cc.UIOpacity)?.opacity;
  return typeof a==='number'&&typeof b==='number'&&a>0&&a<255&&b>0&&b<255;
 },report.fatal.id,{timeout:5000});
 report.fade=await page.evaluate(async id=>{
  const cc=await System.import('cc'),lab=cc.director.getScene().getChildByName('PhysicsLab').getComponent('StormArchersPhysicsLab');
  const enemy=lab.arcade.enemies.find(e=>e.actor.id===id);
  return {body:enemy.actor.root.getComponent(cc.UIOpacity).opacity,platform:enemy.platform.getComponent(cc.UIOpacity).opacity,
   neckPresent:enemy.actor.joints.has('neck'),activeHighlights:lab.arcade.injuries.get(id)?.size??0};
 },report.fatal.id);
 assert.equal(report.fade.neckPresent,true);assert.equal(report.fade.activeHighlights,0);
 await page.waitForTimeout(4000);
 report.cleanup=await snapshot();
 assert.ok(report.cleanup.rig.ragdolls.every(a=>a.id!==report.fatal.id),'旧尸体应从逻辑列表与工厂回收');
 await page.screenshot({path:out+'/battle.png'});
 assert.deepEqual(report.errors,[]);report.passed=true;
} catch(e){report.failure=String(e);throw e;} finally {await writeFile(out+'/verification.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
