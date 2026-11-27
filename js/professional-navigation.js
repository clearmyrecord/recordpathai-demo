// Same responsive header behavior, scoped to professional pages; no consumer auth or intake state.
(()=>{const shell=document.querySelector(".rp-professional .header-shell-modern"),button=shell?.querySelector(".menu-toggle"),nav=shell?.querySelector(".nav");if(!button||!nav)return;
const set=open=>{shell.classList.toggle("nav-open",open);button.setAttribute("aria-expanded",String(open));};
button.addEventListener("click",()=>set(button.getAttribute("aria-expanded")!=="true"));
nav.addEventListener("click",e=>{if(e.target.closest("a"))set(false);});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&button.getAttribute("aria-expanded")==="true"){set(false);button.focus();}});
document.addEventListener("click",e=>{if(!shell.contains(e.target))set(false);});
window.matchMedia("(min-width:993px)").addEventListener("change",()=>set(false));
})();