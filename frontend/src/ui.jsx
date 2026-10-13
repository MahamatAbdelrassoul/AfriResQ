import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
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

export function Inp({ icon, pre, value, onChange, placeholder, type, mode }) {
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
        onChange={(event) => onChange(event.target.value)}
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

function Frame({ opts, user, places }) {
  const map = useMap();
  const fitKey = [
    (opts.pins || []).join(","),
    opts.route ? opts.route.map((point) => point.join(",")).join(";") : "",
    opts.trail ? "trail" : "",
    opts.home ? homePoint(user).join(",") : "",
    opts.you && !opts.route ? opts.you.join(",") : "",
  ].join("|");
  useEffect(() => {
    const fix = () => map.invalidateSize();
    fix();
    const timer = setTimeout(fix, 250);
    const points = [];
    (opts.pins || []).forEach((id) => {
      if (places[id]) points.push(places[id].ll);
    });
    if (opts.route) points.push(...opts.route);
    if (opts.trail) points.push(...opts.trail);
    if (opts.home) points.push(homePoint(user));
    if (opts.you && !opts.route) points.push(opts.you);
    if (opts.amb && !opts.route) points.push(opts.amb);
    if (points.length === 1) map.setView(points[0], 16, { animate: false });
    else if (points.length) map.fitBounds(points, { padding: [36, 36], maxZoom: 16, animate: false });
    return () => clearTimeout(timer);
  }, [map, fitKey, places]);
  return null;
}

function Taps({ onTap }) {
  useMapEvents({
    click(event) {
      if (onTap) onTap(event.latlng);
    },
  });
  return null;
}

export function MapBoard({ opts = {}, className = "map", style, children, onPin, onTap }) {
  const { user, student, places } = useApp();
  return (
    <div className={className} style={style}>
      <MapContainer center={YOU} zoom={14} zoomControl={false} attributionControl>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Frame opts={opts} user={user} places={places} />
        {onTap ? <Taps onTap={onTap} /> : null}
        {opts.route ? <Polyline positions={opts.route} pathOptions={{ color: "#0B8F4D", weight: 5, opacity: 0.9 }} /> : null}
        {opts.trail ? <Polyline positions={opts.trail} pathOptions={{ color: "#0B8F4D", weight: 4, opacity: 0.7, dashArray: "8 8" }} /> : null}
        {(opts.pins || []).map((id) => {
          const place = places[id];
          if (!place) return null;
          const uni = student && place.uni === user.uni;
          const listed = !place.conn && !uni;
          return (
            <CircleMarker
              key={id}
              center={place.ll}
              radius={opts.sel === id ? 11 : 8}
              pathOptions={{
                color: listed ? "#0B8F4D" : "#ffffff",
                weight: 3,
                fillColor: uni ? "#6552E0" : listed ? "#ffffff" : "#0B8F4D",
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onPin && onPin(id) }}
            />
          );
        })}
        {opts.you ? <CircleMarker center={opts.you} radius={8} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#0B8F4D", fillOpacity: 1 }} /> : null}
        {opts.home ? <CircleMarker center={homePoint(user)} radius={8} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#E39A0B", fillOpacity: 1 }} /> : null}
        {opts.amb ? <CircleMarker center={opts.amb} radius={9} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#D93636", fillOpacity: 1 }} /> : null}
      </MapContainer>
      {children}
    </div>
  );
}
