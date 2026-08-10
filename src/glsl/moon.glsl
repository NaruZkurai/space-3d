#version 100
precision highp float;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;

attribute vec3 aPosition;
attribute vec2 aUV;

varying vec2 uv;
varying vec3 worldNormal;
varying vec3 worldPos;

void main() {
    vec4 wp = uModel * vec4(aPosition, 1.0);
    gl_Position = uProjection * uView * wp;
    // The moon sphere is rendered from inside the skybox (camera at the
    // origin, looking outward), so the visible hemisphere reads the equirect
    // texture with the u-axis reversed — the near side would appear left-right
    // mirrored (east/Crisium on the left). Mirror u so the moon reads the way
    // it looks from Earth: north up, east on the right.
    uv = vec2(1.0 - aUV.x, aUV.y);
    // Surface normal (rotation + uniform scale only; translation is dropped).
    worldNormal = normalize((uModel * vec4(aPosition, 0.0)).xyz);
    worldPos = wp.xyz;
}


__split__


#version 100
precision highp float;

uniform sampler2D uTexture;
uniform vec3 uLightDir;
uniform float uSoftness;
uniform vec3 uMoonTint;
uniform float uMoonTintAmount;

varying vec2 uv;
varying vec3 worldNormal;
varying vec3 worldPos;

void main() {
    vec4 tex = texture2D(uTexture, uv);
    // Diffuse lighting from uLightDir (full-moon: light comes from the
    // viewer) plus a soft ambient so the dark limb isn't pure black. This
    // is what makes it read as the real lit 3D moon render.
    vec3 n = normalize(worldNormal);
    float diff = max(dot(n, normalize(uLightDir)), 0.0);
    float shade = 0.5 + 0.5 * diff;
    // Edge opacity: the sphere's silhouette is where N.V -> 0 (the limb).
    // Feather alpha there so the moon's edge fades softly instead of being
    // a hard cut. uSoftness 0 = crisp edge, 3 = very soft.
    vec3 v = normalize(-worldPos);
    float ndv = max(dot(n, v), 0.0);
    float feather = uSoftness * 0.25;
    float edge = smoothstep(0.0, feather, ndv);
    // Moon color follows the sun's final color, scaled by the flare alpha.
    vec3 tinted = mix(tex.rgb, uMoonTint, uMoonTintAmount);
    gl_FragColor = vec4(tinted * shade, tex.a * edge);
}
