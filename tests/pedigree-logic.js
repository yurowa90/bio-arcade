// 가계도 생성기: 고정 문제 회귀, 독립 유전 계산, 도전별 2,000개 시드 전수 검사.
// 실행: node tests/pedigree-logic.js (기본 2,000시드), --quick (200시드)
// --rebuild-candidates: 재탐색·대조 뒤 후보표 JS만 stdout, 진행·시간은 stderr. 파일을 쓰지 않는다.
// --verify-candidates: 같은 재탐색으로 행·순서·값을 대조한다(기본 검사와 별도, 수 분).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../games/pedigree/pedigree.js');
// 후보표 재생성은 원래 탐색 당시의 승인·깊이 계산도 재현해야 한다.
// 고친 규칙을 과거 탐색에 바로 적용하면 난수 소비 순서와 후보 순서가 달라진다.
// 아래 호환 변환은 재생성 전용 복사본에만 적용하며 놀이용 모듈은 바꾸지 않는다.
function replaceExactly(source, from, to) {
  assert.equal(source.split(from).length, 2, '재생성 계측/과거 규칙 위치가 달라짐: ' + from);
  return source.replace(from, to);
}
function loadCandidateTools(historical = false) {
  let source = fs.readFileSync(path.join(__dirname, '../games/pedigree/pedigree.js'), 'utf8');
  if (historical) {
    source = replaceExactly(source, "            [premise(m), proofKey(p.id, 'noA')], p.sex === 'F' ? 'X4' : 'X_MOTHER');\n", "            [premise(m), proofKey(p.id, 'noA')], 'X_MOTHER');\n");
    source = replaceExactly(source, "            if (selected.length >= Math.max(0, required)) {\n              const maximum = c.ids.length - new Set([...selected, ...males]).size;\n", "            if (selected.length >= Math.max(0, required)) {\n");
    source = replaceExactly(source, "                : `${exclusion} 카드 ${cardNumber(i + 1)}의 ${listed(c.ids)} 가운데 ${maximum === 0 ? '보인자가 될 수 있는 사람이 없는데' : `보인자가 될 수 있는 사람은 최대 ${maximum}명인데`} ${c.k}명이라고 했으므로 모순이다.`;\n", "                : `${maleReason}${listed(selected)}은 이 가정에서 보인자가 될 수 없다. 카드 ${cardNumber(i + 1)}의 ${listed(c.ids)} 가운데 ${c.ids.length === selected.length ? '보인자가 될 수 있는 사람이 없는데' : `보인자가 될 수 있는 사람은 최대 ${c.ids.length - selected.length}명인데`} ${c.k}명이라고 했으므로 모순이다.`;\n");
    source = replaceExactly(source, "        } else {\n          if (yes.length === c.k) {\n            for (const id of [...no, ...unknown]) add(id, 'noA', 'C1',\n              `카드 ${cardNumber(i + 1)}의 ${listed(c.ids)} 중 ${yes.length ? `보인자 ${c.k}명이 ${listed(yes)}으로 정해졌으므로` : '보인자는 0명이므로'} ${conclude(id, 'noA')}`,\n              c.ids, [i + 1], yes.map(id => proofKey(id, 'hasA')));\n          }\n          if (yes.length + unknown.length === c.k) {\n            for (const id of [...yes, ...unknown]) add(id, 'hasA', 'C2',\n              `카드 ${cardNumber(i + 1)}의 ${listed(c.ids)} 중 보인자는 ${c.k}명이고, ${maleReason}${no.length ? listed(no) + `은 ${allele}가 없으므로 제외하면 ` : ''}보인자가 될 수 있는 사람은 ${listed([...yes, ...unknown])}뿐이므로 ${conclude(id, 'hasA')}`,\n              c.ids, [i + 1], no.map(id => proofKey(id, 'noA')));\n          }\n", "        } else if (yes.length === c.k) {\n          for (const id of unknown) add(id, 'noA', 'C1',\n            `카드 ${cardNumber(i + 1)}의 ${listed(c.ids)} 중 ${yes.length ? `보인자 ${c.k}명이 ${listed(yes)}으로 정해졌으므로` : '보인자는 0명이므로'} ${conclude(id, 'noA')}`,\n            c.ids, [i + 1], yes.map(id => proofKey(id, 'hasA')));\n        } else if (yes.length + unknown.length === c.k) {\n          for (const id of unknown) add(id, 'hasA', 'C2',\n            `카드 ${cardNumber(i + 1)}의 ${listed(c.ids)} 중 보인자는 ${c.k}명이고, ${maleReason}${no.length ? listed(no) + `은 ${allele}가 없으므로 제외하면 ` : ''}보인자가 될 수 있는 사람은 ${listed([...yes, ...unknown])}뿐이므로 ${conclude(id, 'hasA')}`,\n            c.ids, [i + 1], no.map(id => proofKey(id, 'noA')));\n");
    source = replaceExactly(source, "          if (yes.length === c.k) [...no, ...unknown].forEach(i => set(i, 2, Math.max(0, ...yes.map(j => depth[j]))));\n          if (yes.length + unknown.length === c.k) [...yes, ...unknown].forEach(i => set(i, 1, Math.max(0, ...no.map(j => depth[j]))));", "          if (yes.length === c.k) unknown.forEach(i => set(i, 2, Math.max(0, ...yes.map(j => depth[j]))));\n          else if (yes.length + unknown.length === c.k) unknown.forEach(i => set(i, 1, Math.max(0, ...no.map(j => depth[j]))));");
  }
  source = replaceExactly(source, 'return () => {\n      state', 'const random = () => {\n      state');
  source = replaceExactly(source, '    };\n  }\n  function shuffle',
    '    };\n    random.state = () => state; return random;\n  }\n  function shuffle');
  source = replaceExactly(source, 'const api = {',
    'const api = { candidate, seededRandom, cardCandidates, cardSets, candidateProbe, accepted, shapeId, layoutFits, CANDIDATE_RECIPES,');
  // 같은 Node/V8의 sort와 수학 연산을 쓴다. 브라우저 전역과 require 캐시는 건드리지 않는다.
  return vm.compileFunction('const module = { exports: {} }; const window = {};\n' + source + '\nreturn module.exports;')();
}

// 탐색: 상염색체 561821/60,000회, X 182763/800,000회.
// 골격·전달·성비 → 배치 → 카드 탐색 → 빠른 검사 → 독립 승인 순서.
// 모양+카드 중복은 제외하고 카드 종류별 한 골격당 최대 3개를 채택한다.
function collectCandidates(P, mode) {
  const limit = mode === 'x' ? 800000 : 60000;
  const random = P.seededRandom(mode === 'x' ? 182763 : 561821);
  const out=[],seen=new Set();
  for(let i=0;i<limit;i++){
    const femaleTest = mode==='x' && random()<.015;
    const n=femaleTest?13:10+Math.floor(random()*4),fem=n===13?(random()<.65?8:6):n===12?(random()<.3?7:6):6;
    const want=!femaleTest&&mode==='x'&&n>=11&&random()<.08;
    random.targetPeople=n;const state=random.state();
    const data=P.candidate(random,mode, want?7:fem,want,femaleTest);
    const ped={people:data.people,couples:data.couples,mode,modeHidden:true,cards:[],trait:'형질 (가) · 열성(유전 방식 숨김)'};
    if(!P.layoutFits(ped))continue;
    if(mode==='x' && ped.people.some(p=>p.sex==='F'&&p.affected)!==want)continue;
    const children=ped.people.filter(p=>p.parents),ratio=children.filter(p=>p.sex==='F').length/children.length;
    if(mode==='x'&&ratio>.75)continue;
    const pool=P.cardCandidates(ped,data.witness),probe=P.candidateProbe(ped);
    const typesList=n===13?[[],['noA'],['noA','count'],['count','count']]:[[],['noA'],['count']];
    const shape=P.shapeId(ped);
    for(const types of typesList){
      let count=0;
      for(const cards of P.cardSets(ped,pool,types,random)){
        ped.cards=cards;if(!probe(cards))continue;
        const hidden=cards.length>0&&P.accepted(ped);
        const visible=P.accepted({...ped,modeHidden:false});
        if(!hidden&&!visible)continue;
        const key=shape+'|'+JSON.stringify(cards);if(seen.has(key))continue;seen.add(key);
        const recipe=[state,n,want?7:fem,+want,cards.map(c=>c.type==='noA'?Number(c.id.slice(1)):[c.k,...c.ids.map(id=>Number(id.slice(1)))]) , +femaleTest];
        const solved=P.solve(ped),d=P.deduce(ped),byId=Object.fromEntries(ped.people.map(p=>[p.id,p]));
        const male=ped.people.filter(p=>p.affected).every(p=>p.sex==='M');
        const married=ped.people.filter(p=>!p.parents&&p.gen>0);
        const carrierSons=children.filter(p=>p.sex==='M'&&data.witness[p.parents[1]]==='Aa');
        const deep=d.must.filter(id=>d.minimumGeneticDepth[id]>=2);
        function chain(key,seen=new Set()){if(seen.has(key))return[];seen.add(key);const s=d.steps.find(s=>s.key===key);return s?[...s.premises.flatMap(k=>chain(k,seen)),s]:[];}
        const grandma=deep.every(id=>chain(id+':hasA').filter(s=>/^(A[2-5]|X[1-5])$/.test(s.rule)).map(s=>s.rule).join()==='X1,X3');
        out.push({recipe,shape,hidden,visible,n,femaleAffected:!male,male,ratio,children:children.length,descF:children.filter(p=>p.sex==='F').length,grandma,
          spouses:married.length,normalSpouses:married.filter(p=>['AA','AY'].includes(data.witness[p.id])).length,sons:carrierSons.length,affSons:carrierSons.filter(p=>p.affected).length,
          features:{cardCount:cards.length,cardKinds:cards.map(c=>c.type).sort().join('+'),testSex:cards.filter(c=>c.type==='noA').map(c=>byId[c.id].sex).join()||'none',testGeneration:cards.filter(c=>c.type==='noA').map(c=>byId[c.id].gen).join()||'none',zeroCount:cards.some(c=>c.type==='count'&&c.k===0),groupSize:cards.filter(c=>c.ids).map(c=>c.ids.length).sort().join('+')||'none',affectedCount:ped.people.filter(p=>p.affected).length,allMaleAffected:male,affectedFemale:!male,femaleRatioBin:Math.floor(ratio*10),people:n,founderAffected:ped.people.some(p=>p.gen===0&&p.affected),femaleCount:ped.people.filter(p=>p.sex==='F').length,testPresent:cards.some(c=>c.type==='noA'),countPresent:cards.some(c=>c.type==='count'),firstCountZero:cards.find(c=>c.type==='count')?.k===0}});
        if(++count>=3)break;
      }
    }
  }
  return out;
}

