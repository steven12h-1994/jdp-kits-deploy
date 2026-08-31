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
// colInList falls back to cols[0] so callers always have something to render. When the question is
// "does this set actually contain that colour", that fallback is a wrong answer -- hence this.
function hasCol(cols,name){for(var i=0;i<(cols||[]).length;i++)if(cols[i].name===name)return true;return false;}
function curColsOf(item,fit){return (fit==='womens'&&item.wcols&&item.wcols.length)?item.wcols:item.cols;}
function placeOf(item,pid){for(var i=0;i<item.places.length;i++)if(item.places[i].id===pid)return item.places[i];return null;}
/* ---------- one cart line PER FIT ------------------------------------------------------------
   CART was keyed by product alone, so adding the ladies' cut of a polo OVERWROTE the mens line --
   you could have one or the other, never both. For company apparel that is the normal order: the
   same polo in both cuts. So a cart key is now product + fit, and the ladies' line carries a "#w"
   suffix. "#" cannot appear in a product key, and the share link still transmits the BASE key plus
   its own fit field, so link format and old saved carts both keep working.
   vmOf / unitPrice / recCartDecos are made tolerant of either kind of key, which keeps every
   existing call site correct instead of relying on catching all of them. */
function ckey(k,fit){return (fit==='womens')?(k+'#w'):k;}
function bkey(ck){return String(ck).replace(/#w$/,'');}
function cartQtyOf(k){
  var a=CART[k],b=CART[k+'#w'],t=0;
  if(a)t+=(a.qty||0); if(b)t+=(b.qty||0);
  return t;}
function cartHasAny(k){return !!(CART[k]||CART[k+'#w']);}
function cartAnyKey(k){return CART[k]?k:(CART[k+'#w']?(k+'#w'):k);}
function vmOf(key){key=bkey(key);return (CFG.items||{})[key]||{colour:(BYKEY[key].cols[0]||{}).name,decos:[]};}
/* Volume tiers are set by how many of a GARMENT you order, not by how many of one cut. 30 men's
   plus 30 women's Avalante fleece is a 60-piece run on one blank with one decoration setup, so it
   prices at 48+. Each fit was being tiered on its own 30 and quoted at 12+ -- overcharging the
   customer and understating our own competitiveness on exactly the orders that matter most.
   q is used ONLY for tier selection inside unitPrice (decoration is per piece), so feeding it the
   combined quantity is both safe and correct. */
function tierQty(ck){
  var base=bkey(ck),t=0;
  var a=CART[base],b=CART[base+'#w'];
  if(a)t+=(a.qty||0);
  if(b)t+=(b.qty||0);
  return t||(((CART[ck]||{}).qty)||0);
}
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
function unitPrice(key,decos,q){key=bkey(key);var r=CFG.rates;
  var _it=BYKEY[key]; if(_it&&_it.layer==='promo')return _it.price_cad||0;   // promo: flat Debco CAD price (customer price)
  if(!r||r.blank==null){return unitAt(BYKEY[key],q);}
  var item=BYKEY[key],c=blankOf(key),dec=0;
  var vpl={};(item.places||[]).forEach(function(p){if(p.logo)vpl[p.id]=1;});   // only decorate on real logo places (pants have none -> no deco charge)
  var _ly=stdLayers(key);   // 3-in-1 systems carry the mark on shell AND liner: two runs, two charges
  activeDecos(decos).forEach(function(d){if(!vpl[d.pl])return;dec+=decoCost(d,item)*_ly;});
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
  // QUOTE-MODE (new suppliers): tiered blank product price; logo and decoration confirmed on your quote.
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
/* ONE standardized setup per product, read from the catalogue -- not from each kit's own config.
   Per-kit decos are why the same product was quoted differently store to store: a sample of 14 live
   kits had 16 hi-vis items carrying a second centre-back screen in most stores, 5 in one and none in
   another. The catalogue's `std` block is now the single source of truth, so the mockup, the price
   and the printed spec cannot disagree with each other or between stores. */
function stdOf(key){var it=BYKEY[key]||{};return it.std||null;}
/* A 3-in-1 is two garments -- an outer shell and a zip-out inner jacket -- and the "n" counts ways to
   wear it, not pieces. Industry practice is to decorate BOTH layers at the left chest, because the
   liner is worn on its own and an unbranded liner defeats the point of a uniform program. So the
   standard covers two marks, and the price carries two. */
function sysOf(key){var it=BYKEY[key]||{};return it.sys||null;}
function stdLayers(key){var st=stdOf(key);return (st&&st.layers)?st.layers:1;}
function sysHtml(item){
  var sy=item&&item.sys;if(!sy)return '';
  /* Per-product now, not one blanket description. A 3-in-1 and a 6-in-1 are both TWO garments -- the
     number counts wearing configurations -- but showing three ways on a product sold as six-in-one
     undersells it, and inventing six ways nobody published would be worse. So: list the maker's own
     configurations where they publish them, and where they only claim a number without enumerating
     it (Ground Force's TJ6), state the three that are true of every system and say the rest come
     from the liner's zip-off sleeves rather than making them up. */
  var combos=sy.combos||[];
  var rows='';
  if(combos.length){
    rows=combos.map(function(t,i){
      return '<div class="sysrow"><span class="sysn">'+(i+1)+'</span><span>'+esc(t)+'</span></div>';}).join('');
  }else{
    rows=['Outer shell alone','Inner jacket alone','Shell and liner zipped together']
      .map(function(t,i){
        return '<div class="sysrow"><span class="sysn">'+(i+1)+'</span><span>'+esc(t)+'</span></div>';}).join('')+
      '<div class="sysrow"><span class="sysn">+</span><span>Further combinations from the liner\u2019s '+
        'zip-off sleeves \u2014 '+sy.ways+' in total, per the maker</span></div>';
  }
  var liner=sy.liner?('<div class="sysliner"><b>Liner:</b> '+esc(sy.liner)+'</div>'):'';
  var rev=sy.revside
    ? ('<div class="sysrev">The liner is reversible. As standard we embroider the <b>'+esc(sy.revside)+
       '</b> \u2014 the face worn on site. Tell us in the notes to switch it.</div>')
    : '';
  return '<div class="sysblk"><div class="syshd">'+sy.ways+' ways to wear \u00b7 '+sy.garments+' garments</div>'+
    rows+liner+
    '<div class="sysnote"><b>Your logo goes on both garments</b> \u2014 shell and liner \u2014 so the crew '+
      'is branded whichever way they wear it. That is two embroidery runs, and the price already includes both.</div>'+
    rev+'</div>';
}

function recDecos(key){
  var st=stdOf(key);
  if(!st||!st.method||!st.pl)return [];
  return [{pl:st.pl,on:true,lg:(CFG.logos&&CFG.logos[0]&&CFG.logos[0].id)||null,
           ink:'auto',method:st.method,colours:1}];
}

/* ---------- persistence ---------- */
/* ---------- LISTS ---------------------------------------------------------------------------
   Consolidation. The store had grown four overlapping ideas for "things the customer picked": the
   kit, our curated shortlist, a shared link that merged into the kit, and per-store picks. Steven
   asked for the Amazon Business pattern instead, which is one idea: you save a product to a List,
   Lists persist, you can have several, and you add to whichever you like.

   Implemented as a LAYER OVER the existing cart rather than a rewrite. CART stays the live object
   that every pricing, quote, share and render path already reads -- it is now simply an alias for
   the active List's items. That keeps ~25 working call sites correct instead of re-touching them.
   An existing single cart is migrated into the first List on load, so nobody loses a kit. */
var LISTS=null,ALID='';
function LKEY(){return LSKEY+'_lists';}
function persistLists(){
  try{localStorage.setItem(LKEY(),JSON.stringify({lists:LISTS,active:ALID}));}catch(e){}}
function newListId(){return 'l'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);}
function loadLists(){
  var raw=null;try{raw=JSON.parse(localStorage.getItem(LKEY())||'null');}catch(e){}
  if(raw&&raw.lists&&Object.keys(raw.lists).length){
    LISTS=raw.lists;ALID=raw.active||Object.keys(raw.lists)[0];
  }else{
    // First run under Lists: adopt whatever single cart already exists so no work is lost.
    var old={};try{old=JSON.parse(localStorage.getItem(LSKEY)||'{}')||{};}catch(e){old={};}
    var id=newListId();LISTS={};
    LISTS[id]={name:'My board',items:old,updated:Date.now()};
    ALID=id;
    /* Our recommendations, as a List -- not a section, not a hero button. Seeded once on first
       visit and left as a SEPARATE list so a first-timer's own list is never silently pre-filled
       with items they did not choose (which would quietly end up on a quote request). */
    // Guarded: this reads BYKEY/CFG, and a starter list is a nicety. If anything here throws, the
    // customer must still get their own list -- never a store that fails to load a saved list.
    try{
      var ess=(typeof essKeysAll==='function')?essKeysAll():[];
      if(ess.length){
        var sid=newListId(),sitems={};
        ess.forEach(function(k){
          if(!BYKEY[k])return;
          sitems[k]={qty:moq(),colour:vmOf(k).colour,decos:recCartDecos(k)};});
        if(Object.keys(sitems).length){
          LISTS[sid]={name:'JDP starter list',items:sitems,updated:Date.now()-1,starter:true};}
      }
    }catch(e){}
    persistLists();
  }
  if(!LISTS[ALID])ALID=Object.keys(LISTS)[0];
}
/* Walking the live flow turned up the real hazard: a save goes to whatever list happened to be
   active, with nothing on screen naming it. Switch to the JDP starter list to look at it, close the
   panel, heart one product -- and that product silently joins OUR recommendation set, which then
   goes out on a quote request titled "JDP starter list". Measured it live: 9 items became 10.
   So the starter list is a TEMPLATE. It is never a save target; a save redirects into the buyer's
   own list and the toast says where it went. No mode to learn, nothing to undo. */
function personalListId(){
  if(!LISTS)loadLists();
  var ids=listIds().filter(function(id){return !LISTS[id].starter;});
  if(ids.length)return ids[0];                       // most recently touched personal list
  var id=newListId();
  LISTS[id]={name:'My board',items:{},updated:Date.now()};
  persistLists();
  return id;
}
function isTemplate(id){return !!((LISTS||{})[id]||{}).starter;}
/* Returns true when it had to move the buyer off the template. */
function ensureWritable(){
  if(!LISTS)loadLists();
  if(!isTemplate(ALID))return false;
  var id=personalListId();
  if(id===ALID)return false;
  ALID=id;CART=LISTS[id].items;persistLists();
  return true;
}
function copyStarterToMine(){
  var s=starterId();if(!s)return;
  var src=LISTS[s].items||{},tid=personalListId(),n=0;
  Object.keys(src).forEach(function(ck){
    if(LISTS[tid].items[ck])return;
    try{LISTS[tid].items[ck]=JSON.parse(JSON.stringify(src[ck]));n++;}catch(e){}});
  ALID=tid;CART=LISTS[tid].items;LISTS[tid].updated=Date.now();persistLists();
  renderCart();refreshCartUI();
  toast(n?('Copied '+n+' piece'+(n===1?'':'s')+' into '+activeName())
         :('Already in '+activeName()));
}
function starterId(){for(var id in (LISTS||{})){if(LISTS[id].starter)return id;}return '';}
function listIds(){
  return Object.keys(LISTS||{}).sort(function(a,b){
    return (LISTS[b].updated||0)-(LISTS[a].updated||0);});}
function listName(id){return ((LISTS||{})[id]||{}).name||'My board';}
function listLen(id){return Object.keys((((LISTS||{})[id])||{}).items||{}).length;}
function activeName(){return listName(ALID);}
function newList(name){
  var id=newListId();
  LISTS[id]={name:(name||'').trim()||('Board '+(listIds().length+1)),items:{},updated:Date.now()};
  ALID=id;CART=LISTS[id].items;persistLists();return id;}
function switchList(id){
  if(!LISTS[id])return;
  ALID=id;CART=LISTS[id].items;persistLists();
  renderCart();refreshCartUI();}
function renameList(id,name){
  name=(name||'').trim();if(!LISTS[id]||!name)return;
  LISTS[id].name=name.slice(0,40);persistLists();}
function deleteList(id){
  if(!LISTS[id])return;
  if(listIds().length<2){LISTS[id].items={};CART=LISTS[id].items;persistLists();return;}
  delete LISTS[id];
  if(ALID===id){ALID=listIds()[0];CART=LISTS[ALID].items;}
  persistLists();}
/* The list picker. A native <select> on purpose: it is the most familiar, most reliable control on
   a phone, needs no custom popover, and cannot get stuck open. Counts are shown inline so switching
   is an informed choice rather than a guess. */
function listBarHtml(){
  if(!LISTS)loadLists();
  var ids=listIds();
  var opts=ids.map(function(id){
    return '<option value="'+esc(id)+'"'+(id===ALID?' selected':'')+'>'+
      esc(listName(id))+' \u00b7 '+listLen(id)+(LISTS[id].starter?' \u00b7 template':'')+
      '</option>';}).join('');
  return '<div class="lbar">'+
    '<select class="lsel" id="lsel" aria-label="Choose a list">'+opts+'</select>'+
    '<button type="button" class="lbtn" id="lNew">+ New</button>'+
    '<button type="button" class="lbtn" id="lRen">Rename</button>'+
    (ids.length>1?'<button type="button" class="lbtn rm" id="lDel">Delete</button>':'')+
    '</div>';
}
function heartSvg(filled){
  return '<svg class="hrt" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="'+
    (filled?'currentColor':'none')+'" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" '+
    'stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8'+
    'L12 21.1l8.8-8.7a5.5 5.5 0 0 0 0-7.8z"/></svg>';
}
function loadCart(){loadLists();CART=(LISTS[ALID]&&LISTS[ALID].items)||{};}
function saveCart(){
  if(!LISTS)loadLists();
  // CART is normally an alias for the active list's items, but some paths reassign it wholesale --
  // re-link on every save so a reassignment can never silently orphan the list.
  if(LISTS[ALID]){LISTS[ALID].items=CART;LISTS[ALID].updated=Date.now();}
  persistLists();
  pushBoardSoon();}

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
  // Two honest numbers instead of one misleading one. "from $23" was the 144+ tier: real, but not
  // available to anyone ordering the 12-piece minimum, who was then quoted $27 on the very next
  // screen. Across the catalogue that gap ran to a median 15% -- and $43/pc on a jacket. So the
  // headline is now the price at the minimum, with the volume break kept as the upside it is.
  var startP=unitPrice(key,vm.decos,moq());
  var bestP=unitPrice(key,vm.decos,topcol);
  var rec=(key===CFG.feature||item.rec)?'<span class="mrec">★ Top pick</span>':'';
  // Class badge: a specific published class reads bold; styles whose maker publishes only the generic
  // "meets CSA" claim (no class number) render muted — we never invent a class.
  var csa=item.csa?'<span class="mcsa'+(/^Meets/.test(item.csa)?' gen':'')+'" title="'+(/^Meets/.test(item.csa)?'Certified high-visibility apparel — ask us to confirm the exact class for your job':'Certified high-visibility rating')+'">🛡 '+esc(item.csa)+'</span>':'';
  // A typographic spec line, not a badge: fabric is information, not a safety rating, and the
  // emoji pill it shared with the CSA rating read as clip-art on a B2B storefront.
  var _fl=fabCardLine(item);
  var fab=_fl?'<div class="mfab" title="Fabric content as published by the maker">'+esc(_fl)+'</div>':'';
  var q=cartQtyOf(key);
  var inkit=q?' inkit':'';
  var addlbl=q?(heartSvg(1)+'<b>'+q+'</b>'):heartSvg(0);
  return '<article class="mcard'+inkit+'" data-key="'+key+'" data-name="'+esc(searchText(item).replace(/"/g,''))+'" tabindex="0" role="button" aria-label="'+esc(item.name)+'">'+
    '<div class="mstage">'+curToggleHtml(key)+rec+(item.video?'<button class="mvid" data-vid="'+esc(item.video)+'" data-vname="'+esc(item.name)+'" aria-label="Play product video">▶ Video</button>':'')+'<img class="g" src="'+o.g+'" alt="'+esc(item.name)+'" loading="lazy" decoding="async">'+o.lg+
      '<button class="madd'+(q?' has':'')+'" data-key="'+key+'" aria-label="'+(q?'Edit ':'Add ')+esc(item.name)+'">'+addlbl+'</button></div>'+
    '<div class="mb"><h3>'+esc(item.name)+'</h3>'+
      '<div class="mmeta">'+esc(item.sku)+(item.layer==='promo'?'':(item.unisex?' · Unisex':''))+'</div>'+
      (hasLadies(item)?'<div class="mfit">Men’s &amp; Ladies’ cuts</div>':(item.unisex?'<div class="mfit alt">Unisex — one cut</div>':''))+
      csa+fab+
      colourDots(item,key)+
      (item.layer==='promo'
        ? (kitContentsHtml(item)+
           '<div class="mprice"><b>'+money(item.price_cad)+'</b> <small>/'+(item.unit==='dozen'?'dozen':'pc')+' · min '+item.moq+'</small></div>')
        : '<div class="mprice"><b>'+money(startP)+'</b> <small>/pc'+(hasDecoPlace(item)?' · decorated':'')+'</small></div>'+
           '<div class="mvol">at '+moq()+' pcs'+(bestP<startP?(' · <b>'+money(bestP)+'</b>/pc at '+topcol+'+'):'')+'</div>')+
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
  {id:'outerwear',name:'Jackets'},
  {id:'vests',name:'Vests'},
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
  outerwear:['Softshell Jackets','Shackets & Overshirts','Insulated & Thermal','Puffer & Quilted','3-in-1 Systems','Shells & Rainwear','Jackets'],
  // Vests are their own category, not a drawer inside Jackets. A vest is a different purchase --
  // worn indoors, over a hoodie, year round -- and burying eleven of them under Jackets meant a
  // buyer shopping for vests had to know to look there first.
  vests:['Quilted & Puffer','Fleece & Softshell','Canvas & Lined','Hi-Vis Vests'],
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
function vestSub(n){
  // Hi-vis first: a tear-away traffic vest is PPE before it is a garment style, and testing
  // "quilted" ahead of it filed the 5-Point Tear-Away under Quilted & Puffer.
  if(/hi-?vis|traffic|surveyor|safety|tearaway|tear-away/.test(n))return 'Hi-Vis Vests';
  if(/quilt|puff|down|thermoball|insulat/.test(n))return 'Quilted & Puffer';
  if(/fleece|softshell|soft shell|sherpa/.test(n))return 'Fleece & Softshell';
  if(/canvas|duck|lined|flannel/.test(n))return 'Canvas & Lined';
  return 'Quilted & Puffer';
}
function crossAlso(it,c){
  var out=[],n=((it.name||'')+' '+(it.key||'')).toLowerCase();
  if(c.mega!=='ruggedwear'&&RUGGED_CROSS[it.key])out.push({mega:'ruggedwear',sub:RUGGED_CROSS[it.key]});
  if(c.mega!=='headwear'&&isHeadwear(n)&&!/\bfr\b|flame[- ]resistant/.test(n))out.push({mega:'headwear',sub:headwearSub(n)});
  if(c.mega!=='bottoms'&&c.sub==='Pants & Bibs')out.push({mega:'bottoms',sub:'Work Pants & Bibs'});
  // A vest keeps its brand home (Carhartt, Rugged Wear) or its PPE home (Hi-Vis) AND appears in the
  // Vests category, so neither shopper loses it: one browses by brand, the other by garment.
  if(c.mega!=='vests'&&/vest/.test(n))out.push({mega:'vests',sub:vestSub(n)});
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
  // A kit that references a product the catalogue no longer carries must degrade to "not shown",
  // never throw: this runs inside the filter that builds every grid, so one stale key would take
  // the whole storefront down rather than hide one card.
  if(!it)return {mega:'accessories',sub:'Other'};
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
  if(n.indexOf('vest')>=0)return {mega:'vests',sub:vestSub(n)};
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
var VIEW={cat:null,sub:'all',q:'',world:'all',fit:'all',col:null,band:null,sort:null};
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
var SHORTCAT={tops:'Polos & Shirts',layers:'Fleece & Sweaters',outerwear:'Jackets',vests:'Vests',ruggedwear:'Rugged Wear',hivis:'Hi-Vis & Safety',carhartt:'Carhartt',headwear:'Headwear',bottoms:'Pants & Joggers',fr:'Flame-Resistant',accessories:'Accessories'};
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
// The price a buyer can ACTUALLY get, which is the one at the order minimum -- not the deepest
// volume tier. This is what the card headlines, so the budget chips and the price sort must band and
// order on the same number; filtering "Under $50" and getting a $60 polo is the same broken promise
// as the old "from" headline, just wearing a different hat.
function unitOf(it){return (it.layer==='promo')?(it.price_cad||0):(it.prices?it.prices[0]:0);}
// The exact number the card headlines: price at the order minimum, decoration included, for THIS
// kit's configured decoration. unitOf reads the raw list price and so drifts from the printed figure
// by the cost of the embroidery -- fine for a rough band, wrong when the whole point of this change
// is that every number on screen agrees with every other one.
function shelfPrice(k){
  var it=BYKEY[k]||{};
  if(it.layer==='promo')return it.price_cad||0;
  try{return unitPrice(k,vmOf(k).decos,moq());}catch(e){return unitOf(it);}
}
// SORT is not a filter -- it never removes a product, it only re-orders. With 18 polos in one
// section, "cheapest first" is the question a buyer actually asks, and until now the only order on
// offer was ours. Price basis is unitOf, the same figure the card prints and the budget chips band,
// so the ordering always agrees with the numbers on screen.
var SORTS=[['','Recommended'],['pl','Price: low to high'],['ph','Price: high to low']];
function sortList(list){
  if(!VIEW.sort)return list;
  var dir=(VIEW.sort==='ph')?-1:1;
  return list.slice().sort(function(a,b){return (shelfPrice(a)-shelfPrice(b))*dir;});
}
function bandOK(list){
  if(!VIEW.band)return list;
  var b=BANDS.filter(function(x){return x[0]===VIEW.band;})[0];if(!b)return list;
  return list.filter(function(k){var u=shelfPrice(k);return u>=b[2]&&u<b[3];});}
function renderSortbar(){
  var el=document.getElementById('sortbar');if(!el)return;
  var keys=(VIEW.sub==='all')?[].concat.apply([],subNames(VIEW.cat).map(function(s){return BUCKETS[VIEW.cat][s];})):((BUCKETS[VIEW.cat]||{})[VIEW.sub]||[]);
  if(keys.length<6){el.innerHTML='';el.style.display='none';VIEW.sort=null;return;}
  el.style.display='';
  el.innerHTML='<span class="fitlbl">Sort</span>'+SORTS.map(function(o){
    return '<button type="button" class="cfchip'+(((VIEW.sort||'')===o[0])?' on':'')+'" data-sort="'+o[0]+'">'+esc(o[1])+'</button>';}).join('');
  el.querySelectorAll('.cfchip').forEach(function(x){x.addEventListener('click',function(){
    VIEW.sort=x.dataset.sort||null;renderSortbar();renderGrid();renderFilterUI();});});
}
function renderBandbar(){
  var el=document.getElementById('bandbar');if(!el)return;
  var keys=(VIEW.sub==='all')?[].concat.apply([],subNames(VIEW.cat).map(function(s){return BUCKETS[VIEW.cat][s];})):((BUCKETS[VIEW.cat]||{})[VIEW.sub]||[]);
  var cnt={};BANDS.forEach(function(b){cnt[b[0]]=keys.filter(function(k){var u=shelfPrice(k);return u>=b[2]&&u<b[3];}).length;});
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
    renderColbar();renderGrid();renderFilterUI();});});
}
/* ---- Filters live behind one control ---------------------------------------------------------
   Fit, Colour and Budget used to sit permanently stacked under the category tabs. Measured on the
   live store that cost 200px of a 1080px desktop viewport and about 325px of an 844px phone --
   roughly 39% of a phone screen spent on filters the buyer had not asked for, leaving barely one
   row of product visible. The colour row alone wrapped to three lines on a phone.

   Navigation stays where it was (category tabs, then subcategory chips) because that is how people
   browse. The three FACETS collapse into a single "Filters" button carrying a count, with whatever
   is currently applied shown next to it as dismissable pills -- so the state is never hidden, only
   the controls are. The panel is a dropdown on desktop and a bottom sheet on the phone, which is
   where a thumb can actually reach it. */
var FOPEN=false,SHEETKEY='';
function activeFilters(){
  var a=[];
  if(VIEW.fit&&VIEW.fit!=='all')a.push({k:'fit',label:VIEW.fit==='womens'?'Ladies’':'Men’s'});
  if(VIEW.col)a.push({k:'col',label:VIEW.col.charAt(0).toUpperCase()+VIEW.col.slice(1),sw:famSwatch(VIEW.col)});
  if(VIEW.band){var b=BANDS.filter(function(x){return x[0]===VIEW.band;})[0];if(b)a.push({k:'band',label:b[1]});}
  if(VIEW.sort){var o=SORTS.filter(function(x){return x[0]===VIEW.sort;})[0];if(o)a.push({k:'sort',label:o[1]});}
  return a;
}
function clearFilter(k){
  if(k==='fit')VIEW.fit='all'; else if(k==='col')VIEW.col=null; else if(k==='band')VIEW.band=null;
  else if(k==='sort')VIEW.sort=null;
  renderFitbar();renderColbar();renderBandbar();renderSortbar();renderGrid();renderFilterUI();
}
function positionPanel(){
  var p=document.getElementById('fpanel'),b=document.getElementById('fbtn');
  if(!p||!b)return;
  if(window.innerWidth<=640){p.style.top='';p.style.right='';p.style.left='';return;}
  var r=b.getBoundingClientRect();
  p.style.top=Math.round(r.bottom+8)+'px';
  p.style.right=Math.max(12,Math.round(window.innerWidth-r.right))+'px';
  p.style.left='auto';
}
function setFilters(open){
  FOPEN=!!open;
  var p=document.getElementById('fpanel'),b=document.getElementById('fbtn'),sc=document.getElementById('fscrim');
  if(p){p.classList.toggle('on',FOPEN);if(FOPEN)positionPanel();}
  if(sc)sc.classList.toggle('on',FOPEN);
  if(b)b.setAttribute('aria-expanded',FOPEN?'true':'false');
  document.documentElement.classList.toggle('fopen',FOPEN);
}
function renderFilterUI(){
  var btn=document.getElementById('fbtn');if(!btn)return;
  // Hide the whole control where there is nothing to filter, rather than offering an empty panel.
  var any=['fitbar','colbar','bandbar','sortbar'].some(function(id){
    var el=document.getElementById(id);return el&&el.style.display!=='none'&&el.innerHTML;});
  btn.style.display=any?'':'none';
  if(!any&&FOPEN)setFilters(false);
  var act=activeFilters(),c=document.getElementById('fcount');
  if(c){c.textContent=act.length?String(act.length):'';c.style.display=act.length?'':'none';}
  btn.classList.toggle('on',act.length>0);
  var pil=document.getElementById('fpills');
  if(pil){
    pil.innerHTML=act.map(function(a){
      return '<button type="button" class="fpill" data-clear="'+a.k+'">'+
        (a.sw?'<span style="background:'+a.sw+'"></span>':'')+esc(a.label)+'<em>&times;</em></button>';}).join('')+
      (act.length>1?'<button type="button" class="fpill alt" data-clear="all">Clear all</button>':'');
    pil.style.display=act.length?'':'none';
    pil.querySelectorAll('.fpill').forEach(function(x){x.addEventListener('click',function(){
      var k=x.dataset.clear;
      if(k==='all'){VIEW.fit='all';VIEW.col=null;VIEW.band=null;
        renderFitbar();renderColbar();renderBandbar();renderSortbar();renderGrid();renderFilterUI();}
      else clearFilter(k);});});
  }
  var done=document.getElementById('fdone');
  if(done)done.textContent=(SHOWN!=null?('Show '+SHOWN+' style'+(SHOWN===1?'':'s')):'Show results');
  var clr=document.getElementById('fclear');
  if(clr)clr.disabled=!act.length;
}
function wireFilters(){
  var btn=document.getElementById('fbtn');if(!btn||btn._w)return;btn._w=1;
  // Re-home the sheet and its backdrop on BODY. Anywhere inside .navwrap they are trapped: that
  // element carries backdrop-filter, which makes it the containing block for position:fixed, so a
  // "full screen" scrim covered only the header strip and the bottom sheet anchored to it.
  ['fpanel','fscrim'].forEach(function(id){
    var el=document.getElementById(id);
    if(el&&el.parentNode!==document.body)document.body.appendChild(el);});
  btn.addEventListener('click',function(e){e.stopPropagation();setFilters(!FOPEN);});
  ['fpx','fdone'].forEach(function(id){var el=document.getElementById(id);
    if(el)el.addEventListener('click',function(){setFilters(false);});});
  var sc=document.getElementById('fscrim');
  if(sc)sc.addEventListener('click',function(){setFilters(false);});
  var clr=document.getElementById('fclear');
  if(clr)clr.addEventListener('click',function(){VIEW.fit='all';VIEW.col=null;VIEW.band=null;
    renderFitbar();renderColbar();renderBandbar();renderSortbar();renderGrid();renderFilterUI();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&FOPEN)setFilters(false);});
  // The button is sticky, so keep the dropdown attached to it as the page moves.
  window.addEventListener('resize',function(){if(FOPEN)positionPanel();});
  window.addEventListener('scroll',function(){if(FOPEN)positionPanel();},{passive:true});
  document.addEventListener('click',function(e){
    if(!FOPEN)return;
    var p=document.getElementById('fpanel');
    if(p&&!p.contains(e.target)&&e.target!==btn)setFilters(false);});
}
var SHOWN=null;
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
  renderFitbar();renderColbar();renderBandbar();renderSortbar();renderFilterUI();
  el.querySelectorAll('.schip').forEach(function(b){b.addEventListener('click',function(){setSub(b.dataset.sub);
    var tr=b.closest('.subchips');if(tr)tr.scrollTo({left:b.offsetLeft-tr.clientWidth/2+b.clientWidth/2,behavior:'smooth'});});});}
