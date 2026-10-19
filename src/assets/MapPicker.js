/**
 * Sélecteur de cartes autonome (aucune dépendance), qui remplace le menu déroulant de Vuetify.
 *
 * Pourquoi : le menu de Vuetify limitait sa hauteur à 90 % d'un conteneur parfois plus haut que la fenêtre ;
 * sur les fenêtres peu hautes (zoom à 100 %), le bas de la liste dépassait de l'écran et les dernières cartes
 * étaient inaccessibles. Ici, la hauteur du panneau est calculée à chaque ouverture à partir de la place réellement
 * disponible dans la fenêtre, la liste défile dans le panneau, et une recherche permet de trouver une carte par son nom.
 */
const STYLE_ID = "map-picker-style";
const CSS = `
.map-picker{position:relative;display:inline-block;max-width:100%;vertical-align:middle}
.mp-btn{position:relative;display:flex;align-items:center;gap:10px;box-sizing:border-box;min-width:150px;max-width:min(62vw,340px);height:36px;
  margin:0;padding:0 4px 0 2px;background:transparent;color:inherit;border:0;border-bottom:1px solid rgba(255,255,255,.42);
  font:inherit;font-size:16px;text-align:left;cursor:pointer;outline:0}
.mp-btn:hover{border-bottom-color:rgba(255,255,255,.8)}
.mp-btn:focus-visible{border-bottom-color:#2196f3;box-shadow:0 1px 0 #2196f3}
.mp-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-ico{flex:0 0 auto;width:22px;height:22px;opacity:.75}
.mp-btn.mp-loading::after{content:"";position:absolute;left:0;bottom:-1px;height:2px;width:35%;background:#2196f3;animation:mp-load 1.1s ease-in-out infinite}
@keyframes mp-load{0%{left:-35%}100%{left:100%}}
.mp-panel{position:fixed;z-index:2000;display:none;flex-direction:column;box-sizing:border-box;min-width:240px;
  background:#424242;color:#fff;border-radius:4px;overflow:hidden;font:inherit;font-size:16px;
  box-shadow:0 5px 5px -3px rgba(0,0,0,.2),0 8px 10px 1px rgba(0,0,0,.14),0 3px 14px 2px rgba(0,0,0,.12)}
.mp-panel.mp-open{display:flex}
.mp-search{flex:0 0 auto;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12)}
.mp-search input{box-sizing:border-box;width:100%;height:36px;padding:0 10px;background:#303030;color:#fff;border:1px solid rgba(255,255,255,.25);
  border-radius:4px;font:inherit;font-size:15px;outline:0}
.mp-search input:focus{border-color:#2196f3}
.mp-list{flex:1 1 auto;min-height:0;margin:0;padding:4px 0;list-style:none;overflow-y:auto;overscroll-behavior:contain;
  scrollbar-width:auto;scrollbar-color:#e8b84a rgba(255,255,255,.15)}
.mp-list::-webkit-scrollbar{display:block;width:12px}
.mp-list::-webkit-scrollbar-track{background:rgba(255,255,255,.15)}
.mp-list::-webkit-scrollbar-thumb{background:#e8b84a;border-radius:6px}
.mp-opt{box-sizing:border-box;height:40px;padding:0 16px;line-height:40px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.mp-opt.mp-active{background:rgba(255,255,255,.14)}
.mp-opt[aria-selected="true"]{color:#2196f3;font-weight:600}
.mp-none{padding:14px 16px;opacity:.7}
.mp-count{flex:0 0 auto;padding:6px 14px;font-size:12px;opacity:.7;border-top:1px solid rgba(255,255,255,.12)}
`;

const MARGIN = 8;

