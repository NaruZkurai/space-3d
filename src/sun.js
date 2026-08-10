// jshint -W097
// jshint undef: true, unused: true
/* globals module,window,document,requestAnimationFrame*/

"use strict";

// Sun controls (mirrors moon.js: all sun-related GUI lives here).
// Owns the sun's brightness / size / flare, custom color, custom image
// (toggle + URL + softness + angle), and the X/Y position offset.
//
// main.js calls Sun(gui, params, menu, renderTextures) and consumes:
//   sun.queryKeys                          - keys to persist in the URL hash
//   sun.getCustomImage(cb)                 - resolve the custom image (or null)
//   sun.getRenderParams()                  - sun params for space.render()
//   sun.updateImageControlsVisibility()    - show/hide image-only GUI rows

// Default image used to override the procedural sun. Toggling "Custom sun
// image" on uses this URL (or whatever is typed into the field).
var CUSTOM_IMAGE_DEFAULT =
  "https://www.nasa.gov/wp-content/uploads/2020/07/moon-near-side-lro.jpg";

var QUERY_KEYS = [
  "sunBrightness",
  "sunSize",
  "sunFlare",
  "useSunColor",
  "sunColor",
  "useFlareColor",
  "flareColor",
  "flareHueOffset",
  "useCustomImage",
  "customImage",
  "imgSoftness",
  "imgAngle",
  "sunOffsetX",
  "sunOffsetY",
  "sunPosX",
  "sunPosY",
  "sunPosZ"
];

// Rows that only make sense when the custom sun image is enabled.
var IMAGE_ROW_LABELS = [
  "Custom sun image URL",
  "Image edge softness",
  "Image angle °"
];

// "#rgb" / "#rrggbb" -> [r, g, b] floats in 0..1 for the sun shader.
function hexToRgb(hex) {
  var h = String(hex || "").replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map(function(c) {
        return c + c;
      })
      .join("");
  }
  var num = parseInt(h, 16);
  if (isNaN(num)) {
    return [1, 1, 1];
  }
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255
  ];
}

