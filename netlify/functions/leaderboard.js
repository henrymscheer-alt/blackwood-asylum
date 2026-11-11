import { getStore } from "@netlify/blobs";

const MAX_STORED = 100;
const TOP_N = 10;

function topFor(data, nightmare){
  return data
    .filter(e => !!e.nightmare === nightmare)
    .slice()
    .sort((a,b)=>a.time-b.time)
    .slice(0, TOP_N);
}

export default async (req) => {
  const store = getStore("leaderboard");

  if (req.method === "GET") {
    const data = (await store.get("scores", { type: "json" })) || [];
    const body = {
      normal: topFor(data, false),
      nightmare: topFor(data, true),
    };
    return new Response(JSON.stringify(body), {
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
    const nightmare = !!payload.nightmare;
    const cheated = !!payload.cheated;
    if (!isFinite(time) || time <= 0 || time > 36000) {
      return new Response("Invalid score", { status: 400 });
    }

    const data = (await store.get("scores", { type: "json" })) || [];
    data.push({ name, time, character, nightmare, cheated, at: Date.now() });

    // keep the dataset bounded: top MAX_STORED per mode, sorted by time
    const keepNormal = data.filter(e=>!e.nightmare).sort((a,b)=>a.time-b.time).slice(0, MAX_STORED);
    const keepNightmare = data.filter(e=>e.nightmare).sort((a,b)=>a.time-b.time).slice(0, MAX_STORED);
    const trimmed = keepNormal.concat(keepNightmare);
    await store.setJSON("scores", trimmed);

    return new Response(JSON.stringify({
      normal: topFor(trimmed, false),
      nightmare: topFor(trimmed, true),
    }), { headers: { "content-type": "application/json" } });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/leaderboard" };
