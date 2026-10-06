'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDemoServer } = require('./serve-ui-demo');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'verification/ui-demo');
const candidates = [
  process.env.AI_TEA_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
const executablePath = candidates.find(file => fs.existsSync(file));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], errors = [], layouts = [];
function record(name) { checks.push(name); }
async function draw(page, tool, from, to) {
  await page.locator('[data-tool="' + tool + '"]').click();
  const box = await page.locator('#board').boundingBox();
  await page.mouse.move(box.x+box.width*from[0], box.y+box.height*from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*to[0], box.y+box.height*to[1], { steps: 14 });
  await page.mouse.up();
}
async function layoutAudit(page, name) {
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth, height = innerHeight;
    const visible = element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden';
    };
    const essential = [...document.querySelectorAll('.tool-rail button, .context-bar input, .context-bar button, .panel-launchers button')].filter(visible);
    const outside = essential.filter(element => {
      const box=element.getBoundingClientRect();
      return box.left < -1 || box.right > width+1 || box.top < -1 || box.bottom > height+1;
    }).map(element=>element.id || element.getAttribute('aria-label'));
    const toolBoxes=[...document.querySelectorAll('.tool-rail button')].filter(visible).map(element=>({
      label:element.getAttribute('aria-label'),
      x:element.getBoundingClientRect().x,y:element.getBoundingClientRect().y,
      width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height
    }));
    const overlaps=[];
    for(let a=0;a<toolBoxes.length;a++)for(let b=a+1;b<toolBoxes.length;b++){
      const x=toolBoxes[a],y=toolBoxes[b];
      if(Math.min(x.x+x.width,y.x+y.width)-Math.max(x.x,y.x)>1 && Math.min(x.y+x.height,y.y+y.height)-Math.max(x.y,y.y)>1)overlaps.push([x.label,y.label]);
    }
    return { width,height,scrollWidth:document.documentElement.scrollWidth,outside,overlaps,toolTargets:toolBoxes };
  });
  assert.ok(result.scrollWidth<=result.width+1, name+' has no horizontal overflow');
  assert.deepEqual(result.outside, [], name+' keeps essential controls on-screen');
  assert.deepEqual(result.overlaps, [], name+' tools do not overlap');
  layouts.push({ name,...result });
}
async function verify() {
  if (!executablePath) throw new Error('No installed Chrome/Edge found; set AI_TEA_BROWSER.');
  fs.mkdirSync(output,{recursive:true});
  const {server,url}=await createDemoServer({port:0});
  let browser, desktop;
  try {
    browser=await chromium.launch({executablePath,headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true});
    desktop=await context.newPage();
    const requests=[];
    const watch = page => {
      page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>requests.push(request.url()));
    };
    watch(desktop);
    await desktop.goto(url);
    await desktop.waitForSelector('#art [data-object]');
    await layoutAudit(desktop,'desktop-1440');
    await desktop.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
    record('desktop-canvas-and-layout');

    const objects=desktop.locator('#art [data-object]');
    const initialCount=await objects.count();
    await draw(desktop,'brush',[.10,.09],[.27,.13]);
    assert.equal(await objects.count(),initialCount+1);
    assert.equal(await desktop.locator('#art [aria-label="画笔线条"] path').count(),1);
    await desktop.locator('#undo').click();
    assert.equal(await objects.count(),initialCount);
    await desktop.locator('#redo').click();
    assert.equal(await objects.count(),initialCount+1);
    record('freehand-drawing-undo-redo');

    await desktop.locator('#shape-fill').check();
    await draw(desktop,'rect',[.15,.15],[.28,.25]);
    const rectangle=desktop.locator('#art [aria-label="矩形"]').last();
    await desktop.locator('[data-tool="select"]').click();
    await rectangle.locator('rect').click();
    assert.equal(await desktop.locator('#selection-overlay [data-handle]').count(),5);
    await desktop.locator('#color-open').click();
    await desktop.locator('[data-color="#ce9275"]').click();
    assert.equal(await rectangle.locator('rect').getAttribute('fill'),'#ce9275');
    await desktop.locator('#color-close').click();
    record('select-and-immediate-color-change');

    const beforeTransform=await rectangle.getAttribute('transform');
    const box=await rectangle.boundingBox();
    await desktop.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await desktop.mouse.down();
    await desktop.mouse.move(box.x+box.width/2+36,box.y+box.height/2+24,{steps:8});
    await desktop.mouse.up();
    assert.notEqual(await rectangle.getAttribute('transform'),beforeTransform);
    const beforeResize=await rectangle.boundingBox();
    const handle=await desktop.locator('[data-handle="se"]').boundingBox();
    await desktop.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
    await desktop.mouse.down();
    await desktop.mouse.move(handle.x+handle.width/2+24,handle.y+handle.height/2+18,{steps:8});
    await desktop.mouse.up();
    const afterResize=await rectangle.boundingBox();
    assert.ok(afterResize.width>beforeResize.width+15);
    assert.ok(afterResize.height>beforeResize.height+10);
    const rotation=await desktop.locator('[data-handle="rotate"]').boundingBox();
    const rotateBefore=await rectangle.getAttribute('transform');
    await desktop.mouse.move(rotation.x+rotation.width/2,rotation.y+rotation.height/2);
    await desktop.mouse.down();
    await desktop.mouse.move(rotation.x+rotation.width/2+45,rotation.y+rotation.height/2+24,{steps:8});
    await desktop.mouse.up();
    assert.notEqual(await rectangle.getAttribute('transform'),rotateBefore);
    record('direct-object-move-scale-rotate');

    const countBeforeDuplicate=await objects.count();
    await desktop.keyboard.press('Control+d');
    assert.equal(await objects.count(),countBeforeDuplicate+1);
    await desktop.keyboard.press('Delete');
    assert.equal(await objects.count(),countBeforeDuplicate);
    record('duplicate-delete-with-keyboard');

    const layerCount=await desktop.locator('.layer-row').count();
    await desktop.locator('#add-layer').click();
    assert.equal(await desktop.locator('.layer-row').count(),layerCount+1);
    await desktop.locator('#layer-name').fill('演示新图层');
    await desktop.locator('#layer-name').press('Tab');
    assert.ok(await desktop.locator('.layer-select strong').filter({hasText:'演示新图层'}).count());
    await desktop.getByRole('button',{name:'隐藏 鲸鱼茶摊',exact:true}).click();
    assert.equal(await desktop.locator('#art [aria-label="小鲸鱼"]').count(),0);
    await desktop.getByRole('button',{name:'显示 鲸鱼茶摊',exact:true}).click();
    assert.equal(await desktop.locator('#art [aria-label="小鲸鱼"]').count(),1);
    await desktop.getByRole('button',{name:'锁定 鲸鱼茶摊',exact:true}).click();
    await desktop.locator('[data-tool="select"]').click();
    await desktop.locator('#art [aria-label="小鲸鱼"] path').first().click();
    assert.equal(await desktop.locator('#selection-overlay [data-handle]').count(),0);
    await desktop.getByRole('button',{name:'解锁 鲸鱼茶摊',exact:true}).click();
    record('layers-add-rename-visibility-and-lock');

    await desktop.locator('[data-open-panel="agent"]').first().click();
    const beforeAgent=await objects.count();
    await desktop.locator('#agent-demo-add').click();
    assert.equal(await objects.count(),beforeAgent+1);
    await desktop.locator('[data-panel="layers"]').click();
    const downloadPromise=desktop.waitForEvent('download');
    await desktop.locator('#export-svg').click();
    const download=await downloadPromise;
    const exportPath=path.join(output,'demo-export.svg');
    await download.saveAs(exportPath);
    const exported=fs.readFileSync(exportPath,'utf8');
    assert.ok(exported.startsWith('<svg'));
    assert.ok(!exported.includes('selection-overlay'));
    assert.ok(!exported.includes('<script'));
    record('editable-agent-example-and-svg-export');

    await desktop.locator('#submit-open').click();
    await desktop.locator('#artwork-name').fill('测试发布的深海茶摊');
    await desktop.locator('#submit-confirm').click();
    assert.match(await desktop.locator('#review-status').textContent(),/等待房主/);
    await desktop.locator('#simulate-approve').click();
    await desktop.locator('[data-view="shared"]').click();
    assert.match(await desktop.locator('#canvas-caption').textContent(),/测试发布的深海茶摊/);
    assert.equal(await desktop.locator('[data-tool="brush"]').isDisabled(),true);
    await desktop.locator('[data-view="draft"]').click();
    assert.equal(await desktop.locator('[data-tool="brush"]').isDisabled(),false);
    record('submit-review-and-shared-view-local-demo');
    const persistedCount=await objects.count();
    await pause(180);
    await desktop.reload();
    await desktop.waitForSelector('#art [data-object]');
    assert.equal(await objects.count(),persistedCount);
    record('reload-restores-local-draft');

    await desktop.locator('#research-open').click();
    for(const product of ['krita','procreate','clip','concepts','sketchbook']){
      await desktop.locator('[data-product="'+product+'"]').click();
      assert.ok(await desktop.locator('#research-detail .source-links a').count());
    }
    await desktop.locator('[data-product="procreate"]').click();
    await desktop.screenshot({path:path.join(output,'research.png'),fullPage:true});
    await desktop.locator('[data-close-dialog="research-dialog"]').click();
    assert.equal((await fetch(url+'/research.md')).status,200);
    record('five-product-research-with-primary-source-links');

    await desktop.keyboard.press('f');
    assert.equal(await desktop.locator('.tool-rail').isVisible(),false);
    await desktop.locator('#focus-return').click();
    assert.equal(await desktop.locator('.tool-rail').isVisible(),true);
    await desktop.setViewportSize({width:1100,height:800});
    await layoutAudit(desktop,'desktop-1100');
    record('focus-mode-and-compact-desktop');

    const tabletContext=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true});
    const tablet=await tabletContext.newPage();watch(tablet);
    await tablet.goto(url+'/?layout=touch');
    await tablet.waitForSelector('#art [data-object]');
    await layoutAudit(tablet,'tablet-1024');
    await tablet.screenshot({path:path.join(output,'tablet.png'),fullPage:true});
    assert.equal(await tablet.locator('#side-panel').isVisible(),false);
    await tablet.locator('[data-open-panel="layers"]').click();
    assert.equal(await tablet.locator('#side-panel').isVisible(),true);
    await tablet.locator('#panel-close').click();
    const railBefore=await tablet.locator('.tool-rail').boundingBox();
    await tablet.locator('#hand-switch').click();
    const railAfter=await tablet.locator('.tool-rail').boundingBox();
    assert.ok(railAfter.x>railBefore.x+300);
    await tablet.locator('#hand-switch').click();
    record('tablet-panels-and-handedness');

    const cdp=await tablet.context().newCDPSession(tablet);
    const paperBox=await tablet.locator('#board').boundingBox();
    const centerX=paperBox.x+paperBox.width*.45, centerY=paperBox.y+paperBox.height*.45;
    const touch=(x,y,identifier)=>({x,y,id:identifier,radiusX:1,radiusY:1,force:1});
    const beforePinchCount=await tablet.locator('#art [data-object]').count();
    const beforePinchZoom=await tablet.locator('#zoom-value').textContent();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(centerX-25,centerY,0),touch(centerX+25,centerY,1)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(centerX-60,centerY+20,0),touch(centerX+60,centerY+20,1)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.notEqual(await tablet.locator('#zoom-value').textContent(),beforePinchZoom);
    assert.equal(await tablet.locator('#art [data-object]').count(),beforePinchCount);
    record('two-finger-zoom-pan-does-not-draw');
    await tablet.locator('#fit').click();
    await draw(tablet,'brush',[.13,.10],[.23,.12]);
    assert.equal(await tablet.locator('#art [data-object]').count(),beforePinchCount+1);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(centerX-20,centerY,0),touch(centerX+20,centerY,1)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await tablet.locator('#art [data-object]').count(),beforePinchCount);
    record('two-finger-tap-undo');

    for(const [width,height,name] of [[390,844,'phone'],[320,700,'phone-narrow']]){
      const mobileContext=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1});
      const phone=await mobileContext.newPage();watch(phone);
      await phone.goto(url+'/?layout=touch');
      await phone.waitForSelector('#art [data-object]');
      await layoutAudit(phone,name+'-'+width);
      if(width===390)await phone.screenshot({path:path.join(output,'phone.png'),fullPage:true});
      await phone.locator('#shape-open').tap();
      await phone.locator('#shape-menu-fill').check();
      await phone.locator('[data-shape="ellipse"]').tap();
      assert.equal(await phone.locator('[data-tool="ellipse"]').getAttribute('aria-pressed'),'true');
      const phoneBox=await phone.locator('#board').boundingBox();
      const oldCount=await phone.locator('#art [data-object]').count();
      await phone.mouse.move(phoneBox.x+phoneBox.width*.10,phoneBox.y+phoneBox.height*.10);
      await phone.mouse.down();
      await phone.mouse.move(phoneBox.x+phoneBox.width*.24,phoneBox.y+phoneBox.height*.25,{steps:8});
      await phone.mouse.up();
      assert.equal(await phone.locator('#art [data-object]').count(),oldCount+1);
      assert.equal(await phone.locator('#art [aria-label="椭圆"] ellipse').count(),1);
      const targetAudit=layouts.at(-1).toolTargets;
      assert.ok(targetAudit.every(target=>target.width>=43.5&&target.height>=43.5));
      await phone.locator('[data-open-panel="layers"]').tap();
      assert.equal(await phone.locator('#side-panel').isVisible(),true);
      await phone.locator('#panel-close').tap();
      await mobileContext.close();
    }
    record('phone-shape-menu-drawing-and-44px-tool-targets');
    record('390px-and-320px-phone-layouts');
    assert.deepEqual(errors,[]);
    assert.ok(requests.every(request=>request.startsWith(url)));
    record('no-runtime-errors-or-live-service-requests');
    const report={status:'passed',date:'2026-10-05',checks,layouts,screenshots:['desktop.png','tablet.png','phone.png','research.png'].map(file=>path.join(output,file)),errors,
      scope:'Local UI demo only; no real Steam or model integration.'};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({status:report.status,checks:checks.length,screenshots:report.screenshots}));
  } catch(error) {
    if(desktop)await desktop.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
    fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({status:'failed',message:error.message,stack:error.stack,checks,layouts,errors},null,2));
    throw error;
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
if(require.main===module)verify().catch(error=>{console.error(error.stack);process.exitCode=1;});
module.exports={verify};
