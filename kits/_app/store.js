/* JDP Storefront — the "Uber Eats of branded apparel".
   Renders a clean MENU of the recommended picks from client.json + the shared catalogue, with a
   tap-to-customize sheet, a CART, one-tap quote, and choices saved to the device (localStorage).
   Deployed once at /kits/_app/store.js. */
(function(){
document.documentElement.classList.add('js');
var CATALOG_BASE="https://justdealspromotions.com/kits/_catalog";
var CFG,CAT,BYKEY={},CART={},SLUG=(location.pathname.split('/').filter(Boolean).pop()||'kit');
var LSKEY='jdpkit_'+SLUG;

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function hexLum(h){h=(h||'').replace('#','');if(h.length<6)return 128;return 0.299*parseInt(h.slice(0,2),16)+0.587*parseInt(h.slice(2,4),16)+0.114*parseInt(h.slice(4,6),16);}
function autoInk(rgb){return hexLum(rgb)<120?'white':'brand';}
function money(x){return '$'+Number(x||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});}
function logoOf(id){for(var i=0;i<CFG.logos.length;i++)if(CFG.logos[i].id===id)return CFG.logos[i];return CFG.logos[0]||{inks:{}};}
function inkUrl(logo,ink,col){var t=(ink&&ink!=='auto')?ink:autoInk(col&&col.rgb);return logo.inks[t]||logo.inks.brand;}
function gurl(f){return CFG.catalog_base+'/img/'+f;}
function colOf(item,name){for(var i=0;i<item.cols.length;i++)if(item.cols[i].name===name)return item.cols[i];return item.cols[0];}
function placeOf(item,pid){for(var i=0;i<item.places.length;i++)if(item.places[i].id===pid)return item.places[i];return null;}
function vmOf(key){return (CFG.items||{})[key]||{colour:(BYKEY[key].cols[0]||{}).name,decos:[]};}
function unitAt(item,q){var cs=CFG.pricing.cols,pr=item.prices,i=0;for(var k=0;k<cs.length;k++){if(q>=cs[k])i=k;}return pr[i];}
function moq(){return (CFG.pricing.cols&&CFG.pricing.cols[0])||12;}

/* ---------- persistence ---------- */
function loadCart(){try{CART=JSON.parse(localStorage.getItem(LSKEY))||{};}catch(e){CART={};}}
function saveCart(){try{localStorage.setItem(LSKEY,JSON.stringify(CART));}catch(e){}}

/* ---------- overlay (garment + logo at a placement) ---------- */
function overlayHtml(item,vm,colName,faces){
  var col=colOf(item,colName);var face=faces||'front';var hasBack=!!col.back;
  if(face==='back'&&!hasBack)face='front';
  var photo=(face==='back'&&col.back)?col.back:col.front;
  var lg='';
  (vm.decos||[]).forEach(function(d){if(!d.on)return;var p=placeOf(item,d.pl);if(!p||(p.face||'front')!==face)return;
    if(face==='back'&&!hasBack)return;
    var L=logoOf(d.lg),src=inkUrl(L,d.ink,col);
    lg+='<img class="l" src="'+src+'" style="left:'+p.cx+'%;top:'+p.cy+'%;width:'+p.wf+'%" alt="">';});
  return {g:gurl(photo),lg:lg,hasBack:hasBack};
}

/* ---------- menu card ---------- */
function menuCard(key){
  var item=BYKEY[key],vm=vmOf(key);if(!item)return '';
  var col=colOf(item,vm.colour);
  var o=overlayHtml(item,vm,vm.colour,'front');
  var dots=item.cols.slice(0,5).map(function(c){return '<span class="mdot" style="background:'+c.rgb+'"></span>';}).join('')+
           (item.cols.length>5?'<span class="mdot more">+'+(item.cols.length-5)+'</span>':'');
  var placeNames=(vm.decos||[]).filter(function(d){return d.on;}).map(function(d){var p=placeOf(item,d.pl);return p?p.label:'';}).filter(Boolean);
  var meta=item.sku+' · '+(placeNames.join(' + ')||'left chest');
  var rec=(key===CFG.feature||item.rec)?'<span class="mrec">Top pick</span>':'';
  var inkit=CART[key]?' inkit':'';
  return '<div class="mcard'+inkit+'" data-key="'+key+'">'+rec+
    '<div class="mstage"><img class="g" src="'+o.g+'" alt="'+esc(item.name)+'" loading="lazy" decoding="async">'+o.lg+'</div>'+
    '<div class="mb"><h3>'+esc(item.name)+'</h3><div class="mmeta">'+esc(meta)+'</div>'+
    '<div class="mdots">'+dots+'</div>'+
    '<div class="mfoot"><div class="mprice">from '+money(item.prices[item.prices.length-1])+' <small>ea</small></div>'+
    '<button class="madd" data-key="'+key+'">'+(CART[key]?'In kit':'Add')+'</button></div></div></div>';
}

/* ---------- build page ---------- */
function buildStore(){
  var C=CFG.copy||{};
  var office=(CFG.order.office||[]).map(menuCard).join('');
  var field=(CFG.order.field||[]).map(menuCard).join('');
  var chips=(C.chips||[]).slice(0,3).map(function(c){return '<span class="hchip">'+esc(c[0])+'</span>';}).join('');
  var html=''+
   '<header class="hdr"><div class="w hdrin"><span class="brand"><img src="'+(CFG.cover_logo||'img/logo-white.png')+'" onerror="this.style.display=\'none\'" alt=""><b>'+esc(CFG.client)+'</b> <i>×</i> Just Deals</span>'+
     '<button class="cartbtn" id="openCart"><span class="lbl">Your kit</span> <span class="n" id="cartN">0</span></button></div></header>'+
   '<section class="hero"><div class="w heroin"><div class="eyb">Recommended kit · ready to order</div>'+
     '<h1>'+esc(CFG.client)+"'s branded apparel — your logo, already on it.</h1>"+
     '<p>We picked the kit; you just choose colours &amp; quantities and send it back for a quote. No design work.</p>'+
     '<div class="herochips">'+chips+'</div></div></section>'+
   ((office&&field)?('<nav class="tabs"><div class="w tabsin"><button class="tab on" data-t="sec-office">Office &amp; client-facing</button><button class="tab" data-t="sec-field">Job-site &amp; hi-vis</button></div></nav>'):'')+
   '<main class="w">'+
     (office?'<section class="sec" id="sec-office"><div class="seclbl">Office &amp; client-facing</div><div class="secsub">Tap an item to choose colour &amp; quantity.</div><div class="menu">'+office+'</div></section>':'')+
     (field?'<section class="sec" id="sec-field"><div class="seclbl">Job-site &amp; hi-vis</div><div class="secsub">CSA-rated, logo-ready.</div><div class="menu">'+field+'</div></section>':'')+
   '</main>'+
   '<footer>Just Deals Promotions · Branded Workwear &amp; Safety Apparel · Prepared for '+esc(CFG.client)+' · Concept mockups on representative product photography; pricing by exact quote.</footer>'+
   '<div class="ov" id="ov"></div>'+
   '<div class="sheet" id="sheet"></div>'+
   '<aside class="cart" id="cart"></aside>'+
   '<div class="cbar" id="cbar"><div class="cbarin"><button class="cbarbtn" id="openCart2"><span class="n" id="cbarN">0</span> View your kit <span class="p" id="cbarP"></span></button></div></div>'+
   '<div class="toast" id="toast"><span class="k">✓</span><span id="toastM">Added</span></div>';
  document.getElementById('app').innerHTML=html;
  document.getElementById('openCart').addEventListener('click',openCart);
  document.getElementById('openCart2').addEventListener('click',openCart);
  document.getElementById('ov').addEventListener('click',closeAll);
  document.querySelectorAll('.mcard').forEach(function(card){
    card.addEventListener('click',function(e){openSheet(card.dataset.key);});
  });
  document.querySelectorAll('.tab').forEach(function(t){t.addEventListener('click',function(){
    document.querySelectorAll('.tab').forEach(function(x){x.classList.toggle('on',x===t);});
    var el=document.getElementById(t.dataset.t);if(el)window.scrollTo({top:el.getBoundingClientRect().top+window.pageYOffset-110,behavior:'smooth'});});});
  document.querySelectorAll('.mstage .g').forEach(function(im){if(im.complete)im.classList.add('ld');else im.addEventListener('load',function(){im.classList.add('ld');});});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeAll();});
}
var TT;
function toast(msg){var t=document.getElementById('toast'),m=document.getElementById('toastM');if(!t)return;if(m)m.textContent=msg||'Added to your kit';t.classList.add('on');clearTimeout(TT);TT=setTimeout(function(){t.classList.remove('on');},1900);}

