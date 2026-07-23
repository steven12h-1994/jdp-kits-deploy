/* JDP Storefront — "Uber Eats for branded apparel".
   A photo-forward menu of the recommended picks from client.json + the shared catalogue, a dead-simple
   one-screen item customiser (colour → logo finish → quantity), a cart, and a one-tap copy-to-email quote.
   Choices persist on the device (localStorage). Deployed once at /kits/_app/store.js. */
(function(){
document.documentElement.classList.add('js');
var CATALOG_BASE="https://justdealspromotions.com/kits/_catalog";
var CFG,CAT,CATVER='',BYKEY={},CART={},SLUG=(location.pathname.split('/').filter(Boolean).pop()||'kit');
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
// Every image URL carries the catalogue's build version so a changed-content/same-filename asset
// (e.g. a product re-shot on a model) is re-fetched instead of served stale from cache.
function gurl(f){return CFG.catalog_base+'/img/'+f+(CATVER?((f.indexOf('?')<0?'?':'&')+'v='+CATVER):'');}
function colOf(item,name){for(var i=0;i<item.cols.length;i++)if(item.cols[i].name===name)return item.cols[i];return item.cols[0];}
function colInList(cols,name){for(var i=0;i<cols.length;i++)if(cols[i].name===name)return cols[i];return cols[0];}
function curColsOf(item,fit){return (fit==='womens'&&item.wcols&&item.wcols.length)?item.wcols:item.cols;}
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
function placeInList(places,pid){for(var i=0;i<places.length;i++)if(places[i].id===pid)return places[i];return null;}
function overlayHtml(item,vm,colName,faces,colsOverride,placesOverride){
  var cols=colsOverride||item.cols;var places=placesOverride||item.places;var col=colInList(cols,colName);var face=faces||'front';var hasBack=!!col.back;
  if(face==='back'&&!hasBack)face='front';
  var photo=(face==='back'&&col.back)?col.back:col.front;
  var lg='';
  (vm.decos||[]).forEach(function(d){if(!d.on)return;var p=placeInList(places,d.pl);if(!p||(p.face||'front')!==face)return;
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
  return '<article class="mcard'+inkit+'" data-key="'+key+'" data-name="'+esc((item.name+' '+item.sku).toLowerCase().replace(/"/g,''))+'" tabindex="0" role="button" aria-label="'+esc(item.name)+'">'+
    '<div class="mstage">'+rec+(item.video?'<button class="mvid" data-vid="'+esc(item.video)+'" data-vname="'+esc(item.name)+'" aria-label="Play product video">▶ Video</button>':'')+'<img class="g" src="'+o.g+'" alt="'+esc(item.name)+'" loading="lazy" decoding="async">'+o.lg+
      '<button class="madd'+(q?' has':'')+'" data-key="'+key+'" aria-label="'+(q?'Edit ':'Add ')+esc(item.name)+'">'+addlbl+'</button></div>'+
    '<div class="mb"><h3>'+esc(item.name)+'</h3>'+
      '<div class="mmeta">'+esc(item.sku)+(item.womens?' · Men’s &amp; Women’s':(item.unisex?' · Unisex':''))+'</div>'+
      colourDots(item)+
      '<div class="mprice">from <b>'+money(fromP)+'</b> <small>/pc · decorated</small></div></div></article>';
}
// A row of real colour swatches on each card — shows selection depth at a glance (conversion signal).
function colourDots(item){
  var cs=item.cols||[],max=7,dots='';
  for(var i=0;i<cs.length&&i<max;i++){dots+='<span class="cdot" style="background:'+(cs[i].rgb||'#ccc')+'" title="'+esc(cs[i].name||'')+'"></span>';}
  var extra=cs.length>max?('<span class="cmore">+'+(cs.length-max)+'</span>'):'';
  return '<div class="cdots">'+dots+extra+'<span class="cdlbl">'+cs.length+' colour'+(cs.length===1?'':'s')+'</span></div>';
}

/* ---------- category / subcategory navigation (by GARMENT TYPE, brand-agnostic) ----------
   No "Premium Brands" bucket — office & premium apparel merge into the same type categories so a
   shopper browses by what they want (Polos, Fleece, Jackets…), with the brand shown on each card. */
var MEGA=[
  {id:'tops',name:'Polos, Shirts & Tees'},
  {id:'layers',name:'Sweaters & Fleece'},
  {id:'outerwear',name:'Jackets & Vests'},
  {id:'hivis',name:'Hi-Vis & Safety'},
  {id:'bags',name:'Bags & Gear'}
];
var MEGASUB={
  tops:['Polos','Shirts','Tees'],
  layers:['Quarter & Half-Zips','Crewnecks & Sweatshirts','Hoodies','Fleece'],
  outerwear:['Softshell Jackets','Shackets & Overshirts','Insulated & Thermal','Puffer & Quilted','3-in-1 Systems','Shells & Rainwear','Vests','Jackets'],
  hivis:['Hi-Vis T-Shirts','Safety Vests','Hi-Vis Hoodies','Hi-Vis Gear'],
  bags:['Backpacks','Duffels','Coolers','Tool Bags','Bags']
};
function megaName(id){for(var i=0;i<MEGA.length;i++)if(MEGA[i].id===id)return MEGA[i].name;return id;}
// classify an item into {mega, sub} purely by garment type (names carry raw "&"; escaped at render).
function classify(it){
  var layer=it.layer,n=((it.name||'')+' '+(it.key||'')).toLowerCase();
  if(layer==='bags'){var b='Bags';
    if(n.indexOf('cooler')>=0)b='Coolers';else if(n.indexOf('duffel')>=0)b='Duffels';
    else if(n.indexOf('tool')>=0)b='Tool Bags';else if(n.indexOf('backpack')>=0||n.indexOf('pack')>=0)b='Backpacks';
    return {mega:'bags',sub:b};}
  if(layer==='field'){var h='Hi-Vis Gear';
    if(n.indexOf('vest')>=0)h='Safety Vests';else if(/hood/.test(n))h='Hi-Vis Hoodies';
    else if(/tee|t-shirt|shirt/.test(n))h='Hi-Vis T-Shirts';
    return {mega:'hivis',sub:h};}
  // apparel (office + premium + Stormtech). Order matters: shackets/vests before shirt/fleece;
  // layers (zip/sweatshirt/hood) before "shirt" so "…Sweatshirt" doesn't read as a shirt.
  if(/shacket|overshirt/.test(n))return {mega:'outerwear',sub:'Shackets & Overshirts'};
  if(/quarter-?zip|half-?zip|1\/4/.test(n))return {mega:'layers',sub:'Quarter & Half-Zips'};
  if(/crewneck|sweatshirt/.test(n)&&!/hood/.test(n))return {mega:'layers',sub:'Crewnecks & Sweatshirts'};
  if(/hoodie|hooded/.test(n))return {mega:'layers',sub:'Hoodies'};
  if(n.indexOf('vest')>=0)return {mega:'outerwear',sub:'Vests'};      // fleece/quilted vests -> Vests, not Fleece
  if(/fleece/.test(n))return {mega:'layers',sub:'Fleece'};
  if(n.indexOf('polo')>=0)return {mega:'tops',sub:'Polos'};
  if(/tee|t-shirt/.test(n))return {mega:'tops',sub:'Tees'};
  if(n.indexOf('shirt')>=0)return {mega:'tops',sub:'Shirts'};
  if(/3-?in-?1|5-?in-?1|system jacket/.test(n))return {mega:'outerwear',sub:'3-in-1 Systems'};
  if(/rain|dryvent|raincoat/.test(n))return {mega:'outerwear',sub:'Shells & Rainwear'};
  if(/softshell|soft shell/.test(n))return {mega:'outerwear',sub:'Softshell Jackets'};
  if(/puffer|quilted|down|thermoball|puffy/.test(n))return {mega:'outerwear',sub:'Puffer & Quilted'};
  if(/thermal|insulated|sherpa|hybrid/.test(n))return {mega:'outerwear',sub:'Insulated & Thermal'};
  if(/shell/.test(n))return {mega:'outerwear',sub:'Shells & Rainwear'};
  if(/jacket|coat|parka/.test(n))return {mega:'outerwear',sub:'Jackets'};
  return {mega:'tops',sub:'Shirts'};
}
/* ---------- FILTERED BROWSE MODEL (one category at a time; no endless scroll) ---------- */
var VIEW={cat:null,sub:'all',q:''};
var BUCKETS={},TOTALS={},CATS=[];
var SHORTCAT={tops:'Polos & Shirts',layers:'Fleece & Sweaters',outerwear:'Jackets & Vests',hivis:'Hi-Vis',bags:'Bags'};
function shortCat(id){return SHORTCAT[id]||megaName(id);}
function buildBuckets(){
  var order=CFG.order||{},all=[];
  ['office','premium','bags','field'].forEach(function(L){(order[L]||[]).forEach(function(k){if(all.indexOf(k)<0)all.push(k);});});
  BUCKETS={};TOTALS={};ALLKEYS=all;
  all.forEach(function(k){var it=BYKEY[k];if(!it)return;var c=classify(it);
    (BUCKETS[c.mega]=BUCKETS[c.mega]||{});(BUCKETS[c.mega][c.sub]=BUCKETS[c.mega][c.sub]||[]).push(k);
    TOTALS[c.mega]=(TOTALS[c.mega]||0)+1;});
  // Order within each subcategory for optimal browsing: top picks first, then price low → high.
  var pc=(CFG.pricing&&CFG.pricing.cols)?CFG.pricing.cols:[12,48,144],top=pc[pc.length-1];
  function pkey(k){var it=BYKEY[k],rec=(it.rec||k===CFG.feature)?0:1,p;try{p=unitPrice(k,vmOf(k).decos,top);}catch(e){p=it.blank||0;}return [rec,p];}
  Object.keys(BUCKETS).forEach(function(m){Object.keys(BUCKETS[m]).forEach(function(s){
    BUCKETS[m][s].sort(function(a,b){var pa=pkey(a),pb=pkey(b);return (pa[0]-pb[0])||(pa[1]-pb[1]);});});});
  CATS=MEGA.filter(function(m){return BUCKETS[m.id];}).map(function(m){return m.id;});
}
var ALLKEYS=[];
function subNames(cat){var subs=BUCKETS[cat]||{},ord=MEGASUB[cat]||[];
  return Object.keys(subs).sort(function(a,b){var ia=ord.indexOf(a),ib=ord.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});}
function renderCtabs(){var el=document.getElementById('ctabs');if(!el)return;
  el.innerHTML=CATS.map(function(c){return '<button class="ctab'+(c===VIEW.cat?' on':'')+'" data-cat="'+c+'">'+esc(shortCat(c))+'<span class="ctn">'+TOTALS[c]+'</span></button>';}).join('');
  el.querySelectorAll('.ctab').forEach(function(b){b.addEventListener('click',function(){setCat(b.dataset.cat,true);});});}
function renderSubchips(){var el=document.getElementById('subchips');if(!el)return;
  var subs=subNames(VIEW.cat);
  var h='<button class="schip'+(VIEW.sub==='all'?' on':'')+'" data-sub="all">All<span class="scn">'+TOTALS[VIEW.cat]+'</span></button>';
  h+=subs.map(function(s){return '<button class="schip'+(VIEW.sub===s?' on':'')+'" data-sub="'+esc(s)+'">'+esc(s)+'<span class="scn">'+BUCKETS[VIEW.cat][s].length+'</span></button>';}).join('');
  el.innerHTML=h;
  el.querySelectorAll('.schip').forEach(function(b){b.addEventListener('click',function(){setSub(b.dataset.sub);
    var tr=b.closest('.subchips');if(tr)tr.scrollTo({left:b.offsetLeft-tr.clientWidth/2+b.clientWidth/2,behavior:'smooth'});});});}
function wireCards(){
  var g=document.getElementById('grid');if(!g)return;
  g.querySelectorAll('.mcard').forEach(function(card){
    card.addEventListener('click',function(){openSheet(card.dataset.key);});
    card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openSheet(card.dataset.key);}});});
  g.querySelectorAll('.madd').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();var k=b.dataset.key;if(CART[k]){openSheet(k);}else{quickAdd(k);}});});
  g.querySelectorAll('.mvid').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();openVideo(b.dataset.vid,b.dataset.vname);});});
  g.querySelectorAll('.mstage .g').forEach(function(im){if(im.complete)im.classList.add('ld');else im.addEventListener('load',function(){im.classList.add('ld');});});
  g.querySelectorAll('.mccard,.nextup').forEach(function(b){b.addEventListener('click',function(){setCat(b.dataset.cat,true);});
    b.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();setCat(b.dataset.cat,true);}});});
  refreshCartUI();}
