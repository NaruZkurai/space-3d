// jshint -W097
// jshint undef: true, unused: true
/* globals require,document,__dirname,Float32Array,module*/

"use strict";

var fs = require("fs");
var glm = require("gl-matrix");
var webgl = require("./webgl.js");
var util = require("./util.js");
var rng = require("rng");

var NSTARS = 100000;

module.exports = function() {
  var self = this;

  self.initialize = function() {
    // Initialize the offscreen rendering canvas.
    self.canvas = document.createElement("canvas");

    // Initialize the gl context.
    self.gl = self.canvas.getContext("webgl");
    self.gl.enable(self.gl.BLEND);
    self.gl.blendFuncSeparate(
      self.gl.SRC_ALPHA,
      self.gl.ONE_MINUS_SRC_ALPHA,
      self.gl.ZERO,
      self.gl.ONE
    );

    // Load the programs.
    self.pNebula = util.loadProgram(
      self.gl,
      fs.readFileSync(__dirname + "/glsl/nebula.glsl", "utf8")
    );
    self.pPointStars = util.loadProgram(
      self.gl,
      fs.readFileSync(__dirname + "/glsl/point-stars.glsl", "utf8")
    );
    self.pStar = util.loadProgram(
      self.gl,
      fs.readFileSync(__dirname + "/glsl/star.glsl", "utf8")
    );
    self.pSun = util.loadProgram(
      self.gl,
      fs.readFileSync(__dirname + "/glsl/sun.glsl", "utf8")
    );
    self.pMoon = util.loadProgram(
      self.gl,
      fs.readFileSync(__dirname + "/glsl/moon.glsl", "utf8")
    );

    // Create the point stars renderable.
    var rand = new rng.MT(hashcode("best seed ever") + 5000);
    var position = new Float32Array(18 * NSTARS);
    var color = new Float32Array(18 * NSTARS);
    for (var i = 0; i < NSTARS; i++) {
      var size = 0.05;
      var pos = glm.vec3.random(glm.vec3.create(), 1.0);
      var star = buildStar(size, pos, 128.0, rand);
      position.set(star.position, i * 18);
      color.set(star.color, i * 18);
    }
    var attribs = webgl.buildAttribs(self.gl, { aPosition: 3, aColor: 3 });
    attribs.aPosition.buffer.set(position);
    attribs.aColor.buffer.set(color);
    var count = position.length / 9;
    self.rPointStars = new webgl.Renderable(
      self.gl,
      self.pPointStars,
      attribs,
      count
    );

    // Create the nebula, sun, star, and moon renderables.
    self.rNebula = buildBox(self.gl, self.pNebula);
    self.rSun = buildBox(self.gl, self.pSun);
    self.rStar = buildBox(self.gl, self.pStar);
    self.rMoon = buildSphere(self.gl, self.pMoon, 32);
  };

  self.render = function(params) {
    // We'll be returning a map of direction to texture.
    var textures = {};

    // Handle changes to resolution.
    self.canvas.width = self.canvas.height = params.resolution;
    self.gl.viewport(0, 0, params.resolution, params.resolution);

    // Initialize the point star parameters.
    var rand = new rng.MT(hashcode(params.seed) + 1000);
    var pStarParams = [];
    while (params.pointStars) {
      pStarParams.push({
        rotation: randomRotation(rand)
      });
      if (rand.random() < 0.2) {
        break;
      }
    }

    // Initialize the star parameters.
    var rand = new rng.MT(hashcode(params.seed) + 3000);
    var starParams = [];
    while (params.stars) {
      starParams.push({
        pos: randomVec3(rand),
        color: [1, 1, 1],
        size: 0.0,
        falloff: rand.random() * Math.pow(2, 20) + Math.pow(2, 20)
      });
      if (rand.random() < 0.01) {
        break;
      }
    }

    // Initialize the nebula parameters.
    var rand = new rng.MT(hashcode(params.seed) + 2000);
    var nebulaParams = [];
    while (params.nebulae) {
      nebulaParams.push({
        scale: rand.random() * 0.5 + 0.25,
        color: [rand.random(), rand.random(), rand.random()],
        intensity: rand.random() * 0.2 + 0.9,
        falloff: rand.random() * 3.0 + 3.0,
        offset: [
          rand.random() * 2000 - 1000,
          rand.random() * 2000 - 1000,
          rand.random() * 2000 - 1000
        ]
      });
      if (rand.random() < 0.5) {
        break;
      }
    }

    // Initialize the sun parameters.
    var rand = new rng.MT(hashcode(params.seed) + 4000);
    var sunParams = [];
    // Sun offset: nudges the sun (and its flare) in world space. The shader
    // normalizes uPosition, so offsetting the vector shifts the flare's
    // direction; the custom image is drawn at the same offset position.
    // moon.js uses the same scale to keep its overlay glued to the sun.
    var SUN_OFFSET_SCALE = 0.5;
    var sunOffsetX =
      (params.sunOffsetX === undefined ? 0 : params.sunOffsetX) *
      SUN_OFFSET_SCALE;
    var sunOffsetY =
      (params.sunOffsetY === undefined ? 0 : params.sunOffsetY) *
      SUN_OFFSET_SCALE;
    // Sun's ABSOLUTE position override (like the moon's). 0 = seed spot.
    var sunPosX =
      params.sunPosX === undefined ? 0 : parseFloat(params.sunPosX);
    var sunPosY =
      params.sunPosY === undefined ? 0 : parseFloat(params.sunPosY);
    var sunPosZ =
      params.sunPosZ === undefined ? 0 : parseFloat(params.sunPosZ);
    var hasSunAbs = sunPosX !== 0 || sunPosY !== 0 || sunPosZ !== 0;
    if (params.sun) {
      // Draw pos -> color -> size -> falloff from the seed in exactly the
      // same order as always, so a given seed keeps the identical RNG stream
      // (color / size / falloff are unchanged even when the position is
      // overridden). Only the visible color / position are overridden
      // afterwards — the seed generation is untouched.
      var sunPosSeed = randomVec3(rand);
      var seededSunColor = [rand.random(), rand.random(), rand.random()];
      var sunSize =
        (rand.random() * 0.0001 + 0.0001) * (params.sunSize || 1);
      var sunFalloff = rand.random() * 16.0 + 8.0;
      var sunPos = hasSunAbs ? [sunPosX, sunPosY, sunPosZ] : sunPosSeed;
      var renderedSunPos = [
        sunPos[0] + sunOffsetX,
        sunPos[1] + sunOffsetY,
        sunPos[2]
      ];
      // Star color ("Custom sun color") tints the disk only.
      var starColor = params.sunColor || seededSunColor;
      // Flare color: its own color by default linked to the star color with
      // a chroma (hue) offset; a custom flare color can override it.
      var flareHueOffset =
        params.flareHueOffset === undefined
          ? 30
          : parseFloat(params.flareHueOffset);
      var flareColor;
      if (params.useFlareColor && params.flareColor) {
        flareColor = params.flareColor;
      } else {
        flareColor = hueShift(starColor, flareHueOffset);
      }
      sunParams.push({
        pos: renderedSunPos,
        color: starColor,
        flareColor: flareColor,
        size: sunSize,
        falloff: sunFalloff
      });
    }

    // 3D moon: a textured sphere baked into the cubemap. It defaults to the
    // sun's position but has its OWN offset (like the sun) — "Set coords to
    // sun" resets it back onto the sun. Texture priority: a user custom image
    // (near-side photos get black -> transparent so they read as a disk),
    // otherwise the default NASA equirectangular moon map (opaque). The
    // rotate controls spin the actual 3D sphere — not a flat image.
    var moonImage = params.customImage || params.moonImage || null;
    var moonEnabled =
      params.moonEnabled === undefined ? false : !!params.moonEnabled;
    // Moon's ABSOLUTE position on the sky — a direction vector from center
    // (normalized before the sphere is placed). X/Y/Z reach any spot:
    // left/right = +/-X, top/bottom = +/-Y, front/back = +/-Z. Priority:
    //   1. moonOnSun  -> glued to the sun ("Set coords to sun")
    //   2. moonPosXYZ -> absolute position
    //   3. default    -> the moon's OWN seed-determined spot (consistent with
    //                    the original generator's sun/stars/galaxy, so it
    //                    regenerates when the seed changes)
    var moonPosX =
      params.moonPosX === undefined ? 0 : parseFloat(params.moonPosX);
    var moonPosY =
      params.moonPosY === undefined ? 0 : parseFloat(params.moonPosY);
    var moonPosZ =
      params.moonPosZ === undefined ? 0 : parseFloat(params.moonPosZ);
    var hasMoonAbs = moonPosX !== 0 || moonPosY !== 0 || moonPosZ !== 0;
    var moonOnSun = params.moonOnSun === true || params.moonOnSun === "true";
    var moonCenter = null;
    if (moonEnabled && moonImage) {
      if (moonOnSun && sunParams.length) {
        // Glued to the sun.
        moonCenter = sunParams[0].pos.slice();
      } else if (hasMoonAbs) {
        moonCenter = [moonPosX, moonPosY, moonPosZ];
      } else {
        // The moon's own seed spot (distinct RNG stream from the sun's +4000).
        var randMoon = new rng.MT(hashcode(params.seed) + 5000);
        moonCenter = randomVec3(randMoon);
      }
    }

    // Build the moon texture once per render. Always upload from a CANVAS
    // (never a raw <img>) — texImage2D from a canvas is reliable across the
    // Image path. A user photo is preprocessed (black -> transparent) so it
    // wraps as a clean disk; the default NASA map is drawn as-is. The NASA
    // mesh maps v=0 to the north pole and its texture is north-up, so the
    // upload is NOT flipped. Created manually (not via webgl.Texture) because
    // that helper always generates mipmaps, which fails for NPOT images.
    var moonTexture = null;
    if (moonCenter) {
      var moonTexData = params.customImage
        ? makeMoonCanvas(params.customImage)
        : params.moonImage
          ? imageToCanvas(params.moonImage)
          : null;
      if (moonTexData) {
        var tex = self.gl.createTexture();
        self.gl.activeTexture(self.gl.TEXTURE0);
        self.gl.bindTexture(self.gl.TEXTURE_2D, tex);
        self.gl.pixelStorei(self.gl.UNPACK_FLIP_Y_WEBGL, false);
        self.gl.texImage2D(
          self.gl.TEXTURE_2D,
          0,
          self.gl.RGBA,
          self.gl.RGBA,
          self.gl.UNSIGNED_BYTE,
          moonTexData
        );
        self.gl.texParameteri(
          self.gl.TEXTURE_2D,
          self.gl.TEXTURE_MIN_FILTER,
          self.gl.LINEAR
        );
        self.gl.texParameteri(
          self.gl.TEXTURE_2D,
          self.gl.TEXTURE_MAG_FILTER,
          self.gl.LINEAR
        );
        self.gl.texParameteri(
          self.gl.TEXTURE_2D,
          self.gl.TEXTURE_WRAP_S,
          self.gl.CLAMP_TO_EDGE
        );
        self.gl.texParameteri(
          self.gl.TEXTURE_2D,
          self.gl.TEXTURE_WRAP_T,
          self.gl.CLAMP_TO_EDGE
        );
        moonTexture = {
          bind: function() {
            self.gl.activeTexture(self.gl.TEXTURE0);
            self.gl.bindTexture(self.gl.TEXTURE_2D, tex);
          }
        };
      }
    }

    // Moon edge/flare controls (read once per render). The edge softness is
    // applied in the moon shader; the flare is rendered in the WebGL pass
    // with the sun shader (like the sun's flare) so it shows correctly on
    // every cubemap face.
    var moonSoftness =
      params.moonSoftness === undefined ? 0 : parseFloat(params.moonSoftness);
    var moonFlare =
      params.moonFlare === undefined ? 0.27 : parseFloat(params.moonFlare);
    // Moon flare color: manual HSLA if provided, otherwise derived from the
    // sun's final color hue-shifted by the moon flare hue offset (fmhslao).
    var moonFlareColor;
    if (params.moonFlareColor) {
      moonFlareColor = params.moonFlareColor;
    } else if (sunParams.length) {
      var mho =
        params.moonFlareHueOffset === undefined
          ? 30
          : parseFloat(params.moonFlareHueOffset);
      moonFlareColor = hueShift(sunParams[0].color, mho);
    } else {
      moonFlareColor = [1, 1, 1];
    }

    // Create a list of directions we'll be iterating over.
    var dirs = {
      front: {
        target: [0, 0, -1],
        up: [0, 1, 0]
      },
      back: {
        target: [0, 0, 1],
        up: [0, 1, 0]
      },
      left: {
        target: [-1, 0, 0],
        up: [0, 1, 0]
      },
      right: {
        target: [1, 0, 0],
        up: [0, 1, 0]
      },
      top: {
        target: [0, 1, 0],
        up: [0, 0, 1]
      },
      bottom: {
        target: [0, -1, 0],
        up: [0, 0, -1]
      }
    };

    // Define and initialize the model, view, and projection matrices.
    var model = glm.mat4.create();
    var view = glm.mat4.create();
    var projection = glm.mat4.create();
    glm.mat4.perspective(projection, Math.PI / 2, 1.0, 0.1, 256);

    // Iterate over the directions to render and create the textures.
    var keys = Object.keys(dirs);
    for (var i = 0; i < keys.length; i++) {
      // Clear the context.
      self.gl.clearColor(0, 0, 0, 1);
      self.gl.clear(self.gl.COLOR_BUFFER_BIT);

      // Look in the direction for this texture.
      var dir = dirs[keys[i]];
      glm.mat4.lookAt(view, [0, 0, 0], dir.target, dir.up);

      // Render the point stars.
      self.pPointStars.use();
      model = glm.mat4.create();
      self.pPointStars.setUniform("uView", "Matrix4fv", false, view);
      self.pPointStars.setUniform(
        "uProjection",
        "Matrix4fv",
        false,
        projection
      );
      for (var j = 0; j < pStarParams.length; j++) {
        var ps = pStarParams[j];
        glm.mat4.mul(model, ps.rotation, model);
        self.pPointStars.setUniform("uModel", "Matrix4fv", false, model);
        self.rPointStars.render();
      }

      // Render the stars.
      self.pStar.use();
      self.pStar.setUniform("uView", "Matrix4fv", false, view);
      self.pStar.setUniform("uProjection", "Matrix4fv", false, projection);
      self.pStar.setUniform("uModel", "Matrix4fv", false, model);
      for (j = 0; j < starParams.length; j++) {
        var s = starParams[j];
        self.pStar.setUniform("uPosition", "3fv", s.pos);
        self.pStar.setUniform("uColor", "3fv", s.color);
        self.pStar.setUniform("uSize", "1f", s.size);
        self.pStar.setUniform("uFalloff", "1f", s.falloff);
        self.rStar.render();
      }

      // Render the nebulae.
      self.pNebula.use();
      model = glm.mat4.create();
      for (j = 0; j < nebulaParams.length; j++) {
        var p = nebulaParams[j];
        self.pNebula.setUniform("uModel", "Matrix4fv", false, model);
        self.pNebula.setUniform("uView", "Matrix4fv", false, view);
        self.pNebula.setUniform("uProjection", "Matrix4fv", false, projection);
        self.pNebula.setUniform("uScale", "1f", p.scale);
        self.pNebula.setUniform("uColor", "3fv", p.color);
        self.pNebula.setUniform("uIntensity", "1f", p.intensity);
        self.pNebula.setUniform("uFalloff", "1f", p.falloff);
        self.pNebula.setUniform("uOffset", "3fv", p.offset);
        self.rNebula.render();
      }

      // Render the suns. When a custom image (moon) overrides the sun, the sun
      // is still rendered BEHIND it so its flare glows on every face; the moon
      // image (drawn a little later) covers the sun's bright core.
      self.pSun.use();
      self.pSun.setUniform("uView", "Matrix4fv", false, view);
      self.pSun.setUniform("uProjection", "Matrix4fv", false, projection);
      self.pSun.setUniform("uModel", "Matrix4fv", false, model);
      for (j = 0; j < sunParams.length; j++) {
        var sun = sunParams[j];
        self.pSun.setUniform("uPosition", "3fv", sun.pos);
        self.pSun.setUniform("uColor", "3fv", sun.color);
        self.pSun.setUniform("uFlareColor", "3fv", sun.flareColor);
        self.pSun.setUniform("uSize", "1f", sun.size);
        self.pSun.setUniform("uFalloff", "1f", sun.falloff);
        self.pSun.setUniform(
          "uBrightness",
          "1f",
          params.sunBrightness === undefined ? 1.0 : params.sunBrightness
        );
        self.pSun.setUniform(
          "uFlare",
          "1f",
          params.sunFlare === undefined ? 0.5 : params.sunFlare
        );
        self.rSun.render();
      }

      // Render the 3D moon sphere (baked into the cubemap) at the sun's
      // (offset) position, rotated by the moon rotate controls.
      if (moonTexture) {
        var moonScale =
          params.moonScale === undefined ? 1 : parseFloat(params.moonScale);
        var toRad = Math.PI / 180;
        var MOON_DIST = 30;
        var moonRadius = Math.sin(0.05 * moonScale) * MOON_DIST;
        var dir = moonCenter.slice();
        glm.vec3.normalize(dir, dir);

        // Render the moon's own flare (like the sun's): a soft glow at the
        // moon's direction, drawn with the sun shader so it shows correctly
        // on every face. The solid sphere (drawn next) covers the glow's
        // center, leaving a halo around the moon.
        if (moonFlare > 0) {
          var moonAng = Math.asin(
            Math.max(0, Math.min(moonRadius / MOON_DIST, 1))
          );
          // Scale the halo so it extends ~2x the moon's angular radius.
          var moonFalloff = Math.log(0.15) / Math.log(Math.cos(2 * moonAng));
          if (!isFinite(moonFalloff) || moonFalloff < 1) {
            moonFalloff = 1;
          }
          self.pSun.use();
          self.pSun.setUniform("uView", "Matrix4fv", false, view);
          self.pSun.setUniform("uProjection", "Matrix4fv", false, projection);
          self.pSun.setUniform("uModel", "Matrix4fv", false, model);
          self.pSun.setUniform("uPosition", "3fv", dir);
          self.pSun.setUniform("uColor", "3fv", [1, 1, 1]);
          self.pSun.setUniform("uFlareColor", "3fv", moonFlareColor);
          self.pSun.setUniform("uSize", "1f", 0.0001);
          self.pSun.setUniform("uFalloff", "1f", moonFalloff);
          self.pSun.setUniform("uBrightness", "1f", 1);
          self.pSun.setUniform("uFlare", "1f", moonFlare);
          self.rSun.render();
        }

        var moonModel = glm.mat4.create();
        glm.mat4.translate(moonModel, moonModel, [
          dir[0] * MOON_DIST,
          dir[1] * MOON_DIST,
          dir[2] * MOON_DIST
        ]);
        // Rotations wrap at 360 (values normalized mod 360).
        var norm360 = function(v) {
          return (((parseFloat(v) || 0) % 360) + 360) % 360;
        };
        glm.mat4.rotateX(moonModel, moonModel, norm360(params.moonRx) * toRad);
        glm.mat4.rotateY(moonModel, moonModel, norm360(params.moonRy) * toRad);
        glm.mat4.rotateZ(moonModel, moonModel, norm360(params.moonRz) * toRad);
        glm.mat4.scale(moonModel, moonModel, [
          moonRadius,
          moonRadius,
          moonRadius
        ]);

        self.pMoon.use();
        self.pMoon.setUniform("uModel", "Matrix4fv", false, moonModel);
        self.pMoon.setUniform("uView", "Matrix4fv", false, view);
        self.pMoon.setUniform("uProjection", "Matrix4fv", false, projection);
        // Light the moon from the VIEWER's side (full-moon look): the visible
        // surface normals point toward the camera (-dir), so the light must
        // come from -dir for dot(N, L) = +1 there. Any other sign makes the
        // lit/dark side flip and the moon render "incorrectly" at some angles.
        self.pMoon.setUniform("uLightDir", "3fv", [
          -dir[0],
          -dir[1],
          -dir[2]
        ]);
        self.pMoon.setUniform("uTexture", "1i", 0);
        self.pMoon.setUniform("uSoftness", "1f", moonSoftness);
        // Moon color follows the sun's final color, scaled by the flare alpha.
        var moonTint = sunParams.length ? sunParams[0].color : [1, 1, 1];
        var moonTintAmount =
          params.moonFlareAlpha === undefined
            ? 0.3
            : parseFloat(params.moonFlareAlpha);
        self.pMoon.setUniform("uMoonTint", "3fv", moonTint);
        self.pMoon.setUniform("uMoonTintAmount", "1f", moonTintAmount);
        moonTexture.bind();
        // The moon is a SOLID sphere, so it needs depth testing: otherwise the
        // far (back) hemisphere's triangles get drawn over the near hemisphere
        // (no culling/depth in this pipeline), causing "disks over disks" and
        // the "top half rotates backwards" artifact at large rotations.
        self.gl.enable(self.gl.DEPTH_TEST);
        self.gl.depthMask(true);
        self.gl.clear(self.gl.DEPTH_BUFFER_BIT);
        self.rMoon.render();
        self.gl.depthMask(false);
        self.gl.disable(self.gl.DEPTH_TEST);
      }

      // Create the texture.
      var c = document.createElement("canvas");
      c.width = c.height = params.resolution;
      var ctx = c.getContext("2d");
      ctx.drawImage(self.canvas, 0, 0);
      textures[keys[i]] = c;
    }

    return textures;
  };

  self.initialize();
};

