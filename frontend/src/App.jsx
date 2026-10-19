import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findPerson, isStudentEmail, loginWithPassword, requestOtp, savePerson, studentHost, verifyOtp } from "./account-api.js";
import { AppState } from "./app-state.js";
import { createCase, getCase, listMyCases, updateCase } from "./case-api.js";
import { readFix } from "./locate.js";
import { PLACES } from "./map.js";
import { listPlaces } from "./places-api.js";
import { Sprite } from "./ui.jsx";
import { CurrentScreen, EdgeLine, Sheets, TabBar, Toast } from "./screens.jsx";

const studentSeed = {
  type: "student",
  name: "Amina Kato",
  phone: "",
  email: "",
  uni: "Makerere University",
  studentNo: "2300712345",
  hall: "Lumumba Hall, room 214",
  kin: { name: "Grace Kato", rel: "Mother", phone: "701 000 010" },
  home: { text: "Makerere Hill Rd, Kampala", lat: 0.3224, lng: 32.5693 },
  med: { blood: "O+", allergies: "Penicillin", cond: "Asthma", meds: "Salbutamol inhaler", share: true },
  lang: "English",
};

function loadAccount() {
  try {
    const raw = localStorage.getItem("afriresq-account");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// The phone or email last used to sign in on this device, so the sign-in form opens filled in.
function loadLogin() {
  try {
    const raw = localStorage.getItem("afriresq-login");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function rememberLogin(user) {
  const tab = user.type === "student" ? "email" : "phone";
  try {
    localStorage.setItem("afriresq-login", JSON.stringify({ tab, phone: user.phone || "", email: user.email || "" }));
  } catch { /* the form starts empty next time */ }
}

const OPEN_SCREENS = new Set(["welcome", "signin", "welcomeBack", "partnerGate", "partnerLogin", "partnerHome", "home", "places", "safetyHome", "account"]);

function screenFromAddress(profileDone) {
  const name = window.location.hash.replace(/^#\//, "").split(/[/?#]/)[0];
  if (!OPEN_SCREENS.has(name)) return "";
  if (["home", "places", "safetyHome", "account"].includes(name) && !profileDone) return "";
  return name;
}

export default function App() {
  const saved = useMemo(() => loadAccount(), []);
  const lastLogin = useMemo(() => loadLogin(), []);
  const opened = screenFromAddress(Boolean(saved?.profileDone));
  const [user, setUser] = useState(saved?.user || (lastLogin
    ? { ...studentSeed, phone: lastLogin.phone, email: lastLogin.email }
    : studentSeed));
  const [profileDone, setProfileDone] = useState(Boolean(saved?.profileDone));
  const [screen, setScreen] = useState(opened || (saved?.profileDone ? "welcomeBack" : "welcome"));
  const [stack, setStack] = useState([opened || (saved?.profileDone ? "welcomeBack" : "welcome")]);
  const [theme, setThemeState] = useState(localStorage.getItem("afriresq-appearance") || "light");
  const [flow, setFlow] = useState("signup");
  const [uni, setUni] = useState("Makerere University");
  const [uniDomain, setUniDomain] = useState("mak.ac.ug");
  const [uniQuery, setUniQuery] = useState("");
  const [codeFor, setCodeFor] = useState("");
  const [signinTab, setSigninTab] = useState(lastLogin?.tab || "phone");
  const [newPassword, setNewPassword] = useState({ value: "", again: "" });
  const [safety, setSafety] = useState(saved?.safety || { mode: "always", kin: true, pings: 3 });
  const [report, setReport] = useState({
    what: "Injury or fall",
    awake: "Yes",
    who: "me",
    where: "gps",
    building: "",
    room: "",
    landmark: "",
    done: false,
  });
  const [mode, setMode] = useState("uni");
  const [filter, setFilter] = useState("all");
  const [place, setPlace] = useState("mak");
  const [sel, setSel] = useState("mak");
  const [otherType, setOtherType] = useState("accident");
  const [otherText, setOtherText] = useState("");
  const [kase, setKase] = useState(null);
  const [fix, setFix] = useState(null);
  const fixRef = useRef(null);
  const askPromise = useRef(null);
  const [partnerDesk, setPartnerDesk] = useState("hospital");
  const [partnerCaseId, setPartnerCaseId] = useState("");
  const [places, setPlaces] = useState(PLACES);
  const [rating, setRating] = useState(0);
  const [trip, setTrip] = useState({ mins: 20, running: false, left: 20 });
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("afriresq-auth") || "");

  useEffect(() => {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = theme;
    localStorage.setItem("afriresq-appearance", theme);
  }, [theme]);

  // Rounded to about 100 m, so walking around does not reload the places every few seconds.
  const nearKey = fix?.status === "ready" ? `${fix.lat.toFixed(3)},${fix.lng.toFixed(3)}` : "";

  useEffect(() => {
    let ignore = false;
    const [lat, lng] = nearKey ? nearKey.split(",").map(Number) : [];
    listPlaces(nearKey ? { lat, lng } : null)
      .then((rows) => {
        if (ignore || !Array.isArray(rows) || !rows.length) return;
        const next = {};
        for (const row of rows) next[row.id] = row;
        setPlaces(next);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [nearKey]);

  useEffect(() => {
    if (!saved?.profileDone || !saved.user?.phone || !authToken) return undefined;
    let ignore = false;
    findPerson({ phone: saved.user.phone }, authToken)
      .then((found) => {
        if (ignore || !found?.profileDone) return;
        setUser(found.user);
        setProfileDone(true);
        setSafety(found.safety);
        persist(found.user, true, found.safety);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [saved]);

  // After a reload, bring back the request the person is still waiting on, or one declined in the last hours,
  // so its status stays on the home screen.
  useEffect(() => {
    if (!profileDone || !authToken || !user.phone || caseRef.current) return undefined;
    let ignore = false;
    listMyCases(user.phone, authToken)
      .then((rows) => {
        if (ignore || caseRef.current) return;
        const recent = (row) => Date.now() - new Date(row.updatedAt || row.createdAt).getTime() < 6 * 3600 * 1000;
        const live = rows.find((row) => ["sent", "accepted", "on_the_way", "arrived"].includes(row.state) || (row.state === "declined" && recent(row)));
        if (!live) return;
        caseRef.current = live;
        setKase(live);
        if (live.place) setPlace(live.place);
        if (live.kind === "other" && live.otherType) setOtherType(live.otherType);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [profileDone, authToken]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  function persist(nextUser, done, nextSafety) {
    localStorage.setItem(
      "afriresq-account",
      JSON.stringify({ user: nextUser, profileDone: done, safety: nextSafety }),
    );
  }

  const showToast = useCallback((message) => {
    setToast(message);
  }, []);

  function openSheet(kind) {
    setSheet(kind);
  }

  function closeSheet() {
    setSheet(null);
  }

  const caseRef = useRef(null);
  const stackRef = useRef(stack);
  const screenRef = useRef(screen);
  const placeRef = useRef(place);
  const ignoreHistory = useRef(false);
  stackRef.current = stack;
  screenRef.current = screen;
  placeRef.current = place;

  const go = useCallback((next, arg, reset) => {
    if (next === "place" && arg) {
      placeRef.current = arg;
      setPlace(arg);
    }
    setError("");
    const base = reset ? [] : stackRef.current;
    const nextStack = base[base.length - 1] === next ? base : [...base, next];
    const unchanged = screenRef.current === next && nextStack.length === stackRef.current.length && nextStack.every((item, index) => item === stackRef.current[index]);
    if (unchanged) return;
    stackRef.current = nextStack;
    screenRef.current = next;
    setStack(nextStack);
    setScreen(next);
    if (ignoreHistory.current) return;
    const url = `${window.location.pathname}${window.location.search}#/${next}`;
    window.history.pushState({ screen: next, stack: nextStack, place: placeRef.current }, "", url);
  }, []);

  const back = useCallback(() => {
    setError("");
    if (stackRef.current.length > 1) {
      window.history.back();
      return;
    }
    const fallback = ["who", "phone", "universities", "email", "code", "signin", "partnerJoin"].includes(screenRef.current) ? "welcome" : "home";
    go(fallback, null, true);
  }, [go]);

  useEffect(() => {
    document.querySelector(".app")?.scrollTo(0, 0);
  }, [screen]);

  useEffect(() => {
    const first = stackRef.current.at(-1) || screenRef.current;
    const url = `${window.location.pathname}${window.location.search}#/${first}`;
    window.history.replaceState({ screen: first, stack: stackRef.current, place: placeRef.current }, "", url);
    function onPop(event) {
      const state = event.state;
      if (!state?.screen) return;
      ignoreHistory.current = true;
      const nextStack = Array.isArray(state.stack) && state.stack.length ? state.stack : [state.screen];
      stackRef.current = nextStack;
      screenRef.current = state.screen;
      if (state.place) {
        placeRef.current = state.place;
        setPlace(state.place);
      }
      setStack(nextStack);
      setScreen(state.screen);
      setError("");
      ignoreHistory.current = false;
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function patchUser(partial) {
    setUser((current) => ({ ...current, ...partial }));
  }

  function setPath(path, value) {
    if (path === "otherText") {
      setOtherText(value);
      return;
    }
    const keys = path.split(".");
    if (keys[0] === "user") {
      setUser((current) => {
        const next = structuredClone(current);
        let node = next;
        for (let i = 1; i < keys.length - 1; i += 1) node = node[keys[i]];
        node[keys[keys.length - 1]] = keys.at(-1) === "phone" || path.endsWith(".phone") ? value.replace(/[^\d\s]/g, "") : value;
        return next;
      });
      return;
    }
    if (keys[0] === "report") {
      setReport((current) => ({ ...current, [keys[1]]: value }));
    }
  }

  const student = user.type === "student";

  async function askFix() {
    if (fixRef.current?.status === "ready") return fixRef.current;
    if (askPromise.current) return askPromise.current;
    const pending = { status: "wait" };
    fixRef.current = pending;
    setFix(pending);
    askPromise.current = readFix()
      .then((point) => {
        const next = { ...point, status: "ready" };
        fixRef.current = next;
        setFix(next);
        return next;
      })
      .catch((err) => {
        const failed = { status: err?.code === 1 ? "denied" : "failed" };
        fixRef.current = failed;
        setFix(failed);
        return null;
      })
      .finally(() => {
        askPromise.current = null;
      });
    return askPromise.current;
  }

  function rememberToken(token) {
    setAuthToken(token || "");
    if (token) localStorage.setItem("afriresq-auth", token);
    else localStorage.removeItem("afriresq-auth");
  }

  async function issueCode({ channel, purpose }) {
    setSending(true);
    setError("");
    try {
      const result = await requestOtp({
        channel,
        purpose,
        phone: user.phone,
        email: user.email,
      });
      setCodeFor(result.destination || (channel === "sms" ? `+256 ${user.phone}` : user.email));
      setFlow(purpose);
      return true;
    } catch (err) {
      setError(err.message || "The code could not be sent.");
      return false;
    } finally {
      setSending(false);
    }
  }

  const value = {
    user,
    setUser,
    patchUser,
    student,
    profileDone,
    screen,
    theme,
    setTheme: setThemeState,
    flow,
    uni,
    uniDomain,
    uniQuery,
    setUniQuery,
    codeFor,
    signinTab,
    setSigninTab,
    newPassword,
    setNewPassword,
    safety,
    setSafety,
    report,
    setReport,
    mode,
    setMode,
    filter,
    setFilter,
    place,
    setPlace,
    sel,
    setSel,
    otherType,
    setOtherType,
    otherText,
    setOtherText,
    kase,
    setKase,
    rating,
    setRating,
    trip,
    setTrip,
    error,
    setError,
    sheet,
    toast,
    verifying,
    sending,
    places,
    partnerDesk,
    setPartnerDesk,
    partnerCaseId,
    setPartnerCaseId,
    showToast,
    fix,
    askFix,
    openSheet,
    closeSheet,
    go,
    back,
    setPath,
    joinCitizen() {
      setUser((current) => ({
        ...current,
        type: "citizen",
        name: "",
        email: "",
        uni: "",
        phone: "",
        studentNo: "",
      }));
      setFlow("signup");
      go("phone");
    },
    joinStudent() {
      setUser((current) => ({
        ...studentSeed,
        phone: "",
        email: "",
        name: "",
        studentNo: "",
        kin: current.kin,
        home: current.home,
        med: current.med,
        lang: current.lang,
      }));
      setFlow("signup");
      setUni("Makerere University");
      setUniDomain("mak.ac.ug");
      go("email");
    },
    async sendPhone() {
      const digits = (user.phone || "").replace(/\D/g, "");
      if (!/^7\d{8}$/.test(digits)) {
        setError("Enter your 9-digit Uganda number, for example 772 123 456.");
        return;
      }
      const ok = await issueCode({ channel: "sms", purpose: "signup" });
      if (ok) go("code");
    },
    pickUni(name, live, domain) {
      if (!live) {
        showToast(`${name} is coming soon. It is listed so you can see it, but sign-up is not open yet.`);
        return;
      }
      setUni(name);
      setUniDomain(domain);
      patchUser({ uni: name });
      go("email");
    },
    async sendEmail() {
      const address = (user.email || "").trim();
      if (!isStudentEmail(address, uniDomain)) {
        setError(`Use your ${uni} student email, name@${studentHost(uniDomain)}.`);
        return;
      }
      const ok = await issueCode({ channel: "email", purpose: "signup" });
      if (ok) go("code");
    },
    async sendSignin() {
      const phone = signinTab === "phone";
      const digits = (user.phone || "").replace(/\D/g, "");
      const email = (user.email || "").trim();
      if (phone ? !/^7\d{8}$/.test(digits) : !isStudentEmail(email)) {
        setError(phone ? "Enter your 9-digit Uganda number." : `Use your Makerere student email, name@${studentHost()}.`);
        return;
      }
      const ok = await issueCode({ channel: phone ? "sms" : "email", purpose: "signin" });
      if (ok) go("code");
    },
    async signinWithPassword(password) {
      const phone = signinTab === "phone";
      const digits = (user.phone || "").replace(/\D/g, "");
      const email = (user.email || "").trim();
      if (phone ? !/^7\d{8}$/.test(digits) : !email.includes("@")) {
        setError(phone ? "Enter your 9-digit Uganda number." : "Enter the email on your account.");
        return;
      }
      if (!password) {
        setError("Enter your password.");
        return;
      }
      setSending(true);
      setError("");
      try {
        const result = await loginWithPassword(phone ? { phone: digits, password } : { email, password });
        rememberToken(result.token);
        setUser(result.account.user);
        setProfileDone(true);
        setSafety(result.account.safety);
        persist(result.account.user, true, result.account.safety);
        rememberLogin(result.account.user);
        showToast("Signed in. Welcome back.");
        go("home", null, true);
      } catch (err) {
        setError(err.message || "Sign-in did not work.");
      } finally {
        setSending(false);
      }
    },
    async changePassword(value) {
      try {
        const saved = await savePerson(user, profileDone, safety, authToken, value);
        setUser(saved.user);
        persist(saved.user, profileDone, safety);
        return true;
      } catch (err) {
        showToast(err.message || "The password could not be saved.");
        return false;
      }
    },
    async resendCode() {
      const channel = flow === "signin"
        ? (signinTab === "phone" ? "sms" : "email")
        : (user.type === "student" ? "email" : "sms");
      return issueCode({ channel, purpose: flow });
    },
    async verify(code) {
      const clean = String(code || "").replace(/\D/g, "");
      if (clean.length < 6) {
        setError("Enter all 6 digits from the message.");
        return;
      }
      const channel = flow === "signin"
        ? (signinTab === "phone" ? "sms" : "email")
        : (user.type === "student" ? "email" : "sms");
      setVerifying(true);
      try {
        const result = await verifyOtp({
          channel,
          phone: user.phone,
          email: user.email,
          code: clean,
        });
        rememberToken(result.token);
        if (flow === "signin") {
          if (!result.account?.profileDone) {
            setError("No saved profile was found. Join first.");
            return;
          }
          setUser(result.account.user);
          setProfileDone(true);
          setSafety(result.account.safety);
          persist(result.account.user, true, result.account.safety);
          rememberLogin(result.account.user);
          showToast(result.account.user.hasPassword ? "Signed in. Welcome back." : "Signed in. Add a password under Account to skip the code next time.");
          go("home", null, true);
          return;
        }
        showToast("Code confirmed");
        go("profile1");
      } catch (err) {
        setError(err.message || "That code is not right.");
      } finally {
        setVerifying(false);
      }
    },
    async finishSetup() {
      try {
        const saved = await savePerson(user, true, safety, authToken, newPassword.value);
        setUser(saved.user);
        setNewPassword({ value: "", again: "" });
        setProfileDone(true);
        persist(saved.user, true, safety);
        rememberLogin(saved.user);
      } catch (err) {
        setError(err.message || "The profile could not be saved.");
        showToast(err.message || "The profile could not be saved.");
        return;
      }
      showToast(safety.mode === "off" ? "Welcome to AfriResQ" : "Safety Net is on. Welcome to AfriResQ");
      go("home", null, true);
    },
    signOut() {
      setProfileDone(false);
      setSafety((current) => ({ ...current, mode: "always" }));
      localStorage.removeItem("afriresq-account");
      rememberToken("");
      caseRef.current = null;
      setKase(null);
      go("welcome", null, true);
    },
    async beginCase(fields) {
      const phoneDigits = (user.phone || "").replace(/\D/g, "");
      if (phoneDigits.length < 9) {
        showToast("Add a phone number on your profile before sending a case.");
        return false;
      }
      const placeId = Object.hasOwn(fields, "place") ? fields.place : place;
      let point = null;
      if (report.where === "gps") {
        point = fixRef.current?.status === "ready" ? fixRef.current : await askFix();
        if (!point) {
          showToast(fixRef.current?.status === "denied"
            ? "The browser did not share a location. Use saved home, or write the place."
            : "The location did not arrive. Try again, or write the place.");
          return false;
        }
      }
      const where = report.where === "home"
        ? { whereText: user.home?.text || "", whereLat: user.home?.lat ?? null, whereLng: user.home?.lng ?? null }
        : report.where === "written"
          ? { whereText: [report.building, report.room, report.landmark].filter(Boolean).join(", "), whereLat: null, whereLng: null }
          : { whereText: `Live location, about ${point.accuracy} m`, whereLat: point.lat, whereLng: point.lng };
      try {
        await savePerson(user, profileDone, safety, authToken);
        const saved = await createCase({
          phone: user.phone,
          kind: fields.kind || "medical",
          what: fields.what || report.what,
          awake: report.awake,
          who: report.who,
          whereMode: report.where,
          ...where,
          building: report.building,
          room: report.room,
          landmark: report.landmark,
          placeId,
          desk: fields.desk || places[placeId]?.name || "",
          path: fields.path,
          otherType: fields.otherType || "",
          detail: fields.detail || "",
          state: fields.state || "sent",
        }, authToken);
        caseRef.current = saved;
        setKase(saved);
        return true;
      } catch (err) {
        showToast(err.message || "The case could not be saved.");
        return false;
      }
    },
    async moveCase(patch) {
      const current = caseRef.current;
      if (!current?.id) return false;
      try {
        const saved = await updateCase(current.id, patch, authToken);
        caseRef.current = saved;
        setKase(saved);
        return true;
      } catch (err) {
        showToast(err.message || "The case could not be updated.");
        return false;
      }
    },
    clearCase() {
      caseRef.current = null;
      setKase(null);
    },
    async refreshCase() {
      const id = caseRef.current?.id;
      if (!id) return null;
      try {
        const saved = await getCase(id, authToken);
        if (!saved) return null;
        caseRef.current = saved;
        setKase(saved);
        return saved;
      } catch {
        return null;
      }
    },
  };

  return (
    <AppState.Provider value={value}>
      <div className="app" data-tabs={["home", "places", "safetyHome", "account"].includes(screen) ? "1" : "0"} data-shell={["welcome", "who", "phone", "universities", "email", "code", "profile1", "profile2", "profile3", "safety", "signin", "welcomeBack", "partnerJoin", "partnerGate", "partnerSignin", "partnerQueue", "partnerCase", "partnerLogin", "partnerHome"].includes(screen) ? "0" : "1"} data-lightstatus={["welcome", "welcomeBack"].includes(screen) ? "1" : "0"}>
        <Sprite />
        <CurrentScreen />
        <TabBar />
        <EdgeLine />
        <Sheets />
        <Toast />
      </div>
    </AppState.Provider>
  );
}
