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
// Method-aware default ink. EMBROIDERY is full-colour thread — it should always render the full-colour
// (brand) logo, on light OR dark garments; that's how real embroidery looks. Screen/heat-transfer default
// to a contrast ink (white on dark, full colour on light) since a single spot print needs to read.
function autoInkFor(method,rgb){return method==='embroidery' ? 'brand' : autoInk(rgb);}
function money(x){return '$'+Number(x||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});}
function logoOf(id){for(var i=0;i<CFG.logos.length;i++)if(CFG.logos[i].id===id)return CFG.logos[i];return CFG.logos[0]||{inks:{}};}
function inkUrl(logo,ink,col,method){var t=(ink&&ink!=='auto')?ink:autoInkFor(method,col&&col.rgb);return logo.inks[t]||logo.inks.brand;}
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
function screenPc(colours){var r=CFG.rates||{},sc=r.screenc||{};return sc[String(colours||1)]||r.screen||0.75;}
// per-piece decoration cost: screen scales by ink colours; embroidery scales up for oversized (full-back) placements
function decoCost(d,item){var r=CFG.rates||{};
  if(d.method==='screen')return screenPc(d.colours||1);
  if(d.method==='heat_transfer')return r.ht||0;
  var p=item?placeOf(item,d.pl):null,mult=(p&&p.face==='back')?((r.emb_mult&&r.emb_mult.back)||1):1;
  return (r.emb||0)*mult;}
function markup(q){var r=CFG.rates||{},mg=r.margin||[],m=(mg[0]&&mg[0][1])||2;mg.forEach(function(t){if(q>=t[0])m=t[1];});return m;}
function activeDecos(decos){return (decos||[]).filter(function(d){return d.on;});}
function unitPrice(key,decos,q){var r=CFG.rates;if(!r||!r.margin){return unitAt(BYKEY[key],q);}
  var item=BYKEY[key],c=blankOf(key);activeDecos(decos).forEach(function(d){c+=decoCost(d,item);});return Math.round(c*markup(q)*100)/100;}
function methodSetup(m,s){return m==='screen'?(s.screen||0):m==='heat_transfer'?(s.heat_transfer||0):(s.embroidery||0);}
// A setup is charged ONCE per unique DESIGN + LOCATION + METHOD across the WHOLE kit (a stitch file /
// set of screens / transfer is reused on every garment & quantity). Screens also depend on ink colour,
// so screen keys include the ink; embroidery & heat-transfer are ink/thread-colour agnostic.
function setupKey(d){return d.method==='screen' ? ('scr|'+d.lg+'|'+d.pl+'|'+(d.ink||'auto')) : (d.method+'|'+d.lg+'|'+d.pl);}
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
    var L=logoOf(d.lg),src=inkUrl(L,d.ink,col,d.method);
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
  var heroart=(CFG.heroes||[]).slice(0,3).map(function(h){return '<div class="ha"><img src="'+h+'" alt="" loading="eager" decoding="async"></div>';}).join('');
  var html=''+
   '<header class="hdr"><div class="w hdrin"><span class="brand"><img src="'+(CFG.cover_logo||'img/logo-white.png')+'" onerror="this.style.display=\'none\'" alt=""><b>'+esc(CFG.client)+'</b> <i>×</i> Just Deals</span>'+
     '<button class="cartbtn" id="openCart"><span class="lbl">Your kit</span> <span class="n" id="cartN">0</span></button></div></header>'+
   '<section class="hero"><div class="w heroin"><div class="eyb">Recommended kit · ready to order</div>'+
     '<h1>'+esc(CFG.client)+"'s branded apparel — your logo, already on it.</h1>"+
     '<div class="herochips">'+chips+'</div>'+
     '<div class="herorow"><button class="herocta" id="addRec">★ Add the whole recommended kit</button>'+
     '<span class="herohint">or tap any item below to pick colour &amp; quantity</span></div>'+
     (heroart?'<div class="heroart">'+heroart+'</div>':'')+'</div></section>'+
   ((office&&field)?('<nav class="tabs"><div class="w tabsin"><button class="tab on" data-t="sec-office">Office &amp; client-facing</button><button class="tab" data-t="sec-field">Job-site &amp; hi-vis</button></div></nav>'):'')+
   '<main class="w">'+
     (office?'<section class="sec" id="sec-office"><div class="seclbl">Office &amp; client-facing</div><div class="menu">'+office+'</div></section>':'')+
     (field?'<section class="sec" id="sec-field"><div class="seclbl">Job-site &amp; hi-vis <span class="csa">CSA-rated</span></div><div class="menu">'+field+'</div></section>':'')+
   '</main>'+
   (C.feed?('<section class="social"><div class="w"><div class="seclbl">Recent work — straight from our shop floor</div>'+
     '<p class="socsub">'+esc(C.work_lead||'Real kits we’ve decorated for crews across the country.')+'</p>'+
     '<behold-widget feed-id="'+esc(C.feed)+'"></behold-widget></div></section>'):'')+
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
  // Add button = one-tap add of the recommended setup (fast path). Once in the kit, it opens the
  // customiser to adjust. stopPropagation so it doesn't also trigger the card's open-sheet.
  document.querySelectorAll('.madd').forEach(function(b){b.addEventListener('click',function(e){
    e.stopPropagation();var k=b.dataset.key;if(CART[k]){openSheet(k);}else{quickAdd(k);}});});
  var ar=document.getElementById('addRec');if(ar)ar.addEventListener('click',addRecommended);
  document.querySelectorAll('.tab').forEach(function(t){t.addEventListener('click',function(){
    document.querySelectorAll('.tab').forEach(function(x){x.classList.toggle('on',x===t);});
    var el=document.getElementById(t.dataset.t);if(el)window.scrollTo({top:el.getBoundingClientRect().top+window.pageYOffset-110,behavior:'smooth'});});});
  document.querySelectorAll('.mstage .g').forEach(function(im){if(im.complete)im.classList.add('ld');else im.addEventListener('load',function(){im.classList.add('ld');});});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeAll();});
  // Instagram social proof (Behold) — load the widget module once when a feed is configured.
  if(C.feed&&!document.getElementById('beholdjs')){var bs=document.createElement('script');bs.id='beholdjs';bs.type='module';bs.src='https://w.behold.so/widget.js';document.head.appendChild(bs);}
}
var TT;
function toast(msg){var t=document.getElementById('toast'),m=document.getElementById('toastM');if(!t)return;if(m)m.textContent=msg||'Added to your kit';t.classList.add('on');clearTimeout(TT);TT=setTimeout(function(){t.classList.remove('on');},1900);}