function renderGrid(){
  var grid=document.getElementById('grid'),hd=document.getElementById('gridhd'),nr=document.getElementById('noResults');
  if(!grid)return;var q=(VIEW.q||'').trim().toLowerCase();
  if(q){
    var matches=ALLKEYS.filter(function(k){var it=BYKEY[k];return it&&((it.name+' '+it.sku).toLowerCase().indexOf(q)>=0);});
    hd.innerHTML=matches.length?('<h2 class="glbl">Search results</h2><span class="gsub">'+matches.length+' match'+(matches.length===1?'':'es')+' for “'+esc(VIEW.q)+'”</span>'):'';
    grid.innerHTML='<div class="menu">'+matches.map(menuCard).join('')+'</div>';
    nr.style.display=matches.length?'none':'';wireCards();return;}
  nr.style.display='none';
  var subs=subNames(VIEW.cat),csa=VIEW.cat==='hivis'?' <span class="csa">CSA-rated</span>':'';
  hd.innerHTML='<h2 class="glbl">'+esc(megaName(VIEW.cat))+csa+'</h2><span class="gsub">'+((VIEW.sub==='all'?TOTALS[VIEW.cat]:(BUCKETS[VIEW.cat][VIEW.sub]||[]).length))+' styles</span>';
  var inner;
  if(VIEW.sub!=='all'){inner='<div class="menu">'+(BUCKETS[VIEW.cat][VIEW.sub]||[]).map(menuCard).join('')+'</div>';}
  else if(subs.length>1&&TOTALS[VIEW.cat]>6){
    inner=subs.map(function(s){return '<div class="subgrp"><h3 class="subhd">'+esc(s)+' <span class="subn">'+BUCKETS[VIEW.cat][s].length+'</span></h3><div class="menu">'+BUCKETS[VIEW.cat][s].map(menuCard).join('')+'</div></div>';}).join('');}
  else{var flat=[];subs.forEach(function(s){flat=flat.concat(BUCKETS[VIEW.cat][s]);});inner='<div class="menu">'+flat.map(menuCard).join('')+'</div>';}
  grid.innerHTML=inner+moreCatsHtml();wireCards();}
// Bring the START of the filtered results (the grid heading) to just below the sticky header+nav. Measured
// live via getBoundingClientRect so it's accurate for any category length — fixes clicks landing at the
// footer/Instagram feed when a category re-rendered shorter.
function scrollToResults(){
  var hd=document.getElementById('gridhd');if(!hd)return;
  var hdr=document.querySelector('.hdr'),nav=document.getElementById('navwrap');
  var sticky=(hdr?hdr.offsetHeight:60)+(nav?nav.offsetHeight:0)+8;
  var y=window.pageYOffset+hd.getBoundingClientRect().top-sticky;
  window.scrollTo({top:Math.max(0,y),behavior:'smooth'});}
