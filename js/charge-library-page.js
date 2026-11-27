(function(){
 const state=document.getElementById("library-state"),input=document.getElementById("library-search"),list=document.getElementById("library-list"),count=document.getElementById("library-count"),library=window.RecordPathChargeLibrary;
 if(!library)return;
 const add=(parent,tag,value)=>{const el=document.createElement(tag);el.textContent=value;parent.append(el);return el};
 function render(){
  const q=input.value.trim(),rows=q?library.search(q,state.value,500):library.entries(state.value).sort((a,b)=>a.name.localeCompare(b.name));
  list.replaceChildren();count.textContent=rows.length+" reference matches"+(state.value!=="OH"?" · General offense names only":"");
  for(const row of rows){
   const card=add(list,"article","");card.className="charge-library-list-row";const copy=add(card,"div","");
   add(copy,"h3",row.name);add(copy,"p",row.category+(row.aliases?.length?" · Also search: "+row.aliases.join(", "):""));
   add(card,"p",row.code?row.state+" "+row.code:"General term");
   const source=add(card,"div","");
   if(row.code&&row.source){const a=add(source,"a","Official statute");a.href=row.source;a.target="_blank";a.rel="noopener noreferrer";add(source,"p",row.referenceEdition||"Reference");}
   else add(source,"p","No statute mapping");
  }
  if(!rows.length)add(list,"p","No matches. Use the exact charge on your court record.");
 }
 input.addEventListener("input",render);state.addEventListener("change",render);render();
})();