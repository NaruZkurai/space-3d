// jshint -W097
// jshint undef: true, unused: true
/* globals module*/

"use strict";

// Moon (3D sphere baked into the cubemap)
// ---------------------------------------
// The moon is rendered by space-3d.js as a real 3D textured sphere inside the
// WebGL cubemap pass, so it is baked into the skybox and shows up in the
// exported textures. It sits at the sun's position (seed coords + offset) and
// the moon rotate controls spin the actual 3D sphere — not a flat image.
//
// The sphere's texture is the "custom sun image" (e.g. a moon photo): sun.js
// loads it and main.js passes the resolved <img> through to space.render().
//
// This module only owns the moon GUI + params. It must NOT require sun.js —
// it reads/writes the shared `menu` object and hands params to main.js.

var QUERY_KEYS = ["moonEnabled", "moonScale", "moonRx", "moonRy", "moonRz"];

module.exports = function(gui, params, menu, renderTextures) {
  menu.moonEnabled =
    params.moonEnabled === undefined ? true : params.moonEnabled === "true";
  menu.moonScale =
    params.moonScale === undefined ? 1 : parseFloat(params.moonScale);
  menu.moonRx = params.moonRx === undefined ? 0 : parseFloat(params.moonRx);
  menu.moonRy = params.moonRy === undefined ? 0 : parseFloat(params.moonRy);
  menu.moonRz = params.moonRz === undefined ? 0 : parseFloat(params.moonRz);

  gui
    .add(menu, "moonEnabled")
    .name("Show moon")
    .onChange(renderTextures);
  gui
    .add(menu, "moonScale", 0.1, 8, 0.01)
    .name("Moon scale")
    .onChange(renderTextures);
  gui
    .add(menu, "moonRx", -180, 180, 1)
    .name("Moon rotate X °")
    .onChange(renderTextures);
  gui
    .add(menu, "moonRy", -180, 180, 1)
    .name("Moon rotate Y °")
    .onChange(renderTextures);
  gui
    .add(menu, "moonRz", -180, 180, 1)
    .name("Moon rotate Z °")
    .onChange(renderTextures);

  // Moon-related params passed straight into space.render().
  function getRenderParams() {
    return {
      moonEnabled: menu.moonEnabled,
      moonScale: menu.moonScale,
      moonRx: menu.moonRx,
      moonRy: menu.moonRy,
      moonRz: menu.moonRz
    };
  }

  return {
    queryKeys: QUERY_KEYS,
    getRenderParams: getRenderParams
  };
};
