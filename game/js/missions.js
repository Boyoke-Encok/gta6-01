// Azura Bay — the six-mission story: Milo Reyes, getaway driver for Vera's crew.
// Written fresh for the gta6-01 round-3 entry.

import { dist, formatMoney } from './util.js';

const MONEY = [400, 600, 800, 1500, 1200, 5000];

export function makeMissions() {
  return {
    index: 0,            // 0..5, or 6 when the story is done
    stage: 0,            // sub-step inside a mission
    timer: 0,            // seconds left for timed missions (0 = untimed)
    hold: 0,             // hold-E progress 0..1
    done: false,
    freeRoam: false,
  };
}

export function missionTitle(m, idx) {
  return [
    '1 · First Fare', '2 · Hot Wheels', '3 · Harbor Run',
    '4 · Bank Job', "5 · Kingpin's Errand", '6 · The Big Score',
  ][idx] || 'Free Roam';
}

export function currentObjective(G) {
  const m = G.missions, L = G.city.locations;
  if (m.done || m.freeRoam) return null;
  const i = m.index;
  if (i === 0) {
    return m.stage === 0
      ? { text: 'Pick up the client at ' + L.safehouse.name, x: L.safehouse.x, y: L.safehouse.y, r: 70 }
      : { text: 'Drive the client to the Azura Grand Hotel', x: L.hotel.x, y: L.hotel.y, r: 80 };
  }
  if (i === 1) {
    return m.stage === 0
      ? { text: 'Steal the red Comet at the Marina (press E)', x: L.marina.x, y: L.marina.y, r: 70 }
      : { text: "Deliver the Comet to Vera's Garage", x: L.safehouse.x, y: L.safehouse.y, r: 80 };
  }
  if (i === 2) {
    return m.stage === 0
      ? { text: 'Pick up the package at the Harbor Docks', x: L.docks.x, y: L.docks.y, r: 70 }
      : { text: 'Deliver to Meridian Tower — beat the clock!', x: L.tower.x, y: L.tower.y, r: 80 };
  }
  if (i === 3) {
    return m.stage === 0
      ? { text: 'Get to the Azura National Bank', x: L.bank.x, y: L.bank.y, r: 70 }
      : m.stage === 1
        ? { text: 'Hold E to crack the safe…', x: L.bank.x, y: L.bank.y, r: 70, hold: true }
        : { text: 'Lose the heat — reach the safehouse!', x: L.safehouse.x, y: L.safehouse.y, r: 90 };
  }
  if (i === 4) {
    const d = L.drops[m.stage];
    return { text: 'Drop ' + (m.stage + 1) + ' of 3: ' + d.name, x: d.x, y: d.y, r: 70 };
  }
  // Mission 6.
  return m.stage === 0
    ? { text: 'Reach the Meridian Vault', x: L.vault.x, y: L.vault.y, r: 70 }
    : m.stage === 1
      ? { text: 'Hold E to drill the vault — guards incoming!', x: L.vault.x, y: L.vault.y, r: 70, hold: true }
      : { text: 'RUN! Escape to the boat at the beach!', x: L.boat.x, y: L.boat.y, r: 90 };
}

export function updateMissions(G, dt) {
  const m = G.missions;
  if (m.done || m.freeRoam) return;
  const obj = currentObjective(G);
  if (!obj) return;
  const p = G.player;

  // Timed missions tick down.
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      m.timer = 0;
      G.audio.fail();
      G.toast('Too slow — mission failed, try again');
      restartMission(G);
      return;
    }
  }

  const d = dist(p.x, p.y, obj.x, obj.y);
  if (d > obj.r) { m.hold = 0; return; }

  // Hot Wheels pays only for the Comet itself — any other car at the garage
  // is just a car, not the job.
  if (m.index === 1 && m.stage === 1 && p.car !== G.sportCar) return;

  if (obj.hold) {
    if (G.input.down('e')) {
      m.hold += dt / (m.index === 5 ? 5 : 3);
      if (Math.random() < 0.2) G.audio.blip(1200, 0.05, 'square', 0.05);
      if (m.hold >= 1) {
        m.hold = 0;
        if (m.index === 3) {
          G.addMoney(0); // payout lands on delivery, not on the crack
          G.wanted = 3;
          G.toast('Safe cracked! Cops are coming — RUN!');
          G.audio.missionDone();
          m.stage = 2;
        } else if (m.index === 5) {
          G.wanted = 5;
          G.toast('Vault open! Five stars — get to the boat!');
          G.audio.missionDone();
          m.stage = 2;
        }
      }
    } else m.hold = 0;
    return;
  }

  // Reached the objective marker.
  if (m.index === 0 && m.stage === 0) { m.stage = 1; G.toast('Client aboard — to the hotel!'); G.audio.pickup(); return; }
  if (m.index === 1 && m.stage === 0) return; // stealing is handled by E near the car
  if (m.index === 2 && m.stage === 0) { m.stage = 1; m.timer = 150; G.toast('Package secured — 2:30 on the clock!'); G.audio.pickup(); return; }
  if (m.index === 3 && m.stage === 0) { m.stage = 1; G.toast('Hold E to crack the safe'); return; }
  if (m.index === 5 && m.stage === 0) {
    m.stage = 1;
    G.toast('Guards! Hold E and keep them off you!');
    spawnGuards(G);
    return;
  }
  if (m.index === 4) {
    // Three drops, one at a time: only the third completes the mission.
    if (m.stage < 2) {
      m.stage++;
      G.toast('Drop ' + m.stage + ' of 3 done — next one!');
      G.audio.pickup();
      return;
    }
  }
  completeMission(G);
}

function spawnGuards(G) {
  const v = G.city.locations.vault;
  const spots = [[-90, -60], [90, -70], [-70, 90], [80, 80]];
  for (const [dx, dy] of spots) {
    G.guards.push({ x: v.x + dx, y: v.y + dy, angle: 0, hp: 3, shootCd: 0.5 + Math.random(), dead: false });
  }
}

function restartMission(G) {
  const m = G.missions;
  m.stage = 0; m.hold = 0; m.timer = 0;
  G.guards = [];
  G.toast('Mission restarted: ' + missionTitle(m, m.index));
}

export function completeMission(G) {
  const m = G.missions;
  const pay = MONEY[m.index];
  G.addMoney(pay);
  G.audio.missionDone();
  G.toast('Mission complete! +' + formatMoney(pay));
  G.missionsCompleted++;
  m.index++;
  m.stage = 0; m.hold = 0; m.timer = 0;
  if (m.index === 4) { m.timer = 180; G.toast('Three drops, 3:00 — go!'); }
  if (m.index >= 6) {
    m.done = true;
    G.win();
  }
}

// Called by entities when the sports car is stolen: advance mission 2.
export function onSportCarStolen(G) {
  const m = G.missions;
  if (m.index === 1 && m.stage === 0) {
    m.stage = 1;
    G.toast('Comet secured — deliver it to the garage!');
  }
}