/* ---------- item sheet ---------- */
var SH={key:null,colour:null,face:'front',places:{},qty:12};
function openSheet(key){
  var item=BYKEY[key],vm=vmOf(key);
  var existing=CART[key];
  SH={key:key,colour:(existing&&existing.colour)||vm.colour,face:'front',places:{},qty:(existing&&existing.qty)||moq()};
  // seed placement toggles from cart or recommendation
  (item.places||[]).forEach(function(p){if(!p.logo)return;
    var on=false;
    if(existing&&existing.places){on=existing.places.indexOf(p.id)>=0;}
    else{var d=(vm.decos||[]).filter(function(x){return x.pl===p.id;})[0];on=!!(d&&d.on);}
    SH.places[p.id]=on;});
  renderSheet();
  document.getElementById('ov').classList.add('on');
  document.getElementById('sheet').classList.add('on');
  document.body.style.overflow='hidden';
}
function sheetDecos(){var item=BYKEY[SH.key],vm=vmOf(SH.key);
  return (item.places||[]).filter(function(p){return p.logo;}).map(function(p){
    var d=(vm.decos||[]).filter(function(x){return x.pl===p.id;})[0]||{};
    return {pl:p.id,on:!!SH.places[p.id],lg:d.lg||(CFG.logos[0]||{}).id,ink:d.ink||'auto',method:d.method||'embroidery'};});
}
function renderSheet(){
  var item=BYKEY[SH.key];var col=colOf(item,SH.colour);
  var o=overlayHtml(item,{decos:sheetDecos()},SH.colour,SH.face);
  var hasBack=o.hasBack;
  var chips=item.cols.map(function(c){return '<button class="cchip'+(c.name===SH.colour?' on':'')+'" data-col="'+esc(c.name)+'" style="background-image:url('+gurl(c.front)+')" title="'+esc(c.name)+'"></button>';}).join('');
  var pchips=(item.places||[]).filter(function(p){return p.logo;}).map(function(p){
    var na=(p.face==='back'&&!hasBack);
    return '<button class="pchip'+(SH.places[p.id]?' on':'')+(na?' na':'')+'" data-pl="'+p.id+'">'+esc(p.label)+'</button>';}).join('');
  var faceTog=hasBack?'<div class="chips" style="margin-top:10px"><button class="pchip'+(SH.face==='front'?' on':'')+'" data-face="front">Front</button><button class="pchip'+(SH.face==='back'?' on':'')+'" data-face="back">Back</button></div>':'';
  var unit=unitAt(item,SH.qty),line=unit*SH.qty;
  var p0=item.prices[0],pN=item.prices[item.prices.length-1],topcol=CFG.pricing.cols[CFG.pricing.cols.length-1];
  var sv=p0>0?Math.round((1-pN/p0)*100):0;
  var qh=money(unit)+' ea at '+SH.qty+' pcs'+(sv>0?' · <span class="save">save '+sv+'% at '+topcol+'+</span>':'');
  document.getElementById('sheet').innerHTML=
    '<div class="shimg" id="shimg"><button class="shx" id="shx">✕</button><img class="g" src="'+o.g+'" alt=""> '+o.lg+'</div>'+
    '<div class="shb"><h2>'+esc(item.name)+'</h2><div class="shsku">'+esc(item.sku)+' · '+esc(item.method||'Embroidered')+'</div>'+
    (item.blurb?'<p class="shblurb">'+esc(item.blurb)+'</p>':'')+
    '<div class="optlbl">Colour <i id="colName">'+esc(SH.colour)+'</i></div><div class="chips" data-role="col">'+chips+'</div>'+
    '<div class="optlbl">Logo placement</div><div class="chips" data-role="pl">'+pchips+'</div>'+faceTog+
    '<div class="optlbl">Quantity <i>('+moq()+' minimum)</i></div>'+
    '<div class="qty"><button data-q="-1">–</button><input id="qin" type="number" inputmode="numeric" value="'+SH.qty+'" min="'+moq()+'"><button data-q="1">+</button></div>'+
    '<div class="qhint" id="qhint">'+qh+'</div>'+
    '<div class="shadd"><button class="shaddbtn" id="shAdd">'+(CART[SH.key]?'Update kit':'Add to kit')+'<span class="p">'+money(line)+'</span></button></div></div>';
  var sh=document.getElementById('sheet');
  document.getElementById('shx').addEventListener('click',closeAll);
  sh.querySelectorAll('.cchip').forEach(function(b){b.addEventListener('click',function(){SH.colour=b.dataset.col;swapPreview();renderSheet();});});
  sh.querySelectorAll('[data-role=pl] .pchip').forEach(function(b){b.addEventListener('click',function(){if(b.classList.contains('na'))return;SH.places[b.dataset.pl]=!SH.places[b.dataset.pl];if(SH.places[b.dataset.pl]){var p=placeOf(item,b.dataset.pl);SH.face=(p.face==='back')?'back':'front';}renderSheet();});});
  sh.querySelectorAll('[data-face]').forEach(function(b){b.addEventListener('click',function(){SH.face=b.dataset.face;renderSheet();});});
  sh.querySelectorAll('.qty button').forEach(function(b){b.addEventListener('click',function(){var step=parseInt(b.dataset.q,10)*(SH.qty<48?6:12);SH.qty=Math.max(moq(),SH.qty+step);renderSheet();});});
  document.getElementById('qin').addEventListener('change',function(e){SH.qty=Math.max(moq(),parseInt(e.target.value,10)||moq());renderSheet();});
  document.getElementById('shAdd').addEventListener('click',addFromSheet);
}
function swapPreview(){var im=document.getElementById('shimg');if(im){im.classList.add('sw');setTimeout(function(){im.classList.remove('sw');},220);}}
function addFromSheet(){
  var was=!!CART[SH.key];
  var places=Object.keys(SH.places).filter(function(k){return SH.places[k];});
  CART[SH.key]={qty:SH.qty,colour:SH.colour,places:places};
  saveCart();closeAll();refreshCartUI();
  toast((was?'Updated · ':'Added · ')+BYKEY[SH.key].name);
}

