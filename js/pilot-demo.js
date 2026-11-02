(()=>{'use strict';
/* Entirely fictional demo fixtures. Never import actual case files into a public JS bundle. */
const demoRecords=Object.freeze([
 {caseNumber:'DEMO-2006-001',name:'Alex Example',aliases:['A. Example'],filed:'2006-04-18',
  status:'Closed',termination:'2010-06-07',charges:[
   {statute:'DEMO-STATUTE-1',description:'Illustrative offense A',disposition:'Dismissed',date:'2010-06-07'}]},
 {caseNumber:'DEMO-2008-002',name:'Taylor Sample',aliases:[],filed:'2008-09-12',
  status:'Closed',termination:'2012-03-14',charges:[
   {statute:'DEMO-STATUTE-2',description:'Illustrative offense B',disposition:'Not guilty',date:'2012-03-14'},
   {statute:'DEMO-STATUTE-3',description:'Illustrative offense C',disposition:'Dismissed',date:'2012-03-14'}]},
 {caseNumber:'DEMO-2010-003',name:'Jordan Fiction',aliases:[],filed:'2010-10-08',
  status:'Suppressed after simulated full refresh',suppressed:true,charges:[]}
]);
const $=s=>document.querySelector(s);
const form=$('#pilotSearch'),q=$('#q'),mode=$('#mode'),results=$('#results'),status=$('#status');
function matches(record,term,which){
 if(record.suppressed)return false;
 if(which==='case')return record.caseNumber.toLowerCase()===term;
 return [record.name,...record.aliases].some(s=>s.toLowerCase().includes(term));
}
function renderCase(record){
 const card=document.createElement('article');card.className='record';
 const h=document.createElement('h3');h.textContent=record.name+' — fictional';card.append(h);
 const dl=document.createElement('dl');
 const data=[['Case',record.caseNumber],['Filed',record.filed],['Status',record.status],
  ['Termination date',record.termination||'Not provided']];
 for(const [key,value] of data){
  const dt=document.createElement('dt'),dd=document.createElement('dd');
  dt.textContent=key;dd.textContent=value;dl.append(dt,dd);
 }card.append(dl);
 for(const ch of record.charges){
  const section=document.createElement('div');section.className='charge';
  const heading=document.createElement('strong');heading.textContent=ch.description;
  const statute=document.createElement('p');statute.textContent='Illustrative statute: '+ch.statute;
  const disposition=document.createElement('p');disposition.textContent='Disposition: '+ch.disposition+' · '+ch.date;
  section.append(heading,statute,disposition);card.append(section);
 }
 const notice=document.createElement('p');notice.className='muted';
 notice.textContent='Synthetic example only. Not an actual court record or eligibility determination.';
 card.append(notice);return card;
}
function doSearch(){
 const term=q.value.trim().toLowerCase();
 results.replaceChildren();
 if(term.length<2){status.textContent='Enter at least 2 characters.';return;}
 const found=demoRecords.filter(r=>matches(r,term,mode.value));
 status.textContent=found.length
  ?found.length+' fictional matching case'+(found.length===1?'':'s')+'. No live court data was searched.'
  :'No matching fictional demo cases. This says nothing about real court records.';
 found.forEach(r=>results.append(renderCase(r)));
}
form?.addEventListener('submit',event=>{event.preventDefault();doSearch();});
document.querySelectorAll('button[data-query]').forEach(button=>{
 button.addEventListener('click',()=>{
  mode.value=button.dataset.mode;q.value=button.dataset.query;doSearch();
 });
});
const visible=demoRecords.filter(r=>!r.suppressed).length;
$('#refreshSummary').textContent='Demo: '+demoRecords.length+' synthetic case records received · 1 simulated suppression · '+visible+' searchable fictional records.';
})();