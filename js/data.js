// ゲームの元データ:シリーズ・タイヤ・サーキット・ラリー・名前
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

// disc: 経験が貯まる分野 / kind: 週末の進み方
const SERIES = [
  { id: 'kart', name: 'ジュニアカート選手権', en: 'JUNIOR KART', disc: 'formula', kind: 'sprint', tier: 0, minRep: 0,
    rounds: 5, laps: 14, teams: 8, perTeam: 2, dry: ['K'], wet: ['W'], pits: false, twoCompounds: false, lifeMul: 1, pitLoss: 0,
    pool: 'kart', desc: '全員が同じタイヤ。ピットは無し。セットアップと走り方だけで勝負する入口のクラス。' },

  { id: 'academy', name: 'フォーミュラ・アカデミー', en: 'FORMULA ACADEMY', disc: 'formula', kind: 'sprint', tier: 1, minRep: 12,
    rounds: 5, laps: 18, teams: 10, perTeam: 2, dry: ['S', 'M'], wet: ['W'], pits: true, twoCompounds: false, lifeMul: 2.0, pitLoss: 20,
    pool: 'circuit', desc: '初めての翼付きマシン。タイヤは2種類。基本はノーピットで、スタートのタイヤ選びが大事。' },
  { id: 'regional', name: 'フォーミュラ・リージョナル', en: 'FORMULA REGIONAL', disc: 'formula', kind: 'sprint', tier: 2, minRep: 32,
    rounds: 6, laps: 24, teams: 10, perTeam: 2, dry: ['S', 'M', 'H'], wet: ['I', 'W'], pits: true, twoCompounds: false, lifeMul: 1.45, pitLoss: 21,
    pool: 'circuit', desc: 'タイヤが3種類に増え、インターミディエイトも使える。ピットに入るかどうかが分かれ目になる。' },
  { id: 'second', name: 'フォーミュラ・セカンド', en: 'FORMULA SECOND', disc: 'formula', kind: 'sprint', tier: 3, minRep: 52,
    rounds: 6, laps: 32, teams: 10, perTeam: 2, dry: ['S', 'M', 'H'], wet: ['I', 'W'], pits: true, twoCompounds: true, lifeMul: 1.1, pitLoss: 21,
    pool: 'circuit', desc: 'トップカテゴリーの一歩手前。ドライでは2種類のタイヤを使う決まりがある。' },
  { id: 'gp', name: 'グランプリ', en: 'GRAND PRIX', disc: 'formula', kind: 'sprint', tier: 4, minRep: 70,
    rounds: 7, laps: 50, teams: 10, perTeam: 2, dry: ['S', 'M', 'H'], wet: ['I', 'W'], pits: true, twoCompounds: true, lifeMul: 1, pitLoss: 22,
    pool: 'circuit', desc: '頂点。タイヤの持ち、ピットの回数、雨とセーフティカーへの備え。すべてが順位に出る。' },

  { id: 'gt4', name: 'GT4 チャレンジ', en: 'GT4 CHALLENGE', disc: 'gt', kind: 'sprint', tier: 1, minRep: 10,
    rounds: 5, laps: 20, teams: 10, perTeam: 2, dry: ['M', 'H'], wet: ['W'], pits: true, twoCompounds: false, lifeMul: 1.6, pitLoss: 24,
    pool: 'circuit', desc: '重くて抜きにくい市販車ベースのクラス。ペースより我慢と追い抜きの上手さが効く。' },
  { id: 'gt3', name: 'GT3 スプリントカップ', en: 'GT3 SPRINT CUP', disc: 'gt', kind: 'sprint', tier: 2, minRep: 30,
    rounds: 5, laps: 26, teams: 10, perTeam: 2, dry: ['M', 'H'], wet: ['W'], pits: true, twoCompounds: false, lifeMul: 1.25, pitLoss: 26,
    pool: 'circuit', desc: '耐久への入口。タイヤの持ちが良く、1回ピットが普通。' },
  { id: 'lmp2', name: '耐久選手権 LMP2クラス', en: 'ENDURANCE LMP2', disc: 'gt', kind: 'endurance', tier: 3, minRep: 48,
    rounds: 4, laps: 48, cars: 12, fuelStint: 6, dry: ['M', 'H'], wet: ['I', 'W'], pits: true, lifeMul: 0.29, pitLoss: 26, tyreTime: 9,
    pool: 'circuit', desc: '3人で1台を走らせる。燃料補給は決まった周回ごと。タイヤを毎回替えるか、2スティント使うか。' },
  { id: 'hyper', name: '耐久選手権 ハイパーカークラス', en: 'ENDURANCE HYPERCAR', disc: 'gt', kind: 'endurance', tier: 4, minRep: 66,
    rounds: 4, laps: 48, cars: 12, fuelStint: 6, dry: ['M', 'H'], wet: ['I', 'W'], pits: true, lifeMul: 0.29, pitLoss: 26, tyreTime: 9,
    pool: 'circuit', desc: '耐久の頂点。最終戦は24時間で、ポイントは2倍。マシンを壊さずに速く走れるか。' },

  { id: 'rnat', name: 'ナショナルラリー', en: 'NATIONAL RALLY', disc: 'rally', kind: 'rally', tier: 1, minRep: 8,
    rounds: 5, loops: 2, perLoop: 3, crews: 12, pool: 'rally', desc: '1台ずつタイムを競う。ループごとにタイヤとスペアの本数、攻め方を決める。' },
  { id: 'r2', name: 'ラリー2 選手権', en: 'RALLY2 CHAMPIONSHIP', disc: 'rally', kind: 'rally', tier: 2, minRep: 30,
    rounds: 5, loops: 2, perLoop: 4, crews: 12, pool: 'rally', desc: '本格的な4WDラリーカー。路面の荒れとタイヤの減りを読む力が要る。' },
  { id: 'wrc', name: 'ワールドラリー', en: 'WORLD RALLY', disc: 'rally', kind: 'rally', tier: 4, minRep: 64,
    rounds: 6, loops: 3, perLoop: 3, crews: 12, pool: 'rally', desc: 'ラリーの頂点。初日は選手権の上位ほど先に走り、砂利を掃く役になる。' },
];
const SERIES_BY_ID = Object.fromEntries(SERIES.map(s => [s.id, s]));

