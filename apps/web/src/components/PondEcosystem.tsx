import { useEffect, useEffectEvent, useState } from "react";
import type { CSSProperties } from "react";
import { gardenWaterings, localPondDate, pondAntics, pondDiscoveryHabitat, pondSeason, pondSecrets, pondWildlife, wildlifeVisible, type WildlifeId } from "../lib/pondDiscoveries";
import { pondElapsed } from "../lib/pondLife";
import "./pondEcosystem.css";
import type { PondSound } from "../lib/pondAudio";
import { pondPixelArt } from "../lib/pondPixelArt";

// Code-native pixel motifs share the pond's crisp SVG style; no smooth curves.
const motifs: Record<string, string[]> = {
  strider: ["M2 5H5V7H8V9H12V7H15V5H18V7H16V9H13V11H16V13H18V15H16V14H13V12H7V14H4V15H2V13H4V11H7V9H4V7H2Z", "M8 5H12V14H8Z"],
  butterfly: ["M2 3H7V5H9V12H6V15H2V10H4V8H2ZM18 3H13V5H11V12H14V15H18V10H16V8H18Z", "M9 4H11V16H9ZM7 2H9V4H7ZM11 2H13V4H11Z"],
  fireflies: ["M3 3H7V6H13V3H17V8H19V14H16V17H4V14H1V8H3Z", "M4 4H6V6H4ZM14 4H16V6H14ZM5 12H15V14H5Z"],
  snail: ["M3 7H6V4H12V6H14V13H17V8H19V16H3V14H1V9H3Z", "M6 7H11V9H8V12H11V14H5V9H6Z"],
  turtle: ["M4 6H7V3H13V6H16V8H19V12H16V15H13V17H11V15H7V17H4V14H2V8H4Z", "M6 6H13V13H6ZM16 8H18V10H16Z"],
  duck: ["M12 3H17V5H19V8H16V12H18V15H15V17H5V15H2V10H6V12H11V8H10V5H12Z", "M16 6H20V8H16ZM5 12H11V15H5Z"],
  axolotl: ["M2 5H4V8H6V5H8V7H12V5H14V8H16V5H18V11H16V13H13V16H16V18H12V16H8V18H4V16H7V13H4V11H2Z", "M6 8H8V10H6ZM12 8H14V10H12ZM8 12H12V13H8Z"],
  moon: ["M7 2H14V4H17V7H19V13H17V16H14V18H7V16H4V13H2V7H4V4H7Z", "M6 5H9V8H6ZM12 11H15V14H12Z"],
  flower: ["M8 2H12V5H16V9H13V12H7V9H4V5H8ZM9 12H11V19H9ZM4 14H9V16H4Z", "M8 6H12V10H8Z"],
  lantern: ["M7 2H13V4H15V17H5V4H7ZM3 17H17V19H3Z", "M8 6H12V14H8Z"],
  home: ["M8 2H12V4H14V6H17V9H19V11H17V18H3V11H1V9H3V6H6V4H8Z", "M8 11H12V18H8ZM4 10H6V12H4Z"],
  mushroom: ["M6 3H14V5H17V8H19V11H12V18H8V11H1V8H3V5H6Z", "M5 6H8V8H5ZM12 5H15V7H12Z"],
  crate: ["M2 5H18V18H2ZM4 2H16V5H4Z", "M4 7H16V9H4ZM8 9H12V13H8ZM4 15H16V17H4Z"],
  crystal: ["M8 1H12V3H14V15H12V18H8V15H6V3H8ZM1 10H4V18H1ZM16 8H19V18H16Z", "M9 3H11V14H9Z"],
  disco: ["M9 0H11V3H15V5H18V8H19V13H17V16H14V18H6V16H3V13H1V8H3V5H6V3H9Z", "M5 6H8V9H5ZM11 5H14V8H11ZM8 11H11V14H8ZM14 10H17V13H14ZM4 12H6V14H4Z"],
  radio: ["M3 7H17V18H3ZM11 2H13V7H11Z", "M5 10H10V15H5ZM12 10H15V12H12ZM12 14H15V16H12Z"],
  ghost: ["M7 2H13V4H16V7H18V18H15V16H12V19H9V16H6V18H2V7H4V4H7Z", "M6 7H8V10H6ZM12 7H14V10H12Z"],
  book: ["M2 3H8V5H12V3H18V17H12V19H8V17H2Z", "M4 6H7V7H4ZM13 6H16V7H13ZM9 6H11V17H9Z"],
  mug: ["M3 7H14V9H18V14H14V18H3ZM5 1H7V5H5ZM10 0H12V4H10Z", "M14 10H16V13H14ZM5 9H7V15H5Z"],
  bell: ["M8 2H12V5H15V12H18V15H2V12H5V5H8ZM8 17H12V19H8Z", "M7 6H9V11H7Z"],
};
export function PondPixel({ kind, silhouette = false, portrait = false }: { kind: string; silhouette?: boolean; portrait?: boolean }) {
  // Keep the live chorus's individually animated dots; its guide portrait shows the insect up close.
  if (kind === "fireflies" && !portrait) return <svg viewBox="0 0 20 20" shapeRendering="crispEdges" aria-hidden="true" className={`pond-pixel pond-pixel-fireflies${silhouette ? " pond-undiscovered" : ""}`}>{[[3,3],[5,3],[13,3],[15,3],[3,5],[15,5],[1,7],[17,7],[1,9],[17,9],[3,11],[15,11],[5,13],[7,13],[9,13],[11,13],[13,13],[3,15],[15,15]].map(([x,y],i) => <rect key={i} x={x} y={y} width="1" height="1" fill="#e0f892" style={{ "--scatter-x": `${(i % 5 - 2) * 4}px`, "--scatter-y": `${(i % 7 - 3) * 3}px` } as CSSProperties}/>)}</svg>;
  const paths = motifs[kind === "treasure" ? "crate" : kind === "sunflower" ? "flower" : kind] ?? motifs.flower;
  const { palette, layers } = pondPixelArt[kind] ?? pondPixelArt.flower;
  return <svg viewBox="0 0 44 44" shapeRendering="crispEdges" aria-hidden="true" data-pixel-art={kind} className={`pond-pixel pond-pixel-${kind}${portrait ? " pond-pixel-portrait" : ""}${silhouette ? " pond-undiscovered" : ""}`}><g transform="translate(2 2) scale(2)">{kind !== "fireflies" && <><path d={paths[0]} fill={palette[2]} stroke={palette[0]} strokeWidth=".5" strokeLinejoin="miter"/><path d={paths[1]} fill={palette[1]}/></>}{layers.map(([color, path], index) => <path key={index} d={path} fill={palette[color]}/>)}</g></svg>;
}
type Props = { tick: number; active: boolean; theme: string; light: string; discovered: Record<string, string>; record: (id: string) => void; sound: (cue: PondSound) => void; dance: () => void; season: string };
export function PondWildlife(props: Props) {
  const { tick, active, theme, light, discovered, record, sound, dance, season } = props;
  const [message, setMessage] = useState("");
  const [effect, setEffect] = useState<{ theme: string; tick: number } | null>(null);
  const [melody, setMelody] = useState(0);
  const [focused, setFocused] = useState<WildlifeId | null>(null);
  const visible = pondWildlife.filter(entry => wildlifeVisible(entry.id, tick, light) || focused === entry.id);
  const observe = useEffectEvent(() => { if (active) visible.forEach(entry => record(`wild-${entry.id}`)); });
  const visibleKey = visible.map(entry => entry.id).join(",");
  useEffect(() => { observe(); }, [visibleKey, active]);
  useEffect(() => { setMelody(0); setEffect(null); setMessage(""); }, [theme]);
  const secret = pondSecrets.find(entry => entry.theme === theme) ?? pondSecrets[0];
  const liveEffect = effect?.theme === theme && pondElapsed(tick, effect.tick) < 36;
  const complete = () => {
    record(`secret-${theme}`); setEffect({ theme, tick }); sound("visitor");
    setMessage(`${secret.name} discovered!`);
    if (["pond-08", "pond-09", "pond-14"].includes(theme)) dance();
  };
  const activate = () => {
    if (theme === "pond-15") {
      const today = `garden-${localPondDate()}`;
      const count = gardenWaterings(discovered) + (discovered[today] ? 0 : 1);
      record(today); setEffect({ theme, tick }); sound("bubble");
      setMessage(count >= 3 ? "Your sunflower has bloomed!" : `Watered ${Math.min(count, 3)} of 3 different days. No streak needed.`);
      if (count >= 3) record(`secret-${theme}`);
    } else if (theme === "pond-07") setMessage("Play low, high, middle. No timer; try again anytime.");
    else complete();
  };
  const decoration = season === "auto" ? pondSeason(new Date().getMonth()) : season;
  return <>
    <div className={`pond-season pond-season-${decoration}`} aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ left: `${5 + i * 13}%`, "--petal": i } as CSSProperties}/>)}</div>
    {visible.map((entry, index) => <button key={entry.id} type="button" data-testid={`pond-wild-${entry.id}`} data-habitat={pondDiscoveryHabitat(entry.id)} className={`pond-wildlife pond-wild-${entry.id}`} aria-label={`Observe ${entry.name}`} onFocus={() => setFocused(entry.id)} onBlur={() => setFocused(null)} onClick={() => { record(`wild-${entry.id}`); setMessage(entry.id === "snail" ? "Taking my time. The snail approves of a little break." : `${entry.name}: ${entry.hint}`); sound("bubble"); }} style={{ "--wild-index": index } as CSSProperties}><PondPixel kind={entry.id}/><span>{entry.name}</span>{entry.id === "strider" || entry.id === "duck" ? <i className="pond-wild-wake"/> : null}</button>)}
    <button type="button" className={`pond-secret${liveEffect ? " pond-secret-active" : ""}`} data-testid="pond-theme-secret" data-habitat={pondDiscoveryHabitat(secret.icon)} aria-label={secret.action} onClick={activate}><PondPixel kind={theme === "pond-15" && gardenWaterings(discovered) < 3 ? "flower" : secret.icon}/><span>{secret.action}</span></button>
    {theme === "pond-07" ? <div className="pond-crystal-notes" aria-label="Crystal melody"><small>Low, high, middle</small>{["Low", "Middle", "High"].map((note, index) => <button type="button" key={note} aria-label={`Play ${note.toLowerCase()} crystal`} onClick={() => { sound(index === 0 ? "crystal-low" : index === 1 ? "crystal-middle" : "crystal-high"); if (index === [0, 2, 1][melody]) { if (melody === 2) { complete(); setMelody(0); } else setMelody(melody + 1); } else { setMelody(0); setMessage("Try low, high, middle. No hurry."); } }}>{note}</button>)}</div> : null}
    {theme === "pond-15" ? <span className={`pond-garden-stage pond-garden-stage-${Math.min(3, gardenWaterings(discovered))}`} aria-label={`Garden: ${Math.min(3, gardenWaterings(discovered))} of 3 watering days`}>{gardenWaterings(discovered) >= 3 ? "Sunflower in bloom" : gardenWaterings(discovered) ? "Your seedling is growing" : "A little seed is waiting"}</span> : null}
    {liveEffect ? <div className={`pond-secret-effect pond-secret-effect-${theme}`} data-habitat={pondDiscoveryHabitat(secret.icon)} aria-hidden="true">{theme === "pond-10" ? <PondPixel kind="ghost"/> : Array.from({ length: 5 }, (_, i) => <i key={i} style={{ "--spark": i } as CSSProperties}/>)}</div> : null}
    {message ? <div className="pond-discovery-message" role="status"><span>{message}</span><button type="button" aria-label="Dismiss pond discovery" onClick={() => setMessage("")}>Close</button></div> : null}
  </>;
}
export function PondFieldGuide({ discovered }: { discovered: Record<string, string> }) {
  const entries = [ ...pondWildlife.map(entry => ({ id: `wild-${entry.id}`, name: entry.name, icon: entry.id, hint: entry.hint })), ...pondSecrets.map(entry => ({ id: `secret-${entry.theme}`, name: entry.name, icon: entry.icon, hint: `${entry.theme.replace("pond-", "Pond ")}: ${entry.action}` })), ...pondAntics.map(entry => ({ ...entry, id: `antic-${entry.id}`, icon: "fireflies", hint: "Watch the frogs play together." })) ];
  const journal = entries.filter(entry => discovered[entry.id]).sort((a, b) => discovered[b.id].localeCompare(discovered[a.id]));
  return <details className="pond-field-guide" data-testid="pond-field-guide"><summary>Field guide <span>{journal.length} / {entries.length} discoveries</span></summary><p>Wildlife sightings are recorded automatically while the pond plays. Secrets have no time limit. Saved in this browser, not synced between devices.</p><div className="pond-guide-entries">{entries.map(entry => <div key={entry.id} data-discovery={entry.id}><PondPixel kind={entry.icon} silhouette={!discovered[entry.id]} portrait/><strong>{discovered[entry.id] ? entry.name : "Undiscovered"}</strong><small>{entry.hint}</small></div>)}</div><h3>What was that?</h3>{journal.length ? <ul>{journal.map(entry => <li key={entry.id}><strong>{entry.name}</strong> <time dateTime={discovered[entry.id]}>{new Date(discovered[entry.id]).toLocaleDateString()}</time></li>)}</ul> : <p>Stay a little while. Your first sighting will appear here.</p>}</details>;
}
