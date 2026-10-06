'use strict';
(() => {
  const products = [
    {
      id:'krita',name:'Krita',platform:'桌面 · 可自定义工作区',pattern:'工具条 + 可停靠面板',
      layout:'上方工具栏处理笔刷与参数；画布居中；图层、调色板、笔刷等功能组成可显示、隐藏、移动的 Dockers。',
      interaction:'空格拖动平移。右键在光标附近打开圆形弹出调色板，集中常用笔刷、颜色及最近颜色。',
      borrow:'桌面固定位置建立操作记忆；图层面板允许收起。把低频功能移出绘画主路径。',
      caution:'专业工作区可以很密集；茶绘应先提供精简默认布局，避免要求新用户先配置面板。',
      sources:[['界面与导航','https://docs.krita.org/en/user_manual/getting_started/navigation.html']]
    },
    {
      id:'procreate',name:'Procreate',platform:'iPad · 双手配合',pattern:'上方工具 + 侧边滑杆',
      layout:'右上方集中画笔、涂抹、橡皮、图层、颜色；左侧提供粗细、透明度和撤销/重做，侧栏可左右切换并移动。',
      interaction:'双指捏合缩放、双指轻点撤销、三指轻点重做；颜色和图层从顶部按需展开。',
      borrow:'触屏把常调参数放在非绘画手附近，提供足够大的点击目标。保留可见撤销按钮，手势作为补充。',
      caution:'笔刷纹理、压感和涂抹依赖位图引擎，不能只换 UI 就在当前 SVG 项目里宣称支持。',
      sources:[['界面与侧栏','https://help.procreate.com/procreate/handbook/interface-gestures/interface'],['触屏手势','https://help.procreate.com/procreate/handbook/interface-gestures/gestures']]
    },
    {
      id:'clip',name:'Clip Studio Paint',platform:'桌面 / 平板 · 两种密度',pattern:'Simple / Studio 双模式',
      layout:'Simple Mode 保留左侧工具、右侧图层、底部粗细和透明度；Studio Mode 提供更多可定制面板。',
      interaction:'点工具即可切换，再次点击打开笔刷选项。图层长按拖动排序，更多功能通过二次操作展开。',
      borrow:'桌面与触屏共享作品状态，采用不同的面板密度。当前任务决定界面需要显示哪些操作。',
      caution:'模式切换要保持画布、图层、选区和视角，不能让用户感觉跳到了另一套应用。',
      sources:[['平板布局','https://help.clip-studio.com/en-us/manual_en/090_tablet/Tablet_interface.htm'],['Simple Mode 操作','https://help.clip-studio.com/en-us/manual_en/090_tablet/Using_Simple_Mode.htm']]
    },
    {
      id:'concepts',name:'Concepts',platform:'平板 / 桌面 · 矢量草绘',pattern:'可移动工具轮 / 工具条',
      layout:'工具轮容纳常用工具；内圈调粗细、透明度、平滑度，中心选颜色。图层等面板可移动、收起。',
      interaction:'工具轮与工具条可切换；UI 支持普通、紧凑和隐藏状态，工具位置可以适应左右手习惯。',
      borrow:'矢量对象直接选择修改，参数集中在工具附近。触屏工具位置应该允许调整。',
      caution:'轮盘需要学习方向和手势。本次先做直接可见的工具条，之后再评估是否值得加入轮盘。',
      sources:[['工作区与工具轮','https://concepts.app/en/manual/workspace']]
    },
    {
      id:'sketchbook',name:'Sketchbook',platform:'桌面 / 平板 / 手机',pattern:'工具栏 + 浮动快捷控制',
      layout:'主要工具位于顶部，选中工具可出现第二层选项；桌面有笔刷/颜色控制，手机默认隐藏更多编辑面板。',
      interaction:'Double Puck 集中调节笔刷大小、透明度和颜色；Marking Menu 提供靠近画笔的快捷工具。',
      borrow:'根据屏幕大小重新组织界面，手机使用工具条和临时面板。选中工具后才展示相关选项。',
      caution:'隐藏功能不能成为唯一入口。茶绘要保留图层、颜色、撤销等可见按钮和明确高亮。',
      sources:[['基础界面','https://help.sketchbook.com/docs/basic-ui-elements'],['各端工具栏','https://help.sketchbook.com/docs/toolbars']]
    }
  ];
  const cards=document.getElementById('research-cards'), detail=document.getElementById('research-detail');
  function show(product) {
    cards.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.product===product.id)));
    detail.replaceChildren();
    const heading=document.createElement('div'), title=document.createElement('h2'), platform=document.createElement('p');
    title.textContent=product.name; platform.className='platform-label'; platform.textContent=product.platform; heading.append(title,platform);
    const content=document.createElement('div'), list=document.createElement('dl');
    for(const [label,text] of [['如何布置',product.layout],['操作方式',product.interaction],['茶绘借鉴',product.borrow],['设计取舍',product.caution]]) {
      const term=document.createElement('dt'), description=document.createElement('dd');
      term.textContent=label; description.textContent=text; list.append(term,description);
    }
    const links=document.createElement('div'); links.className='source-links';
    for(const [label,url] of product.sources) {
      const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.textContent=label+' ↗';links.append(link);
    }
    content.append(list,links);detail.append(heading,content);
  }
  for(const product of products) {
    const button=document.createElement('button');button.className='research-card';button.dataset.product=product.id;button.setAttribute('aria-pressed','false');
    const diagram=document.createElement('div');diagram.className='layout-diagram diagram '+product.id;diagram.setAttribute('aria-label',product.name+' 布局示意，非截图');
    for(const className of ['canvas','top','left','right','bottom',...(['concepts','sketchbook'].includes(product.id)?['wheel']:[])]) {
      const part=document.createElement('span');part.className='diagram-'+className;part.textContent=className==='canvas'?'画布':'';diagram.append(part);
    }
    const title=document.createElement('h3'), pattern=document.createElement('span');title.textContent=product.name;pattern.textContent=product.pattern;
    button.append(diagram,title,pattern);button.addEventListener('click',()=>show(product));cards.append(button);
  }
  show(products[0]);
})();
