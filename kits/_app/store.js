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
function hexSat(h){h=(h||'').replace('#','');if(h.length<6)return 0;var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return Math.max(r,g,b)-Math.min(r,g,b);}
// A single spot print must READ on the garment: crisp WHITE on dark garments AND on saturated hi-vis
// (orange/lime — bright but vivid, where white pops); a very light garment would swallow white so use
// a dark ink; otherwise the full-colour brand mark.
function autoInk(rgb){var l=hexLum(rgb),s=hexSat(rgb);if(l<120||s>=70)return 'white';if(l>210)return 'dark';return 'brand';}
// EMBROIDERY = full-colour thread -> always render the full-colour (brand) logo. Screen/heat-transfer
// default to a contrast ink (white on dark/hi-vis, dark on very light, full colour otherwise).
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
/* JDP Pricing Model v2.1 — markup declines along a cost curve on the BLANK; decoration passed at cost. */
function costMult(c){if(c<=1)return 3.50;if(c<=3)return 2.80;if(c<=7)return 2.30;if(c<=15)return 2.00;if(c<=25)return 1.80;if(c<=40)return 1.65;if(c<=75)return 1.49;if(c<=150)return 1.40;if(c<=350)return 1.34;if(c<=700)return 1.28;return 1.22;}
function volFactor(q){if(q<24)return 1.075;if(q<48)return 1.035;if(q<100)return 1.00;if(q<250)return 0.89;return 0.86;}
function activeDecos(decos){return (decos||[]).filter(function(d){return d.on;});}
function unitPrice(key,decos,q){var r=CFG.rates;if(!r||r.blank==null){return unitAt(BYKEY[key],q);}
  var item=BYKEY[key],c=blankOf(key),dec=0;activeDecos(decos).forEach(function(d){dec+=decoCost(d,item);});
  var price=c*costMult(c)*volFactor(q)+dec,floor=(c+dec)/0.85;   // hard 15% total-margin clamp
  if(price<floor)price=floor; if(price<2.50)price=2.50;          // min piece price
  return Math.ceil(price/0.5)*0.5;}                              // round UP to nearest $0.50
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
    var wf=p.wf*(CFG.logo_scale||1);
    lg+='<img class="l" src="'+src+'" style="left:'+p.cx+'%;top:'+p.cy+'%;width:'+wf+'%" alt="">';});
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
function catName(id){return id==='office'?'Company Apparel':id==='field'?'Job-site &amp; Hi-Vis':id==='premium'?'Premium Brands':'Accessories';}
function buildStore(){
  var C=CFG.copy||{};
  var order=CFG.order||{};
  var cats=[];
  // Steven's nav order: Company Apparel · Job-site & Hi-Vis · Premium Brands · Accessories
  if((order.office||[]).length)cats.push('office');
  if((order.field||[]).length)cats.push('field');
  if((order.premium||[]).length)cats.push('premium');
  if((order.bags||[]).length)cats.push('bags');
  var recN=(order.office||[]).concat(order.field||[]).filter(function(k){return BYKEY[k];}).length;
  var sections=cats.map(function(cat){
    var keys=order[cat]||[];
    var cards=keys.map(menuCard).join('');
    var csa=cat==='field'?' <span class="csa">CSA-rated</span>':'';
    return '<section class="sec" id="sec-'+cat+'"><h2 class="seclbl">'+catName(cat)+csa+'</h2><div class="menu">'+cards+'</div></section>';
  }).join('');
  var catbar=cats.length>1?('<nav class="catbar" id="catbar"><div class="w catin">'+
    cats.map(function(c,i){return '<button class="cpill'+(i===0?' on':'')+'" data-t="sec-'+c+'">'+catName(c)+'</button>';}).join('')+'</div></nav>'):'';
  var demo=!!CFG.demo,cta=CFG.cta||{};
  var heroCta = demo
    ? ('<button class="reccta" id="leadOpen1">'+esc(cta.label||'Get your store — free')+' →</button>'+(cta.phone?'<div class="herophone">or call <b>'+esc(cta.phone)+'</b></div>':''))
    : (recN?'<button class="reccta" id="addRec">★ Add the recommended kit <span>'+recN+' pieces</span></button>':'');
  var html=''+
   '<header class="hdr"><div class="w hdrin">'+
     '<span class="brand"><img src="'+(CFG.cover_logo||'img/logo-white.png')+'" onerror="this.style.display=\'none\'" alt=""><b>'+esc(CFG.client)+'</b><i>× Just Deals</i></span>'+
     '<button class="cartbtn" id="openCart"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/></svg>'+
       '<span class="lbl">Your kit</span><span class="n" id="cartN">0</span></button></div></header>'+
   '<section class="hero"><div class="w heroin">'+
     '<div class="eyb">'+(demo?'Sample store · your logo goes here':'Branded apparel · ready to order')+'</div>'+
     '<h1>'+esc(CFG.client)+"'s team store</h1>"+
     '<p class="herosub">'+(demo?'This is a live sample. Every item shows exactly where your logo goes — swap in your brand and it becomes your team’s store. Free digital proofs, no obligation.':'Your logo, already on it. Pick your pieces, choose a finish, and send it over for a free proof &amp; exact quote — no obligation.')+'</p>'+
     heroCta+
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
   (demo?('<div class="demobar"><div class="demobarin w"><span class="demotxt"><b>Like the look?</b> Get this store with <b>your</b> logo — free, no obligation.</span><button class="demobtn" id="leadOpen2">'+esc(cta.label||'Get your store — free')+'</button></div></div>'):'')+
   (demo?'<div class="lead" id="lead"></div>':'')+
   '<div class="cbar" id="cbar"><div class="cbarin w"><div class="cbarL"><span class="n" id="cbarN">0</span> in your kit</div>'+
     '<button class="cbarbtn" id="openCart2">View kit <span class="p" id="cbarP"></span> <span class="ar">→</span></button></div></div>'+
   '<div class="toast" id="toast"><span class="tk">✓</span><span class="tm" id="toastM">Added</span><button class="tview" id="toastView">View kit →</button></div>';
  document.getElementById('app').innerHTML=html;
  document.getElementById('openCart').addEventListener('click',openCart);
  document.getElementById('openCart2').addEventListener('click',openCart);
  document.getElementById('ov').addEventListener('click',closeAll);
  document.querySelectorAll('.mcard').forEach(function(card){
    card.addEventListener('click',function(){openSheet(card.dataset.key);});
    card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openSheet(card.dataset.key);}});
  });
  // "+" on a card opens the customiser (so a size split is always chosen) — no silent quick-add.
  document.querySelectorAll('.madd').forEach(function(b){b.addEventListener('click',function(e){
    e.stopPropagation();openSheet(b.dataset.key);});});
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
  var tv=document.getElementById('toastView');if(tv)tv.addEventListener('click',function(){document.getElementById('toast').classList.remove('on');openCart();});
  ['leadOpen1','leadOpen2'].forEach(function(id){var b=document.getElementById(id);if(b)b.addEventListener('click',openLead);});
}
// Generic/demo store: a conversion-focused lead modal. When a published Airtable form URL is configured
// (CFG.cta_form), it embeds that form (submissions land straight in Airtable). Otherwise it shows a
// clear contact fallback so the CTA always works.
function openLead(){
  var cta=CFG.cta||{},form=CFG.cta_form,el=document.getElementById('lead');
  var inner;
  if(form){
    // Embedded Airtable form carries its own title/fields — keep our chrome minimal so it's the focus.
    el.classList.add('embed');
    inner='<button class="shx" id="leadX" aria-label="Close">✕</button>'+
      '<div class="leadhd"><span class="eyb">Free · no obligation</span> Get your own branded store</div>'+
      '<iframe class="leadform" src="'+esc(form)+'" frameborder="0"></iframe>';
  } else {
    el.classList.remove('embed');
    inner='<button class="shx" id="leadX" aria-label="Close">✕</button><div class="leadb">'+
      '<div class="eyb">Free · no obligation</div><h2>Get your own branded store</h2>'+
      '<p class="leadsub">Tell us about your team and we’ll build a store like this — your logo, your colours, your gear — and send <b>free digital proofs</b>, usually same day.</p>'+
      '<ul class="leadben"><li>Your logo on real gear — free mockups</li><li>Your team’s colours &amp; sizes</li><li>Live pricing · no minimum beyond 12 pcs</li></ul>'+
      '<a class="leadbtn" href="'+esc(cta.href||'#')+'">Email us to start →</a>'+(cta.phone?'<div class="leadphone">or call <b>'+esc(cta.phone)+'</b></div>':'')+'</div>';
  }
  el.innerHTML=inner;
  document.getElementById('leadX').addEventListener('click',closeAll);
  document.getElementById('ov').classList.add('on');
  document.getElementById('lead').classList.add('on');
  document.body.style.overflow='hidden';
}
var TT;
function toast(msg){var t=document.getElementById('toast'),m=document.getElementById('toastM');if(!t)return;if(m)m.textContent=msg||'Added to your kit';t.classList.add('on');clearTimeout(TT);TT=setTimeout(function(){t.classList.remove('on');},3600);}

