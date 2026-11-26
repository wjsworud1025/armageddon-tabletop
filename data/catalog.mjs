import {mapReliquarySize,reliquarySize} from './reliquary-dimensions.mjs';

// World axes are x right, z toward the near edge of the assembled 44 × 30 inch board.
// The four corners and ground contact points were digitised on the 1920 × 1212 July photograph.
export const photoFrame = {
  width: 1920, height: 1212,
  url: 'https://assets.warhammer-community.com/articles/0-2026/june/wc29-06/sundaypreview-jul05-40k_01-starterset-2kklbdlero.jpg',
  corners: [[48,732], [1368,608], [1888,949], [162,1180]],
  worldCorners: [[-22,-15], [22,-15], [22,15], [-22,15]]
};

// Homography from the four correspondences above, mapping image pixels (u,v) to inches.
export function photoToBoard(u, v) {
  const w = -0.00001795064117 * u + 0.00220382240425 * v + 1;
  return {
    x: (0.075772001717 * u - 0.067664869652 * v - 11.57777161829) / w,
    z: (0.022371934204 * u + 0.202229199855 * v - 188.29067267258) / w
  };
}

// Each entry is [base centre in photo pixels, yaw in degrees]. Terrain uses the
// middle of its estimated footprint. Character headings are visual estimates.
const layouts = {
  captain: [[865,981,10]],
  librarian: [[705,1060,18]],
  intercessor: [[559,1035,29], [494,1087,27], [424,1060,35], [501,998,-17], [445,983,-3]],
  vanguard: [[858,811,14], [751,881,2], [843,871,13], [806,829,42], [746,795,39]],
  landSpeeder: [[538,846,63]],
  warboss: [[969,982,7]],
  weirdboy: [[1441,956,-15]],
  boy: [
    [1246,703,13], [1296,719,-18], [1412,703,-24], [1446,726,-24], [1373,734,2],
    [1329,752,26], [1292,780,4], [1363,774,5], [1407,769,-20], [1450,790,-12],
    [1305,882,9], [1121,856,-16], [1185,846,7], [1242,871,-19], [1089,884,-11],
    [1166,880,13], [1207,898,5], [1144,908,-15], [1228,936,-11], [1301,965,25]
  ],
  gretchin: [
    [964,1057,-22], [982,1028,21], [1024,1045,4], [1046,1026,-13], [1081,1040,7],
    [1498,879,-14], [1543,895,-18], [1583,879,8], [1514,916,-18], [1570,913,18]
  ],
  wartrakk: [[981,744,-26]],
  largeRuin: [[366,848,165], [560.30,968.34,129.69], [768,739,80], [1130,814,-102]],
  smallRuin: [[933,822,-21], [779,969,12], [832,1052,66], [1312.2,940.4,-48]],
  shockArray: [[1094,982,-32]],
  capacitorStack: [[312,1064,55]],
  barricade: [[915.6,700.4,129.5], [1390.8,869.4,127.6]],
  generatorShrine: [[1528,844,-23]],
  pylon: [[637,758,45], [1314,699,-33]]
};

const mm = value => value / 25.4;
const kinds = [
  ['marines', 'captain', '유물 방패를 든 캡틴', mm(40)],
  ['marines', 'librarian', '라이브러리안', mm(40)],
  ['marines', 'intercessor', '인터세서', mm(32)],
  ['marines', 'vanguard', '점프 팩 뱅가드 베테랑', mm(32)],
  ['marines', 'landSpeeder', '랜드 스피더', mm(70), mm(105)],
  ['orks', 'warboss', '워보스', mm(50)],
  ['orks', 'weirdboy', '위어드보이', mm(50)],
  ['orks', 'boy', '오크 보이', mm(32)],
  ['orks', 'gretchin', '그레친', mm(25)],
  ['orks', 'wartrakk', '워트랙', mm(70), mm(105)],
  ['terrain', 'largeRuin', '대형 제조공장 폐허', 5.2, 4.1],
  ['terrain', 'smallRuin', '소형 제조공장 폐허', 2.5, 1.4],
  ['terrain', 'shockArray', '충격기 배열', 4.1, 0.95],
  ['terrain', 'capacitorStack', '축전기 다발', 4.2, 2.86],
  ['terrain', 'barricade', '락크리트 바리케이드', 3.8, 1.25],
  ['terrain', 'generatorShrine', '발전기 성소', 3.5, 2.68],
  ['terrain', 'pylon', '송전 첨탑', 3.5, 1.4]
];

export function createTable() {
  const pieces = kinds.flatMap(([faction, kind, label, width, depth]) =>
    layouts[kind].map(([u,v,angle], variant) => {
      const nob = kind === 'boy' && (variant === 0 || variant === 10);
      const baseWidth = nob ? mm(40) : width;
      const baseDepth = kind==='smallRuin'&&variant===0 ? 1.25 : (depth??baseWidth);
      const ordinal = variant + 1;
      const name = nob ? '보스 놉 ' + (variant === 0 ? '1' : '2')
        : (layouts[kind].length === 1 ? label : label + ' ' + ordinal);
      return {
        id: kind + '-' + ordinal, kind, name, faction, variant,
        baseWidth, baseDepth, ...(kind==='largeRuin'&&variant===1?reliquarySize:{}),
        ...photoToBoard(u,v), yaw: angle * Math.PI / 180
      };
    })
  );
  return {width: 44, depth: 30, pieces};
}

// The display combines the C door wall and B saint wall. The printed games
// retain their established wall assembly, geometry and ground coordinates.
export function createMapTable(){
  const table=createTable();
  Object.assign(table.pieces.find(p=>p.id==='largeRuin-2'),mapReliquarySize,
    photoToBoard(570.31,970.76),{yaw:132.10*Math.PI/180});
  return table;
}
