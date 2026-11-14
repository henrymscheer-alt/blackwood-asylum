import { getStore } from "@netlify/blobs";

const MAX_STORED = 100;
const TOP_N = 10;
const MODES = ["normal", "nightmare", "hard", "daily"];

function modeOf(e){
  if (MODES.includes(e.mode)) return e.mode;
  return e.nightmare ? "nightmare" : "normal"; // back-compat with older entries
}

function topFor(data, mode){
  let pool = data.filter(e => modeOf(e) === mode);
  if (mode === "daily" && pool.length) {
    // only the most recent day's entries count as "today's" challenge — sidesteps server/client timezone drift
    const latestDay = pool.reduce((max, e) => ((e.day || "") > max ? (e.day || "") : max), "");
    pool = pool.filter(e => (e.day || "") === latestDay);
  }
  return pool.slice().sort((a,b)=>a.time-b.time).slice(0, TOP_N);
}

function allLists(data){
  return { normal: topFor(data,"normal"), nightmare: topFor(data,"nightmare"), hard: topFor(data,"hard"), daily: topFor(data,"daily") };
}

export default async (req) => {
  const store = getStore("leaderboard");

  if (req.method === "GET") {
    const data = (await store.get("scores", { type: "json" })) || [];
    return new Response(JSON.stringify(allLists(data)), {
      headers: { "content-type": "application/json" },
    });
  }

  if (req.method === "POST") {
    let payload;
    try { payload = await req.json(); } catch (e) {
      return new Response("Bad request", { status: 400 });
    }
    const name = String(payload.name || "Guest").trim().slice(0, 20) || "Guest";
    const time = Number(payload.time);
    const character = String(payload.character || "").slice(0, 30);
    const mode = MODES.includes(payload.mode) ? payload.mode : (payload.nightmare ? "nightmare" : "normal");
    const cheated = !!payload.cheated;
    const day = mode === "daily" ? String(payload.day || "").slice(0, 10) : undefined;
    if (!isFinite(time) || time <= 0 || time > 36000) {
      return new Response("Invalid score", { status: 400 });
    }

    const data = (await store.get("scores", { type: "json" })) || [];
    data.push({ name, time, character, mode, cheated, day, at: Date.now() });

    // keep the dataset bounded: top MAX_STORED per mode, sorted by time
    let trimmed = [];
    for (const m of MODES) {
      trimmed = trimmed.concat(
        data.filter(e => modeOf(e) === m).sort((a,b)=>a.time-b.time).slice(0, MAX_STORED)
      );
    }
    await store.setJSON("scores", trimmed);

    return new Response(JSON.stringify(allLists(trimmed)), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/leaderboard" };
