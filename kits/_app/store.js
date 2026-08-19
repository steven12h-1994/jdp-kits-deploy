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
// Possessive of a company name: names ending in s take a bare apostrophe ("Toronto Airways' team
// store", not "Toronto Airways's"). Common across the fleet — Airways, Solutions, Services, Brothers.
function poss(s){var n=String(s==null?'':s).replace(/\s+$/,'');if(!n)return n;return n+(/[sS]$/.test(n)?"'":"'s");}
function hexLum(h){h=(h||'').replace('#','');if(h.length<6)return 128;return 0.299*parseInt(h.slice(0,2),16)+0.587*parseInt(h.slice(2,4),16)+0.114*parseInt(h.slice(4,6),16);}
function hexSat(h){h=(h||'').replace('#','');if(h.length<6)return 0;var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return Math.max(r,g,b)-Math.min(r,g,b);}
// A single spot print must READ on the garment: crisp WHITE on dark garments AND on saturated hi-vis
// (orange/lime — bright but vivid, where white pops); a very light garment would swallow white so use
// a dark ink; otherwise the full-colour brand mark.
function autoInk(rgb){var l=hexLum(rgb),s=hexSat(rgb);if(l<120||s>=70)return 'white';if(l>210)return 'dark';return 'brand';}
// EMBROIDERY = full-colour thread -> render the full-colour (brand) logo. Screen/heat-transfer default
// to a contrast ink (white on dark/hi-vis, dark on very light, full colour otherwise).
// EXCEPTION, and the reason INK exists: "always brand" fails whenever a NEUTRAL mark sits on a garment
// of the same value. shott-earthworks ships white-ink source art that the builder normalises to near-black
// letterforms, so every navy and black garment rendered a logo you could not read; a white wordmark on a
// white polo is the same bug mirrored. Real embroidery solves this with white thread on navy, so we pick
// the reverse variant when the brand artwork fails a 3:1 contrast ratio against the garment.
// A SATURATED brand colour is never touched — red thread on navy reads fine and it is the customer's
// actual brand; only the neutrals get rescued.
var INK={},INK_MINRATIO=3.0,INK_MAXSAT=45;
function srgbLin(c){c=c/255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function relLum(r,g,b){return 0.2126*srgbLin(r)+0.7152*srgbLin(g)+0.0722*srgbLin(b);}
function contrast(a,b){var hi=Math.max(a,b),lo=Math.min(a,b);return (hi+0.05)/(lo+0.05);}
function hexRelLum(hex){var h=String(hex||'').replace('#','');if(h.length!==6)return 1;
  return relLum(parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16));}
function autoInkFor(method,rgb,logo){
  if(method!=='embroidery')return autoInk(rgb);
  var k=logo&&INK[logo.id];
  if(!k)return 'brand';
  var gl=hexRelLum(rgb);
  if(k.sat<=INK_MAXSAT&&contrast(k.lum,gl)<INK_MINRATIO)return gl<0.18?'white':'dark';
  return 'brand';
}
/* ---- Vibrant, brand-aware colourways -------------------------------------------------------
   Every store used to open as a wall of black. 169 of 353 items defaulted to Black and 68% of the
   accessories did, because the build-time picker scored ONLY for logo legibility: it paid a bonus for
   neutrals and a penalty for any saturated garment, so "safe" always won. That produces defensible
   mockups and a lifeless shop, and a lifeless shop does not sell a branded-apparel program.

   This pass re-picks the colour each item OPENS on, at boot, from the client's own palette, and then
   deliberately varies it down the grid. Three rules, in priority order:
     1. LEGIBILITY is still absolute — a colourway where no ink can read is never offered.
     2. Prefer the client's brand hues, then rich colour, then neutrals, and treat black as the
        fallback rather than the default.
     3. No colour family may repeat inside a short sliding window, so a section reads as an assortment
        instead of nine identical navy polos.

   Hi-vis field gear is EXEMPT: CSA colour is a compliance requirement, not a style choice.

   PREMIUM was exempt too, on the assumption that its lead colour is always the on-body model shot and
   a model shot beats a brighter flat lay. That assumption was half right. Classifying all 1,303 apparel
   photos showed premium splits three ways: 44 styles are flat lays in EVERY colour (nothing to protect),
   7 are on-model in every colour (Cutter & Buck shoots its whole range on a model, including red,
   purple, orange and yellow), and only 19 have a single model shot that must not be traded away.
   So premium is now re-picked under one extra rule: NEVER DOWNGRADE THE PHOTOGRAPHY. If the colour an
   item currently opens on is an on-model shot, only other on-model colours may replace it; if it opens
   on a flat lay, anything goes. That protects the 19 while freeing the other 69.
   Buyers can still reach every colour: this only decides which one greets them. */
var BRANDPAL=[];                       // brand hues (0-359) learned from the logo art + kit accent
var CW_LAYERS={office:1,bags:1,promo:1,premium:1};
var CW_WINDOW=3;                       // how far back the no-repeat rule looks
/* Assortment is judged on TONE groups, not raw families. Navy and blue are separate families but read
   as the same colour on a grid, so treating them separately is how the first attempt replaced a wall of
   black with a wall of blue (129 of 192 items). Same for black and grey. */
var CW_TONE={black:'dark',grey:'dark',white:'light',navy:'blue',blue:'blue'};
function toneOf(fam){return fam?(CW_TONE[fam]||fam):null;}
/* A colour name that carries no letters is a vendor colour CODE that leaked into the data (the Logan
   Thermal ships one literally called "06000001"). The old picker never chose it, so it never showed. */
function usableColourName(n){return /[A-Za-z]{3}/.test(n||'');}
function hex2rgbArr(hex){var h=String(hex||'').replace('#','');if(h.length!==6)return null;
  var n=parseInt(h,16);return [(n>>16)&255,(n>>8)&255,n&255];}
function hueOf(r,g,b){var mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return -1;
  var h;if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;
  h*=60;return h<0?h+360:h;}
function satOf(r,g,b){var mx=Math.max(r,g,b);return mx?(mx-Math.min(r,g,b))/mx:0;}
function hueGap(a,b){var d=Math.abs(a-b)%360;return d>180?360-d:d;}
function addBrandHue(r,g,b){
  if(satOf(r,g,b)<0.28)return;                       // a neutral mark carries no hue to match
  // A near-black or near-white brand colour is technically saturated but carries no usable hue:
  // grimefighters' #080F24 would otherwise register as "this is a blue company" and tint the store.
  var L=relLum(r,g,b);if(L<0.035||L>0.75)return;
  var h=hueOf(r,g,b);if(h<0)return;
  for(var i=0;i<BRANDPAL.length;i++)if(hueGap(BRANDPAL[i],h)<18)return;   // dedupe near-identical
  BRANDPAL.push(h);
}
function buildBrandPal(){
  var a=hex2rgbArr(CFG.accent);                      // the accent is brand-derived at build time
  if(a)addBrandHue(a[0],a[1],a[2]);
}
/* Score one candidate colourway. Higher is better; -Infinity means "never show this". */
function colourwayScore(col,recent,load,assigned,needModel){
  var rgb=hex2rgbArr(col.rgb);
  if(!rgb||!usableColourName(col.name))return -Infinity;
  // Never trade an on-body model shot for a flat lay. `mdl` is set on a colour whose photo was
  // classified as on-model at build time (see onmodel.py).
  if(needModel&&!col.mdl)return -Infinity;
  var gl=relLum(rgb[0],rgb[1],rgb[2]);
  // RULE 1 — legibility. We do not need the BRAND ink to read: autoInkFor() already swaps to white or
  // dark thread when the brand colour fails. What we require is that SOME ink clears 3:1, which rules
  // out only the mid-tones where nothing reads.
  if(Math.max(contrast(gl,relLum(255,255,255)),contrast(gl,relLum(20,20,20)))<INK_MINRATIO)
    return -Infinity;
  var sat=satOf(rgb[0],rgb[1],rgb[2]),hue=hueOf(rgb[0],rgb[1],rgb[2]),fam=famOfCol(col);
  var sc=0;
  // RULE 2 — brand affinity, then general richness.
  if(sat>0.22&&hue>=0&&BRANDPAL.length){
    var gap=360;
    for(var i=0;i<BRANDPAL.length;i++)gap=Math.min(gap,hueGap(BRANDPAL[i],hue));
    sc += gap<=22 ? 115 : gap<=45 ? 74 : gap<=72 ? 28 : -30;
  }
  sc += Math.round(60*Math.min(1,sat/0.6));
  if(fam==='black')sc-=46;                            // the fallback, not the default
  if(fam==='white')sc-=4;
  if(fam==='grey')sc-=12;
  // RULE 3 — assortment, as a running SHARE rather than a flat penalty. A tone that already owns half
  // the section costs ~95 points, which is what stops the brand hue from taking everything; a tone not
  // used yet is free. On top of that, an immediate neighbour repeat is penalised hard.
  var grp=toneOf(fam);
  if(grp){
    sc-=Math.round(190*((load[grp]||0)/Math.max(1,assigned)));
    var idx=recent.indexOf(grp);
    if(idx>=0)sc-=(112-26*idx);
  }
  return sc;
}
/* Re-pick every eligible item's opening colour. Runs once at boot, after the logo probes have taught
   us the brand hues and BEFORE the first render, so the grid paints correct the first time. */
function assignColourways(){
  buildBrandPal();
  if(!CFG.items||!CFG.order)return 0;
  var changed=0;
  Object.keys(CFG.order).forEach(function(bucket){
    if(!CW_LAYERS[bucket])return;
    var recent=[],load={},assigned=0;
    (CFG.order[bucket]||[]).forEach(function(k){
      var it=BYKEY[k],vm=CFG.items[k];
      if(!it||!vm||vm.cfix)return;                    // cfix = a colour the client actually asked for
      var cols=it.cols||[];
      if(cols.length<2)return;
      // Does this item currently greet the buyer with a model shot? If so, only model shots qualify.
      var cur=null;
      for(var ci=0;ci<cols.length;ci++)if(cols[ci].name===vm.colour){cur=cols[ci];break;}
      var needModel=!!(cur&&cur.mdl);
      var best=null,bs=-Infinity;
      for(var i=0;i<cols.length;i++){
        var sc=colourwayScore(cols[i],recent,load,assigned,needModel);
        if(sc>bs){bs=sc;best=cols[i];}
      }
      if(!best)return;
      if(best.name!==vm.colour){vm.colour=best.name;changed++;}
      var g=toneOf(famOfCol(best));
      if(g){load[g]=(load[g]||0)+1;assigned++;recent.unshift(g);if(recent.length>CW_WINDOW)recent.pop();}
    });
  });
  return changed;
}
/* Sample each logo's brand artwork once at boot to learn its true ink colour. Sampled at 256px with
   alpha>200 because SOLID ink is the thread colour — a small canvas blurs black letterforms into mid
   grey, which quietly defeated the whole test on the first attempt. Same-origin asset, so the canvas
   stays readable; capped at 1.5s and failure-tolerant, because a logo probe must never stop the store
   from painting. */
