<template>
  <router-view :key="$route.fullPath"/>
</template>

<script>
import Loading from "./Loading.vue";
import MapData from "./assets/MapData";

// variable that determines PostScriptum mode
// based on this, mapData baseURL will be modified and condition for Map component set
const postScriptum = true;
const mapData = new MapData();

// adapt for local testing or when forking the project
let baseUrl = "https://maps.fnfl.app";
if (postScriptum) { baseUrl += "/"; }

export default {
  name: "App",
  mounted() {
    const mapComponentPromise = () => import(/* webpackChunkName: "map" */ "./Map.vue");
    // dynamically insert map routes
    mapData.init(baseUrl).then(() => {
      const mapNames = mapData.getMapNames();
      const routes = mapNames.map(mapName => ({
        name: mapName,
        path: `/${mapName}`,
        component: mapComponentPromise,
        loading: Loading,
        props: {
          mapData,
          postScriptum,
          initialMap: mapName,
        },
      }));
      // fallback to first map, if name in route could not be matched
      routes.push({
        path: "*",
        redirect: (to) => {
          // un lien peut contenir le nom de la carte encodé (« Modded%20-%20Brest ») : on le décode avant de conclure
          // que la carte n'existe pas, sinon les visiteurs sans carte mémorisée sont renvoyés vers la première carte
          let wanted = "";
          try {
            wanted = decodeURIComponent(String((to && to.path) || "").replace(/^\//, ""));
          } catch (e) {
            wanted = "";
          }
          if (wanted && mapNames.indexOf(wanted) !== -1) {
            return `/${wanted}`;
          }
          return localStorage.getItem("selectedMap") || mapNames[0];
        },
      });
      this.$router.addRoutes(routes);
    });
  },
};
</script>
<style>
  /*hide scrollbar*/
  body {
    overflow-y: hidden;
  }

  body::-webkit-scrollbar {
    display: none;
  }

  /* menu des cartes : barre de défilement toujours visible
     (masquée automatiquement sur certains systèmes : la liste paraît alors s'arrêter après les premières cartes) */
  .v-menu__content,
  .menuable__content__active {
    scrollbar-width: auto;
    scrollbar-color: #e8b84a rgba(255, 255, 255, 0.15);
  }

  .v-menu__content::-webkit-scrollbar,
  .menuable__content__active::-webkit-scrollbar {
    display: block;
    width: 12px;
  }

  .v-menu__content::-webkit-scrollbar-track,
  .menuable__content__active::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.15);
  }

  .v-menu__content::-webkit-scrollbar-thumb,
  .menuable__content__active::-webkit-scrollbar-thumb {
    background: #e8b84a;
    border-radius: 6px;
  }

  /* menus : jamais plus hauts que la fenêtre
     (le menu des cartes mesurait 90 % d'un conteneur parfois plus haut que l'écran : son bas dépassait et les dernières cartes
     de la liste étaient inaccessibles, même en la faisant défiler) */
  .v-menu__content {
    max-height: calc(100vh - 140px) !important;
  }
</style>