// 재승인 뒤 가중치를 계산한다. 모양별 역빈도로 시작해 350번 조정하고,
// 모양별 질량은 0.018로 제한한 뒤 정규화한다. 도전 1 X는 균등 모양 20%를 섞는다.
// LCG 시드 3716623과 당시 V8 sort 비교기 호출 순서를 보존하므로 Node 24.21.0을 쓴다.
// 각각 4,096회 가중 추출한 횟수를 정수 가중치로 합친다.
// 3차 → 5차 → 6차 조정에서 이전 표의 공통 행 순서를 유지한 이력도 다시 계산한다.
function fitCandidates(valid, stage, prior = {}) {
  let randomState=3716623;function random(){randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/2**32}
  const banks={};
  function fit(rows,constraints,moments,diverse=false){
    const frequencies={};rows.forEach(r=>frequencies[r.shape]=(frequencies[r.shape]||0)+1);
    let w=rows.map(r=>1/frequencies[r.shape]);
    const normalize=()=>{const sum=w.reduce((a,b)=>a+b,0);w=w.map(v=>v/sum)};normalize();
    const cs=constraints.map(([fn,target])=>{const groups={};rows.forEach((r,i)=>{const k=String(fn(r));(groups[k]||=[]).push(i)});return {groups,target};});
    const ms=moments.map(([fn,target,direction])=>({values:rows.map(fn),target,direction}));
    for(let it=0;it<350;it++){
      for(const {groups,target} of cs){for(const [k,indices] of Object.entries(groups)){const sum=indices.reduce((a,i)=>a+w[i],0),goal=target[k]||0;const factor=sum?goal/sum:0;for(const i of indices)w[i]*=Math.pow(factor,.6);}normalize();}
      for(const {values,target,direction}of ms){const mean=w.reduce((a,v,i)=>a+v*values[i],0),variance=w.reduce((a,v,i)=>a+v*(values[i]-mean)**2,0);if(direction==='min'&&mean>=target||direction==='max'&&mean<=target)continue;const delta=Math.max(-1,Math.min(1,(target-mean)/(variance||1)));w=w.map((v,i)=>v*Math.exp(delta*(values[i]-mean)*.4));normalize();}
      const sw={};rows.forEach((r,i)=>sw[r.shape]=(sw[r.shape]||0)+w[i]);
      w=w.map((v,i)=>v*Math.min(1,.018/sw[rows[i].shape]));normalize();
    }
    if(diverse && stage >= 5){
      const shapeSizes={};rows.forEach(r=>{(shapeSizes[r.n] ||= new Set()).add(r.shape)});
      w=w.map((v,i)=>.8*v+.2*size[rows[i].n]/shapeSizes[rows[i].n].size/frequencies[rows[i].shape]);normalize();
    }
    const indices=rows.map((_,i)=>i).sort(()=>random()-.5),chosen=[];let accum=0,at=0;
    const count=4096;
    for(const i of indices){accum+=w[i];while(at<count&&(at+.5)/count<accum){chosen.push(rows[i]);at++;}}
    return{chosen};
  }
  const size={10:.12,11:.13,12:.20,13:.55};
  for(const challenge of [1,2]){
    const raw=valid.x.filter(r=>r[challenge===1?'visible':'hidden']);
    const constraints=[[r=>r.n,size],[r=>+r.grandma,challenge===1 && stage>=5?{0:.5,1:.5}:{0:.47,1:.53}],[r=>+r.femaleAffected,{0:.95,1:.05}],
      [r=>r.features.cardCount,challenge===1?(stage>=5?{0:.40,2:.60}:{0:.44,2:.56}):{1:.55,2:.45}]];
    if(challenge===2)constraints.push([r=>r.features.testSex,{M:.5,F:.03,none:.47}]);
    const fitted=fit(raw,constraints,[[r=>r.descF-.585*r.children,0,'max'],[r=>r.normalSpouses-.85*r.spouses,0,'min'],[r=>r.affSons-(challenge===2 && stage===6?.49:.51)*r.sons,0,'max'],[r=>r.affSons-.44*r.sons,0,'min']],challenge===1);
    banks[challenge+'/x']=fitted.chosen;
    const marginal=name=>{const counts={};fitted.chosen.forEach(r=>counts[r.features[name]]=(counts[r.features[name]]||0)+1/fitted.chosen.length);return counts};
    const autos=valid.auto.filter(r=>r[challenge===1?'visible':'hidden']);
    const ac=[[r=>r.n,size]];
    if(challenge===1)ac.push([r=>r.features.testPresent,{true:.85,false:.15}]);
    else{
      ac.push([r=>+r.male,{0:.52,1:.48}]);
      for(const name of ['cardKinds','zeroCount','groupSize','affectedCount','femaleRatioBin','founderAffected'])ac.push([r=>r.features[name],marginal(name)]);
      ac.push([r=>r.features.testSex,{M:.32,F:.26,none:.42}]);
      ac.push([r=>r.features.testGeneration,{'0':.36,'1':.14,'2':.03,none:.47}]);
      ac.push([r=>r.features.testPresent,{true:.59,false:.41}]);
      ac.push([r=>r.n,size]);
    }
    const af=fit(autos,ac,[[r=>r.normalSpouses-.85*r.spouses,0,'min']]);banks[challenge+'/auto']=af.chosen;
  }
  const output={};for(const mode of ['auto','x']){const unique=new Map();for(const challenge of [1,2])for(const r of banks[challenge+'/'+mode]){const key=JSON.stringify(r.recipe);if(!unique.has(key))unique.set(key,[...r.recipe.slice(0,5),r.recipe[5]||0,0,0]);unique.get(key)[5+challenge]++;}const old=(prior[mode] || []);
   const order=new Map(old.map((r,i)=>[JSON.stringify(r.slice(0,6)),i]));
   output[mode]=[...unique.values()].sort((a,b)=>(order.get(JSON.stringify(a.slice(0,6)))??1e9)-(order.get(JSON.stringify(b.slice(0,6)))??1e9));}
  return output;
}

function rebuildCandidates() {
  assert.equal(process.versions.node, '24.21.0', '후보표 재생성은 fnm Node 24.21.0으로 실행한다');
  const historical = loadCandidateTools(true), current = loadCandidateTools(), valid = {};
  for (const mode of ['auto', 'x']) {
    const rows = collectCandidates(historical, mode);
    for (const row of rows) {
      const [state, n, females, daughter, codes, femaleTest] = row.recipe;
      const random = current.seededRandom(state); random.targetPeople = n;
      const ped = { ...current.candidate(random, mode, females, !!daughter, !!femaleTest), mode, modeHidden: true,
        cards: codes.map(c => typeof c === 'number' ? { type: 'noA', id: 'p' + c }
          : { type: 'count', k: c[0], ids: c.slice(1).map(id => 'p' + id) }),
        trait: '형질 (가) · 열성(유전 방식 숨김)' };
      row.visible = row.visible && current.accepted({ ...ped, modeHidden: false });
      row.hidden = row.hidden && current.accepted(ped);
    }
    valid[mode] = rows.filter(row => row.visible || row.hidden);
    console.error(JSON.stringify({ candidateSearch: mode, collected: rows.length, approved: valid[mode].length }));
  }
  const third = fitCandidates(valid, 3);
  const fifth = fitCandidates(valid, 5, third);
  return fitCandidates(valid, 6, fifth);
}
function candidateFragment(rows) {
  return '  const CANDIDATE_RECIPES = {\n' + ['auto', 'x'].map(mode =>
    '    ' + mode + ': [\n' + rows[mode].map(row => '      ' + JSON.stringify(row) + ',\n').join('') + '    ],\n').join('') + '  };\n';
}
if (process.argv.includes('--rebuild-candidates') || process.argv.includes('--verify-candidates')) {
  const started = performance.now();
  try {
    const rebuilt = rebuildCandidates();
    // 검증 대상 표를 탐색·가중치·정렬의 입력으로 쓰지 않는다.
    assert.deepEqual(rebuilt, JSON.parse(JSON.stringify(loadCandidateTools().CANDIDATE_RECIPES)), '후보표의 행·순서·값 변경');
    if (process.argv.includes('--rebuild-candidates')) process.stdout.write(candidateFragment(rebuilt));
    console.error(JSON.stringify({ verifiedCandidateRows: rebuilt.auto.length + rebuilt.x.length,
      elapsedSeconds: (performance.now() - started) / 1000 }));
  } catch (error) {
    console.error('후보표 재생성 실패: 기존 표를 바꾸지 않는다. ' + error.stack);
    process.exitCode = 1;
  }
} else {
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + ' — ' + e.stack); }
}
const plain = x => JSON.parse(JSON.stringify(x));
const hash = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
// 정리 시작 전 생성 결과. 구분자 없이 아래 순서의 JSON 문자열을 이어 붙인다.
// 묶음: seed 0~499 → 도전 1·2, 단일: 도전 1·2 → auto·x → seed 0~199.
const GENERATION_FINGERPRINT = '82732f5b5c377c086c91a10da44736f40d3c7f2e6c23b0286d01d61162491bcf';
test('생성 결과 JSON 회귀 지문: 묶음 1,000개·단일 800개', () => {
  const digest = crypto.createHash('sha256');
  for (let seed = 0; seed < 500; seed++) for (const challenge of [1, 2])
    digest.update(JSON.stringify(P.makeBundle(seed, challenge)));
  for (const challenge of [1, 2]) for (const mode of ['auto', 'x']) for (let seed = 0; seed < 200; seed++)
    digest.update(JSON.stringify(P.generate(seed, { challenge, mode })));
  const actual = digest.digest('hex');
  assert.equal(actual, GENERATION_FINGERPRINT);
  console.log(JSON.stringify({ generationFingerprint: actual }));
});

// 사실 번호의 누락·범위 오류·추론 결과와 다른 번호를 모두 잡는다.
function validateModeConclusions(ped, walk = P.walkthrough(ped)) {
  const conclusions = walk.modeSteps.filter(step => step.text.includes('모순이므로'));
  assert.equal(conclusions.length, 1);
  const expected = P.deduce(ped, opposite(ped.mode)).contradiction.facts;
  for (const step of conclusions) {
    const matches = [...step.text.matchAll(/\(사실 [1-4](·[1-4])*\)/g)];
    assert.equal(matches.length, 1, '판단 결론의 사실 번호 형식');
    const facts = matches[0][0].slice(4, -1).split('·').map(Number);
    assert.deepEqual(facts, expected);
    assert.deepEqual(facts, step.facts);
    assert.deepEqual(facts, walk.modeSteps.at(-1).facts);
  }
}