/* ---------- item sheet ---------- */
var SH={key:null,colour:null,face:'front',D:{},qty:12};
function openSheet(key){
  var item=BYKEY[key],vm=vmOf(key),ex=CART[key],exmap={};
  if(ex&&ex.decos){ex.decos.forEach(function(d){exmap[d.pl]=d;});}
  SH={key:key,colour:(ex&&ex.colour)||vm.colour,face:'front',D:{},qty:(ex&&ex.qty)||moq(),edit:false};
  (item.places||[]).forEach(function(p){if(!p.logo)return;
    var rd=(vm.decos||[]).filter(function(x){return x.pl===p.id;})[0]||{},use=exmap[p.id];
    SH.D[p.id]={on: ex?!!use:!!rd.on, lg:(use&&use.lg)||rd.lg||(CFG.logos[0]||{}).id,
                ink:(use&&use.ink)||rd.ink||'auto', method:(use&&use.method)||rd.method||'embroidery',
                colours:(use&&use.colours)||rd.colours||1};});
  renderSheet();
  document.getElementById('ov').classList.add('on');
  document.getElementById('sheet').classList.add('on');
  document.body.style.overflow='hidden';
}
function sheetDecos(){return Object.keys(SH.D).map(function(pl){var d=SH.D[pl];return {pl:pl,on:d.on,lg:d.lg,ink:d.ink,method:d.method,colours:d.colours};});}
/* The popular decoration variations we quote on every logo location. Embroidery = full-colour
   stitch; screen print in 1- or 2-colour; heat transfer = full colour. Each is priced live from
   the shared rate card so the customer can compare finishes and pick the design + price they want. */