function probeInk(logo){
  return new Promise(function(res){
    var u=logo&&logo.inks&&logo.inks.brand;
    if(!u||typeof document==='undefined')return res();
    var done=false,fin=function(){if(!done){done=true;res();}};
    var im=new Image();
    setTimeout(fin,1500);
    im.onerror=fin;
    im.onload=function(){
      try{
        var n=256,c=document.createElement('canvas');c.width=c.height=n;
        var x=c.getContext('2d');x.drawImage(im,0,0,n,n);
        var d=x.getImageData(0,0,n,n).data,R=[],G=[],B=[],cut=200;
        for(var pass=0;pass<2&&R.length<40;pass++){
          R=[];G=[];B=[];
          for(var i=0;i<d.length;i+=4){if(d[i+3]>cut){R.push(d[i]);G.push(d[i+1]);B.push(d[i+2]);}}
          cut=120;
        }
        if(R.length>=20){
          var md=function(a){a.sort(function(p,q){return p-q;});return a[a.length>>1];};
          var r=md(R),g=md(G),b=md(B);
          INK[logo.id]={lum:relLum(r,g,b),sat:Math.max(r,g,b)-Math.min(r,g,b)};
          // Same pass, second job: learn the brand's SATURATED hues. The ink probe above deliberately
          // medians every solid pixel, which on a two-colour lockup returns a muddy average — useless
          // for matching a garment. So collect only the genuinely colourful pixels and median THEM.
          var HR=[],HG=[],HB=[];
          for(var j=0;j<d.length;j+=4){
            if(d[j+3]<=200)continue;
            var mx=Math.max(d[j],d[j+1],d[j+2]),mn=Math.min(d[j],d[j+1],d[j+2]);
            if(mx>60&&mx-mn>0.28*mx){HR.push(d[j]);HG.push(d[j+1]);HB.push(d[j+2]);}
          }
          if(HR.length>=24)addBrandHue(md(HR),md(HG),md(HB));
        }
      }catch(e){}
      fin();
    };
    im.src=kurl(u);
  });
}
function money(x){return '$'+Number(x||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});}
function money0(x){return '$'+Math.round(Number(x||0)).toLocaleString('en-CA');}
function logoOf(id){for(var i=0;i<CFG.logos.length;i++)if(CFG.logos[i].id===id)return CFG.logos[i];return CFG.logos[0]||{inks:{}};}
// KIT-LOCAL asset cache-buster. Kit logos live at stable filenames (img/lg_full_brand.png), so when a
// kit is rebuilt with a CORRECTED logo the bytes change but the URL does not — and a returning visitor
// keeps being served the OLD logo from cache. That is why the Facca kit still showed a stale mark to a
// warm-cache browser on three separate reviews while every server-side check passed (each fetched with
// its own cache-buster). We key off the ?v= token on our own <script> tag, which jdp_ship.py bumps
// fleet-wide on EVERY ship, so any deploy reaches returning visitors too.
var KV=(function(){try{var s=document.querySelector('script[src*="/_app/store.js"]');var m=s&&s.src.match(/[?&]v=([^&]+)/);if(m)return m[1];}catch(e){}return '';})();
function kurl(u){if(!u)return u;if(/^(https?:)?\/\//.test(u)||u.charAt(0)==='/')return u;var v=KV||(CFG&&CFG.ver)||'';return v?u+(u.indexOf('?')<0?'?':'&')+'v='+v:u;}
function inkUrl(logo,ink,col,method){var t=(ink&&ink!=='auto')?ink:autoInkFor(method,col&&col.rgb,logo);return kurl(logo.inks[t]||logo.inks.brand);}
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
// Carhartt — transparent premium brand: leaner market-benchmarked markup (competitive with marks.com / carhartt.com).
function isCarhartt(item){return String((item&&(item.brand||item.sku))||'').toLowerCase().indexOf('carhartt')===0;}
function costMultCarh(c){if(c<=15)return 1.72;if(c<=30)return 1.60;if(c<=60)return 1.50;if(c<=100)return 1.42;if(c<=180)return 1.36;return 1.31;}
function volFactorCarh(q){if(q<24)return 1.03;if(q<100)return 1.00;if(q<250)return 0.96;return 0.93;}
function activeDecos(decos){return (decos||[]).filter(function(d){return d.on;});}
function hasDecoPlace(item){return !!((item.places||[]).some(function(p){return p.logo;}));}
function unitPrice(key,decos,q){var r=CFG.rates;
  var _it=BYKEY[key]; if(_it&&_it.layer==='promo')return _it.price_cad||0;   // promo: flat Debco CAD price (customer price)
  if(!r||r.blank==null){return unitAt(BYKEY[key],q);}
  var item=BYKEY[key],c=blankOf(key),dec=0;
  var vpl={};(item.places||[]).forEach(function(p){if(p.logo)vpl[p.id]=1;});   // only decorate on real logo places (pants have none -> no deco charge)
  activeDecos(decos).forEach(function(d){if(!vpl[d.pl])return;dec+=decoCost(d,item);});
  var cm=isCarhartt(item)?costMultCarh(c):costMult(c),vf=isCarhartt(item)?volFactorCarh(q):volFactor(q);
  var price=c*cm*vf+dec,floor=(c+dec)/0.85;   // hard 15% total-margin clamp
  if(price<floor)price=floor; if(price<2.50)price=2.50;          // min piece price
  return Math.ceil(price/0.5)*0.5;}                              // round UP to nearest $0.50
/* ---- PROMO pricing engine (Debco) — the correct all-in model ----
   Order total = product (EQP × qty) + decoration run (per-unit, by method + extra locations) + one-time setup.
   The all-in per-unit therefore DROPS as quantity rises (setup spreads) — the real quantity mechanic. */
function promoMethods(it){return (it.methods&&it.methods.length)?it.methods:[{n:'1-colour print',r:0}];}
// Quantity-break unit price (NexGen/St Regis/Spector). Debco items have no tiers -> flat price_cad.
function tierPrice(it,qty){var t=it.tiers;if(!t||!t.length)return it.price_cad||0;var p=t[0].p;for(var i=0;i<t.length;i++){if(qty>=t[i].q)p=t[i].p;}return p;}
function promoQuote(it,c){
  c=c||{}; var min=it.moq||((it.tiers&&it.tiers[0])?it.tiers[0].q:1);
  // QUOTE-MODE (new suppliers): tiered blank product price; logo/decoration confirmed on the free proof.
  if(it.decoquote){
    var q2=Math.max(parseInt(c.qty,10)||min,min);
    var pp=tierPrice(it,q2), gd=Math.round(pp*q2*100)/100;
    return {qty:q2,min:min,decoquote:true,unit:it.unit||'pc',tiers:it.tiers||[],unitBase:pp,perPiece:pp,
            run:0,setup:0,locs:1,methods:[],mi:0,method:{n:''},goods:gd,decoRun:0,total:gd,allIn:pp};
  }
  var qty=Math.max(parseInt(c.qty,10)||min,min);
  var methods=promoMethods(it), mi=Math.min(Math.max(c.mi||0,0),methods.length-1), m=methods[mi]||{n:'',r:0};
  var locs=Math.max(c.locs||1,1);
  var unitBase=it.price_cad||0;
  var run=(m.r||0)+((locs>1)?((it.addl_loc||0.75)*(locs-1)):0);   // per-unit decoration (method + extra locations)
  var setup=Math.round((it.setup||65)*locs*100)/100;             // one-time, one setup per location
  var perPiece=Math.round((unitBase+run)*100)/100;                // decorated price per piece (flat at any qty)
  var goods=unitBase*qty, decoRun=run*qty, total=goods+decoRun+setup;
  return {qty:qty,min:min,methods:methods,mi:mi,method:m,locs:locs,unitBase:unitBase,run:Math.round(run*100)/100,
          perPiece:perPiece,setup:setup,goods:Math.round(goods*100)/100,decoRun:Math.round(decoRun*100)/100,
          total:Math.round(total*100)/100,allIn:total/qty};
}
// Quantity presets a B2B buyer actually orders (always starting at the item's minimum).
function promoTiers(min){var out=[];[min,25,50,100,250,500].forEach(function(q){if(q>=min&&out.indexOf(q)<0)out.push(q);});return out.slice(0,5);}
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
  if(item&&item.noov)return {g:gurl(photo),lg:'',hasBack:hasBack};   // decoration priced/selectable, but no logo drawn on photo (Carhartt)
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
  var o=overlayHtml(item,vm,browseColour(key,item),'front',browseCols(item),browsePlaces(item));
  var ncol=item.cols.length;
  var topcol=CFG.pricing.cols[CFG.pricing.cols.length-1];
  var fromP=unitPrice(key,vm.decos,topcol);
  var rec=(key===CFG.feature||item.rec)?'<span class="mrec">★ Top pick</span>':'';
  // Class badge: a specific published class reads bold; styles whose maker publishes only the generic
  // "meets CSA" claim (no class number) render muted — we never invent a class.
  var csa=item.csa?'<span class="mcsa'+(/^Meets/.test(item.csa)?' gen':'')+'" title="'+(/^Meets/.test(item.csa)?'Certified high-visibility apparel — ask us to confirm the exact class for your job':'Certified high-visibility rating')+'">🛡 '+esc(item.csa)+'</span>':'';
  // Fabric chip: shoppers hunting for a *cotton* polo need to see it on the tile, not three clicks deep.
  // Reuses the muted badge style so it reads as spec, not a safety rating.
  var fab=item.fabric?'<span class="mcsa gen" title="Fabric content as published by the maker">\ud83e\uddf5 '+esc(item.fabric)+'</span>':'';
  var q=CART[key]?CART[key].qty:0;
  var inkit=q?' inkit':'';
  var addlbl=q?('<b>'+q+'</b>'):'+';
  return '<article class="mcard'+inkit+'" data-key="'+key+'" data-name="'+esc(searchText(item).replace(/"/g,''))+'" tabindex="0" role="button" aria-label="'+esc(item.name)+'">'+
    '<div class="mstage">'+rec+(item.video?'<button class="mvid" data-vid="'+esc(item.video)+'" data-vname="'+esc(item.name)+'" aria-label="Play product video">▶ Video</button>':'')+'<img class="g" src="'+o.g+'" alt="'+esc(item.name)+'" loading="lazy" decoding="async">'+o.lg+
      '<button class="madd'+(q?' has':'')+'" data-key="'+key+'" aria-label="'+(q?'Edit ':'Add ')+esc(item.name)+'">'+addlbl+'</button></div>'+
    '<div class="mb"><h3>'+esc(item.name)+'</h3>'+
      '<div class="mmeta">'+esc(item.sku)+(item.layer==='promo'?'':(item.unisex?' · Unisex':''))+'</div>'+
      (hasLadies(item)?'<div class="mfit">Men’s &amp; Ladies’ cuts</div>':(item.unisex?'<div class="mfit alt">Unisex — one cut</div>':''))+
      csa+fab+
      colourDots(item,key)+
      (item.layer==='promo'
        ? (kitContentsHtml(item)+
           '<div class="mprice"><b>'+money(item.price_cad)+'</b> <small>/'+(item.unit==='dozen'?'dozen':'pc')+' · min '+item.moq+'</small></div>')
        : '<div class="mprice">from <b>'+money(fromP)+'</b> <small>/pc'+(hasDecoPlace(item)?' · decorated':'')+'</small></div>')+
      '</div></article>';
}
// A row of real colour swatches on each card — shows selection depth at a glance (conversion signal).
// The swatches used to be inert <span>s — decoration that looked like information. They are now real
// controls that swap the photo on the card, and the row names the CURRENT colour, because showing a
// colour NAME is what tells a shopper this is a choice rather than a spec.
function colourDots(item,key){
  var cs=browseCols(item),cur=key?browseColour(key,item):(cs[0]||{}).name,max=7,dots='';
  for(var i=0;i<cs.length&&i<max;i++){
    dots+='<button type="button" class="cdot'+(cs[i].name===cur?' on':'')+'" data-col="'+esc(cs[i].name||'')+'"'+
          ' style="background:'+(cs[i].rgb||'#ccc')+'" title="'+esc(cs[i].name||'')+'" aria-label="Show '+esc(cs[i].name||'')+'"></button>';}
  var extra=cs.length>max?('<span class="cmore">+'+(cs.length-max)+'</span>'):'';
  return '<div class="cdots">'+dots+extra+'<span class="cdlbl"><b class="cdnow">'+esc(cur||'')+'</b> · '+cs.length+' colour'+(cs.length===1?'':'s')+'</span></div>';
}

/* ---------- category / subcategory navigation (by GARMENT TYPE, brand-agnostic) ----------
   No "Premium Brands" bucket — office & premium apparel merge into the same type categories so a
   shopper browses by what they want (Polos, Fleece, Jackets…), with the brand shown on each card. */
var MEGA=[
  {id:'tops',name:'Polos, Shirts & Tees'},
  {id:'layers',name:'Sweaters & Fleece'},
  {id:'outerwear',name:'Jackets & Vests'},
  {id:'ruggedwear',name:'Rugged Wear'},
  {id:'hivis',name:'Hi-Vis & Safety'},
  {id:'carhartt',name:'Carhartt Workwear'},
  {id:'headwear',name:'Headwear'},
  {id:'bottoms',name:'Pants & Joggers'},
  {id:'fr',name:'Flame-Resistant'},
  {id:'accessories',name:'Accessories'}
];
var SHACKET_KEYS={st_bushwick:1,st_highlandplaid:1,st_oxide:1};
var MEGASUB={
  tops:['Polos','Shirts','Tees'],
  layers:['Quarter & Half-Zips','Crewnecks & Sweatshirts','Hoodies','Fleece'],   // bottoms live in the Pants & Joggers tab
  outerwear:['Softshell Jackets','Shackets & Overshirts','Insulated & Thermal','Puffer & Quilted','3-in-1 Systems','Shells & Rainwear','Vests','Jackets'],
  // Rugged Wear = Canada Sportswear's heavy-duty line, its own brand category.
  // Rugged Wear — organized how trades/industrial buyers shop: by warmth & garment type. The #1 rugged selection.
  ruggedwear:['Insulated & Quilted','Canvas & Shackets','Parkas','Shells & 3-in-1','Vests','Hoodies & Thermals','Work Shirts'],
  hivis:['Safety Vests','Hi-Vis T-Shirts','Sweatshirts & Hoodies','Hi-Vis Jackets','Winter Parkas','Rain & Gear','Hard Hats & Head Protection'],
  // Carhartt is its OWN brand category (declutters the shared tabs). By garment; best-sellers keep the ★ Top pick badge and sort first.
  carhartt:['Sweatshirts & Hoodies','T-Shirts','Shirts','Jackets & Coats','Vests','Pants & Bibs','Flame-Resistant','Headwear','Bags & Accessories'],
  // ONE consolidated Accessories category — bags, drinkware, desk, gifts & golf — so the apparel categories
  // keep their value. Curated to premium items that fit Field & Crews + Office/Sales/Client-Facing teams.
  // Headwear is its own tab: 24 new caps/toques on top of the existing 8 would swamp a single
  // Accessories sub, and embroidered caps are a core JDP line that buyers shop for by name.
  headwear:['Caps & Hats','Trucker & Snapback','Performance & Golf','Beanies & Toques'],
  // All bottoms in one place. classify() already returned mega 'workwear' for these but it was
  // never declared, so work pants and bibs were unreachable in the nav.
  bottoms:['Joggers & Sweatpants','Work Pants & Bibs','Work Pants','Bibs & Overalls'],
  fr:['FR Hoodies','FR Shirts','FR Tees','FR Pants','FR Jackets','FR Accessories'],
  accessories:['Kits & Gift Sets','Drinkware','Notebooks & Pens','Tech','Lifestyle','Bags','Golf','Headwear'],
};
// Hi-vis by NAME (any layer). Organized how safety buyers actually shop — vests lead (the #1 entry
// hi-vis item), then shirts, warm mid-layers, insulated jackets, winter parkas, and rain/gear last.
function classifyHivis(n){
  if(/rain|poncho|\bpants?\b|overall|bib|coverall|gaiter/.test(n))return {mega:'hivis',sub:'Rain & Gear'};
  if(/parka/.test(n))return {mega:'hivis',sub:'Winter Parkas'};
  if(/vest/.test(n))return {mega:'hivis',sub:'Safety Vests'};
  if(/hood|sweatshirt|sweater|crewneck|fleece|pullover/.test(n))return {mega:'hivis',sub:'Sweatshirts & Hoodies'};
  if(/tee|t-shirt|shirt|polo/.test(n))return {mega:'hivis',sub:'Hi-Vis T-Shirts'};
  if(/jacket|bomber|soft ?shell|coat|shell|3-?in-?1|6-?in-?1/.test(n))return {mega:'hivis',sub:'Hi-Vis Jackets'};
  return {mega:'hivis',sub:'Hi-Vis Jackets'};
}
// Rugged Wear (Canada Sportswear heavy-duty line) — its own brand category, by garment.
function classifyRugged(n){
  if(/3-?in-?1|5-?in-?1/.test(n))return {mega:'ruggedwear',sub:'Shells & 3-in-1'};
  if(/parka/.test(n))return {mega:'ruggedwear',sub:'Parkas'};
  if(/vest/.test(n))return {mega:'ruggedwear',sub:'Vests'};
  if(/hood(ie|ed)|sweatshirt|thermal|t-shirt|tee|pullover|henley/.test(n))return {mega:'ruggedwear',sub:'Hoodies & Thermals'};
  if(/canvas|shacket|overshirt|plaid|sherpa/.test(n))return {mega:'ruggedwear',sub:'Canvas & Shackets'};
  if(/\bshell\b/.test(n))return {mega:'ruggedwear',sub:'Shells & 3-in-1'};
  return {mega:'ruggedwear',sub:'Insulated & Quilted'};
}
// CROSS-LIST: a CURATED set of the best cross-brand rugged pieces ALSO appears in Rugged Wear (they stay
// in their home category too). Chosen for the rugged buyer — heavy insulated/canvas/thermal work jackets,
// premium insulated (TNF), and versatile 3-in-1/5-in-1 systems. NO Carhartt (it has its own category).
// Native Canada Sportswear "Rugged Wear" line (13) + these 11 = exactly 24 in the section.
// Stormtech pieces that ALSO belong in Rugged Wear (kept in their home category too). Curated to genuinely
// rugged: insulated, quilted, canvas, sherpa-lined, thermal, shackets, 3-in-1 — NO North Face / Cutter & Buck
// (those are premium office/outdoor, not workwear) and NO lightweight office softshells/fleece.
var RUGGED_CROSS={
  st_nostromo:'Insulated & Quilted', st_orbiter:'Insulated & Quilted', st_narvik:'Insulated & Quilted',
  st_bushwick:'Insulated & Quilted', st_gravity:'Insulated & Quilted', st_cascadia:'Insulated & Quilted',
  st_tundrajkt:'Insulated & Quilted', st_nautilusjkt:'Insulated & Quilted', st_stavanger:'Insulated & Quilted',
  st_sierrajkt:'Insulated & Quilted', st_pacifica:'Insulated & Quilted',
  st_oxide:'Canvas & Shackets', st_highlandplaid:'Canvas & Shackets', st_tundrashacket:'Canvas & Shackets',
  st_highlandshacket:'Canvas & Shackets', st_northbeach:'Canvas & Shackets',
  st_fairbanks:'Shells & 3-in-1', st_magellan:'Shells & 3-in-1', st_vortex:'Shells & 3-in-1',
  st_olympia:'Shells & 3-in-1', st_avalante3in1:'Shells & 3-in-1',
  st_basecampvest:'Vests', st_sierravest:'Vests',
  st_logan:'Hoodies & Thermals', st_nautilushoody:'Hoodies & Thermals',
  // Uniform shirts live in Polos, Shirts & Tees but a trades buyer shops Rugged Wear — surface them in both.
  dk_2574:'Work Shirts', rk_sx20:'Work Shirts', rk_sy20:'Work Shirts', rk_sp24:'Work Shirts', rk_sp14:'Work Shirts',
  shirt:'Work Shirts', ashton:'Work Shirts'
};
// CROSS-LISTING: one HOME category, plus any second place a buyer would reasonably look. The item is
// never duplicated within a category. Headwear was scattered three ways — 24 promo caps here, 4 Carhartt
// caps inside the Carhartt brand tab, 4 golf caps inside Accessories — so nobody shopping "Headwear" ever
// saw all of it. Brand tabs keep their complete story; the buyer gets one aisle.
function crossAlso(it,c){
  var out=[],n=((it.name||'')+' '+(it.key||'')).toLowerCase();
  if(c.mega!=='ruggedwear'&&RUGGED_CROSS[it.key])out.push({mega:'ruggedwear',sub:RUGGED_CROSS[it.key]});
  if(c.mega!=='headwear'&&isHeadwear(n)&&!/\bfr\b|flame[- ]resistant/.test(n))out.push({mega:'headwear',sub:headwearSub(n)});
  if(c.mega!=='bottoms'&&c.sub==='Pants & Bibs')out.push({mega:'bottoms',sub:'Work Pants & Bibs'});
  return out;
}
// Best-sellers (rec flag) are NOT a separate section — they live in their garment sub with the ★ Top pick badge, sorted first.
function classifyCarhartt(it,n,layer){
  if(/\bfr\b|flame[- ]resistant/.test(n))return {mega:'carhartt',sub:'Flame-Resistant'};
  if(layer==='bags'||/duffel|backpack|cooler|lunch|dog|leash|collar|throw|blanket|\bbag\b|tote/.test(n))return {mega:'carhartt',sub:'Bags & Accessories'};
  if(/balaclava|beanie|toque|watch hat|\bcap\b|mesh back|knit .*hat|cuffed/.test(n))return {mega:'carhartt',sub:'Headwear'};
  if(/bib overall|coverall|\bbib\b|\bpant\b|\bpants\b|cargo|dungaree|trouser/.test(n))return {mega:'carhartt',sub:'Pants & Bibs'};
  if(/vest/.test(n))return {mega:'carhartt',sub:'Vests'};
  if(/jacket|coat|parka|softshell|active jac/.test(n))return {mega:'carhartt',sub:'Jackets & Coats'};
  if(/hood|sweatshirt|quarter|1\/4|mock/.test(n))return {mega:'carhartt',sub:'Sweatshirts & Hoodies'};
  if(/tee|t-shirt|henley/.test(n))return {mega:'carhartt',sub:'T-Shirts'};
  if(/shirt|button|plaid|twill/.test(n))return {mega:'carhartt',sub:'Shirts'};
  return {mega:'carhartt',sub:'Sweatshirts & Hoodies'};
}
function megaName(id){for(var i=0;i<MEGA.length;i++)if(MEGA[i].id===id)return MEGA[i].name;return id;}
// classify an item into {mega, sub} purely by garment type (names carry raw "&"; escaped at render).
// Work shirts are just SHIRTS. A separate "Work & Uniform Shirts" sub forced the buyer to guess which
// bucket a twill button-down fell into — the Camden and Ashton twills are the same garment class as the
// Dickies twill, so the split drew a line no shopper would draw. One Shirts sub; the work-duty ones
// cross-list into Rugged Wear (see RUGGED_CROSS) for the trades buyer.
function classifyWorkShirt(n){
  return {mega:'tops',sub:'Shirts'};
}
// Headwear, by what a buyer actually picks between: a crown style. The old split had four sub-buckets
// that were all baseball caps (Caps / Fitted & Performance / Trucker & Snapback / Bucket & Visors) —
// subdividing a subcategory — and it filed the Sport Sandwich Cotton VISOR CAP under "Visors" because the
// word appeared in its name. Panel counts and fitted-vs-adjustable are spec detail, not aisles.
function isHeadwear(n){return /\bcap\b|\bhat\b|beanie|toque|balaclava|visor|snap ?back|trucker|bucket/.test(n)&&!/hard hat/.test(n);}
function headwearSub(n){
  if(/beanie|toque|watch hat|balaclava|knit cuff/.test(n))return 'Beanies & Toques';
  // A premium performance lane. Golf-brand and Dri-FIT caps are a different purchase from a $20 cotton
  // six-panel — a buyer speccing client-gift or tournament headwear is not cross-shopping them, and
  // burying a $35 Callaway among promo caps sells neither well.
  if(/dri-?fit|performance|golf|taylormade|callaway|titleist|srixon/.test(n))return 'Performance & Golf';
  if(/trucker|snap ?back|mesh back/.test(n))return 'Trucker & Snapback';
  return 'Caps & Hats';
}
function classify(it){
  var layer=it.layer,n=((it.name||'')+' '+(it.key||'')).toLowerCase();
  // PPE on the promo/quote-mode pricing path must NOT land in Accessories. Hard hats are CSA/ANSI
  // rated head protection bought by a safety manager, so they belong beside hi-vis. Keys off pmega
  // so any future quote-mode item can pick its own home category.
  if(layer==='promo'&&it.pmega&&it.pmega!=='accessories')return {mega:it.pmega,sub:it.psub||'Bags'};
  if(layer==='promo')return {mega:'accessories',sub:it.psub||'Bags'};   // all promo/golf/bag items -> one Accessories category (psub remapped at build)
  // Carhartt is a dedicated brand category — route ALL Carhartt items there (keeps the shared tabs uncluttered).
  var _brand=((it.sku||'')+' '+(it.brand||'')).toLowerCase();
  if(_brand.indexOf('carhartt')>=0)return classifyCarhartt(it,n,layer);
  // Must come BEFORE the layer==='field' branch, which would otherwise file a work shirt under
  // Hi-Vis T-Shirts, and it deliberately does NOT use 'tops': worlds filter by mega and 'tops' is
  // office-only, so a uniform shirt routed there would never reach the crews who actually wear it.
  if(_brand.indexOf('red kap')>=0||_brand.indexOf('dickies')>=0||/work shirt|uniform shirt/.test(n))return classifyWorkShirt(n);
  if(/hi-?vis|safety/.test(n))return classifyHivis(n);           // hi-vis items (any brand/layer) -> Hi-Vis & Safety
  if(_brand.indexOf('rugged wear')>=0)return classifyRugged(n);  // Canada Sportswear Rugged Wear line -> its own tab
  if(layer==='bags')return {mega:'accessories',sub:'Bags'};   // all apparel bags -> Accessories › Bags
  if(layer==='field')return classifyHivis(n);   // all Ground Force traffic gear routes by garment type
  // apparel (office + premium + Stormtech). Order matters: shackets/vests before shirt/fleece;
  // layers (zip/sweatshirt/hood) before "shirt" so "…Sweatshirt" doesn't read as a shirt.
  // Flame-Resistant gets its own tab — route FR items here first (before bottoms/headwear/garment rules).
  if(/\bfr\b|flame[- ]resistant/.test(n)){
    if(/hood/.test(n))return {mega:'fr',sub:'FR Hoodies'};
    if(/\bpant\b|cargo|dungaree/.test(n))return {mega:'fr',sub:'FR Pants'};
    if(/balaclava|beanie|hood scarf|gaiter/.test(n))return {mega:'fr',sub:'FR Accessories'};
    if(/jacket|coat|parka|vest/.test(n))return {mega:'fr',sub:'FR Jackets'};
    if(/tee|t-shirt|henley/.test(n))return {mega:'fr',sub:'FR Tees'};
    return {mega:'fr',sub:'FR Shirts'};
  }
  // Carhartt bottoms & headwear (premium layer, routed by name to their own category tabs):
  if(/bib overall|coverall|\bbib\b/.test(n))return {mega:'bottoms',sub:'Bibs & Overalls'};
  if(/\bpant\b|\bpants\b|cargo|dungaree|trouser/.test(n))return {mega:'bottoms',sub:'Work Pants'};
  if(/hard ?hat|\bhelmet\b/.test(n)||/^hp\d/.test((it.key||''))||/\btype [12]\b/.test(n))return {mega:'hivis',sub:'Hard Hats & Head Protection'};
  if(/jogger|sweatpant|sweat pant/.test(n))return {mega:'bottoms',sub:'Joggers & Sweatpants'};
  if(isHeadwear(n))return {mega:'headwear',sub:headwearSub(n)};
  // SHACKET SILHOUETTE by KEY, judged from the product photos rather than the name. These three
  // are shirt-jackets (point collar, full button placket, patch chest pockets) but their names say
  // "Quilted"/"Sherpa-Lined", so the name regexes below file them under Puffer & Quilted and
  // Insulated & Thermal. Keyed explicitly because widening the regex would wrongly catch genuine
  // zip-front puffers (Gravity, Tundra, Nautilus, Stavanger, Sierra) and sherpa hoodies.
  if(SHACKET_KEYS[it.key])return {mega:'outerwear',sub:'Shackets & Overshirts'};
  if(/shacket|overshirt/.test(n))return {mega:'outerwear',sub:'Shackets & Overshirts'};
  if(/quarter-?zip|half-?zip|1\/4/.test(n))return {mega:'layers',sub:'Quarter & Half-Zips'};
  if(/crewneck|sweatshirt/.test(n)&&!/hood/.test(n)&&!/t-shirt|\btee\b/.test(n))return {mega:'layers',sub:'Crewnecks & Sweatshirts'};  // a "Crewneck T-Shirt" is a TEE
  if(/hoodie|hooded/.test(n))return {mega:'layers',sub:'Hoodies'};
  if(n.indexOf('vest')>=0)return {mega:'outerwear',sub:'Vests'};      // fleece/quilted vests -> Vests, not Fleece
  if(/fleece/.test(n))return {mega:'layers',sub:'Fleece'};
  if(n.indexOf('polo')>=0)return {mega:'tops',sub:'Polos'};
  if(/tee|t-shirt|henley/.test(n))return {mega:'tops',sub:'Tees'};
  if(n.indexOf('shirt')>=0)return {mega:'tops',sub:'Shirts'};
  if(/3-?in-?1|5-?in-?1|system jacket/.test(n))return {mega:'outerwear',sub:'3-in-1 Systems'};
  if(/\brain\b(?! ?defender)|dryvent|raincoat/.test(n))return {mega:'outerwear',sub:'Shells & Rainwear'};
  if(/softshell|soft shell/.test(n))return {mega:'outerwear',sub:'Softshell Jackets'};
  if(/puffer|quilted|down|thermoball|puffy/.test(n))return {mega:'outerwear',sub:'Puffer & Quilted'};
  if(/thermal|insulated|sherpa|hybrid/.test(n))return {mega:'outerwear',sub:'Insulated & Thermal'};
  if(/shell/.test(n))return {mega:'outerwear',sub:'Shells & Rainwear'};
  if(/jacket|coat|parka/.test(n))return {mega:'outerwear',sub:'Jackets'};
  return {mega:'tops',sub:'Shirts'};
}
/* ---------- FILTERED BROWSE MODEL (one category at a time; no endless scroll) ---------- */
var VIEW={cat:null,sub:'all',q:'',world:'all',fit:'all',col:null,band:null};
// Colour chosen while BROWSING, per item+fit. A shopper who picks navy on the grid should still be on
// navy when the product opens — otherwise the swatch feels fake.
var BCOL={};
// A ladies' cut only EXISTS as far as the store is concerned if we have its photos. Nine styles carried
// womens:true with an empty wcols, so curColsOf() fell back to the men's photos — the card promised
// "Men's & Ladies' cuts" and then showed a man. Never advertise a fit we cannot show.
function hasLadies(item){return !!(item&&item.womens&&item.wcols&&item.wcols.length);}
function fitOf(item){return (VIEW.fit==='womens'&&hasLadies(item))?'womens':'mens';}
function browseCols(item){return curColsOf(item,fitOf(item));}
function browsePlaces(item){var f=fitOf(item);return (f==='womens'&&item.wplaces&&item.wplaces.length)?item.wplaces:item.places;}
function browseColour(key,item){
  var cols=browseCols(item),k=key+'|'+fitOf(item),want=BCOL[k]||vmOf(key).colour,hit=colInList(cols,want);
  return (hit&&hit.name===want)?want:(cols[0]||{}).name;
}
var BUCKETS={},TOTALS={},CATS=[];
var SHORTCAT={tops:'Polos & Shirts',layers:'Fleece & Sweaters',outerwear:'Jackets & Vests',ruggedwear:'Rugged Wear',hivis:'Hi-Vis & Safety',carhartt:'Carhartt',headwear:'Headwear',bottoms:'Pants & Joggers',fr:'Flame-Resistant',accessories:'Accessories'};
// Two brand worlds — how JDP sells: the jobsite crew and the front office / client-facing team.
var AUD=[{id:'field',name:'Field & Crews',short:'Field & Crews',blurb:'CSA hi-vis, rugged workwear & hard-hat-ready layers built for the jobsite.',cats:['hivis','ruggedwear','carhartt','fr','headwear','bottoms']},
         {id:'office',name:'Office, Sales & Client-Facing',short:'Office & Sales',blurb:'Sharp branded polos, softshells, premium brands & client gifts for the front office and sales floor.',cats:['tops','layers','outerwear','headwear','bottoms','accessories']}];
function audOf(w){for(var i=0;i<AUD.length;i++)if(AUD[i].id===w)return AUD[i];return null;}
function worldOfCat(c){for(var i=0;i<AUD.length;i++)if(AUD[i].cats.indexOf(c)>=0)return AUD[i].id;return null;}
function worldCats(){if(VIEW.world==='all')return CATS;var a=audOf(VIEW.world);return a?a.cats.filter(function(c){return CATS.indexOf(c)>=0;}):CATS;}
// shared /kits/_app asset base (lifestyle imagery lives beside store.js/css)
function appBase(){return String(CFG.catalog_base||CATALOG_BASE).replace('_catalog','_app');}
function worldImg(w){return appBase()+'/hero-'+w+'.jpg';}
// Ready-made kits — curated by ROLE. Each slot resolves to the top item in a [mega,sub] at render time,
// so it works in any store regardless of exact SKUs. Speaks directly to each buyer; one-tap to add all.
var KITS=[
  {id:'crew',name:'The Crew Kit',world:'field',tag:'Field & Crews',blurb:'Jobsite-ready — hi-vis tee, hi-vis hoodie & a warm beanie.',slots:[['hivis','Hi-Vis T-Shirts'],['hivis','Sweatshirts & Hoodies'],['carhartt','Headwear']]},
  {id:'super',name:'The Field Supervisor Kit',world:'field',tag:'Field & Crews',blurb:'Lead the site — softshell jacket, branded polo & a cap.',slots:[['outerwear','Softshell Jackets'],['tops','Polos'],['carhartt','Headwear']]},
  {id:'client',name:'The Client-Facing Kit',world:'office',tag:'Office & Sales',blurb:'Sharp & polished — quarter-zip, premium polo & a notebook.',slots:[['layers','Quarter & Half-Zips'],['tops','Polos'],['accessories','Notebooks & Pens']]},
  {id:'newhire',name:'The New-Hire Welcome Kit',world:'office',tag:'Onboarding',blurb:'Day-one welcome — polo, backpack, bottle & a notebook.',slots:[['tops','Polos'],['accessories','Bags'],['accessories','Drinkware'],['accessories','Notebooks & Pens']]}
];
function kitItems(kit){var out=[];kit.slots.forEach(function(s){var arr=BUCKETS[s[0]]&&BUCKETS[s[0]][s[1]];if(arr)for(var i=0;i<arr.length;i++){if(out.indexOf(arr[i])<0){out.push(arr[i]);break;}}});return out;}
function shortCat(id){return SHORTCAT[id]||megaName(id);}
function buildBuckets(){
  var order=CFG.order||{},all=[];
  ['office','premium','bags','field','promo'].forEach(function(L){(order[L]||[]).forEach(function(k){if(all.indexOf(k)<0)all.push(k);});});
  BUCKETS={};TOTALS={};ALLKEYS=all;
  all.forEach(function(k){var it=BYKEY[k];if(!it)return;var c=classify(it);
    (BUCKETS[c.mega]=BUCKETS[c.mega]||{});(BUCKETS[c.mega][c.sub]=BUCKETS[c.mega][c.sub]||[]).push(k);
    TOTALS[c.mega]=(TOTALS[c.mega]||0)+1;
    crossAlso(it,c).forEach(function(x){   // item stays in its home category too
      (BUCKETS[x.mega]=BUCKETS[x.mega]||{});(BUCKETS[x.mega][x.sub]=BUCKETS[x.mega][x.sub]||[]).push(k);
      TOTALS[x.mega]=(TOTALS[x.mega]||0)+1;});});
  // Order within each subcategory for optimal browsing: top picks first, then price low → high.
  var pc=(CFG.pricing&&CFG.pricing.cols)?CFG.pricing.cols:[12,48,144],top=pc[pc.length-1];
  // Sort: top-picks first, then by best-seller rank (srt, e.g. Carhartt collection order) when present, else price low→high.
  function pkey(k,useSrt){var it=BYKEY[k],rec=(it.rec||k===CFG.feature)?0:1,p;
    if(useSrt&&it.srt!=null)return [rec,it.srt];
    try{p=unitPrice(k,vmOf(k).decos,top);}catch(e){p=it.blank||0;}return [rec,p];}
  Object.keys(BUCKETS).forEach(function(m){Object.keys(BUCKETS[m]).forEach(function(s){
    var arr=BUCKETS[m][s];
    // srt is a BRAND's own collection order (Carhartt), only meaningful when every item in the sub has
    // one. Mixed in with priced goods it ranked every promo item (srt:0) above real prices, so vendor
    // goods surfaced at the top of a category as if we had chosen them.
    var useSrt=arr.every(function(k){return (BYKEY[k]||{}).srt!=null;});
    arr.sort(function(a,b){var pa=pkey(a,useSrt),pb=pkey(b,useSrt);return (pa[0]-pb[0])||(pa[1]-pb[1]);});});});
  CATS=MEGA.filter(function(m){return BUCKETS[m.id];}).map(function(m){return m.id;});
}
var ALLKEYS=[];
function subNames(cat){var subs=BUCKETS[cat]||{},ord=MEGASUB[cat]||[];
  return Object.keys(subs).sort(function(a,b){var ia=ord.indexOf(a),ib=ord.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});}
function renderCtabs(){var el=document.getElementById('ctabs');if(!el)return;
  el.innerHTML=worldCats().map(function(c){return '<button class="ctab'+(c===VIEW.cat?' on':'')+'" data-cat="'+c+'">'+esc(shortCat(c))+'<span class="ctn">'+TOTALS[c]+'</span></button>';}).join('');
  el.querySelectorAll('.ctab').forEach(function(b){b.addEventListener('click',function(){setCat(b.dataset.cat,true);});});}
// FIELD ↔ OFFICE world toggle — filters the whole store to one audience (or All).
function renderWorldToggle(){var el=document.getElementById('worldbar');if(!el)return;
  var opts=[{id:'all',short:'All'}].concat(AUD);
  el.innerHTML=opts.map(function(o){return '<button class="wtog'+(VIEW.world===o.id?' on':'')+' wtog-'+o.id+'" data-world="'+o.id+'">'+esc(o.short)+'</button>';}).join('');
  el.querySelectorAll('.wtog').forEach(function(b){b.addEventListener('click',function(){worldSelect(b.dataset.world,true);});});}
function worldSelect(w,scroll){
  VIEW.world=w;renderWorldToggle();renderCtabs();
  var cats=worldCats();if(cats.indexOf(VIEW.cat)<0)VIEW.cat=cats[0];
  renderSubchips();renderGrid();
  document.querySelectorAll('.ctab').forEach(function(t){t.classList.toggle('on',t.dataset.cat===VIEW.cat);});
  if(scroll)scrollToResults();}
// Men's / Ladies' was buried inside the product sheet, so nobody browsing knew the ladies' cuts existed.
// It belongs where the shopper is deciding. Only rendered when this view actually HAS ladies' styles —
// a filter that returns the same grid teaches the shopper to ignore filters.
// Colour families. A buyer outfitting a team thinks "everything in navy", not in 40 vendor colour
// names, so we bucket the names into families and filter on those.
var COLFAM=[['black',/black|onyx|jet/i,'#1c1c1c'],['white',/white|ivory|bone|cream|natural/i,'#f0efec'],
  ['grey',/grey|gray|charcoal|graphite|silver|ash|steel|heather|taupe|greystone/i,'#8b8f94'],
  ['navy',/navy|midnight/i,'#1b2a44'],['blue',/blue|royal|cobalt|sky|azure|powder|retro/i,'#2f6fb5'],
  ['green',/green|sage|olive|forest|evergreen|lime|keylime/i,'#2f6b41'],
  ['red',/\bred\b|burgundy|maroon|crimson|wine/i,'#b3232c'],
  ['orange',/orange|melon|rust|copper/i,'#e2701e'],['yellow',/yellow|gold|mustard|khaki|sand|latte|wheat/i,'#d9b23c'],
  ['brown',/brown|wood|acacia|chocolate|coffee|espresso/i,'#8a5a34'],
  ['pink',/pink|flamingo|rose|plum|purple|violet/i,'#c8567f']];
function famOf(name){for(var i=0;i<COLFAM.length;i++)if(COLFAM[i][1].test(name||''))return COLFAM[i][0];return null;}
/* Name regexes miss a long tail of real colour names — Coral, Sapphire, Heliconia, Caramel, Pearl.
   Roughly 40 colours per kit matched nothing, which left them invisible to the colour filter AND
   exempt from the assortment rule, so two "Caramel" pieces could land side by side. Every colour
   carries an rgb hex, so fall back to classifying the actual pixel value. */
function famFromRgb(hex){
  var rgb=hex2rgbArr(hex);if(!rgb)return null;
  var L=relLum(rgb[0],rgb[1],rgb[2]),s=satOf(rgb[0],rgb[1],rgb[2]),h=hueOf(rgb[0],rgb[1],rgb[2]);
  if(L<0.045)return 'black';
  if(s<0.18)return L>0.62?'white':'grey';
  if(h<0)return 'grey';
  if(h<14||h>=344)return 'red';
  if(h<44)return L<0.16?'brown':'orange';
  if(h<70)return 'yellow';
  if(h<165)return 'green';
  if(h<200)return 'blue';
  if(h<255)return L<0.13?'navy':'blue';
  return 'pink';
}
function famOfCol(col){return col?(famOf(col.name)||famFromRgb(col.rgb)):null;}
function famSwatch(f){for(var i=0;i<COLFAM.length;i++)if(COLFAM[i][0]===f)return COLFAM[i][2];return '#ccc';}
function itemFam(it){var o={};(curColsOf(it,fitOf(it))||[]).forEach(function(c){var f=famOfCol(c);if(f)o[f]=c.name;});return o;}
function colourOK(list){
  if(!VIEW.col)return list;
  return list.filter(function(k){var it=BYKEY[k];return it&&itemFam(it)[VIEW.col];});}
// Corporate gifting starts from a per-head budget, so let the buyer shop the band directly.
/* ---- Shop gift kits by OCCASION -------------------------------------------------------------
   A corporate buyer almost never arrives looking for a SKU. They arrive with a job to do: fifteen
   new hires start Monday, the sales team needs a leave-behind for a trade show, someone hits ten
   years next month. Until now the only route through the gift sets was to scroll all of them,
   which was tolerable at 32 kits and becomes unusable as the range grows past a hundred.
   Occasions are stored per kit as `occ` in the catalogue, derived from what is actually inside the
   box and what it costs per head -- never guessed in the browser. */
var OCC=[['onboarding','New hire welcome'],['client','Client & prospect gifts'],
  ['recognition','Employee recognition'],['tradeshow','Trade show & events'],
  ['holiday','Holiday & year-end'],['exec','Executive & VIP']];
function occOK(list){
  if(!VIEW.occ)return list;
  return list.filter(function(k){var it=BYKEY[k];return it&&(it.occ||[]).indexOf(VIEW.occ)>=0;});}
function renderOccbar(){
  var el=document.getElementById('occbar');if(!el)return;
  var keys=(VIEW.sub==='all')?[].concat.apply([],subNames(VIEW.cat).map(function(s){return BUCKETS[VIEW.cat][s];})):((BUCKETS[VIEW.cat]||{})[VIEW.sub]||[]);
  var cnt={};keys.forEach(function(k){var it=BYKEY[k];if(!it)return;(it.occ||[]).forEach(function(o){cnt[o]=(cnt[o]||0)+1;});});
  var live=OCC.filter(function(o){return cnt[o[0]]>0;});
  // Only appears where occasions exist (the gift-set aisle); silent everywhere else.
  if(live.length<2){el.innerHTML='';el.style.display='none';VIEW.occ=null;return;}
  el.style.display='';
  el.innerHTML='<span class="fitlbl">Occasion</span><button type="button" class="cfchip'+(VIEW.occ?'':' on')+'" data-occ="">All</button>'+
    live.map(function(o){return '<button type="button" class="cfchip'+(VIEW.occ===o[0]?' on':'')+'" data-occ="'+o[0]+'">'+o[1]+' <i>'+cnt[o[0]]+'</i></button>';}).join('');
  el.querySelectorAll('.cfchip').forEach(function(x){x.addEventListener('click',function(){
    VIEW.occ=x.dataset.occ||null;renderOccbar();renderGrid();});});
}
/* What is actually IN the box, on the card itself. Scanning a hundred gift sets by hero photo alone
   means opening every one to find out whether it has a bottle or a blanket in it.
   Two accuracy notes, both from reading the real data:
     * the piece COUNT used to include the gift box, so a "4 pieces" set handed the recipient three
       things. `pieces` counts only what comes out of the box; the box is credited separately.
     * component names are pre-shortened in the catalogue (`contents`), because deriving them in the
       browser produced "Set · Set · Set" on the bar and tea sets. */
function kitContentsHtml(item){
  var c=item.contents||[];
  if(!c.length&&!(item.includes||[]).length)return '';
  var n=(item.pieces!=null)?item.pieces:(item.includes||[]).length;
  var pill='<div class="mpcs">'+n+(n===1?' piece':' pieces')+(item.boxed?' + gift box':'')+'</div>';
  return pill+(c.length?'<div class="minc">'+esc(c.join(' · '))+'</div>':'');
}
var BANDS=[['u50','Under $50',0,50],['50_75','$50-$75',50,75],['75_100','$75-$100',75,100],['o100','$100+',100,1e9]];
function unitOf(it){return (it.layer==='promo')?(it.price_cad||0):(it.prices?it.prices[it.prices.length-1]:0);}
function bandOK(list){
  if(!VIEW.band)return list;
  var b=BANDS.filter(function(x){return x[0]===VIEW.band;})[0];if(!b)return list;
  return list.filter(function(k){var u=unitOf(BYKEY[k]||{});return u>=b[2]&&u<b[3];});}
function renderBandbar(){
  var el=document.getElementById('bandbar');if(!el)return;
  var keys=(VIEW.sub==='all')?[].concat.apply([],subNames(VIEW.cat).map(function(s){return BUCKETS[VIEW.cat][s];})):((BUCKETS[VIEW.cat]||{})[VIEW.sub]||[]);
  var cnt={};BANDS.forEach(function(b){cnt[b[0]]=keys.filter(function(k){var u=unitOf(BYKEY[k]||{});return u>=b[2]&&u<b[3];}).length;});
  var live=BANDS.filter(function(b){return cnt[b[0]]>0;});
  if(live.length<2||keys.length<6){el.innerHTML='';el.style.display='none';VIEW.band=null;return;}
  el.style.display='';
  el.innerHTML='<span class="fitlbl">Budget</span><button type="button" class="cfchip'+(VIEW.band?'':' on')+'" data-band="">Any</button>'+
    live.map(function(b){return '<button type="button" class="cfchip'+(VIEW.band===b[0]?' on':'')+'" data-band="'+b[0]+'">'+b[1]+' <i>'+cnt[b[0]]+'</i></button>';}).join('');
  el.querySelectorAll('.cfchip').forEach(function(x){x.addEventListener('click',function(){VIEW.band=x.dataset.band||null;renderBandbar();renderGrid();});});
}
function renderColbar(){
  var el=document.getElementById('colbar');if(!el)return;
  var keys=(VIEW.sub==='all')?[].concat.apply([],subNames(VIEW.cat).map(function(s){return BUCKETS[VIEW.cat][s];})):((BUCKETS[VIEW.cat]||{})[VIEW.sub]||[]);
  var count={};keys.forEach(function(k){var it=BYKEY[k];if(!it)return;Object.keys(itemFam(it)).forEach(function(f){count[f]=(count[f]||0)+1;});});
  var fams=COLFAM.map(function(c){return c[0];}).filter(function(f){return count[f]>1;});
  if(fams.length<3||keys.length<6){el.innerHTML='';el.style.display='none';VIEW.col=null;return;}
  el.style.display='';
  el.innerHTML='<span class="fitlbl">Colour</span>'+
    '<button type="button" class="cfchip'+(VIEW.col?'':' on')+'" data-fam="">Any</button>'+
    fams.map(function(f){return '<button type="button" class="cfchip sw'+(VIEW.col===f?' on':'')+'" data-fam="'+f+'" title="'+f+'">'+
      '<span style="background:'+famSwatch(f)+'"></span>'+f+' <i>'+count[f]+'</i></button>';}).join('');
  el.querySelectorAll('.cfchip').forEach(function(b){b.addEventListener('click',function(){
    VIEW.col=b.dataset.fam||null;
    // jump every matching card to that colour so the grid reads as one coherent palette
    if(VIEW.col)Object.keys(BYKEY).forEach(function(k){var it=BYKEY[k],m=it&&itemFam(it)[VIEW.col];if(m)BCOL[k+'|'+fitOf(it)]=m;});
    renderColbar();renderOccbar();renderGrid();});});
}
function renderFitbar(){
  var el=document.getElementById('fitbar');if(!el)return;
  var keys=(VIEW.sub==='all'?ALLKEYS.filter(function(k){var c=classify(BYKEY[k]);return c.mega===VIEW.cat;}):(BUCKETS[VIEW.cat]||{})[VIEW.sub]||[]);
  var nCut=keys.filter(function(k){return hasLadies(BYKEY[k]);}).length;                       // distinct ladies' cut
  var nHer=keys.filter(function(k){var i=BYKEY[k]||{};return hasLadies(i)||i.unisex;}).length;        // everything she can wear
  // Only offer the filter where there is a real choice to make: if nothing has its own ladies' cut,
  // Men's and Ladies' would return the same cards AND the same photos, which just trains people to
  // ignore filters.
  if(!nCut){el.innerHTML='';el.style.display='none';return;}
  el.style.display='';
  var opts=[{id:'all',lbl:'All fits'},{id:'mens',lbl:'Men’s'},{id:'womens',lbl:'Ladies’ ('+nHer+')'}];
  el.innerHTML='<span class="fitlbl">Fit</span>'+opts.map(function(o){
    return '<button type="button" class="fchip'+(VIEW.fit===o.id?' on':'')+'" data-fit="'+o.id+'">'+o.lbl+'</button>';}).join('');
  el.querySelectorAll('.fchip').forEach(function(b){b.addEventListener('click',function(){VIEW.fit=b.dataset.fit;renderFitbar();renderGrid();});});
}
function renderSubchips(){var el=document.getElementById('subchips');if(!el)return;
  var subs=subNames(VIEW.cat);
  var h='<button class="schip'+(VIEW.sub==='all'?' on':'')+'" data-sub="all">All<span class="scn">'+TOTALS[VIEW.cat]+'</span></button>';
  h+=subs.map(function(s){return '<button class="schip'+(VIEW.sub===s?' on':'')+'" data-sub="'+esc(s)+'">'+esc(s)+'<span class="scn">'+BUCKETS[VIEW.cat][s].length+'</span></button>';}).join('');
  el.innerHTML=h;
  renderFitbar();renderColbar();renderOccbar();renderBandbar();
  el.querySelectorAll('.schip').forEach(function(b){b.addEventListener('click',function(){setSub(b.dataset.sub);
    var tr=b.closest('.subchips');if(tr)tr.scrollTo({left:b.offsetLeft-tr.clientWidth/2+b.clientWidth/2,behavior:'smooth'});});});}
function wireCards(){
  var g=document.getElementById('grid');if(!g)return;
  g.querySelectorAll('.mcard').forEach(function(card){
    card.addEventListener('click',function(){openSheet(card.dataset.key);});
    card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openSheet(card.dataset.key);}});});
  g.querySelectorAll('.madd').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();var k=b.dataset.key;if(CART[k]){openSheet(k);}else{quickAdd(k);}});});
  // Swatch on the CARD: swap the photo in place. No re-render of the whole grid, so the shopper keeps
  // their scroll position while flicking through colours.
  g.querySelectorAll('.cdot').forEach(function(d){d.addEventListener('click',function(e){
    e.stopPropagation();
    var card=d.closest('.mcard');if(!card)return;
    var key=card.dataset.key,item=BYKEY[key];if(!item)return;
    BCOL[key+'|'+fitOf(item)]=d.dataset.col;
    var o=overlayHtml(item,vmOf(key),d.dataset.col,'front',browseCols(item),browsePlaces(item));
    var st=card.querySelector('.mstage');
    if(st){var im=st.querySelector('img.g');if(im){im.src=o.g;im.classList.add('ld');}
      var old=st.querySelectorAll('img.l');for(var i=0;i<old.length;i++)old[i].remove();
      if(o.lg)st.insertAdjacentHTML('beforeend',o.lg);}
    card.querySelectorAll('.cdot').forEach(function(x){x.classList.toggle('on',x===d);});
    var lbl=card.querySelector('.cdnow');if(lbl)lbl.textContent=d.dataset.col;
  });});
  g.querySelectorAll('.mvid').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();openVideo(b.dataset.vid,b.dataset.vname);});});
  g.querySelectorAll('.mstage .g').forEach(function(im){if(im.complete)im.classList.add('ld');else im.addEventListener('load',function(){im.classList.add('ld');});});
  g.querySelectorAll('.mccard,.nextup').forEach(function(b){b.addEventListener('click',function(){setCat(b.dataset.cat,true);});
    b.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();setCat(b.dataset.cat,true);}});});
  refreshCartUI();}