function setSub(sub){VIEW.sub=sub;document.querySelectorAll('.schip').forEach(function(b){b.classList.toggle('on',b.dataset.sub===sub);});renderGrid();scrollToResults();}
function setCat(cat,doScroll){
  VIEW.cat=cat;VIEW.sub='all';VIEW.q='';
  var nw=document.getElementById('navwrap');if(nw)nw.classList.remove('searching');
  var si=document.getElementById('kitSearch');if(si)si.value='';
  document.querySelectorAll('.ctab').forEach(function(t){var on=t.dataset.cat===cat;t.classList.toggle('on',on);
    if(on){var tr=t.closest('.ctabs');if(tr)tr.scrollTo({left:t.offsetLeft-tr.clientWidth/2+t.clientWidth/2,behavior:'smooth'});}});
  renderSubchips();renderGrid();
  if(doScroll)scrollToResults();}
// "Keep exploring" — after a category's grid, surface the OTHER major categories so shoppers don't stop
// after the first one (e.g. Polos). Big reason customers weren't discovering jackets/fleece/etc.
// Top item of a category (first subcategory, top-sorted) — its branded mockup becomes the category's hero thumbnail.
function catHeroKey(cat){var subs=subNames(cat);for(var i=0;i<subs.length;i++){var arr=BUCKETS[cat]&&BUCKETS[cat][subs[i]];if(arr&&arr.length)return arr[0];}return null;}
// A compact branded mockup thumbnail for a category (real product photo + the customer's logo at its placement).
function catPic(cat){var k=catHeroKey(cat);if(!k)return '';var it=BYKEY[k],vm=vmOf(k),o=overlayHtml(it,vm,vm.colour,'front');
  return '<div class="mstage"><img class="g" src="'+o.g+'" alt="'+esc(shortCat(cat))+'" loading="lazy" decoding="async">'+o.lg+'</div>';}
function moreCatsHtml(){
  var others=CATS.filter(function(c){return c!==VIEW.cat;});
  if(!others.length)return '';
  var i=CATS.indexOf(VIEW.cat),nextCat=CATS[(i+1)%CATS.length];
  if(nextCat===VIEW.cat)nextCat=others[0];
  // (1) "Up next" advance banner — one obvious tap to keep the shopper moving to the next major category.
  var banner='<div class="nextup" role="button" tabindex="0" data-cat="'+nextCat+'" aria-label="Browse '+esc(shortCat(nextCat))+' next">'+
      '<div class="nupic">'+catPic(nextCat)+'</div>'+
      '<div class="nutx"><span class="nulab">Up next</span><b>'+esc(shortCat(nextCat))+'</b>'+
        '<i>'+TOTALS[nextCat]+' styles ready with your logo</i></div>'+
      '<span class="nugo" aria-hidden="true">→</span></div>';
  // (2) Visual gallery of the remaining categories — image-led tiles beat a wall of text buttons for discovery.
  var rest=others.filter(function(c){return c!==nextCat;});
  var tiles=rest.map(function(c){return '<div class="mccard" role="button" tabindex="0" data-cat="'+c+'" aria-label="Browse '+esc(shortCat(c))+'">'+
      '<div class="mcpic">'+catPic(c)+'</div>'+
      '<div class="mctx"><b>'+esc(shortCat(c))+'</b><i>'+TOTALS[c]+' styles →</i></div></div>';}).join('');
  var gallery=tiles?'<div class="mcgrid">'+tiles+'</div>':'';
  return '<div class="morecats"><div class="mchd">Keep exploring the collection</div>'+
    '<div class="mcsub">Your logo, ready across every layer — tap a category to keep browsing.</div>'+
    banner+gallery+'</div>';}
