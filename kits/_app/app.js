/* JDP ZERO-BUILD renderer — deployed once at /kits/_app/app.js.
   A client is just a client.json (viewmodel) + logo/hero image assets + a generic stub.
   This script fetches client.json + the shared catalog.json and builds the ENTIRE page,
   then runs the shared interactivity. New client = data only, no per-client HTML build. */
(function(){
document.documentElement.classList.add('js');
var CATALOG_BASE = "https://justdealspromotions.com/kits/_catalog";

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function hexLum(h){h=(h||'').replace('#','');if(h.length<6)return 128;var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return 0.299*r+0.587*g+0.114*b;}
function autoInk(rgb){return hexLum(rgb)<120?'white':'brand';}
function money(x){return '$'+Number(x).toFixed(2);}
function inkCss(v){return v==='white'?'#fff':(v==='dark'||v==='black')?'#141414':v;}
var BRANDGRAD="background:conic-gradient(from 210deg,#c9a24b,#6d6c69,#6dd4fa,#c9a24b)";

function inkDots(logos){
  var opts=[['brand','Full colour'],['white','White'],['dark','Black']],seen={'#ffffff':1,'#141414':1},h;
  (logos||[]).forEach(function(L){for(h in (L.inks||{})){if(h.charAt(0)==='#'&&!seen[h.toLowerCase()]){seen[h.toLowerCase()]=1;opts.push([h,'Brand colour']);}}});
  return opts.map(function(o){var st=o[0]==='brand'?BRANDGRAD:('background:'+inkCss(o[0]));
    return '<button class="dink" data-ink="'+o[0]+'" style="'+st+'" title="'+o[1]+'" aria-label="'+o[1]+'"></button>';}).join('');
}

function buildCard(item, vm, cfg, feature){
  var key=item.key, cols=item.cols||[], places=item.places||[], logos=cfg.logos||[];
  var isField=item.layer==='field';
  var gbase=cfg.catalog_base+'/img/';
  var colour=(vm&&vm.colour)||(cols[0]&&cols[0].name);
  var ci=0; for(var i=0;i<cols.length;i++){if(cols[i].name===colour){ci=i;break;}}
  var col0=cols[ci]||{front:'',back:null,rgb:'#808080',name:''};
  var decos=(vm&&vm.decos)||[];
  var dmap={}; decos.forEach(function(d){dmap[d.pl]=d;});
  var logoPlaces=places.filter(function(p){return p.logo;});
  var iauto=!isField;
  var dink=isField?'white':(hexLum(col0.rgb)<120?'white':'brand');
  var price=money(item.prices?item.prices[item.prices.length-1]:0);
  var ver=cfg.ver||'1';

  // overlays (one per logo location; render() fills src/pos/visibility)
  var ovl=logoPlaces.map(function(p){return '<img class="lgo" data-pl="'+p.id+'" alt="" hidden>';}).join('');
  var rec=item.rec?'<span class="recbadge">Crew favourite</span>':'';
  var ld=feature?'eager':'lazy';
  var stage='<div class="istage" id="st_'+key+'">'+rec+'<div class="izoom">'+
    '<img class="grm" src="'+gbase+col0.front+'?v='+ver+'" alt="'+esc(item.name)+'" loading="'+ld+'" decoding="async" draggable="false">'+ovl+'</div></div>';

  var grm='';
  if(cols.length>1){
    var db=cols.map(function(c,idx){return '<button class="sw'+(idx===ci?' on':'')+'" data-ci="'+idx+'" style="background-image:url('+gbase+c.front+'?v='+ver+')" title="'+esc(c.name)+'" aria-label="'+esc(c.name)+'"></button>';}).join('');
    grm='<div class="swblk"><span class="swcap">Colour<i class="swnow" id="cn_'+key+'">'+esc(col0.name)+'</i></span><div class="swrow" data-role="grm">'+db+'</div></div>';
  }
  var views='';
  if(places.some(function(p){return p.face==='back';})){
    views='<div class="views" data-role="view"><button class="vbtn on" data-face="front">Front</button><button class="vbtn" data-face="back">Back</button></div>';
  }
  var MLAB={embroidery:'Embroidery',screen:'Screen print',heat_transfer:'Heat transfer'};
  var rows=logoPlaces.map(function(p){
    var d=dmap[p.id]||{on:false,method:'embroidery'};
    return '<div class="deco'+(d.on?' on':'')+'" data-pl="'+p.id+'">'+
      '<button class="decotog" data-role="tog"><span class="dchk"></span>'+esc(p.label)+'</button>'+
      '<div class="dctl"><div class="dlgs" data-role="lgs"></div><div class="dinks">'+inkDots(logos)+'</div>'+
      '<button class="dmeth" data-role="meth" title="Decoration method">'+(MLAB[d.method]||'Embroidery')+'</button></div></div>';
  }).join('');
  var sumEl='<div class="decosum" id="ds_'+key+'"></div>';
  var editor;
  if(feature){editor=sumEl+'<div class="swcap decocap">Logos <i>tap a spot to add / remove</i></div><div class="decos">'+rows+'</div>';}
  else{editor=sumEl+'<div class="decobox"><button class="decoedit" data-role="editopen"><span>Customise logos</span><i>▾</i></button><div class="decos">'+rows+'</div></div>';}
  var ncol=cols.length>1?('<span class="ncol">'+cols.length+' colours</span>'):(isField?'<span class="ncol">CSA hi-vis</span>':'');
  var controls=grm+views+editor;

  var payload={key:key,ver:ver,nm:item.name,cbase:cfg.catalog_base,dink:dink,iauto:iauto,cols:cols,places:places,logos:logos,decos:decos};
  var html;
  if(feature){
    var lead=item.blurb?('<p class="featlead">'+esc(item.blurb)+'</p>'):'';
    html='<div class="card reveal feature">'+stage+'<div class="b"><div class="feateyb">Try it on — live</div>'+
      '<div class="crow"><h3>'+esc(item.name)+'</h3><span class="upr">from '+price+' ea</span></div>'+
      '<div class="sku">'+esc(item.sku)+ncol+'</div>'+lead+controls+
      '<div class="feathint">Add logos to any spot, recolour them, switch method — it updates instantly.</div></div></div>';
  } else {
    html='<div class="card reveal">'+stage+'<div class="b"><div class="crow"><h3>'+esc(item.name)+'</h3><span class="upr">from '+price+' ea</span></div>'+
      '<div class="sku">'+esc(item.sku)+ncol+'</div>'+controls+'</div></div>';
  }
  return {html:html, payload:payload};
}

function priceRows(list){
  return (list||[]).map(function(r){
    var cells=r.prices.map(function(p){return '<td class="rt">'+money(p)+'</td>';}).join('');
    var dp=r.prices.map(function(p){return Number(p).toFixed(2);}).join('|');
    var dc=r.cols.join('|');
    return '<tr><td><b>'+esc(r.name)+'</b><span class="psku">'+esc(r.sku)+' · '+esc(r.method)+'</span></td>'+cells+
      '<td class="rt"><input class="qty" type="number" inputmode="numeric" min="0" max="9999" placeholder="0" aria-label="Quantity — '+esc(r.name)+'" data-name="'+esc(r.name)+'" data-p="'+dp+'" data-c="'+dc+'"></td></tr>';
  }).join('');
}

function buildPage(cfg, catalog){
  var C=cfg.copy||{}, ver=cfg.ver||'1';
  var byKey={}; (catalog.items||[]).forEach(function(it){byKey[it.key]=it;});
  var order=cfg.order||{office:[],field:[]};
  var payloads=[];
  function cardFor(key, feature){
    var it=byKey[key]; if(!it)return '';
    var r=buildCard(it, (cfg.items||{})[key], cfg, feature); payloads.push(r.payload); return r.html;
  }
  var featureHtml=cfg.feature?cardFor(cfg.feature,true):'';
  var office=(order.office||[]).filter(function(k){return k!==cfg.feature;}).map(function(k){return cardFor(k,false);}).join('');
  var field=(order.field||[]).map(function(k){return cardFor(k,false);}).join('');
  var heroes=(cfg.heroes||[]).map(function(f){return '<div class="hc"><img src="'+f+'?v='+ver+'"></div>';}).join('');
  var chips=(C.chips||[]).map(function(c){return '<div class="chip"><b>'+esc(c[0])+'</b><span>'+esc(c[1])+'</span></div>';}).join('');
  var pr=cfg.pricing||{cols:[],office:[],field:[]};
  var colHead=(pr.cols||[]).map(function(c){return '<td class="rt">'+c+'+</td>';}).join('')+'<td class="rt">Qty</td>';
  var fieldKit=field?('<div class="lbl" style="margin-top:34px">'+esc(C.field_kit_label||'Job-site & hi-vis')+'</div><div class="grid">'+field+'</div>'):'';
  var fieldPrice=(pr.field&&pr.field.length)?('<tr class="invsec"><td colspan="'+((pr.cols||[]).length+2)+'">Hi-vis field gear</td></tr>'+priceRows(pr.field)):'';

  var html=''+
   '<nav class="nav"><div class="w navin"><span class="navb">'+esc(cfg.client)+' <i>×</i> Just Deals</span>'+
     '<a href="#kit">The kit</a><a href="#pricing">Pricing</a><a href="#work">Recent work</a>'+
     '<a class="navcta" href="#start">Build my quote →</a></div></nav>'+
   '<header class="cover" id="top"><div class="w">'+
     '<img class="lg" src="'+(cfg.cover_logo||'img/logo-white.png')+'?v='+ver+'" alt="'+esc(cfg.client)+'">'+
     '<div class="eyb">Prepared for '+esc(cfg.client)+'</div>'+
     '<h1>'+(C.hero_h1||'')+'</h1><p>'+esc(C.cover_p||'')+'</p>'+
     '<div class="cvrow"><a class="cvcta" href="#kit">See your logo on the gear ↓</a>'+
       '<span class="cvhint"><b>Tap any colour</b> — watch it change instantly.</span></div>'+
     '<div class="heroes">'+heroes+'</div></div></header>'+
   '<section class="why"><div class="w"><h2>'+(C.hero_h2||'')+'</h2><div class="chips">'+chips+'</div></div></section>'+
   '<section class="sec" id="kit"><div class="w">'+
     '<div class="rkline"><b>We built a recommended kit for '+esc(cfg.client)+'.</b> Everything’s editable — change colours, add your logo to any spot, recolour it, switch the decoration. Then reply to order.</div>'+
     '<div class="upl"><button class="uplbtn" id="uplbtn">&#8593; Upload your logo</button>'+
       '<span class="uplnote" id="uplnote">Showing the logo we found on your site — upload your own to see it on everything instantly.</span>'+
       '<input type="file" id="uplinp" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></div>'+
     '<div class="kithelp"><span><i>1</i>Pick the garment colour</span><span><i>2</i>Add your logo to any spot</span><span><i>3</i>Recolour it &amp; choose the method</span></div>'+
     featureHtml+
     '<div class="lbl">Office &amp; client-facing</div><div class="grid">'+office+'</div>'+fieldKit+
   '</div></section>'+
   '<section class="sec" id="pricing"><div class="w"><div class="lbl">Your price list — per item, decorated</div>'+
     '<p class="notelead">Ready to wear with your logo. Your per-piece price drops as you order more.</p>'+
     '<div class="price"><table class="inv"><tr class="invh"><td>Item — decorated</td>'+colHead+'</tr>'+
     '<tr class="invsec"><td colspan="'+((pr.cols||[]).length+2)+'">Office &amp; client-facing</td></tr>'+
     priceRows(pr.office)+fieldPrice+'</table>'+
     '<p class="pdisc"><b>One-time setup:</b> '+esc(pr.setup_line||'')+' — charged once, then reorders are decoration + garment only. Prices in '+esc(pr.currency||'CAD')+', decorated, per piece. Your exact itemised invoice is confirmed before anything runs.</p>'+
     '<div id="kitsum" hidden><div class="kslbl">Your kit — live estimate</div><div id="kslines"></div>'+
       '<div class="kstotal">Estimated total: <b id="kstot">$0.00</b> <span>+ one-time setup · exact itemised invoice confirmed before anything runs</span></div>'+
       '<button id="kscopy" type="button">Copy my kit → then just reply &amp; paste</button></div>'+
     '</div></div></section>'+
   '<section class="sec" id="work"><div class="w"><div class="lbl">Recent work — straight from our shop floor</div>'+
     '<p class="notelead">'+esc(C.work_lead||'Recent work from our shop floor.')+'</p>'+
     '<behold-widget feed-id="'+esc(C.feed||'')+'"></behold-widget></div></section>'+
   '<section class="close" id="start"><div class="w" style="padding:56px 6%;text-align:center">'+
     '<h2 style="font-size:clamp(26px,4vw,40px);font-weight:900;max-width:16ch;margin:0 auto;color:#fff">'+esc(C.close_h2||'')+'</h2>'+
     (C.cta_mid_html||'')+
     '<p style="color:#cfcac4;font-size:14px;max-width:72ch;margin:0 auto;line-height:1.8"><b style="color:#fff">Need something we haven’t shown?</b> '+esc(C.crosssell||'')+'</p>'+
     '<p style="color:#7d756e;font-size:12px;margin-top:30px;max-width:70ch;margin-left:auto;margin-right:auto">Just Deals Promotions · Concept mockups on representative product photography; pricing by exact invoice.</p>'+
   '</div></section>'+
   '<footer>Just Deals Promotions · Branded Workwear &amp; Safety Apparel · Prepared for '+esc(cfg.client)+'</footer>'+
   '<a class="fab" href="#start">Reply with your kit →</a>';

  var app=document.getElementById('app')||document.body;
  app.innerHTML=html;
  window.__JDP=window.__JDP||[];
  payloads.forEach(function(p){window.__JDP.push(p);});
}

/* ---- interactivity (identical to /kits/_app/kit.js), run AFTER buildPage ---- */
function runWiring(){
/* kit summary + lightbox */
(function(){
var ov=document.createElement('div');ov.id='lb';ov.innerHTML='<img alt="">';document.body.appendChild(ov);
document.querySelectorAll('.istage .grm,.hc img').forEach(function(im){
  im.addEventListener('click',function(){ov.querySelector('img').src=im.src;ov.classList.add('on');});});
ov.addEventListener('click',function(){ov.classList.remove('on');});
var rows=[].slice.call(document.querySelectorAll('input.qty'));
var sum=document.getElementById('kitsum'),lines=document.getElementById('kslines'),
    tot=document.getElementById('kstot'),copy=document.getElementById('kscopy');
function money(x){return '$'+x.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
function tier(q,cs){var i=0;for(var k=0;k<cs.length;k++){if(q>=cs[k])i=k;}return i;}
function items(){var out=[];rows.forEach(function(r){var q=parseInt(r.value,10)||0;if(q<1)return;
  var ps=r.dataset.p.split('|').map(Number),cs=r.dataset.c.split('|').map(Number);
  var p=ps[tier(q,cs)];out.push({n:r.dataset.name,q:q,p:p,line:q*p});});return out;}
function upd(){var it=items(),t=0,h='';it.forEach(function(x){t+=x.line;
  h+='<div><span>'+x.n+' × '+x.q+'</span><span><b>'+money(x.line)+'</b> <i>('+money(x.p)+' ea)</i></span></div>';});
  if(sum){sum.hidden=!it.length;lines.innerHTML=h;tot.textContent=money(t);}}
rows.forEach(function(r){r.addEventListener('input',upd);});
if(copy)copy.addEventListener('click',function(){var it=items();if(!it.length)return;
  var K=window.__KIT||{},byName={};Object.keys(K).forEach(function(k){byName[K[k].nm]=K[k];});
  var t=0,txt='My kit — '+document.title.split(' — ')[0]+':\n';
  it.forEach(function(x){t+=x.line;txt+='• '+x.n+' × '+x.q+'  @ '+money(x.p)+' ea = '+money(x.line)+'\n';
    var c=byName[x.n];if(c){if(c.colour)txt+='   Colour: '+c.colour+'\n';
      c.decos.forEach(function(dz){txt+='   Logo: '+dz+'\n';});}});
  txt+='Estimated total: '+money(t)+' (+ one-time setup)\n';
  function done(){copy.textContent='Copied ✓ — now just reply to our email & paste';location.hash='#start';}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,function(){fallback(txt);done();});}
  else{fallback(txt);done();}
  function fallback(s){var ta=document.createElement('textarea');ta.value=s;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);}});
})();
/* product cards */
(function(){
function gurl(o,f){return (o.cbase?o.cbase+'/img/':'img/')+f+'?v='+o.ver;}
function logoOf(o,id){for(var i=0;i<o.logos.length;i++){if(o.logos[i].id===id)return o.logos[i];}return o.logos[0]||{inks:{}};}
function hexLum(h){h=(h||'').replace('#','');if(h.length<6)return 128;var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return 0.299*r+0.587*g+0.114*b;}
function autoInk(col){return hexLum(col.rgb)<120?'white':'brand';}
var METHODS=['embroidery','screen','heat_transfer'];
var MLAB={embroidery:'Embroidery',screen:'Screen print',heat_transfer:'Heat transfer'};
function inkName(t){return t==='brand'?'Full colour':t==='white'?'White':t==='dark'?'Black':'Brand colour';}
(window.__JDP||[]).forEach(function(o){
  var stage=document.getElementById('st_'+o.key); if(!stage)return;
  var wrap=stage.closest('.card'); if(!wrap)return;
  var grm=stage.querySelector('.grm');
  var cn=document.getElementById('cn_'+o.key);
  var sumEl=document.getElementById('ds_'+o.key);
  function placeOf(pid){for(var i=0;i<o.places.length;i++){if(o.places[i].id===pid)return o.places[i];}return {};}
  function ver(u){return /^data:/.test(u)?u:u+'?v='+o.ver;}
  var st={ci:0,face:'front',decos:{}};
  (o.decos||[]).forEach(function(d){st.decos[d.pl]={on:!!d.on,lg:d.lg,ink:d.ink||'auto',method:d.method||'embroidery'};});
  var onSw=wrap.querySelector('.sw.on'); if(onSw)st.ci=parseInt(onSw.dataset.ci,10)||0;
  var _pl=function(){o.cols.forEach(function(c){[c.front,c.back].forEach(function(f){if(f){var im=new Image();im.src=gurl(o,f);}});});};
  (window.requestIdleCallback?requestIdleCallback(_pl,{timeout:2500}):setTimeout(_pl,700));
  var lastPhoto=grm?grm.getAttribute('src'):null, first=true, tmr=null;
  function setPhoto(url){ if(!grm||!url||url===lastPhoto){return;} lastPhoto=url;
    if(first){grm.src=url;return;}
    stage.classList.add('swapping'); if(tmr)clearTimeout(tmr);
    var im=new Image(); im.src=url;
    var go=function(){grm.src=url;requestAnimationFrame(function(){stage.classList.remove('swapping');});};
    tmr=setTimeout(function(){ (im.decode?im.decode().then(go,go):go()); }, 90);
  }
  function effInk(col,d){return (d.ink&&d.ink!=='auto')?d.ink:autoInk(col);}
  function render(){
    var col=o.cols[st.ci]||o.cols[0]||{}, hasBack=!!col.back;
    if(st.face==='back'&&!hasBack)st.face='front';
    var photo=(st.face==='back'&&col.back)?col.back:col.front;
    if(photo)setPhoto(gurl(o,photo));
    if(cn&&col.name)cn.textContent=col.name;
    stage.querySelectorAll('.lgo').forEach(function(el){
      var pid=el.dataset.pl,p=placeOf(pid),d=st.decos[pid]||{};
      var faceOk=(p.face||'front')===st.face;
      var show=d.on&&faceOk&&((p.face||'front')!=='back'||hasBack);
      if(show){var L=logoOf(o,d.lg),src=L.inks[effInk(col,d)]||L.inks.brand;
        el.hidden=false;el.src=ver(src);el.style.left=p.cx+'%';el.style.top=p.cy+'%';el.style.width=p.wf+'%';}
      else{el.hidden=true;}
    });
    wrap.querySelectorAll('.sw').forEach(function(b){var on=parseInt(b.dataset.ci,10)===st.ci;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});
    wrap.querySelectorAll('.vbtn').forEach(function(b){b.style.display=(b.dataset.face==='back'&&!hasBack)?'none':'';var on=b.dataset.face===st.face;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});
    wrap.querySelectorAll('.deco').forEach(function(row){
      var pid=row.dataset.pl,d=st.decos[pid]||{},p=placeOf(pid);
      row.classList.toggle('on',!!d.on);
      row.classList.toggle('na',!!(p&&p.face==='back'&&!hasBack));
      var tog=row.querySelector('.decotog');if(tog)tog.setAttribute('aria-pressed',!!d.on);
      var lgs=row.querySelector('.dlgs');
      if(lgs){
        if(o.logos.length>1){
          if(lgs.childElementCount!==o.logos.length){lgs.textContent='';
            o.logos.forEach(function(L){var b=document.createElement('button');b.className='dlg';b.dataset.lg=L.id;
              b.title=L.label||'Logo';b.setAttribute('aria-label',L.label||'Logo');
              b.style.backgroundImage='url("'+ver(L.inks.dark||L.inks.brand)+'")';lgs.appendChild(b);});}
          lgs.style.display='';
          lgs.querySelectorAll('.dlg').forEach(function(b){var on=b.dataset.lg===d.lg;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});
        } else {lgs.style.display='none';}
      }
      var ei=effInk(col,d);
      row.querySelectorAll('.dink').forEach(function(b){var on=b.dataset.ink===ei;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});
      var mb=row.querySelector('.dmeth');if(mb)mb.textContent=MLAB[d.method||'embroidery'];
    });
    var act=[],spec=[];
    o.places.forEach(function(p){var d=st.decos[p.id];if(p.logo&&d&&d.on){act.push(p.label);
      var L=logoOf(o,d.lg);spec.push(p.label+' — '+(L.label||'logo')+', '+inkName(effInk(col,d))+', '+MLAB[d.method||'embroidery']);}});
    if(sumEl){sumEl.textContent=act.length?act.join(' · '):'No logo yet — tap Customise to add one';
      sumEl.classList.toggle('none',!act.length);}
    (window.__KIT=window.__KIT||{})[o.key]={nm:o.nm,colour:(col.name||''),decos:spec};
  }
  wrap.querySelectorAll('.sw').forEach(function(b){b.addEventListener('click',function(){st.ci=parseInt(b.dataset.ci,10)||0;render();});});
  var eo=wrap.querySelector('.decoedit');if(eo)eo.addEventListener('click',function(){eo.parentNode.classList.toggle('open');});
  wrap.querySelectorAll('.vbtn').forEach(function(b){b.addEventListener('click',function(){if(b.style.display==='none')return;st.face=b.dataset.face;render();});});
  wrap.querySelectorAll('.deco').forEach(function(row){
    var pid=row.dataset.pl,p=placeOf(pid);
    var tog=row.querySelector('.decotog');
    if(tog)tog.addEventListener('click',function(){
      var col=o.cols[st.ci]||{};
      if(p&&p.face==='back'&&!col.back){return;}
      var d=st.decos[pid]||(st.decos[pid]={on:false,lg:(o.logos[0]||{}).id,ink:'auto',method:'embroidery'});
      d.on=!d.on;
      if(d.on&&p){st.face=(p.face==='back')?'back':'front';}
      render();
    });
    var lgs=row.querySelector('.dlgs');
    if(lgs)lgs.addEventListener('click',function(e){var b=e.target.closest('.dlg');if(!b)return;var d=st.decos[pid];if(!d)return;d.lg=b.dataset.lg;render();});
    row.querySelectorAll('.dink').forEach(function(b){b.addEventListener('click',function(){var d=st.decos[pid];if(!d)return;d.ink=b.dataset.ink;render();});});
    var mb=row.querySelector('.dmeth');if(mb)mb.addEventListener('click',function(){var d=st.decos[pid];if(!d)return;var i=METHODS.indexOf(d.method||'embroidery');d.method=METHODS[(i+1)%METHODS.length];render();});
  });
  (window.__JDPUP=window.__JDPUP||[]).push(function(L){
    var f=-1;for(var i=0;i<o.logos.length;i++)if(o.logos[i].id===L.id)f=i;
    if(f>=0)o.logos[f]=L;else o.logos.push(L);
    Object.keys(st.decos).forEach(function(p){st.decos[p].lg=L.id;st.decos[p].ink='auto';});
    wrap.querySelectorAll('.dlgs').forEach(function(el){el.textContent='';});
    render();
  });
  render(); first=false;
});
})();
/* customer logo upload */
(function(){
var inp=document.getElementById('uplinp'),btn=document.getElementById('uplbtn'),note=document.getElementById('uplnote');
if(!btn||!inp)return;
btn.addEventListener('click',function(){inp.click();});
inp.addEventListener('change',function(){var f=inp.files&&inp.files[0];if(!f)return;
  if(note)note.textContent='Processing your logo…';
  var img=new Image(),url=URL.createObjectURL(f);
  img.onload=function(){URL.revokeObjectURL(url);
    try{var L=processLogo(img);(window.__JDPUP||[]).forEach(function(fn){fn(L);});
      btn.textContent='✓ Your logo · replace';
      if(note)note.textContent='Your logo is on every item — tap any spot to fine-tune. We refine the artwork before production.';}
    catch(e){if(note)note.textContent='That image did not process — try a PNG or JPG with a plain background.';}};
  img.onerror=function(){if(note)note.textContent='Could not read that file. Try a PNG or JPG.';};
  img.src=url;});
function processLogo(img){
  var MAX=1100,w=img.naturalWidth||300,h=img.naturalHeight||300,s=Math.min(1,MAX/Math.max(w,h)),i;
  w=Math.max(1,Math.round(w*s));h=Math.max(1,Math.round(h*s));
  var c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
  x.drawImage(img,0,0,w,h);var d=x.getImageData(0,0,w,h),p=d.data;
  var trans=0;for(i=3;i<p.length;i+=4){if(p[i]<250)trans++;}
  if(trans<=w*h*0.02){
    var c0=[p[0],p[1],p[2]],c1=[p[(w-1)*4],p[(w-1)*4+1],p[(w-1)*4+2]],
        c2=[p[(h-1)*w*4],p[(h-1)*w*4+1],p[(h-1)*w*4+2]],c3=[p[((h*w)-1)*4],p[((h*w)-1)*4+1],p[((h*w)-1)*4+2]];
    var br=[(c0[0]+c1[0]+c2[0]+c3[0])/4,(c0[1]+c1[1]+c2[1]+c3[1])/4,(c0[2]+c1[2]+c2[2]+c3[2])/4],T=46*46;
    for(i=0;i<p.length;i+=4){var dr=p[i]-br[0],dg=p[i+1]-br[1],db=p[i+2]-br[2];
      if(dr*dr+dg*dg+db*db<T)p[i+3]=0;}
  }
  var minx=w,miny=h,maxx=0,maxy=0,any=false,xx,yy;
  for(yy=0;yy<h;yy++)for(xx=0;xx<w;xx++){if(p[(yy*w+xx)*4+3]>16){any=true;if(xx<minx)minx=xx;if(xx>maxx)maxx=xx;if(yy<miny)miny=yy;if(yy>maxy)maxy=yy;}}
  if(!any){minx=0;miny=0;maxx=w-1;maxy=h-1;}
  var tw=maxx-minx+1,th=maxy-miny+1;
  function variant(mode){var cc=document.createElement('canvas');cc.width=tw;cc.height=th;var xc=cc.getContext('2d');
    var id=xc.createImageData(tw,th),q=id.data,ax,ay;
    for(ay=0;ay<th;ay++)for(ax=0;ax<tw;ax++){var so=((ay+miny)*w+(ax+minx))*4,to=(ay*tw+ax)*4,a=p[so+3];
      if(mode==='white'){q[to]=255;q[to+1]=255;q[to+2]=255;q[to+3]=a;}
      else if(mode==='dark'){q[to]=20;q[to+1]=20;q[to+2]=22;q[to+3]=a;}
      else{q[to]=p[so];q[to+1]=p[so+1];q[to+2]=p[so+2];q[to+3]=a;}}
    xc.putImageData(id,0,0);return cc.toDataURL('image/png');}
  return {id:'upload',label:'Your logo',inks:{brand:variant('brand'),white:variant('white'),dark:variant('dark')}};
}
})();
/* scroll reveal */
(function(){var els=[].slice.call(document.querySelectorAll('.reveal'));
if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in');});return;}
var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target);}});},{rootMargin:'0px 0px -8% 0px',threshold:.08});
els.forEach(function(e){io.observe(e);});
setTimeout(function(){els.forEach(function(e){e.classList.add('in');});},1600);})();
/* instagram widget */
(function(){var d=document,s=d.createElement("script");s.type="module";s.src="https://w.behold.so/widget.js";d.head.append(s);})();
}