module.exports = function(gui, params, menu, renderTextures) {
  menu.sunBrightness =
    params.sunBrightness === undefined ? 1.0 : parseFloat(params.sunBrightness);
  menu.sunSize =
    params.sunSize === undefined ? 1.0 : parseFloat(params.sunSize);
  menu.sunFlare =
    params.sunFlare === undefined ? 0.5 : parseFloat(params.sunFlare);
  menu.useSunColor =
    params.useSunColor === undefined ? false : params.useSunColor === "true";
  menu.sunColor = params.sunColor || "#ffffff";
  menu.useFlareColor =
    params.useFlareColor === undefined
      ? false
      : params.useFlareColor === "true";
  menu.flareColor = params.flareColor || "#ffffff";
  menu.flareHueOffset =
    params.flareHueOffset === undefined ? 30 : parseFloat(params.flareHueOffset);
  menu.useCustomImage =
    params.useCustomImage === undefined
      ? false
      : params.useCustomImage === "true";
  menu.customImage = params.customImage || CUSTOM_IMAGE_DEFAULT;
  menu.imgSoftness =
    params.imgSoftness === undefined ? 0.0 : parseFloat(params.imgSoftness);
  menu.imgAngle =
    params.imgAngle === undefined ? 0.0 : parseFloat(params.imgAngle);
  menu.sunOffsetX =
    params.sunOffsetX === undefined ? 0.0 : parseFloat(params.sunOffsetX);
  menu.sunOffsetY =
    params.sunOffsetY === undefined ? 0.0 : parseFloat(params.sunOffsetY);
  // Sun's ABSOLUTE position on the sky (like the moon). 0 = seed spot.
  menu.sunPosX =
    params.sunPosX === undefined ? 0.0 : parseFloat(params.sunPosX);
  menu.sunPosY =
    params.sunPosY === undefined ? 0.0 : parseFloat(params.sunPosY);
  menu.sunPosZ =
    params.sunPosZ === undefined ? 0.0 : parseFloat(params.sunPosZ);

  gui
    .add(menu, "sunBrightness", 0, 5)
    .name("Sun brightness")
    .onChange(renderTextures);
  gui
    .add(menu, "sunSize", 0.1, 8)
    .name("Sun size")
    .onChange(renderTextures);
  gui
    .add(menu, "sunFlare", 0, 3)
    .name("Sun flare")
    .onChange(renderTextures);
  gui
    .add(menu, "useSunColor")
    .name("Custom sun color")
    .onChange(renderTextures);
  gui
    .addColor(menu, "sunColor")
    .name("Sun color")
    .onChange(renderTextures);
  gui
    .add(menu, "useFlareColor")
    .name("Custom flare color")
    .onChange(function() {
      updateFlareColorVisibility();
      renderTextures();
    });
  gui
    .addColor(menu, "flareColor")
    .name("Flare color")
    .onChange(renderTextures);
  gui
    .add(menu, "flareHueOffset", 0, 360, 0.1)
    .name("Flare hue offset °")
    .onChange(renderTextures);
  gui
    .add(menu, "useCustomImage")
    .name("Custom sun image")
    .onChange(function() {
      updateImageControlsVisibility();
      renderTextures();
    });
  gui
    .add(menu, "customImage")
    .name("Custom sun image URL")
    .onFinishChange(renderTextures);
  gui
    .add(menu, "imgSoftness", 0, 1)
    .name("Image edge softness")
    .onChange(renderTextures);
  gui
    .add(menu, "imgAngle", 0, 360, 0.1)
    .name("Image angle °")
    .onChange(renderTextures);
  gui
    .add(menu, "sunOffsetX", -1, 1, 0.01)
    .name("Sun offset X")
    .onChange(renderTextures);
  gui
    .add(menu, "sunOffsetY", -1, 1, 0.01)
    .name("Sun offset Y")
    .onChange(renderTextures);
  gui
    .add(menu, "sunPosX", -1, 1, 0.01)
    .name("Sun pos X")
    .listen()
    .onChange(renderTextures);
  gui
    .add(menu, "sunPosY", -1, 1, 0.01)
    .name("Sun pos Y")
    .listen()
    .onChange(renderTextures);
  gui
    .add(menu, "sunPosZ", -1, 1, 0.01)
    .name("Sun pos Z")
    .listen()
    .onChange(renderTextures);

  function updateImageControlsVisibility() {
    var show = !!menu.useCustomImage;
    Array.prototype.forEach.call(document.querySelectorAll("li"), function(li) {
      var nameEl = li.querySelector(".property-name");
      if (!nameEl) {
        return;
      }
      if (IMAGE_ROW_LABELS.indexOf(nameEl.textContent) === -1) {
        return;
      }
      li.style.display = show ? "" : "none";
    });
  }

  // The rows only exist in the document once the GUI is appended, so defer
  // the first pass — the image-only controls start hidden (default off).
  requestAnimationFrame(updateImageControlsVisibility);

  function updateFlareColorVisibility() {
    var show = !!menu.useFlareColor;
    var label = "Flare color";
    Array.prototype.forEach.call(document.querySelectorAll("li"), function(li) {
      var nameEl = li.querySelector(".property-name");
      if (!nameEl) {
        return;
      }
      if (nameEl.textContent === label) {
        li.style.display = show ? "" : "none";
      }
    });
  }

  // The flare color picker starts hidden (flare is linked to the star color
  // with a chroma offset by default).
  requestAnimationFrame(updateFlareColorVisibility);

  // Cache for loaded custom images (keyed by URL).
  var imageCache = {};

  function loadCustomImage(url, cb) {
    if (!url) {
      cb(null);
      return;
    }
    if (imageCache[url]) {
      cb(imageCache[url]);
      return;
    }
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function() {
      imageCache[url] = img;
      cb(img);
    };
    img.onerror = function() {
      imageCache[url] = null;
      cb(null);
    };
    img.src = url;
  }

  // Resolve the custom image (or null). When the toggle is off the sun stays
  // procedural. If the image isn't cached yet, cb(null) fires now (procedural
  // sun shows) then cb(img) fires once it loads.
  function getCustomImage(cb) {
    if (!menu.useCustomImage || !menu.customImage) {
      cb(null);
      return;
    }
    var url = menu.customImage;
    if (imageCache[url]) {
      cb(imageCache[url]);
      return;
    }
    cb(null);
    loadCustomImage(url, function(img) {
      if (img) {
        cb(img);
      }
    });
  }

  // Sun-related params passed straight into space.render().
  function getRenderParams() {
    return {
      sunBrightness: menu.sunBrightness,
      sunSize: menu.sunSize,
      sunFlare: menu.sunFlare,
      sunColor: menu.useSunColor ? hexToRgb(menu.sunColor) : null,
      useFlareColor: menu.useFlareColor,
      flareColor: menu.useFlareColor ? hexToRgb(menu.flareColor) : null,
      flareHueOffset: menu.flareHueOffset,
      imgSoftness: menu.imgSoftness,
      imgAngle: menu.imgAngle,
      sunOffsetX: menu.sunOffsetX,
      sunOffsetY: menu.sunOffsetY,
      sunPosX: menu.sunPosX,
      sunPosY: menu.sunPosY,
      sunPosZ: menu.sunPosZ
    };
  }

  return {
    queryKeys: QUERY_KEYS,
    getCustomImage: getCustomImage,
    getRenderParams: getRenderParams,
    updateImageControlsVisibility: updateImageControlsVisibility,
    updateFlareColorVisibility: updateFlareColorVisibility
  };
};