const repeatedCarrierExclusion = /(\d+번(?:, \d+번)*)[^.]*보인자가 될 수 없[^.]*\1[^.]*보인자가 될 수 없/;
function validateExclusionText(text) {
  assert(!repeatedCarrierExclusion.test(text), `보인자 제외 대상 반복: ${text}`);
}
function validateConflictSource(ped, conflict) {
  if (!conflict || !/단서(?:와 모순|가 함께)/.test(conflict.text)) return;
  const number = Number([...conflict.text.matchAll(/(\d+)번에게/g)].at(-1)?.[1]);
  const person = ped.people.find((p, i) => (p.num || i + 1) === number);
  const source = conflict.steps.find(s => s.key === `${person?.id}:noA`);
  assert.equal(source?.rule, 'T', `끌어낸 결론을 카드 단서로 부름: ${conflict.text}`);
  assert(source.cards.some(n => ped.cards[n - 1]?.type === 'noA' && ped.cards[n - 1].id === person.id));
}
function validateAssumptionText(walk) {
  // 검사 카드(T)의 원문은 그대로 두고, 가정에서 끌어낸 noA 결론만 검사한다.
  for (const step of walk.modeSteps) if (['MALE', 'A5', 'X5', 'C1'].includes(step.rule))
    assert(!/에게는 (?:a|색맹 대립유전자)가 없다\.$/.test(step.text), `가정 속 noA 단정: ${step.text}`);
}
function validateWording(ped, d = P.deduce(ped), walk = P.walkthrough(ped), explanation = P.explain(ped)) {
  const deductions = [d, P.deduce(ped, opposite(ped.mode))];
  for (const result of deductions) {
    result.steps.forEach(s => validateExclusionText(s.text));
    if (result.contradiction) {
      validateExclusionText(result.contradiction.text);
      result.contradiction.steps.forEach(s => validateExclusionText(s.text));
      validateConflictSource(ped, result.contradiction);
    }
  }
  [...walk.modeSteps, ...walk.steps].forEach(s => validateExclusionText(s.text));
  if (walk.modeSteps.length) validateConflictSource(ped, { ...deductions[1].contradiction, text: walk.modeSteps.at(-1).text });
  Object.values(explanation).forEach(e => e.chain.forEach(validateExclusionText));
  validateAssumptionText(walk);
}

// 변경 전 f61ee6b에서 확보한 데이터 지문과 답. 생성기에서 정답을 만들지 않는다.
const legacy = [
  ['5af84af8c405fc0b9e5973d0caa03b9fb79222f73cd3251d043d6487472f184b', { count: 4, must: ['f', 'm'], maybe: ['c2', 'c3'] }],
  ['222cdc72f85de4f57c0cb588937a28622370774bcb72a43a05c26b722d7593c2', { count: 4, must: ['d1', 's1', 'h1'], maybe: ['gm', 'k2'] }],
  ['739108b152b5a82f12447a5a43a53b2c427cdb4adf795811c0fbddbcf6c44cf1', { count: 2, must: ['gm', 'd1'], maybe: ['k2'] }],
  ['4cef3acbee57a4f3a151c34a42e7331b9a9d360926a96645143e4372087b3f18', { count: 8, must: ['d1', 'w1'], maybe: ['gm', 'k2', 'k4'] }],
];

// 독립 기준: 열성 대립유전자의 수(0/1/2)를 쓰고 모든 표현형 조합을 먼저 열거한다.
// solve의 부모 우선 가지치기·카드 하한 가지치기·유전자 문자열 함수를 공유하지 않는다.
function reference(ped, mode = ped.mode) {
  const people = ped.people, x = mode === 'x', n = people.length;
  const index = new Map(people.map((p, i) => [p.id, i]));
  const choices = people.map(p => x && p.sex === 'M' ? [p.affected ? 1 : 0] : p.affected ? [2] : [0, 1]);
  const cells = copies => copies === 0 ? [0] : copies === 1 ? [0, 1] : [1];
  const carrierCounts = people.map(() => 0), hasCounts = people.map(() => 0), assigned = [];
  const parents = people.map(p => p.parents?.map(id => index.get(id)));
  const cards = (ped.cards || []).map(c => ({ ...c, indices: (c.ids || [c.id]).map(id => index.get(id)) }));
  const witness = ped.generation?.witness;
  let count = 0, witnessFound = false;
  const carrier = j => !people[j].affected && !(x && people[j].sex === 'M') && assigned[j] === 1;
  function visit(i) {
    if (i < n) { for (const g of choices[i]) { assigned[i] = g; visit(i + 1); } return; }
    for (let j = 0; j < n; j++) {
      if (!parents[j]) continue;
      const [fi, mi] = parents[j], father = assigned[fi], mother = assigned[mi];
      if (x && people[j].sex === 'M') { if (!cells(mother).includes(assigned[j])) return; }
      else if (!(x ? [father] : cells(father)).some(a => cells(mother).some(b => a + b === assigned[j]))) return;
    }
    for (const c of cards) {
      if (c.type === 'noA' && assigned[c.indices[0]] !== 0) return;
      if (c.type === 'count' && c.indices.filter(carrier).length !== c.k) return;
    }
    count++;
    for (let j = 0; j < n; j++) { if (carrier(j)) carrierCounts[j]++; if (assigned[j]) hasCounts[j]++; }
    if (witness && people.every((p, j) => [...witness[p.id]].filter(a => a === 'a').length === assigned[j])) witnessFound = true;
  }
  visit(0);
  return { solution: { count, must: people.filter((p, i) => count > 0 && carrierCounts[i] === count).map(p => p.id),
    maybe: people.filter((p, i) => carrierCounts[i] > 0 && carrierCounts[i] < count).map(p => p.id) },
  hasCounts: Object.fromEntries(people.map((p, i) => [p.id, hasCounts[i]])), witnessFound };
}

const numberIds = (ped, ids) => ids.map(id => ped.people.find(p => p.id === id).num).sort((a, b) => a - b);
const canCarry = (p, mode) => !p.affected && (mode !== 'x' || p.sex === 'F');
const opposite = mode => mode === 'x' ? 'auto' : 'x';
const forbidden = /여러 단서를 종합|동형\s*접합|이형\s*접합|DNA\s*상대량/;
const quick = process.argv.includes('--quick'), seedCount = quick ? 200 : 2000, bundleCount = quick ? 50 : 2000;
const started = performance.now();

// 설계의 P1·P2·P3. 생성기 데이터·도우미로 만들지 않는 독립 고정 문제다.
function fixture(rows, mode, cards, modeHidden = false) {
  const people = rows.map(([sex, affected, parents], i) => ({ id: String(i + 1), num: i + 1, sex,
    affected: !!affected, gen: parents ? (i >= (rows.length === 10 ? 8 : 9) ? 2 : 1) : (i === 8 ? 1 : 0),
    x: i, ...(parents ? { parents: parents.map(String) } : {}) }));
  const couples = [...new Map(people.filter(p => p.parents).map(p => [p.parents.join(), p.parents])).values()];
  return { title: '견본', mode, trait: modeHidden ? '형질 (가) · 열성(유전 방식 숨김)' : mode === 'x' ? '적록 색맹(X 염색체 열성)' : '열성 유전병(상염색체)', people, couples, cards, modeHidden };
}
const P1 = fixture([
  ['M', 1], ['F'], ['M'], ['F'], ['F', 0, [1, 2]], ['M', 0, [1, 2]],
  ['F', 0, [3, 4]], ['M', 0, [3, 4]], ['M', 1, [6, 7]], ['F', 0, [6, 7]],
], 'auto', [{ type: 'noA', id: '4' }]);
const P2 = fixture([
  ['M'], ['F'], ['M'], ['F'], ['F', 0, [1, 2]], ['F', 0, [1, 2]], ['M', 0, [3, 4]],
  ['F', 0, [3, 4]], ['M'], ['M', 1, [7, 6]], ['F', 0, [7, 6]], ['F', 0, [9, 8]], ['F', 0, [9, 8]],
], 'x', [{ type: 'noA', id: '8' }, { type: 'count', ids: ['4', '12'], k: 1 }]);
const P3 = fixture([
  ['M'], ['F'], ['M'], ['F'], ['F', 0, [1, 2]], ['F', 0, [1, 2]], ['M', 0, [3, 4]],
  ['F', 0, [3, 4]], ['F', 0, [3, 4]], ['M', 1, [7, 6]], ['F', 0, [7, 6]], ['M', 0, [7, 6]],
], 'x', [{ type: 'noA', id: '7' }], true);

// 유전 규칙은 쓰지 않는다. k명 부분집합을 재귀로 만든 뒤 카드 산수만 검사한다.
function guessModel(ped, k) {
  const excluded = new Set(ped.cards.filter(c => c.type === 'noA').map(c => c.id));
  const ids = ped.people.filter(p => canCarry(p, ped.mode) && !excluded.has(p.id)).map(p => p.id);
  const sets = [], chosen = [];
  function visit(at) {
    if (chosen.length === k) {
      if (ped.cards.filter(c => c.type === 'count').every(c => c.ids.filter(id => chosen.includes(id)).length === c.k)) sets.push(chosen.slice());
      return;
    }
    for (let i = at; i <= ids.length - (k - chosen.length); i++) { chosen.push(ids[i]); visit(i + 1); chosen.pop(); }
  }
  visit(0);
  return { n: ids.length, k, ways: sets.length, chance: 1 / sets.length,
    forced: ids.filter(id => sets.every(set => set.includes(id))) };
}

function validateLayout(ped) {
  const ps = ped.people, byId = Object.fromEntries(ps.map(p => [p.id, p]));
  const X = p => 24 + 40 * p.x, Y = p => 40 + 105 * p.gen;
  const segments = [], spans = [];
  for (const [fid, mid] of ped.couples) {
    const f = byId[fid], m = byId[mid];
    assert(f && m); assert.equal(f.sex, 'M'); assert.equal(m.sex, 'F'); assert.equal(f.gen, m.gen);
    assert(!ps.some(p => p !== f && p !== m && p.gen === f.gen && p.x > Math.min(f.x, m.x) && p.x < Math.max(f.x, m.x)));
    const kids = ps.filter(p => p.parents?.join() === [fid, mid].join());
    assert(kids.length);
    const center = (X(f) + X(m)) / 2, y = Y(f), xs = kids.map(X);
    const left = Math.min(center, ...xs), right = Math.max(center, ...xs);
    spans.push({ gen: f.gen, left, right });
    segments.push([X(f), y, X(m), y], [center, y, center, y + 52], [left, y + 52, right, y + 52]);
    for (const p of kids) segments.push([X(p), y + 52, X(p), Y(p) - 16]);
  }
  for (const p of ps) {
    assert(p.x >= 0.4 && p.x <= 7.4);
    assert(Number.isInteger(p.gen) && p.gen >= 0 && p.gen <= 2);
    assert(X(p) - 25 >= 0 && X(p) + 25 <= 360);
    assert(Y(p) - 25 >= 0 && Y(p) + 40 <= 300);
    for (const q of ps) if (q !== p && p.gen === q.gen) assert(Math.abs(X(p) - X(q)) >= 50 - 1e-8);
    if (p.parents) {
      assert.equal(p.parents.length, 2);
      assert(ped.couples.some(pair => pair.join() === p.parents.join()));
      p.parents.forEach(id => assert.equal(byId[id].gen + 1, p.gen));
    } else assert(p.gen < 2);
    // 번호의 실제 예상 영역에 2px 여백: x±10, y+26~42.
    const box = [X(p) - 10, Y(p) + 26, X(p) + 10, Y(p) + 42];
    for (const [x1, y1, x2, y2] of segments) assert(
      Math.max(x1, x2) < box[0] || Math.min(x1, x2) > box[2] || Math.max(y1, y2) < box[1] || Math.min(y1, y2) > box[3], `번호-선 겹침: ${p.num}`);
    for (const q of ps) assert(X(q) + 25 < box[0] || X(q) - 25 > box[2] || Y(q) + 25 < box[1] || Y(q) - 25 > box[3], `번호-기호 겹침: ${p.num}`);
  }
  for (let i = 0; i < spans.length; i++) for (const b of spans.slice(i + 1)) {
    const a = spans[i]; if (a.gen === b.gen) assert(a.right < b.left || b.right < a.left);
  }
  const visited = new Set([ps[0].id]);
  for (let i = 0; i < ps.length; i++) for (const p of ps) if (p.parents) {
    const group = [p.id, ...p.parents]; if (group.some(id => visited.has(id))) group.forEach(id => visited.add(id));
  }
  assert.equal(visited.size, ps.length, '고립 인물로 찍기 확률을 낮춤');
}

