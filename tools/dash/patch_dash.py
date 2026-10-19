#!/usr/bin/env python3
"""Insert the "Today's revenue actions" panel into kits/_dash/index.html (idempotent: re-running replaces it)."""
import re, sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()

CSS = r"""
/* ACT:BEGIN css — Today's revenue actions (decrypted in the browser from actions.enc.json) */
.act{background:var(--card);border:1px solid var(--line);border-radius:14px;margin:0 0 22px;overflow:hidden}
.acth{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:16px 18px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#fff,#fbfbfc)}
.acth h2{margin:0;font-size:18px;letter-spacing:-.015em}.acth .mu{color:var(--mute);font-size:12.5px}
.acts{display:flex;gap:6px;flex-wrap:wrap}.acts span{border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:600;background:var(--soft);color:var(--sub)}
.acts span b{font-variant-numeric:tabular-nums;margin-right:4px;color:var(--ink)}
.acts .t-REPLY{background:var(--hotbg);color:var(--hot)}.acts .t-REPLY b{color:var(--hot)}
.acts .t-EMAIL{background:#e8f0fe;color:#1a56c4}.acts .t-EMAIL b{color:#1a56c4}
.acts .t-CALL{background:var(--okbg);color:var(--ok)}.acts .t-CALL b{color:var(--ok)}
.acts .t-VENDOR{background:var(--warmbg);color:var(--warm)}.acts .t-VENDOR b{color:var(--warm)}
.actwarn{margin:12px 18px 0;padding:9px 12px;border-radius:8px;background:var(--hotbg);color:#8a1720;font-size:13px}
.actg{padding:14px 18px 4px}.actg+.actg{border-top:1px dashed var(--line)}
.actg h3{margin:0 0 10px;font-size:14px;display:flex;align-items:baseline;gap:8px}.actg h3 i{font-style:normal;font-weight:500;color:var(--sub);font-size:12.5px}
.actg h3 em{font-style:normal;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--ink);color:#fff}
.actl{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px;margin-bottom:10px}
.ac{border:1px solid var(--line);border-radius:10px;padding:12px 13px;background:#fff;display:flex;flex-direction:column;gap:6px;min-width:0}
.ac.REPLY{border-left:3px solid var(--hot)}.ac.EMAIL{border-left:3px solid #1a56c4}.ac.CALL{border-left:3px solid var(--ok)}.ac.VENDOR{border-left:3px solid var(--warm)}.ac.NOTE{border-left:3px solid var(--cool)}
.ac .co{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14.5px}.ac .co span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ac .op{margin-left:auto;flex:none;font-size:11.5px;font-weight:700;background:var(--hotbg);color:var(--hot);border-radius:999px;padding:2px 8px}
.ac .op.lo{background:var(--soft);color:var(--sub)}
.ac .who{color:var(--sub);font-size:12.5px}.ac .what{font-size:13.5px;line-height:1.45}
.ac .qt{font-size:12px;color:var(--sub);background:var(--soft);border-radius:6px;padding:6px 8px;white-space:pre-line}
.ac .oth{font-size:11.5px;color:var(--mute)}
.ac .due{font-size:12px;color:var(--sub)}.ac .due.late{color:var(--hot);font-weight:600}.ac .due.now{color:var(--ok);font-weight:600}
.ac .lk{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.actmore{margin:0 0 12px}.actmore>summary{cursor:pointer;color:var(--sub);font-size:13px;font-weight:600;padding:6px 0;list-style:none}
.actmore>summary::-webkit-details-marker{display:none}.actmore>summary:before{content:'▸ ';}.actmore[open]>summary:before{content:'▾ ';}
.actstub{color:var(--mute);font-size:12.5px;padding:0 0 12px}
.actfold{border:0;background:none;color:var(--sub);cursor:pointer;font-size:12.5px;margin-left:auto}
@media (max-width:760px){.actl{grid-template-columns:1fr}.acth{padding:14px}.actg{padding:12px 14px 2px}}
/* ACT:END css */
"""

