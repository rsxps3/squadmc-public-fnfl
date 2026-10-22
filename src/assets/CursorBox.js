/**
 * Boîte d'information qui suit le curseur au-dessus de la carte : azimut, élévation (mil) et distance depuis le mortier.
 * Fond vert si le point visé est à portée du mortier, rouge sinon.
 *
 * Le module ne connaît ni Leaflet ni Vue : l'application lui donne
 *   - container : l'élément de la carte (la boîte n'apparaît que lorsque le pointeur est au-dessus) ;
 *   - host      : l'élément (positionné) qui reçoit la petite case à cocher, en bas à gauche de la carte ;
 *   - toLatLng  : (événement souris) -> position sur la carte ;
 *   - compute   : (position) -> { bearing, elevation, distance, inRange, note } déjà mis en forme comme le pied de page du
 *                 calculateur, ou null s'il n'y a pas de mortier (la boîte est alors masquée).
 * Le choix de la case est mémorisé dans le navigateur. Sur un écran sans souris (téléphone, tablette), rien n'est affiché.
 */
const STYLE_ID = "cursor-box-style";
const STORAGE_KEY = "psmc-cursor-box";
const OFFSET = 18;          // distance entre le curseur et la boîte, en pixels
const EDGE = 6;             // marge minimale avec le bord de la fenêtre
const MIN_INTERVAL = 30;    // calcul au plus toutes les 30 ms (la boîte, elle, suit le curseur à chaque image)

const CSS = `
.cb-box{position:fixed;left:0;top:0;z-index:100;display:none;box-sizing:border-box;min-width:176px;padding:6px 10px 7px;border-radius:4px;
  border:1px solid rgba(255,255,255,.4);color:#fff;font:600 13px/1.4 ui-monospace,Menlo,Consolas,"DejaVu Sans Mono",monospace;
  box-shadow:0 2px 8px rgba(0,0,0,.55);pointer-events:none;user-select:none;-webkit-user-select:none;will-change:transform}
.cb-box.cb-in{background:rgba(46,125,50,.95)}
.cb-box.cb-out{background:rgba(198,40,40,.95)}
.cb-row{display:flex;justify-content:space-between;gap:16px;white-space:nowrap}
.cb-k{font-weight:500;opacity:.85}
.cb-status{margin-top:4px;padding-top:3px;border-top:1px solid rgba(255,255,255,.4);font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
.cb-note{font-size:11px;font-weight:500;letter-spacing:0;text-transform:none;opacity:.95;white-space:nowrap}
.cb-toggle{position:absolute;left:12px;bottom:48px;z-index:1;display:flex;align-items:center;gap:6px;box-sizing:border-box;padding:3px 10px 3px 6px;
  border-radius:4px;background:rgba(33,33,33,.92);color:#fff;font:13px/1.5 Roboto,Arial,sans-serif;cursor:pointer;user-select:none;-webkit-user-select:none;
  box-shadow:0 1px 4px rgba(0,0,0,.5)}
.cb-toggle input{margin:0;width:16px;height:16px;cursor:pointer;accent-color:#2e7d32}
.cb-toggle:focus-within{outline:2px solid #2196f3;outline-offset:1px}
`;