function validateDeduction(ped, mode = ped.mode, ref = reference(ped, mode)) {
  const d = P.deduce(ped, mode), before = new Map();
  for (const step of d.steps) {
    assert.equal(typeof step.text, 'string'); assert(!forbidden.test(step.text));
    assert(step.people.length && step.people.every(id => ped.people.some(p => p.id === id)));
    assert(step.cards.every(i => Number.isInteger(i) && i >= 1 && i <= ped.cards.length));
    assert(!before.has(step.key), '단계 key 중복');
    assert(step.premises.every(k => before.has(k)), '전제가 앞 단계가 아님');
    assert.equal(step.depth, ['A1', 'PHENOTYPE', 'MALE'].includes(step.rule) ? 0 : 1 + Math.max(0, ...step.premises.map(k => before.get(k).depth)));
    assert.equal(step.geneticDepth, +inheritanceRules.has(step.rule) + Math.max(0, ...step.premises.map(k => before.get(k).geneticDepth)));
    before.set(step.key, step);
  }
  if (ref.solution.count) {
    assert.equal(d.contradiction, null);
    for (const [id, value] of Object.entries(d.facts)) assert.equal(ref.hasCounts[id], value === 'hasA' ? ref.solution.count : 0, `건전성: ${id} ${value}`);
  }
  if (mode === 'x') for (const step of d.steps.filter(s => s.rule === 'C2')) for (const n of step.cards) {
    const males = ped.cards[n - 1].ids.filter(id => ped.people.find(p => p.id === id).sex === 'M');
    if (males.length) assert(step.text.includes('남성이라 보인자가 될 수 없고'));
  }
  if (d.contradiction) {
    assert.equal(ref.solution.count, 0, '가능한 가계도를 모순이라고 판단');
    assert(!forbidden.test(d.contradiction.text));
    assert(d.contradiction.steps.every(s => before.has(s.key)));
  }
  return d;
}

// 독립 모양 지문: 부모·자녀 관계에서 색을 반복 세분한다. 좌표·번호는 읽지 않는다.
// 같은 관계·성별·표현형의 자리 교환은 같은 지문이어야 한다.
function shapeKey(ped) {
  let colors = ped.people.map(p => `${p.gen}/${p.sex}/${+p.affected}`);
  const index = new Map(ped.people.map((p, i) => [p.id, i]));
  const rounds = [];
  for (let round = 0; round < ped.people.length; round++) {
    const descriptions = ped.people.map((p, i) => JSON.stringify([colors[i],
      p.parents?.map(id => colors[index.get(id)]) || [],
      ped.people.filter(q => q.parents?.includes(p.id)).map(q =>
        [q.parents[0] === p.id ? 'father' : 'mother', colors[index.get(q.id)],
          colors[index.get(q.parents.find(id => id !== p.id))]]).sort()]));
    const unique = [...new Set(descriptions)].sort();
    rounds.push(descriptions.slice().sort());
    colors = descriptions.map(s => unique.indexOf(s));
  }
  return hash(rounds);
}

let maxSentence = 0, maxChain = 0;
const appearances = [];
const biologicalAppearanceFeatures = ['allMaleAffected', 'affectedFemale', 'secondGenerationAffectedMale', 'multipleAffectedMales'];
function appearance(ped, seed) {
  const tests = ped.cards.filter(c => c.type === 'noA').map(c => ped.people.find(p => p.id === c.id));
  const counts = ped.cards.filter(c => c.type === 'count'), affected = ped.people.filter(p => p.affected);
  const children = ped.people.filter(p => p.parents);
  return { seed, mode: ped.mode, features: {
    cardCount: ped.cards.length, cardKinds: ped.cards.map(c => c.type).sort().join('+'),
    testSex: tests.map(p => p.sex).sort().join('+') || 'none',
    testGeneration: tests.map(p => p.gen).sort().join('+') || 'none',
    zeroCount: counts.some(c => c.k === 0), groupSize: counts.map(c => c.ids.length).sort().join('+') || 'none',
    affectedCount: affected.length, allMaleAffected: affected.every(p => p.sex === 'M'),
    affectedFemale: affected.some(p => p.sex === 'F'),
    secondGenerationAffectedMale: affected.some(p => p.gen === 1 && p.sex === 'M'),
    multipleAffectedMales: affected.filter(p => p.sex === 'M').length >= 2,
    femaleRatioBin: Math.floor(children.filter(p => p.sex === 'F').length / children.length * 10),
    people: ped.people.length, founderAffected: affected.some(p => p.gen === 0),
    femaleCount: ped.people.filter(p => p.sex === 'F').length,
    testPresent: tests.length > 0, countPresent: counts.length > 0,
    firstCountZero: counts[0]?.k === 0,
  } };
}
// 모든 단일 분기의 방향을 뒤집어 평가한다. 나무는 학습 절반에서만 분기와 잎을 고른다.
function appearanceAudit(rows) {
  const names = Object.keys(rows[0].features), rules = [];
  for (const name of names) {
    const values = [...new Set(rows.map(r => r.features[name]))].sort();
    if (values.length === 1) rules.push({ name, value: values, test: () => true });
    // 범주 일부를 묶는 지름길도 찾는다. 보완 집합은 잎의 방향을 뒤집으면 같아서 절반만 방문한다.
    for (let mask = 1; mask < 2 ** values.length - 1; mask += 2) {
      const selected = values.filter((_, i) => mask & 2 ** i), set = new Set(selected);
      rules.push({ name, value: selected, test: r => set.has(r.features[name]) });
    }
  }
  const accuracy = Object.fromEntries(names.map(name => [name, Math.max(...rules.filter(r => r.name === name).map(rule => {
    const a = rows.filter(r => rule.test(r) === (r.mode === 'x')).length / rows.length;
    return Math.max(a, 1 - a);
  }))]));
  const train = rows.filter(r => r.seed < seedCount / 2), evaluation = rows.filter(r => r.seed >= seedCount / 2);
  function leaf(part) { const x = part.filter(r => r.mode === 'x').length; return { label: x * 2 >= part.length, correct: Math.max(x, part.length - x) }; }
  function branch(part) {
    let best = { correct: -1 };
    const byFeature = {};
    for (const rule of rules) {
      const yes = leaf(part.filter(rule.test)), no = leaf(part.filter(r => !rule.test(r)));
      const candidate = { rule, yes, no, correct: yes.correct + no.correct };
      if (candidate.correct > best.correct) best = candidate;
      if (!byFeature[rule.name] || candidate.correct > byFeature[rule.name].correct) byFeature[rule.name] = candidate;
    }
    return { ...best, byFeature };
  }
  let best = { correct: -1 };
  const pairs = {};
  for (const rule of rules) {
    const yes = branch(train.filter(rule.test)), no = branch(train.filter(r => !rule.test(r)));
    if (yes.correct + no.correct > best.correct) best = { rule, yes, no, correct: yes.correct + no.correct };
    for (const name of names.filter(name => name !== rule.name)) {
      const key = `${rule.name}/${name}`, left = yes.byFeature[name], right = no.byFeature[name];
      const correct = left.correct + right.correct;
      if (!pairs[key] || correct > pairs[key].correct) pairs[key] = { rule, yes: left, no: right, correct };
    }
  }
  const pairReports = Object.entries(pairs).map(([features, tree]) => ({ features, trainAccuracy: tree.correct / train.length,
    evaluationAccuracy: evaluation.filter(row => {
      const child = tree.rule.test(row) ? tree.yes : tree.no;
      return (child.rule.test(row) ? child.yes : child.no).label === (row.mode === 'x');
    }).length / evaluation.length })).sort((a, b) => b.evaluationAccuracy - a.evaluationAccuracy);
  const predict = row => { const child = best.rule.test(row) ? best.yes : best.no; return (child.rule.test(row) ? child.yes : child.no).label; };
  const describe = rule => ({ feature: rule.name, value: rule.value });
  return { accuracy, pairTreeMaximumEvaluation: pairReports[0], testedFeaturePairs: pairReports.length, maximum: Object.entries(accuracy).sort((a, b) => b[1] - a[1])[0],
    maximumNonBiological: Object.entries(accuracy).filter(([name]) => !biologicalAppearanceFeatures.includes(name)).sort((a, b) => b[1] - a[1])[0],
    tree: { root: describe(best.rule), yes: describe(best.yes.rule), no: describe(best.no.rule),
      trainAccuracy: best.correct / train.length, evaluationAccuracy: evaluation.filter(r => predict(r) === (r.mode === 'x')).length / evaluation.length },
    allMaleAutoRate: rows.filter(r => r.mode === 'auto' && r.features.allMaleAffected).length / rows.filter(r => r.mode === 'auto').length };
}
let hiddenXFemaleTests = 0;
const inheritanceRules = new Set(['A2', 'A3', 'A4', 'A5', 'X1', 'X2', 'X3', 'X4', 'X5']);
function proofChain(d, key, seen = new Set()) {
  if (seen.has(key)) return [];
  seen.add(key); const step = d.steps.find(s => s.key === key);
  return step ? [...step.premises.flatMap(k => proofChain(d, k, seen)), step] : [];
}