function openSearch(){var nw=document.getElementById('navwrap');if(nw)nw.classList.add('searching');var si=document.getElementById('kitSearch');if(si){si.focus();}}
function closeSearch(){var nw=document.getElementById('navwrap');if(nw)nw.classList.remove('searching');VIEW.q='';var si=document.getElementById('kitSearch');if(si)si.value='';renderGrid();}
/* ---------- build page ---------- */
function buildStore(){
  var C=CFG.copy||{};
  buildBuckets();if(!VIEW.cat)VIEW.cat=CATS[0];
  if(!document.getElementById('jdpBenCss')){var _b=document.createElement('style');_b.id='jdpBenCss';_b.textContent=
    ".benefits{background:#fff;border-bottom:1px solid #eef0f4}"+
    ".benin{padding:24px 0 22px}"+
    ".bengrid{display:flex;justify-content:center;flex-wrap:wrap;gap:2px}"+
    ".bcell{flex:1;min-width:180px;max-width:360px;text-align:center;padding:6px 30px;position:relative}"+
    ".bcell+.bcell::before{content:'';position:absolute;left:0;top:8%;height:84%;width:1px;background:#e9ecf1}"+
    ".bcell b{display:block;font-size:clamp(28px,3.6vw,36px);font-weight:900;color:var(--a,#141821);letter-spacing:-.03em;line-height:1}"+
    ".bcell span{display:block;font-size:13px;color:#6b7686;margin-top:9px;line-height:1.45}"+
    ".bcell span strong{font-weight:800;color:#1c2431}"+
    ".mstage{position:relative}"+
    ".mvid{position:absolute;left:8px;bottom:8px;z-index:3;display:inline-flex;align-items:center;gap:5px;background:rgba(20,24,33,.82);color:#fff;border:0;border-radius:20px;padding:5px 11px;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer}"+
    ".vmodal{position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;padding:5vw;background:rgba(8,10,14,.9);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;transition:opacity .2s}"+
    ".vmodal.on{display:flex;opacity:1}"+
    ".vmodal .vwrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:14px;max-width:min(1000px,94vw)}"+
    ".vmodal video{width:100%;max-width:min(1000px,94vw);max-height:78vh;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6);background:#000;display:block}"+
    ".vmodal .vcap{color:#fff;font-weight:700;font-size:15px;text-align:center;opacity:.92}"+
    ".vmodal .vx{position:absolute;top:-52px;right:0;display:inline-flex;align-items:center;gap:7px;background:#fff;color:#141821;border:0;border-radius:999px;padding:9px 17px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35);z-index:2}"+
    ".vmodal .vx:hover{filter:brightness(.95)}.vmodal .vx:active{transform:scale(.97)}"+
    "@media(max-width:600px){.vmodal{padding:16px}.vmodal .vx{top:-44px;padding:8px 15px}.vmodal video{max-height:68vh}}"+
    ".catin{display:flex;align-items:center;gap:12px;flex-wrap:wrap}"+
    ".cpills{display:flex;gap:8px;flex-wrap:wrap;min-width:0}"+
    ".catsearch{margin-left:auto;display:flex;align-items:center;gap:7px;background:#fff;border:1px solid #e2e6ec;border-radius:22px;padding:7px 14px;color:#8a93a0}"+
    ".catsearch:focus-within{border-color:var(--a,#141821);color:var(--a,#141821)}"+
    ".catsearch input{border:0;outline:0;font:inherit;font-size:13.5px;min-width:150px;width:170px;background:transparent;color:#141821}"+
    ".subgrp{margin-top:6px}"+
    ".subhd{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#7a8493;margin:26px 2px 14px}"+
    ".subhd:after{content:'';flex:1;height:1px;background:#eceff3}"+
    ".subgrp:first-child .subhd{margin-top:8px}"+
    ".subn{flex:none;background:#f0f2f6;color:#8a93a0;border-radius:20px;padding:2px 9px;font-size:11px;letter-spacing:.02em}"+
    ".noresults{text-align:center;color:#8a93a0;font-size:15px;padding:60px 20px}"+
    "@media(max-width:640px){.catsearch{margin-left:0;width:100%}.catsearch input{width:100%;flex:1}}";
    document.head.appendChild(_b);}
  var benBand='<section class="benefits"><div class="w benin">'+
    '<div class="bengrid">'+
      '<div class="bcell"><b>58%</b><span>expect <strong>product, service, and quality to be higher</strong> when delivered by <strong>uniformed staff</strong>.</span></div>'+
      '<div class="bcell"><b>65%</b><span>say employees in uniforms give them a <strong>more positive perception</strong> of a company.</span></div>'+
      '<div class="bcell"><b>77%</b><span>of workers feel a uniform gives them a <strong>sense of pride</strong> in wearing the <strong>company brand</strong>.</span></div>'+
    '</div>'+
  '</div></section>';
  var recN=recKeysAll().length;
  var demo=!!CFG.demo,cta=CFG.cta||{};
  var heroCta = demo
    ? ('<button class="reccta" id="leadOpen1">'+esc(cta.label||'Get your store — free')+' →</button>'+(cta.phone?'<div class="herophone">or call <b>'+esc(cta.phone)+'</b></div>':''))
    : (recN?'<button class="reccta" id="addRec">★ Add our top picks <span>'+recN+' item'+(recN===1?'':'s')+'</span></button>':'');
  var html=''+
   '<header class="hdr"><div class="w hdrin">'+
     '<span class="brand"><img src="'+(((CFG.logos&&CFG.logos[0]&&CFG.logos[0].inks&&CFG.logos[0].inks.dark))||CFG.cover_logo||'img/logo-white.png')+'" onerror="this.style.display=\'none\'" alt=""><b>'+esc(CFG.client)+'</b><i>× Just Deals</i></span>'+
     '<button class="cartbtn" id="openCart"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/></svg>'+
       '<span class="lbl">Your kit</span><span class="n" id="cartN">0</span></button></div></header>'+
   '<section class="hero"><div class="w heroin">'+
     '<div class="eyb">'+(demo?'Sample store · your logo goes here':'Branded apparel · ready to order')+'</div>'+
     '<h1>'+esc(CFG.client)+"'s team store</h1>"+
     '<p class="herosub">'+(demo?'This is a live sample. Every item shows exactly where your logo goes — swap in your brand and it becomes your team’s store. Live pricing, exact quote, no obligation.':'Your logo, already on it. Pick your pieces, choose a finish, and send it over for your exact quote — no obligation, no payment now.')+'</p>'+
     heroCta+
     '<div class="herotrust"><span>Family-owned in Toronto since 1994</span><span>12,846+ teams outfitted</span><span>Ships across Canada &amp; the U.S.</span></div>'+
   '</div></section>'+
   benBand+
   '<div class="navwrap" id="navwrap">'+
     '<div class="filterbar"><div class="ctabsrow">'+
       '<div class="ctabs" id="ctabs"></div>'+
       '<button class="fsbtn" id="searchToggle" aria-label="Search products"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></button></div>'+
       '<div class="fsrow"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#8a93a0" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'+
         '<input id="kitSearch" type="search" placeholder="Search all '+ALLKEYS.length+' products…" aria-label="Search products" autocomplete="off">'+
         '<button class="fsx" id="searchClose" aria-label="Close search">Cancel</button></div>'+
     '</div>'+
     '<div class="subbar"><div class="subchips" id="subchips"></div></div>'+
   '</div>'+
   '<main class="w"><div class="gridhd" id="gridhd"></div><div class="grid" id="grid"></div>'+
     '<div class="noresults" id="noResults" style="display:none">No products match your search. Try another term.</div></main>'+
   (C.feed?('<section class="social"><div class="w"><h2 class="seclbl">Recent work — from our shop floor</h2>'+
     '<p class="socsub">'+esc(C.work_lead||'Real kits we’ve decorated for crews across the country.')+'</p>'+
     '<behold-widget feed-id="'+esc(C.feed)+'"></behold-widget></div></section>'):'')+
   '<footer><div class="w">Just Deals Promotions · Branded Workwear &amp; Safety Apparel<br>Prepared for '+esc(CFG.client)+' · Concept visuals on representative product photography · Pricing confirmed by exact quote.</div></footer>'+
   '<div class="ov" id="ov"></div>'+
   '<div class="vmodal" id="vmodal"></div>'+
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
  var ar=document.getElementById('addRec');if(ar)ar.addEventListener('click',addRecommended);
  // FILTERED BROWSE: category tabs + subcategory chips + search (one category at a time).
  renderCtabs();
  var st=document.getElementById('searchToggle');if(st)st.addEventListener('click',openSearch);
  var sc=document.getElementById('searchClose');if(sc)sc.addEventListener('click',closeSearch);
  var si=document.getElementById('kitSearch');
  if(si){si.addEventListener('input',function(){VIEW.q=si.value;renderGrid();});
    si.addEventListener('keydown',function(e){if(e.key==='Escape')closeSearch();});}
  setCat(VIEW.cat,false);       // initial focused render
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(mediaOpen())closeMedia();else closeAll();}});
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
      '<p class="leadsub">Tell us about your team and we’ll build a store like this — your logo, your colours, your gear — and with <b>live pricing</b> and an exact quote — no obligation.</p>'+
      '<ul class="leadben"><li>Your logo on real gear</li><li>Your team’s colours &amp; sizes</li><li>Live pricing · no minimum beyond 12 pcs</li></ul>'+
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
var SH={key:null,colour:null,face:'front',D:{},qty:12,showExtra:false,fit:'mens'};
var METHOD_OPTS=[
  {m:'embroidery',c:1,lab:'Embroidery',sub:'Stitched in thread — premium & long-lasting. Best on polos, jackets & vests.'},
  {m:'screen',c:1,lab:'Screen print — 1 colour',sub:'Your logo printed in one solid ink — best value on tees & hi-vis.'},
  {m:'screen',c:2,lab:'Screen print — 2 colour',sub:'Printed in two inks — a little more of your logo’s detail.'},
  {m:'heat_transfer',c:1,lab:'Heat transfer',sub:'Full-colour design pressed on with heat — best for detailed logos & rain gear.'}
];
var MENS_SIZES=['S','M','L','XL','2XL','3XL'],WOMENS_SIZES=['XS','S','M','L','XL','2XL'];
var ALLSIZES=['XS','S','M','L','XL','2XL','3XL'];
function sheetSizes(){return (SH.fit==='womens')?WOMENS_SIZES:MENS_SIZES;}
function sizeTotal(sz){sz=sz||SH.sizes||{};var t=0;for(var k in sz){t+=parseInt(sz[k],10)||0;}return t;}
function effQty(){var t=sizeTotal();return t>0?t:(SH.baseQty||0);}
// The next price tier above q (or null). Used to nudge orders up to the next volume break.
function nextTier(q){var t=CFG.pricing.cols||[];for(var i=0;i<t.length;i++){if(q<t[i])return t[i];}return null;}
function savingsNudge(key,decos,q){var nt=nextTier(q);if(!nt)return null;var a=unitPrice(key,decos,q),b=unitPrice(key,decos,nt);var pct=a>0?Math.round((1-b/a)*100):0;if(pct<=0)return null;return {need:nt-q,tier:nt,pct:pct};}
function sizesSummary(c){if(!c||!c.sizes)return '';return ALLSIZES.filter(function(s){return c.sizes[s];}).map(function(s){return s+' '+c.sizes[s];}).join(' · ');}
function openSheet(key){
  var item=BYKEY[key],vm=vmOf(key),ex=CART[key],exmap={};
  if(ex&&ex.decos){ex.decos.forEach(function(d){exmap[d.pl]=d;});}
  // Size breakdown is the ONLY quantity control. baseQty preserves the count of an item that was
  // quick-started without a size split (e.g. the recommended kit) so reopening it doesn't lose it.
  var exfit=(ex&&ex.fit)||'mens';
  SH={key:key,colour:(ex&&ex.colour)||vm.colour,face:'front',D:{},showExtra:false,sizes:{},fit:exfit,baseQty:ex?(ex.sizes?0:(ex.qty||moq())):moq()};
  // if the saved colour isn't in the active fit's colour set, fall back to that set's first colour
  var _cc=curColsOf(item,SH.fit);if(!colInList(_cc,SH.colour)||colInList(_cc,SH.colour).name!==SH.colour)SH.colour=_cc[0].name;
  sheetSizes().forEach(function(s){SH.sizes[s]=(ex&&ex.sizes&&ex.sizes[s])||0;});
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
  return unitPrice(SH.key,decos,effQty());   // ALWAYS price at the current quantity — keeps finish prices in sync with the size step + footer
}
// Our recommended decoration for a placement (from the build) — used to guide the customer.
function recFor(pl){var d=recDecos(SH.key).filter(function(x){return x.pl===pl;})[0];return d?{m:d.method||'embroidery',c:d.colours||1}:{m:'embroidery',c:1};}
function isRec(pl,opt){var r=recFor(pl);return opt.m===r.m&&(opt.m!=='screen'||opt.c===(r.c||1));}
// A "choose one" finish group for a location (Uber-Eats style radio rows). The recommended finish is
// tagged so an unsure customer has clear guidance; each row explains the method in plain language.
function finishGroup(pl,primary){
  var rows='';
  // Finish options are shown as a price DELTA against a fixed baseline (not competing absolute /pc numbers,
  // which is what confused customers vs the size step). Baseline: primary spot = its recommended finish;
  // extra spots = "no logo" (so adding one reads as a clear "+$x/pc"). The live absolute price stays in the footer.
  var recm=recFor(pl);
  var base= primary ? priceIf(pl,{m:recm.m,c:recm.c},true)
    : (function(){var offD=sheetDecos().map(function(x){return x.pl===pl?{pl:pl,on:false,lg:x.lg,ink:x.ink,method:x.method,colours:x.colours}:x;});return unitPrice(SH.key,offD,effQty());})();
  function tag(u){var d=Math.round((u-base)*100)/100;return Math.abs(d)<0.005
    ?'<span class="fp inc">Included</span>'
    :'<span class="fp">'+(d>0?'+':'−')+money(Math.abs(d))+'<i>/pc</i></span>';}
  if(!primary){var off=!SH.D[pl].on;
    rows+='<button class="frow'+(off?' on':'')+'" data-pl="'+pl+'" data-off="1"><span class="fr"></span>'+
      '<span class="ft"><b>No logo here</b></span><span class="fp inc">Included</span></button>';}
  METHOD_OPTS.forEach(function(opt){var sel=decoIsSel(pl,opt),u=priceIf(pl,opt,true),rec=isRec(pl,opt);
    rows+='<button class="frow'+(sel?' on':'')+'" data-pl="'+pl+'" data-m="'+opt.m+'" data-c="'+opt.c+'">'+
      '<span class="fr"></span><span class="ft"><b>'+opt.lab+(rec?' <span class="frec">★ Recommended</span>':'')+'</b><span>'+opt.sub+'</span></span>'+
      tag(u)+'</button>';});
  return rows;
}
function renderSheet(){
  var item=BYKEY[SH.key];
  if(!document.getElementById('jdpStepCss')){var _st=document.createElement('style');_st.id='jdpStepCss';_st.textContent=
    ".step{margin-top:22px;padding-top:20px;border-top:1px solid #eee}"+
    ".shb .step:first-of-type{border-top:0;margin-top:4px;padding-top:0}"+
    ".steph{display:flex;align-items:center;gap:10px;margin-bottom:13px}"+
    ".stepn{flex:none;width:26px;height:26px;border-radius:50%;background:var(--a,#E0801A);color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center}"+
    ".stept{font-weight:800;font-size:16px;color:#141414;flex:1}"+
    ".steph i{font-style:normal;color:#8a8a8a;font-size:13px;font-weight:600}"+
    ".pthead{font-size:12px;color:#8a8a8a;margin:16px 0 8px;font-weight:600}"+
    ".shprice{display:flex;align-items:center;justify-content:space-between;padding:2px 2px 10px;font-size:14px;color:#555}"+
    ".shprice b{color:#141414;font-size:18px;font-weight:800}"+
    ".shprice.under,.shprice.under b{color:#c0392b}"+
    ".shnote{margin:22px 2px 2px;font-size:11.5px;line-height:1.6;color:#9a9a9a}"+
    ".shfrom{margin:7px 0 4px;font-size:14px;color:#666;font-weight:600}.shfrom b{color:#141414;font-size:17px;font-weight:800}.shfrom small{color:#8a8a8a;font-weight:600}"+
    ".fp.inc{color:#2e7d32;font-weight:700}"+
    ".fittog{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 2px}"+
    ".fitl{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8a8a8a;margin-right:2px}"+
    ".fitb{border:1.5px solid #e2e6ec;background:#fff;color:#141414;border-radius:22px;padding:8px 18px;font:inherit;font-weight:700;font-size:13.5px;cursor:pointer}"+
    ".fitb.on{border-color:var(--a,#141821);background:var(--a,#141821);color:#fff}"+
    ".fitnote{flex-basis:100%;font-size:11.5px;color:#8a8a8a;margin-top:4px}"+
    ".fitbadge{display:inline-block;background:var(--a,#141821);color:#fff;border-radius:5px;padding:1px 7px;font-size:10.5px;font-weight:800;letter-spacing:.02em;vertical-align:middle}"+
    ".unitag{border:1.5px solid var(--a,#141821);color:var(--a,#141821);border-radius:22px;padding:7px 16px;font-weight:800;font-size:13px;letter-spacing:.03em}";
    document.head.appendChild(_st);}
  var cols=curColsOf(item,SH.fit);
  var curPlaces=(SH.fit==='womens'&&item.wplaces&&item.wplaces.length)?item.wplaces:item.places;
  var o=overlayHtml(item,{decos:sheetDecos()},SH.colour,SH.face,cols,curPlaces);var hasBack=o.hasBack;
  var chips=cols.map(function(c){return '<button class="cchip'+(c.name===SH.colour?' on':'')+'" data-col="'+esc(c.name)+'" style="background-image:url('+gurl(c.front)+')" title="'+esc(c.name)+'"></button>';}).join('');
  var fitTog=item.womens?('<div class="fittog"><span class="fitl">Fit</span>'+
    '<button class="fitb'+(SH.fit==='mens'?' on':'')+'" data-fit="mens">Men’s</button>'+
    '<button class="fitb'+(SH.fit==='womens'?' on':'')+'" data-fit="womens">Women’s</button>'+
    (SH.fit==='womens'&&!(item.wcols&&item.wcols.length)?'<span class="fitnote">Ladies’ cut confirmed with your quote</span>':'')+
    '</div>'):(item.unisex?'<div class="fittog"><span class="fitl">Fit</span><span class="unitag">Unisex</span><span class="fitnote">One unisex cut — fits everyone</span></div>':'');
  var faceTog=hasBack?'<div class="ftog"><button class="pchip'+(SH.face==='front'?' on':'')+'" data-face="front">Front</button><button class="pchip'+(SH.face==='back'?' on':'')+'" data-face="back">Back</button></div>':'';
  var logoPlaces=(item.places||[]).filter(function(p){return p.logo;});
  var primary=logoPlaces[0],extras=logoPlaces.slice(1);
  var primaryHtml=primary?('<section class="step"><div class="steph"><span class="stepn">3</span><span class="stept">Logo finish</span><i>'+esc(primary.label)+'</i></div>'+
      '<div class="ghelp">Not sure? Go with the ★ Recommended finish — we’ll confirm it with your quote.</div>'+
      '<div class="frows">'+finishGroup(primary.id,true)+'</div></section>'):'';
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
  var grid=sheetSizes().map(function(s){return '<div class="szrow"><span class="szl">'+s+'</span>'+
    '<div class="qty sm szqty"><button data-sz="'+s+'" data-d="-1" aria-label="Less '+s+'">–</button><input class="szin" data-sz="'+s+'" type="number" inputmode="numeric" value="'+(SH.sizes[s]||0)+'" min="0"><button data-sz="'+s+'" data-d="1" aria-label="More '+s+'">+</button></div></div>';}).join('');
  var totHint = under ? (' <span>· add '+(moq()-q)+' more to reach the '+moq()+' minimum</span>')
    : (sizeTotal()===0&&SH.baseQty>0 ? ' <span>· set your split below (optional)</span>' : '');
  var qtyGrp='<section class="step"><div class="steph"><span class="stepn">2</span><span class="stept">How many of each size?</span><i>'+moq()+' min</i></div>'+
    '<div class="szgrid">'+grid+'</div>'+
    '<div class="sztot'+(under?' under':'')+'">Total <b>'+q+' pcs</b>'+totHint+'</div>'+
    '<div class="pthead">Price per piece — the more you order, the less each costs</div>'+
    '<div class="ptable">'+ptable+'</div>'+nudHtml+'</section>';
  var canAdd=q>=moq();
  // Preserve the customiser's scroll position across re-renders so tapping a finish / size doesn't jump.
  var _prev=document.querySelector('#sheet .shscroll'),_top=_prev?_prev.scrollTop:0;
  var fromP=unitPrice(SH.key,decos,topcol);
  var step1='<section class="step"><div class="steph"><span class="stepn">1</span><span class="stept">Select a colour</span><i>'+esc(SH.colour)+'</i></div><div class="cchips">'+chips+'</div></section>';
  var priceClar=canAdd
    ? '<div class="shprice"><span>'+q+' pcs × '+money(unit)+'/pc</span><b>'+money(line)+' total</b></div>'
    : '<div class="shprice under"><span>Minimum '+moq()+' pieces</span><b>add '+(moq()-q)+' more</b></div>';
  document.getElementById('sheet').innerHTML=
    '<button class="shx" id="shx" aria-label="Close">✕</button>'+
    '<div class="shscroll">'+
      '<div class="shimg" id="shimg"><div class="shstage"><img class="g" src="'+o.g+'" alt="">'+o.lg+'</div>'+faceTog+'</div>'+
      ((item.scenic||item.video)?('<div class="shmedia">'+
        (item.scenic?'<button class="shworn" id="shworn" aria-label="See it worn"><img src="'+gurl(item.scenic)+'" alt="" loading="lazy"><span class="swt"><b>See it worn</b><i>real in-the-field photo</i></span><span class="swgo">→</span></button>':'')+
        (item.video?'<button class="vwatch" id="vwatch"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Watch video</button>':'')+
      '</div>'):'')+
      '<div class="shb"><h2>'+esc(item.name)+'</h2><div class="shsku">'+esc(item.sku)+(item.womens?(SH.fit==='womens'?' · Ladies’':' · Men’s'):(item.unisex?' · Unisex':''))+(item.layer==='field'?' · CSA hi-vis':'')+'</div>'+
      '<div class="shfrom">from <b>'+money(fromP)+'</b> <small>/pc</small> · decorated</div>'+
      (item.blurb?'<p class="shblurb">'+esc(item.blurb)+'</p>':'')+
      fitTog+step1+qtyGrp+primaryHtml+extraHtml+
      '<div class="shnote">Prices are per piece, decorated — your logo (embroidery / print) is included. One-time setup shows once in your kit summary. Exact quote confirmed before anything runs.</div>'+
    '</div></div>'+
    '<div class="shfoot">'+priceClar+
      '<button class="shaddbtn" id="shAdd"'+(canAdd?'':' disabled')+'><span>'+(canAdd?(CART[SH.key]?'Update kit':'Add to kit'):('Add '+moq()+'+ pieces'))+'</span><span class="p">'+money(line)+'</span></button>'+
      '<div class="shtrust">✓ Live pricing · exact quote · no obligation · no payment now</div></div>';
  var sh=document.getElementById('sheet');
  document.getElementById('shx').addEventListener('click',closeAll);
  var vw=document.getElementById('vwatch');if(vw)vw.addEventListener('click',function(){openVideo(item.video,item.name);});
  var sw=document.getElementById('shworn');if(sw)sw.addEventListener('click',function(){openScenic(gurl(item.scenic),item.name);});
  sh.querySelectorAll('.cchip').forEach(function(b){b.addEventListener('click',function(){SH.colour=b.dataset.col;swapPreview();renderSheet();});});
  sh.querySelectorAll('[data-face]').forEach(function(b){b.addEventListener('click',function(){SH.face=b.dataset.face;renderSheet();});});
  sh.querySelectorAll('[data-fit]').forEach(function(b){b.addEventListener('click',function(){
    if(SH.fit===b.dataset.fit)return;SH.fit=b.dataset.fit;
    var cc=curColsOf(item,SH.fit);var cur=colInList(cc,SH.colour);if(!cur||cur.name!==SH.colour)SH.colour=cc[0].name;
    var keep=SH.sizes||{};SH.sizes={};sheetSizes().forEach(function(s){SH.sizes[s]=keep[s]||0;});
    swapPreview();renderSheet();});});
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
  var entry={qty:q,colour:SH.colour,decos:decos,fit:SH.fit};
  var sz={};sheetSizes().forEach(function(s){if(SH.sizes[s])sz[s]=SH.sizes[s];});
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
// The curated "top picks" set = items flagged rec across every category (not the whole catalogue — a
// full dump overwhelms and inflates the quote). Falls back to the first few office items if none flagged.
function recKeysAll(){var order=CFG.order||{},cats=['office','field','premium','bags'],out=[];
  cats.forEach(function(c){(order[c]||[]).forEach(function(k){if(BYKEY[k]&&BYKEY[k].rec&&out.indexOf(k)<0)out.push(k);});});
  if(!out.length)out=(order.office||[]).filter(function(k){return BYKEY[k];}).slice(0,4);
  return out;}
function addRecommended(){
  var keys=recKeysAll(),n=0;
  keys.forEach(function(k){if(CART[k]||!BYKEY[k])return;
    CART[k]={qty:moq(),colour:vmOf(k).colour,decos:recCartDecos(k)};n++;});
  saveCart();refreshCartUI();openCart();
  toast(n?('Added '+n+' top pick'+(n===1?'':'s')+' — edit or add more anytime'):'Your kit already has our top picks');
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
function fitLabel(c){return (c&&c.fit==='womens')?'Women’s':'';}
function fitTag(it,c){if(c&&c.fit==='womens')return 'Women’s';if(it&&it.unisex)return 'Unisex';return '';}
function fitSku(it,c){return (c&&c.fit==='womens'&&it&&it.wsku)?it.wsku:((it&&it.msku)||'');}
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
  var items=keys.map(function(k){var it=BYKEY[k];if(!it)return '';var c=CART[k];var col=colInList(curColsOf(it,c.fit),c.colour);
    var unit=unitPrice(k,c.decos,c.qty);var szsum=sizesSummary(c);var nud=savingsNudge(k,c.decos,c.qty);
    var fitb=fitTag(it,c)?'<span class="fitbadge">'+fitTag(it,c)+'</span> ':'';
    var ctrl='<button class="editln" data-edit="'+k+'">'+c.qty+' pcs · '+(c.sizes?'by size':'add sizes')+' ✎</button>';
    return '<div class="ci" data-key="'+k+'"><div class="t" style="background-image:url('+gurl(col.front)+')"></div>'+
      '<div class="d"><h4>'+esc(it.name)+'</h4><div class="sub">'+fitb+esc(c.colour)+' · '+esc(decoSummary(it,c))+(szsum?'<br><span class="szln">Sizes: '+esc(szsum)+'</span>':'')+'</div>'+
      (nud?'<div class="cinudge">＋'+nud.need+' to reach '+nud.tier+'+ · save '+nud.pct+'%</div>':'')+
      '<div class="row">'+ctrl+'<div class="lp">'+money(unit*c.qty)+'</div></div></div>'+
      '<button class="rm" data-rm="'+k+'" aria-label="Remove">✕</button></div>';}).join('');
  var body=keys.length?items:('<div class="cempty"><div class="ce-ic">🛒</div><b>Your kit is empty</b><span>Add a few pieces to get your exact quote.</span>'+(recKeysAll().length?'<button class="ceadd" id="emptyAddRec">★ Add our top picks</button>':'')+'</div>');
  var setupRows=setupBreakdown(),setup=setupRows.reduce(function(t,x){return t+x.amount;},0);
  var brk=setupRows.length?('<details class="setupbrk"><summary>One-time setup '+money(setup)+' <i>· once per design, shared across the kit</i></summary>'+setupRows.map(function(x){return '<div class="sbk"><span>'+esc(x.label)+'</span><span>'+money(x.amount)+'</span></div>';}).join('')+'</details>'):'';
  document.getElementById('cart').innerHTML=
    '<div class="carth"><h2>Your kit</h2><button class="cartx" id="cartx" aria-label="Close">✕</button></div>'+
    '<div class="citems" id="citems">'+body+'</div>'+
    (keys.length?('<div class="cartf">'+
      '<div class="crow"><span>Estimated subtotal</span><b>'+money(sub)+'</b></div>'+
      (setup>0?brk:'')+
      '<div class="csetup">Decorated, per piece — embroidery, screen &amp; heat-transfer priced in. Setup is once per logo &amp; location, reused across the kit. Exact itemised quote confirmed before anything runs.</div>'+
      '<button class="checkout" id="checkout">Get my exact quote <span class="ar">→</span></button>'+
      '<div class="cktrust"><span>No payment now</span><span>No obligation</span><span>No minimum beyond 12 pcs</span></div></div>'):'')+
    '';
  document.getElementById('cartx').addEventListener('click',closeAll);
  var ck=document.getElementById('checkout');if(ck)ck.addEventListener('click',openCheckout);
  var ea=document.getElementById('emptyAddRec');if(ea)ea.addEventListener('click',function(){addRecommended();});
  document.querySelectorAll('.ci').forEach(function(ci){var k=ci.dataset.key;
    var ed=ci.querySelector('[data-edit]');if(ed)ed.addEventListener('click',function(){editItem(k);});
    ci.querySelector('[data-rm]').addEventListener('click',function(){delete CART[k];saveCart();renderCart();refreshCartUI();});
  });
}
function editItem(k){document.getElementById('cart').classList.remove('on');openSheet(k);}
// Close ONLY the media lightbox and return to whatever is underneath (the product sheet) — not the whole store.
function mediaOpen(){var m=document.getElementById('vmodal');return !!(m&&m.classList.contains('on'));}
function closeMedia(){var m=document.getElementById('vmodal');if(!m)return;m.classList.remove('on');m.onclick=null;
  setTimeout(function(){if(!m.classList.contains('on'))m.innerHTML='';},260);
  var under=['sheet','cart','lead'].some(function(id){var e=document.getElementById(id);return e&&e.classList.contains('on');});
  document.body.style.overflow=under?'hidden':'';}
// Lifestyle/scenic image in a clean lightbox (reuses the video modal chrome) — keeps it out of the buy flow.
function openScenic(src,title){var m=document.getElementById('vmodal');if(!m||!src)return;
  m.innerHTML='<div class="vwrap"><button class="vx" id="vx" aria-label="Close">✕ Close</button>'+
    '<img class="vscenic" src="'+esc(src)+'" alt="'+esc(title||'')+'">'+
    (title?'<div class="vcap">'+esc(title)+' — in the field</div>':'')+'</div>';
  m.classList.add('on');document.body.style.overflow='hidden';
  var vx=document.getElementById('vx');if(vx)vx.addEventListener('click',closeMedia);
  m.onclick=function(e){if(e.target===m)closeMedia();};
  var w=m.querySelector('.vwrap');if(w)w.addEventListener('click',function(e){e.stopPropagation();});}
// Cloudinary on-the-fly transforms: cap to 720p, auto quality, force H.264 (hardware-decoded = smooth on
// phones). Cuts the file ~60% vs the original and adds an instant first-frame poster. muted = autoplay is
// actually allowed on mobile (unmuted autoplay is blocked, which made the player look broken).
function vTransform(src,t){var i=src.indexOf('/video/upload/');return i<0?src:src.slice(0,i+14)+t+'/'+src.slice(i+14);}
function openVideo(src,title){var m=document.getElementById('vmodal');if(!m||!src)return;
  var opt=vTransform(src,'q_auto,w_720,c_limit,vc_h264');
  var poster=/\.mp4($|\?)/i.test(src)?vTransform(src,'so_0,q_auto,w_720,c_limit').replace(/\.mp4/i,'.jpg'):'';
  m.innerHTML='<div class="vwrap"><button class="vx" id="vx" aria-label="Close video">✕ Close</button>'+
    '<video src="'+esc(opt)+'"'+(poster?' poster="'+esc(poster)+'"':'')+' controls autoplay muted playsinline preload="auto" webkit-playsinline></video>'+
    (title?'<div class="vcap">'+esc(title)+'</div>':'')+'</div>';
  m.classList.add('on');document.body.style.overflow='hidden';
  var v=m.querySelector('video');if(v){var p=v.play();if(p&&p.catch)p.catch(function(){});}
  var vx=document.getElementById('vx');if(vx)vx.addEventListener('click',closeMedia);
  // Click the dark backdrop (anywhere outside the player) to close; clicks on the player itself don't.
  m.onclick=function(e){if(e.target===m)closeMedia();};
  var w=m.querySelector('.vwrap');if(w)w.addEventListener('click',function(e){e.stopPropagation();});}
function closeAll(){['ov','sheet','cart','lead','vmodal'].forEach(function(id){var e=document.getElementById(id);if(e)e.classList.remove('on');});var mv=document.getElementById('vmodal');if(mv)mv.innerHTML='';document.body.style.overflow='';}

/* ---------- checkout: capture contact + send the kit for an exact quote ---------- */
var JDP_EMAIL='steven@justdealspromotions.com';
function contactVals(){return {
  name:((document.getElementById('coName')||{}).value||'').trim(),
  email:((document.getElementById('coEmail')||{}).value||'').trim(),
  company:((document.getElementById('coCompany')||{}).value||'').trim(),
  note:((document.getElementById('coNote')||{}).value||'').trim()};}
function persistContact(c){try{localStorage.setItem('jdpkit_contact',JSON.stringify({name:c.name,email:c.email,company:c.company}));}catch(e){}}
function orderText(c){c=c||{};
  var lines=['KIT REQUEST — '+CFG.client,''];
  if(c.name||c.email||c.company){lines.push('From:');
    if(c.name)lines.push('  Name: '+c.name);
    if(c.company)lines.push('  Company/team: '+c.company);
    if(c.email)lines.push('  Email: '+c.email);
    lines.push('');}
  Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it)return;var cc=CART[k];var u=unitPrice(k,cc.decos,cc.qty);
    lines.push('• '+it.name+(fitSku(it,cc)?' '+fitSku(it,cc):'')+' ('+it.sku+') — '+(fitTag(it,cc)?fitTag(it,cc)+' · ':'')+cc.colour+' · '+decoSummary(it,cc)+' · qty '+cc.qty+' @ '+money(u)+' ea = '+money(u*cc.qty));
    var ss=sizesSummary(cc);if(ss)lines.push('    sizes: '+ss);});
  lines.push('','Estimated subtotal: '+money(cartSubtotal()));
  var sb=setupBreakdown();
  if(sb.length){lines.push('One-time setup: '+money(cartSetup())+'  (once per design, shared across the kit)');
    sb.forEach(function(x){lines.push('   - '+x.label+': '+money(x.amount));});}
  lines.push('(Decoration priced in; exact quote to be confirmed.)');
  if(c.note)lines.push('','Notes: '+c.note);
  lines.push('','Kit link: '+location.href.split('#')[0].split('?')[0]);
  return lines.join('\n');
}
function openCheckout(){
  var n=cartCount(),sub=cartSubtotal(),setup=cartSetup();var saved={};
  try{saved=JSON.parse(localStorage.getItem('jdpkit_contact')||'{}');}catch(e){}
  document.getElementById('cart').innerHTML=
    '<div class="carth"><button class="cartback" id="cartback" aria-label="Back">‹</button><h2>Your exact quote</h2><button class="cartx" id="cartx" aria-label="Close">✕</button></div>'+
    '<div class="citems"><div class="co">'+
      '<div class="cohow"><div class="costep"><b>1</b><span>Pick your gear</span></div><div class="costep"><b>2</b><span>Get your exact quote</span></div><div class="costep"><b>3</b><span>Approve &amp; we produce</span></div></div>'+
      '<div class="cosum"><span>'+n+' item'+(n===1?'':'s')+' · est. <b>'+money(sub)+'</b>'+(setup>0?' + '+money(setup)+' setup':'')+'</span><button class="cosumedit" id="cosumedit">Edit ‹</button></div>'+
      '<div class="coform">'+
        '<input id="coName" placeholder="Your name" autocomplete="name" value="'+esc(saved.name||'')+'">'+
        '<input id="coEmail" type="email" inputmode="email" placeholder="Email — where we send your quote" autocomplete="email" value="'+esc(saved.email||'')+'">'+
        '<input id="coCompany" placeholder="Company / team" autocomplete="organization" value="'+esc(saved.company||CFG.client||'')+'">'+
        '<textarea id="coNote" placeholder="Anything to add? Deadlines, sizes, other items…"></textarea>'+
      '</div>'+
    '</div></div>'+
    '<div class="cartf">'+
      '<button class="checkout" id="emailKit">Send my kit — get my quote <span class="ar">→</span></button>'+
      '<button class="copyalt" id="copyKit">or copy my kit to paste into a reply</button>'+
      '<div class="cktrust" id="copyHint"><span>No payment now</span><span>No obligation</span><span>No minimum beyond 12 pcs</span></div></div>';
  document.getElementById('cartx').addEventListener('click',closeAll);
  document.getElementById('cartback').addEventListener('click',openCart);
  document.getElementById('cosumedit').addEventListener('click',openCart);
  document.getElementById('emailKit').addEventListener('click',submitKit);
  document.getElementById('copyKit').addEventListener('click',copyKit);
}
function clipCopy(s){if(navigator.clipboard&&navigator.clipboard.writeText){try{navigator.clipboard.writeText(s);return;}catch(e){}}
  var ta=document.createElement('textarea');ta.value=s;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);}
