"use strict";
// Publish ONLY the guided official-court search page and its public stylesheet.
// Do not publish the whole repository: it also contains application server and internal files.
const fs=require("node:fs"),path=require("node:path");
const destination=path.resolve("search-preview-build");
fs.mkdirSync(path.join(destination,"assets"),{recursive:true});
let html=fs.readFileSync("self-search.html","utf8");
if(!html.includes('id="find"')||!html.includes("recordpathai-private-search-backend.onrender.com")){
  throw Error("Guided search controller is missing; refusing to publish preview");
}
html=html.replace("</head>",'<meta name="robots" content="noindex,nofollow,noarchive">\n</head>');
for(const file of ["index.html","eligibility.html","mugshot-removal.html"]){
  html=html.replaceAll('href="'+file+'"','href="https://recordpathai.com/'+file+'"');
}
html=html.replace('<title>Search My Court Records | RecordPathAI</title>',
 '<title>RecordPathAI Court Search Preview | Official Portals</title>');
html=html.replace('No login or payment is required.',
 'No login or payment is required. This preview is separate from the main RecordPathAI website.');
fs.writeFileSync(path.join(destination,"index.html"),html);
fs.copyFileSync("assets/styles.css",path.join(destination,"assets","styles.css"));
fs.writeFileSync(path.join(destination,"robots.txt"),"User-agent: *\nDisallow: /\n");
console.log("Safe court search preview assembled: HTML, public stylesheet and robots.txt only.");
