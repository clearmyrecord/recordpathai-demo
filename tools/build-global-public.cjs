"use strict";
// Publish a minimal, portable public front door for RecordPathAI.
// This is not a full private application backend or a worldwide records index.
const fs=require("node:fs"),path=require("node:path");
const root=process.cwd(),out=path.join(root,"global-public-build");
const files=[
  "index.html",
  "start.html",
  "pilot-demo.html",
  "launch.html",
  "self-search.html",
  "assets/styles.css",
  "css/styles.css",
  "assets/home-modern.css",
  "assets/legacy-header.css",
  "assets/images/logo/RecordPathAI_Logo_Transparent.png",
  "js/legacy-header.js",
  "js/recordpath-home.js",
  "js/pilot-demo.js",
  "resources/entrepreneurship.html",
  "resources/resources.js",
  // Public-only, local-browser document mapping tool and blank official court form.
  // No court record exports, private PDFs, API credentials or user uploads.
  "pdf-mapper-v6.html",
  "pdf-mapper-v7.html",
  "js/pdf-auto-map.js",
  "js/form-pipeline-core.js",
  // Pure client-side, 15-minute session-only importer; no real records embedded.
  "js/wood-county-record-prefill.js",
  "assets/forms/ohio/wood/court-of-common-pleas/application-for-sealing-2953-33-dismissal.pdf",
  "assets/forms/ga/statewide/arrest-agency/restrict-arrest-record-prior-2013.pdf"
];
for(const file of files){
  if(!fs.existsSync(path.join(root,file)))throw new Error("Missing public asset: "+file);
  const destination=path.join(out,file);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  // Keep the official blank PDF byte-for-byte intact (never UTF-8 decode it).
  if(file.toLowerCase().endsWith(".pdf")){
    fs.copyFileSync(path.join(root,file),destination);
    continue;
  }
  let content=fs.readFileSync(path.join(root,file),"utf8");
  if(file==="pdf-mapper-v6.html"||file==="pdf-mapper-v7.html"){
    content=content.replace("</head>",'<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"></head>');
  }
  if(file==="index.html"){
    // Public preview intentionally hands all personalized/legal/payment flows to the established app.
    content=content.replaceAll('href="eligibility.html"','href="https://recordpathai.com/eligibility.html"');
    content=content.replaceAll('href="mugshot-removal.html"','href="https://recordpathai.com/mugshot-removal.html"');
    content=content.replaceAll('href="privacy.html"','href="https://recordpathai.com/privacy.html"');
    // These pages are on the canonical app but not bundled into the public mirror.
    // The fictional pilot demo is included in this public-only mirror.
    content=content.replaceAll('href="terms.html"','href="https://recordpathai.com/terms.html"');
    content=content.replaceAll('href="how-it-works.html"','href="https://recordpathai.com/how-it-works.html"');
    content=content.replace("</head>",'<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"></head>');
  }
  if(file==="start.html"){
    // This browser-only planner is safe to mirror; the full legal and filing flows remain on the canonical service.
    for(const page of ["eligibility.html","mugshot-removal.html","privacy.html","terms.html"]){
      content=content.replaceAll('href="'+page+'"','href="https://recordpathai.com/'+page+'"');
      content=content.replaceAll("'"+page+"'","'https://recordpathai.com/"+page+"'");
    }
    content=content.replace("</head>",'<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"></head>');
  }
  if(file==="pilot-demo.html"){
    // Fictional records only. No private court exports or backend code are bundled.
    content=content.replaceAll('href="eligibility.html"','href="https://recordpathai.com/eligibility.html"');
    content=content.replace("</head>",'<meta name="referrer" content="no-referrer"></head>');
  }
  if(file==="launch.html"){
    // Duplicate global fallback is a convenience mirror, not a separately indexable canonical page.
    content=content.replace('name="robots" content="index,follow"','name="robots" content="noindex,nofollow,noarchive"');
    content=content.replaceAll('href="eligibility.html"','href="https://recordpathai.com/eligibility.html"');
    content=content.replaceAll('href="mugshot-removal.html"','href="https://recordpathai.com/mugshot-removal.html"');
    content=content.replaceAll('href="privacy.html"','href="https://recordpathai.com/privacy.html"');
  }
  if(file==="self-search.html"){
    content=content.replaceAll('href="eligibility.html"','href="https://recordpathai.com/eligibility.html"');
    content=content.replaceAll('href="mugshot-removal.html"','href="https://recordpathai.com/mugshot-removal.html"');
    content=content.replaceAll('href="privacy.html"','href="https://recordpathai.com/privacy.html"');
    content=content.replace("</head>",'<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"></head>');
  }
  if(file==="resources/entrepreneurship.html"){
    content=content.replaceAll('href="../eligibility.html"','href="https://recordpathai.com/eligibility.html"');
    content=content.replaceAll('href="../privacy.html"','href="https://recordpathai.com/privacy.html"');
    content=content.replace("</head>",'<meta name="robots" content="noindex,nofollow,noarchive"></head>');
  }
  if(file==="js/recordpath-home.js"){
    content=content.replaceAll("'eligibility.html'","'https://recordpathai.com/eligibility.html'");
  }
  if(file.endsWith(".html")){
    // The public fallback is read-only: never load the canonical app's
    // authentication or account scripts under a different origin.
    content=content.replace(/<script\s+src="(?:\.\.\/)*js\/(?:supabase-client|user-store|i18n|auth)\.js"><\/script>\s*/g,"");
    // Only approved documents are in this mirror. Other pages should
    // open on the canonical website, never lead to a fallback-site 404.
    content=content.replace(/href="((?:\.\.\/)*[^"#:?]+\.html(?:#[^"]*)?)"/g,(original,relative)=>{
      const [target,fragment]=relative.split("#");
      const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),target));
      if(resolved.startsWith("../")||resolved.startsWith("/")||files.includes(resolved))return original;
      return 'href="https://recordpathai.com/'+resolved+(fragment?"#"+fragment:"")+'"';
    });
  }
  fs.writeFileSync(destination,content);
}
fs.writeFileSync(path.join(out,"robots.txt"),"User-agent: *\nDisallow: /\n");
console.log("Built internationally accessible public front door; no secrets or court case data.");