function validate(ped, challenge, mode) {
  assert.deepEqual(Object.keys(ped).sort(), ['title', 'mode', 'trait', 'people', 'couples', 'cards', 'challenge', 'seed', 'generation', 'shapeId', ...(challenge === 2 ? ['modeHidden'] : [])].sort());
  assert.equal(ped.challenge, challenge); assert.equal(ped.mode, mode);
  assert.equal(!!ped.modeHidden, challenge === 2);
  assert.equal(ped.trait, challenge === 2 ? '형질 (가) · 열성(유전 방식 숨김)' : mode === 'x' ? '적록 색맹(X 염색체 열성)' : '열성 유전병(상염색체)');
  assert(ped.title.startsWith(`도전 ${challenge} · `));
  assert(Number.isInteger(ped.seed));
  assert(ped.people.length >= 10 && ped.people.length <= 13);
  assert.equal(new Set(ped.people.map(p => p.id)).size, ped.people.length);
  assert.equal(new Set(ped.couples.map(pair => pair.join())).size, ped.couples.length);
  assert.deepEqual(ped.people.map(p => p.num), ped.people.map((_, i) => i + 1));
  assert.deepEqual(ped.people, [...ped.people].sort((a, b) => a.gen - b.gen || a.x - b.x));
  assert.deepEqual([...new Set(ped.people.map(p => p.gen))], [0, 1, 2]);
  ped.people.forEach(p => { assert(['M', 'F'].includes(p.sex)); assert.equal(typeof p.affected, 'boolean');
    assert.deepEqual(Object.keys(p).sort(), (p.parents ? ['id', 'num', 'sex', 'gen', 'x', 'affected', 'parents'] : ['id', 'num', 'sex', 'gen', 'x', 'affected']).sort()); });
  const config = P.CHALLENGES[challenge];
  assert(ped.cards.length >= config.minCards && ped.cards.length <= config.maxCards);
  ped.cards.forEach((c, i) => {
    assert(c.text.startsWith(['①', '②'][i])); assert(!forbidden.test(c.text));
    const numbers = [...c.text.matchAll(/(\d+)번/g)].map(m => Number(m[1]));
    assert.deepEqual(numbers, numberIds(ped, c.ids || [c.id]));
    if (c.type === 'count') assert(c.text.endsWith(`보인자는 ${c.k}명이다.`));
    else assert(c.text.endsWith('가 없다.'));
    const group = (c.ids || [c.id]).map(id => ped.people.find(p => p.id === id));
    assert(group.every(Boolean));
    if (c.type === 'noA') {
      assert(!group[0].affected); assert(challenge === 2 || canCarry(group[0], mode));
    } else {
      assert.equal(c.type, 'count'); assert(c.ids.length >= 2 && c.ids.length <= 3);
      assert.equal(new Set(c.ids).size, c.ids.length);
      assert(Number.isInteger(c.k) && c.k >= 0 && c.k < group.filter(p => canCarry(p, mode)).length);
    }
  });
  assert(!JSON.stringify(ped).includes('witness'));
  validateLayout(ped);
  const independent = reference(ped), solution = P.solve(ped), d = validateDeduction(ped, mode, independent);
  assert(solution.count > 0); assert.deepEqual(solution, independent.solution); assert(independent.witnessFound, '숨은 유전자형이 가능한 조합에 없음');
  assert.deepEqual(d.must, solution.must); assert(d.must.length >= 1);
  const depths = d.must.map(id => d.minimumGeneticDepth[id]);
  assert(depths.some(depth => depth >= 2));
  ped.people.filter(p => p.gen > 0 && !p.parents && d.must.includes(p.id)).forEach(p =>
    assert(proofChain(d, `${p.id}:hasA`).some(s => ['A2', 'X1'].includes(s.rule))));
  for (let i = 0; i < ped.cards.length; i++) {
    const fewer = { ...ped, cards: ped.cards.filter((_, j) => i !== j) }, less = reference(fewer).solution;
    assert.deepEqual(P.solve(fewer), less);
    assert(less.must.length < solution.must.length || challenge === 2 && reference(fewer, opposite(mode)).solution.count > 0, '필요 없는 카드');
  }
  const other = reference(ped, opposite(mode));
  assert.deepEqual(P.solve(ped, opposite(mode)), other.solution);
  if (challenge === 2) {
    assert.equal(other.solution.count, 0);
    const contradiction = validateDeduction(ped, opposite(mode), other).contradiction;
    assert(contradiction);
    const allowed = ['A1', 'PHENOTYPE', 'MALE', 'A2', 'A3', 'A4', 'A5', 'X1', 'X2', 'X3', 'X4', 'X5', 'X_MOTHER', 'T', 'C1', 'C2'];
    assert(contradiction.steps.every(s => allowed.includes(s.rule)));
    assert(allowed.includes(contradiction.rule));
    const walk = P.walkthrough(ped);
    assert(walk.modeSteps.length <= 6);
    const factFor = { X1: 1, X_MOTHER: 1, X2: 2, X3: 2, X4: 2, X5: 2, A2: 3, A3: 3, A4: 3, A5: 3, MALE: 4 };
    const facts = [...new Set([factFor[contradiction.rule], ...contradiction.steps.map(s => factFor[s.rule]),
      ...[contradiction.text, ...contradiction.steps.map(s => s.text)].filter(t => /남성이라(?: 이 가정에서)? 보인자가 될 수 없/.test(t)).map(() => 4)].filter(Boolean))].sort();
    assert.deepEqual(walk.modeSteps.at(-1).facts, facts);
    assert.deepEqual(contradiction.facts, facts);
    validateModeConclusions(ped, walk);
    assert(walk.modeSteps.every(s => !s.text.includes('보인자다')));
    assert(walk.modeSteps.every(s => !/카드 [12]|(\d+)~\1명/.test(s.text)));

  }
  assert(ped.cards.filter(c => c.type === 'count').every(c => c.ids.filter(id => solution.must.includes(id)).length === c.k),
    '찍기 모형의 선택지에서 정답 집합이 빠짐');
  const guess = guessModel(ped, solution.must.length);
  assert(guess.chance <= 0.05); assert.deepEqual(guess.forced, []);
  const explanation = P.explain(ped);
  validateWording(ped, d, P.walkthrough(ped), explanation);
  for (const p of ped.people) {
    const e = explanation[p.id]; assert(['must', 'maybe', 'not'].includes(e.status));
    assert(e.chain.length); assert(e.chain.every(s => typeof s === 'string' && !forbidden.test(s)));
    if (d.must.includes(p.id)) { assert.equal(e.status, 'must'); assert(e.chain.at(-1).includes(`${p.num}번`)); assert(e.chain.at(-1).includes('보인자')); }
    if (!canCarry(p, mode) || d.noA.includes(p.id)) assert.equal(e.status, 'not');
    if (solution.maybe.includes(p.id)) assert.equal(e.status, 'maybe');
    if (!solution.must.includes(p.id) && !solution.maybe.includes(p.id)) assert.equal(e.status, 'not');
    assert(!e.chain.some(s => s.includes('해 보자') || s.includes('모순이므로')));
    const sentences = e.chain.flatMap(s => s.split(/(?<=\.)\s+/));
    assert.equal(new Set(sentences).size, sentences.length);
    assert(e.chain.every(s => s.endsWith('.')));
    maxChain = Math.max(maxChain, e.chain.length);
  }
  for (const s of d.steps) maxSentence = Math.max(maxSentence, s.text.length);
  const affectedFemales = ped.people.filter(p => p.sex === 'F' && p.affected);
  if (mode === 'x') affectedFemales.forEach(p => {
    assert(p.parents && ped.people.find(q => q.id === p.parents[0]).affected);
    assert(d.must.some(id => proofChain(d, `${id}:hasA`).some(s => s.rule === 'X4' && s.people.includes(p.id))));
  });
  return { solution, d, guess, depths };
}

test('겉모양 감사 자체 검사: 상수 특징·양방향·독립 평가', () => {
  const rows = [];
  for (let seed = 0; seed < seedCount; seed++) for (const mode of ['auto', 'x'])
    rows.push({ seed, mode, features: { constant: 1, reversedSignal: mode === 'auto', allMaleAffected: false } });
  const audit = appearanceAudit(rows);
  assert.equal(audit.accuracy.constant, 0.5);
  assert.equal(audit.accuracy.reversedSignal, 1);
  assert.equal(audit.pairTreeMaximumEvaluation.evaluationAccuracy, 1);
});

test('최종 문장 검토: 보인자 제외 대상을 한 번만 설명', () => {
  const ped = P.generate(0, { challenge: 2, mode: 'auto' });
  validateExclusionText(P.deduce(ped, 'x').contradiction.text);
  P.walkthrough(ped).modeSteps.forEach(s => validateExclusionText(s.text));
});

test('최종 문장 검토: 가정의 noA 결론과 가정 밖 결론 구별', () => {
  const ped = P.generate(29, { challenge: 2, mode: 'auto' });
  const walk = P.walkthrough(ped);
  assert(walk.modeSteps.some(s => s.rule === 'X5'));
  assert(walk.modeSteps.some(s => s.rule === 'C1'));
  validateAssumptionText(walk);
  const actual = { ...ped, mode: 'x', modeHidden: false };
  for (const step of P.deduce(actual).steps.filter(s => ['X5', 'C1'].includes(s.rule)))
    assert.match(step.text, /에게는 a가 없다\.$/);
});

test('최종 문장 검토: 모순의 직접 근거가 카드인지 앞 결론인지 구별', () => {
  const ped = P.generate(692, { challenge: 2, mode: 'auto' });
  validateConflictSource(ped, P.deduce(ped, 'x').contradiction);
  const direct = fixture([['M'], ['F', 1], ['F', 0, [1, 2]]], 'x', [{ type: 'noA', id: '3' }]);
  const conflict = P.deduce(direct).contradiction;
  assert.match(conflict.text, /단서와 모순/);
  validateConflictSource(direct, conflict);
});

test('검토 회귀: 숨은 유전자형 직렬화 차단·판단 분리·유전 깊이', () => {
  const ped = P.generate(1, { challenge: 2, mode: 'x' });
  assert(!JSON.stringify(ped).includes('witness'), '숨은 유전자형 노출');
  const e = P.explain(ped), walk = P.walkthrough(ped);
  assert(ped.people.every(p => !e[p.id].chain.some(s => s.includes('해 보자'))));
  assert(walk.modeSteps.length <= 6);
  validateModeConclusions(ped, walk);
  assert(walk.modeSteps.every(s => !s.text.includes('보인자다')));
  assert(P.deduce(ped).steps.some(s => s.geneticDepth >= 2));
});

test('재검토 회귀: 남성 제외 문장·판단 사실 전체·모양 식별자', () => {
  const mixed = { ...P2, cards: [P2.cards[0], { type: 'count', ids: ['4', '9', '12'], k: 1 }] };
  const c2 = P.deduce(mixed).steps.find(s => s.rule === 'C2');
  assert(c2.text.includes('9번은 남성이라 보인자가 될 수 없고'));
  const men = fixture([['M'], ['M'], ['M']], 'auto', [{ type: 'count', ids: ['1', '2', '3'], k: 2 }], true);
  assert(P.deduce(men, 'x').contradiction.text.includes('보인자가 될 수 있는 사람이 없는데 2명'));
  const ped = P.generate(255, { challenge: 2, mode: 'auto' });
  assert.match(ped.shapeId, /^[0-9a-f]{8}$/);
  const proof = P.deduce(ped).minimumGeneticDepth;
  assert(P.solve(ped).must.some(id => proof[id] >= 2));
});

