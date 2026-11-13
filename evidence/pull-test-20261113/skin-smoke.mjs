import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
const out='evidence/pull-test-20261113';
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1440,height:810}});
const report={passed:false,browser:browser.version(),errors:[],consoleErrors:[],failedRequests:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});
page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
const snapshot=()=>page.evaluate(async()=>{const cc=await System.import('cc');return cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab')?.snapshot()});
try{
 await page.goto('http://127.0.0.1:7458/?practice=1');
 const deadline=Date.now()+45000;let ready=false;
 while(Date.now()<deadline){
  ready=await page.evaluate(async()=>{if(!window.System)return false;const cc=await System.import('cc');const lab=cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');return Boolean(lab?.snapshot().thunderSkin?.loaded&&lab.snapshot().pose.hands.ready)});
  if(ready)break;await page.waitForTimeout(30);
 }
 assert.ok(ready,'skin and physical hands ready');
 report.runtime=await page.evaluate(async()=>{const cc=await System.import('cc');return {version:cc.VERSION,backend:cc.PhysicsSystem2D.instance.physicsWorld.constructor.name,webgl:document.querySelector('canvas')?.getContext('webgl2')?.getParameter(7938)}});
 report.idle=await snapshot();
 assert.equal(report.idle.thunderSkin.strips,40);assert.equal(report.idle.thunderSkin.visible,true);
 await page.screenshot({path:out+'/skin-idle.png'});
 const s=report.idle,r=s.layout.aim,x=(r.left+r.right)/2*1440/s.width,y=(r.top+r.bottom)/2*810/s.height;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+140,y-45,{steps:12});await page.waitForTimeout(2200);
 report.drawing=await snapshot();await page.screenshot({path:out+'/skin-drawing.png'});
 assert.equal(report.drawing.shots,report.idle.shots,'holding must not fire');assert.ok(report.drawing.thunderSkin.flex>report.idle.thunderSkin.flex,'hand-driven bow flex changes');
 await page.mouse.up();await page.waitForTimeout(700);report.released=await snapshot();
 assert.equal(report.released.shots,report.idle.shots+1,'release fires one arrow');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);assert.deepEqual(report.consoleErrors,[]);report.passed=true;
}catch(e){report.failure=String(e);process.exitCode=1;await page.screenshot({path:out+'/skin-failure.png'}).catch(()=>{});}
finally{await writeFile(out+'/skin-verification.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
console.log(JSON.stringify({passed:report.passed,failure:report.failure,runtime:report.runtime}));
