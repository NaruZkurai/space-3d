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

function normDeg(v) {
  return (((parseFloat(v) || 0) % 360) + 360) % 360;
}

// The moon orientation is stored as Euler angles (rotX*rotY*rotZ, degrees)
// but is dragged as a quaternion so left-drag rotates it about the view's
// screen axes (the same feel as the right-drag view rotation).
function eulerToQuat(rx, ry, rz) {
  var qx = glm.quat.create();
  var qy = glm.quat.create();
  var qz = glm.quat.create();
  glm.quat.setAxisAngle(qx, [1, 0, 0], normDeg(rx) * Math.PI / 180);
  glm.quat.setAxisAngle(qy, [0, 1, 0], normDeg(ry) * Math.PI / 180);
  glm.quat.setAxisAngle(qz, [0, 0, 1], normDeg(rz) * Math.PI / 180);
  var q = glm.quat.create();
  glm.quat.mul(q, qx, qy);
  glm.quat.mul(q, q, qz);
  return q;
}

function quatToEuler(q) {
  // Inverse of the above: R = Rx*Ry*Rz, q = qx*qy*qz. gl-matrix stores
  // (x, y, z, w).
  var x = q[0],
    y = q[1],
    z = q[2],
    w = q[3];
  var ry = Math.asin(Math.max(-1, Math.min(1, 2 * (x * z + y * w))));
  var rx = Math.atan2(-2 * (y * z - w * x), 1 - 2 * (x * x + y * y));
  var rz = Math.atan2(-2 * (x * y - w * z), 1 - 2 * (y * y + z * z));
  return [
    normDeg(rx * 180 / Math.PI),
    normDeg(ry * 180 / Math.PI),
    normDeg(rz * 180 / Math.PI)
  ];
}

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

  // Organize the GUI into collapsible folders (in display order):
  // main -> stars -> galaxy -> sun -> moon.
  var mainFolder = gui.addFolder("main");
  var starsFolder = gui.addFolder("stars");
  var galaxyFolder = gui.addFolder("galaxy");
  var sunFolder = gui.addFolder("sun");
  var moonFolder = gui.addFolder("moon");
  mainFolder.open();

  mainFolder
    .add(menu, "seed")
    .name("Seed")
    .listen()
    .onFinishChange(renderTextures);
  mainFolder.add(menu, "randomSeed").name("Randomize seed");
  mainFolder.add(menu, "fov", 10, 150, 1).name("Field of view °");
  mainFolder
    .add(menu, "resolution", [256, 512, 1024, 2048, 4096])
    .name("Resolution")
    .onChange(renderTextures);
  mainFolder.add(menu, "animationSpeed", 0, 10).name("Animation speed");
  mainFolder.add(menu, "saveSkybox").name("Download skybox");

  starsFolder
    .add(menu, "pointStars")
    .name("Point stars")
    .onChange(renderTextures);
  starsFolder
    .add(menu, "stars")
    .name("Bright stars")
    .onChange(renderTextures);

  galaxyFolder
    .add(menu, "nebulae")
    .name("Nebulae")
    .onChange(renderTextures);

  // Moon (all logic lives in moon.js) -> moon folder.
  var moon = Moon(moonFolder, params, menu, renderTextures);

  // Sun controls (all logic lives in sun.js) -> sun folder.
  sunFolder
    .add(menu, "sun")
    .name("Sun")
    .onChange(renderTextures);
  var sun = Sun(sunFolder, params, menu, renderTextures);

  // ---- Sun <-> moon coordinate helpers ----------------
  // Positions are absolute direction vectors (0,0,0 = use the seed spot).
  // Reset reads the seed positions; set/swap copy them with a temp value.
  function sunEffectivePos() {
    if (menu.sunPosX !== 0 || menu.sunPosY !== 0 || menu.sunPosZ !== 0) {
      return [menu.sunPosX, menu.sunPosY, menu.sunPosZ];
    }
    return Space3D.seedPositions(menu.seed).sun;
  }
  function moonEffectivePos() {
    if (menu.moonOnSun) {
      return sunEffectivePos();
    }
    if (menu.moonPosX !== 0 || menu.moonPosY !== 0 || menu.moonPosZ !== 0) {
      return [menu.moonPosX, menu.moonPosY, menu.moonPosZ];
    }
    return Space3D.seedPositions(menu.seed).moon;
  }
  menu.resetToSeed = function() {
    menu.sunPosX = 0;
    menu.sunPosY = 0;
    menu.sunPosZ = 0;
    menu.moonOnSun = false;
    menu.moonPosX = 0;
    menu.moonPosY = 0;
    menu.moonPosZ = 0;
    renderTextures();
  };
  menu.setSunToMoon = function() {
    var m = moonEffectivePos();
    menu.sunPosX = m[0];
    menu.sunPosY = m[1];
    menu.sunPosZ = m[2];
    renderTextures();
  };
  menu.swapSunMoon = function() {
    var s = sunEffectivePos();
    var m = moonEffectivePos();
    var tmp = s; // temp storage value for the swap
    menu.moonOnSun = false;
    menu.moonPosX = tmp[0];
    menu.moonPosY = tmp[1];
    menu.moonPosZ = tmp[2];
    menu.sunPosX = m[0];
    menu.sunPosY = m[1];
    menu.sunPosZ = m[2];
    renderTextures();
  };
  moonFolder.add(menu, "resetToSeed").name("Reset to seed");
  moonFolder.add(menu, "setSunToMoon").name("Set sun to moon");
  moonFolder.add(menu, "swapSunMoon").name("Swap sun / moon");

  document.body.appendChild(gui.domElement);
  gui.domElement.style.position = "fixed";
  gui.domElement.style.left = "16px";
  gui.domElement.style.top = "272px";

  // Scrollable controls: when the panel grows too tall it scrolls, and the
  // wheel scrolls infinitely (wraps around from bottom back to top and vice
  // versa) so you never hit the end of the list.
  gui.domElement.style.maxHeight = "75vh";
  gui.domElement.style.overflowY = "auto";
  gui.domElement.addEventListener(
    "wheel",
    function(e) {
      var el = gui.domElement;
      var max = el.scrollHeight - el.clientHeight;
      if (max > 0) {
        e.preventDefault();
        var target = el.scrollTop + e.deltaY;
        if (target > max) {
          target = 0; // loop: past the bottom -> back to the top
        } else if (target < 0) {
          target = max; // loop: past the top -> back to the bottom
        }
        el.scrollTop = target;
      }
    },
    { passive: false }
  );

  // The GUI is in the document now, so the sun module can hide its
  // image-only rows (custom sun image is off by default).
  if (sun && sun.updateImageControlsVisibility) {sun.updateImageControlsVisibility();}
  if (sun && sun.updateFlareColorVisibility) {sun.updateFlareColorVisibility();}

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

  // ---- Manual rotation: right-click + drag (trackball) ----
  // A quaternion camera orientation: every drag increment rotates about the
  // current screen axes, so panning up keeps panning up forever (no poles,
  // no reversal).
  var orientation = glm.quat.create();
  glm.quat.setAxisAngle(orientation, [0, 1, 0], -Math.PI / 2); // start facing +X
  var isRotating = false;
  var isMoonRotating = false;
  var lastMouse = { x: 0, y: 0 };
  var moonQ = eulerToQuat(menu.moonRx, menu.moonRy, menu.moonRz);

  // Keep the browser's right-click menu from popping up over the sky.
  renderCanvas.addEventListener("contextmenu", function(e) {
    e.preventDefault();
  });

  renderCanvas.addEventListener("mousedown", function(e) {
    if (e.button === 2) {
      // Right-drag rotates the camera view.
      isRotating = true;
      lastMouse.x = e.clientX;
      lastMouse.y = e.clientY;
      renderCanvas.style.cursor = "grabbing";
    } else if (e.button === 0) {
      // Left-drag rotates the MOON independently of the view.
      isMoonRotating = true;
      lastMouse.x = e.clientX;
      lastMouse.y = e.clientY;
      renderCanvas.style.cursor = "grabbing";
      // Capture the moon's current orientation so the drag accumulates from
      // wherever the sliders / URL left it.
      moonQ = eulerToQuat(menu.moonRx, menu.moonRy, menu.moonRz);
    }
  });

  window.addEventListener("mouseup", function(e) {
    if (e.button === 2) {
      isRotating = false;
      renderCanvas.style.cursor = "grab";
    } else if (e.button === 0) {
      isMoonRotating = false;
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
    } else if (isMoonRotating) {
      var mdx = e.clientX - lastMouse.x;
      var mdy = e.clientY - lastMouse.y;
      lastMouse.x = e.clientX;
      lastMouse.y = e.clientY;
      // Left-drag rotates the MOON about the view's screen axes (same feel
      // as the right-drag view rotation), tracked as a quaternion so it
      // always rotates about the correct axis.
      var mRight = glm.vec3.fromValues(1, 0, 0);
      var mUp = glm.vec3.fromValues(0, 1, 0);
      glm.vec3.transformQuat(mRight, mRight, orientation);
      glm.vec3.transformQuat(mUp, mUp, orientation);
      var mq = glm.quat.create();
      var mqYaw = glm.quat.create();
      var mqPitch = glm.quat.create();
      glm.quat.setAxisAngle(mqYaw, mUp, -mdx * 0.005);
      glm.quat.setAxisAngle(mqPitch, mRight, -mdy * 0.005);
      glm.quat.mul(mq, mqYaw, mqPitch);
      glm.quat.mul(moonQ, mq, moonQ);
      var me = quatToEuler(moonQ);
      menu.moonRx = me[0];
      menu.moonRy = me[1];
      menu.moonRz = me[2];
      renderTextures();
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
      moonImage: moon.getDefaultMoonImage(),
      sunBrightness: sp.sunBrightness,
      sunSize: sp.sunSize,
      sunFlare: sp.sunFlare,
      sunColor: sp.sunColor,
      imgSoftness: sp.imgSoftness,
      imgAngle: sp.imgAngle,
      sunOffsetX: sp.sunOffsetX,
      sunOffsetY: sp.sunOffsetY,
      sunPosX: sp.sunPosX,
      sunPosY: sp.sunPosY,
      sunPosZ: sp.sunPosZ,
      moonEnabled: mp.moonEnabled,
      moonScale: mp.moonScale,
      moonRx: mp.moonRx,
      moonRy: mp.moonRy,
      moonRz: mp.moonRz,
      moonFlare: mp.moonFlare,
      moonSoftness: mp.moonSoftness,
      moonFlareColor: mp.moonFlareColor,
      moonPosX: mp.moonPosX,
      moonPosY: mp.moonPosY,
      moonPosZ: mp.moonPosZ,
      moonOnSun: mp.moonOnSun
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
    if (!isRotating && !isMoonRotating) {
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