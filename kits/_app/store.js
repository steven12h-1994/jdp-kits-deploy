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
function inkCss(v){return v==='white'?'#fff':(v==='dark'||v==='black')?'#141414':v;}
var BRANDGRAD='background:conic-gradient(from 210deg,#c9a24b,#6d6c69,#6dd4fa,#c9a24b)';
function inkOpts(logo){var opts=[['brand','Full colour'],['white','White'],['dark','Black']],seen={brand:1,white:1,dark:1};
  Object.keys((logo&&logo.inks)||{}).forEach(function(k){if(k.charAt(0)==='#'&&!seen[k.toLowerCase()]){seen[k.toLowerCase()]=1;opts.push([k,'Brand colour']);}});return opts;}
function gurl(f){return CFG.catalog_base+'/img/'+f;}
function colOf(item,name){for(var i=0;i<item.cols.length;i++)if(item.cols[i].name===name)return item.cols[i];return item.cols[0];}
function placeOf(item,pid){for(var i=0;i<item.places.length;i++)if(item.places[i].id===pid)return item.places[i];return null;}
function vmOf(key){return (CFG.items||{})[key]||{colour:(BYKEY[key].cols[0]||{}).name,decos:[]};}
function unitAt(item,q){var cs=CFG.pricing.cols,pr=item.prices,i=0;for(var k=0;k<cs.length;k++){if(q>=cs[k])i=k;}return pr[i];}
function moq(){return (CFG.pricing.cols&&CFG.pricing.cols[0])||12;}
/* ---- decoration-aware pricing (mirrors the server rate card) ---- */
var MLAB={embroidery:'Embroidery',screen:'Screen print',heat_transfer:'Heat transfer'};
var METHODS=['embroidery','screen','heat_transfer'];
function blankOf(key){var r=CFG.rates||{};return (r.blank&&r.blank[key]!=null)?r.blank[key]:((BYKEY[key]||{}).blank||0);}
function decoCost(m){var r=CFG.rates||{};return m==='screen'?(r.screen||0):m==='heat_transfer'?(r.ht||0):(r.emb||0);}
function markup(q){var r=CFG.rates||{},mg=r.margin||[],m=(mg[0]&&mg[0][1])||2;mg.forEach(function(t){if(q>=t[0])m=t[1];});return m;}
function activeDecos(decos){return (decos||[]).filter(function(d){return d.on;});}
function unitPrice(key,decos,q){var r=CFG.rates;if(!r||!r.margin){return unitAt(BYKEY[key],q);}
  var c=blankOf(key);activeDecos(decos).forEach(function(d){c+=decoCost(d.method);});return Math.round(c*markup(q)*100)/100;}
function setupFor(decos){var r=CFG.rates||{},s=r.setup||{},seen={},t=0;
  activeDecos(decos).forEach(function(d){if(seen[d.method])return;seen[d.method]=1;
    t+=d.method==='screen'?(s.screen||0):d.method==='heat_transfer'?(s.heat_transfer||0):(s.embroidery||0);});return t;}
