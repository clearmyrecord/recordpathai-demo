"use strict";
// Publish a minimal, portable public front door for RecordPathAI.
// This is not a full private application backend or a worldwide records index.
const fs=require("node:fs"),path=require("node:path");
const root=process.cwd(),out=path.join(root,"global-public-build");
const files=[
  "index.html",
  "self-search.html",
  "assets/styles.css",
  "js/recordpath-home.js",
  "resources/entrepreneurship.html",
  "resources/resources.js"
];
for(const file of files){
  if(!fs.existsSync(path.join(root,file)))throw new Error("Missing public asset: "+file);
  const destination=path.join(out,file);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  let content=fs.readFileSync(path.join(root,file),"utf8");
  if(file==="index.html"){
    // Public preview intentionally hands all personalized/legal/payment flows to the established app.
    content=content.replaceAll('href="eligibility.html"','href="https://recordpathai.com/eligibility.html"');
    content=content.replaceAll('href="mugshot-removal.html"','href="https://recordpathai.com/mugshot-removal.html"');
    content=content.replaceAll('href="privacy.html"','href="https://recordpathai.com/privacy.html"');
    content=content.replace("</head>",'<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"></head>');
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
  fs.writeFileSync(destination,content);
}
fs.writeFileSync(path.join(out,"robots.txt"),"User-agent: *\nDisallow: /\n");
console.log("Built internationally accessible public front door; no secrets or court case data.");
