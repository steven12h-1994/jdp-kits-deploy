/* JDP Storefront — "Uber Eats for branded apparel".
   A photo-forward menu of the recommended picks from client.json + the shared catalogue, a dead-simple
   one-screen item customiser (colour → logo finish → quantity), a cart, and a one-tap copy-to-email quote.
   Choices persist on the device (localStorage). Deployed once at /kits/_app/store.js. */
(function(){
document.documentElement.classList.add('js');
var CATALOG_BASE="https://justdealspromotions.com/kits/_catalog";
var CFG,CAT,BYKEY={},CART={},SLUG=(location.pathname.split('/').filter(Boolean).pop()||'kit');
var LSKEY='jdpkit_'+SLUG;

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function hexLum(h){h=(h||'').replace('#','');if(h.length<6)return 128;return 0.299*parseInt(h.slice(0,2),16)+0.587*parseInt(h.slice(2,4),16)+0.114*parseInt(h.slice(4,6),16);}
function autoInk(rgb){return hexLum(rgb)<120?'white':'brand';}
// EMBROIDERY = full-colour thread -> always render the full-colour (brand) logo. Screen/heat-transfer
// default to a contrast ink (white on dark, full colour on light) since a single spot print must read.
function autoInkFor(method,rgb){return method==='embroidery' ? 'brand' : autoInk(rgb);}
function money(x){return '$'+Number(x||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});}
function money0(x){return '$'+Math.round(Number(x||0)).toLocaleString('en-CA');}
function logoOf(id){for(var i=0;i<CFG.logos.length;i++)if(CFG.logos[i].id===id)return CFG.logos[i];return CFG.logos[0]||{inks:{}};}
function inkUrl(logo,ink,col,method){var t=(ink&&ink!=='auto')?ink:autoInkFor(method,col&&col.rgb);return logo.inks[t]||logo.inks.brand;}
function gurl(f){return CFG.catalog_base+'/img/'+f;}
function colOf(item,name){for(var i=0;i<item.cols.length;i++)if(item.cols[i].name===name)return item.cols[i];return item.cols[0];}
function placeOf(item,pid){for(var i=0;i<item.places.length;i++)if(item.places[i].id===pid)return item.places[i];return null;}
function vmOf(key){return (CFG.items||{})[key]||{colour:(BYKEY[key].cols[0]||{}).name,decos:[]};}
function unitAt(item,q){var cs=CFG.pricing.cols,pr=item.prices,i=0;for(var k=0;k<cs.length;k++){if(q>=cs[k])i=k;}return pr[i];}
function moq(){return (CFG.pricing.cols&&CFG.pricing.cols[0])||12;}
/* ---- decoration-aware pricing (mirrors the server rate card) ---- */
var MLAB={embroidery:'Embroidery',screen:'Screen print',heat_transfer:'Heat transfer'};
function blankOf(key){var r=CFG.rates||{};return (r.blank&&r.blank[key]!=null)?r.blank[key]:((BYKEY[key]||{}).blank||0);}
function screenPc(colours){var r=CFG.rates||{},sc=r.screenc||{};return sc[String(colours||1)]||r.screen||0.75;}
function decoCost(d,item){var r=CFG.rates||{};
  if(d.method==='screen')return screenPc(d.colours||1);
  if(d.method==='heat_transfer')return r.ht||0;
  var p=item?placeOf(item,d.pl):null,mult=(p&&p.face==='back')?((r.emb_mult&&r.emb_mult.back)||1):1;
  return (r.emb||0)*mult;}
function markup(q){var r=CFG.rates||{},mg=r.margin||[],m=(mg[0]&&mg[0][1])||2;mg.forEach(function(t){if(q>=t[0])m=t[1];});return m;}
function activeDecos(decos){return (decos||[]).filter(function(d){return d.on;});}
function unitPrice(key,decos,q){var r=CFG.rates;if(!r||!r.margin){return unitAt(BYKEY[key],q);}
  var item=BYKEY[key],c=blankOf(key);activeDecos(decos).forEach(function(d){c+=decoCost(d,item);});return Math.round(c*markup(q)*100)/100;}
// A setup is charged ONCE per unique DESIGN+LOCATION+METHOD across the whole kit (a stitch file / set of
// screens is reused on every garment & quantity). Screens also depend on ink colour, so screen keys include ink.
function setupKey(d){return d.method==='screen' ? ('scr|'+d.lg+'|'+d.pl+'|'+(d.ink||'auto')) : (d.method+'|'+d.lg+'|'+d.pl);}
function recDecos(key){return ((CFG.items||{})[key]||{}).decos||[];}

/* ---------- persistence ---------- */
function loadCart(){try{CART=JSON.parse(localStorage.getItem(LSKEY))||{};}catch(e){CART={};}}
function saveCart(){try{localStorage.setItem(LSKEY,JSON.stringify(CART));}catch(e){}}

/* ---------- overlay (garment photo + logo at a placement) ---------- */
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

/* ---------- menu card (photo-forward, one + button) ---------- */
function menuCard(key){
  var item=BYKEY[key],vm=vmOf(key);if(!item)return '';
  var o=overlayHtml(item,vm,vm.colour,'front');
  var ncol=item.cols.length;
  var topcol=CFG.pricing.cols[CFG.pricing.cols.length-1];
  var fromP=unitPrice(key,vm.decos,topcol);
  var rec=(key===CFG.feature||item.rec)?'<span class="mrec">★ Top pick</span>':'';
  var q=CART[key]?CART[key].qty:0;
  var inkit=q?' inkit':'';
  var addlbl=q?('<b>'+q+'</b>'):'+';
  return '<article class="mcard'+inkit+'" data-key="'+key+'" tabindex="0" role="button" aria-label="'+esc(item.name)+'">'+
    '<div class="mstage">'+rec+'<img class="g" src="'+o.g+'" alt="'+esc(item.name)+'" loading="lazy" decoding="async">'+o.lg+
      '<button class="madd'+(q?' has':'')+'" data-key="'+key+'" aria-label="'+(q?'Edit ':'Add ')+esc(item.name)+'">'+addlbl+'</button></div>'+
    '<div class="mb"><h3>'+esc(item.name)+'</h3>'+
      '<div class="mmeta">'+esc(item.sku)+' · '+ncol+' colours</div>'+
      '<div class="mprice">from <b>'+money(fromP)+'</b> <small>/pc</small></div></div></article>';
}

/* ---------- build page ---------- */
function catName(id){return id==='office'?'Office &amp; client-facing':'Job-site &amp; hi-vis';}
function buildStore(){
  var C=CFG.copy||{};
  var order=CFG.order||{};
  var cats=[];
  if((order.office||[]).length)cats.push('office');
  if((order.field||[]).length)cats.push('field');
  var recN=(order.office||[]).concat(order.field||[]).filter(function(k){return BYKEY[k];}).length;
  var sections=cats.map(function(cat){
    var keys=(cat==='office'?order.office:order.field)||[];
    var cards=keys.map(menuCard).join('');
    var csa=cat==='field'?' <span class="csa">CSA-rated</span>':'';
    return '<section class="sec" id="sec-'+cat+'"><h2 class="seclbl">'+catName(cat)+csa+'</h2><div class="menu">'+cards+'</div></section>';
  }).join('');
  var catbar=cats.length>1?('<nav class="catbar" id="catbar"><div class="w catin">'+
    cats.map(function(c,i){return '<button class="cpill'+(i===0?' on':'')+'" data-t="sec-'+c+'">'+catName(c)+'</button>';}).join('')+'</div></nav>'):'';
  var html=''+
   '<header class="hdr"><div class="w hdrin">'+
     '<span class="brand"><img src="'+(CFG.cover_logo||'img/logo-white.png')+'" onerror="this.style.display=\'none\'" alt=""><b>'+esc(CFG.client)+'</b><i>× Just Deals</i></span>'+
     '<button class="cartbtn" id="openCart"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/></svg>'+
       '<span class="lbl">Your kit</span><span class="n" id="cartN">0</span></button></div></header>'+
   '<section class="hero"><div class="w heroin">'+
     '<div class="eyb">Branded apparel · ready to order</div>'+
     '<h1>'+esc(CFG.client)+"'s team store</h1>"+
     '<p class="herosub">Your logo, already on it. Pick your pieces, choose a finish, and send it over for a free proof &amp; exact quote — no obligation.</p>'+
     (recN?'<button class="reccta" id="addRec">★ Add the recommended kit <span>'+recN+' pieces</span></button>':'')+
   '</div></section>'+
   catbar+
   '<main class="w">'+sections+'</main>'+
   (C.feed?('<section class="social"><div class="w"><h2 class="seclbl">Recent work — from our shop floor</h2>'+
     '<p class="socsub">'+esc(C.work_lead||'Real kits we’ve decorated for crews across the country.')+'</p>'+
     '<behold-widget feed-id="'+esc(C.feed)+'"></behold-widget></div></section>'):'')+
   '<footer><div class="w">Just Deals Promotions · Branded Workwear &amp; Safety Apparel<br>Prepared for '+esc(CFG.client)+' · Concept mockups on representative product photography · Pricing confirmed by exact quote.</div></footer>'+
   '<div class="ov" id="ov"></div>'+
   '<div class="sheet" id="sheet"></div>'+
   '<aside class="cart" id="cart"></aside>'+
   '<div class="cbar" id="cbar"><div class="cbarin w"><div class="cbarL"><span class="n" id="cbarN">0</span> in your kit</div>'+
     '<button class="cbarbtn" id="openCart2">View kit <span class="p" id="cbarP"></span> <span class="ar">→</span></button></div></div>'+
   '<div class="toast" id="toast"><span class="k">✓</span><span id="toastM">Added</span></div>';
  document.getElementById('app').innerHTML=html;
  document.getElementById('openCart').addEventListener('click',openCart);
  document.getElementById('openCart2').addEventListener('click',openCart);
  document.getElementById('ov').addEventListener('click',closeAll);
  document.querySelectorAll('.mcard').forEach(function(card){
    card.addEventListener('click',function(){openSheet(card.dataset.key);});
    card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openSheet(card.dataset.key);}});
  });
  // "+" on a card = one-tap add of the recommended setup; if already in the kit, open the customiser.
  document.querySelectorAll('.madd').forEach(function(b){b.addEventListener('click',function(e){
    e.stopPropagation();var k=b.dataset.key;if(CART[k]){openSheet(k);}else{quickAdd(k);}});});
  var ar=document.getElementById('addRec');if(ar)ar.addEventListener('click',addRecommended);
  // category pills: click to scroll; scroll-spy to highlight
  var pills=[].slice.call(document.querySelectorAll('.cpill'));
  pills.forEach(function(t){t.addEventListener('click',function(){
    var el=document.getElementById(t.dataset.t);if(el)window.scrollTo({top:el.getBoundingClientRect().top+window.pageYOffset-118,behavior:'smooth'});});});
  if(pills.length){window.addEventListener('scroll',function(){
    var best=null,bt=1e9;pills.forEach(function(t){var el=document.getElementById(t.dataset.t);if(!el)return;var d=Math.abs(el.getBoundingClientRect().top-130);if(d<bt){bt=d;best=t;}});
    pills.forEach(function(t){t.classList.toggle('on',t===best);});},{passive:true});}
  document.querySelectorAll('.mstage .g').forEach(function(im){if(im.complete)im.classList.add('ld');else im.addEventListener('load',function(){im.classList.add('ld');});});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeAll();});
  if(C.feed&&!document.getElementById('beholdjs')){var bs=document.createElement('script');bs.id='beholdjs';bs.type='module';bs.src='https://w.behold.so/widget.js';document.head.appendChild(bs);}
}
var TT;
function toast(msg){var t=document.getElementById('toast'),m=document.getElementById('toastM');if(!t)return;if(m)m.textContent=msg||'Added to your kit';t.classList.add('on');clearTimeout(TT);TT=setTimeout(function(){t.classList.remove('on');},1900);}

