// jshint -W097
// jshint undef: true, unused: true
/* globals require,window,document,requestAnimationFrame,dat,location*/

"use strict";

var qs = require("query-string");
var glm = require("gl-matrix");
var saveAs = require("filesaver.js").saveAs;
var JSZip = require("jszip");
var Space3D = require("./space-3d.js");
var Skybox = require("./skybox.js");
var Moon = require("./moon.js");
var Sun = require("./sun.js");

var resolution = 1024;

// Default moon texture: the REAL NASA moon model's equirectangular map,
// extracted from https://solarsystem.nasa.gov/gltf_embed/2366/ (Moon_1_3474).
// Used for the 3D moon sphere so "Show moon" works even with no custom image.
var MOON_IMAGE_DEFAULT = "static/img/moon.jpg";

window.onload = function() {
  var params = qs.parse(location.hash);

  var ControlsMenu = function() {
    this.seed = params.seed || generateRandomSeed();
    this.randomSeed = function() {
      this.seed = generateRandomSeed();
      renderTextures();
    };
    this.fov = parseInt(params.fov) || 80;
    this.pointStars =
      params.pointStars === undefined ? true : params.pointStars === "true";
    this.stars = params.stars === undefined ? true : params.stars === "true";
    this.sun = params.sun === undefined ? true : params.sun === "true";
    this.nebulae =
      params.nebulae === undefined ? true : params.nebulae === "true";
    this.resolution = parseInt(params.resolution) || 1024;
    this.animationSpeed =
      params.animationSpeed === undefined
        ? 0.0
        : parseFloat(params.animationSpeed);
    this.saveSkybox = function() {
      const zip = new JSZip();
      for (const name of ["front", "back", "left", "right", "top", "bottom"]) {
        const canvas = document.getElementById(`texture-${name}`);
        const data = canvas.toDataURL().split(",")[1];
        zip.file(`${name}.png`, data, { base64: true });
      }
      if (this.resolution <= 2048) {
        const cubemapData = this._saveCubemap().split(",")[1];
        zip.file('cubemap.png', cubemapData, { base64: true });    
      }
      zip.generateAsync({ type: "blob" }).then(blob => {
        saveAs(blob, "skybox.zip");
      });
    };
    this._saveCubemap = function() {
      const cubemapCanvas = document.createElement('canvas');
      const left = document.getElementById('texture-left');
      const top = document.getElementById('texture-top');
      const front = document.getElementById('texture-front');
      const bottom = document.getElementById('texture-bottom');
      const right = document.getElementById('texture-right');
      const back = document.getElementById('texture-back');
      
      // set size of canvas depending on resolution
      var context = cubemapCanvas.getContext('2d');
      context.canvas.width = this.resolution * 4;
      context.canvas.height = this.resolution * 3;

      // combine images together in the texture-cubemap canvas
      context.drawImage(left, 0, this.resolution);
      context.drawImage(top, this.resolution, 0);
      context.drawImage(front, this.resolution, this.resolution);
      context.drawImage(bottom, this.resolution, this.resolution * 2);
      context.drawImage(right, this.resolution * 2, this.resolution);
      context.drawImage(back, this.resolution * 3, this.resolution);
    
      return cubemapCanvas.toDataURL("image/png");      
    };
  };

  var menu = new ControlsMenu();
  var gui = new dat.GUI({
    autoPlace: false,
    width: 320
  });
  gui
    .add(menu, "seed")
    .name("Seed")
    .listen()
    .onFinishChange(renderTextures);
  gui.add(menu, "randomSeed").name("Randomize seed");
  gui.add(menu, "fov", 10, 150, 1).name("Field of view °");
  gui
    .add(menu, "pointStars")
    .name("Point stars")
    .onChange(renderTextures);
  gui
    .add(menu, "stars")
    .name("Bright stars")
    .onChange(renderTextures);
  gui
    .add(menu, "sun")
    .name("Sun")
    .onChange(renderTextures);
  gui
    .add(menu, "nebulae")
    .name("Nebulae")
    .onChange(renderTextures);
  gui
    .add(menu, "resolution", [256, 512, 1024, 2048, 4096])
    .name("Resolution")
    .onChange(renderTextures);
  gui.add(menu, "animationSpeed", 0, 10).name("Animation speed");
  gui.add(menu, "saveSkybox").name("Download skybox");

  // Moon (all logic lives in moon.js).
  var moon = Moon(gui, params, menu, renderTextures);

  // Sun controls (all logic lives in sun.js).
  var sun = Sun(gui, params, menu, renderTextures);

  document.body.appendChild(gui.domElement);
  gui.domElement.style.position = "fixed";
  gui.domElement.style.left = "16px";
  gui.domElement.style.top = "272px";

  // The GUI is in the document now, so the sun module can hide its
  // image-only rows (custom sun image is off by default).
  if (sun && sun.updateImageControlsVisibility) {
    sun.updateImageControlsVisibility();
  }
  if (sun && sun.updateFlareColorVisibility) {
    sun.updateFlareColorVisibility();
  }

  function hideGui() {
    gui.domElement.style.display = "none";
  }

  function showGui() {
    gui.domElement.style.display = "block";
  }

  function hideSplit() {
    document.getElementById("texture-left").style.display = "none";
    document.getElementById("texture-right").style.display = "none";
    document.getElementById("texture-top").style.display = "none";
    document.getElementById("texture-bottom").style.display = "none";
    document.getElementById("texture-front").style.display = "none";
    document.getElementById("texture-back").style.display = "none";
  }

  function showSplit() {
    document.getElementById("texture-left").style.display = "block";
    document.getElementById("texture-right").style.display = "block";
    document.getElementById("texture-top").style.display = "block";
    document.getElementById("texture-bottom").style.display = "block";
    document.getElementById("texture-front").style.display = "block";
    document.getElementById("texture-back").style.display = "block";
  }

  function setQueryString() {
    var q = {
      seed: menu.seed,
      fov: menu.fov,
      pointStars: menu.pointStars,
      stars: menu.stars,
      sun: menu.sun,
      nebulae: menu.nebulae,
      resolution: menu.resolution,
      animationSpeed: menu.animationSpeed
    };
    if (sun) {
      sun.queryKeys.forEach(function(key) {
        q[key] = menu[key];
      });
    }
    if (moon) {
      moon.queryKeys.forEach(function(key) {
        q[key] = menu[key];
      });
    }
    location.hash = qs.stringify(q);
  }

  var hideControls = false;

  window.onkeypress = function(e) {
    if (e.charCode == 32) {
      hideControls = !hideControls;
    }
  };

  var renderCanvas = document.getElementById("render-canvas");
  renderCanvas.width = renderCanvas.clientWidth;
  renderCanvas.height = renderCanvas.clientHeight;

  var skybox = new Skybox(renderCanvas);
  var space = new Space3D(resolution);

  // Preload the default NASA moon texture. Re-render once it's ready so the
  // moon shows up under "Show moon" even without a custom image.
  var defaultMoonImage = null;
  (function loadDefaultMoon() {
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function() {
      defaultMoonImage = img;
      renderTextures();
    };
    img.src = MOON_IMAGE_DEFAULT;
  })();

  // ---- Manual rotation: right-click + drag (trackball) ----
  // A quaternion camera orientation: every drag increment rotates about the
  // current screen axes, so panning up keeps panning up forever (no poles,
  // no reversal).
  var orientation = glm.quat.create();
  glm.quat.setAxisAngle(orientation, [0, 1, 0], -Math.PI / 2); // start facing +X
  var isRotating = false;
  var lastMouse = { x: 0, y: 0 };

  // Keep the browser's right-click menu from popping up over the sky.
  renderCanvas.addEventListener("contextmenu", function(e) {
    e.preventDefault();
  });

  renderCanvas.addEventListener("mousedown", function(e) {
    if (e.button === 2) {
      isRotating = true;
      lastMouse.x = e.clientX;
      lastMouse.y = e.clientY;
      renderCanvas.style.cursor = "grabbing";
    }
  });

  window.addEventListener("mouseup", function(e) {
    if (e.button === 2) {
      isRotating = false;
      renderCanvas.style.cursor = "grab";
    }
  });

  window.addEventListener("mousemove", function(e) {
    if (isRotating) {
      var dx = e.clientX - lastMouse.x;
      var dy = e.clientY - lastMouse.y;
      lastMouse.x = e.clientX;
      lastMouse.y = e.clientY;

      // Rotate about the current screen-up (dx) and screen-right (dy) axes.
      // Dragging up always pans up — it never flips or reverses at the poles.
      var right = glm.vec3.fromValues(1, 0, 0);
      var up = glm.vec3.fromValues(0, 1, 0);
      glm.vec3.transformQuat(right, right, orientation);
      glm.vec3.transformQuat(up, up, orientation);

      var q = glm.quat.create();
      var qYaw = glm.quat.create();
      var qPitch = glm.quat.create();
      glm.quat.setAxisAngle(qYaw, up, -dx * 0.005);
      glm.quat.setAxisAngle(qPitch, right, -dy * 0.005);
      glm.quat.mul(q, qYaw, qPitch);
      glm.quat.mul(orientation, q, orientation);
    }
  });

  function renderTexturesWithImage(customImage) {
    var sp = sun.getRenderParams();
    var mp = moon.getRenderParams();
    var textures = space.render({
      seed: menu.seed,
      pointStars: menu.pointStars,
      stars: menu.stars,
      sun: menu.sun,
      nebulae: menu.nebulae,
      resolution: menu.resolution,
      customImage: customImage,
      moonImage: defaultMoonImage,
      sunBrightness: sp.sunBrightness,
      sunSize: sp.sunSize,
      sunFlare: sp.sunFlare,
      sunColor: sp.sunColor,
      imgSoftness: sp.imgSoftness,
      imgAngle: sp.imgAngle,
      sunOffsetX: sp.sunOffsetX,
      sunOffsetY: sp.sunOffsetY,
      moonEnabled: mp.moonEnabled,
      moonScale: mp.moonScale,
      moonRx: mp.moonRx,
      moonRy: mp.moonRy,
      moonRz: mp.moonRz
    });
    skybox.setTextures(textures);

    function drawIndividual(source, targetid) {
      var canvas = document.getElementById(targetid);
      canvas.width = canvas.height = menu.resolution;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(source, 0, 0);
    }

    drawIndividual(textures.left, "texture-left");
    drawIndividual(textures.right, "texture-right");
    drawIndividual(textures.front, "texture-front");
    drawIndividual(textures.back, "texture-back");
    drawIndividual(textures.top, "texture-top");
    drawIndividual(textures.bottom, "texture-bottom");
  }

  function renderTextures() {
    sun.getCustomImage(function(img) {
      renderTexturesWithImage(img);
    });
  }

  renderTextures();

  function render() {
    hideGui();

    if (!hideControls) {
      showGui();
    }

    // Auto-orbit the sky when the user isn't manually rotating it.
    if (!isRotating) {
      var auto = glm.quat.create();
      glm.quat.setAxisAngle(auto, [0, 1, 0], 0.0025 * menu.animationSpeed);
      glm.quat.mul(orientation, auto, orientation);
    }

    var view = glm.mat4.create();
    var projection = glm.mat4.create();

    renderCanvas.width = renderCanvas.clientWidth;
    renderCanvas.height = renderCanvas.clientHeight;

    // Build the view basis from the trackball orientation.
    var fwd = glm.vec3.fromValues(0, 0, -1);
    var up = glm.vec3.fromValues(0, 1, 0);
    glm.vec3.transformQuat(fwd, fwd, orientation);
    glm.vec3.transformQuat(up, up, orientation);
    glm.mat4.lookAt(view, [0, 0, 0], fwd, up);

    var fov = (menu.fov / 360) * Math.PI * 2;
    glm.mat4.perspective(
      projection,
      fov,
      renderCanvas.width / renderCanvas.height,
      0.1,
      8
    );

    skybox.render(view, projection);

    requestAnimationFrame(render);

    setQueryString();
  }

  render();
};

function generateRandomSeed() {
  return (Math.random() * 1000000000000000000).toString(36);
}
``