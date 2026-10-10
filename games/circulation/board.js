/* 혈액 순환 판. 상태 계산 없이 같은 view를 SVG 문자열로 옮긴다. */
(function (root) {
  'use strict';
  const C = root.Circulation || (typeof require !== 'undefined' && require('./circulation.js'));
  const Art = root.ArcadeArt || (typeof require !== 'undefined' && require('../../shared/art/symbols.js'));
  const heart = { x:95, y:133, scale:0.9 };
  const circuit = { pulmonary:'#245b79', systemic:'#774912' };
  const legend = { x:29, y:211, w:70, h:99 };
  const layout = {
    RA: { name:[144,183], oxygen:[136,194], drop:[122,188], dropScale:.4, candidate:[119,320], candidateShared:[147,320] },
    RV: { name:[143,228], oxygen:[157,275], drop:[123,231], dropScale:.4, candidate:[178,308], candidateShared:[206,308] },
    LA: { name:[223,179], oxygen:[205,201], drop:[218,184], dropScale:.35, candidate:[283,289], candidateShared:[311,289] },
    LV: { name:[209.5,234], oxygen:[193,246], drop:[205,255], candidate:[244,316], candidateShared:[272,316] },
    PA1: { x:146, y:105, w:64, h:40, drop:[212,111], candidate:[229,145], candidateShared:[229,117] },
    PA2: { x:146, y:43, w:64, h:40, drop:[134,48], candidate:[246,42], candidateShared:[246,14] },
    PV1: { x:268, y:110, w:64, h:40, drop:[335,119], candidate:[250,133], candidateShared:[346,150] },
    PV2: { x:268, y:158, w:64, h:40, drop:[272,159], dropScale:.3, candidate:[282,255], candidateShared:[310,255] },
    lung: { x:212, y:59, w:142, h:43, name:[276,78], drop:[326,64], candidate:[243,115], candidateShared:[346,120], organ:[277,11,48,45,'lungs'] },
  };
  for (const [id,y] of Object.entries({ brain:330, kidney:377, leg:424 })) {
    const k=C.ORGANS[id].k;
    layout[id]={ x:82,y,w:195,h:44,name:[211,y+15],drop:[96,y+8],candidate:[270,y+6.7],candidateShared:[113,y+10],organ:[124,y,43,40,id==='leg' ? 'leg-muscle' : id] };
    layout['Ao'+k]={ x:291,y:y+3,w:64,h:40,drop:[295,y+4],dropScale:.3,candidate:[307,y+3.5],candidateShared:[277,y+6.5] };
    layout['VC'+k]={ x:4,y:y+3,w:64,h:40,drop:[69,y+28],dropScale:.45,candidate:[43,y+3.5],candidateShared:[80,y+6.5] };
  }
  const point=([x,y]) => [heart.x+x*heart.scale,heart.y+y*heart.scale];
  const ports=Object.fromEntries(Object.entries(Art.HEART.ports).map(([key,p]) => [key,point(p)]));
  const vessels={
    VC:`M14 448V${ports.VC[1]}H${ports.VC[0]}`,
    PA:`M${ports.PA.join(' ')}L184.1 197V54H220V84`,
    PV:`M302 93V${ports.PV[1]}H${ports.PV[0]}`,
    Ao:`M${ports.Ao.join(' ')}H326V448`,
  };
  // 각 경계와 굽이를 짧은 화살표로 나눈다. 긴 L의 상자가 범례를 가로지르지 않게 한다.
  const arrows=[
    'M184.1 155V150', 'M184.1 99V88', 'M213 54H220',
    'M302 103V107', 'M302 152V155', `M265 ${ports.PV[1]}H257`,
    `M258 ${ports.Ao[1]}H277`, `M314 ${ports.Ao[1]}H326V238`, 'M326 305V317',
    'M326 374V377', 'M326 421V424',
    'M14 426V423', 'M14 379V376', 'M14 318V304',
    `M14 185V${ports.VC[1]}H25`, `M94 ${ports.VC[1]}H108`,
    'M165 213L184.1 197V188',
  ];
  for (const y of [354,401,448]) arrows.push(`M290 ${y}H281`,`M81 ${y}H72`);
  const escape=value => String(value).replace(/[&<>"']/g,c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  const text=(x,y,value,cls='',anchor='middle',extra='',fill='var(--ink,#203d39)') => `<text x="${x}" y="${y}" font-size="16" text-anchor="${anchor}" class="${cls}" fill="${fill}"${extra}>${escape(value)}</text>`;
  function oxygen(x,y,key,vertical=false,step=8) {
    return Array.from({length:C.BLOOD[key].oxygen},(_,i) => `<circle cx="${x+(vertical ? 0 : i*step)}" cy="${y+(vertical ? i*step : 0)}" r="2.5" fill="#fff"/>`).join('');
  }
  // 둥근 사각형 윤곽. 강조 밑선을 rect 대신 path로 그려 '그 칸의 rect' 계약을 지킨다.
  const roundRect=(x,y,w,h,r) => `M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;
  const underline=d => `<path class="highlight-outline" d="${d}" fill="none" stroke="var(--outline,#35504a)" stroke-width="7.4"/>`;
  function oxygenPill(x,y,key,vertical=false) {
    const run=(C.BLOOD[key].oxygen-1)*8,w=vertical ? 8 : run+8,h=vertical ? run+8 : 8;
    const left=x-4,top=y-4;
    return `<path class="oxygen-bed" data-blood="${key}" d="M${left+4} ${top}H${left+w-4}Q${left+w} ${top} ${left+w} ${top+4}V${top+h-4}Q${left+w} ${top+h} ${left+w-4} ${top+h}H${left+4}Q${left} ${top+h} ${left} ${top+h-4}V${top+4}Q${left} ${top} ${left+4} ${top}Z" fill="${C.BLOOD[key].color}"/>`+oxygen(x,y,key,vertical);
  }
  function tube(d,blood,extra='') {
    return `<path d="${d}" fill="none" stroke="var(--outline,#35504a)" stroke-width="18.6" stroke-linejoin="round" stroke-linecap="round"/><path ${extra} d="${d}" fill="none" stroke="${C.BLOOD[blood].color}" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  const flow=d => `<path d="${d}" fill="none" stroke="var(--panel,#fffdf5)" stroke-width="2" marker-end="url(#ci-arrow)"/>`;
  function svg(view={}) {
    const {dark=false,labels={},asked=null,current=null,dropSquare='LV',dropBlood='high',candidates=[]}=view;
    let out='<defs><marker id="ci-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10Z" fill="var(--panel,#fffdf5)"/></marker>';
    for (const sq of C.SQUARES.filter(s => s.kind==='capillary')) out+=`<linearGradient id="ci-blood-${sq.id}" x1="${sq.id==='lung' ? '0%' : '100%'}" x2="${sq.id==='lung' ? '100%' : '0%'}"><stop offset="0%" stop-color="${C.BLOOD[sq.bloodIn].color}"/><stop offset="100%" stop-color="${C.BLOOD[sq.bloodOut].color}"/></linearGradient>`;
    out+='</defs><rect width="360" height="470" rx="14" fill="var(--board,#f7fbf1)"/>';
    // 방 이름·경계 답을 미리 알려 주지 않고 두 순환 이름과 테두리 견본만 둔다.
    for (const [key,y,name] of [['pulmonary',18,'폐순환'],['systemic',38,'온몸순환']]) {
      out+=`<rect x="146" y="${y-13}" width="15" height="12" rx="4" fill="none" stroke="${circuit[key]}" stroke-width="${3.4*heart.scale}"/>`;
      out+=text(167,y,name,'circuit-name','start',` data-circuit="${key}"`,circuit[key]);
    }
    out+=text(70,22,'혈액과 O₂ 점(●)')+text(70,45,'산소가 많은 혈액');
    out+=`<rect x="8" y="51" width="124" height="20" rx="6" fill="${C.BLOOD.high.color}" stroke="var(--outline,#35504a)"/>`+oxygen(52,61,'high');
    out+=text(70,91,'산소가 적은 혈액')+`<rect x="8" y="97" width="124" height="20" rx="6" fill="${C.BLOOD.low.color}" stroke="var(--outline,#35504a)"/>`+oxygen(64,107,'low');
    out+=text(70,137,'그림 속 사람이')+text(70,156,'나를 마주 본다');
    out+=`<g transform="translate(${heart.x} ${heart.y}) scale(${heart.scale})"><path class="heart-outline" data-heart-wall="true" d="${Art.HEART.wall}" fill="var(--heart-wall,#ee978b)" stroke="var(--outline,#35504a)" stroke-width="2.3"/><path d="M158 23C180 36 192 87 184 127C176 164 151 196 124 205L128 183Q167 158 172 123Q179 61 150 29Z" fill="var(--shade,#4c4732)" opacity=".16"/></g>`;
    for (const [key,d] of Object.entries(vessels)) out+=tube(d,['VC','PA'].includes(key) ? 'low' : 'high',`data-vessel="${key}"`);
    for (const y of [354,401,448]) out+=tube(`M14 ${y}H82`,'low')+tube(`M277 ${y}H326`,'high');
    out+=arrows.map(flow).join('');
    for (const sq of C.SQUARES) {
      const p=layout[sq.id],blood=C.BLOOD[sq.blood],isAsked=asked?.includes(sq.id);
      const disclosed=!dark && sq.structure && labels[sq.structure];
      const name=sq.kind==='capillary' ? sq.name : disclosed ? C.STRUCTURES[sq.structure].name : '?';
      const aria=sq.kind==='capillary' ? `${sq.name}, 들어올 때 ${C.BLOOD[sq.bloodIn].label}, 나갈 때 ${C.BLOOD[sq.bloodOut].label}` : (disclosed ? name : '이름 없는 '+(sq.kind==='chamber' ? '심장 방' : '혈관'))+', '+blood.label;
      const dash=isAsked ? ' stroke-dasharray="6 4"' : '';
      out+=`<g class="square${isAsked ? ' asked' : !asked && current===sq.id ? ' current' : ''}" data-square="${sq.id}" role="img" aria-label="${escape((isAsked ? '점선으로 표시한 칸, ' : '')+aria)}" data-circuit="${sq.circuit}">`;
      if (sq.kind==='chamber') {
        out+=`<path class="highlight-outline" transform="translate(${heart.x} ${heart.y}) scale(${heart.scale})" d="${Art.HEART.chambers[sq.id]}" fill="none" stroke="var(--outline,#35504a)" stroke-width="7.4"/>`;
        out+=`<path class="chamber" data-chamber="${sq.id}" transform="translate(${heart.x} ${heart.y}) scale(${heart.scale})" d="${Art.HEART.chambers[sq.id]}" fill="${blood.color}" stroke="${circuit[sq.circuit]}" stroke-width="3.4"${dash}/>`;
        // 좁은 초승달 방은 한 글자씩 세로로 쓴다. '?'는 같은 첫 자리에 둔다.
        out+=sq.id==='RV' && disclosed ? [...name].map((letter,i) => text(p.name[0],p.name[1]+i*18,letter,'square-name')).join('') : text(...p.name,name,'square-name');
        out+=oxygen(...p.oxygen,sq.blood);
      } else if (sq.kind==='capillary') {
        // 이 그룹의 마지막 rect는 모세 혈관 전체 자리다. 점의 혈액색 바탕은 path로 둔다.
        out+=underline(roundRect(p.x,p.y,p.w,p.h,10));
        out+=`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="10" fill="var(--panel,#fffdf5)" stroke="var(--outline,#35504a)" stroke-width="2.3"${dash}/>`;
        const cy=p.y+24;
        out+=`<path d="M${p.x+4} ${cy}Q${p.x+p.w*.25} ${cy-12} ${p.x+p.w*.5} ${cy}T${p.x+p.w-4} ${cy}M${p.x+4} ${cy}Q${p.x+p.w*.25} ${cy+12} ${p.x+p.w*.5} ${cy}T${p.x+p.w-4} ${cy}" fill="none" stroke="url(#ci-blood-${sq.id})" stroke-width="3.6"/>`;
        const [ox,oy,ow,oh,organ]=p.organ;
        out+=`<use data-organ="${organ}" href="#art-${organ}" x="${ox}" y="${oy}" width="${ow}" height="${oh}"/>`;
        out+=text(...p.name,sq.id==='lung' ? '폐의' : C.ORGANS[sq.id].name+'의','square-name')+text(p.name[0],p.name[1]+(sq.id==='lung' ? 18 : 16),'모세 혈관','square-name');
        out+=sq.id==='lung' ? oxygenPill(230,67,'low',true)+oxygenPill(348,66,'high',true) : oxygenPill(104,p.y+40,'low')+oxygenPill(217,p.y+40,'high');
      } else {
        // 밑선은 path라 묻는 칸의 모든 rect가 점선이어야 하는 계약을 유지한다.
        out+=underline(roundRect(p.x,p.y,p.w,p.h,6));
        out+=`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="6" fill="${blood.color}" stroke="var(--outline,#35504a)" stroke-width="2.3"${dash}/>`;
        const n=C.BLOOD[sq.blood].oxygen;
        out+=text(p.x+p.w/2,p.y+30,name,'square-name')+oxygen(p.x+p.w-6,p.y+(p.h-(n-1)*7)/2,sq.blood,true,7);
      }
      out+='</g>';
    }
    out+=`<g transform="translate(${heart.x} ${heart.y}) scale(${heart.scale})">`;
    for (const [key,d] of Object.entries(Art.HEART.valves)) out+=`<path class="valve-outline" d="${d}" fill="none" stroke="var(--outline,#35504a)" stroke-width="6.8" stroke-linejoin="round" stroke-linecap="round"/><path class="valve" data-edge="${key==='RV:PA' ? 'RV:PA1' : key==='LV:Ao' ? 'LV:Ao1' : key}" d="${d}" fill="none" stroke="var(--panel,#fffdf5)" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    out+=`</g><g class="co2-legend"><rect x="${legend.x}" y="${legend.y}" width="${legend.w}" height="${legend.h}" rx="12" fill="var(--panel,#fffdf5)" stroke="var(--line-strong,#47645a)"/>`;
    out+=text(64,230,'방울 안')+text(64,247,'○ = CO₂')+text(64,264,'(혈장의')+text(64,281,'이산화')+text(64,298,'탄소)')+'</g>';
    if (!dark) {
      for (const candidate of candidates) {
        const shared=candidates.filter(c => c.square===candidate.square).length>1;
        const [cx,cy]=candidatePoint(candidate,shared);
        out+=`<g><circle class="candidate" cx="${cx}" cy="${cy}" r="12" fill="var(--panel,#fffdf5)" stroke="var(--outline,#35504a)" stroke-width="2.3"/><use href="#art-die-${candidate.steps}" x="${cx-11}" y="${cy-11}" width="22" height="22" aria-hidden="true"/></g>`;
      }
      const p=layout[dropSquare],blood=C.BLOOD[dropBlood],scale=p.dropScale || (C.SQUARES.find(s => s.id===dropSquare).kind==='capillary' ? .6 : .55);
      out+=`<g id="drop" data-square="${dropSquare}" transform="translate(${p.drop.join(' ')}) scale(${scale})" role="img" aria-label="혈액 한 방울, ${blood.label}, 이산화 탄소 ${blood.co2===3 ? '많음' : '적음'}"><path d="M14 0C11 8 0 16 0 25A14 13 0 0 0 28 25C28 16 17 8 14 0" fill="${blood.color}" stroke="#fff" stroke-width="2"/>`;
      const rings=blood.co2===3 ? [[9,23],[19,23],[14,31]] : [[14,26]];
      out+=rings.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="2.5" fill="none" stroke="#fff" stroke-width="1.5"/>`).join('')+'</g>';
    }
    return out;
  }
  function candidatePoint(candidate,shared) {
    const p=layout[candidate.square], [x,y]=p.candidate;
    return shared && candidate.index ? p.candidateShared : [x,y];
  }
  const api={svg,layout,heart,circuit,legend,vessels,ports,arrows,candidatePoint};
  root.CirculationBoard=api;
  if (typeof module!=='undefined') module.exports=api;
})(typeof window!=='undefined' ? window : globalThis);
