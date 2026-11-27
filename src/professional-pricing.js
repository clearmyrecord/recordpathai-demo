// Professional price policy. No consumer checkout or dispatch authorization.
export const PROFESSIONAL_PRICING=Object.freeze({soloMonthlyCents:9900,firmMonthlyCents:24900,preparationCents:0,automatedFilingCents:1000,pilotDays:90,recordwatchIncluded:true,sandboxFilingPriceId:"price_1UgDfXE2dI5377iPPSBITp6T"});
export function quoteProfessionalFiling({courtId,outcome,access,delivery="automated",postageCents}={}){
 if(courtId!=="oh-wood-common-pleas"||!["conviction","dismissal","not_guilty"].includes(outcome))return {ok:false,reason:"Court or outcome requires review",checkoutEnabled:false};
 if(!["active_subscription","approved_pilot"].includes(access))return {ok:false,reason:"Verified active subscription or approved pilot required",checkoutEnabled:false};
 if(!["automated","self_file"].includes(delivery))return {ok:false,reason:"Unsupported delivery",checkoutEnabled:false};
 const courtFeeCents=outcome==="conviction"?10000:0;
 const serviceFeeCents=access==="active_subscription"&&delivery==="automated"?PROFESSIONAL_PRICING.automatedFilingCents:0;
 const postagePending=access==="approved_pilot"&&delivery==="automated"&&!(Number.isSafeInteger(postageCents)&&postageCents>=0);
 const postage=access==="approved_pilot"&&delivery==="automated"?(postagePending?null:postageCents):0;
 return {ok:true,preparationFeeCents:0,serviceFeeCents,courtFeeCents,postageCents:postage,postagePending,totalCents:postagePending?null:serviceFeeCents+courtFeeCents+postage,recordwatchIncluded:true,delivery,checkoutEnabled:false,productionEntitlement:false};
}