// Everything a buyer might reasonably type. Steven searched "sanmar" for the Red Kap / Dickies shirts and
// got zero results, because only name+sku were indexed and their sku reads "Red Kap" — the distributor we
// buy from was nowhere in the haystack. Now it also covers brand, supplier, the vendor style numbers
// (men's AND ladies', so "SP24" or "SP23" finds the shirt) and fabric, so "cotton" finds the cotton styles.
function searchText(it){
  return ((it.name||'')+' '+(it.sku||'')+' '+(it.brand||'')+' '+
          (it.msku||'')+' '+(it.wsku||'')+' '+(it.fabric||'')).toLowerCase();
}
function renderGrid(){
  var grid=document.getElementById('grid'),hd=document.getElementById('gridhd'),nr=document.getElementById('noResults');
  if(!grid)return;var q=(VIEW.q||'').trim().toLowerCase();
  if(q){
    var matches=ALLKEYS.filter(function(k){var it=BYKEY[k];return it&&searchText(it).indexOf(q)>=0;});
    hd.innerHTML=matches.length?('<h2 class="glbl">Search results</h2><span class="gsub">'+matches.length+' match'+(matches.length===1?'':'es')+' for “'+esc(VIEW.q)+'”</span>'):'';
    grid.innerHTML='<div class="menu">'+matches.map(menuCard).join('')+'</div>';
    nr.style.display=matches.length?'none':'';wireCards();return;}
  nr.style.display='none';
  // One place decides which keys the grid may show, so the Fit chip behaves identically in the flat,
  // grouped and single-sub layouts.
  // Ladies' includes UNISEX. A unisex hoodie is genuinely available to her — it simply isn't cut
  // separately — so excluding it hid 10 of the 21 Sweaters & Fleece styles from anyone shopping for
  // the women on their team. Items with neither flag are men's-only and stay hidden.
  var fitOK=function(list){var L=(VIEW.fit==='womens')?list.filter(function(k){var i=BYKEY[k]||{};return hasLadies(i)||i.unisex;}):list;return bandOK(colourOK(occOK(L)));};
  var subs=subNames(VIEW.cat),csa=VIEW.cat==='hivis'?' <span class="csa">CSA Z96 · ANSI 107</span>':'';
  var _shown=(VIEW.sub==='all'?fitOK(ALLKEYS.filter(function(k){return (BUCKETS[VIEW.cat]||{})&&subs.some(function(s){return BUCKETS[VIEW.cat][s].indexOf(k)>=0;});})).length:fitOK(BUCKETS[VIEW.cat][VIEW.sub]||[]).length);
  hd.innerHTML='<h2 class="glbl">'+esc(megaName(VIEW.cat))+csa+'</h2><span class="gsub">'+_shown+' styles'+(VIEW.fit==='womens'?' in ladies’ &amp; unisex fits':'')+'</span>';
  var inner;
  if(VIEW.sub!=='all'){inner='<div class="menu">'+fitOK(BUCKETS[VIEW.cat][VIEW.sub]||[]).map(menuCard).join('')+'</div>';}
  else if(subs.length>1&&TOTALS[VIEW.cat]>6){
    inner=subs.map(function(s){var ks=fitOK(BUCKETS[VIEW.cat][s]);if(!ks.length)return '';
      return '<div class="subgrp"><h3 class="subhd">'+esc(s)+' <span class="subn">'+ks.length+'</span></h3><div class="menu">'+ks.map(menuCard).join('')+'</div></div>';}).join('');}
  else{var flat=[];subs.forEach(function(s){flat=flat.concat(BUCKETS[VIEW.cat][s]);});flat=fitOK(flat);inner='<div class="menu">'+flat.map(menuCard).join('')+'</div>';}
  grid.innerHTML=(VIEW.cat==='hivis'?hivisIntroHtml():'')+inner+moreCatsHtml();wireCards();}
