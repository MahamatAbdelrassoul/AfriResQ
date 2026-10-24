import { useEffect, useRef, useState } from "react";
import { useApp } from "./app-state.js";
import { pinFrom, readFix, watchFix } from "./locate.js";
import { HOME, ROUTES, STEPS, TRAIL, YOU, pointAlong } from "./map.js";
import { PartnerCase, PartnerGate, PartnerHome, PartnerLogin, PartnerQueue, PartnerSignIn } from "./partner.jsx";
import { PARTNER_CATEGORIES } from "./partner-categories.js";
import { saveProfilePhoto, useProfilePhoto } from "./profile-photo.js";
import { Btn, Field, Hdr, Icon, Inp, MapBoard, Note, Screen, Steps } from "./ui.jsx";
import accidentArt from "./assets/scenes/scene-accident.png";
import fireArt from "./assets/scenes/scene-fire.png";
import securityArt from "./assets/scenes/scene-security.png";
import missingArt from "./assets/scenes/scene-missing.png";
import disasterArt from "./assets/scenes/scene-disaster.png";
import generalArt from "./assets/scenes/scene-general.png";
import medicalArt from "./assets/scenes/scene-medical.png";
import walkArt from "./assets/scenes/scene-walk.png";
import joinArt from "./assets/scenes/scene-join.png";
import universityArt from "./assets/scenes/scene-university.png";
import profileArt from "./assets/scenes/scene-profile.png";
import safetyArt from "./assets/scenes/scene-safety.png";

const UNIS = [
  ["Makerere University", "Kampala", 1, "mak.ac.ug"],
  ["ISBAT University", "Kampala", 0],
  ["Kyambogo University", "Kampala", 0],
  ["Uganda Christian University", "Mukono", 0],
  ["Mbarara University of Science and Technology", "Mbarara", 0],
  ["Gulu University", "Gulu", 0],
];
const OTHER = [
  ["accident", "Road accident", "car"],
  ["fire", "Fire", "flame"],
  ["security", "Security", "shield2"],
  ["missing", "Missing person", "find"],
  ["disaster", "Disaster", "storm"],
  ["other", "Other", "more"],
];
const POLICE = ["accident", "security", "missing"];
const DESKS = {
  accident: ["Makerere Police Station", 1],
  fire: ["Fire and rescue desk", 0],
  security: ["Makerere Police Station", 1],
  missing: ["Makerere Police Station", 1],
  disaster: ["Disaster desk", 0],
  other: ["General desk", 0],
};
const WHAT = ["Not breathing", "Unconscious", "Severe bleeding", "Injury or fall", "Chest pain", "Pregnancy", "Seizure", "Other medical"];
const PASSWORD_MIN = 8;
const LANGS = ["English", "Luganda", "Runyankole", "Kiswahili"];
const BLOOD = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-", "Not sure"];
const RELS = ["Mother", "Father", "Sibling", "Guardian", "Friend"];
const SCENES = {
  accident: ["Help is\non the way", accidentArt, [["pin", "Your location", "We're with you always"], ["clock", "Faster response", "Get your help quickly"], ["heart", "Your safety matters", "We look out for you"]]],
  fire: ["Help is\non the way", fireArt, [["pin", "Your location", "Sent with this report"], ["flame", "Fire desk", "Not a medical ambulance"], ["shield", "Your case", "Saved with where you are"]]],
  security: ["Campus\ncan help", securityArt, [["pin", "Where you are", "Sent with the report"], ["shield2", "Security desk", "Connected on campus"], ["phone", "They call you", "The number on your profile"]]],
  missing: ["We can\nlook", missingArt, [["pin", "Last place", "Kept if an alert opens"], ["users", "Someone you trust", "Can ask AfriResQ"], ["lock", "Still private", "Nobody browses it"]]],
  disaster: ["Your report\nis saved", disasterArt, [["pin", "Your location", "Sent with the report"], ["storm", "Disaster desk", "Not a medical ambulance"], ["shield", "Your case", "Saved until it is handled"]]],
  other: ["Tell us\nwhat happened", generalArt, [["pin", "Your location", "Sent with the report"], ["more", "General desk", "Not a medical ambulance"], ["shield", "Your case", "Saved with where you are"]]],
  medical: ["Care that\nreaches you", medicalArt, [["heart", "Four questions", "So the desk knows"], ["pin", "Where you are", "GPS, home, or written"], ["amb", "Ambulance", "Only from a connected place"]]],
  walk: ["Walked\nwith you", walkArt, [["route", "The trip", "Until you arrive"], ["users", "Who follows", "Your next of kin"], ["lock", "Sharing stops", "When you are safe"]]],
  join: ["One account,\ntwo doors", joinArt, [["user", "Citizen", "Phone and an SMS code"], ["cap", "Student", "University email, plus a phone"], ["shield", "Same profile", "The same app either way"]]],
  phone: ["A number\nthey can call", joinArt, [["phone", "Uganda number", "A code by SMS"], ["lock", "Confirmed first", "Before the account exists"], ["amb", "A crew calls it", "When a case is open"]]],
  university: ["Your\nuniversity", universityArt, [["cap", "Makerere", "Live in Kampala"], ["mail", "Email next", "A code to your inbox"], ["info", "The others", "Listed until they go live"]]],
  email: ["Prove you\nstudy here", universityArt, [["mail", "The address", "name@students.mak.ac.ug"], ["cap", "Makerere", "The university for this version"], ["phone", "A phone too", "Saved on your profile"]]],
  code: ["Check the\nmessage", joinArt, [["lock", "Six digits", "Sent just now"], ["phone", "Or your inbox", "Whichever door you used"], ["shield", "Then your profile", "So help can find you"]]],
  profile1: ["So help\ncan act", profileArt, [["user", "Your name", "If you cannot speak"], ["phone", "Your number", "A desk can call it"], ["globe", "Your language", "How we speak with you"]]],
  profile2: ["People\nand a home", profileArt, [["users", "Next of kin", "Called if you cannot answer"], ["home", "Home pin", "Used when GPS fails"], ["shield", "On your profile", "Until you change it"]]],
  profile3: ["Only in\nan open case", profileArt, [["drop", "Medical card", "Optional"], ["lock", "Sharing stops", "When the case closes"], ["shield", "You choose", "Turn it off any time"]]],
  safety: ["If you go\nmissing", safetyArt, [["radio", "Last location", "Quietly saved"], ["clock", "We ask you first", "You choose how long"], ["users", "People you trust", "Only if you do not answer"]]],
  signin: ["Welcome\nback", joinArt, [["phone", "Phone", "Citizens and students"], ["mail", "University email", "Students"], ["lock", "Your password", "Or a one-time code"]]],
};

function PageArt({ title, sub, sos = false, kind, line, points }) {
  const scene = SCENES[kind];
  const bits = points || scene[2];
  return (
    <>
      <PartnerBar title={title} sub={sub} />
      <div className="lede">
        <Hdr title={title} sub={sub} sos={sos} />
        <aside className="scene">
        <div className="scene-art">
          <img src={scene[1]} alt="" />
          <p className="scene-line">{line || scene[0]}</p>
        </div>
        <div className="scene-points">
          {bits.map(([icon, label, detail]) => (
            <div key={label}>
              <Icon n={icon} />
              <b>{label}</b>
              <small>{detail}</small>
            </div>
          ))}
        </div>
        </aside>
      </div>
    </>
  );
}

function firstName(name) {
  return (name || "").trim().split(/\s+/)[0] || "there";
}
function initials(name) {
  return (name || "").trim().split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase() || "A";
}
function greetWord() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function Welcome() {
  const { go, fix } = useApp();
  return (
    <Screen bare>
      <div className="w">
        <div className="w-top">
          <div className="logo">
            <span className="mark"><Icon n="logo" c="m" /></span>
            AfriResQ
          </div>
        </div>
        <div className="w-art">
          <div className="w-card">
            <MapBoard opts={{ route: ROUTES.mak, pins: ["mak"], you: pinFrom(fix, YOU), amb: pointAlong(ROUTES.mak, 0.45) }} />
          </div>
          <div className="fl a"><Icon n="amb" c="m" />Ambulance, 4 min</div>
          <div className="fl b"><Icon n="shield" c="m" />Hospital connected</div>
        </div>
        <div className="w-copy">
          <h1>Care that reaches you.</h1>
          <p>Report a medical emergency and get an ambulance or a route. Join as a citizen with your phone, or as a Makerere student with your university email.</p>
        </div>
        <div className="w-cta">
          <Btn tone="white" onClick={() => go("who")}>Create account</Btn>
          <Btn tone="ghost" onClick={() => go("signin")}>I already have an account</Btn>
          <button type="button" className="w-foot desk-entry" onClick={() => go("partnerJoin")}>
            <Icon n="plus" c="s" />Join as a partner
          </button>
          <button type="button" className="w-foot desk-entry" onClick={() => go("partnerLogin")}>
            <Icon n="check" c="s" />Partner sign-in
          </button>
          <button type="button" className="w-foot desk-entry" onClick={() => go("partnerGate")}>
            <Icon n="shield2" c="s" />I work at a Makerere desk
          </button>
        </div>
      </div>
    </Screen>
  );
}

function ServicePicker({ label, placeholder, options, value, onPick, keepValue = true }) {
  const [text, setText] = useState(value || "");
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    setText(value || "");
  }, [value]);

  useEffect(() => {
    function close(event) {
      if (!box.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    if (!open) return;
    box.current?.querySelector(".service-list")?.scrollIntoView({ block: "nearest" });
  }, [open, text]);

  const shown = options.filter((item) => item.toLowerCase().includes(text.trim().toLowerCase()));

  return (
    <Field label={label}>
      <div className="service-pick" ref={box}>
        <div className="inp">
          <Icon n="find" />
          <input
            value={text}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onPointerDown={() => setOpen(true)}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              const next = event.target.value;
              setText(next);
              setOpen(true);
              if (keepValue && next !== value) onPick("");
            }}
          />
        </div>
        {open ? (
          <div className="service-list" role="listbox">
            {shown.length ? shown.map((item) => (
              <button
                type="button"
                key={item}
                className={item === value ? "on" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(item);
                  setText(keepValue ? item : "");
                  setOpen(false);
                  box.current?.querySelector("input")?.blur();
                }}
              >
                {item}
              </button>
            )) : <p>No service matches that.</p>}
          </div>
        ) : null}
      </div>
    </Field>
  );
}