var METHOD_OPTS=[
  {m:'embroidery',c:1,lab:'Embroidery',sub:'full-colour stitch'},
  {m:'screen',c:1,lab:'Screen · 1-colour',sub:'one ink'},
  {m:'screen',c:2,lab:'Screen · 2-colour',sub:'two inks'},
  {m:'heat_transfer',c:1,lab:'Heat transfer',sub:'full colour'}
];
function decoIsSel(pl,opt){var d=SH.D[pl];if(!d||!d.on||d.method!==opt.m)return false;return opt.m!=='screen'||(d.colours||1)===opt.c;}
// Per-piece price if placement `pl` used decoration `opt` (holding every other placement as-is).
function priceIf(pl,opt,on){
  var decos=sheetDecos().map(function(d){return d.pl===pl?{pl:pl,on:on,lg:d.lg,ink:'auto',method:opt.m,colours:opt.c}:d;});
  return unitPrice(SH.key,decos,SH.qty);
}
function methodChips(item,p,primary){
  var chips='';
  if(!primary){chips+='<button class="mchip'+(SH.D[p.id].on?'':' on')+'" data-pl="'+p.id+'" data-off="1"><b>None</b><span class="ms">skip this spot</span></button>';}
  METHOD_OPTS.forEach(function(opt){
    var sel=decoIsSel(p.id,opt),u=priceIf(p.id,opt,true);
    chips+='<button class="mchip'+(sel?' on':'')+'" data-pl="'+p.id+'" data-m="'+opt.m+'" data-c="'+opt.c+'">'+
      '<b>'+opt.lab+'</b><span class="ms">'+opt.sub+'</span><span class="mprc">'+money(u)+' <i>ea</i></span></button>';
  });
  return chips;
}
function renderSheet(){
  var item=BYKEY[SH.key];
  var o=overlayHtml(item,{decos:sheetDecos()},SH.colour,SH.face);var hasBack=o.hasBack;
  var chips=item.cols.map(function(c){return '<button class="cchip'+(c.name===SH.colour?' on':'')+'" data-col="'+esc(c.name)+'" style="background-image:url('+gurl(c.front)+')" title="'+esc(c.name)+'"></button>';}).join('');
  var faceTog=hasBack?'<div class="chips ftog"><button class="pchip'+(SH.face==='front'?' on':'')+'" data-face="front">Front</button><button class="pchip'+(SH.face==='back'?' on':'')+'" data-face="back">Back</button></div>':'';
  var logoPlaces=(item.places||[]).filter(function(p){return p.logo;});
  var primaryId=(logoPlaces[0]||{}).id;
  var decoBlocks=logoPlaces.map(function(p){var primary=p.id===primaryId;
    return '<div class="decoblk"><div class="optlbl">'+esc(p.label)+' <i>'+(primary?'included':'optional add-on')+'</i></div>'+
      '<div class="mchips">'+methodChips(item,p,primary)+'</div></div>';}).join('');
  var decos=sheetDecos();
  var unit=unitPrice(SH.key,decos,SH.qty),line=unit*SH.qty,tiers=CFG.pricing.cols||[12],topcol=tiers[tiers.length-1];
  var ptable=tiers.map(function(t,i){var u=unitPrice(SH.key,decos,t);
    var on=SH.qty>=t&&(i===tiers.length-1||SH.qty<tiers[i+1]);
    return '<button class="pt'+(on?' on':'')+'" data-t="'+t+'"><span>'+t+'+ pcs</span><b>'+money(u)+'</b><i>ea</i></button>';}).join('');
  var uM=unitPrice(SH.key,decos,moq()),uT=unitPrice(SH.key,decos,topcol);
  var sv=uM>0?Math.round((1-uT/uM)*100):0;
  // Customer chooses COLOUR + DECORATION FINISH (priced live) + QUANTITY. Mockup shows a
  // representative finish; the price always reflects the finish + quantity they pick.
  document.getElementById('sheet').innerHTML=
    '<div class="shimg" id="shimg"><button class="shx" id="shx">✕</button><div class="shstage"><img class="g" src="'+o.g+'" alt="">'+o.lg+'</div></div>'+
    '<div class="shb"><h2>'+esc(item.name)+'</h2><div class="shsku">'+esc(item.sku)+'</div>'+
    (item.blurb?'<p class="shblurb">'+esc(item.blurb)+'</p>':'')+faceTog+
    '<div class="optlbl">Colour <i>'+esc(SH.colour)+'</i></div><div class="chips" data-role="col">'+chips+'</div>'+
    '<div class="decohd">Decoration &amp; price <span class="dhint">tap to compare finishes</span></div>'+
    decoBlocks+
    '<div class="optlbl">Quantity <i>('+moq()+' min · price drops at each tier)</i></div>'+
    '<div class="qty"><button data-q="-1">–</button><input id="qin" type="number" inputmode="numeric" value="'+SH.qty+'" min="'+moq()+'"><button data-q="1">+</button></div>'+
    '<div class="ptable">'+ptable+'</div>'+
    (sv>0?'<div class="qhint"><span class="save">Save '+sv+'% per piece at '+topcol+'+</span></div>':'')+
    '<div class="shadd"><button class="shaddbtn" id="shAdd">'+(CART[SH.key]?'Update kit':'Add to kit')+'<span class="p">'+money(line)+'</span></button></div>'+
    '<div class="shnote">Price includes the decoration shown. One-time setup (stitch file / screens) is added once per design and shared across your whole kit — reorders are garment + decoration only. Custom placement or size? Just tell us at checkout.</div></div>';
  var sh=document.getElementById('sheet');
  document.getElementById('shx').addEventListener('click',closeAll);
  sh.querySelectorAll('.cchip').forEach(function(b){b.addEventListener('click',function(){SH.colour=b.dataset.col;swapPreview();renderSheet();});});
  sh.querySelectorAll('[data-face]').forEach(function(b){b.addEventListener('click',function(){SH.face=b.dataset.face;renderSheet();});});
  sh.querySelectorAll('.mchip').forEach(function(b){b.addEventListener('click',function(){var pl=b.dataset.pl;
    if(b.dataset.off){SH.D[pl].on=false;}
    else{var chg=SH.D[pl].method!==b.dataset.m;SH.D[pl].on=true;SH.D[pl].method=b.dataset.m;SH.D[pl].colours=parseInt(b.dataset.c,10)||1;if(chg)SH.D[pl].ink='auto';
      var p=placeOf(item,pl);if(p&&(p.face||'front')!==SH.face&&hasBack)SH.face=p.face||'front';}
    swapPreview();renderSheet();});});
  sh.querySelectorAll('.pt').forEach(function(b){b.addEventListener('click',function(){SH.qty=Math.max(moq(),parseInt(b.dataset.t,10)||moq());renderSheet();});});
  sh.querySelectorAll('.qty button').forEach(function(b){b.addEventListener('click',function(){var step=parseInt(b.dataset.q,10)*(SH.qty<48?6:12);SH.qty=Math.max(moq(),SH.qty+step);renderSheet();});});
  document.getElementById('qin').addEventListener('change',function(e){SH.qty=Math.max(moq(),parseInt(e.target.value,10)||moq());renderSheet();});
  document.getElementById('shAdd').addEventListener('click',addFromSheet);
}
function swapPreview(){var im=document.getElementById('shimg');if(im){im.classList.add('sw');setTimeout(function(){im.classList.remove('sw');},220);}}
function addFromSheet(){
  var was=!!CART[SH.key],decos=[];
  Object.keys(SH.D).forEach(function(pl){var d=SH.D[pl];if(d.on)decos.push({pl:pl,lg:d.lg,ink:d.ink,method:d.method,colours:d.colours||1,on:true});});
  CART[SH.key]={qty:SH.qty,colour:SH.colour,decos:decos};
  saveCart();closeAll();refreshCartUI();
  toast((was?'Updated · ':'Added · ')+BYKEY[SH.key].name);
}
// Recommended decoration for one item, as cart-ready deco objects (used by quick-add + add-whole-kit).
function recCartDecos(key){
  var vm=vmOf(key),decos=activeDecos(vm.decos).map(function(d){return {pl:d.pl,lg:d.lg,ink:d.ink||'auto',method:d.method||'embroidery',colours:d.colours||1,on:true};});
  if(!decos.length){var p=(BYKEY[key].places||[]).filter(function(x){return x.logo;})[0];if(p)decos=[{pl:p.id,lg:(CFG.logos[0]||{}).id,ink:'auto',method:(recDecos(key)[0]||{}).method||'embroidery',colours:1,on:true}];}
  return decos;
}
// One-tap add of an item with its recommended decoration + default colour + minimum qty. The fast path:
// a customer can build the whole kit without ever opening the customiser.
function quickAdd(key){
  if(!BYKEY[key])return;var vm=vmOf(key),ex=CART[key];
  CART[key]={qty:(ex&&ex.qty)||moq(),colour:(ex&&ex.colour)||vm.colour,decos:recCartDecos(key)};
  saveCart();refreshCartUI();toast('Added · '+BYKEY[key].name);
}
function addRecommended(){
  var order=CFG.order||{},keys=(order.office||[]).concat(order.field||[]),n=0;
  keys.forEach(function(k){if(CART[k]||!BYKEY[k])return;
    CART[k]={qty:moq(),colour:vmOf(k).colour,decos:recCartDecos(k)};n++;});
  saveCart();refreshCartUI();openCart();
  toast(n?('Added '+n+' items — your recommended kit'):'Your kit already has everything');
}
// Plain-language decoration summary of the CURRENT sheet state (for the collapsed "Your logo" line).
function inkLabel(v){return v==='brand'?'full colour':v==='white'?'white':(v==='dark'||v==='black')?'black':'brand colour';}
function shSummary(){
  var item=BYKEY[SH.key],act=Object.keys(SH.D).filter(function(pl){return SH.D[pl].on;});
  if(!act.length)return 'No logo yet';
  var scol=colOf(item,SH.colour);
  // Per-placement + method so mixed-method items (embroidered front + printed back) read accurately.
  var parts=act.map(function(pl){var p=placeOf(item,pl),d=SH.D[pl];
    var m=d.method==='screen'?'screen print':d.method==='heat_transfer'?'heat transfer':'embroidered';
    return (p?p.label:pl)+' · '+m;});
  var d0=SH.D[act[0]],eff=(d0.ink&&d0.ink!=='auto')?d0.ink:autoInkFor(d0.method,scol.rgb);
  var tail=(act.length===1&&d0.method==='embroidery')?(' · '+inkLabel(eff)):'';
  return parts.join('  +  ')+tail;
}

