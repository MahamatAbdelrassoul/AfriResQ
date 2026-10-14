import { useEffect, useState } from "react";
import medicalArt from "./assets/scenes/scene-medical.png";
import { getCase, listDeskCases, updateCase } from "./case-api.js";
import { clearDeskSession, closeDesk, openDesk, readDeskSession, saveDeskSession } from "./desk-api.js";
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
  sent: "Sent",
  accepted: "Accepted",
  on_the_way: "On the way",
  arrived: "Arrived",
  closed: "Closed",
};

const NEXT = {
  sent: ["accepted", "Accept"],
  accepted: ["on_the_way", "On the way"],
  on_the_way: ["arrived", "Arrived"],
  arrived: ["closed", "Close the case"],
};

function stateClass(state) {
  if (state === "sent") return "warn";
  if (state === "closed") return "";
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
      saveDeskSession(session);
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

function PartnerQueue() {
  const { partnerDesk, go, setPartnerCaseId } = useApp();
  const desk = DESKS[partnerDesk] || DESKS.hospital;
  const [status, setStatus] = useState("open");
  const [cases, setCases] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!signedInto(desk.placeId)) go("partnerSignin", null, true);
  }, [desk.placeId, go]);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const session = signedInto(desk.placeId);
      if (!session) return;
      try {
        const rows = await listDeskCases(desk.placeId, status === "closed" ? "closed" : "", session.token);
        if (!stop) {
          setCases(rows);
          setError("");
        }
      } catch (err) {
        if (stop) return;
        if (String(err.message).includes("Sign in")) {
          clearDeskSession();
          go("partnerSignin", null, true);
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
  }, [desk.placeId, status]);

  return (
    <Screen>
      <DeskBar title={desk.short} sub={desk.title} onBack={() => go("partnerGate", null, true)} />
      <div className="body partner-board">
        <div className="partner-top">
          <div className="partner-head">
            <button type="button" className="back" aria-label="Both desks" onClick={() => go("partnerGate")}>
              <Icon n="chevL" />
            </button>
            <div className="partner-title">
              <h2>{desk.short}</h2>
              <small>{desk.title}</small>
            </div>
          </div>
          <div className="seg c2 partner-seg">
            <button type="button" className={status === "open" ? "on" : ""} onClick={() => setStatus("open")}>Open</button>
            <button type="button" className={status === "closed" ? "on" : ""} onClick={() => setStatus("closed")}>Closed</button>
          </div>
        </div>
        {error ? <Note tone="red" icon="alert">{error}</Note> : null}
        {cases.length ? (
          <div className="partner-list">
            {cases.map((item) => (
              <button
                type="button"
                className="partner-case"
                key={item.id}
                onClick={() => {
                  setPartnerCaseId(item.id);
                  go("partnerCase");
                }}
              >
                <span className={`bd ${stateClass(item.state)}`}>{STATE_LABEL[item.state] || item.state}</span>
                <span className="t">
                  <b>{item.id}<span> · {item.what}</span></b>
                  <small>{item.person?.name || "Unknown person"} · {item.whereText || "Location sent with the case"}</small>
                </span>
                <Icon n="chevR" c="chev" />
              </button>
            ))}
          </div>
        ) : (
          <div className="partner-empty">
            <span className={`ico ${desk.tone}`}><Icon n={desk.icon} c="l" /></span>
            <b>{status === "closed" ? "No closed cases yet" : "No one is waiting"}</b>
            <small>{status === "closed" ? "Closed cases from this desk will gather here." : "New demands appear here as soon as someone sends one."}</small>
          </div>
        )}
        <button
          type="button"
          className="link left"
          onClick={async () => {
            const session = readDeskSession();
            clearDeskSession();
            await closeDesk(session?.token);
            go("partnerGate", null, true);
          }}
        >Leave this desk</button>
      </div>
    </Screen>
  );
}