// PROPER form-to-inbox: POST the kit + contact straight to JDP's inbox (FormSubmit) — no reliance on the
// visitor's email app. If the request fails for any reason, fall back to a prefilled email + clipboard copy
// so a lead is never lost.
function submitKit(){
  var c=contactVals();
  if(!c.email||c.email.indexOf('@')<1){var e=document.getElementById('coEmail');if(e){e.classList.add('err');e.focus();}
    toast('Add your email so we can send your quote');return;}
  persistContact(c);var body=orderText(c);
  var btn=document.getElementById('emailKit');if(btn){btn.disabled=true;btn.dataset.lbl=btn.innerHTML;btn.innerHTML='Sending…';}
  var subj='Kit request — '+(c.company||CFG.client)+(c.name?' — '+c.name:'');
  var payload={name:c.name||'(not given)',email:c.email,company:c.company||CFG.client||'',
    _subject:subj,_template:'table',_captcha:'false',kit:body,kit_link:location.href.split('#')[0].split('?')[0]};
  var done=false,fell=false;
  function fail(){if(done||fell)return;fell=true;mailtoFallback(c,body,subj);}
  var to=setTimeout(fail,9000);   // network stalls -> fallback, never leave them stuck
  fetch('https://formsubmit.co/ajax/'+JDP_EMAIL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){return r.json().catch(function(){return {};});})
    .then(function(j){clearTimeout(to);if(fell)return;done=true;
      if(j&&String(j.success)==='true'){checkoutSuccess(c);}else{fail();}})
    .catch(function(){clearTimeout(to);fail();});
}
function mailtoFallback(c,body,subj){
  clipCopy(body);
  var btn=document.getElementById('emailKit');if(btn){btn.disabled=false;btn.innerHTML=btn.dataset.lbl||'Send my kit — get my quote <span class="ar">→</span>';}
  var hint=document.getElementById('copyHint');if(hint)hint.innerHTML='<span>Opening your email — just hit send ✓</span><span>Didn’t open? Your kit is copied — email '+JDP_EMAIL+'</span>';
  window.location.href='mailto:'+JDP_EMAIL+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);
}
function checkoutSuccess(c){
  var first=c.name?esc(c.name.split(' ')[0]):'';
  document.getElementById('cart').innerHTML=
    '<div class="carth"><h2>Request sent</h2><button class="cartx" id="cartx" aria-label="Close">✕</button></div>'+
    '<div class="citems"><div class="cosent"><div class="csent-ic">✓</div>'+
      '<h3>Your kit is on its way'+(first?', '+first:'')+'!</h3>'+
      '<p>We’ve got your picks and will reply to <b>'+esc(c.email)+'</b> with your exact quote. No payment now — no obligation.</p>'+
      '<button class="checkout" id="sentdone">Keep browsing</button></div></div>';
  document.getElementById('cartx').addEventListener('click',closeAll);
  document.getElementById('sentdone').addEventListener('click',closeAll);
}
function copyKit(){
  var c=contactVals();persistContact(c);var txt=orderText(c);clipCopy(txt);
  var btn=document.getElementById('copyKit'),hint=document.getElementById('copyHint');
  if(btn)btn.textContent='✓ Copied — paste it into your reply to us';
  if(hint)hint.innerHTML='<span>Copied to your clipboard.</span><span>Paste (Ctrl/⌘+V) into your reply, or email '+JDP_EMAIL+'</span>';
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
// Keep the accent readable: a near-white / very light brand colour is invisible as text on the
// white UI and washes out on accent buttons, so darken it toward a legible luminance (hue preserved).
function safeAccent(hex){hex=(hex||'').replace('#','');if(hex.length<6)return '#'+(hex||'1d6fe0');
  var r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  var lum=0.299*r+0.587*g+0.114*b,guard=0;
  while(lum>176&&guard++<12){r=Math.round(r*0.9);g=Math.round(g*0.9);b=Math.round(b*0.9);lum=0.299*r+0.587*g+0.114*b;}
  function h(x){x=Math.max(0,Math.min(255,x)).toString(16);return x.length<2?'0'+x:x;}
  return '#'+h(r)+h(g)+h(b);}
function go(cfg){
  CFG=cfg;
  if(cfg.accent)document.documentElement.style.setProperty('--a',safeAccent(cfg.accent));
  document.title=(cfg.client||'Branded Apparel')+' — Team Store · Just Deals Promotions';
  renderSkeleton(cfg);
  // no-cache: always revalidate the shared catalogue so customers get the current products/photos
  // (returns 304 when unchanged). Image URLs are versioned via CATVER below.
  fetch((cfg.catalog_base||CATALOG_BASE)+'/catalog.json?v='+(cfg.ver||'1'),{cache:'no-cache'}).then(function(r){return r.json();}).then(function(cat){
    CFG.catalog_base=cfg.catalog_base||CATALOG_BASE;CAT=cat;CATVER=cat.version||cat.v||'';(cat.items||[]).forEach(function(it){BYKEY[it.key]=it;});
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
