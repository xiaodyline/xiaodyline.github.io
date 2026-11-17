"use strict";
(() => {
 const rail=document.getElementById("rail");
 const progress=document.getElementById("progress");
 const prev=document.getElementById("prev");
 const next=document.getElementById("next");
 const menu=document.querySelector(".menu");
 const nav=document.querySelector(".header nav");
 const dialog=document.getElementById("projectDialog");\n const dialogTitle=document.getElementById("dialogTitle");\n const dialogText=document.getElementById("dialogText");\n const dialogTags=document.getElementById("dialogTags");
 const projects={
  alpha:{title:"Orbit Workspace",text:"一个用于团队协作的虚构产品概念。演示项目管理、任务分配与活动趋势的组合界面。",tags:["React","TypeScript","Dashboard","Product UX"]},
  beta:{title:"Northstar Analytics",text:"一个用于展示数据探索与业务分析能力的虚构产品概念。图表和指标均为演示数据。",tags:["Next.js","Data Visualization","Charts","Interaction"]},
  gamma:{title:"Flowkit Studio",text:"一个用于展示 AI 工作流编排体验的虚构产品概念。通过节点连接表达触发、理解与执行过程。",tags:["Agent","Workflow","UX","Automation"]}
 };
 const update=()=>{if(!rail||!progress)return;const max=rail.scrollWidth-rail.clientWidth;progress.style.width=(max>0?Math.max(12,rail.scrollLeft/max*100):100)+"%";};
 prev?.addEventListener("click",()=>rail?.scrollBy({left:-rail.clientWidth*.8,behavior:"smooth"}));
 next?.addEventListener("click",()=>rail?.scrollBy({left:rail.clientWidth*.8,behavior:"smooth"}));
 rail?.addEventListener("scroll",update,{passive:true});window.addEventListener("resize",update);update();
 menu?.addEventListener("click",()=>{const open=nav.classList.toggle("open");menu.setAttribute("aria-expanded",String(open));menu.setAttribute("aria-label",open?"关闭菜单":"打开菜单");});
 nav?.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{nav.classList.remove("open");menu?.setAttribute("aria-expanded","false");menu?.setAttribute("aria-label","打开菜单");}));
 document.getElementById("year").textContent=new Date().getFullYear();
 document.querySelectorAll("[data-project]").forEach(btn=>btn.addEventListener("click",()=>{const p=projects[btn.dataset.project];if(!p)return;if(!dialog||!dialogTitle||!dialogText||!dialogTags||typeof dialog.showModal!=="function")return;dialogTitle.textContent=p.title;dialogText.textContent=p.text;dialogTags.replaceChildren(...p.tags.map(t=>{const tag=document.createElement("span");tag.textContent=t;return tag;}));dialog.showModal();}));
 document.getElementById("closeDialog")?.addEventListener("click",()=>dialog.close());
 dialog?.addEventListener("click",e=>{if(e.target===dialog)dialog.close();});
})();