function PartnerBar({ title, sub }) {
  const { back } = useApp();
  return (
    <header className="partner-bar">
      <div className="partner-brand">
        <button type="button" className="partner-back" onClick={back} aria-label="Back">
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

function PartnerJoin() {
  const [step, setStep] = useState("kind");
  const [primary, setPrimary] = useState("");
  const [extras, setExtras] = useState([]);
  const [form, setForm] = useState({
    organisation: "",
    phone: "",
    email: "",
    address: "",
    districts: "",
    services: "",
    hours: "",
    emergencyReady: false,
    licence: "",
    representativeName: "",
    representativePhone: "",
    representativeEmail: "",
    baseLat: "",
    baseLng: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState("");

  async function useHere() {
    setLocating(true);
    setLocateNote("");
    try {
      const fix = await readFix();
      setForm((current) => ({ ...current, baseLat: fix.lat.toFixed(6), baseLng: fix.lng.toFixed(6) }));
      setLocateNote(`Location found, within about ${fix.accuracy} m. Only use it if you are at the base now.`);
    } catch {
      setLocateNote("The browser did not share a location. Type the latitude and longitude instead.");
    } finally {
      setLocating(false);
    }
  }
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const state = window.history.state || {};
    if (state.screen === "partnerJoin" && !state.step) {
      window.history.replaceState({ ...state, step: "kind" }, "", window.location.href);
    }
    function onPop(event) {
      if (event.state?.screen !== "partnerJoin") return;
      const next = event.state.step;
      setStep(next === "details" || next === "pending" ? next : "kind");
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function showStep(next) {
    setStep(next);
    const state = window.history.state || {};
    window.history.pushState(
      { ...state, screen: "partnerJoin", step: next },
      "",
      `${window.location.pathname}${window.location.search}#/partnerJoin`,
    );
  }

  function choosePrimary(item) {
    setPrimary(item);
    setExtras((current) => current.filter((name) => name !== item));
  }

  function toggleExtra(item) {
    setExtras((current) => (current.includes(item) ? current.filter((name) => name !== item) : [...current, item]));
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, primaryCategory: primary, extraCategories: extras }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The request was not saved.");
      showStep("pending");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (step === "pending") {
    return (
      <Screen>
        <PartnerBar title="Pending verification" sub={form.organisation} />
        <div className="body partner-join">
          <Hdr title="Pending verification" sub={form.organisation} sos={false} />
          <Note icon="lock">AfriResQ has the request. This organisation will not receive a case until the team confirms it. Call 999 or 112 if someone needs help now.</Note>
          <Note icon="pin">Once confirmed, your organisation gets its own place on the AfriResQ map and receives cases there.</Note>
          <Note icon="mail">Once confirmed, a sign-in code goes to {form.email || "the official email"} and by SMS to {form.representativeName || "the representative"}. Use it under Partner sign-in on the welcome screen.</Note>
        </div>
      </Screen>
    );
  }

  if (step === "details") {
    return (
      <Screen>
        <PartnerBar title="About the organisation" sub={primary} />
        <div className="body partner-join">
          <Hdr title="About the organisation" sub={primary} sos={false} />
          <div className="form-side">
            <Field label="Organisation name">
              <Inp value={form.organisation} placeholder="Registered name" onChange={set("organisation")} />
            </Field>
            <Field label="Official telephone">
              <Inp icon="phone" pre="+256" mode="tel" value={form.phone} placeholder="7XX XXX XXX" onChange={set("phone")} />
            </Field>
            <Field label="Official email">
              <Inp icon="mail" type="email" value={form.email} placeholder="name@organisation.ug" onChange={set("email")} />
            </Field>
            <Field label="Physical address">
              <Inp icon="pin" value={form.address} placeholder="Street and town" onChange={set("address")} />
            </Field>
            <Field label="Where the base is on the map">
              <div style={{ display: "flex", gap: 8 }}>
                <Inp icon="pin" mode="decimal" value={form.baseLat} placeholder="Latitude, 0.3304" onChange={set("baseLat")} />
                <Inp mode="decimal" value={form.baseLng} placeholder="Longitude, 32.5701" onChange={set("baseLng")} />
              </div>
            </Field>
            <button type="button" className="link left" disabled={locating} onClick={useHere}>{locating ? "Finding the location…" : "Use this device's location"}</button>
            <Note icon="pin">{locateNote || "Once confirmed, your organisation appears here on the AfriResQ map and receives cases. In Google Maps, right-click your base and click the numbers to copy them."}</Note>
            <Field label="Operating districts">
              <Inp value={form.districts} placeholder="Kampala, Wakiso" onChange={set("districts")} />
            </Field>
            <Field label="Services offered">
              <textarea className="area" value={form.services} placeholder="For example: medical transport, paramedics, event medical cover" onChange={(event) => set("services")(event.target.value)} />
            </Field>
            <Field label="Operating hours">
              <Inp icon="clock" value={form.hours} placeholder="24 hours, or 8:00 to 17:00" onChange={set("hours")} />
            </Field>
            <button type="button" className="card row" onClick={() => set("emergencyReady")(!form.emergencyReady)}>
              <span className="grow"><b>Available for emergencies outside those hours</b></span>
              <span className="switch" role="switch" aria-checked={form.emergencyReady} />
            </button>
            <Field label="Licence or registration number">
              <Inp icon="lock" value={form.licence} placeholder="The number on the official document" onChange={set("licence")} />
            </Field>
            <Field label="Person who can speak for the organisation">
              <Inp icon="user" value={form.representativeName} placeholder="Full name" onChange={set("representativeName")} />
            </Field>
            <Field label="Their telephone">
              <Inp icon="phone" pre="+256" mode="tel" value={form.representativePhone} placeholder="7XX XXX XXX" onChange={set("representativePhone")} />
            </Field>
            <Field label="Their email">
              <Inp icon="mail" type="email" value={form.representativeEmail} placeholder="name@organisation.ug" onChange={set("representativeEmail")} />
            </Field>
            {extras.length ? <Note>Also offered: {extras.join(", ")}.</Note> : null}
            <Note icon="lock">The document file itself comes later. A confirmed organisation still does not receive cases until its service is connected.</Note>
          </div>
        </div>
        <div className="foot">
          {error ? <div className="err" role="alert">{error}</div> : null}
          <Btn disabled={busy} onClick={submit}>{busy ? "Sending…" : "Submit for verification"}</Btn>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <PartnerBar title="Join as a partner" sub="Choose the main service" />
      <div className="body partner-join">
        <Hdr title="Join as a partner" sub="Choose the main service" sos={false} />
        <div className="form-side">
          <p className="sub">One organisation can offer more than one service. AfriResQ confirms the request before any case is sent.</p>
          <ServicePicker
            label="Main service"
            placeholder="Type to find a service"
            options={PARTNER_CATEGORIES}
            value={primary}
            onPick={choosePrimary}
          />
          {primary ? (
            <ServicePicker
              label="Another service, if they offer one"
              placeholder="Type to add another service"
              options={PARTNER_CATEGORIES.filter((item) => item !== primary && !extras.includes(item))}
              value=""
              keepValue={false}
              onPick={toggleExtra}
            />
          ) : null}
          {extras.length ? (
            <div className="chips">
              {extras.map((item) => (
                <button type="button" className="chip on" key={item} onClick={() => toggleExtra(item)}>{item}</button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="foot">
        <Btn disabled={!primary} onClick={() => showStep("details")}>Continue</Btn>
      </div>
    </Screen>
  );
}

function Who() {
  const { joinCitizen, joinStudent } = useApp();
  return (
    <Screen>
      <div className="body">
        <PageArt kind="join" title="Join AfriResQ" sub="One account. Pick how you join." />
        <div className="form-side">
        <button type="button" className="door" onClick={joinCitizen}>
          <span className="ico green"><Icon n="user" c="l" /></span>
          <span><b>I am a citizen</b><small>Sign up with your Uganda phone number. We send a code by SMS.</small></span>
        </button>
        <button type="button" className="door" onClick={joinStudent}>
          <span className="ico violet"><Icon n="cap" c="l" /></span>
          <span><b>I am a student</b><small>Confirm with your Makerere email. Your university hospital comes first.</small></span>
        </button>
        <Note>Citizen and student are two doors into the same app and the same profile.</Note>
        </div>
      </div>
    </Screen>
  );
}

function Phone() {
  const { user, setPath, error, sendPhone, sending } = useApp();
  return (
    <Screen>
      <div className="body">
        <PageArt kind="phone" title="Your phone number" sub="Step 1 of 2" />
        <div className="form-side">
        <p className="sub">We send a code by SMS. This is also the number a hospital desk or ambulance crew will call.</p>
        <Field label="Uganda phone number" error={error}>
          <Inp icon="phone" pre="+256" mode="tel" value={user.phone} placeholder="7XX XXX XXX" onChange={(value) => setPath("user.phone", value)} />
        </Field>
        <Note icon="lock">The number is confirmed before your account exists.</Note>
        </div>
      </div>
      <div className="foot"><Btn disabled={sending} onClick={sendPhone}>{sending ? "Sending..." : "Send code"}</Btn></div>
    </Screen>
  );
}

function Universities() {
  const { uniQuery, setUniQuery, pickUni } = useApp();
  const list = UNIS.filter((item) => item[0].toLowerCase().includes(uniQuery.toLowerCase()));
  return (
    <Screen>
      <div className="body">
        <PageArt kind="university" title="Choose your university" sub="Step 1 of 3" />
        <div className="form-side">
        <p className="sub">Every university we plan to cover is listed. Only live ones can finish sign-up.</p>
        <div className="inp">
          <Icon n="search" />
          <input placeholder="Search universities" value={uniQuery} autoComplete="off" onChange={(event) => setUniQuery(event.target.value)} />
        </div>
        <div className="card list" style={{ padding: "6px 14px" }}>
          {list.length ? list.map((item) => (
            <button type="button" className="rw" key={item[0]} onClick={() => pickUni(item[0], item[2], item[3])}>
              <span className={`ico ${item[2] ? "violet" : "plain"}`}><Icon n="cap" /></span>
              <span className="t"><b>{item[0]}</b><small>{item[1]}</small></span>
              {item[2] ? <em className="bd ok">Live</em> : <em className="bd warn">Coming soon</em>}
            </button>
          )) : <div className="fine" style={{ padding: 16 }}>No university matches your search.</div>}
        </div>
        </div>
      </div>
    </Screen>
  );
}

function Email() {
  const { uni, uniDomain, user, setPath, error, sendEmail, sending } = useApp();
  return (
    <Screen>
      <div className="body">
        <PageArt kind="email" title="University email" sub="Makerere University" />
        <div className="form-side">
        <span className="pill violet" style={{ alignSelf: "flex-start" }}><Icon n="cap" c="s" />{uni}</span>
        <p className="sub">We email a code to your student inbox. The address must be <b>name@{`students.${uniDomain}`}</b>.</p>
        <Field label="Student email" error={error}>
          <Inp icon="mail" type="email" value={user.email} placeholder={`name@students.${uniDomain}`} onChange={(value) => setPath("user.email", value)} />
        </Field>
        <Note tone="violet">You will still save a phone number on your profile, because email is not how a crew reaches someone at the roadside.</Note>
        </div>
      </div>
      <div className="foot"><Btn disabled={sending} onClick={sendEmail}>{sending ? "Sending..." : "Send code"}</Btn></div>
    </Screen>
  );
}

function Code() {
  const { codeFor, error, verify, verifying, resendCode, sending } = useApp();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [left, setLeft] = useState(45);
  useEffect(() => {
    const id = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  function setDigit(index, value) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) document.getElementById(`otp-${index + 1}`)?.focus();
  }
  return (
    <Screen>
      <div className="body">
        <PageArt kind="code" title="Enter the code" />
        <div className="form-side">
        <p className="sub">We sent a 6-digit code to <b>{codeFor}</b>.</p>
        <div className="otp">
          {digits.map((digit, index) => (
            <input
              key={index}
              id={`otp-${index}`}
              inputMode="numeric"
              maxLength={1}
              aria-label={`Digit ${index + 1}`}
              value={digit}
              onChange={(event) => setDigit(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Backspace" && !digits[index] && index > 0) document.getElementById(`otp-${index - 1}`)?.focus();
              }}
            />
          ))}
        </div>
        {error ? <div className="err" style={{ textAlign: "center" }} role="alert">{error}</div> : null}
        <p className="fine">{left ? `Resend code in 0:${left < 10 ? `0${left}` : left}` : "You can ask for a new code now"}</p>
        {!left ? <button type="button" className="link" disabled={sending} onClick={async () => { const ok = await resendCode(); if (ok) setLeft(45); }}>Send a new code</button> : null}
        </div>
      </div>
      <div className="foot">
        <Btn disabled={verifying} onClick={() => verify(digits.join(""))}>{verifying ? "Verifying..." : "Verify and continue"}</Btn>
      </div>
    </Screen>
  );
}

function Profile1() {
  const { user, student, setPath, setUser, go, showToast, newPassword, setNewPassword } = useApp();
  return (
    <Screen>
      <div className="body">
        <PageArt kind="profile1" title="About you" sub="Profile 1 of 3" />
        <div className="form-side">
        <Steps n={1} total={3} />
        <p className="sub">We fill this once. It lets help act even if you cannot speak for yourself.</p>
        <Field label="Full name"><Inp icon="user" value={user.name} placeholder="Your full name" onChange={(value) => setPath("user.name", value)} /></Field>
        <Field label={student ? "Phone (required)" : "Phone (confirmed by SMS)"}>
          <Inp icon="phone" pre="+256" mode="tel" value={user.phone} placeholder="7XX XXX XXX" readOnly={!student} onChange={(value) => setPath("user.phone", value)} />
        </Field>
        {student ? (
          <>
            <Field label="University email (confirmed)"><Inp icon="mail" value={user.email} readOnly onChange={() => {}} /></Field>
            <Field label="Student number"><Inp icon="cap" mode="numeric" value={user.studentNo} placeholder="e.g. 2300712345" onChange={(value) => setPath("user.studentNo", value)} /></Field>
            <Field label="Campus hall or residence"><Inp icon="home" value={user.hall} placeholder="e.g. Lumumba Hall, room 214" onChange={(value) => setPath("user.hall", value)} /></Field>
          </>
        ) : (
          <Field label="Email (optional)">
            <Inp icon="mail" value={user.email.includes("students") ? "" : user.email} placeholder="name@example.com" onChange={(value) => setPath("user.email", value)} />
          </Field>
        )}
        <Field label="Language">
          <div className="chips">
            {LANGS.map((lang) => (
              <button type="button" key={lang} className={`chip${user.lang === lang ? " on" : ""}`} onClick={() => setUser({ ...user, lang })}>{lang}</button>
            ))}
          </div>
        </Field>
        <Field label="Password">
          <Inp icon="lock" type="password" autoComplete="new-password" value={newPassword.value} placeholder={`At least ${PASSWORD_MIN} characters`} onChange={(value) => setNewPassword({ ...newPassword, value })} />
        </Field>
        <Field label="Password again">
          <Inp icon="lock" type="password" autoComplete="new-password" value={newPassword.again} placeholder="Type it once more" onChange={(value) => setNewPassword({ ...newPassword, again: value })} />
        </Field>
        <Note icon="lock">{student ? "Sign in next time with your student email or phone and this password." : "Sign in next time with your phone number and this password."}</Note>
        </div>
      </div>
      <div className="foot">
        <Btn onClick={() => {
          if (!(user.name || "").trim()) {
            showToast("Please enter your full name.");
            return;
          }
          const problem = passwordProblem(newPassword.value, newPassword.again);
          if (problem) {
            showToast(problem);
            return;
          }
          go("profile2");
        }}>Continue</Btn>
      </div>
    </Screen>
  );
}

function Profile2() {
  const { user, setUser, setPath, go, showToast, fix, askFix } = useApp();
  return (
    <Screen>
      <div className="body">
        <PageArt kind="profile2" title="People and places" sub="Profile 2 of 3" />
        <div className="form-side">
        <Steps n={2} total={3} />
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row"><span className="ico red"><Icon n="users" /></span><div className="grow"><b>Next of kin</b><div className="fine" style={{ textAlign: "left" }}>Called if you cannot answer</div></div></div>
          <Field label="Name"><Inp value={user.kin.name} placeholder="Full name" onChange={(value) => setPath("user.kin.name", value)} /></Field>
          <Field label="Relationship">
            <div className="chips">
              {RELS.map((rel) => (
                <button type="button" key={rel} className={`chip${user.kin.rel === rel ? " on" : ""}`} onClick={() => setUser({ ...user, kin: { ...user.kin, rel } })}>{rel}</button>
              ))}
            </div>
          </Field>
          <Field label="Phone"><Inp pre="+256" mode="tel" value={user.kin.phone} placeholder="7XX XXX XXX" onChange={(value) => setPath("user.kin.phone", value)} /></Field>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row"><span className="ico gold"><Icon n="home" /></span><div className="grow"><b>Home location</b><div className="fine" style={{ textAlign: "left" }}>Used when GPS fails. Tap the map to move the pin.</div></div></div>
          <MapBoard
            opts={{ home: 1, you: pinFrom(fix, YOU) }}
            style={{ height: 170, borderRadius: 16 }}
            onTap={(latlng) => {
              setUser({ ...user, home: { text: "Makerere Hill Rd, Kampala", lat: latlng.lat, lng: latlng.lng } });
              showToast("Home pin set to your current location");
            }}
          />
          <div className="row">
            <span className="grow" style={{ fontWeight: 700, fontSize: 14 }}>{user.home.text}</span>
            <button type="button" className="link" onClick={async () => {
              const point = await askFix(true);
              if (!point) {
                showToast("This browser did not share a location.");
                return;
              }
              setUser({ ...user, home: { text: "Current location", lat: point.lat, lng: point.lng } });
              showToast("Home pin set to your current location");
            }}>Use current location</button>
          </div>
        </div>
        </div>
      </div>
      <div className="foot"><Btn onClick={() => go("profile3")}>Continue</Btn></div>
    </Screen>
  );
}

function Profile3() {
  const { user, setUser, setPath, go } = useApp();
  return (
    <Screen>
      <div className="body">
        <PageArt kind="profile3" title="Medical card" sub="Profile 3 of 3" />
        <div className="form-side">
        <Steps n={3} total={3} />
        <p className="sub">Optional, and you can skip it. It is sent only to the place handling an open case, and stops when the case closes.</p>
        <Field label="Blood group">
          <div className="chips">
            {BLOOD.map((blood) => (
              <button type="button" key={blood} className={`chip${user.med.blood === blood ? " on" : ""}`} onClick={() => setUser({ ...user, med: { ...user.med, blood } })}>{blood}</button>
            ))}
          </div>
        </Field>
        <Field label="Allergies"><Inp value={user.med.allergies} placeholder="e.g. Penicillin" onChange={(value) => setPath("user.med.allergies", value)} /></Field>
        <Field label="Conditions"><Inp value={user.med.cond} placeholder="e.g. Asthma" onChange={(value) => setPath("user.med.cond", value)} /></Field>
        <Field label="Medications"><Inp value={user.med.meds} placeholder="e.g. Inhaler" onChange={(value) => setPath("user.med.meds", value)} /></Field>
        <div className="card row">
          <div className="grow">
            <b>Share my medical card during an open case</b>
            <div className="fine" style={{ textAlign: "left", marginTop: 3 }}>Turn off any time in Profile.</div>
          </div>
          <button type="button" className="switch" role="switch" aria-checked={user.med.share} aria-label="Share medical card" onClick={() => setUser({ ...user, med: { ...user.med, share: !user.med.share } })} />
        </div>
        </div>
      </div>
      <div className="foot">
        <Btn onClick={() => go("safety")}>Continue</Btn>
        <button type="button" className="link" onClick={() => go("safety")}>Skip for now</button>
      </div>
    </Screen>
  );
}

function Consent() {
  const { safety, setSafety, user, finishSetup } = useApp();
  const options = [
    ["always", "Always on (recommended)", "Saves your location every 15 minutes, and the last place before your phone dies. Light on battery."],
    ["trips", "Only trips and cases", 'Shares only during "Walk me home" trips and open emergency cases.'],
    ["off", "Off", "No location is saved. Cases still use live location while they are open."],
  ];
  return (
    <Screen>
      <div className="body">
        <PageArt kind="safety" title="Safety Net" sub="One more step" />
        <div className="form-side">
        <div className="scard">
          <span className="pill" style={{ background: "rgba(255,255,255,.2)", color: "#fff" }}><Icon n="radio" c="s" />New</span>
          <div className="nm">If you ever go missing, we can find where you were last.</div>
          <small>Your phone quietly saves its last known location. Nobody sees it unless a missing-person alert opens.</small>
        </div>
        {options.map(([id, title, detail]) => (
          <button type="button" key={id} className={`radio${safety.mode === id ? " on" : ""}`} onClick={() => setSafety({ ...safety, mode: id })}>
            <span className="rd">{safety.mode === id ? <Icon n="check" c="s" /> : null}</span>
            <span><b>{title}</b><small>{detail}</small></span>
          </button>
        ))}
        <div className="card row">
          <div className="grow">
            <b>Let my next of kin start an alert</b>
            <div className="fine" style={{ textAlign: "left", marginTop: 3 }}>{user.kin.name} can say "I cannot reach them".</div>
          </div>
          <button type="button" className="switch" role="switch" aria-checked={safety.kin} aria-label="Next of kin alerts" onClick={() => setSafety({ ...safety, kin: !safety.kin })} />
        </div>
        <Note icon="lock">Kept for 72 hours, then deleted. You can pause or change this any time in Safety.</Note>
        </div>
      </div>
      <div className="foot"><Btn onClick={finishSetup}>Turn on and go to Home</Btn></div>
    </Screen>
  );
}

function SignIn() {
  const { signinTab, setSigninTab, user, setPath, error, sendSignin, signinWithPassword, go, sending } = useApp();
  const [password, setPassword] = useState("");
  return (
    <Screen>
      <div className="body">
        <PageArt kind="signin" title="Sign in" sub="Welcome back" />
        <div className="form-side">
        <div className="seg c2">
          <button type="button" className={signinTab === "phone" ? "on" : ""} onClick={() => setSigninTab("phone")}>Phone</button>
          <button type="button" className={signinTab === "email" ? "on" : ""} onClick={() => setSigninTab("email")}>University email</button>
        </div>
        {signinTab === "phone" ? (
          <Field label="Uganda phone number">
            <Inp icon="phone" pre="+256" mode="tel" name="username" autoComplete="username" value={user.phone} placeholder="7XX XXX XXX" onChange={(value) => setPath("user.phone", value)} />
          </Field>
        ) : (
          <Field label="University email">
            <Inp icon="mail" type="email" name="username" autoComplete="username" value={user.email} placeholder="name@students.mak.ac.ug" onChange={(value) => setPath("user.email", value)} />
          </Field>
        )}
        <Field label="Password" error={error}>
          <Inp icon="lock" type="password" name="password" autoComplete="current-password" value={password} placeholder="Your password" onChange={setPassword} />
        </Field>
        <Note>Forgot it, or never set one? Use a code instead. {signinTab === "phone" ? "It arrives by SMS." : "It arrives in your student inbox."}</Note>
        </div>
      </div>
      <div className="foot">
        <Btn disabled={sending} onClick={() => signinWithPassword(password)}>{sending ? "Signing in..." : "Sign in"}</Btn>
        <button type="button" className="link" disabled={sending} onClick={sendSignin}>Send me a code instead</button>
        <button type="button" className="link" onClick={() => go("who")}>New here? Create an account</button>
      </div>
    </Screen>
  );
}

function WelcomeBack() {
  const { user, student, go, openSheet, signOut } = useApp();
  const photo = useProfilePhoto();
  return (
    <Screen bare>
      <div className="bk">
        <div className="row">
          <div className="logo"><span className="mark"><Icon n="logo" c="m" /></span>AfriResQ</div>
        </div>
        <div className="bk-card">
          <div className="spacer" />
          <div className="av">{photo ? <img src={photo} alt="" /> : initials(user.name)}</div>
          <div>
            <div style={{ opacity: 0.85, fontWeight: 600, fontSize: 15 }}>Welcome back,</div>
            <h1 style={{ font: "800 38px/1.1 var(--font)", letterSpacing: "-.025em" }}>{firstName(user.name)}</h1>
          </div>
          <p style={{ opacity: 0.85, fontSize: 15, lineHeight: 1.5, fontWeight: 500 }}>
            {student ? "Makerere University student" : "AfriResQ citizen"}. Your profile and Safety Net are ready.
          </p>
          <div className="spacer" />
          <Btn tone="white" onClick={() => go("home", null, true)}><Icon n="finger" />Unlock with fingerprint</Btn>
          <Btn tone="ghost" onClick={() => go("signin")}>Sign in with password or code</Btn>
          <button type="button" className="link" style={{ color: "#fff", opacity: 0.85 }} onClick={signOut}>Not {firstName(user.name)}? Use another account</button>
          <button type="button" className="w-foot" style={{ color: "#fff", justifyContent: "center", display: "flex", gap: 6, alignItems: "center", fontWeight: 700, fontSize: 13, margin: "0 auto" }} onClick={() => openSheet("lines")}>
            <Icon n="phone" c="s" />Call 999 or 112
          </button>
        </div>
      </div>
    </Screen>
  );
}

// What the person sees about a request they sent, in their own words.
const REQUEST_STATUS = {
  sent: ["Waiting for a reply", "Sent. The team is being alerted.", "warn"],
  accepted: ["Accepted", "A team has taken your request.", "ok"],
  on_the_way: ["On the way", "Help is moving to you.", "ok"],
  arrived: ["Arrived", "Help is with you.", "ok"],
  declined: ["Declined", "They could not take it. Choose other help.", "bad"],
};

function RequestStatusCard() {
  const { kase, places, go, setPlace, refreshCase, clearCase } = useApp();
  const refreshRef = useRef(refreshCase);
  refreshRef.current = refreshCase;
  const status = kase ? REQUEST_STATUS[kase.state] : null;
  useEffect(() => {
    if (!kase?.id || !status || kase.state === "declined") return undefined;
    const id = setInterval(() => refreshRef.current(), 5000);
    return () => clearInterval(id);
  }, [kase?.id, kase?.state]);
  if (!status) return null;
  const where = places[kase.place]?.name || kase.desk || "the desk";
  const open = () => {
    if (kase.place) setPlace(kase.place);
    go(kase.kind === "other" ? "desk" : kase.path === "ambulance" ? "ambulance" : "route");
  };
  return (
    <div className={`req-status ${status[2]}`}>
      <button type="button" className="req-status-main" onClick={open}>
        <span className={`bd ${status[2]}`}>{status[0]}</span>
        <b>{kase.id} · {kase.what}</b>
        <small>{kase.state === "declined" ? `${where}: ${kase.declineReason || "could not take it"}` : `${where} · ${status[1]}`}</small>
      </button>
      {kase.state === "declined" ? (
        <div className="req-status-actions">
          <button type="button" className="btn pri sm" onClick={() => { clearCase(); go("help"); }}>Choose other help</button>
          <button type="button" className="btn out sm" onClick={() => clearCase()}>Dismiss</button>
        </div>
      ) : (
        <Icon n="chevR" c="chev" />
      )}
    </div>
  );
}

function DeclinedPanel({ where, reason, onOther, onCall }) {
  return (
    <div className="declined-panel" role="alert">
      <span className="ico red"><Icon n="alert" /></span>
      <div className="grow">
        <b>{where} could not take this request</b>
        <small>{reason ? `${reason.replace(/[.!?]*$/, "")}.` : "They did not give a reason."} Your request is closed there, so nothing more will come from them.</small>
      </div>
      <div className="declined-actions">
        <Btn onClick={onOther}>Choose other help</Btn>
        <Btn tone="out" onClick={onCall}><Icon n="phone" c="m" />Call 999 or 112</Btn>
      </div>
    </div>
  );
}

function Home() {
  const { user, student, safety, go, openSheet, setMode, setPlace, setReport, setOtherType, places } = useApp();
  const photo = useProfilePhoto();
  const on = safety.mode !== "off";
  const hospital = places.mak;
  return (
    <Screen tabs>
      <div className="body desk">
        <div className="page-bar">
        <div className="greet">
          <button type="button" className="av2" aria-label="Profile" onClick={() => go("account", null, true)}>
            {photo ? <img src={photo} alt="" /> : initials(user.name)}
          </button>
          <div className="grow" style={{ flex: 1, minWidth: 0 }}>
            <h2>{greetWord()}, {firstName(user.name)}</h2>
            <small><Icon n="pin" c="s" />{user.home.text}</small>
          </div>
          <button type="button" className="icon-btn" aria-label="Notifications" onClick={() => openSheet("notifs")}>
            <Icon n="bell" /><i className="dot" />
          </button>
        </div>
        </div>
        <div className="desk-grid">
        <RequestStatusCard />
        <button type="button" className={`sn${on ? "" : " off"}`} onClick={() => go("safetyHome", null, true)}>
          <i />Safety Net {on ? "on, location saved" : "off"}
        </button>
        <div className="desk-hero">
        <button type="button" className="hero" onClick={() => { setReport((current) => ({ ...current, done: false })); go("report"); }}>
          <span className="tag"><Icon n="heart" c="s" />Medical emergency</span>
          <h2>Need medical help?</h2>
          <p>{student ? "Four quick questions. Makerere University Hospital can send an ambulance." : "Four quick questions. We find the nearest hospital and an ambulance."}</p>
          <Icon n="amb" c="big" />
          <span className="go">Get medical help <Icon n="chevR" c="m" /></span>
        </button>
        </div>
        <div className="desk-side">
        {student ? (
          <button type="button" className="pcard uni" onClick={() => { setMode("uni"); setPlace("mak"); go("help"); }}>
            <span className="ico violet"><Icon n="cap" /></span>
            <span className="t">
              <small>Your university hospital</small>
              <b>{hospital.name}</b>
              <small><span className="dotg" />{hospital.dist} km away, ambulance can be sent</small>
            </span>
            <Icon n="chevR" c="chev" />
          </button>
        ) : (
          <button type="button" className="pcard" onClick={() => go("places", null, true)}>
            <span className="ico gold"><Icon n="home" /></span>
            <span className="t">
              <small>Saved home location</small>
              <b>{user.home.text}</b>
              <small>Find nearest help from here</small>
            </span>
            <Icon n="chevR" c="chev" />
          </button>
        )}
        </div>
        <div className="desk-more">
        <div className="sec"><h3>Other emergencies</h3><small>Go to their own desk</small></div>
        <div className="grid6">
          {OTHER.map(([id, label, icon]) => (
            <button type="button" className="ot" key={id} onClick={() => { setOtherType(id); go("other"); }}>
              <span className="ico plain"><Icon n={icon} /></span>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="pcard lap-quiet" onClick={() => openSheet("lines")}>
          <span className="ico red"><Icon n="phone" /></span>
          <span className="t"><b style={{ margin: 0 }}>Call 999 or 112</b><small>National emergency lines, one tap</small></span>
          <Icon n="chevR" c="chev" />
        </button>
        </div>
        </div>
      </div>
    </Screen>
  );
}

function placeIds(places, filter, student, uni) {
  let ids = Object.keys(places).filter((id) => places[id].kind === "hospital");
  if (filter === "amb") ids = ids.filter((id) => places[id].conn);
  if (filter === "5") ids = ids.filter((id) => places[id].dist < 5);
  ids.sort((a, b) => {
    const ua = student && places[a].uni === uni ? -1 : 0;
    const ub = student && places[b].uni === uni ? -1 : 0;
    return ua !== ub ? ua - ub : places[a].dist - places[b].dist;
  });
  return ids;
}

function PlaceCard({ id }) {
  const { student, user, sel, go, setPlace, places } = useApp();
  const place = places[id];
  const uni = student && place.uni === user.uni;
  return (
    <button type="button" className={`hc${sel === id ? " sel" : ""}${uni ? " uni" : ""}`} onClick={() => go("place", id)}>
      <span className={`ico ${uni ? "violet" : "green"}`}><Icon n="plus" /></span>
      <span className="t">
        <b>{place.name}</b>
        <small>{place.dist} km away, {place.drive} min drive</small>
        <span className="badges">
          {uni ? <em className="bd vio"><Icon n="cap" c="s" />Your university</em> : null}
          {place.conn ? <em className="bd ok"><Icon n="amb" c="s" />Ambulance available</em> : <em className="bd warn">Call and route only</em>}
        </span>
      </span>
      <Icon n="chevR" c="chev" />
    </button>
  );
}

function Places() {
  const { filter, setFilter, sel, setSel, setPlace, student, user, openSheet, places, fix, askFix } = useApp();
  const ids = placeIds(places, filter, student, user.uni);
  useEffect(() => {
    askFix(true);
  }, []);
  return (
    <Screen tabs bare>
      <MapBoard
        className="map mapfull"
        style={{ flex: "none", height: 260 }}
        opts={{ pins: ids, sel, you: pinFrom(fix, YOU), home: 1 }}
        onPin={(id) => { setSel(id); setPlace(id); }}
      >
        <button type="button" className="sos-pill" onClick={() => openSheet("lines")}><Icon n="phone" c="s" />999 / 112</button>
      </MapBoard>
      <div className="panel fill" style={{ paddingBottom: 100 }}>
        <div className="grab" />
        <div className="sec"><h3>Places near you</h3><small>Nearest first</small></div>
        <div className="chips">
          {[["all", "All places"], ["amb", "With ambulance"], ["5", "Under 5 km"]].map(([id, label]) => (
            <button type="button" key={id} className={`chip${filter === id ? " on" : ""}`} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        {ids.length ? ids.map((id) => <PlaceCard key={id} id={id} />) : (
          <>
            <Note tone="gold">No places match this filter.</Note>
            <Btn tone="out sm" onClick={() => setFilter("all")}>Show all places</Btn>
          </>
        )}
        <Note>Connected places can send an ambulance. Listed places can be called and routed to only.</Note>
      </div>
    </Screen>
  );
}

function GpsNote() {
  const { fix } = useApp();
  if (fix?.status === "ready") {
    return <Note icon="pin">Location shared. Accurate to about {fix.accuracy} m. The desk sees this pin.</Note>;
  }
  if (fix?.status === "denied" || fix?.status === "failed") {
    return <Note tone="gold" icon="pin">This browser did not share a location. Use saved home, or write the place. A phone opened as 192.168 cannot share GPS. Use localhost.</Note>;
  }
  return <Note icon="pin">Asking this browser for its location.</Note>;
}

function Report() {
  const { report, setReport, user, setPath, go, setMode, setPlace, student, askFix } = useApp();
  useEffect(() => {
    if (report.where === "gps") askFix();
  }, [report.where]);
  return (
    <Screen>
      <PartnerBar title="Medical emergency" sub="Four quick questions" />
      <div className="body report-mid">
        <Hdr title="Medical emergency" sub="Four quick questions" sos />
        <div className="form-side">
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="lbl">1. What is happening?</div>
          <div className="chips">
            {WHAT.map((item) => (
              <button type="button" key={item} className={`chip${report.what === item ? " on" : ""}`} onClick={() => setReport({ ...report, what: item })}>
                {report.what === item ? <Icon n="check" c="s" /> : null}{item}
              </button>
            ))}
          </div>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="lbl">2. Is the person awake?</div>
          <div className="seg c3">
            {["Yes", "No", "Not sure"].map((item) => (
              <button type="button" key={item} className={report.awake === item ? "on" : ""} onClick={() => setReport({ ...report, awake: item })}>{item}</button>
            ))}
          </div>
          {report.awake === "No" ? <Note tone="red" icon="alert">We recommend an ambulance. If you can, also call 999 or 112 now.</Note> : null}
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="lbl">3. Who needs help?</div>
          <div className="seg c2">
            {[["me", "Me"], ["other", "Someone with me"]].map(([id, label]) => (
              <button type="button" key={id} className={report.who === id ? "on" : ""} onClick={() => setReport({ ...report, who: id })}>{label}</button>
            ))}
          </div>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="lbl">4. Where are you?</div>
          <div className="seg c3">
            {[["gps", "Live GPS"], ["home", "Saved home"], ["written", "Write it"]].map(([id, label]) => (
              <button type="button" key={id} className={report.where === id ? "on" : ""} onClick={() => setReport({ ...report, where: id })}>{label}</button>
            ))}
          </div>
          {report.where === "gps" ? <GpsNote /> : null}
          {report.where === "home" ? <Note tone="gold" icon="home">{user.home.text} (your saved pin).</Note> : null}
          {report.where === "written" ? (
            <>
              <Inp icon="home" value={report.building} placeholder="Building or hall" onChange={(value) => setPath("report.building", value)} />
              <Inp value={report.room} placeholder="Room or floor" onChange={(value) => setPath("report.room", value)} />
              <Inp icon="pin" value={report.landmark} placeholder="Nearby landmark" onChange={(value) => setPath("report.landmark", value)} />
            </>
          ) : null}
        </div>
        </div>
      </div>
      <div className="foot">
        <Btn onClick={() => {
          setReport({ ...report, done: true });
          setMode(student ? "uni" : "nearest");
          setPlace("mak");
          go("help");
        }}>Continue to help options</Btn>
      </div>
    </Screen>
  );
}

function Help() {
  const { student, user, report, mode, setMode, place, setPlace, setSel, filter, setFilter, go, showToast, setReport, beginCase, clearCase, places, fix } = useApp();
  const active = !student && mode === "uni" ? "nearest" : mode;
  const selected = places[place] || places.mak;
  const ids = placeIds(places, filter, student, user.uni);
  return (
    <Screen>
      <div className="body with-map">
        <MapBoard
          className="map side-map"
          style={{ height: 150, borderRadius: 20, flex: "none" }}
          opts={{ pins: placeIds(places, "all", student, user.uni), sel: place, you: pinFrom(fix, YOU) }}
          onPin={(id) => { setPlace(id); setSel(id); }}
        />
        <div className="form-main">
        <Hdr title="Get help" sub="Choose how" />
        <div className="row">
          <span className="pill green"><Icon n="heart" c="s" />{report.what}</span>
          <span className="pill gold">{report.who === "me" ? "For me" : "For someone with me"}</span>
        </div>
        <div className={`modes ${student ? "c3" : "c2"}`}>
          {student ? (
            <button type="button" className={`mode uni${active === "uni" ? " on" : ""}`} onClick={() => setMode("uni")}>
              <span className="ico violet" style={{ width: 28, height: 28, borderRadius: 10 }}><Icon n="cap" c="s" /></span>
              My university hospital<small>Listed first</small>
            </button>
          ) : null}
          <button type="button" className={`mode${active === "nearest" ? " on" : ""}`} onClick={() => setMode("nearest")}>
            <span className="ico green" style={{ width: 28, height: 28, borderRadius: 10 }}><Icon n="pin" c="s" /></span>
            Nearest place<small>Nearest first</small>
          </button>
          <button type="button" className={`mode${active === "self" ? " on" : ""}`} onClick={() => setMode("self")}>
            <span className="ico green" style={{ width: 28, height: 28, borderRadius: 10 }}><Icon n="route" c="s" /></span>
            Go there myself<small>Route and time</small>
          </button>
        </div>
        {active === "uni" ? (
          <>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12, borderColor: "var(--violet)" }}>
              <div className="row">
                <span className="ico violet"><Icon n="cap" /></span>
                <div className="grow">
                  <b style={{ fontSize: 16 }}>{places.mak.name}</b>
                  <div className="fine" style={{ textAlign: "left" }}>{places.mak.dist} km away, ambulance about {places.mak.amb} min</div>
                </div>
                <em className="bd ok">Connected</em>
              </div>
              <Btn onClick={async () => {
                setPlace("mak");
                const ok = await beginCase({ kind: "medical", path: "ambulance", place: "mak" });
                if (!ok) return;
                setReport({ ...report, done: true });
                go("ambulance");
              }}><Icon n="amb" />Send an ambulance</Btn>
              <Btn tone="out sm" onClick={() => { setPlace("mak"); clearCase(); showToast("The desk knows you are on your way"); go("route"); }}>Tell the desk I am on my way</Btn>
            </div>
            <Note tone="violet">This is a shortcut, not a lock. Pick Nearest place for any other hospital. Your student details go with the request.</Note>
          </>
        ) : null}
        {active === "nearest" ? (
          <>
            <div className="sec"><h3>Places, nearest first</h3></div>
            <div className="chips">
              {[["all", "All places"], ["amb", "With ambulance"], ["5", "Under 5 km"]].map(([id, label]) => (
                <button type="button" key={id} className={`chip${filter === id ? " on" : ""}`} onClick={() => setFilter(id)}>{label}</button>
              ))}
            </div>
            {ids.map((id) => <PlaceCard key={id} id={id} />)}
          </>
        ) : null}
        {active === "self" ? (
          <>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="row">
                <span className="ico green"><Icon n="route" /></span>
                <div className="grow">
                  <b style={{ fontSize: 16 }}>{selected.name}</b>
                  <div className="fine" style={{ textAlign: "left" }}>{selected.dist} km, about {selected.drive} min by car</div>
                </div>
                {selected.conn ? <em className="bd ok">Connected</em> : <em className="bd warn">Listed</em>}
              </div>
              <Btn onClick={() => { clearCase(); go("route"); }}><Icon n="nav" />Start route</Btn>
              <button type="button" className="link" onClick={() => setMode("nearest")}>Choose a different place</button>
            </div>
            <Note tone={selected.conn ? "" : "gold"} icon={selected.conn ? "shield" : "info"}>
              {selected.conn ? `Starting the route tells ${selected.short} you are coming.` : "This place is listed only. Call ahead. AfriResQ cannot dispatch from here."}
            </Note>
          </>
        ) : null}
        </div>
      </div>
    </Screen>
  );
}

function Place() {
  const { place, student, user, back, openSheet, showToast, go, report, setReport, beginCase, clearCase, places, fix } = useApp();
  const item = places[place];
  const uni = student && item.uni === user.uni;
  return (
    <Screen bare>
      <MapBoard className="map" style={{ height: 230, flex: "none" }} opts={{ route: ROUTES[place], pins: [place], sel: place, you: pinFrom(fix, YOU) }}>
        <button type="button" className="back" onClick={back} aria-label="Back"><Icon n="chevL" /></button>
        <button type="button" className="sos-pill" onClick={() => openSheet("lines")}><Icon n="phone" c="s" />999 / 112</button>
      </MapBoard>
      <div className="panel fill">
        <div className="grab" />
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="grow">
            <h3 style={{ font: "800 21px/1.2 var(--font)", letterSpacing: "-.01em" }}>{item.name}</h3>
            <div className="fine" style={{ textAlign: "left", marginTop: 4 }}>{item.dist} km away, about {item.drive} min by car</div>
          </div>
        </div>
        <div className="badges">
          {uni ? <em className="bd vio"><Icon n="cap" c="s" />Your university</em> : null}
          {item.conn ? <em className="bd ok"><Icon n="shield" c="s" />Connected to AfriResQ</em> : <em className="bd warn">Listed only</em>}
        </div>
        {item.conn ? (
          <button type="button" className="opt a" onClick={async () => {
            if (!report.done) {
              showToast("Tell us what is happening first.");
              go("report");
              return;
            }
            const ok = await beginCase({ kind: "medical", path: "ambulance", place });
            if (!ok) return;
            go("ambulance");
          }}>
            <span className="rec">Recommended</span>
            <span className="ico"><Icon n="amb" c="l" /></span>
            <span style={{ flex: 1 }}><b>Send an ambulance</b><small>The hospital desk dispatches now. About {item.amb} min.</small></span>
            <Icon n="chevR" />
          </button>
        ) : (
          <div className="opt off">
            <span className="ico plain"><Icon n="amb" c="l" /></span>
            <span style={{ flex: 1 }}><b>No ambulance from here</b><small>This place is not connected to AfriResQ. We cannot dispatch from there. Call and follow the route.</small></span>
          </div>
        )}
        <button type="button" className="opt b" onClick={() => { clearCase(); setReport({ ...report, done: true }); go("route"); }}>
          <span className="ico green"><Icon n="nav" c="l" /></span>
          <span style={{ flex: 1 }}>
            <b>Go there myself</b>
            <small>Route, distance and time on the map.{item.conn ? " The hospital is told you are coming." : " Call ahead so they expect you."}</small>
          </span>
          <Icon n="chevR" c="chev" />
        </button>
        <Btn tone="out sm" onClick={() => showToast(`Calling ${item.name}...`)}><Icon n="phone" c="m" />Call {item.short}</Btn>
      </div>
    </Screen>
  );
}

function Route() {
  const { place, back, openSheet, showToast, go, beginCase, moveCase, places, fix } = useApp();
  const item = places[place];
  const route = ROUTES[place];
  const moveRef = useRef(moveCase);
  moveRef.current = moveCase;
  const [run, setRun] = useState(false);
  const [progress, setProgress] = useState(0);
  const steps = STEPS[place];
  const step = steps[Math.min(steps.length - 1, Math.floor(progress * steps.length))];
  const you = run ? pointAlong(route, progress) : pinFrom(fix, route?.[0] || YOU);
  useEffect(() => {
    if (!run) return undefined;
    const id = setInterval(() => {
      setProgress((value) => Math.min(1, value + 0.01));
    }, 100);
    return () => clearInterval(id);
  }, [run]);
  useEffect(() => {
    if (progress < 1 || !run) return undefined;
    const id = setTimeout(() => {
      moveRef.current({ state: "arrived" });
      go("closed");
    }, 900);
    return () => clearTimeout(id);
  }, [progress, run, go]);
  return (
    <Screen bare>
      <MapBoard className="map mapfull" opts={{ route, pins: [place], you, look: run ? "route" : "you" }}>
        <button type="button" className="back" onClick={back} aria-label="Back"><Icon n="chevL" /></button>
        <div className="turn">
          <span className="ti"><Icon n="turn" c="l" /></span>
          <span>
            <b>{run ? step[0] : "Route preview"}</b>
            <small>{run ? step[1] : "Tap Start when you are ready"}</small>
          </span>
        </div>
      </MapBoard>
      <div className="panel">
        <div className="grab" />
        <div className="row">
          <div className="grow">
            <div className="eta">{Math.max(0, Math.ceil(item.drive * (1 - progress)))}<small>min</small></div>
            <div className="fine" style={{ textAlign: "left" }}>{(item.dist * (1 - progress)).toFixed(1)} km to {item.short}</div>
          </div>
          <button type="button" className="sos-pill" onClick={() => openSheet("lines")}><Icon n="phone" c="s" />999 / 112</button>
        </div>
        <Note tone={item.conn ? "" : "gold"} icon={run && item.conn ? "check" : item.conn ? "shield" : "info"}>
          {run && item.conn ? `${item.short} has been told. They expect you in about ${item.drive} min.` : item.conn ? `When you start, ${item.short} is told you are on your way.` : "This place is listed only. Call ahead. AfriResQ cannot dispatch from here."}
        </Note>
        <div className="row">
          <Btn disabled={run} onClick={async () => {
            const ok = await beginCase({ kind: "medical", path: "route", place });
            if (!ok) return;
            setRun(true);
          }}>{run ? "Navigating..." : <><Icon n="nav" />Start</>}</Btn>
          <button type="button" className="callb" style={{ width: 54, height: 54, borderRadius: 16, background: "var(--surface)", color: "var(--green)", border: "1.5px solid var(--line)" }} aria-label="Call" onClick={() => showToast(`Calling ${item.name}...`)}>
            <Icon n="phone" />
          </button>
        </div>
        {item.conn ? (
          <button type="button" className="link" onClick={async () => {
            if (run) await moveRef.current({ state: "cancelled" });
            const ok = await beginCase({ kind: "medical", path: "ambulance", place });
            if (!ok) return;
            go("ambulance");
          }}>Prefer an ambulance? Send one instead</button>
        ) : <div className="fine">Ambulance is not available from this place.</div>}
      </div>
    </Screen>
  );
}

const CASE_COPY = [
  ["Sending your request", "The hospital desk is being alerted", "Request sent"],
  ["Crew accepted", "A crew is preparing to leave", "Accepted"],
  ["Ambulance on the way", "Stay where you are and keep your phone close", "On the way"],
  ["Ambulance has arrived", "The crew is with you", "Arrived"],
];
const CASE_STEPS = [
  ["Sent", "The desk has your report and location"],
  ["Accepted", "A crew has taken the case"],
  ["On the way", "The ambulance is moving"],
  ["Arrived", "The crew is with you"],
];

function Ambulance() {
  const { place, back, openSheet, kase, go, refreshCase, places, showToast, moveCase, clearCase, fix } = useApp();
  const refreshRef = useRef(refreshCase);
  const moveRef = useRef(moveCase);
  refreshRef.current = refreshCase;
  moveRef.current = moveCase;
  const item = places[place] || places.mak;
  const you = kase?.whereLat != null && kase?.whereLng != null ? [Number(kase.whereLat), Number(kase.whereLng)] : pinFrom(fix, YOU);
  const route = item?.ll ? [you, item.ll] : [...(ROUTES[place] || ROUTES.mak)].reverse();
  const stage = { sent: 0, accepted: 1, on_the_way: 2, arrived: 3, closed: 3 }[kase?.state] ?? 0;
  const crew = stage >= 1;
  useEffect(() => {
    let stop = false;
    const pull = async () => {
      const saved = await refreshRef.current();
      if (stop || saved?.state !== "arrived") return;
      go("closed");
    };
    pull();
    const id = setInterval(pull, 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [go]);
  useEffect(() => {
    if (!kase?.id || kase.where !== "gps") return undefined;
    if (["arrived", "closed", "cancelled"].includes(kase.state)) return undefined;
    return watchFix((point) => {
      moveRef.current({
        whereLat: point.lat,
        whereLng: point.lng,
        whereText: `Live location, about ${point.accuracy} m`,
      });
    });
  }, [kase?.id, kase?.where, kase?.state]);
  const amb = pointAlong(route, stage >= 2 ? 0.62 : 0.08);
  const declined = kase?.state === "declined";
  const copy = declined ? ["Request declined", `${item.name} could not take it`, "Declined"] : CASE_COPY[stage];
  return (
    <Screen bare>
      <MapBoard className="map mapfull" opts={{ route, pins: [place], you, amb, look: "route" }}>
        <button type="button" className="back" onClick={back} aria-label="Back"><Icon n="chevL" /></button>
        <span className="tagc"><Icon n="amb" c="s" />{copy[2]}</span>
      </MapBoard>
      <div className="panel">
        <div className="grab" />
        <div className="row">
          <div className="grow">
            <h3 style={{ font: "800 20px var(--font)", letterSpacing: "-.01em" }}>{copy[0]}</h3>
            <div className="fine" style={{ textAlign: "left" }}>{copy[1]}</div>
          </div>
          {declined ? null : <div className="eta">{stage >= 2 ? "…" : item.amb || "—"}<small>{stage >= 2 ? "" : "min"}</small></div>}
        </div>
        {declined ? (
          <DeclinedPanel
            where={item.name}
            reason={kase.declineReason}
            onOther={() => { clearCase(); go("help"); }}
            onCall={() => openSheet("lines")}
          />
        ) : null}
        {declined ? null : <div className="tl">
          {CASE_STEPS.map(([title, detail], index) => (
            <div key={title} className={`st${index < stage || stage === 3 ? " done" : ""}${index === stage && stage < 3 ? " now" : ""}`}>
              <i><Icon n="check" c="s" /></i>
              <div><b>{title}</b><small>{detail}</small></div>
            </div>
          ))}
        </div>}
        {crew && !declined ? (
          <div className="crew">
            <span className="ico green"><Icon n="amb" /></span>
            <span><b style={{ display: "block", fontSize: 15 }}>{item.name}</b><small style={{ color: "var(--ink2)", fontWeight: 500 }}>Their team has your request</small></span>
            {item.phone ? <a className="callb" aria-label={`Call ${item.name}`} href={`tel:${String(item.phone).replace(/\s/g, "")}`}><Icon n="phone" /></a> : null}
          </div>
        ) : null}
        <div className="row" style={{ gap: 10, display: declined ? "none" : undefined }}>
          <Btn tone="out sm" onClick={() => showToast(kase?.where === "gps" ? "Your phone is sharing this location with the desk." : "This case used a saved or written place.")}><Icon n="share" c="m" />Live location</Btn>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          {declined ? <span /> : <button type="button" className="link red" onClick={() => openSheet("cancel")}>Cancel request</button>}
          <button type="button" className="sos-pill lap-quiet" onClick={() => openSheet("lines")}><Icon n="phone" c="s" />999 / 112</button>
        </div>
      </div>
    </Screen>
  );
}

function Closed() {
  const { kase, place, report, rating, setRating, setReport, go, showToast, otherType, moveCase, clearCase, places } = useApp();
  const item = places[place];
  const current = kase || { id: "AR-2041", type: report.what, path: "ambulance", kind: "medical" };
  const amb = current.path === "ambulance";
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sceneKind = current.kind === "other" ? (current.otherType || otherType) : amb ? "medical" : "walk";
  const scene = SCENES[sceneKind] || SCENES.medical;
  const arrived = [
    ["check", current.kind === "other" ? "Handled" : "Arrived", amb ? "The crew is with you" : "The case is closed"],
    ["lock", "Sharing stopped", "Location and medical card"],
    ["star", "The response", "Tell us how it went"],
  ];
  return (
    <Screen>
      <div className="body arrive" style={{ justifyContent: "center" }}>
        <aside className="scene">
          <div className="scene-art">
            <img src={scene[1]} alt="" />
            <p className="scene-line">{current.kind === "other" ? "Case\nhandled" : amb ? "The crew\nis with you" : "You have\narrived"}</p>
          </div>
          <div className="scene-points">
            {arrived.map(([icon, label, detail]) => (
              <div key={label}>
                <Icon n={icon} />
                <b>{label}</b>
                <small>{detail}</small>
              </div>
            ))}
          </div>
        </aside>
        <div className="arrive-main">
        <div className="success"><Icon n="check" c="xl" /></div>
        <h1 className="h1 arrive-copy">{current.kind === "other" ? "Case handled" : amb ? "The ambulance has arrived" : "You have arrived"}</h1>
        <p className="sub arrive-copy">{amb ? "The crew is with you now." : "The case is closed. Take care."}</p>
        <div className="card" style={{ padding: "6px 16px" }}>
          <div className="kv"><span>Case</span><b>{current.id}</b></div>
          <div className="kv"><span>Type</span><b>{current.type}</b></div>
          <div className="kv"><span>Place</span><b>{current.kind === "other" ? DESKS[current.otherType || otherType][0] : item.name}</b></div>
          <div className="kv"><span>Path</span><b>{amb ? "Ambulance" : current.path === "desk" ? "Desk" : "Went myself"}</b></div>
          <div className="kv"><span>Closed at</span><b>{time}</b></div>
        </div>
        <Note icon="lock">Live location and medical card sharing stopped. Your profile and home pin stay saved.</Note>
        <div className="lbl arrive-copy">How was the response?</div>
        <div className="stars">
          {[1, 2, 3, 4, 5].map((star) => (
            <button type="button" key={star} className={rating >= star ? "on" : ""} aria-label={`${star} stars`} onClick={() => setRating(star)}>
              <Icon n="star" c="l" />
            </button>
          ))}
        </div>
        </div>
      </div>
      <div className="foot">
        <Btn onClick={async () => {
          if (kase?.id) await moveCase({ state: "closed", rating: rating || null });
          clearCase();
          setReport({ ...report, done: false });
          setRating(0);
          showToast("Thank you. Sharing has stopped.");
          go("home", null, true);
        }}>Done</Btn>
      </div>
    </Screen>
  );
}

function Other() {
  const { otherType, otherText, setOtherText, report, setReport, setPath, beginCase, go, askFix } = useApp();
  useEffect(() => {
    if (report.where === "gps") askFix();
  }, [report.where]);
  const type = OTHER.find((item) => item[0] === otherType);
  const desk = DESKS[otherType];
  return (
    <Screen>
      <div className="body">
        <PageArt kind={otherType} title={type[1]} sub="Goes to its own desk" sos />
        <div className="form-side">
        <Note tone={desk[1] ? "" : "gold"}>
          This does not open the medical ambulance. It goes to: <b>{desk[0]}</b>
          {desk[1] ? "." : ", which is not connected in your area yet. Your case is still saved."}
        </Note>
        <Field label="What happened?">
          <textarea className="area" placeholder="Describe it in a sentence or two" value={otherText} onChange={(event) => setOtherText(event.target.value)} />
        </Field>
        <Field label="Who needs help?">
          <div className="seg c2">
            {[["me", "Me"], ["other", "Someone with me"]].map(([id, label]) => (
              <button type="button" key={id} className={report.who === id ? "on" : ""} onClick={() => setReport({ ...report, who: id })}>{label}</button>
            ))}
          </div>
        </Field>
        <Field label="Where are you?">
          <div className="seg c3">
            {[["gps", "Live GPS"], ["home", "Saved home"], ["written", "Write it"]].map(([id, label]) => (
              <button type="button" key={id} className={report.where === id ? "on" : ""} onClick={() => setReport({ ...report, where: id })}>{label}</button>
            ))}
          </div>
          {report.where === "gps" ? <GpsNote /> : null}
          {report.where === "written" ? <Inp icon="pin" value={report.landmark} placeholder="Building, room, landmark" onChange={(value) => setPath("report.landmark", value)} /> : null}
        </Field>
        {otherType === "missing" ? (
          <Note tone="violet" icon="radio">If the missing person uses AfriResQ, their last known location can be released through a Safety Net alert. See the Safety tab.</Note>
        ) : null}
        </div>
      </div>
      <div className="foot">
        <Btn onClick={async () => {
          const ok = await beginCase({
            kind: "other",
            path: "desk",
            place: POLICE.includes(otherType) ? "mps" : "",
            what: type[1],
            otherType,
            desk: desk[0],
            detail: otherText,
            state: "sent",
          });
          if (!ok) return;
          go("desk");
        }}>Send to desk</Btn>
      </div>
    </Screen>
  );
}

function Desk() {
  const { otherType, kase, user, go, setReport, moveCase, refreshCase, showToast, clearCase, openSheet } = useApp();
  const type = OTHER.find((item) => item[0] === otherType);
  const desk = DESKS[otherType];
  const connected = desk[1];
  const current = kase || { id: "AR-3010", state: "sent" };
  const refreshRef = useRef(refreshCase);
  refreshRef.current = refreshCase;
  const rank = { sent: 0, accepted: 1, on_the_way: 2, arrived: 3, closed: 4 };
  const now = rank[current.state] ?? 0;
  useEffect(() => {
    if (!connected || !kase?.id) return undefined;
    let stop = false;
    const pull = async () => {
      const saved = await refreshRef.current();
      if (!stop && saved?.state === "arrived") go("closed");
    };
    const id = setInterval(pull, 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [connected, kase?.id, go]);
  return (
    <Screen>
      <div className="body">
        <PageArt
          kind={otherType}
          title={`Case ${current.id}`}
          sub={type[1]}
          sos
          line={connected ? "They have\nyour case" : "Your case\nis saved"}
          points={[
            ["check", "Sent", "Report and location saved"],
            ["phone", "The next call", "Your profile number"],
            ["map", "A nearby place", "If you need a route"],
          ]}
        />
        <div className="form-side">
        {current.state === "declined" ? (
          <DeclinedPanel
            where={current.desk || desk[0]}
            reason={current.declineReason}
            onOther={() => { clearCase(); go("home", null, true); }}
            onCall={() => openSheet("lines")}
          />
        ) : null}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row">
            <span className={`ico ${connected ? "green" : "gold"}`}><Icon n={type[2]} /></span>
            <div className="grow">
              <b style={{ fontSize: 16 }}>{desk[0]}</b>
              <div className="fine" style={{ textAlign: "left" }}>{connected ? "Connected" : "Not connected in your area yet"}</div>
            </div>
          </div>
          <div className="tl">
            {[
              ["Sent", "Your report and location are saved"],
              ["Accepted", connected ? "Waiting for the desk to accept" : "Waiting for a desk to be connected"],
              ["On the way", "Help is moving"],
              ["Arrived", "They are with you"],
            ].map(([title, detail], index) => (
              <div key={title} className={`st${index < now ? " done" : ""}${index === now && current.state !== "closed" ? " now" : ""}`}>
                <i><Icon n="check" c="s" /></i>
                <div><b>{title}</b><small>{index === 1 && now > 1 ? "The desk has taken the case" : detail}</small></div>
              </div>
            ))}
          </div>
        </div>
        {connected ? <Note icon="phone">The desk calls the number on your profile: +256 {user.phone}.</Note> : <Note tone="red" icon="alert">Nobody can accept this report yet. Call 999 or 112 now. Your case stays saved with your location.</Note>}
        <div className="row" style={{ gap: 10 }}>
          <a className="btn red sm" href="tel:999"><Icon n="phone" c="m" />Call 999</a>
          <a className="btn red sm" href="tel:112"><Icon n="phone" c="m" />Call 112</a>
        </div>
        <Btn tone="out" onClick={() => go("places", null, true)}><Icon n="map" c="m" />Show route to a nearby place</Btn>
        <Btn tone="out" onClick={() => { setReport((currentReport) => ({ ...currentReport, done: false })); go("report"); }}><Icon n="heart" c="m" />Also need medical help?</Btn>
        {connected ? null : <button type="button" className="link" onClick={async () => { await moveCase({ state: "closed" }); go("closed"); }}>Mark as handled and close</button>}
        </div>
      </div>
    </Screen>
  );
}

const WAIT_MINS = [5, 15, 30, 60];

function waitText(mins) {
  return mins === 60 ? "1 hour" : `${mins} minutes`;
}

function SafetyHome() {
  const { safety, setSafety, keepSafety, user, openSheet, go, fix } = useApp();
  const on = safety.mode !== "off";
  const ago = ["just now", "1 min ago", "2 min ago", "3 min ago"][safety.pings % 4];
  const wait = WAIT_MINS.includes(Number(safety.wait)) ? Number(safety.wait) : 30;
  const options = [
    ["always", "Always on (recommended)", "Saves a location every 15 minutes and the last place before the phone dies."],
    ["trips", "Only trips and cases", "Shares during Walk me home and open cases."],
    ["off", "Off", "Nothing is saved."],
  ];
  const steps = [
    ['Someone says "I cannot reach them"', "A trusted person or the campus desk starts the alert."],
    ["We ask you first", `Your phone asks "Are you okay?" and waits ${waitText(wait)}.`],
    ["No answer: your last location is shared", "Trail, time and battery go to your next of kin and the security desk."],
    ["Alert ends when you answer", "Sharing stops and the alert is logged."],
  ];
  return (
    <Screen tabs>
      <div className="body safe-desk">
        <div className="page-bar">
        <div className="hdr">
          <div className="grow"><h2>Safety Net</h2><small>Your last known location, kept safe</small></div>
          <button type="button" className="sos-pill lap-quiet" onClick={() => openSheet("lines")}><Icon n="phone" c="s" />999 / 112</button>
        </div>
        </div>
        <div className="safe-grid">
        <div className="safe-card">
        <div className="safe">
          <span className="live">{on ? <><i />Saving location</> : "Paused"}</span>
          <h3>{on ? "You are covered" : "Safety Net is off"}</h3>
          <div className="sm">{on ? <>Last location saved <b>{ago}</b>. Battery 86%. If you go missing, the people you trust can ask AfriResQ to find where you were last.</> : "Turn it on so help can find you faster if you ever go missing."}</div>
        </div>
        </div>
        <div className="safe-map">
        <MapBoard style={{ height: 170, borderRadius: 20, flex: "none" }} opts={{ trail: on ? TRAIL : null, you: pinFrom(fix, YOU), home: 1 }} />
        </div>
        <div className="safe-rest">
        <div className="seg3">
          <button type="button" className="tile" onClick={() => go("walk")}><span className="ico green"><Icon n="route" /></span>Walk me home<small>Share a trip with a trusted person</small></button>
          <button type="button" className="tile" onClick={() => openSheet("checkin")}><span className="ico gold"><Icon n="clock" /></span>Check-in<small>Ask me "are you okay?"</small></button>
          <button type="button" className="tile" onClick={() => go("alert")}><span className="ico violet"><Icon n="users" /></span>Alert preview<small>What a trusted person sees</small></button>
        </div>
        <div className="sec"><h3>When to save your location</h3></div>
        {options.map(([id, title, detail]) => (
          <button type="button" key={id} className={`radio${safety.mode === id ? " on" : ""}`} onClick={() => setSafety({ ...safety, mode: id })}>
            <span className="rd">{safety.mode === id ? <Icon n="check" c="s" /> : null}</span>
            <span><b>{title}</b><small>{detail}</small></span>
          </button>
        ))}
        <div className="card row">
          <span className="ico red"><Icon n="users" /></span>
          <div className="grow"><b>{user.kin.name} can start an alert</b><div className="fine" style={{ textAlign: "left", marginTop: 2 }}>Next of kin, {user.kin.rel}</div></div>
          <button type="button" className="switch" role="switch" aria-checked={safety.kin} aria-label="Next of kin alerts" onClick={() => setSafety({ ...safety, kin: !safety.kin })} />
        </div>
        <div className="card">
          <b style={{ fontSize: 15 }}>How a missing-person alert works</b>
          <div className="tl" style={{ marginTop: 12 }}>
            {steps.map(([title, detail], index) => (
              <div className="st done" key={title}>
                <i>{index + 1}</i>
                <div>
                  <b style={{ color: "var(--ink)" }}>{title}</b>
                  <small>{detail}</small>
                  {index === 1 ? (
                    <div className="chips" style={{ marginTop: 8 }}>
                      {WAIT_MINS.map((mins) => (
                        <button type="button" key={mins} className={`chip${wait === mins ? " on" : ""}`} onClick={() => keepSafety({ ...safety, wait: mins })}>
                          {mins === 60 ? "1 hour" : `${mins} min`}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
        <Note icon="lock">Nobody can browse your location. It is kept 72 hours, then deleted, and opens only through an alert.</Note>
        </div>
        </div>
      </div>
    </Screen>
  );
}

function Walk() {
  const { user, trip, setTrip, go, showToast, openSheet } = useApp();
  const [left, setLeft] = useState(trip.mins);
  useEffect(() => {
    if (!trip.running) return undefined;
    const id = setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          setTrip({ ...trip, running: false });
          openSheet("tripAlert");
          return 0;
        }
        return value - 1;
      });
    }, 4000);
    return () => clearInterval(id);
  }, [trip.running]);
  return (
    <Screen>
      <div className="body">
        <PageArt kind="walk" title="Walk me home" sub="Share a trip" sos />
        <div className="form-side">
        {trip.running ? (
          <>
            <div className="safe">
              <span className="live"><i />Trip in progress</span>
              <h3>{firstName(user.name)}, you are on your way</h3>
              <div className="sm">{user.kin.name} and the campus desk can see this trip. If you do not arrive in time, they are alerted with your last location.</div>
            </div>
            <div className="card" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="lbl">Time left</div>
              <div className="countdown">{left}:00</div>
            </div>
            <Btn onClick={() => { setTrip({ ...trip, running: false }); showToast("Trip ended. Sharing stopped."); go("safetyHome", null, true); }}><Icon n="check" />I am safe, end trip</Btn>
          </>
        ) : (
          <>
            <p className="sub">Tell us where you are going and how long it should take. A trusted person follows along until you arrive.</p>
            <Field label="Going to">
              <div className="chips">
                <button type="button" className="chip on"><Icon n="home" c="s" />Home pin</button>
                <button type="button" className="chip">{user.hall}</button>
              </div>
            </Field>
            <Field label="It should take">
              <div className="chips">
                {[10, 20, 30, 45].map((mins) => (
                  <button type="button" key={mins} className={`chip${trip.mins === mins ? " on" : ""}`} onClick={() => setTrip({ ...trip, mins })}>{mins} min</button>
                ))}
              </div>
            </Field>
            <div className="card row">
              <span className="ico red"><Icon n="users" /></span>
              <div className="grow"><b>{user.kin.name}</b><div className="fine" style={{ textAlign: "left" }}>Follows your trip</div></div>
              <Icon n="check" c="m" />
            </div>
            <Note icon="lock">Sharing ends when you arrive or tap "I am safe".</Note>
          </>
        )}
        </div>
      </div>
      {trip.running ? null : (
        <div className="foot">
          <Btn onClick={() => { setLeft(trip.mins); setTrip({ ...trip, running: true, left: trip.mins }); }}><Icon n="route" />Start trip</Btn>
        </div>
      )}
    </Screen>
  );
}

function AlertView() {
  const { back, user, showToast, openSheet, fix } = useApp();
  return (
    <Screen bare>
      <MapBoard className="map" style={{ height: 260, flex: "none" }} opts={{ trail: TRAIL, you: pinFrom(fix, YOU), home: 1 }}>
        <button type="button" className="back" onClick={back} aria-label="Back"><Icon n="chevL" /></button>
        <span className="tagc"><Icon n="alert" c="s" />Alert open</span>
      </MapBoard>
      <div className="panel fill">
        <div className="grab" />
        <Note tone="violet" icon="users">This is what a trusted person sees. You would only see this screen if you were the one searching.</Note>
        <h3 style={{ font: "800 21px var(--font)", letterSpacing: "-.01em" }}>{firstName(user.name)} has not answered for 30 minutes</h3>
        <div className="card" style={{ padding: "6px 16px" }}>
          <div className="kv"><span>Last known place</span><b>Makerere Hill Rd</b></div>
          <div className="kv"><span>Last ping</span><b>14:12, 32 min ago</b></div>
          <div className="kv"><span>Battery then</span><b>12%, then phone off</b></div>
          <div className="kv"><span>Moving?</span><b>Yes, towards the north gate</b></div>
        </div>
        <Btn onClick={() => showToast(`Calling ${firstName(user.name)}...`)}><Icon n="phone" />Call {firstName(user.name)}</Btn>
        <Btn tone="out" onClick={() => showToast("Trail sent to the campus security desk")}><Icon n="share" c="m" />Send the trail to campus security</Btn>
        <Btn tone="out sm" onClick={() => openSheet("lines")}><Icon n="phone" c="m" />Call 999</Btn>
      </div>
    </Screen>
  );
}

function Account() {
  const { user, student, safety, theme, setTheme, go, openSheet, signOut } = useApp();
  const photoInput = useRef(null);
  const photo = useProfilePhoto();
  const rows = [
    ["drop", "red", "Medical card", `${user.med.blood}, ${user.med.share ? "shared during an open case" : "sharing off"}`, () => openSheet("med")],
    ["users", "gold", "Next of kin", `${user.kin.name}, ${user.kin.rel}`, () => openSheet("kin")],
    ["home", "gold", "Home location", user.home.text, () => go("profile2")],
    ["radio", "green", "Safety Net", safety.mode === "always" ? "Always on" : safety.mode === "trips" ? "Trips and cases only" : "Off", () => go("safetyHome", null, true)],
    ["globe", "plain", "Language", user.lang, () => openSheet("lang")],
    ["lock", "plain", "Password", user.hasPassword ? "Set. Change it any time" : "Not set. Add one to skip the code", () => openSheet("password")],
  ];
  function choosePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 320;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const side = Math.min(image.width, image.height);
        canvas.getContext("2d").drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
        saveProfilePhoto(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  }
  return (
    <Screen tabs>
      <div className="body account">
        <div className="page-bar">
        <div className="profile-top">
          <div className="profile-photo">
            <button type="button" className="profile-circle" aria-label={photo ? "Change profile photo" : "Add a profile photo"} onClick={() => photoInput.current?.click()}>
              {photo ? <img src={photo} alt="" /> : <Icon n="user" />}
            </button>
            Profile
            {photo ? <button type="button" className="link profile-remove" onClick={() => saveProfilePhoto("")}>Remove photo</button> : null}
          </div>
          <input ref={photoInput} type="file" accept="image/*" hidden onChange={choosePhoto} />
          <div className="scard">
            <span className="pill" style={{ background: "rgba(255,255,255,.2)", color: "#fff" }}>
              <Icon n={student ? "cap" : "user"} c="s" />{student ? "Verified student" : "Citizen"}
            </span>
            <div className="nm">{user.name}</div>
            <small>{student ? `${user.uni || "Makerere University"}, student no. ${user.studentNo}` : "Phone confirmed by SMS"}</small>
          </div>
        </div>
        </div>
        <div className="card list" style={{ padding: "4px 14px" }}>
          {rows.map(([icon, tone, title, sub, action]) => (
            <button type="button" className="rw" key={title} onClick={action}>
              <span className={`ico ${tone}`}><Icon n={icon} /></span>
              <span className="t"><b>{title}</b><small>{sub}</small></span>
              <Icon n="chevR" c="chev" />
            </button>
          ))}
        </div>
        <div className="card appear">
          <div className="row">
            <span className="ico plain"><Icon n="moon" /></span>
            <div className="grow">
              <b>Appearance</b>
              <small>{theme === "dark" ? "Dark" : theme === "auto" ? "Matches this device" : "Light"}</small>
            </div>
          </div>
          <div className="appear-set" role="radiogroup" aria-label="Appearance">
            {[["light", "Light"], ["dark", "Dark"], ["auto", "Auto"]].map(([id, label]) => (
              <button type="button" key={id} role="radio" aria-checked={theme === id} className={theme === id ? "on" : ""} onClick={() => setTheme(id)}>{label}</button>
            ))}
          </div>
        </div>
        <button type="button" className="pcard" onClick={() => go("welcomeBack", null, true)}>
          <span className="ico plain"><Icon n="lock" /></span>
          <span className="t"><b>Lock AfriResQ</b><small>Fingerprint to open it again</small></span>
          <Icon n="chevR" c="chev" />
        </button>
        <button type="button" className="pcard" onClick={signOut}>
          <span className="ico red"><Icon n="logout" /></span>
          <span className="t"><b>Sign out</b><small>Leave this account on this device</small></span>
          <Icon n="chevR" c="chev" />
        </button>
      </div>
    </Screen>
  );
}

const screens = {
  welcome: Welcome,
  partnerJoin: PartnerJoin,
  who: Who,
  phone: Phone,
  universities: Universities,
  email: Email,
  code: Code,
  profile1: Profile1,
  profile2: Profile2,
  profile3: Profile3,
  safety: Consent,
  signin: SignIn,
  welcomeBack: WelcomeBack,
  home: Home,
  places: Places,
  report: Report,
  help: Help,
  place: Place,
  route: Route,
  ambulance: Ambulance,
  closed: Closed,
  other: Other,
  desk: Desk,
  partnerGate: PartnerGate,
  partnerSignin: PartnerSignIn,
  partnerQueue: PartnerQueue,
  partnerCase: PartnerCase,
  partnerLogin: PartnerLogin,
  partnerHome: PartnerHome,
  safetyHome: SafetyHome,
  walk: Walk,
  alert: AlertView,
  account: Account,
};

export function CurrentScreen() {
  const { screen } = useApp();
  const View = screens[screen] || Welcome;
  return <View />;
}

export function TabBar() {
  const { screen, go } = useApp();
  const items = [
    ["home", "Home", "home"],
    ["places", "Places", "map"],
    ["safetyHome", "Safety", "radio"],
    ["account", "Profile", "user"],
  ];
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tab-brand">
        <span className="mark"><Icon n="logo" c="m" /></span>
        AfriResQ
      </div>
      {items.map(([id, label, icon]) => (
        <button type="button" key={id} className={`tab${screen === id ? " on" : ""}`} onClick={() => go(id, null, true)}>
          <Icon n={icon} />
          {label}
        </button>
      ))}
    </nav>
  );
}

export function EdgeLine() {
  const { openSheet } = useApp();
  return (
    <button type="button" className="edge-line" onClick={() => openSheet("lines")}>
      <Icon n="phone" c="s" />
      <span>999 / 112</span>
    </button>
  );
}

export function Toast() {
  const { toast } = useApp();
  return <div className={`toast${toast ? " show" : ""}`} role="status">{toast}</div>;
}

function passwordProblem(value, again) {
  if (value.length < PASSWORD_MIN) return `Choose a password of at least ${PASSWORD_MIN} characters.`;
  if (value !== again) return "The two passwords do not match.";
  return "";
}

function PasswordSheet() {
  const { user, closeSheet, showToast, changePassword } = useApp();
  const [value, setValue] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  async function save() {
    const next = passwordProblem(value, again);
    setProblem(next);
    if (next) return;
    setSaving(true);
    const ok = await changePassword(value);
    setSaving(false);
    if (!ok) return;
    closeSheet();
    showToast("Password saved");
  }
  return (
    <>
      <h3>{user.hasPassword ? "Change password" : "Add a password"}</h3>
      <p className="sub">Sign in with your {user.type === "student" ? "student email or phone" : "phone number"} and this password, without waiting for a code.</p>
      <Field label="New password"><Inp icon="lock" type="password" autoComplete="new-password" value={value} placeholder={`At least ${PASSWORD_MIN} characters`} onChange={setValue} /></Field>
      <Field label="New password again" error={problem}><Inp icon="lock" type="password" autoComplete="new-password" value={again} onChange={setAgain} /></Field>
      <Btn disabled={saving} onClick={save}>{saving ? "Saving..." : "Save password"}</Btn>
    </>
  );
}

export function Sheets() {
  const app = useApp();
  const { sheet, closeSheet, showToast, user, setUser, go, kase, moveCase, clearCase } = app;
  if (!sheet) return <div className="backdrop" />;
  let body = null;
  if (sheet === "lines") {
    body = (
      <>
        <h3>National emergency lines</h3>
        <p className="sub">AfriResQ sits beside these lines. It does not replace them.</p>
        <a className="btn red" href="tel:999"><Icon n="phone" />Call 999</a>
        <a className="btn red" href="tel:112"><Icon n="phone" />Call 112</a>
      </>
    );
  }
  if (sheet === "notifs") {
    body = (
      <>
        <h3>Notifications</h3>
        <div className="card list" style={{ padding: "4px 14px" }}>
          <div className="rw"><span className="ico green"><Icon n="check" /></span><span className="t"><b>Profile saved</b><small>Your medical card is ready for an open case</small></span></div>
          <div className="rw"><span className="ico green"><Icon n="radio" /></span><span className="t"><b>Safety Net is on</b><small>Last location saved a minute ago</small></span></div>
          <div className="rw"><span className="ico violet"><Icon n="amb" /></span><span className="t"><b>Makerere University Hospital is connected</b><small>An ambulance can be sent</small></span></div>
        </div>
      </>
    );
  }
  if (sheet === "cancel") {
    body = (
      <>
        <h3>Cancel the ambulance?</h3>
        <p className="sub">The crew will stop. You can still go to the hospital yourself.</p>
        <Btn tone="out" onClick={closeSheet}>Keep the ambulance</Btn>
        <Btn tone="red" onClick={async () => {
          closeSheet();
          if (kase?.id) await moveCase({ state: "cancelled" });
          clearCase();
          showToast("Request cancelled. You can still go there yourself.");
          go("help");
        }}>Cancel the request</Btn>
      </>
    );
  }
  if (sheet === "checkin") {
    body = (
      <>
        <h3>Check-in</h3>
        <p className="sub">We ask "Are you okay?" at the time you choose. No answer sends an alert to your trusted person.</p>
        <div className="chips">
          {["In 30 min", "In 1 hour", "In 2 hours"].map((item) => (
            <button type="button" key={item} className="chip" onClick={() => { closeSheet(); showToast(`Check-in set: ${item.toLowerCase()}`); }}>{item}</button>
          ))}
        </div>
      </>
    );
  }
  if (sheet === "tripAlert") {
    body = (
      <>
        <div className="ico red" style={{ width: 56, height: 56, borderRadius: 18 }}><Icon n="alert" c="l" /></div>
        <h3>Alert sent</h3>
        <p className="sub">You did not arrive in time. {user.kin.name} and the campus security desk now have your last location and trail.</p>
        <Btn onClick={closeSheet}>OK</Btn>
      </>
    );
  }
  if (sheet === "med") {
    body = (
      <>
        <h3>Medical card</h3>
        <p className="sub">Sent only to the place handling an open case.</p>
        <Field label="Blood group">
          <div className="chips">
            {BLOOD.map((blood) => (
              <button type="button" key={blood} className={`chip${user.med.blood === blood ? " on" : ""}`} onClick={() => setUser({ ...user, med: { ...user.med, blood } })}>{blood}</button>
            ))}
          </div>
        </Field>
        <Field label="Allergies"><Inp value={user.med.allergies} onChange={(value) => setUser({ ...user, med: { ...user.med, allergies: value } })} /></Field>
        <Field label="Conditions"><Inp value={user.med.cond} onChange={(value) => setUser({ ...user, med: { ...user.med, cond: value } })} /></Field>
        <Field label="Medications"><Inp value={user.med.meds} onChange={(value) => setUser({ ...user, med: { ...user.med, meds: value } })} /></Field>
        <div className="row">
          <div className="grow"><b>Share during an open case</b></div>
          <button type="button" className="switch" role="switch" aria-checked={user.med.share} aria-label="Share medical card" onClick={() => setUser({ ...user, med: { ...user.med, share: !user.med.share } })} />
        </div>
        <Btn onClick={() => { closeSheet(); showToast("Saved"); }}>Save</Btn>
      </>
    );
  }
  if (sheet === "kin") {
    body = (
      <>
        <h3>Next of kin</h3>
        <Field label="Name"><Inp value={user.kin.name} onChange={(value) => setUser({ ...user, kin: { ...user.kin, name: value } })} /></Field>
        <Field label="Relationship">
          <div className="chips">
            {RELS.map((rel) => (
              <button type="button" key={rel} className={`chip${user.kin.rel === rel ? " on" : ""}`} onClick={() => setUser({ ...user, kin: { ...user.kin, rel } })}>{rel}</button>
            ))}
          </div>
        </Field>
        <Field label="Phone"><Inp pre="+256" value={user.kin.phone} onChange={(value) => setUser({ ...user, kin: { ...user.kin, phone: value.replace(/[^\d\s]/g, "") } })} /></Field>
        <Btn onClick={() => { closeSheet(); showToast("Saved"); }}>Save</Btn>
      </>
    );
  }
  if (sheet === "password") {
    body = <PasswordSheet />;
  }
  if (sheet === "lang") {
    body = (
      <>
        <h3>Language</h3>
        <p className="sub">Screens and phone calls.</p>
        {LANGS.map((lang) => (
          <button type="button" key={lang} className={`radio${user.lang === lang ? " on" : ""}`} onClick={() => { setUser({ ...user, lang }); closeSheet(); showToast(`Language set to ${lang}`); }}>
            <span className="rd">{user.lang === lang ? <Icon n="check" c="s" /> : null}</span>
            <span><b>{lang}</b></span>
          </button>
        ))}
      </>
    );
  }
  return (
    <div className="backdrop open" onClick={(event) => { if (event.target.classList.contains("backdrop")) closeSheet(); }}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        {body}
      </div>
    </div>
  );
}
