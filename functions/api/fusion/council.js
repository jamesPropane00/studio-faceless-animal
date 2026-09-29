const EXPECTED_TOKEN_SHA256="79105ed8c34ac0344d881a1502e404f737abd02689ed3d942c1493ab425b04da";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const hex=(bytes)=>[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,"0")).join("");
async function authorized(request){
  const token=request.headers.get("x-fusion-worker-token")||"";
  if(token.length<40||token.length>256)return false;
  const digest=hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)));
  let diff=0;for(let i=0;i<EXPECTED_TOKEN_SHA256.length;i++)diff|=digest.charCodeAt(i)^EXPECTED_TOKEN_SHA256.charCodeAt(i);
  return diff===0;
}
export async function onRequest({request,env}){
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"content-type,x-fusion-worker-token"}});
  if(request.method!=="POST")return json({error:"method_not_allowed"},405);
  if(!await authorized(request))return json({error:"unauthorized"},401);
  const token=env.CF_AI_TOKEN||"",account=env.CF_ACCOUNT_ID||"";
  if(!token||!account)return json({error:"cloudflare_workers_ai_unconfigured",provider:"cloudflare_workers_ai"},503);
  let input;try{input=await request.json()}catch{return json({error:"invalid_json"},400)}
  const system=String(input?.system||"").slice(0,12000),prompt=String(input?.prompt||"").slice(0,16000);
  const model=String(input?.model||"@cf/meta/llama-3.2-3b-instruct").slice(0,160);
  if(!system||!prompt||!model.startsWith("@cf/"))return json({error:"invalid_inference_request"},400);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{
    const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account)+"/ai/run/"+encodeURIComponent(model),{
      method:"POST",signal:controller.signal,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify({messages:[{role:"system",content:system},{role:"user",content:prompt}],temperature:0.7,max_tokens:1800})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.success===false)return json({error:String(data?.errors?.[0]?.message||"cloudflare_inference_failed").slice(0,400),provider:"cloudflare_workers_ai",model,http_status:response.status},502);
    const content=String(data?.result?.response||"").trim();
    if(!content)return json({error:"empty_cloudflare_model_output",provider:"cloudflare_workers_ai",model},502);
    return json({provider:"cloudflare_workers_ai",model,response:content});
  }catch(error){return json({error:error?.name==="AbortError"?"cloudflare_timeout":"cloudflare_transport_failed",provider:"cloudflare_workers_ai",model},502)}
  finally{clearTimeout(timer)}
}
