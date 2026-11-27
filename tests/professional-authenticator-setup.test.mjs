import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const js=read("js/professional-account.js");
test("setup key and authenticator verification code are separate",()=>{
 const html=read("professional-account.html");
 assert.match(html,/id="mfa-qr"/);
 assert.match(html,/complete setup key/);
 assert.match(html,/Six-digit verification code<input name="code"[^>]*maxlength="6"/);
 assert.match(js,/showMfaSetup\(data.totp\)/);
 assert.match(js,/mfa\.verify\(\{factorId,challengeId:challenge.id,code\}\)/);
});
test("QR renders locally, rejects external URL, and secret disappears on cleanup",()=>{
 const details={open:false};
 const els=Object.fromEntries(["mfa-qr","mfa-setup-details","secret","mfa-code-heading"].map(id=>[id,{hidden:true,textContent:"",removeAttribute(k){delete this[k]},hasAttribute(k){return Object.hasOwn(this,k)},querySelector(){return details},addEventListener(){}}]));
 const ctx=vm.createContext({$:id=>els[id]});
 const start=js.indexOf("function clearMfaSetup()"),end=js.indexOf("function clear(){");
 vm.runInContext(js.slice(start,end),ctx);
 const key="TESTONLYEXAMPLEKEY";
 ctx.showMfaSetup({secret:key,qr_code:'<svg xmlns="http://www.w3.org/2000/svg"></svg>'});
 assert.match(els["mfa-qr"].src,/^data:image\/svg\+xml,/);
 assert.equal(els["secret"].textContent,key);
 assert.equal(els["mfa-qr"].hidden,false);
 ctx.clearMfaSetup();
 assert.equal(els["secret"].textContent,"");
 assert.equal(els["mfa-qr"].hasAttribute("src"),false);
 assert.equal(els["mfa-setup-details"].hidden,true);
 ctx.showMfaSetup({secret:key,qr_code:"https://example.invalid/external"});
 assert.equal(els["mfa-qr"].hasAttribute("src"),false);
 assert.equal(details.open,true);
 assert.match(js,/function clear\(\)\{[^\n]*clearMfaSetup\(\)/);
});

test("first-time setup presents sequential steps and keeps the verification field out of setup",()=>{
 const html=read("professional-account.html");
 assert.match(html,/1\. Open or install an authenticator app/);
 assert.match(html,/2\. Add RecordPathAI to the app/);
 assert.match(html,/This long key belongs in the authenticator app only/);
 assert.match(html,/id="mfa-continue"[^>]*>I can see my six-digit code/);
 assert.match(js,/showMfaSetup\(data.totp\);\$\("mfa-start"\).hidden=true;\$\("verify-form"\).hidden=true/);
 assert.match(js,/\$\("mfa-continue"\).addEventListener\("click"[\s\S]*?\$\("verify-form"\).hidden=false/);
 assert.match(js,/\$\("mfa-back"\).addEventListener\("click"/);
 assert.match(js,/That code could not be verified/);
});