const DISC_NAME = { formula: 'フォーミュラ', gt: 'GT・耐久', rally: 'ラリー' };

// off: 1周あたりの速さの差(秒) slope: 1周ごとの劣化(秒) life: レース周回に対する寿命の割合
const TYRES = {
  S: { name: 'ソフト', off: -0.6, slope: 0.07, life: 0.36 },
  M: { name: 'ミディアム', off: 0, slope: 0.045, life: 0.58 },
  H: { name: 'ハード', off: 0.45, slope: 0.028, life: 0.85 },
  K: { name: 'カート用', off: 0, slope: 0.03, life: 1.6 },
  I: { name: 'インター', off: 0, slope: 0.05, life: 0.8, wet: true },
  W: { name: 'ウェット', off: 0, slope: 0.04, life: 1.0, wet: true },
};

const STYLES = {
  push: { name: '攻める', off: -0.32, deg: 1.35, err: 1.9, rel: 1.7 },
  normal: { name: '標準', off: 0, deg: 1, err: 1, rel: 1 },
  save: { name: '労わる', off: 0.35, deg: 0.7, err: 0.55, rel: 0.55 },
};

// hs: 高速度(高いほどウイングは少なめが合う) bump: 路面の荒れ(高いほど柔らかい足が合う)
// abr: タイヤへの攻撃性 pass: 抜きやすさ rain: 雨の降りやすさ
const CIRCUITS = [
  { id: 'kitahama', name: '北浜サーキット', en: 'KITAHAMA', base: 92, hs: 0.65, bump: 0.35, abr: 1.05, pass: 0.45, rain: 0.35, sc: 0.3 },
  { id: 'monteverde', name: 'モンテ・ヴェルデ', en: 'MONTE VERDE', base: 88, hs: 0.8, bump: 0.25, abr: 0.9, pass: 0.65, rain: 0.2, sc: 0.25 },
  { id: 'langford', name: 'ラングフォード・パーク', en: 'LANGFORD PARK', base: 90, hs: 0.75, bump: 0.5, abr: 1.15, pass: 0.5, rain: 0.5, sc: 0.3 },
  { id: 'sanalma', name: 'サン・アルマ市街地', en: 'SAN ALMA STREETS', base: 101, hs: 0.2, bump: 0.85, abr: 0.8, pass: 0.15, rain: 0.15, sc: 0.65 },
  { id: 'hochwald', name: 'ホッホヴァルト・リンク', en: 'HOCHWALD RING', base: 96, hs: 0.5, bump: 0.6, abr: 1.0, pass: 0.4, rain: 0.45, sc: 0.35 },
  { id: 'kirisawa', name: '霧沢スピードウェイ', en: 'KIRISAWA', base: 94, hs: 0.45, bump: 0.4, abr: 1.2, pass: 0.35, rain: 0.55, sc: 0.3 },
  { id: 'portosol', name: 'ポルト・ソル', en: 'PORTO SOL', base: 85, hs: 0.9, bump: 0.2, abr: 1.0, pass: 0.75, rain: 0.1, sc: 0.2 },
  { id: 'mirage', name: 'ミラージュ砂漠サーキット', en: 'MIRAGE DESERT', base: 93, hs: 0.6, bump: 0.3, abr: 1.4, pass: 0.6, rain: 0.03, sc: 0.25 },
  { id: 'nordkap', name: 'ノルドカップ', en: 'NORDKAP', base: 97, hs: 0.35, bump: 0.55, abr: 0.85, pass: 0.3, rain: 0.5, sc: 0.35 },
  { id: 'valencia', name: 'ヴァレンティア・レイク', en: 'VALENTIA LAKE', base: 89, hs: 0.55, bump: 0.3, abr: 1.1, pass: 0.5, rain: 0.25, sc: 0.3 },
  { id: 'takanodai', name: '鷹ノ台サーキット', en: 'TAKANODAI', base: 95, hs: 0.3, bump: 0.45, abr: 1.25, pass: 0.25, rain: 0.4, sc: 0.3 },
  { id: 'caldera', name: 'カルデラ・ヒル', en: 'CALDERA HILL', base: 99, hs: 0.4, bump: 0.75, abr: 0.95, pass: 0.35, rain: 0.3, sc: 0.45 },
];
const KARTWAYS = [
  { id: 'k_minato', name: '湊カートランド', en: 'MINATO KARTLAND', base: 48, hs: 0.3, bump: 0.3, abr: 1.0, pass: 0.55, rain: 0.35, sc: 0 },
  { id: 'k_sora', name: 'そらのカートウェイ', en: 'SORA KARTWAY', base: 52, hs: 0.5, bump: 0.5, abr: 1.1, pass: 0.5, rain: 0.4, sc: 0 },
  { id: 'k_lago', name: 'ラーゴ・カート', en: 'LAGO KART', base: 46, hs: 0.7, bump: 0.2, abr: 0.9, pass: 0.6, rain: 0.2, sc: 0 },
  { id: 'k_alto', name: 'アルト・ピスタ', en: 'ALTO PISTA', base: 55, hs: 0.2, bump: 0.7, abr: 1.2, pass: 0.4, rain: 0.3, sc: 0 },
  { id: 'k_kawa', name: '河原ジュニアサーキット', en: 'KAWARA JUNIOR', base: 50, hs: 0.6, bump: 0.6, abr: 1.0, pass: 0.45, rain: 0.45, sc: 0 },
  { id: 'k_hill', name: 'ヒルトップ・カート', en: 'HILLTOP KART', base: 53, hs: 0.4, bump: 0.4, abr: 1.3, pass: 0.5, rain: 0.25, sc: 0 },
];