test('재검토 깊이 회귀: 이미 아는 사실에도 카드의 더 짧은 대안이 있음', () => {
  const ped = {"title":"도전 2 · 유전 방식 찾기","mode":"auto","trait":"형질 (가) · 열성(유전 방식 숨김)","modeHidden":true,"people":[{"id":"p4","num":1,"sex":"M","gen":0,"x":0.5,"affected":true},{"id":"p3","num":2,"sex":"F","gen":0,"x":1.9,"affected":false},{"id":"p2","num":3,"sex":"M","gen":0,"x":6,"affected":false},{"id":"p1","num":4,"sex":"F","gen":0,"x":7.4,"affected":false},{"id":"p8","num":5,"sex":"F","gen":1,"x":1.9,"affected":false,"parents":["p4","p3"]},{"id":"p7","num":6,"sex":"F","gen":1,"x":4.6,"affected":false,"parents":["p4","p3"]},{"id":"p6","num":7,"sex":"M","gen":1,"x":6,"affected":false,"parents":["p2","p1"]},{"id":"p5","num":8,"sex":"F","gen":1,"x":7.4,"affected":false,"parents":["p2","p1"]},{"id":"p13","num":9,"sex":"M","gen":2,"x":0.4,"affected":true,"parents":["p6","p7"]},{"id":"p12","num":10,"sex":"F","gen":2,"x":2.15,"affected":false,"parents":["p6","p7"]},{"id":"p11","num":11,"sex":"F","gen":2,"x":3.9,"affected":false,"parents":["p6","p7"]},{"id":"p10","num":12,"sex":"F","gen":2,"x":5.65,"affected":false,"parents":["p6","p7"]},{"id":"p9","num":13,"sex":"M","gen":2,"x":7.4,"affected":false,"parents":["p6","p7"]}],"couples":[["p2","p1"],["p4","p3"],["p6","p7"]],"cards":[{"type":"count","ids":["p2","p1","p6"],"k":2,"text":"① 3번, 4번, 7번 중 보인자는 2명이다."},{"type":"count","ids":["p1","p8","p6"],"k":2,"text":"② 4번, 5번, 7번 중 보인자는 2명이다."}],"challenge":2,"seed":255,"generation":{"attempts":27,"shape":"bridge"}};
  const d = P.deduce(ped);
  assert(d.must.some(id => d.steps.find(s => s.key === `${id}:hasA`).geneticDepth >= 2));
  assert(d.must.every(id => d.minimumGeneticDepth[id] === 1));
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../games/pedigree/pedigree.js'), 'utf8')
    .replace('const api = {', 'const api = { accepted, shapeId,'), context);
  assert.equal(context.Pedigree.accepted(ped), false);
  const changed = { ...ped, mode: 'x', cards: [], people: ped.people.slice().reverse().map(p => ({ ...p, num: 100 + p.num, x: 7.8 - p.x })) };
  assert.equal(context.Pedigree.shapeId(ped), context.Pedigree.shapeId(changed));
});

test('기존 4단계 지문·solve·reason 회귀 및 독립 정답 대조', () => {
  assert.equal(P.LEVELS.length, 4);
  P.LEVELS.forEach((ped, i) => {
    freeze(ped); assert.equal(hash(ped), legacy[i][0]);
    assert.deepEqual(P.solve(ped), legacy[i][1]); assert.deepEqual(reference(ped).solution, legacy[i][1]);
    assert.deepEqual(P.solve({ ...ped, cards: [] }), legacy[i][1]);
    assert.deepEqual(P.solve(ped, opposite(ped.mode)), reference(ped, opposite(ped.mode)).solution);
  });
  assert.equal(crypto.createHash('sha256').update(P.reason.toString()).digest('hex'), 'e97d4c176ea035176232d4066cef6d909d4d0a452b453d3d5af7b6cf3a9f311a');
});

test('견본 P1·P2·P3: 전수 조합·must·maybe·유전 방식 모순', () => {
  for (const [ped, must, maybe, count] of [[P1, [3, 5, 6, 7], [2, 8, 10], 8], [P2, [2, 4, 6], [5, 11], 4], [P3, [2, 6], [4, 5, 8, 9, 11], 20]]) {
    const r = reference(ped), s = P.solve(ped);
    assert.deepEqual(s, r.solution); assert.equal(s.count, count);
    assert.deepEqual(numberIds(ped, s.must), must); assert.deepEqual(numberIds(ped, s.maybe), maybe);
    assert.deepEqual(numberIds(ped, validateDeduction(ped).must), must);
    const e = P.explain(ped);
    must.forEach(num => assert(e[String(num)].chain.at(-1).includes(`${num}번`)));
  }
  assert.equal(P.solve(P3, 'auto').count, 0); assert(validateDeduction(P3, 'auto').contradiction);
  assert.deepEqual([P1, P2, P3].map(p => guessModel(p, P.solve(p).must.length).ways), [35, 20, 21]);
});

test('C1·C2·A5·X5 및 카드·표현형 모순 경계', () => {
  const counts = { ...P1, cards: [{ type: 'count', ids: ['2', '4'], k: 0 }] };
  const d = validateDeduction(counts); assert.equal(d.facts['2'], 'noA'); assert.equal(d.facts['4'], 'noA');
  for (const ped of [
    { ...P1, cards: [{ type: 'noA', id: '1' }] },
    { ...P1, cards: [{ type: 'count', ids: ['5', '6'], k: 1 }] },
    { ...P2, cards: [{ type: 'count', ids: ['1', '3'], k: 1 }] },
    { ...P1, cards: [{ type: 'noA', id: '2' }, { type: 'count', ids: ['2', '4'], k: 2 }] },
  ]) { assert.equal(P.solve(ped).count, 0); assert(validateDeduction(ped).contradiction); }
  const family = (mode, affected) => ({ mode, cards: [], people: [
    { id: 'f', sex: 'M', gen: 0, affected: affected[0] }, { id: 'm', sex: 'F', gen: 0, affected: affected[1] },
    { id: 'c', sex: 'F', gen: 1, affected: affected[2], parents: ['f', 'm'] },
  ] });
  for (const mode of ['auto', 'x']) {
    const bad = family(mode, [true, true, false]); assert.equal(P.solve(bad).count, 0);
    // A3만으로는 정상 Aa와 aa를 구분하지 못하므로 두 aa 부모의 정상 자녀도 모순이어야 한다.
    assert(validateDeduction(bad).contradiction);
    const noA = family(mode, [false, false, false]); noA.cards = [{ type: 'noA', id: 'f' }, { type: 'noA', id: 'm' }];
    assert.equal(validateDeduction(noA).facts.c, 'noA');
  }
  const badSon = family('x', [false, true, false]); badSon.people[2].sex = 'M'; assert(validateDeduction(badSon).contradiction);
  const badDaughter = family('x', [false, false, true]); assert(validateDeduction(badDaughter).contradiction);
});

test('작은 가족의 모든 표현형·성별·카드: 독립 해결 대조·사실 건전성', () => {
  for (const mode of ['auto', 'x']) for (const sex of ['M', 'F']) for (let mask = 0; mask < 8; mask++) {
    const people = [
      { id: 'f', num: 1, gen: 0, sex: 'M', affected: !!(mask & 1) },
      { id: 'm', num: 2, gen: 0, sex: 'F', affected: !!(mask & 2) },
      { id: 'c', num: 3, gen: 1, sex, affected: !!(mask & 4), parents: ['f', 'm'] },
    ];
    const cardSets = [[], ...people.map(p => [{ type: 'noA', id: p.id }]),
      ...[0, 1, 2, 3].map(k => [{ type: 'count', ids: ['f', 'm', 'c'], k }]),
      ...people.flatMap(p => [0, 1, 2].map(k => [{ type: 'noA', id: p.id }, { type: 'count', ids: ['f', 'm', 'c'], k }]))];
    for (const cards of cardSets) {
      const ped = { mode, people, cards }, ref = reference(ped);
      assert.deepEqual(P.solve(ped), ref.solution);
      const deduction = validateDeduction(ped, mode, ref);
      if (!ref.solution.count) assert(deduction.contradiction, `작은 가족 모순 누락: ${mode}, ${sex}, ${mask}, ${JSON.stringify(cards)}`);
      const reversed = { ...ped, people: people.slice().reverse() };
      assert.deepEqual(P.solve(reversed), reference(reversed).solution);
    }
  }
});

test('가장 짧은 설명 사슬과 무관한 단계 제외', () => {
  const e1 = P.explain(P1), e2 = P.explain(P2);
  assert.equal(e1['5'].chain.length, 2); // 1번 발현 + A3
  assert(!e1['5'].chain.some(s => s.includes('카드')));
  assert(e1['3'].chain.some(s => s.includes('카드 ①')));
  assert.equal(e2['4'].chain.length, 4); // 8번 검사 + 9번 정상 + X5 + C2
  assert(!e2['4'].chain.some(s => s.includes('10번')));
  const direct = { ...P1, cards: [{ type: 'count', ids: ['3'], k: 1 }, ...P1.cards] };
  assert.equal(P.explain(direct)['3'].chain.length, 1, '뒤에서 발견한 짧은 대안을 놓침');
});

test('모순 최단 사슬·카드 최소 전제·유전 깊이 구별', () => {
  const ped = fixture([['M'], ['F'], ['F', 1, [1, 2]]], 'auto', [], true);
  const walk = P.walkthrough(ped);
  assert.equal(walk.modeSteps.length, 1);
  assert.equal(walk.modeSteps[0].fact, 2);
  assert.deepEqual(walk.modeSteps[0].cards, []);
  const badCount = { ...ped, cards: [{ type: 'count', ids: ['1', '2'], k: 0 }] };
  const c = P.deduce(badCount).contradiction;
  assert.equal(c.steps.length, 2, '0명이라는 카드의 반례 한 명만 있으면 충분하다');
  assert.equal(c.fact, 3);
  assert.equal(P.deduce(P1).steps.find(s => s.key === '3:hasA').geneticDepth, 2);
  assert.equal(P.deduce(P2).steps.find(s => s.key === '4:hasA').geneticDepth, 1);
  const redundant = { ...P2, cards: [...P2.cards, { type: 'noA', id: '9' }] };
  assert(!P.explain(redundant)['4'].chain.some(s => s.includes('③')), '동률이면 카드를 덜 쓰는 사슬');
});

test('배치 한계 상수를 실제 배치 판정에서 사용', () => {
  const source = fs.readFileSync(path.join(__dirname, '../games/pedigree/pedigree.js'), 'utf8');
  const ped = P.generate(1);
  for (const [from, to] of [['minX: 0.4', 'minX: 1'], ['maxX: 7.4', 'maxX: 7'],
    ['minSpacing: 1.25', 'minSpacing: 2'], ['maxGenerations: 3', 'maxGenerations: 2']]) {
    const context = vm.createContext({});
    vm.runInContext(source.replace(from, to).replace('const api = {', 'const api = { layoutFits,'), context);
    assert.equal(context.Pedigree.layoutFits(ped), false, from);
  }
});

