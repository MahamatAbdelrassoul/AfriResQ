import { useEffect, useRef, useState } from "react";
import medicalArt from "./assets/scenes/scene-medical.png";
import { getCase, listDeskCases, updateCase } from "./case-api.js";
import { clearDeskSession, closeDesk, deskMe, openDesk, readDeskSession, saveDeskSession } from "./desk-api.js";
import { clearPartnerSession, partnerMe, partnerSignIn, partnerSignOut, PartnerSignedOut, readPartnerSession, savePartnerSession, signOutEverywhere, updatePartner } from "./partner-api.js";
import { useApp } from "./app-state.js";
import { Btn, Field, Hdr, Icon, Inp, MapBoard, Note, Screen } from "./ui.jsx";

function DeskBar({ title, sub, onBack }) {
  const { back } = useApp();
  return (
    <header className="partner-bar">
      <div className="partner-brand">
        <button type="button" className="partner-back" onClick={onBack || back} aria-label="Back">
          <Icon n="chevL" />
        </button>
        <span className="mark"><Icon n="logo" c="m" /></span>
        AfriResQ
      </div>
      <div className="partner-bar-name">
        <h2>{title}</h2>
        {sub ? <small>{sub}</small> : null}
      </div>
    </header>
  );
}

function DeskArt({ title, sub, line, points }) {
  return (
    <div className="lede">
      <Hdr title={title} sub={sub} sos={false} />
      <aside className="scene">
        <div className="scene-art">
          <img src={medicalArt} alt="" />
          <p className="scene-line">{line}</p>
        </div>
        <div className="scene-points">
          {points.map(([icon, label, detail]) => (
            <div key={label}>
              <Icon n={icon} />
              <b>{label}</b>
              <small>{detail}</small>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

const DESKS = {
  hospital: {
    placeId: "mak",
    title: "Makerere University Hospital",
    short: "Hospital",
    icon: "plus",
    tone: "green",
    line: "Medical\ndemands",
    points: [
      ["heart", "Medical only", "An ambulance can leave from here"],
      ["clock", "Oldest first", "The person is waiting"],
      ["check", "You move it", "Accept, on the way, arrived"],
    ],
  },
  police: {
    placeId: "mps",
    title: "Makerere Police Station",
    short: "Police",
    icon: "shield2",
    tone: "violet",
    line: "Campus\npolice",
    points: [
      ["shield2", "Three reports", "Security, accident, missing person"],
      ["phone", "You call them", "The number is on the case"],
      ["check", "You move it", "The person waits for you"],
    ],
  },
};

const STATE_LABEL = {
  sent: "New",
  accepted: "Accepted",
  on_the_way: "On the way",
  arrived: "Arrived",
  closed: "Closed",
  cancelled: "Cancelled",
  declined: "Declined",
};

const DECLINE_REASONS = [
  "No team or vehicle is free right now",
  "Outside the area we cover",
  "We do not offer this service",
  "Too far to reach in time",
];

function waited(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (!value || Number.isNaN(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ${minutes % 60} min ago` : new Date(value).toLocaleDateString();
}

// The person is told this reason, so the desk picks one or writes its own.
function DeclineForm({ busy, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const final = reason === "other" ? other.trim() : reason;
  return (
    <div className="pd-decline">
      <b>Why can you not take it?</b>
      <small>The person sees this and is offered other help straight away.</small>
      <div className="pd-reasons">
        {[...DECLINE_REASONS, "other"].map((item) => (
          <button type="button" key={item} className={`chip${reason === item ? " on" : ""}`} onClick={() => setReason(item)}>
            {item === "other" ? "Another reason" : item}
          </button>
        ))}
      </div>
      {reason === "other" ? (
        <textarea className="area" value={other} maxLength={240} placeholder="Write the reason" onChange={(event) => setOther(event.target.value)} />
      ) : null}
      <div className="pd-decline-actions">
        <button type="button" className="btn red" disabled={busy || !final} onClick={() => onConfirm(final)}>{busy ? "Declining…" : "Decline request"}</button>
        <button type="button" className="btn out" disabled={busy} onClick={onCancel}>Keep it</button>
      </div>
    </div>
  );
}

const NEXT = {
  sent: ["accepted", "Accept"],
  accepted: ["on_the_way", "On the way"],
  on_the_way: ["arrived", "Arrived"],
  arrived: ["closed", "Close the case"],
};

function stateClass(state) {
  if (state === "sent") return "warn";
  if (state === "declined") return "bad";
  if (state === "closed" || state === "cancelled") return "";
  return "ok";
}

function PartnerGate() {
  const { go, setPartnerDesk } = useApp();
  return (
    <Screen>
      <div className="body">
        <DeskBar title="Makerere desks" sub="Choose where you work" />
        <DeskArt
          title="Makerere desks"
          sub="Choose where you work"
          line={"Two desks,\none campus"}
          points={[
            ["plus", "Hospital", "Medical demands and the ambulance"],
            ["shield2", "Police", "Security, accidents, missing people"],
            ["lock", "Staff only", "Each desk has its own code"],
          ]}
        />
        <div className="form-side">
          {Object.entries(DESKS).map(([id, desk]) => (
            <button
              type="button"
              className="door"
              key={id}
              onClick={() => {
                setPartnerDesk(id);
                const session = readDeskSession();
                go(session?.placeId === desk.placeId ? "partnerQueue" : "partnerSignin");
              }}
            >
              <span className={`ico ${desk.tone}`}><Icon n={desk.icon} c="l" /></span>
              <span>
                <b>{desk.title}</b>
                <small>{desk.points[0][2]}</small>
              </span>
            </button>
          ))}
          <button type="button" className="link" onClick={() => go("welcome", null, true)}>Back to the welcome screen</button>
        </div>
      </div>
    </Screen>
  );
}

function PartnerSignIn() {
  const { partnerDesk, go } = useApp();
  const desk = DESKS[partnerDesk] || DESKS.hospital;
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const session = await openDesk(desk.placeId, code);
      saveDeskSession({ ...session, signedAt: new Date().toISOString() });
      setError("");
      go("partnerQueue");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <div className="body">
        <DeskBar title={desk.short} sub={desk.title} onBack={() => go("partnerGate", null, true)} />
        <DeskArt
          title={desk.short}
          sub={desk.title}
          line={"Staff\nonly"}
          points={desk.points}
        />
        <div className="form-side">
          <Field label="Desk code" error={error}>
            <Inp icon="lock" type="password" mode="numeric" value={code} placeholder="Enter the desk code" onChange={setCode} />
          </Field>
          <Note icon="lock">Only the people who work at this desk have the code. Names, phones, and medical cards stay hidden until this sign-in succeeds.</Note>
          <button type="button" className="link left" onClick={() => go("partnerGate", null, true)}>Both desks</button>
        </div>
      </div>
      <div className="foot">
        <Btn disabled={busy || code.trim().length < 4} onClick={submit}>{busy ? "Checking…" : "Open the desk"}</Btn>
      </div>
    </Screen>
  );
}

function signedInto(placeId) {
  const session = readDeskSession();
  if (!session || session.placeId !== placeId) return null;
  return session;
}

// The case screens serve both the two desks and a confirmed partner connected to a place.
const PARTNER_DESK = "partner";

function deskConfig(partnerDesk) {
  if (partnerDesk === PARTNER_DESK) {
    const session = readPartnerSession();
    return {
      partner: true,
      placeId: session?.placeId || "",
      title: session?.organisation || "Partner",
      short: session?.organisation || "Partner",
      icon: "check",
      tone: "green",
      home: "partnerHome",
      signin: "partnerLogin",
      moving: "Your team is moving",
      ambulance: true,
    };
  }
  const desk = DESKS[partnerDesk] || DESKS.hospital;
  return {
    ...desk,
    home: "partnerQueue",
    signin: "partnerSignin",
    moving: desk === DESKS.hospital ? "The ambulance is moving" : "Officers are moving",
    ambulance: desk === DESKS.hospital,
  };
}

function sessionFor(desk) {
  if (!desk.partner) return signedInto(desk.placeId);
  const session = readPartnerSession();
  return session && desk.placeId && session.placeId === desk.placeId ? session : null;
}

function forget(desk) {
  if (desk.partner) clearPartnerSession();
  else clearDeskSession();
}

const SHIFT_GUIDE = {
  hospital: [
    "Accept a new request within two minutes, or decline it with a reason so the person can go elsewhere.",
    "Call the person after accepting to confirm where they are and how they are.",
    "Mark On the way only when the ambulance has left, and Arrived when the crew is with them.",
    "The medical card is confidential. It is shared only while the case is open.",
  ],
  police: [
    "Accept a new report within two minutes, or decline it with a reason so the person can get other help.",
    "Call the person after accepting. The number is on every case.",
    "Mark On the way when officers leave, and Arrived when they are with the person.",
    "Write nothing about the person outside AfriResQ. Their details stay with the case.",
  ],
};

function clock(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

function PartnerQueue() {
  const { partnerDesk, go } = useApp();
  const desk = DESKS[partnerDesk] || DESKS.hospital;
  const [info, setInfo] = useState(null);
  const [tab, setTab] = useState("cases");
  const [error, setError] = useState("");
  const session = signedInto(desk.placeId);

  function signedOut() {
    clearDeskSession();
    go("partnerSignin", null, true);
  }

  useEffect(() => {
    if (!signedInto(desk.placeId)) {
      go("partnerSignin", null, true);
      return undefined;
    }
    let stop = false;
    const load = async () => {
      const current = signedInto(desk.placeId);
      if (!current) return;
      try {
        const next = await deskMe(current.token);
        if (!stop) {
          setInfo(next);
          setError("");
        }
      } catch (err) {
        if (stop) return;
        if (err.signedOut) signedOut();
        else setError(err.message);
      }
    };
    load();
    const id = setInterval(load, 15000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [desk.placeId]);

  async function leave() {
    const current = readDeskSession();
    clearDeskSession();
    await closeDesk(current?.token);
    go("partnerGate", null, true);
  }

  const st = info?.stats || {};
  const signedAt = session?.signedAt;
  const endsAt = signedAt ? new Date(new Date(signedAt).getTime() + 12 * 3600 * 1000) : null;
  return (
    <Screen>
      <DeskBar title={desk.short} sub={desk.title} onBack={() => go("partnerGate", null, true)} />
      <div className="body partner-board">
        <div className="pd">
          <aside className="pd-side">
            <div className="pd-card pd-org">
              <span className={`pd-avatar ${desk.tone}`}><Icon n={desk.icon} c="l" /></span>
              <div className="pd-org-name">
                <b>{desk.title}</b>
                <small>Makerere University · Staff desk</small>
              </div>
              <div className="pd-org-tags">
                <span className="bd ok"><i className="pd-live" />Desk open</span>
                {signedAt ? <span className="bd"><Icon n="clock" c="s" /> Since {clock(signedAt)}</span> : null}
              </div>
            </div>

            <div className="pd-card pd-today">
              <small className="pd-label">Today</small>
              <div className="pd-today-grid">
                <div><b>{st.waiting ?? "—"}</b><small>New</small></div>
                <div><b>{st.open ?? "—"}</b><small>In progress</small></div>
                <div><b>{st.closed_today ?? "—"}</b><small>Closed</small></div>
                <div><b>{st.rating ?? "—"}</b><small>Rating</small></div>
              </div>
            </div>

            <nav className="pd-nav c2" aria-label="Desk sections">
              {[["cases", "Cases", "list"], ["shift", "Shift", "clock"]].map(([id, label, icon]) => (
                <button type="button" key={id} className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
                  <Icon n={icon} />
                  <span>{label}</span>
                  {id === "cases" && st.waiting ? <em>{st.waiting}</em> : null}
                </button>
              ))}
            </nav>
          </aside>

          <main className="pd-main">
            {error ? <Note tone="red" icon="alert">{error}</Note> : null}
            {tab === "cases" ? (
              <CaseBoard
                deskKey={partnerDesk in DESKS ? partnerDesk : "hospital"}
                placeId={desk.placeId}
                placeName={desk.title}
                stats={st}
                getToken={() => signedInto(desk.placeId)?.token}
                onSignedOut={signedOut}
              />
            ) : (
              <>
                <SectionHead title="Shift" sub="This desk and how to use it" />
                <div className="pd-card">
                  <div className="kv"><span>Desk</span><b>{desk.title}</b></div>
                  <div className="kv"><span>Signed in at</span><b>{clock(signedAt)}</b></div>
                  <div className="kv"><span>Signs out by itself at</span><b>{endsAt ? clock(endsAt) : "—"}</b></div>
                  {info?.phone ? <div className="kv"><span>Desk telephone</span><b>{info.phone}</b></div> : null}
                  <div className="kv"><span>Closed this week</span><b>{st.closed_week ?? "—"}{st.declined_week ? ` · ${st.declined_week} declined` : ""}</b></div>
                </div>
                <div className="pd-card">
                  <div className="pd-card-head"><b>Good practice at this desk</b></div>
                  <ol className="pd-guide">
                    {(SHIFT_GUIDE[partnerDesk] || SHIFT_GUIDE.hospital).map((line) => <li key={line}>{line}</li>)}
                  </ol>
                </div>
                <div className="pd-card">
                  <div className="pd-card-head"><b>End of shift</b></div>
                  <p className="pd-fine">Leave the desk when you hand over, so the next person signs in with the desk code. Cases stay with the desk, not with you.</p>
                  <div className="pd-actions">
                    <Btn tone="out" onClick={() => go("partnerGate", null, true)}><Icon n="list" />Switch desk</Btn>
                    <Btn tone="out" onClick={leave}><Icon n="logout" />Leave this desk</Btn>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </Screen>
  );
}

function PartnerCase() {
  const { partnerDesk, partnerCaseId, go, showToast } = useApp();
  const desk = deskConfig(partnerDesk);
  const [item, setItem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionFor(desk)) go(desk.signin, null, true);
  }, [desk.placeId, go]);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const session = sessionFor(desk);
      if (!partnerCaseId || !session) return;
      try {
        const row = await getCase(partnerCaseId, session.token);
        if (!stop) setItem(row);
      } catch (err) {
        if (stop) return;
        if (String(err.message).includes("Sign in")) {
          forget(desk);
          go(desk.signin, null, true);
          return;
        }
        setError(err.message);
      }
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [partnerCaseId]);

  const next = item ? NEXT[item.state] : null;
  const steps = [
    ["sent", "Sent", "The report is in"],
    ["accepted", "Accepted", "You have taken it"],
    ["on_the_way", "On the way", desk.moving],
    ["arrived", "Arrived", "You are with them"],
  ];
  const rank = { sent: 0, accepted: 1, on_the_way: 2, arrived: 3, closed: 4 };

  const [declining, setDeclining] = useState(false);

  async function decline(reason) {
    if (!item) return;
    setBusy(true);
    try {
      const saved = await updateCase(item.id, { state: "declined", reason }, sessionFor(desk)?.token);
      setItem(saved);
      setDeclining(false);
      setError("");
      showToast("Request declined. The person has been told.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!item || !next) return;
    setBusy(true);
    try {
      const session = sessionFor(desk);
      const saved = await updateCase(item.id, { state: next[0] }, session?.token);
      setItem(saved);
      showToast(next[0] === "closed" ? "Case closed" : `${STATE_LABEL[next[0]]}`);
      if (next[0] === "closed") go(desk.home);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!item) {
    return (
      <Screen>
        <DeskBar title={desk.short} sub="Opening the case" onBack={() => go(desk.home)} />
        <div className="body partner-board">
          <div className="pd-card pd-loading">{error || "Opening the case…"}</div>
        </div>
      </Screen>
    );
  }

  const person = item.person || {};
  const now = rank[item.state] ?? 0;
  const point = item.whereLat != null && item.whereLng != null ? [Number(item.whereLat), Number(item.whereLng)] : null;
  const phone = String(person.phone || "").replace(/\D/g, "").replace(/^0/, "");
  const finished = ["closed", "cancelled", "declined"].includes(item.state);
  const path = { ambulance: "Ambulance requested", route: "Coming in by themselves", desk: "Report to the desk" }[item.path] || "";

  return (
    <Screen>
      <DeskBar title={item.id} sub={desk.title} onBack={() => go(desk.home)} />
      <div className="body partner-board">
        <div className="cd">
          <div className="cd-head">
            <button type="button" className="cd-back" aria-label="Back to cases" onClick={() => go(desk.home)}>
              <Icon n="chevL" />
            </button>
            <div className="cd-title">
              <small>{item.id}{path ? ` · ${path}` : ""}</small>
              <h2>{item.what}</h2>
              <small>Sent {waited(item.createdAt)}</small>
            </div>
            <span className={`bd ${stateClass(item.state)} cd-state`}>{STATE_LABEL[item.state] || item.state}</span>
          </div>

          <div className="cd-grid">
            <div className="cd-main">
              <section className="pd-card">
                <div className="cd-person">
                  <span className="pd-avatar">{initials(person.name)}</span>
                  <div className="pd-org-name">
                    <b>{person.name || "Unknown person"}</b>
                    <small>{person.type === "student" ? "Makerere student" : "Citizen"}{person.hall ? ` · ${person.hall}` : ""}</small>
                  </div>
                  {phone && !finished ? <a className="btn pri sm cd-call" href={`tel:+256${phone}`}><Icon n="phone" c="m" />Call</a> : null}
                </div>
                <div className="kv"><span>Telephone</span><b>{phone ? `+256 ${phone}` : "—"}</b></div>
                <div className="kv"><span>Who needs help</span><b>{item.who && item.who !== "me" ? "Someone with the person" : "The person who sent it"}</b></div>
                {item.awake ? <div className="kv"><span>Awake</span><b>{item.awake}</b></div> : null}
              </section>

              <section className="pd-card">
                <div className="pd-card-head">
                  <b>Location</b>
                  {point ? <a className="link" href={`https://www.google.com/maps?q=${point[0]},${point[1]}`} target="_blank" rel="noreferrer">Open in Google Maps</a> : null}
                </div>
                <p className="cd-where"><Icon n="pin" c="s" />{item.whereText || "Sent with the case"}</p>
                {point ? (
                  <MapBoard
                    className="map"
                    style={{ height: 260, borderRadius: 16, flex: "none" }}
                    opts={{ pins: item.place ? [item.place] : [], you: point }}
                  />
                ) : null}
              </section>

              {item.detail ? (
                <section className="pd-card">
                  <div className="pd-card-head"><b>What they reported</b></div>
                  <p className="cd-report">{item.detail}</p>
                </section>
              ) : null}

              <section className="pd-card">
                <div className="pd-card-head">
                  <b>Medical card</b>
                  <span className={`bd ${person.share ? "ok" : ""}`}><Icon n="lock" c="s" /> {person.share ? "Shared while open" : "Not shared"}</span>
                </div>
                {person.share ? (
                  <>
                    <div className="kv"><span>Blood</span><b>{person.med?.blood || "—"}</b></div>
                    <div className="kv"><span>Allergies</span><b>{person.med?.allergies || "None listed"}</b></div>
                    <div className="kv"><span>Conditions</span><b>{person.med?.cond || "None listed"}</b></div>
                    <div className="kv"><span>Medications</span><b>{person.med?.meds || "None listed"}</b></div>
                  </>
                ) : (
                  <p className="pd-fine">This person has not shared a medical card.</p>
                )}
              </section>
            </div>

            <aside className="cd-side">
              <section className="pd-card">
                <div className="pd-card-head"><b>Progress</b></div>
                <div className="tl">
                  {steps.map(([id, title, detail], index) => (
                    <div key={id} className={`st${index < now ? " done" : ""}${index === now && !finished ? " now" : ""}`}>
                      <i><Icon n="check" c="s" /></i>
                      <div><b>{title}</b><small>{detail}</small></div>
                    </div>
                  ))}
                </div>
                {error ? <Note tone="red" icon="alert">{error}</Note> : null}
                {item.state === "declined" ? (
                  <Note tone="red" icon="info">Declined: {item.declineReason || "no reason given"}. The person was offered other help.</Note>
                ) : item.state === "cancelled" ? (
                  <Note icon="info">The person cancelled this request.</Note>
                ) : declining ? (
                  <DeclineForm busy={busy} onConfirm={decline} onCancel={() => setDeclining(false)} />
                ) : next ? (
                  <div className="cd-actions">
                    <Btn disabled={busy} onClick={advance}>{busy ? "Saving…" : next[1]}</Btn>
                    {item.state === "sent" ? <Btn tone="out" disabled={busy} onClick={() => setDeclining(true)}>Decline</Btn> : null}
                  </div>
                ) : (
                  <Note icon="check">This case is closed.{item.rating ? ` Rated ${item.rating} out of 5.` : ""}</Note>
                )}
                {desk.ambulance && item.path === "ambulance" && !finished ? (
                  <p className="pd-fine">Accepting tells the person a crew has the case. On the way means the ambulance has left.</p>
                ) : null}
              </section>
            </aside>
          </div>
        </div>
      </div>
    </Screen>
  );
}

const AVAILABILITY = [
  ["available", "Available"],
  ["busy", "Busy"],
  ["unavailable", "Unavailable"],
];

// A confirmed partner signs in with its official email and the code sent when the team confirmed it.
function PartnerLogin() {
  const { go } = useApp();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (readPartnerSession()) go("partnerHome", null, true);
  }, [go]);

  async function submit() {
    setBusy(true);
    try {
      const body = await partnerSignIn(email.trim(), code);
      savePartnerSession({ token: body.token, organisation: body.partner.organisation, placeId: body.partner.placeId });
      setError("");
      go("partnerHome", null, true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <div className="body">
        <DeskBar title="Partner sign-in" sub="For confirmed organisations" onBack={() => go("welcome", null, true)} />
        <DeskArt
          title="Partner sign-in"
          sub="For confirmed organisations"
          line={"Confirmed\npartners"}
          points={[
            ["check", "Confirmed first", "The AfriResQ team checks every request"],
            ["mail", "A code by email", "And by SMS to your representative"],
            ["lock", "Keep it private", "Ask the team for a new one if it leaks"],
          ]}
        />
        <div className="form-side">
          <Field label="Official email">
            <Inp icon="mail" type="email" name="username" autoComplete="username" value={email} placeholder="name@organisation.ug" onChange={setEmail} />
          </Field>
          <Field label="Partner code" error={error}>
            <Inp icon="lock" type="password" mode="numeric" name="password" autoComplete="current-password" value={code} placeholder="8 digits" onChange={setCode} />
          </Field>
          <Note icon="lock">The code arrives once the AfriResQ team confirms your organisation. Still waiting? It has not been confirmed yet.</Note>
          <button type="button" className="link left" onClick={() => go("partnerJoin")}>Not a partner yet? Ask to join</button>
        </div>
      </div>
      <div className="foot">
        <Btn disabled={busy || !email.includes("@") || code.replace(/\s/g, "").length < 8} onClick={submit}>{busy ? "Checking…" : "Sign in"}</Btn>
      </div>
    </Screen>
  );
}

const PROFILE_FIELDS = [
  ["phone", "Official telephone", "phone", "7XX XXX XXX"],
  ["address", "Physical address", "pin", "Street and town"],
  ["districts", "Operating districts", "map", "Kampala, Wakiso"],
  ["hours", "Operating hours", "clock", "24 hours, or 8:00 to 17:00"],
  ["representativeName", "Representative", "user", "Full name"],
  ["representativePhone", "Representative's telephone", "phone", "7XX XXX XXX"],
  ["representativeEmail", "Representative's email", "mail", "name@organisation.ug"],
];

function profileDraft(partner) {
  const draft = { services: partner.services, emergencyReady: partner.emergencyReady };
  for (const [key] of PROFILE_FIELDS) draft[key] = partner[key] || "";
  return draft;
}

const AVAILABILITY_HINT = {
  available: "Ready to take requests",
  busy: "Taking only urgent requests",
  unavailable: "Not taking requests",
};

const SECTIONS = [
  ["cases", "Cases", "list"],
  ["profile", "Profile", "edit"],
  ["account", "Account", "lock"],
];

function initials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join("");
}

function Stat({ label, value, note, tone = "" }) {
  return (
    <div className={`pd-stat ${tone}`}>
      <small>{label}</small>
      <b>{value ?? "—"}</b>
      <span>{note}</span>
    </div>
  );
}

function SectionHead({ title, sub, children }) {
  return (
    <div className="pd-section-head">
      <div>
        <h3>{title}</h3>
        {sub ? <p>{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

// A short tone and a title badge when a new request arrives, so a desk that looks away still notices.
function useArrivalAlert(cases, showToast) {
  const known = useRef(null);
  useEffect(() => {
    if (!cases) return;
    const fresh = cases.filter((item) => item.state === "sent");
    const ids = new Set(fresh.map((item) => item.id));
    if (known.current) {
      const arrived = fresh.filter((item) => !known.current.has(item.id));
      if (arrived.length) {
        showToast(arrived.length === 1 ? `New request ${arrived[0].id}: ${arrived[0].what}` : `${arrived.length} new requests`);
        try {
          const audio = new (window.AudioContext || window.webkitAudioContext)();
          [0, 0.22].forEach((at) => {
            const tone = audio.createOscillator();
            const gain = audio.createGain();
            tone.frequency.value = 880;
            gain.gain.setValueAtTime(0.18, audio.currentTime + at);
            gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + at + 0.18);
            tone.connect(gain).connect(audio.destination);
            tone.start(audio.currentTime + at);
            tone.stop(audio.currentTime + at + 0.2);
          });
        } catch {
          /* the browser blocks sound until the page is touched */
        }
      }
    }
    known.current = ids;
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = ids.size ? `(${ids.size}) ${base}` : base;
  }, [cases]);
  useEffect(() => () => {
    document.title = document.title.replace(/^\(\d+\) /, "");
  }, []);
}

function RequestCard({ item, busy, onAccept, onDecline, onOpen }) {
  const [declining, setDeclining] = useState(false);
  const person = item.person || {};
  return (
    <article className="pd-req">
      <div className="pd-req-top">
        <span className="pd-pulse" aria-hidden="true" />
        <span className="bd warn">New request</span>
        <b>{item.id}</b>
        <small>{waited(item.createdAt)}</small>
      </div>
      <h4>{item.what}</h4>
      <div className="pd-req-facts">
        <span><Icon n="user" c="s" />{person.name || "Unknown person"}{item.who && item.who !== "me" ? " · for someone else" : ""}</span>
        <span><Icon n="pin" c="s" />{item.whereText || "Location sent with the case"}</span>
        {item.awake ? <span><Icon n="heart" c="s" />Awake: {item.awake}</span> : null}
        {person.phone ? <a href={`tel:+256${String(person.phone).replace(/\D/g, "").replace(/^0/, "")}`}><Icon n="phone" c="s" />+256 {person.phone}</a> : null}
      </div>
      {item.detail ? <p className="pd-req-detail">{item.detail}</p> : null}
      {declining ? (
        <DeclineForm busy={busy} onConfirm={(reason) => onDecline(item, reason)} onCancel={() => setDeclining(false)} />
      ) : (
        <div className="pd-req-actions">
          <Btn disabled={busy} onClick={() => onAccept(item)}><Icon n="check" c="m" />Accept</Btn>
          <Btn tone="out" disabled={busy} onClick={() => setDeclining(true)}>Decline</Btn>
          <button type="button" className="link" onClick={() => onOpen(item)}>Full details</button>
        </div>
      )}
    </article>
  );
}

// The live case board. Desks and partners share it: new requests to accept or decline, work in progress
// moved one step at a time, and finished cases.
function CaseBoard({ deskKey, placeId, placeName, stats, getToken, onSignedOut }) {
  const { go, setPartnerDesk, setPartnerCaseId, showToast } = useApp();
  const [view, setView] = useState("active");
  const [cases, setCases] = useState(null);
  const [finished, setFinished] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [tick, setTick] = useState(0);
  useArrivalAlert(cases, showToast);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const rows = await listDeskCases(placeId, "", token);
        const done = view === "finished" ? await listDeskCases(placeId, "closed", token) : null;
        if (stop) return;
        setCases(rows);
        if (done) setFinished(done);
        setError("");
      } catch (err) {
        if (stop) return;
        if (String(err.message).includes("Sign in")) onSignedOut();
        else setError(err.message);
      }
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [placeId, view, tick]);

  function open(item) {
    setPartnerDesk(deskKey);
    setPartnerCaseId(item.id);
    go("partnerCase");
  }

  async function move(item, patch, message) {
    const token = getToken();
    if (!token) return;
    setBusy(item.id);
    try {
      await updateCase(item.id, patch, token);
      showToast(message);
      setError("");
      setTick((value) => value + 1);
    } catch (err) {
      if (err.message.includes("Sign in")) onSignedOut();
      else setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const s = stats || {};
  const incoming = (cases || []).filter((item) => item.state === "sent");
  const working = (cases || []).filter((item) => item.state !== "sent");
  return (
    <>
      <SectionHead title="Cases" sub={`Requests sent to ${placeName}`}>
        <div className="appear-set pd-mini-seg">
          <button type="button" className={view === "active" ? "on" : ""} onClick={() => setView("active")}>Active</button>
          <button type="button" className={view === "finished" ? "on" : ""} onClick={() => setView("finished")}>Finished</button>
        </div>
      </SectionHead>
      <div className="pd-stats">
        <Stat label="New" value={incoming.length} note="Waiting for you" tone={incoming.length ? "warn" : ""} />
        <Stat label="In progress" value={working.length} note="Accepted by you" tone="ok" />
        <Stat label="Closed today" value={s.closed_today} note={`${s.closed_week ?? 0} this week · ${s.declined_week ?? 0} declined`} />
        <Stat label="Rating" value={s.rating == null ? "—" : s.rating} note={s.rating == null ? "No ratings yet" : "Out of 5"} />
      </div>
      {error ? <Note tone="red" icon="alert">{error}</Note> : null}

      {view === "active" ? (
        <>
          <div className="pd-group-head">
            <b>New requests</b>
            {incoming.length ? <span className="bd warn">{incoming.length} waiting</span> : null}
          </div>
          {incoming.length ? (
            <div className="pd-reqs">
              {incoming.map((item) => (
                <RequestCard
                  key={item.id}
                  item={item}
                  busy={busy === item.id}
                  onOpen={open}
                  onAccept={(row) => move(row, { state: "accepted" }, `${row.id} accepted. The person can see it.`)}
                  onDecline={(row, reason) => move(row, { state: "declined", reason }, `${row.id} declined. The person has been told.`)}
                />
              ))}
            </div>
          ) : (
            <div className="pd-card pd-empty">
              <Icon n="bell" c="l" />
              <b>No new requests</b>
              <small>New requests appear here with a sound. Keep this page open.</small>
            </div>
          )}

          <div className="pd-group-head"><b>In progress</b></div>
          {working.length ? (
            <div className="pd-card pd-rows">
              {working.map((item) => {
                const next = NEXT[item.state];
                return (
                  <div className="pd-row" key={item.id}>
                    <button type="button" className="pd-row-main" onClick={() => open(item)}>
                      <span className={`bd ${stateClass(item.state)}`}>{STATE_LABEL[item.state]}</span>
                      <span className="t">
                        <b>{item.id}<span> · {item.what}</span></b>
                        <small>{item.person?.name || "Unknown person"} · {item.whereText || "Location sent with the case"}</small>
                      </span>
                    </button>
                    {next ? (
                      <button type="button" className="btn pri sm" disabled={busy === item.id} onClick={() => move(item, { state: next[0] }, `${item.id}: ${STATE_LABEL[next[0]].toLowerCase()}`)}>
                        {busy === item.id ? "Saving…" : next[1]}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="pd-fine">Requests you accept move here. Mark each step so the person can follow along.</p>
          )}
        </>
      ) : (
        <div className="pd-card pd-rows">
          {finished.length ? finished.map((item) => (
            <div className="pd-row" key={item.id}>
              <button type="button" className="pd-row-main" onClick={() => open(item)}>
                <span className={`bd ${stateClass(item.state)}`}>{STATE_LABEL[item.state] || item.state}</span>
                <span className="t">
                  <b>{item.id}<span> · {item.what}</span></b>
                  <small>{item.person?.name || "Unknown person"} · {item.state === "declined" ? `Declined: ${item.declineReason || "no reason"}` : waited(item.updatedAt)}{item.rating ? ` · rated ${item.rating}/5` : ""}</small>
                </span>
              </button>
            </div>
          )) : (
            <div className="pd-empty">
              <Icon n="check" c="l" />
              <b>Nothing finished yet</b>
              <small>Closed, declined, and cancelled requests gather here.</small>
            </div>
          )}
        </div>
      )}
    </>
  );
}


function PartnerCases({ partner, onSignedOut }) {
  if (partner.placeId && !partner.placeActive) {
    return (
      <>
        <SectionHead title="Cases" sub={partner.placeName} />
        <div className="pd-card pd-onboard">
          <div className="pd-onboard-copy">
            <span className="pd-ico"><Icon n="info" c="l" /></span>
            <div>
              <b>Paused by AfriResQ</b>
              <p>Your place is not receiving cases right now, so cases are hidden. Nothing is lost: everything comes back as soon as the AfriResQ team resumes it. Contact the team if you did not expect this.</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!partner.placeId) {
    const steps = [
      ["Confirmed", "The AfriResQ team checked your request.", true],
      ["Your place on the map", "The team puts your base on the AfriResQ map.", false],
      ["Receive cases", "Requests sent to your place appear here.", false],
    ];
    return (
      <>
        <SectionHead title="Cases" sub="Requests from people who need your service" />
        <div className="pd-card pd-onboard">
          <div className="pd-onboard-copy">
            <span className="pd-ico"><Icon n="clock" c="l" /></span>
            <div>
              <b>Almost ready</b>
              <p>Your organisation is confirmed. Cases start arriving once the AfriResQ team puts your place on the map. Keep your status up to date in the meantime.</p>
            </div>
          </div>
          <ol className="pd-steps">
            {steps.map(([title, detail, done], index) => (
              <li key={title} className={done ? "done" : index === 1 ? "now" : ""}>
                <i>{done ? <Icon n="check" c="s" /> : index + 1}</i>
                <div><b>{title}</b><small>{detail}</small></div>
              </li>
            ))}
          </ol>
        </div>
      </>
    );
  }

  return (
    <CaseBoard
      deskKey={PARTNER_DESK}
      placeId={partner.placeId}
      placeName={partner.placeName}
      stats={partner.stats}
      getToken={() => readPartnerSession()?.token}
      onSignedOut={onSignedOut}
    />
  );
}

function PartnerProfile({ partner, onSaved, onSignedOut }) {
  const { showToast } = useApp();
  const [draft, setDraft] = useState(() => profileDraft(partner));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }));
  const stored = (key) => (key === "emergencyReady" ? partner.emergencyReady : partner[key] || "");
  const changed = Object.keys(draft).some((key) => draft[key] !== stored(key));

  async function save() {
    const session = readPartnerSession();
    if (!session) return;
    setBusy(true);
    try {
      const fields = Object.fromEntries(Object.entries(draft).filter(([key, value]) => value !== stored(key)));
      const next = await updatePartner(session.token, fields);
      onSaved(next);
      setDraft(profileDraft(next));
      setError("");
      showToast("Details saved");
    } catch (err) {
      if (err instanceof PartnerSignedOut) onSignedOut();
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHead title="Profile" sub="What people and the AfriResQ team see about you" />
      <div className="pd-card">
        <div className="pd-card-head">
          <b>Checked by AfriResQ</b>
          <span className="bd ok"><Icon n="lock" c="s" /> Locked</span>
        </div>
        <div className="kv"><span>Organisation</span><b>{partner.organisation}</b></div>
        <div className="kv"><span>Sign-in email</span><b>{partner.email}</b></div>
        <div className="kv"><span>Services</span><b>{[partner.primaryCategory, ...partner.extraCategories].join(", ")}</b></div>
        <p className="pd-fine">Ask the AfriResQ team to change any of these.</p>
      </div>
      <div className="pd-card">
        <div className="pd-card-head"><b>Contact and service</b></div>
        <div className="pd-form">
          {PROFILE_FIELDS.map(([key, label, icon, placeholder]) => (
            <Field label={label} key={key}>
              <Inp
                icon={icon}
                pre={key.toLowerCase().includes("phone") ? "+256" : undefined}
                mode={key.toLowerCase().includes("phone") ? "tel" : undefined}
                type={key === "representativeEmail" ? "email" : undefined}
                value={draft[key]}
                placeholder={placeholder}
                onChange={set(key)}
              />
            </Field>
          ))}
          <div className="pd-wide">
            <Field label="What you offer">
              <textarea className="area" value={draft.services} placeholder="For example: medical transport, paramedics" onChange={(event) => set("services")(event.target.value)} />
            </Field>
          </div>
          <button type="button" className="card row pd-wide" onClick={() => set("emergencyReady")(!draft.emergencyReady)}>
            <span className="grow"><b>Available for emergencies outside those hours</b></span>
            <span className="switch" role="switch" aria-checked={draft.emergencyReady} />
          </button>
        </div>
        {error ? <Note tone="red" icon="alert">{error}</Note> : null}
        <div className="pd-save">
          <small>{changed ? "You have changes that are not saved." : "Everything is saved."}</small>
          {changed ? <button type="button" className="link" disabled={busy} onClick={() => setDraft(profileDraft(partner))}>Undo</button> : null}
          <Btn disabled={busy || !changed} onClick={save}>{busy ? "Saving…" : "Save changes"}</Btn>
        </div>
      </div>
    </>
  );
}

function PartnerAccount({ partner, onLeave }) {
  const { showToast } = useApp();
  const [busy, setBusy] = useState(false);

  async function everywhere() {
    const session = readPartnerSession();
    if (!session) return;
    setBusy(true);
    try {
      const body = await signOutEverywhere(session.token);
      showToast(`Signed out on ${body.ended} device${body.ended === 1 ? "" : "s"}`);
    } catch {
      /* the session is gone either way */
    }
    clearPartnerSession();
    onLeave();
  }

  async function here() {
    const session = readPartnerSession();
    clearPartnerSession();
    await partnerSignOut(session?.token);
    onLeave();
  }

  return (
    <>
      <SectionHead title="Account" sub="Sign-in and security" />
      <div className="pd-card">
        <div className="kv"><span>Status</span><b>Confirmed by AfriResQ</b></div>
        <div className="kv"><span>Connected place</span><b>{partner.placeName ? `${partner.placeName}${partner.placeActive ? "" : " (paused)"}` : "Not connected yet"}</b></div>
        <div className="kv"><span>Signed in as</span><b>{partner.email}</b></div>
      </div>
      <div className="pd-card">
        <div className="pd-card-head"><b>Your sign-in code</b></div>
        <p className="pd-fine">The code works on any device. If it may have reached the wrong person, sign out everywhere and ask the AfriResQ team for a new code. The old one then stops working.</p>
        <div className="pd-actions">
          <Btn tone="out" disabled={busy} onClick={here}><Icon n="logout" />Sign out on this device</Btn>
          <Btn tone="out" disabled={busy} onClick={everywhere}><Icon n="shield" />Sign out on every device</Btn>
        </div>
      </div>
    </>
  );
}

function messageWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function PartnerAnnouncements({ onSignedOut }) {
  const token = readPartnerSession()?.token || "";
  const [data, setData] = useState(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    const res = await fetch("/api/announcements/desk", { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new PartnerSignedOut("Sign in with the partner code first.");
    if (!res.ok) throw new Error(body.error || "The messages could not be loaded.");
    setData(body);
  }

  useEffect(() => {
    let stop = false;
    load().catch((err) => { if (stop) return; if (err instanceof PartnerSignedOut) onSignedOut(); else setError(err.message); });
    return () => { stop = true; };
  }, []);

  async function send(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy("send");
    setError("");
    try {
      const res = await fetch("/api/announcements/desk", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body }),
      });
      const next = await res.json().catch(() => ({}));
      if (res.status === 401) throw new PartnerSignedOut("Sign in with the partner code first.");
      if (!res.ok) throw new Error(next.error || "The message could not be sent.");
      setText("");
      await load();
    } catch (err) {
      if (err instanceof PartnerSignedOut) onSignedOut();
      else setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function addAdmin(event) {
    event.preventDefault();
    const value = email.trim();
    if (!value || busy) return;
    setBusy("admin");
    setError("");
    try {
      const res = await fetch("/api/announcements/desk/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: value }),
      });
      const next = await res.json().catch(() => ({}));
      if (res.status === 401) throw new PartnerSignedOut("Sign in with the partner code first.");
      if (!res.ok) throw new Error(next.error || "That person could not be added.");
      setEmail("");
      await load();
    } catch (err) {
      if (err instanceof PartnerSignedOut) onSignedOut();
      else setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function removeAdmin(personId) {
    setBusy("remove");
    setError("");
    try {
      const res = await fetch("/api/announcements/desk/admins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ personId }),
      });
      if (res.status === 401) throw new PartnerSignedOut("Sign in with the partner code first.");
      if (!res.ok) throw new Error("That admin could not be removed.");
      await load();
    } catch (err) {
      if (err instanceof PartnerSignedOut) onSignedOut();
      else setError(err.message);
    } finally {
      setBusy("");
    }
  }

  if (!data) return error ? <Note tone="red" icon="alert">{error}</Note> : <div className="pd-card pd-loading">Opening the group…</div>;
  if (!data.group) {
    return (
      <div className="pd-card">
        {error ? <Note tone="red" icon="alert">{error}</Note> : null}
        <b>No group yet</b>
        <p className="pd-fine">Students of this university already see the chat. Create the group here and they can read every message. Only admins can send.</p>
        <form className="announce-send" onSubmit={async (event) => {
          event.preventDefault();
          const value = name.trim();
          if (!value || busy) return;
          setBusy("group");
          setError("");
          try {
            const res = await fetch("/api/announcements/desk/group", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ name: value }),
            });
            const next = await res.json().catch(() => ({}));
            if (res.status === 401) throw new PartnerSignedOut("Sign in with the partner code first.");
            if (!res.ok) throw new Error(next.error || "The group could not be created.");
            setName("");
            setData(next);
          } catch (err) {
            if (err instanceof PartnerSignedOut) onSignedOut();
            else setError(err.message);
          } finally {
            setBusy("");
          }
        }}>
          <Inp icon="users" value={name} placeholder="Kyambogo announcements" onChange={setName} />
          <button type="submit" className="btn pri" disabled={Boolean(busy) || !name.trim()}>{busy === "group" ? "Creating…" : "Create group"}</button>
        </form>
      </div>
    );
  }
  return (
    <div className="pd-card announce-desk">
      {error ? <Note tone="red" icon="alert">{error}</Note> : null}
      <b>{data.group.name}</b>
      <p className="pd-fine">Students of this university can read every message. Only admins can send.</p>
      <div className="announce-log desk">
        {data.messages.length ? data.messages.map((message) => (
          <div className="announce-msg" key={message.id}>
            <b>{message.senderName}</b>
            <p>{message.body}</p>
            <small>{messageWhen(message.at)}</small>
          </div>
        )) : <p className="announce-empty">No message yet.</p>}
      </div>
      <form className="announce-send" onSubmit={send}>
        <textarea value={text} rows={3} placeholder="Write a message for every student" onChange={(event) => setText(event.target.value)} />
        <button type="submit" className="btn pri" disabled={Boolean(busy) || !text.trim()}>{busy === "send" ? "Sending…" : "Send"}</button>
      </form>
      <form className="announce-admin" onSubmit={addAdmin}>
        <b>Admins</b>
        <p className="pd-fine">The university can already send. Add a student of this university if they should send too.</p>
        {(data.admins || []).map((admin) => (
          <div className="announce-admin-row" key={admin.id}>
            <span><b>{admin.name}</b><small>{admin.email}</small></span>
            <button type="button" className="link" onClick={() => removeAdmin(admin.id)}>Remove</button>
          </div>
        ))}
        <Inp icon="mail" type="email" value={email} placeholder="name@students.example.ac.ug" onChange={setEmail} />
        <button type="submit" className="btn out" disabled={Boolean(busy) || !email.trim()}>{busy === "admin" ? "Adding…" : "Add admin"}</button>
      </form>
    </div>
  );
}

function PartnerHome() {
  const { go, showToast } = useApp();
  const [partner, setPartner] = useState(null);
  const [tab, setTab] = useState("cases");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function signedOut() {
    clearPartnerSession();
    go("partnerLogin", null, true);
  }

  function keep(next) {
    const session = readPartnerSession();
    if (session) savePartnerSession({ ...session, organisation: next.organisation, placeId: next.placeId });
    setPartner(next);
  }

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const session = readPartnerSession();
      if (!session) {
        signedOut();
        return;
      }
      try {
        const next = await partnerMe(session.token);
        if (!stop) {
          keep(next);
          setError("");
        }
      } catch (err) {
        if (stop) return;
        if (err instanceof PartnerSignedOut) signedOut();
        else setError(err.message);
      }
    };
    load();
    const id = setInterval(load, 15000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  async function choose(availability) {
    const session = readPartnerSession();
    if (!session || busy || partner?.availability === availability) return;
    setBusy(true);
    try {
      keep(await updatePartner(session.token, { availability }));
      setError("");
      showToast(`You are ${AVAILABILITY.find(([id]) => id === availability)[1].toLowerCase()}`);
    } catch (err) {
      if (err instanceof PartnerSignedOut) signedOut();
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const name = partner?.organisation || readPartnerSession()?.organisation || "Partner";
  const waiting = partner?.stats?.waiting || 0;
  return (
    <Screen>
      <DeskBar title={name} sub="Partner dashboard" onBack={() => go("welcome", null, true)} />
      <div className="body partner-board">
        <div className="pd">
          <aside className="pd-side">
            <div className="pd-card pd-org">
              <span className="pd-avatar">{initials(name)}</span>
              <div className="pd-org-name">
                <b>{name}</b>
                <small>{partner ? partner.primaryCategory : "Opening the dashboard…"}</small>
              </div>
              <div className="pd-org-tags">
                <span className="bd ok"><Icon n="check" c="s" /> Confirmed</span>
                <span className={`bd ${partner?.placeActive ? "" : "warn"}`}><Icon n="pin" c="s" /> {partner?.placeName ? `${partner.placeName}${partner.placeActive ? "" : " · paused"}` : "Not connected"}</span>
              </div>
            </div>

            {partner ? (
              <div className="pd-card pd-status">
                <small className="pd-label">Your status</small>
                {AVAILABILITY.map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    className={`pd-status-row ${id}${partner.availability === id ? " on" : ""}`}
                    disabled={busy}
                    aria-pressed={partner.availability === id}
                    onClick={() => choose(id)}
                  >
                    <i />
                    <span><b>{label}</b><small>{AVAILABILITY_HINT[id]}</small></span>
                    {partner.availability === id ? <Icon n="check" c="s" /> : null}
                  </button>
                ))}
                {partner.availability === "offline" ? <p className="pd-fine">Choose a status so the team knows if you can take requests.</p> : null}
              </div>
            ) : null}

            <nav className="pd-nav" aria-label="Dashboard sections">
              {(partner?.applicantKind === "university"
                ? [["cases", "Cases", "list"], ["announcements", "Announcements", "chat"], ["profile", "Profile", "edit"], ["account", "Account", "lock"]]
                : SECTIONS
              ).map(([id, label, icon]) => (
                <button type="button" key={id} className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
                  <Icon n={icon} />
                  <span>{label}</span>
                  {id === "cases" && waiting ? <em>{waiting}</em> : null}
                </button>
              ))}
            </nav>
          </aside>

          <main className="pd-main">
            {error ? <Note tone="red" icon="alert">{error}</Note> : null}
            {partner ? (
              <>
                {tab === "cases" ? <PartnerCases partner={partner} onSignedOut={signedOut} /> : null}
                {tab === "announcements" ? <PartnerAnnouncements onSignedOut={signedOut} /> : null}
                {tab === "profile" ? <PartnerProfile key={partner.id} partner={partner} onSaved={keep} onSignedOut={signedOut} /> : null}
                {tab === "account" ? <PartnerAccount partner={partner} onLeave={() => go("welcome", null, true)} /> : null}
              </>
            ) : (
              !error ? <div className="pd-card pd-loading">Opening the dashboard…</div> : null
            )}
          </main>
        </div>
      </div>
    </Screen>
  );
}

export { PartnerGate, PartnerSignIn, PartnerQueue, PartnerCase, PartnerLogin, PartnerHome };