function wireCards(rootId){
  var g=document.getElementById(rootId||'grid');if(!g)return;
  g.querySelectorAll('.mcard').forEach(function(card){
    // The curator toggle sits INSIDE the card, and this handler is bound closer to the target than
    // the document-level delegate -- so it fires first and stopPropagation() there is too late.
    // Result: one tap both shortlisted the item and opened its sheet. Ignore those clicks here.
    card.addEventListener('click',function(e){
      if(e.target&&e.target.closest&&e.target.closest('[data-curk]'))return;
      openSheet(card.dataset.key);});
    card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openSheet(card.dataset.key);}});});
  g.querySelectorAll('.madd').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();var k=b.dataset.key;if(cartHasAny(k)){openSheet(cartAnyKey(k));}else{openSavePicker(k);}});});
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
  var fitOK=function(list){var L=(VIEW.fit==='womens')?list.filter(function(k){var i=BYKEY[k]||{};return hasLadies(i)||i.unisex;}):list;return sortList(bandOK(colourOK(L)));};
  var subs=subNames(VIEW.cat),csa=VIEW.cat==='hivis'?' <span class="csa">CSA Z96 · ANSI 107</span>':'';
  var _shown=(VIEW.sub==='all'?fitOK(ALLKEYS.filter(function(k){return (BUCKETS[VIEW.cat]||{})&&subs.some(function(s){return BUCKETS[VIEW.cat][s].indexOf(k)>=0;});})).length:fitOK(BUCKETS[VIEW.cat][VIEW.sub]||[]).length);
  SHOWN=_shown;
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
    {i:'\u2713',b:'See it before you commit',d:'Your logo shown on the actual garment'},
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
    {t:'See it before you commit',d:'Every item shows your logo on the actual garment, at the size and placement we decorate. No cost, no obligation.'},
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
    '<div class="whycta"><button class="reccta" id="whyCta">Build your board — get an exact quote <span class="ar">\u2192</span></button>'+
      '<span class="whyctan">No payment now · no obligation</span></div>'+
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
    '<div class="pinc"><span class="pinci">✓</span> Add the set, then tweak sizes &amp; colours in your board and send for your exact quote — no obligation.</div></div>'+
    '<div class="shfoot"><button class="shaddbtn" id="kitAdd"><span>Add all '+items.length+' pieces to my list</span></button>'+
    '<div class="shtrust">Adjust any piece after adding · no payment now</div></div>';
  var sh=document.getElementById('sheet');
  document.getElementById('shx').addEventListener('click',closeAll);
  sh.querySelectorAll('.krpic .g').forEach(function(im){if(im.complete)im.classList.add('ld');else im.addEventListener('load',function(){im.classList.add('ld');});});
  document.getElementById('kitAdd').addEventListener('click',function(){items.forEach(function(k){quickAdd(k);});closeAll();refreshCartUI();openBoard();});
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
  var recN=(essKeysAll().length||recKeysAll().length);
  var _pk=picksOf();
  var demo=!!CFG.demo,cta=CFG.cta||{};
  var heroCta = demo
    ? ('<button class="reccta" id="leadOpen1">'+esc(cta.label||'Get your store — free')+' →</button>'+(cta.phone?'<div class="herophone">or call <b>'+esc(cta.phone)+'</b></div>':''))
    : (
      /* The hero is the most valuable space on the page, so it should carry the offer that actually
         unblocks a company-wide order. Nobody signs off 200 shirts they have never touched -- the
         in-person samples answer that, and "add our top picks" does not.

         Two deliberate choices. First, the offer is explained, not just named: "we come to you" is
         an unfamiliar proposition and a bare button would be ignored, so the unit states what
         happens in one line. Second, top picks is demoted rather than deleted -- a visitor sent
         here to pick their gear still needs the fast path, and a shortlist built first makes the
         sample request far more useful to the rep who packs the bag. */
      /* One concept only. Curated recommendations used to get their own page section AND a hero
         button AND an "or start with the essentials" line -- three surfaces competing with the
         catalogue for the same job. They are now simply a starter List in the list picker, so the
         hero carries the one offer that actually unblocks a company-wide order. */
      (SHARED
        ? sharedStripHtml()
        : ('<div class="herooffer">'+
             '<span class="hoic" aria-hidden="true">\u270B</span>'+
             '<span class="hotx"><b>Feel it before you commit</b>'+
               '<i>We bring the actual garments to your workplace \u2014 fabric, fit and colours side by side. No obligation.</i></span>'+
             '<button type="button" class="reccta hobtn" data-samp="">See &amp; feel it first <span class="ar">\u2192</span></button>'+
           '</div>')));
  var html=''+
   railHtml()+
   tbarHtml()+
   '<section class="hero"><div class="w heroin">'+
     '<h1>'+esc(poss(CFG.client))+" team store</h1>"+
     '<p class="herosub">'+(demo?'This is a live sample. Every item shows exactly where your logo goes — swap in your brand and it becomes your team’s store. Live pricing, exact quote, no obligation.':'One premium store for the jobsite and the front office — CSA hi-vis and rugged workwear to sharp branded polos and client gifts, every piece ready with your logo.')+'</p>'+
   '</div></section>'+
   /* The value strip is gone. It stacked three more claims directly beneath a hero that already
      carries three trust chips AND the sample offer -- six competing assertions above the fold, which
      reads as sales noise to an enterprise buyer rather than reassurance. Two of the three were weak
      on their own merits: "competitive pricing, guaranteed" repeats the price-match line already in
      the cart, and "3,400+ impressions per shirt" is promo-industry trivia that has nothing to do
      with outfitting staff. Removing the band makes the in-person offer the unambiguous focal point
      and lifts the catalogue up the page. */
   catTilesHtml()+
   '<section class="offerstrip"><div class="w">'+heroCta+'</div></section>'+
   '<div class="navwrap" id="navwrap">'+
     '<div class="fscrim" id="fscrim"></div>'+
     '<div class="fpanel" id="fpanel" role="dialog" aria-label="Filter products">'+
       '<div class="fphd">Filter<button type="button" class="fpx" id="fpx" aria-label="Close">&times;</button></div>'+
       '<div class="fpbody">'+
         '<div class="fitbar" id="fitbar"></div><div class="fitbar colbar" id="colbar"></div>'+
         '<div class="fitbar colbar" id="bandbar"></div>'+
         '<div class="fitbar colbar" id="sortbar"></div></div>'+
       '<div class="fpfoot"><button type="button" class="fclear" id="fclear">Clear all</button>'+
         '<button type="button" class="fdone" id="fdone">Show results</button></div>'+
     '</div>'+
     '<div class="filterbar" id="filterbar"><div class="ctabsrow">'+
       '<div class="ctabs" id="ctabs"></div>'+
       '<button class="fsbtn" id="searchToggle" aria-label="Search products"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></button></div>'+
       '<div class="fsrow"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#8a93a0" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'+
         '<input id="kitSearch" type="search" placeholder="Search all '+ALLKEYS.length+' products…" aria-label="Search products" autocomplete="off">'+
         '<button class="fsx" id="searchClose" aria-label="Close search">Cancel</button></div>'+
     '</div>'+
     '<div class="subbar">'+
       '<div class="subrow"><div class="subchips" id="subchips"></div>'+
         '<button type="button" class="fbtn" id="fbtn" aria-expanded="false">Filters<i id="fcount"></i></button></div>'+
       '<div class="fpills" id="fpills"></div>'+
       '</div>'+
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
   '<div class="lead samp" id="samp"></div>'+
   /* Share lives HERE, not only in the cart drawer. Buried behind "add items -> open kit -> scroll
      the footer" it was invisible: the person it is built for could not find it on his own store.
      The bar appears the moment the kit has something in it, which is exactly when sharing starts to
      mean anything, and it is the one piece of chrome always in reach on a phone. */
   '<div class="cbar" id="cbar"><div class="cbarin w"><div class="cbarL"><span class="n" id="cbarN">0</span> in this board</div>'+
     '<button class="cbarshare" id="cbarShare" aria-label="Send this board to your team" title="Send this board to your team">'+
       '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" '+
       'stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/>'+
       '<circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg><span>Share</span></button>'+
     '<button class="cbarbtn" id="openCart2">View list <span class="p" id="cbarP"></span> <span class="ar">→</span></button></div></div>'+
   '<div class="toast" id="toast"><span class="tk">✓</span><span class="tm" id="toastM">Added</span><button class="tview" id="toastView">View board →</button></div>';
  document.getElementById('app').innerHTML=html;
  var _oc=document.getElementById('openCart');
  if(_oc)_oc.addEventListener('click',function(){openBoard();});
  var cbs=document.getElementById('cbarShare');if(cbs)cbs.addEventListener('click',shareList);
  document.getElementById('openCart2').addEventListener('click',function(){openBoard();});
  wireRail();
  wireExplore();
  /* Categories now lives in the persistent bar, so the scroll-revealed chip strip is retired
     outright rather than swapped between states. One control, always in the same place. */
  var _tc=document.getElementById('tbCats');
  if(_tc)_tc.addEventListener('click',function(e){e.stopPropagation();toggleCatMenu();});
  var _tb=document.getElementById('tbBoards');
  if(_tb)_tb.addEventListener('click',function(){openBoards();});
  document.addEventListener('click',function(e){
    var m=document.getElementById('catmenu');
    if(m&&m.classList.contains('on')&&!m.contains(e.target))toggleCatMenu(false);});
  document.querySelectorAll('.cmrow').forEach(function(b){
    b.addEventListener('click',function(){toggleCatMenu(false);});});
  document.getElementById('ov').addEventListener('click',closeAll);
  // The delegated click handler was only ever attached when a product sheet first opened, because
  // that is the one place that needed it. The hero's sample-visit CTA is on the page before any
  // sheet exists, so on a fresh load the button did nothing at all. Attach it at boot; the _DELEG
  // guard keeps it to a single listener.
  wireDelegates();
  var ar=document.getElementById('addRec');if(ar)ar.addEventListener('click',addRecommended);
  var shr=document.getElementById('shReview');if(shr)shr.addEventListener('click',openCart);
  if(curateOn())markCurCards();
  var wc=document.getElementById('whyCta');if(wc)wc.addEventListener('click',function(){
    if(cartCount()>0){openBoard();}else{VIEW.sub='all';renderGrid();scrollToResults();}});
  // "Shop the collection" hero tiles -> jump into a category (and reveal their images, which sit outside #grid).
  document.querySelectorAll('.sccard').forEach(function(b){b.addEventListener('click',function(){setCat(b.dataset.cat,true);});});
  document.querySelectorAll('.scpic .g,.kpic .g').forEach(function(im){if(im.complete)im.classList.add('ld');else im.addEventListener('load',function(){im.classList.add('ld');});});
  // world lifestyle banners -> jump straight to that world's first category (no extra toggle layer)
  document.querySelectorAll('.audbanner').forEach(function(b){b.addEventListener('click',function(){var a=audOf(b.dataset.world);var cs=a?a.cats.filter(function(c){return CATS.indexOf(c)>=0;}):[];if(cs.length)setCat(cs[0],true);});});
  // FILTERED BROWSE: category tabs + subcategory chips + search (one category at a time).
  renderCtabs();
  wireFilters();renderFilterUI();
  var st=document.getElementById('searchToggle');if(st)st.addEventListener('click',openSearch);
  var sc=document.getElementById('searchClose');if(sc)sc.addEventListener('click',closeSearch);
  var si=document.getElementById('kitSearch');
  if(si){si.addEventListener('input',function(){VIEW.q=si.value;renderGrid();});
    si.addEventListener('keydown',function(e){if(e.key==='Escape')closeSearch();});}
  setCat(VIEW.cat,false);       // initial focused render
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(mediaOpen())closeMedia();else closeAll();}});
  if(C.feed&&!document.getElementById('beholdjs')){var bs=document.createElement('script');bs.id='beholdjs';bs.type='module';bs.src='https://w.behold.so/widget.js';document.head.appendChild(bs);}
  var tv=document.getElementById('toastView');
  if(tv)tv.addEventListener('click',function(){
    document.getElementById('toast').classList.remove('on');openBoard();});
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
function toast(msg){var t=document.getElementById('toast'),m=document.getElementById('toastM');if(!t)return;if(m)m.textContent=msg||'Added to your board';t.classList.add('on');clearTimeout(TT);TT=setTimeout(function(){t.classList.remove('on');},3600);}

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
/* ---- Share a product or a gift set --------------------------------------------------------
   Steven: "What if I want to share a specific kit / product to a client." The deep link already
   existed -- ?item=<key> is how the gift-set contents links work -- but there was no way for a
   human to GET one. It was plumbing with no tap on it.

   The link carries the COLOUR as well as the item, so a rep who sends "the Coastline in Cardinal
   Red" gets a recipient looking at Cardinal Red, not at whatever the store would have defaulted to.
   On a phone this opens the real OS share sheet (WhatsApp, Messages, email); everywhere else it
   copies, with a toast so the click is never silent. */
function shareUrlFor(key,colour){
  var base=location.origin+location.pathname;
  return base+'?item='+encodeURIComponent(key)+(colour?('&c='+encodeURIComponent(colour)):'');
}
function currentSheetColour(key){
  if(SH&&SH.key===key&&SH.colour)return SH.colour;
  var vm=(CFG.items||{})[key];
  return (vm&&vm.colour)||((BYKEY[key]&&(BYKEY[key].cols||[])[0]||{}).name)||'';
}
/* NOTE: there used to be a SECOND toast() here that built a bare #jdptoast div. Function
   declarations hoist, so this later one silently overrode the designed toast above -- meaning the
   real component (tick, message, and a "View list \u2192" button) had never once rendered. Customers
   were getting a plain text pill and, worse, losing the one-tap route to their kit right after
   adding something. Removed; the designed toast is the only toast. */
function copyLink(url){
  var done=function(){toast('Link copied — opens straight to this item');};
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(done,function(){legacyCopy(url,done);});
  }else legacyCopy(url,done);
}
function legacyCopy(url,done){
  // Older Safari and any non-secure context: a throwaway field is the only reliable path.
  try{var ta=document.createElement('textarea');ta.value=url;ta.setAttribute('readonly','');
    ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
    ta.setSelectionRange(0,99999);document.execCommand('copy');document.body.removeChild(ta);done();}
  catch(e){prompt('Copy this link:',url);}
}
/* A single copy button was not enough. Steven: "the sharing experience is terrible. optimize so we
   boost co workers sharing product links with each other." Two things were wrong with it:

     1. Nothing was VISIBLE. You clicked, a toast said "copied", and you had to trust it. People do
        not forward a link they have not seen, and there was no way to check it before pasting.
     2. Copy was the only route. The realistic ways a colleague passes a product around are a chat
        paste and an email — and email deserves to arrive written, not blank.

   So Share now opens a small panel showing the actual URL with a Copy button beside it, plus Email
   (subject and body pre-written with the product, colour, price and link) and, where the OS can do
   it, the native share sheet. The link is selectable text, so even if every button failed a person
   could still read it off the screen and send it. */
/* Vendor box descriptions carry fitment jargon meant for the warehouse -- "SMALL JOURNAL GIFT BOX
   TUMBLER CUTOUT". A buyer only needs to know a gift box is included, so trim everything after the
   word "box". */
function boxName(desc){
  var d=String(desc||'gift box').toLowerCase().replace(/\s+/g,' ').trim();
  var m=d.match(/^(.*?\bbox)\b/);
  return (m?m[1]:d).trim()||'gift box';
}
/* ---- Fabric, presented like a spec sheet rather than a sticker ------------------------------
   Fabric used to be a beige pill with a thread emoji, borrowed from the CSA safety-badge style, and
   it appeared ONLY on the grid tile -- the product sheet, where a buyer actually decides, said
   nothing about what the garment is made of. For a polo programme that is the single most asked
   question after price.

   The composition is now drawn as a proportional bar. A buyer reads "mostly cotton with a little
   stretch" from the shape before reading a single number, and the numbers are the maker's own
   published percentages, not a description we wrote. Weight and construction sit beside it as plain
   spec rows, and genuine published finishes appear as small tags. */
