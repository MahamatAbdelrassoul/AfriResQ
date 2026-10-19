import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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

export function Inp({ icon, pre, value, onChange, placeholder, type, mode, readOnly, autoComplete = "off", name }) {
  return (
    <div className="inp">
      {icon ? <Icon n={icon} /> : null}
      {pre ? <span className="pre">{pre}</span> : null}
      <input
        value={value}
        placeholder={placeholder || ""}
        type={type}
        inputMode={mode}
        autoComplete={autoComplete}
        name={name}
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
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Google refuses the key after the script loads (quota used up, address not allowed).
// Once that happens, every map on the page uses OpenStreetMap instead.
let googleDenied = !MAPS_KEY;

let mapsPromise;
function loadMaps() {
  window.gm_authFailure = () => {
    googleDenied = true;
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
  const [engine, setEngine] = useState(googleDenied ? "osm" : "google");
  onPinRef.current = onPin;
  onTapRef.current = onTap;

  useEffect(() => {
    const deny = () => {
      googleDenied = true;
      setEngine("osm");
    };
    window.addEventListener("afriresq-maps-denied", deny);
    return () => window.removeEventListener("afriresq-maps-denied", deny);
  }, []);

  useEffect(() => {
    if (engine !== "osm") return undefined;
    mapRef.current = null;
    setReady(false);
    let map;
    try {
      map = L.map(node.current, { zoomControl: false, attributionControl: true }).setView(YOU, 14);
      map.attributionControl.setPrefix(false);
      L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_CREDIT }).addTo(map);
    } catch {
      setFailed(true);
      return undefined;
    }
    mapRef.current = map;
    setReady(true);
    return () => {
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [engine]);

  useEffect(() => {
    if (engine !== "google") return undefined;
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
        if (cancel) return;
        googleDenied = true;
        setEngine("osm");
      });
    return () => {
      cancel = true;
    };
  }, [engine]);

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
    if (!ready || !map || engine !== "osm") return undefined;
    const drawn = [];
    const points = [];
    const dot = (point, fill, stroke, radius, interactive = false) => {
      if (!point) return null;
      const marker = L.circleMarker(point, {
        radius,
        fillColor: fill,
        fillOpacity: 1,
        color: stroke,
        weight: 3,
        interactive,
      }).addTo(map);
      drawn.push(marker);
      points.push(point);
      return marker;
    };

    if (opts.route?.length) {
      const path = opts.route.map(latLng).filter(Boolean);
      drawn.push(L.polyline(path, { color: "#0B8F4D", weight: 5, opacity: 0.9, interactive: false }).addTo(map));
      points.push(...path);
    }
    if (opts.trail?.length) {
      const path = opts.trail.map(latLng).filter(Boolean);
      drawn.push(L.polyline(path, { color: "#0B8F4D", weight: 4, opacity: 0.9, dashArray: "6 6", interactive: false }).addTo(map));
      points.push(...path);
    }
    (opts.pins || []).forEach((id) => {
      const place = places[id];
      const uni = student && place?.uni === user.uni;
      const listed = !place?.conn && !uni;
      const marker = dot(
        latLng(place?.ll),
        uni ? "#6552E0" : listed ? "#ffffff" : "#0B8F4D",
        listed ? "#0B8F4D" : "#ffffff",
        opts.sel === id ? 11 : 8,
        true,
      );
      marker?.on("click", () => onPinRef.current?.(id));
    });
    dot(latLng(opts.you), "#0B8F4D", "#ffffff", 8);
    if (opts.home) dot(latLng(homePoint(user)), "#E39A0B", "#ffffff", 8);
    dot(latLng(opts.amb), "#D93636", "#ffffff", 9);

    const timer = setTimeout(() => {
      map.invalidateSize();
      if (points.length === 1) map.setView(points[0], 16);
      else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36] });
    }, 60);
    const tap = (event) => onTapRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    if (onTapRef.current) map.on("click", tap);
    return () => {
      clearTimeout(timer);
      map.off("click", tap);
      drawn.forEach((item) => item.remove());
    };
  }, [ready, engine, spec, places]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!ready || !map || !maps || engine !== "google") return undefined;
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
  }, [ready, engine, spec, places]);

  return (
    <div className={className} style={style}>
      <div key={engine} ref={node} className="gmap" />
      {failed ? <p className="map-fallback">The map cannot load right now. Check the internet connection. Everything else still works.</p> : null}
      {children}
    </div>
  );
}
