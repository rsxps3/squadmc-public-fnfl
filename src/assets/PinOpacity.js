/**
 * Curseur « Pin transparency » (0 à 100) : rend les pins et les cibles plus ou moins transparents pour mieux voir la carte.
 *   0   = opaque (comme avant) ;   100 = invisible.
 *
 * Ce qui devient transparent : les pins (mortier, cible, FOB), les cibles lettrées A-Z et les cibles secondaires (tir en ligne ou en
 * zone). Les lignes de tir, les cercles de portée, la grille et les noms de lieux ne changent pas.
 *
 * Comment : pins et cibles lettrées sont des éléments HTML de Leaflet (classe leaflet-marker-icon) : une règle CSS pilotée par la
 * variable --pin-transparency suffit, y compris pour ceux qu'on ajoute plus tard. Les cibles secondaires sont dessinées sur un
 * canevas : elles lisent l'opacité courante avec getPinOpacity() et l'application les met à jour par onChange.
 *
 * Le curseur est une petite commande flottante sur la carte (pile « bas à gauche », avec la case « Cursor info »), jamais dans le
 * panneau de gauche. Le réglage est mémorisé dans le navigateur.
 */
const STYLE_ID = "pin-opacity-style";
const STACK_STYLE_ID = "psmc-ctl-stack-style";
const STORAGE_KEY = "psmc-pin-transparency";
const VAR = "--pin-transparency";

const STACK_CSS = `
.psmc-ctl-stack{position:absolute;left:12px;bottom:48px;z-index:1;display:flex;flex-direction:column-reverse;align-items:flex-start;gap:8px;pointer-events:none;max-width:calc(100% - 24px)}
.psmc-ctl-stack>*{pointer-events:auto}
`;
const CSS = `
.leaflet-marker-icon{opacity:calc(1 - var(${VAR}, 0) / 100)!important}
.po-pill{order:2;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:1px 8px;box-sizing:border-box;width:208px;max-width:100%;padding:4px 10px 6px;
  border-radius:4px;background:rgba(33,33,33,.92);color:#fff;font:13px/1.5 Roboto,Arial,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.5);user-select:none;-webkit-user-select:none}
.po-label{grid-column:1;white-space:nowrap}
.po-out{grid-column:2;min-width:40px;text-align:right;font:600 13px/1.5 ui-monospace,Menlo,Consolas,monospace}
.po-reset{grid-column:3;width:22px;height:22px;margin:0;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font:15px/22px Arial,sans-serif;cursor:pointer}
.po-reset:hover{background:rgba(255,255,255,.3)}
.po-reset:focus-visible,.po-range:focus-visible{outline:2px solid #2196f3;outline-offset:2px}
.po-reset[hidden]{display:none}
.po-range{grid-column:1/-1;width:100%;height:22px;margin:0;cursor:pointer;accent-color:#2196f3}
`;

let current = 1;   // opacité en cours : 1 = opaque (lue par les cibles secondaires, dessinées sur un canevas)
let active = null; // instance en service (la carte est recréée à chaque changement de carte)

/** Opacité courante des pins et des cibles, de 0 (invisible) à 1 (opaque). */
export function getPinOpacity() { return current; }

function readStored() {
  try {
    const v = Number.parseInt(window.localStorage.getItem(STORAGE_KEY), 10);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  } catch (e) { return 0; }
}
function writeStored(v) {
  try { window.localStorage.setItem(STORAGE_KEY, String(v)); } catch (e) { /* stockage indisponible : le réglage vaut pour cette visite */ }
}

/** Pile de commandes en bas à gauche de la carte, partagée avec « Cursor info » : chacune garde sa place, sans chevauchement. */
function controlStack(host) {
  if (!document.getElementById(STACK_STYLE_ID)) {
    const st = document.createElement("style");
    st.id = STACK_STYLE_ID;
    st.textContent = STACK_CSS;
    document.head.appendChild(st);
  }
  let s = null;
  for (let i = 0; i < host.children.length; i++) if (host.children[i].classList.contains("psmc-ctl-stack")) s = host.children[i];
  if (!s) {
    s = document.createElement("div");
    s.className = "psmc-ctl-stack";
    host.appendChild(s);
  }
  return s;
}

export default class PinOpacity {
  /**
   * @param {{host: HTMLElement, onChange: function(number)}} o - host : élément positionné qui contient la carte ;
   *   onChange reçoit l'opacité (0 à 1) à chaque changement, y compris au démarrage
   */
  constructor(o) {
    this.host = o.host;
    this.onChange = o.onChange;
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement("style");
      st.id = STYLE_ID;
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const id = `po${Math.random().toString(36).slice(2, 8)}`;
    this.pill = document.createElement("div");
    this.pill.className = "po-pill";
    this.pill.title = "0 = opaque, 100 = invisible. Pins, targets and secondary targets become transparent so the map shows through.";
    const label = document.createElement("label");
    label.className = "po-label";
    label.setAttribute("for", id);
    label.textContent = "Pin transparency";
    this.out = document.createElement("output");
    this.out.className = "po-out";
    this.out.setAttribute("for", id);
    this.out.setAttribute("aria-live", "off");
    this.reset = document.createElement("button");
    this.reset.type = "button";
    this.reset.className = "po-reset";
    this.reset.textContent = "↺";
    this.reset.title = "Reset to 0 (opaque)";
    this.reset.setAttribute("aria-label", "Reset pin transparency to 0 (opaque)");
    this.range = document.createElement("input");
    this.range.type = "range";
    this.range.className = "po-range";
    this.range.id = id;
    this.range.min = "0";
    this.range.max = "100";
    this.range.step = "1";
    this.pill.appendChild(label);
    this.pill.appendChild(this.out);
    this.pill.appendChild(this.reset);
    this.pill.appendChild(this.range);
    controlStack(this.host).appendChild(this.pill);

    this.range.addEventListener("input", () => this.setValue(Number(this.range.value)));
    this.range.addEventListener("keydown", (e) => {                      // PageUp / PageDown : par pas de 10
      if (e.key === "PageUp" || e.key === "PageDown") {
        e.preventDefault();
        this.setValue(this.value + (e.key === "PageUp" ? 10 : -10));
      }
    });
    this.reset.addEventListener("click", () => { this.setValue(0); this.range.focus(); });
    active = this;
    this.setValue(readStored(), true);
  }

  /** Transparence actuelle, de 0 (opaque) à 100 (invisible). */
  getValue() { return this.value; }

  setValue(v, initial) {
    const n = Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? v : 0)));
    this.value = n;
    this.range.value = String(n);
    this.out.textContent = `${n}%`;
    this.range.setAttribute("aria-valuetext", n === 0 ? "0 percent, opaque" : n === 100 ? "100 percent, invisible" : `${n} percent transparent`);
    this.reset.hidden = n === 0;
    this.host.style.setProperty(VAR, String(n));
    current = 1 - n / 100;
    if (!initial) writeStored(n);
    if (this.onChange) {
      try { this.onChange(current); } catch (e) { /* une erreur de l'application ne doit pas bloquer le curseur */ }
    }
  }

  destroy() {
    const stack = this.pill.parentNode;
    if (stack) {
      stack.removeChild(this.pill);
      if (!stack.children.length && stack.parentNode) stack.parentNode.removeChild(stack);
    }
    this.host.style.removeProperty(VAR);
    if (active === this) {                 // une instance plus récente a pu prendre le relais : on ne touche alors pas à son réglage
      active = null;
      current = 1;
      if (this.onChange) {
        try { this.onChange(1); } catch (e) { /* idem */ }
      }
    }
  }
}