var FIBRE_COLS={
  cotton:'#D9C7A7','organic cotton':'#D9C7A7','certified cotton':'#D9C7A7','ringspun cotton':'#D9C7A7',
  polyester:'#8794A5','recycled polyester':'#6F9E9B',rpet:'#6F9E9B',
  spandex:'#B08BBF',elastane:'#B08BBF',lycra:'#B08BBF',
  nylon:'#6E8CA0',polyamide:'#6E8CA0',
  wool:'#B9A38C',merino:'#B9A38C',
  rayon:'#9FB49A',viscose:'#9FB49A',modal:'#9FB49A',bamboo:'#9FB49A',tencel:'#9FB49A',
  linen:'#CBBFA0',acrylic:'#A8A2B8'
};
var FIBRE_KEYS=Object.keys(FIBRE_COLS).sort(function(a,b){return b.length-a.length;});
function fibreColour(name){
  // Longest key first: "recycled polyester" contains "polyester", and insertion order would hand
  // recycled content the plain-polyester grey.
  var n=String(name||'').toLowerCase().trim();
  if(FIBRE_COLS[n])return FIBRE_COLS[n];
  for(var i=0;i<FIBRE_KEYS.length;i++)if(n.indexOf(FIBRE_KEYS[i])>=0)return FIBRE_COLS[FIBRE_KEYS[i]];
  return '#BFC5CC';
}
/* Accepts the structured `fab` built from maker spec tables, and falls back to parsing the older
   plain string so nothing goes blank while the data is still being filled in. */
function fabMix(item){
  if(item.fab&&item.fab.mix&&item.fab.mix.length)return item.fab.mix;
  var s=item.fabric||'';if(!s)return [];
  var out=[],re=/(\d{1,3})\s*%\s*([A-Za-z][A-Za-z\/\- ]{2,28})/g,m;
  while((m=re.exec(s))){out.push([m[2].replace(/\s+$/,''),parseInt(m[1],10)]);}
  return out;
}
function fabLine(item){
  var mix=fabMix(item);
  if(mix.length)return mix.map(function(p){return p[1]+'% '+p[0];}).join(' · ');
  return item.fabric||'';
}
// The card line. Weight rides along with the fibre content because heft is the difference a buyer
// can't see in a photo: an 8.3 oz cotton-rich polo and a 4.1 oz performance piqu\u00e9 photograph
// identically and wear nothing alike. One unit only -- gsm when the maker gives it -- so the line
// stays short enough for a card.
function fabCardLine(item){
  var l=fabLine(item);if(!l)return '';
  var w=(item.fab&&item.fab.weight)?String(item.fab.weight).split(' \u00b7 ')[0]:'';
  return w?(l+' \u00b7 '+w):l;
}
function fabricHtml(item){
  var f=item.fab||{},mix=fabMix(item);
  if(!mix.length&&!f.weight&&!f.knit&&!(f.finishes&&f.finishes.length)&&!item.fabric)return '';
  var bar='',leg='';
  if(mix.length){
    var tot=0;mix.forEach(function(p){tot+=p[1];});
    if(tot<=0)tot=100;
    bar='<div class="fbar" role="img" aria-label="'+esc(fabLine(item))+'">'+mix.map(function(p){
      return '<span style="width:'+(100*p[1]/tot).toFixed(2)+'%;background:'+fibreColour(p[0])+'"></span>';
    }).join('')+'</div>';
    leg='<div class="fleg">'+mix.map(function(p){
      return '<span><i style="background:'+fibreColour(p[0])+'"></i><b>'+p[1]+'%</b> '+esc(p[0])+'</span>';
    }).join('')+'</div>';
  }
  var rows='';
  if(!mix.length&&item.fabric)rows+='<div class="frw"><span>Fabric</span><b>'+esc(item.fabric)+'</b></div>';
  if(f.weight)rows+='<div class="frw"><span>Weight</span><b>'+esc(f.weight)+'</b></div>';
  if(f.knit)rows+='<div class="frw"><span>Construction</span><b>'+esc(f.knit)+'</b></div>';
  if(f.note)rows+='<div class="frw"><span>Also</span><b>'+esc(f.note)+'</b></div>';
  var tags=(f.finishes&&f.finishes.length)?('<div class="ftags">'+f.finishes.map(function(t){
    return '<span>'+esc(t)+'</span>';}).join('')+'</div>'):'';
  return '<div class="fabblk"><div class="fabhd">Fabric &amp; construction</div>'+bar+leg+rows+tags+
    '<div class="fabsrc">As published by the maker</div></div>';
}
function shareMenuHtml(key){
  var it=BYKEY[key];if(!it)return '';
  var colour=currentSheetColour(key),url=shareUrlFor(key,colour);
  return '<div class="shmenu" id="shmenu">'+
    '<div class="shmt">Share this item</div>'+
    '<div class="shmrow"><input class="shmurl" id="shmurl" readonly value="'+esc(url)+'">'+
      '<button class="shmcopy" data-copy="'+esc(url)+'">Copy</button></div>'+
    '<div class="shmacts">'+
      '<button class="shma" data-email="'+esc(key)+'">'+
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" '+
        'stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/>'+
        '<path d="M3 6l9 6 9-6"/></svg>Email it</button>'+
      (navigator.share?('<button class="shma" data-native="'+esc(key)+'">'+
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" '+
        'stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M8 8l4-4 4 4"/>'+
        '<path d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"/></svg>More…</button>'):'')+
    '</div>'+
    '<div class="shmnote">Opens straight to this item'+(colour?(' in '+esc(colour)):'')+'.</div>'+
  '</div>';
}
function shareEmail(key){
  var it=BYKEY[key];if(!it)return;
  var colour=currentSheetColour(key),url=shareUrlFor(key,colour);
  var price=(it.layer==='promo')?money(it.price_cad):money(it.blank||it.price_cad||0);
  var subj=it.name+' — '+(CFG.client||'team store');
  var body=['Have a look at this one:','',it.name+(colour?(' — '+colour):''),
            price+' per '+(it.unit==='dozen'?'dozen':'pc')+(it.moq?(' · minimum '+it.moq):''),
            '',url,'','Logo and final pricing are confirmed on the quote — no obligation.'].join('\n');
  location.href='mailto:?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);
}
function closeShareMenu(){
  var m=document.getElementById('shmenu');if(m&&m.parentNode)m.parentNode.removeChild(m);
  document.removeEventListener('click',_shOutside,true);
}
function _shOutside(e){
  var m=document.getElementById('shmenu');
  if(m&&!m.contains(e.target)&&!(e.target.closest&&e.target.closest('[data-share]')))closeShareMenu();
}
function openShareMenu(key,btn){
  closeShareMenu();
  var wrap=btn.parentNode;
  if(wrap&&getComputedStyle(wrap).position==='static')wrap.style.position='relative';
  btn.insertAdjacentHTML('afterend',shareMenuHtml(key));
  var m=document.getElementById('shmenu');if(!m)return;
  var inp=document.getElementById('shmurl');
  if(inp){inp.addEventListener('click',function(){inp.select();});}
  m.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();copyLink(b.dataset.copy);b.textContent='Copied';
    setTimeout(function(){b.textContent='Copy';},1800);});});
  m.querySelectorAll('[data-email]').forEach(function(b){b.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();shareEmail(b.dataset.email);closeShareMenu();});});
  m.querySelectorAll('[data-native]').forEach(function(b){b.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();closeShareMenu();nativeShare(b.dataset.native);});});
  setTimeout(function(){document.addEventListener('click',_shOutside,true);},0);
}
function nativeShare(key){
  var it=BYKEY[key];if(!it)return;
  var colour=currentSheetColour(key),url=shareUrlFor(key,colour);
  var title=it.name+(colour?(' — '+colour):'');
  try{
    var p=navigator.share({title:title,text:title+' · '+(CFG.client||'our team store'),url:url});
    if(p&&p.catch)p.catch(function(err){
      if(err&&err.name==='AbortError')return;      // the user closed the share sheet: respect it
      copyLink(url);});
  }catch(e){copyLink(url);}
}
function shareItem(key){
  var it=BYKEY[key];if(!it)return;
  var colour=currentSheetColour(key),url=shareUrlFor(key,colour);
  var title=it.name+(colour?(' — '+colour):'');
  var text=title+' · '+(CFG.client||'our team store');
  /* The OS share sheet is right on a phone and wrong on a desktop: Chrome on Windows exposes
     navigator.share but frequently rejects it, and the first version swallowed that rejection, so
     the button did nothing at all. Native is now used only where there is a touch pointer, and ANY
     failure other than the user deliberately cancelling falls through to copying. A share control
     must never be able to do nothing. */
  var touch=!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
  var canNative=!!navigator.share&&touch&&(!navigator.canShare||navigator.canShare({url:url}));
  if(canNative){
    try{
      var p=navigator.share({title:title,text:text,url:url});
      if(p&&p.catch)p.catch(function(err){
        if(err&&err.name==='AbortError')return;      // the user closed the share sheet: respect it
        copyLink(url);
      });
    }catch(e){copyLink(url);}
    return;
  }
  copyLink(url);
}
function shareBtnHtml(key){
  return '<button class="shshare" data-share="'+esc(key)+'" aria-label="Share this item" title="Share this item">'+
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" '+
    'stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/>'+
    '<circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg><span>Share</span></button>';
}
/* DELEGATION, not per-element binding. Both product sheets rebuild their innerHTML whenever the
   buyer changes colour, so every handler attached to a button inside them dies on the next render.
   Re-binding after each render works only as long as every future render path remembers to do it --
   and the colour swatch path did not, which is exactly why Share stopped responding after clicking a
   colour. One listener on the document, matched with closest(), cannot be lost that way. */
function onShareClick(b){
  // On a phone the OS sheet IS the best experience, so go straight there. On a desktop, where
  // there is room and the paste target is Slack/Teams/Outlook, show the panel.
  var touch=!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
  if(touch&&navigator.share){nativeShare(b.getAttribute('data-share'));return;}
  if(document.getElementById('shmenu')){closeShareMenu();return;}
  openShareMenu(b.getAttribute('data-share'),b);
}
var _DELEG=false;
/* ---- "See & feel it first" -------------------------------------------------------------------
   Nobody signs off 200 shirts they have never touched. The blocker on a company-wide order is not
   price and not choice -- it is that gsm and a photograph cannot tell you how a collar sits or how
   heavy a fleece really is. So the ask is not "book a meeting" (a cost to the buyer); it is "we'll
   bring these to you" (a service to the buyer), and it carries the shortlist they have already
   built rather than making them describe it again.

   It appears at the three moments doubt actually peaks: reading the fabric spec, looking at a full
   kit before requesting a quote, and hesitating at the final step. Copy claims nothing we have not
   been told to claim -- no cost, no timeframe, no coverage area. */
var SAMPKEYS=null;
function sampShortlist(){
  if(SAMPKEYS&&SAMPKEYS.length)return SAMPKEYS.slice();
  var ck=Object.keys(CART).map(bkey);
  return ck.length?ck:(SHEETKEY?[SHEETKEY]:[]);
}
function sampCtaHtml(key){
  return '<button type="button" class="svcta" data-samp="'+esc(key||'')+'">'+
    '<span class="svic" aria-hidden="true">\u270B</span>'+
    '<span class="svtx"><b>Not sure how it feels?</b>'+
    '<i>We\u2019ll bring samples to you \u2014 try it on, compare the fabrics, then decide.</i></span>'+
    '<span class="svgo" aria-hidden="true">\u2192</span></button>';
}
function openSampleVisit(key){
  SAMPKEYS=key?[key]:null;
  var el=document.getElementById('samp');if(!el)return;
  var keys=sampShortlist();
  var saved={};try{saved=JSON.parse(localStorage.getItem('jdpkit_contact')||'{}');}catch(e){}
  var list=keys.length
    ? '<ul class="svlist">'+keys.map(function(k){var it=BYKEY[k];if(!it)return '';
        var c=((CART[k]||CART[k+'#w'])||{}).colour||(SH&&SH.key===k?SH.colour:'')||'';
        return '<li><span>'+esc(it.name)+'</span>'+(c?'<i>'+esc(c)+'</i>':'')+'</li>';}).join('')+'</ul>'
    : '<p class="svnone">Add a few pieces to your board and we\u2019ll bring those \u2014 or just tell us below what you want to see.</p>';
  el.innerHTML='<button class="shx" id="sampX" aria-label="Close">\u2715</button><div class="leadb">'+
    '<div class="eyb">No obligation</div><h2>See &amp; feel it in person</h2>'+
    '<p class="leadsub">We\u2019ll come to your workplace with the actual garments so your team can '+
      'handle the fabric, check the fit and compare options side by side before you commit to a '+
      'company-wide order.</p>'+
    '<div class="svhd">What we\u2019ll bring'+(keys.length?' <i>'+keys.length+' item'+(keys.length===1?'':'s')+'</i>':'')+'</div>'+
    list+
    '<div class="coform svform">'+
      '<input id="svName" placeholder="Your name" autocomplete="name" value="'+esc(saved.name||'')+'">'+
      '<input id="svEmail" type="email" inputmode="email" placeholder="Email" autocomplete="email" value="'+esc(saved.email||'')+'">'+
      '<input id="svCompany" placeholder="Company / team" autocomplete="organization" value="'+esc(saved.company||CFG.client||'')+'">'+
      '<input id="svWhere" placeholder="Where are you? City or address" autocomplete="street-address">'+
      '<textarea id="svNote" placeholder="Anything that helps \u2014 sizes to bring, how many people, best days/times\u2026"></textarea>'+
    '</div>'+
    '<button class="leadbtn" id="svSend">Request a sample visit \u2192</button>'+
    '<div class="cktrust svtrust"><span>No payment now</span><span>No obligation</span></div></div>';
  document.getElementById('ov').classList.add('on');
  el.classList.add('on');document.body.style.overflow='hidden';
  var x=document.getElementById('sampX');if(x)x.addEventListener('click',closeSampleVisit);
  var b=document.getElementById('svSend');if(b)b.addEventListener('click',submitSampleVisit);
}
function closeSampleVisit(){
  var el=document.getElementById('samp');if(el)el.classList.remove('on');
  SAMPKEYS=null;
  if(!document.querySelector('.sheet.on')&&!document.querySelector('.cart.on')){
    document.getElementById('ov').classList.remove('on');document.body.style.overflow='';}
}
function sampVals(){return {
  name:((document.getElementById('svName')||{}).value||'').trim(),
  email:((document.getElementById('svEmail')||{}).value||'').trim(),
  company:((document.getElementById('svCompany')||{}).value||'').trim(),
  where:((document.getElementById('svWhere')||{}).value||'').trim(),
  note:((document.getElementById('svNote')||{}).value||'').trim()};}
function sampText(c){
  var lines=['SAMPLE VISIT REQUEST \u2014 '+CFG.client,''];
  lines.push('From:');
  if(c.name)lines.push('  '+c.name);
  if(c.email)lines.push('  '+c.email);
  if(c.company)lines.push('  '+c.company);
  if(c.where)lines.push('  Location: '+c.where);
  lines.push('');
  var keys=sampShortlist();
  if(keys.length){lines.push('Wants to see in person:');
    keys.forEach(function(k){var it=BYKEY[k];if(!it)return;
      var c2=((CART[k]||CART[k+'#w'])||{}).colour||'';
      lines.push('  \u2022 '+it.name+(it.sku?(' ('+it.sku+')'):'')+(c2?(' \u2014 '+c2):'')+
        (it.msku?('  [item '+it.msku+']'):''));});
    lines.push('');}
  if(c.note){lines.push('Notes:');lines.push('  '+c.note);lines.push('');}
  lines.push('Store: '+location.href.split('#')[0].split('?')[0]);
  return lines.join('\n');
}
function submitSampleVisit(){
  var c=sampVals();
  if(!c.email||c.email.indexOf('@')<1){var e=document.getElementById('svEmail');
    if(e){e.classList.add('err');e.focus();}toast('Add your email so we can get back to you');return;}
  persistContact(c);
  var body=sampText(c);
  var subj='Sample visit request \u2014 '+(c.company||CFG.client)+(c.name?' \u2014 '+c.name:'');
  var btn=document.getElementById('svSend');
  if(btn){btn.disabled=true;btn.dataset.lbl=btn.innerHTML;btn.innerHTML='Sending\u2026';}
  var payload={name:c.name||'(not given)',email:c.email,company:c.company||CFG.client||'',
    location:c.where||'(not given)',_subject:subj,_template:'table',_captcha:'false',
    request:body,store_link:location.href.split('#')[0].split('?')[0]};
  var done=false,fell=false;
  function fail(){if(done||fell)return;fell=true;
    if(btn){btn.disabled=false;btn.innerHTML=btn.dataset.lbl||'Request a sample visit';}
    clipCopy(body);
    window.location.href='mailto:'+JDP_EMAIL+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);}
  var to=setTimeout(fail,9000);
  fetch('https://formsubmit.co/ajax/'+JDP_EMAIL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){return r.json().catch(function(){return {};});})
    .then(function(j){clearTimeout(to);if(fell)return;done=true;
      if(j&&String(j.success)==='true'){sampSuccess(c);}else{fail();}})
    .catch(function(){clearTimeout(to);fail();});
}
function sampSuccess(c){
  var first=c.name?esc(c.name.split(' ')[0]):'';
  var el=document.getElementById('samp');if(!el)return;
  el.innerHTML='<button class="shx" id="sampX" aria-label="Close">\u2715</button>'+
    '<div class="cosent"><div class="csent-ic">\u2713</div>'+
    '<h3>Request sent'+(first?(', '+first):'')+'</h3>'+
    '<p>We\u2019ve got your board and where you are. We\u2019ll be in touch to arrange a time to bring the samples over.</p>'+
    '<button class="checkout" id="sampDone">Keep browsing</button></div>';
  var x=document.getElementById('sampX');if(x)x.addEventListener('click',closeSampleVisit);
  var d=document.getElementById('sampDone');if(d)d.addEventListener('click',closeSampleVisit);
}
function wireDelegates(){
  if(_DELEG)return;_DELEG=true;
  document.addEventListener('click',function(e){
    if(!e.target||!e.target.closest)return;
    var sb=e.target.closest('[data-share]');
    if(sb){e.preventDefault();e.stopPropagation();onShareClick(sb);return;}
    var bk=e.target.closest('[data-back]');
    if(bk){e.preventDefault();e.stopPropagation();
      var k=bk.getAttribute('data-back');FROMKEY='';openSheet(k);return;}
    var ct=e.target.closest('[data-curk]');
    if(ct){e.preventDefault();e.stopPropagation();curToggle(ct.getAttribute('data-curk'));return;}
    var sv=e.target.closest('[data-samp]');
    if(sv){e.preventDefault();e.stopPropagation();
      openSampleVisit(sv.getAttribute('data-samp')||'');return;}
    var it=e.target.closest('.pinc a[data-item]');
    if(it){e.preventDefault();e.stopPropagation();
      openSheet(it.getAttribute('data-item'),null,it.getAttribute('data-from')||'');return;}
  });
}
function wireShare(root){wireDelegates();}
/* Opening a component from a gift set used to be a one-way door: the sheet was replaced and the
   only route back was to close it and hunt for the kit again. FROMKEY remembers the set you came
   from so the component sheet can offer a labelled way back, and clicking it returns you to the
   kit rather than to a blank page. */
