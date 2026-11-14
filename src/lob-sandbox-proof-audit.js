// Operator-only validation of Lob TEST mode PDF proof. No bank debit,
// mail, court filing or payment is triggered by these pure checks.
import {isWoodConvictionFormPair,isOfficialWoodConvictionFormPair} from "./wood-form-pages.js";

const CHECK_ID=/^chk_[A-Za-z0-9]+$/;
export function trustedLobProofUrl(rawUrl,checkId) {
  if(!CHECK_ID.test(String(checkId||"")))return false;
  try {
    const u=new URL(String(rawUrl||""));
    return u.protocol==="https:" && u.hostname==="lob-assets.com" &&
      !u.port && !u.username && !u.password && !u.hash &&
      u.pathname==="/checks/"+checkId+".pdf";
  }catch{return false;}
}

export function assessLobSandboxProof({checkId,check,proofPageTexts}={}) {
  const status=String(check?.status||"");
  const pages=Array.isArray(proofPageTexts)?proofPageTexts:[];
  const exactFourPageProof=pages.length===4;
  const formPages=exactFourPageProof?pages.slice(2,4):[];
  const twoFormPagesConfirmed=exactFourPageProof &&
    isWoodConvictionFormPair(formPages);
  const officialFormStructureConfirmed=twoFormPagesConfirmed &&
    isOfficialWoodConvictionFormPair(formPages);
  const checkAmountVerified=Number.isFinite(Number(check?.amount)) &&
    Number(check.amount)===100;
  const trustworthyUrl=trustedLobProofUrl(check?.url,checkId);
  const proofContentsVerified=check?.id===checkId && status==="rendered" &&
    checkAmountVerified && trustworthyUrl && twoFormPagesConfirmed;
  return {
    proofContentsVerified,
    proofPages:pages.length,
    checkAmountVerified,
    exactFourPageProof,
    twoFormPagesConfirmed,
    officialFormStructureConfirmed
  };
}