// surface: gravel / tarmac / snow  rough: 路面の荒れ heat: 暑さ(ソフトの減り)
const RALLIES = [
  { id: 'nordland', name: 'ラリー・ノルドランド', en: 'RALLY NORDLAND', surface: 'snow', rough: 0.2, heat: 0, rain: 0, words: ['白樺', '凍湖', 'ノルド', '峠', '雪原', '森番'] },
  { id: 'vulcana', name: 'ラリー・ヴルカーナ', en: 'RALLY VULCANA', surface: 'gravel', rough: 0.85, heat: 0.9, rain: 0.05, words: ['溶岩', '火口', '黒砂', '灰谷', '赤岩', '硫黄'] },
  { id: 'costa', name: 'ラリー・コスタ・アスール', en: 'RALLY COSTA AZUL', surface: 'tarmac', rough: 0.15, heat: 0.6, rain: 0.25, words: ['海岸', '灯台', '入江', '岬', '断崖', 'オリーブ'] },
  { id: 'forest', name: 'ラリー・森の国', en: 'RALLY OF FORESTS', surface: 'gravel', rough: 0.3, heat: 0.4, rain: 0.3, words: ['針葉樹', '湖畔', 'ジャンプ', '丘陵', '木こり', '霧谷'] },
  { id: 'alta', name: 'ラリー・アルタ・モンターニャ', en: 'RALLY ALTA MONTANA', surface: 'tarmac', rough: 0.25, heat: 0.3, rain: 0.55, words: ['峠道', 'ヘアピン', '修道院', '石橋', '尾根', '牧草'] },
  { id: 'akatsuchi', name: 'ラリー・赤土', en: 'RALLY AKATSUCHI', surface: 'gravel', rough: 0.65, heat: 0.7, rain: 0.2, words: ['赤土', '段々畑', '渓谷', '乾谷', '岩棚', '竹林'] },
  { id: 'lakes', name: 'ラリー・湖水地方', en: 'RALLY LAKELANDS', surface: 'gravel', rough: 0.2, heat: 0.3, rain: 0.35, words: ['千湖', '高速', '砂丘', '白夜', '湖岸', '牧場'] },
  { id: 'highland', name: 'ラリー・ハイランド', en: 'RALLY HIGHLANDS', surface: 'gravel', rough: 0.55, heat: 0.1, rain: 0.6, words: ['荒野', '石垣', '泥炭', '谷底', '古城', '風車'] },
];