// Compliance-forward intro for the Hi-Vis category — safety buyers shop by STANDARD & CLASS first.
// Certified for BOTH Canada (CSA Z96-22) and the U.S. (ANSI/ISEA 107-2020), with a plain-English class guide.
function hivisIntroHtml(){
  return '<div class="hvintro">'+
    '<div class="hvhead"><span class="hvbadge">🛡 CSA Z96-22 + ANSI/ISEA 107-2020</span>'+
      '<p>Every hi-vis piece here is <b>certified for both Canada and the U.S.</b> — spec your crew once and stay compliant on either side of the border. Each style is labelled with its exact class so you can match the garment to the hazard.</p></div>'+
    '<div class="hvclass">'+
      '<div class="hvc"><b>Class 1</b><span>Low-risk / off-road — parking lots, warehouse yards, sites set back from traffic.</span></div>'+
      '<div class="hvc"><b>Class 2</b><span>Roadside &amp; active traffic — the workhorse class for road crews, survey, utility &amp; municipal.</span></div>'+
      '<div class="hvc"><b>Class 3</b><span>High-speed / low-light — highway, night work &amp; poor visibility; full sleeve coverage.</span></div>'+
    '</div>'+
    '<p class="hvnote">Classes shown are the rating for the <b>hi-vis colourways</b> — black &amp; navy versions of some styles certify one class lower. Where a maker publishes only “meets CSA” without a class number, we show that as-is rather than guess. <b>Tell us the job and we’ll confirm the exact class in writing on your quote.</b></p>'+
    '</div>';}
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
// "Shop the collection" — the storefront hero: big branded image tiles for EVERY category so a buyer sees
// the whole range at a glance and jumps straight in (Uber-Eats home). Rendered once, above the browse tabs.
/* ---------- PERSUASION: why buy branded gear, and why buy it from Just Deals ----------
   Two objections kill a team-store order: "is this worth the spend?" and "am I being overcharged?".
   The price promise answers the second the moment they start browsing (Walmart-style everyday-low-price
   positioning); the ROI stats and the reasons block answer both once they've seen the product. */
