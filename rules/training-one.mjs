// The handbook duel uses its own attack profiles. See TRAINING.md, pp. 53–55.
const profiles = {
  orks: {attacks: 4, hit: 3, wound: 2, enemySave: 4},
  marines: {attacks: 5, hit: 2, wound: 4, enemySave: 6},
};

const opponent = side => side === 'orks' ? 'marines' : 'orks';
const isDie = value => Number.isInteger(value) && value >= 1 && value <= 6;

export function createTrainingOne() {
  return {
    version: 1, scenario: 1, attacker: 'orks', step: 'hit',
    wounds: {orks: 6, marines: 6}, rolls: [], winner: null,
  };
}

export function trainingOneView({attacker, step, winner, rolls}) {
  if (winner) return {attacker, step: 'won', winner, actor: null, count: 0, threshold: null};
  const profile = profiles[attacker];
  const save = step === 'save';
  return {
    actor: save ? opponent(attacker) : attacker, attacker, step, winner,
    count: step === 'hit' ? profile.attacks : rolls.at(-1).successes,
    threshold: save ? profile.enemySave : profile[step],
  };
}

function resolvePool(state, view, dice) {
  const {actor, attacker, step, threshold} = view;
  const defender = opponent(attacker);
  const successes = dice.filter(value => value >= threshold).length;
  const damage = step === 'save' ? (dice.length - successes) * 2 : 0;
  state.rolls.push({actor, attacker, step, threshold, dice, successes, damage});
  state.wounds[defender] = Math.max(0, state.wounds[defender] - damage);
  if (state.wounds[defender] === 0) {
    state.winner = attacker;
    state.step = 'won';
  } else if (step === 'save' || successes === 0) {
    state.attacker = defender;
    state.step = 'hit';
  } else {
    state.step = step === 'hit' ? 'wound' : 'save';
  }
}

export function rollTrainingOne(state, d6 = () => 1 + Math.floor(Math.random() * 6)) {
  if (!validateTrainingOne(state)) throw new Error('훈련 임무의 저장된 판정 기록을 확인하세요.');
  if (state.winner) throw new Error('이미 승자가 결정된 결투입니다.');
  const view = trainingOneView(state);
  const dice = Array.from({length: view.count}, () => {
    const die = d6();
    if (!isDie(die)) throw new RangeError('D6 결과는 1부터 6까지의 정수여야 합니다.');
    return die;
  });
  const next = {...state, wounds: {...state.wounds}, rolls: [...state.rolls]};
  resolvePool(next, view, dice);
  return next;
}

export function validateTrainingOne(state) {
  if (state?.version !== 1 || state.scenario !== 1 || !Array.isArray(state.rolls) || !state.wounds) return false;
  const replay = createTrainingOne();
  for (const record of state.rolls) {
    if (replay.winner || !Array.isArray(record?.dice)) return false;
    const view = trainingOneView(replay);
    if (record.dice.length !== view.count || record.attacker !== view.attacker ||
        record.actor !== view.actor || record.step !== view.step || record.threshold !== view.threshold) return false;
    for (const die of record.dice) if (!isDie(die)) return false;
    resolvePool(replay, view, record.dice);
    const expected = replay.rolls.at(-1);
    if (record.successes !== expected.successes || record.damage !== expected.damage) return false;
  }
  return replay.attacker === state.attacker && replay.step === state.step && replay.winner === state.winner &&
    replay.wounds.orks === state.wounds.orks && replay.wounds.marines === state.wounds.marines;
}
