import { useEffect, useState } from "react";
import { KIND_LABEL, STATE_OPTIONS, ago, stateClass, teamCall } from "./admin-api.js";

export function Icon({ n, c = "" }) {
  return (
    <svg className={`i ${c}`} aria-hidden="true">
      <use href={`#i-${n}`} />
    </svg>
  );
}

function Empty({ title, sub }) {
  return (
    <article className="team-card">
      <b>{title}</b>
      <small className="team-muted">{sub}</small>
    </article>
  );
}

function Search({ value, onChange, placeholder }) {
  return (
    <div className="inp team-search">
      <Icon n="search" c="m" />
      <input type="search" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <div className="team-seg" role="tablist">
      {options.map(([id, label]) => (
        <button type="button" key={id} className={value === id ? "on" : ""} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  );
}

// Typing in a search box waits a moment before asking the API.
function useSettled(value, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

// Loads a team-page list, and loads it again every few seconds and after each change.
function useTeamList(token, path, version, onFail, every = 8000) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const next = await teamCall(token, path);
        if (!stop) setRows(next);
      } catch (err) {
        if (!stop) onFail(err);
      }
    };
    load();
    const id = every ? setInterval(load, every) : null;
    return () => {
      stop = true;
      if (id) clearInterval(id);
    };
  }, [token, path, version]);
  return rows;
}

function mapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function CasesPanel({ token, places, version, act, busy, onFail, initialFilter = "open" }) {
  const [filter, setFilter] = useState(initialFilter);
  const [place, setPlace] = useState("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState("");
  const [draft, setDraft] = useState({});
  const q = useSettled(query);
  const params = new URLSearchParams({ state: filter });
  if (place) params.set("place", place);
  if (q.trim()) params.set("q", q.trim());
  const rows = useTeamList(token, `/cases?${params}`, version, onFail);

  function toggle(item) {
    if (openId === item.id) {
      setOpenId("");
      return;
    }
    setOpenId(item.id);
    setDraft({ state: item.state, placeId: item.place });
  }

  function save(item) {
    const body = {};
    if (draft.state !== item.state) body.state = draft.state;
    if (draft.placeId !== item.place) body.placeId = draft.placeId;
    if (!Object.keys(body).length) return;
    if (body.state === "cancelled" && !window.confirm(`Cancel ${item.id}? The desk stops seeing it.`)) return;
    act(async () => {
      await teamCall(token, `/cases/${encodeURIComponent(item.id)}`, { method: "PATCH", body });
      setOpenId("");
      return `${item.id} is saved.`;
    });
  }

  return (
    <section className="team-panel">
      <div className="team-tools">
        <Seg
          value={filter}
          onChange={setFilter}
          options={[["open", "Open"], ["waiting", "Waiting"], ["closed", "Closed"], ["declined", "Declined"], ["cancelled", "Cancelled"], ["all", "All"]]}
        />
        <div className="team-tools-row">
          <Search value={query} onChange={setQuery} placeholder="Case number, name, phone, or place" />
          <div className="inp team-select">
            <Icon n="pin" c="m" />
            <select value={place} onChange={(event) => setPlace(event.target.value)} aria-label="Place">
              <option value="">Every place</option>
              {places.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="team-list">
        {rows == null ? <p className="sub">Loading cases…</p> : null}
        {rows && !rows.length ? <Empty title="No cases here" sub="Try another filter, or clear the search." /> : null}
        {(rows || []).map((item) => (
          <article className={`team-case-card${openId === item.id ? " open" : ""}`} key={item.id}>
            <button type="button" className="team-case" onClick={() => toggle(item)} aria-expanded={openId === item.id}>
              <em className={`bd ${stateClass(item.state)}`}>{item.stateLabel}</em>
              <span className="t">
                <b>{item.id}<span> · {item.what}</span></b>
                <small>{item.person} · +256 {item.phone} · {item.placeShort || item.place || "No place"} · {ago(item.createdAt)}</small>
              </span>
              {item.blocked ? <em className="bd warn">Blocked</em> : null}
              <Icon n="chevR" c="chev" />
            </button>
            {openId === item.id ? (
              <div className="team-case-body">
                <div className="kv"><span>Person</span><b>{item.person} · {item.personType === "student" ? "Student" : "Citizen"}</b></div>
                <div className="kv"><span>Phone</span><b><a href={`tel:+256${item.phoneDigits}`}>+256 {item.phone}</a></b></div>
                <div className="kv"><span>Type</span><b>{item.kind === "medical" ? "Medical" : "Other"} · {item.path === "ambulance" ? "Ambulance" : item.path === "route" ? "Route" : "Desk"}</b></div>
                <div className="kv">
                  <span>Where</span>
                  <b>
                    {item.whereText || "Not written"}
                    {item.whereLat != null ? <> · <a href={mapsLink(item.whereLat, item.whereLng)} target="_blank" rel="noreferrer">Open map</a></> : null}
                  </b>
                </div>
                {item.awake ? <div className="kv"><span>Awake</span><b>{item.awake}</b></div> : null}
                {item.detail ? <div className="kv"><span>Report</span><b>{item.detail}</b></div> : null}
                {item.declineReason ? <div className="kv"><span>Declined because</span><b>{item.declineReason}</b></div> : null}
                {item.rating ? <div className="kv"><span>Rating</span><b>{item.rating} of 5</b></div> : null}
                <div className="kv"><span>Last change</span><b>{ago(item.updatedAt)}</b></div>
                <div className="team-form-row">
                  <label className="field">
                    <span className="team-label">State</span>
                    <div className="inp">
                      <select value={draft.state} onChange={(event) => setDraft((d) => ({ ...d, state: event.target.value }))}>
                        {STATE_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                      </select>
                    </div>
                  </label>
                  <label className="field">
                    <span className="team-label">Place</span>
                    <div className="inp">
                      <select value={draft.placeId} onChange={(event) => setDraft((d) => ({ ...d, placeId: event.target.value }))}>
                        {!item.place ? <option value="">No place</option> : null}
                        {places.map((p) => <option key={p.id} value={p.id}>{p.name}{p.receives ? "" : " (listed only)"}</option>)}
                      </select>
                    </div>
                  </label>
                </div>
                <div className="team-actions">
                  <button type="button" className="btn pri sm" disabled={busy || (draft.state === item.state && draft.placeId === item.place)} onClick={() => save(item)}>Save</button>
                  <button type="button" className="btn out sm" onClick={() => setOpenId("")}>Close</button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function PeoplePanel({ token, version, act, busy, onFail }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [blocking, setBlocking] = useState("");
  const [reason, setReason] = useState("");
  const q = useSettled(query);
  const params = new URLSearchParams({ filter });
  if (q.trim()) params.set("q", q.trim());
  const rows = useTeamList(token, `/people?${params}`, version, onFail, 0);

  function setBlocked(person, blocked) {
    act(async () => {
      await teamCall(token, `/people/${person.phoneDigits}`, {
        method: "PATCH",
        body: blocked ? { blocked, reason } : { blocked },
      });
      setBlocking("");
      setReason("");
      return blocked
        ? `${person.name} can no longer send cases.`
        : `${person.name} can send cases again.`;
    });
  }

  return (
    <section className="team-panel">
      <div className="team-tools">
        <Seg value={filter} onChange={setFilter} options={[["all", "Everyone"], ["citizen", "Citizens"], ["student", "Students"], ["blocked", "Blocked"]]} />
        <Search value={query} onChange={setQuery} placeholder="Name, phone, email, or student number" />
      </div>
      <p className="team-muted team-hint">Medical cards are not shown here. Only the desk that receives a case sees them.</p>
      <div className="team-list">
        {rows == null ? <p className="sub">Loading people…</p> : null}
        {rows && !rows.length ? <Empty title="No one matches" sub="Try another filter, or clear the search." /> : null}
        {(rows || []).map((person) => (
          <article className="team-card" key={person.phoneDigits}>
            <div className="team-desk">
              <span className={`ico ${person.type === "student" ? "violet" : "green"}`}><Icon n={person.type === "student" ? "cap" : "user"} /></span>
              <span className="grow">
                <b>{person.name}</b>
                <small><a href={`tel:+256${person.phoneDigits}`}>+256 {person.phone}</a>{person.email ? ` · ${person.email}` : ""}</small>
                {person.type === "student" ? <small>{[person.studentNo, person.hall].filter(Boolean).join(" · ") || "Student"}</small> : null}
                <small>
                  {person.cases} case{person.cases === 1 ? "" : "s"}
                  {person.cancelled ? ` · ${person.cancelled} cancelled` : ""}
                  {` · joined ${ago(person.createdAt)}`}
                  {person.profileDone ? "" : " · profile not finished"}
                </small>
                {person.blocked ? <small className="team-red">Blocked: {person.blockedReason}</small> : null}
              </span>
              <em className={`bd ${person.blocked ? "warn" : person.type === "student" ? "vio" : "ok"}`}>
                {person.blocked ? "Blocked" : person.type === "student" ? "Student" : "Citizen"}
              </em>
            </div>
            {person.blocked ? (
              <div className="team-actions">
                <button type="button" className="btn out sm" disabled={busy} onClick={() => setBlocked(person, false)}>Unblock</button>
              </div>
            ) : blocking === person.phoneDigits ? (
              <div className="team-code">
                <div className="inp">
                  <Icon n="info" c="m" />
                  <input value={reason} placeholder="Why, for example three false alarms" onChange={(event) => setReason(event.target.value)} />
                </div>
                <button type="button" className="btn red sm" disabled={busy || !reason.trim()} onClick={() => setBlocked(person, true)}>Block</button>
                <button type="button" className="btn out sm" onClick={() => { setBlocking(""); setReason(""); }}>Back</button>
              </div>
            ) : (
              <div className="team-actions">
                <button type="button" className="btn out sm" onClick={() => { setBlocking(person.phoneDigits); setReason(""); }}>Block this number</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

const EMPTY_PLACE = {
  id: "",
  kind: "hospital",
  name: "",
  short: "",
  phone: "",
  university: "",
  lat: "",
  lng: "",
  ambulanceMin: "",
  receives: false,
};

function PlaceForm({ start, creating, core, busy, onSave, onCancel }) {
  const [form, setForm] = useState(start);
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  return (
    <form className="team-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
      {creating ? (
        <label className="field">
          <span className="team-label">Place id</span>
          <div className="inp"><input value={form.id} placeholder="kcca-fire" onChange={set("id")} /></div>
        </label>
      ) : null}
      <div className="team-form-row">
        <label className="field">
          <span className="team-label">Kind</span>
          <div className="inp">
            <select value={form.kind} onChange={set("kind")}>
              {Object.entries(KIND_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
        </label>
        <label className="field">
          <span className="team-label">Short name</span>
          <div className="inp"><input value={form.short} placeholder="Mulago" onChange={set("short")} /></div>
        </label>
      </div>
      <label className="field">
        <span className="team-label">Full name</span>
        <div className="inp"><input value={form.name} placeholder="Mulago National Referral Hospital" onChange={set("name")} /></div>
      </label>
      <div className="team-form-row">
        <label className="field">
          <span className="team-label">Latitude</span>
          <div className="inp"><input value={form.lat} inputMode="decimal" placeholder="0.3378" onChange={set("lat")} /></div>
        </label>
        <label className="field">
          <span className="team-label">Longitude</span>
          <div className="inp"><input value={form.lng} inputMode="decimal" placeholder="32.5756" onChange={set("lng")} /></div>
        </label>
      </div>
      <div className="team-form-row">
        <label className="field">
          <span className="team-label">Phone</span>
          <div className="inp"><input value={form.phone} placeholder="+256 …" onChange={set("phone")} /></div>
        </label>
        <label className="field">
          <span className="team-label">Ambulance minutes</span>
          <div className="inp"><input value={form.ambulanceMin ?? ""} inputMode="numeric" placeholder="Empty if no ambulance" onChange={set("ambulanceMin")} /></div>
        </label>
      </div>
      <label className="field">
        <span className="team-label">University it serves</span>
        <div className="inp"><input value={form.university} placeholder="Empty if it serves everyone" onChange={set("university")} /></div>
      </label>
      <button type="button" className="team-switch" disabled={core} onClick={() => setForm((f) => ({ ...f, receives: !f.receives }))}>
        <span className="grow">
          <b>Receives cases</b>
          <small>{core
            ? "This desk is built into the AfriResQ app, so it always receives cases."
            : "On: people can send demands here and a desk works them. Off: listed only, people call and follow a route."}</small>
        </span>
        <span className="switch" role="switch" aria-checked={form.receives} />
      </button>
      <p className="team-muted team-hint">Tip: in Google Maps, right-click the place and click the numbers at the top to copy its latitude and longitude.</p>
      <div className="team-actions">
        <button type="submit" className="btn pri sm" disabled={busy}>{creating ? "Add the place" : "Save"}</button>
        <button type="button" className="btn out sm" onClick={onCancel}>Back</button>
      </div>
    </form>
  );
}

export function PlacesPanel({ token, places, act, busy }) {
  const [editing, setEditing] = useState("");
  const [codes, setCodes] = useState({});

  function save(form, creating) {
    const body = { ...form, lat: Number(form.lat), lng: Number(form.lng) };
    act(async () => {
      if (creating) await teamCall(token, "/places", { method: "POST", body });
      else await teamCall(token, `/places/${encodeURIComponent(form.id)}`, { method: "PATCH", body });
      setEditing("");
      return creating
        ? `${form.name} is added.${form.receives ? " Give it a desk code next." : ""}`
        : `${form.name} is saved.`;
    });
  }

  function remove(place) {
    if (!window.confirm(`Remove ${place.name}? People will no longer see it.`)) return;
    act(async () => {
      await teamCall(token, `/places/${encodeURIComponent(place.id)}`, { method: "DELETE" });
      return `${place.name} is removed.`;
    });
  }

  function saveCode(place) {
    act(async () => {
      await teamCall(token, `/desks/${encodeURIComponent(place.id)}`, { method: "PATCH", body: { code: codes[place.id] || "" } });
      setCodes((c) => ({ ...c, [place.id]: "" }));
      return `${place.name} uses the new code. Everyone at that desk was signed out.`;
    });
  }

  function signOut(place) {
    act(async () => {
      const body = await teamCall(token, `/desks/${encodeURIComponent(place.id)}/sessions`, { method: "DELETE" });
      return `${place.name}: ${body.ended} sign-in${body.ended === 1 ? "" : "s"} ended.`;
    });
  }

  return (
    <section className="team-panel">
      {editing === "new" ? (
        <article className="team-card">
          <h2>Add a place</h2>
          <PlaceForm start={EMPTY_PLACE} creating busy={busy} onSave={(form) => save(form, true)} onCancel={() => setEditing("")} />
        </article>
      ) : (
        <button type="button" className="btn pri team-add" onClick={() => setEditing("new")}><Icon n="plus" c="m" />Add a place</button>
      )}
      <div className="team-list">
        {places.map((place) => (
          <article className="team-card" key={place.id}>
            <div className="team-desk">
              <span className={`ico ${place.kind === "police" ? "violet" : place.kind === "fire" ? "red" : place.kind === "disaster" ? "gold" : "green"}`}>
                <Icon n={place.kind === "police" ? "shield2" : place.kind === "fire" ? "flame" : place.kind === "disaster" ? "storm" : "plus"} />
              </span>
              <span className="grow">
                <b>{place.name}</b>
                <small>{KIND_LABEL[place.kind]} · {place.id}{place.phone ? ` · ${place.phone}` : ""}</small>
                <small>{place.open} open · {place.closed} closed{place.receives ? ` · ${place.online ? `${place.online} signed in at the desk` : "no one signed in"}` : ""}</small>
                {place.receives && !place.hasCode ? <small className="team-red">No desk code yet. No one can open this desk.</small> : null}
              </span>
              <em className={`bd ${place.receives ? "ok" : ""}`}>{place.receives ? "Receives" : "Listed"}</em>
            </div>
            {editing === place.id ? (
              <PlaceForm
                start={{ ...place, lat: String(place.lat), lng: String(place.lng), ambulanceMin: place.ambulanceMin ?? "" }}
                core={place.core}
                busy={busy}
                onSave={(form) => save(form, false)}
                onCancel={() => setEditing("")}
              />
            ) : (
              <>
                {place.receives ? (
                  <div className="team-code">
                    <div className="inp">
                      <Icon n="lock" c="m" />
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={place.hasCode ? "New desk code" : "Set a desk code"}
                        value={codes[place.id] || ""}
                        onChange={(event) => setCodes((c) => ({ ...c, [place.id]: event.target.value }))}
                      />
                    </div>
                    <button type="button" className="btn pri sm" disabled={busy || !codes[place.id]} onClick={() => saveCode(place)}>Save code</button>
                  </div>
                ) : null}
                <div className="team-actions">
                  <button type="button" className="btn out sm" onClick={() => setEditing(place.id)}><Icon n="edit" c="s" />Edit</button>
                  {place.online ? <button type="button" className="btn out sm" disabled={busy} onClick={() => signOut(place)}><Icon n="logout" c="s" />Sign out the desk</button> : null}
                  {place.total === 0 && !place.core ? <button type="button" className="btn out sm team-danger" disabled={busy} onClick={() => remove(place)}>Remove</button> : null}
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

const AVAILABILITY_LABEL = { available: "Available", busy: "Busy", unavailable: "Unavailable", offline: "Not set" };

const LOCATED = {
  address: " Its pin was placed from the address, so check it under Places.",
  request: "",
  team: "",
};

export function PartnersPanel({ token, applications, places, act, busy }) {
  const [filter, setFilter] = useState("pending");
  const [locating, setLocating] = useState(null);
  const rows = applications.filter((item) => filter === "all" || item.status === filter);
  const placeById = Object.fromEntries(places.map((place) => [place.id, place]));
  const receiving = places.filter((place) => place.receives);

  function codeNotice(organisation, body) {
    if (body.code) return `The code could not be emailed or texted. Give ${organisation} this code by phone: ${body.code}. It is shown only once.`;
    return `Sign-in code sent to ${body.sentTo.join(", ")}.`;
  }

  // Confirming or creating a place can come back asking for a map point. Then the card asks the team for one.
  function located(item, mode, run) {
    act(async () => {
      try {
        const message = await run();
        setLocating(null);
        return message;
      } catch (err) {
        if (err.data?.needsLocation) {
          setLocating({ id: item.id, mode, lat: "", lng: "" });
          return err.message;
        }
        throw err;
      }
    });
  }

  function approve(item, point = {}) {
    located(item, "approve", async () => {
      const body = await teamCall(token, `/partners/${item.id}`, { method: "PATCH", body: { status: "approved", ...point } });
      const where = body.placeCreated ? "now has its own place on the map and works its cases" : "works its place again";
      return `${item.organisation} is confirmed and ${where}.${LOCATED[body.located] || ""} ${codeNotice(item.organisation, body)}`;
    });
  }

  function createPlace(item, point = {}) {
    located(item, "place", async () => {
      const body = await teamCall(token, `/partners/${item.id}/place`, { method: "POST", body: point });
      return `${item.organisation} now has its own place on the map and works its cases.${LOCATED[body.located] || ""}`;
    });
  }

  function setActive(item, active) {
    act(async () => {
      await teamCall(token, `/partners/${item.id}/active`, { method: "PATCH", body: { active } });
      return active
        ? `${item.organisation} is receiving cases again.`
        : `${item.organisation} is paused. Its place stops receiving cases and its dashboard shows no cases until you resume it.`;
    });
  }

  function sendCode(item) {
    act(async () => {
      const body = await teamCall(token, `/partners/${item.id}/code`, { method: "POST" });
      return `${item.organisation}: ${codeNotice(item.organisation, body)} The old code no longer works.`;
    });
  }

  function connect(item, placeId) {
    act(async () => {
      const body = await teamCall(token, `/partners/${item.id}/place`, { method: "PATCH", body: { placeId } });
      return placeId
        ? `${item.organisation} now works the cases sent to ${body.placeName}.`
        : `${item.organisation} is no longer connected to a place.`;
    });
  }

  function decide(item, status) {
    act(async () => {
      await teamCall(token, `/partners/${item.id}`, { method: "PATCH", body: { status } });
      setLocating(null);
      if (status === "declined") return `${item.organisation} was declined. Its code no longer works and its place left the map, unless cases were already sent to it.`;
      return `${item.organisation} is waiting again. Its code no longer works and its place is paused.`;
    });
  }

  function placeState(item) {
    const place = placeById[item.placeId];
    if (!place) return { label: "No place yet", tone: "warn" };
    return place.receives ? { label: `Live · ${place.name}`, tone: "ok", place } : { label: `Paused · ${place.name}`, tone: "warn", place };
  }

  return (
    <section className="team-panel">
      <div className="team-tools">
        <Seg value={filter} onChange={setFilter} options={[["pending", "Waiting"], ["approved", "Confirmed"], ["declined", "Declined"], ["all", "All"]]} />
      </div>
      <div className="team-list">
        {!rows.length ? <Empty title="No requests here" sub="A hospital, a police station, or another service appears here after it asks to join." /> : null}
        {rows.map((item) => {
          const state = item.status === "approved" ? placeState(item) : null;
          const asking = locating?.id === item.id ? locating : null;
          const point = asking ? { lat: asking.lat, lng: asking.lng } : null;
          const pointOk = point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) && point.lat !== "" && point.lng !== "";
          return (
            <article className="team-card" key={item.id}>
              <div className="team-desk">
                <span className="grow">
                  <b>{item.organisation}</b>
                  <small>{item.primaryCategory}{item.extraCategories.length ? ` · also ${item.extraCategories.join(", ")}` : ""}</small>
                  <small>{item.phone} · {item.email}</small>
                  <small>{item.address}{item.districts ? ` · ${item.districts}` : ""}{item.baseLat != null ? ` · map point ${Number(item.baseLat).toFixed(4)}, ${Number(item.baseLng).toFixed(4)}` : " · no map point given"}</small>
                  {item.services ? <small>Services: {item.services}</small> : null}
                  {item.hours ? <small>Hours: {item.hours}{item.emergencyReady ? " · ready for emergencies" : ""}</small> : null}
                  {item.licence ? <small>Licence: {item.licence}</small> : null}
                  <small>Contact: {item.representativeName} · {item.representativePhone}{item.representativeEmail ? ` · ${item.representativeEmail}` : ""}</small>
                  <small>Asked {ago(item.createdAt)}</small>
                  {item.status === "approved" ? <small>{item.codeSentAt ? `Sign-in code sent ${ago(item.codeSentAt)}` : "No sign-in code yet"} · {AVAILABILITY_LABEL[item.availability] || item.availability}</small> : null}
                  {state?.place ? (
                    <div className="inp team-select" style={{ marginTop: 8, maxWidth: 360 }}>
                      <Icon n="pin" c="m" />
                      <select value={item.placeId} disabled={busy} aria-label="Place this partner works" onChange={(event) => connect(item, event.target.value)}>
                        <option value="">Not connected to a place</option>
                        {[...new Map([state.place, ...receiving].map((place) => [place.id, place])).values()].map((place) => {
                          const owner = applications.find((other) => other.placeId === place.id && other.id !== item.id);
                          return <option key={place.id} value={place.id} disabled={Boolean(owner)}>{place.name}{owner ? ` (${owner.organisation})` : ""}</option>;
                        })}
                      </select>
                    </div>
                  ) : null}
                </span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <em className={`bd ${item.status === "approved" ? "ok" : item.status === "declined" ? "warn" : ""}`}>
                    {item.status === "approved" ? "Confirmed" : item.status === "declined" ? "Declined" : "Waiting"}
                  </em>
                  {state ? <em className={`bd ${state.tone}`}>{state.label}</em> : null}
                </span>
              </div>
              {asking ? (
                <div className="team-card" style={{ margin: "4px 0 0", padding: 14, gap: 10 }}>
                  <small>Where is {item.organisation} based? In Google Maps, right-click the spot and click the numbers to copy them.</small>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <div className="inp" style={{ flex: "1 1 140px" }}>
                      <input inputMode="decimal" placeholder="Latitude, e.g. 0.3304" value={asking.lat} onChange={(event) => setLocating({ ...asking, lat: event.target.value.trim() })} onPaste={(event) => {
                        const pair = event.clipboardData.getData("text").split(",").map((part) => part.trim());
                        if (pair.length === 2) {
                          event.preventDefault();
                          setLocating({ ...asking, lat: pair[0], lng: pair[1] });
                        }
                      }} />
                    </div>
                    <div className="inp" style={{ flex: "1 1 140px" }}>
                      <input inputMode="decimal" placeholder="Longitude, e.g. 32.5701" value={asking.lng} onChange={(event) => setLocating({ ...asking, lng: event.target.value.trim() })} />
                    </div>
                  </div>
                  <div className="team-actions">
                    <button type="button" className="btn pri sm" disabled={busy || !pointOk} onClick={() => (asking.mode === "approve" ? approve(item, point) : createPlace(item, point))}>
                      {asking.mode === "approve" ? "Confirm with this point" : "Create its place"}
                    </button>
                    <button type="button" className="btn out sm" disabled={busy} onClick={() => setLocating(null)}>Cancel</button>
                  </div>
                </div>
              ) : null}
              <div className="team-actions">
                {item.status === "pending" ? (
                  <>
                    <button type="button" className="btn pri sm" disabled={busy} onClick={() => approve(item)}>Confirm</button>
                    <button type="button" className="btn out sm" disabled={busy} onClick={() => decide(item, "declined")}>Decline</button>
                  </>
                ) : null}
                {item.status === "approved" && !state.place ? (
                  <button type="button" className="btn pri sm" disabled={busy} onClick={() => createPlace(item)}>Create its place</button>
                ) : null}
                {item.status === "approved" && state.place ? (
                  state.place.receives
                    ? <button type="button" className="btn out sm" disabled={busy} onClick={() => setActive(item, false)}>Pause</button>
                    : <button type="button" className="btn pri sm" disabled={busy} onClick={() => setActive(item, true)}>Resume</button>
                ) : null}
                {item.status === "approved" ? <button type="button" className="btn out sm" disabled={busy} onClick={() => sendCode(item)}>Send a new code</button> : null}
                {item.status === "declined" ? <button type="button" className="btn pri sm" disabled={busy} onClick={() => approve(item)}>Confirm</button> : null}
                {item.status !== "pending" ? <button type="button" className="btn out sm" disabled={busy} onClick={() => decide(item, "pending")}>Move back to waiting</button> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function SecurityPanel({ token, version, act, busy, onFail }) {
  const [code, setCode] = useState("");
  const [again, setAgain] = useState("");
  const log = useTeamList(token, "/log", version, onFail, 15000);
  const mismatch = again && code !== again;

  function saveTeamCode() {
    if (!window.confirm("Change the team code? Every other teammate is signed out and needs the new code.")) return;
    act(async () => {
      const body = await teamCall(token, "/team-code", { method: "PATCH", body: { code } });
      setCode("");
      setAgain("");
      return `The team code is changed. ${body.ended} other sign-in${body.ended === 1 ? "" : "s"} ended. Share the new code in person, not in a group chat.`;
    });
  }

  return (
    <section className="team-panel team-two">
      <article className="team-card">
        <h2>Team code</h2>
        <p className="team-muted team-hint">Everyone on the team uses this code. Change it when someone leaves the team.</p>
        <div className="team-form">
          <div className="inp"><Icon n="lock" c="m" /><input type="password" inputMode="numeric" autoComplete="new-password" placeholder="New code, 6 to 12 digits" value={code} onChange={(event) => setCode(event.target.value)} /></div>
          <div className="inp"><Icon n="lock" c="m" /><input type="password" inputMode="numeric" autoComplete="new-password" placeholder="The same code again" value={again} onChange={(event) => setAgain(event.target.value)} /></div>
          {mismatch ? <div className="err">The two codes are not the same.</div> : null}
          <div className="team-actions">
            <button type="button" className="btn pri sm" disabled={busy || !/^\d{6,12}$/.test(code) || code !== again} onClick={saveTeamCode}>Change the team code</button>
          </div>
        </div>
      </article>
      <article className="team-card">
        <h2>What the team did</h2>
        <div className="team-log">
          {log == null ? <p className="sub">Loading…</p> : null}
          {log && !log.length ? <small className="team-muted">Nothing yet.</small> : null}
          {(log || []).map((item) => (
            <div className="team-log-row" key={item.id}>
              <span className="grow">
                <b>{item.action}{item.target ? <span> · {item.target}</span> : null}</b>
                {item.detail ? <small>{item.detail}</small> : null}
              </span>
              <time dateTime={item.at} title={new Date(item.at).toLocaleString("en-UG")}>{ago(item.at)}</time>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
