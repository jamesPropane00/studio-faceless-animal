(function () {
  'use strict';
  function session(){try{return JSON.parse(localStorage.getItem('fas_user')||'null')}catch(e){return null}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
  function when(v){var d=new Date(v||Date.now());return isNaN(d)?'now':d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
  function headers(){var s=session();return Object.assign({'Content-Type':'application/json'},s?{'x-fas-user':JSON.stringify(s)}:{})}
  async function request(url,opts){var r=await fetch(url,opts);var d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||'Street Wire request failed.');return d}
  function keyFor(root){return root.getAttribute('data-engagement-key')||''}
  function choiceKey(key){return'fas_engagement_choice_'+key}
  function deviceId(){var key='fas_street_wire_device';var id=localStorage.getItem(key);if(!id){id='wire-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);localStorage.setItem(key,id)}return id}
  function render(root,data){
    var comments=Array.isArray(data.comments)?data.comments:[];
    var reactions=data.reactions||{};
    var choice=localStorage.getItem(choiceKey(keyFor(root)))||'';
    root.querySelector('[data-sw-like-count]').textContent=String(reactions.like||0);
    root.querySelector('[data-sw-dislike-count]').textContent=String(reactions.dislike||0);
    root.querySelector('[data-sw-comment-count]').textContent=String(comments.length);
    root.querySelector('[data-sw-like]').classList.toggle('is-active',choice==='like');
    root.querySelector('[data-sw-dislike]').classList.toggle('is-active',choice==='dislike');
    var children={};comments.forEach(function(c){if(c.parent_id)(children[c.parent_id]||(children[c.parent_id]=[])).push(c)});
    function card(c,reply){return'<div class="street-wire__comment'+(reply?' is-reply':'')+'" data-comment-id="'+esc(c.id)+'"><div class="street-wire__meta"><strong>@'+esc(c.username||'guest')+'</strong><span>'+esc(when(c.created_at))+'</span></div><p>'+esc(c.text)+'</p><button class="street-wire__reply" type="button" data-sw-reply="'+esc(c.id)+'">Reply</button></div>'}
    var top=comments.filter(function(c){return!c.parent_id});var html=[];top.forEach(function(c,i){html.push('<div class="'+(i>2?'is-collapsed':'')+'" data-thread>'+card(c,false)+(children[c.id]||[]).map(function(r){return card(r,true)}).join('')+'</div>')});
    var list=root.querySelector('[data-sw-list]');list.innerHTML=html.join('')||'<div class="street-wire__empty">No street talk yet. Start the thread.</div>';
    var view=root.querySelector('[data-sw-view-all]');view.hidden=top.length<=3;view.textContent='View all '+top.length+' threads';
    root.dataset.comments=JSON.stringify(comments);
  }
  async function load(root){try{render(root,await request('/api/engagement?key='+encodeURIComponent(keyFor(root))))}catch(e){root.querySelector('[data-sw-status]').textContent=e.message}}
  function markup(key,title,url,media){
    return'<section class="street-wire" data-street-wire data-engagement-key="'+esc(key)+'" data-title="'+esc(title)+'" data-url="'+esc(url)+'" data-media="'+esc(media||'')+'"><div class="street-wire__bar"><button type="button" data-sw-like>Like <span data-sw-like-count>0</span></button><button type="button" data-sw-dislike>Dislike <span data-sw-dislike-count>0</span></button><button type="button" data-sw-share>Share</button><button type="button" data-sw-comments>Street Talk <span data-sw-comment-count>0</span></button></div><div class="street-wire__drawer"><div class="street-wire__head"><strong>Street Wire Replies</strong><span>Open signal / real voices</span></div><div class="street-wire__list" data-sw-list></div><button class="street-wire__view-all" type="button" data-sw-view-all hidden></button><form class="street-wire__form" data-sw-form><textarea maxlength="800" placeholder="Drop your response on the wire..." aria-label="Write a comment"></textarea><button type="submit">Transmit</button></form><p class="street-wire__status" data-sw-status></p></div></section>'
  }
  function bind(root){
    if(root.dataset.bound==='1')return;root.dataset.bound='1';var key=keyFor(root),replyTo='';
    root.querySelector('[data-sw-comments]').addEventListener('click',function(){root.classList.toggle('is-open');if(root.classList.contains('is-open'))load(root)});
    ['like','dislike'].forEach(function(type){root.querySelector('[data-sw-'+type+']').addEventListener('click',async function(){var old=localStorage.getItem(choiceKey(key))||'';var next=old===type?'clear':type;try{var d=await request('/api/engagement',{method:'POST',headers:headers(),body:JSON.stringify({action:'react',key:key,reaction:next,device_id:deviceId(),content_title:root.dataset.title||'',content_url:root.dataset.url||''})});if(next==='clear')localStorage.removeItem(choiceKey(key));else localStorage.setItem(choiceKey(key),next);render(root,d);var label=next==='like'?'Liked':next==='dislike'?'Disliked':'';var title=root.dataset.title||'this content';var status=root.querySelector('[data-sw-status]');if(!root.classList.contains('is-open')&&label){status.innerHTML=label+': '+esc(title)+' &mdash; <a href="#" data-sw-open-talk>Open Street Talk</a>'}else{status.textContent=''}}catch(e){root.querySelector('[data-sw-status]').textContent=e.message}})});
    root.querySelector('[data-sw-share]').addEventListener('click',async function(){var url=root.dataset.url||location.href;try{if(navigator.share)await navigator.share({title:root.dataset.title,url:url});else await navigator.clipboard.writeText(url);this.textContent='Shared'}catch(e){}});
    root.addEventListener('click',function(e){var t=e.target.closest('[data-sw-open-talk]');if(!t)return;e.preventDefault();root.classList.add('is-open');load(root);root.querySelector('[data-sw-status]').textContent=''});
    root.querySelector('[data-sw-list]').addEventListener('click',function(e){var b=e.target.closest('[data-sw-reply]');if(!b)return;replyTo=b.getAttribute('data-sw-reply');root.querySelector('textarea').placeholder='Replying on this thread...';root.querySelector('textarea').focus()});
    root.querySelector('[data-sw-view-all]').addEventListener('click',function(){root.querySelectorAll('[data-thread]').forEach(function(t){t.classList.remove('is-collapsed')});this.hidden=true});
    root.querySelector('[data-sw-form]').addEventListener('submit',async function(e){e.preventDefault();var text=this.querySelector('textarea').value.trim();if(!text)return;try{var d=await request('/api/engagement',{method:'POST',headers:headers(),body:JSON.stringify({action:replyTo?'reply':'comment',key:key,text:text,parent_id:replyTo,content_title:root.dataset.title||'',content_url:root.dataset.url||''})});this.reset();replyTo='';this.querySelector('textarea').placeholder='Drop your response on the wire...';render(root,d)}catch(err){root.querySelector('[data-sw-status]').textContent=err.message}});
    load(root)
  }
  window.FASStreetWire={markup:markup,bind:bind,bindAll:function(r){(r||document).querySelectorAll('[data-street-wire]').forEach(bind)}};
}());