test('재사용 후보 전체: 전달 조합·독립 전수·최소 깊이 재승인', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../games/pedigree/pedigree.js'), 'utf8')
    .replace('const api = {', 'const api = { candidate, seededRandom, CANDIDATE_RECIPES, accepted, candidateProbe,'), context);
  const C = context.Pedigree;
  let checked = 0;
  for (const mode of ['auto', 'x']) for (const row of C.CANDIDATE_RECIPES[mode]) {
    const [state, n, females, daughter, encoded, femaleTest, w1, w2] = row;
    assert(Number.isInteger(w1) && Number.isInteger(w2) && w1 >= 0 && w2 >= 0 && w1 + w2 > 0);
    const random = C.seededRandom(state); random.targetPeople = n;
    const { people, couples, witness } = C.candidate(random, mode, females, !!daughter, !!femaleTest);
    const ped = plain({ people, couples, mode, cards: encoded.map(c => typeof c === 'number' ? { type: 'noA', id: `p${c}` }
      : { type: 'count', k: c[0], ids: c.slice(1).map(id => `p${id}`) }) });
    ped.generation = {};
    Object.defineProperty(ped.generation, 'witness', { value: witness });
    const ref = reference(ped);
    assert(ref.witnessFound); assert.deepEqual(P.solve(ped), ref.solution);
    for (const hidden of [false, true]) if (hidden ? w2 : w1) {
      const problem = { ...ped, modeHidden: hidden };
      assert(C.accepted(problem));
      validateWording(problem);
    }
    checked++;
  }
  console.log(JSON.stringify({ checkedCandidateRecipes: checked }));
});

test('후보표 모든 행: 빠른 검사와 최종 승인 일치', () => {
  const C = loadCandidateTools();
  let rows = 0, comparisons = 0;
  for (const mode of ['auto', 'x']) for (const row of C.CANDIDATE_RECIPES[mode]) {
    const [state, n, females, daughter, encoded, femaleTest, w1, w2] = row;
    const random = C.seededRandom(state); random.targetPeople = n;
    const { people, couples } = C.candidate(random, mode, females, !!daughter, !!femaleTest);
    const cards = encoded.map(c => typeof c === 'number' ? { type: 'noA', id: `p${c}` }
      : { type: 'count', k: c[0], ids: c.slice(1).map(id => `p${id}`) });
    // 0 가중치 도전은 이 행을 사용하지 않는다. 실제로 선택되는 모든 도전을 비교한다.
    for (const hidden of [false, true]) if (hidden ? w2 : w1) {
      const ped = { people, couples, mode, cards, modeHidden: hidden };
      assert.equal(C.candidateProbe(ped)(cards), C.accepted(ped), `${mode} 후보 ${rows}, modeHidden=${hidden}`);
      comparisons++;
    }
    rows++;
  }
  assert.equal(rows, 7447);
  console.log(JSON.stringify({ candidateProbeRows: rows, candidateProbeComparisons: comparisons }));
});

test('입력 경계·시도 상한·실패 오류 계약', () => {
  for (const seed of [-1, 2 ** 32, 0.5, NaN, Infinity, '1', null, undefined]) {
    assert.throws(() => P.generate(seed), RangeError); assert.throws(() => P.makeBundle(seed), RangeError);
  }
  for (const challenge of [0, 3, 1.5, NaN, '1', null]) { assert.throws(() => P.generate(1, { challenge }), RangeError); assert.throws(() => P.makeBundle(1, challenge), RangeError); }
  for (const mode of ['', 'AUTO', 0, null]) assert.throws(() => P.generate(1, { mode }), RangeError);
  for (const maxAttempts of [0, -1, P.GENERATION_LIMITS.maxAttempts + 1, 1.5, NaN, Infinity, '1', null]) assert.throws(() => P.generate(1, { maxAttempts }), RangeError);
  for (const options of [null, [], '1']) assert.throws(() => P.generate(1, options), TypeError);
  for (const challenge of [1, 2]) for (const mode of ['auto', 'x']) {
    validate(P.generate(0xffffffff, { challenge, mode }), challenge, mode);
    validate(P.generate(0, { challenge, mode, maxAttempts: 1 }), challenge, mode);

  }
  assert.deepEqual(P.generate(0), P.generate(0, { challenge: 1, mode: 'auto', maxAttempts: P.GENERATION_LIMITS.maxAttempts }));
});

test('회피 입력 경계·상한에서 반복 메타 반환', () => {
  for (const options of [null, [], 'a', { avoid: null }, { avoid: [1] }, { avoid: ['bad'] }])
    assert.throws(() => P.makeBundle(1, 1, options), TypeError);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../games/pedigree/pedigree.js'), 'utf8')
    .replace('if (avoided.has(key)) continue;', 'if (true) continue;'), context);
  const b = context.Pedigree.makeBundle(42, 2);
  assert.equal(b.length, 4); assert.equal(b.avoidRepeats, 4);
  assert.equal(new Set(b.map(p => p.shapeId)).size, 4);
  assert(!JSON.stringify(b).includes('avoidRepeats'));
});

test('입력 불변·반환값 독립·전역 난수와 시각 없는 브라우저 재현성', () => {
  const before = P.LEVELS.map(hash), options = freeze({ challenge: 2, mode: 'x' });
  const expected = P.generate(42, options), edited = P.generate(42, options);
  edited.people[0].affected = !edited.people[0].affected; edited.couples[0].reverse(); edited.cards.length = 0;
  assert.deepEqual(P.generate(42, options), expected); assert.deepEqual(P.LEVELS.map(hash), before);
  const context = vm.createContext({ window: {} });
  vm.runInContext('Math.random = () => { throw new Error("전역 난수 사용"); }; Date = class { constructor() { throw new Error("시각 사용"); } static now() { throw new Error("시각 사용"); } };', context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../games/pedigree/pedigree.js'), 'utf8'), context);
  for (const challenge of [1, 2]) for (const mode of ['auto', 'x']) for (const seed of [0, 1, 42, 0x80000000, 0xffffffff]) {
    const ped = freeze(P.generate(seed, { challenge, mode })), snapshot = hash(ped);
    P.solve(ped); P.deduce(ped); P.explain(ped); assert.equal(hash(ped), snapshot);
    assert.deepEqual(plain(context.window.Pedigree.generate(seed, { challenge, mode })), ped);
  }
  assert.deepEqual(plain(context.window.Pedigree.makeBundle(42, 2)), P.makeBundle(42, 2));
});

test('모든 후보 거절 시 실제 상한만큼만 시도·묶음도 유한 종료', () => {
  const source = fs.readFileSync(path.join(__dirname, '../games/pedigree/pedigree.js'), 'utf8');
  assert(source.includes('if (!accepted(ped)) continue;'));
  const context = vm.createContext({ attempts: 0 });
  vm.runInContext(source.replace('function candidate(random, mode, femaleCount, affectedDaughter = false, femaleTest = false) {',
    'function candidate(random, mode, femaleCount, affectedDaughter = false, femaleTest = false) { globalThis.attempts++;').replace('if (!accepted(ped)) continue;', 'if (true) continue;'), context);
  for (const maxAttempts of [1, 3, P.GENERATION_LIMITS.maxAttempts]) {
    context.attempts = 0;
    assert.throws(() => context.Pedigree.generate(42, { challenge: 2, mode: 'x', maxAttempts }), e => e.code === 'PEDIGREE_GENERATION_EXHAUSTED' && e.attempts === maxAttempts);
    assert.equal(context.attempts, maxAttempts);
  }
  const exhausted = vm.createContext({});
  vm.runInContext(source.replace('maxAttempts: 4096, bundleAttempts: 32', 'maxAttempts: 1, bundleAttempts: 2').replace('if (!accepted(ped)) continue;', 'if (true) continue;'), exhausted);
  assert.throws(() => exhausted.Pedigree.makeBundle(1, 1), e => e.code === 'PEDIGREE_GENERATION_EXHAUSTED' && e.scope === 'bundle' && e.attempts === 2);
});

for (const challenge of [1, 2]) for (const mode of ['auto', 'x']) test(`도전 ${challenge} ${mode}: 시드 0~${seedCount - 1} 전수`, () => {
  let failed = 0, attempts = 0, maxAttempts = 0, milliseconds = 0, totalChance = 0, maxChance = 0, maxN = 0, maxK = 0;
  let femaleAffected = 0, spouses = 0, mustSpouses = 0, normalSpouses = 0;
  let testProblems = 0, femaleTests = 0, maleTests = 0, descendants = 0, femaleDescendants = 0, sons = 0, affectedSons = 0, grandmaOnly = 0;
  const modeLines = {};
  const distribution = {}, depthDistribution = {}, cardCounts = {}, cardTypes = {}, shapes = {}, peopleCounts = {}, shapeCounts = {}, questions = new Set(), answers = new Set();
  const tally = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };
  for (let seed = 0; seed < seedCount; seed++) {
    let ped;
    const start = performance.now();
    try { ped = P.generate(seed, { challenge, mode }); }
    catch (e) { assert.equal(e.code, 'PEDIGREE_GENERATION_EXHAUSTED'); failed++; continue; }
    milliseconds += performance.now() - start;
    try {
      freeze(ped);
      const { solution, d, guess, depths } = validate(ped, challenge, mode);
      assert.deepEqual(P.generate(seed, { challenge, mode }), ped);
      attempts += ped.generation.attempts; maxAttempts = Math.max(maxAttempts, ped.generation.attempts);
      totalChance += guess.chance; maxChance = Math.max(maxChance, guess.chance); maxN = Math.max(maxN, guess.n); maxK = Math.max(maxK, guess.k);
      tally(distribution, `n=${guess.n},k=${guess.k},1/${guess.ways}`); depths.forEach(depth => tally(depthDistribution, depth));
      if (challenge === 2 && mode === 'x') hiddenXFemaleTests += ped.cards.some(c => c.type === 'noA' && ped.people.find(p => p.id === c.id).sex === 'F');
      testProblems += ped.cards.some(c => c.type === 'noA');
      femaleTests += ped.cards.some(c => c.type === 'noA' && ped.people.find(p => p.id === c.id).sex === 'F');
      maleTests += ped.cards.some(c => c.type === 'noA' && ped.people.find(p => p.id === c.id).sex === 'M');
      const children = ped.people.filter(p => p.parents), females = children.filter(p => p.sex === 'F');
      descendants += children.length; femaleDescendants += females.length;
      const carrierSons = children.filter(p => p.sex === 'M' && ped.generation.witness[p.parents[1]] === 'Aa');
      sons += carrierSons.length; affectedSons += carrierSons.filter(p => p.affected).length;
      const deep = d.must.filter(id => d.steps.find(s => s.key === `${id}:hasA`).geneticDepth >= 2);
      grandmaOnly += deep.every(id => proofChain(d, `${id}:hasA`).filter(s => inheritanceRules.has(s.rule)).map(s => s.rule).join() === 'X1,X3');
      if (challenge === 2) {
        tally(modeLines, P.walkthrough(ped).modeSteps.length);
        appearances.push(appearance(ped, seed));
      }
      tally(cardCounts, ped.cards.length); ped.cards.forEach(c => tally(cardTypes, c.type)); tally(shapes, ped.generation.shape);
      tally(peopleCounts, ped.people.length); tally(shapeCounts, shapeKey(ped));
      questions.add(shapeKey(ped)); answers.add(ped.people.map(p => solution.must.includes(p.id) ? '1' : '0').join(''));
      if (ped.people.some(p => p.sex === 'F' && p.affected)) femaleAffected++;
      const married = ped.people.filter(p => !p.parents && p.gen > 0);
      spouses += married.length; mustSpouses += married.filter(p => d.must.includes(p.id)).length;
      normalSpouses += married.filter(p => ['AA', 'AY'].includes(ped.generation.witness[p.id])).length;
    } catch (e) { throw new Error(`도전 ${challenge}, ${mode}, 시드 ${seed}: ${e.message}`, { cause: e }); }
  }
  const generated = seedCount - failed;
  console.log(JSON.stringify({ challenge, mode, seeds: seedCount, generated, failed, failureRate: failed / seedCount,
    meanAttempts: attempts / generated, maxAttempts, meanGenerationMs: milliseconds / generated,
    meanChance: totalChance / generated, maxChance, maxN, maxK, distribution, depthDistribution, cardCounts, cardTypes,
    testProblemRate: testProblems / generated, femaleTestProblemRate: femaleTests / generated, maleTestProblemRate: maleTests / generated,
    femaleDescendantRate: femaleDescendants / descendants, carrierMotherSonAffectedRate: affectedSons / sons,
    grandmaOnlyRate: grandmaOnly / generated, modeLines,
    femaleAffectedRate: mode === 'x' ? femaleAffected / generated : null,
    spouseMustRate: spouses ? mustSpouses / spouses : 0, spouseNormalWitnessRate: spouses ? normalSpouses / spouses : 1,
    shapes, peopleCounts, uniqueQuestions: questions.size, mostCommonShapeRate: Math.max(...Object.values(shapeCounts)) / generated, answerPatterns: answers.size }));
  assert.equal(failed, 0);
  assert(questions.size >= (quick ? 50 : 400), '모양 다양성');
  assert(Math.max(...Object.values(shapeCounts)) / generated <= (quick ? 0.08 : 0.03), '최빈 모양');
  for (const n of [10, 11, 12, 13]) assert((peopleCounts[n] || 0) / generated >= (quick ? 0.08 : 0.1), `사람 수 ${n}`);
  assert(answers.size >= (quick ? 25 : 100));
  if (mode === 'auto') assert(testProblems / generated >= 0.5);
  else {
    assert((cardCounts[0] || 0) / generated <= 0.5);
    assert(femaleDescendants / descendants <= 0.6);
    assert(grandmaOnly / generated <= 0.6);
    assert(affectedSons / sons <= 0.6);
    if (!quick) assert(affectedSons / sons >= 0.43 && affectedSons / sons <= 0.51);
    if (challenge === 2) assert(femaleAffected / generated >= 0.03);
  }
  if (mode === 'x') assert(femaleAffected / generated <= 0.1);
  assert(spouses === 0 || normalSpouses / spouses >= 0.8, '혼인자 대부분이 정상 AA/AY가 아님');
});