function valueStripHtml(){
  // Slim, scannable value bar — NOT a heavy band. The top of a store page has one job: get people
  // into product. This answers "am I overpaying / what's the catch / is it worth it" in one line
  // without pushing the catalogue below the fold.
  var items=[
    {i:'\u2605',b:'Competitive pricing, guaranteed',d:'We match any lower written quote'},
    {i:'\u2713',b:'Free digital proofs',d:'See your logo before you commit'},
    {i:'\u25C6',b:'3,400+ impressions per shirt',d:'Apparel is the most-kept promo item'}
  ];
  return '<section class="vbar"><div class="w vbarin">'+items.map(function(v){
    return '<div class="vbi"><span class="vbk">'+v.i+'</span><span class="vbt"><b>'+esc(v.b)+'</b><i>'+esc(v.d)+'</i></span></div>';
  }).join('')+'</div></section>';}

var GEARSTATS=[
  {n:'3,400+',k:'Impressions per shirt',d:'What one branded shirt earns over its life. Apparel is the most-kept promo item there is.'},
  {n:'65%',k:'Better perception',d:'Say staff in uniform give them a more positive impression of the company.'},
  {n:'58%',k:'Higher perceived quality',d:'Expect better product and service when it\u2019s delivered by uniformed staff.'},
  {n:'77%',k:'Team pride',d:'Of workers say wearing the company brand gives them a sense of pride.'}
];
function whyGearHtml(){
  return '<section class="why"><div class="w">'+
    '<div class="whyhd"><span class="eyb">Why branded gear works</span>'+
      '<h2>Gear that pays for itself.</h2>'+
      '<p>Branded apparel isn\u2019t a cost — it\u2019s marketing, trust and team pride your people wear every day.</p></div>'+
    '<div class="stats">'+GEARSTATS.map(function(s){
      return '<div class="stat"><b>'+esc(s.n)+'</b><span class="statk">'+esc(s.k)+'</span><span class="statd">'+esc(s.d)+'</span></div>';
    }).join('')+'</div>'+
  '</div></section>';}