/* ---------- item customiser (one clean screen) ---------- */
var SH={key:null,colour:null,face:'front',D:{},qty:12,showExtra:false};
var METHOD_OPTS=[
  {m:'embroidery',c:1,lab:'Embroidery',sub:'full-colour stitched'},
  {m:'screen',c:1,lab:'Screen print · 1 colour',sub:'one ink'},
  {m:'screen',c:2,lab:'Screen print · 2 colour',sub:'two inks'},
  {m:'heat_transfer',c:1,lab:'Heat transfer',sub:'full colour'}
];
function openSheet(key){
  var item=BYKEY[key],vm=vmOf(key),ex=CART[key],exmap={};
  if(ex&&ex.decos){ex.decos.forEach(function(d){exmap[d.pl]=d;});}
  SH={key:key,colour:(ex&&ex.colour)||vm.colour,face:'front',D:{},qty:(ex&&ex.qty)||moq(),showExtra:false};
  var logoPlaces=(item.places||[]).filter(function(p){return p.logo;}),primaryId=(logoPlaces[0]||{}).id;
  logoPlaces.forEach(function(p){
    var rd=(vm.decos||[]).filter(function(x){return x.pl===p.id;})[0]||{},use=exmap[p.id];
    var on = p.id===primaryId ? true : (ex?!!use:!!rd.on);
    SH.D[p.id]={on:on, lg:(use&&use.lg)||rd.lg||(CFG.logos[0]||{}).id,
                ink:(use&&use.ink)||rd.ink||'auto', method:(use&&use.method)||rd.method||'embroidery',
                colours:(use&&use.colours)||rd.colours||1};
    if(p.id!==primaryId && on)SH.showExtra=true;});
  renderSheet();
  document.getElementById('ov').classList.add('on');
  document.getElementById('sheet').classList.add('on');
  document.body.style.overflow='hidden';
}
function sheetDecos(){return Object.keys(SH.D).map(function(pl){var d=SH.D[pl];return {pl:pl,on:d.on,lg:d.lg,ink:d.ink,method:d.method,colours:d.colours};});}
function decoIsSel(pl,opt){var d=SH.D[pl];if(!d||!d.on||d.method!==opt.m)return false;return opt.m!=='screen'||(d.colours||1)===opt.c;}
// Per-piece price if placement `pl` used decoration `opt` (holding every other placement as-is).
function priceIf(pl,opt,on){
  var decos=sheetDecos().map(function(d){return d.pl===pl?{pl:pl,on:on,lg:d.lg,ink:'auto',method:opt.m,colours:opt.c}:d;});
  return unitPrice(SH.key,decos,SH.qty);
}
// A "choose one" finish group for a location (Uber-Eats style radio rows). Optional locations get a "None" row.
function finishGroup(pl,primary){
  var rows='';
  if(!primary){var off=!SH.D[pl].on;
    rows+='<button class="frow'+(off?' on':'')+'" data-pl="'+pl+'" data-off="1"><span class="fr"></span>'+
      '<span class="ft"><b>No logo here</b></span></button>';}
  METHOD_OPTS.forEach(function(opt){var sel=decoIsSel(pl,opt),u=priceIf(pl,opt,true);
    rows+='<button class="frow'+(sel?' on':'')+'" data-pl="'+pl+'" data-m="'+opt.m+'" data-c="'+opt.c+'">'+
      '<span class="fr"></span><span class="ft"><b>'+opt.lab+'</b><span>'+opt.sub+'</span></span>'+
      '<span class="fp">'+money(u)+'<i>/pc</i></span></button>';});
  return rows;
}
function renderSheet(){
  var item=BYKEY[SH.key];
  var o=overlayHtml(item,{decos:sheetDecos()},SH.colour,SH.face);var hasBack=o.hasBack;
  var chips=item.cols.map(function(c){return '<button class="cchip'+(c.name===SH.colour?' on':'')+'" data-col="'+esc(c.name)+'" style="background-image:url('+gurl(c.front)+')" title="'+esc(c.name)+'"></button>';}).join('');
  var faceTog=hasBack?'<div class="ftog"><button class="pchip'+(SH.face==='front'?' on':'')+'" data-face="front">Front</button><button class="pchip'+(SH.face==='back'?' on':'')+'" data-face="back">Back</button></div>':'';
  var logoPlaces=(item.places||[]).filter(function(p){return p.logo;});
  var primary=logoPlaces[0],extras=logoPlaces.slice(1);
  var primaryHtml=primary?('<div class="grp"><div class="grphd"><span>Your logo finish</span><i>choose one · '+esc(primary.label)+'</i></div>'+
      '<div class="frows">'+finishGroup(primary.id,true)+'</div></div>'):'';
  var extraHtml='';
  if(extras.length){
    if(SH.showExtra){extraHtml=extras.map(function(p){
        return '<div class="grp"><div class="grphd"><span>Add a logo — '+esc(p.label)+'</span><i>optional</i></div>'+
          '<div class="frows">'+finishGroup(p.id,false)+'</div></div>';}).join('');}
    else{extraHtml='<button class="addspot" id="addSpot">＋ Add a logo to '+extras.map(function(p){return esc(p.label.toLowerCase());}).join(' or ')+'</button>';}
  }
  var decos=sheetDecos();
  var unit=unitPrice(SH.key,decos,SH.qty),line=unit*SH.qty,tiers=CFG.pricing.cols||[12],topcol=tiers[tiers.length-1];
  var ptable=tiers.map(function(t,i){var u=unitPrice(SH.key,decos,t);
    var on=SH.qty>=t&&(i===tiers.length-1||SH.qty<tiers[i+1]);
    return '<button class="pt'+(on?' on':'')+'" data-t="'+t+'"><span>'+t+'+ pcs</span><b>'+money(u)+'</b><i>/pc</i></button>';}).join('');
  var uM=unitPrice(SH.key,decos,moq()),uT=unitPrice(SH.key,decos,topcol);
  var sv=uM>0?Math.round((1-uT/uM)*100):0;
  document.getElementById('sheet').innerHTML=
    '<button class="shx" id="shx" aria-label="Close">✕</button>'+
    '<div class="shscroll">'+
      '<div class="shimg" id="shimg"><div class="shstage"><img class="g" src="'+o.g+'" alt="">'+o.lg+'</div>'+faceTog+'</div>'+
      '<div class="shb"><h2>'+esc(item.name)+'</h2><div class="shsku">'+esc(item.sku)+(item.layer==='field'?' · CSA hi-vis':'')+'</div>'+
      (item.blurb?'<p class="shblurb">'+esc(item.blurb)+'</p>':'')+
      '<div class="grp"><div class="grphd"><span>Colour</span><i>'+esc(SH.colour)+'</i></div><div class="cchips">'+chips+'</div></div>'+
      primaryHtml+extraHtml+
      '<div class="grp"><div class="grphd"><span>Quantity</span><i>'+moq()+' minimum · save more at each tier</i></div>'+
        '<div class="qtyrow"><div class="qty"><button data-q="-1" aria-label="Less">–</button><input id="qin" type="number" inputmode="numeric" value="'+SH.qty+'" min="'+moq()+'"><button data-q="1" aria-label="More">+</button></div>'+
        (sv>0?'<span class="savep">Save '+sv+'% at '+topcol+'+</span>':'')+'</div>'+
        '<div class="ptable">'+ptable+'</div></div>'+
    '</div></div>'+
    '<div class="shfoot"><button class="shaddbtn" id="shAdd"><span>'+(CART[SH.key]?'Update kit':'Add to kit')+'</span><span class="p">'+money(line)+'</span></button>'+
      '<div class="shtrust">✓ Free digital proof before you commit · no obligation</div></div>';
  var sh=document.getElementById('sheet');
  document.getElementById('shx').addEventListener('click',closeAll);
  sh.querySelectorAll('.cchip').forEach(function(b){b.addEventListener('click',function(){SH.colour=b.dataset.col;swapPreview();renderSheet();});});
  sh.querySelectorAll('[data-face]').forEach(function(b){b.addEventListener('click',function(){SH.face=b.dataset.face;renderSheet();});});
  var as=document.getElementById('addSpot');if(as)as.addEventListener('click',function(){SH.showExtra=true;renderSheet();});
  sh.querySelectorAll('.frow').forEach(function(b){b.addEventListener('click',function(){var pl=b.dataset.pl;
    if(b.dataset.off){SH.D[pl].on=false;}
    else{var chg=!SH.D[pl].on||SH.D[pl].method!==b.dataset.m;SH.D[pl].on=true;SH.D[pl].method=b.dataset.m;SH.D[pl].colours=parseInt(b.dataset.c,10)||1;if(chg)SH.D[pl].ink='auto';
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
function recCartDecos(key){
  var vm=vmOf(key),decos=activeDecos(vm.decos).map(function(d){return {pl:d.pl,lg:d.lg,ink:d.ink||'auto',method:d.method||'embroidery',colours:d.colours||1,on:true};});
  if(!decos.length){var p=(BYKEY[key].places||[]).filter(function(x){return x.logo;})[0];if(p)decos=[{pl:p.id,lg:(CFG.logos[0]||{}).id,ink:'auto',method:(recDecos(key)[0]||{}).method||'embroidery',colours:1,on:true}];}
  return decos;
}
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

/* ---------- cart ---------- */
function cartCount(){return Object.keys(CART).length;}
function cartSubtotal(){var t=0;Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it)return;var c=CART[k];t+=unitPrice(k,c.decos,c.qty)*c.qty;});return t;}
function setupBreakdown(){var r=CFG.rates||{},s=r.setup||{},seen={},out=[];
  Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it)return;(CART[k].decos||[]).forEach(function(d){if(!d.on)return;
    var key=setupKey(d);if(seen[key])return;seen[key]=1;
    var L=logoOf(d.lg),p=placeOf(it,d.pl),plab=p?p.label:d.pl,lname=(L&&L.label)||'Logo',amt,lab;
    if(d.method==='screen'){var c=d.colours||1;amt=(s.screen||0)*c;lab=lname+' · '+plab+' · screen ('+c+'-colour)';}
    else if(d.method==='heat_transfer'){amt=s.heat_transfer||0;lab=lname+' · '+plab+' · heat-transfer artwork';}
    else{amt=s.embroidery||0;lab=lname+' · '+plab+' · embroidery digitizing';}
    out.push({label:lab,amount:Math.round(amt*100)/100});});});
  return out;}