test('생성 작업량: 문제·묶음 시도와 후보표 행 순회 상한', () => {
  const metrics = { maxProblemAttempts: 0, maxBundleAttempts: 0, maxRowVisits: 0 };
  let source = fs.readFileSync(path.join(__dirname, '../games/pedigree/pedigree.js'), 'utf8');
  source = replaceExactly(source, 'const rows = CANDIDATE_RECIPES[mode];',
    'const rows = CANDIDATE_RECIPES[mode]; let visits = 0;');
  source = replaceExactly(source, '(sum, row) => sum + row[5 + challenge]',
    '(sum, row) => (++visits, sum + row[5 + challenge])');
  source = replaceExactly(source, 'roll -= row[5 + challenge]; if (roll < 0) return row;',
    'visits++; roll -= row[5 + challenge]; if (roll < 0) { metrics.maxRowVisits = Math.max(metrics.maxRowVisits, visits); return row; }');
  source = replaceExactly(source, 'for (let attempt = 1; attempt <= maxAttempts; attempt++) {',
    'for (let attempt = 1; attempt <= maxAttempts; attempt++) { metrics.maxProblemAttempts = Math.max(metrics.maxProblemAttempts, attempt);');
  source = replaceExactly(source, 'for (let attempt = 0; attempt < GENERATION_LIMITS.bundleAttempts; attempt++) {',
    'for (let attempt = 0; attempt < GENERATION_LIMITS.bundleAttempts; attempt++) { metrics.maxBundleAttempts = Math.max(metrics.maxBundleAttempts, attempt + 1);');
  const measured = vm.compileFunction('const module = { exports: {} }; const window = {};\n' + source + '\nreturn module.exports;', ['metrics'])(metrics);
  for (const challenge of [1, 2]) {
    for (const mode of ['auto', 'x']) for (let seed = 0; seed < seedCount; seed++)
      assert.deepEqual(measured.generate(seed, { challenge, mode }), P.generate(seed, { challenge, mode }));
    for (let seed = 0; seed < bundleCount; seed++)
      assert.deepEqual(measured.makeBundle(seed, challenge), P.makeBundle(seed, challenge));
  }
  console.log(JSON.stringify({ generationWorkload: metrics }));
  // 정리 전후 실측의 약 2배. 강제 실패·전체 회피의 의도된 상한은 별도 계약 검사에서 확인한다.
  assert(metrics.maxProblemAttempts <= 2);
  assert(metrics.maxBundleAttempts <= 4);
  assert(metrics.maxRowVisits <= 17116);
});

test('도전 카드 수 설정은 생성 승인에 실제 적용', () => {
  const source = fs.readFileSync(path.join(__dirname, '../games/pedigree/pedigree.js'), 'utf8');
  for (const [from, to] of [['minCards: 0', 'minCards: 3'], ['maxCards: 2', 'maxCards: -1']]) {
    const changed = vm.compileFunction('const module = { exports: {} }; const window = {};\n' + source.replace(from, to) + '\nreturn module.exports;')();
    assert.throws(() => changed.generate(0, { challenge: 1, maxAttempts: 1 }),
      error => error.code === 'PEDIGREE_GENERATION_EXHAUSTED' && error.attempts === 1);
  }
});

test('도전 2 X 답에도 여성 검사 카드가 등장', () => { assert(hiddenXFemaleTests > 0, '여성 검사 카드 조합 미생성'); });

test('도전 2 겉모양: 양방향 단일 특징·학습/평가 분리 깊이 2 나무', () => {
  assert.equal(appearances.length, seedCount * 2);
  const audit = appearanceAudit(appearances);
  console.log(JSON.stringify({ appearanceSeedsPerMode: seedCount, ...audit }));
  for (const [name, value] of Object.entries(audit.accuracy))
    assert(value <= (biologicalAppearanceFeatures.includes(name) ? 0.85 : 0.65), `${name}: ${value}`);
  assert(audit.tree.evaluationAccuracy <= 0.85);
  assert(audit.pairTreeMaximumEvaluation.evaluationAccuracy <= 0.85);
  assert(audit.allMaleAutoRate >= 0.25);
  assert(appearances.some(p => p.mode === 'auto' && p.features.zeroCount));
  const doubleCounts = appearances.filter(p => p.mode === 'x' && p.features.cardKinds === 'count+count');
  assert(doubleCounts.some(p => p.features.firstCountZero) && doubleCounts.some(p => !p.features.firstCountZero));
});

test('모양 회피: 200시드·10묶음 세션 반복·메타데이터', () => {
  for (const challenge of [1, 2]) {
    let before = 0, after = 0;
    const sessions = quick ? 20 : 100;
    for (let session = 0; session < sessions; session++) {
      const seen = new Set(), avoided = new Set();
      for (let b = 0; b < 10; b++) {
        const seed = (Math.imul(session + 1, 2654435761) + Math.imul(b, 2246822519)) >>> 0;
        const normal = P.makeBundle(seed, challenge), fresh = P.makeBundle(seed, challenge, { avoid: [...avoided] });
        for (const p of normal.filter(p => p.mode === 'x')) { before += seen.has(p.shapeId); seen.add(p.shapeId); }
        for (const p of fresh) { if (p.mode === 'x') after += avoided.has(p.shapeId); avoided.add(p.shapeId); }
        assert.equal(fresh.avoidRepeats, 0);
        assert(!Object.keys(fresh).includes('avoidRepeats'));
      }
    }
    for (let seed = 0; seed < 200; seed++) {
      const avoid = P.makeBundle(seed, challenge).map(p => p.shapeId);
      const fresh = P.makeBundle(seed, challenge, { avoid });
      assert(fresh.every(p => !avoid.includes(p.shapeId)));
      assert.deepEqual(P.makeBundle(seed, challenge, { avoid }), fresh);
    }
    console.log(JSON.stringify({ challenge, sessions, meanRepeatedXShapes: before / sessions, meanRepeatedXShapesWithAvoid: after / sessions }));
    assert(after / sessions <= 0.5);
  }
});

for (const challenge of [1, 2]) test(`도전 ${challenge} 묶음 시드 0~${bundleCount - 1}: 구성·모양·재현성·문제 전수`, () => {
  const orders = new Set(), durations = [];
  for (let seed = 0; seed < bundleCount; seed++) {
    const start = performance.now(), bundle = P.makeBundle(seed, challenge);
    durations.push(performance.now() - start);
    assert.equal(bundle.length, 4); assert.deepEqual(bundle.map(p => p.mode).sort(), ['auto', 'auto', 'x', 'x']);
    assert.equal(new Set(bundle.map(shapeKey)).size, 4);
    assert.deepEqual(P.makeBundle(seed, challenge), bundle);
    for (const ped of bundle) validate(ped, challenge, ped.mode);
    orders.add(bundle.map(p => p.mode).join());
  }
  assert.equal(orders.size, 6);
  durations.sort((a, b) => a - b);
  const p99 = durations[Math.ceil(durations.length * 0.99) - 1], max = durations.at(-1);
  console.log(JSON.stringify({ challenge, bundleSeeds: bundleCount, bundleP99Ms: p99, bundleMaxMs: max }));
  // 벽시계 시간은 기계 부하에 따라 달라져 보고만 한다. 작업량 상한은 별도로 검사한다.
});

test('풀이 순서: 도전 1·2 시드 0~199의 정답·카드·유전 방식 사실', () => {
  assert.equal(typeof P.walkthrough, 'function', 'walkthrough API가 있어야 한다');
  for (const challenge of [1, 2]) for (let seed = 0; seed < 200; seed++) {
    for (const ped of P.makeBundle(seed, challenge)) {
      const before = hash(ped), walk = P.walkthrough(freeze(ped));
      assert.equal(hash(ped), before);
      assert(walk.steps.length > 0);
      for (const id of P.solve(ped).must) assert(walk.steps.some(s => s.people.includes(id) || s.concludes.includes(id)));
      for (const step of [...walk.modeSteps, ...walk.steps]) {
        assert(step.cards.every(n => Number.isInteger(n) && n >= 1 && n <= ped.cards.length));
        assert(step.people.every(id => ped.people.some(p => p.id === id)));
      }
      if (ped.modeHidden) {
        assert(walk.modeSteps.length > 0);
        validateModeConclusions(ped, walk);
      } else assert.equal(walk.modeSteps.length, 0);
    }
  }
});

console.log(JSON.stringify({ seedsPerGroup: seedCount, bundleSeedsPerChallenge: bundleCount, maxSentence, maxChain,
  elapsedSeconds: (performance.now() - started) / 1000 }));
console.log(`가계도 검사: PASS ${pass}, FAIL ${fail}`);
if (fail) process.exitCode = 1;

}
