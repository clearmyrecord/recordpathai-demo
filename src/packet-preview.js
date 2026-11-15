// Exact approved PDF -> WATERMARKED PNG image only.
// This module never returns the original PDF or a downloadable PDF preview.
import { createCanvas, GlobalFonts, Path2D, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { fileURLToPath } from "node:url";

const STANDARD_FONT_DIR=fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/",import.meta.url));
const LIBERATION_FONT=fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf",import.meta.url));
let previewFontsReady=false;
function ensurePreviewFonts(){
  // Node's PDF.js requires both standard-font data and Path2D for glyph
  // outlines. Without either it silently drops pdf-lib's Helvetica overlays.
  // The same missing fonts also previously erased the watermark/footer text.
  if(previewFontsReady)return;
  if(typeof globalThis.Path2D==="undefined")globalThis.Path2D=Path2D;
  if(typeof globalThis.DOMMatrix==="undefined")globalThis.DOMMatrix=DOMMatrix;
  if(!GlobalFonts.registerFromPath(LIBERATION_FONT,"sans-serif"))
    throw new Error("The preview font could not be loaded. Do not return an incomplete document image.");
  previewFontsReady=true;
}

export const MAX_PREVIEW_PAGES=6;
export const PREVIEW_WATERMARK="PREVIEW ONLY - NOT FOR FILING";
export const PREVIEW_CONFIRM_MAX_AGE_MS=30*24*60*60*1000;

export function confirmedPreviewMatches(row,source,now=new Date()){
  const time=Date.parse(row?.confirmed_at||"");
  return Boolean(row && source && row.user_id===source.userId &&
    row.case_id===source.caseId &&
    row.signed_pdf_sha256===source.signedPdfSha &&
    row.case_snapshot_sha256===source.caseSnapshotSha &&
    Number.isFinite(time) && time<=now.getTime() &&
    now.getTime()-time<=PREVIEW_CONFIRM_MAX_AGE_MS);
}

export async function renderWatermarkedPreviewPage(bytes,pageNumber,expectedPages){
  if(!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array))
    throw new Error("Invalid private court document.");
  const n=Number(pageNumber);
  if(!Number.isInteger(n)||n<1||n>MAX_PREVIEW_PAGES)
    throw new Error("Invalid preview page.");
  ensurePreviewFonts();
  const loading=getDocument({
    data:new Uint8Array(bytes),
    useSystemFonts:true,
    standardFontDataUrl:STANDARD_FONT_DIR
  });
  const pdf=await loading.promise;
  try{
    if(pdf.numPages<1||pdf.numPages>MAX_PREVIEW_PAGES ||
       !Number.isInteger(expectedPages) || pdf.numPages!==expectedPages ||
       n>pdf.numPages)throw new Error("Reviewed packet page count changed.");
    const page=await pdf.getPage(n);
    const viewport=page.getViewport({scale:1.35});
    const width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
    if(width<50||height<50||width>2400||height>3300)
      throw new Error("Private packet page dimensions are unsupported.");
    const canvas=createCanvas(width,height);
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,width,height);
    await page.render({canvasContext:ctx,viewport,background:"rgb(255,255,255)"}).promise;
    // Baked into the actual PNG pixels, not a removable HTML/CSS overlay.
    ctx.save();
    ctx.translate(width/2,height/2);
    ctx.rotate(-Math.PI/5.5);
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillStyle="rgba(162, 28, 48, 0.27)";
    const fontSize=Math.max(24,Math.min(52,Math.floor(width/13)));
    ctx.font="bold "+fontSize+"px sans-serif";
    for(let y=-height;y<=height;y+=180){
      ctx.fillText(PREVIEW_WATERMARK,0,y);
    }
    ctx.restore();
    ctx.save();
    ctx.fillStyle="rgba(158, 24, 40, 0.88)";
    ctx.fillRect(0,height-42,width,42);
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.font="bold 16px sans-serif";
    ctx.fillStyle="#ffffff";
    ctx.fillText("PRIVATE PREVIEW ONLY - UNWATERMARKED PDF AFTER VERIFIED PAYMENT",width/2,height-21,Math.max(50,width-20));
    ctx.restore();
    return canvas.toBuffer("image/png");
  }finally{await pdf.destroy();}
}