/* ---------- cart ---------- */
function cartCount(){return Object.keys(CART).length;}
function cartSubtotal(){var t=0;Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it)return;var c=CART[k];t+=unitAt(it,c.qty)*c.qty;});return t;}
function refreshCartUI(){
  var n=cartCount(),sub=cartSubtotal();
  var cn=document.getElementById('cartN');if(cn)cn.textContent=n;
  var bar=document.getElementById('cbar');if(bar)bar.classList.toggle('on',n>0);
  var bn=document.getElementById('cbarN');if(bn)bn.textContent=n;
  var bp=document.getElementById('cbarP');if(bp)bp.textContent=money(sub);
  document.querySelectorAll('.mcard').forEach(function(card){var k=card.dataset.key;var on=!!CART[k];card.classList.toggle('inkit',on);var b=card.querySelector('.madd');if(b)b.textContent=on?'In kit':'Add';});
}
function openCart(){renderCart();document.getElementById('ov').classList.add('on');document.getElementById('cart').classList.add('on');document.body.style.overflow='hidden';}
function renderCart(){
  var keys=Object.keys(CART),sub=cartSubtotal();
  var items=keys.map(function(k){var it=BYKEY[k];if(!it)return '';var c=CART[k];var col=colOf(it,c.colour);
    var placeNames=(c.places||[]).map(function(pid){var p=placeOf(it,pid);return p?p.label:'';}).filter(Boolean).join(' + ')||'left chest';
    var unit=unitAt(it,c.qty);
    return '<div class="ci" data-key="'+k+'"><div class="t" style="background-image:url('+gurl(col.front)+')"></div>'+
      '<div class="d"><h4>'+esc(it.name)+'</h4><div class="sub">'+esc(c.colour)+' · '+esc(placeNames)+'</div>'+
      '<div class="row"><div class="qty"><button data-q="-1">–</button><input class="ciq" type="number" value="'+c.qty+'" min="'+moq()+'"><button data-q="1">+</button></div>'+
      '<div class="lp">'+money(unit*c.qty)+'</div></div>'+
      '<div class="rm" data-rm="'+k+'">Remove</div></div></div>';}).join('');
  var body=keys.length?items:'<div class="cempty">Your kit is empty.<br>Tap any item to add it.</div>';
  document.getElementById('cart').innerHTML=
    '<div class="carth"><h2>Your kit</h2><button class="cartx" id="cartx">✕</button></div>'+
    '<div class="citems" id="citems">'+body+'</div>'+
    '<div class="cartf">'+
      '<div class="crow"><span>Estimated subtotal</span><b>'+money(sub)+'</b></div>'+
      '<div class="csetup">Decorated, per piece. One-time setup: '+esc(CFG.pricing.setup_line||'')+'. Your exact itemised quote is confirmed before anything runs.</div>'+
      '<button class="checkout" id="checkout"'+(keys.length?'':' disabled')+'>Request my quote →</button>'+
    '</div>';
  document.getElementById('cartx').addEventListener('click',closeAll);
  document.getElementById('checkout').addEventListener('click',openCheckout);
  document.querySelectorAll('.ci').forEach(function(ci){var k=ci.dataset.key;
    ci.querySelectorAll('.qty button').forEach(function(b){b.addEventListener('click',function(){var step=parseInt(b.dataset.q,10)*(CART[k].qty<48?6:12);CART[k].qty=Math.max(moq(),CART[k].qty+step);saveCart();renderCart();refreshCartUI();});});
    ci.querySelector('.ciq').addEventListener('change',function(e){CART[k].qty=Math.max(moq(),parseInt(e.target.value,10)||moq());saveCart();renderCart();refreshCartUI();});
    ci.querySelector('[data-rm]').addEventListener('click',function(){delete CART[k];saveCart();renderCart();refreshCartUI();});
  });
}
function closeAll(){['ov','sheet','cart'].forEach(function(id){var e=document.getElementById(id);if(e)e.classList.remove('on');});document.body.style.overflow='';}

