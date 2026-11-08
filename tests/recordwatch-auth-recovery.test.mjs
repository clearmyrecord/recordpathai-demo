import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext, Script } from "node:vm";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const login = read("login.html");
const signup = read("signup.html");
const clientScript = read("js/supabase-client.js");
const storeScript = read("js/user-store.js");
const server = read("server.js");
function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    key(index) { return [...data.keys()][index] ?? null; },
    get length() { return data.size; }
  };
}
function fakeLocation(path) {
  return {
    origin:"https://recordpathai.com",pathname:path,
    search:"?returnUrl=recordwatch-dashboard.html",hash:"",
    assigned:null,assign(url){this.assigned=url;},
    replace(url){this.assigned=url;}
  };
}
test("Login/signup handlers are registered before asynchronous Supabase initialization", () => {
  for (const [name, html, marker] of [
    ["login",login,'loginForm.addEventListener("submit"'],
    ["signup",signup,'form.addEventListener("submit"']
  ]) {
    assert.doesNotMatch(html, /onsubmit="return false;"/, name);
    const start = html.lastIndexOf('document.addEventListener("DOMContentLoaded"');
    assert.ok(start >= 0);
    const code = html.slice(start);
    assert.ok(code.indexOf(marker) >= 0 && code.indexOf(marker) < code.indexOf("Promise.resolve(store.readyForAuth)"), name);
    assert.match(code, /loginWithGoogle\(returnUrl\)/, name);
    assert.match(code, /feedback\(error\?\.message/);
    for (const [, raw] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (raw.trim()) assert.doesNotThrow(() => new Script(raw), name + " inline JS compiles");
    }
  }
});
test("Public Supabase config supports PUBLIC env naming used by backend", () => {
  const start=server.indexOf("function publicSupabaseConfig()");
  assert.ok(start>=0);
  const block=server.slice(start,start+500);
  assert.match(block,/PUBLIC_SUPABASE_URL/);
  assert.match(block,/PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(server,/app\.get\("\/api\/auth\/health"/);
  assert.match(server,/provider_must_be_verified_in_supabase/);
  assert.doesNotMatch(server,/service_role.*auth\/health/);
});
test("Missing initial auth configuration is retried rather than cached forever", async () => {
  let reads=0;
  const context={
    console:{warn(){}},
    setTimeout,clearTimeout,
    URL,URLSearchParams,
    fetch:async () => {
      reads++;
      return {ok:true,json:async()=>reads===1
        ?{configured:false,url:"",anonKey:""}
        :{configured:true,url:"https://sample.supabase.co",anonKey:"public-anon-test-key"}};
    },
    window:{location:fakeLocation("/login.html"),supabase:null},
    document:{querySelector(){return null;},head:{appendChild(){}}}
  };
  runInNewContext(clientScript,context);
  await context.window.RecordPathSupabase.ready;
  const config=await context.window.RecordPathSupabase.getConfig();
  assert.equal(config.url,"https://sample.supabase.co");
  assert.equal(config.anonKey,"public-anon-test-key");
  assert.ok(reads>=2);
});
test("Email confirmation and Google use a single RecordWatch-safe callback", async () => {
  let oauthRequest=null, signupRequest=null;
  const redirect="https://example.supabase.co/auth/v1/authorize?provider=google";
  const mockSupabase={
    auth:{
      getSession:async()=>({data:{session:null}}),
      signUp:async(args)=>{signupRequest=args;return {data:{user:{id:"test-user"},session:null},error:null};},
      signInWithOAuth:async(args)=>{oauthRequest=args;return {data:{url:redirect},error:null};}
    }
  };
  const window={
    location:fakeLocation("/signup.html"),
    RecordPathSupabase:{getClient:async()=>mockSupabase}
  };
  const context={
    window,localStorage:memoryStorage(),sessionStorage:memoryStorage(),
    document:{dispatchEvent(){}},CustomEvent:class {constructor(name,options){this.type=name;this.detail=options?.detail;}},
    console:{warn(){}},Date,URL,URLSearchParams,setTimeout,clearTimeout
  };
  runInNewContext(storeScript,context);
  const store=window.RecordPathUserStore;
  await store.ready;
  const signUpResult=await store.signup({fullName:"Sample Applicant",email:"someone@example.invalid",phone:"",password:"longpassword"});
  assert.equal(signUpResult.needsEmailConfirmation,true);
  assert.equal(signupRequest.options.emailRedirectTo,"https://recordpathai.com/login.html");
  await store.loginWithGoogle("recordwatch-dashboard.html");
  assert.equal(oauthRequest.provider,"google");
  assert.equal(oauthRequest.options.skipBrowserRedirect,true);
  assert.equal(oauthRequest.options.redirectTo,"https://recordpathai.com/login.html");
  assert.equal(context.localStorage.getItem("recordPathAuthReturnUrl"),"recordwatch-dashboard.html");
  assert.equal(window.location.assigned,redirect);
});
test("Dashboard still protects private cases and does not bypass login",()=>{
  const dashboard=read("recordwatch-dashboard.html");
  assert.match(dashboard,/requireProtectedPageAsync\("open RecordWatch"\)/);
  assert.match(clientScript,/persistSession: true/);
  assert.match(clientScript,/autoRefreshToken: true/);
});

test("RecordWatch enrollment requires an authenticated account and preserves pending preferences",()=>{
  const enrollment=read("recordwatch.html");
  assert.match(enrollment,/id="recordwatchEnrollmentForm"/);
  assert.match(enrollment,/signup\.html\?returnUrl=recordwatch\.html/);
  assert.match(enrollment,/login\.html\?returnUrl=recordwatch\.html/);
  assert.match(enrollment,/RecordPathAuth\.requireAuthAsync\("activate RecordWatch reminders", "recordwatch\.html"\)/);
  const savePending=enrollment.indexOf('localStorage.setItem("recordpathai_pending_recordwatch_enrollment"');
  const authGuard=enrollment.indexOf('RecordPathAuth.requireAuthAsync("activate RecordWatch reminders"');
  const register=enrollment.indexOf('RecordWatchNotifications.registerSubscription({');
  assert.ok(savePending>=0 && authGuard>savePending && register>authGuard);
});

test("Late OAuth and recovery events synchronize the shared user session", async () => {
  let onAuthChange;
  const events = [];
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange(handler) {
        onAuthChange = handler;
        return { data: { subscription: { unsubscribe() {} } } };
      }
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: null, error: null })
              };
            }
          };
        }
      };
    }
  };
  const window = {
    location: fakeLocation("/login.html"),
    RecordPathSupabase: { getClient: async () => supabase }
  };
  const context = {
    window, localStorage: memoryStorage(), sessionStorage: memoryStorage(),
    document: { dispatchEvent(event) { events.push(event); } },
    CustomEvent: class { constructor(name, options) { this.type = name; this.detail = options?.detail; } },
    console: { warn() {} }, Date, URL, URLSearchParams, setTimeout, clearTimeout
  };
  runInNewContext(storeScript, context);
  const store = window.RecordPathUserStore;
  await store.ready;
  assert.equal(typeof onAuthChange, "function");
  assert.equal(store.isLoggedIn(), false);
  const user = { id: "oauth-user", email: "person@example.invalid", user_metadata: {} };
  const session = { user, access_token: "mock-token" };
  onAuthChange("SIGNED_IN", session);
  assert.equal(store.isLoggedIn(), true);
  assert.equal(store.getCurrentSession(), session);
  assert.equal(store.getCurrentUser().email, user.email);
  onAuthChange("PASSWORD_RECOVERY", session);
  assert.equal(store.passwordRecoveryActive, true);
  onAuthChange("SIGNED_OUT", null);
  assert.equal(store.passwordRecoveryActive, false);
  assert.equal(store.getCurrentUser(), null);
  assert.equal(store.getCurrentSession(), null);
  assert.ok(events.some(event => event.type === "recordpath:auth-change" && event.detail.event === "SIGNED_IN"));
  assert.ok(events.some(event => event.type === "recordpath:auth-change" && event.detail.event === "PASSWORD_RECOVERY"));
});

test("Login reacts to recovery callbacks and live account-state events", () => {
  assert.match(login, /recordpath:auth-change/);
  assert.match(login, /detail\\.event === "PASSWORD_RECOVERY"/);
  assert.match(login, /showPasswordRecovery\\(\\)/);
  assert.match(login, /store\\.passwordRecoveryActive/);
});