function fold(s) {
  // sans accents, en minuscules, ponctuation remplacée par des espaces : « saint lo » trouve « Saint-Lô »
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export default class MapPicker {
  /**
   * @param {HTMLElement} host - élément dans lequel le bouton est créé
   * @param {{items: string[], value: string, onSelect: function(string)}} options
   */
  constructor(host, options) {
    this.host = host;
    this.items = options.items.slice();
    this.value = options.value;
    this.onSelect = options.onSelect;
    this.isOpen = false;
    this.visible = [];
    this.active = -1;
    this.id = `mp${Math.random().toString(36).slice(2, 8)}`;
    this.handlers = [];

    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement("style");
      st.id = STYLE_ID;
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    this.btn = document.createElement("button");
    this.btn.type = "button";
    this.btn.className = "mp-btn";
    this.btn.setAttribute("aria-haspopup", "listbox");
    this.btn.setAttribute("aria-expanded", "false");
    this.btn.setAttribute("aria-controls", `${this.id}-list`);
    this.btn.setAttribute("aria-label", "Choisir une carte");
    this.label = document.createElement("span");
    this.label.className = "mp-label";
    this.btn.appendChild(this.label);
    this.btn.appendChild(MapPicker.icon());
    host.appendChild(this.btn);

    this.panel = document.createElement("div");
    this.panel.className = "mp-panel";
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-label", "Liste des cartes");
    const searchBox = document.createElement("div");
    searchBox.className = "mp-search";
    this.search = document.createElement("input");
    this.search.type = "search";
    this.search.placeholder = "Rechercher une carte…";
    this.search.setAttribute("aria-label", "Rechercher une carte");
    this.search.setAttribute("autocomplete", "off");
    this.search.setAttribute("autocapitalize", "off");
    this.search.setAttribute("spellcheck", "false");
    this.search.setAttribute("aria-controls", `${this.id}-list`);
    searchBox.appendChild(this.search);
    this.list = document.createElement("ul");
    this.list.id = `${this.id}-list`;
    this.list.className = "mp-list";
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "Cartes");
    this.count = document.createElement("div");
    this.count.className = "mp-count";
    this.count.setAttribute("aria-live", "polite");
    this.panel.appendChild(searchBox);
    this.panel.appendChild(this.list);
    this.panel.appendChild(this.count);
    document.body.appendChild(this.panel);

    this.on(this.btn, "click", () => (this.isOpen ? this.close(true) : this.open()));
    this.on(this.btn, "keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); this.open(); }
    });
    this.on(this.search, "input", () => this.filter());
    this.on(this.search, "keydown", (e) => this.onKey(e));
    this.on(this.list, "click", (e) => {
      const li = e.target.closest ? e.target.closest("li[data-i]") : null;
      if (li) this.select(this.visible[Number(li.getAttribute("data-i"))]);
    });
    this.on(this.list, "mousemove", (e) => {
      const li = e.target.closest ? e.target.closest("li[data-i]") : null;
      if (li) this.setActive(Number(li.getAttribute("data-i")), false);
    });
    this.on(document, "pointerdown", (e) => {
      if (this.isOpen && !this.panel.contains(e.target) && !this.btn.contains(e.target)) this.close(false);
    });
    this.on(window, "resize", () => { if (this.isOpen) this.place(); });
    this.on(window, "orientationchange", () => { if (this.isOpen) this.place(); });
    if (window.visualViewport) this.on(window.visualViewport, "resize", () => { if (this.isOpen) this.place(); });

    this.setValue(this.value);
  }

  static icon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "mp-ico");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(ns, "path");
    p.setAttribute("fill", "currentColor");
    p.setAttribute("d", "M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z");
    svg.appendChild(p);
    return svg;
  }

  on(target, type, fn) {
    target.addEventListener(type, fn);
    this.handlers.push([target, type, fn]);
  }

  setValue(v) {
    this.value = v;
    this.label.textContent = v || "";
    this.btn.setAttribute("aria-label", `Choisir une carte (carte actuelle : ${v || "aucune"})`);
    if (this.isOpen) this.render();
  }

  setLoading(b) {
    this.btn.classList.toggle("mp-loading", !!b);
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.search.value = "";
    this.panel.classList.add("mp-open");
    this.btn.setAttribute("aria-expanded", "true");
    this.filter();
    this.place();
    const idx = this.visible.indexOf(this.value);
    this.setActive(idx >= 0 ? idx : 0, true);
    // sur un écran tactile, on ne met pas le focus dans la recherche : le clavier masquerait la moitié de la liste
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) this.search.focus({ preventScroll: true });
  }

  close(refocus) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panel.classList.remove("mp-open");
    this.btn.setAttribute("aria-expanded", "false");
    if (refocus) this.btn.focus({ preventScroll: true });
  }

  select(name) {
    if (name === undefined) return;
    this.setValue(name);
    this.close(true);
    if (this.onSelect) this.onSelect(name);
  }

  /** Place le panneau sous le bouton (ou au-dessus s'il y a plus de place) et limite sa hauteur à la place disponible. */
  place() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = this.btn.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 280), 380, vw - 2 * MARGIN);
    const left = Math.max(MARGIN, Math.min(r.left, vw - width - MARGIN));
    const below = vh - r.bottom - 4 - MARGIN;
    const above = r.top - 4 - MARGIN;
    const s = this.panel.style;
    s.width = `${width}px`;
    s.left = `${left}px`;
    if (below >= 220 || below >= above) {
      s.top = `${r.bottom + 4}px`;
      s.bottom = "auto";
      s.maxHeight = `${Math.max(160, below)}px`;
    } else {
      s.top = "auto";
      s.bottom = `${vh - r.top + 4}px`;
      s.maxHeight = `${Math.max(160, above)}px`;
    }
    if (parseFloat(s.maxHeight) > vh - 2 * MARGIN) {   // fenêtre vraiment très basse : tout l'écran
      s.top = `${MARGIN}px`;
      s.bottom = "auto";
      s.maxHeight = `${vh - 2 * MARGIN}px`;
    }
  }

  filter() {
    const tokens = fold(this.search.value).split(" ").filter(Boolean);
    this.visible = this.items.filter((n) => { const f = fold(n); return tokens.every(t => f.indexOf(t) !== -1); });
    this.render();
    this.setActive(this.visible.length ? Math.max(0, this.visible.indexOf(this.value)) : -1, false);
    if (tokens.length && this.visible.length) this.setActive(0, true);
  }

  render() {
    this.list.textContent = "";
    this.visible.forEach((name, i) => {
      const li = document.createElement("li");
      li.className = "mp-opt";
      li.id = `${this.id}-o${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("data-i", String(i));
      li.setAttribute("aria-selected", String(name === this.value));
      li.title = name;
      li.textContent = name;
      this.list.appendChild(li);
    });
    if (!this.visible.length) {
      const none = document.createElement("li");
      none.className = "mp-none";
      none.setAttribute("role", "presentation");
      none.textContent = "Aucune carte ne correspond.";
      this.list.appendChild(none);
    }
    const total = this.items.length;
    this.count.textContent = this.visible.length === total ? `${total} cartes` : `${this.visible.length} sur ${total} cartes`;
  }

  setActive(i, scroll) {
    const prev = this.list.querySelector(".mp-active");
    if (prev) prev.classList.remove("mp-active");
    this.active = i;
    const li = i >= 0 ? this.list.querySelector(`li[data-i="${i}"]`) : null;
    if (!li) { this.search.removeAttribute("aria-activedescendant"); return; }
    li.classList.add("mp-active");
    this.search.setAttribute("aria-activedescendant", li.id);
    if (scroll) {
      const top = li.offsetTop;
      const bottom = top + li.offsetHeight;
      if (top < this.list.scrollTop) this.list.scrollTop = top;
      else if (bottom > this.list.scrollTop + this.list.clientHeight) this.list.scrollTop = bottom - this.list.clientHeight;
      if (i === this.visible.indexOf(this.value) && !this.search.value) this.list.scrollTop = Math.max(0, top - this.list.clientHeight / 2 + li.offsetHeight / 2);
    }
  }

  onKey(e) {
    const n = this.visible.length;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); if (n) this.setActive((this.active + 1) % n, true); break;
      case "ArrowUp": e.preventDefault(); if (n) this.setActive((this.active - 1 + n) % n, true); break;
      case "Home": if (!this.search.value) { e.preventDefault(); if (n) this.setActive(0, true); } break;
      case "End": if (!this.search.value) { e.preventDefault(); if (n) this.setActive(n - 1, true); } break;
      case "PageDown": e.preventDefault(); if (n) this.setActive(Math.min(n - 1, this.active + 8), true); break;
      case "PageUp": e.preventDefault(); if (n) this.setActive(Math.max(0, this.active - 8), true); break;
      case "Enter": e.preventDefault(); if (this.active >= 0) this.select(this.visible[this.active]); break;
      case "Escape": e.preventDefault(); this.close(true); break;
      case "Tab": this.close(false); break;
      default: break;
    }
  }

  destroy() {
    this.handlers.forEach(([t, type, fn]) => t.removeEventListener(type, fn));
    this.handlers = [];
    if (this.panel.parentNode) this.panel.parentNode.removeChild(this.panel);
    if (this.btn.parentNode) this.btn.parentNode.removeChild(this.btn);
  }
}