/* ---------- cart ---------- */
function cartCount(){return Object.keys(CART).length;}
function cartSubtotal(){var t=0;Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it)return;var c=CART[k];t+=unitPrice(k,c.decos,c.qty)*c.qty;});return t;}
// Itemised setup lines — one per unique DESIGN+LOCATION+METHOD across the whole kit (screen keyed by ink,
// and a screen = one burn PER colour). Single source of truth: cartSetup sums this so the numbers always agree.
function setupBreakdown(){var r=CFG.rates||{},s=r.setup||{},seen={},out=[];
  Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it)return;(CART[k].decos||[]).forEach(function(d){if(!d.on)return;
    var key=setupKey(d);if(seen[key])return;seen[key]=1;
    var L=logoOf(d.lg),p=placeOf(it,d.pl),plab=p?p.label:d.pl,lname=(L&&L.label)||'Logo',amt,lab;
    if(d.method==='screen'){var c=d.colours||1;amt=(s.screen||0)*c;lab=lname+' · '+plab+' · screen ('+c+'-colour, '+c+(c>1?' screens':' screen')+')';}
    else if(d.method==='heat_transfer'){amt=s.heat_transfer||0;lab=lname+' · '+plab+' · heat-transfer artwork';}
    else{amt=s.embroidery||0;lab=lname+' · '+plab+' · embroidery digitizing';}
    out.push({label:lab,amount:Math.round(amt*100)/100});});});
  return out;}