function recDecos(key){return ((CFG.items||{})[key]||{}).decos||[];}

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
  var act=activeDecos(vm.decos);
  var placeNames=act.map(function(d){var p=placeOf(item,d.pl);return p?p.label:'';}).filter(Boolean);
  var meth=act.length?(MLAB[act[0].method]||'Embroidery'):'Embroidered';
  var meta=item.sku+' · '+(placeNames.join(' + ')||'left chest');
  var topcol=CFG.pricing.cols[CFG.pricing.cols.length-1];
  var fromP=unitPrice(key,vm.decos,topcol);
  var rec=(key===CFG.feature||item.rec)?'<span class="mrec">Top pick</span>':'';
  var inkit=CART[key]?' inkit':'';
  return '<div class="mcard'+inkit+'" data-key="'+key+'" tabindex="0">'+rec+
    '<div class="mstage"><img class="g" src="'+o.g+'" alt="'+esc(item.name)+'" loading="lazy" decoding="async">'+o.lg+'</div>'+
    '<div class="mb"><h3>'+esc(item.name)+'</h3><div class="mmeta">'+esc(meta)+' · '+esc(meth)+'</div>'+
    '<div class="mdots">'+dots+'</div>'+
    '<div class="mfoot"><div class="mprice">from '+money(fromP)+' <small>ea</small></div>'+
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
     '<div class="herochips">'+chips+'</div>'+
     '<div class="herorow"><button class="herocta" id="addRec">★ Add the whole recommended kit</button>'+
     '<span class="herohint">or tap any item below to tweak it</span></div></div></section>'+
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
    card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openSheet(card.dataset.key);}});
  });
  var ar=document.getElementById('addRec');if(ar)ar.addEventListener('click',addRecommended);
  document.querySelectorAll('.tab').forEach(function(t){t.addEventListener('click',function(){
    document.querySelectorAll('.tab').forEach(function(x){x.classList.toggle('on',x===t);});
    var el=document.getElementById(t.dataset.t);if(el)window.scrollTo({top:el.getBoundingClientRect().top+window.pageYOffset-110,behavior:'smooth'});});});
  document.querySelectorAll('.mstage .g').forEach(function(im){if(im.complete)im.classList.add('ld');else im.addEventListener('load',function(){im.classList.add('ld');});});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeAll();});
}
var TT;
function toast(msg){var t=document.getElementById('toast'),m=document.getElementById('toastM');if(!t)return;if(m)m.textContent=msg||'Added to your kit';t.classList.add('on');clearTimeout(TT);TT=setTimeout(function(){t.classList.remove('on');},1900);}