(function boot(){
  var cfgEl=document.getElementById('jdpcfg'), cfg;
  // polished load-in styles (injected so no kit.css change / cache coordination needed)
  var s=document.createElement('style');
  s.textContent='#app{opacity:0;transition:opacity .5s ease}#app.rdy{opacity:1}'+
    '.jdp-load{min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:Inter,system-ui,sans-serif;color:#8a847e}'+
    '.jdp-spin{width:38px;height:38px;border-radius:50%;border:3px solid #e9e5e1;border-top-color:var(--a,#1BA5D8);animation:jdpspin .8s linear infinite}'+
    '.jdp-load span.t{font-size:13px;font-weight:600;letter-spacing:.02em}@keyframes jdpspin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
  function loader(){var a=document.getElementById('app');if(a){a.classList.remove('rdy');a.innerHTML='<div class="jdp-load"><span class="jdp-spin"></span><span class="t">Loading your kit…</span></div>';a.style.opacity=1;}}
  function revealIn(){var a=document.getElementById('app');if(!a)return;a.style.opacity=0;requestAnimationFrame(function(){a.classList.add('rdy');a.style.opacity='';});}
  function go(cfg){
    try{
      if(cfg.accent)document.documentElement.style.setProperty('--a',cfg.accent);
      document.title=(cfg.client||'Branded Apparel')+' — Branded Apparel · Just Deals Promotions';
      loader();
      var base=cfg.catalog_base||CATALOG_BASE;
      fetch(base+'/catalog.json?v='+(cfg.ver||'1')).then(function(r){return r.json();}).then(function(catalog){
        cfg.catalog_base=base; buildPage(cfg, catalog); runWiring(); revealIn();
      }).catch(function(e){var a=document.getElementById('app');if(a){a.style.opacity=1;a.innerHTML='<p style="padding:60px;text-align:center;font-family:Inter,sans-serif">Could not load the catalogue. Please refresh.</p>';}});
    }catch(e){var a=document.getElementById('app');if(a)a.textContent='';}
  }
  if(cfgEl){ try{cfg=JSON.parse(cfgEl.textContent);}catch(e){cfg=null;} if(cfg){go(cfg);return;} }
  fetch('client.json?v='+Date.now()).then(function(r){return r.json();}).then(go).catch(function(e){
    var a=document.getElementById('app');if(a)a.innerHTML='<p style="padding:60px;text-align:center;font-family:Inter,sans-serif">Client config not found.</p>';});
})();
})();
