// Fixed combat patrol loadouts. See SOURCES.md for dated card transcriptions.
function gun(name, range, attacks, skill, strength, ap, damage, traits = {}) {
  const pistol = name.includes('피스톨') || name==='슬러가' || name==='블라스타' || name==='플라즈마 과충전';
  return {name, range, attacks, skill, strength, ap, damage, pistol, ...traits};
}
function melee(name, attacks, skill, strength, ap, damage, traits) {
  return gun(name, 0, attacks, skill, strength, ap, damage, traits);
}
function profile(move,toughness,save,wounds,leadership,oc,invul,weapons) {
  return {move,toughness,save,wounds,leadership,oc,invul,weapons};
}
const boltPistol = gun('볼트 피스톨',12,1,3,4,0,1);
const slugga = gun('슬러가',12,1,5,4,0,1);
const choppa = melee('초파',1,3,4,-1,1);
export const profiles = {
  captain: profile(6,4,3,6,6,1,4,[
    gun('헤비 볼트 피스톨',18,1,2,4,-1,1), melee('마스터 크래프티드 파워 웨폰',6,2,5,-2,2)]),
  librarian: profile(6,4,3,4,6,1,4,[
    boltPistol, gun('풀미네이션 · 펄스',24,2,3,8,-2,3,{psychic:true,slot:'fulmination'}),
    gun('풀미네이션 · 서지',24,3,3,4,-1,1,{psychic:true,blast:2,slot:'fulmination'}),
    melee('포스 웨폰',4,3,6,-1,2,{psychic:true})]),
  intercessor: profile(6,4,3,2,6,3,0,[
    gun('볼트 라이플',24,2,3,4,-1,1,{assault:true,heavy:true}), boltPistol, melee('근접 무기',3,3,4,0,1)]),
  vanguard: profile(12,4,3,2,6,1,0,[
    gun('헤비 볼트 피스톨',18,1,3,4,-1,1), melee('마스터 크래프티드 파워 웨폰',3,3,5,-2,2)]),
  landSpeeder: profile(14,8,3,9,6,2,0,[
    gun('멀티 멜타',18,2,3,10,-4,'D6',{melta:2}),
    gun('스톰퓨리 미사일',48,1,3,10,-3,4),
    gun('헤비 플레이머',12,'D6',0,5,-1,1,{torrent:true}),melee('장갑 차체',4,3,4,0,1)]),
  warboss: profile(6,5,4,6,6,1,5,[
    gun('커스텀 슈타',18,4,5,4,0,1,{rapid:2}), melee('커스텀 초파',6,2,8,-2,2,{cleave:1})]),
  weirdboy: profile(6,5,5,4,7,1,0,[
    gun('헤드뱅어',24,1,4,8,-3,2,{psychic:true,precision:true,slot:'psychic'}),
    gun('다 스톰프',24,'D6+2',4,4,0,1,{psychic:true,blast:1,slot:'psychic'}),
    melee('와아! 지팡이 · 강타',3,3,8,-1,2,{psychic:true}),
    melee('와아! 지팡이 · 분쇄',4,3,8,-2,2,{psychic:true,devastating:true,hazardous:true})]),
  boy: profile(6,5,5,1,7,2,0,[
    gun('슈타',18,2,5,4,0,1,{rapid:1}),slugga,choppa]),
  gretchin: profile(6,2,7,1,8,1,0,[
    gun('블라스타',18,1,4,3,0,1),gun('투척 폭탄',6,1,4,4,-1,1,{hazardous:true}),melee('급조 단검',1,5,2,0,1)]),
  wartrakk: profile(12,6,4,7,7,3,6,[
    gun('로킷 런처',24,'D3+3',5,10,-2,3),gun('커스텀 슈타',18,4,5,4,0,1,{rapid:2}),
    melee('초파',6,3,4,-1,1)])
};

export function getProfile(piece) {
  const value = profiles[piece?.kind];
  if (!value) return null;
  if (piece.kind === 'boy' && piece.variant % 10 === 0) {
    const guns=piece.variant===0 ? [gun('콤비 로킷',24,1,5,10,-2,3),gun('콤비 슈타',24,2,5,4,0,1)] : [gun('커스텀 슈타',18,4,5,4,0,1,{rapid:2})];
    return {...value,wounds:2,weapons:[...guns,slugga,melee('빅 초파',3,3,5,-1,2)]};
  }
  if (piece.kind==='boy' && piece.variant>10) return {...value,weapons:[{...value.weapons[0],rapid:0},slugga,choppa]};
  if (piece.kind === 'vanguard' && piece.variant === 3) {
    return {...value,weapons:[gun('플라즈마 피스톨',12,1,3,7,-2,1),
      gun('플라즈마 과충전',12,1,3,8,-3,2,{hazardous:true}),value.weapons[1]]};
  }
  if (piece.kind === 'intercessor' && piece.variant === 0) {
    return {...value,weapons:[...value.weapons,melee('체인소드',5,3,4,-1,1)]};
  }
  if (piece.kind === 'intercessor' && piece.variant === 1) {
    return {...value,weapons:[...value.weapons,gun('수류탄 발사기 · 파편',24,2,3,4,-1,1,{blast:1}),
      gun('수류탄 발사기 · 크라크',24,2,3,5,-2,3,{antiVehicle:4})]};
  }
  return value;
}

export function unitId(piece) {
  if (piece.kind === 'boy') return 'boy-' + Math.floor(piece.variant / 10);
  return piece.kind;
}