function PartnerCase() {
  const { partnerDesk, partnerCaseId, go, showToast } = useApp();
  const desk = DESKS[partnerDesk] || DESKS.hospital;
  const [item, setItem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!signedInto(desk.placeId)) go("partnerSignin", null, true);
  }, [desk.placeId, go]);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const session = signedInto(desk.placeId);
      if (!partnerCaseId || !session) return;
      try {
        const row = await getCase(partnerCaseId, session.token);
        if (!stop) setItem(row);
      } catch (err) {
        if (stop) return;
        if (String(err.message).includes("Sign in")) {
          clearDeskSession();
          go("partnerSignin", null, true);
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
    ["on_the_way", "On the way", desk === DESKS.hospital ? "The ambulance is moving" : "Officers are moving"],
    ["arrived", "Arrived", "You are with them"],
  ];
  const rank = { sent: 0, accepted: 1, on_the_way: 2, arrived: 3, closed: 4 };

  async function advance() {
    if (!item || !next) return;
    setBusy(true);
    try {
      const session = signedInto(desk.placeId);
      const saved = await updateCase(item.id, { state: next[0] }, session?.token);
      setItem(saved);
      showToast(next[0] === "closed" ? "Case closed" : `${STATE_LABEL[next[0]]}`);
      if (next[0] === "closed") go("partnerQueue");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!item) {
    return (
      <Screen>
        <DeskBar title={desk.short} sub="Opening the case" onBack={() => go("partnerQueue")} />
        <div className="body partner-board">
          <button type="button" className="back" aria-label="Back to cases" onClick={() => go("partnerQueue")}>
            <Icon n="chevL" />
          </button>
          {error ? <Note tone="red">{error}</Note> : <p className="sub">Opening the case…</p>}
        </div>
      </Screen>
    );
  }

  const person = item.person;
  const now = rank[item.state] ?? 0;

  return (
    <Screen>
      <DeskBar title={item.id} sub={item.what} onBack={() => go("partnerQueue")} />
      <div className="body partner-board">
        <div className="partner-head">
          <button type="button" className="back" aria-label="Back to cases" onClick={() => go("partnerQueue")}>
            <Icon n="chevL" />
          </button>
          <div className="partner-title">
            <h2>{item.id}</h2>
            <small>{item.what}</small>
          </div>
          <span className={`bd ${stateClass(item.state)}`}>{STATE_LABEL[item.state]}</span>
        </div>
        {item.whereLat != null && item.whereLng != null ? (
          <MapBoard
            className="map"
            style={{ height: 240, borderRadius: 20, flex: "none" }}
            opts={{ pins: item.place ? [item.place] : [], you: [Number(item.whereLat), Number(item.whereLng)] }}
          />
        ) : null}
        <div className="partner-split">
          <div className="card partner-person">
            <div className="row">
              <span className={`ico ${desk.tone}`}><Icon n="user" /></span>
              <div className="grow">
                <b>{person?.name || "Unknown person"}</b>
                <div className="fine" style={{ textAlign: "left" }}>{person?.type === "student" ? "Makerere student" : "Citizen"}{person?.hall ? ` · ${person.hall}` : ""}</div>
              </div>
            </div>
            <div className="kv"><span>Phone</span><b>+256 {person?.phone || "—"}</b></div>
            <div className="kv"><span>Where</span><b>{item.whereText || "Sent with the case"}</b></div>
            {item.detail ? <div className="kv"><span>Report</span><b>{item.detail}</b></div> : null}
            {item.awake ? <div className="kv"><span>Awake</span><b>{item.awake}</b></div> : null}
            {person?.share ? (
              <div className="partner-med">
                <b>Medical card</b>
                <div className="kv"><span>Blood</span><b>{person.med.blood || "—"}</b></div>
                <div className="kv"><span>Allergies</span><b>{person.med.allergies || "None listed"}</b></div>
                <div className="kv"><span>Conditions</span><b>{person.med.cond || "None listed"}</b></div>
                <div className="kv"><span>Medications</span><b>{person.med.meds || "None listed"}</b></div>
              </div>
            ) : (
              <Note icon="lock">This person has not shared a medical card.</Note>
            )}
          </div>
          <div className="partner-actions">
            <div className="tl">
              {steps.map(([id, title, detail], index) => (
                <div key={id} className={`st${index < now ? " done" : ""}${index === now && item.state !== "closed" ? " now" : ""}`}>
                  <i><Icon n="check" c="s" /></i>
                  <div><b>{title}</b><small>{detail}</small></div>
                </div>
              ))}
            </div>
            {error ? <Note tone="red" icon="alert">{error}</Note> : null}
            {next ? (
              <Btn disabled={busy} onClick={advance}>{busy ? "Saving…" : next[1]}</Btn>
            ) : (
              <Note icon="check">This case is closed.</Note>
            )}
            {desk === DESKS.hospital && item.path === "ambulance" ? (
              <Note icon="amb">Accepting tells the person a crew has the case. On the way means the ambulance has left.</Note>
            ) : null}
          </div>
        </div>
      </div>
    </Screen>
  );
}

export { PartnerGate, PartnerSignIn, PartnerQueue, PartnerCase };