function whyJdpHtml(){
  // Deliberately does NOT repeat the hero trust facts (since-1994 / 12,846+ teams / ships CA+US).
  // Each card earns its place by removing a distinct risk.
  var reasons=[
    {t:'We match any lower written quote',d:'Same product, same decoration, same quantity — send it over and we match it. You never have to shop around to know the price is right.'},
    {t:'See it before you commit',d:'Free digital proofs of your logo on the actual garment, at the exact size and placement. No cost, no obligation.'},
    {t:'A real person, not a call centre',d:'You deal with our team directly — same people from first quote through to delivery.'},
    {t:'One supplier for the whole crew',d:'CSA-rated hi-vis and rugged workwear through to polos and client gifts. One invoice, one contact.'}
  ];
  return '<section class="whyjdp"><div class="w">'+
    '<div class="whyhd"><span class="eyb">Why Just Deals</span>'+
      '<h2>The right price, and no surprises.</h2>'+
      '<p>Two things make branded gear risky: overpaying, and it not looking the way you pictured. We take both off the table before you spend anything.</p></div>'+
    '<div class="rsns">'+reasons.map(function(r,i){
      return '<div class="rsn'+(i===0?' rsnhero':'')+'"><span class="rsnk">'+(i===0?'\u2605':'\u2713')+'</span>'+
        '<div><b>'+esc(r.t)+'</b><span>'+esc(r.d)+'</span></div></div>';
    }).join('')+'</div>'+
    '<div class="whycta"><button class="reccta" id="whyCta">Build your kit — get an exact quote <span class="ar">\u2192</span></button>'+
      '<span class="whyctan">Free proofs · no payment now · no obligation</span></div>'+
  '</div></section>';}