/* ---------- item sheet ---------- */
var SH={key:null,colour:null,face:'front',D:{},qty:12};
function openSheet(key){
  var item=BYKEY[key],vm=vmOf(key),ex=CART[key],exmap={};
  if(ex&&ex.decos){ex.decos.forEach(function(d){exmap[d.pl]=d;});}
  SH={key:key,colour:(ex&&ex.colour)||vm.colour,face:'front',D:{},qty:(ex&&ex.qty)||moq()};
  (item.places||[]).forEach(function(p){if(!p.logo)return;
    var rd=(vm.decos||[]).filter(function(x){return x.pl===p.id;})[0]||{},use=exmap[p.id];
    SH.D[p.id]={on: ex?!!use:!!rd.on, lg:(use&&use.lg)||rd.lg||(CFG.logos[0]||{}).id,
                ink:(use&&use.ink)||rd.ink||'auto', method:(use&&use.method)||rd.method||'embroidery'};});
  renderSheet();
  document.getElementById('ov').classList.add('on');
  document.getElementById('sheet').classList.add('on');
  document.body.style.overflow='hidden';
}
function sheetDecos(){return Object.keys(SH.D).map(function(pl){var d=SH.D[pl];return {pl:pl,on:d.on,lg:d.lg,ink:d.ink,method:d.method};});}
function renderSheet(){
  var item=BYKEY[SH.key];
  var o=overlayHtml(item,{decos:sheetDecos()},SH.colour,SH.face);var hasBack=o.hasBack;
  var multi=CFG.logos.length>1;
  var chips=item.cols.map(function(c){return '<button class="cchip'+(c.name===SH.colour?' on':'')+'" data-col="'+esc(c.name)+'" style="background-image:url('+gurl(c.front)+')" title="'+esc(c.name)+'"></button>';}).join('');
  var scol=colOf(item,SH.colour);
  var rows=(item.places||[]).filter(function(p){return p.logo;}).map(function(p){
    var d=SH.D[p.id],na=(p.face==='back'&&!hasBack),Lsel=logoOf(d.lg);
    var eff=(d.ink&&d.ink!=='auto')?d.ink:autoInk(scol.rgb);
    var logos=multi?('<div class="dgrp"><span class="dcap">Logo</span><div class="dlogos">'+CFG.logos.map(function(L){return '<button class="dlg2'+(L.id===d.lg?' on':'')+'" data-pl="'+p.id+'" data-lg="'+L.id+'" title="'+esc(L.label||'Logo')+'" style="background-image:url('+(L.inks.dark||L.inks.brand)+')"></button>';}).join('')+'</div></div>'):'';
    var inks='<div class="dgrp"><span class="dcap">Colour</span><div class="dinks">'+inkOpts(Lsel).map(function(o){var stl=o[0]==='brand'?BRANDGRAD:('background:'+inkCss(o[0]));return '<button class="dink'+(o[0]===eff?' on':'')+'" data-pl="'+p.id+'" data-ink="'+o[0]+'" title="'+o[1]+'" style="'+stl+'"></button>';}).join('')+'</div></div>';
    var mp='<div class="dgrp"><span class="dcap">Method</span><div class="mpills">'+METHODS.map(function(m){return '<button class="mp'+(m===d.method?' on':'')+'" data-pl="'+p.id+'" data-m="'+m+'">'+MLAB[m]+'</button>';}).join('')+'</div></div>';
    return '<div class="drow'+(d.on?' on':'')+(na?' na':'')+'" data-pl="'+p.id+'">'+
      '<button class="dtog" data-pl="'+p.id+'"><span class="dck"></span>'+esc(p.label)+(na?' <em>— needs a colour with a back</em>':'')+'</button>'+
      '<div class="dctl">'+logos+inks+mp+'</div></div>';}).join('');
  var faceTog=hasBack?'<div class="chips ftog"><button class="pchip'+(SH.face==='front'?' on':'')+'" data-face="front">Front</button><button class="pchip'+(SH.face==='back'?' on':'')+'" data-face="back">Back</button></div>':'';
  var decos=sheetDecos();
  var unit=unitPrice(SH.key,decos,SH.qty),line=unit*SH.qty,topcol=CFG.pricing.cols[CFG.pricing.cols.length-1];
  var uM=unitPrice(SH.key,decos,moq()),uT=unitPrice(SH.key,decos,topcol);
  var sv=uM>0?Math.round((1-uT/uM)*100):0;
  var qh=money(unit)+' ea at '+SH.qty+' pcs'+(sv>0?' · <span class="save">save '+sv+'% at '+topcol+'+</span>':'');
  document.getElementById('sheet').innerHTML=
    '<div class="shimg" id="shimg"><button class="shx" id="shx">✕</button><div class="shstage"><img class="g" src="'+o.g+'" alt="">'+o.lg+'</div></div>'+
    '<div class="shb"><h2>'+esc(item.name)+'</h2><div class="shsku">'+esc(item.sku)+'</div>'+
    (item.blurb?'<p class="shblurb">'+esc(item.blurb)+'</p>':'')+faceTog+
    '<div class="optlbl">Colour <i>'+esc(SH.colour)+'</i></div><div class="chips" data-role="col">'+chips+'</div>'+
    '<div class="optlbl">Your logo — pick the spots &amp; decoration</div><div class="decos2">'+rows+'</div>'+
    '<div class="optlbl">Quantity <i>('+moq()+' minimum)</i></div>'+
    '<div class="qty"><button data-q="-1">–</button><input id="qin" type="number" inputmode="numeric" value="'+SH.qty+'" min="'+moq()+'"><button data-q="1">+</button></div>'+
    '<div class="qhint">'+qh+'</div>'+
    '<div class="shadd"><button class="shaddbtn" id="shAdd">'+(CART[SH.key]?'Update kit':'Add to kit')+'<span class="p">'+money(line)+'</span></button></div></div>';
  var sh=document.getElementById('sheet');
  document.getElementById('shx').addEventListener('click',closeAll);
  sh.querySelectorAll('.cchip').forEach(function(b){b.addEventListener('click',function(){SH.colour=b.dataset.col;swapPreview();renderSheet();});});
  sh.querySelectorAll('.dtog').forEach(function(b){b.addEventListener('click',function(){var pl=b.dataset.pl,p=placeOf(item,pl);if(p.face==='back'&&!colOf(item,SH.colour).back)return;SH.D[pl].on=!SH.D[pl].on;if(SH.D[pl].on)SH.face=(p.face==='back')?'back':'front';renderSheet();});});
  sh.querySelectorAll('.dlg2').forEach(function(b){b.addEventListener('click',function(){SH.D[b.dataset.pl].lg=b.dataset.lg;renderSheet();});});
  sh.querySelectorAll('.dink').forEach(function(b){b.addEventListener('click',function(){SH.D[b.dataset.pl].ink=b.dataset.ink;renderSheet();});});
  sh.querySelectorAll('.mp').forEach(function(b){b.addEventListener('click',function(){SH.D[b.dataset.pl].method=b.dataset.m;renderSheet();});});
  sh.querySelectorAll('[data-face]').forEach(function(b){b.addEventListener('click',function(){SH.face=b.dataset.face;renderSheet();});});
  sh.querySelectorAll('.qty button').forEach(function(b){b.addEventListener('click',function(){var step=parseInt(b.dataset.q,10)*(SH.qty<48?6:12);SH.qty=Math.max(moq(),SH.qty+step);renderSheet();});});
  document.getElementById('qin').addEventListener('change',function(e){SH.qty=Math.max(moq(),parseInt(e.target.value,10)||moq());renderSheet();});
  document.getElementById('shAdd').addEventListener('click',addFromSheet);
}
function swapPreview(){var im=document.getElementById('shimg');if(im){im.classList.add('sw');setTimeout(function(){im.classList.remove('sw');},220);}}
function addFromSheet(){
  var was=!!CART[SH.key],decos=[];
  Object.keys(SH.D).forEach(function(pl){var d=SH.D[pl];if(d.on)decos.push({pl:pl,lg:d.lg,ink:d.ink,method:d.method,on:true});});
  CART[SH.key]={qty:SH.qty,colour:SH.colour,decos:decos};
  saveCart();closeAll();refreshCartUI();
  toast((was?'Updated · ':'Added · ')+BYKEY[SH.key].name);
}
function addRecommended(){
  var order=CFG.order||{},keys=(order.office||[]).concat(order.field||[]),n=0;
  keys.forEach(function(k){if(CART[k]||!BYKEY[k])return;
    var vm=vmOf(k),decos=activeDecos(vm.decos).map(function(d){return {pl:d.pl,lg:d.lg,ink:d.ink||'auto',method:d.method||'embroidery',on:true};});
    if(!decos.length){var p=(BYKEY[k].places||[]).filter(function(x){return x.logo;})[0];if(p)decos=[{pl:p.id,lg:(CFG.logos[0]||{}).id,ink:'auto',method:(recDecos(k)[0]||{}).method||'embroidery',on:true}];}
    CART[k]={qty:moq(),colour:vm.colour,decos:decos};n++;});
  saveCart();refreshCartUI();openCart();
  toast(n?('Added '+n+' items — your recommended kit'):'Your kit already has everything');
}

