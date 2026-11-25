// The 1535 × 1961 mission diagrams repeat two mat profiles for the six
// non-objective areas. Coordinates describe the printed grey border, including
// its projections beyond the rectangular part. See PATROL-TERRAIN-AREAS.md.
const medium = {
  width: 226, height: 149,
  points: [[0,0],[226,0],[226,40],[238,54],[246,70],[240,86],[242,97],[226,115],
    [226,149],[130,149],[112,156],[99,153],[83,162],[66,159],[47,157],[43,149],[0,149]]
};
const narrow = {
  width: 226, height: 75,
  points: [[0,0],[34,0],[41,-4],[47,-9],[50,-14],[61,-19],[68,-19],[77,-16],[86,-14],[93,-9],
    [98,0],[226,0],[226,75],[191,75],[188,82],[183,85],[175,84],[166,86],[159,86],[153,83],[150,75],[0,75]]
};

// [terrain id, profile, start u, start v, signed span across u, signed span across v].
// The long axis is horizontal on some maps and vertical on others.
const pads = {
  A: [
    ['generatorShrine-1', medium, 768,979,148,-225],
    ['capacitorStack-1', medium, 768,979,-149,225],
    ['barricade-1', narrow, 1029,719,228,74],
    ['barricade-2', narrow, 505,1242,-226,-75],
    ['pylon-1', narrow, 457,417,233,75],
    ['pylon-2', narrow, 1076,1543,-233,-75]
  ],
  B: [
    ['largeRuin-3', medium, 542,1358,-147,224],
    ['largeRuin-4', medium, 993,604,148,-223],
    ['barricade-1', narrow, 459,719,232,75],
    ['barricade-2', narrow, 1076,1241,-232,-76],
    ['pylon-1', narrow, 689,942,-75,227],
    ['pylon-2', narrow, 843,1018,75,-226]
  ],
  C: [
    ['generatorShrine-1', medium, 880,1392,-225,-149],
    ['capacitorStack-1', medium, 655,566,225,149],
    ['barricade-1', narrow, 429,343,232,76],
    ['barricade-2', narrow, 1104,1618,-231,-75],
    ['pylon-1', narrow, 540,905,228,74],
    ['pylon-2', narrow, 995,1054,-227,-75]
  ]
};

const neutral = {
  A: ['largeRuin-3','largeRuin-4'],
  B: ['generatorShrine-1','capacitorStack-1'],
  C: ['largeRuin-4','largeRuin-3']
};
const names = {
  'blue-home':'청색 진영 본진','red-home':'적색 진영 본진',
  'neutral-1':'중립 거점 1','neutral-2':'중립 거점 2',
  generatorShrine:'발전기 성소',capacitorStack:'축전기 다발',largeRuin:'대형 폐허',
  barricade:'바리케이드',pylon:'송전 첨탑'
};

function withFeatures(area,terrainIds) {
  // A colour belongs to the depicted piece. A home mat has both colours.
  const featureColors=Object.fromEntries(terrainIds.map(id=>[
    id, id.startsWith('smallRuin-') || id.startsWith('barricade-') ? 'yellow' : 'green'
  ]));
  return {...area,terrainIds,featureColors};
}

export function patrolTerrainAreas(map,objectives,worldFromUV) {
  if(!Object.hasOwn(pads,map))return [];
  const links={
    'blue-home':['largeRuin-1','smallRuin-1','smallRuin-2'],
    'red-home':['largeRuin-2','smallRuin-3','smallRuin-4'],
    'neutral-1':[neutral[map][0]],'neutral-2':[neutral[map][1]]
  };
  const result=objectives.map(area=>withFeatures({
    ...area,name:area.name??names[area.id],objective:true
  },links[area.id]));
  for(const [id,profile,u,v,du,dv] of pads[map]) {
    const vertical=Math.abs(dv)>Math.abs(du);
    const polygon=profile.points.map(([x,y])=>{
      const a=x/profile.width,b=y/profile.height;
      return worldFromUV([Math.round(u+du*(vertical?b:a)),Math.round(v+dv*(vertical?a:b))]);
    });
    const [kind,number]=id.split('-');
    result.push(withFeatures({
      id:id+'-pad',name:names[kind]+' '+number,polygon,objective:false,side:null
    },[id]));
  }
  return result;
}