/* ---------- item customiser (one clean screen) ---------- */
var SH={key:null,colour:null,face:'front',D:{},qty:12,showExtra:false};
var METHOD_OPTS=[
  {m:'embroidery',c:1,lab:'Embroidery',sub:'Stitched in thread — premium & long-lasting. Best on polos, jackets & vests.'},
  {m:'screen',c:1,lab:'Screen print — 1 colour',sub:'Your logo printed in one solid ink — best value on tees & hi-vis.'},
  {m:'screen',c:2,lab:'Screen print — 2 colour',sub:'Printed in two inks — a little more of your logo’s detail.'},
  {m:'heat_transfer',c:1,lab:'Heat transfer',sub:'Full-colour design pressed on with heat — best for detailed logos & rain gear.'}
];
var SIZES=['S','M','L','XL','2XL','3XL'];
function sizeTotal(sz){sz=sz||SH.sizes||{};var t=0;SIZES.forEach(function(s){t+=parseInt(sz[s],10)||0;});return t;}
function effQty(){var t=sizeTotal();return t>0?t:(SH.baseQty||0);}
// The next price tier above q (or null). Used to nudge orders up to the next volume break.
function nextTier(q){var t=CFG.pricing.cols||[];for(var i=0;i<t.length;i++){if(q<t[i])return t[i];}return null;}
function savingsNudge(key,decos,q){var nt=nextTier(q);if(!nt)return null;var a=unitPrice(key,decos,q),b=unitPrice(key,decos,nt);var pct=a>0?Math.round((1-b/a)*100):0;if(pct<=0)return null;return {need:nt-q,tier:nt,pct:pct};}
function sizesSummary(c){if(!c||!c.sizes)return '';return SIZES.filter(function(s){return c.sizes[s];}).map(function(s){return s+' '+c.sizes[s];}).join(' · ');}
function openSheet(key){
  var item=BYKEY[key],vm=vmOf(key),ex=CART[key],exmap={};
  if(ex&&ex.decos){ex.decos.forEach(function(d){exmap[d.pl]=d;});}
  // Size breakdown is the ONLY quantity control. baseQty preserves the count of an item that was
  // quick-started without a size split (e.g. the recommended kit) so reopening it doesn't lose it.
  SH={key:key,colour:(ex&&ex.colour)||vm.colour,face:'front',D:{},showExtra:false,sizes:{},baseQty:(ex&&!ex.sizes)?(ex.qty||0):0};
  SIZES.forEach(function(s){SH.sizes[s]=(ex&&ex.sizes&&ex.sizes[s])||0;});
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
// Our recommended decoration for a placement (from the build) — used to guide the customer.
function recFor(pl){var d=recDecos(SH.key).filter(function(x){return x.pl===pl;})[0];return d?{m:d.method||'embroidery',c:d.colours||1}:{m:'embroidery',c:1};}
function isRec(pl,opt){var r=recFor(pl);return opt.m===r.m&&(opt.m!=='screen'||opt.c===(r.c||1));}
// A "choose one" finish group for a location (Uber-Eats style radio rows). The recommended finish is
// tagged so an unsure customer has clear guidance; each row explains the method in plain language.
function finishGroup(pl,primary){
  var rows='';
  if(!primary){var off=!SH.D[pl].on;
    rows+='<button class="frow'+(off?' on':'')+'" data-pl="'+pl+'" data-off="1"><span class="fr"></span>'+
      '<span class="ft"><b>No logo here</b></span></button>';}
  METHOD_OPTS.forEach(function(opt){var sel=decoIsSel(pl,opt),u=priceIf(pl,opt,true),rec=isRec(pl,opt);
    rows+='<button class="frow'+(sel?' on':'')+'" data-pl="'+pl+'" data-m="'+opt.m+'" data-c="'+opt.c+'">'+
      '<span class="fr"></span><span class="ft"><b>'+opt.lab+(rec?' <span class="frec">★ Recommended</span>':'')+'</b><span>'+opt.sub+'</span></span>'+
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
  var primaryHtml=primary?('<div class="grp"><div class="grphd"><span>Your logo finish</span><i>'+esc(primary.label)+'</i></div>'+
      '<div class="ghelp">Not sure which to pick? Go with the ★ Recommended option — we’ll confirm the best method on your free proof.</div>'+
      '<div class="frows">'+finishGroup(primary.id,true)+'</div></div>'):'';
  var extraHtml='';
  if(extras.length){
    if(SH.showExtra){extraHtml=extras.map(function(p){
        return '<div class="grp"><div class="grphd"><span>Add a logo — '+esc(p.label)+'</span><i>optional</i></div>'+
          '<div class="frows">'+finishGroup(p.id,false)+'</div></div>';}).join('');}
    else{extraHtml='<button class="addspot" id="addSpot">＋ Add a logo to '+extras.map(function(p){return esc(p.label.toLowerCase());}).join(' or ')+'</button>';}
  }
  var decos=sheetDecos();
  var q=effQty(),tiers=CFG.pricing.cols||[12],topcol=tiers[tiers.length-1];
  var unit=unitPrice(SH.key,decos,q||moq()),line=unit*q;
  var ptable=tiers.map(function(t,i){var u=unitPrice(SH.key,decos,t);
    var on=q>=t&&(i===tiers.length-1||q<tiers[i+1]);
    return '<div class="pt'+(on?' on':'')+'"><span>'+t+'+ pcs</span><b>'+money(u)+'</b><i>/pc</i></div>';}).join('');
  var nud=savingsNudge(SH.key,decos,q||moq());
  var nudHtml=nud?('<div class="nudge">💡 Add '+nud.need+' more to reach the '+nud.tier+'+ price — <b>save '+nud.pct+'% per piece</b></div>'):'';
  // Quantity = a size breakdown, always (the ONLY quantity control — no confusing total-vs-sizes choice).
  var under=q<moq();
  var grid=SIZES.map(function(s){return '<div class="szrow"><span class="szl">'+s+'</span>'+
    '<div class="qty sm szqty"><button data-sz="'+s+'" data-d="-1" aria-label="Less '+s+'">–</button><input class="szin" data-sz="'+s+'" type="number" inputmode="numeric" value="'+(SH.sizes[s]||0)+'" min="0"><button data-sz="'+s+'" data-d="1" aria-label="More '+s+'">+</button></div></div>';}).join('');
  var totHint = under ? (' <span>· add '+(moq()-q)+' more to reach the '+moq()+' minimum</span>')
    : (sizeTotal()===0&&SH.baseQty>0 ? ' <span>· set your split below (optional)</span>' : '');
  var qtyGrp='<div class="grp"><div class="grphd"><span>How many of each size?</span><i>'+moq()+' minimum</i></div>'+
    '<div class="szgrid">'+grid+'</div>'+
    '<div class="sztot'+(under?' under':'')+'">Total <b>'+q+' pcs</b>'+totHint+'</div>'+
    '<div class="ptable">'+ptable+'</div>'+nudHtml+'</div>';
  var canAdd=q>=moq();
  // Preserve the customiser's scroll position across re-renders so tapping a finish / size doesn't jump.
  var _prev=document.querySelector('#sheet .shscroll'),_top=_prev?_prev.scrollTop:0;
  document.getElementById('sheet').innerHTML=
    '<button class="shx" id="shx" aria-label="Close">✕</button>'+
    '<div class="shscroll">'+
      '<div class="shimg" id="shimg"><div class="shstage"><img class="g" src="'+o.g+'" alt="">'+o.lg+'</div>'+faceTog+'</div>'+
      '<div class="shb"><h2>'+esc(item.name)+'</h2><div class="shsku">'+esc(item.sku)+(item.layer==='field'?' · CSA hi-vis':'')+'</div>'+
      (item.blurb?'<p class="shblurb">'+esc(item.blurb)+'</p>':'')+
      '<div class="grp"><div class="grphd"><span>Colour</span><i>'+esc(SH.colour)+'</i></div><div class="cchips">'+chips+'</div></div>'+
      primaryHtml+extraHtml+qtyGrp+
    '</div></div>'+
    '<div class="shfoot"><button class="shaddbtn" id="shAdd"'+(canAdd?'':' disabled')+'><span>'+(canAdd?(CART[SH.key]?'Update kit':'Add to kit'):('Add '+moq()+'+ pieces'))+'</span><span class="p">'+money(line)+'</span></button>'+
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
  sh.querySelectorAll('.szqty button').forEach(function(b){b.addEventListener('click',function(){var s=b.dataset.sz,d=parseInt(b.dataset.d,10);SH.sizes[s]=Math.max(0,(parseInt(SH.sizes[s],10)||0)+d);renderSheet();});});
  sh.querySelectorAll('.szin').forEach(function(inp){inp.addEventListener('change',function(e){SH.sizes[e.target.dataset.sz]=Math.max(0,parseInt(e.target.value,10)||0);renderSheet();});});
  document.getElementById('shAdd').addEventListener('click',addFromSheet);
  var _n=document.querySelector('#sheet .shscroll');if(_n)_n.scrollTop=_top;
}
function swapPreview(){var im=document.getElementById('shimg');if(im){im.classList.add('sw');setTimeout(function(){im.classList.remove('sw');},220);}}
function addFromSheet(){
  var q=effQty();
  if(q<moq()){toast('Add at least '+moq()+' pieces');return;}
  var was=!!CART[SH.key],decos=[];
  Object.keys(SH.D).forEach(function(pl){var d=SH.D[pl];if(d.on)decos.push({pl:pl,lg:d.lg,ink:d.ink,method:d.method,colours:d.colours||1,on:true});});
  var entry={qty:q,colour:SH.colour,decos:decos};
  var sz={};SIZES.forEach(function(s){if(SH.sizes[s])sz[s]=SH.sizes[s];});
  if(Object.keys(sz).length)entry.sizes=sz;   // else keep the plain qty (a quick-started item reopened & saved as-is)
  CART[SH.key]=entry;
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
  var bar=document.getElementById('cbar');if(bar)bar.classList.toggle('on',n>0&&!CFG.demo);
  var bn=document.getElementById('cbarN');if(bn)bn.textContent=n;
  var bp=document.getElementById('cbarP');if(bp)bp.textContent=money0(sub);
  document.querySelectorAll('.mcard').forEach(function(card){var k=card.dataset.key;var on=!!CART[k];card.classList.toggle('inkit',on);var b=card.querySelector('.madd');if(b){b.classList.toggle('has',on);b.innerHTML=on?('<b>'+CART[k].qty+'</b>'):'+';}});
}
function openCart(){renderCart();document.getElementById('ov').classList.add('on');document.getElementById('cart').classList.add('on');document.body.style.overflow='hidden';}
function renderCart(){
  var keys=Object.keys(CART),sub=cartSubtotal();
  var items=keys.map(function(k){var it=BYKEY[k];if(!it)return '';var c=CART[k];var col=colOf(it,c.colour);
    var unit=unitPrice(k,c.decos,c.qty);var szsum=sizesSummary(c);var nud=savingsNudge(k,c.decos,c.qty);
    var ctrl='<button class="editln" data-edit="'+k+'">'+c.qty+' pcs · '+(c.sizes?'by size':'add sizes')+' ✎</button>';
    return '<div class="ci" data-key="'+k+'"><div class="t" style="background-image:url('+gurl(col.front)+')"></div>'+
      '<div class="d"><h4>'+esc(it.name)+'</h4><div class="sub">'+esc(c.colour)+' · '+esc(decoSummary(it,c))+(szsum?'<br><span class="szln">Sizes: '+esc(szsum)+'</span>':'')+'</div>'+
      (nud?'<div class="cinudge">＋'+nud.need+' to reach '+nud.tier+'+ · save '+nud.pct+'%</div>':'')+
      '<div class="row">'+ctrl+'<div class="lp">'+money(unit*c.qty)+'</div></div></div>'+
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
    var ed=ci.querySelector('[data-edit]');if(ed)ed.addEventListener('click',function(){editItem(k);});
    ci.querySelector('[data-rm]').addEventListener('click',function(){delete CART[k];saveCart();renderCart();refreshCartUI();});
  });
}
function editItem(k){document.getElementById('cart').classList.remove('on');openSheet(k);}
function closeAll(){['ov','sheet','cart','lead'].forEach(function(id){var e=document.getElementById(id);if(e)e.classList.remove('on');});document.body.style.overflow='';}

/* ---------- checkout: copy-paste into the existing email thread ---------- */
function orderText(note){
  var lines=['MY KIT — '+CFG.client,''];
  Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it)return;var c=CART[k];var u=unitPrice(k,c.decos,c.qty);
    lines.push('• '+it.name+' ('+it.sku+') — '+c.colour+' · '+decoSummary(it,c)+' · qty '+c.qty+' @ '+money(u)+' ea = '+money(u*c.qty));
    var ss=sizesSummary(c);if(ss)lines.push('    sizes: '+ss);});
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
  var review=Object.keys(CART).map(function(k){var it=BYKEY[k];if(!it)return '';var c=CART[k];var ss=sizesSummary(c);
    return '<div class="r"><span>'+esc(it.name)+' · '+esc(c.colour)+' · '+esc(decoSummary(it,c))+' × '+c.qty+(ss?'<br><small style="color:var(--mut)">Sizes: '+esc(ss)+'</small>':'')+'</span><span>'+money(unitPrice(k,c.decos,c.qty)*c.qty)+'</span></div>';}).join('');
  document.getElementById('cart').innerHTML=
    '<div class="carth"><button class="cartback" id="cartback" aria-label="Back">‹</button><h2>Send us your kit</h2><button class="cartx" id="cartx" aria-label="Close">✕</button></div>'+
    '<div class="citems"><div class="co">'+
      '<p class="cointro">Copy your kit and <b>paste it into your reply to our email</b> — we’ll send back a free proof and an exact, itemised quote (usually same day).</p>'+
      '<div class="coreview">'+review+
        '<div class="r tot"><span><b>Estimated subtotal</b></span><span><b>'+money(cartSubtotal())+'</b></span></div>'+
        '<div class="r"><span>One-time setup</span><span>'+money(cartSetup())+'</span></div></div>'+
      '<label>Anything to add? (optional)</label><textarea id="coNote" placeholder="Deadlines, extra notes, other items…"></textarea>'+
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