/* ---------- cart ---------- */
function cartCount(){return Object.keys(CART).length;}
function cartSubtotal(){var t=0;Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it)return;var c=CART[k];t+=unitPrice(k,c.decos,c.qty)*c.qty;});return t;}
function cartSetup(){var t=0;Object.keys(CART).forEach(function(k){t+=setupFor(CART[k].decos);});return t;}
function decoSummary(it,c){return (c.decos||[]).map(function(d){var p=placeOf(it,d.pl);return (p?p.label:d.pl)+' ('+(MLAB[d.method]||'Emb')+')';}).join(' + ')||'left chest';}
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
    var unit=unitPrice(k,c.decos,c.qty);
    return '<div class="ci" data-key="'+k+'"><div class="t" style="background-image:url('+gurl(col.front)+')"></div>'+
      '<div class="d"><h4>'+esc(it.name)+'</h4><div class="sub">'+esc(c.colour)+' · '+esc(decoSummary(it,c))+'</div>'+
      '<div class="row"><div class="qty"><button data-q="-1">–</button><input class="ciq" type="number" value="'+c.qty+'" min="'+moq()+'"><button data-q="1">+</button></div>'+
      '<div class="lp">'+money(unit*c.qty)+'</div></div>'+
      '<div class="rm" data-rm="'+k+'">Remove</div></div></div>';}).join('');
  var body=keys.length?items:'<div class="cempty">Your kit is empty.<br>Tap any item to add it.</div>';
  var setup=cartSetup();
  document.getElementById('cart').innerHTML=
    '<div class="carth"><h2>Your kit</h2><button class="cartx" id="cartx">✕</button></div>'+
    '<div class="citems" id="citems">'+body+'</div>'+
    '<div class="cartf">'+
      '<div class="crow"><span>Estimated subtotal</span><b>'+money(sub)+'</b></div>'+
      (setup>0?'<div class="crow"><span>One-time setup (decoration)</span><span>'+money(setup)+'</span></div>':'')+
      '<div class="csetup">Decorated, per piece · screen print, embroidery &amp; heat-transfer priced in. Setup is one-time; reorders are garment + decoration only. Your exact itemised quote is confirmed before anything runs.</div>'+
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

