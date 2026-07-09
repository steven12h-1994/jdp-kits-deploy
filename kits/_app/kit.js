/* JDP shared kit engine — deployed once at /kits/_app/, used by every client page */
(function(){
/* kit summary + lightbox */
(function(){
var ov=document.createElement('div');ov.id='lb';ov.innerHTML='<img alt="">';document.body.appendChild(ov);
document.querySelectorAll('.stage img,.fpair img,.hc img,.istage .grm').forEach(function(im){
  im.addEventListener('click',function(){ov.querySelector('img').src=im.src;ov.classList.add('on');});});
ov.addEventListener('click',function(){ov.classList.remove('on');});
var rows=[].slice.call(document.querySelectorAll('input.qty'));
var sum=document.getElementById('kitsum'),lines=document.getElementById('kslines'),
    tot=document.getElementById('kstot'),copy=document.getElementById('kscopy');
function money(x){return '$'+x.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g,',');}
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
  var t=0,txt='My kit — '+document.title.split(' — ')[0]+':\\n';
  it.forEach(function(x){t+=x.line;txt+='• '+x.n+' × '+x.q+'  @ '+money(x.p)+' ea = '+money(x.line)+'\\n';
    var c=byName[x.n];if(c){if(c.colour)txt+='   Colour: '+c.colour+'\\n';
      c.decos.forEach(function(dz){txt+='   Logo: '+dz+'\\n';});}});
  txt+='Estimated total: '+money(t)+' (+ one-time setup)\\n';
  function done(){copy.textContent='Copied ✓ — now just reply to our email & paste';
    location.hash='#start';}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,function(){fallback(txt);done();});}
  else{fallback(txt);done();}
  function fallback(s){var ta=document.createElement('textarea');ta.value=s;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);}});
})();
/* product cards: colour / view / multi-decoration */
(function(){
function gurl(o,f){return (o.cbase?o.cbase+'/img/':'img/')+f+'?v='+o.ver;}
function logoOf(o,id){for(var i=0;i<o.logos.length;i++){if(o.logos[i].id===id)return o.logos[i];}return o.logos[0]||{inks:{}};}
function hexLum(h){h=(h||'').replace('#','');if(h.length<6)return 128;var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return 0.299*r+0.587*g+0.114*b;}
function autoInk(col){return hexLum(col.rgb)<120?'white':'brand';}   // contrast-safe default per garment colour
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
  function ver(u){return /^data:/.test(u)?u:u+'?v='+o.ver;}   // don't append ?v to uploaded data-URLs
  var st={ci:0,face:'front',decos:{}};
  (o.decos||[]).forEach(function(d){st.decos[d.pl]={on:!!d.on,lg:d.lg,ink:d.ink||'auto',method:d.method||'embroidery'};});
  var onSw=wrap.querySelector('.sw.on'); if(onSw)st.ci=parseInt(onSw.dataset.ci,10)||0;
  // preload colour fronts+backs during idle so swaps are instant without blocking first paint
  var _pl=function(){o.cols.forEach(function(c){[c.front,c.back].forEach(function(f){if(f){var im=new Image();im.src=gurl(o,f);}});});};
  (window.requestIdleCallback?requestIdleCallback(_pl,{timeout:2500}):setTimeout(_pl,700));
  var lastPhoto=grm?grm.getAttribute('src'):null, first=true, tmr=null;
  function setPhoto(url){                                  // cross-fade the garment photo
    if(!grm||!url||url===lastPhoto){return;} lastPhoto=url;
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
    // render EVERY active decoration on the current face simultaneously
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
      if(p&&p.face==='back'&&!col.back){return;}          // this colour has no back photo — can't decorate back
      var d=st.decos[pid]||(st.decos[pid]={on:false,lg:(o.logos[0]||{}).id,ink:'auto',method:'embroidery'});
      d.on=!d.on;
      if(d.on&&p){st.face=(p.face==='back')?'back':'front';}   // jump to the side you just decorated
      render();
    });
    var lgs=row.querySelector('.dlgs');
    if(lgs)lgs.addEventListener('click',function(e){var b=e.target.closest('.dlg');if(!b)return;var d=st.decos[pid];if(!d)return;d.lg=b.dataset.lg;render();});
    row.querySelectorAll('.dink').forEach(function(b){b.addEventListener('click',function(){var d=st.decos[pid];if(!d)return;d.ink=b.dataset.ink;render();});});
    var mb=row.querySelector('.dmeth');if(mb)mb.addEventListener('click',function(){var d=st.decos[pid];if(!d)return;var i=METHODS.indexOf(d.method||'embroidery');d.method=METHODS[(i+1)%METHODS.length];render();});
  });
  // CUSTOMER LOGO UPLOAD hook: a global upload swaps this card's logo everywhere
  (window.__JDPUP=window.__JDPUP||[]).push(function(L){
    var f=-1;for(var i=0;i<o.logos.length;i++)if(o.logos[i].id===L.id)f=i;
    if(f>=0)o.logos[f]=L;else o.logos.push(L);
    Object.keys(st.decos).forEach(function(p){st.decos[p].lg=L.id;st.decos[p].ink='auto';});
    wrap.querySelectorAll('.dlgs').forEach(function(el){el.textContent='';});   // force thumb rebuild
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
      btn.textContent='\\u2713 Your logo \\u00b7 replace';
      if(note)note.textContent='Your logo is on every item \\u2014 tap any spot to fine-tune. We refine the artwork before production.';}
    catch(e){if(note)note.textContent='That image did not process \\u2014 try a PNG or JPG with a plain background.';}};
  img.onerror=function(){if(note)note.textContent='Could not read that file. Try a PNG or JPG.';};
  img.src=url;});
function processLogo(img){
  var MAX=1100,w=img.naturalWidth||300,h=img.naturalHeight||300,s=Math.min(1,MAX/Math.max(w,h)),i;
  w=Math.max(1,Math.round(w*s));h=Math.max(1,Math.round(h*s));
  var c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
  x.drawImage(img,0,0,w,h);var d=x.getImageData(0,0,w,h),p=d.data;
  var trans=0;for(i=3;i<p.length;i+=4){if(p[i]<250)trans++;}
  if(trans<=w*h*0.02){                       // no real alpha -> knock out the near-uniform bg sampled at corners
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
(()=>{const d=document,s=d.createElement("script");s.type="module";s.src="https://w.behold.so/widget.js";d.head.append(s);})();
})();