export const YOU = [0.3192, 32.5688];
export const HOME = [0.3224, 32.5693];

export const PLACES = {
  mak: {
    name: "Makerere University Hospital",
    short: "Makerere",
    dist: 1.2,
    drive: 4,
    amb: 6,
    kind: "hospital",
    conn: true,
    uni: "Makerere University",
    ll: [0.3304, 32.5701],
    phone: "+256 000 000 001",
  },
  mul: {
    name: "Mulago National Referral Hospital",
    short: "Mulago",
    dist: 3.4,
    drive: 11,
    kind: "hospital",
    conn: false,
    ll: [0.3378, 32.5756],
    phone: "+256 000 000 002",
  },
  nsa: {
    name: "Nsambya Hospital",
    short: "Nsambya",
    dist: 5.1,
    drive: 16,
    kind: "hospital",
    conn: false,
    ll: [0.2983, 32.5862],
    phone: "+256 000 000 003",
  },
};

export const ROUTES = {
  mak: [YOU, [0.3242, 32.5692], [0.3282, 32.5698], PLACES.mak.ll],
  mul: [YOU, [0.3268, 32.5704], [0.3336, 32.5732], PLACES.mul.ll],
  nsa: [YOU, [0.3124, 32.5748], [0.3052, 32.5814], PLACES.nsa.ll],
};

export const TRAIL = [YOU, [0.3222, 32.5692], [0.3254, 32.5696], [0.3282, 32.5700]];

export const STEPS = {
  mak: [
    ["Head north", "300 m, then turn right"],
    ["Turn right at the junction", "450 m"],
    ["Turn left towards the gate", "200 m"],
    ["You have arrived", "Makerere University Hospital"],
  ],
  mul: [
    ["Head north", "300 m, then turn right"],
    ["Continue straight", "1.8 km"],
    ["You have arrived", "Mulago National Referral Hospital"],
  ],
  nsa: [
    ["Head east", "Follow the main road"],
    ["Continue straight", "4.2 km"],
    ["You have arrived", "Nsambya Hospital"],
  ],
};

export function homePoint(user) {
  if (user?.home?.lat != null && user?.home?.lng != null) return [user.home.lat, user.home.lng];
  return HOME;
}

export function pointAlong(route, t) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < route.length; i += 1) {
    const len = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    segs.push({ a: route[i - 1], b: route[i], len });
    total += len;
  }
  let dist = total * t;
  for (const seg of segs) {
    if (dist <= seg.len) {
      const ratio = seg.len ? dist / seg.len : 0;
      return [seg.a[0] + (seg.b[0] - seg.a[0]) * ratio, seg.a[1] + (seg.b[1] - seg.a[1]) * ratio];
    }
    dist -= seg.len;
  }
  return route[route.length - 1];
}