function shopCatsHtml(){
  if(!CATS||CATS.length<2)return '';
  // Just the two brand worlds — a clean choose-your-world entry. Category picking happens in the sticky tabs.
  var worlds=AUD.map(function(a){
    var cs=a.cats.filter(function(c){return CATS.indexOf(c)>=0;});
    if(!cs.length)return '';
    var n=cs.reduce(function(s,c){return s+(TOTALS[c]||0);},0);
    return '<button class="audbanner aud-'+a.id+'" data-world="'+a.id+'" style="background-image:linear-gradient(0deg,rgba(18,13,7,.92),rgba(18,13,7,.34) 52%,rgba(18,13,7,.06)),url('+worldImg(a.id)+')">'+
      '<span class="audk">'+esc(a.name)+'</span><p>'+esc(a.blurb)+'</p>'+
      '<span class="audgo">Shop '+n+' styles →</span></button>';
  }).join('');
  return '<section class="shopcats"><div class="w">'+
    '<div class="schd"><h2>Built for the crew &amp; the client</h2><p>Two worlds, one premium store — pick your side, then browse by category.</p></div>'+
    '<div class="worldgrid">'+worlds+'</div></div></section>';
}
// Ready-made kits, curated by ROLE — a premium B2B move: outfit a whole role in one tap.
function kitsHtml(){
  var cards=KITS.map(function(k){var items=kitItems(k);if(items.length<2)return '';
    var pics=items.slice(0,4).map(function(key){var it=BYKEY[key],vm=vmOf(key),o=overlayHtml(it,vm,vm.colour,'front');
      return '<div class="kpic"><img class="g" src="'+o.g+'" alt="'+esc(it.name)+'" loading="lazy" decoding="async">'+o.lg+'</div>';}).join('');
    return '<button class="kitcard" data-kit="'+k.id+'" aria-label="'+esc(k.name)+'">'+
      '<div class="kpics kn'+items.length+'">'+pics+'</div>'+
      '<div class="kittx"><span class="kittag">'+esc(k.tag)+'</span><b>'+esc(k.name)+'</b>'+
      '<span class="kitmeta">'+items.length+' pieces · ready with your logo <i>→</i></span></div></button>';
  }).filter(Boolean).join('');
  if(!cards)return '';
  return '<section class="kits"><div class="w"><div class="schd"><h2>Ready-made kits</h2>'+
    '<p>Curated by role — outfit a crew, a supervisor, a client-facing rep or a new hire in one move.</p></div>'+
    '<div class="kitgrid">'+cards+'</div></div></section>';
}
function openKitSheet(kid){
  var kit=null;for(var i=0;i<KITS.length;i++)if(KITS[i].id===kid)kit=KITS[i];if(!kit)return;
  var items=kitItems(kit);if(!items.length)return;
  var rows=items.map(function(key){var it=BYKEY[key],vm=vmOf(key),o=overlayHtml(it,vm,vm.colour,'front');
    var price=(it.layer==='promo')?(money(it.price_cad)+' <small>/'+(it.unit==='dozen'?'dozen':'pc')+'</small>')
      :('from '+money(unitPrice(key,vm.decos,CFG.pricing.cols[CFG.pricing.cols.length-1])));
    return '<div class="krow"><div class="krpic"><img class="g" src="'+o.g+'" alt="'+esc(it.name)+'">'+o.lg+'</div>'+
      '<div class="krtx"><b>'+esc(it.name)+'</b><span class="krsku">'+esc(it.sku)+'</span><span class="krpr">'+price+'</span></div></div>';}).join('');
  document.getElementById('sheet').innerHTML=
    '<button class="shx" id="shx" aria-label="Close">✕</button>'+
    '<div class="shscroll"><div class="kithd"><span class="kittag">'+esc(kit.tag)+'</span><h2>'+esc(kit.name)+'</h2><p>'+esc(kit.blurb)+'</p></div>'+
    '<div class="krows">'+rows+'</div>'+
    '<div class="pinc"><span class="pinci">✓</span> Add the set, then tweak sizes &amp; colours in your kit and send for your exact quote — free proof, no obligation.</div></div>'+
    '<div class="shfoot"><button class="shaddbtn" id="kitAdd"><span>Add all '+items.length+' pieces to my kit</span></button>'+
    '<div class="shtrust">Adjust any piece after adding · no payment now</div></div>';
  var sh=document.getElementById('sheet');
  document.getElementById('shx').addEventListener('click',closeAll);
  sh.querySelectorAll('.krpic .g').forEach(function(im){if(im.complete)im.classList.add('ld');else im.addEventListener('load',function(){im.classList.add('ld');});});
  document.getElementById('kitAdd').addEventListener('click',function(){items.forEach(function(k){quickAdd(k);});closeAll();refreshCartUI();openCart();});
  document.getElementById('ov').classList.add('on');sh.classList.add('on');document.body.style.overflow='hidden';
}
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
  return '<div class="morecats">'+banner+'</div>';}   // slim: one "Up next" nudge; the sticky tabs carry navigation
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
     '<span class="brand"><img src="'+kurl(((CFG.logos&&CFG.logos[0]&&CFG.logos[0].inks&&CFG.logos[0].inks.dark))||CFG.cover_logo||'img/logo-white.png')+'" onerror="this.style.display=\'none\'" alt=""><b>'+esc(CFG.client)+'</b><i>× Just Deals</i></span>'+
     '<button class="cartbtn" id="openCart"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/></svg>'+
       '<span class="lbl">Your kit</span><span class="n" id="cartN">0</span></button></div></header>'+
   '<section class="hero"><div class="w heroin">'+
     '<div class="eyb">'+(demo?'Sample store · your logo goes here':'Premium branded workwear &amp; apparel')+'</div>'+
     '<h1>'+esc(poss(CFG.client))+" team store</h1>"+
     '<p class="herosub">'+(demo?'This is a live sample. Every item shows exactly where your logo goes — swap in your brand and it becomes your team’s store. Live pricing, exact quote, no obligation.':'One premium store for the jobsite and the front office — CSA hi-vis and rugged workwear to sharp branded polos and client gifts, every piece ready with your logo.')+'</p>'+
     heroCta+
     '<div class="herotrust"><span>Family-owned in Toronto since 1994</span><span>12,846+ teams outfitted</span><span>Ships across Canada &amp; the U.S.</span></div>'+
   '</div></section>'+
   valueStripHtml()+
   shopCatsHtml()+
   '<div class="navwrap" id="navwrap">'+
     '<div class="filterbar"><div class="ctabsrow">'+
       '<div class="ctabs" id="ctabs"></div>'+
       '<button class="fsbtn" id="searchToggle" aria-label="Search products"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></button></div>'+
       '<div class="fsrow"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#8a93a0" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'+
         '<input id="kitSearch" type="search" placeholder="Search all '+ALLKEYS.length+' products…" aria-label="Search products" autocomplete="off">'+
         '<button class="fsx" id="searchClose" aria-label="Close search">Cancel</button></div>'+
     '</div>'+
     '<div class="subbar"><div class="subchips" id="subchips"></div><div class="fitbar" id="fitbar"></div><div class="fitbar colbar" id="occbar"></div><div class="fitbar colbar" id="colbar"></div><div class="fitbar colbar" id="bandbar"></div></div>'+
   '</div>'+
   '<main class="w"><div class="gridhd" id="gridhd"></div><div class="grid" id="grid"></div>'+
     '<div class="noresults" id="noResults" style="display:none">No products match your search. Try another term.</div></main>'+
   whyGearHtml()+
   whyJdpHtml()+
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
  var wc=document.getElementById('whyCta');if(wc)wc.addEventListener('click',function(){
    if(cartCount()>0){openCart();}else{VIEW.sub='all';renderGrid();scrollToResults();}});
  // "Shop the collection" hero tiles -> jump into a category (and reveal their images, which sit outside #grid).
  document.querySelectorAll('.sccard').forEach(function(b){b.addEventListener('click',function(){setCat(b.dataset.cat,true);});});
  document.querySelectorAll('.scpic .g,.kpic .g').forEach(function(im){if(im.complete)im.classList.add('ld');else im.addEventListener('load',function(){im.classList.add('ld');});});
  // world lifestyle banners -> jump straight to that world's first category (no extra toggle layer)
  document.querySelectorAll('.audbanner').forEach(function(b){b.addEventListener('click',function(){var a=audOf(b.dataset.world);var cs=a?a.cats.filter(function(c){return CATS.indexOf(c)>=0;}):[];if(cs.length)setCat(cs[0],true);});});
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
  if(item&&item.layer==='promo'){   // promotional products: clean photo + colour + quantity + decoration
    SH={key:key,promo:true,gi:0,colour:(ex&&ex.colour)||(item.cols[0]||{}).name,
        qty:(ex&&ex.qty)||item.moq||1,mi:(ex&&ex.mi)||0,locs:(ex&&ex.locs)||1};
    renderSheet();
    document.getElementById('ov').classList.add('on');document.getElementById('sheet').classList.add('on');
    document.body.style.overflow='hidden';return;
  }
  if(ex&&ex.decos){ex.decos.forEach(function(d){exmap[d.pl]=d;});}
  // Size breakdown is the ONLY quantity control. baseQty preserves the count of an item that was
  // quick-started without a size split (e.g. the recommended kit) so reopening it doesn't lose it.
  var exfit=(ex&&ex.fit)||fitOf(item);
  SH={key:key,colour:(ex&&ex.colour)||BCOL[key+'|'+exfit]||vm.colour,face:'front',gimg:null,D:{},showExtra:false,sizes:{},fit:exfit,baseQty:ex?(ex.sizes?0:(ex.qty||moq())):moq()};
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
// Photo gallery for the detail sheet — every product photo (angles/model). First thumb = current colour.
function galleryStrip(item){
  var gal=item.gallery||[];if(!gal.length)return '';
  var cur=colInList(curColsOf(item,SH.fit),SH.colour);
  var t=['<button class="shgthumb'+(SH.gimg?'':' on')+'" data-img="" style="background-image:url('+gurl(cur.front)+')" aria-label="Main colour view"></button>'];
  gal.forEach(function(g){t.push('<button class="shgthumb'+(SH.gimg===g?' on':'')+'" data-img="'+esc(g)+'" style="background-image:url('+gurl(g)+')" aria-label="Product photo"></button>');});
  return '<div class="shgal">'+t.join('')+'</div>';
}
// PROMO sheet — simple & honest. Debco is flat End-Quantity Pricing, so we anchor on ONE per-piece price
// (same at any qty), show the logo setup as a clear one-time line, and give a plain cost summary. No
// gamified "savings tiers" (the only qty effect is setup spreading) — just an easy, trustworthy decision.
function renderPromoSheet(){
  var item=BYKEY[SH.key];
  // The hero photo has to follow the SELECTED colour. Deriving it from `gallery` (or cols[0]) meant every
  // colour showed the supplier's default shot, so clicking a swatch re-rendered the sheet but the picture
  // never changed — it read as a broken store. Selected colour first, then any extra angles as thumbs.
  var selc=colInList(item.cols||[],SH.colour)||(item.cols||[])[0]||{};
  var gal=(selc.front?[selc.front]:[]).concat((item.gallery||[]).filter(function(g){return g&&g!==selc.front;}));
  if(!gal.length)gal=(item.gallery&&item.gallery.length)?item.gallery.slice():[];
  var gi=Math.min(SH.gi||0,gal.length-1);
  var q=promoQuote(item,SH);
  var min=q.min, methods=q.methods, isDQ=q.decoquote, unitP=(q.unit==='dozen'?'dozen':'pc');
  var thumbs=gal.length>1?('<div class="pthumbs">'+gal.map(function(g,i){return '<button class="pthumb'+(i===gi?' on':'')+'" data-i="'+i+'" style="background-image:url('+gurl(g)+')" aria-label="Photo '+(i+1)+'"></button>';}).join('')+'</div>'):'';
  var cols=(item.cols||[]).map(function(c){return '<button class="pcol'+(c.name===SH.colour?' on':'')+'" data-col="'+esc(c.name)+'" title="'+esc(c.name)+'"><span style="background:'+(c.rgb||'#ccc')+'"></span></button>';}).join('');
  var priceSub,logoGrp,picksHtml,sumHtml,footHtml,step=(min>=48?48:(min>=24?24:12));
  if(isDQ){
    var multi=(q.tiers&&q.tiers.length>1);
    priceSub='<div class="pprice-sub">'+(multi?'Order more, pay less per '+unitP:'Your price per '+unitP)+' · your logo added at proof</div>';
    // What's in the box. A gift set is bought on its CONTENTS, so list them; link any component we
    // actually stock (matched on vendor SKU) and leave the rest as plain text rather than a dead link.
    var incHtml='';
    if(item.includes&&item.includes.length){
      incHtml='<div class="pgrp"><div class="pgl">Gift set includes</div><ul class="pinc">'+item.includes.map(function(x){
        var hit=null;for(var k in BYKEY){if((BYKEY[k].msku||'').toUpperCase()===String(x.sku||'').toUpperCase()){hit=k;break;}}
        var txt=esc(x.desc||x.sku||'');
        return '<li>'+(hit?('<a href="?item='+encodeURIComponent(hit)+'" data-item="'+esc(hit)+'">'+txt+'</a>'):txt)+
               (x.sku?(' <small>'+esc(x.sku)+'</small>'):'')+'</li>';}).join('')+'</ul></div>';}
    logoGrp=incHtml+'<div class="pgrp"><div class="pgl">Your logo</div><div class="qlogo"><span class="pinci">✓</span> Add your logo — we’ll email a <b>free proof</b> and confirm decoration &amp; setup on your quote.</div></div>';
    var tq=(q.tiers&&q.tiers.length)?q.tiers.map(function(t){return t.q;}):promoTiers(min);
    // Show the BREAK RANGE, not just its opening number: the vendor's own table reads "6 - 47" then
    // "48+", and a bare "6" next to a bare "48" makes a buyer guess where one price stops and the next
    // starts. Last tier is open-ended.
    picksHtml='<div class="ptiers">'+tq.map(function(t,ti){
      var lbl=(ti<tq.length-1)?(t+'\u2013'+(tq[ti+1]-1)):(t+'+');
      return '<button class="ptier'+(t===q.qty?' on':'')+'" data-q="'+t+'"><b>'+lbl+'</b><span>'+money(tierPrice(item,t))+'/'+unitP+'</span></button>';}).join('')+'</div>';
    var setupLine=(item.setup>0)?('<div class="psrow"><span>One-time setup <small>charged once per logo</small></span><span>'+money(item.setup)+'</span></div>'):'';
    sumHtml='<div class="psum"><div class="psrow"><span>'+q.qty+' '+unitP+' × '+money(q.perPiece)+'</span><span>'+money(q.goods)+'</span></div>'+
      setupLine+
      '<div class="psrow"><span>Your logo</span><span>added at proof</span></div>'+
      '<div class="psrow pstot"><span>Estimated total</span><span>'+money(q.goods+(item.setup>0?item.setup:0))+'</span></div></div>';
    footHtml='<div class="pfrow"><span>'+q.qty+' '+unitP+' · '+money(q.perPiece)+'/'+unitP+'</span><b>'+money(q.goods)+'</b></div>'+
      '<button class="shaddbtn" id="shAdd"><span>'+(CART[SH.key]?'Update kit':'Add to kit')+'</span><span class="p">'+money(q.goods)+'</span></button>'+
      '<div class="shtrust">Minimum '+min+' '+unitP+' · free proof · logo &amp; final price confirmed on your quote</div>';
  }else{
    var meth=methods.map(function(m,i){var up=m.r>0?('<small>+'+money(m.r)+'/pc</small>'):'<small>included</small>';
      return '<button class="pmeth'+(i===q.mi?' on':'')+'" data-mi="'+i+'">'+esc(m.n)+' '+up+'</button>';}).join('');
    var locBtns='<button class="ploc'+(q.locs===1?' on':'')+'" data-loc="1">1 spot <small>included</small></button>'+
      '<button class="ploc'+(q.locs===2?' on':'')+'" data-loc="2">2 spots <small>+'+money(item.addl_loc||0.75)+'/pc</small></button>';
    priceSub='<div class="pprice-sub">'+(q.run>0?esc(q.method.n):esc(q.method.n)+' · included')+(q.locs>1?' · 2 spots':'')+' · same price at any quantity</div>';
    logoGrp='<div class="pgrp"><div class="pgl">Your logo <i>1-colour included</i></div><div class="pmeths">'+meth+'</div><div class="plocs">'+locBtns+'</div></div>';
    picksHtml='<div class="ppicks">'+promoTiers(min).map(function(t){return '<button class="ppick'+(t===q.qty?' on':'')+'" data-q="'+t+'">'+t+'</button>';}).join('')+'</div>';
    sumHtml='<div class="psum"><div class="psrow"><span>'+q.qty+' pcs × '+money(q.perPiece)+'</span><span>'+money(q.goods+q.decoRun)+'</span></div>'+
      '<div class="psrow"><span>One-time logo setup'+(q.locs>1?' · 2 spots':'')+'</span><span>'+money(q.setup)+'</span></div>'+
      '<div class="psrow pstot"><span>Estimated total</span><span>'+money(q.total)+' <em>≈'+money(q.allIn)+'/pc</em></span></div></div>';
    footHtml='<div class="pfrow"><span>'+q.qty+' pcs · '+money(q.perPiece)+'/pc + '+money(q.setup)+' setup</span><b>'+money(q.total)+'</b></div>'+
      '<button class="shaddbtn" id="shAdd"><span>'+(CART[SH.key]?'Update kit':'Add to kit')+'</span><span class="p">'+money(q.total)+'</span></button>'+
      '<div class="shtrust">Minimum '+min+' pcs · free proof · no payment now</div>';
  }
  document.getElementById('sheet').innerHTML=
    '<button class="shx" id="shx" aria-label="Close">✕</button>'+
    '<div class="shscroll">'+
      '<div class="shimg"><div class="shstage"><img id="pmain" class="g" src="'+gurl(gal[gi])+'" alt="'+esc(item.name)+'"></div>'+thumbs+'</div>'+
      '<div class="shb">'+
        '<h2>'+esc(item.name)+'</h2>'+
        '<div class="shsku">'+esc(item.brand||'')+(item.layer==='promo'?'':' · item '+esc(item.msku||item.sku))+'</div>'+
        '<div class="pprice"><b>'+money(q.perPiece)+'</b><span>per '+unitP+'</span></div>'+
        priceSub+
        (item.desc?'<p class="shblurb">'+esc(item.desc)+'</p>':'')+
        (cols?'<div class="pgrp"><div class="pgl">Colour<i>'+esc(SH.colour||'')+'</i></div><div class="pcols">'+cols+'</div></div>':'')+
        logoGrp+
        '<div class="pgrp"><div class="pgl">How many?<i>minimum '+min+' '+unitP+'</i></div>'+picksHtml+
          '<div class="qty pqty"><button data-d="-'+step+'" aria-label="Fewer">–</button><input id="pqin" class="szin" type="number" inputmode="numeric" value="'+q.qty+'" min="'+min+'"><button data-d="'+step+'" aria-label="More">+</button></div></div>'+
        sumHtml+
        '<div class="pinc"><span class="pinci">✓</span> Free digital proof before anything is made · exact quote confirmed · no payment now.</div>'+
      '</div></div>'+
    '<div class="shfoot">'+footHtml+'</div>';
  var sh=document.getElementById('sheet');
  document.getElementById('shx').addEventListener('click',closeAll);
  sh.querySelectorAll('.pthumb').forEach(function(b){b.addEventListener('click',function(){SH.gi=+b.dataset.i;var mi=document.getElementById('pmain');if(mi)mi.src=gurl(gal[SH.gi]);sh.querySelectorAll('.pthumb').forEach(function(x){x.classList.toggle('on',x===b);});});});
  sh.querySelectorAll('.pcol').forEach(function(b){b.addEventListener('click',function(){SH.colour=b.dataset.col;SH.gi=0;renderPromoSheet();});});
  // Jump straight from a gift set to any component it contains, in place, with no page reload.
  sh.querySelectorAll('.pinc a[data-item]').forEach(function(a){a.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();openSheet(a.dataset.item);});});
  sh.querySelectorAll('.pmeth').forEach(function(b){b.addEventListener('click',function(){SH.mi=+b.dataset.mi;renderPromoSheet();});});
  sh.querySelectorAll('.ploc').forEach(function(b){b.addEventListener('click',function(){SH.locs=+b.dataset.loc;renderPromoSheet();});});
  sh.querySelectorAll('.ppick').forEach(function(b){b.addEventListener('click',function(){SH.qty=+b.dataset.q;renderPromoSheet();});});
  sh.querySelectorAll('.pqty button').forEach(function(b){b.addEventListener('click',function(){var cur=parseInt(document.getElementById('pqin').value,10)||min;SH.qty=Math.max(min,cur+parseInt(b.dataset.d,10));renderPromoSheet();});});
  var qin=document.getElementById('pqin');if(qin)qin.addEventListener('change',function(){SH.qty=Math.max(min,parseInt(qin.value,10)||min);renderPromoSheet();});
  document.getElementById('shAdd').addEventListener('click',function(){var was=!!CART[SH.key];CART[SH.key]={qty:q.qty,colour:SH.colour,mi:SH.mi,locs:SH.locs,promo:true};saveCart();closeAll();refreshCartUI();toast((was?'Updated · ':'Added · ')+item.name);});
}
function renderSheet(){
  var item=BYKEY[SH.key];
  if(item&&item.layer==='promo')return renderPromoSheet();
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
  var fitTog=hasLadies(item)?('<div class="fittog"><span class="fitl">Fit</span>'+
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
      '<div class="shimg" id="shimg"><div class="shstage"><img class="g" src="'+(SH.gimg?gurl(SH.gimg):o.g)+'" alt="">'+(SH.gimg?'':o.lg)+'</div>'+faceTog+'</div>'+
      galleryStrip(item)+
      ((item.scenic||item.video)?('<div class="shmedia">'+
        (item.scenic?'<button class="shworn" id="shworn" aria-label="See it worn"><img src="'+gurl(item.scenic)+'" alt="" loading="lazy"><span class="swt"><b>See it worn</b><i>real in-the-field photo</i></span><span class="swgo">→</span></button>':'')+
        (item.video?'<button class="vwatch" id="vwatch"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Watch video</button>':'')+
      '</div>'):'')+
      '<div class="shb"><h2>'+esc(item.name)+'</h2><div class="shsku">'+esc(item.sku)+(hasLadies(item)?(SH.fit==='womens'?' · Ladies’':' · Men’s'):(item.unisex?' · Unisex':''))+(item.layer==='field'&&item.csa?' · CSA hi-vis':'')+'</div>'+
      '<div class="shfrom">from <b>'+money(fromP)+'</b> <small>/pc</small>'+(hasDecoPlace(item)?' · decorated':'')+'</div>'+
      (item.blurb?'<p class="shblurb">'+esc(item.blurb)+'</p>':'')+
      fitTog+step1+qtyGrp+primaryHtml+extraHtml+
      '<div class="shnote">'+(hasDecoPlace(item)?'Prices are per piece, decorated — your logo (embroidery / print) is included. One-time setup shows once in your kit summary. ':'Prices are per piece (blank garment — no decoration on this item). ')+'Exact quote confirmed before anything runs.</div>'+
    '</div></div>'+
    '<div class="shfoot">'+priceClar+
      '<button class="shaddbtn" id="shAdd"'+(canAdd?'':' disabled')+'><span>'+(canAdd?(CART[SH.key]?'Update kit':'Add to kit'):('Add '+moq()+'+ pieces'))+'</span><span class="p">'+money(line)+'</span></button>'+
      '<div class="shtrust">✓ Live pricing · exact quote · no obligation · no payment now</div></div>';
  var sh=document.getElementById('sheet');
  document.getElementById('shx').addEventListener('click',closeAll);
  var vw=document.getElementById('vwatch');if(vw)vw.addEventListener('click',function(){openVideo(item.video,item.name);});
  var sw=document.getElementById('shworn');if(sw)sw.addEventListener('click',function(){openScenic(gurl(item.scenic),item.name);});
  sh.querySelectorAll('.cchip').forEach(function(b){b.addEventListener('click',function(){SH.colour=b.dataset.col;SH.gimg=null;swapPreview();renderSheet();});});
  sh.querySelectorAll('.shgthumb').forEach(function(b){b.addEventListener('click',function(){SH.gimg=b.dataset.img||null;renderSheet();
    var st=document.querySelector('#sheet .shscroll');if(st)st.scrollTop=0;});});
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
  if(!BYKEY[key])return;var it=BYKEY[key],vm=vmOf(key),ex=CART[key];
  if(it.layer==='promo'){CART[key]={qty:(ex&&ex.qty)||it.moq||1,colour:(ex&&ex.colour)||(it.cols[0]||{}).name,mi:(ex&&ex.mi)||0,locs:(ex&&ex.locs)||1,promo:true};saveCart();refreshCartUI();toast('Added · '+it.name);return;}
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
function cartSubtotal(){var t=0;Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it)return;var c=CART[k];
  if(it.layer==='promo'){var q=promoQuote(it,c);t+=q.goods+q.decoRun;}   // product + decoration (setup shown separately)
  else t+=unitPrice(k,c.decos,c.qty)*c.qty;});return t;}
