import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs');
import { writeFileSync } from 'node:fs';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:810},deviceScaleFactor:1});
const page=await context.newPage();
const consoleLog=[],errors=[],failedRequests=[];
page.on('console',msg=>consoleLog.push({type:msg.type(),text:msg.text()}));
page.on('pageerror',error=>errors.push(String(error)));
page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()}));
let result;
try{
 await page.goto('http://127.0.0.1:7458/',{waitUntil:'networkidle',timeout:120000});
 let ready=false;
 for(let i=0;i<120;i++){
  ready=await page.evaluate(async()=>{
   try{const cc=await System.import('cc');const scene=cc.director.getScene();return !!scene?.getChildByName('Canvas')?.getChildByName('BootStatus')?.getComponent(cc.Label)?.string?.includes('配置加载完成');}catch{return false;}
  });
  if(ready)break;
  await page.waitForTimeout(1000);
 }
 if(!ready)throw new Error('Boot status not ready after 120 seconds');
 result=await page.evaluate(async()=>{
  const cc=await System.import('cc');const scene=cc.director.getScene();
  const label=scene?.getChildByName('Canvas')?.getChildByName('BootStatus')?.getComponent(cc.Label);
  const size=label?.getComponent(cc.UITransform)?.contentSize;
  const canvas=document.querySelector('canvas');const gl=canvas?.getContext('webgl2')||canvas?.getContext('webgl');
  return {labelSize:{width:size?.width,height:size?.height},scene:scene.name,label:scene.getChildByName('Canvas').getChildByName('BootStatus').getComponent(cc.Label).string,
   designResolution:{width:cc.view.getDesignResolutionSize().width,height:cc.view.getDesignResolutionSize().height},
   canvasSize:{width:canvas.width,height:canvas.height},webglVersion:gl?.getParameter(gl.VERSION)??null,
   physicsWorld:cc.PhysicsSystem2D.instance.physicsWorld?.constructor.name??null,engineVersion:cc.VERSION};
 });
 assert.equal(result.scene, 'Boot');
 assert.equal(result.engineVersion, '3.8.8');
 assert.equal(result.physicsWorld, 'b2PhysicsWorld');
 assert.match(result.webglVersion ?? '', /WebGL/);
 assert.deepEqual(result.designResolution, {width:1920,height:1080});
 assert.ok(result.labelSize.width >= 1600 && result.labelSize.height >= 600, 'Boot text area too small');
 assert.equal(failedRequests.length, 0, 'No failed resource requests expected');
 await page.waitForTimeout(1500);
 await page.screenshot({path:`${root}/evidence/T001/boot-webgl.png`,fullPage:true});
 if(errors.length)throw new Error(`Browser page errors: ${errors.join('; ')}`);
 const report={passed:true,date:process.env.SMOKE_DATE || new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York'}).format(new Date()),browser:browser.version(),mode:'headless Chrome, actual WebGL context; no hardware-performance, phone or feel claim',url:'http://127.0.0.1:7458/',result,errors,failedRequests,consoleLog};
 writeFileSync(`${root}/evidence/T001/webgl-smoke.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}catch(error){
 await page.screenshot({path:`${root}/evidence/T001/boot-webgl-failed.png`,fullPage:true}).catch(()=>{});
 writeFileSync(`${root}/evidence/T001/webgl-smoke.json`,JSON.stringify({passed:false,date:process.env.SMOKE_DATE || new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York'}).format(new Date()),error:String(error),errors,failedRequests,consoleLog},null,2)+'\n');
 throw error;
}finally{await browser.close();}
