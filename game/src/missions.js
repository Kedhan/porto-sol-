// Cinder Bay story missions: five jobs from fixer Mara Voss, with cash rewards.
export const MISSIONS = [
  {
    id: 1, title: 'FIRST WHEELS', giver: 'Mara Voss',
    brief: 'Mara needs a ride. Steal any parked car (E) and bring it to Mara\'s Garage.',
    objective: 'Steal a car and deliver it to Mara\'s Garage',
    reward: 500, target: { x: 635, y: 615 }, kind: 'deliverCar', timeLimit: 0,
  },
  {
    id: 2, title: 'HARBOR RUN', giver: 'Mara Voss',
    brief: 'A package for the Old Pier, and the clock is ticking. Drive there in 90 seconds.',
    objective: 'Drive to the Old Pier marker before time runs out',
    reward: 900, target: { x: 410, y: 2185 }, kind: 'goto', timeLimit: 90,
  },
  {
    id: 3, title: 'PAYBACK', giver: 'Mara Voss',
    brief: 'The Ashford crew jumped one of ours. Clear their corner by the park — pistol out, stay alive.',
    objective: 'Defeat 4 Ashford crew members near Cinder Park',
    reward: 1400, target: { x: 1650, y: 1230 }, kind: 'defeat', count: 4, timeLimit: 0,
  },
  {
    id: 4, title: 'BANK COURIER', giver: 'Mara Voss',
    brief: 'Grab the courier case at Harbour Bank, then lose the heat. The PD will be on you — drive fast.',
    objective: 'Collect the case at Harbour Bank, then reach the beach safehouse',
    reward: 2200, target: { x: 1645, y: 1460 }, kind: 'collect', timeLimit: 0,
  },
  {
    id: 5, title: 'CINDER CROWN', giver: 'Mara Voss',
    brief: 'Final job: take the Crown case from Ashford Tower and deliver it to the Old Pier. Expect a fight — and sirens.',
    objective: 'Take the case at Ashford Tower, defeat the guards, deliver to the Old Pier',
    reward: 5000, target: { x: 2645, y: 1465 }, kind: 'finale', count: 3, timeLimit: 0,
  },
];

export function missionByIndex(i) { return MISSIONS[i] || null; }
export function missionListText(current) {
  return MISSIONS.map((m, i) => {
    const state = i < current ? '✓ DONE' : i === current ? '▶ NEXT' : '· LOCKED';
    return `<b>${m.id}. ${m.title}</b> — ${state} · $${m.reward.toLocaleString()} · ${m.giver}`;
  }).join('<br>');
}
// Mission runtime state, created fresh per mission in main.js.
export function createMissionState(mission) {
  return { mission, stage: 0, timer: mission.timeLimit || 0, defeated: 0, collected: false, done: false, failed: false };
}
export function missionProgressText(state) {
  if (!state) return '';
  const m = state.mission;
  if (m.kind === 'defeat' || m.kind === 'finale') return `${state.defeated}/${m.count} crew down`;
  if (m.kind === 'collect') return state.collected ? 'Case secured — reach the beach safehouse!' : 'Go to Harbour Bank and grab the case (walk over it)';
  if (m.kind === 'goto' && state.timer > 0) return `${Math.ceil(state.timer)}s left`;
  return '';
}
