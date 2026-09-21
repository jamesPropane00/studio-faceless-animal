"use strict";
const http=require("http");
const crypto=require("crypto");
const {chromium}=require("playwright");
const PORT=Number(process.env.PORT||8788);
const API_KEY=process.env.FACELESS_OPERATOR_API_KEY||"";
const sessions=new Map();
const json=(res,status,body)=>{res.writeHead(status,{"content-type":"application/json","access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,DELETE,OPTIONS"});res.end(JSON.stringify(body))};
const body=req=>new Promise((resolve,reject)=>{let s="";req.on("data",c=>{s+=c;if(s.length>1e6)reject(new Error("body too large"))});req.on("end",()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}})});
const auth=req=>API_KEY&&req.headers.authorization===`Bearer ${API_KEY}`;
const safeUrl=value=>{const u=new URL(String(value));if(!["http:","https:"].includes(u.protocol))throw new Error("Only http/https URLs are allowed");if(["localhost","127.0.0.1","::1"].includes(u.hostname)||u.hostname.endsWith(".local"))throw new Error("Private/local targets are blocked");return u.toString()};
async function makeSession(){const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1365,height:900}});const page=await context.newPage();const id=crypto.randomUUID();sessions.set(id,{browser,context,page,createdAt:Date.now(),lastAt:Date.now()});return{id}}
function get(id){const s=sessions.get(id);if(!s)throw new Error("Session not found");s.lastAt=Date.now();return s}
async function act(s,a){
 const p=s.page,action=String(a.action||"");
 if(action==="open"){await p.goto(safeUrl(a.url),{waitUntil:"domcontentloaded",timeout:30000});return{url:p.url(),title:await p.title()}}
 if(action==="read"){return{url:p.url(),title:await p.title(),text:(await p.locator("body").innerText()).slice(0,50000)}}
 if(action==="click"){if(!a.selector)throw new Error("selector required");await p.locator(a.selector).first().click({timeout:15000});await p.waitForTimeout(250);return{url:p.url(),title:await p.title()}}
 if(action==="type"){if(!a.selector)throw new Error("selector required");await p.locator(a.selector).first().fill(String(a.text||""));return{ok:true}}
 if(action==="wait"){await p.waitForTimeout(Math.min(Math.max(Number(a.ms)||500,0),10000));return{ok:true}}
 if(action==="back"){await p.goBack({waitUntil:"domcontentloaded"});return{url:p.url(),title:await p.title()}}
 if(action==="forward"){await p.goForward({waitUntil:"domcontentloaded"});return{url:p.url(),title:await p.title()}}
 if(action==="screenshot"){const b=await p.screenshot({fullPage:Boolean(a.fullPage)});return{mime:"image/png",base64:b.toString("base64")}}
 throw new Error("Unsupported action");
}
const server=http.createServer(async(req,res)=>{
 if(req.method==="OPTIONS")return json(res,204,{});
 if(req.url==="/health"&&req.method==="GET")return json(res,200,{ok:true,name:"Faceless Operator",aiModel:false,sessions:sessions.size});
 if(!auth(req))return json(res,401,{error:"Unauthorized"});
 try{
  if(req.url==="/v1/sessions"&&req.method==="POST")return json(res,201,await makeSession());
  const m=req.url.match(/^\/v1\/sessions\/([0-9a-f-]+)(?:\/actions)?$/i);
  if(!m)return json(res,404,{error:"Not found"});
  const id=m[1],s=get(id);
  if(req.method==="DELETE"){await s.browser.close();sessions.delete(id);return json(res,200,{ok:true})}
  if(req.method==="POST"&&req.url.endsWith("/actions")){
   const a=await body(req);
   if(["purchase","payment","submit_payment","delete_account","change_password"].includes(String(a.action)))return json(res,409,{error:"Sensitive action requires external human approval and is not executable by this engine."});
   const result=await act(s,a);return json(res,200,{ok:true,sessionId:id,action:a.action,result});
  }
  return json(res,405,{error:"Method not allowed"});
 }catch(e){return json(res,400,{error:e.message||"Operator error"})}
});
setInterval(async()=>{const cutoff=Date.now()-30*60*1000;for(const[id,s]of sessions)if(s.lastAt<cutoff){try{await s.browser.close()}catch{}sessions.delete(id)}},60000).unref();
server.listen(PORT,()=>console.log(`Faceless Operator listening on ${PORT}`));