/* ---------- checkout ---------- */
function openCheckout(){
  var sub=cartSubtotal();
  var saved=JSON.parse(localStorage.getItem(LSKEY+'_who')||'{}');
  var review=Object.keys(CART).map(function(k){var it=BYKEY[k];if(!it)return '';var c=CART[k];
    return '<div class="r"><span>'+esc(it.name)+' · '+esc(c.colour)+' × '+c.qty+'</span><span>'+money(unitAt(it,c.qty)*c.qty)+'</span></div>';}).join('');
  document.getElementById('cart').innerHTML=
    '<div class="carth"><h2>Request your quote</h2><button class="cartx" id="cartx">✕</button></div>'+
    '<div class="citems"><div class="co">'+
      '<p style="color:var(--mut);font-size:14px;line-height:1.5;margin:10px 0 4px">Send us your kit and we’ll reply with an exact, itemised quote — usually same day. No obligation.</p>'+
      '<div class="coreview">'+review+'</div>'+
      '<label>Your name</label><input id="coName" value="'+esc(saved.name||'')+'" placeholder="First & last">'+
      '<label>Email</label><input id="coEmail" type="email" value="'+esc(saved.email||'')+'" placeholder="you@company.com">'+
      '<label>Anything to add? (optional)</label><textarea id="coNote" placeholder="Sizes, deadlines, other items…"></textarea>'+
    '</div></div>'+
    '<div class="cartf"><div class="crow tot"><span>Estimated</span><span>'+money(sub)+'</span></div>'+
      '<button class="checkout" id="send">Send to Just Deals →</button></div>';
  document.getElementById('cartx').addEventListener('click',closeAll);
  document.getElementById('send').addEventListener('click',sendQuote);
}
function orderText(who){
  var lines=['Kit request — '+CFG.client,'From: '+(who.name||'')+' <'+(who.email||'')+'>','Link: '+location.href.split('#')[0],''];
  Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it)return;var c=CART[k];var pn=(c.places||[]).map(function(pid){var p=placeOf(it,pid);return p?p.label:'';}).filter(Boolean).join(' + ')||'left chest';
    lines.push('• '+it.name+' — '+c.colour+' · '+pn+' · qty '+c.qty+' @ '+money(unitAt(it,c.qty))+' = '+money(unitAt(it,c.qty)*c.qty));});
  lines.push('','Estimated subtotal: '+money(cartSubtotal())+' (+ one-time setup)');
  if(who.note)lines.push('','Note: '+who.note);
  return lines.join('\n');
}
function sendQuote(){
  var who={name:(document.getElementById('coName').value||'').trim(),email:(document.getElementById('coEmail').value||'').trim(),note:(document.getElementById('coNote').value||'').trim()};
  if(!who.name||!who.email){alert('Please add your name and email so we can send your quote.');return;}
  try{localStorage.setItem(LSKEY+'_who',JSON.stringify({name:who.name,email:who.email}));}catch(e){}
  var body=orderText(who);
  var to='steven@justdealspromotions.com';
  var subj='Kit request — '+CFG.client+' ('+who.name+')';
  // capture endpoint if configured on the client, else fall back to a prefilled email
  if(CFG.lead_endpoint){
    fetch(CFG.lead_endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client:CFG.client,slug:SLUG,who:who,cart:CART,text:body})}).catch(function(){});
  } else {
    var a=document.createElement('a');a.href='mailto:'+to+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);a.click();
  }
  document.getElementById('cart').innerHTML='<div class="carth"><h2>Sent ✓</h2><button class="cartx" id="cartx">✕</button></div>'+
    '<div class="citems"><div class="codone"><div class="big">🎉</div><h3>Your kit is on its way to us</h3>'+
    '<p>Thanks, '+esc(who.name)+'! We’ll reply to <b>'+esc(who.email)+'</b> with your exact quote — usually same day. Your picks are saved on this device if you want to tweak them.</p></div></div>';
  document.getElementById('cartx').addEventListener('click',closeAll);
}

/* ---------- boot ---------- */
function go(cfg){
  CFG=cfg;
  if(cfg.accent)document.documentElement.style.setProperty('--a',cfg.accent);
  document.title=(cfg.client||'Branded Apparel')+' — Branded Apparel · Just Deals Promotions';
  fetch((cfg.catalog_base||CATALOG_BASE)+'/catalog.json?v='+(cfg.ver||'1')).then(function(r){return r.json();}).then(function(cat){
    CFG.catalog_base=cfg.catalog_base||CATALOG_BASE;CAT=cat;(cat.items||[]).forEach(function(it){BYKEY[it.key]=it;});
    loadCart();buildStore();refreshCartUI();
  }).catch(function(e){document.getElementById('app').innerHTML='<p style="padding:60px;text-align:center">Could not load the catalogue. Please refresh.</p>';});
}
var cel=document.getElementById('jdpcfg');
if(cel){try{go(JSON.parse(cel.textContent));}catch(e){}}
else{fetch('client.json?v='+Date.now()).then(function(r){return r.json();}).then(go).catch(function(){document.getElementById('app').innerHTML='<p style="padding:60px;text-align:center">Client config not found.</p>';});}
})();