var FROMKEY='';
function backChipHtml(){
  if(!FROMKEY||!BYKEY[FROMKEY])return '';
  return '<button class="shback" data-back="'+esc(FROMKEY)+'">'+
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" '+
    'stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'+
    'Back to '+esc(BYKEY[FROMKEY].name)+'</button>';
}
function wireBack(root){wireDelegates();}
function openSheet(key,wantCol,fromKey){
  // Accepts a CART key (so the kit's edit pencil reopens that exact fit) or a plain product key.
  var _ck=key;key=bkey(key);
  FROMKEY=(fromKey&&fromKey!==key)?fromKey:'';
  SHEETKEY=key;
  var item=BYKEY[key],vm=vmOf(key),ex=CART[_ck]||null,exmap={};
  // A shared link carries the colour the sender was looking at, so the recipient sees the same thing.
  // A shared link may name a colour that only exists in the ladies' cut, so check both sets.
  if(item&&wantCol&&!hasCol(item.cols,wantCol)&&!hasCol(item.wcols,wantCol))wantCol=null;
  if(item&&item.layer==='promo'){   // promotional products: clean photo + colour + quantity + decoration
    SH={key:key,promo:true,gi:0,colour:wantCol||(ex&&ex.colour)||(item.cols[0]||{}).name,
        qty:(ex&&ex.qty)||item.moq||1,mi:(ex&&ex.mi)||0,locs:(ex&&ex.locs)||1};
    renderSheet();
    wireShare(document.getElementById('sheet'));wireBack(document.getElementById('sheet'));
  document.getElementById('ov').classList.add('on');document.getElementById('sheet').classList.add('on');
    document.body.style.overflow='hidden';return;
  }
  if(ex&&ex.decos){ex.decos.forEach(function(d){exmap[d.pl]=d;});}
  // Size breakdown is the ONLY quantity control. baseQty preserves the count of an item that was
  // quick-started without a size split (e.g. the recommended kit) so reopening it doesn't lose it.
  var exfit=(ex&&ex.fit)||fitOf(item);
  // Follow a shared link's colour into the cut that actually has it: a rep who sends the ladies'
  // Valor Blue must not land the recipient on the men's default. Without this the whole ?c= half of
  // every share link was dead for apparel -- only promo items ever read it.
  if(wantCol&&!hasCol(curColsOf(item,exfit),wantCol)){
    var _oth=(exfit==='womens')?'mens':'womens';
    if(hasCol(curColsOf(item,_oth),wantCol))exfit=_oth;
  }
  SH={key:key,colour:wantCol||(ex&&ex.colour)||BCOL[key+'|'+exfit]||vm.colour,face:'front',gimg:null,D:{},showExtra:false,sizes:{},fit:exfit,baseQty:ex?(ex.sizes?0:(ex.qty||moq())):moq()};
  // if the saved colour isn't in the active fit's colour set, fall back to that set's first colour
  var _cc=curColsOf(item,SH.fit);if(!colInList(_cc,SH.colour)||colInList(_cc,SH.colour).name!==SH.colour)SH.colour=_cc[0].name;
  sheetSizes().forEach(function(s){SH.sizes[s]=(ex&&ex.sizes&&ex.sizes[s])||0;});
  var logoPlaces=(item.places||[]).filter(function(p){return p.logo;}),primaryId=(logoPlaces[0]||{}).id;
  logoPlaces.forEach(function(p){
    // METHOD comes from the catalogue standard, never from the kit config. Reading vm.decos here is
    // what left the hi-vis tee drawing a screen print and the rain jacket a heat transfer while the
    // spec beside them said embroidery -- the mockup and the quote disagreeing on the same screen.
    var _sd=(recDecos(key)||[]).filter(function(x){return x.pl===p.id;})[0]||{};
    var _kd=(vm.decos||[]).filter(function(x){return x.pl===p.id;})[0]||{};
    var rd={pl:p.id,on:!!_sd.on,method:_sd.method||_kd.method,colours:1,
            lg:_kd.lg||_sd.lg,ink:_kd.ink||'auto'};
    var use=exmap[p.id];
    var on = p.id===primaryId ? true : (ex?!!use:!!rd.on);
    // A kit saved in the browser BEFORE standardisation can still hold an old method (screen, heat
    // transfer). The store no longer offers that choice, so the standard wins over the saved value --
    // otherwise a returning customer would keep being quoted a setup we no longer run.
    SH.D[p.id]={on:on, lg:(use&&use.lg)||rd.lg||(CFG.logos[0]||{}).id,
                ink:(use&&use.ink)||rd.ink||'auto', method:rd.method||'embroidery',
                colours:1};
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
    priceSub='<div class="pprice-sub">'+(multi?'Order more, pay less per '+unitP:'Your price per '+unitP)+' · your logo confirmed on your quote</div>';
    /* What's in the box. A gift set is bought on its CONTENTS, so list them and link each one.
       PACKAGING IS NOT A PRODUCT. The P-series gift box was previously listed as the first row of
       every set, where it was the one entry that could not be clicked -- Steven read that, quite
       reasonably, as "the first item in the kit is not clickable". A box has no product page, so it
       is now credited on its own line underneath instead of sitting in a list of things you can
       open. Every row that remains is clickable. */
    var incHtml='',_pkg=/\b(gift box|giftbox|magnetic box|crate|packaging|mailer box)\b/i;
    if(item.includes&&item.includes.length){
      var real=item.includes.filter(function(x){
        return !(_pkg.test(x.desc||'')||/^P\d/i.test(x.sku||''));});
      var boxes=item.includes.filter(function(x){
        return _pkg.test(x.desc||'')||/^P\d/i.test(x.sku||'');});
      if(real.length){
        incHtml='<div class="pgrp"><div class="pgl">Gift set includes</div><ul class="pinc">'+real.map(function(x){
          var hit=null;for(var k in BYKEY){if((BYKEY[k].msku||'').toUpperCase()===String(x.sku||'').toUpperCase()){hit=k;break;}}
          var txt=esc(x.desc||x.sku||'');
          return '<li>'+(hit?('<a href="?item='+encodeURIComponent(hit)+'" data-item="'+esc(hit)+'" data-from="'+esc(SHEETKEY)+'">'+txt+'</a>'):txt)+
                 (x.sku?(' <small>'+esc(x.sku)+'</small>'):'')+'</li>';}).join('')+'</ul>'+
          (boxes.length?('<div class="pboxnote">Presented in a '+esc(boxName(boxes[0].desc))+'</div>'):'')+
          '</div>';}}
    logoGrp=incHtml+'<div class="pgrp"><div class="pgl">Your logo</div><div class="qlogo"><span class="pinci">✓</span> Add your logo — we’ll confirm decoration &amp; setup on your quote.</div></div>';
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
      '<div class="psrow"><span>Your logo</span><span>confirmed on quote</span></div>'+
      '<div class="psrow pstot"><span>Estimated total</span><span>'+money(q.goods+(item.setup>0?item.setup:0))+'</span></div></div>';
    footHtml='<div class="pfrow"><span>'+q.qty+' '+unitP+' · '+money(q.perPiece)+'/'+unitP+'</span><b>'+money(q.goods)+'</b></div>'+
      '<button class="shaddbtn" id="shAdd"><span>'+(CART[SH.key]?'Update board':'Add to board')+'</span><span class="p">'+money(q.goods)+'</span></button>'+
      '<div class="shtrust">Minimum '+min+' '+unitP+' · logo &amp; final price confirmed on your quote</div>';
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
      '<button class="shaddbtn" id="shAdd"><span>'+(CART[SH.key]?'Update board':'Add to board')+'</span><span class="p">'+money(q.total)+'</span></button>'+
      '<div class="shtrust">Minimum '+min+' pcs · no payment now</div>';
  }
  document.getElementById('sheet').innerHTML=
    '<button class="shx" id="shx" aria-label="Close">✕</button>'+backChipHtml()+
    '<div class="shscroll">'+
      '<div class="shimg"><div class="shstage"><img id="pmain" class="g" src="'+gurl(gal[gi])+'" alt="'+esc(item.name)+'"></div>'+thumbs+'</div>'+
      '<div class="shb">'+
        '<h2>'+esc(item.name)+'</h2>'+
        '<div class="shsku">'+esc(item.brand||'')+(item.layer==='promo'?'':' · item '+esc(item.msku||item.sku))+
          shareBtnHtml(SHEETKEY)+'</div>'+
        '<div class="pprice"><b>'+money(q.perPiece)+'</b><span>per '+unitP+'</span></div>'+
        priceSub+
        (item.desc?'<p class="shblurb">'+esc(item.desc)+'</p>':'')+
        (cols?'<div class="pgrp"><div class="pgl">Colour<i>'+esc(SH.colour||'')+'</i></div><div class="pcols">'+cols+'</div></div>':'')+
        logoGrp+
        '<div class="pgrp"><div class="pgl">How many?<i>minimum '+min+' '+unitP+'</i></div>'+picksHtml+
          '<div class="qty pqty"><button data-d="-'+step+'" aria-label="Fewer">–</button><input id="pqin" class="szin" type="number" inputmode="numeric" value="'+q.qty+'" min="'+min+'"><button data-d="'+step+'" aria-label="More">+</button></div></div>'+
        sumHtml+
        '<div class="pinc"><span class="pinci">✓</span> Exact quote confirmed before anything is made · no payment now.</div>'+
      '</div></div>'+
    '<div class="shfoot">'+footHtml+'</div>';
  var sh=document.getElementById('sheet');
  // Re-render replaces this markup, so the sheet chrome must be re-bound every time, not just
  // on open: clicking a colour swatch calls the renderer again and left Share and Back dead.
  // The panel is dismissed too, since the link it was showing is for the previous colour.
  closeShareMenu();wireShare(sh);wireBack(sh);
  document.getElementById('shx').addEventListener('click',closeAll);
  sh.querySelectorAll('.pthumb').forEach(function(b){b.addEventListener('click',function(){SH.gi=+b.dataset.i;var mi=document.getElementById('pmain');if(mi)mi.src=gurl(gal[SH.gi]);sh.querySelectorAll('.pthumb').forEach(function(x){x.classList.toggle('on',x===b);});});});
  sh.querySelectorAll('.pcol').forEach(function(b){b.addEventListener('click',function(){SH.colour=b.dataset.col;SH.gi=0;renderPromoSheet();});});
  // Jump straight from a gift set to any component it contains, in place, with no page reload.
  // contents links are handled by the delegated listener in wireDelegates()
  sh.querySelectorAll('.pmeth').forEach(function(b){b.addEventListener('click',function(){SH.mi=+b.dataset.mi;renderPromoSheet();});});
  sh.querySelectorAll('.ploc').forEach(function(b){b.addEventListener('click',function(){SH.locs=+b.dataset.loc;renderPromoSheet();});});
  sh.querySelectorAll('.ppick').forEach(function(b){b.addEventListener('click',function(){SH.qty=+b.dataset.q;renderPromoSheet();});});
  sh.querySelectorAll('.pqty button').forEach(function(b){b.addEventListener('click',function(){var cur=parseInt(document.getElementById('pqin').value,10)||min;SH.qty=Math.max(min,cur+parseInt(b.dataset.d,10));renderPromoSheet();});});
  var qin=document.getElementById('pqin');if(qin)qin.addEventListener('change',function(){SH.qty=Math.max(min,parseInt(qin.value,10)||min);renderPromoSheet();});
  document.getElementById('shAdd').addEventListener('click',function(){var was=!!CART[SH.key];CART[SH.key]={qty:q.qty,colour:SH.colour,mi:SH.mi,locs:SH.locs,promo:true};saveCart();closeAll();refreshCartUI();syncBoardIfOpen();toast((was?'Updated · ':'Added · ')+item.name);});
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
    ".shfrom{margin:7px 0 4px;font-size:14px;color:#666;font-weight:600;display:flex;align-items:baseline;flex-wrap:wrap;gap:0 6px}.shfrom b{color:#141414;font-size:17px;font-weight:800}.shfrom small{color:#8a8a8a;font-weight:600}.shfrom i{font-style:normal;color:#666;font-weight:700}.shfrom .shvol{font-size:12.5px;font-weight:700;color:#0a7d3c;background:#e8f7ee;border-radius:999px;padding:3px 9px}"+
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
    /* Both cuts are separate kit lines now, and companies usually want both. Saying the other one is
       already in there removes the "did I just overwrite it?" doubt, and nudges the second add. */
    (function(){var other=ckey(SH.key,SH.fit==='womens'?'mens':'womens');var o=CART[other];
      return o?('<span class="fitboth">\u2713 '+(SH.fit==='womens'?'Men\u2019s':'Women\u2019s')+
        ' cut already in your board \u2014 '+(o.qty||0)+' pcs</span>'):'';})()+
    '</div>'):(item.unisex?'<div class="fittog"><span class="fitl">Fit</span><span class="unitag">Unisex</span><span class="fitnote">One unisex cut — fits everyone</span></div>':'');
  var faceTog=hasBack?'<div class="ftog"><button class="pchip'+(SH.face==='front'?' on':'')+'" data-face="front">Front</button><button class="pchip'+(SH.face==='back'?' on':'')+'" data-face="back">Back</button></div>':'';
  var logoPlaces=(item.places||[]).filter(function(p){return p.logo;});
  var primary=logoPlaces[0],extras=logoPlaces.slice(1);
  // Read-only: this is the setup that is mocked up, quoted AND produced. Offering a finish menu and
  // optional extra spots meant the customer could leave the sheet in a state the quote never matched,
  // and made every order a bespoke production setup. Anything beyond the standard is a quoted
  // exception now, requested in the notes -- which is where variation belongs.
  var _st=stdOf(SH.key);
  var primaryHtml=(_st&&_st.method)
    ? ('<section class="step"><div class="steph"><span class="stepn">3</span><span class="stept">Your logo</span>'+
        '<i>included</i></div><div class="decostd">'+
        '<span class="dsic" aria-hidden="true">\u25C6</span>'+
        '<span class="dstx"><b>'+esc(_st.loc)+'</b><i>Embroidered \u00b7 '+esc(_st.size)+' \u00b7 included in the price</i></span>'+
        '</div>'+sysHtml(item)+'<div class="decofoot">Our standard setup for this product. The image above is a '+
        'visual guide, not an exact production rendering. Your logo, placement and size are confirmed '+
        'on your quote. Need another location? Add it in the notes and we\u2019ll price it.</div></section>')
    : (hasDecoPlace(item)?'':'<section class="step"><div class="steph"><span class="stepn">3</span><span class="stept">Your logo</span></div>'+
        '<div class="decofoot">This piece is supplied blank. Tell us in the notes if you\u2019d like it decorated and we\u2019ll quote it.</div></section>');
  var extraHtml='';
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
    '<div class="szgrid">'+grid+'</div>'+spreadReuseHtml()+
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
    '<button class="shx" id="shx" aria-label="Close">✕</button>'+backChipHtml()+
    '<div class="shscroll">'+
      '<div class="shimg" id="shimg"><div class="shstage"><img class="g" src="'+(SH.gimg?gurl(SH.gimg):o.g)+'" alt="">'+(SH.gimg?'':o.lg)+'</div>'+faceTog+'</div>'+
      galleryStrip(item)+
      ((item.scenic||item.video)?('<div class="shmedia">'+
        (item.scenic?'<button class="shworn" id="shworn" aria-label="See it worn"><img src="'+gurl(item.scenic)+'" alt="" loading="lazy"><span class="swt"><b>See it worn</b><i>real in-the-field photo</i></span><span class="swgo">→</span></button>':'')+
        (item.video?'<button class="vwatch" id="vwatch"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Watch video</button>':'')+
      '</div>'):'')+
      '<div class="shb"><h2>'+esc(item.name)+'</h2><div class="shsku">'+esc(item.sku)+(hasLadies(item)?(SH.fit==='womens'?' · Ladies’':' · Men’s'):(item.unisex?' · Unisex':''))+(item.layer==='field'&&item.csa?' · CSA hi-vis':'')+shareBtnHtml(SHEETKEY)+'</div>'+
      '<div class="shfrom"><b>'+money(unit)+'</b> <small>/pc</small> <i>at '+(q||moq())+' pcs</i>'+(hasDecoPlace(item)?' · decorated':'')+
        (fromP<unit?('<span class="shvol">'+money(fromP)+'/pc at '+topcol+'+</span>'):'')+'</div>'+
      (item.blurb?'<p class="shblurb">'+esc(item.blurb)+'</p>':'')+
      fabricHtml(item)+sampCtaHtml(SH.key)+
      fitTog+step1+qtyGrp+primaryHtml+extraHtml+
      '<div class="shnote">'+(hasDecoPlace(item)?'Prices are per piece, decorated — your logo (embroidery / print) is included. One-time setup shows once in your board summary. ':'Prices are per piece (blank garment — no decoration on this item). ')+'Exact quote confirmed before anything runs.</div>'+
    '</div></div>'+
    '<div class="shfoot">'+priceClar+
      '<button class="shaddbtn" id="shAdd"'+(canAdd?'':' disabled')+'><span>'+(canAdd?(CART[ckey(SH.key,SH.fit)]?'Update board':'Add to board'):('Add '+moq()+'+ pieces'))+'</span><span class="p">'+money(line)+'</span></button>'+
      '<div class="shtrust">✓ Live pricing · exact quote · no obligation · no payment now</div></div>';
  var sh=document.getElementById('sheet');
  // Re-render replaces this markup, so the sheet chrome must be re-bound every time, not just
  // on open: clicking a colour swatch calls the renderer again and left Share and Back dead.
  // The panel is dismissed too, since the link it was showing is for the previous colour.
  closeShareMenu();wireShare(sh);wireBack(sh);
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
  var _sr=document.getElementById('spreadre');if(_sr)_sr.addEventListener('click',applySpread);
  sh.querySelectorAll('.szin').forEach(function(inp){inp.addEventListener('change',function(e){SH.sizes[e.target.dataset.sz]=Math.max(0,parseInt(e.target.value,10)||0);renderSheet();});});
  document.getElementById('shAdd').addEventListener('click',addFromSheet);
  var _n=document.querySelector('#sheet .shscroll');if(_n)_n.scrollTop=_top;
}
/* ---------- reuse the size split -------------------------------------------------------------
   The size grid IS the quantity control, so every product in a program asks for the same breakdown
   again: a 6-piece program for one 24-person crew means entering the same six numbers six times --
   36 inputs to describe one headcount. That is the single biggest piece of repeated work left in the
   flow, and it lands right before "add to kit", the click the whole store exists to produce.
   So we remember the last split and offer it in one tap. It appears ONLY on an item with no sizes
   entered yet, so it never argues with someone who has already started typing, and it maps onto the
   sizes the current fit actually offers (womens runs XS-2XL, mens S-3XL). */
function saveSpread(sz,fit,name){
  try{localStorage.setItem('jdp_spread',JSON.stringify({sz:sz,fit:fit,name:name}));}catch(e){}}
function lastSpread(){
  try{var s=JSON.parse(localStorage.getItem('jdp_spread')||'null');
    return (s&&s.sz&&Object.keys(s.sz).length)?s:null;}catch(e){return null;}}
function spreadFor(sp){
  var out={},n=0;
  sheetSizes().forEach(function(s){var v=parseInt(sp.sz[s],10)||0;if(v){out[s]=v;n+=v;}});
  return {sizes:out,total:n};}
function spreadReuseHtml(){
  var sp=lastSpread();if(!sp||sizeTotal()>0)return '';
  var m=spreadFor(sp);if(!m.total)return '';
  var txt=Object.keys(m.sizes).map(function(s){return s+' '+m.sizes[s];}).join(' \u00b7 ');
  return '<button type="button" class="spreadre" id="spreadre">'+
    '<b>\u21ba Same split as '+esc(sp.name||'your last item')+'</b>'+
    '<i>'+esc(txt)+' \u00b7 '+m.total+' pcs</i></button>';}
function applySpread(){
  var sp=lastSpread();if(!sp)return;
  var m=spreadFor(sp);
  sheetSizes().forEach(function(s){SH.sizes[s]=m.sizes[s]||0;});
  renderSheet();}
function swapPreview(){var im=document.getElementById('shimg');if(im){im.classList.add('sw');setTimeout(function(){im.classList.remove('sw');},220);}}
function addFromSheet(){
  var q=effQty();
  if(q<moq()){toast('Add at least '+moq()+' pieces');return;}
  var _moved=ensureWritable();
  var _ck=ckey(SH.key,SH.fit);
  var was=!!CART[_ck],decos=[];
  Object.keys(SH.D).forEach(function(pl){var d=SH.D[pl];if(d.on)decos.push({pl:pl,lg:d.lg,ink:d.ink,method:d.method,colours:d.colours||1,on:true});});
  var entry={qty:q,colour:SH.colour,decos:decos,fit:SH.fit};
  var sz={};sheetSizes().forEach(function(s){if(SH.sizes[s])sz[s]=SH.sizes[s];});
  if(Object.keys(sz).length)entry.sizes=sz;   // else keep the plain qty (a quick-started item reopened & saved as-is)
  if(Object.keys(sz).length)saveSpread(sz,SH.fit,BYKEY[SH.key].name);
  CART[_ck]=entry;
  saveCart();closeAll();refreshCartUI();syncBoardIfOpen();
  toast((was?'Updated · ':'Added · ')+BYKEY[SH.key].name);
}
function recCartDecos(key){key=bkey(key);
  var vm=vmOf(key),decos=activeDecos(vm.decos).map(function(d){return {pl:d.pl,lg:d.lg,ink:d.ink||'auto',method:d.method||'embroidery',colours:d.colours||1,on:true};});
  if(!decos.length){var p=(BYKEY[key].places||[]).filter(function(x){return x.logo;})[0];if(p)decos=[{pl:p.id,lg:(CFG.logos[0]||{}).id,ink:'auto',method:(recDecos(key)[0]||{}).method||'embroidery',colours:1,on:true}];}
  return decos;
}
function quickAdd(key){
  if(!BYKEY[key])return;var it=BYKEY[key],vm=vmOf(key),ex=CART[key];
  if(it.layer==='promo'){CART[key]={qty:(ex&&ex.qty)||it.moq||1,colour:(ex&&ex.colour)||(it.cols[0]||{}).name,mi:(ex&&ex.mi)||0,locs:(ex&&ex.locs)||1,promo:true};saveCart();refreshCartUI();toast('Added · '+it.name);return;}
  var _moved=ensureWritable();
  if(_moved)ex=CART[key];                       // different list -- re-read any existing line
  CART[key]={qty:(ex&&ex.qty)||moq(),colour:(ex&&ex.colour)||vm.colour,decos:recCartDecos(key)};
  saveCart();refreshCartUI();syncBoardIfOpen();
  if(_moved){toast('Added to '+activeName()+' \u2014 the JDP starter list stays as a template');return;}
  // First item ever: say what the kit is FOR. After that, stay out of the way.
  var taught=false;try{taught=!!localStorage.getItem('jdp_taught_share');}catch(e){}
  if(!taught&&cartCount()===1){
    try{localStorage.setItem('jdp_taught_share','1');}catch(e){}
    /* This teaching toast fired on the very first save and never said WHERE the item went, which
       is the one moment a buyer has no mental model yet. Name the board first, teach second. */
    toast('Added to '+activeName()+' \u2014 build it up, then Share it with your team');
  }else{
    // Name the destination on every save. When there is only one list this reads naturally; when
    // there are several it is the difference between confidence and "where did that go?".
    toast(listIds().length>1?('Added to '+activeName()+' \u00b7 '+BYKEY[key].name)
                            :('Added \u00b7 '+BYKEY[key].name));}
}
// The curated "top picks" set = items flagged rec across every category (not the whole catalogue — a
// full dump overwhelms and inflates the quote). Falls back to the first few office items if none flagged.
/* The curated starter set. `rec` marks ~23 products as a strong pick WITHIN their category, which
   is right for a badge and wrong for a "start here" button: adding 23 items is not a starting point,
   it is the whole store. `ess` is an explicit, ordered nine -- everyday tops, layers, then the
   onboarding pieces -- so the button offers advice instead of a bulk action. */
/* ---- Per-store shortlist ---------------------------------------------------------------------
   After a site visit the buyer has already told us what they want. Making them re-find those pieces
   in a 489-item catalogue is the single most wasteful thing this store can do -- and the generic
   "9 essentials" is the wrong answer for someone who has named their own.

   So the store adapts to where the relationship actually is. No shortlist: lead with the samples
   offer. Shortlist present: lead with THEIR list, and drop the samples offer to secondary, because
   the visit already happened. Nothing here is invented -- the list, who picked it and the per-item
   reason all come from the kit's own config, and the section simply does not render without one. */
/* ---- A list the CUSTOMER built, shared as a link ---------------------------------------------
   The shortlist workflow had a hole in the middle. A per-store list needed a site visit; the global
   list solved Steven's effort by making the list generic -- which threw away the personalisation
   that made the feature worth having. Both versions assumed WE curate FOR the customer.

   But the person who decides a company's program is the champion inside that company, and they are
   already building exactly that list in their kit. So: let them send it. One link, no login, no
   token, no involvement from us. Their team opens it and lands on a six-item store instead of a
   489-item catalogue, and the champion gets the ownership that makes a program stick.

   The link carries key, quantity and colour, and every field is re-validated on the way in -- an
   edited or truncated URL degrades to fewer items, never to a broken store. */
var SHARED=null;
/* ---------- the shared link must carry what the sender actually chose -------------------------
   It did not. The format was key~qty~colour, with no FIT -- and the colour was then validated
   against BYKEY[k].cols, the mens run only. Colours are fit-aware (curColsOf returns item.wcols for
   womens), so a womens colour was not found, was blanked, and silently fell back to cols[0] -- the
   FIRST colour in the list. Sender picks womens Team Red, recipient opens Anthracite, nothing says a
   word. 20 items in the catalogue have womens colours absent from their mens run.
   Sizes were not carried either, so the recipient re-typed the split the sender had already entered.
   Decoration deliberately still regenerates from the standard setup: there is exactly ONE
   standardised decoration per product now, so it reproduces the sender's choice without bloating
   the URL. Trailing empty fields are trimmed, and a 3-field legacy link still decodes. */
function encSizes(sz){if(!sz)return '';var o=[];
  for(var s in sz){if(sz[s]>0)o.push(s+'-'+sz[s]);}return o.join('.');}
function decSizes(str){var out={},n=0;
  String(str||'').split('.').forEach(function(p){var m=p.split('-');if(m.length!==2)return;
    var v=parseInt(m[1],10);
    if(ALLSIZES.indexOf(m[0])<0||!(v>0)||v>100000)return;out[m[0]]=v;n++;});
  return n?out:null;}
function sizeSum(sz){var t=0;for(var s in (sz||{}))t+=(parseInt(sz[s],10)||0);return t;}
function encodeList(){
  var parts=[];
  Object.keys(CART).forEach(function(k){
    var c=CART[k];if(!BYKEY[bkey(k)])return;
    var f=[bkey(k),(c.qty||moq()),(c.colour||''),(c.fit==='womens'?'w':''),encSizes(c.sizes),
           noteClean(c.note)];
    while(f.length>3&&!f[f.length-1])f.pop();      // keep links short; older readers ignore extras
    parts.push(f.join('~'));});
  return parts.join('|');
}
function decodeList(str){
  var out=[];
  String(str||'').split('|').forEach(function(chunk){
    var bits=chunk.split('~'),k=bits[0];
    if(!k||!BYKEY[k])return;                                   // unknown/renamed product: drop it
    var fit=(bits[3]==='w')?'womens':'mens';
    // Dedupe on product AND fit -- the same polo in both cuts is two legitimate lines.
    if(out.some(function(x){return x.k===k&&x.fit===fit;}))return;
    var q=parseInt(bits[1],10);if(!(q>0)||q>100000)q=moq();
    var sizes=decSizes(bits[4]);
    if(sizes)q=sizeSum(sizes)||q;                  // the split IS the quantity
    var col=bits[2]||'';
    // Validate against the run the sender was actually looking at, not always the mens list.
    var cols=curColsOf(BYKEY[k],fit)||[];
    var lost='';
    if(col&&!cols.some(function(c){return c.name===col;})){lost=col;col='';}
    out.push({k:k,qty:q,colour:col||((cols[0]||{}).name||''),fit:fit,sizes:sizes,lost:lost,
              note:noteClean(bits[5])});});
  return out;
}
/* Query strings legitimately encode a space as EITHER %20 or +, and mail clients, link shorteners
   and chat apps rewrite between them freely. decodeURIComponent does NOT treat + as a space, so a
   board called "Autumn rollout" arrived as "Autumn+rollout" -- and far worse, a colour like
   "Campus Orange" would arrive as "Campus+Orange", fail the colour check, and silently fall back to
   the first colour in the run. That is the exact wrong-colour bug from before, reachable through a
   different door. Normalise + to %20 before decoding every shared parameter. */
