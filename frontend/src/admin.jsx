import { useEffect, useState } from "react";
import sprite from "./sprite.html?raw";

const KEY = "afriresq-admin";

function Icon({ n, c = "" }) {
  return (
    <svg className={`i ${c}`} aria-hidden="true">
      <use href={`#i-${n}`} />
    </svg>
  );
}

function readSession() {
  return sessionStorage.getItem(KEY) || "";
}

async function readBody(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "The team page could not be opened.");
  return body;
}

function stateClass(state) {
  if (state === "sent") return "warn";
  if (state === "closed" || state === "cancelled") return "";
  return "ok";
}

export default function Team() {
  const [token, setToken] = useState(readSession);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!token) return undefined;
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/overview", { headers: { Authorization: `Bearer ${token}` } });
        const body = await readBody(res);
        if (!stop) {
          setOverview(body);
          setError("");
        }
      } catch (err) {
        if (stop) return;
        if (String(err.message).includes("Sign in")) {
          sessionStorage.removeItem(KEY);
          setToken("");
        }
        setError(err.message);
      }
    };
    load();
    const id = setInterval(load, 8000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [token]);

  async function signIn() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await readBody(res);
      sessionStorage.setItem(KEY, body.token);
      setToken(body.token);
      setCode("");
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    const current = token;
    sessionStorage.removeItem(KEY);
    setToken("");
    setOverview(null);
    await fetch("/api/admin/session", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${current}` },
    }).catch(() => {});
  }

  async function saveCode(placeId) {
    const next = String(drafts[placeId] || "").trim();
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`/api/admin/desks/${encodeURIComponent(placeId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: next }),
      });
      const body = await readBody(res);
      setDrafts((current) => ({ ...current, [placeId]: "" }));
      setNotice(`${body.name} will use the new code. The old one has stopped.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const desks = (overview?.places || []).filter((place) => place.receives);
  const listed = (overview?.places || []).filter((place) => !place.receives);

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: sprite }} />
      {token && overview ? (
        <main className="team">
          <header className="team-bar">
            <div className="team-bar-inner">
              <div className="team-mark">
                <span className="ico green"><Icon n="logo" /></span>
                <span>
                  <b>AfriResQ</b>
                  <small>Team</small>
                </span>
              </div>
              <button type="button" className="btn out sm" onClick={leave}>Leave</button>
            </div>
          </header>
          <div className="team-lead">
            <small>For the people who run AfriResQ</small>
            <h1>The desks you control.</h1>
          </div>
          {notice ? <div className="note team-note"><Icon n="check" c="m" /><span>{notice}</span></div> : null}
          {error ? <div className="err" role="alert">{error}</div> : null}
          <div className="team-grid">
            <section className="team-col">
              <h2>Desks</h2>
              <div className="team-desks">
                {desks.map((place) => (
                  <article className="team-card" key={place.id}>
                    <div className="team-desk">
                      <span className={`ico ${place.kind === "police" ? "violet" : "green"}`}>
                        <Icon n={place.kind === "police" ? "shield2" : "plus"} />
                      </span>
                      <span className="grow">
                        <b>{place.name}</b>
                        <small>{place.open} open · {place.closed} closed</small>
                      </span>
                      <em className="bd ok">Receives</em>
                    </div>
                    <div className="team-code">
                      <div className="inp">
                        <Icon n="lock" c="m" />
                        <input
                          type="password"
                          inputMode="numeric"
                          placeholder="New desk code"
                          autoComplete="off"
                          value={drafts[place.id] || ""}
                          onChange={(event) => setDrafts((current) => ({ ...current, [place.id]: event.target.value }))}
                        />
                      </div>
                      <button type="button" className="btn pri sm" disabled={busy || !drafts[place.id]} onClick={() => saveCode(place.id)}>Save</button>
                    </div>
                  </article>
                ))}
              </div>
              {listed.length ? (
                <div className="team-places">
                  <h2>Listed only</h2>
                  {listed.map((place) => (
                    <div className="team-place" key={place.id}>
                      <span className="ico plain"><Icon n="pin" /></span>
                      <span className="grow">
                        <b>{place.name}</b>
                        <small>People can call and follow a route. This place does not receive a demand.</small>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
            <section className="team-col">
              <h2>Cases</h2>
              <div className="team-list">
                {overview.cases.length ? overview.cases.map((item) => (
                  <div className="team-case" key={item.id}>
                    <em className={`bd ${stateClass(item.state)}`}>{item.stateLabel}</em>
                    <span className="t">
                      <b>{item.id}<span> · {item.what}</span></b>
                      <small>{item.person} · {item.phone} · {item.whereText || item.desk}</small>
                    </span>
                  </div>
                )) : (
                  <div className="team-card">
                    <b>No cases yet</b>
                    <small style={{ color: "var(--ink2)", fontWeight: 600 }}>A demand shows up here after someone sends one.</small>
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      ) : (
        <main className="team">
          <form className="team-gate" onSubmit={(event) => { event.preventDefault(); signIn(); }}>
            <div className="team-mark">
              <span className="ico green"><Icon n="logo" /></span>
              <span>
                <b>AfriResQ</b>
                <small>Team</small>
              </span>
            </div>
            <h1>The page for the people who run it.</h1>
            <p className="sub">Students, citizens, and the hospital and police desks never come here. This code is only for you and your teammates.</p>
            <div className="field">
              <label htmlFor="team-code">Team code</label>
              <div className="inp">
                <Icon n="lock" c="m" />
                <input id="team-code" type="password" inputMode="numeric" autoComplete="off" placeholder="Enter the team code" value={code} onChange={(event) => setCode(event.target.value)} />
              </div>
              {error ? <div className="err" role="alert">{error}</div> : null}
            </div>
            <button type="submit" className="btn pri" disabled={busy || code.trim().length < 4}>{busy ? "Checking…" : "Open the team page"}</button>
          </form>
        </main>
      )}
    </>
  );
}