JS = r"""
/* ACT:BEGIN js — "Today's revenue actions". Data: actions.enc.json beside this page, refreshed by
   tools/dash/refresh_actions.py from Airtable ACCOUNTS_V2 "Dash Actions". It is encrypted to this
   dashboard: the private key is derived here from KEY (the events.php key carried by Steven's link),
   so the public file is useless to anyone without the link. */
var ACT=null,ACT_ERR='',ACT_AT=0,ACT_BUSY=false,ACT_MORE={},ACT_FOLD=localStorage.getItem('jdp_dash_act_fold')==='1';
var ACT_PUB={x:'tX2z6qLrFdKTC6UxpydMWGUNk1eXnzRTpQz-VLQ76FY',y:'-hePCz-JpfULvFqV4YEKmB_wp083zT1mNHDFjtcsrM0'};
var ACT_G=[['REPLY','Reply','a buyer wrote back — answer today'],['EMAIL','Email','we need an address to send a built store'],
  ['CALL','Call','due call-backs, highest score first'],['VENDOR','Vendor','register on a procurement portal'],['NOTE','Your notes','from your own calls']];
function ub64(s){s=String(s).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
function b64u(u){var s='';for(var i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function actDecrypt(env){
  var S=crypto.subtle,te=new TextEncoder(),EC={name:'ECDH',namedCurve:'P-256'},priv;
  return S.digest('SHA-256',te.encode('jdp-dash-actions-p256:'+KEY)).then(function(d){
    return S.importKey('jwk',{kty:'EC',crv:'P-256',x:ACT_PUB.x,y:ACT_PUB.y,d:b64u(new Uint8Array(d)),ext:true},EC,false,['deriveBits']);
  }).then(function(k){priv=k;return S.importKey('jwk',{kty:'EC',crv:'P-256',x:env.epk.x,y:env.epk.y,ext:true},EC,false,[]);
  }).then(function(epk){return S.deriveBits({name:'ECDH',public:epk},priv,256);
  }).then(function(sh){var a=new Uint8Array(sh),info=te.encode('jdp-dash-actions-v1'),m=new Uint8Array(a.length+info.length);m.set(a);m.set(info,a.length);return S.digest('SHA-256',m);
  }).then(function(k){return S.importKey('raw',k,'AES-GCM',false,['decrypt']);
  }).then(function(k){return S.decrypt({name:'AES-GCM',iv:ub64(env.iv)},k,ub64(env.ct));
  }).then(function(pt){return JSON.parse(new TextDecoder().decode(pt));});
}
function actLoad(force){
  if(!KEY||ACT_BUSY||(!force&&ACT&&Date.now()-ACT_AT<120000))return;
  if(!(window.crypto&&crypto.subtle)){ACT_ERR='This browser cannot unlock the actions (no WebCrypto).';return;}
  ACT_BUSY=true;
  fetch('actions.enc.json?c='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('http '+r.status);return r.json();})
  .then(actDecrypt).then(function(a){ACT=a;ACT_ERR='';ACT_AT=Date.now();})
  .catch(function(e){ACT_ERR=/http 404/.test(String(e))?'No actions published yet.':'Could not unlock the actions — reopen the dashboard from your latest emailed link.';ACT_AT=Date.now();})
  .then(function(){ACT_BUSY=false;var a=document.activeElement;if(D&&!(a&&a.closest&&a.closest('.edit')))render();});
}
function telh(p){var n=String(p||'').split(/\(|ext|\bx\s*\d|,|\//i)[0].replace(/[^\d+]/g,'');return n.length>=7?'tel:'+n:'';}
function dueTxt(s){if(!s)return'';var d=new Date(s+'T12:00:00'),n=new Date();n.setHours(12,0,0,0);var k=Math.round((d-n)/86400000);
  var lab=d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
  if(k<0)return'<div class="due late">Due '+esc(lab)+' · '+(-k)+(k===-1?' day':' days')+' overdue</div>';
  if(k===0)return'<div class="due now">Due today</div>';return'<div class="due">Due '+esc(lab)+(k===1?' · tomorrow':' · in '+k+' days')+'</div>';}
function acard(a){
  var tel=telh(a.phone),L=[];
  if(tel)L.push('<a class="btn sm call" href="'+esc(tel)+'">Call '+esc(a.phone)+'</a>');else if(a.phone)L.push('<span class="btn sm">'+esc(a.phone)+'</span>');
  if(a.email)L.push('<a class="btn sm'+(a.type==='REPLY'?' pri':'')+'" href="mailto:'+esc(a.email)+'">Email</a>');
  if(a.store)L.push('<a class="btn sm" href="'+esc(a.store)+'" target="_blank" rel="noopener">Store</a>');
  if(a.linkedin)L.push('<a class="btn sm" href="'+esc(a.linkedin)+'" target="_blank" rel="noopener">LinkedIn</a>');
  if(a.airtable)L.push('<a class="btn sm" href="'+esc(a.airtable)+'" target="_blank" rel="noopener">Airtable</a>');
  var op=a.opens?'<span class="op'+(a.opens<2?' lo':'')+'" title="Store opens">'+a.opens+(a.opens===1?' open':' opens')+'</span>':'';
  var who=[a.contact,a.title].filter(Boolean).join(' · ');
  return'<div class="ac '+esc(a.type)+'"><div class="co"><span>'+esc(a.company||'—')+'</span>'+op+'</div>'
   +(who?'<div class="who">'+esc(who)+(a.email&&a.type!=='EMAIL'?' · '+esc(a.email):'')+'</div>':'')
   +'<div class="what">'+esc(a.action||'')+'</div>'
   +(a.quote?'<div class="qt">'+esc(String(a.quote).trim())+'</div>':'')
   +dueTxt(a.due)
   +(a.others?'<div class="oth">Also there: '+esc(a.others)+'</div>':'')
   +(L.length?'<div class="lk">'+L.join('')+'</div>':'')+'</div>';}
function actionsHtml(){
  if(!ACT){return'<section class="act"><div class="acth"><h2>Today’s revenue actions</h2><span class="mu">'+esc(ACT_ERR||'Unlocking…')+'</span></div></section>';}
  var S=ACT.summary||{},all=ACT.actions||[],todayN=all.filter(function(a){return a.today;}).length;
  var h='<section class="act"><div class="acth"><h2>Today’s revenue actions</h2><div class="acts">'
   +ACT_G.map(function(g){return'<span class="t-'+g[0]+'"><b>'+(S[g[0]]!=null?S[g[0]]:0)+'</b>'+g[1]+'</span>';}).join('')+'</div>'
   +'<span class="mu">'+todayN+' for today · generated '+esc(ACT.generated_at?when(Date.parse(ACT.generated_at)/1000):'—')+'</span>'
   +'<button class="actfold" data-actfold="1">'+(ACT_FOLD?'Show':'Hide')+'</button></div>';
  if(ACT.truncated)h+='<div class="actwarn"><b>Feed truncated:</b> showing '+(ACT.count||all.length)+' of '+(ACT.expected||'?')+' actions. The Airtable field hit its 100,000-character limit, so the rest (including any vendor registrations and notes) did not come through. The pipeline fix is in progress.</div>';
  if(ACT_FOLD)return h+'</section>';
  ACT_G.forEach(function(g){
    var it=all.filter(function(a){return a.type===g[0];});
    if(g[0]==='CALL')it.sort(function(a,b){return(b.score||0)-(a.score||0);});
    var exp=+(S[g[0]]||0);
    if(!it.length&&!exp)return;
    var now=it.filter(function(a){return a.today;}),later=it.filter(function(a){return!a.today;});
    h+='<div class="actg"><h3>'+g[1]+' <em>'+now.length+' today</em><i>'+g[2]+'</i></h3>';
    if(now.length)h+='<div class="actl">'+now.map(acard).join('')+'</div>';
    else if(it.length)h+='<div class="actstub">Nothing due today.</div>';
    if(later.length)h+='<details class="actmore" data-actmore="'+g[0]+'"'+(ACT_MORE[g[0]]?' open':'')+'><summary>Later this week · '+later.length+'</summary><div class="actl">'+later.map(acard).join('')+'</div></details>';
    if(exp>it.length)h+='<div class="actstub">'+(exp-it.length)+' more not shown (feed truncated).</div>';
    h+='</div>';
  });
  return h+'</section>';
}
document.addEventListener('toggle',function(ev){var d=ev.target;if(d.dataset&&d.dataset.actmore)ACT_MORE[d.dataset.actmore]=d.open;},true);
document.addEventListener('click',function(ev){var t=ev.target.closest('[data-actfold]');if(!t)return;ACT_FOLD=!ACT_FOLD;localStorage.setItem('jdp_dash_act_fold',ACT_FOLD?'1':'0');render();});
/* ACT:END js */
"""

# strip any previous insertion (idempotent)
s = re.sub(r"\n/\* ACT:BEGIN css.*?/\* ACT:END css \*/\n", "", s, flags=re.S)
s = re.sub(r"\n/\* ACT:BEGIN js.*?/\* ACT:END js \*/\n", "\n", s, flags=re.S)
s = s.replace("actLoad();\n  api('dash=1", "api('dash=1")
s = s.replace("h+=actionsHtml();h+='<div class=\"kpis\">'", "h+='<div class=\"kpis\">'")

def once(old, new):
    global s
    n = s.count(old)
    if n != 1:
        raise SystemExit("anchor count %d for: %r" % (n, old[:70]))
    s = s.replace(old, new)

once("</style>", CSS + "</style>")
once("/* ---- render ---- */", JS.strip() + "\n/* ---- render ---- */")
once("  api('dash=1&days='+DAYS)", "  actLoad();\n  api('dash=1&days='+DAYS)")
once("h+='<div class=\"kpis\">'", "h+=actionsHtml();h+='<div class=\"kpis\">'")
open(dst, "w", encoding="utf-8").write(s)
print("patched ->", dst, len(s), "bytes")