function cartSetup(){return Math.round(setupBreakdown().reduce(function(t,x){return t+x.amount;},0)*100)/100;}
function decoSummary(it,c){return (c.decos||[]).map(function(d){var p=placeOf(it,d.pl),m=MLAB[d.method]||'Emb';if(d.method==='screen')m+=' '+(d.colours||1)+'C';return (p?p.label:d.pl)+' ('+m+')';}).join(' + ')||'left chest';}
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
  var setupRows=setupBreakdown(),setup=setupRows.reduce(function(t,x){return t+x.amount;},0);
  var brk=setupRows.length?('<div class="setupbrk">'+setupRows.map(function(x){return '<div class="sbk"><span>'+esc(x.label)+'</span><span>'+money(x.amount)+'</span></div>';}).join('')+'</div>'):'';
  document.getElementById('cart').innerHTML=
    '<div class="carth"><h2>Your kit</h2><button class="cartx" id="cartx">✕</button></div>'+
    '<div class="citems" id="citems">'+body+'</div>'+
    '<div class="cartf">'+
      '<div class="crow"><span>Estimated subtotal</span><b>'+money(sub)+'</b></div>'+
      (setup>0?'<div class="crow"><span>One-time setup <i style="color:var(--mut);font-weight:600;font-style:normal">· once per design, shared across the kit</i></span><span>'+money(setup)+'</span></div>'+brk:'')+
      '<div class="csetup">Decorated, per piece · screen print, embroidery &amp; heat-transfer priced in. Setup is charged once per logo &amp; location and reused across every item — reorders are garment + decoration only. Your exact itemised quote is confirmed before anything runs.</div>'+
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
  lines.push('','Estimated subtotal: '+money(cartSubtotal()));
  var sb=setupBreakdown();
  if(sb.length){lines.push('One-time setup: '+money(cartSetup())+'  (once per design, shared across the kit)');
    sb.forEach(function(x){lines.push('   - '+x.label+': '+money(x.amount));});}
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
        '<div class="r"><span>One-time setup</span><span>'+money(cartSetup())+'</span></div>'+
        setupBreakdown().map(function(x){return '<div class="r sbk"><span>'+esc(x.label)+'</span><span>'+money(x.amount)+'</span></div>';}).join('')+'</div>'+
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
