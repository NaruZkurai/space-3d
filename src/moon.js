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

var QUERY_KEYS = [
  "moonEnabled",
  "moonScale",
  "moonRx",
  "moonRy",
  "moonRz",
  "moonFlare",
  "moonSoftness",
  "useMoonFlareColor",
  "moonFlareHue",
  "moonFlareSat",
  "moonFlareLight",
  "moonFlareAlpha",
  "moonFlareHueOffset",
  "moonPosX",
  "moonPosY",
  "moonPosZ",
  "moonOnSun"
];

// HSL -> [r, g, b] in 0..1, for the moon flare's own color.
function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  var hue2rgb = function(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    return [l, l, l];
  }
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  var p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

module.exports = function(gui, params, menu, renderTextures) {
  menu.moonEnabled =
    params.moonEnabled === undefined ? true : params.moonEnabled === "true";
  menu.moonScale =
    params.moonScale === undefined ? 1 : parseFloat(params.moonScale);
  menu.moonRx = params.moonRx === undefined ? 0 : parseFloat(params.moonRx);
  menu.moonRy = params.moonRy === undefined ? 0 : parseFloat(params.moonRy);
  menu.moonRz = params.moonRz === undefined ? 0 : parseFloat(params.moonRz);
  // Moon's own glow (rendered like the sun's flare, so it shows on every
  // face) and edge smoothness (soft edge opacity on the sphere's limb).
  menu.moonFlare =
    params.moonFlare === undefined ? 0.27 : parseFloat(params.moonFlare);
  menu.moonSoftness =
    params.moonSoftness === undefined ? 0.3 : parseFloat(params.moonSoftness);
  // Moon flare's OWN color (HSL), like the sun's flare color. Off by default
  // -> white glow.
  menu.useMoonFlareColor =
    params.useMoonFlareColor === undefined
      ? false
      : params.useMoonFlareColor === "true";
  menu.moonFlareHue =
    params.moonFlareHue === undefined ? 0 : parseFloat(params.moonFlareHue);
  menu.moonFlareSat =
    params.moonFlareSat === undefined ? 1 : parseFloat(params.moonFlareSat);
  menu.moonFlareLight =
    params.moonFlareLight === undefined ? 1 : parseFloat(params.moonFlareLight);
  // Moon flare ALPHA: doesn't change the flare's rendered transparency — it
  // controls how strongly the SUN's final color tints the moon sphere
  // (fmhslaa).
  menu.moonFlareAlpha =
    params.moonFlareAlpha === undefined ? 0.3 : parseFloat(params.moonFlareAlpha);
  // Default moon flare color = the sun's final color hue-shifted by this
  // offset (fmhslao), used when the manual HSLA color is off.
  menu.moonFlareHueOffset =
    params.moonFlareHueOffset === undefined
      ? 30
      : parseFloat(params.moonFlareHueOffset);
  // Moon's ABSOLUTE position on the sky — a direction vector from center
  // (normalized when rendered). X/Y/Z reach any spot: left/right = +/-X,
  // top/bottom = +/-Y, front/back = +/-Z.
  menu.moonPosX =
    params.moonPosX === undefined ? 0 : parseFloat(params.moonPosX);
  menu.moonPosY =
    params.moonPosY === undefined ? 0 : parseFloat(params.moonPosY);
  menu.moonPosZ =
    params.moonPosZ === undefined ? 0 : parseFloat(params.moonPosZ);
  // Default position is the moon's OWN seed-determined spot (consistent with
  // the original generator's sun/stars/galaxy — it regenerates when the seed
  // changes). "Set coords to sun" flips moonOnSun so the moon sits on the
  // sun; touching any absolute position clears it.
  menu.moonOnSun =
    params.moonOnSun === undefined ? false : params.moonOnSun === "true";

  gui
    .add(menu, "moonEnabled")
    .name("Show moon")
    .onChange(renderTextures);
  gui
    .add(menu, "moonScale", 0.1, 8, 0.01)
    .name("Moon scale")
    .onChange(renderTextures);
  gui
    .add(menu, "moonRx", 0, 360, 1)
    .name("Moon rotate X °")
    .listen()
    .onChange(renderTextures);
  gui
    .add(menu, "moonRy", 0, 360, 1)
    .name("Moon rotate Y °")
    .listen()
    .onChange(renderTextures);
  gui
    .add(menu, "moonRz", 0, 360, 1)
    .name("Moon rotate Z °")
    .listen()
    .onChange(renderTextures);
  gui
    .add(menu, "moonFlare", 0, 3, 0.01)
    .name("Moon flare")
    .onChange(renderTextures);
  gui
    .add(menu, "moonSoftness", 0, 3, 0.01)
    .name("Moon edge softness")
    .onChange(renderTextures);
  gui
    .add(menu, "useMoonFlareColor")
    .name("Custom moon flare color")
    .onChange(function() {
      updateMoonFlareVisibility();
      renderTextures();
    });
  gui
    .add(menu, "moonFlareHue", 0, 360, 1)
    .name("Moon flare hue °")
    .onChange(renderTextures);
  gui
    .add(menu, "moonFlareSat", 0, 1, 0.01)
    .name("Moon flare saturation")
    .onChange(renderTextures);
  gui
    .add(menu, "moonFlareLight", 0, 1, 0.01)
    .name("Moon flare lightness")
    .onChange(renderTextures);
  gui
    .add(menu, "moonFlareAlpha", 0, 1, 0.01)
    .name("Moon flare alpha (tint)")
    .onChange(renderTextures);
  gui
    .add(menu, "moonFlareHueOffset", 0, 360, 1)
    .name("Moon flare hue offset °")
    .onChange(renderTextures);
  function updateMoonFlareVisibility() {
    var manual = !!menu.useMoonFlareColor;
    var manualLabels = [
      "Moon flare hue °",
      "Moon flare saturation",
      "Moon flare lightness"
    ];
    var offsetLabels = ["Moon flare hue offset °"];
    Array.prototype.forEach.call(document.querySelectorAll("li"), function(li) {
      var nameEl = li.querySelector(".property-name");
      if (!nameEl) return;
      if (manualLabels.indexOf(nameEl.textContent) !== -1) {
        li.style.display = manual ? "" : "none";
      } else if (offsetLabels.indexOf(nameEl.textContent) !== -1) {
        li.style.display = manual ? "none" : "";
      }
    });
  }
  requestAnimationFrame(updateMoonFlareVisibility);
  gui
    .add(menu, "moonPosX", -1, 1, 0.01)
    .name("Moon pos X")
    .listen()
    .onChange(function() {
      menu.moonOnSun = false;
      renderTextures();
    });
  gui
    .add(menu, "moonPosY", -1, 1, 0.01)
    .name("Moon pos Y")
    .listen()
    .onChange(function() {
      menu.moonOnSun = false;
      renderTextures();
    });
  gui
    .add(menu, "moonPosZ", -1, 1, 0.01)
    .name("Moon pos Z")
    .listen()
    .onChange(function() {
      menu.moonOnSun = false;
      renderTextures();
    });
  menu.moonSetToSun = function() {
    menu.moonOnSun = true;
    menu.moonPosX = 0;
    menu.moonPosY = 0;
    menu.moonPosZ = 0;
    renderTextures();
  };
  gui.add(menu, "moonSetToSun").name("Set coords to sun");
  menu.moonRandomize = function() {
    menu.moonOnSun = false;
    menu.moonPosX = Math.random() * 2 - 1;
    menu.moonPosY = Math.random() * 2 - 1;
    menu.moonPosZ = Math.random() * 2 - 1;
    renderTextures();
  };
  gui.add(menu, "moonRandomize").name("Randomize moon pos");

  // Moon-related params passed straight into space.render().
  function getRenderParams() {
    return {
      moonEnabled: menu.moonEnabled,
      moonScale: menu.moonScale,
      moonRx: menu.moonRx,
      moonRy: menu.moonRy,
      moonRz: menu.moonRz,
      moonFlare: menu.moonFlare,
      moonSoftness: menu.moonSoftness,
      moonFlareColor: menu.useMoonFlareColor
        ? hslToRgb(menu.moonFlareHue, menu.moonFlareSat, menu.moonFlareLight)
        : null,
      moonFlareAlpha: menu.moonFlareAlpha,
      moonFlareHueOffset: menu.moonFlareHueOffset,
      moonPosX: menu.moonPosX,
      moonPosY: menu.moonPosY,
      moonPosZ: menu.moonPosZ,
      moonOnSun: menu.moonOnSun
    };
  }

  return {
    queryKeys: QUERY_KEYS,
    getRenderParams: getRenderParams
  };
};