const SURFACE_NAME = { gravel: 'グラベル(砂利)', tarmac: 'ターマック(舗装)', snow: 'スノー(雪と氷)' };
const RALLY_TYRES = {
  gravel: [['soft', 'ソフト'], ['hard', 'ハード']],
  tarmac: [['soft', 'ソフト'], ['hard', 'ハード'], ['wet', 'ウェット']],
  snow: [['studded', 'スパイク']],
};
const RALLY_PACE = { careful: { name: '慎重', t: 1.012, err: 0.45, punct: 0.6 }, normal: { name: '標準', t: 1, err: 1, punct: 1 }, flat: { name: '全開', t: 0.988, err: 2.2, punct: 1.6 } };

const SURNAMES = ['Moreau', 'Lindqvist', 'Okafor', 'Tanaka', 'Rossi', 'Kowalski', 'Haddad', 'Fernández', 'Becker', 'Nakamura', 'Silva', 'Novak',
  'Andersen', 'Costa', 'Ivanov', 'Laurent', 'Petrov', 'Ishikawa', 'Bianchi', 'Schulz', 'Murphy', 'Duarte', 'Kaya', 'Svensson', 'Mendes', 'Okada',
  'Varga', 'Horvat', 'Klein', 'Marchetti', 'Sato', 'Dubois', 'Reyes', 'Holm', 'Kimura', 'Nielsen', 'Popescu', 'Ferreira', 'Weber', 'Castillo',
  'Mori', 'Lund', 'Brandt', 'Hughes', 'Ricci', 'Vos', 'Aalto', 'Cruz', 'Park', 'Fujita', 'Grant', 'Morel', 'Esposito', 'Jansen', 'Rocha', 'Ward',
  'Hayashi', 'Keller', 'Toth', 'Nyström', 'Romero', 'Abe', 'Leclair', 'Ortega', 'Strand', 'Kuroda', 'Falk', 'Navarro', 'Hale', 'Berg'];
const INITIALS = 'ABCDEFGHJKLMNOPRSTVY';

const TEAM_WORDS = {
  formula: ['Verde', 'Arrow', 'Kotobuki', 'Nordic', 'Bravo', 'Falcon', 'Meridian', 'Orion', 'Sakura', 'Vanguard', 'Hartley', 'Corsa', 'Ascent', 'Pioneer', 'Lumen', 'Tempest'],
  gt: ['Atlas', 'Ironworks', 'Blue Harbor', 'Kaiser', 'Monarch', 'Racing Union', 'Silverline', 'Takumi', 'Rennsport', 'Solstice', 'Granite', 'Pacific', 'Velocity', 'Stallion'],
  rally: ['Gravel Works', 'Nordic Rally', 'Summit', 'Alpine', 'Dirt Line', 'Ridge', 'Kodama', 'Sierra', 'Fjord', 'Pinecrest', 'Dune', 'Ember'],
};
const TEAM_SUFFIX = { kart: ['Kart', 'Junior', 'Kart Club'], formula: ['Racing', 'Motorsport', 'GP', 'Racing Team'], gt: ['Racing', 'Motorsport', 'Competition', 'Works'], rally: ['Rally Team', 'Motorsport', 'WRT'] };