function readStored() {
  try { return window.localStorage.getItem(STORAGE_KEY) !== "0"; } catch (e) { return true; }   // activé par défaut
}
function writeStored(on) {
  try { window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0"); } catch (e) { /* stockage indisponible : le choix vaut pour cette visite */ }
}

export default class CursorBox {
  /**
   * @param {{container: HTMLElement, host: HTMLElement, toLatLng: function, compute: function}} o
   */
  constructor(o) {
    this.container = o.container;
    this.host = o.host;
    this.toLatLng = o.toLatLng;
    this.compute = o.compute;
    this.inert = !!(window.matchMedia && window.matchMedia("(hover: none)").matches);   // écran tactile seul : pas de curseur à suivre
    this.enabled = readStored();
    this.last = null;                // dernière position du pointeur : { x, y, target }
    this.raf = 0;
    this.lastCompute = 0;
    this.dirty = false;
    this.info = null;
    this.shown = false;
    this.w = 0;
    this.h = 0;
    this.handlers = [];
    this.attached = false;
    if (this.inert) return;

    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement("style");
      st.id = STYLE_ID;
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.box = document.createElement("div");
    this.box.className = "cb-box";
    this.box.setAttribute("aria-hidden", "true");          // aide visuelle : inutile (et bruyante) pour un lecteur d'écran
    this.rows = {};
    [["bearing", "AZ"], ["elevation", "MIL"], ["distance", "DIST"]].forEach(([key, label]) => {
      const row = document.createElement("div");
      row.className = "cb-row";
      const k = document.createElement("span");
      k.className = "cb-k";
      k.textContent = label;
      const v = document.createElement("span");
      row.appendChild(k);
      row.appendChild(v);
      this.box.appendChild(row);
      this.rows[key] = v;
    });
    this.status = document.createElement("div");
    this.status.className = "cb-status";
    this.statusText = document.createElement("div");
    this.noteText = document.createElement("div");
    this.noteText.className = "cb-note";
    this.status.appendChild(this.statusText);
    this.status.appendChild(this.noteText);
    this.box.appendChild(this.status);
    document.body.appendChild(this.box);

    this.toggle = document.createElement("label");
    this.toggle.className = "cb-toggle";
    this.toggle.title = "Show azimuth, elevation and distance from the mortar next to the cursor";
    this.check = document.createElement("input");
    this.check.type = "checkbox";
    this.check.checked = this.enabled;
    const text = document.createElement("span");
    text.textContent = "Cursor info";
    this.toggle.appendChild(this.check);
    this.toggle.appendChild(text);
    this.host.appendChild(this.toggle);
    this.check.addEventListener("change", () => this.setEnabled(this.check.checked));
    if (this.enabled) this.attach();
  }

  isEnabled() { return this.enabled; }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.check) this.check.checked = this.enabled;
    writeStored(this.enabled);
    if (this.enabled) { this.attach(); this.schedule(); } else { this.detach(); this.hide(); }
  }

  on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this.handlers.push([target, type, fn, opts]);
  }

  attach() {
    if (this.attached || this.inert) return;
    this.attached = true;
    this.on(window, "mousemove", (e) => {
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;      // événement souris simulé après un toucher
      this.last = { x: e.clientX, y: e.clientY, target: e.target };
      this.schedule();
    }, { capture: true, passive: true });
    this.on(document, "mouseout", (e) => { if (!e.relatedTarget) this.hide(); });    // le pointeur quitte la fenêtre
    this.on(window, "blur", () => this.hide());
    this.on(document, "visibilitychange", () => { if (document.hidden) this.hide(); });
  }

  detach() {
    this.handlers.forEach(([t, type, fn, opts]) => t.removeEventListener(type, fn, opts));
    this.handlers = [];
    this.attached = false;
  }

  /** À rappeler quand la carte bouge sous un curseur immobile (zoom, déplacement) : recalcule tout de suite. */
  refresh() {
    this.lastCompute = 0;
    this.schedule();
  }

  schedule() {
    if (this.inert || this.raf) return;
    this.raf = window.requestAnimationFrame(() => { this.raf = 0; this.frame(); });
  }

  frame() {
    if (!this.enabled || !this.last || !this.container.contains(this.last.target)) { this.hide(); return; }
    const now = window.performance.now();
    if (!this.info || this.dirty || now - this.lastCompute >= MIN_INTERVAL) {
      const pos = this.toLatLng({ clientX: this.last.x, clientY: this.last.y });
      const info = pos ? this.compute(pos) : null;
      this.lastCompute = now;
      this.dirty = false;
      if (!info) { this.info = null; this.hide(); return; }
      this.render(info);
    } else {
      this.dirty = true;                 // on a sauté un calcul : une dernière image mettra la boîte à jour
      this.schedule();
    }
    if (!this.info) { this.hide(); return; }
    this.place();
  }

  render(info) {
    const changed = !this.info || ["bearing", "elevation", "distance", "inRange", "note"].some(k => this.info[k] !== info[k]);
    this.info = info;
    if (!changed && this.shown) return;
    this.rows.bearing.textContent = info.bearing;
    this.rows.elevation.textContent = info.elevation;
    this.rows.distance.textContent = info.distance;
    this.statusText.textContent = info.inRange ? "In range" : "Out of range";
    this.noteText.textContent = info.note || "";
    this.noteText.style.display = info.note ? "block" : "none";
    this.box.classList.toggle("cb-in", !!info.inRange);
    this.box.classList.toggle("cb-out", !info.inRange);
    if (!this.shown) { this.box.style.display = "block"; this.shown = true; }
    this.w = this.box.offsetWidth;
    this.h = this.box.offsetHeight;
  }

  place() {
    if (!this.shown) { this.box.style.display = "block"; this.shown = true; this.w = this.box.offsetWidth; this.h = this.box.offsetHeight; }
    const { x, y } = this.last;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let px = x + OFFSET;
    let py = y + OFFSET;
    if (px + this.w + EDGE > vw) px = x - OFFSET - this.w;      // pas la place à droite : à gauche du curseur
    if (py + this.h + EDGE > vh) py = y - OFFSET - this.h;      // pas la place en bas : au-dessus du curseur
    px = Math.max(EDGE, Math.min(px, vw - this.w - EDGE));
    py = Math.max(EDGE, Math.min(py, vh - this.h - EDGE));
    this.box.style.transform = `translate3d(${Math.round(px)}px,${Math.round(py)}px,0)`;
  }

  hide() {
    if (this.inert || !this.shown) return;
    this.box.style.display = "none";
    this.shown = false;
  }

  destroy() {
    if (this.raf) window.cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.detach();
    [this.box, this.toggle].forEach((e) => { if (e && e.parentNode) e.parentNode.removeChild(e); });
  }
}
