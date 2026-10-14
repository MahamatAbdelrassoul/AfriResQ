import { useEffect, useRef, useState } from "react";
import sprite from "./sprite.html?raw";
import { YOU, homePoint } from "./map.js";
import { useApp } from "./app-state.js";

export function Sprite() {
  return <div dangerouslySetInnerHTML={{ __html: sprite }} />;
}

export function Icon({ n, c = "" }) {
  return (
    <svg className={`i ${c}`} aria-hidden="true">
      <use href={`#i-${n}`} />
    </svg>
  );
}

export function Screen({ bare, tabs, children }) {
  return <section className={`screen active${bare ? " bare" : ""}${tabs ? " has-tabs" : ""}`}>{children}</section>;
}

export function Hdr({ title, sub, sos = true }) {
  const { back, openSheet } = useApp();
  return (
    <div className="hdr">
      <button type="button" className="back" onClick={back} aria-label="Back">
        <Icon n="chevL" />
      </button>
      <div className="grow">
        <h2>{title}</h2>
        {sub ? <small>{sub}</small> : null}
      </div>
      {sos ? (
        <button type="button" className="sos-pill" onClick={() => openSheet("lines")} aria-label="Call 999 or 112">
          <Icon n="phone" c="s" />
          999 / 112
        </button>
      ) : null}
    </div>
  );
}

export function Field({ label, children, error }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {error ? (
        <div className="err" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function Inp({ icon, pre, value, onChange, placeholder, type, mode, readOnly }) {
  return (
    <div className="inp">
      {icon ? <Icon n={icon} /> : null}
      {pre ? <span className="pre">{pre}</span> : null}
      <input
        value={value}
        placeholder={placeholder || ""}
        type={type}
        inputMode={mode}
        autoComplete="off"
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </div>
  );
}

export function Note({ tone = "", icon = "info", children }) {
  return (
    <div className={`note ${tone}`}>
      <Icon n={icon} c="m" />
      <span>{children}</span>
    </div>
  );
}

export function Btn({ children, onClick, tone = "pri", disabled }) {
  return (
    <button type="button" className={`btn ${tone}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Steps({ n, total }) {
  return (
    <div className="steps-bar">
      {Array.from({ length: total }, (_, index) => (
        <i key={index} className={index < n ? "on" : ""} />
      ))}
    </div>
  );
}

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

let mapsPromise;
function loadMaps() {
  window.gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent("afriresq-maps-denied"));
  };
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!MAPS_KEY) return Promise.reject(new Error("missing key"));
  if (!mapsPromise) {
    mapsPromise = new Promise((resolve, reject) => {
      const callback = "__afriresqMaps";
      window[callback] = () => {
        if (window.google?.maps) resolve(window.google.maps);
        else reject(new Error("maps missing"));
        delete window[callback];
      };
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&v=weekly&loading=async&callback=${callback}`;
      script.async = true;
      script.onerror = () => reject(new Error("maps failed"));
      document.head.appendChild(script);
    });
  }
  return mapsPromise;
}

function latLng(point) {
  if (!point || point.length < 2) return null;
  const lat = Number(point[0]);
  const lng = Number(point[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function MapBoard({ opts = {}, className = "map", style, children, onPin, onTap }) {
  const { user, student, places } = useApp();
  const node = useRef(null);
  const mapRef = useRef(null);
  const onPinRef = useRef(onPin);
  const onTapRef = useRef(onTap);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  onPinRef.current = onPin;
  onTapRef.current = onTap;

  useEffect(() => {
    const deny = () => setFailed(true);
    window.addEventListener("afriresq-maps-denied", deny);
    return () => window.removeEventListener("afriresq-maps-denied", deny);
  }, []);

  useEffect(() => {
    let cancel = false;
    loadMaps()
      .then((maps) => {
        if (cancel || !node.current || mapRef.current) return;
        mapRef.current = new maps.Map(node.current, {
          center: { lat: YOU[0], lng: YOU[1] },
          zoom: 14,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          backgroundColor: "#dfe8e3",
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const spec = [
    (opts.pins || []).join(","),
    opts.sel || "",
    opts.route ? opts.route.map((point) => point.join(",")).join(";") : "",
    opts.trail ? opts.trail.map((point) => point.join(",")).join(";") : "",
    opts.you ? opts.you.join(",") : "",
    opts.amb ? opts.amb.join(",") : "",
    opts.home ? homePoint(user).join(",") : "",
    student ? user.uni || "" : "",
  ].join("|");

  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!ready || !map || !maps) return undefined;
    const drawn = [];
    const bounds = new maps.LatLngBounds();
    let count = 0;
    const extend = (point) => {
      if (!point) return;
      bounds.extend(point);
      count += 1;
    };
    const circle = (point, fill, stroke, scale) => {
      if (!point) return;
      drawn.push(new maps.Marker({
        map,
        position: point,
        clickable: false,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale,
          fillColor: fill,
          fillOpacity: 1,
          strokeColor: stroke,
          strokeWeight: 3,
        },
      }));
      extend(point);
    };

    if (opts.route?.length) {
      const path = opts.route.map(latLng).filter(Boolean);
      drawn.push(new maps.Polyline({ map, path, strokeColor: "#0B8F4D", strokeWeight: 5, strokeOpacity: 0.9 }));
      path.forEach(extend);
    }
    if (opts.trail?.length) {
      const path = opts.trail.map(latLng).filter(Boolean);
      drawn.push(new maps.Polyline({
        map,
        path,
        strokeColor: "#0B8F4D",
        strokeWeight: 4,
        strokeOpacity: 0.7,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "12px" }],
        strokeOpacity: 0,
      }));
      path.forEach(extend);
    }
    (opts.pins || []).forEach((id) => {
      const place = places[id];
      const point = latLng(place?.ll);
      if (!point) return;
      const uni = student && place.uni === user.uni;
      const listed = !place.conn && !uni;
      const marker = new maps.Marker({
        map,
        position: point,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: opts.sel === id ? 11 : 8,
          fillColor: uni ? "#6552E0" : listed ? "#ffffff" : "#0B8F4D",
          fillOpacity: 1,
          strokeColor: listed ? "#0B8F4D" : "#ffffff",
          strokeWeight: 3,
        },
      });
      marker.addListener("click", () => onPinRef.current?.(id));
      drawn.push(marker);
      extend(point);
    });
    circle(latLng(opts.you), "#0B8F4D", "#ffffff", 8);
    if (opts.home) circle(latLng(homePoint(user)), "#E39A0B", "#ffffff", 8);
    circle(latLng(opts.amb), "#D93636", "#ffffff", 9);

    const timer = setTimeout(() => {
      maps.event.trigger(map, "resize");
      if (count === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(16);
      } else if (count > 1) {
        map.fitBounds(bounds, 36);
      }
    }, 60);
    const tap = onTapRef.current
      ? map.addListener("click", (event) => {
        if (!event.latLng) return;
        onTapRef.current?.({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      })
      : null;
    return () => {
      clearTimeout(timer);
      if (tap) maps.event.removeListener(tap);
      drawn.forEach((item) => item.setMap(null));
    };
  }, [ready, spec, places]);

  return (
    <div className={className} style={style}>
      <div ref={node} className="gmap" />
      {failed ? <p className="map-fallback">Google Maps is switched off for this key. Enable the Maps JavaScript API, then reload.</p> : null}
      {children}
    </div>
  );
}
