import fs from "fs";

const html = fs.readFileSync(
  "c:/Users/PC/Desktop/AfriResQ/AfriResQ/AfriResQ_ clickable prototype v2.html",
  "utf8",
);
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const svg = html.match(/<svg width="0"[\s\S]*?<\/svg>/)[0];
fs.writeFileSync(new URL("./prototype.css", import.meta.url), css.trim());
fs.writeFileSync(new URL("./sprite.html", import.meta.url), svg);
console.log("css", css.length, "svg", svg.length);
