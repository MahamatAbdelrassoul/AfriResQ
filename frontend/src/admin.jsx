import { useCallback, useEffect, useState } from "react";
import sprite from "./sprite.html?raw";
import { SignedOut, ago, readSession, saveSession, teamCall } from "./admin-api.js";
import { CasesPanel, Icon, PartnersPanel, PeoplePanel, PlacesPanel, SecurityPanel } from "./admin-panels.jsx";

const TABS = [
  ["overview", "Overview", "home"],
  ["cases", "Cases", "alert"],
  ["people", "People", "users"],
  ["places", "Places", "pin"],
  ["partners", "Partners", "plus"],
  ["security", "Security", "lock"],
];

function readTab() {
  const name = window.location.hash.replace(/^#\/?/, "");
  return TABS.some(([id]) => id === name) ? name : "overview";
}

function Tile({ label, value, note, tone = "", onClick }) {
  return (
    <button type="button" className={`team-tile ${tone}`} onClick={onClick}>
      <small>{label}</small>
      <b>{value}</b>
      {note ? <span>{note}</span> : null}
    </button>
  );
}

function Overview({ token, stats, version, go, onFail }) {
  const [late, setLate] = useState(null);

  useEffect(() => {
    let stop = false;
    teamCall(token, "/cases?state=waiting")
      .then((rows) => { if (!stop) setLate(rows.slice(0, 6)); })
      .catch((err) => { if (!stop) onFail(err); });
    return () => { stop = true; };
  }, [token, version, stats.waiting]);

  return (
    <section className="team-panel">
      <div className="team-tiles">
        <Tile label="Open cases" value={stats.open} note={`${stats.today} sent today`} onClick={() => go("cases")} />
        <Tile
          label="Waiting for a desk"
          value={stats.waiting}
          note={stats.late ? `${stats.late} waiting over ${stats.lateMinutes} min` : "No one waiting long"}
          tone={stats.late ? "alarm" : stats.waiting ? "warn" : ""}
          onClick={() => go("cases", "waiting")}
        />
        <Tile label="Desks signed in" value={stats.desks_online} note="Right now" onClick={() => go("places")} />
        <Tile label="People" value={stats.people} note={`${stats.students} students`} onClick={() => go("people")} />
        <Tile label="Partner requests" value={stats.pending_partners} note="Waiting for the team" tone={stats.pending_partners ? "warn" : ""} onClick={() => go("partners")} />
        <Tile label="Blocked numbers" value={stats.blocked} note={stats.rating ? `Average rating ${stats.rating} of 5` : `${stats.closed} cases closed`} onClick={() => go("people")} />
      </div>
      <h2 className="team-h2">Waiting for a desk</h2>
      <div className="team-list">
        {late == null ? <p className="sub">Loading…</p> : null}
        {late && !late.length ? (
          <article className="team-card">
            <b>No one is waiting</b>
            <small className="team-muted">Every case has been taken by a desk.</small>
          </article>
        ) : null}
        {(late || []).map((item) => {
          const minutes = (Date.now() - new Date(item.createdAt).getTime()) / 60000;
          return (
            <button type="button" className="team-case" key={item.id} onClick={() => go("cases", "waiting")}>
              <em className={`bd ${minutes > stats.lateMinutes ? "warn" : ""}`}>{ago(item.createdAt)}</em>
              <span className="t">
                <b>{item.id}<span> · {item.what}</span></b>
                <small>{item.person} · {item.placeShort || "No place"} · {item.whereText || "Location sent with the case"}</small>
              </span>
              <Icon n="chevR" c="chev" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function Team() {
  const [token, setToken] = useState(readSession);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState(null);
  const [tab, setTab] = useState(readTab);
  const [caseFilter, setCaseFilter] = useState("open");
  const [version, setVersion] = useState(0);

  const signOutHere = useCallback((message) => {
    saveSession("");
    setToken("");
    setOverview(null);
    setError(message || "");
  }, []);

  const onFail = useCallback((err) => {
    if (err instanceof SignedOut) signOutHere(err.message);
    else setError(err.message);
  }, [signOutHere]);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let stop = false;
    const load = async () => {
      try {
        const body = await teamCall(token, "/overview");
        if (!stop) setOverview(body);
      } catch (err) {
        if (!stop) onFail(err);
      }
    };
    load();
    const id = setInterval(load, 8000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [token, version, onFail]);

  function go(next, filter) {
    if (filter) setCaseFilter(filter);
    else if (next === "cases") setCaseFilter("open");
    setNotice("");
    setError("");
    window.location.hash = `/${next}`;
    setTab(next);
    window.scrollTo({ top: 0 });
  }

  // Runs one change, shows what happened, and reloads every list on the page.
  async function act(change) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const message = await change();
      if (message) setNotice(message);
      setVersion((v) => v + 1);
    } catch (err) {
      onFail(err);
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    setBusy(true);
    try {
      const body = await teamCall("", "/session", { method: "POST", body: { code } });
      saveSession(body.token);
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
    signOutHere("");
    await teamCall(current, "/session", { method: "DELETE" }).catch(() => {});
  }

  const panelProps = { token, version, act, busy, onFail };

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
            <nav className="team-tabs" aria-label="Team page sections">
              {TABS.map(([id, label, icon]) => (
                <button type="button" key={id} className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => go(id)}>
                  <Icon n={icon} c="s" />
                  {label}
                  {id === "cases" && overview.stats.waiting ? <i>{overview.stats.waiting}</i> : null}
                  {id === "partners" && overview.stats.pending_partners ? <i>{overview.stats.pending_partners}</i> : null}
                </button>
              ))}
            </nav>
          </header>
          {notice ? <div className="note team-note"><Icon n="check" c="m" /><span>{notice}</span></div> : null}
          {error ? <div className="err team-note" role="alert">{error}</div> : null}
          {tab === "overview" ? <Overview token={token} stats={overview.stats} version={version} go={go} onFail={onFail} /> : null}
          {tab === "cases" ? <CasesPanel key={caseFilter} {...panelProps} places={overview.places} initialFilter={caseFilter} /> : null}
          {tab === "people" ? <PeoplePanel {...panelProps} /> : null}
          {tab === "places" ? <PlacesPanel {...panelProps} places={overview.places} /> : null}
          {tab === "partners" ? <PartnersPanel {...panelProps} applications={overview.applications} /> : null}
          {tab === "security" ? <SecurityPanel {...panelProps} /> : null}
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