// Deterministic seed positions for the sun and moon (same generation as the
// render). Exposed so the GUI can reset / copy / swap their coordinates.
module.exports.seedPositions = function(seed) {
  return {
    sun: randomVec3(new rng.MT(hashcode(seed) + 4000)),
    moon: randomVec3(new rng.MT(hashcode(seed) + 5000))
  };
};

// Compute the bounding box of the visible (non-black) content of an image,
// cached on the element. Used to crop moon photos so their black margins
// don't show as a ring around the disk.
function getImageContentBBox(img) {
  if (img.__contentBBox) {
    return img.__contentBBox;
  }
  var iw = img.naturalWidth || img.width;
  var ih = img.naturalHeight || img.height;
  var x0 = iw;
  var y0 = ih;
  var x1 = -1;
  var y1 = -1;
  try {
    var c = document.createElement("canvas");
    c.width = iw;
    c.height = ih;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    var d = ctx.getImageData(0, 0, iw, ih).data;
    for (var y = 0; y < ih; y++) {
      for (var x = 0; x < iw; x++) {
        var p = (y * iw + x) * 4;
        if (d[p + 3] > 10 && (d[p] + d[p + 1] + d[p + 2]) / 3 > 12) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
  } catch (e) {
    x0 = 0;
    y0 = 0;
    x1 = iw;
    y1 = ih;
  }
  if (x1 < x0) {
    x0 = 0;
    y0 = 0;
    x1 = iw;
    y1 = ih;
  }
  img.__contentBBox = { x0: x0, y0: y0, x1: x1, y1: y1 };
  return img.__contentBBox;
}

function buildStar(size, pos, dist, rand) {
  var c = Math.pow(rand.random(), 4.0);
  var color = [c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c];

  var vertices = [
    [-size, -size, 0],
    [size, -size, 0],
    [size, size, 0],
    [-size, -size, 0],
    [size, size, 0],
    [-size, size, 0]
  ];

  var position = [];

  for (var ii = 0; ii < 6; ii++) {
    var rot = quatRotFromForward(pos);
    glm.vec3.transformQuat(vertices[ii], vertices[ii], rot);
    vertices[ii][0] += pos[0] * dist;
    vertices[ii][1] += pos[1] * dist;
    vertices[ii][2] += pos[2] * dist;
    position.push.apply(position, vertices[ii]);
  }

  return {
    position: position,
    color: color
  };
}

function buildBox(gl, program) {
  var position = [
    -1,
    -1,
    -1,
    1,
    -1,
    -1,
    1,
    1,
    -1,
    -1,
    -1,
    -1,
    1,
    1,
    -1,
    -1,
    1,
    -1,

    1,
    -1,
    1,
    -1,
    -1,
    1,
    -1,
    1,
    1,
    1,
    -1,
    1,
    -1,
    1,
    1,
    1,
    1,
    1,

    1,
    -1,
    -1,
    1,
    -1,
    1,
    1,
    1,
    1,
    1,
    -1,
    -1,
    1,
    1,
    1,
    1,
    1,
    -1,

    -1,
    -1,
    1,
    -1,
    -1,
    -1,
    -1,
    1,
    -1,
    -1,
    -1,
    1,
    -1,
    1,
    -1,
    -1,
    1,
    1,

    -1,
    1,
    -1,
    1,
    1,
    -1,
    1,
    1,
    1,
    -1,
    1,
    -1,
    1,
    1,
    1,
    -1,
    1,
    1,

    -1,
    -1,
    1,
    1,
    -1,
    1,
    1,
    -1,
    -1,
    -1,
    -1,
    1,
    1,
    -1,
    -1,
    -1,
    -1,
    -1
  ];
  var attribs = webgl.buildAttribs(gl, { aPosition: 3 });
  attribs.aPosition.buffer.set(new Float32Array(position));
  var count = position.length / 9;
  var renderable = new webgl.Renderable(gl, program, attribs, count);
  return renderable;
}

// Smooth UV sphere (unit radius, centered at origin) used for the 3D moon.
// Every vertex lies exactly on the sphere, so the shader's normal-from-
// position is correct everywhere — no flipped/faceted shading like a low-poly
// mesh. Combined with a proper 2:1 equirectangular texture, the moon rotates
// and scales like the real one.
function buildSphere(gl, program, rings) {
  rings = rings || 32;
  var slices = rings * 2;
  var positions = [];
  var uvs = [];
  for (var i = 0; i <= rings; i++) {
    var phi = (Math.PI * i) / rings;
    var y = Math.cos(phi);
    var r = Math.sin(phi);
    for (var j = 0; j <= slices; j++) {
      var theta = (2 * Math.PI * j) / slices;
      positions.push(r * Math.cos(theta), y, r * Math.sin(theta));
      uvs.push(j / slices, i / rings);
    }
  }
  var vertsPerRow = slices + 1;
  var indices = [];
  for (var i2 = 0; i2 < rings; i2++) {
    for (var j2 = 0; j2 < slices; j2++) {
      var a = i2 * vertsPerRow + j2;
      var b = a + vertsPerRow;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  var pos = new Float32Array(indices.length * 3);
  var uv = new Float32Array(indices.length * 2);
  for (var k = 0; k < indices.length; k++) {
    var v = indices[k];
    pos[k * 3] = positions[v * 3];
    pos[k * 3 + 1] = positions[v * 3 + 1];
    pos[k * 3 + 2] = positions[v * 3 + 2];
    uv[k * 2] = uvs[v * 2];
    uv[k * 2 + 1] = uvs[v * 2 + 1];
  }
  var attribs = webgl.buildAttribs(gl, { aPosition: 3, aUV: 2 });
  attribs.aPosition.buffer.set(pos);
  attribs.aUV.buffer.set(uv);
  var count = indices.length / 3;
  var renderable = new webgl.Renderable(gl, program, attribs, count);
  return renderable;
}

// Preprocess a moon image into a square canvas where near-black is
// transparent (moon photos sit on a black background), so it can be wrapped
// around the 3D sphere.
function makeMoonCanvas(img) {
  var bbox = getImageContentBBox(img);
  var sw = bbox.x1 - bbox.x0;
  var sh = bbox.y1 - bbox.y0;
  var size = 512;
  var c = document.createElement("canvas");
  c.width = c.height = size;
  var ctx = c.getContext("2d");
  ctx.drawImage(img, bbox.x0, bbox.y0, sw, sh, 0, 0, size, size);
  try {
    var d = ctx.getImageData(0, 0, size, size);
    var px = d.data;
    for (var i = 0; i < px.length; i += 4) {
      var lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
      var a = Math.max(0, Math.min(1, (lum - 8) / 50));
      px[i + 3] = Math.round(a * 255);
    }
    ctx.putImageData(d, 0, 0);
  } catch (e) {
    // Cross-origin image without CORS: keep it opaque.
  }
  return c;
}

// Draw an <img> onto a canvas (same size). Texture uploads from a canvas are
// reliable across browsers, unlike raw Image uploads.
function imageToCanvas(img) {
  var w = img.naturalWidth || img.width;
  var h = img.naturalHeight || img.height;
  var c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(img, 0, 0);
  return c;
}

function quatRotBetweenVecs(a, b) {
  var theta = Math.acos(glm.vec3.dot(a, b));
  var omega = glm.vec3.create();
  glm.vec3.cross(omega, a, b);
  glm.vec3.normalize(omega, omega);
  var rot = glm.quat.create();
  glm.quat.setAxisAngle(rot, omega, theta);
  return rot;
}

function quatRotFromForward(b) {
  return quatRotBetweenVecs(glm.vec3.fromValues(0, 0, -1), b);
}

function randomRotation(rand) {
  var rot = glm.mat4.create();
  glm.mat4.rotateX(rot, rot, rand.random() * Math.PI * 2);
  glm.mat4.rotateY(rot, rot, rand.random() * Math.PI * 2);
  glm.mat4.rotateZ(rot, rot, rand.random() * Math.PI * 2);
  return rot;
}

function randomVec3(rand) {
  var v = [0, 0, 1];
  var rot = randomRotation(rand);
  glm.vec3.transformMat4(v, v, rot);
  glm.vec3.normalize(v, v);
  return v;
}

function hashcode(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i);
    hash += (i + 1) * char;
  }
  return hash;
}

// Rotate a color's hue by deg degrees (chroma offset). rgb is [r,g,b] 0..1.
function hueShift(rgb, deg) {
  var hsv = rgbToHsv(rgb);
  hsv[0] = ((hsv[0] + deg) % 360 + 360) % 360;
  return hsvToRgb(hsv);
}

function rgbToHsv(rgb) {
  var r = rgb[0],
    g = rgb[1],
    b = rgb[2];
  var max = Math.max(r, g, b);
  var min = Math.min(r, g, b);
  var d = max - min;
  var h;
  if (d === 0) {
    h = 0;
  } else if (max === r) {
    h = ((g - b) / d) % 6;
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  h *= 60;
  if (h < 0) {
    h += 360;
  }
  var s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hsvToRgb(hsv) {
  var h = hsv[0],
    s = hsv[1],
    v = hsv[2];
  var c = v * s;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m = v - c;
  var rp, gp, bp;
  if (h < 60) {
    rp = c;
    gp = x;
    bp = 0;
  } else if (h < 120) {
    rp = x;
    gp = c;
    bp = 0;
  } else if (h < 180) {
    rp = 0;
    gp = c;
    bp = x;
  } else if (h < 240) {
    rp = 0;
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    gp = 0;
    bp = c;
  } else {
    rp = c;
    gp = 0;
    bp = x;
  }
  return [rp + m, gp + m, bp + m];
}