function setupBreakdown(){var r=CFG.rates||{},s=r.setup||{},seen={},out=[];
  Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it)return;(CART[k].decos||[]).forEach(function(d){if(!d.on)return;
    var key=setupKey(d);if(seen[key])return;seen[key]=1;
    var L=logoOf(d.lg),p=placeOf(it,d.pl),plab=p?p.label:d.pl,lname=(L&&L.label)||'Logo',amt,lab;
    if(d.method==='screen'){var c=d.colours||1;amt=(s.screen||0)*c;lab=lname+' · '+plab+' · screen ('+c+'-colour)';}
    else if(d.method==='heat_transfer'){amt=s.heat_transfer||0;lab=lname+' · '+plab+' · heat-transfer artwork';}
    else{amt=s.embroidery||0;lab=lname+' · '+plab+' · embroidery digitizing';}
    out.push({label:lab,amount:Math.round(amt*100)/100});});});
  Object.keys(CART).forEach(function(k){var it=BYKEY[k];if(!it||it.layer!=='promo')return;var q=promoQuote(it,CART[k]);
    if(q.setup>0)out.push({label:it.name+' · '+q.method.n+(q.locs>1?' · '+q.locs+' locations':'')+' setup',amount:q.setup});});
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
  var items=keys.map(function(k){var it=BYKEY[k];if(!it)return '';var c=CART[k];
    if(it.layer==='promo'){var pq=promoQuote(it,c);var pcol=colInList(it.cols,c.colour)||it.cols[0]||{};
      var pline=pq.goods+pq.decoRun;var uP=(pq.unit==='dozen'?'dozen':'pc');
      var psub2=pq.decoquote?(esc(c.colour||'')+' · logo added at proof'):(esc(c.colour||'')+' · '+esc(pq.method.n)+(pq.locs>1?' · 2 spots':'')+' · +'+money(pq.setup)+' setup');
      return '<div class="ci" data-key="'+k+'"><div class="t" style="background-image:url('+gurl(pcol.front)+')"></div>'+
        '<div class="d"><h4>'+esc(it.name)+'</h4><div class="sub">'+psub2+'</div>'+
        '<div class="row"><button class="editln" data-edit="'+k+'">'+pq.qty+' '+uP+' · '+money(pq.perPiece)+'/'+uP+' ✎</button><div class="lp">'+money(pline)+'</div></div></div>'+
        '<button class="rm" data-rm="'+k+'" aria-label="Remove">✕</button></div>';}
    var col=colInList(curColsOf(it,c.fit),c.colour);
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
      '<div class="csetup">Prices include your logo, decorated. Setup is a one-time charge per logo &amp; location, reused across the kit. Exact itemised quote confirmed free before anything runs.</div>'+
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
      '<div class="ckpm">\u2605 <b>Price-match guarantee</b> — found a lower written quote for the same job? Send it with your kit and we\u2019ll match it.</div>'+
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
      '<h1>'+esc(poss((cfg&&cfg.client)||'Your'))+" team store</h1>"+
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
  // SUPPRESS BLIND AUTO-SPLIT LOGO VARIANTS. The builder derives 'icon' and 'word' options by cutting
  // the master at its widest horizontal/vertical gutter. That is a guess about brand structure, and it
  // fails badly: on Facca Inc the cut put the company name in the piece labelled "Icon" and offered a
  // "Wordmark" that is ONLY the tagline arc — a selectable mark with no company name on it. Across the
  // fleet the same split produced 30.7:1 and 17.8:1 "wordmarks" (tagline strips and underlines).
  // A customer must never be able to pick a meaningless fragment of their own brand, so we show only
  // the verified full lockup. Set "allow_split_logos": true on a kit to opt back in, or supply real
  // icon/wordmark files (any id other than 'icon'/'word' is always kept).
  if(cfg.logos&&cfg.logos.length>1&&!cfg.allow_split_logos){
    var keep=cfg.logos.filter(function(l){return l.id!=='icon'&&l.id!=='word';});
    cfg.logos=keep.length?keep:[cfg.logos[0]];
  }
  if(cfg.accent)document.documentElement.style.setProperty('--a',safeAccent(cfg.accent));
  document.title=(cfg.client||'Branded Apparel')+' — Team Store · Just Deals Promotions';
  renderSkeleton(cfg);
  // no-cache: always revalidate the shared catalogue so customers get the current products/photos
  // (returns 304 when unchanged). Image URLs are versioned via CATVER below.
  fetch((cfg.catalog_base||CATALOG_BASE)+'/catalog.json?v='+(cfg.ver||'1'),{cache:'no-cache'}).then(function(r){return r.json();}).then(function(cat){
    CFG.catalog_base=cfg.catalog_base||CATALOG_BASE;CAT=cat;CATVER=cat.version||cat.v||'';(cat.items||[]).forEach(function(it){BYKEY[it.key]=it;});
    // Learn each logo's ink BEFORE first paint so garments render a thread colour that actually reads.
    Promise.all((cfg.logos||[]).map(probeInk)).then(function(){
      assignColourways();
      loadCart();buildStore();refreshCartUI();
      // Deep link: /kits/<slug>/?item=<key> (or #item=<key>) opens straight to that product. This MUST
      // run AFTER buildStore(). It used to fire synchronously, before the async ink probe resolved, so
      // the sheet opened against an unbuilt store and was wiped by the first render -- every ?item=
      // link, including every gift-set contents link, silently did nothing.
      try{var m=(location.search.match(/[?&]item=([^&#]+)/)||location.hash.match(/item=([^&#]+)/));
        if(m){var k=decodeURIComponent(m[1]);if(BYKEY[k])openSheet(k);}}catch(e){}
    });
  }).catch(function(e){document.getElementById('app').innerHTML='<p style="padding:60px;text-align:center">Could not load the catalogue. Please refresh.</p>';});
}
var cel=document.getElementById('jdpcfg');
if(cel){try{go(JSON.parse(cel.textContent));}catch(e){}}
else{fetch('client.json?v='+Date.now()).then(function(r){return r.json();}).then(go).catch(function(){document.getElementById('app').innerHTML='<p style="padding:60px;text-align:center">Client config not found.</p>';});}
})();