/* ---------- checkout: copy-paste into the existing email thread ---------- */
function orderText(note){
  var lines=['MY KIT — '+CFG.client,''];
  Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it)return;var c=CART[k];var u=unitPrice(k,c.decos,c.qty);
    lines.push('• '+it.name+' ('+it.sku+') — '+c.colour+' · '+decoSummary(it,c)+' · qty '+c.qty+' @ '+money(u)+' ea = '+money(u*c.qty));});
  lines.push('','Estimated subtotal: '+money(cartSubtotal())+'   +   one-time setup: '+money(cartSetup()));
  lines.push('(Decoration priced in; exact quote to be confirmed.)');
  if(note)lines.push('','Notes: '+note);
  lines.push('','Kit link: '+location.href.split('#')[0].split('?')[0]);
  return lines.join('\n');
}
function openCheckout(){
  var review=Object.keys(CART).map(function(k){var it=BYKEY[k];if(!it)return '';var c=CART[k];
    return '<div class="r"><span>'+esc(it.name)+' · '+esc(c.colour)+' · '+esc(decoSummary(it,c))+' × '+c.qty+'</span><span>'+money(unitPrice(k,c.decos,c.qty)*c.qty)+'</span></div>';}).join('');
  document.getElementById('cart').innerHTML=
    '<div class="carth"><h2>Send us your kit</h2><button class="cartx" id="cartx">✕</button></div>'+
    '<div class="citems"><div class="co">'+
      '<p style="color:var(--mut);font-size:14px;line-height:1.55;margin:10px 0 8px">Copy your kit and <b>paste it into your reply to our email</b> — we\'ll send back an exact, itemised quote (usually same day).</p>'+
      '<div class="coreview">'+review+
        '<div class="r" style="border-top:1px solid var(--line);margin-top:4px;padding-top:8px"><span><b>Estimated subtotal</b></span><span><b>'+money(cartSubtotal())+'</b></span></div>'+
        '<div class="r"><span>One-time setup</span><span>'+money(cartSetup())+'</span></div></div>'+
      '<label>Anything to add? (optional)</label><textarea id="coNote" placeholder="Sizes, deadlines, other items…"></textarea>'+
    '</div></div>'+
    '<div class="cartf"><button class="checkout" id="copyKit">Copy my kit → paste into your reply</button>'+
      '<div class="csetup" id="copyHint" style="text-align:center;margin-top:10px">No new email needed — just paste it into the thread we\'re already on.</div></div>';
  document.getElementById('cartx').addEventListener('click',closeAll);
  document.getElementById('copyKit').addEventListener('click',copyKit);
}
function copyKit(){
  var note=(document.getElementById('coNote')&&document.getElementById('coNote').value||'').trim();
  var txt=orderText(note);
  var btn=document.getElementById('copyKit'),hint=document.getElementById('copyHint');
  function done(){if(btn){btn.textContent='✓ Copied — now paste into your reply';}if(hint){hint.innerHTML='Copied to your clipboard. Switch to our email thread and paste (Ctrl/⌘+V) into your reply.';}}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,function(){fallback(txt);done();});}
  else{fallback(txt);done();}
  function fallback(s){var ta=document.createElement('textarea');ta.value=s;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);}
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