function qdec(s){try{return decodeURIComponent(String(s).replace(/\+/g,'%20'));}catch(e){
  try{return decodeURIComponent(s);}catch(e2){return '';}}}
function readSharedList(){
  var m=location.search.match(/[?&]list=([^&#]+)/);if(!m)return null;
  var items;try{items=decodeList(qdec(m[1]));}catch(e){return null;}
  if(!items.length)return null;
  var f=location.search.match(/[?&]from=([^&#]+)/),from='';
  from=f?qdec(f[1]).slice(0,40):'';
  var bn=location.search.match(/[?&]b=([^&#]+)/),bname='';
  bname=bn?qdec(bn[1]).slice(0,40):'';
  return {items:items,from:from,bname:bname};
}
/* ---------- LIVE BOARDS -------------------------------------------------------------------------
   A board is now one document on the server, not a per-browser cache. localStorage is kept as the
   local mirror so the store is instant and still works with no network -- the server is the shared
   truth, the browser is the fast copy. Every network call is fire-and-forget: nothing in the UI ever
   waits on it. */
function apiBase(){return String((CFG&&CFG.catalog_base)||CATALOG_BASE).replace('_catalog','_api');}
function boardsApi(){return apiBase()+'/boards.php';}
function bslug(s){return String(s||'').toLowerCase()
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);}
var SYNC='';
function markSync(state){
  SYNC=state;
  var el=document.getElementById('bsync');if(!el)return;
  var m={saving:['Saving\u2026','sv'],saved:['Saved','ok'],
         merged:['Updated from another device','ok'],
         offline:['Saved on this device only','off']}[state]||['','' ];
  el.textContent=m[0];el.className='bsync '+m[1];
}
var _pushT=null;
function pushBoardSoon(){
  if(!LISTS||!LISTS[ALID]||isTemplate(ALID))return;   // our starter template is not a customer board
  markSync('saving');
  clearTimeout(_pushT);_pushT=setTimeout(pushBoardNow,1100);
}
function pushBoardNow(){
  var L=LISTS&&LISTS[ALID];if(!L||isTemplate(ALID))return;
  var b=L.slug||bslug(L.name);if(!b)return;
  L.slug=b;
  var who='';try{who=(JSON.parse(localStorage.getItem('jdpkit_contact')||'{}').name||'');}catch(e){}
  var body={kit:SLUG,b:b,name:L.name,items:L.items,by:who};
  if(L.rev)body.rev=L.rev;
  fetch(boardsApi(),{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)})
    .then(function(r){return r.json();})
    .then(function(j){
      if(j&&j.ok){L.rev=j.rev;L.slug=j.b;persistLists();markSync('saved');return;}
      /* Someone edited the same board elsewhere. Their version wins and we adopt it rather than
         silently clobbering a colleague -- the whole point of a shared document. */
      if(j&&j.error==='stale'&&j.board){
        L.items=j.board.items||{};L.rev=j.board.rev;L.name=j.board.name||L.name;
        if(LISTS[ALID]===L)CART=L.items;
        persistLists();syncBoardIfOpen();refreshCartUI();markSync('merged');return;}
      markSync('offline');
    })
    .catch(function(){markSync('offline');});
}
function pullBoard(b){
  return fetch(boardsApi()+'?kit='+encodeURIComponent(SLUG)+'&b='+encodeURIComponent(b),
      {cache:'no-store'})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(j){return (j&&j.ok&&j.board)?j.board:null;})
    .catch(function(){return null;});
}
/* Opening ?b=<slug>: adopt the server's copy as a real local board, then show it. */
function openSharedBoard(b){
  return pullBoard(b).then(function(sb){
    if(!sb)return false;
    if(!LISTS)loadLists();
    var id=null;
    for(var k in LISTS){if(LISTS[k].slug===b){id=k;break;}}
    if(!id){id=newListId();LISTS[id]={name:sb.name||b,items:{},updated:Date.now()};}
    LISTS[id].name=sb.name||LISTS[id].name;
    LISTS[id].items=sb.items||{};
    LISTS[id].slug=b;LISTS[id].rev=sb.rev||0;LISTS[id].updated=Date.now();
    ALID=id;CART=LISTS[id].items;persistLists();
    refreshCartUI();
    return true;
  });
}
function shareListUrl(){
  /* A board id only exists in the browser that made it, so ?board=<id> was never shareable -- which
     is why copying the address bar handed people a dead link. This URL carries the board's NAME and
     its full contents, so it works on any device, and it is what now sits in the address bar while a
     board is open. Copying what you are looking at finally does the right thing. */
  /* Short and PERMANENT. The board lives on the server now, so the link no longer carries the
     products -- it stays identical as the board changes, which is what makes it safe to email to an
     account before the board is finished. */
  var L=LISTS&&LISTS[ALID];
  var b=(L&&L.slug)||bslug(activeName());
  return location.origin+location.pathname+'?b='+encodeURIComponent(b);
}
/* Sharing a list is the strongest buying signal this store produces, and until now it was invisible
   to us -- the list lived in one browser and we only ever learned about it if that person went on to
   request a quote. So a share also pings JDP with the list AND a curator link that opens this store
   pre-loaded with it, one tap from becoming the store's permanent front page. That is what makes the
   selection actually persist for the whole company instead of one device.
   Fired once per distinct list per browser, so re-sharing the same list never spams the inbox. */
function notifyShared(url){
  var sig='';try{sig=localStorage.getItem('jdp_shared_sig')||'';}catch(e){}
  var now=encodeList();
  if(sig===now)return;
  try{localStorage.setItem('jdp_shared_sig',now);}catch(e){}
  var lines=[CFG.client+' \u2014 a list was shared from their store',''];
  Object.keys(CART).forEach(function(k){
    var it=BYKEY[bkey(k)];if(!it)return;var c=CART[k];
    lines.push('  \u2022 '+it.name+(it.sku?(' ('+it.sku+')'):'')+
      ((c.fit==='womens')?' [Women\u2019s]':'')+' \u2014 '+(c.colour||'')+' \u00d7 '+(c.qty||moq()));});
  lines.push('');
  lines.push('Open their list:  '+url);
  lines.push('Pin it to this store (opens curator mode, ready to publish):');
  lines.push('  '+location.origin+location.pathname+'?curate=1&list='+encodeURIComponent(now));
  var c2={};try{c2=JSON.parse(localStorage.getItem('jdpkit_contact')||'{}');}catch(e){}
  fetch('https://formsubmit.co/ajax/'+JDP_EMAIL,{method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({_subject:'List shared \u2014 '+(c2.company||CFG.client),
      _template:'table',_captcha:'false',
      name:c2.name||'(not given)',email:c2.email||'(not given)',
      company:c2.company||CFG.client||'',store:CFG.client||'',
      list:lines.join('\n')})}).catch(function(){});
}
/* A toast saying "copied" is unverifiable, and if the browser refuses the clipboard write the user is
   left with nothing at all. Show the actual URL, selectable, with a Copy button that reports success
   -- so sharing works even when the clipboard API does not. */
function openSharePanel(){
  if(!Object.keys(CART).length){toast('Add a few pieces first');return;}
  pushBoardNow();                       // make sure the server has it before the link is handed out
  var url=shareListUrl();
  notifyShared(url);
  var el=document.getElementById('sharepanel');
  if(!el){el=document.createElement('div');el.id='sharepanel';el.className='bpickov';document.body.appendChild(el);}
  var touch=false;try{touch=!!(navigator.share&&matchMedia('(hover:none)').matches);}catch(e){}
  el.innerHTML='<div class="bpick sharep"><div class="bpickhd">Share \u201c'+esc(activeName())+'\u201d'+
      '<button type="button" class="bpx" id="spX" aria-label="Close">\u2715</button></div>'+
    '<p class="spnote">Anyone with this link sees this board exactly as it is \u2014 same colours, '+
      'sizes and quantities. Works on any phone or computer.</p>'+
    '<input class="spurl" id="spUrl" readonly value="'+esc(url)+'">'+
    '<div class="spacts">'+
      '<button type="button" class="bcta" id="spCopy">Copy link</button>'+
      (touch?'<button type="button" class="bghost" id="spNative">Share\u2026</button>':'')+
      '<a class="bghost spmail" target="_blank" rel="noopener noreferrer" href="'+
        esc('mailto:?subject='+encodeURIComponent(CFG.client+' \u2014 '+activeName())+
        '&body='+encodeURIComponent(url))+'">Email it</a>'+
    '</div></div>';
  el.classList.add('on');
  el.onclick=function(e){if(e.target===el)el.classList.remove('on');};
  var x=document.getElementById('spX');if(x)x.addEventListener('click',function(){el.classList.remove('on');});
  var inp=document.getElementById('spUrl');
  if(inp)inp.addEventListener('click',function(){inp.select();});
  var cp=document.getElementById('spCopy');
  if(cp)cp.addEventListener('click',function(){
    var done=false;
    try{if(inp){inp.select();done=document.execCommand('copy');}}catch(e){}
    if(!done)clipCopy(url);
    cp.textContent='\u2713 Copied';
    setTimeout(function(){cp.textContent='Copy link';},2200);});
  var nb=document.getElementById('spNative');
  if(nb)nb.addEventListener('click',function(){
    try{navigator.share({title:CFG.client+' \u2014 '+activeName(),url:url});}catch(e){clipCopy(url);}});
}
function shareList(){
  if(!Object.keys(CART).length){toast('Add a few pieces first');return;}
  var url=shareListUrl();
  notifyShared(url);
  var txt='Here is our team gear board — open it and everything is ready to order.';
  if(navigator.share&&matchMedia('(hover:none)').matches){
    navigator.share({title:CFG.client+' — team gear list',text:txt,url:url})
      .catch(function(e){if(!e||e.name!=='AbortError'){clipCopy(url);toast('Link copied — send it to your team');}});
    return;
  }
  clipCopy(url);toast('Link copied — send it to your team');
}
/* A curated list should not need a click to be received. The recipient used to land with an EMPTY
   kit -- "0 in your list" on the mobile bar -- while the list sat on screen behind two different
   buttons that called the same function. So we apply it on arrival. Never clobbers a kit the
   recipient already built, and is guarded by a signature so a refresh never re-adds something they
   deliberately removed. */
var SHAPPLIED=0;
function sharedSig(){return SHARED?SHARED.items.map(function(x){
  return x.k+'~'+x.qty+'~'+x.colour+'~'+x.fit;}).join('|'):'';}
function autoApplyShared(){
  if(!SHARED)return;
  var sig=sharedSig(),prev='';
  try{prev=localStorage.getItem('jdp_applied_sig')||'';}catch(e){}
  if(prev===sig)return;
  // A shared list arrives as its OWN List -- it never merges into whatever the recipient was
  // building, and it persists alongside their own lists exactly like every other one.
  var items={};
  SHARED.items.forEach(function(x){
    if(!BYKEY[x.k])return;
    var entry={qty:x.qty,colour:x.colour,decos:recCartDecos(x.k),fit:x.fit};
    if(x.sizes)entry.sizes=x.sizes;
    if(x.note)entry.note=x.note;
    items[ckey(x.k,x.fit)]=entry;});
  var added=Object.keys(items).length;
  if(!added)return;
  if(!LISTS)loadLists();
  var id=newListId();
  LISTS[id]={name:(SHARED.bname||(SHARED.from?(SHARED.from+'\u2019s board'):'Shared board')),
             items:items,updated:Date.now()};
  ALID=id;CART=items;persistLists();
  try{localStorage.setItem('jdp_applied_sig',sig);}catch(e){}
  /* The list is now SAVED against this store, so the long ?list=... URL has done its job. Strip it,
     so the address bar, a reload and a bookmark are all just the store's own clean URL. */
  try{if(window.history&&history.replaceState)history.replaceState({},'',location.pathname);}catch(e){}
  SHAPPLIED=added;
}
function sharedStripHtml(){
  var n=SHARED.items.length,who=SHARED.from||'';
  // They are free to add and remove -- so state what is actually in the kit, not what was sent.
  var still=SHARED.items.filter(function(x){return CART[ckey(x.k,x.fit)];}).length;
  var lost=SHARED.items.filter(function(x){return x.lost;});
  var sub=cartSubtotal();
  return '<div class="herooffer pkoffer">'+
      '<span class="hoic" aria-hidden="true">\u2713</span>'+
      '<span class="hotx"><b>'+(still<n
          ? (still+' of '+(who?(esc(who)+'\u2019s '):'')+n+' pieces are in your board')
          : (who?(esc(who)+'\u2019s '+n+' piece'+(n===1?' is':'s are')+' in your board')
               :(n+' piece'+(n===1?'':'s')+' \u2014 already in your board')))+'</b>'+
        '<i>'+(still<n
          ? 'You\u2019ve changed the list \u2014 that\u2019s fine, add or remove anything you like. '
          : ('Colours, sizes and quantities exactly as '+(who?esc(who):'they')+' set them. '))+
        'Review and get your exact quote \u2014 nothing is ordered yet.</i></span>'+
      '<button type="button" class="reccta hobtn" id="shReview">Review kit'+
        (sub?(' \u00b7 '+money(sub)):'')+' <span class="ar">\u2192</span></button>'+
    '</div>'+
    (lost.length?('<div class="shlost">'+lost.map(function(x){
        return esc(BYKEY[x.k].name)+' in '+esc(x.lost);}).join(', ')+
      ' \u2014 no longer available in that colour, so the closest one is shown. '+
      'Say the word on your quote and we\u2019ll source it.</div>'):'')+
    '<button type="button" class="herosecond" data-samp="">Or see &amp; feel them in person first '+
      '<span>we bring samples to you</span></button>';
}
function picksOf(){
  /* Store-level list wins; otherwise the GLOBAL list from the shared catalogue. That fallback is
     what removes the site visit from the loop -- one write to catalog.json curates all 376 stores at
     once, and the catalogue is fetched with cache:'no-cache', so it goes live without a version bump. */
  if(SHARED){
    return {by:SHARED.from,note:'',shared:true,
            keys:SHARED.items.map(function(x){return {k:x.k,why:''};})};
  }
  var p=CFG.picks||(CAT&&CAT.picks)||null;if(!p)return null;
  var keys=(p.keys||p.items||[]).map(function(x){
    return (typeof x==='string')?{k:x,why:''}:{k:x.k||x.key,why:x.why||''};
  }).filter(function(x){return x.k&&BYKEY[x.k];});
  if(!keys.length)return null;
  return {by:p.by||'',note:p.note||'',keys:keys};
}
function picksTitle(p){
  if(p.shared)return p.by?(esc(p.by)+' shared this list with you'):'A list was shared with you';
  return p.by?('The gear you picked out with '+esc(p.by)):'The gear you shortlisted';
}
function addPicks(){
  var p=picksOf();if(!p)return;
  var n=0;
  // A shared link carries the sender's quantities and colours -- restore those, not our defaults,
  // or the recipient has to redo the work the sender already did.
  var det={};if(SHARED)SHARED.items.forEach(function(x){det[x.k]=x;});
  p.keys.forEach(function(x){
    if(CART[x.k])return;
    var d=det[x.k];
    CART[x.k]={qty:(d&&d.qty)||moq(),colour:(d&&d.colour)||vmOf(x.k).colour,decos:recCartDecos(x.k)};
    n++;});
  saveCart();refreshCartUI();openBoard();
  toast(n?('Added '+n+' piece'+(n===1?'':'s')+' from your shortlist'):'Your shortlist is already in your board');
}
/* ---- Curator mode ----------------------------------------------------------------------------
   Steven was the bottleneck: every shortlist change meant describing a store and a list of products
   to someone else and waiting. This lets him build the list by clicking the actual products, in the
   actual store, and publish it himself -- globally for every store, or to one store when a site
   visit genuinely produced a bespoke list.

   Gated hard behind ?curate=1. A shopper never sees any of it. Publishing needs a GitHub token,
   entered once and kept in this browser only; without one the tray still works and hands over the
   JSON to paste, so the mode is never a dead end. */
var CURATE=false,CPICKS=[];
function curateOn(){return CURATE;}
function ghToken(){try{return localStorage.getItem('jdp_gh_token')||'';}catch(e){return '';}}
function setGhToken(t){try{t?localStorage.setItem('jdp_gh_token',t):localStorage.removeItem('jdp_gh_token');}catch(e){}}
function curateInit(){
  if(!/[?&]curate=1/.test(location.search))return;
  CURATE=true;
  var cur=picksOf();
  CPICKS=cur?cur.keys.map(function(x){return {k:x.k,why:x.why||''};}):[];
  CBASE=curKeys().join('|');
  document.body.classList.add('curating');
  var bar=document.createElement('div');bar.className='curbar';bar.id='curbar';
  document.body.appendChild(bar);
  renderCurBar();
}
function curHas(k){for(var i=0;i<CPICKS.length;i++)if(CPICKS[i].k===k)return i;return -1;}
function curToggle(k){
  var i=curHas(k);
  if(i>=0)CPICKS.splice(i,1); else CPICKS.push({k:k,why:''});
  renderCurBar();markCurCards();
}
function curMove(k,d){
  var i=curHas(k);if(i<0)return;var j=i+d;if(j<0||j>=CPICKS.length)return;
  var t=CPICKS[i];CPICKS[i]=CPICKS[j];CPICKS[j]=t;renderCurBar();
}
function markCurCards(){
  document.querySelectorAll('.mcard').forEach(function(c){
    var on=curHas(c.dataset.key)>=0;
    c.classList.toggle('curon',on);
    var b=c.querySelector('.curtog');if(b)b.textContent=on?'\u2713 On the list':'+ Shortlist';});
}
function curPayload(){
  return {by:(document.getElementById('curBy')||{}).value||'',
          note:(document.getElementById('curNote')||{}).value||'',
          keys:CPICKS.filter(function(x){return BYKEY[x.k];})};
}
function renderCurBar(){
  var el=document.getElementById('curbar');if(!el)return;
  var rows=CPICKS.map(function(x,i){
    var it=BYKEY[x.k]||{};
    return '<div class="currow"><span class="curn">'+(i+1)+'</span>'+
      '<span class="curnm">'+esc(it.name||x.k)+'</span>'+
      '<input class="curwhy" data-k="'+esc(x.k)+'" placeholder="why this one (optional)" value="'+esc(x.why||'')+'">'+
      '<button type="button" class="curbtn" data-up="'+esc(x.k)+'" aria-label="Move up">\u2191</button>'+
      '<button type="button" class="curbtn" data-down="'+esc(x.k)+'" aria-label="Move down">\u2193</button>'+
      '<button type="button" class="curbtn rm" data-rmk="'+esc(x.k)+'" aria-label="Remove">\u2715</button></div>';}).join('');
  var cur=picksOf();
  el.innerHTML='<div class="curin">'+
    '<div class="curhd"><b>Curator mode</b><span>'+CPICKS.length+' selected'+
      (CPICKS.length?(' \u00b7 '+CPICKS.filter(function(x){return (x.why||'').trim();}).length+
        '/'+CPICKS.length+' with a reason'):'')+
      (curDirty()?' \u00b7 unpublished':'')+'</span>'+
      '<button type="button" class="curx" id="curExit">Exit</button></div>'+
    (CPICKS.length?('<div class="currows">'+rows+'</div>'):'<div class="curempty">Tap <b>+ Shortlist</b> on any product to build the list.</div>')+
    '<div class="curwhich">'+
      (picksSource()==='store'
        ? 'This store has its <b>own</b> list \u2014 it overrides the global one here.'
        : picksSource()==='global'
        ? 'Showing the <b>global</b> list (this store has none of its own).'
        : 'No shortlist published yet.')+
      '<span class="curtok">Token: <b>'+(ghToken()?'saved':'not saved')+'</b>'+
        '<button type="button" class="curbtn" id="curTok">'+(ghToken()?'Replace':'Add')+'</button>'+
        (ghToken()?'<button type="button" class="curbtn rm" id="curTokX">Clear</button>':'')+
      '</span></div>'+
    '<div class="curmeta">'+
      '<input id="curBy" placeholder="Picked out with… (optional name)" value="'+esc((cur&&cur.by)||'')+'">'+
      '<input id="curNote" placeholder="One line of context (optional)" value="'+esc((cur&&cur.note)||'')+'">'+
    '</div>'+
    '<div class="curacts">'+
      '<button type="button" class="curpub" id="curPubAll">Publish to <b>all stores</b>'+
        curDelta('all')+'</button>'+
      '<button type="button" class="curpub alt" id="curPubOne">This store only'+
        curDelta('one')+'</button>'+
      '<button type="button" class="curpub warn" id="curClear">Clear list</button>'+
      '<span class="curstat" id="curStat"></span>'+
    '</div></div>';
  el.querySelectorAll('[data-up]').forEach(function(b){b.addEventListener('click',function(){curMove(b.dataset.up,-1);});});
  el.querySelectorAll('[data-down]').forEach(function(b){b.addEventListener('click',function(){curMove(b.dataset.down,1);});});
  el.querySelectorAll('[data-rmk]').forEach(function(b){b.addEventListener('click',function(){curToggle(b.dataset.rmk);});});
  el.querySelectorAll('.curwhy').forEach(function(inp){inp.addEventListener('input',function(){
    var i=curHas(inp.dataset.k);if(i>=0)CPICKS[i].why=inp.value;});});
  var ctk=document.getElementById('curTok');
  if(ctk)ctk.addEventListener('click',function(){
    var t=window.prompt('Paste a GitHub token (fine-grained, jdp-kits-deploy only, Contents read/write). '+
      'Stored in this browser only.');
    if(t&&t.trim()){setGhToken(t.trim());curStat('Token saved in this browser');renderCurBar();}});
  var ctx=document.getElementById('curTokX');
  if(ctx)ctx.addEventListener('click',function(){setGhToken('');curStat('Token cleared');renderCurBar();});
  document.getElementById('curExit').addEventListener('click',function(){
    if(curDirty()&&!window.confirm('This list has changes you have not published. Leave anyway?'))return;
    location.href=location.pathname;});
  document.getElementById('curPubAll').addEventListener('click',function(){curPublish('all');});
  document.getElementById('curPubOne').addEventListener('click',function(){curPublish('one');});
  document.getElementById('curClear').addEventListener('click',function(){CPICKS=[];renderCurBar();markCurCards();});
}
function curStat(msg,bad){
  var s2=document.getElementById('curStat');if(!s2)return;
  s2.textContent=msg;s2.className='curstat'+(bad?' bad':'');
}
function ghApi(method,path,body){
  var tok=ghToken();
  return fetch('https://api.github.com/repos/steven12h-1994/jdp-kits-deploy/'+path,{
    method:method,headers:{'Authorization':'Bearer '+tok,'Accept':'application/vnd.github+json'},
    body:body?JSON.stringify(body):undefined
  }).then(function(r){return r.json().then(function(j){return {ok:r.ok,status:r.status,body:j};});});
}
/* Base64 over UTF-8. The old escape()/unescape() pair is deprecated AND easy to get subtly wrong;
   the catalogue is full of characters like é and · , so a bad round-trip here would corrupt the
   shared product data for every store the moment someone publishes. */
function b64(str){
  var bytes=new TextEncoder().encode(str),bin='';
  for(var i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function unb64(str){
  var bin=atob(String(str).replace(/\s/g,'')),bytes=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
/* What is actually LIVE, so the curator can see what a publish will change.
   CPICKS is seeded from picksOf(), which prefers a store's OWN list over the global one. That means
   "publish to all" may be comparing against a completely different list than the one on screen --
   so the diff is always computed against the scope being published, never against what was loaded. */
var CBASE='';
function nameOf(k){return (BYKEY[k]||{}).name||k;}
function picksSource(){
  if(CFG&&CFG.picks)return 'store';
  if(CAT&&CAT.picks)return 'global';
  return 'none';}
function livePicks(scope){
  var p=(scope==='one')?((CFG&&CFG.picks)||null):((CAT&&CAT.picks)||null);
  if(!p)return [];
  return (p.keys||p.items||[]).map(function(x){
    return (typeof x==='string')?x:(x.k||x.key);}).filter(Boolean);}
function curKeys(){return CPICKS.map(function(x){return x.k;});}
function curDiff(scope){
  var live=livePicks(scope),now=curKeys();
  return {live:live,now:now,
    added:now.filter(function(k){return live.indexOf(k)<0;}),
    removed:live.filter(function(k){return now.indexOf(k)<0;}),
    reordered:live.length===now.length&&live.join('|')!==now.join('|')};}
function curDirty(){return curKeys().join('|')!==CBASE;}
function curDelta(scope){
  var d=curDiff(scope);
  if(!d.added.length&&!d.removed.length)return d.reordered?' (reordered)':'';
  return ' ('+(d.added.length?'+'+d.added.length:'')+
         (d.added.length&&d.removed.length?' ':'')+
         (d.removed.length?'\u2212'+d.removed.length:'')+')';}
/* Every publish here is a write to live customer-facing pages, and the fleet-wide one touches every
   store at once. It used to fire on a single click with NO confirmation -- and worse, an EMPTY list
   was explicitly allowed through for scope 'all', so one stray click silently deleted the global
   shortlist from all 378 stores. Both are now gated, and the destructive case is named plainly. */
function curConfirm(scope){
  var d=curDiff(scope),n=CPICKS.length;
  var lines=[];
  if(d.added.length)lines.push('ADDING: '+d.added.map(nameOf).join(', '));
  if(d.removed.length)lines.push('REMOVING: '+d.removed.map(nameOf).join(', '));
  if(scope==='all'){
    if(!n)return window.confirm('REMOVE the global shortlist from EVERY store?\n\n'+
      'No store without its own list will recommend anything until you publish a new one.');
    return window.confirm('Publish these '+n+' piece'+(n===1?'':'s')+' as the shortlist for EVERY store.\n\n'+
      (lines.length?lines.join('\n')+'\n\n':'')+'This changes live customer-facing pages. Continue?');
  }
  if(!n)return window.confirm('Remove this store\u2019s own shortlist?\n\n'+
    'It will fall back to the global list.');
  return true;   // one store, easily reverted -- no need to nag
}
function curPublish(scope){
  var p=curPayload();
  if(!p.keys.length&&scope==='one'&&picksSource()!=='store'){
    curStat('Nothing selected \u2014 and this store has no own list to remove',1);return;}
  if(!curConfirm(scope)){curStat('Cancelled');return;}
  var tok=ghToken();
  if(!tok){
    tok=window.prompt('Paste your GitHub token to publish (stored in this browser only)');
    if(!tok){curStat('Publish needs a token \u2014 or copy the JSON below',1);
      clipCopy(JSON.stringify(p,null,1));curStat('Copied the list to your clipboard instead');return;}
    setGhToken(tok.trim());
  }
  curStat('Publishing\u2026');
  var path=(scope==='all')?'contents/kits/_catalog/catalog.json'
                          :'contents/kits/'+SLUG+'/index.html';
  ghApi('GET',path+'?ref=main').then(function(r){
    if(!r.ok){throw new Error('read failed ('+r.status+')');}
    var sha=r.body.sha,txt=unb64(r.body.content),out;
    if(scope==='all'){
      var cat=JSON.parse(txt);
      if(p.keys.length)cat.picks=p; else delete cat.picks;
      out=JSON.stringify(cat);
    }else{
      var m=txt.match(/(<script id="?jdpcfg"?[^>]*>)([\s\S]*?)(<\/script>)/);
      if(!m)throw new Error('no config block in this store');
      var cfg=JSON.parse(m[2]);
      if(p.keys.length)cfg.picks=p; else delete cfg.picks;
      out=txt.slice(0,txt.indexOf(m[2]))+JSON.stringify(cfg)+txt.slice(txt.indexOf(m[2])+m[2].length);
    }
    return ghApi('PUT',path,{message:'picks: '+(scope==='all'?'global shortlist':SLUG+' shortlist')+
      ' ('+p.keys.length+' items)',content:b64(out),sha:sha,branch:'main'});
  }).then(function(r){
    if(!r.ok)throw new Error('write failed ('+r.status+')');
    curStat('Written \u2014 verifying\u2026');
    // "The PUT returned 200" is not the same as "the file says what I meant". Read it back.
    return ghApi('GET',path+'?ref=main&cb='+Date.now());
  }).then(function(r2){
    var got=null;
    try{
      var txt=unb64(r2.body.content);
      if(scope==='all'){got=(JSON.parse(txt).picks||{}).keys||[];}
      else{var m2=txt.match(/(<script id="?jdpcfg"?[^>]*>)([\s\S]*?)(<\/script>)/);
           got=((m2?JSON.parse(m2[2]):{}).picks||{}).keys||[];}
    }catch(e){got=null;}
    var want=p.keys.map(function(x){return x.k;}).join('|');
    var have=got?got.map(function(x){return x.k||x;}).join('|'):null;
    if(have===want){
      CBASE=curKeys().join('|');
      curStat((scope==='all'?'Verified for every store':'Verified for this store')+
        ' \u2014 live on the site within ~5 min');
      renderCurBar();
    }else{
      curStat('Write reported success but the read-back does not match \u2014 do not rely on it yet',1);
    }
  }).catch(function(e){
    if(/401|403/.test(String(e.message)))setGhToken('');
    curStat(String(e.message||e),1);});
}
function curToggleHtml(key){
  if(!CURATE)return '';
  return '<button type="button" class="curtog" data-curk="'+esc(key)+'">+ Shortlist</button>';
}
/* RETIRED. Curated recommendations are a starter List now (see loadLists), not a page section.
   Kept as a no-op rather than deleted so a future edit cannot accidentally revive the competing
   surface by re-adding a call site. */
function picksSectionHtml(){
  return '';
  /* eslint-disable no-unreachable */
  var p=picksOf();if(!p)return '';
  var cards=p.keys.map(function(x){
    var why=x.why?('<div class="pkwhy">'+esc(x.why)+'</div>'):'';
    return '<div class="pkwrap">'+menuCard(x.k)+why+'</div>';}).join('');
  return '<section class="picks"><div class="w picksin">'+
    '<div class="pkhd"><div><div class="eyb">Your shortlist</div>'+
      '<h2>'+picksTitle(p)+'</h2>'+
      (p.note?('<p class="pknote">'+esc(p.note)+'</p>'):'')+'</div>'+
      '<button type="button" class="pkadd" id="addPicks">Add all '+p.keys.length+
        ' <span>to my list</span></button></div>'+
    '<div class="menu pkmenu" id="pkgrid">'+cards+'</div></div></section>';
}
function essKeysAll(){
  var out=[];
  for(var k in BYKEY){if(BYKEY[k]&&BYKEY[k].ess)out.push(k);}
  out.sort(function(a,b){return (BYKEY[a].ess||99)-(BYKEY[b].ess||99);});
  return out;
}
function recKeysAll(){var order=CFG.order||{},cats=['office','field','premium','bags'],out=[];
  cats.forEach(function(c){(order[c]||[]).forEach(function(k){if(BYKEY[k]&&BYKEY[k].rec&&out.indexOf(k)<0)out.push(k);});});
  if(!out.length)out=(order.office||[]).filter(function(k){return BYKEY[k];}).slice(0,4);
  return out;}
function addRecommended(){
  var keys=essKeysAll(),n=0;
  if(!keys.length)keys=recKeysAll();
  keys.forEach(function(k){if(CART[k]||!BYKEY[k])return;
    CART[k]={qty:moq(),colour:vmOf(k).colour,decos:recCartDecos(k)};n++;});
  saveCart();refreshCartUI();openBoard();
  toast(n?('Added '+n+' essential'+(n===1?'':'s')+' to '+activeName()):(activeName()+' already has the essentials'));
}

/* ---------- cart ---------- */
function cartCount(){return Object.keys(CART).length;}
function cartSubtotal(){var t=0;Object.keys(CART).forEach(function(k){var it=BYKEY[bkey(k)];if(!it)return;var c=CART[k];
  if(it.layer==='promo'){var q=promoQuote(it,c);t+=q.goods+q.decoRun;}   // product + decoration (setup shown separately)
  else t+=unitPrice(k,c.decos,tierQty(k))*c.qty;});return t;}
function setupBreakdown(){var r=CFG.rates||{},s=r.setup||{},seen={},out=[];
  Object.keys(CART).forEach(function(k){var it=BYKEY[bkey(k)];if(!it)return;(CART[k].decos||[]).forEach(function(d){if(!d.on)return;
    var key=setupKey(d);if(seen[key])return;seen[key]=1;
    var L=logoOf(d.lg),p=placeOf(it,d.pl),plab=p?p.label:d.pl,lname=(L&&L.label)||'Logo',amt,lab;
    if(d.method==='screen'){var c=d.colours||1;amt=(s.screen||0)*c;lab=lname+' · '+plab+' · screen ('+c+'-colour)';}
    else if(d.method==='heat_transfer'){amt=s.heat_transfer||0;lab=lname+' · '+plab+' · heat-transfer artwork';}
    else{amt=s.embroidery||0;lab=lname+' · '+plab+' · embroidery digitizing';}
    out.push({label:lab,amount:Math.round(amt*100)/100});});});
  Object.keys(CART).forEach(function(k){var it=BYKEY[bkey(k)];if(!it||it.layer!=='promo')return;var q=promoQuote(it,CART[k]);
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
  // The single most common confusion was "which list did that just go into?". Name it, always.
  /* Removing the header removed the one place that named the active board, so on Explore there was
     nothing telling you where a heart would land. The bar's Boards button now carries it. */
  var tbl=document.getElementById('tbBoardsLbl');
  if(tbl){var nm=activeName();
    tbl.textContent=(nm.length>15?(nm.slice(0,14)+'\u2026'):nm)+' \u00b7 '+cartCount();}
  var rn=document.getElementById('railN');
  if(rn){var bn=listIds().length;rn.textContent=bn>1?bn:'';rn.style.display=bn>1?'':'none';}
  var cl=document.getElementById('cartLbl');
  if(cl){var nm=activeName();cl.textContent=nm.length>17?(nm.slice(0,16)+'\u2026'):nm;}
  var bar=document.getElementById('cbar');if(bar)bar.classList.toggle('on',n>0&&!CFG.demo);
  var bn=document.getElementById('cbarN');if(bn)bn.textContent=n;
  var bp=document.getElementById('cbarP');if(bp)bp.textContent=money0(sub);
  document.querySelectorAll('.mcard').forEach(function(card){var k=card.dataset.key;
    var qn=cartQtyOf(k),on=qn>0;card.classList.toggle('inkit',on);
    var b=card.querySelector('.madd');
    if(b){b.classList.toggle('has',on);
      b.innerHTML=on?(heartSvg(1)+'<b>'+qn+'</b>'):heartSvg(0);
      b.setAttribute('aria-label',on?(qn+' in your board'):'Save to my board');}});
}
function openCart(){renderCart();document.getElementById('ov').classList.add('on');document.getElementById('cart').classList.add('on');document.body.style.overflow='hidden';}
function cartLineHtml(k){var it=BYKEY[bkey(k)];if(!it)return '';var c=CART[k];
  // With both cuts in the kit the two lines are otherwise near-identical, so label the mens one too.
  var _both=!!(CART[bkey(k)]&&CART[bkey(k)+'#w']);
    if(it.layer==='promo'){var pq=promoQuote(it,c);var pcol=colInList(it.cols,c.colour)||it.cols[0]||{};
      var pline=pq.goods+pq.decoRun;var uP=(pq.unit==='dozen'?'dozen':'pc');
      var psub2=pq.decoquote?(esc(c.colour||'')+' · logo confirmed on quote'):(esc(c.colour||'')+' · '+esc(pq.method.n)+(pq.locs>1?' · 2 spots':'')+' · +'+money(pq.setup)+' setup');
      return '<div class="ci" data-key="'+k+'"><div class="t" style="background-image:url('+gurl(pcol.front)+')"></div>'+
        '<div class="d"><h4>'+esc(it.name)+'</h4><div class="sub">'+psub2+'</div>'+
        '<div class="row"><button class="editln" data-edit="'+k+'">'+pq.qty+' '+uP+' · '+money(pq.perPiece)+'/'+uP+' ✎</button><div class="lp">'+money(pline)+'</div></div></div>'+
        '<button class="rm" data-rm="'+k+'" aria-label="Remove">✕</button></div>';}
    var col=colInList(curColsOf(it,c.fit),c.colour);
    var unit=unitPrice(k,c.decos,tierQty(k));var szsum=sizesSummary(c);var nud=savingsNudge(k,c.decos,tierQty(k));
    var _ftl=(_both&&c.fit!=='womens')?'Men\u2019s':fitTag(it,c);
    var fitb=_ftl?'<span class="fitbadge">'+esc(_ftl)+'</span> ':'';
    var ctrl='<button class="editln" data-edit="'+k+'">'+c.qty+' pcs · '+(c.sizes?'by size':'add sizes')+' ✎</button>';
    return '<div class="ci" data-key="'+k+'"><div class="t" style="background-image:url('+gurl(col.front)+')"></div>'+
      '<div class="d"><h4>'+esc(it.name)+'</h4><div class="sub">'+fitb+esc(c.colour)+' · '+esc(decoSummary(it,c))+(szsum?'<br><span class="szln">Sizes: '+esc(szsum)+'</span>':'')+'</div>'+
      (nud?'<div class="cinudge">＋'+nud.need+' to reach '+nud.tier+'+ · save '+nud.pct+'%</div>':'')+
      '<div class="row">'+ctrl+'<div class="lp">'+money(unit*c.qty)+'</div></div></div>'+
      '<button class="rm" data-rm="'+k+'" aria-label="Remove">✕</button></div>';}
/* ---------- BOARDS: the presentation surface ---------------------------------------------------
   A list in a narrow side panel is a receipt. What actually gets shown to an enterprise buyer is a
   BOARD -- Pinterest's model, which Steven is right about: large product imagery, the detail that
   matters beside each piece, and a note the buyer's own team can read. So the board opens full
   screen, reuses every existing pricing/quote path, and each board is deep-linkable.
   The side panel is kept ONLY for the quote steps, which already work. */
function boardUrl(id){return location.origin+location.pathname+'?board='+encodeURIComponent(id||ALID);}
function noteClean(s){return String(s||'').replace(/[~|]/g,' ').replace(/\s+/g,' ').trim().slice(0,160);}
function setNote(ck,v){
  if(!CART[ck])return;
  var t=noteClean(v);
  if(t)CART[ck].note=t;else delete CART[ck].note;
  saveCart();}
function boardTotals(){
  var n=0;Object.keys(CART).forEach(function(k){
    var it=BYKEY[bkey(k)];if(!it)return;
    n+=(it.layer==='promo')?promoQuote(it,CART[k]).qty:(CART[k].qty||0);});
  return {pieces:n,lines:Object.keys(CART).length,sub:cartSubtotal(),setup:cartSetup()};}
/* ---------- size entry, ON the board -----------------------------------------------------------
   Headcount is decided on the board -- that is the surface someone reviews with their team. But
   changing it meant tapping Edit, waiting for the product sheet, adjusting, then re-saving to the
   list: four steps to change one number. So the size split is editable in place, it writes on every
   keystroke, and the line total, piece count and board estimate update live.
   Deliberately NOT re-rendering the card on input -- that would blow away focus mid-typing. The few
   affected numbers are patched in place instead. */
function sizesForFit(fit){return (fit==='womens')?WOMENS_SIZES:MENS_SIZES;}
function bSizeRowHtml(ck){
  var c=CART[ck];if(!c)return '';
  var it=BYKEY[bkey(ck)];
  if(!it||it.layer==='promo')return '';          // promo carries its own quantity model
  var szs=sizesForFit(c.fit),tot=sizeSum(c.sizes)||c.qty||0;
  return '<div class="bszed">'+
    '<div class="bszhd"><span>How many of each size?</span>'+
      '<i data-sztot="'+esc(ck)+'">'+tot+' pcs</i></div>'+
    '<div class="bszcells">'+szs.map(function(s){
        var v=(c.sizes&&c.sizes[s])||0;
        return '<label class="bszc'+(v?' on':'')+'"><span>'+esc(s)+'</span>'+
          '<input type="number" inputmode="numeric" min="0" step="1" value="'+v+'" '+
          'data-szk="'+esc(ck)+'" data-szs="'+esc(s)+'" aria-label="'+esc(s)+' quantity"></label>';
      }).join('')+'</div>'+
    /* A quick-added line carries a quantity but no split, so every cell reads 0 while the line says
       "12 pcs" -- which looks like a bug. Say plainly that the total is set and the split is
       optional, instead of leaving the two numbers contradicting each other. */
    (function(){
      var split=sizeSum(c.sizes);
      if(tot>0&&tot<moq())
        return '<div class="bszmoq on" data-szmoq="'+esc(ck)+'">Add '+(moq()-tot)+
          ' more to reach the '+moq()+'-piece minimum</div>';
      if(!split&&tot>0)
        return '<div class="bszmoq soft on" data-szmoq="'+esc(ck)+'">'+tot+
          ' pcs total \u2014 add your split above whenever you know it</div>';
      return '<div class="bszmoq" data-szmoq="'+esc(ck)+'"></div>';
    })()+
    '</div>';
}
function bSetSize(ck,size,val){
  var c=CART[ck];if(!c)return;
  var n=Math.max(0,Math.min(100000,parseInt(val,10)||0));
  c.sizes=c.sizes||{};
  if(n)c.sizes[size]=n;else delete c.sizes[size];
  if(!Object.keys(c.sizes).length)delete c.sizes;
  var tot=sizeSum(c.sizes);
  if(tot>0)c.qty=tot;                            // the split IS the quantity
  saveCart();
  bRefreshLine(ck);
}
function bRefreshLine(ck){
  var c=CART[ck];if(!c)return;
  var q=sizeSum(c.sizes)||c.qty||0;
  var unit=unitPrice(ck,c.decos,tierQty(ck)),line=unit*q;
  var t=document.querySelector('[data-sztot="'+ck+'"]');
  if(t)t.textContent=q+' pcs';
  var card=document.querySelector('.bcard[data-bk="'+ck+'"]');
  if(card){
    var pb=card.querySelector('.bprice b');if(pb)pb.textContent=money(line);
    var ps=card.querySelector('.bprice span');
    if(ps)ps.textContent=q+' pcs \u00b7 '+money(unit)+'/pc';
  }
  var mo=document.querySelector('[data-szmoq="'+ck+'"]');
  if(mo){
    var need=moq()-q,split=sizeSum(c.sizes);
    if(q>0&&need>0){mo.textContent='Add '+need+' more to reach the '+moq()+'-piece minimum';
      mo.className='bszmoq on';}
    else if(!split&&q>0){mo.textContent=q+' pcs total \u2014 add your split above whenever you know it';
      mo.className='bszmoq soft on';}
    else{mo.textContent='';mo.className='bszmoq';}
  }
  refreshProposal();
  var hd=document.querySelector('.bsum');
  if(hd){var tt=boardTotals();
    hd.textContent=tt.lines+' item'+(tt.lines===1?'':'s')+' \u00b7 '+tt.pieces+
      ' pieces \u00b7 est. '+money(tt.sub)+(tt.setup>0?(' + '+money(tt.setup)+' setup'):'');}
  refreshCartUI();
}
function boardCardHtml(ck){
  var it=BYKEY[bkey(ck)];if(!it)return '';
  var c=CART[ck];
  var isPromo=it.layer==='promo';
  var cols=isPromo?(it.cols||[]):curColsOf(it,c.fit);
  var col=colInList(cols,c.colour)||cols[0]||{};
  /* colInList falls back to cols[0] when the requested colour is not in this run, so c.colour and
     the photo can disagree -- the preview rendered an acid-green polo captioned "Navy". A board is
     shown to a buyer, so the caption is taken from the colour we ACTUALLY rendered, never from the
     requested one, and a genuine mismatch is surfaced rather than hidden. */
  var cname=(col&&col.name)||c.colour||'';
  var cmiss=(c.colour&&col&&col.name&&col.name!==c.colour)?c.colour:'';
  var q,line,unit,_tq=0;
  if(isPromo){var pq=promoQuote(it,c);q=pq.qty;line=pq.goods+pq.decoRun;unit=pq.perPiece;}
  else{q=c.qty||0;_tq=tierQty(ck);unit=unitPrice(ck,c.decos,_tq);line=unit*q;}
  var both=!!(CART[bkey(ck)]&&CART[bkey(ck)+'#w']);
  var ftl=(both&&c.fit!=='womens')?'Men\u2019s':fitTag(it,c);
  var szs=sizesSummary(c);
  // Prefer the STANDARDISED decoration label from the catalogue -- it is what actually gets
  // produced and quoted, which is the language a board shown to a buyer should be in.
  var deco=isPromo?'':((it.std&&it.std.label)?it.std.label:decoSummary(it,c));
  /* THE BOARD IS THE THING SENT TO THE ACCOUNT. It was rendering the bare supplier photo, so a
     buyer opened a page of unbranded garments -- the single most important thing to show is their
     own logo on the gear, composited at the exact placement that will be produced. overlayHtml
     returns the garment plus the positioned logo layer; promo items have no placement model and
     keep the plain photo. */
  var _o=null;
  if(!isPromo){
    var _pl=(c.fit==='womens'&&it.wplaces&&it.wplaces.length)?it.wplaces:it.places;
    try{_o=overlayHtml(it,{decos:(c.decos||[])},c.colour,'front',cols,_pl);}catch(e){_o=null;}
  }
  var _stage=_o
    ? ('<div class="bstage"><img class="g" src="'+_o.g+'" alt="'+esc(it.name)+
       '" loading="lazy" decoding="async">'+_o.lg+'</div>')
    : ('<img class="bimg" src="'+gurl(col.front)+'" alt="'+esc(it.name)+'" loading="lazy">');
  return '<article class="bcard" data-bk="'+esc(ck)+'">'+
    '<div class="bimgwrap">'+_stage+
      (ftl?'<span class="bfit">'+esc(ftl)+'</span>':'')+'</div>'+
    '<div class="bbody">'+
      '<h3 class="bname">'+esc(it.name)+'</h3>'+
      '<div class="bmeta">'+
        (col.rgb?'<span class="bdot" style="background:'+esc(col.rgb)+'"></span>':'')+
        '<span>'+esc(cname)+'</span>'+
        (deco?'<span class="bsep">\u00b7</span><span>'+esc(deco)+'</span>':'')+
      '</div>'+
      (cmiss?('<div class="bmiss">'+esc(cmiss)+' is no longer available \u2014 showing '+
        esc(cname)+'. Tell us on the quote and we\u2019ll source it.</div>'):'')+
      bSizeRowHtml(ck)+
      /* When both cuts of a garment are on the board they share one volume tier, so the men's line
         can be 40 pieces yet priced at a 240-piece rate. Without saying so, the number looks wrong
         -- state the basis explicitly rather than leaving the buyer to reconcile it. */
      '<div class="bprice"><b>'+money(line)+'</b>'+
        '<span>'+q+' pcs \u00b7 '+money(unit)+'/pc</span></div>'+
      ((_tq>q)?('<div class="btier">Priced at your '+_tq+
        '-piece total for this garment (both cuts)</div>'):'')+
      '<label class="bnote"><span>Note</span>'+
        '<textarea data-note="'+esc(ck)+'" rows="2" maxlength="160" '+
        'placeholder="Why this piece \u2014 who it\u2019s for, anything to flag\u2026">'+
        esc(c.note||'')+'</textarea></label>'+
      '<div class="bacts">'+
        '<button type="button" class="bbtn" data-bedit="'+esc(ck)+'">Edit</button>'+
        '<button type="button" class="bbtn bbtnrm" data-brm="'+esc(ck)+'">Remove</button>'+
      '</div>'+
    '</div></article>';
}
/* ---------- the board as a proposal ------------------------------------------------------------
   This page goes to accounts worth six figures, and the next step is explicit: the buyer enters
   quantities and sizes, then we issue a proforma invoice. So the board has to do three things a
   grid of cards does not -- present the money with confidence, make it obvious what still needs
   filling in, and name the actual next step. */
function boardSizing(){
  var total=0,sized=0,missing=[];
  Object.keys(CART).forEach(function(ck){
    var it=BYKEY[bkey(ck)];if(!it||it.layer==='promo')return;
    total++;
    if(sizeSum(CART[ck].sizes)>0)sized++; else missing.push(ck);});
  return {total:total,sized:sized,missing:missing};
}
/* The proposal block holds no inputs, so it can be re-rendered wholesale on every keystroke without
   disturbing the size cell being typed into -- which is why the rest of the card is patched in place
   but this is not. Without it the summary froze at "0 of 3 styles sized" while the buyer filled the
   grid in, and the CTA never unlocked. */
function refreshProposal(){
  var host=document.querySelector('#board .bprop');
  if(!host)return;
  var tmp=document.createElement('div');
  tmp.innerHTML=boardSummaryHtml();
  var fresh=tmp.firstChild;
  host.parentNode.replaceChild(fresh,host);
  wireProposal();
  markSync(SYNC||'saved');
}
function wireProposal(){
  var el=document.getElementById('board');if(!el)return;
  var bf=document.getElementById('bFinish');
  if(bf)bf.addEventListener('click',function(){
    var s=boardSizing();if(!s.missing.length)return;
    var card=el.querySelector('.bcard[data-bk="'+s.missing[0]+'"]');
    if(card){card.scrollIntoView({behavior:'smooth',block:'center'});
      card.classList.add('needsize');
      setTimeout(function(){var i=card.querySelector('.bszc input');
        if(i){i.focus();try{i.select();}catch(e){}}},420);
      setTimeout(function(){card.classList.remove('needsize');},2600);}});
  var bp=document.getElementById('bProforma');
  if(bp)bp.addEventListener('click',function(){
    closeBoard();
    document.getElementById('ov').classList.add('on');
    document.getElementById('cart').classList.add('on');
    document.body.style.overflow='hidden';
    openCheckout();});
}
function boardSummaryHtml(){
  var t=boardTotals(),s=boardSizing();
  var allIn=t.sub+t.setup;
  var ready=s.total>0&&s.missing.length===0;
  return '<section class="bprop">'+
    '<div class="bpgrid">'+
      '<div class="bpcell"><i>Pieces</i><b>'+t.pieces+'</b></div>'+
      '<div class="bpcell"><i>Styles</i><b>'+t.lines+'</b></div>'+
      '<div class="bpcell"><i>Apparel</i><b>'+money(t.sub)+'</b></div>'+
      (t.setup>0?'<div class="bpcell"><i>One-time setup</i><b>'+money(t.setup)+'</b></div>':'')+
      '<div class="bpcell tot"><i>Estimated total</i><b>'+money(allIn)+'</b></div>'+
    '</div>'+
    '<div class="bpnext">'+
      '<div class="bpstep">'+
        '<span class="bpsn'+(ready?' done':'')+'">'+(ready?'\u2713':'1')+'</span>'+
        '<span class="bpst"><b>Quantities &amp; sizes</b>'+
          '<i>'+(ready
            ? ('All '+s.total+' style'+(s.total===1?'':'s')+' sized')
            : (s.sized+' of '+s.total+' styles sized \u2014 '+s.missing.length+' still to go'))+'</i></span>'+
      '</div>'+
      '<div class="bpstep"><span class="bpsn">2</span>'+
        '<span class="bpst"><b>Proforma invoice</b>'+
          '<i>Issued against these quantities. Nothing is ordered until you approve it.</i></span></div>'+
      (ready
        ? '<button type="button" class="bpcta" id="bProforma">Request proforma invoice <span class="ar">\u2192</span></button>'
        : '<button type="button" class="bpcta soft" id="bFinish">'+s.missing.length+' style'+(s.missing.length===1?'':'s')+
            ' need sizes <span class="ar">\u2193</span></button>')+
    '</div></section>';
}
function renderBoard(){
  var el=document.getElementById('board');if(!el)return;
  var t=boardTotals();
  var ids=listIds();
  var chips=ids.map(function(id){
    return '<button type="button" class="bchip'+(id===ALID?' on':'')+'" data-bsw="'+esc(id)+'">'+
      esc(listName(id))+' <i>'+listLen(id)+'</i>'+(isTemplate(id)?'<em>template</em>':'')+'</button>';}).join('');
  var cards=Object.keys(CART).map(boardCardHtml).join('');
  var tmpl=isTemplate(ALID)?('<div class="btmpl"><b>This is our starter template.</b> Anything you save '+
      'goes to your own board \u2014 this one stays as it is.'+
      '<button type="button" class="tmplcopy" id="bTmplCopy">Copy these '+t.lines+' into my board</button></div>'):'';
  el.innerHTML='<div class="bwrap">'+
    '<header class="bhd"><div class="bhdin">'+
      '<div class="bhdL">'+
        '<div class="beyb">'+esc(CFG.client)+' \u00b7 board</div>'+
        '<h1 class="btitle edit" id="bTitle" title="Click to rename" '+
          'role="button" tabindex="0">'+esc(activeName())+'</h1>'+
        '<div class="bsync" id="bsync"></div>'+
        '<div class="bsum">'+(t.lines?(t.lines+' item'+(t.lines===1?'':'s')+' \u00b7 '+t.pieces+
          ' pieces \u00b7 est. '+money(t.sub)+(t.setup>0?(' + '+money(t.setup)+' setup'):'')):'Nothing saved yet')+'</div>'+
        /* Whoever this link is forwarded to arrives with no context. Three facts, stated once. */
      '</div>'+
      '<div class="bhdR">'+
        '<button type="button" class="bghost" id="bAll">\u2039 All boards</button>'+
        '<button type="button" class="bghost" id="bMore">+ Add more gear</button>'+

        '<button type="button" class="bghost bshare" id="bShare">Share board \u2197</button>'+
        (t.lines?'<button type="button" class="bghost" id="bPrint">Print / PDF</button>':'')+
        '<button type="button" class="bx" id="bClose" aria-label="Close">\u2715</button>'+
      '</div>'+
    '</div>'+
    '<div class="bchips">'+chips+'</div></header>'+
    tmpl+
    (t.lines?boardSummaryHtml():'')+
    (t.lines?('<div class="bgrid">'+cards+'</div>')
      :('<div class="bempty"><b>This board is empty</b><span>Tap the heart on any product to save it here.</span>'+
        ((starterId()&&starterId()!==ALID)?('<button type="button" class="bcta" data-bsw="'+esc(starterId())+'">'+
          'Open our starter board \u00b7 '+listLen(starterId())+' pieces</button>'):'')+'</div>'))+
    /* Destructive action, kept deliberately away from the four primary ones in the header. */
    '<div class="bfoot"><button type="button" class="bdel" id="bDel">Delete this board</button></div>'+
    '</div>';
  wireBoard();
}
function wireBoard(){
  var el=document.getElementById('board');if(!el)return;
  el.querySelectorAll('[data-bsw]').forEach(function(b){b.addEventListener('click',function(){
    switchList(b.dataset.bsw);renderBoard();});});
  /* Only the small Edit button opened a product; clicking the garment, its name or its price -- the
     obvious targets -- did nothing at all. The whole card is now the target, minus the controls
     that live on it. */
  el.querySelectorAll('.bcard').forEach(function(card){
    card.addEventListener('click',function(e){
      if(e.target.closest('button,input,textarea,label,a,select'))return;
      openSheet(card.dataset.bk);});});
  el.querySelectorAll('[data-szk]').forEach(function(inp){
    var apply=function(){
      bSetSize(inp.dataset.szk,inp.dataset.szs,inp.value);
      var cell=inp.parentNode;
      if(cell&&cell.classList)cell.classList.toggle('on',(parseInt(inp.value,10)||0)>0);};
    inp.addEventListener('input',apply);
    inp.addEventListener('change',apply);
    // Select-on-focus: tapping a cell that reads 0 and typing 8 should give 8, not 08.
    inp.addEventListener('focus',function(){try{inp.select();}catch(e){}});});
  el.querySelectorAll('[data-note]').forEach(function(t){
    var save=function(){setNote(t.dataset.note,t.value);};
    t.addEventListener('change',save);t.addEventListener('blur',save);});
  el.querySelectorAll('[data-bedit]').forEach(function(b){b.addEventListener('click',function(){
    /* The board STAYS OPEN underneath. It used to be closed first because the product sheet sits at
       z-index 70 and the board at 1400, so the sheet would have opened behind it -- which meant
       closing the sheet dumped you on Explore instead of back on the board you were editing. The
       sheet is now layered above the board and the board is simply revealed again. */
    openSheet(b.dataset.bedit);});});
  el.querySelectorAll('[data-brm]').forEach(function(b){b.addEventListener('click',function(){
    delete CART[b.dataset.brm];saveCart();refreshCartUI();renderBoard();});});
  var x=document.getElementById('bClose');if(x)x.addEventListener('click',closeBoard);
  var ba=document.getElementById('bAll');if(ba)ba.addEventListener('click',function(){
    closeBoard();openBoards();});
  /* The board is a review surface; the natural next move is "add another piece". Without this you
     have to close the board and find your way back to the catalogue yourself. */
  wireProposal();
  var bd=document.getElementById('bDel');
  if(bd)bd.addEventListener('click',function(){
    var nm=activeName(),n=listLen(ALID),last=listIds().length<2;
    if(!window.confirm('Delete \u201c'+nm+'\u201d'+
        (n?(' and the '+n+' item'+(n===1?'':'s')+' in it'):'')+'?\n\nThis cannot be undone.'))return;
    /* Local removal alone was pointless: syncBoardsFromServer() pulled the board straight back on
       the next reconcile. Delete server-side FIRST, and only then locally -- and wait for it, so the
       boards index cannot re-list what we just removed. */
    var sl=(LISTS[ALID]||{}).slug;
    var finish=function(){
      deleteList(ALID);refreshCartUI();
      if(last){renderBoard();toast('\u201c'+nm+'\u201d emptied');}
      else{closeBoard();openBoards();toast('\u201c'+nm+'\u201d deleted');}};
    if(sl){
      fetch(boardsApi()+'?kit='+encodeURIComponent(SLUG)+'&b='+encodeURIComponent(sl)+'&delete=1',
        {method:'POST'}).then(finish,finish);
    }else finish();});
  var bm=document.getElementById('bMore');if(bm)bm.addEventListener('click',function(){
    closeBoard();closeBoards();setRail('explore');
    var g=document.getElementById('gridhd')||document.getElementById('grid');
    if(g)g.scrollIntoView({behavior:'smooth',block:'start'});});
  var bt=document.getElementById('bTitle');
  if(bt){var ren=function(){
      var n=window.prompt('Rename this board',activeName());
      if(n===null)return;renameList(ALID,n);renderBoard();refreshCartUI();
      try{if(history.replaceState)history.replaceState({},'',shareListUrl());}catch(e){}};
    bt.addEventListener('click',ren);
    bt.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();ren();}});}
  var sh=document.getElementById('bShare');if(sh)sh.addEventListener('click',openSharePanel);
  var pr=document.getElementById('bPrint');
  if(pr)pr.addEventListener('click',function(){try{window.print();}catch(e){}});
  var tc=document.getElementById('bTmplCopy');
  if(tc)tc.addEventListener('click',function(){copyStarterToMine();renderBoard();});
}
function openBoard(id){
  /* A board id is local to the browser that made it. openBoard used to write ?board=<id> into the
     address bar, so copying that URL -- the obvious thing to do -- handed someone a link that
     resolves to nothing on their machine, or worse, silently showed them their OWN board under the
     sender's board name. The address bar is left clean and the Share button (which encodes the
     actual contents) is the one way to hand a board to someone. */
  if(id&&(!LISTS||!LISTS[id])){openBoards();toast('That board isn\u2019t on this device \u2014 here are your boards');return;}
  if(id&&LISTS&&LISTS[id])switchList(id);
  var el=document.getElementById('board');
  if(!el){el=document.createElement('div');el.id='board';el.className='boardov';document.body.appendChild(el);}
  renderBoard();
  el.classList.add('on');document.body.style.overflow='hidden';
  setRail('boards');
  // So copying the address bar shares the board -- the thing everyone tries first.
  try{if(history.replaceState&&Object.keys(CART).length)
    history.replaceState({},'',shareListUrl());}catch(e){}
}
function closeBoard(){
  var el=document.getElementById('board');if(el)el.classList.remove('on');
  document.body.style.overflow='';
  try{if(history.replaceState)history.replaceState({},'',location.pathname);}catch(e){}
}
/* Pinterest's actual gesture: choose the board. Shown only when there is a real choice -- with one
   personal board a picker would be pure friction, so it saves straight away. */
function openSavePicker(key){
  var personal=listIds().filter(function(id){return !isTemplate(id);});
  if(personal.length<2){quickAdd(key);return;}
  var el=document.getElementById('bpick');
  if(!el){el=document.createElement('div');el.id='bpick';el.className='bpickov';document.body.appendChild(el);}
  el.innerHTML='<div class="bpick"><div class="bpickhd">Save to board'+
      '<button type="button" class="bpx" id="bpX" aria-label="Close">\u2715</button></div>'+
    personal.map(function(id){
      return '<button type="button" class="bprow" data-bpid="'+esc(id)+'">'+
        '<span>'+esc(listName(id))+'</span><i>'+listLen(id)+'</i></button>';}).join('')+
    '<button type="button" class="bprow new" id="bpNew">+ New board</button></div>';
  el.classList.add('on');
  el.onclick=function(e){if(e.target===el)el.classList.remove('on');};
  var x=document.getElementById('bpX');if(x)x.addEventListener('click',function(){el.classList.remove('on');});
  el.querySelectorAll('[data-bpid]').forEach(function(b){b.addEventListener('click',function(){
    switchList(b.dataset.bpid);quickAdd(key);el.classList.remove('on');});});
  var nn=document.getElementById('bpNew');
  if(nn)nn.addEventListener('click',function(){
    var n=window.prompt('Name this board','Board '+(listIds().length+1));
    if(n===null)return;newList(n);quickAdd(key);el.classList.remove('on');});
}
/* ---------- EXPLORE / YOUR BOARDS: the two things this store does -------------------------------
   The store had accumulated a header of brand + cart + hero + trust chips + category panel + fit bar
   + colour bar + search + sub-chips + filters, all above the first product. Steven's reference is
   Pinterest, and its whole information architecture is two destinations in a quiet icon rail:
   Explore, and Your boards. Everything else is subordinate to those.
   So: a fixed rail on desktop, a bottom tab bar on phones, and a real BOARDS INDEX -- board cards
   with a collage of their own product photography, the way Pinterest shows a board. */
function boardValue(id){
  var L=(LISTS||{})[id];if(!L)return {pieces:0,sub:0};
  var items=L.items||{},pieces=0,sub=0;
  Object.keys(items).forEach(function(ck){
    var it=BYKEY[bkey(ck)];if(!it)return;
    var c=items[ck];
    if(it.layer==='promo'){var q=promoQuote(it,c);pieces+=q.qty;sub+=q.goods+q.decoRun;}
    else{var qq=c.qty||0;pieces+=qq;sub+=unitPrice(ck,c.decos,tierQty(ck))*qq;}});
  return {pieces:pieces,sub:sub};
}
function boardThumbs(id,n){
  var L=(LISTS||{})[id];if(!L)return [];
  var out=[];
  Object.keys(L.items||{}).slice(0,n||4).forEach(function(ck){
    var it=BYKEY[bkey(ck)];if(!it)return;
    var c=L.items[ck];
    var cols=(it.layer==='promo')?(it.cols||[]):curColsOf(it,c.fit);
    var col=colInList(cols,c.colour)||cols[0]||{};
    if(col.front)out.push(gurl(col.front));});
  return out;
}
function boardTileHtml(id){
  /* Pinterest's board thumbnail is ONE large tile plus two small -- exactly three cells. Emitting a
     fourth into a 2fr+1fr / 1fr+1fr grid created an implicit third row and collapsed the first three
     cells to 22px, 9px and 9px while the fourth took the whole large slot. Three cells, placed
     explicitly by nth-child, cannot do that. */
  var t=boardValue(id),th=boardThumbs(id,3),n=listLen(id);
  var cells='';
  for(var i=0;i<3;i++){
    cells+=th[i]?('<div class="btc"><img src="'+th[i]+'" alt="" loading="lazy"></div>')
                :'<div class="btc empty"></div>';}
  return '<button type="button" class="btile" data-bopen="'+esc(id)+'">'+
    '<div class="btcollage'+(th.length?'':' blank')+'">'+cells+
      (isTemplate(id)?'<span class="bttag">Template</span>':'')+'</div>'+
    '<div class="btmeta"><b>'+esc(listName(id))+'</b>'+
      '<span>'+n+' item'+(n===1?'':'s')+(t.pieces?(' \u00b7 '+t.pieces+' pcs'):'')+
      (t.sub?(' \u00b7 est. '+money(t.sub)):'')+'</span></div></button>';
}
function renderBoardsIndex(){
  var el=document.getElementById('boards');if(!el)return;
  if(!LISTS)loadLists();
  var ids=listIds();
  el.innerHTML='<div class="bwrap">'+
    '<header class="bhd"><div class="bhdin">'+
      '<div class="bhdL"><div class="beyb">'+esc(CFG.client)+'</div>'+
        '<h1 class="btitle">Your boards</h1>'+
        '<div class="bsum">'+ids.length+' board'+(ids.length===1?'':'s')+
          ' \u00b7 saved on this device</div></div>'+
      '<div class="bhdR">'+
        '<button type="button" class="bcta" id="biNew">+ Create board</button>'+
        '<button type="button" class="bx" id="biClose" aria-label="Close">\u2715</button>'+
      '</div></div></header>'+
    '<div class="btiles">'+ids.map(boardTileHtml).join('')+
      '<button type="button" class="btile new" id="biNew2">'+
        '<div class="btcollage blank"><span class="btplus">+</span></div>'+
        '<div class="btmeta"><b>Create a board</b><span>Group gear by team, site or season</span></div>'+
      '</button></div></div>';
  el.querySelectorAll('[data-bopen]').forEach(function(b){b.addEventListener('click',function(){
    closeBoards();openBoard(b.dataset.bopen);});});
  ['biNew','biNew2'].forEach(function(idb){
    var e=document.getElementById(idb);
    if(e)e.addEventListener('click',function(){
      var nm=window.prompt('Name this board','Board '+(listIds().length+1));
      if(nm===null)return;newList(nm);refreshCartUI();closeBoards();openBoard(ALID);});});
  var x=document.getElementById('biClose');if(x)x.addEventListener('click',closeBoards);
}
function openBoards(){
  // Opening the index is exactly when a stale list is most visible -- reconcile, then re-render.
  syncBoardsFromServer().then(function(changed){if(changed)renderBoardsIndex();});
  var el=document.getElementById('boards');
  if(!el){el=document.createElement('div');el.id='boards';el.className='boardov';document.body.appendChild(el);}
  renderBoardsIndex();
  el.classList.add('on');document.body.style.overflow='hidden';
  setRail('boards');
}
function closeBoards(){
  var el=document.getElementById('boards');if(el)el.classList.remove('on');
  document.body.style.overflow='';setRail('explore');
}
function setRail(which){
  document.querySelectorAll('.railb').forEach(function(b){
    b.classList.toggle('on',b.dataset.rail===which);});
}
function railIcon(n){
  var p={
    explore:'<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5l-2 5-5 2 2-5z"/>',
    boards:'<rect x="3" y="4" width="7.5" height="16" rx="1.6"/><rect x="13.5" y="4" width="7.5" height="7" rx="1.6"/><rect x="13.5" y="13" width="7.5" height="7" rx="1.6"/>',
    share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
    quote:'<path d="M4 4h11l5 5v11H4z"/><path d="M14 4v5h5M8 13h8M8 17h5"/>'
  }[n]||'';
  return '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" '+
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';
}
function railHtml(){
  return '<nav class="rail" id="rail" aria-label="Store sections">'+
    '<button type="button" class="railb on" data-rail="explore">'+railIcon('explore')+
      '<span>Explore</span></button>'+
    '<button type="button" class="railb" data-rail="boards">'+railIcon('boards')+
      '<span>Boards</span><i class="railn" id="railN"></i></button>'+
    '<button type="button" class="railb" data-rail="share">'+railIcon('share')+
      '<span>Share</span></button>'+
    '<button type="button" class="railb" data-rail="quote">'+railIcon('quote')+
      '<span>Quote</span></button>'+
    '</nav>';
}
function wireRail(){
  document.querySelectorAll('.railb').forEach(function(b){
    b.addEventListener('click',function(){
      var w=b.dataset.rail;
      if(w==='explore'){closeBoards();closeBoard();closeAll();
        window.scrollTo({top:0,behavior:'smooth'});setRail('explore');return;}
      if(w==='boards'){closeBoard();openBoards();return;}
      if(w==='share'){shareList();return;}
      if(w==='quote'){closeBoards();closeBoard();
        document.getElementById('ov').classList.add('on');
        document.getElementById('cart').classList.add('on');
        document.body.style.overflow='hidden';openCheckout();return;}
    });});
}
/* Pinterest's Explore is one search field and image tiles. Ours had the search collapsed behind a
   magnifier and categories as a chip strip below a hero, a trust row and a category panel. The
   search is now always visible at the top; it PROXIES the existing #kitSearch input so every
   filter, count and no-results path keeps working untouched. */
/* The header bar is gone, but the client's brand presence should not be. A small mark inside the
   hero, sitting above the H1 that already names them, gives the store its owner without spending a
   whole horizontal band on it. Renders nothing when a kit has no logo asset, rather than a gap. */
function heroMarkHtml(cls){
  var L=(CFG.logos&&CFG.logos[0])||null;
  /* DARK first, deliberately. The bar and hero are light, and inks.brand is whatever the brand's
     own mark is -- for Mowi that is a white/light lockup, which rendered nearly invisible on cream
     and read as a broken image. A mark must contrast with what it sits on. */
  var f=L&&L.inks&&(L.inks.dark||L.inks.brand||L.inks.full);
  if(!f)return '';
  /* INLINE size limits, deliberately duplicating the stylesheet.
     Steven opened the store and got a 1150px-tall logo filling the whole viewport with the bar
     rendered as plain text. The deployed CSS was byte-correct; the host had served a captcha HTML
     page (HTTP 202, 209 bytes) in place of store.css, so the page rendered against a stylesheet
     that never arrived. A ?v= pin cannot help with that -- it busts caches, it does not make the
     file exist. A logo is the one element whose natural size is catastrophic when unstyled, so its
     constraint lives on the element itself and survives with zero CSS. */
  var big=(cls==='tbmark')?[30,120]:[40,190];
  if(!f)return '';
  return '<img class="'+(cls||'heromark')+'" src="'+kurl(f)+'" alt="'+esc(CFG.client||'')+'" '+
    'height="'+big[0]+'" style="max-height:'+big[0]+'px;max-width:'+big[1]+
    'px;width:auto;height:auto;object-fit:contain" '+
    'onerror="this.style.display=\'none\'">';
}
/* 4imprint's scrolling behaviour is one slim persistent bar: mark, Categories, a search field, and
   the account/cart. No chip strips, no sub-rows floating mid-page. Ours previously had .navwrap
   sticky at top:60px -- pinned to a header that no longer exists, so it hovered in mid-air over the
   products, which is the "floating navigation" Steven is describing. This bar replaces the separate
   search section AND the scroll-revealed chip bar, and Categories carries what the chips did. */
function catMenuHtml(){
  var cats=(typeof CATS!=='undefined'&&CATS.length)?CATS:[];
  if(!cats.length)return '';
  return '<div class="catmenu" id="catmenu"><div class="cmin">'+cats.map(function(c){
      var img=catTileImg(c);
      return '<button type="button" class="cmrow" data-catgo="'+esc(c)+'">'+
        '<span class="cmimg">'+(img?('<img src="'+img+'" alt="" loading="lazy" '+
          'style="max-width:40px;max-height:40px;width:auto;height:auto;object-fit:contain">'):'')+'</span>'+
        '<b>'+esc(shortCat(c))+'</b><i>'+((TOTALS&&TOTALS[c])||0)+'</i></button>';}).join('')+
    '</div></div>';
}
function tbarHtml(){
  return '<div class="tbar" id="tbar"><div class="tbin">'+
      heroMarkHtml('tbmark')+
      '<button type="button" class="tbcats" id="tbCats" aria-expanded="false">'+
        '<span class="tbbg"><i></i><i></i><i></i></span>Categories</button>'+
      '<div class="tbsearch">'+
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" '+
        'stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/>'+
        '<path d="M21 21l-4.3-4.3"/></svg>'+
        '<input id="topSearch" type="search" autocomplete="off" aria-label="Search products" '+
        'placeholder="What can we help you find?">'+
        '<button type="button" class="exsx" id="topSearchX" aria-label="Clear">\u2715</button>'+
      '</div>'+
      '<button type="button" class="tbboards" id="tbBoards">'+railIcon('boards')+
        '<span id="tbBoardsLbl">Boards</span></button>'+
    '</div>'+catMenuHtml()+'</div>';
}
function toggleCatMenu(force){
  var m=document.getElementById('catmenu'),b=document.getElementById('tbCats');
  if(!m)return;
  var on=(typeof force==='boolean')?force:!m.classList.contains('on');
  m.classList.toggle('on',on);
  if(b)b.setAttribute('aria-expanded',on?'true':'false');
}
function topSearchHtml(){
  return '<section class="exsearch"><div class="w exsin">'+
    '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" '+
    'stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/>'+
    '<path d="M21 21l-4.3-4.3"/></svg>'+
    '<input id="topSearch" type="search" autocomplete="off" aria-label="Search products" '+
    'placeholder="Search '+ALLKEYS.length+' products \u2014 polos, hi-vis, Carhartt\u2026">'+
    '<button type="button" class="exsx" id="topSearchX" aria-label="Clear">\u2715</button>'+
    '</div></section>';
}
function catKeysOf(cat){
  /* BUCKETS[mega] is an object of SUBCATEGORIES -- {polos:[keys], shirts:[keys]} -- not a flat key
     list. The first version iterated it and collected the sub NAMES, which are not product keys, so
     every tile resolved no photo and rendered as an empty grey square. Flatten properly. */
  var b=(typeof BUCKETS!=='undefined')?BUCKETS[cat]:null;
  if(!b)return [];
  if(Object.prototype.toString.call(b)==='[object Array]')return b;
  var out=[];
  for(var s in b){var arr=b[s];if(arr&&arr.length)out=out.concat(arr);}
  return out;
}
function catTileImg(cat){
  var keys=catKeysOf(cat);
  for(var i=0;i<keys.length;i++){
    var it=BYKEY[keys[i]];if(!it)continue;
    var c=(it.cols||[])[0];
    if(c&&c.front)return gurl(c.front);}
  return '';
}
function catTilesHtml(){
  var cats=(typeof CATS!=='undefined'&&CATS.length)?CATS:[];
  if(!cats.length)return '';
  return '<section class="excats"><div class="w">'+
    '<h2 class="exh">Browse by category</h2>'+
    '<div class="cattiles">'+cats.map(function(c){
      var img=catTileImg(c);
      return '<button type="button" class="cattile" data-catgo="'+esc(c)+'">'+
        '<span class="ctimg">'+(img?('<img src="'+img+'" alt="" loading="lazy" '+
          'style="max-width:56px;max-height:56px;width:auto;height:auto;object-fit:contain">'):'')+'</span>'+
        '<span class="ctlab"><b>'+esc(shortCat(c))+'</b><i>'+((TOTALS&&TOTALS[c])||0)+'</i></span>'+
        '</button>';}).join('')+
    '</div></div></section>';
}
function wireExplore(){
  var ts=document.getElementById('topSearch'),ks=document.getElementById('kitSearch');
  if(ts&&ks){
    var push=function(){ks.value=ts.value;
      try{ks.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}
      var x=document.getElementById('topSearchX');if(x)x.style.display=ts.value?'':'none';};
    ts.addEventListener('input',push);
    ts.addEventListener('search',push);
    var x=document.getElementById('topSearchX');
    if(x){x.style.display='none';
      x.addEventListener('click',function(){ts.value='';push();ts.focus();});}
  }
  document.querySelectorAll('[data-catgo]').forEach(function(b){
    b.addEventListener('click',function(){
      setCat(b.dataset.catgo,true);
      var g=document.getElementById('gridhd')||document.getElementById('grid');
      if(g)g.scrollIntoView({behavior:'smooth',block:'start'});});});
}
function renderCart(){
  var keys=Object.keys(CART),sub=cartSubtotal();
  var items=keys.map(function(k){return cartLineHtml(k);}).join('');
  var tmpl=isTemplate(ALID)?('<div class="tmplnote"><b>This is our starter template.</b> '+
    'Anything you save goes to your own list \u2014 this one stays as it is.'+
    '<button type="button" class="tmplcopy" id="tmplCopy">Copy these '+keys.length+
    ' into my list</button></div>'):'';
  var body=keys.length?(tmpl+items):('<div class="cempty"><div class="ce-ic">🛒</div><b>This board is empty</b><span>Add a few pieces to get your exact quote \u2014 or to send your team a list.</span>'+((starterId()&&starterId()!==ALID)
      ?('<button class="ceadd" id="emptyAddRec">Start from our JDP starter list \u00b7 '+
        listLen(starterId())+' pieces</button>'):'')+'</div>');
  var setupRows=setupBreakdown(),setup=setupRows.reduce(function(t,x){return t+x.amount;},0);
  var brk=setupRows.length?('<details class="setupbrk"><summary>One-time setup '+money(setup)+' <i>· once per design, shared across the kit</i></summary>'+setupRows.map(function(x){return '<div class="sbk"><span>'+esc(x.label)+'</span><span>'+money(x.amount)+'</span></div>';}).join('')+'</details>'):'';
  document.getElementById('cart').innerHTML=
    '<div class="carth"><h2>'+esc(activeName())+'</h2>'+
      '<button class="cartx" id="cartx" aria-label="Close">✕</button></div>'+
    listBarHtml()+
    '<div class="citems" id="citems">'+body+'</div>'+
    (keys.length?('<div class="cartf">'+
      '<div class="crow"><span>Estimated subtotal</span><b>'+money(sub)+'</b></div>'+
      (setup>0?brk:'')+
      '<div class="csetup">Prices include your logo, decorated. Setup is a one-time charge per logo &amp; location, reused across the kit. Exact itemised quote confirmed free before anything runs.</div>'+
      // People assume a list like this is saved to an account. It is saved to THIS browser -- say so,
      // and point at the thing that actually makes it portable.
      '<div class="cwhere">This board is saved on this device. <b>Send it to your team</b> to keep it \u2014 the link works on any phone or computer.</div>'+
      '<button class="checkout" id="checkout">Get my exact quote <span class="ar">→</span></button>'+
      '<button type="button" class="sharelist" id="shareList">'+
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" '+
        'stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/>'+
        '<circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>'+
        'Send this board to your team</button>'+
      '<button type="button" class="svalt" data-samp="">\u270B See &amp; feel these first \u2014 we\u2019ll bring samples to you</button>'+
      '<div class="cktrust"><span>No payment now</span><span>No obligation</span><span>No minimum beyond 12 pcs</span></div></div>'):'')+
    '';
  document.getElementById('cartx').addEventListener('click',closeAll);
  var ck=document.getElementById('checkout');if(ck)ck.addEventListener('click',openCheckout);
  var sl=document.getElementById('shareList');if(sl)sl.addEventListener('click',shareList);

  var ea=document.getElementById('emptyAddRec');
  if(ea)ea.addEventListener('click',function(){var s=starterId();if(s)switchList(s);});
  var tc=document.getElementById('tmplCopy');
  if(tc)tc.addEventListener('click',copyStarterToMine);
  var lsl=document.getElementById('lsel');
  if(lsl)lsl.addEventListener('change',function(){switchList(lsl.value);});
  var lnw=document.getElementById('lNew');
  if(lnw)lnw.addEventListener('click',function(){
    var n=window.prompt('Name this board','Board '+(listIds().length+1));
    if(n===null)return;newList(n);renderCart();refreshCartUI();
    toast('Started \u201c'+listName(ALID)+'\u201d');});
  var lrn=document.getElementById('lRen');
  if(lrn)lrn.addEventListener('click',function(){
    var n=window.prompt('Rename this board',activeName());
    if(n===null)return;renameList(ALID,n);renderCart();refreshCartUI();});
  var ldl=document.getElementById('lDel');
  if(ldl)ldl.addEventListener('click',function(){
    if(!window.confirm('Delete \u201c'+activeName()+'\u201d and everything in it?'))return;
    deleteList(ALID);renderCart();refreshCartUI();});
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
/* When the sheet was opened FROM the board, the board is still mounted behind it. Anything that
   changes a line has to refresh that view, or the buyer closes the sheet and sees stale numbers --
   the edit appears not to have taken. */
function boardOpen(){var e=document.getElementById('board');return !!(e&&e.classList.contains('on'));}
function boardsOpen(){var e=document.getElementById('boards');return !!(e&&e.classList.contains('on'));}
/* THE MISSING HALF OF "LIVE".
   Saving worked from the first deploy -- boards were reaching the server correctly. But a browser
   only ever rendered its OWN localStorage, and asked the server for a board solely when the URL
   carried ?b=<slug>. So a board created on one machine was stored perfectly and stayed invisible
   everywhere else. A live document has to be read from the server, not just written to it.

   Board slugs are whatever the customer names them -- nothing here assumes any particular board. */
function syncBoardsFromServer(){
  if(!boardsApi())return Promise.resolve(false);
  return fetch(boardsApi()+'?kit='+encodeURIComponent(SLUG)+'&list=1',{cache:'no-store'})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(j){
      if(!j||!j.ok||!j.boards||!j.boards.length)return false;
      if(!LISTS)loadLists();
      var rows=j.boards.slice(0,40);          // bounded: never a request storm on a big store
      return Promise.all(rows.map(function(row){
        var localId=null;
        for(var k in LISTS){if(LISTS[k].slug===row.b){localId=k;break;}}
        var local=localId?LISTS[localId]:null;
        /* Local edits newer than the server copy win -- they are mid-flight and will push on the
           next save. Never overwrite what someone is typing right now. */
        if(local&&(local.updated||0)>((row.updated||0)*1000))return false;
        return pullBoard(row.b).then(function(sb){
          if(!sb)return false;
          var id=localId;
          if(!id){id=newListId();LISTS[id]={name:sb.name||row.b,items:{},updated:0};}
          LISTS[id].name=sb.name||LISTS[id].name;
          LISTS[id].items=sb.items||{};
          LISTS[id].slug=row.b;
          LISTS[id].rev=sb.rev||0;
          LISTS[id].updated=(sb.updated||0)*1000;
          if(id===ALID)CART=LISTS[id].items;
          return true;
        });
      })).then(function(res){
        var changed=res.some(Boolean);
        if(changed){persistLists();refreshCartUI();syncBoardIfOpen();markSync('saved');}
        return changed;
      });
    }).catch(function(){return false;});
}
function syncBoardIfOpen(){
  if(boardOpen())renderBoard();
  else if(boardsOpen())renderBoardsIndex();
  if(boardOpen()||boardsOpen())document.body.style.overflow='hidden';
}
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
  Object.keys(CART).forEach(function(k){var it=BYKEY[bkey(k)];if(!it)return;var cc=CART[k];var u=unitPrice(k,cc.decos,tierQty(k));
    lines.push('• '+it.name+(fitSku(it,cc)?' '+fitSku(it,cc):'')+' ('+it.sku+') — '+(fitTag(it,cc)?fitTag(it,cc)+' · ':'')+cc.colour+' · '+decoSummary(it,cc)+' · qty '+cc.qty+' @ '+money(u)+' ea = '+money(u*cc.qty));
    var ss=sizesSummary(cc);if(ss)lines.push('    sizes: '+ss);});
  lines.push('','Estimated subtotal: '+money(cartSubtotal()));
  var sb=setupBreakdown();
  if(sb.length){lines.push('One-time setup: '+money(cartSetup())+'  (once per design, shared across the kit)');
    sb.forEach(function(x){lines.push('   - '+x.label+': '+money(x.amount));});}
  lines.push('(Decoration priced in; exact quote to be confirmed.)');
  var _nt=Object.keys(CART).filter(function(k){return (CART[k]||{}).note;});
  if(_nt.length){lines.push('','NOTES FROM THE BUYER:');
    _nt.forEach(function(k){var it=BYKEY[bkey(k)];
      lines.push('  - '+((it&&it.name)||k)+': '+CART[k].note);});}
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
      /* Artwork is the single biggest cause of back-and-forth after an order lands. Asking for it
         HERE, while they are already filling in a form, costs one click; chasing it by email later
         costs days. Vector is what production actually wants, so it is named first -- but a
         high-resolution PNG is accepted rather than blocking the order on a file they may not have. */
      '<div class="artwrap">'+
        '<div class="arthd">Your logo <i>optional \u2014 speeds up your quote</i></div>'+
        '<label class="artdrop" for="coArt">'+
          '<span class="artic" aria-hidden="true">\u2191</span>'+
          '<span class="arttx"><b id="artLbl">Attach your logo file</b>'+
            '<i>Best: vector \u2014 .ai, .eps, .pdf or .svg. Otherwise the highest-resolution '+
            'PNG you have, on a transparent background.</i></span>'+
        '</label>'+
        '<input id="coArt" type="file" class="artin" accept=".ai,.eps,.pdf,.svg,.png,.jpg,.jpeg">'+
        '<div class="artnote">No logo file to hand? Send your board anyway \u2014 we\u2019ll redraw your '+
          'logo to production quality from the best image you have, at no charge.</div>'+
      '</div>'+
    '</div></div>'+
    '<div class="cartf">'+
      '<button class="checkout" id="emailKit">Send my list — get my quote <span class="ar">→</span></button>'+
      '<button class="copyalt" id="copyKit">or copy my list to paste into a reply</button>'+
      '<div class="ckpm">\u2605 <b>Price-match guarantee</b> — found a lower written quote for the same job? Send it with your board and we\u2019ll match it.</div>'+
      '<button type="button" class="svalt" data-samp="">\u270B Rather see them in person first? We\u2019ll bring samples to you</button>'+
      '<div class="cktrust" id="copyHint"><span>No payment now</span><span>No obligation</span><span>No minimum beyond 12 pcs</span></div></div>';
  document.getElementById('cartx').addEventListener('click',closeAll);
  document.getElementById('cartback').addEventListener('click',openCart);
  document.getElementById('cosumedit').addEventListener('click',openCart);
  document.getElementById('emailKit').addEventListener('click',submitKit);
  var _ai=document.getElementById('coArt');
  if(_ai)_ai.addEventListener('change',function(){
    var f=_ai.files&&_ai.files[0],l=document.getElementById('artLbl');
    if(l)l.textContent=f?(f.name+'  \u00b7  '+Math.max(1,Math.round(f.size/1024))+' KB'):'Attach your logo file';
    var w=document.querySelector('.artdrop');if(w)w.classList.toggle('has',!!f);});
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
    _subject:subj,_template:'table',_captcha:'false',kit:body,
    kit_link:location.href.split('#')[0].split('?')[0],
    // The customer's own list as a link: open it to see exactly what they chose, and adopt it as
    // that store's shortlist in one click rather than reconstructing it from the text.
    their_list:shareListUrl()};
  var done=false,fell=false;
  function fail(){if(done||fell)return;fell=true;mailtoFallback(c,body,subj);}
  var to=setTimeout(fail,9000);   // network stalls -> fallback, never leave them stuck

  /* If they attached artwork, the request MUST go to the non-AJAX endpoint. Verified by sending both
     ways and reading the delivered mail: /ajax/ accepts a multipart POST, answers {"success":"true"}
     and silently DISCARDS the file -- the message arrives as single-part text/html with no attachment.
     The plain endpoint delivers it as a real attachment. Its response is opaque under no-cors, so a
     resolved request is the success signal; a rejection still falls back to the prefilled email. */
  var _af=document.getElementById('coArt'),_file=(_af&&_af.files&&_af.files[0])||null;
  if(_file){
    var fd=new FormData();
    Object.keys(payload).forEach(function(k){fd.append(k,payload[k]);});
    fd.append('artwork_filename',_file.name);
    fd.append('attachment',_file,_file.name);
    fetch('https://formsubmit.co/'+JDP_EMAIL,{method:'POST',body:fd,mode:'no-cors'})
      .then(function(){clearTimeout(to);if(fell)return;done=true;checkoutSuccess(c);})
      .catch(function(){clearTimeout(to);fail();});
    return;
  }
  fetch('https://formsubmit.co/ajax/'+JDP_EMAIL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){return r.json().catch(function(){return {};});})
    .then(function(j){clearTimeout(to);if(fell)return;done=true;
      if(j&&String(j.success)==='true'){checkoutSuccess(c);}else{fail();}})
    .catch(function(){clearTimeout(to);fail();});
}
function mailtoFallback(c,body,subj){
  clipCopy(body);
  var btn=document.getElementById('emailKit');if(btn){btn.disabled=false;btn.innerHTML=btn.dataset.lbl||'Send my list — get my quote <span class="ar">→</span>';}
  var hint=document.getElementById('copyHint');if(hint)hint.innerHTML='<span>Opening your email — just hit send ✓</span><span>Didn’t open? Your list is copied — email '+JDP_EMAIL+'</span>';
  window.location.href='mailto:'+JDP_EMAIL+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);
}
function checkoutSuccess(c){
  var first=c.name?esc(c.name.split(' ')[0]):'';
  document.getElementById('cart').innerHTML=
    '<div class="carth"><h2>Request sent</h2><button class="cartx" id="cartx" aria-label="Close">✕</button></div>'+
    '<div class="citems"><div class="cosent"><div class="csent-ic">✓</div>'+
      '<h3>Your list is on its way'+(first?', '+first:'')+'!</h3>'+
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
      '<p class="herosub">Loading your board…</p></div></section>'+
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
      SHARED=readSharedList();curateInit();loadCart();autoApplyShared();buildStore();
      var _bm=location.search.match(/[?&]board=([^&#]+)/);
      if(_bm){try{openBoard(decodeURIComponent(_bm[1]));}catch(e){}}
      /* ?b=<slug> is the live-board link. The legacy ?list=... links stay working via SHARED, so
         anything already emailed to a customer keeps opening. */
      /* Every visit reconciles with the server, so a board made on any other device shows up here
         without needing its link. */
      syncBoardsFromServer();
      var _lb=location.search.match(/[?&]b=([^&#]+)/);
      if(_lb&&!/[?&]list=/.test(location.search)){
        openSharedBoard(qdec(_lb[1])).then(function(found){
          if(found)openBoard(ALID);
          else toast('That board isn\u2019t available \u2014 it may have been renamed');});}refreshCartUI();if(curateOn())markCurCards();
      // Deep link: /kits/<slug>/?item=<key> (or #item=<key>) opens straight to that product. This MUST
      // run AFTER buildStore(). It used to fire synchronously, before the async ink probe resolved, so
      // the sheet opened against an unbuilt store and was wiped by the first render -- every ?item=
      // link, including every gift-set contents link, silently did nothing.
      try{var m=(location.search.match(/[?&]item=([^&#]+)/)||location.hash.match(/item=([^&#]+)/));
        if(m){var k=decodeURIComponent(m[1]);
          var cm=(location.search.match(/[?&]c=([^&#]+)/)||location.hash.match(/[&#]c=([^&#]+)/));
          if(BYKEY[k])openSheet(k,cm?decodeURIComponent(cm[1]):null);}}catch(e){}
    });
  }).catch(function(e){document.getElementById('app').innerHTML='<p style="padding:60px;text-align:center">Could not load the catalogue. Please refresh.</p>';});
}
var cel=document.getElementById('jdpcfg');
if(cel){try{go(JSON.parse(cel.textContent));}catch(e){}}
else{fetch('client.json?v='+Date.now()).then(function(r){return r.json();}).then(go).catch(function(){document.getElementById('app').innerHTML='<p style="padding:60px;text-align:center">Client config not found.</p>';});}
})();
