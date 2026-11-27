// Exact approved PDF -> WATERMARKED PNG image only.
// Raw signed originals remain in private storage; this module never exposes a PDF.
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MAX_PREVIEW_PAGES=6;
export const PREVIEW_WATERMARK="PREVIEW ONLY - NOT FOR FILING";
export const PREVIEW_CONFIRM_MAX_AGE_MS=30*24*60*60*1000;
const LIBERATION_FONT=fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf",import.meta.url));
const FONT_FAMILY="RecordPathPreviewSans";
const MAX_PNG_BYTES=10000000;
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
let fontReady=false;

function ensureWatermarkFont(){
  if(fontReady)return;
  if(!GlobalFonts.registerFromPath(LIBERATION_FONT,FONT_FAMILY))
    throw new Error("The preview font could not be loaded. No document image can be released.");
  fontReady=true;
}

// PDF.js's Node canvas path silently omitted PDF-lib's standard-14 Helvetica
// overlay fields (including case numbers and charges) while leaving the
// original form visible. Use Poppler's independent PDF rasterizer instead.
// No shell, filesystem copy, external URL, or unwatermarked response is used.
function rasterizePrivatePage(bytes,page){
  return new Promise((resolve,reject)=>{
    const args=["-f",String(page),"-l",String(page),
      "-singlefile","-scale-to","1200","-png","-"];
    const child=spawn("pdftoppm",args,{stdio:["pipe","pipe","pipe"]});
    const chunks=[];
    let length=0,settled=false;
    const timer=setTimeout(()=>{
      child.kill("SIGKILL");
      finish(new Error("Private PDF image conversion timed out."));
    },12000);
    function finish(err,result){
      if(settled)return;
      settled=true;clearTimeout(timer);
      if(err)reject(err);else resolve(result);
    }
    child.on("error",err=>finish(err));
    child.stdout.on("data",part=>{
      length+=part.length;
      if(length>MAX_PNG_BYTES){
        child.kill("SIGKILL");
        return finish(new Error("Private preview exceeds its image size limit."));
      }
      chunks.push(part);
    });
    // Do not log child stderr; OCR/PDF parsing errors may contain source text.
    child.stderr.resume();
    child.on("close",code=>{
      if(settled)return;
      const image=Buffer.concat(chunks);
      if(code!==0||image.length<500||
         !image.subarray(0,8).equals(PNG_SIGNATURE))
        return finish(new Error("Private PDF page could not be safely rendered."));
      finish(null,image);
    });
    child.stdin.on("error",()=>{});
    child.stdin.end(Buffer.from(bytes));
  });
}

export function confirmedPreviewMatches(row,source,now=new Date()){
  const time=Date.parse(row?.confirmed_at||"");
  return Boolean(row && source && row.user_id===source.userId &&
    row.case_id===source.caseId &&
    row.signed_pdf_sha256===source.signedPdfSha &&
    row.case_snapshot_sha256===source.caseSnapshotSha &&
    Number.isFinite(time) && time<=now.getTime() &&
    now.getTime()-time<=PREVIEW_CONFIRM_MAX_AGE_MS);
}

function verifyVisibleWatermark(ctx,width,height,before){
  const after=ctx.getImageData(0,0,width,height-42).data;
  let changed=0;
  // Baked diagonal watermark glyph pixels must be present (not just a solid
  // footer). Sample every other pixel for a bounded verification pass.
  for(let i=0;i<before.length;i+=8){
    if(Math.abs(after[i]-before[i])>15||
       Math.abs(after[i+1]-before[i+1])>15||
       Math.abs(after[i+2]-before[i+2])>15) changed++;
  }
  let white=0;
  const footer=ctx.getImageData(0,height-42,width,42).data;
  for(let i=0;i<footer.length;i+=4){
    if(footer[i]>215&&footer[i+1]>215&&footer[i+2]>215)white++;
  }
  if(changed<60||white<60)
    throw new Error("Private preview watermark text is not visible; image withheld.");
}

export async function renderWatermarkedPreviewPage(bytes,pageNumber,expectedPages,{professional=false}={}){
  if(!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array))
    throw new Error("Invalid private court document.");
  const n=Number(pageNumber);
  if(!Number.isInteger(n)||n<1||n>MAX_PREVIEW_PAGES)
    throw new Error("Invalid preview page.");
  ensureWatermarkFont();
  const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
  try{
    if(pdf.numPages<1||pdf.numPages>MAX_PREVIEW_PAGES ||
       !Number.isInteger(expectedPages)||pdf.numPages!==expectedPages||
       n>pdf.numPages)throw new Error("Reviewed packet page count changed.");
  }finally{await pdf.destroy();}

  const rawPng=await rasterizePrivatePage(bytes,n);
  const image=await loadImage(rawPng);
  const width=image.width,height=image.height;
  if(width<50||height<50||width>2400||height>3300)
    throw new Error("Private packet page dimensions are unsupported.");
  const canvas=createCanvas(width,height),ctx=canvas.getContext("2d");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,width,height);
  ctx.drawImage(image,0,0,width,height);
  const before=ctx.getImageData(0,0,width,height-42).data;

  ctx.save();
  ctx.translate(width/2,height/2);
  ctx.rotate(-Math.PI/5.5);
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillStyle="rgba(162,28,48,0.27)";
  const fontSize=Math.max(24,Math.min(52,Math.floor(width/13)));
  ctx.font="bold "+fontSize+"px "+FONT_FAMILY;
  for(let y=-height;y<=height;y+=180)ctx.fillText(PREVIEW_WATERMARK,0,y);
  ctx.restore();
  ctx.save();
  ctx.fillStyle="rgba(158,24,40,0.88)";
  ctx.fillRect(0,height-42,width,42);
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font="bold 16px "+FONT_FAMILY;
  ctx.fillStyle="#ffffff";
  ctx.fillText(professional?"PRIVATE PREVIEW ONLY - REVIEW BEFORE FILING":"PRIVATE PREVIEW ONLY - UNWATERMARKED PDF AFTER VERIFIED PAYMENT",
    width/2,height-21,Math.max(50,width-20));
  ctx.restore();
  verifyVisibleWatermark(ctx,width,height,before);
  const output=canvas.toBuffer("image/png");
  if(output.length>MAX_PNG_BYTES)
    throw new Error("Watermarked preview exceeds its image size limit.");
  return output;
}