function cartSetup(){return Math.round(setupBreakdown().reduce(function(t,x){return t+x.amount;},0)*100)/100;}
function decoSummary(it,c){return (c.decos||[]).map(function(d){var p=placeOf(it,d.pl),m=MLAB[d.method]||'Emb';if(d.method==='screen')m+=' '+(d.colours||1)+'C';return (p?p.label:d.pl)+' · '+m;}).join('  ·  ')||'left chest';}
function refreshCartUI(){
  var n=cartCount(),sub=cartSubtotal();
  var cn=document.getElementById('cartN');if(cn){cn.textContent=n;cn.classList.toggle('has',n>0);}
  var bar=document.getElementById('cbar');if(bar)bar.classList.toggle('on',n>0);
  var bn=document.getElementById('cbarN');if(bn)bn.textContent=n;
  var bp=document.getElementById('cbarP');if(bp)bp.textContent=money0(sub);
  document.querySelectorAll('.mcard').forEach(function(card){var k=card.dataset.key;var on=!!CART[k];card.classList.toggle('inkit',on);var b=card.querySelector('.madd');if(b){b.classList.toggle('has',on);b.innerHTML=on?('<b>'+CART[k].qty+'</b>'):'+';}});
}
function openCart(){renderCart();document.getElementById('ov').classList.add('on');document.getElementById('cart').classList.add('on');document.body.style.overflow='hidden';}
function renderCart(){
  var keys=Object.keys(CART),sub=cartSubtotal();
  var items=keys.map(function(k){var it=BYKEY[k];if(!it)return '';var c=CART[k];var col=colOf(it,c.colour);
    var unit=unitPrice(k,c.decos,c.qty);
    return '<div class="ci" data-key="'+k+'"><div class="t" style="background-image:url('+gurl(col.front)+')"></div>'+
      '<div class="d"><h4>'+esc(it.name)+'</h4><div class="sub">'+esc(c.colour)+' · '+esc(decoSummary(it,c))+'</div>'+
      '<div class="row"><div class="qty sm"><button data-q="-1">–</button><input class="ciq" type="number" value="'+c.qty+'" min="'+moq()+'"><button data-q="1">+</button></div>'+
      '<div class="lp">'+money(unit*c.qty)+'</div></div></div>'+
      '<button class="rm" data-rm="'+k+'" aria-label="Remove">✕</button></div>';}).join('');
  var body=keys.length?items:'<div class="cempty"><div class="ce-ic">🛒</div>Your kit is empty.<br><span>Tap any item to add it.</span></div>';
  var setupRows=setupBreakdown(),setup=setupRows.reduce(function(t,x){return t+x.amount;},0);
  var brk=setupRows.length?('<details class="setupbrk"><summary>One-time setup '+money(setup)+' <i>· once per design, shared across the kit</i></summary>'+setupRows.map(function(x){return '<div class="sbk"><span>'+esc(x.label)+'</span><span>'+money(x.amount)+'</span></div>';}).join('')+'</details>'):'';
  document.getElementById('cart').innerHTML=
    '<div class="carth"><h2>Your kit</h2><button class="cartx" id="cartx" aria-label="Close">✕</button></div>'+
    '<div class="citems" id="citems">'+body+'</div>'+
    (keys.length?('<div class="cartf">'+
      '<div class="crow"><span>Estimated subtotal</span><b>'+money(sub)+'</b></div>'+
      (setup>0?brk:'')+
      '<div class="csetup">Decorated, per piece — embroidery, screen &amp; heat-transfer priced in. Setup is once per logo &amp; location, reused across the kit. Exact itemised quote confirmed before anything runs.</div>'+
      '<button class="checkout" id="checkout">Request my quote <span class="ar">→</span></button></div>'):'')+
    '';
  document.getElementById('cartx').addEventListener('click',closeAll);
  var ck=document.getElementById('checkout');if(ck)ck.addEventListener('click',openCheckout);
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
    '<div class="carth"><button class="cartback" id="cartback" aria-label="Back">‹</button><h2>Send us your kit</h2><button class="cartx" id="cartx" aria-label="Close">✕</button></div>'+
    '<div class="citems"><div class="co">'+
      '<p class="cointro">Copy your kit and <b>paste it into your reply to our email</b> — we’ll send back a free proof and an exact, itemised quote (usually same day).</p>'+
      '<div class="coreview">'+review+
        '<div class="r tot"><span><b>Estimated subtotal</b></span><span><b>'+money(cartSubtotal())+'</b></span></div>'+
        '<div class="r"><span>One-time setup</span><span>'+money(cartSetup())+'</span></div></div>'+
      '<label>Anything to add? (optional)</label><textarea id="coNote" placeholder="Sizes, deadlines, other items…"></textarea>'+
    '</div></div>'+
    '<div class="cartf"><button class="checkout" id="copyKit">Copy my kit → paste into your reply</button>'+
      '<div class="csetup" id="copyHint" style="text-align:center;margin-top:10px">No new email needed — just paste it into the thread we’re already on.</div></div>';
  document.getElementById('cartx').addEventListener('click',closeAll);
  document.getElementById('cartback').addEventListener('click',openCart);
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
function renderSkeleton(cfg){
  var cards='';for(var i=0;i<8;i++){cards+='<div class="skcard"><div class="sk skimg"></div><div class="skb"><div class="sk skl1"></div><div class="sk skl2"></div><div class="sk skl3"></div></div></div>';}
  document.getElementById('app').innerHTML=
    '<header class="hdr"><div class="w hdrin"><span class="brand"><b>'+esc((cfg&&cfg.client)||'')+'</b><i>× Just Deals</i></span></div></header>'+
    '<section class="hero"><div class="w heroin"><div class="eyb">Branded apparel · ready to order</div>'+
      '<h1>'+esc((cfg&&cfg.client)||'Your')+"'s team store</h1>"+
      '<p class="herosub">Loading your kit…</p></div></section>'+
    '<main class="w"><div class="menu">'+cards+'</div></main>';
}
function go(cfg){
  CFG=cfg;
  if(cfg.accent)document.documentElement.style.setProperty('--a',cfg.accent);
  document.title=(cfg.client||'Branded Apparel')+' — Team Store · Just Deals Promotions';
  renderSkeleton(cfg);
  fetch((cfg.catalog_base||CATALOG_BASE)+'/catalog.json?v='+(cfg.ver||'1')).then(function(r){return r.json();}).then(function(cat){
    CFG.catalog_base=cfg.catalog_base||CATALOG_BASE;CAT=cat;(cat.items||[]).forEach(function(it){BYKEY[it.key]=it;});
    loadCart();buildStore();refreshCartUI();
    // Deep link: /kits/<slug>/?item=<key> (or #item=<key>) opens straight to that product — handy for
    // linking a prospect right to a specific piece's finishes + pricing.
    try{var m=(location.search.match(/[?&]item=([^&#]+)/)||location.hash.match(/item=([^&#]+)/));
      if(m){var k=decodeURIComponent(m[1]);if(BYKEY[k])openSheet(k);}}catch(e){}
  }).catch(function(e){document.getElementById('app').innerHTML='<p style="padding:60px;text-align:center">Could not load the catalogue. Please refresh.</p>';});
}
var cel=document.getElementById('jdpcfg');
if(cel){try{go(JSON.parse(cel.textContent));}catch(e){}}
else{fetch('client.json?v='+Date.now()).then(function(r){return r.json();}).then(go).catch(function(){document.getElementById('app').innerHTML='<p style="padding:60px;text-align:center">Client config not found.</p>';});}
})();
