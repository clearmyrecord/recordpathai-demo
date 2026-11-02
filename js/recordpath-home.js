(()=>{'use strict';const $=selector=>document.querySelector(selector);const sources={NV:[{name:'Las Vegas Township Justice Court',scope:'Clark County criminal and civil cases',url:'https://lvjcpa.clarkcountynv.gov/Anonymous/default.aspx',access:'Use the official portal to select criminal records and search.'},{name:'Nevada Appellate Courts',scope:'Nevada Supreme Court and Court of Appeals cases',url:'https://caseinfo.nvsupremecourt.us/public/caseSearch.do',access:'Search by case number, caption or participant.'},{name:'Nevada Judiciary — Find a Court',scope:'Other Nevada district, justice and municipal courts',url:'https://nvcourts.gov/aoc/how_do_i/find_a_court',access:'Select the relevant court; Nevada does not have one unified trial-court search.'}],FL:[{name:'Orange County Clerk — my eClerk',scope:'Orange County criminal and other court cases',url:'https://myeclerk.myorangeclerk.com/cases/search',access:'Enter first and last name or case number on the official site. Anonymous searches require CAPTCHA.'},{name:'Florida Courts',scope:'Locate other Florida courts and clerks',url:'https://www.flcourts.gov/Florida-Courts',access:'Choose the appropriate county court or clerk; coverage varies.'}],OH:[{name:'Wood County Clerk of Courts — Dockets Online',scope:'Wood County Common Pleas court records',url:'https://clerkofcourt.co.wood.oh.us/169/Dockets-Online',access:'Open the clerk\'s CourtView search. Older cases and recent filings may not be available.'},{name:'Ohio Supreme Court — Courts Directory',scope:'Find the relevant Ohio municipal or county court',url:'https://www.supremecourt.ohio.gov/courts/judicial-system/ohio-trial-courts/',access:'Search the appropriate court directly; Ohio has no comprehensive statewide trial-court case lookup.'}]}
const menu=$('#menu'),nav=$('#navlinks'),dialog=$('#resultsDialog'),form=$('#searchForm');
menu?.addEventListener('click',()=>{const open=nav?.classList.toggle('open')||false;menu.setAttribute('aria-expanded',String(open));});
nav?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{nav.classList.remove('open');menu?.setAttribute('aria-expanded','false');}));
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog')?.close()));
form?.addEventListener('submit',event=>{
 event.preventDefault();
 const state=$('#state').value;const list=$('#resultsList');list.replaceChildren();
 if(!sources[state]){$('#resultsStatus').textContent='Choose Ohio, Nevada, or Florida to continue.';dialog.showModal();return;}
 $('#resultsStatus').textContent='Official court websites for '+({NV:'Nevada',FL:'Florida',OH:'Ohio'}[state]);
 const notice=document.createElement('p');notice.className='status-note';
 notice.textContent='No case records have been searched or verified. Select the court that handled your case and enter identifying details only on its official website. Court portals have their own privacy policies.';list.append(notice);
 for(const source of sources[state]){
   const article=document.createElement('article');article.className='result';
   const h=document.createElement('h3');h.textContent=source.name;
   const scope=document.createElement('p');scope.textContent=source.scope;
   const details=document.createElement('p');details.textContent=source.access;
   const a=document.createElement('a');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open official court website ↗';
   article.append(h,scope,details,a);list.append(article);
 }
 const info=document.createElement('p');info.className='status-note';info.textContent='After checking the court disposition, use the free planner for suggested next steps. A matching name alone does not prove identity.';list.append(info);
 const plan=document.createElement('a');plan.href='start.html';plan.className='btn btn-red';plan.textContent='Find My Next Step →';list.append(plan);
 dialog.showModal();
});
})();